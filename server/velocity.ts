/**
 * Velocity tracking — snapshots daily coding stats per user into the DB,
 * queries trends, and detects anomalies (inactive users, error spikes).
 *
 * Data is upserted from the IdeBridge's in-memory sessions periodically.
 */

import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface VelocityDay {
  day: string;             // YYYY-MM-DD
  tool: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  activeMinutes: number;
  errorCount: number;
  sessionCount: number;
  gitBranches: string[];
  languages: string[];
}

export interface VelocityTrend {
  day: string;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  totalFilesChanged: number;
  totalActiveMinutes: number;
  totalErrors: number;
  totalSessions: number;
  tools: string[];
  branches: string[];
  languages: string[];
}

export interface AnomalyAlert {
  type: "inactive" | "error_spike" | "low_velocity" | "stale_branch";
  userId: string;
  userName: string;
  message: string;
  severity: "info" | "warning" | "critical";
  details: Record<string, unknown>;
}

export interface StandupEntry {
  userName: string;
  tool: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  branches: string[];
  languages: string[];
  activeMinutes: number;
  errors: number;
}

export interface StandupSummary {
  date: string;
  entries: StandupEntry[];
  totalLinesAdded: number;
  totalLinesRemoved: number;
  totalFilesChanged: number;
  activeEngineers: number;
  anomalies: AnomalyAlert[];
}

// ── Snapshot — called periodically to persist current session stats ──

interface SessionSnapshot {
  userId: string;
  tool: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  errorCount: number;
  gitBranch: string | undefined;
  language: string | undefined;
  lastActivity: number;
}

/**
 * Snapshot current sessions into the DB as daily aggregates.
 * Called on a timer (e.g. every 5 minutes) from the server.
 */
export async function snapshotVelocity(snapshots: SessionSnapshot[]): Promise<void> {
  if (!isSupabaseConfigured || snapshots.length === 0) return;

  const today = new Date().toISOString().slice(0, 10);
  const byKey = new Map<string, {
    userId: string; tool: string; filesChanged: number; linesAdded: number;
    linesRemoved: number; errorCount: number; branches: Set<string>;
    languages: Set<string>; sessionCount: number;
  }>();

  for (const s of snapshots) {
    const key = `${s.userId}:${s.tool}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.filesChanged = Math.max(existing.filesChanged, s.filesChanged);
      existing.linesAdded = Math.max(existing.linesAdded, s.linesAdded);
      existing.linesRemoved = Math.max(existing.linesRemoved, s.linesRemoved);
      existing.errorCount += s.errorCount;
      if (s.gitBranch) existing.branches.add(s.gitBranch);
      if (s.language) existing.languages.add(s.language);
      existing.sessionCount++;
    } else {
      byKey.set(key, {
        userId: s.userId, tool: s.tool,
        filesChanged: s.filesChanged, linesAdded: s.linesAdded,
        linesRemoved: s.linesRemoved, errorCount: s.errorCount,
        branches: new Set(s.gitBranch ? [s.gitBranch] : []),
        languages: new Set(s.language ? [s.language] : []),
        sessionCount: 1,
      });
    }
  }

  const rows = [...byKey.values()].map(r => ({
    user_id: r.userId,
    day: today,
    tool: r.tool,
    files_changed: r.filesChanged,
    lines_added: r.linesAdded,
    lines_removed: r.linesRemoved,
    error_count: r.errorCount,
    session_count: r.sessionCount,
    git_branches: [...r.branches],
    languages: [...r.languages],
    active_minutes: Math.min(480, r.sessionCount * 30), // estimate: 30min per session, cap 8h
  }));

  try {
    await supabaseAdmin
      .from("heights_cloud_ide_velocity")
      .upsert(rows, { onConflict: "user_id,day,tool" });
  } catch (err) {
    console.error("[velocity] snapshot failed:", err);
  }
}

// ── Query — velocity trends for a user ────────────────────────────────

export async function getVelocityTrends(userId: string, days = 14): Promise<VelocityTrend[]> {
  if (!isSupabaseConfigured) return [];
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  try {
    const { data, error } = await supabaseAdmin
      .from("heights_cloud_ide_velocity")
      .select("day, tool, files_changed, lines_added, lines_removed, error_count, session_count, git_branches, languages, active_minutes")
      .eq("user_id", userId)
      .gte("day", cutoff)
      .order("day", { ascending: true });

    if (error || !data) return [];

    // Group by day
    const byDay = new Map<string, VelocityTrend>();
    for (const row of data) {
      const day = row.day as string;
      const trend = byDay.get(day) ?? {
        day,
        totalLinesAdded: 0, totalLinesRemoved: 0, totalFilesChanged: 0,
        totalActiveMinutes: 0, totalErrors: 0, totalSessions: 0,
        tools: [], branches: [], languages: [],
      };
      trend.totalLinesAdded += row.lines_added ?? 0;
      trend.totalLinesRemoved += row.lines_removed ?? 0;
      trend.totalFilesChanged += row.files_changed ?? 0;
      trend.totalActiveMinutes += row.active_minutes ?? 0;
      trend.totalErrors += row.error_count ?? 0;
      trend.totalSessions += row.session_count ?? 0;
      if (row.tool && !trend.tools.includes(row.tool)) trend.tools.push(row.tool);
      for (const b of (row.git_branches ?? [])) if (!trend.branches.includes(b)) trend.branches.push(b);
      for (const l of (row.languages ?? [])) if (!trend.languages.includes(l)) trend.languages.push(l);
      byDay.set(day, trend);
    }

    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  } catch {
    return [];
  }
}

// ── Query — standup summary for a user's org ──────────────────────────

export async function getStandupSummary(
  userId: string,
  memberIds: string[],
  memberNames: Map<string, string>,
): Promise<StandupSummary> {
  const today = new Date().toISOString().slice(0, 10);
  const entries: StandupEntry[] = [];
  let totalLinesAdded = 0, totalLinesRemoved = 0, totalFilesChanged = 0;

  for (const memberId of memberIds) {
    const trends = await getVelocityTrends(memberId, 1);
    const todayData = trends.find(t => t.day === today);
    if (!todayData || todayData.totalSessions === 0) continue;

    const name = memberNames.get(memberId) ?? "Unknown";
    for (const tool of todayData.tools) {
      entries.push({
        userName: name,
        tool,
        filesChanged: todayData.totalFilesChanged,
        linesAdded: todayData.totalLinesAdded,
        linesRemoved: todayData.totalLinesRemoved,
        branches: todayData.branches,
        languages: todayData.languages,
        activeMinutes: todayData.totalActiveMinutes,
        errors: todayData.totalErrors,
      });
    }
    totalLinesAdded += todayData.totalLinesAdded;
    totalLinesRemoved += todayData.totalLinesRemoved;
    totalFilesChanged += todayData.totalFilesChanged;
  }

  const anomalies = await detectAnomalies(userId, memberIds, memberNames);

  return {
    date: today,
    entries,
    totalLinesAdded,
    totalLinesRemoved,
    totalFilesChanged,
    activeEngineers: new Set(entries.map(e => e.userName)).size,
    anomalies,
  };
}

// ── Anomaly detection ─────────────────────────────────────────────────

export async function detectAnomalies(
  userId: string,
  memberIds: string[],
  memberNames: Map<string, string>,
): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];
  if (!isSupabaseConfigured) return alerts;

  const now = Date.now();
  const threeDaysAgo = new Date(now - 3 * 86400_000).toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(now - 7 * 86400_000).toISOString().slice(0, 10);

  for (const memberId of memberIds) {
    const name = memberNames.get(memberId) ?? "Unknown";

    // Check last 7 days for activity
    const trends = await getVelocityTrends(memberId, 7);
    const recent3 = trends.filter(t => t.day >= threeDaysAgo);
    const last7 = trends.filter(t => t.day >= sevenDaysAgo);

    const totalActivity3d = recent3.reduce((s, t) => s + t.totalLinesAdded + t.totalLinesRemoved, 0);
    const totalActivity7d = last7.reduce((s, t) => s + t.totalLinesAdded + t.totalLinesRemoved, 0);
    const totalErrors7d = last7.reduce((s, t) => s + t.totalErrors, 0);

    // Inactive: no activity in 3 days
    if (totalActivity3d === 0 && totalActivity7d > 0) {
      alerts.push({
        type: "inactive",
        userId: memberId,
        userName: name,
        message: `${name} hasn't committed in 3+ days`,
        severity: "warning",
        details: { lastActiveDay: recent3[0]?.day ?? "unknown" },
      });
    }

    // Error spike: error rate > 20% of total events in last 7 days
    const totalEvents7d = last7.reduce((s, t) => s + t.totalSessions, 0);
    if (totalEvents7d > 5 && totalErrors7d / totalEvents7d > 0.2) {
      alerts.push({
        type: "error_spike",
        userId: memberId,
        userName: name,
        message: `${name}'s error rate spiked (${Math.round(totalErrors7d / totalEvents7d * 100)}% over ${totalEvents7d} sessions)`,
        severity: "warning",
        details: { errorRate: totalErrors7d / totalEvents7d, totalErrors: totalErrors7d, totalSessions: totalEvents7d },
      });
    }

    // Low velocity: significant drop in last 3 days vs prior 4 days
    const prior4 = last7.filter(t => t.day < threeDaysAgo);
    const priorActivity = prior4.reduce((s, t) => s + t.totalLinesAdded + t.totalLinesRemoved, 0);
    if (priorActivity > 100 && totalActivity3d < priorActivity * 0.2) {
      alerts.push({
        type: "low_velocity",
        userId: memberId,
        userName: name,
        message: `${name}'s velocity dropped ${Math.round((1 - totalActivity3d / priorActivity) * 100)}% compared to last week`,
        severity: "info",
        details: { recentLines: totalActivity3d, priorLines: priorActivity },
      });
    }
  }

  return alerts;
}

// ── Standup text generation ───────────────────────────────────────────

export function formatStandupText(summary: StandupSummary): string {
  if (summary.entries.length === 0) {
    return `📋 Daily Standup — ${summary.date}\n\nNo coding activity recorded today.`;
  }

  const lines: string[] = [
    `📋 Daily Standup — ${summary.date}`,
    `${summary.activeEngineers} engineer${summary.activeEngineers > 1 ? "s" : ""} active · ${summary.totalFilesChanged} files · +${summary.totalLinesAdded}/-${summary.totalLinesRemoved} lines`,
    "",
  ];

  // Group by user
  const byUser = new Map<string, StandupEntry[]>();
  for (const e of summary.entries) {
    const arr = byUser.get(e.userName) ?? [];
    arr.push(e);
    byUser.set(e.userName, arr);
  }

  for (const [name, entries] of byUser) {
    const tools = entries.map(e => e.tool).join(", ");
    const branches = [...new Set(entries.flatMap(e => e.branches))].slice(0, 3);
    const langs = [...new Set(entries.flatMap(e => e.languages))].slice(0, 3);
    const totalAdded = entries.reduce((s, e) => s + e.linesAdded, 0);
    const totalRemoved = entries.reduce((s, e) => s + e.linesRemoved, 0);
    const errors = entries.reduce((s, e) => s + e.errors, 0);

    lines.push(`• ${name} — ${tools}`);
    if (branches.length > 0) lines.push(`  Branches: ${branches.join(", ")}`);
    if (langs.length > 0) lines.push(`  Languages: ${langs.join(", ")}`);
    lines.push(`  +${totalAdded}/-${totalRemoved} lines${errors > 0 ? ` · ⚠️ ${errors} errors` : ""}`);
  }

  if (summary.anomalies.length > 0) {
    lines.push("", "🚨 Anomalies:");
    for (const a of summary.anomalies) {
      lines.push(`  ${a.severity === "critical" ? "🔴" : a.severity === "warning" ? "🟡" : "🔵"} ${a.message}`);
    }
  }

  return lines.join("\n");
}
