import type { AgentGrowth, AgentGrowthPoint } from "../shared/types";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

interface GrowthStore {
  history: AgentGrowthPoint[];
  loaded: boolean;
}

const growthStores = new Map<string, GrowthStore>();

function getStore(agentId: string): GrowthStore {
  let store = growthStores.get(agentId);
  if (!store) {
    store = { history: [], loaded: false };
    growthStores.set(agentId, store);
    // Load recent history from DB
    if (isSupabaseConfigured) {
      void supabaseAdmin
        .from("heights_cloud_agent_history")
        .select("success, duration_min, task_type, created_at")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(200)
        .then(({ data }) => {
          if (data) {
            store!.history = data.reverse().map((r) => ({
              timestamp: new Date(r.created_at).getTime(),
              success: r.success,
              durationMin: r.duration_min,
              taskType: r.task_type,
            }));
          }
          store!.loaded = true;
        })
        .catch((err: unknown) => console.warn(`[agent-growth] failed to load for ${agentId}:`, err));
    } else {
      store.loaded = true;
    }
  }
  return store;
}

export function recordTaskCompletion(agentId: string, success: boolean, durationMin: number, taskType: string, userId?: string): void {
  const store = getStore(agentId);
  store.history.push({ timestamp: Date.now(), success, durationMin, taskType });
  if (store.history.length > 200) store.history = store.history.slice(-200);

  // Persist to DB
  if (isSupabaseConfigured && userId) {
    void supabaseAdmin
      .from("heights_cloud_agent_history")
      .insert({
        user_id: userId,
        agent_id: agentId,
        success,
        duration_min: durationMin,
        task_type: taskType,
      })
      .then(() => {})
      .catch((err: unknown) => console.warn(`[agent-growth] failed to persist for ${agentId}:`, err));
  }
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
