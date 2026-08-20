/**
 * A/B Agent Comparison — side-by-side comparison of two agents' performance metrics.
 * Gathers task history from the manager and computes comparative statistics.
 */

import type { AgentInfo } from "../shared/types.js";

export interface AgentComparisonData {
  id: string;
  name: string;
  model: string;
  tasksDone: number;
  successRate: number;
  avgDurationMin: number;
  tasks: { task: string; success: boolean; durationMs: number; ts: number }[];
}

export interface ABComparisonResult {
  agentA: AgentComparisonData;
  agentB: AgentComparisonData;
  verdict: string;
}

export interface AgentStatsInput {
  info: AgentInfo;
  taskHistory: { task: string; success: boolean; durationMs: number; ts: number }[];
}

/** Build comparison data from an agent's stats. */
function buildAgentData(input: AgentStatsInput): AgentComparisonData {
  const history = input.taskHistory.slice(0, 20);
  const successCount = history.filter((h) => h.success).length;
  const totalDuration = history.reduce((sum, h) => sum + h.durationMs, 0);
  return {
    id: input.info.id,
    name: input.info.name,
    model: input.info.model,
    tasksDone: input.info.tasksDone,
    successRate: history.length > 0 ? successCount / history.length : 0,
    avgDurationMin: history.length > 0 ? totalDuration / history.length / 60000 : 0,
    tasks: history.map((h) => ({ task: h.task.slice(0, 100), success: h.success, durationMs: h.durationMs, ts: h.ts })),
  };
}

/** Compare two agents and produce a verdict. */
export function compareAgents(a: AgentStatsInput, b: AgentStatsInput): ABComparisonResult {
  const agentA = buildAgentData(a);
  const agentB = buildAgentData(b);

  const parts: string[] = [];

  if (agentA.tasksDone === 0 && agentB.tasksDone === 0) {
    return { agentA, agentB, verdict: "Neither agent has completed any tasks yet." };
  }

  if (agentA.successRate > agentB.successRate + 0.1) {
    parts.push(`${agentA.name} has a ${Math.round((agentA.successRate - agentB.successRate) * 100)}% higher success rate`);
  } else if (agentB.successRate > agentA.successRate + 0.1) {
    parts.push(`${agentB.name} has a ${Math.round((agentB.successRate - agentA.successRate) * 100)}% higher success rate`);
  } else {
    parts.push("Both agents have similar success rates");
  }

  if (agentA.avgDurationMin > 0 && agentB.avgDurationMin > 0) {
    if (agentA.avgDurationMin < agentB.avgDurationMin * 0.7) {
      parts.push(`${agentA.name} is significantly faster (${agentA.avgDurationMin.toFixed(1)}min vs ${agentB.avgDurationMin.toFixed(1)}min)`);
    } else if (agentB.avgDurationMin < agentA.avgDurationMin * 0.7) {
      parts.push(`${agentB.name} is significantly faster (${agentB.avgDurationMin.toFixed(1)}min vs ${agentA.avgDurationMin.toFixed(1)}min)`);
    } else {
      parts.push("task durations are comparable");
    }
  }

  if (agentA.tasksDone > agentB.tasksDone * 1.5) {
    parts.push(`${agentA.name} has completed ${Math.round(agentA.tasksDone / Math.max(1, agentB.tasksDone))}x more tasks`);
  } else if (agentB.tasksDone > agentA.tasksDone * 1.5) {
    parts.push(`${agentB.name} has completed ${Math.round(agentB.tasksDone / Math.max(1, agentA.tasksDone))}x more tasks`);
  }

  if (agentA.model !== agentB.model) {
    parts.push(`Different models: ${agentA.model} vs ${agentB.model}`);
  }

  return { agentA, agentB, verdict: parts.join("; ") + "." };
}
