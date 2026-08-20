import type { ExternalSession, ExternalEvent, ExternalTool, ServerMsg } from "../shared/types.js";
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
    if (msg.gitBranch !== undefined) sess.gitBranch = msg.gitBranch;
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
    }

    const broadcast = getBroadcast(userId);
    if (broadcast) {
      broadcast({ type: "external_session_update", session: this.toExternal(sess) });
    }
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
      }
    }
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
}

export const ideBridge = new IdeBridge();
