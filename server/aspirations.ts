/**
 * Aspirational Profiling — server-side scoring model.
 *
 * Tracks which "aspiration" each user resonates with across six tracks:
 * warrior, builder, explorer, puzzle_solver, creator, strategist.
 *
 * Scores use exponential decay (half-life ~7 days) so recent behavior
 * matters more than old behavior. The dominant aspiration is computed
 * on write and used by the concierge, suggestion engine, and NPC speech.
 */

import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

export type AspirationType = "warrior" | "builder" | "explorer" | "puzzle_solver" | "creator" | "strategist";

export interface AspirationProfile {
  warrior: number;
  builder: number;
  explorer: number;
  puzzle_solver: number;
  creator: number;
  strategist: number;
  dominant: AspirationType | null;
  signalCount: number;
}

const ALL_TRACKS: AspirationType[] = ["warrior", "builder", "explorer", "puzzle_solver", "creator", "strategist"];

const SCORE_COLUMN: Record<AspirationType, string> = {
  warrior: "warrior_score",
  builder: "builder_score",
  explorer: "explorer_score",
  puzzle_solver: "puzzle_solver_score",
  creator: "creator_score",
  strategist: "strategist_score",
};

// Half-life: 7 days. After 7 days, a signal's contribution halves.
const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;
const DECAY_LAMBDA = Math.LN2 / HALF_LIFE_MS;

// Minimum total signal count before we set a dominant aspiration.
// Avoids premature profiling from a single action.
const MIN_SIGNALS_FOR_DOMINANT = 5;

// Minimum score difference to declare a clear dominant (avoids flip-flopping).
const DOMINANT_MARGIN = 0.02;

// In-memory cache for fast lookups (avoids DB round-trip on every nudge eval).
const profileCache = new Map<string, AspirationProfile>();

/**
 * Record an aspirational signal for a user.
 * Applies exponential decay to old score, then adds the new weighted signal.
 */
export async function recordSignal(
  userId: string,
  aspiration: AspirationType,
  weight: number,
): Promise<void> {
  const profile = await getProfile(userId);
  const now = Date.now();

  const col = SCORE_COLUMN[aspiration];
  const currentScore = profile[aspiration];

  // Apply decay: score *= e^(-lambda * dt) where dt is time since last update
  // We approximate by decaying all scores uniformly based on last_signal_at
  const decayedScore = currentScore * Math.exp(-DECAY_LAMBDA * (60 * 1000)); // decay per minute approx

  // Add new signal weight, clamp to [0, 1]
  const newScore = Math.min(1.0, decayedScore + weight);

  // Update the profile object
  (profile as any)[aspiration] = newScore;
  profile.signalCount++;

  // Recompute dominant
  profile.dominant = computeDominant(profile);

  // Update cache
  profileCache.set(userId, { ...profile });

  // Persist to DB (fire-and-forget, non-blocking)
  if (isSupabaseConfigured) {
    const update: Record<string, number | string | null> = {
      [col]: newScore,
      signal_count: profile.signalCount,
      last_signal_at: new Date(now).toISOString(),
      dominant_aspiration: profile.dominant,
      updated_at: new Date(now).toISOString(),
    };

    void supabaseAdmin
      .from("heights_cloud_aspiration_profiles")
      .upsert({ user_id: userId, ...update }, { onConflict: "user_id" })
      .then(() => {})
      .catch((err: unknown) => console.warn(`[aspirations] failed to upsert profile for ${userId}:`, err));
  }
}

/**
 * Get the current aspiration profile for a user.
 * Falls back to in-memory cache, then DB, then defaults.
 */
export async function getProfile(userId: string): Promise<AspirationProfile> {
  // Check cache first
  const cached = profileCache.get(userId);
  if (cached) return cached;

  // Try DB
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabaseAdmin
        .from("heights_cloud_aspiration_profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (!error && data) {
        const profile: AspirationProfile = {
          warrior: data.warrior_score ?? 0,
          builder: data.builder_score ?? 0,
          explorer: data.explorer_score ?? 0,
          puzzle_solver: data.puzzle_solver_score ?? 0,
          creator: data.creator_score ?? 0,
          strategist: data.strategist_score ?? 0,
          dominant: data.dominant_aspiration ?? null,
          signalCount: data.signal_count ?? 0,
        };
        profileCache.set(userId, profile);
        return profile;
      }
    } catch {
      // Fall through to default
    }
  }

  // Default empty profile
  return {
    warrior: 0,
    builder: 0,
    explorer: 0,
    puzzle_solver: 0,
    creator: 0,
    strategist: 0,
    dominant: null,
    signalCount: 0,
  };
}

/**
 * Quick sync lookup — returns cached profile or null.
 * Use this in hot paths (concierge eval, suggestion engine) to avoid async.
 */
export function getCachedProfile(userId: string): AspirationProfile | null {
  return profileCache.get(userId) ?? null;
}

/**
 * Get the dominant aspiration, or null if not enough data yet.
 * Uses the in-memory cache for synchronous access.
 */
export function getDominantAspiration(userId: string): AspirationType | null {
  return profileCache.get(userId)?.dominant ?? null;
}

/**
 * Compute the dominant aspiration from a profile.
 * Returns null if not enough signals or no clear winner.
 */
function computeDominant(profile: AspirationProfile): AspirationType | null {
  if (profile.signalCount < MIN_SIGNALS_FOR_DOMINANT) return null;

  // Find top two scores
  const scores = ALL_TRACKS.map((t) => ({ type: t, score: profile[t] }));
  scores.sort((a, b) => b.score - a.score);

  const top = scores[0];
  const second = scores[1];

  // Need a clear margin to declare dominant
  if (top.score - second.score < DOMINANT_MARGIN) return null;
  if (top.score < 0.05) return null;

  return top.type;
}

/**
 * Preload profiles into cache for a user (call on session start).
 */
export async function preloadProfile(userId: string): Promise<void> {
  await getProfile(userId);
}

// ── Signal weight constants ─────────────────────────────────────────────────
// Tuned so that ~10-20 signals in a track produce a score of 0.5-0.8.

export const SIGNAL_WEIGHTS = {
  // Warrior
  creature_killed: 0.03,
  boss_slain: 0.08,
  weapon_collected: 0.04,
  crown_placed: 0.10,
  speedrun_recorded: 0.06,
  world_explored: 0.02,

  // Builder
  handoff_created: 0.05,
  scheduled_task: 0.06,
  task_completed_unattended: 0.04,
  multiple_agents_working: 0.03,
  pipeline_created: 0.08,

  // Explorer
  agent_rehired_different_config: 0.06,
  mcp_server_installed: 0.05,
  new_agent_model_tried: 0.05,
  world_generated: 0.04,
  agent_fired: 0.02,

  // Puzzle solver
  manual_subtask_with_deps: 0.06,
  phase_gate_used: 0.04,
  task_zero_rework: 0.05,
  manual_agent_assignment: 0.03,

  // Creator
  office_theme_changed: 0.04,
  wardrobe_used: 0.03,
  character_customized: 0.03,
  trophy_room_shared: 0.05,
  office_visited: 0.02,

  // Strategist
  org_created: 0.08,
  agent_count_grew: 0.03,
  daily_return_streak: 0.04,
  agent_performance_improved: 0.05,
  strategic_hire: 0.04,
} as const;

export type SignalKey = keyof typeof SIGNAL_WEIGHTS;

/** Signal → aspiration mapping */
export const SIGNAL_ASPIRATION: Record<SignalKey, AspirationType> = {
  creature_killed: "warrior",
  boss_slain: "warrior",
  weapon_collected: "warrior",
  crown_placed: "warrior",
  speedrun_recorded: "warrior",
  world_explored: "warrior",

  handoff_created: "builder",
  scheduled_task: "builder",
  task_completed_unattended: "builder",
  multiple_agents_working: "builder",
  pipeline_created: "builder",

  agent_rehired_different_config: "explorer",
  mcp_server_installed: "explorer",
  new_agent_model_tried: "explorer",
  world_generated: "explorer",
  agent_fired: "explorer",

  manual_subtask_with_deps: "puzzle_solver",
  phase_gate_used: "puzzle_solver",
  task_zero_rework: "puzzle_solver",
  manual_agent_assignment: "puzzle_solver",

  office_theme_changed: "creator",
  wardrobe_used: "creator",
  character_customized: "creator",
  trophy_room_shared: "creator",
  office_visited: "creator",

  org_created: "strategist",
  agent_count_grew: "strategist",
  daily_return_streak: "strategist",
  agent_performance_improved: "strategist",
  strategic_hire: "strategist",
};

/**
 * Convenience: record a signal by its key name.
 * Looks up the aspiration and weight automatically.
 */
export async function recordSignalByKey(userId: string, key: SignalKey): Promise<void> {
  const aspiration = SIGNAL_ASPIRATION[key];
  const weight = SIGNAL_WEIGHTS[key];
  await recordSignal(userId, aspiration, weight);
}

// ── Aspiration Unlocks ──────────────────────────────────────────────────────

import type { AspirationUnlocks } from "../shared/types.js";

const UNLOCK_THRESHOLDS = {
  pipelineGraph: { track: "builder" as AspirationType, threshold: 0.30 },
  automationDashboard: { track: "builder" as AspirationType, threshold: 0.40 },
  experimentLog: { track: "explorer" as AspirationType, threshold: 0.30 },
  abComparison: { track: "explorer" as AspirationType, threshold: 0.45 },
  decompositionScoring: { track: "puzzle_solver" as AspirationType, threshold: 0.30 },
  optimizationChallenges: { track: "puzzle_solver" as AspirationType, threshold: 0.45 },
  officeDecoration: { track: "creator" as AspirationType, threshold: 0.30 },
  socialInteractions: { track: "creator" as AspirationType, threshold: 0.40 },
  officeTechTree: { track: "strategist" as AspirationType, threshold: 0.30 },
  agentGrowth: { track: "strategist" as AspirationType, threshold: 0.40 },
} as const;

/**
 * Compute which aspiration-gated features are unlocked for a user.
 * Uses the cached profile for synchronous access.
 */
export function getUnlocks(userId: string): AspirationUnlocks {
  const profile = profileCache.get(userId);
  if (!profile) {
    return {
      pipelineGraph: false,
      automationDashboard: false,
      experimentLog: false,
      abComparison: false,
      decompositionScoring: false,
      optimizationChallenges: false,
      officeDecoration: false,
      socialInteractions: false,
      officeTechTree: false,
      agentGrowth: false,
    };
  }

  const result: AspirationUnlocks = {
    pipelineGraph: false,
    automationDashboard: false,
    experimentLog: false,
    abComparison: false,
    decompositionScoring: false,
    optimizationChallenges: false,
    officeDecoration: false,
    socialInteractions: false,
    officeTechTree: false,
    agentGrowth: false,
  };

  for (const [key, config] of Object.entries(UNLOCK_THRESHOLDS)) {
    const score = profile[config.track];
    (result as unknown as Record<string, boolean>)[key] = score >= config.threshold;
  }

  return result;
}
