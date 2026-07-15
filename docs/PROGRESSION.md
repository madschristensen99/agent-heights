# Sprite Heights — Weapon Progression & Labyrinth Adventure Chain

The Labyrinth is currently a place you explore, get hurt, and run away from.
This document describes a progression chain that turns it into a place you
*conquer* — starting with a golf club outside the office and ending with a
demon crown on your trophy case.

The chain is a series of gated upgrades: each weapon unlocks the ability to
survive deeper biomes, where the next upgrade is found. The tone is absurd —
you're an office manager who accidentally becomes a Labyrinth warlord.

---

## 1. Vision

You start as a boss who plays golf on their lunch break. One hole-in-one later,
a leprechaun trades your club for an axe. The axe lets you chop trees, which
drops loot, which leads to a sword, which lets you fight creatures, which drops
shards, which a blacksmith forges into a void blade, which lets you kill a
legendary beast, which drops a core, which opens a hidden armory, which
contains a legendary weapon, which lets you clear the infernal biome and kill
the Sovereign.

You take the crown home and put it on the trophy case. The agents gather
around and say nothing. You came from a cubicle. Now you rule the Labyrinth.

**The tone throughout is self-aware and funny.** The game acknowledges the
absurdity of the progression at every step via toasts and NPC dialogue.

---

## 2. Current State

| Step | Status | What exists | What's missing |
|---|---|---|---|
| Golf club pickup | ✅ Done | Full mechanic in `world.ts` | — |
| Golf hole-in-one | ✅ Done | Full mechanic, flag detection | — |
| Leprechaun tile | ✅ Partial | Tile placed by `worldgen.ts`, sprite in `textures.ts` | No E-interaction, no trade logic |
| Leprechaun trade achievement | ✅ Defined | `leprechaun_trade` in `achievements.ts` | No trigger code |
| Axe tile | ✅ Partial | Tile placed next to leprechaun, sprite exists | No `hasAxe` state, no pickup |
| Axe chop achievements | ✅ Defined | `first_chop`, `tree_loot`, `lumberjack` | No chop mechanic |
| Player combat | ❌ Missing | Creatures have `takeDamage()` | Nothing calls it — player can't attack |
| Weapon upgrades | ❌ Missing | — | Entire system |
| Creature drops | ❌ Missing | — | No drop logic |
| Legendary beast drops | ❌ Missing | Beasts die but drop nothing | No loot on death |
| Trophy display | ✅ Partial | Trophy case + hall of fame exist | No crown display |

---

## 3. The Progression Chain

```
OFFICE (safe zone)
  │
  │  1. Pick up Golf Club                    [exists]
  │     → Play golf, get a Hole-in-One       [exists]
  │     → Toast: "You're a natural! Have you considered... violence?"
  │
  │  2. Find Leprechaun in Forest/Ruins      [tile exists, interaction missing]
  │     → Press E with golf club → trade
  │     → Lose hasGolfClub, gain hasAxe
  │     → Toast: "You traded a golf club for an axe.
  │        Somewhere, a country club is crying."
  │     → Achievement: leprechaun_trade
  │
  │  3. Chop Big Trees with axe              [mechanic missing]
  │     → Press E near BIG_TREE with hasAxe
  │     → Tree falls, spawn wood particles
  │     → Roll for loot:
  │        Common (50%): Wood
  │        Uncommon (30%): Stone
  │        Rare (15%): Rusty Key
  │        Very Rare (5%): Map Fragment
  │     → Achievement: first_chop, tree_loot, lumberjack (20 trees)
  │
  │  4. Player Combat (SPACE to attack)      [entire system missing]
  │     → Axe: 15 dmg, 800ms cooldown, melee arc
  │     → Can now kill creatures (2-3 hits for low-tier)
  │     → Achievement: first_blood
  │     → Toast: "Your first kill. The axe feels heavier now.
  │        Or maybe that's guilt."
  │
  │  5. Use Rusty Key on Locked Chest        [tiles + interaction missing]
  │     → Locked chests spawn in Ruins (worldgen)
  │     → Press E with rusty key → chest opens
  │     → Contains: Iron Sword
  │     → Iron Sword: 25 dmg, 600ms cooldown
  │     → Toast: "Rusted but reliable. Like that one agent
  │        who never asks questions."
  │
  │  6. Creature Drops                       [missing]
  │     → Hostility 2-3: 20% chance Void Shard
  │     → Hostility 4-5: 40% Void Shard + 10% Beast Scale
  │     → Drops as sparkly ground tile, walk over to collect
  │
  │  7. Wandering Blacksmith NPC             [missing]
  │     → Rare spawn in Wasteland chunks
  │     → Press E with 5+ Void Shards → trade for Void Blade
  │     → Void Blade: 40 dmg, 400ms cooldown, void-tinted VFX
  │     → Toast: "The blade hums with unstable energy.
  │        Don't hold it too long."
  │     → Blacksmith dialogue: "You want me to forge void shards
  │        into a weapon? I was hoping you'd say no. But here we are."
  │
  │  8. Kill a Legendary Beast               [combat exists, drops missing]
  │     → With Void Blade, can now damage beasts effectively
  │     → Beast dies → drops Beast Core (guaranteed)
  │     → Achievement: beast_slayer + biome-specific kill achievements
  │
  │  9. Activate the Pedestal                [missing]
  │     → Pedestal tile placed in deep Ruins (15+ chunks)
  │     → Press E with Beast Core → pedestal glows, screen shake
  │     → Hidden door opens (wall tiles become walkable)
  │     → Toast: "The wall groans. Something ancient just woke up."
  │
  │  10. The Armory                          [missing]
  │     → Hidden room behind the pedestal door
  │     → Three weapon pedestals, pick one:
  │        · Flame Greatsword: 60 dmg, 1000ms cd, AoE splash (100px radius)
  │        · Void Daggers: 35 dmg x2, 300ms cd, fastest weapon
  │        · Crystal Bow: 50 dmg, 700ms cd, ranged projectile
  │     → Toast: "The Armory opens. The weapons have been waiting
  │        for someone unhinged enough to use them."
  │     → Achievement: armory_found
  │
  │  11. Clear the Infernal Biome            [biome exists, no endgame]
  │     → With legendary weapon, can survive Infernal
  │     → Defeat the Infernal Sovereign (final boss)
  │     → Drops: Sovereign Crown
  │     → Achievement: infernal_sovereign_kill (exists)
  │
  │  12. Bring the Crown Home                [missing]
  │     → Walk to trophy case in office, press E
  │     → Crown appears on trophy case
  │     → Toast: "You placed the crown on the trophy case.
  │        The agents gather around, speechless.
  │        You started this morning managing AI agents.
  │        Now you rule the Labyrinth. What a day."
  │     → Secret achievement: from_cubicle_to_conqueror
  │
  ▼  END OF CHAIN
```

---

## 4. Player Combat System

The single biggest gameplay addition. Currently the Labyrinth is "run away
from everything." Combat turns it into an adventure.

### Controls

- **SPACE** — swing equipped weapon (melee arc or ranged projectile)
- **No aiming** — the arc hits in the player's facing direction
- Cooldown bar appears above player's head while waiting (reuse golf power
  bar visual style)

### Weapon State

Add to `WorldLayer`:

```typescript
type WeaponType = "axe" | "iron_sword" | "void_blade" |
                  "flame_greatsword" | "void_daggers" | "crystal_bow";

private weapon: WeaponType | null = null;
private weaponCooldown = 0;
private weaponCooldownMax = 0;
private treesChopped = 0;
```

### Weapon Stats

| Weapon | Damage | Cooldown | Range | Special | Source |
|---|---|---|---|---|---|
| Tennis Racket (joke) | 5 | 600ms | 40px | Satisfying *thwack* sound | Tennis court pickup |
| Axe | 15 | 800ms | 50px | Also chops trees | Leprechaun trade |
| Iron Sword | 25 | 600ms | 55px | — | Locked chest in Ruins |
| Void Blade | 40 | 400ms | 60px | Void-tinted VFX on hit | Blacksmith (5 void shards) |
| Flame Greatsword | 60 | 1000ms | 100px | AoE — hits all creatures in radius | The Armory |
| Void Daggers | 35 x2 | 300ms | 45px | Double-hit, fastest weapon | The Armory |
| Crystal Bow | 50 | 700ms | 300px | Ranged projectile (like golf ball) | The Armory |

### Swing Logic

```
on SPACE press:
  · if weapon === null → toast "You have no weapon. You punch. It does nothing."
  · if time < weaponCooldown → ignore
  · set weaponCooldown = time + weaponCooldownMax
  · play swing animation (player sprite frame 3 if exists, else flash)
  · spawn slash VFX arc in facing direction
  · play weapon sound

  if weapon is melee (axe, iron_sword, void_blade, flame_greatsword, void_daggers):
    · scan creatures within range in facing direction (±60° cone)
    · for each hit: creature.takeDamage(weaponDamage)
    · flame_greatsword: also hit all creatures within 100px (AoE)
    · void_daggers: hit twice (apply damage 2x)

  if weapon is crystal_bow:
    · spawn projectile entity (reuse golf ball physics pattern)
    · projectile travels 300px in facing direction
    · on creature contact: creature.takeDamage(50), destroy projectile
    · on wall/tile contact: destroy projectile, spawn spark VFX
```

### Tennis Racket as Joke Weapon

If the player has `hasTennisRacket = true` but no real weapon, SPACE swings
the racket. It does 5 damage. It has a satisfying *thwack* sound. It is
almost completely useless.

- Achievement: **"Unconventional Tactics"** — Kill a creature with the tennis racket.
- Toast on kill: `"You defeated a creature with a tennis racket. It died of embarrassment."`

---

## 5. Leprechaun Trade

### Interaction

In the existing item-scan loop in `world.ts` (where golf club pickup happens),
add leprechaun detection:

```
if near TILE.LEPRECHAUN and ePressed:
  if hasGolfClub and !hasAxe:
    → show toast: "Trade your golf club for the axe? Press E to confirm."
    → on second E press: hasGolfClub = false, hasAxe = true
    → remove TILE.LEPRECHAUN and TILE.AXE from chunk
    → vfx.celebrate()
    → achievements.unlock("leprechaun_trade")
    → toast: "The leprechaun grins. 'That's a fine club. Here, take this
       axe — I've got no trees to chop where I'm going.'"
    → set weapon = "axe"

  else if !hasGolfClub and !hasAxe:
    → toast: "The leprechaun eyes you suspiciously. 'Come back when you've
       got something worth tradin'."

  else if hasAxe:
    → toast: "The leprechaun shrugs. 'You already got the axe. What do
       you want from me?'"
```

### Repeatable Trade (with durability)

If weapon durability is implemented (see §9), the axe can break. The player
needs to find another leprechaun to get a new one. This makes the leprechaun
encounter repeatable and gives golf a reason to be replayed (need a new club
to trade).

---

## 6. Axe Chopping & Tree Loot

### Chop Mechanic

```
if near TILE.BIG_TREE and hasAxe and ePressed:
  → set tile to TILE.GRASS (tree is gone)
  → vfx: wood particle burst (brown/wood-colored sparks)
  → audio: "chop" sound (reuse creature hit sound, lower pitch)
  → screen micro-shake
  → treesChopped++
  → achievements:
      first chop → unlock("first_chop")
      20 chops   → unlock("lumberjack")

  → roll for loot (rng < 0.30):
      50% → Wood (common material)
      30% → Stone (common material)
      15% → Rusty Key (unlocks chests)
       5% → Map Fragment (collectible, future quest item)

  → if loot: spawn sparkle VFX, spawn loot tile at tree position
  → toast based on loot:
      Wood:      "Wood! For... crafting. Eventually."
      Stone:     "A stone. It's a rock. From a tree. Don't think about it."
      Rusty Key: "A rusty key! It looks like it opens something... somewhere."
      Map:       "A map fragment! It shows... not much. But it's a start."
  → if loot: achievements.unlock("tree_loot")
```

### Loot Tiles

New tile types in `shared/types.ts`:

```typescript
LOOT_WOOD: 37,
LOOT_STONE: 38,
LOOT_KEY: 39,
LOOT_MAP_FRAGMENT: 40,
LOOT_VOID_SHARD: 41,
LOOT_BEAST_SCALE: 42,
LOOT_BEAST_CORE: 43,
LOOT_IRON_SWORD: 44,
LOOT_VOID_BLADE: 45,
LOOT_FLAME_GREATSWORD: 46,
LOOT_VOID_DAGGERS: 47,
LOOT_CRYSTAL_BOW: 48,
LOOT_SOVEREIGN_CROWN: 49,
LOCKED_CHEST: 50,
LOOT_CHEST_OPEN: 51,
```

Loot tiles are walkable. Walking over them picks them up (like flowers).
Each gets a simple CanvasTexture in `textures.ts`.

### Inventory

Simple counter on `WorldLayer`:

```typescript
private inventory: Record<string, number> = {
  wood: 0, stone: 0, rustyKeys: 0, mapFragments: 0,
  voidShards: 0, beastScales: 0, beastCores: 0,
};
```

No UI needed initially — toasts confirm pickup. A future inventory panel can
display counts.

---

## 7. Creature Drops

### Drop Logic

When a creature dies via `takeDamage()`, roll for drops based on the biome's
hostility level:

| Hostility | Biome | Drop Chance | Possible Drops |
|---|---|---|---|
| 0 | Meadow | 0% | None (peaceful creatures) |
| 1 | Forest | 10% | Wood (50%), Stone (50%) |
| 2 | Ruins | 20% | Void Shard (80%), Rusty Key (20%) |
| 3 | Wasteland | 30% | Void Shard (70%), Beast Scale (30%) |
| 4 | Void | 40% | Void Shard (60%), Beast Scale (40%) |
| 5 | Infernal | 50% | Void Shard (50%), Beast Scale (50%) |

### Drop Implementation

```
creature.takeDamage() → hp <= 0 → creature dies:
  → existing death VFX
  → roll drop based on biome hostility at creature position
  → if drop: spawn loot tile at creature's last position
  → sparkle VFX on the loot tile
```

### Legendary Beast Drops

Beasts always drop a Beast Core on death (guaranteed, 100% drop rate).
Beasts may also drop Beast Scales (50% chance).

---

## 8. The Wandering Blacksmith

### NPC Design

A hooded figure with a hammer, found rarely in Wasteland chunks. Similar to
the leprechaun — a tile placed by worldgen with an E-interaction.

### Worldgen Placement

```typescript
// in worldgen.ts, after leprechaun placement:
if (biome === "wasteland" && hostility >= 3 && rng() < 0.08) {
  placeBlacksmith(tiles, rng);
}
```

### Interaction

```
if near TILE.BLACKSMITH and ePressed:
  if inventory.voidShards >= 5:
    → inventory.voidShards -= 5
    → weapon = "void_blade"
    → remove blacksmith tile (or keep for future trades)
    → vfx.celebrate()
    → toast: "The blacksmith takes your shards and works through the night.
       The blade hums with unstable energy. Don't hold it too long."
    → dialogue line: "You want me to forge void shards into a weapon?
       I was hoping you'd say no. But here we are."

  else if inventory.voidShards > 0 and < 5:
    → toast: "The blacksmith counts your shards. 'Not enough. Bring me five
       and I'll make something worth the risk.'"

  else:
    → toast: "The blacksmith doesn't look up. 'Come back when you've got
       void shards. The creatures out here carry them.'"
```

### Sprite

New CanvasTexture in `textures.ts` — hooded figure with hammer, dark metal
colors. Reuse the leprechaun drawing approach (small humanoid with accessory).

---

## 9. Weapon Durability (Optional)

If implemented, weapons can break, creating resource tension and making the
leprechaun trade repeatable.

### Durability Stats

| Weapon | Durability | Notes |
|---|---|---|
| Tennis Racket | ∞ | Never breaks (it's a joke weapon) |
| Axe | 50 chops | Breaks after 50 tree chops or 50 combat hits |
| Iron Sword | 100 hits | |
| Void Blade | ∞ | Magical — never breaks |
| Flame Greatsword | 200 hits | |
| Void Daggers | 150 hits each | |
| Crystal Bow | ∞ | Magical — never breaks |

### Break Behavior

```
on weapon use:
  durability--
  if durability <= 0:
    → weapon = null (or fallback to tennis racket if hasTennisRacket)
    → vfx: weapon shatter (spark burst in weapon's color)
    → audio: breaking sound
    → toast: "Your axe splinters. Wood everywhere.
       Time to find another leprechaun."
    → if axe broke: hasAxe = false (need new trade)
```

### Durability Display

A small durability bar under the HP bar, only visible when a weapon with
finite durability is equipped. Changes color: green → yellow → red as it
wears down.

---

## 10. Locked Chests & Iron Sword

### Worldgen

Locked chests spawn in Ruins chunks:

```typescript
// in worldgen.ts:
if (biome === "ruins" && hostility >= 2 && rng() < 0.10) {
  placeLockedChest(tiles, rng);
}
```

### Interaction

```
if near TILE.LOCKED_CHEST and ePressed:
  if inventory.rustyKeys > 0:
    → inventory.rustyKeys--
    → set tile to TILE.LOOT_CHEST_OPEN
    → spawn TILE.LOOT_IRON_SWORD adjacent
    → vfx.celebrate()
    → toast: "The key fits. Inside: a blade, still sharp after all these
       years. Rusted but reliable. Like that one agent who never asks
       questions."
    → on pickup: weapon = "iron_sword"

  else:
    → toast: "The chest is locked. You need a rusty key. Maybe a tree
       has one?"
    → vfx: locked icon or shake
```

---

## 11. The Pedestal & The Armory

### Pedestal

A special tile placed in deep Ruins (15+ chunks from office):

```typescript
// in worldgen.ts:
if (biome === "ruins" && chunkDist >= 15 && rng() < 0.05) {
  placePedestal(tiles, rng);
}
```

### Interaction

```
if near TILE.PEDESTAL and ePressed:
  if inventory.beastCores > 0:
    → inventory.beastCores--
    → vfx: screen shake, golden light burst
    → audio: deep rumble
    → reveal hidden room (nearby WALL tiles become PATH)
    → toast: "The wall groans. Something ancient just woke up."
    → spawn 3 weapon pedestals inside the room:
      TILE.LOOT_FLAME_GREATSWORD
      TILE.LOOT_VOID_DAGGERS
      TILE.LOOT_CRYSTAL_BOW
    → achievement: armory_found

  else:
    → toast: "The pedestal has a slot. It wants something powerful.
       A core, perhaps?"
```

### The Armory Room

- 7x5 room carved into the chunk, walls become PATH
- Three weapon pedestals in a row
- Player picks one (press E on the pedestal)
- The other two crumble (tiles become ROCK, toast: "The other pedestals
  crumble. The choice is made.")
- Achievement: **"The Armory"** — Enter the hidden Armory.

---

## 12. The Sovereign Crown

### Defeating the Infernal Sovereign

The Infernal Sovereign is the hardest beast in the game (1200 HP, 900ms
attack cooldown, 700px aggro range). With a legendary weapon, it becomes
killable but still challenging.

### Crown Drop

On death, the Sovereign drops `TILE.LOOT_SOVEREIGN_CROWN`:

```
beast dies → if beast.name === "Infernal Sovereign":
  → spawn TILE.LOOT_SOVEREIGN_CROWN at beast position
  → massive VFX: shockwave, golden particles, screen shake
  → audio: victory fanfare (or reuse celebrate sound, longer)
  → toast: "The Sovereign falls. Its crown clatters to the ground.
     It's heavier than it looks."
```

### Bringing It Home

```
if near trophy case in office and ePressed and inventory.sovereignCrowns > 0:
  → inventory.sovereignCrowns--
  → draw crown on trophy case (new graphics in drawTrophyCase)
  → vfx.celebrate()
  → all agents in office turn to face trophy case (visual)
  → toast: "You placed the crown on the trophy case.
     The agents gather around, speechless.
     You started this morning managing AI agents.
     Now you rule the Labyrinth. What a day."
  → achievements.unlock("from_cubicle_to_conqueror") [Secret]
```

---

## 13. Weapon Rack (Office Display)

A wall-mounted display in the office showing the player's current best weapon.

### Visual

- Graphics object on the office wall, like the trophy case
- Shows the sprite of the currently equipped weapon (or empty rack if none)
- Updates when weapon changes
- Mounting plaque + weapon silhouette

### Achievement

- **"Arsenal"** — Display 3 different weapons on the rack over time (tracked
  via a set of weapons ever equipped).

---

## 14. New Tile Types

Add to `TILE` enum in `shared/types.ts`:

```typescript
// Loot tiles (walkable, pickup on walk-over)
LOOT_WOOD: 37,
LOOT_STONE: 38,
LOOT_KEY: 39,
LOOT_MAP_FRAGMENT: 40,
LOOT_VOID_SHARD: 41,
LOOT_BEAST_SCALE: 42,
LOOT_BEAST_CORE: 43,

// Weapon pickups (walkable, press E to equip)
LOOT_IRON_SWORD: 44,
LOOT_VOID_BLADE: 45,
LOOT_FLAME_GREATSWORD: 46,
LOOT_VOID_DAGGERS: 47,
LOOT_CRYSTAL_BOW: 48,
LOOT_SOVEREIGN_CROWN: 49,

// Structures
LOCKED_CHEST: 50,
LOOT_CHEST_OPEN: 51,
PEDESTAL: 52,
BLACKSMITH: 53,
```

Add all new tiles to `PROTECTED_TILES` in `worldgen.ts` and to the
`isWalkable()` function.

---

## 15. New Achievements

Add to `achievements.ts`:

### Adventurer Tier (existing gaps to activate)

| ID | Name | Description |
|---|---|---|
| `leprechaun_trade` | Lucky Charm | Trade a club for an axe with a leprechaun. *(exists, needs trigger)* |
| `first_chop` | Timber! | Chop down a big tree. *(exists, needs trigger)* |
| `tree_loot` | What's Inside? | Find loot in a chopped tree. *(exists, needs trigger)* |
| `lumberjack` | Clear Cut | Chop 20 big trees. *(exists, needs trigger)* |

### Warrior Tier (new)

| ID | Name | Description |
|---|---|---|
| `first_blood` | First Blood | Defeat your first creature. *(exists, needs trigger)* |
| `racket_kill` | Unconventional Tactics | Kill a creature with the tennis racket. |
| `iron_sword_pickup` | Armed and Dangerous | Pick up the iron sword. |
| `void_blade_pickup` | Forged in Darkness | Obtain the void blade from the blacksmith. |
| `armory_found` | The Armory | Discover the hidden Armory behind the pedestal. |
| `legendary_weapon` | Chosen One | Equip a legendary weapon from the Armory. |

### Secret Tier (new)

| ID | Name | Description |
|---|---|---|
| `from_cubicle_to_conqueror` | From Cubicle to Conqueror | Place the Sovereign Crown on the trophy case. |
| `arsenal` | Arsenal | Equip 3 different weapons over your adventure. |
| `map_collector` | Cartographer | Collect 5 map fragments from chopped trees. |

---

## 16. New Textures

All via CanvasTexture in `textures.ts`, following the existing pattern:

| Texture Key | Description | Size |
|---|---|---|
| `loot-wood` | Small wood pile | 64×64 |
| `loot-stone` | Stone chunk with sparkle | 64×64 |
| `loot-key` | Rusty key on ground | 64×64 |
| `loot-map` | Torn paper fragment | 64×64 |
| `loot-void-shard` | Purple glowing crystal shard | 64×64 |
| `loot-beast-scale` | Dark scale with shimmer | 64×64 |
| `loot-beast-core` | Pulsing organic core, glowing | 64×64 |
| `iron-sword` | Sword lying diagonally (like axe) | 64×64 |
| `void-blade` | Dark blade with purple glow | 64×64 |
| `flame-greatsword` | Large sword with orange aura | 64×64 |
| `void-daggers` | Two small blades crossed | 64×64 |
| `crystal-bow` | Bow with crystal limbs | 64×64 |
| `sovereign-crown` | Jagged crown, dark gold | 64×64 |
| `locked-chest` | Wooden chest with iron lock | 64×64 |
| `chest-open` | Open chest, interior visible | 64×64 |
| `pedestal` | Stone pedestal with slot | 64×64 |
| `blacksmith` | Hooded figure with hammer | 64×64 |
| `slash-vfx` | Melee swing arc effect | 64×64 |

---

## 17. New Worldgen Functions

Add to `worldgen.ts`:

```typescript
/** Place a locked chest in ruins. */
function placeLockedChest(tiles: number[], rng: () => number): void

/** Place a pedestal in deep ruins. */
function placePedestal(tiles: number[], rng: () => number): void

/** Place a wandering blacksmith in wasteland. */
function placeBlacksmith(tiles: number[], rng: () => number): void
```

All follow the same pattern as `placeLeprechaun()` — find a walkable tile,
place the special tile, protect it from overwrite.

---

## 18. Funny Toasts Reference

The humor is what makes this feel like an easter egg chain rather than a
grind. Every step has at least one funny toast.

| Trigger | Toast |
|---|---|
| Golf hole-in-one | "You're a natural! Have you considered... violence?" |
| Leprechaun trade | "You traded a golf club for an axe. Somewhere, a country club is crying." |
| No club for leprechaun | "The leprechaun eyes you suspiciously. 'Come back when you've got something worth tradin'." |
| First tree chop | "Timber! You feel like a lumberjack. A very small, very lost lumberjack." |
| Rusty key from tree | "A rusty key! It looks like it opens something... somewhere." |
| Map fragment from tree | "A map fragment! It shows... not much. But it's a start." |
| No weapon, press SPACE | "You punch. It does nothing. You feel silly." |
| First creature kill | "Your first kill. The axe feels heavier now. Or maybe that's guilt." |
| Tennis racket kill | "You defeated a creature with a tennis racket. It died of embarrassment." |
| Iron sword pickup | "Rusted but reliable. Like that one agent who never asks questions." |
| Locked chest, no key | "The chest is locked. You need a rusty key. Maybe a tree has one?" |
| Blacksmith, not enough shards | "The blacksmith counts your shards. 'Not enough. Bring me five.'" |
| Void blade pickup | "The blade hums with unstable energy. Don't hold it too long." |
| Pedestal, no core | "The pedestal has a slot. It wants something powerful. A core, perhaps?" |
| Armory opens | "The wall groans. Something ancient just woke up." |
| Legendary weapon pickup | "The Armory opens. The weapons have been waiting for someone unhinged enough to use them." |
| Other pedestals crumble | "The other pedestals crumble. The choice is made." |
| Sovereign dies | "The Sovereign falls. Its crown clatters to the ground. It's heavier than it looks." |
| Crown on trophy case | "You placed the crown on the trophy case. The agents gather around, speechless. You started this morning managing AI agents. Now you rule the Labyrinth. What a day." |
| Axe breaks | "Your axe splinters. Wood everywhere. Time to find another leprechaun." |

---

## 19. What Already Exists

| Component | Location | Reuse |
|---|---|---|
| Golf club pickup + state | `world.ts:1701-1718` | Pattern for weapon pickups |
| Golf ball projectile physics | `world.ts:1720+` | Crystal bow projectile |
| Tennis racket pickup + state | `world.ts:1927-1941` | Pattern for weapon state |
| Leprechaun tile placement | `worldgen.ts:297-328` | Already places tile + axe |
| Leprechaun sprite | `textures.ts:2904` | Already drawn |
| Axe sprite | `textures.ts:2543` | Already drawn |
| Big tree sprite | `textures.ts` | Already drawn |
| Creature `takeDamage()` | `world.ts:377` | Combat calls this |
| Beast `takeDamage()` | `world.ts:255` | Combat calls this |
| Creature death VFX | `world.ts:388-394` | Add drop spawn after death |
| Achievement tracker | `achievements.ts` | Unlock + incStat ready |
| Toast system | `store.ts` | All toasts go through this |
| VFX manager | `effects.ts` | sparkBurst, celebrate, shockwave |
| Trophy case rendering | `scene.ts` | Crown display |
| CanvasTexture system | `textures.ts` | All new sprites |
| Tile enum + worldgen pattern | `shared/types.ts`, `worldgen.ts` | New tiles follow pattern |
| Day/night lighting | `lighting.ts` | Weapon glow effects |

---

## 20. Implementation Plan

### Phase 1 — Close the Gaps (fills existing achievements)

1. **Leprechaun trade interaction** — E on leprechaun tile, swap club for axe
2. **`hasAxe` state + axe chop mechanic** — E on big tree, tree falls, loot roll
3. **Loot tiles + pickup** — new tile types, walk-over pickup, inventory counts
4. **Achievement triggers** — activate `leprechaun_trade`, `first_chop`,
   `tree_loot`, `lumberjack`

### Phase 2 — Player Combat

5. **Weapon state on `WorldLayer`** — `weapon`, `weaponCooldown`, `weaponDamage`
6. **SPACE to attack** — melee arc, creature scan, `takeDamage()` calls
7. **Slash VFX** — arc effect in facing direction
8. **Tennis racket as joke weapon** — 5 dmg, *thwack* sound
9. **Achievement triggers** — activate `first_blood`, add `racket_kill`

### Phase 3 — Mid-Game Progression

10. **Locked chests in worldgen** — `placeLockedChest()` in ruins
11. **Rusty key → chest → iron sword** — E interaction chain
12. **Creature drops** — loot tiles spawn on creature death
13. **Wandering blacksmith** — `placeBlacksmith()` in wasteland
14. **Void shard trade → void blade** — E interaction, 5 shards

### Phase 4 — Endgame

15. **Beast core drop** — guaranteed on legendary beast death
16. **Pedestal in deep ruins** — `placePedestal()`, E with core opens armory
17. **Armory room** — hidden room, 3 weapon pedestals, pick one
18. **Legendary weapons** — 3 weapons with unique stats + sprites
19. **Crystal bow projectile** — ranged weapon entity (reuse golf ball pattern)

### Phase 5 — The Ending

20. **Sovereign crown drop** — on Infernal Sovereign death
21. **Crown on trophy case** — E interaction in office, special toast
22. **Secret achievement** — `from_cubicle_to_conqueror`
23. **Weapon rack display** — office wall graphic showing current weapon

### Phase 6 — Polish (optional)

24. **Weapon durability** — break system, repeatable leprechaun trades
25. **Durability bar** — visual under HP bar
26. **Map fragments quest** — collectible, future quest hook
27. **Weapon sound effects** — unique swing sound per weapon
28. **Agent reactions** — feed posts when boss gets a new weapon

---

## 21. Future Ideas (Not v1)

- **Weapon enchantments** — found in structures, applied at the blacksmith.
  Fire enchant (DoT), void enchant (life steal), crystal enchant (slow on hit).
- **Dual wielding** — equip axe + tennis racket, or void daggers + crystal bow.
- **Shield** — off-hand item, reduces incoming damage, has its own durability.
- **Boss rush mode** — after placing the crown, a new NPC offers to respawn
  all beasts for a challenge run with a timer.
- **Speedrun timer** — tracks time from first golf club pickup to crown
  placement. Leaderboard in the hall of fame.
- **Weapon skins** — cosmetic variants unlocked by achievements. The axe
  gets a golden variant after 100 chops. The void blade gets a flame tint
  after killing the Ash Wyrm.
- **Agent weapons** — give a weapon to an agent, and their robot uses it
  on expeditions. Ties into the Expeditions system.
- **The Labyrinth remembers** — creatures flee from you based on kill count.
  After 100 kills, low-tier creatures run away instead of attacking.
  Toast: "The creatures have learned to fear the boss."
- **Dark mode ending** — if you kill *all* creatures in a biome (track
  per-biome kill count), the biome becomes permanently empty. A grave
  marker appears. Toast: "You cleared the forest. It's quiet now.
  Too quiet."
