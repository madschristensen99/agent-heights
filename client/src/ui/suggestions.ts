/**
 * Suggestion Engine — client-side deterministic suggestions based on state signals.
 *
 * Evaluates the current game state and produces 2-3 actionable "Next Steps"
 * for the HUD panel. Purely deterministic — no LLM calls.
 */

import type { SuggestionItem } from "../../../shared/types";
import { OFFICE_MANAGER_ID, HERMES_ID, WIZARD_ID } from "../../../shared/types";
import { achievements } from "../game/achievements";
import type { Store } from "../store";

/** Aspiration-based priority boost. Suggestions matching the user's dominant aspiration get a priority reduction. */
const ASPIRATION_BOOST: Record<string, string[]> = {
  warrior: ["explore-world", "try-golf", "check-achievements"],
  builder: ["connect-platform", "assign-tasks", "create-task"],
  explorer: ["hire-first", "hire-more"],
  puzzle_solver: ["assign-tasks", "create-task"],
  creator: ["check-achievements"],
  strategist: ["view-leaderboards", "hire-more"],
};

/**
 * Compute suggestions based on the current store state.
 * Returns 2-3 items sorted by priority (lower = more important).
 * If an aspiration profile is available, suggestions matching the user's
 * dominant aspiration are boosted (priority lowered).
 */
export function computeSuggestions(store: Store): SuggestionItem[] {
  const items: SuggestionItem[] = [];
  const agents = [...store.agents.values()];
  const hireable = agents.filter(
    (a) => a.id !== OFFICE_MANAGER_ID && a.id !== HERMES_ID && a.id !== WIZARD_ID,
  );
  const idleAgents = hireable.filter((a) => a.status === "idle");
  const busyAgents = hireable.filter((a) => a.status === "working" || a.status === "thinking");
  const allCards = [...store.board.values()];
  const pendingCards = allCards.filter((c) => c.status === "backlog" || c.status === "in_progress");
  const unassignedCards = allCards.filter((c) => c.status === "backlog" && !c.assignedAgentId);

  // No agents hired yet
  if (hireable.length === 0) {
    items.push({
      id: "hire-first",
      label: "Hire your first agent",
      icon: "🤖",
      action: "open_market",
      priority: 1,
    });
  }

  // Unassigned tasks + idle agents
  if (unassignedCards.length > 0 && idleAgents.length > 0) {
    items.push({
      id: "assign-tasks",
      label: `Assign ${unassignedCards.length} unassigned task${unassignedCards.length === 1 ? "" : "s"}`,
      icon: "📋",
      action: "open_board",
      priority: 2,
    });
  }

  // All agents busy + pending tasks → suggest hiring
  if (hireable.length > 0 && idleAgents.length === 0 && busyAgents.length >= hireable.length && pendingCards.length > 2) {
    items.push({
      id: "hire-more",
      label: "All agents busy — hire more",
      icon: "➕",
      action: "open_market",
      priority: 3,
    });
  }

  // No tasks on the board
  if (allCards.length === 0 && hireable.length > 0) {
    items.push({
      id: "create-task",
      label: "Create a task for your team",
      icon: "📝",
      action: "open_board",
      priority: 4,
    });
  }

  // Hasn't connected any platform
  const hasPlatform = store.platformStates.some((p) => p.connected);
  if (!hasPlatform && hireable.length > 0) {
    items.push({
      id: "connect-platform",
      label: "Connect Telegram/Slack for notifications",
      icon: "📱",
      action: "open_settings",
      priority: 5,
    });
  }

  // Hasn't explored the world
  const creaturesKilled = achievements.getStat("creaturesKilled");
  if (creaturesKilled === 0 && hireable.length > 0) {
    items.push({
      id: "explore-world",
      label: "Step outside and explore the world",
      icon: "🗺️",
      action: "go_outside",
      priority: 6,
    });
  }

  // Has golf club but hasn't played
  const hasGolfClub = achievements.getStat("holeInOnes") === 0 && creaturesKilled > 0;
  if (hasGolfClub) {
    items.push({
      id: "try-golf",
      label: "Try the golf course outside",
      icon: "⛳",
      action: "go_outside",
      priority: 7,
    });
  }

  // Few achievements unlocked — suggest checking
  const unlockedCount = achievements.getUnlockedCount();
  if (unlockedCount > 0 && unlockedCount < 5) {
    items.push({
      id: "check-achievements",
      label: "Check your achievement progress",
      icon: "🏆",
      action: "open_achievements",
      priority: 8,
    });
  }

  // Has agents but hasn't checked leaderboards
  if (hireable.length > 0) {
    items.push({
      id: "view-leaderboards",
      label: "See how you rank on leaderboards",
      icon: "📊",
      action: "open_leaderboards",
      priority: 9,
    });
  }

  // Sort by priority and return top 3
  // Apply aspiration boost: suggestions matching dominant aspiration get -2 priority
  const profile = store.aspirationProfile;
  if (profile?.dominant) {
    const boosted = ASPIRATION_BOOST[profile.dominant] ?? [];
    for (const item of items) {
      if (boosted.includes(item.id)) {
        item.priority -= 2;
      }
    }
  }
  items.sort((a, b) => a.priority - b.priority);
  return items.slice(0, 3);
}
