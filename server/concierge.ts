/**
 * Office Manager Concierge — server-side engagement tracker.
 *
 * Evaluates user state every 60s during an active session and generates
 * LLM-based nudges from the Office Manager character. Rate-limited:
 * 1 nudge per 5 minutes, max 3 per session.
 */

import type { AgentInfo, TaskCard } from "../shared/types";
import { getCachedProfile, type AspirationType } from "./aspirations.js";

const NUDGE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between nudges
const MAX_NUDGES_PER_SESSION = 3;
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
  },
  now: number,
  dominant: AspirationType | null,
): ConciergeNudge | null {
  const { agents, board, bossName, hasPlatform } = ctx;
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
      text: `Lovely office, ${bossName}. Very spacious. Almost... too spacious. Want to hire someone so it doesn't feel like a mausoleum?`,
      actionLabel: "Open Market",
      actionType: "open_market",
    };
  }

  // Priority 2: Idle agents + pending tasks — suggest assigning work
  if (idleAgents.length > 0 && pendingTasks.length > 0) {
    const names = idleAgents.slice(0, 2).map((a) => a.name).join(" and ");
    return {
      nudgeId: `nudge-assign-${now}`,
      text: `${names} ${idleAgents.length === 1 ? "is" : "are"} staring at the ceiling and you have ${pendingTasks.length} task${pendingTasks.length === 1 ? "" : "s"} collecting dust. I'm not saying there's a connection, but... there's a connection.`,
      actionLabel: "View Task Board",
      actionType: "open_board",
    };
  }

  // Priority 3: All agents busy — suggest hiring more
  if (hireable.length > 0 && idleAgents.length === 0 && busyAgents.length >= hireable.length && pendingTasks.length > 2) {
    return {
      nudgeId: `nudge-busy-${now}`,
      text: `All ${hireable.length} agents are working. Every. Single. One. Meanwhile you have ${pendingTasks.length} tasks piling up. Either hire someone or lower your ambitions.`,
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
        text: `${busyAgents.length} agents working in parallel. Beautiful. But are they on a schedule? A cron-triggered pipeline runs while you sleep. Think about it.`,
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
        text: `There are new MCP servers in the marketplace. GitHub, Notion, Slack — your agents could be doing so much more. Or they could keep doing what they're doing. Your call.`,
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
        text: `You have ${pendingTasks.length} task${pendingTasks.length === 1 ? "" : "s"} on the board. You could just assign them. Or you could decompose them into a beautiful dependency graph and feel the satisfaction of a well-structured plan. Your choice.`,
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
        text: `Nice office, ${bossName}. Same office as yesterday though. New themes, outfits, and decorations are waiting in settings. You wouldn't wear the same outfit every day, would you? ... Would you?`,
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
        text: `${hireable.length} agents. Solid roster. But are you on the leaderboard? Have you created an org? There's a whole competitive layer you're ignoring, and it's ignoring you back.`,
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
        text: `You've been in the office for ${sessionMinutes} minutes, ${bossName}. There's a whole world outside with creatures that need slaying. But sure, let's stay inside. The creatures will wait. They're patient.`,
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
        text: `Your agents finish tasks and nobody tells you. That's the setup for a very lonely notification center. Want to connect Telegram or Slack so you actually know when things happen?`,
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
        text: `By the way, you might have unlocked some achievements by now. Click the trophy case to check your progress — there's a whole combat record to build up!`,
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
        `Everything running smoothly, ${bossName}? Or as I like to call it — suspiciously quiet. Want to set up a scheduled task? A pipeline that runs while you sleep is a pipeline that never complains.`,
        `Quiet in the office. A good time to design an automation chain. Or you could just sit here. The agents are watching you watch them. It's awkward.`,
      ];
    case "explorer":
      return [
        `Hey ${bossName}, want to try a new MCP server? There might be tools that unlock new capabilities. Or there might not be. That's the fun part.`,
        `Quiet moment — perfect time to experiment with a different agent model. Or you could keep using the same one forever. Some people eat the same lunch every day too. No judgment.`,
      ];
    case "puzzle_solver":
      return [
        `Everything running smoothly, ${bossName}? You know what they say — if it ain't broke, break it down into subtasks and rebuild it better.`,
        `Quiet in the office. Want to review the task board? There's probably a bottleneck hiding in there. Bottlenecks love quiet. They think nobody's looking.`,
      ];
    case "creator":
      return [
        `Hey ${bossName}, want to customize the office? New themes, outfits, and decorations are available. The agents won't judge. They can't judge. They're AI.`,
        `Quiet moment — perfect time to give your office a fresh look. Or keep it exactly the same. Some people like monotony. I'm told it's comforting.`,
      ];
    case "strategist":
      return [
        `Everything running smoothly, ${bossName}? The leaderboards are updating in real time. Every minute you're not checking them, someone else is climbing past you.`,
        `Quiet in the office. Good time to plan your next hire. Or create an org. Or stare at the wall. The wall will still be there. The competitive advantage won't.`,
      ];
    default: // warrior or null
      return [
        `Everything running smoothly, ${bossName}? I can decompose a goal into subtasks if you want to get the team moving. Or you could go outside and hit something. Both are valid.`,
        `Quiet in the office. Want to check the task board, or maybe step outside for a bit? There might be something interesting out there. Or something that bites. 50/50 really.`,
        `Hey ${bossName}, if you're stuck on what to do next, try giving the team a new goal — I'll break it down into tasks for you. That's literally my job. I'm very good at my job. I'm also always at my desk, which is why I'm so good at my job.`,
      ];
  }
}

/** Get the evaluation interval in milliseconds. */
export const CONCIERGE_EVAL_INTERVAL = EVAL_INTERVAL_MS;
