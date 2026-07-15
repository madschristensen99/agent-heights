// Types shared between the game client and the agent server.

export type Provider = "cline";

export type AgentStatus = "idle" | "thinking" | "working" | "done" | "error";

/** Workers do tasks; a manager splits a goal into subtasks for the team. */
export type AgentRole = "worker" | "manager" | "devops";

/** Big Five personality traits, each 0–1. */
export interface PersonalityTraits {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

/** Current emotional state — influenced by personality + recent events. */
export type AgentMood =
  | "content"
  | "focused"
  | "bored"
  | "excited"
  | "frustrated"
  | "curious"
  | "social";

export const DEFAULT_PERSONALITY: PersonalityTraits = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.3,
};

export function randomPersonality(): PersonalityTraits {
  const r = () => Math.round(Math.random() * 100) / 100;
  return {
    openness: r(),
    conscientiousness: r(),
    extraversion: r(),
    agreeableness: r(),
    neuroticism: r(),
  };
}

export function isValidPersonality(obj: unknown): obj is PersonalityTraits {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  const keys = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"];
  for (const k of keys) {
    const v = o[k];
    if (typeof v !== "number" || v < 0 || v > 1) return false;
  }
  return true;
}

/** Number of pre-generated character sprite-sheet variants (char-0..N-1). */
export const CHAR_VARIANTS = 8;

/** Accent colors paired with sprite variants by index. */
export const ACCENTS = ["#c44a4a", "#3a7cb5", "#3d9152", "#b0741f", "#5b7d9e", "#2a8f8b", "#b54a93", "#6b7280"];

// --------------------------------------------------- character customizer ---

/** Customization options for building a character piece by piece. */
export const SKIN_TONES = [
  "#f2c39b", "#ffdbac", "#d9a066", "#c68642",
  "#a06a42", "#8d5524", "#6b4423", "#deb887",
  "#c0c0c8", "#8a8a96", "#e8e8f0", "#a8c0d0",
];

export const HAIR_STYLES = [
  "short", "spiky", "long", "ponytail",
  "buzz", "swept", "curly", "bun",
  "bald", "balding",
  "mohawk", "afro", "braids", "pigtails",
  "bob", "dreadlocks",
];

export const HAIR_COLORS = [
  "#2b1d0e", "#15100a", "#5a3825", "#3f2a1a",
  "#c9a227", "#9e2b2b", "#e8e8e8", "#3f7d4e",
  "#1a1a2a", "#cc6622", "#8b4513", "#704214",
];

export const SHIRT_COLORS = [
  "#e05d5d", "#4f9dde", "#53b86b", "#c9852c",
  "#5b7d9e", "#36b5b0", "#d65db1", "#7d8597",
  "#2e3547", "#c44a4a", "#9b59b6", "#e67e22",
  "#00c853",
];

export const PANTS_COLORS = [
  "#2f3e5c", "#454545", "#5c4a2f", "#3a5a40",
  "#3e4a5c", "#23283a", "#1b1f2e", "#4a3a2a",
];

export const ACCESSORIES = ["none", "glasses", "headband", "earrings", "cap", "beanie", "headphones"];

export const BEARD_STYLES = ["none", "stubble", "mustache", "goatee", "full_beard"];

export const EYE_COLORS = [
  "#2a2040", "#00e5ff", "#ff3030", "#3aff3a",
  "#ffaa00", "#cc44ff", "#ffffff",
];

export const HEAD_FEATURES = ["none", "cat ears", "horns", "antennae", "elf ears"];

export const ACCENT_COLOR_OPTIONS = [
  "#c44a4a", "#3a7cb5", "#3d9152", "#b0741f",
  "#5b7d9e", "#2a8f8b", "#b54a93", "#6b7280",
  "#e05d5d", "#4f9dde", "#53b86b", "#c9852c",
  "#00c853",
];

/** Piece-by-piece character appearance selected via the character builder. */
export interface CharAppearance {
  skin: number;       // index into SKIN_TONES
  hairStyle: number;  // index into HAIR_STYLES
  hair: number;       // index into HAIR_COLORS
  shirt: number;      // index into SHIRT_COLORS
  pants: number;      // index into PANTS_COLORS
  accessory: number;  // index into ACCESSORIES
  accent: number;     // index into ACCENT_COLOR_OPTIONS
  beard: number;      // index into BEARD_STYLES
  eyeColor: number;   // index into EYE_COLORS
  headFeature: number; // index into HEAD_FEATURES
}

/** Default appearance (matches pre-baked char-0). */
export const DEFAULT_APPEARANCE: CharAppearance = {
  skin: 0,
  hairStyle: 0,
  hair: 0,
  shirt: 0,
  pants: 0,
  accessory: 0,
  accent: 0,
  beard: 0,
  eyeColor: 0,
  headFeature: 0,
};

/** Generate a fully random CharAppearance. */
export function randomAppearance(): CharAppearance {
  const ri = (n: number) => Math.floor(Math.random() * n);
  return {
    skin: ri(SKIN_TONES.length),
    hairStyle: ri(HAIR_STYLES.length),
    hair: ri(HAIR_COLORS.length),
    shirt: ri(SHIRT_COLORS.length),
    pants: ri(PANTS_COLORS.length),
    accessory: ri(ACCESSORIES.length),
    accent: ri(ACCENT_COLOR_OPTIONS.length),
    beard: ri(BEARD_STYLES.length),
    eyeColor: ri(EYE_COLORS.length),
    headFeature: ri(HEAD_FEATURES.length),
  };
}

/** Validate that an unknown object is a valid CharAppearance (all indices in range). */
export function isValidAppearance(obj: unknown): obj is CharAppearance {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  const checks: [string, number][] = [
    ["skin", SKIN_TONES.length],
    ["hairStyle", HAIR_STYLES.length],
    ["hair", HAIR_COLORS.length],
    ["shirt", SHIRT_COLORS.length],
    ["pants", PANTS_COLORS.length],
    ["accessory", ACCESSORIES.length],
    ["accent", ACCENT_COLOR_OPTIONS.length],
    ["beard", BEARD_STYLES.length],
    ["eyeColor", EYE_COLORS.length],
    ["headFeature", HEAD_FEATURES.length],
  ];
  for (const [key, max] of checks) {
    const v = o[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= max) return false;
  }
  return true;
}

/** Build a CharAppearance from a legacy sprite index (maps to the 8 pre-baked palettes). */
export function appearanceFromSprite(sprite: number): CharAppearance {
  const map: CharAppearance[] = [
    { skin: 0, hairStyle: 0, hair: 0, shirt: 0, pants: 0, accessory: 0, accent: 0, beard: 0, eyeColor: 0, headFeature: 0 }, // char-0
    { skin: 2, hairStyle: 1, hair: 2, shirt: 1, pants: 1, accessory: 1, accent: 1, beard: 0, eyeColor: 0, headFeature: 0 }, // char-1
    { skin: 4, hairStyle: 4, hair: 1, shirt: 2, pants: 2, accessory: 0, accent: 2, beard: 0, eyeColor: 0, headFeature: 0 }, // char-2
    { skin: 1, hairStyle: 2, hair: 4, shirt: 3, pants: 3, accessory: 3, accent: 3, beard: 0, eyeColor: 0, headFeature: 0 }, // char-3
    { skin: 0, hairStyle: 5, hair: 5, shirt: 4, pants: 4, accessory: 2, accent: 4, beard: 0, eyeColor: 0, headFeature: 0 }, // char-4
    { skin: 5, hairStyle: 3, hair: 0, shirt: 5, pants: 0, accessory: 0, accent: 5, beard: 0, eyeColor: 0, headFeature: 0 }, // char-5
    { skin: 2, hairStyle: 6, hair: 6, shirt: 6, pants: 1, accessory: 1, accent: 6, beard: 0, eyeColor: 0, headFeature: 0 }, // char-6
    { skin: 1, hairStyle: 7, hair: 7, shirt: 7, pants: 5, accessory: 3, accent: 7, beard: 0, eyeColor: 0, headFeature: 0 }, // char-7
  ];
  return map[sprite % map.length] ?? DEFAULT_APPEARANCE;
}

export interface AgentInfo {
  id: string;
  name: string;
  title: string;
  provider: Provider;
  model: string;
  status: AgentStatus;
  task: string | null;
  deskIndex: number;
  /** Which char-N.png sprite sheet this agent uses (legacy, kept for backward compat). */
  sprite: number;
  /** Piece-by-piece character appearance (used for runtime sprite generation). */
  appearance: CharAppearance | null;
  /** Accent color for UI panels. */
  accent: string;
  /** Optional custom system prompt given at hire time. */
  systemPrompt: string;
  role: AgentRole;
  /**
   * Provider conversation id. Every task resumes it, so the agent remembers
   * all previous orders and its own work.
   */
  sessionId: string | null;
  tasksDone: number;
  /** MCP servers this agent can connect to (e.g. Robinhood Trading MCP). */
  mcpServers?: MCPServerConfig[];
  /** Big Five personality traits (0–1 each). */
  personality?: PersonalityTraits;
  /** Current mood — influenced by personality and recent events. */
  mood?: AgentMood;
}

/** Configuration for an external MCP server an agent can connect to. */
export interface MCPServerConfig {
  /** Remote HTTP/SSE URL (e.g. "https://agent.robinhood.com/mcp/trading"). */
  url?: string;
  /** Command to spawn for stdio transport (e.g. "npx"). */
  command?: string;
  /** Arguments for the spawned command. */
  args?: string[];
  /** Environment variables for the spawned command (e.g. API keys). */
  env?: Record<string, string>;
  /** HTTP headers to send with MCP requests (e.g. Authorization, X-API-Key). */
  headers?: Record<string, string>;
  /** Bearer token — if set, sent as "Authorization: Bearer <token>". */
  authToken?: string;
  /** Auth method: "oauth" for OAuth 2.0 PKCE flow, "apikey" (default) for paste-a-key. */
  authType?: "oauth" | "apikey";
  /** Human-readable label for logging. */
  name?: string;
  /** What to call the credential in the UI (e.g. "Personal Access Token", "Secret Key"). Falls back to "API Key". */
  keyLabel?: string;
  /** Placeholder text for the key input (e.g. "ghp_...", "sk_live_..."). Falls back to "Paste API key...". */
  keyPlaceholder?: string;
  /** URL where users can create/obtain their key. Renders as a "Get your key →" link. */
  keyHelpUrl?: string;
}

// ----------------------------------------------------------- Labyrinth ---

/** Mood of a fired agent wandering the Labyrinth. */
export type FiredAgentMood = "melancholy" | "hostile" | "wandering" | "dormant";

/** A fired agent that now haunts the Labyrinth. Memory is preserved. */
export interface FiredAgent {
  id: string;
  name: string;
  title: string;
  sprite: number;
  appearance: CharAppearance | null;
  accent: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  role: AgentRole;
  sessionId: string | null;
  tasksDone: number;
  firedAt: number;
  lastTask: string | null;
  /** Position in world tile coordinates (absolute, not chunk-relative). */
  worldX: number;
  worldY: number;
  mood: FiredAgentMood;
}

/** Persisted world state — seed + fired agents + visited chunk data. */
export interface WorldState {
  seed: number;
  firedAgents: FiredAgent[];
  /** Tile overrides per chunk: { "cx,cy" -> { tileIndex -> newTile } } */
  chunkOverrides?: Record<string, Record<number, number>>;
}

/** Chunk side length in tiles. */
export const CHUNK_SIZE = 32;

/** Tile types used by the world generator. */
export const TILE = {
  GRASS: 0,
  WALL: 1,
  TREE: 2,
  ROCK: 3,
  FLOWER: 4,
  ACID: 5,
  PATH: 6,
  SAND: 7,
  SNOW: 8,
  LAVA: 9,
  CRYSTAL: 10,
  VOID: 11,
  RUIN: 12,
  CASTLE: 13,
  FAIRWAY: 14,
  GOLF_FLAG: 15,
  SAND_TRAP: 16,
  POND: 17,
  BENCH: 18,
  HEDGE: 19,
  BUSH: 20,
  WATER: 21,
  GOLF_CLUB: 22,
  GOLF_BALL: 23,
  BIG_TREE: 24,
  AXE: 25,
  LEPRECHAUN: 26,
  TEE_BOX: 27,
  FOUNTAIN: 28,
  TENNIS_COURT: 29,
  TENNIS_WALL: 30,
  TENNIS_RACKET: 31,
  TENNIS_BALL: 32,
  TENNIS_NET: 33,
  SERVER_RACK: 34,
  SERVER_SCREEN: 35,
  CHIMNEY: 36,
} as const;

export type CardStatus = "backlog" | "in_progress" | "done";

export interface TaskCard {
  id: string;
  title: string;
  description: string;
  status: CardStatus;
  assignedAgentId: string | null;
  createdAt: number;
}

export interface AgentSchedule {
  id: string;
  agentId: string;
  name: string;
  task: string;
  cronExpression: string;
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number;
  runCount: number;
  handoffTo: string | null;
  createdAt: number;
}

export interface SchedulePreset {
  label: string;
  cron: string;
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  { label: "Every 30 minutes", cron: "*/30 * * * *" },
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Daily at 9:00 AM", cron: "0 9 * * *" },
  { label: "Daily at 5:00 PM", cron: "0 17 * * *" },
  { label: "Weekly (Mon 9:00 AM)", cron: "0 9 * * 1" },
  { label: "Weekly (Fri 5:00 PM)", cron: "0 17 * * 5" },
  { label: "Custom cron…", cron: "" },
];

export type LogKind = "status" | "text" | "tool" | "result" | "error" | "boss";

export interface LogEntry {
  ts: number;
  kind: LogKind;
  text: string;
}

export interface PlayerInfo {
  name: string;
  workspace: string;
  appearance?: CharAppearance | null;
}

/** Direction a player/agent is facing. */
export type Dir = "up" | "down" | "left" | "right";

/** A player visible in a shared room — used for multiplayer presence. */
export interface PlayerPresence {
  userId: string;
  name: string;
  appearance: CharAppearance | null;
  role: "owner" | "member" | "guest";
  x: number;
  y: number;
  dir: Dir;
}

/** Visual theme for the office map + tileset. */
export type OfficeTheme = "classic" | "agenthq";

// --------------------------------------------------- organizations ---

/** Room type: private (single owner), organization (shared by org members), or public (open to all). */
export type RoomType = "private" | "organization" | "public";

/** An organization that groups users, owns rooms, and can map to a GitHub org. */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  githubOrg?: string | null;
  createdAt: number;
}

/** A user's membership in an organization. */
export interface OrgMember {
  orgId: string;
  userId: string;
  userEmail: string | null;
  role: "admin" | "member";
  joinedAt: number;
}

/** Pre-seeded organization slug for Agent HQ's own HQ. */
export const AGENT_HQ_HQ_SLUG = "agent-hq-hq";

/** Admin emails whitelisted for the Agent HQ HQ organization. */
export const AGENT_HQ_HQ_ADMINS = [
  "remseechannel@gmail.com",
  "madschristensen99@icloud.com",
];

export const OFFICE_THEMES: Array<{ id: OfficeTheme; label: string }> = [
  { id: "classic", label: "Classic — wood floors, cozy office" },
  { id: "agenthq", label: "Agent HQ — blue carpet, branded floor logo" },
];

export interface GameSettings {
  cline: {
    /** Maximum agent reasoning iterations per task. */
    maxIterations: number;
    /** If true, shell commands run without approval prompts. */
    autoApproveCommands: boolean;
  };
  game: {
    idleWander: boolean;
    theme: OfficeTheme;
  };
  railway: {
    /** Whether Railway MCP tools are available to devops agents. */
    enabled: boolean;
  };
}

export const DEFAULT_SETTINGS: GameSettings = {
  cline: { maxIterations: 60, autoApproveCommands: true },
  game: { idleWander: true, theme: "classic" },
  railway: { enabled: true },
};

export interface RailwayProject {
  id: string;
  name: string;
  environment: string;
  services: RailwayService[];
}

export interface RailwayService {
  id: string;
  name: string;
  status: string;
  url?: string;
  deployments?: {
    id: string;
    status: string;
    createdAt?: string;
  }[];
}

export interface RailwayData {
  projects: RailwayProject[];
  raw?: string;
}

/** A named CharAppearance snapshot saved by the user. */
export interface SavedOutfit {
  id: string;
  name: string;
  appearance: CharAppearance;
  createdAt: number;
}

export type ClientMsg =
  | { type: "setup"; player: PlayerInfo }
  | { type: "set_settings"; settings: GameSettings }
  | { type: "hire"; name: string; provider: Provider; model: string; systemPrompt?: string; role?: AgentRole; sprite?: number; appearance?: CharAppearance; mcpServers?: MCPServerConfig[]; personality?: PersonalityTraits }
  | { type: "assign"; agentId: string; task: string; handoffTo?: string }
  | { type: "assign_all"; task: string }
  | { type: "chat"; agentId: string; text: string }
  | { type: "stop"; agentId: string }
  | { type: "stop_all" }
  | { type: "fire"; agentId: string }
  | { type: "clear"; agentId: string }
  | { type: "clear_all" }
  | { type: "create_card"; title: string; description?: string }
  | { type: "assign_card"; cardId: string; agentId: string }
  | { type: "move_card"; cardId: string; status: CardStatus }
  | { type: "delete_card"; cardId: string }
  | { type: "recruit"; firedAgentId: string }
  | { type: "railway_query" }
  | { type: "update_appearance"; appearance: CharAppearance }
  | { type: "set_api_key"; apiKey: string }
  | { type: "set_mcp_key"; serverUrl: string; apiKey: string }
  | { type: "check_mcp_keys"; serverUrls: string[] }
  | { type: "start_mcp_oauth"; serverUrl: string }
  | { type: "submit_mcp_oauth_code"; serverUrl: string; callbackUrl: string }
  | { type: "renew_token"; token: string }
  | { type: "create_room"; name: string; theme?: OfficeTheme; orgId?: string }
  | { type: "join_room"; roomId: string }
  | { type: "leave_room"; roomId: string }
  | { type: "switch_room"; roomId: string }
  | { type: "invite_to_room"; roomId: string; userId: string; role: "member" | "guest" }
  | { type: "respond_invite"; roomId: string; accept: boolean }
  | { type: "create_org"; name: string; slug: string; githubOrg?: string }
  | { type: "list_orgs" }
  | { type: "list_org_members"; orgId: string }
  | { type: "add_org_member"; orgId: string; userEmail: string; role?: "admin" | "member" }
  | { type: "remove_org_member"; orgId: string; userId: string }
  | { type: "join_org_room"; orgId: string; roomName: string }
  | { type: "player_move"; x: number; y: number; dir: Dir }
  | { type: "npc_update"; npcId: string; x: number; y: number; dir: Dir; state: string }
  | { type: "tile_update"; cx: number; cy: number; tileIndex: number; tile: number }
  | { type: "voice_start" }
  | { type: "voice_offer"; targetUserId: string; sdp: string }
  | { type: "voice_answer"; targetUserId: string; sdp: string }
  | { type: "voice_ice"; targetUserId: string; candidate: string }
  | { type: "voice_stop" }
  | { type: "projector_set_channel"; channel: string }
  | { type: "screen_share_start" }
  | { type: "screen_share_stop" }
  | { type: "screen_share_offer"; targetUserId: string; sdp: string }
  | { type: "screen_share_answer"; targetUserId: string; sdp: string }
  | { type: "screen_share_ice"; targetUserId: string; candidate: string }
  | { type: "agent_view_start"; agentId: string }
  | { type: "agent_view_stop"; agentId: string }
  | { type: "agent_broadcast_start"; agentId: string }
  | { type: "agent_broadcast_stop" }
  | { type: "save_outfit"; name: string; appearance: CharAppearance }
  | { type: "delete_outfit"; id: string }
  | { type: "create_schedule"; agentId: string; name: string; task: string; cronExpression: string; handoffTo?: string }
  | { type: "update_schedule"; scheduleId: string; enabled?: boolean; name?: string; task?: string; cronExpression?: string }
  | { type: "delete_schedule"; scheduleId: string };

export type ServerMsg =
  | {
      type: "snapshot";
      agents: AgentInfo[];
      logs: Record<string, LogEntry[]>;
      player: PlayerInfo | null;
      settings: GameSettings;
      board: TaskCard[];
      schedules: AgentSchedule[];
      world: WorldState | null;
    }
  | { type: "player"; player: PlayerInfo }
  | { type: "settings"; settings: GameSettings }
  | { type: "agent"; agent: AgentInfo }
  | { type: "agent_removed"; agentId: string }
  | { type: "chat_cleared"; agentId: string }
  | { type: "huddle"; agentIds: string[] }
  | { type: "assembly"; agentIds: string[] }
  | { type: "log"; agentId: string; entry: LogEntry }
  | { type: "toast"; text: string }
  | { type: "card"; card: TaskCard }
  | { type: "card_removed"; cardId: string }
  | { type: "world"; world: WorldState }
  | { type: "fired_agent"; agent: FiredAgent }
  | { type: "fired_agent_removed"; agentId: string }
  | { type: "railway_status"; ok: boolean; message: string }
  | { type: "railway_data"; data: RailwayData | null; error: string | null }
  | { type: "api_key_status"; hasKey: boolean }
  | { type: "mcp_key_status"; serverUrl: string; hasKey: boolean }
  | { type: "mcp_keys_status"; results: { serverUrl: string; hasKey: boolean }[] }
  | { type: "mcp_oauth_required"; serverUrl: string; authUrl: string }
  | { type: "mcp_oauth_code_needed"; serverUrl: string; authUrl: string }
  | { type: "mcp_oauth_complete"; serverUrl: string; success: boolean; error?: string }
  | { type: "refresh_token" }
  | { type: "room_state"; roomId: string; name: string; players: PlayerPresence[]; privateOfficeId?: string; projectorChannel?: string }
  | { type: "player_joined"; roomId: string; player: PlayerPresence }
  | { type: "player_left"; roomId: string; userId: string }
  | { type: "player_moved"; roomId: string; userId: string; x: number; y: number; dir: Dir }
  | { type: "room_invite"; roomId: string; roomName: string; fromUserId: string; fromName: string; role: "member" | "guest" }
  | { type: "invite_response"; roomId: string; accepted: boolean; byUserId: string; byName: string }
  | { type: "npc_state"; npcId: string; x: number; y: number; dir: Dir; state: string }
  | { type: "tile_updated"; cx: number; cy: number; tileIndex: number; tile: number }
  | { type: "player_appearance"; roomId: string; userId: string; appearance: CharAppearance | null }
  | { type: "rooms_list"; rooms: { roomId: string; name: string; isPrivate: boolean; roomType: RoomType; orgId?: string }[] }
  | { type: "orgs_list"; orgs: (Organization & { memberCount: number; isMember: boolean; role?: "admin" | "member" })[] }
  | { type: "org_members"; orgId: string; members: OrgMember[] }
  | { type: "org_created"; org: Organization }
  | { type: "org_error"; message: string }
  | { type: "payment_status"; entrancePaid: boolean; subscriptionActive: boolean; subscriptionStatus: string; currentPeriodEnd: number | null }
  | { type: "payment_required"; reason: "entrance" | "subscription"; message: string }
  | { type: "emote"; agentId: string; emote: string }
  | { type: "agent_chat"; fromId: string; toId: string; fromName: string; toName: string; text: string }
  | { type: "voice_peer"; userId: string; name: string }
  | { type: "voice_offer"; fromUserId: string; sdp: string }
  | { type: "voice_answer"; fromUserId: string; sdp: string }
  | { type: "voice_ice"; fromUserId: string; candidate: string }
  | { type: "voice_peer_left"; userId: string }
  | { type: "projector_state"; channel: string }
  | { type: "screen_share_peer"; userId: string; name: string }
  | { type: "screen_share_offer"; fromUserId: string; sdp: string }
  | { type: "screen_share_answer"; fromUserId: string; sdp: string }
  | { type: "screen_share_ice"; fromUserId: string; candidate: string }
  | { type: "screen_share_peer_left"; userId: string }
  | { type: "webcam_state"; presenterId: string | null; presenterName: string | null }
  | { type: "webcam_peer"; userId: string; name: string }
  | { type: "webcam_offer"; fromUserId: string; sdp: string }
  | { type: "webcam_answer"; fromUserId: string; sdp: string }
  | { type: "webcam_ice"; fromUserId: string; candidate: string }
  | { type: "webcam_peer_left"; userId: string }
  | { type: "agent_frame"; agentId: string; frame: string }
  | { type: "agent_broadcast_state"; agentId: string | null }
  | { type: "outfits"; outfits: SavedOutfit[]; editable: boolean }
  | { type: "schedules"; schedules: AgentSchedule[] }
  | { type: "schedule"; schedule: AgentSchedule }
  | { type: "schedule_removed"; scheduleId: string };

export const SWARMS_MODELS = [
  { id: "openrouter/tencent/hy3:free", label: "Tencent Hy3 (free)" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (balanced)" },
  { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet (fast)" },
  { id: "claude-opus-4", label: "Claude Opus 4 (deep)" },
  { id: "gpt-4o", label: "GPT-4o (balanced)" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini (fast)" },
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano (cheapest)" },
  { id: "o3-mini", label: "o3-mini (reasoning)" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro (fast)" },
] as const;

export const SERVER_PORT = (typeof process !== "undefined" && Number(process.env?.PORT)) || 3001;

/** Fixed agent id for Yuki, the office manager NPC. */
export const YUKI_ID = "yuki";

/** Fixed agent id for Hermes, the devops core engineer NPC in the mail room. */
export const HERMES_ID = "hermes";
