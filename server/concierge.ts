/**
 * Office Manager Concierge — server-side engagement tracker.
 *
 * Evaluates user state every 60s during an active session and generates
 * LLM-based nudges from the Office Manager character. Rate-limited:
 * 1 nudge per 8 minutes, max 2 per session.
 */

import type { AgentInfo, TaskCard } from "../shared/types";
import { getCachedProfile, type AspirationType } from "./aspirations.js";

type DialectStyle = string | null;

/** Dialect-aware greeting prefix for the Office Manager. */
function dialectGreet(style: DialectStyle, bossName: string): string {
  switch (style) {
    case "street_urban": return `Yo ${bossName}`;
    case "hawaiian_pidgin": return `Eh ${bossName}`;
    case "southern_1812": return `Good day, ${bossName}`;
    default: return bossName;
  }
}

/** Pick a dialect-specific message variant, falling back to default. */
function dialectNudge(style: DialectStyle, variants: { default: string; street_urban?: string; hawaiian_pidgin?: string; southern_1812?: string }): string {
  switch (style) {
    case "street_urban": return variants.street_urban ?? variants.default;
    case "hawaiian_pidgin": return variants.hawaiian_pidgin ?? variants.default;
    case "southern_1812": return variants.southern_1812 ?? variants.default;
    default: return variants.default;
  }
}

const NUDGE_COOLDOWN_MS = 8 * 60 * 1000; // 8 minutes between nudges
const MAX_NUDGES_PER_SESSION = 2;
const EVAL_INTERVAL_MS = 60 * 1000; // evaluate every 60s

interface ConciergeState {
  nudgesThisSession: number;
  lastNudgeAt: number;
  lastNudgeId: string | null;
  sessionStartAt: number;
  dismissedIds: Set<string>;
  // Engagement signals
  lastAgentCount: number;
  lastTaskCount: number;
  lastChatAt: number;
  hasExploredWorld: boolean;
  hasHiredFromMarket: boolean;
  hasConnectedPlatform: boolean;
  hasOpenedAchievements: boolean;
  idleSince: number;
}

/** Per-user concierge state, keyed by userId. */
const states = new Map<string, ConciergeState>();

function getOrCreateState(userId: string): ConciergeState {
  let s = states.get(userId);
  if (!s) {
    s = {
      nudgesThisSession: 0,
      lastNudgeAt: 0,
      lastNudgeId: null,
      sessionStartAt: Date.now(),
      dismissedIds: new Set(),
      lastAgentCount: 0,
      lastTaskCount: 0,
      lastChatAt: 0,
      hasExploredWorld: false,
      hasHiredFromMarket: false,
      hasConnectedPlatform: false,
      hasOpenedAchievements: false,
      idleSince: Date.now(),
    };
    states.set(userId, s);
  }
  return s;
}

/** Called when user session starts — resets concierge state. */
export function startSession(userId: string): void {
  states.delete(userId);
  getOrCreateState(userId);
}

/** Called when user dismisses a nudge. */
export function dismissNudge(userId: string, nudgeId: string): void {
  const s = states.get(userId);
  if (s) s.dismissedIds.add(nudgeId);
}

/** Update engagement signals from client activity. */
export function trackActivity(
  userId: string,
  signals: {
    agentCount?: number;
    taskCount?: number;
    chatted?: boolean;
    exploredWorld?: boolean;
    hiredFromMarket?: boolean;
    connectedPlatform?: boolean;
    openedAchievements?: boolean;
  },
): void {
  const s = getOrCreateState(userId);
  if (signals.agentCount !== undefined) s.lastAgentCount = signals.agentCount;
  if (signals.taskCount !== undefined) s.lastTaskCount = signals.taskCount;
  if (signals.chatted) s.lastChatAt = Date.now();
  if (signals.exploredWorld) s.hasExploredWorld = true;
  if (signals.hiredFromMarket) s.hasHiredFromMarket = true;
  if (signals.connectedPlatform) s.hasConnectedPlatform = true;
  if (signals.openedAchievements) s.hasOpenedAchievements = true;
  s.idleSince = Date.now();
}

export interface ConciergeNudge {
  nudgeId: string;
  text: string;
  actionLabel: string | null;
  actionType: string | null;
}

/**
 * Evaluate whether to send a nudge. Returns a nudge if one should be sent,
 * or null if rate-limited / no relevant nudge.
 */
export function evaluateNudge(
  userId: string,
  context: {
    agents: AgentInfo[];
    board: TaskCard[];
    bossName: string;
    hasPlatform: boolean;
    subscriptionTier: string | null;
    dialectStyle: string | null;
  },
): ConciergeNudge | null {
  const s = getOrCreateState(userId);
  const now = Date.now();

  // Rate limit: 1 per 5 min, 3 per session
  if (s.nudgesThisSession >= MAX_NUDGES_PER_SESSION) return null;
  if (now - s.lastNudgeAt < NUDGE_COOLDOWN_MS) return null;

  // Don't nudge if user was active in the last 30s (they're engaged)
  if (now - s.idleSince < 30_000) return null;

  const profile = getCachedProfile(userId);
  const dominant = profile?.dominant ?? null;

  const nudge = pickNudge(s, context, now, dominant);
  if (!nudge) return null;

  s.nudgesThisSession++;
  s.lastNudgeAt = now;
  s.lastNudgeId = nudge.nudgeId;
  return nudge;
}

function pickNudge(
  s: ConciergeState,
  ctx: {
    agents: AgentInfo[];
    board: TaskCard[];
    bossName: string;
    hasPlatform: boolean;
    subscriptionTier: string | null;
    dialectStyle: string | null;
  },
  now: number,
  dominant: AspirationType | null,
): ConciergeNudge | null {
  const { agents, board, bossName, hasPlatform, dialectStyle } = ctx;
  const greet = dialectGreet(dialectStyle, bossName);
  const hireable = agents.filter(
    (a) => a.id !== "office-manager" && a.id !== "hermes" && a.id !== "wizard",
  );
  const idleAgents = hireable.filter((a) => a.status === "idle");
  const busyAgents = hireable.filter((a) => a.status === "working" || a.status === "thinking");
  const pendingTasks = board.filter((c) => c.status === "backlog" || c.status === "in_progress");
  const sessionMinutes = Math.floor((now - s.sessionStartAt) / 60000);
  const idleMinutes = Math.floor((now - s.idleSince) / 60000);
  const timeSinceChat = Math.floor((now - s.lastChatAt) / 60000);

  // ── Critical nudges (always fire regardless of aspiration) ──

  // Priority 1: New user with no agents — suggest hiring
  if (hireable.length === 0 && sessionMinutes >= 2) {
    return {
      nudgeId: `nudge-hire-${now}`,
      text: dialectNudge(dialectStyle, {
        default: `${greet}, your office is ready and waiting. Want to hire your first agent to get things started?`,
        street_urban: `${greet}, the office is set up and looking fresh. Ready to bring in your first agent?`,
        hawaiian_pidgin: `${greet}, your office is all ready. How about hiring your first agent to get things going?`,
        southern_1812: `${greet}, your office is prepared and awaiting company. Might I suggest hiring your first agent?`,
      }),
      actionLabel: "Open Market",
      actionType: "open_market",
    };
  }

  // Priority 2: Idle agents + pending tasks — suggest assigning work
  if (idleAgents.length > 0 && pendingTasks.length > 0) {
    const names = idleAgents.slice(0, 2).map((a) => a.name).join(" and ");
    const isPlural = idleAgents.length !== 1;
    return {
      nudgeId: `nudge-assign-${now}`,
      text: dialectNudge(dialectStyle, {
        default: `${greet}, ${names} ${isPlural ? "are" : "is"} available and you have ${pendingTasks.length} task${pendingTasks.length === 1 ? "" : "s"} ready to go. Want me to help assign them?`,
        street_urban: `${greet}, ${names} ${isPlural ? "are" : "is"} free and you got ${pendingTasks.length} task${pendingTasks.length === 1 ? "" : "s"} waiting. Let's get them working.`,
        hawaiian_pidgin: `${greet}, ${names} ${isPlural ? "are" : "is"} all free and you get ${pendingTasks.length} task${pendingTasks.length === 1 ? "" : "s"} waiting. How about assigning them?`,
        southern_1812: `${greet}, ${names} ${isPlural ? "are" : "is"} at leisure and you have ${pendingTasks.length} task${pendingTasks.length === 1 ? "" : "s"} awaiting attention. Shall I help assign them?`,
      }),
      actionLabel: "View Task Board",
      actionType: "open_board",
    };
  }

  // Priority 3: All agents busy — suggest hiring more
  if (hireable.length > 0 && idleAgents.length === 0 && busyAgents.length >= hireable.length && pendingTasks.length > 2) {
    return {
      nudgeId: `nudge-busy-${now}`,
      text: dialectNudge(dialectStyle, {
        default: `${greet}, all ${hireable.length} agents are busy and you have ${pendingTasks.length} tasks queued. Hiring another agent could help keep things moving.`,
        street_urban: `${greet}, all ${hireable.length} agents are grinding and ${pendingTasks.length} tasks are backed up. Hiring another agent could help keep things moving.`,
        hawaiian_pidgin: `${greet}, all ${hireable.length} agents stay busy and you get ${pendingTasks.length} tasks waiting. Maybe hire one more agent for help?`,
        southern_1812: `${greet}, all ${hireable.length} agents are occupied and ${pendingTasks.length} tasks await. Perhaps hiring another agent would ease the burden?`,
      }),
      actionLabel: "Hire Agent",
      actionType: "open_market",
    };
  }

  // ── Aspiration-aware nudges ──
  // Build candidate nudges, then pick the one matching the user's dominant aspiration.
  // If no dominant yet (cold start), rotate through all as probes.

  const candidates: { aspiration: AspirationType; nudge: ConciergeNudge }[] = [];

  // Builder: pipeline / automation satisfaction
  if (busyAgents.length >= 2 && sessionMinutes >= 4) {
    candidates.push({
      aspiration: "builder",
      nudge: {
        nudgeId: `nudge-builder-${now}`,
        text: dialectNudge(dialectStyle, {
          default: `${busyAgents.length} agents working in parallel — great throughput. Have you considered setting up a schedule? A cron-triggered pipeline can keep things running even when you're away.`,
          street_urban: `${busyAgents.length} agents going hard. You should set up a schedule so they keep running while you're out. That's how you build something real.`,
          hawaiian_pidgin: `${busyAgents.length} agents all working together. You should try setting up a schedule — they can keep going even when you stay away.`,
          southern_1812: `${busyAgents.length} agents working in fine parallel. Might I suggest a schedule? A timed pipeline would keep the work flowing in your absence.`,
        }),
        actionLabel: "Open Settings",
        actionType: "open_settings",
      },
    });
  }

  // Explorer: suggest trying new tools / MCP servers
  if (hireable.length > 0 && sessionMinutes >= 5) {
    candidates.push({
      aspiration: "explorer",
      nudge: {
        nudgeId: `nudge-explorer-${now}`,
        text: dialectNudge(dialectStyle, {
          default: `There are new MCP servers in the marketplace — GitHub, Notion, Slack. Your agents could do a lot more with the right tools. Worth a look?`,
          street_urban: `Yo, new MCP servers just dropped. GitHub, Notion, Slack — your agents could be doing way more. Check the market.`,
          hawaiian_pidgin: `Eh, get new MCP servers in the marketplace. GitHub, Notion, Slack — your agents could do plenty more with the right tools.`,
          southern_1812: `New MCP servers have arrived in the marketplace. GitHub, Notion, Slack — your agents might benefit from expanded capabilities.`,
        }),
        actionLabel: "Open Market",
        actionType: "open_market",
      },
    });
  }

  // Puzzle solver: suggest task decomposition
  if (hireable.length > 0 && pendingTasks.length > 0 && sessionMinutes >= 4) {
    candidates.push({
      aspiration: "puzzle_solver",
      nudge: {
        nudgeId: `nudge-puzzle-${now}`,
        text: dialectNudge(dialectStyle, {
          default: `You have ${pendingTasks.length} task${pendingTasks.length === 1 ? "" : "s"} on the board. If you'd like, I can help decompose them into a dependency graph — a well-structured plan makes everything smoother.`,
          street_urban: `You got ${pendingTasks.length} task${pendingTasks.length === 1 ? "" : "s"} on the board. I can help you break them down into a solid plan with dependencies. That's how you stay organized.`,
          hawaiian_pidgin: `You get ${pendingTasks.length} task${pendingTasks.length === 1 ? "" : "s"} on the board. I can help break them down into a nice plan with dependencies. Makes everything go smoother.`,
          southern_1812: `You have ${pendingTasks.length} task${pendingTasks.length === 1 ? "" : "s"} on the board. I would be happy to help decompose them into a structured plan with dependencies.`,
        }),
        actionLabel: "View Task Board",
        actionType: "open_board",
      },
    });
  }

  // Creator: suggest customization
  if (sessionMinutes >= 6) {
    candidates.push({
      aspiration: "creator",
      nudge: {
        nudgeId: `nudge-creator-${now}`,
        text: dialectNudge(dialectStyle, {
          default: `${greet}, new themes, outfits, and decorations are available in settings. A fresh look might be just the thing for the office.`,
          street_urban: `${greet}, new themes and fits just dropped in settings. Give the office a new look, you know?`,
          hawaiian_pidgin: `${greet}, get new themes and outfits in settings. Maybe give the office a fresh look, yeah?`,
          southern_1812: `${greet}, new themes and decorations are available in settings. A fresh appearance might suit the office nicely.`,
        }),
        actionLabel: "Open Settings",
        actionType: "open_settings",
      },
    });
  }

  // Strategist: suggest org / long-term planning
  if (hireable.length >= 2 && sessionMinutes >= 6) {
    candidates.push({
      aspiration: "strategist",
      nudge: {
        nudgeId: `nudge-strategist-${now}`,
        text: dialectNudge(dialectStyle, {
          default: `${hireable.length} agents — solid roster. Have you checked the leaderboards or considered creating an org? There's a competitive layer worth exploring.`,
          street_urban: `${hireable.length} agents — that's a real squad. You should check the leaderboards or start an org. There's a whole competitive side to this.`,
          hawaiian_pidgin: `${hireable.length} agents — solid team. You should check the leaderboards or make an org. Get competitive, you know?`,
          southern_1812: `${hireable.length} agents — a fine roster. Have you consulted the leaderboards or considered forming an organization? The competitive layer awaits.`,
        }),
        actionLabel: "View Leaderboards",
        actionType: "open_leaderboards",
      },
    });
  }

  // Warrior: suggest world exploration / combat
  if (!s.hasExploredWorld && sessionMinutes >= 5 && hireable.length > 0) {
    candidates.push({
      aspiration: "warrior",
      nudge: {
        nudgeId: `nudge-explore-${now}`,
        text: dialectNudge(dialectStyle, {
          default: `${greet}, there's a whole world outside with creatures to hunt and biomes to explore. When you're ready, step out the door and see what's out there.`,
          street_urban: `${greet}, there's a whole world outside. Creatures to hunt, places to explore. Step out when you're ready.`,
          hawaiian_pidgin: `${greet}, get one whole world outside. Creatures to hunt, biomes to explore. Go check it out when you ready.`,
          southern_1812: `${greet}, a vast world lies beyond yon door. Creatures to hunt, biomes to explore. Pray venture forth when you are ready.`,
        }),
        actionLabel: null,
        actionType: null,
      },
    });
  }

  // Platform connection (universal, but lower priority)
  if (!hasPlatform && !s.hasConnectedPlatform && sessionMinutes >= 8) {
    candidates.push({
      aspiration: "builder",
      nudge: {
        nudgeId: `nudge-platform-${now}`,
        text: dialectNudge(dialectStyle, {
          default: `${greet}, your agents finish tasks but you might not hear about it. Connecting Telegram or Slack would keep you in the loop. Want to set that up?`,
          street_urban: `${greet}, your agents finish tasks and you don't even know. Hook up Telegram or Slack so you stay in the loop.`,
          hawaiian_pidgin: `${greet}, your agents finish tasks but you might not hear. Connect Telegram or Slack so you stay updated, yeah?`,
          southern_1812: `${greet}, your agents complete tasks but notification may elude you. Connecting Telegram or Slack would keep you informed. Shall we set that up?`,
        }),
        actionLabel: "Connect Platform",
        actionType: "open_settings",
      },
    });
  }

  // ── Select candidate based on dominant aspiration ──

  if (candidates.length === 0) {
    // Fallback: long idle check-in (profile-aware)
    if (idleMinutes >= 5 && timeSinceChat >= 5) {
      const tips = getAspirationIdleTips(bossName, dominant);
      return {
        nudgeId: `nudge-idle-${now}`,
        text: tips[Math.floor(Math.random() * tips.length)],
        actionLabel: null,
        actionType: null,
      };
    }

    // Fallback: hasn't checked achievements
    if (!s.hasOpenedAchievements && sessionMinutes >= 10) {
      return {
        nudgeId: `nudge-achievements-${now}`,
        text: dialectNudge(dialectStyle, {
          default: `By the way, you might have unlocked some achievements by now. The trophy case shows your progress — there's a whole combat record to build up!`,
          street_urban: `Yo, you might have unlocked some achievements by now. Check the trophy case — your combat record is stacking up.`,
          hawaiian_pidgin: `Eh, you might have unlocked some achievements already. Check the trophy case — your combat record is growing!`,
          southern_1812: `By the by, you may have unlocked some achievements. The trophy case displays your progress — quite the combat record to build!`,
        }),
        actionLabel: "View Achievements",
        actionType: "open_achievements",
      };
    }

    return null;
  }

  // If we have a dominant aspiration, prefer matching candidates
  if (dominant) {
    const match = candidates.find((c) => c.aspiration === dominant);
    if (match) return match.nudge;
  }

  // Cold start or no match: rotate through candidates as probes
  // Use nudge count as rotation index for variety
  const idx = s.nudgesThisSession % candidates.length;
  return candidates[idx].nudge;
}

/** Get aspiration-flavored idle tips. */
function getAspirationIdleTips(bossName: string, dominant: AspirationType | null): string[] {
  switch (dominant) {
    case "builder":
      return [
        `Everything running smoothly, ${bossName}? A good time to set up a scheduled task — a pipeline that runs while you sleep keeps things moving.`,
        `Quiet in the office. Perfect time to design an automation chain. I can help you set one up whenever you're ready.`,
      ];
    case "explorer":
      return [
        `Hey ${bossName}, want to try a new MCP server? There might be tools that unlock new capabilities for your agents.`,
        `Quiet moment — a good time to experiment with a different agent model. I can walk you through the options.`,
      ];
    case "puzzle_solver":
      return [
        `Everything running smoothly, ${bossName}? If you'd like, I can help review the task board and find any bottlenecks.`,
        `Quiet in the office. Want to review the task board? I can help spot any dependencies that need attention.`,
      ];
    case "creator":
      return [
        `Hey ${bossName}, want to customize the office? New themes, outfits, and decorations are available in settings.`,
        `Quiet moment — a good time to give your office a fresh look. The wardrobe and theme options are ready when you are.`,
      ];
    case "strategist":
      return [
        `Everything running smoothly, ${bossName}? The leaderboards are updating in real time — a good time to check your standing.`,
        `Quiet in the office. Good time to plan your next hire or consider creating an org. I'm here to help with either.`,
      ];
    default: // warrior or null
      return [
        `Everything running smoothly, ${bossName}? I can decompose a goal into subtasks if you want to get the team moving.`,
        `Quiet in the office. Want to check the task board, or maybe step outside for a bit? There's a whole world to explore.`,
        `Hey ${bossName}, if you're stuck on what to do next, try giving the team a new goal — I'll break it down into tasks for you.`,
      ];
  }
}

/** Get the evaluation interval in milliseconds. */
export const CONCIERGE_EVAL_INTERVAL = EVAL_INTERVAL_MS;
