import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ServerMsg, PlayerInfo, PlayerPresence, Dir, OfficeTheme, CharAppearance, Organization, OrgMember, RoomType } from "../shared/types.js";
import { AGENT_HQ_HQ_SLUG, AGENT_HQ_HQ_ADMINS } from "../shared/types.js";
import { AgentManager } from "./manager.js";
import { SessionLogger } from "./logger.js";
import { SaveFile, type SaveState, type Persistence } from "./persistence.js";
import { RelationalPersistence } from "./db-relational.js";
import { isSupabaseConfigured, type AuthUser } from "./supabase.js";
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
}

/** A player's live state within a room. */
interface RoomPlayer {
  userId: string;
  name: string;
  appearance: CharAppearance | null;
  role: "owner" | "member" | "guest";
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

  constructor(private rootDir: string) {
    // Pre-seed the Agent HQ HQ organization
    const hqOrgId = "org-agent-hq-hq";
    const hqOrg: OrgEntry = {
      id: hqOrgId,
      name: "Agent HQ HQ",
      slug: AGENT_HQ_HQ_SLUG,
      githubOrg: "agent-hq",
      createdAt: Date.now(),
      members: new Map(),
    };
    this.orgs.set(hqOrgId, hqOrg);
    this.orgsBySlug.set(AGENT_HQ_HQ_SLUG, hqOrgId);

    // Create the global HQ2 room — it IS the Agent HQ HQ org room
    this.rooms.set(HQ2_ROOM_ID, {
      id: HQ2_ROOM_ID,
      name: "Agent HQ HQ",
      ownerId: "system",
      players: new Map(),
      isPrivate: false,
      roomType: "organization",
      orgId: hqOrgId,
      projectorChannel: "off",
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
    };
    this.rooms.set(roomId, room);
    return roomId;
  }

  /** Add a player to a room. Returns the player's presence. */
  joinRoom(roomId: string, user: AuthUser, player: PlayerInfo | null): RoomPlayer | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const role = room.ownerId === user.id ? "owner" : "member";
    const savedPos = this.lastPositions.get(user.id);
    const roomPlayer: RoomPlayer = {
      userId: user.id,
      name: player?.name ?? "Boss",
      appearance: player?.appearance ?? null,
      role,
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
    if (existing) return existing;

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
    };

    // ── Broadcast: Redis pub/sub (with in-memory fallback) ──────────────
    // Also forwards agent-related messages to visitors in the owner's room.
    const FORWARD_TYPES = new Set(["agent", "log", "card", "card_removed", "fired_agent", "fired_agent_removed", "toast", "emote", "agent_chat"]);
    // Agent-related types that should only be delivered when the user is in a private office
    const AGENT_TYPES = new Set(["agent", "log", "card", "card_removed", "fired_agent", "fired_agent_removed", "chat_cleared", "assembly", "emote", "agent_chat"]);

    const deliverLocal = (data: string) => {
      for (const ws of sess.clients) {
        if (ws.readyState === ws.OPEN) ws.send(data);
      }
    };

    if (isRedisConfigured) {
      sess.broadcast = (msg: ServerMsg): void => {
        const data = JSON.stringify(msg);
        // Skip agent updates when user is in HQ2 — agents keep working but client doesn't need to see them
        if (AGENT_TYPES.has(msg.type) && sess.roomId === HQ2_ROOM_ID) return;
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

    // Auto-add whitelisted admins to the Agent HQ HQ organization
    if (user.email && AGENT_HQ_HQ_ADMINS.includes(user.email)) {
      const hqOrg = this.orgsBySlug.get(AGENT_HQ_HQ_SLUG);
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
          console.log(`[agent-hq] auto-added ${user.email} as admin to Agent HQ HQ org`);
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
          console.log(`[agent-hq] converted pending invite for ${user.email} in org ${org.name}`);
        }
      }
    }

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
      `[agent-hq] created session for user ${user.id} (${user.email ?? "no email"})` +
      (isRedisConfigured ? " [redis]" : ""),
    );
    return sess;
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

  /** Check if a user can join a room (org members can join org rooms freely). */
  canJoinRoom(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    // HQ2 is always open to everyone, even though it's the Agent HQ HQ org room
    if (roomId === HQ2_ROOM_ID) return true;
    if (room.roomType === "public") return true;
    if (room.roomType === "private") return room.ownerId === userId;
    if (room.roomType === "organization" && room.orgId) {
      return this.isOrgMember(room.orgId, userId);
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
