// Types shared between the game client and the agent server.

export type Provider = "claude" | "codex";

export type AgentStatus = "idle" | "thinking" | "working" | "done" | "error";

/** Workers do tasks; a manager splits a goal into subtasks for the team. */
export type AgentRole = "worker" | "manager";

/** Number of pre-generated character sprite-sheet variants (char-0..N-1). */
export const CHAR_VARIANTS = 8;

/** Accent colors paired with sprite variants by index. */
export const ACCENTS = ["#c44a4a", "#3a7cb5", "#3d9152", "#b0741f", "#5b7d9e", "#2a8f8b", "#b54a93", "#6b7280"];

export interface AgentInfo {
  id: string;
  name: string;
  title: string;
  provider: Provider;
  model: string;
  status: AgentStatus;
  task: string | null;
  deskIndex: number;
  /** Which char-N.png sprite sheet this agent uses. */
  sprite: number;
  /** Accent color for UI panels. */
  accent: string;
  /** Optional custom system prompt given at hire time. */
  systemPrompt: string;
  role: AgentRole;
  /**
   * Provider conversation id (Claude session / Codex thread). Every task
   * resumes it, so the agent remembers all previous orders and its own work.
   */
  sessionId: string | null;
  tasksDone: number;
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

export type LogKind = "status" | "text" | "tool" | "result" | "error" | "boss";

export interface LogEntry {
  ts: number;
  kind: LogKind;
  text: string;
}

export interface PlayerInfo {
  name: string;
  workspace: string;
}

/** Visual theme for the office map + tileset. */
export type OfficeTheme = "classic" | "lumon";

export const OFFICE_THEMES: Array<{ id: OfficeTheme; label: string }> = [
  { id: "classic", label: "Classic — wood floors, cozy office" },
  { id: "lumon", label: "Lumon — green carpet, white walls, shared desk block" },
];

export interface GameSettings {
  claude: {
    /** bypassPermissions runs shell commands unattended; acceptEdits forbids unapproved Bash. */
    permissionMode: "bypassPermissions" | "acceptEdits";
    maxTurns: number;
  };
  codex: {
    sandboxMode: "read-only" | "workspace-write" | "danger-full-access";
  };
  game: {
    idleWander: boolean;
    theme: OfficeTheme;
  };
}

export const DEFAULT_SETTINGS: GameSettings = {
  claude: { permissionMode: "bypassPermissions", maxTurns: 60 },
  codex: { sandboxMode: "workspace-write" },
  game: { idleWander: true, theme: "classic" },
};

export type ClientMsg =
  | { type: "setup"; player: PlayerInfo }
  | { type: "set_settings"; settings: GameSettings }
  | { type: "hire"; name: string; provider: Provider; model: string; systemPrompt?: string; role?: AgentRole; sprite?: number }
  | { type: "assign"; agentId: string; task: string; handoffTo?: string }
  | { type: "assign_all"; task: string }
  | { type: "chat"; agentId: string; text: string }
  | { type: "stop"; agentId: string }
  | { type: "fire"; agentId: string }
  | { type: "clear"; agentId: string }
  | { type: "clear_all" }
  | { type: "create_card"; title: string; description?: string }
  | { type: "assign_card"; cardId: string; agentId: string }
  | { type: "move_card"; cardId: string; status: CardStatus }
  | { type: "delete_card"; cardId: string }
  | { type: "recruit"; firedAgentId: string };

export type ServerMsg =
  | {
      type: "snapshot";
      agents: AgentInfo[];
      logs: Record<string, LogEntry[]>;
      player: PlayerInfo | null;
      settings: GameSettings;
      board: TaskCard[];
      world: WorldState | null;
    }
  | { type: "player"; player: PlayerInfo }
  | { type: "settings"; settings: GameSettings }
  | { type: "agent"; agent: AgentInfo }
  | { type: "agent_removed"; agentId: string }
  | { type: "chat_cleared"; agentId: string }
  | { type: "huddle"; agentIds: string[] }
  | { type: "log"; agentId: string; entry: LogEntry }
  | { type: "toast"; text: string }
  | { type: "card"; card: TaskCard }
  | { type: "card_removed"; cardId: string }
  | { type: "world"; world: WorldState }
  | { type: "fired_agent"; agent: FiredAgent }
  | { type: "fired_agent_removed"; agentId: string };

export const CLAUDE_MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (balanced)" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (fast)" },
  { id: "claude-opus-4-8", label: "Opus 4.8 (deep)" },
] as const;

export const CODEX_MODELS = [
  { id: "gpt-5.1-codex", label: "GPT-5.1 Codex" },
  { id: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini" },
] as const;

export const SERVER_PORT = 3001;
