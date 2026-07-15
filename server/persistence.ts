import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentInfo, AgentSchedule, GameSettings, LogEntry, PlayerInfo, PendingTask, TaskCard, WorldState } from "../shared/types.js";

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
  flushNow(): void | Promise<void>;
  saveMessages(agentId: string, messages: unknown[]): Promise<void>;
  loadMessages(agentId: string): Promise<unknown[]>;
  clearMessages(agentId: string): Promise<void>;
}

/**
 * The single save file for the whole game: player, roster, and every agent
 * message live in ag/save.json. The server reloads it on boot, so the office
 * comes back exactly as you left it.
 */
export class SaveFile implements Persistence {
  readonly path: string;
  private state: SaveState = { player: null, agents: [], logs: {}, board: [], schedules: [], world: { seed: 0, firedAgents: [] }, pendingTasks: {} };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private messages: Map<string, unknown[]> = new Map();

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
    this.messages.delete(agentId);
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
}
