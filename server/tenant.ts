import { mkdirSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ServerMsg, PlayerInfo, PlayerPresence, Dir, OfficeTheme, CharAppearance, Organization, OrgMember, RoomType, RoomAccessLevel } from "../shared/types.js";
import { AGENT_HEIGHTS_HQ_SLUG, AGENT_HEIGHTS_HQ_ADMINS } from "../shared/types.js";
import { AgentManager } from "./manager.js";
import { SessionLogger } from "./logger.js";
import { SaveFile, type SaveState, type Persistence } from "./persistence.js";
import { RelationalPersistence } from "./db-relational.js";
import { isSupabaseConfigured, supabaseAdmin, type AuthUser } from "./supabase.js";
import { getUserApiKey, getUserMcpKeys } from "./apikeys.js";
import {
  isRedisConfigured,
  publish,
  subscribe,
  startHeartbeat,
  serverId,
} from "./redis.js";
import type { WebSocket } from "ws";

export interface UserSession {
  user: AuthUser;
  manager: AgentManager;
  save: Persistence;
  session: SessionLogger;
  player: PlayerInfo | null;
  clients: Set<WebSocket>;
  apiKey: string | null;
  roomId: string | null;
  privateOfficeId: string | null;
  broadcast: (msg: ServerMsg) => void;
  cleanup: () => void;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  voiceActive: boolean;
  screenShareActive: boolean;
  webcamActive: boolean;
  /** Live log subscriptions keyed by agentId — cleaned up on disconnect. */
  agentLogSubscriptions?: Map<string, () => void>;
}

/** A player's live state within a room. */
interface RoomPlayer {
  userId: string;
  name: string;
  appearance: CharAppearance | null;
  role: "owner" | "member" | "guest";
  /** What this player can do in the room. */
  accessLevel: RoomAccessLevel;
  x: number;
  y: number;
  dir: Dir;
}

/** A room with shared agents and multiple players. */
interface Room {
  id: string;
  name: string;
  ownerId: string;
  players: Map<string, RoomPlayer>;
  /** Private offices are invite-only. HQ2 is open to all. */
  isPrivate: boolean;
  /** Room type: private, organization, or public. */
  roomType: RoomType;
  /** For organization rooms, the org that owns this room. */
  orgId?: string;
  /** Current projector channel: "off", "brainrot", etc. */
  projectorChannel: string;
  /** Persisted invite list for private rooms: userId → access level. */
  invitedUsers: Map<string, RoomAccessLevel>;
}

/** In-memory organization member (augmented with email for display). */
interface OrgMemberEntry {
  orgId: string;
  userId: string;
  userEmail: string | null;
  role: "admin" | "member";
  joinedAt: number;
}

/** In-memory organization. */
interface OrgEntry {
  id: string;
  name: string;
  slug: string;
  githubOrg: string | null;
  createdAt: number;
  members: Map<string, OrgMemberEntry>;
}

/** The global multiplayer lobby — everyone joins on connection. */
export const HQ2_ROOM_ID = "hq2";

export class TenantManager {
  private sessions = new Map<string, UserSession>();
  private rooms = new Map<string, Room>();
  private orgs = new Map<string, OrgEntry>();
  /** Slug → orgId lookup. */
  private orgsBySlug = new Map<string, string>();
  /** Last known position per user — persists across room leaves/rejoins. */
  private lastPositions = new Map<string, { x: number; y: number; dir: Dir }>();
  /** Last room the user was in — used to restore on reconnect. */
  private lastRoomIds = new Map<string, string>();
  /** In-progress session creations — prevents duplicate sessions from concurrent calls. */
  private pendingCreations = new Map<string, Promise<UserSession>>();

  constructor(private rootDir: string) {
    // Pre-seed the Agent Heights HQ organization
    const hqOrgId = "org-agent-heights-hq";
    const hqOrg: OrgEntry = {
      id: hqOrgId,
      name: "Agent Heights HQ",
      slug: AGENT_HEIGHTS_HQ_SLUG,
      githubOrg: "agent-heights",
      createdAt: Date.now(),
      members: new Map(),
    };
    this.orgs.set(hqOrgId, hqOrg);
    this.orgsBySlug.set(AGENT_HEIGHTS_HQ_SLUG, hqOrgId);

    // Create the global HQ2 room — it IS the Agent Heights HQ org room
    this.rooms.set(HQ2_ROOM_ID, {
      id: HQ2_ROOM_ID,
      name: "Agent Heights HQ",
      ownerId: "system",
      players: new Map(),
      isPrivate: false,
      roomType: "organization",
      orgId: hqOrgId,
      projectorChannel: "off",
      invitedUsers: new Map(),
    });
  }

  get(userId: string): UserSession | undefined {
    return this.sessions.get(userId);
  }

  values(): IterableIterator<UserSession> {
    return this.sessions.values();
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /** Get all rooms owned by or visible to a user. */
  getRoomsForUser(userId: string): Room[] {
    const result: Room[] = [];
    for (const room of this.rooms.values()) {
      if (room.ownerId === userId || room.players.has(userId)) {
        result.push(room);
        continue;
      }
      // Include org rooms if the user is a member of the org
      if (room.roomType === "organization" && room.orgId) {
        const org = this.orgs.get(room.orgId);
        if (org?.members.has(userId)) {
          result.push(room);
        }
      }
    }
    return result;
  }

  /** Create a new room. Returns the room ID. */
  createRoom(ownerId: string, name: string, _theme?: OfficeTheme, isPrivate = true, orgId?: string): string {
    const roomId = `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const roomType: RoomType = orgId ? "organization" : isPrivate ? "private" : "public";
    const room: Room = {
      id: roomId,
      name,
      ownerId,
      players: new Map(),
      isPrivate,
      roomType,
      orgId,
      projectorChannel: "off",
      invitedUsers: new Map(),
    };
    this.rooms.set(roomId, room);
    return roomId;
  }

  /** Add a player to a room. Returns the player's presence. */
  joinRoom(roomId: string, user: AuthUser, player: PlayerInfo | null): RoomPlayer | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const role = room.ownerId === user.id ? "owner" : "member";
    const accessLevel = this.computeAccessLevel(room, user.id);
    const savedPos = this.lastPositions.get(user.id);
    const roomPlayer: RoomPlayer = {
      userId: user.id,
      name: player?.name ?? "Boss",
      appearance: player?.appearance ?? null,
      role,
      accessLevel,
      x: savedPos?.x ?? 400,
      y: savedPos?.y ?? 300,
      dir: savedPos?.dir ?? "down",
    };
    room.players.set(user.id, roomPlayer);

    // Update session's roomId
    const sess = this.sessions.get(user.id);
    if (sess) sess.roomId = roomId;

    return roomPlayer;
  }

  /** Remove a player from a room. */
  leaveRoom(roomId: string, userId: string): RoomPlayer | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const player = room.players.get(userId);
    if (!player) return null;
    room.players.delete(userId);

    // Update session
    const sess = this.sessions.get(userId);
    if (sess) sess.roomId = null;

    // Delete empty rooms (except HQ2, org rooms, and private offices — keep for rejoin)
    if (room.players.size === 0 && roomId !== HQ2_ROOM_ID && !room.isPrivate && room.roomType !== "organization") {
      this.rooms.delete(roomId);
    }

    return player;
  }

  /** Update a player's position in a room. */
  updatePlayerPosition(userId: string, x: number, y: number, dir: Dir): Room | null {
    const sess = this.sessions.get(userId);
    if (!sess?.roomId) return null;
    const room = this.rooms.get(sess.roomId);
    if (!room) return null;
    const player = room.players.get(userId);
    if (!player) return null;
    player.x = x;
    player.y = y;
    player.dir = dir;
    // Persist position for reconnects
    this.lastPositions.set(userId, { x, y, dir });
    return room;
  }

  /** Get presence list for a room. */
  getRoomPlayers(roomId: string): PlayerPresence[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.players.values()).map((p) => ({
      userId: p.userId,
      name: p.name,
      appearance: p.appearance,
      role: p.role,
      accessLevel: p.accessLevel,
      x: p.x,
      y: p.y,
      dir: p.dir,
    }));
  }

  /** Switch a user from their current room to a new one. Returns the new room or null. */
  switchRoom(userId: string, newRoomId: string): Room | null {
    const sess = this.sessions.get(userId);
    if (!sess) return null;
    const newRoom = this.rooms.get(newRoomId);
    if (!newRoom) return null;

    // Already in this room — nothing to do
    if (sess.roomId === newRoomId) return newRoom;

    // Leave current room
    if (sess.roomId) {
      this.leaveRoom(sess.roomId, userId);
    }

    // Join new room
    const joined = this.joinRoom(newRoomId, sess.user, sess.player);
    if (!joined) return null;

    // Remember which room the user is in for reconnects
    this.lastRoomIds.set(userId, newRoomId);

    return newRoom;
  }

  /** Check if a user is the owner of their current room. */
  isRoomOwner(userId: string): boolean {
    const sess = this.sessions.get(userId);
    if (!sess?.roomId) return false;
    const room = this.rooms.get(sess.roomId);
    if (!room) return false;
    return room.ownerId === userId;
  }

  /** Check if the user is in a private room they don't own (i.e. a visitor). */
  isRoomVisitor(userId: string): boolean {
    const sess = this.sessions.get(userId);
    if (!sess?.roomId) return false;
    const room = this.rooms.get(sess.roomId);
    if (!room) return false;
    return room.isPrivate && room.ownerId !== userId;
  }

  /** Get the session of the owner of the room a user is currently in. */
  getRoomOwnerSession(userId: string): UserSession | null {
    const sess = this.sessions.get(userId);
    if (!sess?.roomId) return null;
    const room = this.rooms.get(sess.roomId);
    if (!room) return null;
    return this.sessions.get(room.ownerId) ?? null;
  }

  /** Compute the access level for a user in a room based on ownership, org
   *  membership, and invite list. Does NOT check canJoinRoom — assumes the
   *  user is allowed in the room. */
  computeAccessLevel(room: Room, userId: string): RoomAccessLevel {
    // Room owner → manage
    if (room.ownerId === userId) return "manage";

    // Private room: check invite list
    if (room.roomType === "private") {
      const invited = room.invitedUsers.get(userId);
      if (invited) return invited;
      // Not invited but somehow in the room (e.g. via invite acceptance) → talk
      return "talk";
    }

    // Organization room: check org membership
    if (room.roomType === "organization" && room.orgId) {
      const org = this.orgs.get(room.orgId);
      if (org) {
        const member = org.members.get(userId);
        if (member) {
          // Org admins get manage, members get talk
          return member.role === "admin" ? "manage" : "talk";
        }
      }
      // Non-member in an org room (tour access) — they can see but not interact
      return "tour";
    }

    // Public room → talk
    return "talk";
  }

  /** Get the access level for a user in their current room. Returns
   *  "no_access" if the user is not in a room. */
  getRoomAccessLevel(userId: string): RoomAccessLevel {
    const sess = this.sessions.get(userId);
    if (!sess?.roomId) return "no_access";
    const room = this.rooms.get(sess.roomId);
    if (!room) return "no_access";
    return this.computeAccessLevel(room, userId);
  }

  /** Invite a user to a private room with a given access level. */
  inviteUser(roomId: string, userId: string, accessLevel: RoomAccessLevel): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    room.invitedUsers.set(userId, accessLevel);
    return true;
  }

  /** Get the invite level for a user in a private room. */
  getUserInviteLevel(roomId: string, userId: string): RoomAccessLevel | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    return room.invitedUsers.get(userId);
  }

  /** Get the AgentManager for a room. For private rooms, it's the owner's
   *  personal manager. For org rooms, it's a shared manager keyed by orgId.
   *  Returns null if the room doesn't exist or has no manager. */
  getRoomManager(roomId: string): AgentManager | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // Private room → owner's personal manager
    if (room.roomType === "private") {
      const ownerSess = this.sessions.get(room.ownerId);
      return ownerSess?.manager ?? null;
    }

    // Organization room → shared org manager
    if (room.roomType === "organization" && room.orgId) {
      return this.getOrgManager(room.orgId);
    }

    return null;
  }

  // ── Shared org agent managers ───────────────────────────────────────
  /** Shared AgentManagers for org rooms, keyed by orgId. */
  private orgManagers = new Map<string, AgentManager>();

  /** Get or create the shared AgentManager for an organization. */
  getOrgManager(orgId: string): AgentManager | null {
    const org = this.orgs.get(orgId);
    if (!org) return null;

    let mgr = this.orgManagers.get(orgId);
    if (!mgr) {
      const orgDir = join(this.rootDir, "ag", "orgs", orgId);
      mkdirSync(orgDir, { recursive: true });
      const session = new SessionLogger(orgDir);
      // Org managers use file-based persistence for simplicity
      const save = new SaveFile(orgDir);
      const saved = save.load();
      const broadcast = (msg: ServerMsg) => {
        // Broadcast to all members currently in any org room for this org
        for (const room of this.rooms.values()) {
          if (room.orgId !== orgId) continue;
          for (const [pid] of room.players) {
            const peerSess = this.sessions.get(pid);
            if (peerSess) {
              for (const ws of peerSess.clients) {
                if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
              }
            }
          }
        }
      };
      mgr = new AgentManager(orgDir, broadcast, session, save, saved, null, `org:${orgId}`);
      mgr.setMcpKeys({});
      mgr.startThinkLoop();
      this.orgManagers.set(orgId, mgr);
      console.log(`[agent-heights] created shared AgentManager for org ${org.name}`);
    }
    return mgr;
  }

  /** Forward a message to all other players in the same room (not the sender). */
  forwardToRoomPeers(senderId: string, data: string): void {
    const sess = this.sessions.get(senderId);
    if (!sess?.roomId) return;
    const room = this.rooms.get(sess.roomId);
    if (!room) return;
    // Forward in private rooms where the sender is the owner, or in org rooms
    if (room.roomType === "private" && room.ownerId !== senderId) return;
    for (const [pid] of room.players) {
      if (pid === senderId) continue;
      const peerSess = this.sessions.get(pid);
      if (peerSess) {
        for (const ws of peerSess.clients) {
          if (ws.readyState === ws.OPEN) ws.send(data);
        }
      }
    }
  }

  async getOrCreate(user: AuthUser): Promise<UserSession> {
    const existing = this.sessions.get(user.id);
    if (existing) {
      // Update email if the existing session was created at boot without one
      if (user.email && !existing.user.email) {
        existing.user.email = user.email;
        this.processOrgMemberships(user);
      }
      return existing;
    }

    // Deduplicate concurrent session creations for the same user
    const pending = this.pendingCreations.get(user.id);
    if (pending) return pending;

    const promise = this.doCreateSession(user);
    this.pendingCreations.set(user.id, promise);
    try {
      return await promise;
    } finally {
      this.pendingCreations.delete(user.id);
    }
  }

  private async doCreateSession(user: AuthUser): Promise<UserSession> {
    const userDir = join(this.rootDir, "ag", "users", user.id);
    mkdirSync(userDir, { recursive: true });

    let save: Persistence;
    let saved: SaveState | null;

    if (isSupabaseConfigured && user.id !== "dev") {
      const db = new RelationalPersistence(user.id);
      save = db;
      saved = await db.load();
    } else {
      const file = new SaveFile(userDir);
      save = file;
      saved = file.load();
    }

    const session = new SessionLogger(userDir);
    const clients = new Set<WebSocket>();
    const player = saved?.player ?? null;
    const apiKey = isSupabaseConfigured ? await getUserApiKey(user.id) : null;
    const mcpKeys = isSupabaseConfigured ? await getUserMcpKeys(user.id) : {};

    const sess: UserSession = {
      user,
      save,
      session,
      player,
      clients,
      apiKey,
      roomId: null,
      privateOfficeId: null,
      manager: null as unknown as AgentManager,
      broadcast: () => {},
      cleanup: () => {},
      disconnectTimer: null,
      voiceActive: false,
      screenShareActive: false,
      webcamActive: false,
    };

    // ── Broadcast: Redis pub/sub (with in-memory fallback) ──────────────
    // Also forwards agent-related messages to visitors in the owner's room.
    const FORWARD_TYPES = new Set(["agent", "log", "card", "card_removed", "fired_agent", "fired_agent_removed", "toast", "emote", "agent_chat"]);
    // Agent-related types from the user's PERSONAL manager — skip when user is
    // not in their own office (HQ2, org rooms, or visiting another office).
    // Org room agents are broadcast by the shared org manager, not here.
    const AGENT_TYPES = new Set(["agent", "log", "card", "card_removed", "fired_agent", "fired_agent_removed", "chat_cleared", "assembly", "emote", "agent_chat"]);

    const deliverLocal = (data: string) => {
      for (const ws of sess.clients) {
        if (ws.readyState === ws.OPEN) ws.send(data);
      }
    };

    if (isRedisConfigured) {
      sess.broadcast = (msg: ServerMsg): void => {
        const data = JSON.stringify(msg);
        // Skip personal agent updates when user is not in their own office.
        // Org room agents are broadcast by the org manager directly to clients.
        if (AGENT_TYPES.has(msg.type) && sess.roomId !== sess.privateOfficeId) return;
        deliverLocal(data);
        if (FORWARD_TYPES.has(msg.type)) {
          this.forwardToRoomPeers(user.id, data);
        }
        void publish(user.id, data);
      };

      const unsub = subscribe(user.id, (data: string) => {
        deliverLocal(data);
      });

      const stopHeartbeat = startHeartbeat(user.id, serverId);

      sess.cleanup = () => {
        unsub();
        stopHeartbeat();
      };
    } else {
      sess.broadcast = (msg: ServerMsg): void => {
        const data = JSON.stringify(msg);
        if (AGENT_TYPES.has(msg.type) && sess.roomId === HQ2_ROOM_ID) return;
        deliverLocal(data);
        if (FORWARD_TYPES.has(msg.type)) {
          this.forwardToRoomPeers(user.id, data);
        }
      };
    }

    sess.manager = new AgentManager(userDir, sess.broadcast, session, save, saved, apiKey, user.id);
    sess.manager.setMcpKeys(mcpKeys);
    if (player) sess.manager.bossName = player.name;
    sess.manager.startThinkLoop();

    // Register session before joining rooms so joinRoom can update sess.roomId
    this.sessions.set(user.id, sess);

    // Process org memberships (admin auto-add + pending invitations)
    this.processOrgMemberships(user);

    // Create the user's private office (invite-only)
    const privateOfficeId = this.createRoom(user.id, `${player?.name ?? "Boss"}'s Office`, undefined, true);
    sess.privateOfficeId = privateOfficeId;

    // Join HQ2 first (so the player exists in the global lobby), then
    // immediately switch to their private office where their agents live.
    // This ensures returning users land in their office, not HQ2, after a
    // server restart.
    this.joinRoom(HQ2_ROOM_ID, user, player);
    this.switchRoom(user.id, privateOfficeId);
    console.log(
      `[agent-heights] created session for user ${user.id} (${user.email ?? "no email"})` +
      (isRedisConfigured ? " [redis]" : ""),
    );
    return sess;
  }

  /** Process org memberships for a user (admin auto-add + pending email invitations). */
  private processOrgMemberships(user: AuthUser): void {
    // Auto-add whitelisted admins to the Agent Heights HQ organization
    if (user.email && AGENT_HEIGHTS_HQ_ADMINS.includes(user.email)) {
      const hqOrg = this.orgsBySlug.get(AGENT_HEIGHTS_HQ_SLUG);
      if (hqOrg) {
        const org = this.orgs.get(hqOrg);
        if (org && !org.members.has(user.id)) {
          org.members.set(user.id, {
            orgId: hqOrg,
            userId: user.id,
            userEmail: user.email,
            role: "admin",
            joinedAt: Date.now(),
          });
          console.log(`[agent-heights] auto-added ${user.email} as admin to Agent Heights HQ org`);
        }
      }
    }

    // Convert any pending email invitations to real memberships
    if (user.email) {
      const pendingKey = `pending:${user.email.toLowerCase()}`;
      for (const org of this.orgs.values()) {
        const pending = org.members.get(pendingKey);
        if (pending) {
          org.members.delete(pendingKey);
          org.members.set(user.id, {
            orgId: org.id,
            userId: user.id,
            userEmail: user.email,
            role: pending.role,
            joinedAt: Date.now(),
          });
          console.log(`[agent-heights] converted pending invite for ${user.email} in org ${org.name}`);
        }
      }
    }
  }

  /**
   * Restore user sessions at boot time so agents resume immediately after
   * a server restart, without waiting for the user to reconnect via WebSocket.
   *
   * In Supabase mode: queries the agents table for distinct owner_ids.
   * In file/dev mode: scans the users directory for save files with agents.
   */
  async restoreSessionsAtBoot(): Promise<void> {
    let userIds: string[] = [];

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabaseAdmin
          .from("sprite_heights_agents")
          .select("owner_id");

        if (error || !data) {
          console.log("[agent-heights] boot restore: could not query agents table:", error?.message);
          return;
        }

        userIds = [...new Set(data.map((r: any) => r.owner_id))];
      } catch (err) {
        console.error("[agent-heights] boot restore: failed to query users:", err);
        return;
      }
    } else {
      // File mode: scan ag/users/*/save.json for users with agents
      const usersDir = join(this.rootDir, "ag", "users");
      try {
        const entries = await readdir(usersDir);
        for (const userId of entries) {
          try {
            const raw = await readFile(join(usersDir, userId, "save.json"), "utf8");
            const parsed = JSON.parse(raw);
            if (parsed.agents && Array.isArray(parsed.agents) && parsed.agents.length > 0) {
              userIds.push(userId);
            }
          } catch { /* no save file or invalid — skip */ }
        }
      } catch {
        // No users directory — nothing to restore
        return;
      }
    }

    if (userIds.length === 0) {
      console.log("[agent-heights] boot restore: no users with agents found");
      return;
    }

    console.log(`[agent-heights] boot restore: restoring sessions for ${userIds.length} user(s)...`);

    let restored = 0;
    for (const userId of userIds) {
      try {
        await this.getOrCreate({ id: userId, email: null });
        restored++;
      } catch (err) {
        console.error(`[agent-heights] boot restore: failed for user ${userId}:`, err);
      }
    }

    console.log(`[agent-heights] boot restore: complete (${restored}/${userIds.length} session(s) restored, ${this.sessions.size} total active)`);
  }

  /** Called when a WebSocket closes. If it was the last client, start a grace timer. */
  handleClientDisconnect(userId: string): void {
    const sess = this.sessions.get(userId);
    if (!sess) return;
    if (sess.clients.size > 0) return; // still has other connections

    // Cancel any existing timer
    if (sess.disconnectTimer) clearTimeout(sess.disconnectTimer);

    // Grace period: 30 seconds to reconnect (handles page refresh)
    sess.disconnectTimer = setTimeout(() => {
      const s = this.sessions.get(userId);
      if (!s) return;
      if (s.clients.size > 0) return; // reconnected

      // Remove player from room and broadcast departure
      if (s.roomId) {
        const roomId = s.roomId;
        const room = this.rooms.get(roomId);
        if (room) {
          for (const [pid] of room.players) {
            if (pid === userId) continue;
            const peerSess = this.sessions.get(pid);
            if (peerSess) {
              peerSess.broadcast({ type: "player_left", roomId, userId });
            }
          }
        }
        this.leaveRoom(roomId, userId);
        // Remember which room they were in for reconnect
        this.lastRoomIds.set(userId, roomId);
      }
      s.disconnectTimer = null;
      // Session + AgentManager stay alive — agents keep working
    }, 30_000);
  }

  /** Called when a new WebSocket connects for an existing session. */
  handleClientReconnect(userId: string): void {
    const sess = this.sessions.get(userId);
    if (!sess) return;
    if (sess.disconnectTimer) {
      clearTimeout(sess.disconnectTimer);
      sess.disconnectTimer = null;
    }
    // Reconnect to the room the user was in. If the grace period expired and
    // roomId is null, fall back to their private office (where agents live)
    // rather than HQ2.
    const targetRoomId = sess.roomId ?? sess.privateOfficeId ?? HQ2_ROOM_ID;
    const room = this.rooms.get(targetRoomId);
    if (room && !room.players.has(userId)) {
      this.joinRoom(targetRoomId, sess.user, sess.player);
      // Broadcast rejoin to others
      const me = room.players.get(userId);
      if (me) {
        for (const [pid] of room.players) {
          if (pid === userId) continue;
          const peerSess = this.sessions.get(pid);
          if (peerSess) {
            peerSess.broadcast({ type: "player_joined", roomId: targetRoomId, player: me });
          }
        }
      }
    }
  }

  delete(userId: string): void {
    // Remove from any rooms
    const sess = this.sessions.get(userId);
    if (sess?.roomId) {
      this.leaveRoom(sess.roomId, userId);
    }
    sess?.cleanup();
    sess?.manager.stopThinkLoop();
    this.sessions.delete(userId);
  }

  size(): number {
    return this.sessions.size;
  }

  // ── Organization management ──────────────────────────────────────────

  /** Create a new organization. Returns the org or null if slug is taken. */
  createOrg(name: string, slug: string, githubOrg?: string, founderUserId?: string, founderEmail?: string | null): OrgEntry | null {
    if (this.orgsBySlug.has(slug)) return null;
    const orgId = `org-${slug}`;
    const org: OrgEntry = {
      id: orgId,
      name,
      slug,
      githubOrg: githubOrg ?? null,
      createdAt: Date.now(),
      members: new Map(),
    };
    if (founderUserId) {
      org.members.set(founderUserId, {
        orgId,
        userId: founderUserId,
        userEmail: founderEmail ?? null,
        role: "admin",
        joinedAt: Date.now(),
      });
    }
    this.orgs.set(orgId, org);
    this.orgsBySlug.set(slug, orgId);
    return org;
  }

  /** Get an organization by ID. */
  getOrg(orgId: string): OrgEntry | undefined {
    return this.orgs.get(orgId);
  }

  /** Get all organizations a user is a member of. */
  getOrgsForUser(userId: string): Array<OrgEntry & { role: "admin" | "member" }> {
    const result: Array<OrgEntry & { role: "admin" | "member" }> = [];
    for (const org of this.orgs.values()) {
      const member = org.members.get(userId);
      if (member) {
        result.push({ ...org, role: member.role });
      }
    }
    return result;
  }

  /** Get all organizations (for browsing). Includes membership info for the requesting user. */
  getAllOrgs(userId: string): Array<Organization & { memberCount: number; isMember: boolean; role?: "admin" | "member" }> {
    return Array.from(this.orgs.values()).map((org) => {
      const member = org.members.get(userId);
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        githubOrg: org.githubOrg,
        createdAt: org.createdAt,
        memberCount: org.members.size,
        isMember: !!member,
        role: member?.role,
      };
    });
  }

  /** Get members of an organization. */
  getOrgMembers(orgId: string): OrgMember[] {
    const org = this.orgs.get(orgId);
    if (!org) return [];
    return Array.from(org.members.values()).map((m) => ({
      orgId: m.orgId,
      userId: m.userId,
      userEmail: m.userEmail,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }

  /** Check if a user is a member of an org. */
  isOrgMember(orgId: string, userId: string): boolean {
    const org = this.orgs.get(orgId);
    return !!org?.members.has(userId);
  }

  /** Check if a user is an admin of an org. */
  isOrgAdmin(orgId: string, userId: string): boolean {
    const org = this.orgs.get(orgId);
    const member = org?.members.get(userId);
    return member?.role === "admin";
  }

  /** Add a user to an org by email. Returns true if successful. */
  addOrgMemberByEmail(orgId: string, userEmail: string, role: "admin" | "member" = "member", addedBy?: string): { ok: boolean; message: string } {
    const org = this.orgs.get(orgId);
    if (!org) return { ok: false, message: "Organization not found." };

    // Find the user by email among active sessions
    let targetUserId: string | null = null;
    for (const [uid, sess] of this.sessions) {
      if (sess.user.email?.toLowerCase() === userEmail.toLowerCase()) {
        targetUserId = uid;
        break;
      }
    }

    if (!targetUserId) {
      // Store a pending invitation — the user will be auto-added when they connect
      // For now, we store it as a pending email in the org's members map with a synthetic key
      const pendingKey = `pending:${userEmail.toLowerCase()}`;
      if (org.members.has(pendingKey)) {
        return { ok: false, message: `${userEmail} has already been invited.` };
      }
      org.members.set(pendingKey, {
        orgId,
        userId: pendingKey,
        userEmail,
        role,
        joinedAt: Date.now(),
      });
      return { ok: true, message: `Invitation sent to ${userEmail}. They will be added when they log in.` };
    }

    if (org.members.has(targetUserId)) {
      return { ok: false, message: `${userEmail} is already a member.` };
    }

    org.members.set(targetUserId, {
      orgId,
      userId: targetUserId,
      userEmail,
      role,
      joinedAt: Date.now(),
    });

    return { ok: true, message: `Added ${userEmail} as ${role}.` };
  }

  /** Remove a user from an org. */
  removeOrgMember(orgId: string, userId: string): boolean {
    const org = this.orgs.get(orgId);
    if (!org) return false;
    return org.members.delete(userId);
  }

  /** Create a room within an organization. Returns the room ID or null. */
  createOrgRoom(orgId: string, name: string, theme?: OfficeTheme): string | null {
    const org = this.orgs.get(orgId);
    if (!org) return null;
    return this.createRoom("system", name, theme, false, orgId);
  }

  /** Check if a user can join a room.
   *  - HQ2 is open to everyone (tour for non-members, talk for members, manage for admins)
   *  - Public rooms are open to all
   *  - Private rooms: owner + invited users
   *  - Org rooms: org members (talk/manage) + non-members get tour */
  canJoinRoom(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    // HQ2 is always open to everyone
    if (roomId === HQ2_ROOM_ID) return true;
    if (room.roomType === "public") return true;
    // Private rooms: owner or invited users
    if (room.roomType === "private") {
      if (room.ownerId === userId) return true;
      return room.invitedUsers.has(userId);
    }
    // Org rooms: members can join, non-members get tour access
    if (room.roomType === "organization" && room.orgId) {
      return true; // everyone can tour; access level controls what they can do
    }
    return false;
  }

  /** Check if a user can perform admin actions in their current room. */
  canManageRoom(userId: string): boolean {
    const sess = this.sessions.get(userId);
    if (!sess?.roomId) return false;
    const room = this.rooms.get(sess.roomId);
    if (!room) return false;
    if (room.roomType === "private") return room.ownerId === userId;
    if (room.roomType === "organization" && room.orgId) {
      return this.isOrgAdmin(room.orgId, userId);
    }
    return false;
  }
}
