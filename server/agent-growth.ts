import type { AgentGrowth, AgentGrowthPoint } from "../shared/types";

interface GrowthStore {
  history: AgentGrowthPoint[];
}

const growthStores = new Map<string, GrowthStore>();

function getStore(agentId: string): GrowthStore {
  let store = growthStores.get(agentId);
  if (!store) {
    store = { history: [] };
    growthStores.set(agentId, store);
  }
  return store;
}

export function recordTaskCompletion(agentId: string, success: boolean, durationMin: number, taskType: string): void {
  const store = getStore(agentId);
  store.history.push({ timestamp: Date.now(), success, durationMin, taskType });
  if (store.history.length > 200) store.history = store.history.slice(-200);
}

export function getGrowth(agentId: string): AgentGrowth {
  const store = getStore(agentId);
  const history = store.history;
  if (history.length === 0) {
    return {
      totalTasks: 0,
      successRate: 0,
      avgCompletionMin: 0,
      specialty: null,
      trend: "stagnating",
      recentHistory: [],
    };
  }

  const totalTasks = history.length;
  const successes = history.filter((h) => h.success).length;
  const successRate = successes / totalTasks;
  const avgCompletionMin = history.reduce((sum, h) => sum + h.durationMin, 0) / totalTasks;

  // Specialty: most common task type
  const typeCounts = new Map<string, number>();
  for (const h of history) {
    typeCounts.set(h.taskType, (typeCounts.get(h.taskType) ?? 0) + 1);
  }
  let specialty: string | null = null;
  let maxCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > maxCount) {
      maxCount = count;
      specialty = type;
    }
  }
  if (maxCount < totalTasks * 0.3) specialty = null;

  // Trend: compare first half vs second half success rate
  const half = Math.floor(totalTasks / 2);
  if (half < 3) {
    return { totalTasks, successRate, avgCompletionMin, specialty, trend: "stagnating", recentHistory: history.slice(-20) };
  }
  const firstHalfSuccess = history.slice(0, half).filter((h) => h.success).length / half;
  const secondHalfSuccess = history.slice(half).filter((h) => h.success).length / (totalTasks - half);
  const delta = secondHalfSuccess - firstHalfSuccess;
  const trend = delta > 0.05 ? "improving" : delta < -0.05 ? "declining" : "stagnating";

  return {
    totalTasks,
    successRate,
    avgCompletionMin,
    specialty,
    trend,
    recentHistory: history.slice(-20),
  };
}

export function clearGrowth(agentId: string): void {
  growthStores.delete(agentId);
}
