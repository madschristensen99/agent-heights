import type { AgentInfo, GameSettings, LogEntry, PlayerInfo, TaskCard, WorldState } from "../shared/types.js";
import type { SaveState } from "./persistence.js";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

/**
 * Drop-in replacement for SaveFile that persists to Supabase instead of a
 * local JSON file. The entire SaveState is stored as a JSONB blob per user.
 * Writes are debounced (400ms) just like the original SaveFile.
 */
export class DbPersistence {
  private state: SaveState = {
    player: null,
    agents: [],
    logs: {},
    board: [],
    world: { seed: 0, firedAgents: [] },
  };
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private userId: string) {}

  async load(): Promise<SaveState | null> {
    if (!isSupabaseConfigured) return null;
    try {
      const { data, error } = await supabaseAdmin
        .from("agent_hq_saves")
        .select("data")
        .eq("user_id", this.userId)
        .maybeSingle();

      if (error || !data) return null;
      const parsed = data.data as SaveState;
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
      return null;
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
      void this.flush();
    }, 400);
  }

  flushNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.flush();
  }

  private async flush(): Promise<void> {
    if (!isSupabaseConfigured) return;
    try {
      const { error } = await supabaseAdmin
        .from("agent_hq_saves")
        .upsert({
          user_id: this.userId,
          data: this.state,
          updated_at: new Date().toISOString(),
        });
      if (error) console.error("[db] failed to flush save:", error.message);
    } catch (err) {
      console.error("[db] failed to flush save:", err);
    }
  }
}
