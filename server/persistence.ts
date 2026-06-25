import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentInfo, GameSettings, LogEntry, PlayerInfo, TaskCard, WorldState } from "../shared/types.js";

export interface SaveState {
  player: PlayerInfo | null;
  agents: AgentInfo[];
  logs: Record<string, LogEntry[]>;
  settings?: GameSettings;
  board?: TaskCard[];
  world?: WorldState;
}

export interface Persistence {
  setPlayer(player: PlayerInfo): void;
  setAgents(agents: AgentInfo[], logs: Record<string, LogEntry[]>): void;
  setSettings(settings: GameSettings): void;
  setBoard(board: TaskCard[]): void;
  setWorld(world: WorldState): void;
  getWorld(): WorldState;
}

/**
 * The single save file for the whole game: player, roster, and every agent
 * message live in ag/save.json. The server reloads it on boot, so the office
 * comes back exactly as you left it.
 */
export class SaveFile implements Persistence {
  readonly path: string;
  private state: SaveState = { player: null, agents: [], logs: {}, board: [], world: { seed: 0, firedAgents: [] } };
  private timer: ReturnType<typeof setTimeout> | null = null;

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
        world: parsed.world ?? { seed: 0, firedAgents: [] },
      };
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

  private flush(): void {
    try {
      writeFileSync(this.path, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error("[save] failed to write save file:", err);
    }
  }
}
