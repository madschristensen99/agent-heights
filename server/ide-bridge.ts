import type { ExternalSession, ExternalEvent, ExternalTool, ServerMsg, OrgExternalSession, IdeBridgeVisibility } from "../shared/types.js";
import { verifyToken, isSupabaseConfigured, type AuthUser } from "./supabase.js";

type BroadcastFn = (msg: ServerMsg) => void;

interface StoredSession extends ExternalSession {
  /** Grace-period timer for reconnection. */
  graceTimer: ReturnType<typeof setTimeout> | null;
}

const MAX_EVENTS = 50;
const GRACE_PERIOD_MS = 60_000;

export class IdeBridge {
  private sessions = new Map<string, StoredSession>();
  /** Per-user privacy setting for org sharing. Default: full. */
  private visibility = new Map<string, IdeBridgeVisibility>();
  /** Callback to get a user's display name. */
  private getUserName: (userId: string) => string = () => "Unknown";
  /** Callback to get a user's email. */
  private getUserEmail: (userId: string) => string | null = () => null;
  /** Callback to get org member user IDs for a given user's orgs. */
  private getOrgMemberIds: (userId: string) => string[] = () => [];
  /** Callback to get broadcast fn for a user. */
  private getBroadcast: (userId: string) => BroadcastFn | null = () => null;
  /** Callback to check branch-to-card matching (sprint board integration). */
  private onBranchDetected: ((userId: string, gitBranch: string) => void) | null = null;

  /** Inject dependencies for org-level features. */
  setDependencies(opts: {
    getUserName: (userId: string) => string;
    getUserEmail: (userId: string) => string | null;
    getOrgMemberIds: (userId: string) => string[];
    getBroadcast: (userId: string) => BroadcastFn | null;
    onBranchDetected?: ((userId: string, gitBranch: string) => void) | null;
  }): void {
    this.getUserName = opts.getUserName;
    this.getUserEmail = opts.getUserEmail;
    this.getOrgMemberIds = opts.getOrgMemberIds;
    this.getBroadcast = opts.getBroadcast;
    this.onBranchDetected = opts.onBranchDetected ?? null;
  }

  private key(userId: string, sessionId: string): string {
    return `${userId}:${sessionId}`;
  }

  async handleConnect(
    msg: { tool: ExternalTool; sessionId: string; token: string; currentFile?: string; language?: string; gitBranch?: string },
    getBroadcast: (userId: string) => BroadcastFn | null,
  ): Promise<{ ok: boolean; error?: string; userId?: string }> {
    let user: AuthUser;
    if (isSupabaseConfigured) {
      const verified = await verifyToken(msg.token);
      if (!verified) return { ok: false, error: "Invalid or expired token" };
      user = verified;
    } else {
      user = { id: "dev", email: null };
    }

    const k = this.key(user.id, msg.sessionId);
    const existing = this.sessions.get(k);
    if (existing) {
      if (existing.graceTimer) {
        clearTimeout(existing.graceTimer);
        existing.graceTimer = null;
      }
      existing.state = "active";
      existing.lastActivity = Date.now();
      if (msg.currentFile) existing.currentFile = msg.currentFile;
      if (msg.language) existing.language = msg.language;
      if (msg.gitBranch) existing.gitBranch = msg.gitBranch;
    } else {
      const session: StoredSession = {
        sessionId: msg.sessionId,
        userId: user.id,
        tool: msg.tool,
        state: "active",
        currentFile: msg.currentFile,
        language: msg.language,
        gitBranch: msg.gitBranch,
        filesChanged: 0,
        linesAdded: 0,
        linesRemoved: 0,
        lastActivity: Date.now(),
        events: [{ type: "session_start", timestamp: Date.now() }],
        graceTimer: null,
      };
      this.sessions.set(k, session);
    }

    const sess = this.sessions.get(k)!;
    const broadcast = getBroadcast(user.id);
    if (broadcast) {
      broadcast({ type: "external_session_update", session: this.toExternal(sess) });
      broadcast({ type: "external_feed_event", sessionId: sess.sessionId, tool: sess.tool, event: { type: "session_start", timestamp: Date.now() } });
    }
    // Broadcast to org members
    this.broadcastOrgSessionUpdate(sess);
    return { ok: true, userId: user.id };
  }

  handleActivity(
    msg: { sessionId: string; state: "active" | "idle" | "error"; currentFile?: string; language?: string; gitBranch?: string; filesChanged?: number; linesAdded?: number; linesRemoved?: number; events?: ExternalEvent[] },
    userId: string,
    getBroadcast: (userId: string) => BroadcastFn | null,
  ): { ok: boolean; error?: string } {
    const k = this.key(userId, msg.sessionId);
    const sess = this.sessions.get(k);
    if (!sess) return { ok: false, error: "Session not found" };

    sess.state = msg.state;
    sess.lastActivity = Date.now();
    if (msg.currentFile !== undefined) sess.currentFile = msg.currentFile;
    if (msg.language !== undefined) sess.language = msg.language;
    if (msg.gitBranch !== undefined) {
      const prevBranch = sess.gitBranch;
      sess.gitBranch = msg.gitBranch;
      // Sprint board integration: if branch changed and callback is set, check for card match
      if (msg.gitBranch && msg.gitBranch !== prevBranch && this.onBranchDetected) {
        this.onBranchDetected(userId, msg.gitBranch);
      }
    }
    if (msg.filesChanged !== undefined) sess.filesChanged = msg.filesChanged;
    if (msg.linesAdded !== undefined) sess.linesAdded = msg.linesAdded;
    if (msg.linesRemoved !== undefined) sess.linesRemoved = msg.linesRemoved;

    if (msg.events && msg.events.length > 0) {
      for (const ev of msg.events) {
        sess.events.push(ev);
        if (sess.events.length > MAX_EVENTS) sess.events.splice(0, sess.events.length - MAX_EVENTS);
      }
      const broadcast = getBroadcast(userId);
      if (broadcast) {
        for (const ev of msg.events) {
          broadcast({ type: "external_feed_event", sessionId: sess.sessionId, tool: sess.tool, event: ev });
        }
      }
      // Broadcast feed events to org members
      this.broadcastOrgFeedEvents(sess, msg.events);
    }

    const broadcast = getBroadcast(userId);
    if (broadcast) {
      broadcast({ type: "external_session_update", session: this.toExternal(sess) });
    }
    // Broadcast to org members
    this.broadcastOrgSessionUpdate(sess);
    return { ok: true };
  }

  handleDisconnect(
    msg: { sessionId: string },
    userId: string,
    getBroadcast: (userId: string) => BroadcastFn | null,
  ): void {
    const k = this.key(userId, msg.sessionId);
    const sess = this.sessions.get(k);
    if (!sess) return;

    sess.state = "disconnected";
    sess.events.push({ type: "session_end", timestamp: Date.now() });

    // Broadcast disconnect to org members immediately
    this.broadcastOrgSessionRemoved(userId, msg.sessionId);

    sess.graceTimer = setTimeout(() => {
      this.sessions.delete(k);
      const broadcast = getBroadcast(userId);
      if (broadcast) {
        broadcast({ type: "external_session_removed", sessionId: msg.sessionId });
      }
    }, GRACE_PERIOD_MS);
  }

  getSessionsForUser(userId: string): ExternalSession[] {
    const result: ExternalSession[] = [];
    for (const sess of this.sessions.values()) {
      if (sess.userId === userId) {
        result.push(this.toExternal(sess));
      }
    }
    return result;
  }

  syncSessions(userId: string, broadcast: BroadcastFn): void {
    const sessions = this.getSessionsForUser(userId);
    if (sessions.length > 0) {
      broadcast({ type: "external_sessions_sync", sessions });
    }
  }

  cleanupUser(userId: string): void {
    for (const [k, sess] of this.sessions) {
      if (sess.userId === userId) {
        if (sess.graceTimer) clearTimeout(sess.graceTimer);
        this.sessions.delete(k);
        // Notify org members
        this.broadcastOrgSessionRemoved(userId, sess.sessionId);
      }
    }
  }

  // ── Privacy controls ──────────────────────────────────────────────

  setVisibility(userId: string, visibility: IdeBridgeVisibility): void {
    this.visibility.set(userId, visibility);
    // Re-broadcast org sessions to all org members since visibility changed
    const memberIds = this.getOrgMemberIds(userId);
    for (const memberId of memberIds) {
      this.syncOrgSessionsForMember(memberId);
    }
  }

  getVisibility(userId: string): IdeBridgeVisibility {
    return this.visibility.get(userId) ?? "full";
  }

  // ── Org-level session aggregation ──────────────────────────────────

  /** Get all sessions for an org (from all members), respecting privacy settings. */
  getOrgSessionsForUser(userId: string): OrgExternalSession[] {
    const memberIds = this.getOrgMemberIds(userId);
    const result: OrgExternalSession[] = [];
    for (const memberId of memberIds) {
      const vis = this.visibility.get(memberId) ?? "full";
      if (vis === "hidden") continue;
      for (const sess of this.sessions.values()) {
        if (sess.userId !== memberId) continue;
        if (sess.state === "disconnected") continue;
        const orgSession = this.toOrgExternal(sess, vis);
        result.push(orgSession);
      }
    }
    return result;
  }

  /** Sync org sessions to a user (called on WS connect). */
  syncOrgSessions(userId: string): void {
    const sessions = this.getOrgSessionsForUser(userId);
    const broadcast = this.getBroadcast(userId);
    if (broadcast && sessions.length > 0) {
      broadcast({ type: "org_external_sessions_sync", sessions });
    }
  }

  /** Sync org sessions to a specific member (internal helper). */
  private syncOrgSessionsForMember(memberId: string): void {
    const sessions = this.getOrgSessionsForUser(memberId);
    const broadcast = this.getBroadcast(memberId);
    if (broadcast) {
      broadcast({ type: "org_external_sessions_sync", sessions });
    }
  }

  /** Broadcast a session update to all org members of the session owner. */
  private broadcastOrgSessionUpdate(sess: StoredSession): void {
    const vis = this.visibility.get(sess.userId) ?? "full";
    if (vis === "hidden") return;
    const memberIds = this.getOrgMemberIds(sess.userId);
    const orgSession = this.toOrgExternal(sess, vis);
    for (const memberId of memberIds) {
      if (memberId === sess.userId) continue;
      const broadcast = this.getBroadcast(memberId);
      if (broadcast) {
        broadcast({ type: "org_external_session_update", session: orgSession });
      }
    }
  }

  /** Broadcast feed events to all org members. */
  private broadcastOrgFeedEvents(sess: StoredSession, events: ExternalEvent[]): void {
    const vis = this.visibility.get(sess.userId) ?? "full";
    if (vis === "hidden") return;
    const memberIds = this.getOrgMemberIds(sess.userId);
    const userName = this.getUserName(sess.userId);
    for (const memberId of memberIds) {
      if (memberId === sess.userId) continue;
      const broadcast = this.getBroadcast(memberId);
      if (broadcast) {
        for (const ev of events) {
          broadcast({ type: "org_external_feed_event", sessionId: sess.sessionId, userId: sess.userId, userName, tool: sess.tool, event: ev });
        }
      }
    }
  }

  /** Broadcast session removal to org members. */
  private broadcastOrgSessionRemoved(userId: string, sessionId: string): void {
    const vis = this.visibility.get(userId) ?? "full";
    if (vis === "hidden") return;
    const memberIds = this.getOrgMemberIds(userId);
    for (const memberId of memberIds) {
      if (memberId === userId) continue;
      const broadcast = this.getBroadcast(memberId);
      if (broadcast) {
        broadcast({ type: "org_external_session_removed", sessionId, userId });
      }
    }
  }

  /** Returns a concise summary of active external sessions for agent system prompt injection. */
  getContextSummary(userId: string): string {
    const sessions = this.getSessionsForUser(userId);
    const active = sessions.filter(s => s.state === "active" || s.state === "idle");
    if (active.length === 0) return "";

    const toolNames: Record<string, string> = {
      "claude-code": "Claude Code", "codex": "Codex", "aider": "Aider",
      "vscode": "VS Code", "cursor": "Cursor", "windsurf": "Windsurf", "unknown": "a terminal",
    };

    const lines = active.map(s => {
      const tool = toolNames[s.tool] ?? "a tool";
      const state = s.state === "active" ? "actively coding" : "idle";
      const file = s.currentFile ? ` — editing ${s.currentFile}` : "";
      const branch = s.gitBranch ? ` [branch: ${s.gitBranch}]` : "";
      const stats = s.filesChanged > 0 ? ` (${s.filesChanged} files, +${s.linesAdded}/-${s.linesRemoved} lines)` : "";
      return `  • Your boss is using ${tool} (${state}${file}${branch}${stats})`;
    });

    return `\n=== LIVE DEVELOPMENT CONTEXT ===\n` +
      `Your boss is currently working with external coding tools:\n` +
      lines.join("\n") + `\n` +
      `You can reference what they're working on if relevant to their task. ` +
      `Do NOT mention file contents — you only know metadata (file names, line counts, git branch).` +
      `\n=== END LIVE DEVELOPMENT CONTEXT ===`;
  }

  private toOrgExternal(sess: StoredSession, visibility: IdeBridgeVisibility): OrgExternalSession {
    const base = this.toExternal(sess);
    if (visibility === "branch_only") {
      // Strip file details — only show branch and tool
      return {
        ...base,
        currentFile: undefined,
        language: undefined,
        filesChanged: 0,
        linesAdded: 0,
        linesRemoved: 0,
        events: [],
        userName: this.getUserName(sess.userId),
        userEmail: this.getUserEmail(sess.userId),
      };
    }
    return {
      ...base,
      userName: this.getUserName(sess.userId),
      userEmail: this.getUserEmail(sess.userId),
    };
  }

  private toExternal(sess: StoredSession): ExternalSession {
    return {
      sessionId: sess.sessionId,
      userId: sess.userId,
      tool: sess.tool,
      state: sess.state,
      currentFile: sess.currentFile,
      language: sess.language,
      gitBranch: sess.gitBranch,
      filesChanged: sess.filesChanged,
      linesAdded: sess.linesAdded,
      linesRemoved: sess.linesRemoved,
      lastActivity: sess.lastActivity,
      events: sess.events.slice(-20),
    };
  }

  // ── Velocity tracking support ─────────────────────────────────────

  /** Return all active sessions as snapshots for velocity DB persistence. */
  getSnapshotsForVelocity(): { userId: string; tool: string; filesChanged: number; linesAdded: number; linesRemoved: number; errorCount: number; gitBranch: string | undefined; language: string | undefined; lastActivity: number }[] {
    const result: { userId: string; tool: string; filesChanged: number; linesAdded: number; linesRemoved: number; errorCount: number; gitBranch: string | undefined; language: string | undefined; lastActivity: number }[] = [];
    for (const sess of this.sessions.values()) {
      if (sess.state === "disconnected") continue;
      const errorCount = sess.events.filter(e => e.type === "error").length;
      result.push({
        userId: sess.userId,
        tool: sess.tool,
        filesChanged: sess.filesChanged,
        linesAdded: sess.linesAdded,
        linesRemoved: sess.linesRemoved,
        errorCount,
        gitBranch: sess.gitBranch,
        language: sess.language,
        lastActivity: sess.lastActivity,
      });
    }
    return result;
  }

  // ── Sprint board integration ──────────────────────────────────────

  /** Find task card IDs that match a git branch name.
   *  Branches like "feature/abc123" or "fix/abc123" match card ID "abc123".
   *  Also matches exact branch-to-cardId. */
  static matchBranchToCardId(gitBranch: string | undefined, cardIds: string[]): string | null {
    if (!gitBranch) return null;
    // Try exact match first
    if (cardIds.includes(gitBranch)) return gitBranch;
    // Try matching the last segment after /
    const segments = gitBranch.split("/");
    const lastSeg = segments[segments.length - 1];
    if (lastSeg && cardIds.includes(lastSeg)) return lastSeg;
    // Try matching any cardId as a substring of the branch
    for (const id of cardIds) {
      if (id.length >= 4 && gitBranch.includes(id)) return id;
    }
    return null;
  }
}

export const ideBridge = new IdeBridge();
