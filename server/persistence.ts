import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentInfo, AgentSchedule, GameSettings, LogEntry, PlayerInfo, PendingTask, TaskCard, WorldState, PlatformEvent } from "../shared/types.js";

export interface SaveState {
  player: PlayerInfo | null;
  agents: AgentInfo[];
  logs: Record<string, LogEntry[]>;
  settings?: GameSettings;
  board?: TaskCard[];
  schedules?: AgentSchedule[];
  world?: WorldState;
  /** Conversation messages per agent (used by JSONB-based persistence backends). */
  messages?: Record<string, unknown[]>;
  /** Tasks saved across server restarts so agents can resume work. */
  pendingTasks?: Record<string, PendingTask[]>;
  /** Persisted platform mail events (inbound/outbound messages). */
  mailEvents?: PlatformEvent[];
  /** Per-user platform credentials (e.g. TELEGRAM_BOT_TOKEN) that survive redeploys. */
  platformCredentials?: Record<string, string>;
}

export interface Persistence {
  setPlayer(player: PlayerInfo): void;
  setAgents(agents: AgentInfo[], logs: Record<string, LogEntry[]>): void;
  setSettings(settings: GameSettings): void;
  setBoard(board: TaskCard[]): void;
  setSchedules(schedules: AgentSchedule[]): void;
  setWorld(world: WorldState): void;
  getWorld(): WorldState;
  setPendingTasks(tasks: Record<string, PendingTask[]>): void;
  getPendingTasks(): Record<string, PendingTask[]>;
  clearPendingTasks(): void;
  setPlatformCredentials(creds: Record<string, string>): void;
  getPlatformCredentials(): Record<string, string>;
  flushNow(): void | Promise<void>;
  saveMessages(agentId: string, messages: unknown[]): Promise<void>;
  loadMessages(agentId: string): Promise<unknown[]>;
  clearMessages(agentId: string): Promise<void>;
  clearLogs(agentId: string): Promise<void>;
  insertMailEvent(ev: PlatformEvent): Promise<void>;
  markMailHandled(platform: string): Promise<void>;
}

/**
 * The single save file for the whole game: player, roster, and every agent
 * message live in ag/save.json. The server reloads it on boot, so the office
 * comes back exactly as you left it.
 */
export class SaveFile implements Persistence {
  readonly path: string;
  private state: SaveState = { player: null, agents: [], logs: {}, board: [], schedules: [], world: { seed: 0, firedAgents: [] }, pendingTasks: {}, platformCredentials: {} };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private messages: Map<string, unknown[]> = new Map();
  private archivedMessages: Map<string, unknown[]> = new Map();

  constructor(rootDir: string) {
    const dir = join(rootDir, "ag");
    mkdirSync(dir, { recursive: true });
    this.path = join(dir, "save.json");
  }

  load(): SaveState | null {
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as SaveState;
      if (!parsed || !Array.isArray(parsed.agents)) return null;
      this.state = {
        player: parsed.player ?? null,
        agents: parsed.agents,
        logs: parsed.logs ?? {},
        settings: parsed.settings,
        board: parsed.board ?? [],
        schedules: parsed.schedules ?? [],
        world: parsed.world ?? { seed: 0, firedAgents: [] },
        pendingTasks: parsed.pendingTasks ?? {},
        platformCredentials: parsed.platformCredentials ?? {},
      };
      const savedMessages = (parsed as any).messages;
      if (savedMessages && typeof savedMessages === "object") {
        for (const [id, msgs] of Object.entries(savedMessages)) {
          if (Array.isArray(msgs)) this.messages.set(id, msgs);
        }
      }
      return this.state;
    } catch {
      return null; // first run, or an unreadable save — start fresh
    }
  }

  setPlayer(player: PlayerInfo): void {
    this.state.player = player;
    this.schedule();
  }

  setAgents(agents: AgentInfo[], logs: Record<string, LogEntry[]>): void {
    this.state.agents = agents;
    this.state.logs = logs;
    this.schedule();
  }

  setSettings(settings: GameSettings): void {
    this.state.settings = settings;
    this.schedule();
  }

  setBoard(board: TaskCard[]): void {
    this.state.board = board;
    this.schedule();
  }

  setSchedules(schedules: AgentSchedule[]): void {
    this.state.schedules = schedules;
    this.schedule();
  }

  setWorld(world: WorldState): void {
    this.state.world = world;
    this.schedule();
  }

  getWorld(): WorldState {
    return this.state.world ?? { seed: 0, firedAgents: [] };
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 400);
  }

  flushNow(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flush();
  }

  private flush(): void {
    try {
      const data = { ...this.state, messages: Object.fromEntries(this.messages) };
      writeFileSync(this.path, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error("[save] failed to write save file:", err);
    }
  }

  async saveMessages(agentId: string, messages: unknown[]): Promise<void> {
    this.messages.set(agentId, [...messages]);
    this.schedule();
  }

  async loadMessages(agentId: string): Promise<unknown[]> {
    return this.messages.get(agentId) ?? [];
  }

  async clearMessages(agentId: string): Promise<void> {
    // Soft-delete: move messages to archived map instead of deleting
    const existing = this.messages.get(agentId);
    if (existing) {
      const prev = this.archivedMessages.get(agentId) ?? [];
      this.archivedMessages.set(agentId, [...prev, ...existing]);
    }
    this.messages.delete(agentId);
    this.schedule();
  }

  async clearLogs(agentId: string): Promise<void> {
    // Soft-delete: logs are already in state.logs, just clear the active set
    // The previous logs remain in the save file's history via session logger
    if (this.state.logs) this.state.logs[agentId] = [];
    this.schedule();
  }

  setPendingTasks(tasks: Record<string, PendingTask[]>): void {
    this.state.pendingTasks = tasks;
    this.schedule();
  }

  getPendingTasks(): Record<string, PendingTask[]> {
    return this.state.pendingTasks ?? {};
  }

  clearPendingTasks(): void {
    this.state.pendingTasks = {};
    this.schedule();
  }

  setPlatformCredentials(creds: Record<string, string>): void {
    this.state.platformCredentials = creds;
    this.schedule();
  }

  getPlatformCredentials(): Record<string, string> {
    return this.state.platformCredentials ?? {};
  }

  async insertMailEvent(_ev: PlatformEvent): Promise<void> {
    // No-op: file-based persistence doesn't store mail events
  }

  async markMailHandled(_platform: string): Promise<void> {
    // No-op: file-based persistence doesn't store mail events
  }
}
