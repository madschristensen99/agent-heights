/**
 * Aspiration Fulfillment — measures how well a user is *living* their aspiration,
 * not just how much they *like* it (that's the detection score).
 *
 * Each track has a fulfillment score 0-100 computed from track-specific
 * outcomes and engagement depth. Data is aggregated from existing modules:
 * - aspirations.ts (signal history, detection scores)
 * - experiment-log.ts (experiments, verdicts)
 * - office-deco.ts (decorations)
 * - office-social.ts (likes, visits, sticky notes)
 * - office-progression.ts (level, XP)
 * - agent-growth.ts (agent performance trends)
 * - manager snapshot (schedules, agents, tasks)
 */

import { getSignalHistory, getCachedProfile, type AspirationType } from "./aspirations.js";
import { getEntries } from "./experiment-log.js";
import { getDecorations } from "./office-deco.js";
import { getSocialState } from "./office-social.js";
import { getProgress } from "./office-progression.js";
import { getGrowth } from "./agent-growth.js";
import type { AgentSchedule, AgentInfo, TrackFulfillment, FulfillmentStats } from "../shared/types.js";

const TRACKS: AspirationType[] = ["warrior", "builder", "explorer", "puzzle_solver", "creator", "strategist"];

function clamp100(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function trendFromDelta(delta: number): "improving" | "stagnating" | "declining" {
  if (delta > 2) return "improving";
  if (delta < -2) return "declining";
  return "stagnating";
}

function badgeForScore(score: number): string {
  if (score >= 80) return "🏆";
  if (score >= 60) return "🥇";
  if (score >= 40) return "🥈";
  if (score >= 20) return "🥉";
  return "🌱";
}

/** Compute fulfillment for all tracks. */
export function computeFulfillment(
  userId: string,
  agents: AgentInfo[],
  schedules: AgentSchedule[],
  totalTasksDone: number,
): FulfillmentStats {
  const profile = getCachedProfile(userId);
  const signalHistory = getSignalHistory(userId);
  const experiments = getEntries(userId);
  const decorations = getDecorations(userId);
  const social = getSocialState(userId);
  const progress = getProgress(userId);
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  // Count signals per track in last 7 days
  const recentSignalsByTrack: Record<string, number> = {};
  for (const s of signalHistory) {
    if (s.timestamp > weekAgo) {
      recentSignalsByTrack[s.aspiration] = (recentSignalsByTrack[s.aspiration] ?? 0) + 1;
    }
  }

  // Count signals per track all-time
  const allSignalsByTrack: Record<string, number> = {};
  for (const s of signalHistory) {
    allSignalsByTrack[s.aspiration] = (allSignalsByTrack[s.aspiration] ?? 0) + 1;
  }

  // ── Builder Fulfillment ──────────────────────────────────────────────
  const builderSchedules = schedules.filter((s) => s.enabled);
  const chainCount = schedules.filter((s) => s.chainTo).length;
  const automationRate = totalTasksDone > 0 ? Math.min(1, builderSchedules.reduce((sum, s) => sum + s.runCount, 0) / totalTasksDone) : 0;
  const pipelineDepth = schedules.filter((s) => s.handoffTo).length;
  const zeroTouchCycles = schedules.filter((s) => s.runCount > 0 && s.consecutiveFailures === 0).length;
  const builderScore =
    Math.min(30, builderSchedules.length * 6) +          // schedules: 0-30
    Math.min(20, chainCount * 10) +                       // chains: 0-20
    Math.min(25, automationRate * 25) +                   // automation rate: 0-25
    Math.min(15, pipelineDepth * 5) +                     // handoffs: 0-15
    Math.min(10, zeroTouchCycles * 2);                    // zero-touch: 0-10

  // ── Explorer Fulfillment ─────────────────────────────────────────────
  const confirmedExperiments = experiments.filter((e) => e.verdict === "confirmed" || e.verdict === "refuted");
  const distinctModels = new Set(agents.map((a) => a.model)).size;
  const breakthroughCount = signalHistory.filter((s) => s.key === "breakthrough").length;
  const explorerScore =
    Math.min(25, experiments.length * 3) +                 // experiments: 0-25
    Math.min(20, confirmedExperiments.length * 5) +        // confirmed/refuted: 0-20
    Math.min(20, distinctModels * 5) +                     // model diversity: 0-20
    Math.min(15, breakthroughCount * 5) +                  // breakthroughs: 0-15
    Math.min(10, (allSignalsByTrack["explorer"] ?? 0) * 1) + // exploration signals: 0-10
    Math.min(10, agents.filter((a) => a.mcpServers && a.mcpServers.length > 0).length * 3); // MCP users: 0-10

  // ── Warrior Fulfillment ──────────────────────────────────────────────
  const warriorSignals = signalHistory.filter((s) => s.aspiration === "warrior");
  const creaturesKilled = warriorSignals.filter((s) => s.key === "creature_killed").length;
  const bossesSlain = warriorSignals.filter((s) => s.key === "boss_slain").length;
  const weaponsCollected = warriorSignals.filter((s) => s.key === "weapon_collected").length;
  const crownPlaced = warriorSignals.filter((s) => s.key === "crown_placed").length;
  const warriorScore =
    Math.min(30, creaturesKilled * 3) +                    // creatures: 0-30
    Math.min(25, bossesSlain * 10) +                       // bosses: 0-25
    Math.min(15, weaponsCollected * 3) +                   // weapons: 0-15
    Math.min(20, crownPlaced * 20) +                       // crown: 0-20
    Math.min(10, (recentSignalsByTrack["warrior"] ?? 0) * 2); // recent activity: 0-10

  // ── Puzzle Solver Fulfillment ────────────────────────────────────────
  const decompositions = signalHistory.filter((s) => s.key === "manual_subtask_with_deps").length;
  const zeroRework = signalHistory.filter((s) => s.key === "task_zero_rework").length;
  const phaseGates = signalHistory.filter((s) => s.key === "phase_gate_used").length;
  const manualAssignments = signalHistory.filter((s) => s.key === "manual_agent_assignment").length;
  const puzzleScore =
    Math.min(25, decompositions * 5) +                     // decompositions: 0-25
    Math.min(25, zeroRework * 5) +                         // zero-rework: 0-25
    Math.min(20, phaseGates * 4) +                         // phase gates: 0-20
    Math.min(15, manualAssignments * 2) +                  // manual assignments: 0-15
    Math.min(15, (recentSignalsByTrack["puzzle_solver"] ?? 0) * 3); // recent: 0-15

  // ── Creator Fulfillment ──────────────────────────────────────────────
  const decorationCount = decorations.length;
  const likeCount = social.likeCount;
  const visitorCount = social.recentVisitors.length;
  const stickyNotes = social.stickyNotes.length;
  const themeChanges = signalHistory.filter((s) => s.key === "office_theme_changed").length;
  const wardrobeUsed = signalHistory.filter((s) => s.key === "wardrobe_used").length;
  const creatorScore =
    Math.min(25, decorationCount * 2) +                    // decorations: 0-25
    Math.min(20, likeCount * 4) +                          // likes: 0-20
    Math.min(15, visitorCount * 3) +                       // visitors: 0-15
    Math.min(10, stickyNotes * 2) +                        // sticky notes: 0-10
    Math.min(15, themeChanges * 3) +                       // theme changes: 0-15
    Math.min(15, wardrobeUsed * 3);                        // wardrobe: 0-15

  // ── Strategist Fulfillment ───────────────────────────────────────────
  const officeLevel = progress.level;
  const agentCount = agents.filter((a) => a.id !== "office-manager" && a.id !== "hermes" && a.id !== "wizard").length;
  const streak = signalHistory.filter((s) => s.key === "daily_return_streak").length;
  const improvingAgents = agents.filter((a) => {
    const g = getGrowth(a.id);
    return g.trend === "improving";
  }).length;
  const strategistScore =
    Math.min(25, officeLevel * 3) +                        // office level: 0-25
    Math.min(20, agentCount * 3) +                         // agent roster: 0-20
    Math.min(20, streak * 2) +                             // retention streak: 0-20
    Math.min(20, improvingAgents * 5) +                    // improving agents: 0-20
    Math.min(15, (allSignalsByTrack["strategist"] ?? 0) * 1.5); // strategic signals: 0-15

  // ── Assemble ─────────────────────────────────────────────────────────
  const trackFulfillments: Record<AspirationType, TrackFulfillment> = {
    warrior: {
      score: clamp100(warriorScore),
      metrics: [
        { label: "Creatures Slain", value: String(creaturesKilled), raw: creaturesKilled, max: 10 },
        { label: "Bosses Defeated", value: String(bossesSlain), raw: bossesSlain, max: 3 },
        { label: "Weapons Collected", value: String(weaponsCollected), raw: weaponsCollected, max: 5 },
        { label: "Crown Placed", value: crownPlaced > 0 ? "Yes" : "No", raw: crownPlaced, max: 1 },
        { label: "Recent Activity", value: `${recentSignalsByTrack["warrior"] ?? 0} this week`, raw: recentSignalsByTrack["warrior"] ?? 0, max: 5 },
      ],
      trend: trendFromDelta((recentSignalsByTrack["warrior"] ?? 0) - 2),
      badge: badgeForScore(warriorScore),
    },
    builder: {
      score: clamp100(builderScore),
      metrics: [
        { label: "Active Schedules", value: String(builderSchedules.length), raw: builderSchedules.length, max: 5 },
        { label: "Chain Links", value: String(chainCount), raw: chainCount, max: 2 },
        { label: "Automation Rate", value: `${Math.round(automationRate * 100)}%`, raw: automationRate, max: 1 },
        { label: "Pipeline Depth", value: String(pipelineDepth), raw: pipelineDepth, max: 3 },
        { label: "Zero-Touch Cycles", value: String(zeroTouchCycles), raw: zeroTouchCycles, max: 5 },
      ],
      trend: trendFromDelta(builderSchedules.length - 1),
      badge: badgeForScore(builderScore),
    },
    explorer: {
      score: clamp100(explorerScore),
      metrics: [
        { label: "Experiments Run", value: String(experiments.length), raw: experiments.length, max: 8 },
        { label: "Confirmed/Refuted", value: String(confirmedExperiments.length), raw: confirmedExperiments.length, max: 4 },
        { label: "Models Tried", value: String(distinctModels), raw: distinctModels, max: 4 },
        { label: "Breakthroughs", value: String(breakthroughCount), raw: breakthroughCount, max: 3 },
        { label: "MCP-Equipped Agents", value: String(agents.filter((a) => a.mcpServers && a.mcpServers.length > 0).length), raw: agents.filter((a) => a.mcpServers && a.mcpServers.length > 0).length, max: 3 },
      ],
      trend: trendFromDelta(experiments.length - 2),
      badge: badgeForScore(explorerScore),
    },
    puzzle_solver: {
      score: clamp100(puzzleScore),
      metrics: [
        { label: "Decompositions", value: String(decompositions), raw: decompositions, max: 5 },
        { label: "Zero-Rework Tasks", value: String(zeroRework), raw: zeroRework, max: 5 },
        { label: "Phase Gates Used", value: String(phaseGates), raw: phaseGates, max: 5 },
        { label: "Manual Assignments", value: String(manualAssignments), raw: manualAssignments, max: 8 },
        { label: "Recent Activity", value: `${recentSignalsByTrack["puzzle_solver"] ?? 0} this week`, raw: recentSignalsByTrack["puzzle_solver"] ?? 0, max: 5 },
      ],
      trend: trendFromDelta((recentSignalsByTrack["puzzle_solver"] ?? 0) - 1),
      badge: badgeForScore(puzzleScore),
    },
    creator: {
      score: clamp100(creatorScore),
      metrics: [
        { label: "Decorations", value: String(decorationCount), raw: decorationCount, max: 12 },
        { label: "Likes Received", value: String(likeCount), raw: likeCount, max: 5 },
        { label: "Visitors", value: String(visitorCount), raw: visitorCount, max: 5 },
        { label: "Sticky Notes", value: String(stickyNotes), raw: stickyNotes, max: 5 },
        { label: "Theme Changes", value: String(themeChanges), raw: themeChanges, max: 5 },
      ],
      trend: trendFromDelta(decorationCount - 3),
      badge: badgeForScore(creatorScore),
    },
    strategist: {
      score: clamp100(strategistScore),
      metrics: [
        { label: "Office Level", value: String(officeLevel), raw: officeLevel, max: 8 },
        { label: "Agent Roster", value: String(agentCount), raw: agentCount, max: 7 },
        { label: "Return Streak", value: String(streak), raw: streak, max: 10 },
        { label: "Improving Agents", value: String(improvingAgents), raw: improvingAgents, max: 4 },
        { label: "Strategic Signals", value: String(allSignalsByTrack["strategist"] ?? 0), raw: allSignalsByTrack["strategist"] ?? 0, max: 10 },
      ],
      trend: trendFromDelta(agentCount - 2),
      badge: badgeForScore(strategistScore),
    },
  };

  // Dominant
  const dominant = profile?.dominant ?? null;
  const dominantFulfillment = dominant ? trackFulfillments[dominant].score : 0;

  // Detection scores for gap analysis
  const detectionScores = profile ? {
    warrior: profile.warrior,
    builder: profile.builder,
    explorer: profile.explorer,
    puzzle_solver: profile.puzzle_solver,
    creator: profile.creator,
    strategist: profile.strategist,
  } : { warrior: 0, builder: 0, explorer: 0, puzzle_solver: 0, creator: 0, strategist: 0 };

  // Gaps: detection (0-1) vs fulfillment (0-100), normalized
  const gaps = TRACKS.map((track) => {
    const detection = detectionScores[track] * 100; // scale to 0-100
    const fulfillment = trackFulfillments[track].score;
    return { track, detection: Math.round(detection), fulfillment, gap: fulfillment - detection };
  }).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  // Activity feed: last 20 signals, mapped to track + icon
  const TRACK_ICONS: Record<AspirationType, string> = {
    warrior: "⚔️",
    builder: "🔧",
    explorer: "🧪",
    puzzle_solver: "🧩",
    creator: "🎨",
    strategist: "♟️",
  };
  const SIGNAL_TEXTS: Record<string, string> = {
    creature_killed: "Creature defeated",
    boss_slain: "Boss slain",
    weapon_collected: "Weapon collected",
    crown_placed: "Crown placed",
    speedrun_recorded: "Speedrun recorded",
    world_explored: "World explored",
    handoff_created: "Agent handoff created",
    scheduled_task: "Scheduled task",
    task_completed_unattended: "Task completed autonomously",
    multiple_agents_working: "Multiple agents working",
    pipeline_created: "Pipeline created",
    agent_rehired_different_config: "Agent rehired with new config",
    mcp_server_installed: "MCP server installed",
    new_agent_model_tried: "New model tried",
    world_generated: "World generated",
    agent_fired: "Agent fired",
    manual_subtask_with_deps: "Subtask with dependencies",
    phase_gate_used: "Phase gate used",
    task_zero_rework: "Zero-rework task",
    manual_agent_assignment: "Manual agent assignment",
    office_theme_changed: "Office theme changed",
    wardrobe_used: "Wardrobe used",
    character_customized: "Character customized",
    trophy_room_shared: "Trophy room viewed",
    office_visited: "Office visited",
    org_created: "Organization created",
    agent_count_grew: "Agent count grew",
    daily_return_streak: "Daily return",
    agent_performance_improved: "Agent performance improved",
    strategic_hire: "Strategic hire",
  };
  const activityFeed = signalHistory.slice(-20).reverse().map((s) => ({
    ts: s.timestamp,
    track: s.aspiration,
    icon: TRACK_ICONS[s.aspiration],
    text: SIGNAL_TEXTS[s.key] ?? s.key,
  }));

  return {
    ...trackFulfillments,
    dominant,
    dominantFulfillment,
    detectionScores,
    gaps,
    activityFeed,
  };
}
