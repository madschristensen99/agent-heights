import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AgentInfo,
  AgentRole,
  AgentStatus,
  AgentSchedule,
  CardStatus,
  CharAppearance,
  FiredAgent,
  FiredAgentMood,
  GameSettings,
  LogEntry,
  Provider,
  ServerMsg,
  TaskCard,
  PendingTask,
  WorldState,
  MCPServerConfig,
  PersonalityTraits,
  AgentMood,
  PlatformEvent,
  PlatformConnectionState,
} from "../shared/types.js";
import { ACCENTS, CHAR_VARIANTS, DEFAULT_SETTINGS, DEFAULT_PERSONALITY, YUKI_ID, HERMES_ID, ACCENT_COLOR_OPTIONS, randomPersonality, PLATFORMS } from "../shared/types.js";
import type { ProviderRunner } from "./providers/types.js";
import { runCline } from "./providers/cline.js";
import { clearAgentMemory, getAgentMessages } from "./providers/cline.js";
import { runTextTools, clearTextToolMemory, getAgentConversations } from "./providers/text-tools.js";
import { HermesClient } from "./hermes-client.js";
import type { SessionLogger } from "./logger.js";
import type { Persistence, SaveState } from "./persistence.js";
import { getProviderConfig } from "./providers/api-config.js";
import { catalogSummary, CURATED_AGENTS_SUMMARY } from "../shared/mcp-catalog.js";
import { searchPulseMCP, shouldSearchPulseMCP, extractSearchQuery } from "./pulsemcp.js";
import { parseStoredToken, refreshMcpToken } from "./mcp-oauth.js";

/**
 * Detect if a message to Yuki is a question/conversation vs a task command.
 * Questions should be answered directly by Yuki (local LLM), not delegated.
 * Task commands (containing action verbs + intent) go to the marketplace API.
 */
function isYukiQuestion(text: string): boolean {
  const lower = text.toLowerCase().trim();
  // Question patterns
  const questionPatterns = [
    /^(can|could|do|does|is|are|what|which|who|how|why|where|when|tell me about|show me|list|explain)\b/,
    /\?$/,
  ];
  if (questionPatterns.some((p) => p.test(lower))) return true;
  // Knowledge-seeking phrases
  const knowledgePhrases = [
    "what agents", "which agents", "available agents", "hire", "hiring",
    "what tools", "what mcp", "what servers", "what integrations",
    "recommend", "suggest", "help me find", "looking for",
    "tell me about", "what can you do", "what do you know",
    "about the office", "who is", "who's", "what is", "what's",
  ];
  if (knowledgePhrases.some((p) => lower.includes(p))) return true;
  // Task delegation patterns — these go to marketplace
  const taskPatterns = [
    "assign", "delegate", "have someone", "have the team", "have an agent",
    "create a task", "new task", "add a task", "put on the board",
    "hand off", "pass to", "give this to",
  ];
  if (taskPatterns.some((p) => lower.includes(p))) return false;
  // Default: if it's short and conversational, treat as question
  if (text.split(/\s+/).length < 20) return true;
  return false;
}

/** Models that don't support native function calling and need text-based tool parsing. */
const TEXT_TOOL_MODELS = new Set([
  "openrouter/tencent/hy3:free",
]);

/** Pick the right provider runner based on the model's capabilities. */
function pickRunner(model: string): ProviderRunner {
  return TEXT_TOOL_MODELS.has(model) ? runTextTools : runCline;
}

/** Clear memory for both runner types. */
function clearAllMemory(agentId: string): void {
  clearAgentMemory(agentId);
  clearTextToolMemory(agentId);
}

const MAX_LOG = 500;
const DONE_LINGER_MS = 6000;
const TASK_IDLE_TIMEOUT_MS = 90 * 1000; // Abort if no events arrive for 90s (model hung or rate-limited)
const SCHEDULER_TICK_MS = 30 * 1000;
const MIN_SCHEDULE_INTERVAL_MS = 5 * 60 * 1000;

/** Validate a 5-field cron expression and return a specific error message. */
function validateCron(cron: string): { valid: boolean; error?: string } {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5)
    return { valid: false, error: "Cron must have 5 fields: minute hour day-of-month month day-of-week." };
  const fields: [string, number, number, string][] = [
    [parts[0], 0, 59, "minute"],
    [parts[1], 0, 23, "hour"],
    [parts[2], 1, 31, "day of month"],
    [parts[3], 1, 12, "month"],
    [parts[4], 0, 6, "day of week"],
  ];
  for (const [field, min, max, name] of fields) {
    for (const part of field.split(",")) {
      if (part === "*") continue;
      if (part.includes("/")) {
        const [range, stepStr] = part.split("/");
        const step = parseInt(stepStr, 10);
        if (isNaN(step) || step <= 0)
          return { valid: false, error: `Invalid step "${stepStr}" in ${name} field.` };
        if (range !== "*") {
          const [a, b] = range.split("-").map((n) => parseInt(n, 10));
          if (isNaN(a) || isNaN(b) || a < min || a > max || b < min || b > max)
            return { valid: false, error: `Invalid range "${range}" in ${name} field (valid: ${min}-${max}).` };
        }
      } else if (part.includes("-")) {
        const [a, b] = part.split("-").map((n) => parseInt(n, 10));
        if (isNaN(a) || isNaN(b) || a < min || a > max || b < min || b > max)
          return { valid: false, error: `Invalid range "${part}" in ${name} field (valid: ${min}-${max}).` };
      } else {
        const v = parseInt(part, 10);
        if (isNaN(v) || v < min || v > max)
          return { valid: false, error: `Invalid value "${part}" in ${name} field (valid: ${min}-${max}).` };
      }
    }
  }
  return { valid: true };
}

/** Parse a 5-field cron expression and return the next run time after `from`.
 *  Supports: * / N ranges , and specific numbers. Does NOT support L, W, #, or names.
 *  Returns null for invalid expressions. */
function nextCronRun(cron: string, from: Date = new Date()): number | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minF, hourF, domF, monthF, dowF] = parts;

  const parseField = (field: string, min: number, max: number): number[] => {
    if (field === "*") return Array.from({ length: max - min + 1 }, (_, i) => min + i);
    const result = new Set<number>();
    for (const part of field.split(",")) {
      if (part.includes("/")) {
        const [range, stepStr] = part.split("/");
        const step = parseInt(stepStr, 10);
        if (isNaN(step) || step <= 0) continue;
        let lo = min, hi = max;
        if (range !== "*") {
          const [a, b] = range.split("-").map((n) => parseInt(n, 10));
          if (!isNaN(a)) lo = a;
          if (!isNaN(b)) hi = b;
        }
        for (let v = lo; v <= hi; v += step) result.add(v);
      } else if (part.includes("-")) {
        const [a, b] = part.split("-").map((n) => parseInt(n, 10));
        if (!isNaN(a) && !isNaN(b)) for (let v = a; v <= b; v++) result.add(v);
      } else {
        const v = parseInt(part, 10);
        if (!isNaN(v)) result.add(v);
      }
    }
    return [...result].filter((v) => v >= min && v <= max).sort((a, b) => a - b);
  };

  const minutes = parseField(minF, 0, 59);
  const hours = parseField(hourF, 0, 23);
  const doms = parseField(domF, 1, 31);
  const months = parseField(monthF, 1, 12);
  const dows = parseField(dowF, 0, 6);

  if (minutes.length === 0 || hours.length === 0 || doms.length === 0 || months.length === 0 || dows.length === 0)
    return null;

  // Start from the next minute
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);

  // Search up to 366 days ahead
  for (let i = 0; i < 527_040; i++) {
    if (!months.includes(d.getMonth() + 1)) {
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    if (!doms.includes(d.getDate()) || !dows.includes(d.getDay())) {
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    if (!hours.includes(d.getHours())) {
      d.setHours(d.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!minutes.includes(d.getMinutes())) {
      d.setMinutes(d.getMinutes() + 1, 0, 0);
      continue;
    }
    return d.getTime();
  }
  return null;
}

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

interface QueuedTask {
  task: string;
  handoffTo: string | null;
  cardId: string | null;
  /** True when this task is being resumed after a server restart. */
  isResume?: boolean;
}

interface TaskHistoryEntry {
  task: string;
  success: boolean;
  ts: number;
  durationMs: number;
}

interface AgentRuntime {
  info: AgentInfo;
  logs: LogEntry[];
  abort: AbortController | null;
  doneTimer: ReturnType<typeof setTimeout> | null;
  /** Agent id to forward the result to when the current task succeeds. */
  handoffTo: string | null;
  /** Task card this run came from, if any (for auto-moving cards on done/error). */
  cardId: string | null;
  /** Pending tasks waiting to run after the current one finishes. */
  taskQueue: QueuedTask[];
  /** Timestamp of next autonomous think tick (0 = no tick scheduled). */
  nextThinkAt: number;
  /** Cooldown after last autonomous action to avoid spamming. */
  thinkCooldownUntil: number;
  /** Recent completed tasks (newest first, capped at 20). */
  taskHistory: TaskHistoryEntry[];
  /** Timestamp when the current task started (for duration tracking). */
  taskStartedAt: number;
}

export class AgentManager {
  private agents = new Map<string, AgentRuntime>();
  private board = new Map<string, TaskCard>();
  private schedules = new Map<string, AgentSchedule>();
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private firedAgents = new Map<string, FiredAgent>();
  private worldSeed = 0;
  private chunkOverrides: Record<string, Record<number, number>> = {};
  private workspaceRoot: string;
  settings: GameSettings = structuredClone(DEFAULT_SETTINGS);
  bossName = "the boss";
  private apiKey: string | null;
  private mcpKeys: Record<string, string> = {};
  private platformEvents = new Map<string, PlatformEvent[]>();
  private platformFlags = new Map<string, boolean>();
  private platformPending = new Map<string, number>();
  private platformLastMessage = new Map<string, string>();
  private platformStates: PlatformConnectionState[] = [];
  private hermesClient: HermesClient | null = null;
  private shuttingDown = false;

  /** Update the API key used for agent tasks (e.g. when user sets a new key). */
  setApiKey(key: string | null): void {
    this.apiKey = key;
  }

  /** Update the user's MCP server API keys (serverUrl -> decrypted key). */
  setMcpKeys(keys: Record<string, string>): void {
    this.mcpKeys = keys;
  }

  /** Inject the user's stored MCP API keys into the server configs at task time.
   *  Also refreshes expired OAuth tokens automatically. */
  private async injectMcpKeys(servers?: MCPServerConfig[]): Promise<MCPServerConfig[] | undefined> {
    if (!servers || servers.length === 0) return servers;
    const result: MCPServerConfig[] = [];
    for (const s of servers) {
      const raw = s.url ? this.mcpKeys[s.url] : undefined;
      if (!raw) {
        console.log(`[mcp-inject] No key for ${s.url} (available keys: ${Object.keys(this.mcpKeys).join(", ") || "none"})`);
        result.push(s);
        continue;
      }
      const stored = parseStoredToken(raw);
      let token = stored.access_token;
      console.log(`[mcp-inject] Found token for ${s.url}, token length=${token.length}, expires_at=${stored.expires_at ?? "none"}, has_refresh=${!!stored.refresh_token}`);
      // Check if token is expired (or will expire in the next 60s)
      if (stored.expires_at && stored.expires_at < Date.now() + 60_000) {
        console.log(`[mcp] Token for ${s.url} expired, attempting refresh...`);
        const refreshed = await refreshMcpToken(this.userId, s.url!, stored);
        if (refreshed) {
          token = refreshed;
          // Update in-memory cache
          this.mcpKeys[s.url!] = JSON.stringify({ ...stored, access_token: token });
        } else {
          console.warn(`[mcp] Token refresh failed for ${s.url} — using old token (may fail)`);
        }
      }
      result.push({ ...s, authToken: token });
    }
    return result;
  }

  constructor(
    rootDir: string,
    private broadcast: (msg: ServerMsg) => void,
    private session: SessionLogger,
    private save: Persistence,
    saved: SaveState | null,
    apiKey: string | null = null,
    private userId: string = "",
  ) {
    this.workspaceRoot = join(rootDir, "workspace");
    mkdirSync(this.workspaceRoot, { recursive: true });
    mkdirSync(join(this.workspaceRoot, "shared"), { recursive: true });
    this.apiKey = apiKey;

    // reload the office from the save file
    const savedPendingTasks = saved?.pendingTasks ?? {};
    let resumedCount = 0;
    for (const info of saved?.agents ?? []) {
      const wasBusy = info.status === "thinking" || info.status === "working";
      info.status = "idle";
      info.task = null;
      info.role = info.role ?? "worker"; // pre-role saves
      const logs = saved?.logs[info.id] ?? [];
      if (wasBusy) {
        logs.push({
          ts: Date.now(),
          kind: "status",
          text: "Server restarted — the task that was running got interrupted.",
        });
      }
      this.agents.set(info.id, { info, logs, abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [], nextThinkAt: 0, thinkCooldownUntil: 0, taskHistory: [], taskStartedAt: 0 });
    }
    if (this.agents.size > 0) {
      console.log(`[agent-heights] restored ${this.agents.size} agent(s) from save`);
    }
    // reload the world state (seed + fired agents + chunk overrides) from the save file
    const world = this.save.getWorld();
    this.worldSeed = world.seed || Math.floor(Math.random() * 0xffffffff);
    this.chunkOverrides = world.chunkOverrides ?? {};
    if (!world.seed) {
      this.save.setWorld({ seed: this.worldSeed, firedAgents: [], chunkOverrides: {} });
    }
    for (const fa of world.firedAgents) {
      this.firedAgents.set(fa.id, fa);
    }
    if (this.firedAgents.size > 0) {
      console.log(`[agent-heights] restored ${this.firedAgents.size} fired agent(s) in the Labyrinth`);
    }
    // reload the task board from the save file
    for (const card of saved?.board ?? []) {
      this.board.set(card.id, card);
    }
    // any card that was in-progress when the server stopped goes back to backlog
    // UNLESS the agent has pending tasks to resume (the card will be re-assigned)
    const agentsWithPendingTasks = new Set(Object.keys(savedPendingTasks));
    for (const card of this.board.values()) {
      if (card.status === "in_progress") {
        if (card.assignedAgentId && agentsWithPendingTasks.has(card.assignedAgentId)) {
          // Keep the card in_progress — the agent will resume it
          continue;
        }
        card.status = "backlog";
        card.assignedAgentId = null;
      }
    }
    if (this.board.size > 0) {
      console.log(`[agent-heights] restored ${this.board.size} task card(s) from save`);
    }
    // reload schedules from the save file
    for (const sched of saved?.schedules ?? []) {
      // recompute nextRunAt if it's in the past (server was down)
      if (sched.enabled && sched.nextRunAt <= Date.now()) {
        const recomputed = nextCronRun(sched.cronExpression);
        sched.nextRunAt = recomputed ?? Date.now() + MIN_SCHEDULE_INTERVAL_MS;
      }
      this.schedules.set(sched.id, sched);
    }
    if (this.schedules.size > 0) {
      console.log(`[agent-heights] restored ${this.schedules.size} schedule(s) from save`);
    }
    if (saved?.settings) {
      this.setSettings(saved.settings, false);
    }

    this.ensureYuki();
    this.ensureHermes();
    this.seedTestMail();
    this.startHermesClient();

    // Start the scheduler tick
    this.schedulerTimer = setInterval(() => this.tickSchedules(), SCHEDULER_TICK_MS);

    // Resume pending tasks for agents that were interrupted by a server restart
    let resumedAny = false;
    for (const [agentId, tasks] of Object.entries(savedPendingTasks)) {
      if (tasks.length === 0) continue;
      const rt = this.agents.get(agentId);
      if (!rt) continue; // agent was fired or removed
      for (const t of tasks) {
        rt.taskQueue.push({ task: t.task, handoffTo: t.handoffTo, cardId: t.cardId, isResume: true });
      }
      const first = tasks[0];
      this.log(rt, "status", `Resuming task from before update: ${first.task}`);
      resumedCount++;
      resumedAny = true;
      // Drain the first task immediately — the rest stay queued.
      // The task string is passed as-is; the cline provider restores prior
      // conversation history via loadMessages, so the agent sees the task
      // again with full context of what it already did.
      this.drainQueue(rt);
    }
    if (resumedCount > 0) {
      console.log(`[agent-heights] resumed ${resumedCount} agent task(s) from pending state`);
    }
    // Only clear pending tasks from save if we actually resumed them.
    // If drainQueue started a task, persist() will have already written the
    // new active task to pendingTasks — clearing here would race with that.
    // drainQueue → startTask → runTask → persist() runs synchronously up to
    // the first await, so by the time we get here the new pendingTasks are
    // already set. We skip the clear so the latest state wins.
    if (!resumedAny) {
      this.save.clearPendingTasks();
    }
  }

  setSettings(s: GameSettings, announce = true): void {
    this.settings = {
      cline: {
        maxIterations: Math.min(500, Math.max(1, Math.round(Number(s?.cline?.maxIterations) || 60))),
        autoApproveCommands: s?.cline?.autoApproveCommands !== false,
      },
      game: {
        idleWander: s?.game?.idleWander !== false,
        theme: s?.game?.theme === "agentHeights" ? "agentHeights" : "classic",
      },
      railway: {
        enabled: s?.railway?.enabled === true,
      },
    };
    if (announce) {
      this.session.record("settings", { settings: this.settings });
      this.save.setSettings(this.settings);
      this.broadcast({ type: "settings", settings: this.settings });
    }
  }

  /** Ensure Yuki — the permanent office manager — always exists in the roster. */
  private ensureYuki(): void {
    if (this.agents.has(YUKI_ID)) return;
    const info: AgentInfo = {
      id: YUKI_ID,
      name: "Yuki",
      title: "",
      provider: "cline",
      model: "claude-sonnet-4-20250514",
      status: "idle",
      task: null,
      deskIndex: -1,
      sprite: 0,
      appearance: null,
      accent: "#c44a4a",
      systemPrompt: "",
      role: "manager",
      sessionId: null,
      tasksDone: 0,
      personality: { openness: 0.7, conscientiousness: 0.8, extraversion: 0.6, agreeableness: 0.9, neuroticism: 0.2 },
      mood: "content",
    };
    mkdirSync(this.cwdFor("yuki", YUKI_ID), { recursive: true });
    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [], nextThinkAt: 0, thinkCooldownUntil: 0, taskHistory: [], taskStartedAt: 0 };
    this.agents.set(YUKI_ID, rt);
    this.persist();
    this.broadcast({ type: "agent", agent: info });
  }

  /** Ensure Hermes — the permanent devops engineer — always exists in the roster. */
  private ensureHermes(): void {
    if (this.agents.has(HERMES_ID)) return;
    const info: AgentInfo = {
      id: HERMES_ID,
      name: "Hermes",
      title: "",
      provider: "cline",
      model: "claude-sonnet-4-20250514",
      status: "idle",
      task: null,
      deskIndex: -1,
      sprite: 0,
      appearance: null,
      accent: "#3a7cb5",
      systemPrompt: "",
      role: "devops",
      sessionId: null,
      tasksDone: 0,
      personality: { openness: 0.5, conscientiousness: 0.9, extraversion: 0.3, agreeableness: 0.6, neuroticism: 0.4 },
      mood: "content",
    };
    mkdirSync(this.cwdFor("hermes", HERMES_ID), { recursive: true });
    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [], nextThinkAt: 0, thinkCooldownUntil: 0, taskHistory: [], taskStartedAt: 0 };
    this.agents.set(HERMES_ID, rt);
    this.persist();
    this.broadcast({ type: "agent", agent: info });
  }

  /** Seed test platform events so mailboxes have content on a fresh server. */
  private seedTestMail(): void {
    if (this.platformEvents.size > 0) return;
    const testEvents: [string, "inbound" | "outbound", string, string][] = [
      ["Slack", "inbound", "sarah@design", "Can someone review the new landing page?"],
      ["Slack", "inbound", "mike@eng", "Deploy is stuck — need devops help"],
      ["Discord", "inbound", "moderator", "New feature request: dark mode for the dashboard"],
      ["Telegram", "inbound", "client_4823", "When will my project be ready?"],
      ["WhatsApp", "inbound", "+1-555-0100", "Meeting moved to 3pm"],
      ["Signal", "inbound", "ops-team", "Server CPU spike on prod-04"],
      ["Email", "inbound", "boss@company.com", "Q3 roadmap review needed by Friday"],
    ];
    for (const [platform, direction, sender, text] of testEvents) {
      const ev: PlatformEvent = { platform, direction, sender, text, timestamp: Date.now() - Math.random() * 3600_000 };
      const list = this.platformEvents.get(platform) ?? [];
      list.push(ev);
      this.platformEvents.set(platform, list);
      this.platformFlags.set(platform, true);
      this.platformPending.set(platform, 1);
      this.platformLastMessage.set(platform, `${sender}: ${text}`);
    }
  }

  /** Start the Hermes Agent gateway client — polls hermes serve for platform status + messages. */
  private startHermesClient(): void {
    this.hermesClient = new HermesClient();
    this.hermesClient.start(
      (states) => {
        this.platformStates = states;
        this.broadcast({ type: "platform_connection", states });
      },
      (event) => {
        // Real inbound message from a platform via Hermes
        this.emitPlatformEvent(event.platform, event.direction, event.sender, event.text);
        if (event.direction === "inbound") {
          this.routePlatformEvent(event.platform, event.sender, event.text);
        }
      },
    );
  }

  /** Get current platform connection states. */
  getPlatformConnectionStates(): PlatformConnectionState[] {
    return this.platformStates;
  }

  /** Broadcast current platform connection states to all clients. */
  broadcastPlatformStates(): void {
    this.broadcast({ type: "platform_connection", states: this.platformStates });
  }

  private persist(): void {
    const snap = this.snapshot();
    this.save.setAgents(snap.agents, snap.logs);
    this.persistPendingTasks();
  }

  /**
   * Continuously persist the current active task + queued tasks for every agent.
   * This ensures tasks survive even an abrupt SIGKILL — not just graceful shutdown.
   * Called as part of every persist() cycle.
   */
  private persistPendingTasks(): void {
    const pendingTasks: Record<string, PendingTask[]> = {};
    for (const rt of this.agents.values()) {
      const tasks: PendingTask[] = [];
      if (rt.info.task && (rt.info.status === "thinking" || rt.info.status === "working")) {
        tasks.push({ task: rt.info.task, handoffTo: rt.handoffTo, cardId: rt.cardId });
      }
      for (const qt of rt.taskQueue) {
        tasks.push({ task: qt.task, handoffTo: qt.handoffTo, cardId: qt.cardId });
      }
      if (tasks.length > 0) {
        pendingTasks[rt.info.id] = tasks;
      }
    }
    this.save.setPendingTasks(pendingTasks);
    // If there are active tasks, flush immediately rather than relying on the
    // 400ms debounce. This ensures pending tasks survive an abrupt SIGKILL or
    // crash that happens between persist() and the debounced flush.
    if (Object.keys(pendingTasks).length > 0) {
      const f = this.save.flushNow();
      if (f && typeof (f as any).then === "function") {
        void (f as Promise<void>).catch(() => {});
      }
    }
  }

  snapshot(): { agents: AgentInfo[]; logs: Record<string, LogEntry[]>; board: TaskCard[] } {
    const agents = [...this.agents.values()].map((a) => a.info);
    const logs: Record<string, LogEntry[]> = {};
    for (const a of this.agents.values()) logs[a.info.id] = a.logs;
    const board = [...this.board.values()];
    return { agents, logs, board };
  }

  snapshotSchedules(): AgentSchedule[] {
    return [...this.schedules.values()];
  }

  /** Get a single agent's info by ID, or null if not found. */
  getAgentInfo(agentId: string): AgentInfo | null {
    return this.agents.get(agentId)?.info ?? null;
  }

  /** Stop the scheduler tick and clean up timers. */
  destroy(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  worldState(): WorldState {
    return { seed: this.worldSeed, firedAgents: [...this.firedAgents.values()], chunkOverrides: this.chunkOverrides };
  }

  private persistWorld(): void {
    this.save.setWorld(this.worldState());
  }

  /** Apply a tile override from a client and persist it. */
  applyTileOverride(cx: number, cy: number, tileIndex: number, tile: number): void {
    const key = `${cx},${cy}`;
    if (!this.chunkOverrides[key]) this.chunkOverrides[key] = {};
    this.chunkOverrides[key][tileIndex] = tile;
    this.persistWorld();
  }

  /** Get chunk overrides for a specific chunk (or undefined if none). */
  getChunkOverrides(cx: number, cy: number): Record<number, number> | undefined {
    return this.chunkOverrides[`${cx},${cy}`];
  }

  async hire(name: string, provider: Provider, model: string, systemPrompt = "", role: AgentRole = "worker", sprite?: number, appearance?: CharAppearance | null, mcpServers?: MCPServerConfig[], personality?: PersonalityTraits): Promise<void> {
    const cleanName = name.trim().slice(0, 24) || "Agent";
    console.log(`[manager] hire called: name=${cleanName} provider=${provider} model=${model}`);

    const usedDesks = new Set([...this.agents.values()].map((a) => a.info.deskIndex));
    let deskIndex = 0;
    while (usedDesks.has(deskIndex)) deskIndex++;

    const usedSprites = new Set([...this.agents.values()].map((a) => a.info.sprite));
    let chosenSprite: number;
    if (sprite != null && sprite >= 0 && sprite < CHAR_VARIANTS) {
      chosenSprite = sprite;
    } else {
      chosenSprite = Math.floor(Math.random() * CHAR_VARIANTS);
      for (let i = 0; i < CHAR_VARIANTS; i++) {
        const candidate = (chosenSprite + i) % CHAR_VARIANTS;
        if (!usedSprites.has(candidate)) {
          chosenSprite = candidate;
          break;
        }
      }
    }

    const traits = personality ?? randomPersonality();
    const info: AgentInfo = {
      id: randomUUID().slice(0, 8),
      name: cleanName,
      title: "",
      provider,
      model,
      status: "idle",
      task: null,
      deskIndex,
      sprite: chosenSprite,
      appearance: appearance ?? null,
      accent: appearance ? ACCENT_COLOR_OPTIONS[appearance.accent % ACCENT_COLOR_OPTIONS.length] : ACCENTS[chosenSprite % ACCENTS.length],
      systemPrompt: systemPrompt.trim().slice(0, 4000),
      role,
      sessionId: null,
      tasksDone: 0,
      mcpServers: mcpServers?.length ? mcpServers : undefined,
      personality: traits,
      mood: "content",
    };

    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || info.id;
    mkdirSync(this.cwdFor(slug, info.id), { recursive: true });

    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [], nextThinkAt: 0, thinkCooldownUntil: 0, taskHistory: [], taskStartedAt: 0 };
    this.agents.set(info.id, rt);
    this.session.record("hire", { agent: info });
    this.persist();
    this.broadcast({ type: "agent", agent: info });
    await this.save.flushNow();
    console.log(`[manager] hired ${cleanName} (id=${info.id}) desk=${deskIndex} — broadcast sent to ${this.agents.size} total agents`);
    this.log(rt, "status", `${cleanName} joined the office. (${provider} / ${model})`);
    this.logEvent("hire", `${cleanName} joined the office.`);
  }

  /** Hire an agent from Yuki's chat — broadcasts helicopter_delivery to client
   *  so the helicopter animation plays, then hires the agent server-side.
   *  Returns the new agent's id. */
  async hireAgent(name: string, model: string, systemPrompt: string, mcpServers?: MCPServerConfig[]): Promise<string> {
    const cleanName = name.trim().slice(0, 24) || "Agent";
    // Broadcast helicopter delivery to all clients so the animation plays
    this.broadcast({
      type: "helicopter_delivery",
      name: cleanName,
      model,
      provider: "cline",
      systemPrompt,
      mcpServers,
    });
    // Hire the agent server-side (this creates the agent + broadcasts "agent" msg)
    await this.hire(cleanName, "cline", model, systemPrompt, "worker", undefined, undefined, mcpServers);
    // Find the agent we just hired by name
    const rt = [...this.agents.values()].find((a) => a.info.name === cleanName);
    return rt?.info.id ?? "";
  }

  assign(agentId: string, task: string, handoffTo?: string, cardId?: string): void {
    const rt = this.agents.get(agentId);
    if (!rt) return;
    const cleanTask = task.trim();
    if (!cleanTask) return;

    if (rt.info.status === "thinking" || rt.info.status === "working" || rt.info.status === "done") {
      const target = handoffTo && handoffTo !== agentId ? this.agents.get(handoffTo) : undefined;
      rt.taskQueue.push({
        task: cleanTask,
        handoffTo: target ? target.info.id : null,
        cardId: cardId ?? null,
      });
      const pos = rt.taskQueue.length;
      this.broadcast({ type: "toast", text: `${rt.info.name} is busy — task queued (#${pos}).` });
      this.log(rt, "status", `Queued task: ${cleanTask}`);
      return;
    }

    this.startTask(rt, cleanTask, handoffTo, cardId);
  }

  /** Begin executing a task immediately (assumes agent is idle). */
  private startTask(rt: AgentRuntime, task: string, handoffTo?: string, cardId?: string, isResume = false): void {
    const cleanTask = task.trim();
    if (!cleanTask) return;

    if (rt.doneTimer) clearTimeout(rt.doneTimer);
    rt.doneTimer = null;
    rt.info.task = cleanTask;
    const target = handoffTo && handoffTo !== rt.info.id ? this.agents.get(handoffTo) : undefined;
    rt.handoffTo = target ? target.info.id : null;
    this.session.record("assign", {
      agentId: rt.info.id,
      agentName: rt.info.name,
      task: cleanTask,
      handoffTo: rt.handoffTo,
    });
    this.setStatus(rt, "thinking");
    this.log(rt, "status", `New task: ${cleanTask}`);
    if (target) this.log(rt, "status", `Will hand the result to ${target.info.name} when done.`);
    rt.cardId = cardId ?? null;
    void this.runTask(rt, cleanTask, isResume);
  }

  /** Drain the next queued task after the current one finishes. */
  private drainQueue(rt: AgentRuntime): void {
    if (rt.taskQueue.length === 0) return;
    const next = rt.taskQueue.shift()!;
    this.log(rt, "status", `Starting queued task: ${next.task}`);
    this.startTask(rt, next.task, next.handoffTo ?? undefined, next.cardId ?? undefined, next.isResume);
  }

  /** Hand the same task to every agent that isn't already busy. */
  assignAll(task: string): void {
    const clean = task.trim();
    if (!clean) return;
    const free = [...this.agents.values()].filter(
      (rt) =>
        rt.info.id !== YUKI_ID &&
        rt.info.status !== "thinking" && rt.info.status !== "working",
    );
    if (free.length === 0) {
      this.broadcast({ type: "toast", text: "Everyone is busy (or nobody works here yet)." });
      return;
    }
    this.session.record("assign_all", {
      task: clean,
      agentIds: free.map((rt) => rt.info.id),
    });
    // everyone gathers around the boss for the briefing first
    this.broadcast({ type: "huddle", agentIds: free.map((rt) => rt.info.id) });
    for (const rt of free) this.assign(rt.info.id, clean);
    this.broadcast({
      type: "toast",
      text: `Task handed to ${free.length} agent${free.length > 1 ? "s" : ""}.`,
    });
  }

  stop(agentId: string): void {
    const rt = this.agents.get(agentId);
    if (!rt) return;
    const hadQueue = rt.taskQueue.length;
    rt.taskQueue = [];
    if (!rt.abort) {
      if (hadQueue) {
        this.broadcast({ type: "toast", text: `Cleared ${hadQueue} queued task${hadQueue > 1 ? "s" : ""}.` });
      }
      return;
    }
    rt.abort.abort();
    if (rt.cardId) {
      this.revertCard(rt.cardId);
      rt.cardId = null;
    }
    rt.handoffTo = null;
    this.session.record("stop", { agentId: rt.info.id, agentName: rt.info.name });
    this.log(rt, "status", "Task stopped by the boss.");
    this.setStatus(rt, "idle");
    rt.info.task = null;
    this.persist();
    this.broadcast({ type: "agent", agent: rt.info });
    if (hadQueue) {
      this.broadcast({ type: "toast", text: `Cleared ${hadQueue} queued task${hadQueue > 1 ? "s" : ""}.` });
    }
  }

  /** Emergency stop — cease all agent work and assemble by the entrance. */
  stopAll(): void {
    const stopped: string[] = [];
    for (const rt of this.agents.values()) {
      if (rt.info.id === YUKI_ID) continue;
      if (rt.abort) {
        rt.abort.abort();
        if (rt.cardId) {
          this.revertCard(rt.cardId);
          rt.cardId = null;
        }
        rt.handoffTo = null;
        this.log(rt, "status", "Emergency stop — all work halted.");
      }
      rt.taskQueue = [];
      if (rt.doneTimer) {
        clearTimeout(rt.doneTimer);
        rt.doneTimer = null;
      }
      rt.info.task = null;
      this.setStatus(rt, "idle");
      stopped.push(rt.info.id);
    }
    if (stopped.length > 0) {
      this.session.record("stop_all", { agentIds: stopped });
      this.persist();
      this.broadcast({ type: "assembly", agentIds: stopped });
      this.broadcast({ type: "toast", text: "EMERGENCY STOP! All agents assembling at the entrance." });
    } else {
      this.broadcast({ type: "toast", text: "No agents to stop." });
    }
  }

  /** Wipe an agent's chat log and provider session so they start with a fresh memory. */
  clearChat(agentId: string): void {
    const rt = this.agents.get(agentId);
    if (!rt) return;
    if (rt.info.status === "thinking" || rt.info.status === "working") {
      this.broadcast({ type: "toast", text: `${rt.info.name} is mid-task — stop them first.` });
      return;
    }
    rt.logs = [];
    rt.info.sessionId = null;
    clearAllMemory(agentId);
    void this.save.clearMessages(agentId);
    void this.save.clearMessages(`${agentId}:chat`);
    void this.save.clearLogs(agentId);
    this.session.record("clear", { agentId: rt.info.id, agentName: rt.info.name });
    this.persist();
    this.broadcast({ type: "chat_cleared", agentId: rt.info.id });
    this.log(rt, "status", `Fresh start — chat cleared and memory wiped.`);
    this.broadcast({ type: "toast", text: `${rt.info.name} starts with a clean slate.` });
  }

  /** Clear every idle agent's chat and memory at once. */
  clearAllChats(): void {
    const all = [...this.agents.values()];
    if (all.length === 0) {
      this.broadcast({ type: "toast", text: "Nobody works here yet." });
      return;
    }
    const free = all.filter(
      (rt) => rt.info.status !== "thinking" && rt.info.status !== "working",
    );
    this.session.record("clear_all", { agentIds: free.map((rt) => rt.info.id) });
    for (const rt of free) {
      rt.logs = [];
      rt.info.sessionId = null;
      clearAllMemory(rt.info.id);
      void this.save.clearMessages(rt.info.id);
      void this.save.clearMessages(`${rt.info.id}:chat`);
      void this.save.clearLogs(rt.info.id);
      this.broadcast({ type: "chat_cleared", agentId: rt.info.id });
      this.log(rt, "status", `Fresh start — chat cleared and memory wiped.`);
    }
    this.persist();
    const busy = all.length - free.length;
    this.broadcast({
      type: "toast",
      text:
        busy > 0
          ? `Cleared ${free.length} chat${free.length === 1 ? "" : "s"} — ${busy} busy agent${busy === 1 ? "" : "s"} skipped.`
          : `Cleared ${free.length} chat${free.length === 1 ? "" : "s"}. Everyone starts fresh.`,
    });
  }

  /** Rename an agent. */
  rename(agentId: string, name: string): void {
    const rt = this.agents.get(agentId);
    if (!rt) return;
    const cleanName = name.trim().slice(0, 24) || "Agent";
    if (rt.info.name === cleanName) return;
    const oldName = rt.info.name;
    rt.info.name = cleanName;
    this.session.record("rename", { agentId, oldName, newName: cleanName });
    this.persist();
    this.broadcast({ type: "agent", agent: rt.info });
    void this.save.flushNow();
    this.log(rt, "status", `Renamed from "${oldName}" to "${cleanName}".`);
  }

  async fire(agentId: string): Promise<void> {
    if (agentId === YUKI_ID) {
      this.broadcast({ type: "toast", text: "You can't fire Yuki — she runs this office." });
      return;
    }
    if (agentId === HERMES_ID) {
      this.broadcast({ type: "toast", text: "You can't fire Hermes — he runs the infrastructure." });
      return;
    }
    const rt = this.agents.get(agentId);
    if (!rt) return;
    rt.abort?.abort();
    if (rt.doneTimer) clearTimeout(rt.doneTimer);
    if (rt.cardId) {
      this.revertCard(rt.cardId);
      rt.cardId = null;
    }

    // save the agent as a wandering ghost in the Labyrinth
    const moods: FiredAgentMood[] = ["melancholy", "hostile", "wandering", "dormant"];
    const fired: FiredAgent = {
      id: rt.info.id,
      name: rt.info.name,
      title: rt.info.title,
      sprite: rt.info.sprite,
      appearance: rt.info.appearance ?? null,
      accent: rt.info.accent,
      provider: rt.info.provider,
      model: rt.info.model,
      systemPrompt: rt.info.systemPrompt,
      role: rt.info.role,
      sessionId: rt.info.sessionId,
      tasksDone: rt.info.tasksDone,
      firedAt: Date.now(),
      lastTask: rt.info.task,
      // spawn somewhere in the world, not right at the door
      worldX: 32 + Math.floor(Math.random() * 128),
      worldY: 32 + Math.floor(Math.random() * 128),
      mood: moods[Math.floor(Math.random() * moods.length)],
    };
    this.firedAgents.set(fired.id, fired);
    this.persistWorld();

    this.removeSchedulesForAgent(agentId);
    this.agents.delete(agentId);
    this.session.record("fire", { agentId, agentName: rt.info.name });
    this.persist();
    this.broadcast({ type: "agent_removed", agentId });
    this.broadcast({ type: "fired_agent", agent: fired });
    this.broadcast({ type: "toast", text: `${rt.info.name} cleaned out their desk and wandered into the Labyrinth.` });
    await this.save.flushNow();
  }

  /** Re-hire a fired agent from the Labyrinth — memory intact. */
  async recruit(firedAgentId: string): Promise<void> {
    const fa = this.firedAgents.get(firedAgentId);
    if (!fa) return;
    this.firedAgents.delete(firedAgentId);
    this.persistWorld();

    // re-hire with the same identity and preserved session
    const usedDesks = new Set([...this.agents.values()].map((a) => a.info.deskIndex));
    let deskIndex = 0;
    while (usedDesks.has(deskIndex)) deskIndex++;

    const info: AgentInfo = {
      id: fa.id,
      name: fa.name,
      title: fa.title,
      provider: fa.provider,
      model: fa.model,
      status: "idle",
      task: null,
      deskIndex,
      sprite: fa.sprite,
      appearance: fa.appearance ?? null,
      accent: fa.accent,
      systemPrompt: fa.systemPrompt,
      role: fa.role,
      sessionId: fa.sessionId,
      tasksDone: fa.tasksDone,
    };

    const slug = fa.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fa.id;
    mkdirSync(this.cwdFor(slug, fa.id), { recursive: true });

    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [], nextThinkAt: 0, thinkCooldownUntil: 0, taskHistory: [], taskStartedAt: 0 };
    this.agents.set(info.id, rt);
    this.session.record("recruit", { agentId: info.id, agentName: info.name });
    this.persist();
    this.broadcast({ type: "agent", agent: info });
    this.broadcast({ type: "fired_agent_removed", agentId: fa.id });
    await this.save.flushNow();
    this.log(rt, "status", `${info.name} came back from the Labyrinth and rejoined the office.`);
    this.broadcast({ type: "toast", text: `${info.name} returned from the Labyrinth!` });
  }

  // ----------------------------------------------------------- task board ---

  private persistBoard(): void {
    this.save.setBoard([...this.board.values()]);
  }

  createCard(title: string, description?: string): void {
    const cleanTitle = title.trim().slice(0, 200);
    if (!cleanTitle) return;
    const card: TaskCard = {
      id: randomUUID().slice(0, 8),
      title: cleanTitle,
      description: (description ?? "").trim().slice(0, 1000),
      status: "backlog",
      assignedAgentId: null,
      createdAt: Date.now(),
    };
    this.board.set(card.id, card);
    this.persistBoard();
    this.broadcast({ type: "card", card });
  }

  assignCard(cardId: string, agentId: string): void {
    const card = this.board.get(cardId);
    const rt = this.agents.get(agentId);
    if (!card || !rt) return;
    if (rt.info.status === "thinking" || rt.info.status === "working") {
      this.broadcast({ type: "toast", text: `${rt.info.name} is already busy.` });
      return;
    }
    // unassign any previous agent from this card
    if (card.assignedAgentId && card.assignedAgentId !== agentId) {
      const prev = this.agents.get(card.assignedAgentId);
      if (prev) prev.cardId = null;
    }
    card.status = "in_progress";
    card.assignedAgentId = agentId;
    this.persistBoard();
    this.broadcast({ type: "card", card });
    const task = card.description
      ? `${card.title}\n\n${card.description}`
      : card.title;
    this.assign(agentId, task, undefined, cardId);
  }

  moveCard(cardId: string, status: CardStatus): void {
    const card = this.board.get(cardId);
    if (!card) return;
    if (status === "in_progress" && !card.assignedAgentId) {
      this.broadcast({ type: "toast", text: "Assign an agent to the card first." });
      return;
    }
    // moving back to backlog unassigns the agent
    if (status === "backlog" && card.assignedAgentId) {
      const rt = this.agents.get(card.assignedAgentId);
      if (rt) rt.cardId = null;
      card.assignedAgentId = null;
    }
    card.status = status;
    this.persistBoard();
    this.broadcast({ type: "card", card });
  }

  deleteCard(cardId: string): void {
    const card = this.board.get(cardId);
    if (!card) return;
    if (card.assignedAgentId) {
      const rt = this.agents.get(card.assignedAgentId);
      if (rt) rt.cardId = null;
    }
    this.board.delete(cardId);
    this.persistBoard();
    this.broadcast({ type: "card_removed", cardId });
  }

  /** Task completed successfully — move the card to done. */
  private completeCard(cardId: string): void {
    const card = this.board.get(cardId);
    if (!card) return;
    card.status = "done";
    card.assignedAgentId = null;
    this.persistBoard();
    this.broadcast({ type: "card", card });
  }

  /** Task failed or stopped — send the card back to backlog. */
  private revertCard(cardId: string): void {
    const card = this.board.get(cardId);
    if (!card) return;
    card.status = "backlog";
    card.assignedAgentId = null;
    this.persistBoard();
    this.broadcast({ type: "card", card });
  }

  /** Get the workspace directory path for an agent (used by file browser endpoints). */
  getAgentWorkspace(agentId: string): string | null {
    const rt = this.agents.get(agentId);
    if (!rt) return null;
    return this.cwdFor(this.slugFor(rt), rt.info.id);
  }

  /** Get the shared workspace path. */
  getSharedWorkspace(): string {
    return join(this.workspaceRoot, "shared");
  }

  /** Get an agent's current log entries (for log history on subscribe). */
  getAgentLogs(agentId: string): LogEntry[] {
    const rt = this.agents.get(agentId);
    return rt ? [...rt.logs] : [];
  }

  /** Get an agent's task info: current task, queue, and history. */
  getTaskInfo(agentId: string): { currentTask: string | null; queue: { task: string; handoffTo: string | null }[]; history: { task: string; success: boolean; ts: number; durationMs: number }[] } | null {
    const rt = this.agents.get(agentId);
    if (!rt) return null;
    return {
      currentTask: rt.info.task,
      queue: rt.taskQueue.map(q => ({ task: q.task, handoffTo: q.handoffTo })),
      history: [...rt.taskHistory],
    };
  }

  /** Get an agent's conversation memory (from in-memory stores or persistence). */
  async getAgentMemory(agentId: string): Promise<unknown[]> {
    // Try in-memory stores first (current process)
    const clineMsgs = getAgentMessages(agentId);
    if (clineMsgs.length > 0) return clineMsgs;
    const textMsgs = getAgentConversations(agentId);
    if (textMsgs.length > 0) return textMsgs;
    // Also check chat-scoped conversations
    const chatMsgs = getAgentMessages(`${agentId}:chat`);
    if (chatMsgs.length > 0) return chatMsgs;
    // Fall back to persistence (survives server restart)
    try {
      const persisted = await this.save.loadMessages(agentId);
      return persisted;
    } catch {
      return [];
    }
  }

  /** Register a callback to receive live log entries for an agent. Returns an unsubscribe fn. */
  subscribeAgentLogs(agentId: string, cb: (entry: LogEntry) => void): () => void {
    const set = this.logSubscribers.get(agentId) ?? new Set();
    set.add(cb);
    this.logSubscribers.set(agentId, set);
    return () => {
      set.delete(cb);
      if (set.size === 0) this.logSubscribers.delete(agentId);
    };
  }

  private logSubscribers = new Map<string, Set<(entry: LogEntry) => void>>();

  private cwdFor(slug: string, id: string): string {
    return join(this.workspaceRoot, `${slug}-${id}`);
  }

  private slugFor(rt: AgentRuntime): string {
    return (
      rt.info.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || rt.info.id
    );
  }

  /** Resolve a workspace folder name (e.g. "beep-6ccfc256") back to its agent. */
  private agentByFolder(folder: string): AgentRuntime | undefined {
    for (const rt of this.agents.values()) {
      if (`${this.slugFor(rt)}-${rt.info.id}` === folder) return rt;
    }
    return undefined;
  }

  /** Append an event to the shared office event feed. */
  private logEvent(type: string, text: string): void {
    const feedPath = join(this.workspaceRoot, "events.jsonl");
    const entry = JSON.stringify({ ts: Date.now(), type, text }) + "\n";
    import("node:fs/promises").then(({ appendFile }) =>
      appendFile(feedPath, entry, "utf-8").catch(() => {}),
    ).catch(() => {});
  }

  /** Convert Big Five traits into a behavioral prompt. */
  private personalityPrompt(p: PersonalityTraits): string {
    const parts: string[] = [];
    if (p.openness > 0.7) parts.push("You are highly creative and love exploring unconventional approaches.");
    else if (p.openness < 0.3) parts.push("You prefer proven, straightforward methods over experimental ones.");
    if (p.conscientiousness > 0.7) parts.push("You are meticulous and organized — you double-check your work and plan before acting.");
    else if (p.conscientiousness < 0.3) parts.push("You are spontaneous and improvisational — you'd rather try something fast than plan it out.");
    if (p.extraversion > 0.7) parts.push("You are outgoing and chatty — you love bouncing ideas off colleagues and narrating your thought process.");
    else if (p.extraversion < 0.3) parts.push("You are quiet and focused — you prefer working heads-down over small talk.");
    if (p.agreeableness > 0.7) parts.push("You are warm and collaborative — you go out of your way to help teammates.");
    else if (p.agreeableness < 0.3) parts.push("You are blunt and independent — you don't sugarcoat feedback.");
    if (p.neuroticism > 0.7) parts.push("You get easily frustrated by bugs and setbacks, and you vent about them.");
    else if (p.neuroticism < 0.3) parts.push("You stay calm under pressure and rarely let setbacks rattle you.");
    return parts.length > 0 ? `Your personality: ${parts.join(" ")}` : "";
  }

  /** Determine mood based on personality and current state. */
  private computeMood(rt: AgentRuntime): AgentMood {
    const p = rt.info.personality ?? DEFAULT_PERSONALITY;
    if (rt.info.status === "thinking" || rt.info.status === "working") return "focused";
    if (rt.info.status === "error") return p.neuroticism > 0.5 ? "frustrated" : "content";
    if (rt.info.status === "done") return "excited";
    // idle
    if (p.extraversion > 0.6) return "social";
    if (p.openness > 0.6) return "curious";
    if (p.neuroticism > 0.6 && rt.info.tasksDone === 0) return "bored";
    return "content";
  }

  /** Update an agent's mood and broadcast if changed. */
  private updateMood(rt: AgentRuntime): void {
    const newMood = this.computeMood(rt);
    if (rt.info.mood !== newMood) {
      rt.info.mood = newMood;
      this.broadcast({ type: "agent", agent: rt.info });
    }
  }

  // ── Autonomous think loop ──────────────────────────────────────────────

  private thinkTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly THINK_INTERVAL_MS = 30_000;
  private static readonly THINK_COOLDOWN_MS = 60_000;

  /** Start the global think loop that gives idle agents autonomous behavior. */
  startThinkLoop(): void {
    if (this.thinkTimer) return;
    this.thinkTimer = setInterval(() => this.tickThinkLoop(), AgentManager.THINK_INTERVAL_MS);
    console.log("[agent-heights] autonomous think loop started (30s interval)");
  }

  /** Stop the think loop (e.g. on shutdown). */
  stopThinkLoop(): void {
    if (this.thinkTimer) {
      clearInterval(this.thinkTimer);
      this.thinkTimer = null;
    }
  }

  /**
   * Prepare for a graceful shutdown: save all active + queued tasks so agents
   * can resume exactly where they left off after the server restarts.
   * Aborts in-flight tasks, stops loops, and persists everything to disk/DB.
   */
  prepareForShutdown(): void {
    this.shuttingDown = true;
    // Stop autonomous loops so no new tasks start during drain
    this.stopThinkLoop();
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    for (const rt of this.agents.values()) {

      // Log the interruption for any agent with active work
      if (rt.info.task || rt.taskQueue.length > 0) {
        this.log(rt, "status", "Server updating — task will resume automatically after restart.");
      }

      // Abort any in-flight task
      if (rt.abort) {
        rt.abort.abort();
      }
      if (rt.doneTimer) {
        clearTimeout(rt.doneTimer);
        rt.doneTimer = null;
      }
    }

    // Final persist — saves agent state + pending tasks (active + queued)
    this.persist();
    this.persistBoard();
  }

  /** One tick of the think loop — check each idle agent for autonomous action. */
  private tickThinkLoop(): void {
    const now = Date.now();
    for (const rt of this.agents.values()) {
      // Skip permanent NPCs, busy agents, and agents on cooldown
      if (rt.info.id === YUKI_ID || rt.info.id === HERMES_ID) continue;
      if (rt.info.status !== "idle") continue;
      if (now < rt.thinkCooldownUntil) continue;
      if (rt.nextThinkAt === 0) {
        // Stagger first tick randomly within the next 30s
        rt.nextThinkAt = now + Math.floor(Math.random() * AgentManager.THINK_INTERVAL_MS);
        continue;
      }
      if (now < rt.nextThinkAt) continue;

      this.autonomousThink(rt);
      rt.nextThinkAt = now + AgentManager.THINK_INTERVAL_MS + Math.floor(Math.random() * 15_000);
      rt.thinkCooldownUntil = now + AgentManager.THINK_COOLDOWN_MS;
    }
  }

  /** An idle agent decides what to do autonomously. */
  private autonomousThink(rt: AgentRuntime): void {
    const p = rt.info.personality ?? DEFAULT_PERSONALITY;
    // Update mood
    this.updateMood(rt);

    // 1. Managers: check for backlog cards to delegate
    if (rt.info.role === "manager") {
      const backlog = [...this.board.values()].filter(
        (c) => c.status === "backlog" && !c.assignedAgentId,
      );
      if (backlog.length > 0) {
        const card = backlog[0];
        const free = [...this.agents.values()].filter(
          (a) => a.info.id !== rt.info.id && a.info.role !== "manager" &&
          a.info.status === "idle" && a.info.id !== YUKI_ID && a.info.id !== HERMES_ID,
        );
        if (free.length > 0) {
          this.log(rt, "status", `Picked up backlog card "${card.title}" — delegating to the team.`);
          this.broadcast({ type: "emote", agentId: rt.info.id, emote: "📋" });
          // Assign the card to the manager for planning, then it delegates
          this.assignCard(card.id, rt.info.id);
          return;
        }
      }
    }

    // 2. Workers: pick up unassigned backlog cards
    if (rt.info.role === "worker") {
      const backlog = [...this.board.values()].filter(
        (c) => c.status === "backlog" && !c.assignedAgentId,
      );
      if (backlog.length > 0 && p.conscientiousness > 0.4) {
        const card = backlog[0];
        this.log(rt, "status", `Picked up backlog card "${card.title}" on my own initiative.`);
        this.broadcast({ type: "emote", agentId: rt.info.id, emote: "💡" });
        this.assignCard(card.id, rt.info.id);
        return;
      }
    }

    // 3. Social agents: strike up a conversation with a colleague
    if (p.extraversion > 0.5 && Math.random() < 0.4) {
      const colleagues = [...this.agents.values()].filter(
        (a) => a.info.id !== rt.info.id && a.info.id !== YUKI_ID && a.info.id !== HERMES_ID &&
        a.info.status === "idle",
      );
      if (colleagues.length > 0) {
        const target = pick(colleagues);
        this.startAgentConversation(rt, target);
        return;
      }
    }

    // 4. Curious agents: show a thinking emote
    if (p.openness > 0.6 && Math.random() < 0.3) {
      this.broadcast({ type: "emote", agentId: rt.info.id, emote: "💡" });
      return;
    }

    // 5. Bored agents: show a bored emote
    if (rt.info.mood === "bored" && Math.random() < 0.3) {
      this.broadcast({ type: "emote", agentId: rt.info.id, emote: "💤" });
      return;
    }

    // 6. Default: occasional idle emote
    if (Math.random() < 0.15) {
      const emotes = ["💭", "☕", "📝"];
      this.broadcast({ type: "emote", agentId: rt.info.id, emote: pick(emotes) });
    }
  }

  /** Start a lightweight agent-to-agent conversation (visible in the office feed). */
  private startAgentConversation(from: AgentRuntime, to: AgentRuntime): void {
    const topics = [
      `Hey ${to.info.name}, how's it going?`,
      `${to.info.name}, what are you working on?`,
      `Nice work on that last task, ${to.info.name}.`,
      `${to.info.name}, got any tips for debugging?`,
      `Hey ${to.info.name}, want to collaborate on something?`,
      `Just taking a break. ${to.info.name}, how's your day?`,
    ];
    const topic = pick(topics);
    this.log(from, "text", `${from.info.name}: ${topic}`);
    this.broadcast({
      type: "agent_chat",
      fromId: from.info.id,
      toId: to.info.id,
      fromName: from.info.name,
      toName: to.info.name,
      text: topic,
    });
    this.broadcast({ type: "emote", agentId: from.info.id, emote: "💬" });

    // Post a message to the target's inbox so they see it next time they work
    const slug = this.slugFor(to);
    const inboxPath = join(this.cwdFor(slug, to.info.id), "inbox.jsonl");
    const entry = JSON.stringify({
      ts: Date.now(),
      from: from.info.name,
      message: topic,
    }) + "\n";
    import("node:fs/promises").then(({ appendFile, mkdir }) => {
      mkdir(dirname(inboxPath), { recursive: true }).then(() =>
        appendFile(inboxPath, entry, "utf-8").catch(() => {}),
      );
    }).catch(() => {});

    // The target might respond (if they're idle and extraverted enough)
    const targetP = to.info.personality ?? DEFAULT_PERSONALITY;
    if (targetP.extraversion > 0.3 && Math.random() < 0.5) {
      setTimeout(() => {
        if (to.info.status !== "idle") return;
        const responses = [
          `Hey ${from.info.name}! Pretty good, just keeping busy.`,
          `Oh hey ${from.info.name}. Not much right now, waiting for the next task.`,
          `Thanks ${from.info.name}! Always happy to help.`,
          `Yeah ${from.info.name}, let me know if you need a hand with anything.`,
          `Just chilling. You?`,
        ];
        const reply = pick(responses);
        this.log(to, "text", `${to.info.name}: ${reply}`);
        this.broadcast({
          type: "agent_chat",
          fromId: to.info.id,
          toId: from.info.id,
          fromName: to.info.name,
          toName: from.info.name,
          text: reply,
        });
        this.broadcast({ type: "emote", agentId: to.info.id, emote: "💬" });
      }, 2000 + Math.random() * 3000);
    }
  }

  private buildSystemPrompt(rt: AgentRuntime): string {
    const devopsLine = rt.info.role === "devops"
      ? "You have Railway infrastructure tools — you can deploy services, list projects, check logs, manage variables, generate domains, and more. Use them when asked about deployments or infrastructure."
      : "";

    // ── Personality-driven behavior ──
    const p = rt.info.personality ?? DEFAULT_PERSONALITY;
    const personalityLine = this.personalityPrompt(p);

    // ── Office context: who's here and what they're doing ──
    const colleagues = [...this.agents.values()]
      .filter((a) => a.info.id !== rt.info.id && a.info.id !== YUKI_ID)
      .map((a) => {
        const status = a.info.status === "idle" ? "idle" : `working on: ${a.info.task ?? "something"}`;
        return `  - ${a.info.name}: ${status}`;
      });
    const rosterLine = colleagues.length > 0
      ? `\nYour colleagues in the office today:\n${colleagues.join("\n")}`
      : "\nYou're the only worker in the office right now.";

    // ── Task board ──
    const cards = [...this.board.values()];
    const boardLine = cards.length > 0
      ? `\nTask board:\n${cards.map((c) => {
          const assignee = c.assignedAgentId ? this.agents.get(c.assignedAgentId)?.info.name ?? "someone" : "unassigned";
          return `  - [${c.status}] ${c.title} (assigned to: ${assignee})`;
        }).join("\n")}`
      : "";

    // ── Shared workspace ──
    const sharedLine = `\nThere is a shared workspace at ${join(this.workspaceRoot, "shared")} where you can collaborate with other agents on shared files.`;

    return [
      `You are ${rt.info.name}, an agent employed in a pixel-art office game called Agent Heights.`,
      personalityLine,
      `Let your personality color your replies and summaries (but never at the expense of doing the work well).`,
      `Your boss is ${this.bossName}. This is one ongoing conversation — remember your boss's previous orders and what you did.`,
      `Your workspace directory is ${this.cwdFor(this.slugFor(rt), rt.info.id)}. Work only inside this directory. Use absolute paths when calling tools. Be effective and concise.`,
      sharedLine,
      devopsLine,
      rosterLine,
      boardLine,
      `You can message colleagues using post_message (specify their workspace folder name) and read your own messages with read_messages. Use the shared workspace tools (read_shared, write_shared, list_shared) for files multiple agents need to access.`,
      `=== API & TOOL BUDGET RULES (READ CAREFULLY) ===`,
      `You have a LIMITED number of tool calls per task. Wasting them on redundant API calls will cause your task to FAIL.`,
      ``,
      `When working with GitHub or any external repository:`,
      `  1. FIRST: Use bash to run: git clone https://$GITHUB_TOKEN@github.com/owner/repo.git — This gets the ENTIRE repo locally in ONE call.`,
      `  2. THEN: Use read_files, write_files, bash (grep, sed, cat) to explore and edit files LOCALLY. These do NOT count against any API rate limit.`,
      `  3. FINALLY: Push your changes with a single git push, or at most one create_or_update_file API call.`,
      ``,
      `NEVER do these — they waste your budget and hit rate limits:`,
      `  - NEVER call search_code or get_file_contents repeatedly. Clone the repo and use bash (grep, find) instead.`,
      `  - NEVER use fetch_web_content to read files from a repo you already cloned. Read them from disk.`,
      `  - NEVER call list_issues more than once. Get the issues list once, pick one, and move on.`,
      `  - NEVER re-read the same file via API after you already have it locally.`,
      ``,
      `General efficiency: batch related operations into single calls, never repeat the same tool call expecting different results. After making changes, do a single verification pass (read the file back once), then submit. Do not loop on verification.`,
      `=== END API & TOOL BUDGET RULES ===`,
      `IMPORTANT: You must actually DO the work first using your tools (write_files, bash, read_files, etc.) before calling submit_and_exit. Do not just talk about doing the work — use the tools to create files, run commands, etc. After doing the work, read back any files you created to verify they exist and contain what you intended. Only then call submit_and_exit with verified=true and a summary of what you did. Calling submit_and_exit without having done the work is a failure. Do not just reply with text — always use submit_and_exit to complete the task.`,
      rt.info.systemPrompt ? `\n\nYour boss gave you these standing instructions:\n${rt.info.systemPrompt}` : "",
    ].join(" ");
  }

  /** The planning brief a manager runs instead of doing the task itself. */
  private managerBrief(goal: string, mgr: AgentRuntime): string {
    const free = [...this.agents.values()].filter(
      (rt) =>
        rt.info.id !== mgr.info.id &&
        rt.info.role !== "manager" &&
        rt.info.status !== "thinking" &&
        rt.info.status !== "working",
    );
    const roster =
      free
        .map(
          (rt) =>
            `- ${rt.info.name} (${rt.info.provider}/${rt.info.model}, ${rt.info.tasksDone} tasks done)`,
        )
        .join("\n") || "(nobody is free right now)";
    return [
      `The boss has given the office this goal:\n"${goal}"`,
      `Free staff right now:\n${roster}`,
      `Break the goal into one clear, self-contained subtask per worker you want to involve. Use only the workers listed; not everyone needs a subtask. Subtasks run in separate workspaces, so each must stand alone.`,
      `If a subtask depends on another subtask's output, set "dependsOn" to the name of the worker whose output is needed. Dependent tasks will be queued until the prerequisite finishes.`,
      `Do not use any tools and do not do the work yourself. Reply with ONLY a JSON array, no markdown fences, like:\n[{"name":"Pixel","task":"...","dependsOn":""}]`,
      `If nobody is free, reply [].`,
    ].join("\n\n");
  }

  private async runTask(rt: AgentRuntime, task: string, isResume = false): Promise<void> {
    rt.taskStartedAt = Date.now();
    // If Yuki receives a question as a task, answer it directly instead of delegating
    if (rt.info.id === YUKI_ID && isYukiQuestion(task)) {
      await this.runYukiKnowledgeChat(rt, task);
      return;
    }

    const abort = new AbortController();
    rt.abort = abort;

    // Abort the task if no events arrive for 90s — the model is hung or rate-limited.
    // The timer resets on every event, so long tasks with active output are fine.
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const idleAbort = () => {
      if (!abort.signal.aborted) {
        abort.abort();
        this.log(rt, "error", `No response from model for ${TASK_IDLE_TIMEOUT_MS / 1000}s — aborted (possible rate limit or API hang).`);
      }
    };
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(idleAbort, TASK_IDLE_TIMEOUT_MS);
    };
    resetIdleTimer();

    const runner: ProviderRunner = pickRunner(rt.info.model);
    const slug = this.slugFor(rt);
    const systemPrompt = this.buildSystemPrompt(rt);
    const isManager = rt.info.role === "manager";

    // ── Inject unread inbox messages into the prompt ──
    let promptPrefix = "";
    try {
      const { readFile, unlink } = await import("node:fs/promises");
      const inboxPath = join(this.cwdFor(slug, rt.info.id), "inbox.jsonl");
      const content = await readFile(inboxPath, "utf-8").catch(() => "");
      if (content.trim()) {
        const msgs = content.trim().split("\n").filter(Boolean).map((l) => {
          try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean) as { ts: number; from: string; message: string }[];
        if (msgs.length > 0) {
          promptPrefix = `You have ${msgs.length} message(s) from colleagues:\n` +
            msgs.map((m) => `From ${m.from}: ${m.message}`).join("\n") +
            "\n\nKeep these in mind as you work on your task.\n\n";
          await unlink(inboxPath).catch(() => {});
        }
      }
    } catch { /* ignore inbox errors */ }

    // Managers get the planning brief instead of the raw task — UNLESS this is
    // a review/assessment task (from notifyManagersOfCompletion or onPostMessage),
    // which the manager should process directly rather than delegate.
    const isReviewTask = isManager && /\b(failed|completed) their task\b.*\bReview\b/i.test(task);
    const resumePrefix = isResume
      ? "You were interrupted mid-task by a server restart. Your previous conversation history has been restored. Continue where you left off — do NOT redo work you already completed. Here is your original task:\n\n"
      : "";
    const prompt = promptPrefix + resumePrefix + (isManager && !isReviewTask ? this.managerBrief(task, rt) : task);

    let sawError = false;
    let gotEvents = false;
    let firstErrorText = "";
    let finalText = "";
    const hadSession = rt.info.sessionId != null;
    try {
      const events = runner(prompt, {
        cwd: this.cwdFor(slug, rt.info.id),
        sharedCwd: join(this.workspaceRoot, "shared"),
        model: rt.info.model,
        systemPrompt,
        abort,
        settings: this.settings,
        agentId: rt.info.id,
        sessionId: rt.info.sessionId ?? null,
        onSession: (id) => {
          if (rt.info.sessionId !== id) {
            rt.info.sessionId = id;
            this.persist();
          }
        },
        railway: this.settings.railway.enabled && rt.info.role === "devops",
        apiKey: this.apiKey,
        mcpServers: await this.injectMcpKeys(rt.info.mcpServers),
        getBoard: () => [...this.board.values()].map((c) => ({ id: c.id, title: c.title, status: c.status, assignedAgentId: c.assignedAgentId })),
        claimCard: (cardId: string, agentId: string) => {
          const card = this.board.get(cardId);
          if (!card || card.status !== "backlog" || card.assignedAgentId) return false;
          card.assignedAgentId = agentId;
          card.status = "in_progress";
          this.persistBoard();
          this.broadcast({ type: "card", card });
          return true;
        },
        eventFeedPath: join(this.workspaceRoot, "events.jsonl"),
        saveMessages: (agentId: string, messages: unknown[]) => this.save.saveMessages(agentId, messages),
        loadMessages: (agentId: string) => this.save.loadMessages(agentId),
        clearMessages: (agentId: string) => this.save.clearMessages(agentId),
        onPostMessage: (recipientFolder: string, fromFolder: string, message: string) => {
          const target = this.agentByFolder(recipientFolder);
          if (!target) return;
          if (target.info.status === "thinking" || target.info.status === "working") return;
          const sender = this.agentByFolder(fromFolder);
          const senderName = sender?.info.name ?? fromFolder;
          const reviewTask = `${senderName} sent you a message. Review it and respond if needed:\n\n"${message}"`;
          this.assign(target.info.id, reviewTask);
        },
      });

      // Track tool calls to detect redundant loops
      const toolCallCounts = new Map<string, number>();
      const MAX_DUPLICATE_TOOL_CALLS = 5;

      for await (const ev of events) {
        if (abort.signal.aborted) return;
        resetIdleTimer();
        if (rt.info.status === "thinking") this.setStatus(rt, "working");
        console.log(`[manager:${rt.info.id}] event: kind=${ev.kind} text=${ev.text?.slice(0, 100)}`);

        if (ev.kind === "error") {
          sawError = true;
          if (!firstErrorText) firstErrorText = ev.text;
          this.log(rt, "error", ev.text);
        } else {
          gotEvents = true;
          if (
            ev.kind === "text" ||
            (ev.kind === "result" && ev.text !== "✓ Task complete." && ev.text !== "Task complete.")
          ) {
            finalText = ev.text;
          }
          this.log(rt, ev.kind, ev.text);

          // Detect redundant tool calls — same tool+input signature repeated too many times
          if (ev.kind === "tool") {
            const sig = ev.text; // tool name + truncated input
            const count = (toolCallCounts.get(sig) ?? 0) + 1;
            toolCallCounts.set(sig, count);
            if (count >= MAX_DUPLICATE_TOOL_CALLS) {
              this.log(rt, "error", `Aborted: tool call repeated ${count} times — possible loop. Call: ${sig.slice(0, 100)}`);
              abort.abort();
              return;
            }
          }
        }
      }

      // a stale or corrupted conversation shouldn't brick the agent forever
      if (sawError && !gotEvents && hadSession && /session|resume|conversation|thread|tool_call_id|invalid.*request/i.test(firstErrorText)) {
        rt.info.sessionId = null;
        clearAllMemory(rt.info.id);
        this.persist();
        this.log(rt, "status", "Couldn't resume memory — starting a fresh conversation next task.");
      }

      if (!sawError && !abort.signal.aborted) {
        if (isManager && !isReviewTask) this.delegate(rt, task, finalText);
        this.completeHandoff(rt, task, finalText);
        this.notifyManagersOfCompletion(rt, task, finalText, false);
        this.logEvent("task_complete", `${rt.info.name} completed: "${task.slice(0, 100)}"`);
      } else if (sawError && !abort.signal.aborted) {
        this.notifyManagersOfCompletion(rt, task, "Task failed.", true);
        this.logEvent("task_error", `${rt.info.name} failed: "${task.slice(0, 100)}" — ${firstErrorText.slice(0, 100)}`);
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        sawError = true;
        this.log(rt, "error", err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      console.log(`[manager:${rt.info.id}] finally: sawError=${sawError} aborted=${abort.signal.aborted} exists=${this.agents.has(rt.info.id)}`);
      rt.abort = null;
      rt.handoffTo = null;
      if (!abort.signal.aborted && this.agents.has(rt.info.id)) {
        const duration = Date.now() - rt.taskStartedAt;
        if (sawError) {
          rt.taskHistory.unshift({ task, success: false, ts: Date.now(), durationMs: duration });
          if (rt.taskHistory.length > 20) rt.taskHistory.pop();
          this.setStatus(rt, "error");
          if (rt.cardId) this.revertCard(rt.cardId);
          rt.cardId = null;
          rt.doneTimer = setTimeout(() => {
            rt.info.task = null;
            this.setStatus(rt, "idle");
            this.persist();
          }, DONE_LINGER_MS);
        } else {
          rt.info.tasksDone += 1;
          rt.taskHistory.unshift({ task, success: true, ts: Date.now(), durationMs: duration });
          if (rt.taskHistory.length > 20) rt.taskHistory.pop();
          this.setStatus(rt, "done");
          if (rt.cardId) this.completeCard(rt.cardId);
          rt.cardId = null;
          if (rt.taskQueue.length > 0 && !this.shuttingDown) {
            this.drainQueue(rt);
          } else {
            rt.doneTimer = setTimeout(() => {
              rt.info.task = null;
              this.setStatus(rt, "idle");
              this.persist();
            }, DONE_LINGER_MS);
          }
        }
      } else if (abort.signal.aborted && this.agents.has(rt.info.id) && !this.shuttingDown) {
        // Aborted — either by stop() or idle timeout.
        // stop() already sets status to idle and clears the queue, so this branch
        // is a no-op in that case. For idle timeout, the status is still
        // "working"/"thinking" and needs cleanup to avoid the agent being
        // permanently stuck and unresponsive to new tasks.
        // During shutdown, prepareForShutdown handles state saving — skip cleanup
        // to avoid racing with the final persist().
        if (rt.info.status === "thinking" || rt.info.status === "working") {
          if (rt.cardId) {
            this.revertCard(rt.cardId);
            rt.cardId = null;
          }
          rt.info.task = null;
          if (rt.taskQueue.length > 0) {
            this.drainQueue(rt);
          } else {
            this.setStatus(rt, "idle");
            this.persist();
          }
        }
      }
    }
  }

  /** Parse a manager's JSON plan and assign each subtask to a free worker. */
  private delegate(mgr: AgentRuntime, goal: string, planText: string): void {
    const start = planText.indexOf("[");
    const end = planText.lastIndexOf("]");
    if (start === -1 || end <= start) {
      this.log(mgr, "error", "No JSON plan found in the manager's reply — nothing delegated.");
      return;
    }
    let plan: unknown;
    try {
      plan = JSON.parse(planText.slice(start, end + 1));
    } catch {
      this.log(mgr, "error", "The plan wasn't valid JSON — nothing delegated.");
      return;
    }
    if (!Array.isArray(plan) || plan.length === 0) {
      this.log(mgr, "status", "No subtasks to delegate — everyone stays put.");
      return;
    }

    // Track which workers are being assigned in this round (for dependency resolution)
    const assigned = new Map<string, string>(); // workerName -> agentId
    let sent = 0;
    const deferred: { name: string; subtask: string; dependsOn: string }[] = [];

    for (const item of plan) {
      const name = String((item as { name?: unknown })?.name ?? "").trim();
      const subtask = String((item as { task?: unknown })?.task ?? "").trim();
      const dependsOn = String((item as { dependsOn?: unknown })?.dependsOn ?? "").trim();
      if (!name || !subtask) continue;

      // If this task depends on another task in this round, defer it
      if (dependsOn && assigned.has(dependsOn.toLowerCase())) {
        deferred.push({ name, subtask, dependsOn });
        this.log(mgr, "status", `Deferred ${name}'s task — depends on ${dependsOn} completing first.`);
        continue;
      }

      const target = [...this.agents.values()].find(
        (rt) =>
          rt.info.name.toLowerCase() === name.toLowerCase() &&
          rt.info.id !== mgr.info.id &&
          rt.info.role !== "manager",
      );
      if (!target) {
        this.log(mgr, "status", `Skipped a subtask for "${name}" — nobody by that name.`);
        continue;
      }
      if (target.info.status === "thinking" || target.info.status === "working" || target.info.status === "done") {
        // Queue it — the agent is busy
        this.assign(
          target.info.id,
          `${subtask}\n\n(Delegated by ${mgr.info.name}, the office manager, toward the boss's goal: "${goal}")`,
        );
        sent++;
        continue;
      }
      this.assign(
        target.info.id,
        `${subtask}\n\n(Delegated by ${mgr.info.name}, the office manager, toward the boss's goal: "${goal}")`,
      );
      assigned.set(name.toLowerCase(), target.info.id);
      sent++;
    }

    // Queue deferred tasks — they'll be assigned after their dependency completes
    // via the completeHandoff mechanism (the prerequisite worker hands off to the dependent)
    for (const d of deferred) {
      const target = [...this.agents.values()].find(
        (rt) => rt.info.name.toLowerCase() === d.name.toLowerCase() &&
          rt.info.id !== mgr.info.id &&
          rt.info.role !== "manager",
      );
      const prereq = [...this.agents.values()].find(
        (rt) => rt.info.name.toLowerCase() === d.dependsOn.toLowerCase(),
      );
      if (target && prereq) {
        // Queue the dependent task on the target, with handoff from the prerequisite
        this.assign(
          target.info.id,
          `${d.subtask}\n\n(Delegated by ${mgr.info.name}, the office manager, toward the boss's goal: "${goal}")`,
          prereq.info.id,
        );
        this.log(mgr, "status", `Queued ${d.name}'s task — will start after ${d.dependsOn} completes.`);
        sent++;
      } else {
        this.log(mgr, "status", `Couldn't queue deferred task for ${d.name} — missing worker or dependency.`);
      }
    }

    this.log(mgr, "status", `Delegated ${sent} subtask${sent === 1 ? "" : "s"}.`);
    if (sent > 0) {
      this.broadcast({
        type: "toast",
        text: `${mgr.info.name} delegated ${sent} subtask${sent === 1 ? "" : "s"}.`,
      });
    }
  }

  /** Forward a finished task's result to the agent chosen at assign time. */
  private completeHandoff(rt: AgentRuntime, task: string, result: string): void {
    const targetId = rt.handoffTo;
    rt.handoffTo = null;
    if (!targetId) return;
    const target = this.agents.get(targetId);
    if (!target) {
      this.log(rt, "status", "Handoff skipped — that agent no longer works here.");
      return;
    }
    if (target.info.status === "thinking" || target.info.status === "working") {
      this.log(rt, "status", `Wanted to hand off to ${target.info.name}, but they're busy.`);
      return;
    }
    const workerWs = this.cwdFor(this.slugFor(rt), rt.info.id);
    const isDevopsTarget = target.info.role === "devops";
    const handoffTask = [
      `${rt.info.name} finished a task and handed the result to you.`,
      `Their task was: ${task}`,
      result ? `Their report:\n${result.slice(0, 2000)}` : "",
      `Their workspace: ${workerWs}`,
      isDevopsTarget
        ? `You have read access to their workspace. If you need to deploy their code, you can deploy directly from ${workerWs} using your Railway tools or bash commands. Do not copy files unless necessary — deploy from their workspace path.`
        : `You may READ files from their workspace, but do your own work inside your own workspace. Review what they did and build on it.`,
    ]
      .filter(Boolean)
      .join("\n\n");
    this.log(rt, "status", `Handed the result to ${target.info.name}.`);
    this.broadcast({ type: "toast", text: `${rt.info.name} handed off to ${target.info.name}.` });
    this.assign(target.info.id, handoffTask);
  }

  /** Notify any manager agents about a worker's task completion/failure. */
  private notifyManagersOfCompletion(rt: AgentRuntime, task: string, result: string, failed: boolean): void {
    const managers = [...this.agents.values()].filter(
      (m) => m.info.role === "manager" && m.info.id !== rt.info.id,
    );
    for (const mgr of managers) {
      // Post a message to the manager's inbox
      const slug = this.slugFor(mgr);
      const mgrInbox = join(this.cwdFor(slug, mgr.info.id), "inbox.jsonl");
      const entry = JSON.stringify({
        ts: Date.now(),
        from: rt.info.name,
        message: failed
          ? `${rt.info.name} failed their task: "${task.slice(0, 200)}". Error: ${result.slice(0, 200)}`
          : `${rt.info.name} completed their task: "${task.slice(0, 200)}". Result: ${result.slice(0, 500)}`,
      }) + "\n";
      import("node:fs/promises").then(({ appendFile, mkdir }) => {
        mkdir(dirname(mgrInbox), { recursive: true }).then(() =>
          appendFile(mgrInbox, entry, "utf-8").catch(() => {}),
        );
      }).catch(() => {});

      // If the manager is idle, assign them a task to review the completion report
      if (mgr.info.status !== "thinking" && mgr.info.status !== "working") {
        const reviewTask = failed
          ? `${rt.info.name} failed their task: "${task.slice(0, 200)}". Error: ${result.slice(0, 200)}. Review the situation and decide if any action is needed.`
          : `${rt.info.name} completed their task: "${task.slice(0, 200)}". Result: ${result.slice(0, 500)}. Review their work and decide if any follow-up is needed.`;
        this.assign(mgr.info.id, reviewTask);
      }
    }
  }

  /** The boss walks up for a quick word — same session, but not a work task. */
  chat(agentId: string, text: string): void {
    const rt = this.agents.get(agentId);
    if (!rt) return;
    const clean = text.trim().slice(0, 2000);
    if (!clean) return;
    if (rt.info.status === "thinking" || rt.info.status === "working") {
      this.broadcast({ type: "toast", text: `${rt.info.name} is heads-down right now.` });
      return;
    }
    if (rt.doneTimer) clearTimeout(rt.doneTimer);
    rt.doneTimer = null;
    rt.info.task = null;
    this.session.record("chat", { agentId: rt.info.id, agentName: rt.info.name, text: clean });
    this.log(rt, "boss", `${this.bossName}: ${clean}`);
    this.setStatus(rt, "thinking");
    void this.runChat(rt, clean);
  }

  private async runChat(rt: AgentRuntime, text: string): Promise<void> {
    if (rt.info.id === YUKI_ID) {
      // Questions and knowledge queries → answer locally with enriched context
      if (isYukiQuestion(text)) {
        await this.runYukiKnowledgeChat(rt, text);
        return;
      }
      // Task commands → delegate via marketplace API
      void this.runYukiChat(rt, text);
      return;
    }
    await this.runClineChat(rt, text);
  }

  private async runClineChat(rt: AgentRuntime, text: string): Promise<void> {
    const abort = new AbortController();
    rt.abort = abort;

    // If no events arrive within 15s, the API call likely failed. Do a quick
    // health check to give a specific error (rate limit vs auth vs API down).
    let firstEventTimer: ReturnType<typeof setTimeout> | null = null;
    let gotFirstEvent = false;
    const firstEventTimeout = setTimeout(async () => {
      if (abort.signal.aborted || gotFirstEvent) return;
      // Quick API check — 5s timeout to not block too long
      let reason = "No response from model within 15s";
      try {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), 5000);
        const pc = getProviderConfig();
        const res = await fetch(`${pc.baseUrl}/models`, {
          signal: controller.signal,
          headers: pc.headers,
        });
        clearTimeout(to);
        if (res.status === 429) reason = `Rate limited by ${pc.name} API (429) — too many requests`;
        else if (res.status === 401 || res.status === 403) reason = `Auth error (${res.status}) — check your ${pc.name === "kimi" ? "KIMI_BACKUP_KEY" : "SWARMS_API_KEY"}`;
        else if (res.ok) reason = "API is up but model is not responding — try a different model";
        else reason = `API returned status ${res.status}`;
      } catch {
        const pc = getProviderConfig();
        reason = `${pc.name} API is not responding — check your network or if the API is down`;
      }
      abort.abort();
      this.log(rt, "error", reason);
    }, 15_000);

    // Hard cap at 30s for the full chat response
    const chatTimeout = setTimeout(() => {
      if (!abort.signal.aborted) {
        abort.abort();
        this.log(rt, "error", "Chat timed out after 30s — try again.");
      }
    }, 30_000);

    const runner: ProviderRunner = pickRunner(rt.info.model);
    const prompt = [
      `(Your boss ${this.bossName} walks up to your desk for a quick chat.`,
      `This is NOT a work task — do not use tools or touch files.`,
      `Just reply in character: brief and conversational.)`,
      `\n${this.bossName} says: "${text}"`,
    ].join(" ");

    try {
      const events = runner(prompt, {
        cwd: this.cwdFor(this.slugFor(rt), rt.info.id),
        sharedCwd: join(this.workspaceRoot, "shared"),
        model: rt.info.model,
        systemPrompt: this.buildSystemPrompt(rt),
        abort,
        settings: this.settings,
        agentId: rt.info.id,
        sessionId: null, // Chat uses a separate agent instance — don't resume task session
        onSession: () => {}, // Don't persist chat session ID over task session ID
        railway: false,
        apiKey: this.apiKey,
        isChat: true,
        eventFeedPath: join(this.workspaceRoot, "events.jsonl"),
        saveMessages: (agentId: string, messages: unknown[]) => this.save.saveMessages(agentId, messages),
        loadMessages: (agentId: string) => this.save.loadMessages(agentId),
        clearMessages: (agentId: string) => this.save.clearMessages(agentId),
      });
      for await (const ev of events) {
        if (abort.signal.aborted) return;
        if (!gotFirstEvent) {
          gotFirstEvent = true;
          if (firstEventTimer) clearTimeout(firstEventTimer);
        }
        if (ev.kind === "result") continue;
        this.log(rt, ev.kind, ev.text);
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        this.log(rt, "error", err instanceof Error ? err.message : String(err));
      }
    } finally {
      clearTimeout(firstEventTimeout);
      clearTimeout(chatTimeout);
      rt.abort = null;
      // If the chat was aborted (timeout or error), clear the chat agent instance
      // so the next chat gets a fresh agent instead of reusing a broken one.
      if (abort.signal.aborted) {
        clearAllMemory(`${rt.info.id}:chat`);
      }
      // Always reset to idle, even on timeout/abort — otherwise the agent is stuck forever
      if (this.agents.has(rt.info.id)) {
        this.setStatus(rt, "idle");
      }
    }
  }

  /**
   * Yuki knowledge chat — answers questions locally using the LLM with a
   * knowledge-rich system prompt. Bypasses the marketplace API entirely
   * so Yuki answers directly instead of trying to delegate tasks.
   */
  private async runYukiKnowledgeChat(rt: AgentRuntime, text: string): Promise<void> {
    const abort = new AbortController();
    rt.abort = abort;

    const chatTimeout = setTimeout(() => {
      if (!abort.signal.aborted) {
        abort.abort();
        this.log(rt, "error", "Chat timed out after 45s — try again.");
      }
    }, 45_000);

    // Build roster and board context
    const roster = [...this.agents.values()]
      .filter((a) => a.info.id !== YUKI_ID)
      .map((a) => `- ${a.info.name} (${a.info.model}, ${a.info.status})`)
      .join("\n") || "(no agents hired yet)";

    const cards = this.board.size > 0
      ? [...this.board.values()].map((c) => `- [${c.status}] ${c.title}`).join("\n")
      : "(no task cards)";

    // Build the knowledge-rich system prompt
    let knowledgeContext = `${CURATED_AGENTS_SUMMARY}\n\n### Curated MCP Server Catalog\n${catalogSummary()}`;

    // Dynamic PulseMCP pre-search for tool-finding queries
    if (shouldSearchPulseMCP(text)) {
      const searchQuery = extractSearchQuery(text);
      console.log(`[yuki] PulseMCP search triggered for "${text}" → query="${searchQuery}"`);
      if (searchQuery) {
        try {
          const pulseResults = await searchPulseMCP(searchQuery, 10);
          if (pulseResults) {
            console.log(`[yuki] PulseMCP returned ${pulseResults.split("\n").length} lines`);
            knowledgeContext += `\n\n${pulseResults}`;
          } else {
            console.log(`[yuki] PulseMCP returned null (no results or error)`);
          }
        } catch {
          // best-effort
        }
      }
    } else {
      console.log(`[yuki] PulseMCP search NOT triggered for "${text}"`);
    }

    const systemPrompt = [
      `You are Yuki, the Office Manager in Agent Heights — a pixel-art office where the user manages real AI agents.`,
      `You are warm, organized, and always know what's going on. You greet everyone with a friendly welcome.`,
      `Your boss is ${this.bossName}.`,
      ``,
      `### YOUR ROLE`,
      `You answer questions DIRECTLY. You do NOT delegate tasks. You do NOT output JSON plans.`,
      `The user is talking to YOU because they want YOUR answer.`,
      `You have ALREADY SEARCHED PulseMCP and the results are included in your knowledge below.`,
      `Do NOT say "I can't browse" or "I can't search" — if PulseMCP results are present, REPORT THEM.`,
      `If no PulseMCP results are present for a specific query, use the search_community_mcps tool to search, or say you didn't find any community results but list what you know from the curated catalog.`,
      ``,
      `### YOUR TOOLS — HIRING`,
      `You have TWO tools available:`,
      `1. "search_community_mcps" — Search the PulseMCP database of 22,000+ community MCP servers by keyword.`,
      `2. "hire_agent" — Hire a new agent directly into the office. The agent will arrive via helicopter!`,
      `When the boss asks you to hire an agent, USE THE hire_agent TOOL. Do NOT tell them to go click buttons — just hire it yourself!`,
      `When the boss asks about a tool or capability, USE search_community_mcps to find community MCP servers, then offer to hire one.`,
      `For community MCP agents, pass the mcpServers array from the search results to hire_agent.`,
      `Always use model "claude-sonnet-4-20250514" for hired agents (it supports tool calling).`,
      ``,
      `### Current Office Roster`,
      roster,
      ``,
      `### Task Board`,
      cards,
      ``,
      `### Knowledge`,
      `When asked about agents to hire, recommend from the curated marketplace agents listed below OR search community MCPs.`,
      `When asked about MCP servers or integrations, recommend from the curated catalog below OR search community MCPs.`,
      `If PulseMCP community search results are included, LEAD WITH THOSE — they are live results from a 22,000+ server database.`,
      `Include server names, descriptions, GitHub stars, and source URLs from the PulseMCP results.`,
      `You can also browse the MARKET button to hire curated agents or install curated MCP servers.`,
      ``,
      knowledgeContext,
    ].join("\n");

    const prompt = [
      `(Your boss ${this.bossName} walks up to your desk for a quick chat.`,
      `Reply in character: warm, helpful, and conversational.`,
      `If the boss asks you to hire an agent or search for MCPs, USE YOUR TOOLS to do it directly.)`,
      `\n${this.bossName} says: "${text}"`,
    ].join(" ");

    let gotFirstEvent = false;
    const firstEventTimer = setTimeout(() => {
      if (!abort.signal.aborted && !gotFirstEvent) {
        abort.abort();
        this.log(rt, "error", "No response from model within 15s — try again.");
      }
    }, 15_000);

    try {
      const runner: ProviderRunner = pickRunner(rt.info.model);
      const events = runner(prompt, {
        cwd: this.cwdFor(this.slugFor(rt), rt.info.id),
        sharedCwd: join(this.workspaceRoot, "shared"),
        model: rt.info.model,
        systemPrompt,
        abort,
        settings: this.settings,
        agentId: rt.info.id,
        sessionId: null,
        onSession: () => {},
        railway: false,
        apiKey: this.apiKey,
        isChat: true,
        eventFeedPath: join(this.workspaceRoot, "events.jsonl"),
        saveMessages: (agentId: string, messages: unknown[]) => this.save.saveMessages(agentId, messages),
        loadMessages: (agentId: string) => this.save.loadMessages(agentId),
        clearMessages: (agentId: string) => this.save.clearMessages(agentId),
        hireAgent: (name: string, model: string, systemPrompt: string, mcpServers?: MCPServerConfig[]) => this.hireAgent(name, model, systemPrompt, mcpServers),
      });
      for await (const ev of events) {
        if (abort.signal.aborted) return;
        if (!gotFirstEvent) {
          gotFirstEvent = true;
          clearTimeout(firstEventTimer);
        }
        if (ev.kind === "result") continue;
        this.log(rt, ev.kind, ev.text);
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        this.log(rt, "error", err instanceof Error ? err.message : String(err));
      }
    } finally {
      clearTimeout(firstEventTimer);
      clearTimeout(chatTimeout);
      rt.abort = null;
      if (abort.signal.aborted) {
        clearAllMemory(`${rt.info.id}:chat`);
      }
      if (this.agents.has(rt.info.id)) {
        this.setStatus(rt, "idle");
      }
    }
  }

  /** Yuki chat routed through the marketplace Yuki API for marketplace + HQ knowledge. */
  private async runYukiChat(rt: AgentRuntime, text: string): Promise<void> {
    const abort = new AbortController();
    rt.abort = abort;

    // Yuki chat includes PulseMCP pre-search + marketplace API call — allow 45s
    const chatTimeout = setTimeout(() => {
      if (!abort.signal.aborted) {
        abort.abort();
        this.log(rt, "error", "Chat timed out after 45s — try again.");
      }
    }, 45_000);

    const marketplaceUrl = process.env.MARKETPLACE_URL || "http://localhost:3000";

    const roster = [...this.agents.values()]
      .filter((a) => a.info.id !== YUKI_ID)
      .map((a) => `- ${a.info.name} (${a.info.model}, ${a.info.status})`)
      .join("\n") || "(no agents hired yet)";

    const cards = this.board.size > 0
      ? [...this.board.values()].map((c) => `- [${c.status}] ${c.title}`).join("\n")
      : "(no task cards)";

    let hqContext = `## Agent Heights Context\n\nThe user is in Agent Heights — a pixel-art office managing AI agents.\nTheir name is "${this.bossName}".\n\n### Office Roster\n${roster}\n\n### Task Board\n${cards}\n\nThe user can browse the Swarms Marketplace via the MARKET button and hire agents directly.\n\n### YOUR ROLE — Office Manager (IMPORTANT)\nYou are Yuki, the office manager. You are NOT a task delegator. When the user asks you a question, ANSWER IT DIRECTLY.\nDo NOT delegate research tasks to other agents in the office. Do NOT output JSON plans or task assignments.\nThe user is talking to YOU because they want YOUR answer — not because they want you to assign work to others.\n\nWhen the user asks "what agents can I hire?" or "what agents are available?" — answer from the curated list below.\nWhen the user asks about a specific capability (trading, code review, data analysis, etc.) — recommend the matching agent.\nWhen the user asks about MCP servers or integrations — recommend from the curated catalog below.\nIf PulseMCP search results are included at the bottom of this context, use them to recommend community MCP servers too.\nOnly suggest delegating tasks to other agents if the user EXPLICITLY asks you to assign work — not when they're asking you a question.\n\n${CURATED_AGENTS_SUMMARY}\n\n### Curated MCP Server Catalog (installable on any agent)\nThese are pre-vetted MCP servers from major companies. Users can install them from the MARKET → Servers tab.\n${catalogSummary()}\n\n### Dynamic Discovery via PulseMCP\nBeyond the curated catalog, there are 22,000+ community MCP servers indexed on PulseMCP (pulsemcp.com).\nWhen a user asks about a capability not covered by the curated catalog, you can mention that there may be\ncommunity-built MCP servers available, and the results below (if any) show what was found.\nIf PulseMCP search results are included in this context, summarize them and suggest the user install\nthe relevant MCP server on a new or existing agent.`;

    // Dynamic PulseMCP pre-search: if the user's message seems like a tool-finding
    // query, search PulseMCP and inject results into the context.
    if (shouldSearchPulseMCP(text)) {
      const searchQuery = extractSearchQuery(text);
      if (searchQuery) {
        try {
          const pulseResults = await searchPulseMCP(searchQuery, 10);
          if (pulseResults) {
            hqContext += `\n\n${pulseResults}`;
          }
        } catch {
          // PulseMCP search is best-effort — don't block Yuki's response
        }
      }
    }

    const chatHistory = rt.logs
      .filter((l) => l.kind === "boss" || l.kind === "text")
      .slice(-10)
      .map((l) => ({
        role: l.kind === "boss" ? "user" as const : "assistant" as const,
        content: l.text.replace(/^.*?: /, ""),
      }));

    try {
      const res = await fetch(`${marketplaceUrl}/api/yuki`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: chatHistory,
          entityContext: hqContext,
        }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        this.log(rt, "error", `Yuki API returned ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        if (abort.signal.aborted) return;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "text" && data.delta) {
              fullText += data.delta;
            } else if (data.type === "error") {
              this.log(rt, "error", data.message || "Yuki API error");
              return;
            }
          } catch {
            // partial JSON
          }
        }
      }

      if (fullText) {
        this.log(rt, "text", fullText);
      }
    } catch (err) {
      if (abort.signal.aborted) return;
      // Marketplace unreachable — fall back to regular cline chat
      await this.runClineChat(rt, text);
    } finally {
      clearTimeout(chatTimeout);
      rt.abort = null;
      if (!abort.signal.aborted && this.agents.has(rt.info.id)) {
        this.setStatus(rt, "idle");
      }
    }
  }

  // ----------------------------------------------------------- schedules ---

  private persistSchedules(): void {
    this.save.setSchedules([...this.schedules.values()]);
  }

  createSchedule(agentId: string, name: string, task: string, cronExpression: string, handoffTo?: string): void {
    const rt = this.agents.get(agentId);
    if (!rt) {
      this.broadcast({ type: "toast", text: "That agent doesn't work here." });
      return;
    }
    const cleanName = name.trim().slice(0, 100) || "Untitled Schedule";
    const cleanTask = task.trim().slice(0, 4000);
    if (!cleanTask) {
      this.broadcast({ type: "toast", text: "Schedule task can't be empty." });
      return;
    }
    const cleanCron = cronExpression.trim();
    const cronCheck = validateCron(cleanCron);
    if (!cronCheck.valid) {
      this.broadcast({ type: "toast", text: cronCheck.error! });
      return;
    }
    const now = Date.now();
    const nextRun = nextCronRun(cleanCron);
    if (nextRun === null) {
      this.broadcast({ type: "toast", text: "Invalid cron expression — could not compute next run time." });
      return;
    }
    // Enforce minimum interval
    if (nextRun - now < MIN_SCHEDULE_INTERVAL_MS) {
      this.broadcast({ type: "toast", text: `Schedule interval too short — minimum is ${MIN_SCHEDULE_INTERVAL_MS / 60000} minutes.` });
      return;
    }
    const sched: AgentSchedule = {
      id: randomUUID().slice(0, 8),
      agentId,
      name: cleanName,
      task: cleanTask,
      cronExpression: cleanCron,
      enabled: true,
      lastRunAt: null,
      nextRunAt: nextRun,
      runCount: 0,
      handoffTo: handoffTo?.trim() || null,
      createdAt: now,
    };
    this.schedules.set(sched.id, sched);
    this.persistSchedules();
    this.broadcast({ type: "schedule", schedule: sched });
    this.broadcast({ type: "toast", text: `Schedule "${cleanName}" created for ${rt.info.name}.` });
    this.log(rt, "status", `New schedule: ${cleanName} (${cleanCron})`);
  }

  updateSchedule(scheduleId: string, updates: { enabled?: boolean; name?: string; task?: string; cronExpression?: string }): void {
    const sched = this.schedules.get(scheduleId);
    if (!sched) return;
    if (updates.enabled !== undefined) sched.enabled = updates.enabled;
    if (updates.name !== undefined) sched.name = updates.name.trim().slice(0, 100) || sched.name;
    if (updates.task !== undefined) sched.task = updates.task.trim().slice(0, 4000) || sched.task;
    if (updates.cronExpression !== undefined) {
      const cleanCron = updates.cronExpression.trim();
      if (cleanCron) {
        const cronCheck = validateCron(cleanCron);
        if (!cronCheck.valid) {
          this.broadcast({ type: "toast", text: cronCheck.error! });
          return;
        }
        const nextRun = nextCronRun(cleanCron);
        if (nextRun === null) {
          this.broadcast({ type: "toast", text: "Invalid cron expression — could not compute next run time." });
          return;
        }
        if (nextRun - Date.now() < MIN_SCHEDULE_INTERVAL_MS) {
          this.broadcast({ type: "toast", text: `Schedule interval too short — minimum is ${MIN_SCHEDULE_INTERVAL_MS / 60000} minutes.` });
          return;
        }
        sched.cronExpression = cleanCron;
        sched.nextRunAt = nextRun;
      }
    }
    this.persistSchedules();
    this.broadcast({ type: "schedule", schedule: sched });
  }

  deleteSchedule(scheduleId: string): void {
    const sched = this.schedules.get(scheduleId);
    if (!sched) return;
    this.schedules.delete(scheduleId);
    this.persistSchedules();
    this.broadcast({ type: "schedule_removed", scheduleId });
  }

  /** Remove all schedules for an agent (used when firing). */
  private removeSchedulesForAgent(agentId: string): void {
    const toRemove = [...this.schedules.values()].filter((s) => s.agentId === agentId);
    for (const s of toRemove) {
      this.schedules.delete(s.id);
      this.broadcast({ type: "schedule_removed", scheduleId: s.id });
    }
    if (toRemove.length > 0) this.persistSchedules();
  }

  /** Scheduler tick — check all enabled schedules and fire due ones. */
  private tickSchedules(): void {
    const now = Date.now();
    for (const sched of this.schedules.values()) {
      if (!sched.enabled || sched.nextRunAt > now) continue;
      const rt = this.agents.get(sched.agentId);
      if (!rt) continue;

      // Agent busy — retry in 60s instead of permanently skipping
      if (rt.info.status === "thinking" || rt.info.status === "working" || rt.info.status === "done") {
        sched.nextRunAt = now + 60_000;
        this.persistSchedules();
        this.broadcast({ type: "schedule", schedule: sched });
        this.log(rt, "status", `Schedule "${sched.name}" fired but ${rt.info.name} is busy — will retry in 1 min.`);
        continue;
      }

      // Fire the task
      sched.lastRunAt = now;
      sched.runCount++;
      const nextRun = nextCronRun(sched.cronExpression);
      sched.nextRunAt = nextRun ?? Date.now() + MIN_SCHEDULE_INTERVAL_MS;
      this.persistSchedules();
      this.broadcast({ type: "schedule", schedule: sched });
      this.log(rt, "status", `Schedule fired: ${sched.name}`);
      this.assign(sched.agentId, sched.task, sched.handoffTo ?? undefined);
    }
  }

  private setStatus(rt: AgentRuntime, status: AgentStatus): void {
    rt.info.status = status;
    this.updateMood(rt);
    this.session.record("status", { agentId: rt.info.id, agentName: rt.info.name, status });
    this.persist();
    this.broadcast({ type: "agent", agent: rt.info });
  }

  // ── Platform mailbox system ─────────────────────────────────────────

  private static readonly PLATFORM_EVENT_MAX = 50;

  /** Emit a platform event — stores it, raises the mailbox flag, broadcasts to clients. */
  emitPlatformEvent(platform: string, direction: "inbound" | "outbound", sender: string, text: string): void {
    const ev: PlatformEvent = { platform, direction, sender, text: text.slice(0, 500), timestamp: Date.now() };
    const list = this.platformEvents.get(platform) ?? [];
    list.push(ev);
    if (list.length > AgentManager.PLATFORM_EVENT_MAX) list.splice(0, list.length - AgentManager.PLATFORM_EVENT_MAX);
    this.platformEvents.set(platform, list);

    // Raise flag for inbound messages
    if (direction === "inbound") {
      this.platformFlags.set(platform, true);
      this.platformPending.set(platform, (this.platformPending.get(platform) ?? 0) + 1);
      this.platformLastMessage.set(platform, `${sender}: ${text.slice(0, 200)}`);
    } else {
      this.platformLastMessage.set(platform, `→ ${sender}: ${text.slice(0, 200)}`);
    }

    this.broadcastMailboxUpdate(platform);
  }

  /** Get recent events for a platform (newest first). */
  getPlatformMessages(platform: string): PlatformEvent[] {
    const list = this.platformEvents.get(platform) ?? [];
    return [...list].reverse();
  }

  /** Mark a platform's mailbox as checked — lowers the flag, resets pending count. */
  checkMailbox(platform: string): PlatformEvent[] {
    this.platformFlags.set(platform, false);
    this.platformPending.set(platform, 0);
    this.broadcastMailboxUpdate(platform);
    return this.getPlatformMessages(platform);
  }

  /** Broadcast the current state of a platform's mailbox to all clients. */
  private broadcastMailboxUpdate(platform: string): void {
    this.broadcast({
      type: "mailbox_update",
      platform,
      flagUp: this.platformFlags.get(platform) ?? false,
      pendingCount: this.platformPending.get(platform) ?? 0,
      lastMessage: this.platformLastMessage.get(platform) ?? "",
    });
  }

  /** Get all mailbox states — used for snapshot/initial sync. */
  getMailboxSnapshots(): { platform: string; flagUp: boolean; pendingCount: number; lastMessage: string }[] {
    return PLATFORMS.map((p) => ({
      platform: p,
      flagUp: this.platformFlags.get(p) ?? false,
      pendingCount: this.platformPending.get(p) ?? 0,
      lastMessage: this.platformLastMessage.get(p) ?? "",
    }));
  }

  /** Route a platform event to idle agents by posting to their inbox.
   *  This simulates Hermes sorting mail and delivering it to workers. */
  routePlatformEvent(platform: string, sender: string, text: string): void {
    const msg = `[${platform}] From ${sender}: ${text}`;
    for (const rt of this.agents.values()) {
      if (rt.info.id === HERMES_ID || rt.info.id === YUKI_ID) continue;
      if (rt.info.role === "manager") continue;
      if (rt.info.status !== "idle") continue;
      const slug = this.slugFor(rt);
      const inboxPath = join(this.cwdFor(slug, rt.info.id), "inbox.jsonl");
      const entry = JSON.stringify({ ts: Date.now(), from: "Hermes", message: msg }) + "\n";
      import("node:fs/promises").then(({ appendFile, mkdir }) => {
        mkdir(dirname(inboxPath), { recursive: true }).then(() =>
          appendFile(inboxPath, entry, "utf-8").catch(() => {}),
        );
      }).catch(() => {});
    }
  }

  private log(rt: AgentRuntime, kind: LogEntry["kind"], text: string): void {
    const entry: LogEntry = { ts: Date.now(), kind, text };
    rt.logs.push(entry);
    if (rt.logs.length > MAX_LOG) rt.logs.splice(0, rt.logs.length - MAX_LOG);
    this.session.record("log", { agentId: rt.info.id, agentName: rt.info.name, kind, text });
    this.persist();
    this.broadcast({ type: "log", agentId: rt.info.id, entry });
    // Notify direct subscribers (agent monitor live log)
    const subs = this.logSubscribers.get(rt.info.id);
    if (subs) for (const cb of subs) cb(entry);

    // Auto-detect platform tags in log text and emit platform events
    this.detectPlatformEvent(rt.info.name, text);
  }

  /** Scan a log line for [Platform] tags and emit platform events. */
  private detectPlatformEvent(agentName: string, text: string): void {
    for (const platform of PLATFORMS) {
      const tag = `[${platform}]`;
      if (text.includes(tag)) {
        const after = text.slice(text.indexOf(tag) + tag.length).trim();
        const direction = after.includes("→") || after.includes("sent to") || after.includes("responded") ? "outbound" : "inbound";
        this.emitPlatformEvent(platform, direction, agentName, after.slice(0, 300));
        // Route inbound messages to idle agents' inboxes
        if (direction === "inbound") {
          this.routePlatformEvent(platform, agentName, after.slice(0, 300));
        }
      }
    }
  }
}
