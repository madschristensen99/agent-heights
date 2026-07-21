import type { AgentInfo, AgentSchedule, GameSettings, LogEntry, PlayerInfo, PendingTask, TaskCard, WorldState, AgentStatus, AgentRole, OfficeTheme } from "../shared/types.js";
import type { SaveState } from "./persistence.js";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

/**
 * Relational Persistence implementation.
 *
 * Instead of upserting a megabyte JSONB blob on every change, this class
 * reads/writes individual rows across the relational tables:
 *   - sprite_heights_player_info
 *   - sprite_heights_game_settings
 *   - sprite_heights_rooms + sprite_heights_world_state
 *   - sprite_heights_agents
 *   - sprite_heights_agent_logs
 *   - sprite_heights_task_cards
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
  private pendingSchedules: boolean = false;
  private pendingSettings: boolean = false;
  private pendingPlayer: boolean = false;
  private pendingWorld: boolean = false;
  private pendingPendingTasks: boolean = false;

  constructor(userId: string) {
    this.userId = userId;
    this.state = {
      player: null,
      agents: [],
      logs: {},
      board: [],
      schedules: [],
      world: { seed: 0, firedAgents: [] },
    };
  }

  async load(): Promise<SaveState | null> {
    if (!isSupabaseConfigured) return null;
    try {
      // Get or create room for this user
      let { data: room } = await supabaseAdmin
        .from("sprite_heights_rooms")
        .select("id, seed, theme")
        .eq("owner_id", this.userId)
        .maybeSingle();

      if (!room) {
        const { data: newRoom, error: roomErr } = await supabaseAdmin
          .from("sprite_heights_rooms")
          .insert({ owner_id: this.userId, name: "My Office", seed: 0, theme: "classic" })
          .select("id, seed, theme")
          .single();
        if (roomErr || !newRoom) return null;
        room = newRoom;
      }
      this.roomId = room.id;

      // Load player info
      const { data: playerRow } = await supabaseAdmin
        .from("sprite_heights_player_info")
        .select("name, workspace, appearance")
        .eq("user_id", this.userId)
        .maybeSingle();

      const player: PlayerInfo | null = playerRow
        ? { name: playerRow.name, workspace: playerRow.workspace, appearance: playerRow.appearance ?? null }
        : null;

      // Load settings
      const { data: settingsRow } = await supabaseAdmin
        .from("sprite_heights_game_settings")
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
        .from("sprite_heights_agents")
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
          .from("sprite_heights_agent_logs")
          .select("agent_id, ts, kind, text")
          .in("agent_id", agentIds)
          .eq("archived", false)
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
        .from("sprite_heights_task_cards")
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

      // Load schedules
      const { data: scheduleRows } = await supabaseAdmin
        .from("sprite_heights_schedules")
        .select("*")
        .eq("owner_id", this.userId);

      const schedules: AgentSchedule[] = (scheduleRows ?? []).map((r: any) => ({
        id: r.id,
        agentId: r.agent_id,
        name: r.name,
        task: r.task,
        cronExpression: r.cron_expression,
        enabled: r.enabled,
        lastRunAt: r.last_run_at ?? null,
        nextRunAt: r.next_run_at,
        runCount: r.run_count,
        handoffTo: r.handoff_to ?? null,
        createdAt: r.created_at,
      }));

      // Load world state
      const { data: worldRow } = await supabaseAdmin
        .from("sprite_heights_world_state")
        .select("seed, fired_agents, chunk_overrides, pending_tasks, vacationed_agents")
        .eq("room_id", this.roomId)
        .maybeSingle();

      const world: WorldState = worldRow
        ? { seed: worldRow.seed, firedAgents: worldRow.fired_agents ?? [], vacationedAgents: (worldRow as any).vacationed_agents ?? [], chunkOverrides: worldRow.chunk_overrides ?? {} }
        : { seed: room.seed, firedAgents: [] };

      // Load pending tasks (stored as JSONB on world_state)
      const pendingTasksMap: Record<string, PendingTask[]> = {};
      if ((worldRow as any)?.pending_tasks && typeof (worldRow as any).pending_tasks === "object") {
        for (const [agentId, tasks] of Object.entries((worldRow as any).pending_tasks as Record<string, unknown>)) {
          if (Array.isArray(tasks)) {
            pendingTasksMap[agentId] = tasks as PendingTask[];
          }
        }
      }

      this.state = { player, agents, logs, settings, board, schedules, world, pendingTasks: pendingTasksMap };
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

  setSchedules(schedules: AgentSchedule[]): void {
    this.state.schedules = schedules;
    this.pendingSchedules = true;
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

  setPendingTasks(tasks: Record<string, PendingTask[]>): void {
    this.state.pendingTasks = tasks;
    this.pendingPendingTasks = true;
    this.schedule();
  }

  getPendingTasks(): Record<string, PendingTask[]> {
    return this.state.pendingTasks ?? {};
  }

  clearPendingTasks(): void {
    this.state.pendingTasks = {};
    this.pendingPendingTasks = true;
    this.schedule();
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
          .from("sprite_heights_player_info")
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
          .from("sprite_heights_game_settings")
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
          .from("sprite_heights_world_state")
          .upsert({
            room_id: this.roomId,
            owner_id: this.userId,
            seed: this.state.world.seed,
            fired_agents: this.state.world.firedAgents,
            vacationed_agents: this.state.world.vacationedAgents ?? [],
            chunk_overrides: this.state.world.chunkOverrides ?? {},
            pending_tasks: this.state.pendingTasks ?? {},
          });
      } catch (err) {
        console.error("[db-rel] setWorld failed:", err);
      }
    }

    if (this.pendingPendingTasks) {
      this.pendingPendingTasks = false;
      try {
        await supabaseAdmin
          .from("sprite_heights_world_state")
          .update({ pending_tasks: this.state.pendingTasks ?? {} })
          .eq("room_id", this.roomId);
      } catch (err) {
        console.error("[db-rel] setPendingTasks failed:", err);
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

    if (this.pendingSchedules) {
      this.pendingSchedules = false;
      await this.flushSchedules();
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
        await supabaseAdmin.from("sprite_heights_agents").upsert(rows);
      } catch (err) {
        console.error("[db-rel] upsert agents failed:", err);
      }
    }

    // Delete agents that no longer exist
    const currentIds = agents.map((a) => a.id);
    if (currentIds.length > 0) {
      try {
        await supabaseAdmin
          .from("sprite_heights_agents")
          .delete()
          .eq("owner_id", this.userId)
          .not("id", "in", `(${currentIds.join(",")})`);
      } catch (err) {
        console.error("[db-rel] delete stale agents failed:", err);
      }
    } else {
      try {
        await supabaseAdmin.from("sprite_heights_agents").delete().eq("owner_id", this.userId);
      } catch (err) {
        console.error("[db-rel] delete all agents failed:", err);
      }
    }

    // Sync logs — only append new entries
    // We compare against what we loaded to avoid re-inserting
    for (const agent of agents) {
      const agentLogs = logs[agent.id] ?? [];
      if (agentLogs.length === 0) continue;

      // Get current count for this agent (only non-archived)
      const { count } = await supabaseAdmin
        .from("sprite_heights_agent_logs")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agent.id)
        .eq("archived", false);

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
          archived: false,
        }));
        try {
          await supabaseAdmin.from("sprite_heights_agent_logs").insert(logRows);
        } catch (err) {
          console.error(`[db-rel] insert logs for ${agent.id} failed:`, err);
        }
      }

      // Trim to LOG_CAP (only non-archived)
      if (existingCount + newLogs.length > LOG_CAP) {
        try {
          const { data: oldLogs } = await supabaseAdmin
            .from("sprite_heights_agent_logs")
            .select("id")
            .eq("agent_id", agent.id)
            .eq("archived", false)
            .order("ts", { ascending: true })
            .limit(existingCount + newLogs.length - LOG_CAP);
          if (oldLogs && oldLogs.length > 0) {
            const idsToDelete = oldLogs.map((r: any) => r.id);
            await supabaseAdmin
              .from("sprite_heights_agent_logs")
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
        await supabaseAdmin.from("sprite_heights_task_cards").upsert(rows);
      } catch (err) {
        console.error("[db-rel] upsert board failed:", err);
      }
    }

    // Delete cards that no longer exist
    const currentIds = board.map((c) => c.id);
    if (currentIds.length > 0) {
      try {
        await supabaseAdmin
          .from("sprite_heights_task_cards")
          .delete()
          .eq("owner_id", this.userId)
          .not("id", "in", `(${currentIds.join(",")})`);
      } catch (err) {
        console.error("[db-rel] delete stale cards failed:", err);
      }
    } else {
      try {
        await supabaseAdmin.from("sprite_heights_task_cards").delete().eq("owner_id", this.userId);
      } catch (err) {
        console.error("[db-rel] delete all cards failed:", err);
      }
    }
  }

  private async flushSchedules(): Promise<void> {
    if (!this.roomId) return;
    const schedules = this.state.schedules ?? [];

    const rows = schedules.map((s) => ({
      id: s.id,
      agent_id: s.agentId,
      owner_id: this.userId,
      room_id: this.roomId,
      name: s.name,
      task: s.task,
      cron_expression: s.cronExpression,
      enabled: s.enabled,
      last_run_at: s.lastRunAt,
      next_run_at: s.nextRunAt,
      run_count: s.runCount,
      handoff_to: s.handoffTo,
      created_at: s.createdAt,
    }));

    if (rows.length > 0) {
      try {
        await supabaseAdmin.from("sprite_heights_schedules").upsert(rows);
      } catch (err) {
        console.error("[db-rel] upsert schedules failed:", err);
      }
    }

    // Delete schedules that no longer exist
    const currentIds = schedules.map((s) => s.id);
    if (currentIds.length > 0) {
      try {
        await supabaseAdmin
          .from("sprite_heights_schedules")
          .delete()
          .eq("owner_id", this.userId)
          .not("id", "in", `(${currentIds.join(",")})`);
      } catch (err) {
        console.error("[db-rel] delete stale schedules failed:", err);
      }
    } else {
      try {
        await supabaseAdmin.from("sprite_heights_schedules").delete().eq("owner_id", this.userId);
      } catch (err) {
        console.error("[db-rel] delete all schedules failed:", err);
      }
    }
  }

  async saveMessages(agentId: string, messages: unknown[]): Promise<void> {
    if (!isSupabaseConfigured || !this.roomId) return;
    try {
      // Delete existing non-archived messages for this agent and re-insert
      // Archived messages are preserved as an audit trail
      await supabaseAdmin
        .from("sprite_heights_conversation_messages")
        .delete()
        .eq("agent_id", agentId)
        .eq("archived", false);

      if (messages.length === 0) return;

      const rows = messages.map((msg: any, i: number) => ({
        agent_id: agentId,
        owner_id: this.userId,
        seq: i,
        role: msg.role ?? "unknown",
        content: msg.content ?? msg,
        archived: false,
      }));

      await supabaseAdmin
        .from("sprite_heights_conversation_messages")
        .insert(rows);
    } catch (err) {
      console.error(`[db-rel] saveMessages for ${agentId} failed:`, err);
    }
  }

  async loadMessages(agentId: string): Promise<unknown[]> {
    if (!isSupabaseConfigured || !this.roomId) return [];
    try {
      const { data, error } = await supabaseAdmin
        .from("sprite_heights_conversation_messages")
        .select("role, content")
        .eq("agent_id", agentId)
        .eq("archived", false)
        .order("seq", { ascending: true });

      if (error || !data) return [];

      return data.map((row: any) => ({
        role: row.role,
        content: row.content,
      }));
    } catch (err) {
      console.error(`[db-rel] loadMessages for ${agentId} failed:`, err);
      return [];
    }
  }

  async clearMessages(agentId: string): Promise<void> {
    if (!isSupabaseConfigured || !this.roomId) return;
    try {
      // Soft-delete: archive messages instead of hard-deleting
      await supabaseAdmin
        .from("sprite_heights_conversation_messages")
        .update({ archived: true })
        .eq("agent_id", agentId)
        .eq("archived", false);
    } catch (err) {
      console.error(`[db-rel] clearMessages for ${agentId} failed:`, err);
    }
  }

  async clearLogs(agentId: string): Promise<void> {
    if (!isSupabaseConfigured || !this.roomId) return;
    if (this.state.logs) this.state.logs[agentId] = [];
    try {
      // Soft-delete: archive logs instead of hard-deleting
      await supabaseAdmin
        .from("sprite_heights_agent_logs")
        .update({ archived: true })
        .eq("agent_id", agentId)
        .eq("archived", false);
    } catch (err) {
      console.error(`[db-rel] clearLogs for ${agentId} failed:`, err);
    }
  }
}
