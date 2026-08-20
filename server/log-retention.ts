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
      .from("agent_heights_agent_logs")
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
 * Uses a single SQL via RPC function — no N+1 queries.
 */
export async function trimAllLogs(): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const { data, error } = await supabaseAdmin.rpc("trim_agent_logs", { cap: LOG_CAP });
    if (error) {
      console.error("[db-rel] trimAllLogs RPC failed:", error);
      return;
    }
    const deleted = typeof data === "number" ? data : 0;
    if (deleted > 0) {
      console.log(`[db-rel] trimmed ${deleted} excess agent log entries (cap=${LOG_CAP})`);
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
