// Types shared between the game client and the agent server.

export type Provider = "cline";

export type AgentStatus = "idle" | "thinking" | "working" | "done" | "error" | "waiting";

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
  bodyType?: "normal" | "fat"; // optional, defaults to "normal"
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
  /** Per-agent access control — restricts who can chat with this agent. */
  acl?: AgentACL;
  /** If true, agent gets auto-provisioned Solana wallet tools via Coinbase CDP SDK. */
  cdpSolana?: boolean;
  /** If true, agent gets auto-provisioned multi-chain smart wallet tools via Crossmint. */
  crossmintWallet?: boolean;
  /** If true, this is a premium marketplace agent with paid API services. */
  isPremium?: boolean;
  /** Premium Circle x402 API services this agent can call (paid via Circle Gateway). */
  circleServices?: CircleServiceConfig[];
  /** Agent ID this agent is waiting at (when status is "waiting"). */
  waitingFor?: string | null;
  /** Skill tags describing what this agent is good at (matched against card categories). */
  skills?: TaskCategory[];
  /** Structured capability tags (broader than TaskCategory — e.g. "testing", "api-design", "security"). */
  capabilities?: string[];
  /** Per-skill performance metrics for capability gap analysis and estimation. */
  performanceBySkill?: Record<string, SkillPerformance>;
}

/** A premium API service from Circle's x402 marketplace. */
export interface CircleServiceConfig {
  /** Human-readable name for the service (e.g. "weather-api"). */
  name: string;
  /** The x402-protected API endpoint URL. */
  endpoint: string;
  /** Price per call in USD. */
  pricePerCall: number;
  /** Human-readable description of the service. */
  description: string;
  /** Tool definitions exposed by this service. */
  tools: PremiumToolDef[];
  /** HTTP method for this endpoint (default: GET). */
  method?: "GET" | "POST" | "PUT" | "DELETE";
}

/** A tool definition for a premium API service. */
export interface PremiumToolDef {
  name: string;
  description: string;
  inputSchema: { type: string; properties?: Record<string, unknown>; required?: string[] };
}

/** Access control list for an individual agent.
 *  If unset, anyone with "talk" room access can chat.
 *  If set with empty arrays, no one except managers can chat. */
export interface AgentACL {
  /** If set, only these user IDs can chat with this agent. */
  allowedUserIds?: string[];
  /** If set, only these org roles can chat (e.g. ["admin"]). */
  allowedRoles?: ("admin" | "member")[];
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
  /** Brand logo URL (e.g. from simpleicons.org CDN) or inline SVG string. */
  icon?: string;
  /** GitHub source URL for community MCPs that need agent self-setup. */
  sourceUrl?: string;
  /** For stdio servers: credential fields the user must provide (rendered as separate inputs). */
  envVars?: { name: string; description: string; isRequired: boolean }[];
  /** For remote servers where the URL is per-instance (e.g. n8n). When set, the UI shows a URL input field. */
  urlPlaceholder?: string;
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
  cdpSolana?: boolean;
  crossmintWallet?: boolean;
  isPremium?: boolean;
  circleServices?: CircleServiceConfig[];
  skills?: TaskCategory[];
}

/** An agent on vacation — temporarily away with all data preserved. */
export interface VacationedAgent {
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
  mcpServers?: MCPServerConfig[];
  personality?: PersonalityTraits;
  mood?: AgentMood;
  deskIndex: number;
  vacationedAt: number;
  skills?: TaskCategory[];
}

/** Persisted world state — seed + fired agents + vacationed agents + visited chunk data. */
export interface WorldState {
  seed: number;
  firedAgents: FiredAgent[];
  vacationedAgents?: VacationedAgent[];
  /** Tile overrides per chunk: { "cx,cy" -> { tileIndex -> newTile } } */
  chunkOverrides?: Record<string, Record<number, number>>;
}

// ── World Theme System ────────────────────────────────────────────────

/** Status color overrides for a world theme. */
export interface ThemeStatusColors {
  idle: number;
  thinking: number;
  working: number;
  done: number;
  error: number;
  waiting: number;
}

/** A custom interactable object placed in a themed world. */
export interface ThemeInteractable {
  tileId: number;
  x: number;
  y: number;
  interactionType: string;
}

/** World generation overrides for a themed world. */
export interface ThemeWorldgen {
  biomes: string[];
  baseGround: Record<string, number>;
  obstacles: Record<string, number[]>;
  decorations?: Record<string, number[]>;
  hostileTiles?: Record<string, number[]>;
  hostilityThresholds: number[];
}

/** Tile definition for a themed world. */
export interface ThemeTile {
  id: number;
  walkable: boolean;
  textureKey?: string;
  animated?: boolean;
  frames?: number;
}

/** Agent work animation override. */
export interface ThemeAgentWorkAnim {
  spritesheetPath: string;
  frames: number;
  frameRate: number;
}

/** Asset fidelity tier — procedural (free) or AI-generated (paid upgrade). */
export type AssetTier = "procedural" | "ai";

/** Asset paths for a themed world — all relative to the branch root. */
export interface ThemeAssets {
  tilesetPath: string;
  characterSpritesheetPath?: string;
  furnitureSpritesheetPath?: string;
  worldTileSpritesheetPath?: string;
  uiTexturePath?: string;
  /** Asset fidelity tier — "procedural" (default) or "ai" after upgrade. */
  assetTier?: AssetTier;
  /** Custom vehicle sprite key (e.g. helicopter_top) — AI-generated if upgraded. */
  vehicleSpriteKey?: string;
  /** Custom portal sprite key — AI-generated if upgraded. */
  portalSpriteKey?: string;
}

/** Office layout override for a themed world. */
export interface ThemeOffice {
  tilemapPath: string;
  tilesetPath: string;
  floorTile: number;
  wallTile: number;
  doorTile: number;
}

/**
 * A world theme config — committed as `world-theme.json` to the branch root.
 * When present, the game loads themed assets and overrides instead of the
 * hardcoded office defaults.
 */
export interface WorldTheme {
  id: string;
  name: string;
  description: string;
  workMetaphor: string;
  arrivalMetaphor: string;
  office: ThemeOffice;
  furniture: Record<string, string>;
  worldgen: ThemeWorldgen;
  tiles?: Record<string, ThemeTile>;
  interactables: Record<string, ThemeInteractable>;
  agentWorkAnim?: ThemeAgentWorkAnim;
  statusColors?: ThemeStatusColors;
  emotes?: Record<string, number>;
  assets: ThemeAssets;
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
  BIG_ROCK: 37,
  PALM_TREE: 38,
  MYSTIC_TREE: 39,
} as const;

/** Number of base frames in the world-tiles spritesheet (one per tile type, including 3 water animation frames). */
export const WORLD_TILE_FRAMES = 24;

/** Number of texture variants generated per tile type for visual variety. */
export const WORLD_VARIANTS = 4;

export type CardStatus = "backlog" | "in_progress" | "done" | "paused" | "review_pending";

/** V-model lifecycle phases for structured task progression.
 *  Each phase has exit criteria that must be met before advancing. */
export type TaskPhase = "requirements" | "design" | "implementation" | "verification" | "done";

/** A single exit criterion for a V-model phase gate. */
export interface CompletionCriterion {
  id: string;
  text: string;
  checked: boolean;
}

/** Skill performance metrics tracked per agent per skill area. */
export interface SkillPerformance {
  tasks: number;
  successRate: number;  // 0-1
  avgMinutes: number;
}

/** Task categories used for agent-skill matching. */
export type TaskCategory = "general" | "frontend" | "backend" | "devops" | "data" | "writing" | "research" | "crypto";

/** A task saved across server restarts so agents can resume exactly where they left off. */
export interface PendingTask {
  task: string;
  handoffTo: string | null;
  cardId: string | null;
  notifyOnComplete?: string | null;
  waitFor?: string | null;
}

export type CardType = "task" | "chat" | "review" | "goal";

export interface TaskCard {
  id: string;
  title: string;
  description: string;
  status: CardStatus;
  assignedAgentId: string | null;
  createdAt: number;
  type?: CardType;
  progress?: number; // 0-100
  originalAgentId?: string | null;
  revertedAt?: number | null;
  autoCreated?: boolean;
  category?: TaskCategory;
  // ── V-model / Gantt extensions ──────────────────────────
  /** Links this subtask card to its parent goal card. */
  parentGoalId?: string | null;
  /** Current V-model lifecycle phase. */
  phase?: TaskPhase;
  /** Timestamp when execution began (for Gantt bar start). */
  startedAt?: number | null;
  /** Target completion timestamp (for Gantt milestone). */
  dueDate?: number | null;
  /** Estimated duration in minutes (from agent self-estimate or historical data). */
  estimatedMinutes?: number | null;
  /** Actual duration in minutes (filled on completion). */
  actualMinutes?: number | null;
  /** Exit criteria that must be met before advancing to the next phase. */
  completionCriteria?: CompletionCriterion[];
  /** Card IDs this card depends on (must complete before this can start). */
  dependsOnCardIds?: string[];
  /** Card IDs that block this card (derived from office state graph). */
  blockedByCardIds?: string[];
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
  /** Consecutive failed runs — used for exponential backoff. Reset on success. */
  consecutiveFailures?: number;
}

export interface SchedulePreset {
  label: string;
  cron: string;
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  { label: "Every 15 minutes", cron: "*/15 * * * *" },
  { label: "Every 30 minutes", cron: "*/30 * * * *" },
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Daily at 9:00 AM", cron: "0 9 * * *" },
  { label: "Daily at 5:00 PM", cron: "0 17 * * *" },
  { label: "Weekly (Mon 9:00 AM)", cron: "0 9 * * 1" },
  { label: "Weekly (Fri 5:00 PM)", cron: "0 17 * * 5" },
  { label: "Custom…", cron: "__custom__" },
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
/** Room access level for a player.
 *  - "no_access": cannot enter the room at all
 *  - "tour":     can enter and see agents but cannot chat or manage
 *  - "talk":     can enter, see agents, and chat (subject to per-agent ACLs)
 *  - "manage":   full control — hire, fire, assign, configure agents */
export type RoomAccessLevel = "no_access" | "tour" | "talk" | "manage";

export interface PlayerPresence {
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

/** Visual theme for the office map + tileset. */
export type OfficeTheme = "classic" | "agentHeights";

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

/** Pre-seeded organization slug for Agent Heights' own HQ. */
export const AGENT_HEIGHTS_HQ_SLUG = "agent-heights-hq";

/** Admin emails whitelisted for the Agent Heights HQ organization. */
export const AGENT_HEIGHTS_HQ_ADMINS = [
  "remseechannel@gmail.com",
  "madschristensen99@icloud.com",
];

export const OFFICE_THEMES: Array<{ id: OfficeTheme; label: string }> = [
  { id: "classic", label: "Classic — wood floors, cozy office" },
  { id: "agentHeights", label: "Agent Heights — blue carpet, branded floor logo" },
];

export interface GameSettings {
  cline: {
    /** Maximum agent reasoning iterations per task. */
    maxIterations: number;
    /** If true, shell commands run without approval prompts. */
    autoApproveCommands: boolean;
    /** If true, a manager must review work before it's handed off to the next agent. */
    reviewBeforeHandoff: boolean;
  };
  game: {
    idleWander: boolean;
    theme: OfficeTheme;
  };
  railway: {
    /** Whether Railway MCP tools are available to devops agents. */
    enabled: boolean;
  };
  /** Which platform each of the 6 mailbox slots is assigned to (null = unassigned). */
  mailboxPlatforms: (string | null)[];
}

export const DEFAULT_SETTINGS: GameSettings = {
  cline: { maxIterations: 60, autoApproveCommands: true, reviewBeforeHandoff: false },
  game: { idleWander: true, theme: "classic" },
  railway: { enabled: true },
  mailboxPlatforms: [null, null, null, null, null, null],
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

/** Status of an AI asset upgrade job for a deployed world. */
export type AssetUpgradeStatus = "none" | "generating" | "ready" | "failed";

/** A world deployed to Railway — links a GitHub branch to a Railway service. */
export interface WorldDeployment {
  branchName: string;
  repoFullName: string;
  railwayProjectId: string;
  railwayServiceId: string;
  railwayServiceUrl: string | null;
  status: string;
  createdAt: number;
  /** AI asset upgrade status — "none" by default, "generating" during upgrade, "ready" when done. */
  assetUpgradeStatus?: AssetUpgradeStatus;
}

/** A named CharAppearance snapshot saved by the user. */
export interface SavedOutfit {
  id: string;
  name: string;
  appearance: CharAppearance;
  createdAt: number;
}

// --------------------------------------------------- MCP Forge ---

/** An MCP server built by an agent in the office, available to all agents. */
export interface OfficeMCPServer {
  id: string;
  /** Display name for the server (agent-chosen). */
  name: string;
  /** Description of what the server does. */
  description: string;
  /** Runtime: "node" or "python". */
  runtime: "node" | "python";
  /** Entry file path relative to the builder agent's workspace. */
  entryFile: string;
  /** Agent ID that built this server. */
  builtBy: string;
  /** Agent name that built this server. */
  builtByName: string;
  /** Timestamp of registration. */
  createdAt: number;
  /** Current status of the server process. */
  status: "running" | "stopped" | "error";
  /** Tools exposed by this server (populated after tools/list). */
  tools: { name: string; description: string }[];
  /** Error message if status is "error". */
  error?: string;
}

export type ClientMsg =
  | { type: "auth"; token: string }
  | { type: "setup"; player: PlayerInfo }
  | { type: "set_settings"; settings: GameSettings }
  | { type: "hire"; name: string; provider: Provider; model: string; systemPrompt?: string; role?: AgentRole; sprite?: number; appearance?: CharAppearance; mcpServers?: MCPServerConfig[]; personality?: PersonalityTraits; cdpSolana?: boolean; crossmintWallet?: boolean; isPremium?: boolean; circleServices?: CircleServiceConfig[]; skills?: TaskCategory[] }
  | { type: "assign"; agentId: string; task: string; handoffTo?: string }
  | { type: "assign_new"; agentId: string; task: string; handoffTo?: string }
  | { type: "assign_all"; task: string }
  | { type: "chat"; agentId: string; text: string }
  | { type: "stop"; agentId: string }
  | { type: "stop_all" }
  | { type: "fire"; agentId: string }
  | { type: "vacation"; agentId: string }
  | { type: "restore"; agentId: string }
  | { type: "clear"; agentId: string }
  | { type: "clear_all" }
  | { type: "create_card"; title: string; description?: string }
  | { type: "assign_card"; cardId: string; agentId: string }
  | { type: "move_card"; cardId: string; status: CardStatus }
  | { type: "delete_card"; cardId: string }
  | { type: "set_phase"; cardId: string; phase: TaskPhase }
  | { type: "advance_phase"; cardId: string }
  | { type: "set_due_date"; cardId: string; dueDate: number | null }
  | { type: "set_estimate"; cardId: string; estimatedMinutes: number | null }
  | { type: "toggle_criterion"; cardId: string; criterionId: string }
  | { type: "add_criterion"; cardId: string; text: string }
  | { type: "remove_criterion"; cardId: string; criterionId: string }
  | { type: "link_subtask"; parentGoalId: string; subtaskCardId: string }
  | { type: "set_card_dependency"; cardId: string; dependsOnCardId: string }
  | { type: "remove_card_dependency"; cardId: string; dependsOnCardId: string }
  | { type: "recruit"; firedAgentId: string }
  | { type: "fuse"; agentA: string; agentB: string; name: string; systemPrompt: string; appearance?: CharAppearance; personality?: PersonalityTraits }
  | { type: "railway_query" }
  | { type: "update_appearance"; appearance: CharAppearance }
  | { type: "update_agent"; agentId: string; systemPrompt?: string }
  | { type: "set_api_key"; apiKey: string }
  | { type: "set_mcp_key"; serverUrl: string; apiKey: string }
  | { type: "check_mcp_keys"; serverUrls: string[] }
  | { type: "start_mcp_oauth"; serverUrl: string; clientOrigin?: string }
  | { type: "submit_mcp_oauth_code"; serverUrl: string; callbackUrl: string }
  | { type: "get_cdp_wallet"; agentId: string }
  | { type: "get_cdp_policy"; agentId: string }
  | { type: "set_cdp_policy"; agentId: string; maxSolPerTransfer?: number; allowedRecipients?: string[]; blockedRecipients?: string[]; allowedTokenMints?: string[]; blockedTokenMints?: string[] }
  | { type: "get_cdp_tx_history"; agentId: string }
  | { type: "create_cdp_onramp"; agentId: string }
  | { type: "get_crossmint_wallet"; agentId: string }
  | { type: "get_crossmint_balance"; agentId: string }
  | { type: "get_crossmint_policy"; agentId: string }
  | { type: "get_crossmint_tx_history"; agentId: string }
  | { type: "fund_crossmint_wallet"; agentId: string; amount?: number }
  | { type: "create_crossmint_onramp"; agentId: string }
  | { type: "renew_token"; token: string }
  | { type: "create_room"; name: string; theme?: OfficeTheme; orgId?: string }
  | { type: "join_room"; roomId: string }
  | { type: "leave_room"; roomId: string }
  | { type: "switch_room"; roomId: string }
  | { type: "invite_to_room"; roomId: string; userId: string; role: "member" | "guest"; accessLevel?: RoomAccessLevel }
  | { type: "set_agent_acl"; agentId: string; acl: AgentACL }
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
  | { type: "github_query" }
  | { type: "github_fork"; branchName: string }
  | { type: "github_list_branches" }
  | { type: "github_delete_branch"; branchName: string }
  | { type: "railway_deploy"; branchName: string; repoFullName: string }
  | { type: "railway_list_deployments" }
  | { type: "railway_stop_deployment"; branchName: string }
  | { type: "railway_delete_deployment"; branchName: string }
  | { type: "github_list_dir"; branchName: string; path: string }
  | { type: "github_read_file"; branchName: string; path: string }
  | { type: "github_write_file"; branchName: string; path: string; content: string; sha: string | null; commitMessage: string }
  | { type: "github_create_file"; branchName: string; path: string; content: string; commitMessage: string }
  | { type: "github_delete_file"; branchName: string; path: string; sha: string; commitMessage: string }
  | { type: "voice_start" }
  | { type: "voice_listen" }
  | { type: "voice_offer"; targetUserId: string; sdp: string }
  | { type: "voice_answer"; targetUserId: string; sdp: string }
  | { type: "voice_ice"; targetUserId: string; candidate: string }
  | { type: "voice_stop" }
  | { type: "voice_listen_stop" }
  | { type: "projector_set_channel"; channel: string }
  | { type: "screen_share_start" }
  | { type: "screen_share_stop" }
  | { type: "screen_share_offer"; targetUserId: string; sdp: string }
  | { type: "screen_share_answer"; targetUserId: string; sdp: string }
  | { type: "screen_share_ice"; targetUserId: string; candidate: string }
  | { type: "webcam_start" }
  | { type: "webcam_stop" }
  | { type: "webcam_offer"; targetUserId: string; sdp: string }
  | { type: "webcam_answer"; targetUserId: string; sdp: string }
  | { type: "webcam_ice"; targetUserId: string; candidate: string }
  | { type: "agent_view_start"; agentId: string }
  | { type: "agent_view_stop"; agentId: string }
  | { type: "agent_broadcast_start"; agentId: string }
  | { type: "agent_broadcast_stop" }
  | { type: "agent_broadcast_html"; agentId: string; filePath: string }
  | { type: "upgrade_assets"; deploymentId: string }
  | { type: "agent_fs_list"; agentId: string; path: string }
  | { type: "agent_fs_read"; agentId: string; path: string }
  | { type: "agent_fs_write"; agentId: string; path: string; content: string }
  | { type: "agent_fs_delete"; agentId: string; path: string }
  | { type: "agent_fs_upload"; agentId: string; path: string; content: string; encoding: "base64" | "utf-8" }
  | { type: "agent_log_subscribe"; agentId: string }
  | { type: "agent_log_unsubscribe"; agentId: string }
  | { type: "agent_inject_task"; agentId: string; task: string; handoffTo?: string }
  | { type: "agent_memory_request"; agentId: string }
  | { type: "check_mailbox"; platform: string }
  | { type: "connect_platform"; platform: string }
  | { type: "configure_platform"; platform: string; credentials: Record<string, string> }
  | { type: "set_mailbox_platform"; slot: number; platform: string | null }
  | { type: "reply_mailbox"; platform: string; target: string; text: string }
  | { type: "request_mail_digest" }
  | { type: "save_outfit"; name: string; appearance: CharAppearance }
  | { type: "delete_outfit"; id: string }
  | { type: "create_schedule"; agentId: string; name: string; task: string; cronExpression: string; handoffTo?: string }
  | { type: "update_schedule"; scheduleId: string; enabled?: boolean; name?: string; task?: string; cronExpression?: string }
  | { type: "delete_schedule"; scheduleId: string }
  | { type: "rename"; agentId: string; name: string }
  | { type: "spectator_join" }
  | { type: "spectator_chat"; fromName: string; text: string }
  | { type: "list_office_mcp" }
  | { type: "unregister_mcp_server"; serverId: string }
  | { type: "delete_account" }
  | { type: "cancel_deletion" };

export type ServerMsg =
  | { type: "auth_required" }
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
  | { type: "vacationed_agent"; agent: VacationedAgent }
  | { type: "vacationed_agent_removed"; agentId: string }
  | { type: "railway_status"; ok: boolean; message: string }
  | { type: "railway_data"; data: RailwayData | null; error: string | null }
  | { type: "api_key_status"; hasKey: boolean }
  | { type: "mcp_key_status"; serverUrl: string; hasKey: boolean }
  | { type: "mcp_keys_status"; results: { serverUrl: string; hasKey: boolean }[] }
  | { type: "mcp_oauth_required"; serverUrl: string; authUrl: string; redirectMode?: "auto" | "manual" }
  | { type: "mcp_oauth_code_needed"; serverUrl: string; authUrl: string; redirectMode?: "auto" | "manual" }
  | { type: "mcp_oauth_complete"; serverUrl: string; success: boolean; error?: string }
  | { type: "cdp_wallet_status"; agentId: string; address: string | null; balances: { symbol: string; amount: string; usdValue?: string }[] | null; error?: string }
  | { type: "cdp_policy_status"; agentId: string; policyId: string | null; maxSolPerTransfer: number | null; allowedRecipients: string[] | null; blockedRecipients: string[] | null; allowedTokenMints: string[] | null; blockedTokenMints: string[] | null; network: string; error?: string }
  | { type: "cdp_tx_history"; agentId: string; transactions: { signature: string; slot: number; blockTime: number | null; err: boolean | null; memo: string | null }[] | null; error?: string }
  | { type: "cdp_onramp_url"; agentId: string; url: string | null; error?: string }
  | { type: "crossmint_wallet_status"; agentId: string; address: string | null; chain: string | null; balances: { symbol: string; amount: string; usdValue?: string }[] | null; error?: string }
  | { type: "crossmint_policy_status"; agentId: string; chain: string | null; spendingLimitUsd: number | null; allowedRecipients: string[] | null; blockedRecipients: string[] | null; description: string | null; error?: string }
  | { type: "crossmint_tx_history"; agentId: string; transactions: any[] | null; error?: string }
  | { type: "crossmint_fund_result"; agentId: string; success: boolean; message: string }
  | { type: "crossmint_onramp_url"; agentId: string; url: string | null; error?: string }
  | { type: "refresh_token" }
  | { type: "room_state"; roomId: string; name: string; players: PlayerPresence[]; privateOfficeId?: string; projectorChannel?: string; accessLevel?: RoomAccessLevel; roomType?: RoomType }
  | { type: "player_joined"; roomId: string; player: PlayerPresence }
  | { type: "player_left"; roomId: string; userId: string }
  | { type: "player_moved"; roomId: string; userId: string; x: number; y: number; dir: Dir }
  | { type: "players_moved"; roomId: string; updates: { userId: string; x: number; y: number; dir: Dir }[] }
  | { type: "room_invite"; roomId: string; roomName: string; fromUserId: string; fromName: string; role: "member" | "guest"; accessLevel?: RoomAccessLevel }
  | { type: "agent_acl_updated"; agentId: string; acl: AgentACL }
  | { type: "invite_response"; roomId: string; accepted: boolean; byUserId: string; byName: string }
  | { type: "npc_state"; npcId: string; x: number; y: number; dir: Dir; state: string }
  | { type: "tile_updated"; cx: number; cy: number; tileIndex: number; tile: number }
  | { type: "github_status"; connected: boolean; login: string | null; error: string | null }
  | { type: "github_data"; branches: { name: string; sha: string }[]; fork: { owner: string; name: string; fullName: string; cloneUrl: string; branch: string } | null; error: string | null }
  | { type: "github_fork_created"; fork: { owner: string; name: string; fullName: string; cloneUrl: string; branch: string }; branchName: string }
  | { type: "github_error"; error: string }
  | { type: "railway_deployments"; deployments: WorldDeployment[]; error: string | null }
  | { type: "railway_deploy_started"; branchName: string; message: string }
  | { type: "railway_deploy_result"; deployment: WorldDeployment; error: string | null }
  | { type: "github_dir"; branchName: string; path: string; entries: { path: string; type: "file" | "dir"; size: number }[]; error: string | null }
  | { type: "github_file"; branchName: string; path: string; content: string; sha: string; error: string | null }
  | { type: "github_file_saved"; branchName: string; path: string; message: string }
  | { type: "github_file_deleted"; branchName: string; path: string }
  | { type: "player_appearance"; roomId: string; userId: string; appearance: CharAppearance | null }
  | { type: "rooms_list"; rooms: { roomId: string; name: string; isPrivate: boolean; roomType: RoomType; orgId?: string }[] }
  | { type: "orgs_list"; orgs: (Organization & { memberCount: number; isMember: boolean; role?: "admin" | "member" })[] }
  | { type: "org_members"; orgId: string; members: OrgMember[] }
  | { type: "org_created"; org: Organization }
  | { type: "org_error"; message: string }
  | { type: "payment_status"; entrancePaid: boolean; subscriptionActive: boolean; subscriptionStatus: string; subscriptionTier: SubscriptionTier | null; agentLimit: number; usageCap: number; currentPeriodEnd: number | null; freeTrialExpiresAt: number | null; nextTrialAt: number | null }
  | { type: "payment_required"; reason: "subscription" | "agent_limit" | "usage_cap"; message: string; tier?: SubscriptionTier | null; agentLimit?: number; monthlySpend?: number; usageCap?: number }
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
  | { type: "agent_broadcast_html_state"; agentId: string | null; url: string | null }
  | { type: "agent_fs_listing"; agentId: string; path: string; entries: { name: string; isDir: boolean; size: number; mtime: number }[] }
  | { type: "agent_fs_content"; agentId: string; path: string; content: string; error?: string }
  | { type: "agent_fs_result"; agentId: string; path: string; action: "write" | "delete" | "upload"; success: boolean; error?: string }
  | { type: "agent_log"; agentId: string; entry: LogEntry }
  | { type: "agent_log_history"; agentId: string; entries: LogEntry[] }
  | { type: "agent_task_info"; agentId: string; currentTask: string | null; queue: { task: string; handoffTo: string | null }[]; history: { task: string; success: boolean; ts: number; durationMs: number }[] }
  | { type: "agent_memory"; agentId: string; messages: { role: string; content: string }[] }
  | { type: "mailbox_update"; platform: string; flagUp: boolean; pendingCount: number; lastMessage: string; assignedAgentId: string | null }
  | { type: "mailbox_messages"; platform: string; events: PlatformEvent[] }
  | { type: "mail_digest"; totalUnread: number; byPlatform: { platform: string; unread: number; lastMessage: string }[]; queued: number }
  | { type: "platform_connection"; states: PlatformConnectionState[] }
  | { type: "platform_config_result"; platform: string; success: boolean; error?: string }
  | { type: "outfits"; outfits: SavedOutfit[]; editable: boolean }
  | { type: "schedules"; schedules: AgentSchedule[] }
  | { type: "schedule"; schedule: AgentSchedule }
  | { type: "schedule_removed"; scheduleId: string }
  | { type: "helicopter_delivery"; name: string; model: string; provider: string; systemPrompt: string; appearance?: CharAppearance; mcpServers?: MCPServerConfig[]; alreadyHired?: boolean }
  | { type: "server_restarting"; estimatedSeconds: number }
  | { type: "spectator_chat_relay"; fromName: string; text: string }
  | { type: "office_mcp_list"; servers: OfficeMCPServer[] }
  | { type: "office_mcp_update"; server: OfficeMCPServer }
  | { type: "office_mcp_removed"; serverId: string }
  | { type: "mcp_build_log"; serverId: string; line: string; stream: "stdout" | "stderr" }
  | { type: "deletion_scheduled"; scheduledDeletionAt: number }
  | { type: "deletion_cancelled" }
  | { type: "fuse_effect"; agentAId: string; agentBId: string; fusedId: string }
  | { type: "asset_upgrade_started"; deploymentId: string }
  | { type: "asset_upgrade_progress"; deploymentId: string; stage: string; percent: number; label: string }
  | { type: "asset_upgrade_ready"; deploymentId: string }
  | { type: "asset_upgrade_failed"; deploymentId: string; error: string }
  | { type: "gantt_update"; cards: TaskCard[]; dependencies: { from: string; to: string; type: string }[] }
  | { type: "phase_gate"; cardId: string; phase: TaskPhase; approved: boolean; reviewerId: string; reviewerName: string }
  | { type: "capability_gap"; gaps: { skill: string; requiredBy: string; suggestion: string }[] }

export const AGENT_MODELS = [
  { id: "kimi-k2.5", label: "Standard" },
] as const;

// --------------------------------------------------- subscription tiers ---

export type SubscriptionTier = "starter" | "pro" | "business";
export type BillingPeriod = "monthly" | "annual";

export interface TierInfo {
  id: SubscriptionTier;
  price: number;       // cents per month
  label: string;       // display label
  name: string;        // display name
  agentLimit: number;  // max agents (Infinity for unlimited)
  usageCap: number;     // max monthly LLM spend in cents (80% of price)
  premiumCap: number;   // max monthly premium API spend in cents (separate budget)
  description: string;
  annualPrice: number;  // cents per year (10 months — 2 months free)
  annualLabel: string;  // display label for annual
}

export const SUBSCRIPTION_TIERS: Record<SubscriptionTier, TierInfo> = {
  starter: {
    id: "starter",
    price: 99,
    label: "$0.99/mo",
    name: "Starter",
    agentLimit: 4,
    usageCap: 80,
    premiumCap: 50,
    description: "Hire and manage up to 4 AI agents in your office.",
    annualPrice: 990,
    annualLabel: "$9.90/yr",
  },
  pro: {
    id: "pro",
    price: 499,
    label: "$4.99/mo",
    name: "Pro",
    agentLimit: 6,
    usageCap: 400,
    premiumCap: 300,
    description: "Hire and manage up to 6 AI agents in your office.",
    annualPrice: 4990,
    annualLabel: "$49.90/yr",
  },
  business: {
    id: "business",
    price: 1999,
    label: "$19.99/mo",
    name: "Business",
    agentLimit: 8,
    usageCap: 1600,
    premiumCap: 1200,
    description: "Hire and manage up to 8 AI agents in your office.",
    annualPrice: 19990,
    annualLabel: "$199.90/yr",
  },
};

export const SUBSCRIPTION_TIER_LIST = Object.values(SUBSCRIPTION_TIERS);

/** Determine the tier from a stored string, defaulting to "none". */
export function parseTier(s: string | null | undefined): SubscriptionTier | null {
  if (s === "starter" || s === "pro" || s === "business") return s;
  return null;
}

export const SERVER_PORT = (typeof process !== "undefined" && Number(process.env?.PORT)) || 3001;

/** Fixed agent id for Agent Resources, the office manager NPC. */
export const AGENT_RESOURCES_ID = "agent-resources";

/** Fixed agent id for Hermes, the devops core engineer NPC in the mail room. */
export const HERMES_ID = "hermes";

/** Fixed agent id for the Wizard, the world-builder NPC present in world branches. */
export const WIZARD_ID = "wizard";

/** Default platforms for the 6 mailbox slots — all unassigned by default. */
export const DEFAULT_MAILBOX_PLATFORMS: (string | null)[] = [null, null, null, null, null, null];

/** Credential field definition for platform setup. */
export interface PlatformCredentialField {
  key: string;
  label: string;
  placeholder: string;
  type: "password" | "text";
  required: boolean;
}

/** A platform in the catalog — metadata + credential schema. */
export interface PlatformCatalogEntry {
  name: string;
  /** Brand color for the mailbox (hex integer). */
  color: number;
  /** 1 = shown by default, 2 = available, 3 = regional/niche. */
  tier: 1 | 2 | 3;
  /** Short description shown in the platform picker. */
  description: string;
  /** Credential fields shown in the setup modal. Empty = configure via `hermes gateway setup`. */
  credentialFields: PlatformCredentialField[];
}

/** Full catalog of all Hermes-supported messaging platforms (27+). */
export const PLATFORM_CATALOG: PlatformCatalogEntry[] = [
  // ── Tier 1 — common business/messaging platforms ──
  {
    name: "Slack", color: 0x611f69, tier: 1,
    description: "Slack workspace bot — channels, DMs, threads",
    credentialFields: [
      { key: "bot_token", label: "Bot User OAuth Token", placeholder: "xoxb-...", type: "password", required: true },
      { key: "signing_secret", label: "App-Level Token", placeholder: "xapp-...", type: "password", required: true },
      { key: "allowed_users", label: "Allowed User IDs (optional)", placeholder: "U01ABC2DEF3,U02HIJK3LMN", type: "text", required: false },
    ],
  },
  {
    name: "Discord", color: 0x5865f2, tier: 1,
    description: "Discord server bot — channels, DMs, reactions",
    credentialFields: [
      { key: "bot_token", label: "Bot Token", placeholder: "MTk2NjI4...", type: "password", required: true },
    ],
  },
  {
    name: "Telegram", color: 0x0088cc, tier: 1,
    description: "Telegram bot via BotFather — chats, groups, voice",
    credentialFields: [
      { key: "bot_token", label: "Bot Token (from @BotFather)", placeholder: "123456789:ABCdef...", type: "password", required: true },
    ],
  },
  {
    name: "WhatsApp", color: 0x25d366, tier: 1,
    description: "WhatsApp Business API via Twilio or Cloud API",
    credentialFields: [
      { key: "account_sid", label: "Twilio Account SID", placeholder: "AC...", type: "text", required: true },
      { key: "auth_token", label: "Twilio Auth Token", placeholder: "...", type: "password", required: true },
      { key: "phone_number", label: "WhatsApp Number (sandbox: +14155238886)", placeholder: "+14155238886", type: "text", required: true },
    ],
  },
  {
    name: "Signal", color: 0x3a76f0, tier: 1,
    description: "Signal messenger via signal-cli REST API",
    credentialFields: [
      { key: "phone_number", label: "Signal Phone Number", placeholder: "+15551234567", type: "text", required: true },
    ],
  },
  {
    name: "Email", color: 0xea4335, tier: 1,
    description: "Email via IMAP/SMTP — any provider (Gmail, Outlook, etc.)",
    credentialFields: [
      { key: "imap_host", label: "IMAP Server", placeholder: "imap.gmail.com", type: "text", required: true },
      { key: "imap_port", label: "IMAP Port", placeholder: "993", type: "text", required: true },
      { key: "smtp_host", label: "SMTP Server", placeholder: "smtp.gmail.com", type: "text", required: true },
      { key: "smtp_port", label: "SMTP Port", placeholder: "587", type: "text", required: true },
      { key: "email", label: "Email Address", placeholder: "you@gmail.com", type: "text", required: true },
      { key: "password", label: "App Password", placeholder: "16-char app password", type: "password", required: true },
    ],
  },
  {
    name: "SMS", color: 0x4a9b4a, tier: 1,
    description: "SMS via Twilio — text messages to phone numbers",
    credentialFields: [
      { key: "account_sid", label: "Twilio Account SID", placeholder: "AC...", type: "text", required: true },
      { key: "auth_token", label: "Twilio Auth Token", placeholder: "...", type: "password", required: true },
      { key: "phone_number", label: "Twilio Phone Number", placeholder: "+15551234567", type: "text", required: true },
    ],
  },
  {
    name: "Microsoft Teams", color: 0x6264a7, tier: 1,
    description: "Microsoft Teams bot — channels, chats, meetings",
    credentialFields: [
      { key: "app_id", label: "App (Bot) ID", placeholder: "00000000-0000-...", type: "text", required: true },
      { key: "tenant_id", label: "Tenant ID", placeholder: "00000000-0000-...", type: "text", required: true },
      { key: "bot_password", label: "Bot Password / Client Secret", placeholder: "...", type: "password", required: true },
    ],
  },
  {
    name: "Google Chat", color: 0x1a73e8, tier: 1,
    description: "Google Chat bot — spaces, DMs, threads",
    credentialFields: [
      { key: "project_id", label: "Google Cloud Project ID", placeholder: "my-project-123", type: "text", required: true },
      { key: "service_account", label: "Service Account JSON", placeholder: '{"type":"service_account",...}', type: "password", required: true },
    ],
  },
  {
    name: "Matrix", color: 0x0dbd8b, tier: 1,
    description: "Matrix protocol via mautrix — optional E2EE",
    credentialFields: [
      { key: "homeserver_url", label: "Homeserver URL", placeholder: "https://matrix.org", type: "text", required: true },
      { key: "access_token", label: "Access Token", placeholder: "syt_...", type: "password", required: true },
      { key: "user_id", label: "User ID", placeholder: "@bot:matrix.org", type: "text", required: true },
    ],
  },
  // ── Tier 2 — available but less common ──
  {
    name: "Mattermost", color: 0x1f6dff, tier: 2,
    description: "Mattermost open-source chat — channels, DMs",
    credentialFields: [
      { key: "server_url", label: "Mattermost Server URL", placeholder: "https://mattermost.example.com", type: "text", required: true },
      { key: "bot_token", label: "Bot Token", placeholder: "...", type: "password", required: true },
      { key: "team_name", label: "Team Name", placeholder: "engineering", type: "text", required: true },
    ],
  },
  {
    name: "LINE", color: 0x06c755, tier: 2,
    description: "LINE Messaging API — chats, groups",
    credentialFields: [
      { key: "channel_access_token", label: "Channel Access Token", placeholder: "...", type: "password", required: true },
      { key: "channel_secret", label: "Channel Secret", placeholder: "...", type: "password", required: true },
    ],
  },
  {
    name: "IRC", color: 0x7e7e7e, tier: 2,
    description: "IRC protocol — channels, DMs, classic chat",
    credentialFields: [
      { key: "server", label: "IRC Server", placeholder: "irc.libera.chat", type: "text", required: true },
      { key: "port", label: "Port", placeholder: "6697", type: "text", required: true },
      { key: "nickname", label: "Bot Nickname", placeholder: "AgentHeights", type: "text", required: true },
      { key: "channels", label: "Channels (comma-separated)", placeholder: "#general,#support", type: "text", required: true },
    ],
  },
  {
    name: "BlueBubbles", color: 0x34c759, tier: 2,
    description: "iMessage via BlueBubbles macOS server",
    credentialFields: [
      { key: "server_url", label: "BlueBubbles Server URL", placeholder: "http://192.168.1.100:1234", type: "text", required: true },
      { key: "password", label: "BlueBubbles Password", placeholder: "...", type: "password", required: true },
    ],
  },
  {
    name: "ntfy", color: 0x3a76f0, tier: 2,
    description: "ntfy push notification service",
    credentialFields: [
      { key: "server_url", label: "ntfy Server URL", placeholder: "https://ntfy.sh", type: "text", required: true },
      { key: "topic", label: "Topic", placeholder: "agent-heights", type: "text", required: true },
    ],
  },
  {
    name: "SimpleX", color: 0x8b5cf6, tier: 2,
    description: "SimpleX Chat — privacy-focused messaging",
    credentialFields: [],
  },
  {
    name: "Open WebUI", color: 0x4a9b8b, tier: 2,
    description: "Open WebUI compatible frontend",
    credentialFields: [
      { key: "server_url", label: "Open WebUI URL", placeholder: "http://localhost:3000", type: "text", required: true },
      { key: "api_key", label: "API Key", placeholder: "...", type: "password", required: true },
    ],
  },
  {
    name: "Webhooks", color: 0xf59e0b, tier: 2,
    description: "Generic inbound/outbound webhook adapter",
    credentialFields: [
      { key: "webhook_url", label: "Webhook URL", placeholder: "https://...", type: "text", required: true },
      { key: "secret", label: "Webhook Secret (optional)", placeholder: "...", type: "password", required: false },
    ],
  },
  // ── Tier 3 — regional / niche ──
  {
    name: "DingTalk", color: 0x1677ff, tier: 3,
    description: "DingTalk (Alibaba) — Chinese workplace messaging",
    credentialFields: [
      { key: "app_key", label: "App Key", placeholder: "...", type: "text", required: true },
      { key: "app_secret", label: "App Secret", placeholder: "...", type: "password", required: true },
    ],
  },
  {
    name: "Feishu/Lark", color: 0x00d6b9, tier: 3,
    description: "Feishu/Lark (ByteDance) — workplace messaging",
    credentialFields: [
      { key: "app_id", label: "App ID", placeholder: "cli_...", type: "text", required: true },
      { key: "app_secret", label: "App Secret", placeholder: "...", type: "password", required: true },
    ],
  },
  {
    name: "WeCom", color: 0x07c160, tier: 3,
    description: "WeCom (WeChat Work) — Tencent workplace",
    credentialFields: [
      { key: "corp_id", label: "Corp ID", placeholder: "...", type: "text", required: true },
      { key: "agent_id", label: "Agent ID", placeholder: "...", type: "text", required: true },
      { key: "secret", label: "Secret", placeholder: "...", type: "password", required: true },
    ],
  },
  {
    name: "WeCom Callback", color: 0x06a56f, tier: 3,
    description: "WeCom callback mode — webhook-based",
    credentialFields: [
      { key: "token", label: "Token", placeholder: "...", type: "password", required: true },
      { key: "encoding_aes_key", label: "Encoding AES Key", placeholder: "...", type: "password", required: true },
      { key: "corp_id", label: "Corp ID", placeholder: "...", type: "text", required: true },
    ],
  },
  {
    name: "Weixin", color: 0x07c160, tier: 3,
    description: "WeChat (personal) via iLink Bot API",
    credentialFields: [
      { key: "token", label: "iLink Bot Token", placeholder: "...", type: "password", required: true },
    ],
  },
  {
    name: "QQ", color: 0x12b7f5, tier: 3,
    description: "QQ Bot (Tencent) — official API v2",
    credentialFields: [
      { key: "app_id", label: "App ID", placeholder: "...", type: "text", required: true },
      { key: "token", label: "Token", placeholder: "...", type: "password", required: true },
    ],
  },
  {
    name: "Yuanbao", color: 0x4e6ef2, tier: 3,
    description: "Yuanbao (Tencent) — DM and group chat",
    credentialFields: [],
  },
  {
    name: "Home Assistant", color: 0x18bcf2, tier: 3,
    description: "Home Assistant conversation integration",
    credentialFields: [
      { key: "ha_url", label: "Home Assistant URL", placeholder: "http://homeassistant.local:8123", type: "text", required: true },
      { key: "token", label: "Long-Lived Access Token", placeholder: "...", type: "password", required: true },
    ],
  },
  {
    name: "Teams Meetings", color: 0x5b5fc7, tier: 3,
    description: "Microsoft Teams Meetings bot",
    credentialFields: [
      { key: "app_id", label: "App (Bot) ID", placeholder: "00000000-0000-...", type: "text", required: true },
      { key: "tenant_id", label: "Tenant ID", placeholder: "00000000-0000-...", type: "text", required: true },
      { key: "bot_password", label: "Bot Password / Client Secret", placeholder: "...", type: "password", required: true },
    ],
  },
  {
    name: "MS Graph Webhook", color: 0x5b5fc7, tier: 3,
    description: "Microsoft Graph change-notification webhook (Teams, Outlook)",
    credentialFields: [
      { key: "client_id", label: "Client (App) ID", placeholder: "00000000-0000-...", type: "text", required: true },
      { key: "client_secret", label: "Client Secret", placeholder: "...", type: "password", required: true },
      { key: "tenant_id", label: "Tenant ID", placeholder: "00000000-0000-...", type: "text", required: true },
    ],
  },
  {
    name: "Raft", color: 0x6b7280, tier: 3,
    description: "Raft messaging platform",
    credentialFields: [],
  },
];

/** Look up a platform catalog entry by name (case-insensitive). */
export function getPlatformEntry(name: string): PlatformCatalogEntry | undefined {
  const lower = name.toLowerCase();
  return PLATFORM_CATALOG.find((p) => p.name.toLowerCase() === lower);
}

/** Per-platform credential field schemas (derived from the catalog). */
export const PLATFORM_CREDENTIAL_FIELDS: Record<string, PlatformCredentialField[]> = Object.fromEntries(
  PLATFORM_CATALOG.map((p) => [p.name, p.credentialFields]),
);

/** External event from a messaging platform. */
export interface PlatformEvent {
  platform: string;
  direction: "inbound" | "outbound";
  sender: string;
  text: string;
  timestamp: number;
  /** Chat/channel ID from the platform (used for persisting home channel) */
  chatId?: string;
}

/** Connection state for a messaging platform (mirrors Hermes Agent gateway status). */
export interface PlatformConnectionState {
  platform: string;
  connected: boolean;
  /** Human-readable status (e.g. "Bot token configured", "Not configured") */
  status: string;
  /** Whether the Hermes Agent gateway itself is running */
  gatewayRunning: boolean;
}
