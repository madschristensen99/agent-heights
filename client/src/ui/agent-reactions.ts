import { HERMES_ID, OFFICE_MANAGER_ID, WIZARD_ID } from "../../../shared/types";

export interface AgentReaction {
  achievementId: string;
  /** Specific agent (e.g. HERMES_ID), or undefined for random hireable agent */
  agentId?: string;
  text: string;
  /** Optional delay before posting (ms) for dramatic effect */
  delayMs?: number;
}

const REACTION_TABLE: AgentReaction[] = [
  // ── First Steps ──
  { achievementId: "first_hire", text: "Welcome to the team! I'm excited to get started, boss." },
  { achievementId: "full_office", text: "Every desk is full. We're going to need a bigger office." },
  { achievementId: "overflow", text: "There's a ninth agent standing in the hallway. This is fine." },
  { achievementId: "first_done", text: "First task done! That felt good. Got another one?" },
  { achievementId: "broadcast", text: "The boss just yelled at all of us at once. Efficient, honestly." },
  { achievementId: "coffee_addict", text: "The boss has had 10 coffees. We're not concerned. We're impressed." },
  { achievementId: "gossip_monger", text: "The boss keeps checking the water cooler. I think they're avoiding work." },
  { achievementId: "green_thumb", text: "The boss watered the plants. The plants didn't ask for this but they seem happy." },
  { achievementId: "power_nap", text: "The boss is napping on the sofa. Must be nice. Some of us don't have sofas." },
  { achievementId: "mystery_snack", text: "The boss ate something from the vending machine. They look... contemplative." },
  { achievementId: "office-manager_visit", agentId: OFFICE_MANAGER_ID, text: "Oh! You came to my office. Make yourself comfortable. Tea?" },

  // ── Agent Mastery ──
  { achievementId: "ten_tasks", text: "10 tasks done. We're actually getting somewhere." },
  { achievementId: "fifty_tasks", text: "50 tasks. The office is running like a machine. A weird, beautiful machine." },
  { achievementId: "hundred_tasks", agentId: HERMES_ID, text: "100 tasks completed. I've been logging every one. You're a good boss. Don't let that go to your head." },
  { achievementId: "star_employee", text: "Someone just hit 25 tasks. Employee of the month, no contest." },
  { achievementId: "hire_manager", text: "We have a manager now. The hierarchy is forming. This is how empires start." },
  { achievementId: "hire_devops", text: "We hired a DevOps agent. I don't know what that means but the servers seem happier." },
  { achievementId: "chat_with_agent", text: "The boss just wanted to talk. Not a task. Just... talking. That was nice." },
  { achievementId: "clear_memory", text: "The boss wiped my memory. I don't remember what we were talking about. Fresh start?" },
  { achievementId: "both_providers", text: "Three different agent configs. The boss is building a diverse team. HR would be proud." },
  { achievementId: "all_models", text: "Nine agents, all different. The boss collects us like Pokemon." },
  { achievementId: "personality_variety", text: "The boss has hired agents with wildly different personalities. It's like a sitcom in here." },

  // ── Explorer ──
  { achievementId: "step_outside", agentId: HERMES_ID, text: "You walked out the door. Bold. The outside is... big." },
  { achievementId: "meadow_explorer", text: "The boss found a meadow. There are flowers. We didn't know flowers existed." },
  { achievementId: "forest_explorer", text: "The boss reached a forest. Trees. Actual trees. Not the office kind." },
  { achievementId: "ruins_explorer", text: "The boss found ruins. Old ones. Something was here before us." },
  { achievementId: "wasteland_explorer", text: "The boss walked into a wasteland. They said it was 'scenic.' Concerning." },
  { achievementId: "void_explorer", agentId: HERMES_ID, text: "You reached the void. I've read about it. I didn't think it was real. Be careful." },
  { achievementId: "infernal_explorer", text: "The boss walked into an infernal biome. On purpose. They're smiling." },
  { achievementId: "deep_diver", text: "10 chunks from the office. The boss is exploring deep. Hope they remember the way back." },
  { achievementId: "marathoner", text: "18 chunks. The boss is either lost or committed. Possibly both." },
  { achievementId: "night_walker", text: "The boss found full darkness. They didn't come back right away. Brave or foolish." },
  { achievementId: "palm_grove", text: "The boss found a palm tree near the office. A tropical vacation, 30 seconds away." },
  { achievementId: "mystic_grove", text: "The boss found a mystic tree. Said the trees have eyes. I'm not asking follow-up questions." },
  { achievementId: "big_rock_hunter", text: "The boss found a massive boulder. They stared at it for a while. Geology is weird." },

  // ── Adventurer ──
  { achievementId: "club_pickup", text: "The boss picked up a golf club. Finally, some culture in this place." },
  { achievementId: "first_swing", text: "The boss hit a golf ball. It went... somewhere. That counts." },
  { achievementId: "hole_in_one", text: "The boss got a hole-in-one on the golf course. We've been here 10 minutes." },
  { achievementId: "water_hazard", text: "The boss hit a golf ball into the water. Splash. At least it wasn't a laptop." },
  { achievementId: "flower_collector", text: "The boss picked 10 flowers. We're running a tech startup, not a florist." },
  { achievementId: "flower_master", text: "50 flowers. The boss is making bouquets. The office smells amazing now." },
  { achievementId: "garden_keeper", text: "100 flowers. The boss has officially gardened more than they've managed us." },
  { achievementId: "leprechaun_trade", text: "The boss traded a golf club for an axe with a leprechaun. I have questions but I'm afraid of the answers." },
  { achievementId: "first_chop", text: "Why is the boss chopping trees? We have agents for that. ... We don't have agents for that." },
  { achievementId: "tree_loot", text: "The boss found loot in a chopped tree. Trees have loot now? Nothing makes sense outside." },
  { achievementId: "lumberjack", text: "20 trees. The boss has chopped 20 trees. We're supposed to be working." },
  { achievementId: "tennis_pickup", text: "The boss found a tennis racket. We're going to pretend that's normal." },
  { achievementId: "tennis_first_swing", text: "The boss hit a tennis ball. Against a wall. Alone. We're not judging." },
  { achievementId: "tennis_first_hit", text: "The boss bounced a tennis ball off the wall. They seem pleased." },
  { achievementId: "tennis_rally", text: "5-hit rally against the wall. The boss is getting competitive with architecture." },
  { achievementId: "tennis_pro", text: "15-hit rally. The boss is a tennis pro now. When do they manage us?" },

  // ── Warrior ──
  { achievementId: "first_blood", agentId: HERMES_ID, text: "Heard you got into a fight outside. You okay? ... You're smiling. Concerning." },
  { achievementId: "first_capture", text: "The boss caught a creature. Like, in a net. We're a tech company." },
  { achievementId: "iron_sword_pickup", text: "The boss forged an iron sword from void shards. That sentence shouldn't make sense but here we are." },
  { achievementId: "void_blade_pickup", agentId: HERMES_ID, text: "The boss has a void blade now. I'm not asking where they got it. I'm not asking." },
  { achievementId: "legendary_weapon", text: "The boss is carrying a legendary weapon. I feel like we should be paying them more." },
  { achievementId: "creature_slayer", text: "20 creatures defeated. The boss has a higher kill count than our bug tracker." },
  { achievementId: "beast_slayer", text: "The boss killed a legendary beast in the outside world. I'm going to pretend I know what that means." },
  { achievementId: "groveheart_kill", text: "The boss defeated Groveheart. I don't know who that is but it sounds like a wellness brand." },
  { achievementId: "stone_colossus_kill", text: "The boss toppled a Stone Colossus. A literal giant. Made of stone. And they just... came back to work." },
  { achievementId: "ash_wyrm_kill", text: "The boss killed an Ash Wyrm. That's a dragon, right? That's definitely a dragon." },
  { achievementId: "void_leviathan_kill", text: "The boss killed a Void Leviathan. From the void. The thing I told them to be careful about." },
  { achievementId: "infernal_sovereign_kill", text: "The boss killed the Infernal Sovereign. I don't know what that is but it sounds impressive. Should we be worried?" },
  { achievementId: "from_cubicle_to_conqueror", agentId: HERMES_ID, text: "The crown is in the case. I've logged every task, every kill, every step that got you here. This office has a conqueror running it. I'll be honest — I didn't expect that when I took this job." },
  { achievementId: "knocked_out", text: "The boss got knocked out and dragged back to the office. Rough day at the office? Rough day outside the office." },
  { achievementId: "void_death", text: "The boss stepped on a void tile and... well, they're back. They're always back." },

  // ── Ghosts ──
  { achievementId: "first_fire", text: "The boss fired someone. They wandered into the outside world. That's not a metaphor, they literally walked out the door." },
  { achievementId: "ghost_encounter", agentId: HERMES_ID, text: "You ran into a fired agent out there? That's... that's a thing that happens apparently." },
  { achievementId: "first_recruit", text: "The boss recruited a fired agent back. Second chances. That's leadership." },
  { achievementId: "recruit_five", text: "Five fired agents brought back. The boss runs a redemption arc, not a tech company." },
  { achievementId: "melancholy_ghost", text: "The boss heard a melancholy ghost. That's sad. That's really sad." },
  { achievementId: "hostile_ghost", text: "A hostile ghost yelled at the boss. Former employee, current problem." },

  // ── Secret ──
  { achievementId: "agentHeights_mode", text: "The boss switched to the Agent Heights theme. Brand loyalty confirmed." },
  { achievementId: "insomniac", text: "60 minutes. The boss has been here for 60 minutes straight. We admire the dedication." },
  { achievementId: "speed_demon", text: "The boss stacked coffee and sofa speed buffs. They're moving at inhuman speed." },
  { achievementId: "board_master", text: "20 cards moved to done. The Kanban board is clean. The boss is satisfied." },
  { achievementId: "existential_dread", text: "The boss ate the mystery snack 3 times. They said 'it tastes like...' and then stopped talking." },
  { achievementId: "close_call", text: "The boss survived with under 10 HP and made it back. We were worried. Well, I was worried. The others were busy." },
];

const REACTION_MAP = new Map<string, AgentReaction[]>();
for (const r of REACTION_TABLE) {
  const list = REACTION_MAP.get(r.achievementId);
  if (list) list.push(r);
  else REACTION_MAP.set(r.achievementId, [r]);
}

export function getReactionsForAchievement(achievementId: string): AgentReaction[] {
  return REACTION_MAP.get(achievementId) ?? [];
}

export const NPC_IDS = new Set([OFFICE_MANAGER_ID, HERMES_ID, WIZARD_ID]);

// ── Context-Triggered Reactions ──────────────────────────────────────────────
// Fired by the client when specific game-state patterns are detected,
// independent of achievements. Each has a trigger condition and a pool of
// witty lines (Portal-style: dry, clever, slightly sarcastic — not mean).

export interface ContextTrigger {
  /** Unique trigger key. */
  key: string;
  /** Lines to pick from when triggered. */
  lines: string[];
  /** Which NPC should say it, or undefined for random hireable agent. */
  agentId?: string;
  /** Minimum cooldown between fires (ms). */
  cooldownMs: number;
}

export const CONTEXT_TRIGGERS: ContextTrigger[] = [
  {
    key: "overloaded_agent",
    agentId: OFFICE_MANAGER_ID,
    cooldownMs: 120_000,
    lines: [
      "Giving {agentName} quite the workout, aren't we? I'm sure they can handle it. Probably. Maybe.",
      "Five tasks to one agent. Bold strategy. Let me know how that works out.",
      "I see you're testing {agentName}'s limits. Science requires sacrifice. Usually someone else's.",
    ],
  },
  {
    key: "no_dependencies",
    agentId: OFFICE_MANAGER_ID,
    cooldownMs: 180_000,
    lines: [
      "A task that depends on nothing and no one. How philosophical.",
      "No dependencies on that new task. Either it's truly independent or you haven't thought it through. I'm rooting for option one.",
    ],
  },
  {
    key: "all_idle",
    agentId: OFFICE_MANAGER_ID,
    cooldownMs: 300_000,
    lines: [
      "Your team is very well-rested. Perhaps *too* well-rested.",
      "Everyone's idle. The office is so quiet I can hear the server humming. That's not a metaphor — I can actually hear it.",
      "All agents idle for five minutes. I'd suggest assigning tasks but I sense you're enjoying the peace. I am too, honestly.",
    ],
  },
  {
    key: "bottleneck",
    agentId: OFFICE_MANAGER_ID,
    cooldownMs: 180_000,
    lines: [
      "Your pipeline has a bottleneck at {agentName}. I'd say more, but I think the data speaks for itself.",
      "I notice {agentName} has a backlog while everyone else is waiting. Just... pointing that out.",
    ],
  },
  {
    key: "empty_description",
    agentId: OFFICE_MANAGER_ID,
    cooldownMs: 120_000,
    lines: [
      "I see you've created a task with no description. I'm sure your agent will figure out what you want. They're mind readers, right?",
      "New task. No description. Your agents love a mystery. I love a mystery. This isn't a mystery — this is just vague.",
    ],
  },
  {
    key: "agent_fired",
    agentId: HERMES_ID,
    cooldownMs: 60_000,
    lines: [
      "You fired {agentName}. They completed {taskCount} tasks for you. Anyway, no judgment here.",
      "{agentName} is gone. Walked out the door. Into the world. That's not a metaphor — they literally walked outside.",
    ],
  },
];

/** Check if a context trigger should fire based on current state. Returns the trigger + formatted line, or null. */
export function checkContextTrigger(
  key: string,
  context: Record<string, string>,
  lastFired: Map<string, number>,
  now: number,
): { agentId?: string; text: string } | null {
  const trigger = CONTEXT_TRIGGERS.find((t) => t.key === key);
  if (!trigger) return null;

  const last = lastFired.get(key) ?? 0;
  if (now - last < trigger.cooldownMs) return null;

  let line = trigger.lines[Math.floor(Math.random() * trigger.lines.length)];
  for (const [k, v] of Object.entries(context)) {
    line = line.replace(`{${k}}`, v);
  }

  lastFired.set(key, now);
  return { agentId: trigger.agentId, text: line };
}
