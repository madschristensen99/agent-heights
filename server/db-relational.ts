import type { AgentInfo, GameSettings, LogEntry, PlayerInfo, TaskCard, WorldState, AgentStatus, AgentRole, OfficeTheme } from "../shared/types.js";
import type { SaveState } from "./persistence.js";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

/**
 * Relational Persistence implementation.
 *
 * Instead of upserting a megabyte JSONB blob on every change, this class
 * reads/writes individual rows across the relational tables:
 *   - agent_hq_player_info
 *   - agent_hq_game_settings
 *   - agent_hq_rooms + agent_hq_world_state
 *   - agent_hq_agents
 *   - agent_hq_agent_logs
 *   - agent_hq_task_cards
 *
 * Implements the same Persistence interface so AgentManager doesn't change.
 * Writes are still debounced (400ms) for batch operations like setAgents,
 * but individual log appends are written immediately.
 */

const LOG_CAP = 500;

export class RelationalPersistence {
  private userId: string;
  private roomId: string | null = null;
  private state: SaveState;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushInFlight: Promise<void> | null = null;
  private pendingAgents: boolean = false;
  private pendingBoard: boolean = false;
  private pendingSettings: boolean = false;
  private pendingPlayer: boolean = false;
  private pendingWorld: boolean = false;

  constructor(userId: string) {
    this.userId = userId;
    this.state = {
      player: null,
      agents: [],
      logs: {},
      board: [],
      world: { seed: 0, firedAgents: [] },
    };
  }

  async load(): Promise<SaveState | null> {
    if (!isSupabaseConfigured) return null;
    try {
      // Get or create room for this user
      let { data: room } = await supabaseAdmin
        .from("agent_hq_rooms")
        .select("id, seed, theme")
        .eq("owner_id", this.userId)
        .maybeSingle();

      if (!room) {
        const { data: newRoom, error: roomErr } = await supabaseAdmin
          .from("agent_hq_rooms")
          .insert({ owner_id: this.userId, name: "My Office", seed: 0, theme: "classic" })
          .select("id, seed, theme")
          .single();
        if (roomErr || !newRoom) return null;
        room = newRoom;
      }
      this.roomId = room.id;

      // Load player info
      const { data: playerRow } = await supabaseAdmin
        .from("agent_hq_player_info")
        .select("name, workspace, appearance")
        .eq("user_id", this.userId)
        .maybeSingle();

      const player: PlayerInfo | null = playerRow
        ? { name: playerRow.name, workspace: playerRow.workspace, appearance: playerRow.appearance ?? null }
        : null;

      // Load settings
      const { data: settingsRow } = await supabaseAdmin
        .from("agent_hq_game_settings")
        .select("cline_max_iterations, cline_auto_approve, game_idle_wander, game_theme, railway_enabled")
        .eq("user_id", this.userId)
        .maybeSingle();

      const settings: GameSettings | undefined = settingsRow
        ? {
            cline: {
              maxIterations: settingsRow.cline_max_iterations,
              autoApproveCommands: settingsRow.cline_auto_approve,
            },
            game: {
              idleWander: settingsRow.game_idle_wander,
              theme: settingsRow.game_theme as OfficeTheme,
            },
            railway: { enabled: settingsRow.railway_enabled },
          }
        : undefined;

      // Load agents
      const { data: agentRows } = await supabaseAdmin
        .from("agent_hq_agents")
        .select("*")
        .eq("owner_id", this.userId);

      const agents: AgentInfo[] = (agentRows ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        title: r.title,
        provider: r.provider,
        model: r.model,
        status: r.status as AgentStatus,
        task: r.task,
        deskIndex: r.desk_index,
        sprite: r.sprite,
        appearance: r.appearance ?? null,
        accent: r.accent,
        systemPrompt: r.system_prompt,
        role: r.role as AgentRole,
        sessionId: r.session_id,
        tasksDone: r.tasks_done,
        mcpServers: r.mcp_servers ?? undefined,
      }));

      // Load logs (capped at LOG_CAP per agent)
      const logs: Record<string, LogEntry[]> = {};
      if (agents.length > 0) {
        const agentIds = agents.map((a) => a.id);
        const { data: logRows } = await supabaseAdmin
          .from("agent_hq_agent_logs")
          .select("agent_id, ts, kind, text")
          .in("agent_id", agentIds)
          .order("ts", { ascending: true })
          .limit(LOG_CAP * agentIds.length);

        for (const row of logRows ?? []) {
          if (!logs[row.agent_id]) logs[row.agent_id] = [];
          if (logs[row.agent_id].length < LOG_CAP) {
            logs[row.agent_id].push({ ts: row.ts, kind: row.kind, text: row.text });
          }
        }
      }

      // Load task cards
      const { data: cardRows } = await supabaseAdmin
        .from("agent_hq_task_cards")
        .select("*")
        .eq("owner_id", this.userId);

      const board: TaskCard[] = (cardRows ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        status: r.status as any,
        assignedAgentId: r.assigned_agent_id ?? null,
        createdAt: r.created_at,
      }));

      // Load world state
      const { data: worldRow } = await supabaseAdmin
        .from("agent_hq_world_state")
        .select("seed, fired_agents, chunk_overrides")
        .eq("room_id", this.roomId)
        .maybeSingle();

      const world: WorldState = worldRow
        ? { seed: worldRow.seed, firedAgents: worldRow.fired_agents ?? [], chunkOverrides: worldRow.chunk_overrides ?? {} }
        : { seed: room.seed, firedAgents: [] };

      this.state = { player, agents, logs, settings, board, world };
      return this.state;
    } catch (err) {
      console.error("[db-rel] load failed:", err);
      return null;
    }
  }

  setPlayer(player: PlayerInfo): void {
    this.state.player = player;
    this.pendingPlayer = true;
    this.schedule();
  }

  setAgents(agents: AgentInfo[], logs: Record<string, LogEntry[]>): void {
    this.state.agents = agents;
    this.state.logs = logs;
    this.pendingAgents = true;
    this.schedule();
  }

  setSettings(settings: GameSettings): void {
    this.state.settings = settings;
    this.pendingSettings = true;
    this.schedule();
  }

  setBoard(board: TaskCard[]): void {
    this.state.board = board;
    this.pendingBoard = true;
    this.schedule();
  }

  setWorld(world: WorldState): void {
    this.state.world = world;
    this.pendingWorld = true;
    this.schedule();
  }

  getWorld(): WorldState {
    return this.state.world ?? { seed: 0, firedAgents: [] };
  }

  flushNow(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    // If a debounced flush is already running, await it first, then run
    // our own flush to ensure the latest state is written.
    if (this.flushInFlight) {
      const prev = this.flushInFlight;
      this.flushInFlight = (async () => {
        await prev.catch(() => {});
        await this.flush();
      })();
      return this.flushInFlight;
    }
    this.flushInFlight = this.flush();
    return this.flushInFlight;
  }

  private schedule(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushInFlight = this.flush();
      void this.flushInFlight.then(() => {
        this.flushInFlight = null;
      }).catch(() => {
        this.flushInFlight = null;
      });
    }, 400);
  }

  private async flush(): Promise<void> {
    if (!isSupabaseConfigured || !this.roomId) return;

    if (this.pendingPlayer && this.state.player) {
      this.pendingPlayer = false;
      try {
        await supabaseAdmin
          .from("agent_hq_player_info")
          .upsert({
            user_id: this.userId,
            name: this.state.player.name,
            workspace: this.state.player.workspace,
            appearance: this.state.player.appearance ?? null,
          });
      } catch (err) {
        console.error("[db-rel] setPlayer failed:", err);
      }
    }

    if (this.pendingSettings && this.state.settings) {
      this.pendingSettings = false;
      try {
        await supabaseAdmin
          .from("agent_hq_game_settings")
          .upsert({
            user_id: this.userId,
            cline_max_iterations: this.state.settings.cline.maxIterations,
            cline_auto_approve: this.state.settings.cline.autoApproveCommands,
            game_idle_wander: this.state.settings.game.idleWander,
            game_theme: this.state.settings.game.theme,
            railway_enabled: this.state.settings.railway.enabled,
          });
      } catch (err) {
        console.error("[db-rel] setSettings failed:", err);
      }
    }

    if (this.pendingWorld && this.state.world) {
      this.pendingWorld = false;
      try {
        await supabaseAdmin
          .from("agent_hq_world_state")
          .upsert({
            room_id: this.roomId,
            owner_id: this.userId,
            seed: this.state.world.seed,
            fired_agents: this.state.world.firedAgents,
            chunk_overrides: this.state.world.chunkOverrides ?? {},
          });
      } catch (err) {
        console.error("[db-rel] setWorld failed:", err);
      }
    }

    if (this.pendingAgents) {
      this.pendingAgents = false;
      await this.flushAgents();
    }

    if (this.pendingBoard) {
      this.pendingBoard = false;
      await this.flushBoard();
    }
  }

  private async flushAgents(): Promise<void> {
    if (!this.roomId) return;
    const agents = this.state.agents;
    const logs = this.state.logs;

    // Upsert all agents
    const rows = agents.map((a) => ({
      id: a.id,
      room_id: this.roomId,
      owner_id: this.userId,
      name: a.name,
      title: a.title,
      provider: a.provider,
      model: a.model,
      status: a.status,
      task: a.task,
      desk_index: a.deskIndex,
      sprite: a.sprite,
      appearance: a.appearance,
      accent: a.accent,
      system_prompt: a.systemPrompt,
      role: a.role,
      session_id: a.sessionId,
      tasks_done: a.tasksDone,
      mcp_servers: a.mcpServers ?? null,
    }));

    if (rows.length > 0) {
      try {
        await supabaseAdmin.from("agent_hq_agents").upsert(rows);
      } catch (err) {
        console.error("[db-rel] upsert agents failed:", err);
      }
    }

    // Delete agents that no longer exist
    const currentIds = agents.map((a) => a.id);
    if (currentIds.length > 0) {
      try {
        await supabaseAdmin
          .from("agent_hq_agents")
          .delete()
          .eq("owner_id", this.userId)
          .not("id", "in", `(${currentIds.join(",")})`);
      } catch (err) {
        console.error("[db-rel] delete stale agents failed:", err);
      }
    } else {
      try {
        await supabaseAdmin.from("agent_hq_agents").delete().eq("owner_id", this.userId);
      } catch (err) {
        console.error("[db-rel] delete all agents failed:", err);
      }
    }

    // Sync logs — only append new entries
    // We compare against what we loaded to avoid re-inserting
    for (const agent of agents) {
      const agentLogs = logs[agent.id] ?? [];
      if (agentLogs.length === 0) continue;

      // Get current count for this agent
      const { count } = await supabaseAdmin
        .from("agent_hq_agent_logs")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agent.id);

      const existingCount = count ?? 0;
      if (existingCount === undefined) continue;
      const newLogs = agentLogs.slice(existingCount);

      if (newLogs.length > 0) {
        const logRows = newLogs.map((l) => ({
          agent_id: agent.id,
          owner_id: this.userId,
          ts: l.ts,
          kind: l.kind,
          text: l.text,
        }));
        try {
          await supabaseAdmin.from("agent_hq_agent_logs").insert(logRows);
        } catch (err) {
          console.error(`[db-rel] insert logs for ${agent.id} failed:`, err);
        }
      }

      // Trim to LOG_CAP
      if (existingCount + newLogs.length > LOG_CAP) {
        try {
          const { data: oldLogs } = await supabaseAdmin
            .from("agent_hq_agent_logs")
            .select("id")
            .eq("agent_id", agent.id)
            .order("ts", { ascending: true })
            .limit(existingCount + newLogs.length - LOG_CAP);
          if (oldLogs && oldLogs.length > 0) {
            const idsToDelete = oldLogs.map((r: any) => r.id);
            await supabaseAdmin
              .from("agent_hq_agent_logs")
              .delete()
              .in("id", idsToDelete);
          }
        } catch (err) {
          console.error(`[db-rel] trim logs for ${agent.id} failed:`, err);
        }
      }
    }
  }

  private async flushBoard(): Promise<void> {
    if (!this.roomId) return;
    const board = this.state.board ?? [];

    const rows = board.map((c) => ({
      id: c.id,
      room_id: this.roomId,
      owner_id: this.userId,
      title: c.title,
      description: c.description,
      status: c.status,
      assigned_agent_id: c.assignedAgentId ?? null,
      created_at: c.createdAt,
    }));

    if (rows.length > 0) {
      try {
        await supabaseAdmin.from("agent_hq_task_cards").upsert(rows);
      } catch (err) {
        console.error("[db-rel] upsert board failed:", err);
      }
    }

    // Delete cards that no longer exist
    const currentIds = board.map((c) => c.id);
    if (currentIds.length > 0) {
      try {
        await supabaseAdmin
          .from("agent_hq_task_cards")
          .delete()
          .eq("owner_id", this.userId)
          .not("id", "in", `(${currentIds.join(",")})`);
      } catch (err) {
        console.error("[db-rel] delete stale cards failed:", err);
      }
    } else {
      try {
        await supabaseAdmin.from("agent_hq_task_cards").delete().eq("owner_id", this.userId);
      } catch (err) {
        console.error("[db-rel] delete all cards failed:", err);
      }
    }
  }
}
