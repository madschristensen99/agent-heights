import { mkdirSync } from "node:fs";
import { join } from "node:path";
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
} from "../shared/types.js";
import { ACCENTS, CHAR_VARIANTS, DEFAULT_SETTINGS, YUKI_ID, ACCENT_COLOR_OPTIONS } from "../shared/types.js";
import type { ProviderRunner } from "./providers/types.js";
import { runCline } from "./providers/cline.js";
import { clearAgentMemory } from "./providers/cline.js";
import type { SessionLogger } from "./logger.js";
import type { Persistence, SaveState } from "./persistence.js";

const MAX_LOG = 500;
const DONE_LINGER_MS = 6000;

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

interface AgentRuntime {
  info: AgentInfo;
  logs: LogEntry[];
  abort: AbortController | null;
  doneTimer: ReturnType<typeof setTimeout> | null;
  /** Agent id to forward the result to when the current task succeeds. */
  handoffTo: string | null;
  /** Task card this run came from, if any (for auto-moving cards on done/error). */
  cardId: string | null;
}

export class AgentManager {
  private agents = new Map<string, AgentRuntime>();
  private board = new Map<string, TaskCard>();
  private firedAgents = new Map<string, FiredAgent>();
  private worldSeed = 0;
  private workspaceRoot: string;
  settings: GameSettings = structuredClone(DEFAULT_SETTINGS);
  bossName = "the boss";

  constructor(
    rootDir: string,
    private broadcast: (msg: ServerMsg) => void,
    private session: SessionLogger,
    private save: Persistence,
    saved: SaveState | null,
  ) {
    this.workspaceRoot = join(rootDir, "workspace");
    mkdirSync(this.workspaceRoot, { recursive: true });

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
      this.agents.set(info.id, { info, logs, abort: null, doneTimer: null, handoffTo: null, cardId: null });
    }
    if (this.agents.size > 0) {
      console.log(`[agent-hq] restored ${this.agents.size} agent(s) from save`);
    }
    // reload the world state (seed + fired agents) from the save file
    const world = this.save.getWorld();
    this.worldSeed = world.seed || Math.floor(Math.random() * 0xffffffff);
    if (!world.seed) {
      this.save.setWorld({ seed: this.worldSeed, firedAgents: [] });
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
  }

  setSettings(s: GameSettings, announce = true): void {
    this.settings = {
      cline: {
        maxIterations: Math.min(500, Math.max(1, Math.round(Number(s?.cline?.maxIterations) || 60))),
        autoApproveCommands: s?.cline?.autoApproveCommands !== false,
      },
      game: {
        idleWander: s?.game?.idleWander !== false,
        theme: s?.game?.theme === "lumon" ? "lumon" : "classic",
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
    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null };
    this.agents.set(YUKI_ID, rt);
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

  worldState(): WorldState {
    return { seed: this.worldSeed, firedAgents: [...this.firedAgents.values()] };
  }

  private persistWorld(): void {
    this.save.setWorld(this.worldState());
  }

  hire(name: string, provider: Provider, model: string, systemPrompt = "", role: AgentRole = "worker", sprite?: number, appearance?: CharAppearance | null): void {
    const cleanName = name.trim().slice(0, 24) || "Agent";

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
    };

    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || info.id;
    mkdirSync(this.cwdFor(slug, info.id), { recursive: true });

    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null };
    this.agents.set(info.id, rt);
    this.session.record("hire", { agent: info });
    this.persist();
    this.broadcast({ type: "agent", agent: info });
    this.log(rt, "status", `${cleanName} the ${info.title} joined the office. (${provider} / ${model})`);
  }

  assign(agentId: string, task: string, handoffTo?: string, cardId?: string): void {
    const rt = this.agents.get(agentId);
    if (!rt) return;
    if (rt.info.status === "thinking" || rt.info.status === "working") {
      this.broadcast({ type: "toast", text: `${rt.info.name} is already busy.` });
      return;
    }
    const cleanTask = task.trim();
    if (!cleanTask) return;

    if (rt.doneTimer) clearTimeout(rt.doneTimer);
    rt.doneTimer = null;
    rt.info.task = cleanTask;
    const target = handoffTo && handoffTo !== agentId ? this.agents.get(handoffTo) : undefined;
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
    if (!rt || !rt.abort) return;
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
    clearAgentMemory(agentId);
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
      clearAgentMemory(rt.info.id);
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

  fire(agentId: string): void {
    if (agentId === YUKI_ID) {
      this.broadcast({ type: "toast", text: "You can't fire Yuki — she runs this office." });
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
  }

  /** Re-hire a fired agent from the Labyrinth — memory intact. */
  recruit(firedAgentId: string): void {
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

    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null };
    this.agents.set(info.id, rt);
    this.session.record("recruit", { agentId: info.id, agentName: info.name });
    this.persist();
    this.broadcast({ type: "agent", agent: info });
    this.broadcast({ type: "fired_agent_removed", agentId: fa.id });
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

  private buildSystemPrompt(rt: AgentRuntime): string {
    const devopsLine = rt.info.role === "devops"
      ? "You have Railway infrastructure tools — you can deploy services, list projects, check logs, manage variables, generate domains, and more. Use them when asked about deployments or infrastructure."
      : "";
    return [
      `You are ${rt.info.name}, job title "${rt.info.title}", an agent employed in a pixel-art office game called Agent HQ.`,
      PERSONALITIES[rt.info.title] ?? "",
      `Stay in character — let that personality color your replies and summaries (but never at the expense of doing the work well).`,
      `Your boss is ${this.bossName}. This is one ongoing conversation — remember your boss's previous orders and what you did.`,
      `Work only inside your workspace directory. Be effective and concise.`,
      devopsLine,
      `When you finish, summarize what you did in a few short lines.`,
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
      `Do not use any tools and do not do the work yourself. Reply with ONLY a JSON array, no markdown fences, like:\n[{"name":"Pixel","task":"..."}]`,
      `If nobody is free, reply [].`,
    ].join("\n\n");
  }

  private async runTask(rt: AgentRuntime, task: string): Promise<void> {
    const abort = new AbortController();
    rt.abort = abort;

    const runner: ProviderRunner = runCline;
    const slug = this.slugFor(rt);
    const systemPrompt = this.buildSystemPrompt(rt);
    const isManager = rt.info.role === "manager";
    const prompt = isManager ? this.managerBrief(task, rt) : task;

    let sawError = false;
    let gotEvents = false;
    let firstErrorText = "";
    let finalText = "";
    const hadSession = rt.info.sessionId != null;
    try {
      const events = runner(prompt, {
        cwd: this.cwdFor(slug, rt.info.id),
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
      });

      for await (const ev of events) {
        if (abort.signal.aborted) return;
        if (rt.info.status === "thinking") this.setStatus(rt, "working");

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
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        sawError = true;
        this.log(rt, "error", err instanceof Error ? err.message : String(err));
      }
    } finally {
      rt.abort = null;
      rt.handoffTo = null;
      if (!abort.signal.aborted && this.agents.has(rt.info.id)) {
        if (sawError) {
          this.setStatus(rt, "error");
          if (rt.cardId) this.revertCard(rt.cardId);
        } else {
          rt.info.tasksDone += 1;
          this.setStatus(rt, "done");
          if (rt.cardId) this.completeCard(rt.cardId);
        }
        rt.cardId = null;
        rt.doneTimer = setTimeout(() => {
          rt.info.task = null;
          this.setStatus(rt, "idle");
        }, DONE_LINGER_MS);
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

    let sent = 0;
    for (const item of plan) {
      const name = String((item as { name?: unknown })?.name ?? "").trim();
      const subtask = String((item as { task?: unknown })?.task ?? "").trim();
      if (!name || !subtask) continue;
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
      if (target.info.status === "thinking" || target.info.status === "working") {
        this.log(mgr, "status", `Skipped ${target.info.name} — they got busy in the meantime.`);
        continue;
      }
      this.assign(
        target.info.id,
        `${subtask}\n\n(Delegated by ${mgr.info.name}, the office manager, toward the boss's goal: "${goal}")`,
      );
      sent++;
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
    const handoffTask = [
      `${rt.info.name} (${rt.info.title}) finished a task and handed the result to you.`,
      `Their task was: ${task}`,
      result ? `Their report:\n${result.slice(0, 2000)}` : "",
      `Their workspace, for reference: ${this.cwdFor(this.slugFor(rt), rt.info.id)}`,
      `You may READ files from their workspace, but do your own work inside your own workspace. Review what they did and build on it.`,
    ]
      .filter(Boolean)
      .join("\n\n");
    this.log(rt, "status", `Handed the result to ${target.info.name}.`);
    this.broadcast({ type: "toast", text: `${rt.info.name} handed off to ${target.info.name}.` });
    this.assign(target.info.id, handoffTask);
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
    const abort = new AbortController();
    rt.abort = abort;

    const runner: ProviderRunner = runCline;
    const prompt = [
      `(Your boss ${this.bossName} walks up to your desk for a quick chat.`,
      `This is NOT a work task — do not use tools or touch files.`,
      `Just reply in character: brief and conversational.)`,
      `\n${this.bossName} says: "${text}"`,
    ].join(" ");

    try {
      const events = runner(prompt, {
        cwd: this.cwdFor(this.slugFor(rt), rt.info.id),
        model: rt.info.model,
        systemPrompt: this.buildSystemPrompt(rt),
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
        railway: false,
      });
      for await (const ev of events) {
        if (abort.signal.aborted) return;
        if (ev.kind === "result") continue; // "task complete" noise has no place in a chat
        this.log(rt, ev.kind, ev.text);
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        this.log(rt, "error", err instanceof Error ? err.message : String(err));
      }
    } finally {
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
