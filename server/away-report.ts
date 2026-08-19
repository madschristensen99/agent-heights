/**
 * Away Report — generates a summary of what happened while the user was away.
 *
 * Reads events.jsonl from the agent manager's workspace, filters events since
 * lastActiveAt, and computes a structured report with an aspiration-aware headline.
 */

import { readFile } from "node:fs/promises";
import type { AwayReport, AwayReportEvent } from "../shared/types";
import type { AgentManager } from "./manager.js";
import { getCachedProfile } from "./aspirations.js";
import { OFFICE_MANAGER_ID, HERMES_ID, WIZARD_ID } from "../shared/types";

const MIN_AWAY_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_EVENTS = 10;

/** Format a duration in ms as a human-readable string. */
function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
  }
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Build an aspiration-aware headline for the away report. */
function buildHeadline(
  tasksCompleted: number,
  agentsHired: number,
  awayDuration: string,
  userId: string,
): string {
  if (tasksCompleted === 0 && agentsHired === 0) {
    return `Welcome back! You were away for ${awayDuration}. Nothing happened — your team is ready when you are.`;
  }

  const profile = getCachedProfile(userId);
  const dominant = profile?.dominant ?? null;

  if (tasksCompleted > 0) {
    switch (dominant) {
      case "builder":
        return `Your pipeline completed ${tasksCompleted} task${tasksCompleted === 1 ? "" : "s"} while you were away (${awayDuration}).`;
      case "strategist":
        return `Your team completed ${tasksCompleted} task${tasksCompleted === 1 ? "" : "s"} while you were away (${awayDuration}). The empire grows.`;
      case "warrior":
        return `Your squad completed ${tasksCompleted} task${tasksCompleted === 1 ? "" : "s"} while you were away (${awayDuration}). Victorious.`;
      case "explorer":
        return `${tasksCompleted} task${tasksCompleted === 1 ? "" : "s"} completed while you were away (${awayDuration}). Results are in.`;
      case "puzzle_solver":
        return `${tasksCompleted} task${tasksCompleted === 1 ? "" : "s"} solved while you were away (${awayDuration}). Clean execution.`;
      case "creator":
        return `Your team created ${tasksCompleted} thing${tasksCompleted === 1 ? "" : "s"} while you were away (${awayDuration}).`;
      default:
        return `Welcome back! ${tasksCompleted} task${tasksCompleted === 1 ? "" : "s"} completed while you were away (${awayDuration}).`;
    }
  }

  // No tasks but agents hired
  return `Welcome back! ${agentsHired} new agent${agentsHired === 1 ? "" : "s"} joined your team while you were away (${awayDuration}).`;
}

/**
 * Generate an away report for a user.
 * Returns null if the user wasn't away long enough or no events found.
 */
export async function generateAwayReport(
  manager: AgentManager,
  userId: string,
  lastActiveAt: number,
): Promise<AwayReport | null> {
  const now = Date.now();
  const awayMs = now - lastActiveAt;

  // Don't generate if away less than threshold
  if (awayMs < MIN_AWAY_MS) return null;

  // Read events.jsonl
  let events: AwayReportEvent[] = [];
  try {
    const eventPath = manager.getWorkspaceRoot() + "/events.jsonl";
    const raw = await readFile(eventPath, "utf-8");
    const lines = raw.trim().split("\n");
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.ts && entry.ts >= lastActiveAt) {
          events.push({ type: entry.type, text: entry.text, ts: entry.ts });
        }
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // File doesn't exist or can't be read — no events
  }

  // Sort most recent first, cap at MAX_EVENTS
  events.sort((a, b) => b.ts - a.ts);
  const cappedEvents = events.slice(0, MAX_EVENTS);

  // Count event types
  let tasksCompleted = 0;
  let tasksErrored = 0;
  let agentsHired = 0;

  for (const e of events) {
    if (e.type === "task_complete") tasksCompleted++;
    else if (e.type === "task_error") tasksErrored++;
    else if (e.type === "hire") agentsHired++;
  }

  // Get current state from snapshot
  const snap = manager.snapshot();
  const hireableAgents = snap.agents.filter(
    (a) => a.id !== OFFICE_MANAGER_ID && a.id !== HERMES_ID && a.id !== WIZARD_ID,
  );
  const totalTasksDone = snap.agents.reduce((sum, a) => sum + (a.tasksDone ?? 0), 0);

  // Don't show report if nothing happened
  if (tasksCompleted === 0 && tasksErrored === 0 && agentsHired === 0 && events.length === 0) {
    return null;
  }

  const awayDuration = formatDuration(awayMs);
  const headline = buildHeadline(tasksCompleted, agentsHired, awayDuration, userId);

  return {
    lastActiveAt,
    generatedAt: now,
    awayDuration,
    tasksCompleted,
    tasksErrored,
    agentsHired,
    totalTasksDone,
    currentAgentCount: hireableAgents.length,
    events: cappedEvents,
    headline,
  };
}
