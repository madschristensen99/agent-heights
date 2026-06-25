# Agent HQ — Robot Expeditions

Idle office agents collectively plan, fund, and deploy robots into the
Labyrinth. The agents never leave the office — they build proxies that
venture out on their behalf. The player funds the expeditions with coins.

---

## 1. Vision

The agents are coworkers with a shared hobby. They sit around the water cooler
and dream about what's out there in the Labyrinth. They plan expeditions
together, pool their resources, argue about strategy, and come to you (the
boss) asking for funding. It's a startup within a startup — they have side
projects and they need your sign-off.

You are the venture capitalist. The agents are the founders. The robots are
their product. The Labyrinth is the market.

---

## 2. The Resource Economy

### Scrap

- **Shared office pool** — not per-agent. The whole team contributes and draws
  from it.
- **Earned passively** — each completed task by any agent generates a small
  amount of scrap (1–3 per task). The idea: their work produces leftover
  materials/metadata they can repurpose.
- **Also earned from expeditions** — treasure brought back by robots is
  converted into scrap (chests: 10–30, crystals: 5–15).
- **Spent on robot builds** — each tier has a scrap cost.

### Coins

- **The player's resource** — agents don't have coins, you do.
- **Earned by the player** from:
  - Task completion (each completed task gives the player a few coins —
    "company revenue")
  - Achievement unlocks (bonus coins per achievement)
  - Treasure brought back by robots (agents split the scrap, you get the coins)
- **Spent by the player** to fund expeditions — the agents petition you for
  coins to cover robot build costs.
- **Future sink** — cosmetic desk upgrades, office decorations (ties into the
  existing "Coming Soon" achievement `first_purchase`).

### The tension

You want to fund expeditions because they're fun, generate achievements, and
yield more coins (treasure). But you also need coins for whatever else the
office economy will offer. Expeditions are the main coin sink for now.

---

## 3. The Expedition Loop

```
Agents complete tasks → earn scrap (passive, shared pool)
    │
    ▼
Scrap accumulates + enough idle agents → team enters planning huddle
    │
    ▼  player walks up, presses E
Petition: "We want to build a Ranger, send it to the ruins. 40 scrap + 25 coins."
    │
    ├──► Player approves → build phase → robot deploys
    ├──► Player denies → agents grumble, back to idle, try again later
    └──► Player partially funds → "OK, we'll build a Scout instead"
    │
    ▼
Build phase — 2–3 agents gather at a desk, work animations, progress bar
    │  (assigning a task to a building agent interrupts the build, loses scrap)
    ▼
Robot spawns at office door → explores, fights, collects
    │
    ├──► Robot returns to door → loot delivered → agents celebrate
    ├──► Robot destroyed → agents mourn → theory-craft next expedition
    └──► Robot returns empty → "maybe next time"
    │
    ▼
Loot converted to scrap + coins + knowledge
    │
    ▼
Team reacts, learns, plans next expedition with better info
    │
    ▼  (loop)
```

---

## 4. The Planning Phase

This is the key social piece. When the team has enough scrap and enough idle
agents, they enter a **planning huddle** — a visual gathering around the water
cooler. You can see them clustered together, speech bubbles going, clearly
discussing something.

### When it triggers

- At least **2 agents** are idle (not thinking/working/done/error)
- Shared scrap pool has reached a minimum threshold (20+)
- No robot is currently deployed (one expedition at a time for v1)
- Cooldown from last expedition has passed (30s after return/destruction)

### The petition

Walk up to the huddle and press E. A small panel appears:

- **What they want to build** — robot tier (scout, ranger, bruiser, excavator)
- **Where they want to send it** — target biome (farther = more risk, more
  reward)
- **What it'll cost** — scrap + coins
- **What they're hoping to find** — treasure, creature samples, "just want to
  see what's out there"
- **Buttons:** Approve / Deny / Downgrade (partial fund)

### How the plan is generated

The team's proposal is influenced by office state and expedition history:

- **Scrap available** — determines which tiers are affordable
- **Number of idle agents** — more idle agents = more ambitious plans
- **Past expedition outcomes** — if a Scout got destroyed in the ruins, they
  suggest a tougher bot or a closer biome. If a Ranger brought back treasure
  from the forest, they might suggest going deeper.
- **Knowledge level** — accumulated from past expeditions. Higher knowledge =
  smarter biome choices, better tier recommendations, eventually unlocks new
  robot types.

### If denied

Agents go back to the water cooler and grumble. They'll try again after a
cooldown (60s), possibly with a cheaper proposal: "Fine. We'll just build a
Scout. 20 scrap, 10 coins?"

---

## 5. Robot Tiers

| Tier | Name | Scrap | Coins | HP | Damage | Speed | Lifetime | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | Scout | 20 | 10 | 50 | 8 | 110 | 60s | Fast, fragile, explores far but can't fight much |
| 2 | Ranger | 40 | 25 | 80 | 15 | 90 | 90s | Balanced — the default expedition bot |
| 3 | Bruiser | 80 | 50 | 150 | 25 | 70 | 120s | Slow tank, can fight hostility 3 creatures |
| 4 | Excavator | 60 | 40 | 100 | 10 | 80 | 120s | Specialized for treasure — wider collect radius, detects treasure through walls |

The team proposes a tier based on their scrap and past experience. You can
override (e.g., "give me the cheap one") or deny.

---

## 6. The Build Phase

Once funded, the team builds together.

- **2–3 agents** gather at the desk closest to the office door
- They play "work" animations, sparks fly, a progress bar appears above the desk
- Their status shows "Building robot (side project)"
- Build time scales with tier:
  - Scout: 30s
  - Ranger: 45s
  - Bruiser: 75s
  - Excavator: 60s
- **Interruption:** assigning a task to a building agent interrupts the build.
  The invested scrap is lost. The agent hops up and goes to work. The other
  builders disperse with a sad line.

---

## 7. Robot Entity

### `RobotNPC` class

Lives in `WorldLayer` alongside `Creature`, `LegendaryBeast`, `FriendlyCreature`,
and `GhostNPC`.

```typescript
class RobotNPC {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  lightGlow: Phaser.GameObjects.Image;  // agent accent color aura
  hpBar: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;       // "Scout-1 (Mocha)"

  // Identity
  agentId: string;       // linked office agent (lead builder)
  agentName: string;
  accentColor: number;   // from AgentInfo.accent
  tier: RobotTier;       // 1–4
  robotNumber: number;   // increments per agent: "Scout-1", "Scout-2", etc.

  // Stats (tier-based)
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackCd: number;
  lifetime: number;      // ms before auto-retreat

  // AI state
  state: "explore" | "hunt" | "collect" | "retreat" | "dead";
  targetX: number;
  targetY: number;
  exploreDir: number;    // radians, picked at spawn
  bornAt: number;
  loot: RobotLoot;       // accumulated treasure
  killCount: number;

  // Combat
  alive: boolean;
  attackCdTimer: number;
}
```

### Robot AI

```
state = explore
  · move in exploreDir, occasionally adjusting ±30°
  · if creature within aggroRange (200px) → state = hunt
  · if treasure tile within 3 tiles → state = collect
  · if HP < 25% or lifetime expired → state = retreat
  · if reached edge of loaded chunks → turn back toward office

state = hunt
  · move toward nearest creature
  · on contact (dist < 35px) → attack (deal damage, take damage)
  · if creature dies → state = explore, increment killCount
  · if HP < 25% → state = retreat

state = collect
  · move to treasure tile
  · on arrival → collect (remove tile, add to loot, sparkBurst)
  · → state = explore

state = retreat
  · move toward office door (officeW/2, officeH)
  · if reached door → deliver loot, destroy robot, agents react
  · if HP reaches 0 → destroyed, agents react sadly
```

### Robot sprite

Generated procedurally via CanvasTexture in `textures.ts`. Appearance varies by
tier:

- **Scout** — small, spindly, single antenna, thin limbs. ~20px.
- **Ranger** — medium humanoid robot, visor eye, compact body. ~24px.
- **Bruiser** — bulky, armored plating, wide stance, no antenna. ~28px.
- **Excavator** — medium with a scoop arm / sensor dish on top. ~24px.

All tinted in the lead agent's accent color. 4 frames each: idle (0),
walk-1 (1), walk-2 (2), attack (3).

### Robot death

When HP reaches 0:
- `vfx.deathDissolve()` with the agent's accent color
- `vfx.shockwave()` — small
- `audio.death()` — mechanical break sound
- Robot removed from world
- Agent enters reacting state with a sad line
- Achievement: `robot_lost`

---

## 8. Combat

### Robot vs. Creature

Robots initiate combat. Creatures continue targeting the player only (no AI
change needed). The robot's `update()` checks for nearby creatures and calls
`creature.takeDamage(robot.damage)` on attack.

Combat flow:
1. Robot within 35px of creature → robot attacks
2. Robot deals `robot.damage` to creature via `creature.takeDamage()`
3. Creature deals `creature.damage` to robot via `robot.takeDamage()`
4. Repeat on attack cooldowns (robot: 800ms, creature: 1000ms)
5. Either dies → combat ends

### Robot vs. Legendary Beast

Robots can engage beasts but will almost certainly lose (beasts have 200–1200
HP vs. robot's 50–150 HP). A brave robot that damages a beast before dying
contributes to the player's fight — emergent teamwork. Achievement:
`beast_scout`.

### Player interaction

- **Click a robot** → tooltip: agent name, tier, HP, loot count, status
- **Robots are passive to the player** — no friendly fire, no collision
- **Robots show on the minimap** as green dots (agent accent color)

---

## 9. Treasure System

### New tile types

Add to `TILE` enum in `shared/types.ts`:

```typescript
TREASURE_CHEST: 30,    // small chest, collectible by robots
TREASURE_CRYSTAL: 31,  // glowing crystal, collectible by robots
```

### Worldgen placement

Treasure tiles spawn in chunks based on hostility — farther = more treasure,
more risk:

| Biome | Hostility | Chance per chunk | Tiles placed | Type |
|---|---|---|---|---|
| Meadow | 0 | 0% | — | Safe zone, no reward |
| Forest | 1 | 5% | 1–2 | Crystal |
| Ruins | 2 | 8% | 1–3 | Mix of chest/crystal |
| Wasteland | 3 | 12% | 2–4 | More chests |
| Void | 4 | 15% | 2–4 | Chests + crystals |
| Infernal | 5 | 20% | 3–6 | Rich but deadly |

### Collection

- Robot walks onto treasure tile → tile reverts to base ground, loot count
  increments, `vfx.sparkBurst()` in gold/white
- Excavator tier has a 3-tile collect radius (collects adjacent treasure
  automatically)
- Treasure tiles are walkable (like flowers/bushes) so they don't block movement

---

## 10. The Social Layer

This is what makes it feel alive vs. mechanical.

### Agent dialogue

When you click an agent whose robot is deployed, you get contextual lines based
on the robot's status:

- **Robot healthy and far out:** "Last telemetry says it's in the wasteland.
  Incredible."
- **Robot low HP:** "Signal's getting weak... come on, little guy..."
- **Robot found treasure:** "It found a chest! We're going to be rich!"
- **Robot in combat:** "It's fighting something. The readings are spiking."
- **Robot destroyed:** "...we knew the risks."
- **Robot returned with loot:** "Yes! 3 crystals and a chest!"
- **Robot returned empty:** "Nothing this time. We'll adjust the route."

### Feed integration

Agents post about expeditions in the activity feed:

- Planning: *"Mocha: 'I think we should send the next one to the forest. The
  ruins chewed up our last Scout.'"*
- Pooling resources: *"Pixel: 'I've got 12 scrap saved up from my last three
  tasks. Let's pool it.'"*
- Build started: *"Mocha: 'Starting on the Ranger. Pixel, hand me that
  soldering iron.'"*
- Robot deployed: *"Pixel: 'Ranger-1 is out the door. Godspeed, little
  buddy.'"*
- Robot returned: *"Mocha: 'Ranger-1 made it back! 2 crystals, 1 chest, and it
  took down a wolf on the way home.'"*
- Robot destroyed: *"Pixel: '...Ranger-1 didn't make it back. The ruins got
  it.'"*

### Personality flavor

Based on existing `PERSONALITIES` in `server/manager.ts`:

- The **Docs Bard** writes dramatic expedition reports
- The **Yak Shaver** suggests cautious routes and cheaper bots
- The **Code Gremlin** wants to build the biggest robot possible
- The **Merge Medic** worries about robot HP and suggests Bruisers

### Expedition history

Past expeditions are remembered. Agents reference past robots by number:
"Remember when Scout-2 made it to the void? That was a good bot." The history
informs future planning — if a Scout died in the ruins, the team won't suggest
sending another Scout there.

### Huddle visuals

The planning huddle reuses the existing `AgentNPC.huddle()` system. Agents
physically gather around the water cooler, speech bubbles appear, they face
each other. When the player approaches and presses E, the petition panel
appears. After approval/denial, they disperse.

---

## 11. Knowledge System

Each expedition accumulates **knowledge points** for the office:

| Outcome | Knowledge |
|---|---|
| Robot returned safely | +1 |
| Robot returned with loot | +2 |
| Robot killed a creature | +1 per kill |
| Robot damaged a beast | +3 |
| Robot destroyed | +1 (learned from failure) |
| Robot reached a new biome | +5 (first time only) |

Knowledge levels unlock:

| Level | Unlock |
|---|---|
| 1 | Better biome recommendations in petitions |
| 3 | Excavator tier becomes available |
| 5 | Team suggests two-bot expeditions (v2) |
| 10 | Custom robot loadouts (v2) |

---

## 12. Achievements

### Activate existing "Coming Soon"

- `agent_expedition` — "Send an agent on a Labyrinth expedition." → first robot
  deployed
- `expedition_success` — "An agent returns from a successful expedition." →
  first robot returns with loot

### New achievements

| ID | Name | Description | Tier |
|---|---|---|---|
| `first_robot` | Side Project | Fund your first robot expedition. | First Steps |
| `robot_slayer` | Remote Control | A robot kills 5 creatures in one expedition. | Warrior |
| `robot_lost` | We Knew the Risks | Lose a robot in the Labyrinth. | Warrior |
| `treasure_hunter` | X Marks the Spot | A robot brings back treasure. | Adventurer |
| `robot_army` | Assembly Line | Have 3 robots active simultaneously (v2). | Adventurer |
| `beast_scout` | Reconnaissance | A robot damages a legendary beast. | Warrior |
| `deep_robot` | Long Range Scout | A robot reaches the void biome or beyond. | Explorer |
| `expedition_veteran` | Seasoned Explorers | Complete 10 expeditions. | Agent Mastery |
| `scrap_hoarder` | Junk Collectors | Accumulate 100 scrap. | Secret |
| `first_funding` | Angel Investor | Fund your first expedition. | First Steps |

---

## 13. Data Structures

### Server-side (`shared/types.ts`)

```typescript
/** Shared office expedition state. */
interface ExpeditionState {
  scrap: number;           // shared pool
  knowledge: number;       // accumulated knowledge points
  history: ExpeditionRecord[];  // past expeditions
  activeRobot: ActiveRobot | null;  // null when no robot deployed
}

interface ExpeditionRecord {
  id: string;
  tier: RobotTier;
  targetBiome: string;
  outcome: "returned" | "destroyed" | "empty";
  loot: { chests: number; crystals: number };
  kills: number;
  reachedBiome: string;    // deepest biome reached
  timestamp: number;
  agentIds: string[];      // builders
}

interface ActiveRobot {
  id: string;
  tier: RobotTier;
  agentId: string;         // lead builder
  agentIds: string[];      // all builders
  deployedAt: number;
  robotNumber: number;     // per-agent counter
}

type RobotTier = 1 | 2 | 3 | 4;
```

### Client-side (`world.ts`)

```typescript
interface RobotLoot {
  chests: number;
  crystals: number;
}
```

### Messages (`shared/types.ts`)

```typescript
| { type: "fund_expedition"; tier: RobotTier; coins: number }
| { type: "deny_expedition" }
| { type: "expedition_status"; state: ExpeditionState }
| { type: "expedition_update"; robot: ActiveRobot | null }
| { type: "expedition_result"; record: ExpeditionRecord; coinsEarned: number; scrapEarned: number }
```

---

## 14. Implementation Plan

### Phase 1 — Economy + Planning (server-heavy)

1. **`ExpeditionState`** in save file — scrap, knowledge, history
2. **Scrap generation** — increment on task completion in `manager.ts`
3. **Coin tracking** — player coins, increment on task completion
4. **Planning logic** — server detects when huddle should trigger, generates
   petition based on scrap/knowledge/history
5. **Petition message** — server sends proposed plan to client
6. **Fund/deny messages** — client sends approval, server validates coins,
   starts build

### Phase 2 — Build + Deploy (client-heavy)

7. **Build phase visuals** — agents gather at desk, progress bar, interrupt on
   task assignment
8. **`RobotNPC` class** — entity in `WorldLayer` with tier-based stats
9. **Robot sprite generation** — 4 tier designs in `textures.ts`
10. **Robot AI** — explore/hunt/collect/retreat state machine
11. **Robot spawning** — at office door, linked to agent

### Phase 3 — Combat + Treasure

12. **Robot combat** — `robot.takeDamage()`, calls `creature.takeDamage()`
13. **Creature targeting extension** — creatures can target robots if player
    isn't closer
14. **Treasure tiles** — new `TILE` entries, worldgen placement, robot
    collection
15. **Robot return/destruction** — loot delivery at door, agent reactions

### Phase 4 — Social + Polish

16. **Agent dialogue** — contextual lines based on expedition state
17. **Feed integration** — agents post about planning/building/deploying/
    recovering
18. **Minimap integration** — robots as green dots
19. **Achievements** — activate Coming Soon ones, add new ones
20. **Knowledge system** — track points, unlock tiers/recommendations
21. **Petition UI** — small panel/modal for approve/deny/downgrade

---

## 15. What Already Exists

| Component | Location | Reuse |
|---|---|---|
| Agent huddle system | `AgentNPC.huddle()` in `agent.ts` | Planning huddle visuals |
| Creature `takeDamage()` | `world.ts:376` | Robot calls it on attack |
| Beast `takeDamage()` | `world.ts:254` | Robot calls it on attack |
| `WorldLayer` entity pattern | `world.ts` | Robot follows same pattern as Creature/Beast |
| `VFXManager` | `effects.ts` | sparkBurst, deathDissolve, celebrate, shockwave |
| `AudioSystem` | `audio.ts` | death, hit sounds |
| `AchievementTracker` | `achievements.ts` | unlock/incStat ready |
| `PERSONALITIES` | `manager.ts` | Agent dialogue flavor |
| `AgentInfo.tasksDone` | `types.ts` | Drives scrap generation |
| Feed/log system | `store.ts`, `manager.ts` | Agents post about expeditions |
| Minimap entity list | `world.ts:1463` | Add robots to entity array |
| CanvasTexture sprite system | `textures.ts` | Robot sprite generation |
| `AgentNPC` idle state | `agent.ts:309-350` | Branch into expedition cycle |

---

## 16. Future Ideas (Not v1)

- **Two-bot expeditions** — send a Scout + Bruiser together
- **Custom robot loadouts** — spend extra scrap on armor plating, extended
  battery, treasure sensors
- **Office display case** — trophies from expeditions shown in the office
- **Robot naming** — agents name their robots (personality-driven)
- **Inter-office robot races** — multiplayer tie-in
- **Robot salvage** — send a robot to recover a destroyed robot's parts for
  partial scrap refund
- **Expedition logs** — readable filing cabinet entries with full mission
  reports written by the agents
