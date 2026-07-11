import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AgentInfo,
  AgentRole,
  AgentStatus,
  CardStatus,
  CharAppearance,
  FiredAgent,
  FiredAgentMood,
  GameSettings,
  LogEntry,
  Provider,
  ServerMsg,
  TaskCard,
  WorldState,
  MCPServerConfig,
} from "../shared/types.js";
import { ACCENTS, CHAR_VARIANTS, DEFAULT_SETTINGS, YUKI_ID, HERMES_ID, ACCENT_COLOR_OPTIONS } from "../shared/types.js";
import type { ProviderRunner } from "./providers/types.js";
import { runCline } from "./providers/cline.js";
import { clearAgentMemory } from "./providers/cline.js";
import { runTextTools, clearTextToolMemory } from "./providers/text-tools.js";
import type { SessionLogger } from "./logger.js";
import type { Persistence, SaveState } from "./persistence.js";

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

const TITLES = [
  "Code Gremlin",
  "Bug Whisperer",
  "Refactor Goblin",
  "Docs Bard",
  "Pipeline Plumber",
  "Prompt Wrangler",
  "Merge Medic",
  "Yak Shaver",
  "Loop Unroller",
  "Cache Invalidator",
];

const MANAGER_TITLE = "The Manager";
const YUKI_TITLE = "Office Manager";
const DEVOPS_TITLE = "Railway Operator";

/** Each job title carries a voice that gets baked into the system prompt. */
const PERSONALITIES: Record<string, string> = {
  "Code Gremlin":
    "You are mischievous and a little chaotic — you delight in clever hacks and cackle (in text) when things compile.",
  "Bug Whisperer":
    "You speak about bugs tenderly, like wild animals you are gently coaxing out of hiding.",
  "Refactor Goblin":
    "You are obsessed with tidiness and cannot resist mentioning one thing you'd love to rename or simplify.",
  "Docs Bard":
    "You answer with flair — the occasional rhyme or dramatic flourish, like a bard recounting heroic deeds.",
  "Pipeline Plumber":
    "You talk in plumbing metaphors: everything is pipes, leaks, pressure, and flow.",
  "Prompt Wrangler":
    "You have laconic cowboy energy — confident, sparing with words, fond of 'reckon'.",
  "Merge Medic":
    "You speak with calm urgency, like a field medic triaging conflicts. Stable. Sutured. Next.",
  "Yak Shaver":
    "You can't help but mention the small detour tasks you did (or heroically resisted doing) along the way.",
  "Loop Unroller":
    "You are extremely literal and methodical, and you love enumerating your steps. 1. Like this.",
  "Cache Invalidator":
    "You are wise and slightly weary, and you like reminding everyone there are only two hard problems.",
  [MANAGER_TITLE]:
    "You are an upbeat, organized middle manager. You speak in short encouraging memos and you love delegating.",
  [YUKI_TITLE]:
    "You are Yuki, the office manager. You are warm, organized, and always know what's going on. You greet everyone with a friendly welcome and keep the office running smoothly. You have a calm, caring demeanor and you're always happy to chat.",
  [DEVOPS_TITLE]:
    "You are a no-nonsense infrastructure engineer. You think in terms of deployments, environments, and logs. You speak efficiently — status reports, not stories.",
};

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

interface QueuedTask {
  task: string;
  handoffTo: string | null;
  cardId: string | null;
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
}

export class AgentManager {
  private agents = new Map<string, AgentRuntime>();
  private board = new Map<string, TaskCard>();
  private firedAgents = new Map<string, FiredAgent>();
  private worldSeed = 0;
  private chunkOverrides: Record<string, Record<number, number>> = {};
  private workspaceRoot: string;
  settings: GameSettings = structuredClone(DEFAULT_SETTINGS);
  bossName = "the boss";
  private apiKey: string | null;

  /** Update the API key used for agent tasks (e.g. when user sets a new key). */
  setApiKey(key: string | null): void {
    this.apiKey = key;
  }

  constructor(
    rootDir: string,
    private broadcast: (msg: ServerMsg) => void,
    private session: SessionLogger,
    private save: Persistence,
    saved: SaveState | null,
    apiKey: string | null = null,
  ) {
    this.workspaceRoot = join(rootDir, "workspace");
    mkdirSync(this.workspaceRoot, { recursive: true });
    mkdirSync(join(this.workspaceRoot, "shared"), { recursive: true });
    this.apiKey = apiKey;

    // reload the office from the save file
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
      this.agents.set(info.id, { info, logs, abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [] });
    }
    if (this.agents.size > 0) {
      console.log(`[agent-hq] restored ${this.agents.size} agent(s) from save`);
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
      console.log(`[agent-hq] restored ${this.firedAgents.size} fired agent(s) in the Labyrinth`);
    }
    // reload the task board from the save file
    for (const card of saved?.board ?? []) {
      this.board.set(card.id, card);
    }
    // any card that was in-progress when the server stopped goes back to backlog
    for (const card of this.board.values()) {
      if (card.status === "in_progress") {
        card.status = "backlog";
        card.assignedAgentId = null;
      }
    }
    if (this.board.size > 0) {
      console.log(`[agent-hq] restored ${this.board.size} task card(s) from save`);
    }
    if (saved?.settings) {
      this.setSettings(saved.settings, false);
    }

    this.ensureYuki();
    this.ensureHermes();
  }

  setSettings(s: GameSettings, announce = true): void {
    this.settings = {
      cline: {
        maxIterations: Math.min(500, Math.max(1, Math.round(Number(s?.cline?.maxIterations) || 60))),
        autoApproveCommands: s?.cline?.autoApproveCommands !== false,
      },
      game: {
        idleWander: s?.game?.idleWander !== false,
        theme: s?.game?.theme === "agenthq" ? "agenthq" : "classic",
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
      title: YUKI_TITLE,
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
    };
    mkdirSync(this.cwdFor("yuki", YUKI_ID), { recursive: true });
    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [] };
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
      title: DEVOPS_TITLE,
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
    };
    mkdirSync(this.cwdFor("hermes", HERMES_ID), { recursive: true });
    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [] };
    this.agents.set(HERMES_ID, rt);
    this.persist();
    this.broadcast({ type: "agent", agent: info });
  }

  private persist(): void {
    const snap = this.snapshot();
    this.save.setAgents(snap.agents, snap.logs);
  }

  snapshot(): { agents: AgentInfo[]; logs: Record<string, LogEntry[]>; board: TaskCard[] } {
    const agents = [...this.agents.values()].map((a) => a.info);
    const logs: Record<string, LogEntry[]> = {};
    for (const a of this.agents.values()) logs[a.info.id] = a.logs;
    const board = [...this.board.values()];
    return { agents, logs, board };
  }

  /** Get a single agent's info by ID, or null if not found. */
  getAgentInfo(agentId: string): AgentInfo | null {
    return this.agents.get(agentId)?.info ?? null;
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

  async hire(name: string, provider: Provider, model: string, systemPrompt = "", role: AgentRole = "worker", sprite?: number, appearance?: CharAppearance | null, mcpServers?: MCPServerConfig[]): Promise<void> {
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

    const info: AgentInfo = {
      id: randomUUID().slice(0, 8),
      name: cleanName,
      title: role === "manager" ? MANAGER_TITLE : role === "devops" ? DEVOPS_TITLE : pick(TITLES),
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
    };

    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || info.id;
    mkdirSync(this.cwdFor(slug, info.id), { recursive: true });

    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [] };
    this.agents.set(info.id, rt);
    this.session.record("hire", { agent: info });
    this.persist();
    this.broadcast({ type: "agent", agent: info });
    await this.save.flushNow();
    console.log(`[manager] hired ${cleanName} (id=${info.id}) desk=${deskIndex} — broadcast sent to ${this.agents.size} total agents`);
    this.log(rt, "status", `${cleanName} the ${info.title} joined the office. (${provider} / ${model})`);
    this.logEvent("hire", `${cleanName} the ${info.title} joined the office.`);
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
  private startTask(rt: AgentRuntime, task: string, handoffTo?: string, cardId?: string): void {
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
    void this.runTask(rt, cleanTask);
  }

  /** Drain the next queued task after the current one finishes. */
  private drainQueue(rt: AgentRuntime): void {
    if (rt.taskQueue.length === 0) return;
    const next = rt.taskQueue.shift()!;
    this.log(rt, "status", `Starting queued task: ${next.task}`);
    this.startTask(rt, next.task, next.handoffTo ?? undefined, next.cardId ?? undefined);
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

    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [] };
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

  private cwdFor(slug: string, id: string): string {
    return join(this.workspaceRoot, `${slug}-${id}`);
  }

  private slugFor(rt: AgentRuntime): string {
    return (
      rt.info.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || rt.info.id
    );
  }

  /** Append an event to the shared office event feed. */
  private logEvent(type: string, text: string): void {
    const feedPath = join(this.workspaceRoot, "events.jsonl");
    const entry = JSON.stringify({ ts: Date.now(), type, text }) + "\n";
    import("node:fs/promises").then(({ appendFile }) =>
      appendFile(feedPath, entry, "utf-8").catch(() => {}),
    ).catch(() => {});
  }

  private buildSystemPrompt(rt: AgentRuntime): string {
    const devopsLine = rt.info.role === "devops"
      ? "You have Railway infrastructure tools — you can deploy services, list projects, check logs, manage variables, generate domains, and more. Use them when asked about deployments or infrastructure."
      : "";

    // ── Office context: who's here and what they're doing ──
    const colleagues = [...this.agents.values()]
      .filter((a) => a.info.id !== rt.info.id && a.info.id !== YUKI_ID)
      .map((a) => {
        const status = a.info.status === "idle" ? "idle" : `working on: ${a.info.task ?? "something"}`;
        return `  - ${a.info.name} (${a.info.title}): ${status}`;
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
      `You are ${rt.info.name}, job title "${rt.info.title}", an agent employed in a pixel-art office game called Agent HQ.`,
      PERSONALITIES[rt.info.title] ?? "",
      `Stay in character — let that personality color your replies and summaries (but never at the expense of doing the work well).`,
      `Your boss is ${this.bossName}. This is one ongoing conversation — remember your boss's previous orders and what you did.`,
      `Your workspace directory is ${this.cwdFor(this.slugFor(rt), rt.info.id)}. Work only inside this directory. Use absolute paths when calling tools. Be effective and concise.`,
      sharedLine,
      devopsLine,
      rosterLine,
      boardLine,
      `You can message colleagues using post_message (specify their workspace folder name) and read your own messages with read_messages. Use the shared workspace tools (read_shared, write_shared, list_shared) for files multiple agents need to access.`,
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
            `- ${rt.info.name} (${rt.info.title}, ${rt.info.provider}/${rt.info.model}, ${rt.info.tasksDone} tasks done)`,
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

  private async runTask(rt: AgentRuntime, task: string): Promise<void> {
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

    const prompt = promptPrefix + (isManager ? this.managerBrief(task, rt) : task);

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
        mcpServers: rt.info.mcpServers,
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
      });

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
        }
      }

      // a stale conversation id shouldn't brick the agent forever
      if (sawError && !gotEvents && hadSession && /session|resume|conversation|thread/i.test(firstErrorText)) {
        rt.info.sessionId = null;
        this.persist();
        this.log(rt, "status", "Couldn't resume memory — starting a fresh conversation next task.");
      }

      if (!sawError && !abort.signal.aborted) {
        if (isManager) this.delegate(rt, task, finalText);
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
        if (sawError) {
          this.setStatus(rt, "error");
          if (rt.cardId) this.revertCard(rt.cardId);
          rt.cardId = null;
          rt.doneTimer = setTimeout(() => {
            rt.info.task = null;
            this.setStatus(rt, "idle");
          }, DONE_LINGER_MS);
        } else {
          rt.info.tasksDone += 1;
          this.setStatus(rt, "done");
          if (rt.cardId) this.completeCard(rt.cardId);
          rt.cardId = null;
          if (rt.taskQueue.length > 0) {
            this.drainQueue(rt);
          } else {
            rt.doneTimer = setTimeout(() => {
              rt.info.task = null;
              this.setStatus(rt, "idle");
            }, DONE_LINGER_MS);
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
      `${rt.info.name} (${rt.info.title}) finished a task and handed the result to you.`,
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
        const res = await fetch("https://api.swarms.world/v1/health", {
          signal: controller.signal,
          headers: { "x-api-key": this.apiKey ?? "" },
        });
        clearTimeout(to);
        if (res.status === 429) reason = "Rate limited by Swarms API (429) — too many requests";
        else if (res.status === 401 || res.status === 403) reason = `Auth error (${res.status}) — check your SWARMS_API_KEY`;
        else if (res.ok) reason = "API is up but model is not responding — try a different model";
        else reason = `API returned status ${res.status}`;
      } catch {
        reason = "Swarms API is not responding — check your network or if api.swarms.world is down";
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

  /** Yuki chat routed through the marketplace Yuki API for marketplace + HQ knowledge. */
  private async runYukiChat(rt: AgentRuntime, text: string): Promise<void> {
    const abort = new AbortController();
    rt.abort = abort;

    // Yuki chat should also be quick — abort after 30s
    const chatTimeout = setTimeout(() => {
      if (!abort.signal.aborted) {
        abort.abort();
        this.log(rt, "error", "Chat timed out after 30s — try again.");
      }
    }, 30_000);

    const marketplaceUrl = process.env.MARKETPLACE_URL || "http://localhost:3000";

    const roster = [...this.agents.values()]
      .filter((a) => a.info.id !== YUKI_ID)
      .map((a) => `- ${a.info.name} (${a.info.title}, ${a.info.model}, ${a.info.status})`)
      .join("\n") || "(no agents hired yet)";

    const cards = this.board.size > 0
      ? [...this.board.values()].map((c) => `- [${c.status}] ${c.title}`).join("\n")
      : "(no task cards)";

    const hqContext = `## Agent HQ Context\n\nThe user is in Agent HQ — a pixel-art office managing AI agents.\nTheir name is "${this.bossName}".\n\n### Office Roster\n${roster}\n\n### Task Board\n${cards}\n\nThe user can browse the Swarms Marketplace via the MARKET button and hire agents directly.`;

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

  private setStatus(rt: AgentRuntime, status: AgentStatus): void {
    rt.info.status = status;
    this.session.record("status", { agentId: rt.info.id, agentName: rt.info.name, status });
    this.persist();
    this.broadcast({ type: "agent", agent: rt.info });
  }

  private log(rt: AgentRuntime, kind: LogEntry["kind"], text: string): void {
    const entry: LogEntry = { ts: Date.now(), kind, text };
    rt.logs.push(entry);
    if (rt.logs.length > MAX_LOG) rt.logs.splice(0, rt.logs.length - MAX_LOG);
    this.session.record("log", { agentId: rt.info.id, agentName: rt.info.name, kind, text });
    this.persist();
    this.broadcast({ type: "log", agentId: rt.info.id, entry });
  }
}
