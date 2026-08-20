import type { AgentInfo, AgentSchedule, GameSettings, LogEntry, PlayerInfo, PendingTask, TaskCard, WorldState, AgentStatus, AgentRole, OfficeTheme, PlatformEvent } from "../shared/types.js";
import type { SaveState } from "./persistence.js";
import type { OfficeStateJSON } from "./office-state.js";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

/**
 * Relational Persistence implementation.
 *
 * Instead of upserting a megabyte JSONB blob on every change, this class
 * reads/writes individual rows across the relational tables:
 *   - agent_heights_player_info
 *   - agent_heights_game_settings
 *   - agent_heights_rooms + agent_heights_world_state
 *   - agent_heights_agents
 *   - agent_heights_agent_logs
 *   - agent_heights_task_cards
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
  private pendingPlatformCredentials: boolean = false;

  constructor(userId: string) {
    this.userId = userId;
    this.state = {
      player: null,
      agents: [],
      logs: {},
      board: [],
      schedules: [],
      world: { seed: 0, firedAgents: [] },
      pendingTasks: {},
    };
  }

  async load(): Promise<SaveState | null> {
    if (!isSupabaseConfigured) return null;
    try {
      const result = await Promise.race([
        this._loadInner(),
        new Promise<SaveState | null>((resolve) =>
          setTimeout(() => {
            console.warn(`[db-rel] load timed out for user ${this.userId} — returning defaults`);
            resolve(null);
          }, 10_000),
        ),
      ]);
      return result;
    } catch (err) {
      console.error("[db-rel] load failed:", err);
      return null;
    }
  }

  private async _loadInner(): Promise<SaveState | null> {
      // Get or create room for this user
      let { data: room } = await supabaseAdmin
        .from("agent_heights_rooms")
        .select("id, seed, theme")
        .eq("owner_id", this.userId)
        .maybeSingle();

      if (!room) {
        const { data: newRoom, error: roomErr } = await supabaseAdmin
          .from("agent_heights_rooms")
          .insert({ owner_id: this.userId, name: "My Office", seed: 0, theme: "classic" })
          .select("id, seed, theme")
          .single();
        if (roomErr || !newRoom) return null;
        room = newRoom;
      }
      this.roomId = room.id;

      // ── Parallel load: all independent queries run concurrently ────────
      // Only logs depend on agents, so we fetch agents first and then fan
      // out the log query. Everything else is fully independent.
      const [
        playerRes,
        settingsRes,
        agentsRes,
        cardRowsRes,
        scheduleRowsRes,
        worldRowRes,
        mailRowsRes,
      ] = await Promise.all([
        supabaseAdmin
          .from("agent_heights_player_info")
          .select("name, workspace, appearance")
          .eq("user_id", this.userId)
          .maybeSingle(),
        supabaseAdmin
          .from("agent_heights_game_settings")
          .select("cline_max_iterations, cline_auto_approve, cline_review_handoff, game_idle_wander, game_theme, railway_enabled, mailbox_platforms")
          .eq("user_id", this.userId)
          .maybeSingle(),
        supabaseAdmin
          .from("agent_heights_agents")
          .select("*")
          .eq("owner_id", this.userId),
        supabaseAdmin
          .from("agent_heights_task_cards")
          .select("*")
          .eq("owner_id", this.userId),
        supabaseAdmin
          .from("agent_heights_schedules")
          .select("*")
          .eq("owner_id", this.userId),
        supabaseAdmin
          .from("agent_heights_world_state")
          .select("seed, fired_agents, chunk_overrides, pending_tasks, vacationed_agents, office_overrides, platform_credentials")
          .eq("room_id", this.roomId)
          .maybeSingle(),
        supabaseAdmin
          .from("agent_heights_mail_events")
          .select("platform, direction, sender, text, timestamp, status")
          .eq("user_id", this.userId)
          .order("timestamp", { ascending: false })
          .limit(500),
      ]);

      const playerRow = playerRes.data;
      const player: PlayerInfo | null = playerRow
        ? { name: playerRow.name, workspace: playerRow.workspace, appearance: playerRow.appearance ?? null }
        : null;

      const settingsRow = settingsRes.data;
      const settings: GameSettings | undefined = settingsRow
        ? {
            cline: {
              maxIterations: settingsRow.cline_max_iterations,
              autoApproveCommands: settingsRow.cline_auto_approve,
              reviewBeforeHandoff: settingsRow.cline_review_handoff ?? false,
            },
            game: {
              idleWander: settingsRow.game_idle_wander,
              theme: settingsRow.game_theme as OfficeTheme,
            },
            railway: { enabled: settingsRow.railway_enabled },
            mailboxPlatforms: settingsRow.mailbox_platforms ?? [null, null, null, null, null, null],
          }
        : undefined;

      const agents: AgentInfo[] = (agentsRes.data ?? []).map((r: any) => ({
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
        ...(r.extra_fields ?? {}),
      }));

      // Load logs (depends on agents) — capped at LOG_CAP per agent
      const logs: Record<string, LogEntry[]> = {};
      if (agents.length > 0) {
        const agentIds = agents.map((a) => a.id);
        const { data: logRows } = await supabaseAdmin
          .from("agent_heights_agent_logs")
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

      const board: TaskCard[] = (cardRowsRes.data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        status: r.status as any,
        assignedAgentId: r.assigned_agent_id ?? null,
        createdAt: r.created_at,
      }));

      const schedules: AgentSchedule[] = (scheduleRowsRes.data ?? []).map((r: any) => ({
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
        consecutiveFailures: r.consecutive_failures ?? 0,
        chainTo: r.chain_to ?? null,
      }));

      const worldRow = worldRowRes.data;
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
      console.log(`[db-rel] load: pending_tasks from DB for user ${this.userId}:`, JSON.stringify(Object.fromEntries(Object.entries(pendingTasksMap).map(([id, ts]) => [id, ts.length]))), `(raw: ${JSON.stringify((worldRow as any)?.pending_tasks)?.slice(0, 200)})`);

      const mailEvents: PlatformEvent[] = (mailRowsRes.data ?? []).map((r: any) => ({
        platform: r.platform,
        direction: r.direction,
        sender: r.sender,
        text: r.text,
        timestamp: r.timestamp,
      }));

      // Load platform credentials (stored as JSONB on world_state)
      const platformCredentials: Record<string, string> = {};
      if ((worldRow as any)?.platform_credentials && typeof (worldRow as any).platform_credentials === "object") {
        for (const [k, v] of Object.entries((worldRow as any).platform_credentials as Record<string, unknown>)) {
          if (typeof v === "string") platformCredentials[k] = v;
        }
      }
      if (Object.keys(platformCredentials).length > 0) {
        console.log(`[db-rel] load: platform_credentials for user ${this.userId}: ${Object.keys(platformCredentials).join(", ")}`);
      }

      this.state = { player, agents, logs, settings, board, schedules, world, pendingTasks: pendingTasksMap, mailEvents, platformCredentials };
      return this.state;
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

  setPlatformCredentials(creds: Record<string, string>): void {
    this.state.platformCredentials = creds;
    this.pendingPlatformCredentials = true;
    this.schedule();
  }

  getPlatformCredentials(): Record<string, string> {
    return this.state.platformCredentials ?? {};
  }

  setOfficeState(state: OfficeStateJSON): void {
    this.state.officeState = state;
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
          .from("agent_heights_player_info")
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
          .from("agent_heights_game_settings")
          .upsert({
            user_id: this.userId,
            cline_max_iterations: this.state.settings.cline.maxIterations,
            cline_auto_approve: this.state.settings.cline.autoApproveCommands,
            cline_review_handoff: this.state.settings.cline.reviewBeforeHandoff,
            game_idle_wander: this.state.settings.game.idleWander,
            game_theme: this.state.settings.game.theme,
            railway_enabled: this.state.settings.railway.enabled,
            mailbox_platforms: this.state.settings.mailboxPlatforms,
          });
      } catch (err) {
        console.error("[db-rel] setSettings failed:", err);
      }
    }

    if (this.pendingWorld && this.state.world) {
      this.pendingWorld = false;
      try {
        await supabaseAdmin
          .from("agent_heights_world_state")
          .upsert({
            room_id: this.roomId,
            owner_id: this.userId,
            seed: this.state.world.seed,
            fired_agents: this.state.world.firedAgents,
            vacationed_agents: this.state.world.vacationedAgents ?? [],
            chunk_overrides: this.state.world.chunkOverrides ?? {},
          });
      } catch (err) {
        console.error("[db-rel] setWorld failed:", err);
      }
    }

    if (this.pendingPendingTasks) {
      const taskCount = Object.keys(this.state.pendingTasks ?? {}).length;
      console.log(`[db-rel] flush: writing pending_tasks for user ${this.userId} (${taskCount} agent(s))...`);
      try {
        const result = await supabaseAdmin
          .from("agent_heights_world_state")
          .upsert({
            room_id: this.roomId,
            owner_id: this.userId,
            pending_tasks: this.state.pendingTasks ?? {},
          }, { onConflict: "room_id" });
        if (result.error) {
          console.error(`[db-rel] setPendingTasks upsert error for user ${this.userId}:`, result.error);
          this.pendingPendingTasks = true; // Retry on next flush
        } else {
          this.pendingPendingTasks = false; // Only clear on success
          console.log(`[db-rel] flush: pending_tasks written successfully for user ${this.userId}`);
        }
      } catch (err) {
        console.error("[db-rel] setPendingTasks failed:", err);
        this.pendingPendingTasks = true; // Retry on next flush
      }
    }

    if (this.pendingPlatformCredentials) {
      const credKeys = Object.keys(this.state.platformCredentials ?? {});
      console.log(`[db-rel] flush: writing platform_credentials for user ${this.userId} (${credKeys.join(", ") || "empty"})...`);
      try {
        const result = await supabaseAdmin
          .from("agent_heights_world_state")
          .upsert({
            room_id: this.roomId,
            owner_id: this.userId,
            platform_credentials: this.state.platformCredentials ?? {},
          }, { onConflict: "room_id" });
        if (result.error) {
          console.error(`[db-rel] platform_credentials upsert error for user ${this.userId}:`, result.error);
          this.pendingPlatformCredentials = true;
        } else {
          this.pendingPlatformCredentials = false;
          console.log(`[db-rel] flush: platform_credentials written successfully for user ${this.userId}`);
        }
      } catch (err) {
        console.error("[db-rel] platform_credentials failed:", err);
        this.pendingPlatformCredentials = true;
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
    const rows = agents.map((a) => {
      const { id, name, title, provider, model, status, task, deskIndex, sprite, appearance, accent, systemPrompt, role, sessionId, tasksDone, mcpServers, ...extra } = a;
      return {
        id,
        room_id: this.roomId,
        owner_id: this.userId,
        name,
        title,
        provider,
        model,
        status,
        task,
        desk_index: deskIndex,
        sprite,
        appearance,
        accent,
        system_prompt: systemPrompt,
        role,
        session_id: sessionId,
        tasks_done: tasksDone,
        mcp_servers: mcpServers ?? null,
        extra_fields: extra,
      };
    });

    if (rows.length > 0) {
      try {
        await supabaseAdmin.from("agent_heights_agents").upsert(rows);
      } catch (err) {
        console.error("[db-rel] upsert agents failed:", err);
      }
    }

    // Delete agents that no longer exist
    const currentIds = agents.map((a) => a.id);
    if (currentIds.length > 0) {
      try {
        await supabaseAdmin
          .from("agent_heights_agents")
          .delete()
          .eq("owner_id", this.userId)
          .not("id", "in", `(${currentIds.join(",")})`);
      } catch (err) {
        console.error("[db-rel] delete stale agents failed:", err);
      }
    } else {
      try {
        await supabaseAdmin.from("agent_heights_agents").delete().eq("owner_id", this.userId);
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
        .from("agent_heights_agent_logs")
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
          await supabaseAdmin.from("agent_heights_agent_logs").insert(logRows);
        } catch (err) {
          console.error(`[db-rel] insert logs for ${agent.id} failed:`, err);
        }
      }

      // Trim to LOG_CAP (only non-archived)
      if (existingCount + newLogs.length > LOG_CAP) {
        try {
          const { data: oldLogs } = await supabaseAdmin
            .from("agent_heights_agent_logs")
            .select("id")
            .eq("agent_id", agent.id)
            .eq("archived", false)
            .order("ts", { ascending: true })
            .limit(existingCount + newLogs.length - LOG_CAP);
          if (oldLogs && oldLogs.length > 0) {
            const idsToDelete = oldLogs.map((r: any) => r.id);
            await supabaseAdmin
              .from("agent_heights_agent_logs")
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
        await supabaseAdmin.from("agent_heights_task_cards").upsert(rows);
      } catch (err) {
        console.error("[db-rel] upsert board failed:", err);
      }
    }

    // Delete cards that no longer exist
    const currentIds = board.map((c) => c.id);
    if (currentIds.length > 0) {
      try {
        await supabaseAdmin
          .from("agent_heights_task_cards")
          .delete()
          .eq("owner_id", this.userId)
          .not("id", "in", `(${currentIds.join(",")})`);
      } catch (err) {
        console.error("[db-rel] delete stale cards failed:", err);
      }
    } else {
      try {
        await supabaseAdmin.from("agent_heights_task_cards").delete().eq("owner_id", this.userId);
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
      consecutive_failures: s.consecutiveFailures ?? 0,
      chain_to: s.chainTo ?? null,
    }));

    if (rows.length > 0) {
      try {
        await supabaseAdmin.from("agent_heights_schedules").upsert(rows);
      } catch (err) {
        console.error("[db-rel] upsert schedules failed:", err);
      }
    }

    // Delete schedules that no longer exist
    const currentIds = schedules.map((s) => s.id);
    if (currentIds.length > 0) {
      try {
        await supabaseAdmin
          .from("agent_heights_schedules")
          .delete()
          .eq("owner_id", this.userId)
          .not("id", "in", `(${currentIds.join(",")})`);
      } catch (err) {
        console.error("[db-rel] delete stale schedules failed:", err);
      }
    } else {
      try {
        await supabaseAdmin.from("agent_heights_schedules").delete().eq("owner_id", this.userId);
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
        .from("agent_heights_conversation_messages")
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
        .from("agent_heights_conversation_messages")
        .insert(rows);
    } catch (err) {
      console.error(`[db-rel] saveMessages for ${agentId} failed:`, err);
    }
  }

  async loadMessages(agentId: string): Promise<unknown[]> {
    if (!isSupabaseConfigured || !this.roomId) return [];
    try {
      const { data, error } = await supabaseAdmin
        .from("agent_heights_conversation_messages")
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
        .from("agent_heights_conversation_messages")
        .update({ archived: true })
        .eq("agent_id", agentId)
        .eq("archived", false);
    } catch (err) {
      console.error(`[db-rel] clearMessages for ${agentId} failed:`, err);
    }
  }

  async insertMailEvent(ev: PlatformEvent): Promise<void> {
    if (!isSupabaseConfigured) return;
    try {
      await supabaseAdmin
        .from("agent_heights_mail_events")
        .insert({
          user_id: this.userId,
          platform: ev.platform,
          direction: ev.direction,
          sender: ev.sender,
          text: ev.text,
          timestamp: ev.timestamp,
          status: 'new',
        });
    } catch (err) {
      console.error("[db-rel] insertMailEvent failed:", err);
    }
  }

  async markMailHandled(platform: string): Promise<void> {
    if (!isSupabaseConfigured) return;
    try {
      await supabaseAdmin
        .from("agent_heights_mail_events")
        .update({ status: 'handled' })
        .eq("user_id", this.userId)
        .eq("platform", platform)
        .eq("status", 'new');
    } catch (err) {
      console.error("[db-rel] markMailHandled failed:", err);
    }
  }

  async clearLogs(agentId: string): Promise<void> {
    if (!isSupabaseConfigured || !this.roomId) return;
    if (this.state.logs) this.state.logs[agentId] = [];
    try {
      // Soft-delete: archive logs instead of hard-deleting
      await supabaseAdmin
        .from("agent_heights_agent_logs")
        .update({ archived: true })
        .eq("agent_id", agentId)
        .eq("archived", false);
    } catch (err) {
      console.error(`[db-rel] clearLogs for ${agentId} failed:`, err);
    }
  }
}
