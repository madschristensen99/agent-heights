/**
 * Resource Allocation — budget/energy allocation across agents.
 * Forces strategic trade-offs by giving each agent a budget that limits
 * how many tasks they can run per cycle.
 */

import type { AgentInfo } from "../shared/types.js";

export interface ResourceAllocation {
  totalBudget: number;
  allocations: { agentId: string; agentName: string; budget: number; utilization: number }[];
}

const DEFAULT_BUDGET = 100;

/** Compute current resource allocation state. */
export function getAllocation(
  agents: AgentInfo[],
  allocations: Map<string, number>,
  utilizationData: Map<string, number>,
): ResourceAllocation {
  const totalBudget = DEFAULT_BUDGET;
  const result = agents
    .filter((a) => a.id !== "office-manager" && a.id !== "hermes" && a.id !== "wizard")
    .map((a) => ({
      agentId: a.id,
      agentName: a.name,
      budget: allocations.get(a.id) ?? Math.floor(DEFAULT_BUDGET / Math.max(1, agents.length - 3)),
      utilization: utilizationData.get(a.id) ?? 0,
    }));

  return { totalBudget, allocations: result };
}

/** Validate and apply new budget allocations. Returns error message or null. */
export function validateAllocations(
  agents: AgentInfo[],
  allocations: { agentId: string; budget: number }[],
): string | null {
  const validIds = new Set(agents.map((a) => a.id));
  let total = 0;
  for (const alloc of allocations) {
    if (!validIds.has(alloc.agentId)) return `Agent ${alloc.agentId} not found`;
    if (alloc.budget < 0) return "Budget cannot be negative";
    if (alloc.budget > 100) return "Single agent budget cannot exceed 100";
    total += alloc.budget;
  }
  if (total > DEFAULT_BUDGET) return `Total budget (${total}) exceeds available budget (${DEFAULT_BUDGET})`;
  return null;
}
