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

/** Inline SVG icons for suggestions — avoids emoji rendering inconsistencies. */
const SVG_ICONS: Record<string, string> = {
  robot: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="2"/><circle cx="9" cy="14" r="1.5"/><circle cx="15" cy="14" r="1.5"/><path d="M12 4v4"/><circle cx="12" cy="3" r="1"/><path d="M2 14v2"/><path d="M22 14v2"/></svg>`,
  clipboard: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3h6v3H9z"/><path d="M8 10h8"/><path d="M8 14h8"/><path d="M8 18h5"/></svg>`,
  plus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>`,
  pencil: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  phone: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>`,
  map: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z"/><path d="M9 3v15"/><path d="M15 6v15"/></svg>`,
  flag: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/></svg>`,
  trophy: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 4H4v3a3 3 0 0 0 3 3"/><path d="M17 4h3v3a3 3 0 0 1-3 3"/></svg>`,
  chart: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/></svg>`,
};

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

  // Maturity check — users who have completed tasks before are not new
  const tasksDone = achievements.getStat("tasksDone");
  const isMature = tasksDone >= 3;

  // No agents hired yet
  if (hireable.length === 0) {
    items.push({
      id: "hire-first",
      label: "Hire your first agent",
      icon: SVG_ICONS.robot,
      action: "open_market",
      priority: 1,
    });
  }

  // Unassigned tasks + idle agents
  if (unassignedCards.length > 0 && idleAgents.length > 0) {
    items.push({
      id: "assign-tasks",
      label: `Assign ${unassignedCards.length} unassigned task${unassignedCards.length === 1 ? "" : "s"}`,
      icon: SVG_ICONS.clipboard,
      action: "open_board",
      priority: 2,
    });
  }

  // All agents busy + pending tasks → suggest hiring
  if (hireable.length > 0 && idleAgents.length === 0 && busyAgents.length >= hireable.length && pendingCards.length > 2) {
    items.push({
      id: "hire-more",
      label: "All agents busy — hire more",
      icon: SVG_ICONS.plus,
      action: "open_market",
      priority: 3,
    });
  }

  // No tasks on the board — only suggest for new users; mature users just have an empty board
  if (allCards.length === 0 && hireable.length > 0 && !isMature) {
    items.push({
      id: "create-task",
      label: "Create a task for your team",
      icon: SVG_ICONS.pencil,
      action: "open_board",
      priority: 4,
    });
  }

  // Hasn't connected any platform — only check after platform states have been received
  // (avoids race condition where platformStates is still [] before the WS message arrives)
  const hasPlatform = store.platformStates.some((p) => p.connected);
  if (store.platformStatesReceived && !hasPlatform && hireable.length > 0) {
    items.push({
      id: "connect-platform",
      label: "Connect Telegram/Slack for notifications",
      icon: SVG_ICONS.phone,
      action: "open_settings",
      priority: 5,
    });
  }

  // Hasn't explored the world — only for new users
  const creaturesKilled = achievements.getStat("creaturesKilled");
  if (creaturesKilled === 0 && hireable.length > 0 && !isMature) {
    items.push({
      id: "explore-world",
      label: "Step outside and explore the world",
      icon: SVG_ICONS.map,
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
      icon: SVG_ICONS.flag,
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
      icon: SVG_ICONS.trophy,
      action: "open_achievements",
      priority: 8,
    });
  }

  // Has agents but hasn't checked leaderboards
  if (hireable.length > 0) {
    items.push({
      id: "view-leaderboards",
      label: "See how you rank on leaderboards",
      icon: SVG_ICONS.chart,
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
