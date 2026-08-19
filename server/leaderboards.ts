/**
 * Leaderboards & Trophy Room — server-side queries from DB.
 *
 * Reads from `heights_cloud_achievements` table (unlocked, stats, sets)
 * and `agent_heights_player_info` (name, workspace) to build:
 * - Leaderboard rankings by category (weekly + all-time)
 * - Public trophy profile for /u/{username}
 */

import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";
import type { LeaderboardEntry, LeaderboardCategory, TrophyProfile } from "../shared/types.js";

// ── Leaderboards ───────────────────────────────────────────────────────────

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Stat keys for each leaderboard category. */
const CATEGORY_STAT: Record<LeaderboardCategory, { stat: string; label: (v: number) => string }> = {
  deepest_explorers: { stat: "maxDepth", label: (v) => `${v} chunks` },
  fastest_crown: { stat: "speedrunTimeMs", label: (v) => v > 0 ? formatDuration(v) : "—" },
  most_creatures_slain: { stat: "creaturesKilled", label: (v) => `${v} kills` },
  most_tasks_completed: { stat: "tasksDone", label: (v) => `${v} tasks` },
  boss_rating: { stat: "bossRating", label: (v) => `${v} rating` },
};

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Compute boss rating from stats: creatures + bosses*10 + tasks + depth*5 + achievements. */
function computeBossRating(stats: Record<string, number>): number {
  const creatures = stats.creaturesKilled ?? 0;
  const bosses = stats.bossesSlain ?? 0;
  const tasks = stats.tasksDone ?? 0;
  const depth = stats.maxDepth ?? 0;
  const achievements = stats.achievementsUnlocked ?? 0;
  return creatures + bosses * 10 + tasks + depth * 5 + achievements;
}

export async function getLeaderboard(
  category: LeaderboardCategory,
  period: "weekly" | "alltime",
): Promise<LeaderboardEntry[]> {
  if (!isSupabaseConfigured) return [];

  try {
    const { data, error } = await supabaseAdmin
      .from("heights_cloud_achievements")
      .select("user_id, unlocked, stats, sets, updated_at")
      .limit(500);

    if (error || !data) return [];

    const cutoff = Date.now() - WEEK_MS;
    const entries: { userId: string; playerName: string; score: number }[] = [];

    // Fetch player names in bulk
    const userIds = data.map((r) => r.user_id);
    const { data: players } = await supabaseAdmin
      .from("agent_heights_player_info")
      .select("user_id, name")
      .in("user_id", userIds);

    const nameMap = new Map<string, string>();
    for (const p of players ?? []) {
      nameMap.set(p.user_id, p.name);
    }

    for (const row of data) {
      const stats = (row.stats as Record<string, number>) ?? {};
      const updatedAt = new Date(row.updated_at).getTime();

      // For weekly, skip entries not updated in the last week
      if (period === "weekly" && updatedAt < cutoff) continue;

      const catDef = CATEGORY_STAT[category];
      let score: number;

      if (category === "boss_rating") {
        score = computeBossRating(stats);
      } else if (category === "fastest_crown") {
        // Lower is better for speedrun — invert so sorting works
        const time = stats.speedrunTimeMs ?? 0;
        if (time <= 0) continue; // skip if no speedrun
        score = -time; // negative so descending sort puts fastest first
      } else {
        score = stats[catDef.stat] ?? 0;
      }

      if (score === 0 && category !== "fastest_crown") continue;

      const playerName = nameMap.get(row.user_id) ?? "Unknown";
      entries.push({ userId: row.user_id, playerName, score });
    }

    // Sort descending (highest score first; for speedrun, most negative = fastest = first)
    entries.sort((a, b) => b.score - a.score);

    const catDef = CATEGORY_STAT[category];
    const top = entries.slice(0, 50);

    return top.map((e, i) => ({
      rank: i + 1,
      playerName: e.playerName,
      score: category === "fastest_crown" ? Math.abs(e.score) : e.score,
      scoreLabel: category === "fastest_crown" ? formatDuration(Math.abs(e.score)) : catDef.label(e.score),
      userId: e.userId,
    }));
  } catch (err) {
    console.error("[leaderboard] query error:", err);
    return [];
  }
}

// ── Trophy Profile ─────────────────────────────────────────────────────────

export async function getTrophyProfile(username: string): Promise<TrophyProfile | null> {
  if (!isSupabaseConfigured) return null;

  try {
    // Find user by player name (case-insensitive)
    const { data: playerRow } = await supabaseAdmin
      .from("agent_heights_player_info")
      .select("user_id, name, workspace")
      .ilike("name", username)
      .maybeSingle();

    if (!playerRow) return null;

    // Fetch achievements
    const { data: achRow } = await supabaseAdmin
      .from("heights_cloud_achievements")
      .select("unlocked, stats, sets")
      .eq("user_id", playerRow.user_id)
      .maybeSingle();

    if (!achRow) return null;

    const unlocked = (achRow.unlocked as string[]) ?? [];
    const stats = (achRow.stats as Record<string, number>) ?? {};
    const sets = (achRow.sets as Record<string, string[]>) ?? {};

    // Build achievement list — we need the definitions from the client
    // Since ACHIEVEMENTS is client-side, we'll return raw IDs + stats
    // and let the client map them to definitions
    const weaponsCollected = sets.weapons ?? [];
    const crownPlaced = unlocked.includes("from_cubicle_to_conqueror");
    const speedrunTimeMs = stats.speedrunTimeMs ?? null;
    const agentCount = stats.agentsHired ?? 0;

    return {
      playerName: playerRow.name,
      workspaceName: playerRow.workspace ?? "",
      unlockedAchievements: unlocked.map((id) => ({ id, name: "", desc: "", icon: "", tier: "" })),
      stats,
      weaponsCollected,
      crownPlaced,
      speedrunTimeMs,
      agentCount,
      screenshotUrl: null,
    };
  } catch (err) {
    console.error("[trophy] profile error:", err);
    return null;
  }
}
