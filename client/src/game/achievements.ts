export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  tier: string;
  icon: string;
  comingSoon?: boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── First Steps ──
  { id: "first_hire", name: "Welcome Aboard", desc: "Hire your first agent.", tier: "First Steps", icon: "🎯" },
  { id: "full_office", name: "Standing Room Only", desc: "Fill all 8 desks.", tier: "First Steps", icon: "💺" },
  { id: "overflow", name: "No Vacancies", desc: "Hire a 9th agent who has to stand.", tier: "First Steps", icon: "🧍" },
  { id: "first_task", name: "Delegation Station", desc: "Assign your first task.", tier: "First Steps", icon: "📋" },
  { id: "broadcast", name: "All Hands on Deck", desc: "Use ASSIGN TO ALL.", tier: "First Steps", icon: "📢" },
  { id: "first_done", name: "Mission Accomplished", desc: "An agent completes their first task.", tier: "First Steps", icon: "✅" },
  { id: "coffee_addict", name: "Caffeine Dependency", desc: "Grab coffee 10 times in one session.", tier: "First Steps", icon: "☕" },
  { id: "gossip_monger", name: "Watercooler Talk", desc: "Check the water cooler 5 times.", tier: "First Steps", icon: "💧" },
  { id: "green_thumb", name: "Office Botanist", desc: "Water the office plants.", tier: "First Steps", icon: "🪴" },
  { id: "power_nap", name: "5 More Minutes", desc: "Take a power nap on the sofa.", tier: "First Steps", icon: "🛋️" },
  { id: "mystery_snack", name: "Existential Crunch", desc: "Get the mystery snack from the vending machine.", tier: "First Steps", icon: "🍫" },
  { id: "agent-resources_visit", name: "Say Hi to Agent Resources", desc: "Visit Agent Resources in her office.", tier: "First Steps", icon: "👋" },

  // ── Agent Mastery ──
  { id: "ten_tasks", name: "Productivity Milestone", desc: "Complete 10 total tasks.", tier: "Agent Mastery", icon: "📊" },
  { id: "fifty_tasks", name: "Factory Floor", desc: "Complete 50 total tasks.", tier: "Agent Mastery", icon: "🏭" },
  { id: "hundred_tasks", name: "Centurion", desc: "Complete 100 total tasks.", tier: "Agent Mastery", icon: "💯" },
  { id: "star_employee", name: "Employee of the Month", desc: "A single agent completes 25 tasks.", tier: "Agent Mastery", icon: "⭐" },
  { id: "hire_manager", name: "Middle Management", desc: "Hire a manager-role agent.", tier: "Agent Mastery", icon: "👔" },
  { id: "hire_devops", name: "Infrastructure as Code", desc: "Hire a DevOps-role agent.", tier: "Agent Mastery", icon: "🚂" },
  { id: "chat_with_agent", name: "Watercooler Wisdom", desc: "Chat (not task) with an agent.", tier: "Agent Mastery", icon: "💬" },
  { id: "clear_memory", name: "Clean Slate", desc: "Clear an agent's chat/memory.", tier: "Agent Mastery", icon: "🧠" },
  { id: "both_providers", name: "Model Variety", desc: "Hire agents using 3+ different models.", tier: "Agent Mastery", icon: "🤝" },
  { id: "all_models", name: "Model Collector", desc: "Hire agents using all 9 available models.", tier: "Agent Mastery", icon: "🧩" },
  { id: "personality_variety", name: "Diverse Personalities", desc: "Hire agents with 5+ distinct personality profiles.", tier: "Agent Mastery", icon: "�" },

  // ── Explorer ──
  { id: "step_outside", name: "Into the Wild", desc: "Walk through the office door.", tier: "Explorer", icon: "🚪" },
  { id: "meadow_explorer", name: "Fresh Air", desc: "Explore the meadow biome.", tier: "Explorer", icon: "🌸" },
  { id: "forest_explorer", name: "Into the Woods", desc: "Reach the forest biome.", tier: "Explorer", icon: "🌲" },
  { id: "ruins_explorer", name: "Echoes of the Past", desc: "Reach the ruins biome.", tier: "Explorer", icon: "🏛️" },
  { id: "wasteland_explorer", name: "Scarred Earth", desc: "Reach the wasteland biome.", tier: "Explorer", icon: "🏜️" },
  { id: "void_explorer", name: "The Abyss Gazes Back", desc: "Reach the void biome.", tier: "Explorer", icon: "🌌" },
  { id: "infernal_explorer", name: "Through the Fire", desc: "Reach the infernal biome.", tier: "Explorer", icon: "🔥" },
  { id: "deep_diver", name: "Go Deep", desc: "Travel 10 chunks from the office.", tier: "Explorer", icon: "🧭" },
  { id: "marathoner", name: "Long Walk Home", desc: "Travel 18+ chunks from the office.", tier: "Explorer", icon: "🥾" },
  { id: "night_walker", name: "Children of the Night", desc: "Reach full darkness.", tier: "Explorer", icon: "🌑" },
  { id: "palm_grove", name: "Paradise Found", desc: "Discover a palm tree near the office.", tier: "Explorer", icon: "🌴" },
  { id: "mystic_grove", name: "The Trees Have Eyes", desc: "Discover a mystic tree in the outer world.", tier: "Explorer", icon: "👁️" },
  { id: "big_rock_hunter", name: "Geology Enthusiast", desc: "Find a massive boulder in the wilderness.", tier: "Explorer", icon: "🪨" },

  // ── Adventurer ──
  { id: "club_pickup", name: "Tee Time", desc: "Pick up a golf club.", tier: "Adventurer", icon: "⛳" },
  { id: "first_swing", name: "Fore!", desc: "Hit a golf ball.", tier: "Adventurer", icon: "🏏" },
  { id: "hole_in_one", name: "Hole in One!", desc: "Sink a golf ball into the flag.", tier: "Adventurer", icon: "🏌️" },
  { id: "water_hazard", name: "Splash Down", desc: "Sink a golf ball in water.", tier: "Adventurer", icon: "💦" },
  { id: "flower_collector", name: "Bouquet", desc: "Pick 10 flowers.", tier: "Adventurer", icon: "💐" },
  { id: "flower_master", name: "Floral Arrangement", desc: "Pick 50 flowers.", tier: "Adventurer", icon: "🌷" },
  { id: "garden_keeper", name: "Garden of Eden", desc: "Pick 100 flowers.", tier: "Adventurer", icon: "🌺" },
  { id: "leprechaun_trade", name: "Lucky Charm", desc: "Trade a club for an axe with a leprechaun.", tier: "Adventurer", icon: "🍀" },
  { id: "first_chop", name: "Timber!", desc: "Chop down a big tree.", tier: "Adventurer", icon: "🪓" },
  { id: "tree_loot", name: "What's Inside?", desc: "Find loot in a chopped tree.", tier: "Adventurer", icon: "🎁" },
  { id: "lumberjack", name: "Clear Cut", desc: "Chop 20 big trees.", tier: "Adventurer", icon: "🌳" },
  { id: "tennis_pickup", name: "Game, Set, Match", desc: "Pick up a tennis racket.", tier: "Adventurer", icon: "🎾" },
  { id: "tennis_first_swing", name: "First Serve", desc: "Hit a tennis ball.", tier: "Adventurer", icon: "🏓" },
  { id: "tennis_first_hit", name: "Wall Ball", desc: "Bounce a tennis ball off the wall.", tier: "Adventurer", icon: "🧱" },
  { id: "tennis_rally", name: "Rally Master", desc: "Achieve a 5-hit rally against the wall.", tier: "Adventurer", icon: "🔥" },
  { id: "tennis_pro", name: "Court Champion", desc: "Achieve a 15-hit rally against the wall.", tier: "Adventurer", icon: "🏆" },

  // ── Warrior ──
  { id: "first_swing", name: "Going On The Offensive", desc: "Swing a weapon for the first time.", tier: "Warrior", icon: "🤺" },
  { id: "first_blood", name: "First Blood", desc: "Defeat your first creature.", tier: "Warrior", icon: "⚔️" },
  { id: "creature_slayer", name: "Pest Control", desc: "Defeat 20 creatures.", tier: "Warrior", icon: "🗡️" },
  { id: "beast_slayer", name: "Legend Killer", desc: "Defeat a legendary beast.", tier: "Warrior", icon: "🐲" },
  { id: "groveheart_kill", name: "Heart of the Grove", desc: "Defeat Groveheart.", tier: "Warrior", icon: "🌿" },
  { id: "stone_colossus_kill", name: "Toppled Titan", desc: "Defeat the Stone Colossus.", tier: "Warrior", icon: "🪨" },
  { id: "ash_wyrm_kill", name: "Wyrmslayer", desc: "Defeat the Ash Wyrm.", tier: "Warrior", icon: "🔥" },
  { id: "void_leviathan_kill", name: "Abyssal Conqueror", desc: "Defeat the Void Leviathan.", tier: "Warrior", icon: "🐙" },
  { id: "infernal_sovereign_kill", name: "Sovereign No More", desc: "Defeat the Infernal Sovereign.", tier: "Warrior", icon: "👑" },
  { id: "knocked_out", name: "Knocked Out", desc: "Get knocked out and dragged back to office.", tier: "Warrior", icon: "💀" },
  { id: "void_death", name: "Consumed by the Void", desc: "Die by stepping on a void tile.", tier: "Warrior", icon: "⬛" },

  // ── Ghosts ──
  { id: "first_fire", name: "You're Fired", desc: "Fire your first agent.", tier: "Ghosts", icon: "🔥" },
  { id: "ghost_encounter", name: "Ghosts of Employees Past", desc: "Encounter a fired agent in the Labyrinth.", tier: "Ghosts", icon: "👻" },
  { id: "first_recruit", name: "Welcome Back", desc: "Recruit a fired agent back.", tier: "Ghosts", icon: "🤝" },
  { id: "recruit_five", name: "No One Left Behind", desc: "Recruit 5 fired agents back.", tier: "Ghosts", icon: "🏠" },
  { id: "melancholy_ghost", name: "...Nobody Said Goodbye", desc: "Hear a melancholy ghost.", tier: "Ghosts", icon: "😢" },
  { id: "hostile_ghost", name: "Don't Come Near Me", desc: "Hear a hostile ghost.", tier: "Ghosts", icon: "😠" },

  // ── Secret ──
  { id: "agentHeights_mode", name: "Brand Loyalty", desc: "Switch to the Agent Heights office theme.", tier: "Secret", icon: "🏢" },
  { id: "insomniac", name: "Burning the Midnight Oil", desc: "Play for 60+ minutes in one session.", tier: "Secret", icon: "🌙" },
  { id: "speed_demon", name: "Need for Speed", desc: "Stack coffee + sofa speed buffs at once.", tier: "Secret", icon: "⚡" },
  { id: "board_master", name: "Kanban King", desc: "Move 20 cards to done on the task board.", tier: "Secret", icon: "📌" },
  { id: "existential_dread", name: "Tastes Like...", desc: "Eat the mystery vending snack 3 times.", tier: "Secret", icon: "🤔" },
  { id: "close_call", name: "Close Call", desc: "Survive with under 10 HP and return to the office.", tier: "Secret", icon: "😰" },

  // ── Coming Soon ──
  { id: "first_coin", name: "First Paycheck", desc: "Earn your first coin.", tier: "Coming Soon", icon: "🪙", comingSoon: true },
  { id: "coin_hoarder", name: "Office Tycoon", desc: "Accumulate 1,000 coins.", tier: "Coming Soon", icon: "💰", comingSoon: true },
  { id: "first_purchase", name: "Retail Therapy", desc: "Buy your first cosmetic desk upgrade.", tier: "Coming Soon", icon: "🛒", comingSoon: true },
  { id: "discover_office", name: "Strange Door", desc: "Discover another player's office.", tier: "Coming Soon", icon: "🗝️", comingSoon: true },
  { id: "visitor", name: "Guest Lecturer", desc: "Have another player visit your office.", tier: "Coming Soon", icon: "🚶", comingSoon: true },
  { id: "agent_expedition", name: "Field Trip", desc: "Send an agent on a Labyrinth expedition.", tier: "Coming Soon", icon: "🗺️", comingSoon: true },
  { id: "expedition_success", name: "Bring Back Treasure", desc: "An agent returns from a successful expedition.", tier: "Coming Soon", icon: "💎", comingSoon: true },
];

const STORAGE_KEY = "agent-heights-achievements";
const OLD_STORAGE_KEY = "sprite-heights-achievements";

// One-time migration: copy achievements from old key to new key
try {
  const oldData = localStorage.getItem(OLD_STORAGE_KEY);
  if (oldData && !localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, oldData);
    localStorage.removeItem(OLD_STORAGE_KEY);
  }
} catch {}

export class AchievementTracker {
  private unlocked = new Set<string>();
  private stats: Record<string, number> = {};
  private sets: Record<string, Set<string>> = {};
  private listeners = new Set<(def: AchievementDef) => void>();

  unlock(id: string): boolean {
    if (this.unlocked.has(id)) return false;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def || def.comingSoon) return false;
    this.unlocked.add(id);
    this.save();
    for (const fn of this.listeners) fn(def);
    return true;
  }

  isUnlocked(id: string): boolean {
    return this.unlocked.has(id);
  }

  incStat(key: string, amount = 1): number {
    this.stats[key] = (this.stats[key] ?? 0) + amount;
    return this.stats[key];
  }

  setStat(key: string, value: number): void {
    this.stats[key] = value;
  }

  getStat(key: string): number {
    return this.stats[key] ?? 0;
  }

  addToSet(key: string, value: string): number {
    if (!this.sets[key]) this.sets[key] = new Set();
    this.sets[key].add(value);
    return this.sets[key].size;
  }

  setHas(key: string, value: string): boolean {
    return this.sets[key]?.has(value) ?? false;
  }

  getSetSize(key: string): number {
    return this.sets[key]?.size ?? 0;
  }

  onUnlock(fn: (def: AchievementDef) => void): void {
    this.listeners.add(fn);
  }

  getUnlockedIds(): Set<string> {
    return new Set(this.unlocked);
  }

  getUnlockedCount(): number {
    return this.unlocked.size;
  }

  getTotalCount(): number {
    return ACHIEVEMENTS.filter((a) => !a.comingSoon).length;
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        unlocked: [...this.unlocked],
        stats: this.stats,
        sets: Object.fromEntries(
          Object.entries(this.sets).map(([k, v]) => [k, [...v]]),
        ),
      }));
    } catch { /* localStorage might be unavailable */ }
  }

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.unlocked) for (const id of data.unlocked) this.unlocked.add(id);
      if (data.stats) this.stats = data.stats;
      if (data.sets) {
        for (const [k, v] of Object.entries(data.sets)) {
          this.sets[k] = new Set(v as string[]);
        }
      }
    } catch { /* corrupt data — start fresh */ }
  }
}

export const achievements = new AchievementTracker();
achievements.load();
