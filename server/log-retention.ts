import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

const RETENTION_DAYS = 30;
const LOG_CAP = 500;

/**
 * Delete agent logs older than RETENTION_DAYS days.
 * Called on server startup and then every 24 hours.
 */
export async function pruneOldLogs(): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  try {
    const { count } = await supabaseAdmin
      .from("sprite_heights_agent_logs")
      .delete()
      .lt("ts", cutoff);
    const deleted = count ?? 0;
    if (deleted > 0) {
      console.log(`[db-rel] pruned ${deleted} agent log entries older than ${RETENTION_DAYS} days`);
    }
    return deleted;
  } catch (err) {
    console.error("[db-rel] pruneOldLogs failed:", err);
    return 0;
  }
}

/**
 * For each agent, trim logs to LOG_CAP entries (keep most recent).
 */
export async function trimAllLogs(): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    // Get all agents
    const { data: agents } = await supabaseAdmin
      .from("sprite_heights_agents")
      .select("id");
    if (!agents) return;

    for (const agent of agents) {
      const { count } = await supabaseAdmin
        .from("sprite_heights_agent_logs")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agent.id);

      if ((count ?? 0) > LOG_CAP) {
        const excess = (count ?? 0) - LOG_CAP;
        const { data: oldLogs } = await supabaseAdmin
          .from("sprite_heights_agent_logs")
          .select("id")
          .eq("agent_id", agent.id)
          .order("ts", { ascending: true })
          .limit(excess);
        if (oldLogs && oldLogs.length > 0) {
          const ids = oldLogs.map((r: any) => r.id);
          await supabaseAdmin.from("sprite_heights_agent_logs").delete().in("id", ids);
        }
      }
    }
  } catch (err) {
    console.error("[db-rel] trimAllLogs failed:", err);
  }
}

/** Run log maintenance — prune old + trim excess. */
export async function runLogMaintenance(): Promise<void> {
  await pruneOldLogs();
  await trimAllLogs();
}

/** Start a 24-hour interval for log maintenance. Returns the interval handle. */
export function startLogMaintenance(): ReturnType<typeof setInterval> {
  void runLogMaintenance();
  return setInterval(() => void runLogMaintenance(), 24 * 60 * 60 * 1000);
}
