import Phaser from "phaser";
import { CHUNK_SIZE, TILE, WORLD_TILE_FRAMES, WORLD_VARIANTS } from "../../../shared/types";
import type { FiredAgent, WorldTheme } from "../../../shared/types";
import type { Store } from "../store";
import type { Net } from "../net";
import { isTouchDevice } from "../touch";
import { TILE_PX, createHintTag, type HintTag, type Dir } from "./agent";
import { generateCharTexture } from "./chargen";
import { Grid } from "./path";
import { generateChunk, isWalkable, tileDamage, tileSpeed, type Chunk, hostilityAt, BIG_LAKE_WT_X, BIG_LAKE_WT_Y, BIG_LAKE_RADIUS } from "./worldgen";
import { creatureKey, beastKey, beastDesignName, friendlyCreatureKey, friendlyCreatureCount } from "./textures";
import { AI_TILE_TEXTURES, AI_OBJECT_TEXTURES, AI_ITEM_TEXTURES, resolveItemTex } from "./ai-tiles";
import { VFXManager } from "./effects";
import { LightingSystem, type LightSource } from "./lighting";
import { AudioSystem } from "./audio";
import { HUDSystem } from "./hud";
import { achievements } from "./achievements";
import WorldgenWorker from "./worldgen.worker?worker";
import { saveChunkCanvas, removeChunkCanvas, preloadChunkCanvases } from "./chunk-cache";
import { Inventory } from "./inventory";
import { FactionManager } from "./factions";

/**
 * World offset: the world tile grid starts at the bottom-left corner of the
 * office map. The office occupies pixels (0,0) to (mapW, mapH). World tiles
 * begin at (0, mapH) so the player walks south through the door into the world.
 */
export interface WorldOffset {
  x: number;
  y: number;
}

/** Detect low-end devices (mobile, low RAM, few cores) to reduce rendering cost. */
function isLowEndDevice(): boolean {
  const mem = (navigator as any).deviceMemory;
  const cores = navigator.hardwareConcurrency;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (isMobile) return true;
  if (mem !== undefined && mem <= 4) return true;
  if (cores !== undefined && cores <= 4) return true;
  return false;
}

/** Supersample factor: 2x on desktop (128px tile resolution, sharp at zoom), 1x on mobile. */
export const SS_FACTOR = isLowEndDevice() ? 1 : 2;

/** Chunk load radius: 2 on desktop (5x5=25 chunks), 1 on mobile (3x3=9 chunks). */
export const LOAD_RADIUS = isLowEndDevice() ? 1 : 2;
const UNLOAD_RADIUS = LOAD_RADIUS + 1;

// --- 3D creature spritesheet helpers ---
// 3D sheets are 8 cols (S,SE,E,NE,N,NW,W,SW) × 4 rows (idle,walk1,walk2,attack) = 32 frames
// Frame index = anim * 8 + dir
const DIRS_3D = 8;

/** Check if a sprite's texture is a 3D-rendered 8-directional spritesheet (≥1024px wide). */
function has8Directions(sprite: Phaser.GameObjects.Sprite): boolean {
  const src = sprite.texture.getSourceImage() as HTMLImageElement;
  return src.width >= DIRS_3D * 128;
}

/** Map a movement vector to one of 8 direction indices (0=S, 1=SE, 2=E, 3=NE, 4=N, 5=NW, 6=W, 7=SW). */
function dirFromVelocity(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  return ((Math.round((Math.PI / 2 - Math.atan2(dy, dx)) / (Math.PI / 4)) % 8) + 8) % 8;
}


/**
 * Global cache of generated chunk data, keyed by `${worldSeed}:${cx},${cy}`.
 * Survives scene restarts (room changes, theme switches) so chunks are only
 * generated once per world.  Stores raw generated tiles (before overrides);
 * overrides are re-applied on each loadChunk call.
 */
const globalChunkCache = new Map<string, Chunk>();
const MAX_CHUNKS_PER_FRAME = 1; // load 1 chunk per frame — matching 1-chunk render limit

/** State for a chunk being painted across multiple frames. */
interface RenderJob {
  chunk: Chunk;
  texKey: string;
  canvasTex: Phaser.Textures.CanvasTexture;
  ctx: CanvasRenderingContext2D;
  ssTilePx: number;
  SS: number;
  currentRow: number;       // next row to paint (0..CHUNK_SIZE-1)
  // Pre-computed lookup tables for this chunk
  overlayTextures: Record<number, string>;
  edgeTileColors: Record<number, string>;
  worldTilesTex: Phaser.Textures.Texture;
  ox: number;
  oy: number;
  chunkLightList: LightSource[];
  container: Phaser.GameObjects.Container;
  useAiTextures: boolean;
}
const MAX_LIGHTS_PER_CHUNK = 8;
const MAX_HP = 100;
const CREATURE_CAP = 30;
const FRIENDLY_CAP = 12;
const SLUG_CAP = 15;
const STONE_INTERVAL = 2500;
const BEAST_SPAWN_INTERVAL = 8000; // check for legendary beast spawns

// --- Weapon system ---
type WeaponType = "tennis_racket" | "golf_club" | "axe" | "iron_sword" | "void_blade" | "flame_greatsword" | "void_daggers" | "crystal_bow";

interface WeaponDef {
  name: string;
  damage: number;
  cooldown: number;   // ms
  range: number;      // px
  melee: boolean;
  hitCone: number;    // degrees, ± from facing
  hitsTwice?: boolean;
  aoeRadius?: number; // px — flame greatsword splash
  color: number;      // slash VFX tint
}

const WEAPONS: Record<WeaponType, WeaponDef> = {
  tennis_racket:      { name: "Tennis Racket", damage: 5,  cooldown: 600,  range: 40,  melee: true,  hitCone: 60, color: 0xeeff44 },
  golf_club:          { name: "Golf Club", damage: 10, cooldown: 700,  range: 55,  melee: true,  hitCone: 75, color: 0xdddd44 },
  axe:                { name: "Axe", damage: 15, cooldown: 800,  range: 50,  melee: true,  hitCone: 60, color: 0xcc8844 },
  iron_sword:         { name: "Iron Sword", damage: 25, cooldown: 600,  range: 55,  melee: true,  hitCone: 60, color: 0xcccccc },
  void_blade:         { name: "Void Blade", damage: 40, cooldown: 400,  range: 60,  melee: true,  hitCone: 60, color: 0xaa44ff },
  flame_greatsword:   { name: "Flame Greatsword", damage: 60, cooldown: 1000, range: 100, melee: true,  hitCone: 60, aoeRadius: 100, color: 0xff6600 },
  void_daggers:       { name: "Void Daggers", damage: 35, cooldown: 300,  range: 45,  melee: true,  hitCone: 60, hitsTwice: true, color: 0xdd44ff },
  crystal_bow:        { name: "Crystal Bow", damage: 50, cooldown: 700,  range: 300, melee: false, hitCone: 0,  color: 0x44ffdd },
};

/** Legendary beast definitions — rare, powerful, unique. */
interface BeastDef {
  name: string;
  rarity: number; // 0–1, chance to spawn when rolling
  minHostility: number;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  color: number;
  eyeColor: number;
  aggroRange: number;
  attackCd: number;
}

const BEASTS: BeastDef[] = [
  {
    name: "Groveheart",
    rarity: 0.3,
    minHostility: 1,
    hp: 200,
    speed: 90,
    damage: 18,
    radius: 28,
    color: 0x2a6a2a,
    eyeColor: 0x88ff88,
    aggroRange: 400,
    attackCd: 1200,
  },
  {
    name: "Stone Colossus",
    rarity: 0.2,
    minHostility: 2,
    hp: 400,
    speed: 50,
    damage: 25,
    radius: 36,
    color: 0x6a6a72,
    eyeColor: 0xffaa00,
    aggroRange: 350,
    attackCd: 1500,
  },
  {
    name: "Ash Wyrm",
    rarity: 0.12,
    minHostility: 3,
    hp: 500,
    speed: 120,
    damage: 30,
    radius: 30,
    color: 0x8a4a2a,
    eyeColor: 0xff4400,
    aggroRange: 500,
    attackCd: 800,
  },
  {
    name: "Void Leviathan",
    rarity: 0.06,
    minHostility: 4,
    hp: 800,
    speed: 100,
    damage: 40,
    radius: 42,
    color: 0x1a0a2a,
    eyeColor: 0xaa00ff,
    aggroRange: 600,
    attackCd: 1000,
  },
  {
    name: "Infernal Sovereign",
    rarity: 0.03,
    minHostility: 5,
    hp: 1200,
    speed: 110,
    damage: 55,
    radius: 48,
    color: 0x2a0a0a,
    eyeColor: 0xffff00,
    aggroRange: 700,
    attackCd: 900,
  },
];

const ALLEY_BEASTS_DEFS: BeastDef[] = [
  { name: "Rat King", rarity: 0.3, minHostility: 1, hp: 200, speed: 90, damage: 18, radius: 28, color: 0x4a3a2a, eyeColor: 0xff0000, aggroRange: 400, attackCd: 1200 },
  { name: "Urban Legend", rarity: 0.06, minHostility: 4, hp: 800, speed: 100, damage: 40, radius: 42, color: 0x1a1a2a, eyeColor: 0xffffff, aggroRange: 600, attackCd: 1000 },
];

const HAWAII_BEASTS_DEFS: BeastDef[] = [
  { name: "Pele", rarity: 0.2, minHostility: 2, hp: 400, speed: 50, damage: 25, radius: 36, color: 0x8a1a0a, eyeColor: 0xffffaa, aggroRange: 350, attackCd: 1500 },
  { name: "Mo'o-nui", rarity: 0.12, minHostility: 3, hp: 500, speed: 120, damage: 30, radius: 30, color: 0x1a4a2a, eyeColor: 0xffcc00, aggroRange: 500, attackCd: 800 },
];

const SOUTH_BEASTS_DEFS: BeastDef[] = [
  { name: "Spectral General", rarity: 0.2, minHostility: 2, hp: 400, speed: 50, damage: 25, radius: 34, color: 0x4a4a6a, eyeColor: 0x66ffff, aggroRange: 350, attackCd: 1500 },
  { name: "Infernal Owner", rarity: 0.12, minHostility: 3, hp: 500, speed: 120, damage: 30, radius: 32, color: 0x4a2a1a, eyeColor: 0xff3300, aggroRange: 500, attackCd: 800 },
];

const BEASTS_BY_THEME: Record<string, BeastDef[]> = {
  "erics-alley": ALLEY_BEASTS_DEFS,
  "hawaii": HAWAII_BEASTS_DEFS,
  "old-south": SOUTH_BEASTS_DEFS,
};

/** War bosses — faction-themed beasts that replace regular beasts in conflict zones (hostility 3+). */
const WAR_BOSSES_BY_THEME: Record<string, BeastDef[]> = {
  "erics-alley": [
    { name: "Dragon Warlord", rarity: 0.5, minHostility: 3, hp: 600, speed: 100, damage: 35, radius: 34, color: 0x884400, eyeColor: 0xff6600, aggroRange: 500, attackCd: 900 },
    { name: "Concrete Champion", rarity: 0.5, minHostility: 3, hp: 700, speed: 80, damage: 40, radius: 38, color: 0x707080, eyeColor: 0x00ffaa, aggroRange: 450, attackCd: 1100 },
  ],
  "hawaii": [
    { name: "Shark Chief", rarity: 0.5, minHostility: 3, hp: 600, speed: 110, damage: 35, radius: 32, color: 0x2a4a6a, eyeColor: 0x00aaff, aggroRange: 500, attackCd: 900 },
    { name: "Turtle Champion", rarity: 0.5, minHostility: 3, hp: 800, speed: 60, damage: 40, radius: 40, color: 0x2a6a4a, eyeColor: 0x88ff88, aggroRange: 450, attackCd: 1200 },
  ],
  "old-south": [
    { name: "Union General", rarity: 0.5, minHostility: 3, hp: 650, speed: 90, damage: 35, radius: 34, color: 0x2a4a8a, eyeColor: 0x66aaff, aggroRange: 500, attackCd: 1000 },
    { name: "Confederate General", rarity: 0.5, minHostility: 3, hp: 650, speed: 90, damage: 35, radius: 34, color: 0x8a6a3a, eyeColor: 0xffaa44, aggroRange: 500, attackCd: 1000 },
  ],
};

/** A legendary beast — rare, powerful, with a boss bar. Sprite-based. */
class LegendaryBeast {
  container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;
  private aura: Phaser.GameObjects.Image;
  private hpBar: Phaser.GameObjects.Graphics;
  private hp: number;
  private maxHp: number;
  private speed: number;
  private damage: number;
  private attackCd = 0;
  private attackCdMax: number;
  private aggroRange: number;
  private alive = true;
  private world: WorldLayer;
  name: string;
  private animKey: string;
  private moveTimer = 0;
  private lastDir = 0;
  private scale: number;

  constructor(world: WorldLayer, def: BeastDef, x: number, y: number) {
    this.world = world;
    this.name = def.name;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.speed = def.speed;
    this.damage = def.damage;
    this.aggroRange = def.aggroRange;
    this.attackCdMax = def.attackCd;
    const scene = world.scene;

    const designName = beastDesignName(def.name);
    this.animKey = beastKey(designName, world.worldTheme?.id);
    this.scale = (1.5 + (def.radius - 28) / 20) * 0.75;

    // shadow
    this.shadow = scene.add.ellipse(0, 0, def.radius * 3, def.radius * 1.2, 0x000000, 0.4);

    // aura — large colored glow
    this.aura = scene.add
      .image(0, 0, "soft-glow")
      .setDisplaySize(def.radius * 6, def.radius * 6)
      .setTint(def.eyeColor)
      .setAlpha(0.2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(24);

    // sprite
    this.sprite = scene.add
      .sprite(0, 0, this.animKey, 0)
      .setOrigin(0.5, 0.75)
      .setScale(this.scale);

    this.hpBar = scene.add.graphics().setDepth(30);

    this.container = scene.add.container(x, y, [this.aura, this.shadow, this.sprite]).setDepth(25 + y);
  }

  get alive_(): boolean { return this.alive; }

  update(dt: number, playerX: number, playerY: number): { hit: boolean; damage: number } | null {
    if (!this.alive) return null;
    const dx = playerX - this.container.x;
    const dy = playerY - this.container.y;
    const dist = Math.hypot(dx, dy);

    let moving = false;
    if (dist < this.aggroRange && dist > 40) {
      const step = this.speed * (dt / 1000);
      const nx = this.container.x + (dx / dist) * step;
      const ny = this.container.y + (dy / dist) * step;
      const { tx, ty } = this.world.pixelToTile(nx, ny);
      if (this.world.isCreatureWalkable(tx, ty)) {
        this.container.setPosition(nx, ny);
        this.container.setDepth(25 + ny);
        moving = true;
        this.lastDir = dirFromVelocity(dx, dy);
      }
    }

    // animate
    const is3d = has8Directions(this.sprite);
    if (is3d) {
      if (moving) {
        this.moveTimer += dt;
        const anim = Math.floor(this.moveTimer / 250) % 2 + 1;
        this.sprite.setFrame(anim * DIRS_3D + this.lastDir);
      } else {
        this.sprite.setFrame(this.lastDir);
      }
    } else {
      this.sprite.setFlipX(this.lastDir >= 4 && this.lastDir <= 6);
      if (moving) {
        this.moveTimer += dt;
        const frame = Math.floor(this.moveTimer / 250) % 2 + 1;
        this.sprite.setFrame(frame);
      } else {
        this.sprite.setFrame(0);
      }
    }

    // pulse aura
    const pulse = 0.15 + Math.sin(this.moveTimer * 0.005) * 0.05;
    this.aura.setAlpha(pulse);

    this.attackCd -= dt;
    if (dist < 50 && this.attackCd <= 0) {
      this.attackCd = this.attackCdMax;
      // attack frame
      this.sprite.setFrame(is3d ? 3 * DIRS_3D + this.lastDir : 3);
      this.world.vfx?.sparkBurst(this.container.x, this.container.y, 0xff4444, 12, 100);
      this.world.vfx?.shake("medium");
      this.world.audio?.beastRoar();
      return { hit: true, damage: this.damage };
    }

    // draw hp bar above beast
    this.drawHpBar();
    return null;
  }

  private drawHpBar(): void {
    const g = this.hpBar;
    g.clear();
    const w = 80;
    const h = 8;
    const x = this.container.x - w / 2;
    const y = this.container.y - this.sprite.displayHeight * 0.7 - 20;
    const pct = Math.max(0, this.hp / this.maxHp);

    // frame
    g.fillStyle(0x000000, 0.8);
    g.fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 4);
    g.fillStyle(0x330000, 1);
    g.fillRoundedRect(x, y, w, h, 3);

    // fill — gradient red
    g.fillStyle(0xff3333, 1);
    g.fillRoundedRect(x, y, w * pct, h, 3);
    g.fillStyle(0xff6666, 0.4);
    g.fillRoundedRect(x, y, w * pct, 3, 3);

    // name text
    g.fillStyle(0xffffff, 0.9);
    // simple text positioning via the fillStyle — actual text handled by the banner
  }

  takeDamage(amount: number): void {
    this.hp -= amount;
    this.world.vfx?.hitFlash(this.sprite);
    this.world.vfx?.sparkBurst(this.container.x, this.container.y, 0xff4444, 10, 90);
    this.world.vfx?.damageNumber(this.container.x, this.container.y - 30, amount);
    if (this.hp <= 0) {
      this.alive = false;
      this.hpBar.clear();
      this.world.vfx?.deathDissolve(this.container.x, this.container.y, 0xffdd44, 2);
      this.world.vfx?.shockwave(this.container.x, this.container.y, 0xffdd44, 5);
      this.world.vfx?.shake("large");
      this.world.vfx?.hitStop(120);
      this.world.audio?.death();
      this.container.destroy();
      // achievement tracking
      achievements.unlock("beast_slayer");
      const beastId = this.name.toLowerCase().replace(/\s+/g, "_");
      achievements.unlock(`${beastId}_kill`);
    }
  }

  destroy(): void {
    this.alive = false;
    this.hpBar.clear();
    this.container.destroy();
  }
}

// --- Nemesis system ---
type NemesisRank = "creature" | "captain" | "warchief";

interface NemesisEntry {
  id: string;
  name: string;
  title: string;
  rank: NemesisRank;
  hostility: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  traitIds: string[];
  weaknessIds: string[];
  grudge: string | null;
  encounters: number;
  playerKills: number;
  survivedAgainstPlayer: number;
  promotedAt: number;
  lastSeenChunk: string;
  captured: boolean;
}

const NEMESIS_NAME_PARTS_1 = ["Grok", "Slib", "Kresh", "Vorn", "Zix", "Brak", "Drel", "Quor", "Mox", "Ygar", "Thex", "Nyl"];
const NEMESIS_NAME_PARTS_2 = ["the Unflammable", "the Disappointed", "Skullsplitter", "the Relentless", "Ironhide", "the Cowardly", "Bloodfang", "the Patient", "Void-touched", "the Reborn", "Glassjaw", "the Unkillable"];

const NEMESIS_TITLES: Record<NemesisRank, string> = {
  creature: "",
  captain: "Captain",
  warchief: "Warchief",
};

const NEMESIS_TRAITS = [
  { id: "armored", name: "Armored", desc: "Takes 50% reduced damage", damageMult: 0.5 },
  { id: "berserker", name: "Berserker", desc: "Deals 2x damage", damageMult: 2.0 },
  { id: "swift", name: "Swift", desc: "Moves 50% faster", speedMult: 1.5 },
  { id: "regen", name: "Regenerating", desc: "Heals over time", regen: true },
  { id: "void_touched", name: "Void-touched", desc: "Immune to void damage", voidImmune: true },
  { id: "fire_blood", name: "Fire Blood", desc: "Immune to fire damage", fireImmune: true },
];

const NEMESIS_WEAKNESSES = [
  { id: "fire_vuln", name: "Fire Vulnerable", desc: "Takes 2x fire damage" },
  { id: "void_vuln", name: "Void Vulnerable", desc: "Takes 2x void damage" },
  { id: "slow", name: "Sluggish", desc: "Moves 30% slower", speedMult: 0.7 },
  { id: "fragile", name: "Fragile", desc: "Takes 1.5x all damage", damageMult: 1.5 },
];

function generateNemesisName(): string {
  const a = NEMESIS_NAME_PARTS_1[Math.floor(Math.random() * NEMESIS_NAME_PARTS_1.length)];
  const b = NEMESIS_NAME_PARTS_2[Math.floor(Math.random() * NEMESIS_NAME_PARTS_2.length)];
  return `${a} ${b}`;
}

function rollTraits(hostility: number): string[] {
  const count = Math.min(3, 1 + Math.floor(hostility / 2));
  const pool = [...NEMESIS_TRAITS];
  const picked: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0].id);
  }
  return picked;
}

function rollWeaknesses(hostility: number): string[] {
  const count = Math.min(2, 1 + Math.floor(hostility / 3));
  const pool = [...NEMESIS_WEAKNESSES];
  const picked: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0].id);
  }
  return picked;
}

class NemesisRegistry {
  private entries = new Map<string, NemesisEntry>();
  private nextId = 1;

  create(hostility: number, hp: number, damage: number, speed: number, chunkKey: string): NemesisEntry {
    const id = `nemesis_${this.nextId++}`;
    const rank: NemesisRank = hostility >= 4 ? "warchief" : hostility >= 2 ? "captain" : "creature";
    const entry: NemesisEntry = {
      id,
      name: generateNemesisName(),
      title: NEMESIS_TITLES[rank],
      rank,
      hostility,
      hp,
      maxHp: hp,
      damage,
      speed,
      traitIds: rollTraits(hostility),
      weaknessIds: rollWeaknesses(hostility),
      grudge: null,
      encounters: 0,
      playerKills: 0,
      survivedAgainstPlayer: 0,
      promotedAt: Date.now(),
      lastSeenChunk: chunkKey,
      captured: false,
    };
    this.entries.set(id, entry);
    return entry;
  }

  get(id: string): NemesisEntry | undefined {
    return this.entries.get(id);
  }

  promote(id: string): NemesisEntry | undefined {
    const e = this.entries.get(id);
    if (!e) return undefined;
    if (e.rank === "creature") {
      e.rank = "captain";
      e.title = NEMESIS_TITLES["captain"];
    } else if (e.rank === "captain") {
      e.rank = "warchief";
      e.title = NEMESIS_TITLES["warchief"];
    }
    e.promotedAt = Date.now();
    return e;
  }

  recordPlayerKill(id: string): void {
    const e = this.entries.get(id);
    if (e) e.playerKills++;
  }

  recordSurvival(id: string): void {
    const e = this.entries.get(id);
    if (e) {
      e.survivedAgainstPlayer++;
      if (e.survivedAgainstPlayer >= 2 && e.rank === "creature") {
        this.promote(id);
      }
    }
  }

  recordEncounter(id: string): void {
    const e = this.entries.get(id);
    if (e) e.encounters++;
  }

  markCaptured(id: string): void {
    const e = this.entries.get(id);
    if (e) e.captured = true;
  }

  all(): NemesisEntry[] {
    return Array.from(this.entries.values());
  }

  active(): NemesisEntry[] {
    return this.all().filter((e) => !e.captured);
  }

  getTrait(id: string) {
    return NEMESIS_TRAITS.find((t) => t.id === id);
  }

  getWeakness(id: string) {
    return NEMESIS_WEAKNESSES.find((w) => w.id === id);
  }

  /** Serialize all entries for localStorage persistence. */
  serialize(): string {
    const data = {
      entries: this.all(),
      nextId: this.nextId,
    };
    return JSON.stringify(data);
  }

  /** Restore entries from serialized data. */
  deserialize(json: string): void {
    try {
      const data = JSON.parse(json);
      this.entries.clear();
      this.nextId = data.nextId ?? 1;
      for (const entry of data.entries ?? []) {
        this.entries.set(entry.id, entry as NemesisEntry);
      }
    } catch {
      // ignore corrupt data
    }
  }
}

/** A hostile creature that chases the player — sprite-based with animations. */
class Creature {
  container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;
  private hp: number;
  maxHp: number;
  private speed: number;
  private damage: number;
  private attackCd = 0;
  private alive = true;
  private world: WorldLayer;
  private animKey: string;
  private lightGlow: Phaser.GameObjects.Image;
  private walkTimer = 0;
  private lastDir = 0;
  nemesisId: string | null = null;
  private nameTag: Phaser.GameObjects.Text | null = null;
  private hasHitPlayer = false;
  private regenAccumulator = 0;
  captureImmune = 0; // timestamp — can't capture again until this passes
  private hostilityLevel: number;

  get hpRatio(): number { return this.hp / this.maxHp; }
  get captureReady(): boolean { return this.hpRatio < 0.25 && this.captureImmune === 0; }

  constructor(world: WorldLayer, x: number, y: number, hostility: number) {
    this.world = world;
    this.hostilityLevel = hostility;
    this.maxHp = 20 + hostility * 20;
    this.hp = this.maxHp;
    this.speed = 70 + hostility * 25;
    this.damage = 8 + hostility * 5;
    const scene = world.scene;
    const radius = 14 + hostility * 2;

    this.animKey = creatureKey(hostility, world.worldTheme?.id);

    // shadow
    this.shadow = scene.add.ellipse(0, 2, radius * 2.8, radius * 0.9, 0x000000, 0.2);

    // sprite
    this.sprite = scene.add.sprite(0, 0, this.animKey, 0).setOrigin(0.5, 0.7).setScale(1.2);

    // glow aura for hostile creatures
    const glowColor = hostility >= 4 ? 0xaa00ff : hostility >= 2 ? 0xff4400 : 0xff3333;
    this.lightGlow = scene.add
      .image(0, 0, "soft-glow")
      .setDisplaySize(radius * 4, radius * 4)
      .setTint(glowColor)
      .setAlpha(0.15)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(19);

    this.container = scene.add.container(x, y, [this.lightGlow, this.shadow, this.sprite]).setDepth(20 + y);
  }

  /** Link this creature to a Nemesis entry and show its name tag. */
  linkNemesis(entry: NemesisEntry): void {
    this.nemesisId = entry.id;
    this.hp = entry.hp;
    this.maxHp = entry.maxHp;
    this.damage = entry.damage;
    this.speed = entry.speed;
    // Apply trait modifiers
    for (const traitId of entry.traitIds) {
      if (traitId === "armored") this.maxHp = Math.floor(this.maxHp * 1.5);
      if (traitId === "berserker") this.damage = Math.floor(this.damage * 2);
      if (traitId === "swift") this.speed = Math.floor(this.speed * 1.5);
      if (traitId === "fragile") this.maxHp = Math.floor(this.maxHp * 0.75);
      if (traitId === "slow") this.speed = Math.floor(this.speed * 0.7);
    }
    this.hp = this.maxHp;
    // Show name tag above creature
    const label = entry.title ? `${entry.name}\n[${entry.title}]` : entry.name;
    this.nameTag = this.world.scene.add.text(this.container.x, this.container.y - 30, label, {
      fontFamily: "'M PLUS Rounded 1c', sans-serif",
      fontSize: "11px",
      color: entry.rank === "warchief" ? "#ff4444" : entry.rank === "captain" ? "#ffaa44" : "#ffdd44",
      stroke: "#1a1a22",
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setResolution(4).setScale(0.7).setDepth(30);
  }

  get alive_(): boolean { return this.alive; }

  update(dt: number, playerX: number, playerY: number): { hit: boolean; damage: number } | null {
    if (!this.alive) return null;

    // Nemesis regen trait
    if (this.nemesisId && this.hp < this.maxHp) {
      this.regenAccumulator += dt;
      if (this.regenAccumulator >= 1000) {
        this.regenAccumulator = 0;
        this.hp = Math.min(this.maxHp, this.hp + Math.floor(this.maxHp * 0.03));
      }
    }

    // Update name tag position
    if (this.nameTag) {
      this.nameTag.setPosition(this.container.x, this.container.y - 30);
    }

    const dx = playerX - this.container.x;
    const dy = playerY - this.container.y;
    const dist = Math.hypot(dx, dy);

    // chase player if within aggro range
    const aggroRange = 300;
    let moving = false;
    if (dist < aggroRange && dist > 30) {
      const step = this.speed * (dt / 1000);
      const nx = this.container.x + (dx / dist) * step;
      const ny = this.container.y + (dy / dist) * step;
      // simple collision: only move if target tile is walkable
      const { tx, ty } = this.world.pixelToTile(nx, ny);
      if (this.world.isCreatureWalkable(tx, ty)) {
        this.container.setPosition(nx, ny);
        this.container.setDepth(20 + ny);
        moving = true;
        this.lastDir = dirFromVelocity(dx, dy);
      }
    }

    // animation: walk vs idle
    const is3d = has8Directions(this.sprite);
    if (is3d) {
      if (moving) {
        this.walkTimer += dt;
        const anim = Math.floor(this.walkTimer / 200) % 2 + 1;
        this.sprite.setFrame(anim * DIRS_3D + this.lastDir);
      } else {
        this.sprite.setFrame(this.lastDir); // idle = anim 0
      }
    } else {
      this.sprite.setFlipX(this.lastDir >= 4 && this.lastDir <= 6); // W, NW, SW
      if (moving) {
        this.walkTimer += dt;
        const frame = Math.floor(this.walkTimer / 200) % 2 + 1;
        this.sprite.setFrame(frame);
      } else {
        this.sprite.setFrame(0);
      }
    }

    // attack cooldown
    this.attackCd -= dt;
    if (dist < 40 && this.attackCd <= 0) {
      this.attackCd = 1000;
      // attack animation
      this.sprite.setFrame(is3d ? 3 * DIRS_3D + this.lastDir : 3);
      this.world.vfx?.sparkBurst(this.container.x, this.container.y, 0xff3333, 4, 60);
      this.world.audio?.creatureGrowl();
      this.hasHitPlayer = true;
      return { hit: true, damage: this.damage };
    }
    return null;
  }

  takeDamage(amount: number): void {
    let dmg = amount;
    // Apply nemesis trait damage modifiers
    if (this.nemesisId) {
      const entry = this.world.nemesis?.get(this.nemesisId);
      if (entry) {
        for (const traitId of entry.traitIds) {
          if (traitId === "armored") dmg = Math.floor(dmg * 0.5);
        }
        for (const weakId of entry.weaknessIds) {
          if (weakId === "fragile") dmg = Math.floor(dmg * 1.5);
        }
      }
    }
    this.hp -= dmg;
    this.world.vfx?.hitFlash(this.sprite);
    this.world.vfx?.sparkBurst(this.container.x, this.container.y, 0xff4444, 8, 80);
    this.world.vfx?.damageNumber(this.container.x, this.container.y - 30, dmg);
    if (this.hp <= 0) {
      this.alive = false;
      this.world.vfx?.deathDissolve(this.container.x, this.container.y, 0x8a3a3a, 1);
      this.world.audio?.death();
      this.nameTag?.destroy();
      // Record nemesis encounter on death
      if (this.nemesisId) {
        this.world.nemesis?.recordEncounter(this.nemesisId);
      }
      this.container.destroy();
      achievements.unlock("first_blood");
      if (achievements.incStat("creaturesKilled") >= 20) achievements.unlock("creature_slayer");
      // Drop void shards — 50% chance, 1-2 shards scaling with hostility
      if (Math.random() < 0.5) {
        const shards = 1 + Math.floor(this.hostilityLevel / 2);
        this.world.addShards(shards);
        this.world.vfx?.sparkBurst(this.container.x, this.container.y, 0xaa44ff, 8, 60);
      }
    }
  }

  destroy(): void {
    this.alive = false;
    this.nameTag?.destroy();
    // Record survival if this nemesis hit the player and is despawning alive
    if (this.nemesisId && this.hasHitPlayer) {
      this.world.nemesis?.recordSurvival(this.nemesisId);
    }
    this.container.destroy();
  }
}

/** A slow slug creature that wanders meadows — low threat, drops slug_slime. */
class Slug {
  container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;
  private hp = 10;
  private damage = 3;
  private alive = true;
  private world: WorldLayer;
  private walkTimer = 0;
  private wanderAt = 0;
  private targetX: number;
  private targetY: number;
  private moving = false;
  private lastDir = 0;
  private attackCd = 0;
  private trailAt = 0;
  private aggroUntil = 0;

  constructor(world: WorldLayer, x: number, y: number) {
    this.world = world;
    const scene = world.scene;
    const radius = 10;

    this.shadow = scene.add.ellipse(0, 2, radius * 2.8, radius * 0.9, 0x000000, 0.15);
    this.sprite = scene.add.sprite(0, 0, "creature-slug", 0).setOrigin(0.5, 0.7).setScale(0.7);
    this.container = scene.add.container(x, y, [this.shadow, this.sprite]).setDepth(20 + y);
    this.targetX = x;
    this.targetY = y;
  }

  get alive_(): boolean { return this.alive; }

  update(time: number, dt: number, playerX: number, playerY: number): { hit: boolean; damage: number } | null {
    if (!this.alive) return null;

    const dx = playerX - this.container.x;
    const dy = playerY - this.container.y;
    const dist = Math.hypot(dx, dy);

    // aggro at close range — chase slowly
    if (dist < 120 && dist > 30) {
      this.aggroUntil = time + 3000;
    }
    const aggro = time < this.aggroUntil;

    if (aggro && dist > 30) {
      this.targetX = playerX;
      this.targetY = playerY;
      this.moving = true;
    } else if (!this.moving && time > this.wanderAt) {
      // wander slowly
      const range = 4;
      for (let tries = 0; tries < 6; tries++) {
        const wdx = Math.floor((Math.random() - 0.5) * range * 2);
        const wdy = Math.floor((Math.random() - 0.5) * range * 2);
        const tx = Math.floor((this.container.x - this.world.offset.x) / TILE_PX) + wdx;
        const ty = Math.floor((this.container.y - this.world.offset.y) / TILE_PX) + wdy;
        if (this.world.isCreatureWalkable(tx, ty)) {
          this.targetX = tx * TILE_PX + TILE_PX / 2 + this.world.offset.x;
          this.targetY = ty * TILE_PX + TILE_PX / 2 + this.world.offset.y;
          this.moving = true;
          break;
        }
      }
      this.wanderAt = time + 5000 + Math.random() * 8000;
    }

    // move toward target — very slow
    if (this.moving) {
      const mdx = this.targetX - this.container.x;
      const mdy = this.targetY - this.container.y;
      const md = Math.hypot(mdx, mdy);
      const speed = aggro ? 35 : 20;
      const step = speed * (dt / 1000);
      if (md <= step) {
        this.container.setPosition(this.targetX, this.targetY);
        this.moving = false;
      } else {
        const nx = this.container.x + (mdx / md) * step;
        const ny = this.container.y + (mdy / md) * step;
        const { tx, ty } = this.world.pixelToTile(nx, ny);
        if (this.world.isCreatureWalkable(tx, ty)) {
          this.container.setPosition(nx, ny);
          this.lastDir = dirFromVelocity(mdx, mdy);
        } else {
          this.moving = false;
        }
      }
      this.container.setDepth(20 + this.container.y);
    }

    // animation
    const is3d = has8Directions(this.sprite);
    if (is3d) {
      if (this.moving) {
        this.walkTimer += dt;
        const anim = Math.floor(this.walkTimer / 300) % 2 + 1;
        this.sprite.setFrame(anim * DIRS_3D + this.lastDir);
      } else {
        this.sprite.setFrame(this.lastDir);
      }
    } else {
      this.sprite.setFlipX(this.lastDir >= 4 && this.lastDir <= 6);
      if (this.moving) {
        this.walkTimer += dt;
        const frame = Math.floor(this.walkTimer / 300) % 2 + 1;
        this.sprite.setFrame(frame);
      } else {
        this.sprite.setFrame(0);
      }
    }

    // slime trail VFX
    if (this.moving && time > this.trailAt) {
      this.trailAt = time + 600;
      this.world.vfx?.sparkBurst(this.container.x, this.container.y + 4, 0x6a8a4a, 2, 15);
    }

    // attack — weak, close range
    this.attackCd -= dt;
    if (dist < 30 && this.attackCd <= 0) {
      this.attackCd = 1500;
      this.sprite.setFrame(is3d ? 3 * DIRS_3D + this.lastDir : 3);
      this.world.vfx?.sparkBurst(this.container.x, this.container.y, 0x6a8a4a, 3, 30);
      return { hit: true, damage: this.damage };
    }
    return null;
  }

  takeDamage(amount: number): void {
    this.hp -= amount;
    this.world.vfx?.hitFlash(this.sprite);
    this.world.vfx?.sparkBurst(this.container.x, this.container.y, 0x6a8a4a, 6, 60);
    this.world.vfx?.damageNumber(this.container.x, this.container.y - 20, amount);
    if (this.hp <= 0) {
      this.alive = false;
      this.world.vfx?.deathDissolve(this.container.x, this.container.y, 0x6a8a4a, 0.6);
      this.world.audio?.death();
      // drop slug_slime
      const drops = 1 + Math.floor(Math.random() * 2);
      this.world.inventory.addItem("slug_slime", drops);
      this.world.vfx?.sparkBurst(this.container.x, this.container.y, 0x8aaa6a, 8, 50);
      this.world.store.toast(`Defeated a slug! Dropped ${drops} slug slime. 🐌`);
      achievements.unlock("slug_slayer");
      if (achievements.incStat("slugsKilled") >= 10) achievements.unlock("slug_exterminator");
      this.container.destroy();
    }
  }

  destroy(): void {
    this.alive = false;
    this.container.destroy();
  }
}

/** A friendly creature that wanders peacefully near the office — no combat. */
class FriendlyCreature {
  container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;
  private lightGlow: Phaser.GameObjects.Image;
  private alive = true;
  private world: WorldLayer;
  private animKey: string;
  private walkTimer = 0;
  private wanderAt = 0;
  private targetX: number;
  private targetY: number;
  private moving = false;
  private lastDir = 0;
  private sparkleAt = 0;
  private curiousUntil = 0;

  constructor(world: WorldLayer, x: number, y: number, typeIndex: number) {
    this.world = world;
    const scene = world.scene;
    this.animKey = friendlyCreatureKey(typeIndex, world.worldTheme?.id);
    const radius = 8;

    this.shadow = scene.add.ellipse(0, 2, radius * 2.8, radius * 0.9, 0x000000, 0.12);

    this.sprite = scene.add.sprite(0, 0, this.animKey, 0).setOrigin(0.5, 0.7).setScale(0.53);

    // soft friendly glow — pink/warm
    this.lightGlow = scene.add
      .image(0, 0, "soft-glow")
      .setDisplaySize(radius * 4, radius * 4)
      .setTint(0xffaaee)
      .setAlpha(0.08)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(19);

    this.container = scene.add.container(x, y, [this.lightGlow, this.shadow, this.sprite]).setDepth(20 + y);
    this.targetX = x;
    this.targetY = y;
  }

  get alive_(): boolean { return this.alive; }

  update(time: number, dt: number, playerX: number, playerY: number): void {
    if (!this.alive) return;
    const dx = playerX - this.container.x;
    const dy = playerY - this.container.y;
    const dist = Math.hypot(dx, dy);

    // curious approach: if player is moderately close, move toward them briefly
    if (dist < 180 && dist > 60 && time > this.curiousUntil && Math.random() < 0.01) {
      this.curiousUntil = time + 2000;
      this.targetX = this.container.x + dx * 0.3;
      this.targetY = this.container.y + dy * 0.3;
      this.moving = true;
    }

    // if player gets too close, hop away shyly
    if (dist < 50) {
      const hopAngle = Math.atan2(-dy, -dx);
      this.targetX = this.container.x + Math.cos(hopAngle) * 80;
      this.targetY = this.container.y + Math.sin(hopAngle) * 80;
      this.moving = true;
      this.curiousUntil = 0;
    }

    // wander randomly when idle
    if (!this.moving && time > this.wanderAt) {
      const range = 5;
      for (let tries = 0; tries < 8; tries++) {
        const wdx = Math.floor((Math.random() - 0.5) * range * 2);
        const wdy = Math.floor((Math.random() - 0.5) * range * 2);
        const tx = Math.floor((this.container.x - this.world.offset.x) / TILE_PX) + wdx;
        const ty = Math.floor((this.container.y - this.world.offset.y) / TILE_PX) + wdy;
        if (this.world.isCreatureWalkable(tx, ty)) {
          this.targetX = tx * TILE_PX + TILE_PX / 2 + this.world.offset.x;
          this.targetY = ty * TILE_PX + TILE_PX / 2 + this.world.offset.y;
          this.moving = true;
          break;
        }
      }
      this.wanderAt = time + 4000 + Math.random() * 6000;
    }

    // move toward target
    if (this.moving) {
      const mdx = this.targetX - this.container.x;
      const mdy = this.targetY - this.container.y;
      const md = Math.hypot(mdx, mdy);
      const speed = 50;
      const step = speed * (dt / 1000);
      if (md <= step) {
        this.container.setPosition(this.targetX, this.targetY);
        this.moving = false;
      } else {
        const nx = this.container.x + (mdx / md) * step;
        const ny = this.container.y + (mdy / md) * step;
        const { tx, ty } = this.world.pixelToTile(nx, ny);
        if (this.world.isCreatureWalkable(tx, ty)) {
          this.container.setPosition(nx, ny);
          this.lastDir = dirFromVelocity(mdx, mdy);
        } else {
          this.moving = false;
        }
      }
      this.container.setDepth(20 + this.container.y);
    }

    // animation: walk vs idle vs hop
    const is3d = has8Directions(this.sprite);
    if (is3d) {
      if (this.moving) {
        this.walkTimer += dt;
        const anim = Math.floor(this.walkTimer / 250) % 2 + 1;
        this.sprite.setFrame(anim * DIRS_3D + this.lastDir);
      } else {
        this.sprite.setFrame(this.lastDir);
      }
    } else {
      this.sprite.setFlipX(this.lastDir >= 4 && this.lastDir <= 6);
      if (this.moving) {
        this.walkTimer += dt;
        const frame = Math.floor(this.walkTimer / 250) % 2 + 1;
        this.sprite.setFrame(frame);
      } else {
        this.sprite.setFrame(0);
      }
    }

    // occasional sparkle / heart particles
    if (time > this.sparkleAt) {
      this.sparkleAt = time + 3000 + Math.random() * 4000;
      this.world.vfx?.sparkBurst(this.container.x, this.container.y - 10, 0xffaaee, 3, 20);
    }

    // pulse glow
    const pulse = 0.08 + Math.sin(time * 0.003) * 0.04;
    this.lightGlow.setAlpha(pulse);
  }

  destroy(): void {
    this.alive = false;
    this.container.destroy();
  }
}

// ============================================================
// DOG NPC — friendly yellow lab with fetch mechanic
// ============================================================

type DogState = "wander" | "chase_ball" | "retrieve" | "return_to_owner" | "sit";

/** A thrown ball that arcs through the air and lands in water. */
class FetchBall {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  alive = true;
  landed = false;
  landX: number;
  landY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, vx: number, vy: number, landX: number, landY: number) {
    this.img = scene.add.image(x, y, resolveItemTex(scene, "tennis-ball")).setDepth(50).setScale(0.4);
    this.vx = vx;
    this.vy = vy;
    this.landX = landX;
    this.landY = landY;
  }

  update(dt: number): void {
    if (!this.alive || this.landed) return;
    const bdt = dt / 1000;
    this.img.x += this.vx * bdt;
    this.img.y += this.vy * bdt;
    this.vx *= 0.99;
    this.vy *= 0.99;
    // check if ball reached the target landing spot
    const dist = Math.hypot(this.img.x - this.landX, this.img.y - this.landY);
    if (dist < 12 || Math.hypot(this.vx, this.vy) < 8) {
      this.img.setPosition(this.landX, this.landY);
      this.landed = true;
    }
  }

  destroy(): void {
    this.alive = false;
    this.img.destroy();
  }
}

/** A friendly dog NPC that wanders near water and fetches thrown balls. */
class Dog {
  container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;
  private alive = true;
  private world: WorldLayer;
  private state: DogState = "wander";
  private targetX: number;
  private targetY: number;
  private wanderAt = 0;
  private walkTimer = 0;
  private facingRight = true;
  private ballTarget: FetchBall | null = null;
  private fetchCount = 0;
  private happyUntil = 0;
  private sitUntil = 0;

  constructor(world: WorldLayer, x: number, y: number) {
    this.world = world;
    const scene = world.scene;
    this.shadow = scene.add.ellipse(0, 4, 28, 10, 0x000000, 0.15);
    this.sprite = scene.add.sprite(0, 0, "friendly-dog", 0).setOrigin(0.5, 0.7).setScale(0.5);
    this.container = scene.add.container(x, y, [this.shadow, this.sprite]).setDepth(20 + y);
    this.targetX = x;
    this.targetY = y;
  }

  get alive_(): boolean { return this.alive; }

  /** Assign a ball for the dog to fetch. */
  fetchBall(ball: FetchBall): void {
    this.ballTarget = ball;
    this.state = "chase_ball";
  }

  update(time: number, dt: number, playerX: number, playerY: number): void {
    if (!this.alive) return;
    const distToPlayer = Math.hypot(playerX - this.container.x, playerY - this.container.y);

    // state machine
    switch (this.state) {
      case "sit": {
        if (time > this.sitUntil) {
          this.state = "wander";
          this.wanderAt = time + 500;
        }
        break;
      }
      case "wander": {
        // follow player loosely if far away
        if (distToPlayer > 400) {
          this.targetX = playerX + (Math.random() - 0.5) * 100;
          this.targetY = playerY + (Math.random() - 0.5) * 100;
          this.state = "return_to_owner";
          break;
        }
        // wander randomly
        if (time > this.wanderAt) {
          const range = 6;
          for (let tries = 0; tries < 8; tries++) {
            const wdx = Math.floor((Math.random() - 0.5) * range * 2);
            const wdy = Math.floor((Math.random() - 0.5) * range * 2);
            const tx = Math.floor((this.container.x - this.world.offset.x) / TILE_PX) + wdx;
            const ty = Math.floor((this.container.y - this.world.offset.y) / TILE_PX) + wdy;
            if (this.world.isCreatureWalkable(tx, ty)) {
              this.targetX = tx * TILE_PX + TILE_PX / 2 + this.world.offset.x;
              this.targetY = ty * TILE_PX + TILE_PX / 2 + this.world.offset.y;
              break;
            }
          }
          this.wanderAt = time + 3000 + Math.random() * 4000;
        }
        // occasionally sit and rest
        if (Math.random() < 0.002 && distToPlayer < 200) {
          this.state = "sit";
          this.sitUntil = time + 2000 + Math.random() * 3000;
        }
        break;
      }
      case "chase_ball": {
        if (!this.ballTarget || !this.ballTarget.alive) {
          this.state = "wander";
          this.ballTarget = null;
          break;
        }
        if (this.ballTarget.landed) {
          this.targetX = this.ballTarget.img.x;
          this.targetY = this.ballTarget.img.y;
          const bd = Math.hypot(this.targetX - this.container.x, this.targetY - this.container.y);
          if (bd < 20) {
            // got the ball! switch to retrieve
            this.ballTarget.destroy();
            this.ballTarget = null;
            this.state = "retrieve";
            this.targetX = playerX;
            this.targetY = playerY;
            this.happyUntil = time + 3000;
          }
        }
        break;
      }
      case "retrieve": {
        // bring ball back to player
        this.targetX = playerX;
        this.targetY = playerY;
        const d = Math.hypot(this.targetX - this.container.x, this.targetY - this.container.y);
        if (d < 40) {
          // delivered! give reward
          this.fetchCount++;
          this.world.onDogFetch(this.fetchCount);
          this.state = "sit";
          this.sitUntil = time + 1500 + Math.random() * 1000;
          // tail wag VFX
          this.world.vfx?.sparkBurst(this.container.x, this.container.y - 5, 0xffdd44, 8, 40);
        }
        break;
      }
      case "return_to_owner": {
        const d = Math.hypot(this.targetX - this.container.x, this.targetY - this.container.y);
        if (d < 60) {
          this.state = "wander";
          this.wanderAt = time + 1000;
        }
        break;
      }
    }

    // movement
    const mdx = this.targetX - this.container.x;
    const mdy = this.targetY - this.container.y;
    const md = Math.hypot(mdx, mdy);
    const isMoving = this.state === "chase_ball" || this.state === "retrieve" || this.state === "return_to_owner" ||
                     (this.state === "wander" && md > 4);
    const speed = this.state === "chase_ball" ? 120 : this.state === "retrieve" ? 90 : 55;
    const step = speed * (dt / 1000);

    if (isMoving && md > 2) {
      if (md <= step) {
        this.container.setPosition(this.targetX, this.targetY);
      } else {
        const nx = this.container.x + (mdx / md) * step;
        const ny = this.container.y + (mdy / md) * step;
        const { tx, ty } = this.world.pixelToTile(nx, ny);
        if (this.world.isCreatureWalkable(tx, ty) || this.state === "chase_ball") {
          // allow dog to walk on water tiles when fetching
          this.container.setPosition(nx, ny);
          this.facingRight = mdx > 0;
        }
      }
    }

    this.container.setDepth(20 + this.container.y);

    // animation
    this.sprite.setFlipX(!this.facingRight);
    if (this.state === "retrieve") {
      // frame 3 = holding ball
      this.sprite.setFrame(3);
    } else if (isMoving) {
      this.walkTimer += dt;
      const frame = Math.floor(this.walkTimer / 200) % 2 + 1;
      this.sprite.setFrame(frame);
    } else {
      this.sprite.setFrame(0);
    }

    // happy bark particles
    if (time < this.happyUntil && Math.random() < 0.05) {
      this.world.vfx?.sparkBurst(this.container.x, this.container.y - 10, 0xffdd44, 2, 15);
    }
  }

  destroy(): void {
    this.alive = false;
    this.container.destroy();
  }
}

// ============================================================
// LEPRECHAUN NPC — wandering trickster with quests and personality
// ============================================================

type LepState = "wander" | "flee" | "interact" | "vanish" | "cooldown";

interface LepTradeStep {
  require: string;
  requireCount: number;
  give: string;
  giveCount: number;
  dialogue: string;
}

const LEP_TRADE_CHAIN: LepTradeStep[] = [
  { require: "wedge", requireCount: 1, give: "axe", giveCount: 1, dialogue: "A magical wedge! Ye drive a hard bargain, human. Take this axe — ye'll need it where ye're going." },
  { require: "wood", requireCount: 5, give: "gold_coin", giveCount: 3, dialogue: "Wood for gold? A fair trade, a fair trade... but gold always comes with a price, heh heh." },
  { require: "slug_slime", requireCount: 5, give: "four_leaf_clover", giveCount: 1, dialogue: "Slug slime for luck? Ye're a strange one. Here — a four-leaf clover. May it bring ye fortune... or something else entirely." },
  { require: "fish", requireCount: 3, give: "void_shard", giveCount: 2, dialogue: "Fish from the lake... tasty. Take these shards. Ye'll want them when the shadows grow longer. And they will, human. They will." },
];

/** Apply a leprechaun trade reward, handling void_shard specially. */
function applyLepReward(world: WorldLayer, give: string, count: number): void {
  if (give === "void_shard") {
    world.addShards(count);
  } else {
    for (let i = 0; i < count; i++) world.inventory.addItem(give, 1);
  }
}

const LEP_RIDDLES = [
  "What walks on four legs in the morning, two at noon, and three in the evening? Bah, ye've heard that one.",
  "I've a pot of gold at the end of the rainbow. But have ye ever found the end of a rainbow, human? No. No one has. Curious, isn't it?",
  "They say we grant wishes. But what if the wish grants you? Think on that, human.",
  "The trees here have eyes. The water has memory. And me? I've been watching ye for quite some time.",
  "Ye chase creatures and slay beasts. But have ye ever wondered what chases ye? Something to ponder over your next pint.",
  "I've lived a long time, human. Long enough to know that every gift has a cost. Every trade... a consequence.",
  "The void between worlds is hungry. Ye've felt it, haven't ye? That chill when the sun sets. It's not the cold. It's something... waiting.",
];

const LEP_STEAL_LINES = [
  "Ooh, what's this? I'll be taking that! 🍀",
  "Finders keepers, human!",
  "Ye won't miss it... probably.",
  "A tax for crossing me territory, heh heh!",
];

class Leprechaun {
  container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;
  private glow: Phaser.GameObjects.Image;
  private alive = true;
  private world: WorldLayer;
  private state: LepState = "wander";
  private targetX: number;
  private targetY: number;
  private wanderAt = 0;
  private walkTimer = 0;
  private facingRight = true;
  private tradeIndex = 0;
  private encounterCount = 0;
  private cooldownUntil = 0;
  private stolenItem: string | null = null;
  private fleeUntil = 0;
  private speakUntil = 0;
  private speechText: Phaser.GameObjects.Text | null = null;

  constructor(world: WorldLayer, x: number, y: number) {
    this.world = world;
    const scene = world.scene;
    this.shadow = scene.add.ellipse(0, 4, 24, 8, 0x000000, 0.2);
    this.sprite = scene.add.sprite(0, 0, "leprechaun-npc", 0).setOrigin(0.5, 0.7).setScale(0.8);
    this.glow = scene.add
      .image(0, 0, "soft-glow")
      .setDisplaySize(40, 40)
      .setTint(0x44ff44)
      .setAlpha(0.06)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(19);
    this.container = scene.add.container(x, y, [this.glow, this.shadow, this.sprite]).setDepth(20 + y);
    this.targetX = x;
    this.targetY = y;
  }

  get alive_(): boolean { return this.alive; }
  get tradeStep_(): LepTradeStep | null { return this.tradeIndex < LEP_TRADE_CHAIN.length ? LEP_TRADE_CHAIN[this.tradeIndex] : null; }
  get encounterCount_(): number { return this.encounterCount; }

  private speak(text: string, duration = 3000): void {
    if (this.speechText) this.speechText.destroy();
    this.speechText = this.world.scene.add.text(0, -30, text, {
      fontSize: "12px",
      color: "#88ff88",
      backgroundColor: "#000000aa",
      padding: { x: 6, y: 3 },
      wordWrap: { width: 200 },
    }).setOrigin(0.5, 1).setDepth(100);
    this.container.add(this.speechText);
    this.speakUntil = this.world.scene.time.now + duration;
  }

  update(time: number, dt: number, playerX: number, playerY: number): void {
    if (!this.alive) return;
    const distToPlayer = Math.hypot(playerX - this.container.x, playerY - this.container.y);

    // clean up speech
    if (this.speechText && time > this.speakUntil) {
      this.speechText.destroy();
      this.speechText = null;
    }

    switch (this.state) {
      case "cooldown": {
        if (time > this.cooldownUntil) {
          this.state = "wander";
          this.wanderAt = time + 500;
        }
        break;
      }
      case "vanish": {
        // fade out and destroy
        this.container.setAlpha(Math.max(0, this.container.alpha - dt * 0.003));
        if (this.container.alpha <= 0) {
          this.destroy();
        }
        break;
      }
      case "flee": {
        if (time > this.fleeUntil) {
          this.state = "wander";
          this.wanderAt = time + 1000;
          break;
        }
        // run away from player
        const dx = this.container.x - playerX;
        const dy = this.container.y - playerY;
        const d = Math.hypot(dx, dy);
        if (d > 0) {
          this.targetX = this.container.x + (dx / d) * 200;
          this.targetY = this.container.y + (dy / d) * 200;
        }
        // if far enough, stop fleeing
        if (d > 300) {
          this.state = "wander";
          this.wanderAt = time + 1000;
          // if we stole something, drop it as a reward for chasing
          if (this.stolenItem) {
            this.world.onLeprechaunCaught(this.stolenItem);
            this.stolenItem = null;
            this.speak("Fine, fine! Take it back! 🍀", 2000);
          }
        }
        break;
      }
      case "interact": {
        // stand still while player decides
        if (distToPlayer > 150) {
          this.state = "wander";
          this.wanderAt = time + 500;
        }
        break;
      }
      case "wander": {
        // if player approaches and we haven't been encountered yet
        if (distToPlayer < 80 && time > this.cooldownUntil) {
          this.encounterCount++;
          this.state = "interact";

          // decide behavior based on encounter count and randomness
          if (this.encounterCount === 1) {
            // first encounter — offer trade or riddle
            const step = this.tradeStep_;
            if (step && this.world.inventory.hasItem(step.require)) {
              this.speak(`Ah, a human with a ${step.require}! Trade with me? Press E.`, 4000);
            } else if (step) {
              this.speak(`Bring me ${step.requireCount}x ${step.require} and I'll make it worth your while. 🍀`, 4000);
            } else {
              this.speak(LEP_RIDDLES[Math.floor(Math.random() * LEP_RIDDLES.length)], 4000);
            }
          } else if (this.encounterCount > 1 && Math.random() < 0.4 && this.world.inventory.getItems().some(s => s !== null && s.type === "material")) {
            // mischievous steal — grab a random material item and flee
            const items = this.world.inventory.getItems().filter(s => s !== null && s.type === "material");
            if (items.length > 0) {
              const stolen = items[Math.floor(Math.random() * items.length)];
              if (stolen) {
                this.world.inventory.removeItem(stolen.id, 1);
                this.stolenItem = stolen.id;
                this.speak(LEP_STEAL_LINES[Math.floor(Math.random() * LEP_STEAL_LINES.length)], 2000);
                this.state = "flee";
                this.fleeUntil = time + 5000;
                this.world.vfx?.sparkBurst(this.container.x, this.container.y, 0x44ff44, 12, 60);
                break;
              }
            }
            this.speak(LEP_RIDDLES[Math.floor(Math.random() * LEP_RIDDLES.length)], 4000);
          } else {
            // offer trade or riddle
            const step = this.tradeStep_;
            if (step && this.world.inventory.hasItem(step.require)) {
              this.speak(`Got that ${step.require} for me? Press E to trade. 🍀`, 4000);
            } else if (step) {
              this.speak(`I still need ${step.requireCount}x ${step.require}. Find them, human.`, 4000);
            } else {
              this.speak(LEP_RIDDLES[Math.floor(Math.random() * LEP_RIDDLES.length)], 4000);
            }
          }
          break;
        }

        // follow player loosely if far
        if (distToPlayer > 500) {
          this.targetX = playerX + (Math.random() - 0.5) * 200;
          this.targetY = playerY + (Math.random() - 0.5) * 200;
          break;
        }

        // wander randomly
        if (time > this.wanderAt) {
          const range = 5;
          for (let tries = 0; tries < 8; tries++) {
            const wdx = Math.floor((Math.random() - 0.5) * range * 2);
            const wdy = Math.floor((Math.random() - 0.5) * range * 2);
            const tx = Math.floor((this.container.x - this.world.offset.x) / TILE_PX) + wdx;
            const ty = Math.floor((this.container.y - this.world.offset.y) / TILE_PX) + wdy;
            if (this.world.isCreatureWalkable(tx, ty)) {
              this.targetX = tx * TILE_PX + TILE_PX / 2 + this.world.offset.x;
              this.targetY = ty * TILE_PX + TILE_PX / 2 + this.world.offset.y;
              break;
            }
          }
          this.wanderAt = time + 2000 + Math.random() * 3000;
        }
        break;
      }
    }

    // movement
    const mdx = this.targetX - this.container.x;
    const mdy = this.targetY - this.container.y;
    const md = Math.hypot(mdx, mdy);
    const isMoving = this.state === "flee" || (this.state === "wander" && md > 4);
    const speed = this.state === "flee" ? 140 : 60;
    const step = speed * (dt / 1000);

    if (isMoving && md > 2) {
      if (md <= step) {
        this.container.setPosition(this.targetX, this.targetY);
      } else {
        const nx = this.container.x + (mdx / md) * step;
        const ny = this.container.y + (mdy / md) * step;
        const { tx, ty } = this.world.pixelToTile(nx, ny);
        if (this.world.isCreatureWalkable(tx, ty)) {
          this.container.setPosition(nx, ny);
          this.facingRight = mdx > 0;
        }
      }
    }

    this.container.setDepth(20 + this.container.y);

    // animation
    this.sprite.setFlipX(!this.facingRight);
    if (this.state === "flee") {
      this.walkTimer += dt;
      const frame = Math.floor(this.walkTimer / 150) % 2 + 1;
      this.sprite.setFrame(frame === 1 ? 3 : 1); // alternate flee/walk
    } else if (isMoving) {
      this.walkTimer += dt;
      const frame = Math.floor(this.walkTimer / 250) % 2 + 1;
      this.sprite.setFrame(frame);
    } else {
      this.sprite.setFrame(0);
    }

    // pulse glow
    const pulse = 0.06 + Math.sin(time * 0.003) * 0.03;
    this.glow.setAlpha(pulse);
  }

  /** Called when player presses E near the leprechaun — handles trading. */
  tryInteract(time: number): boolean {
    if (this.state !== "interact") return false;
    const step = this.tradeStep_;
    if (!step) {
      this.speak("I've nothing left to trade, human. But I'll be watching... always watching.", 3000);
      return false;
    }
    if (this.world.inventory.getQuantity(step.require) >= step.requireCount) {
      // complete the trade
      this.world.inventory.removeItem(step.require, step.requireCount);
      applyLepReward(this.world, step.give, step.giveCount);
      this.speak(step.dialogue, 5000);
      this.tradeIndex++;
      this.world.vfx?.celebrate(this.container.x, this.container.y);
      this.world.vfx?.sparkBurst(this.container.x, this.container.y, 0xffdd00, 16, 80);
      this.world.audio.recruit();
      this.world.onLeprechaunTrade(this.tradeIndex);
      // enter cooldown then vanish
      this.state = "vanish";
      this.cooldownUntil = time + 30000;
      return true;
    } else {
      this.speak(`Ye don't have enough ${step.require}. I need ${step.requireCount}. Come back when ye do.`, 3000);
      return false;
    }
  }

  destroy(): void {
    this.alive = false;
    if (this.speechText) this.speechText.destroy();
    this.container.destroy();
  }
}

// ============================================================
// WIFE NPC — cabin companion with dialogue and cooking
// ============================================================

const WIFE_GREETINGS = [
  "Welcome home, dear. The cabin looks lovely, doesn't it?",
  "I picked some berries by the shore. We'll have them with dinner.",
  "The lake is so peaceful at dusk. I could watch it forever.",
  "I heard something in the woods earlier... probably just the wind.",
  "Did you see that little green man again? He gives me the creeps.",
  "I've been thinking... we built something real here. Something worth protecting.",
];

const WIFE_FISH_COOK = [
  "Mmm, fresh fish! Let me cook that for you. 🐟",
  "You always bring the best catches. Dinner is served!",
  "One grilled fish, coming right up!",
  "Nothing like lake fish cooked over an open flame.",
];

const WIFE_HINTS = [
  "If you have a fishing rod, try casting into the lake. The fish love worms at dusk.",
  "I saw some slimes near the forest. Be careful out there.",
  "That leprechaun... he visited while you were away. Asked strange questions about you.",
  "The flowers by the shore bloom at different times. Have you noticed?",
  "Sometimes I hear singing from the lake at night. Beautiful... but lonely.",
  "There's something buried under the big tree on the hill. I can feel it.",
  "The leprechaun said something odd last time... 'Every gift has a price.' What did he mean?",
  "I keep having the same dream. A purple light, opening like an eye... then I wake up.",
  "Do you ever feel like... someone arranged all of this? The lake, the trees, us?",
  "I tried to leave the cabin today. I couldn't. My feet just... stopped. Isn't that funny?",
];

type WifeState = "idle" | "wander" | "talk";

class Wife {
  container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private speechText: Phaser.GameObjects.Text | null = null;
  private world: WorldLayer;
  private state: WifeState = "idle";
  private alive = true;
  private homeX: number;
  private homeY: number;
  private targetX: number;
  private targetY: number;
  private lastDir = 1; // 1=right, -1=left
  private animFrame = 0;
  private animTimer = 0;
  private nextActionTime = 0;
  private speechUntil = 0;
  private greetingIndex = 0;
  private hintIndex = 0;
  private cookedFishCount = 0;

  constructor(world: WorldLayer, x: number, y: number) {
    this.world = world;
    this.homeX = x;
    this.homeY = y;
    this.targetX = x;
    this.targetY = y;
    const scene = world.scene;
    this.sprite = scene.add.sprite(0, 0, "wife-npc", 0).setDepth(1).setScale(1.2);
    this.container = scene.add.container(x, y, [this.sprite]).setDepth(25 + y);
  }

  get alive_(): boolean { return this.alive; }

  private speak(text: string, duration = 4000): void {
    if (this.speechText) this.speechText.destroy();
    this.speechText = this.world.scene.add.text(
      this.container.x,
      this.container.y - 35,
      text,
      {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "11px",
        color: "#ffffff",
        backgroundColor: "rgba(0,0,0,0.7)",
        padding: { x: 6, y: 4 },
        wordWrap: { width: 200 },
      },
    ).setOrigin(0.5).setDepth(100);
    this.speechUntil = this.world.scene.time.now + duration;
  }

  update(time: number, dt: number, playerX: number, playerY: number): void {
    if (!this.alive) return;

    // Clean up speech
    if (this.speechText && time > this.speechUntil) {
      this.speechText.destroy();
      this.speechText = null;
    }

    // Update speech position
    if (this.speechText) {
      this.speechText.setPosition(this.container.x, this.container.y - 35);
    }

    // State machine
    if (this.state === "idle") {
      if (time > this.nextActionTime) {
        // Randomly wander or stay idle
        if (Math.random() < 0.6) {
          this.state = "wander";
          const angle = Math.random() * Math.PI * 2;
          const dist = 30 + Math.random() * 50;
          this.targetX = this.homeX + Math.cos(angle) * dist;
          this.targetY = this.homeY + Math.sin(angle) * dist;
        } else {
          this.nextActionTime = time + 2000 + Math.random() * 3000;
        }
      }
    } else if (this.state === "wander") {
      const dx = this.targetX - this.container.x;
      const dy = this.targetY - this.container.y;
      const d = Math.hypot(dx, dy);
      if (d < 5) {
        this.state = "idle";
        this.nextActionTime = time + 2000 + Math.random() * 4000;
        this.animFrame = 0;
      } else {
        const speed = 30;
        const step = (speed * dt) / 1000;
        const nx = this.container.x + (dx / d) * step;
        const ny = this.container.y + (dy / d) * step;
        this.container.setPosition(nx, ny);
        this.container.setDepth(25 + ny);
        this.lastDir = dx > 0 ? 1 : -1;
        this.sprite.setFlipX(this.lastDir < 0);
        // Animate walk
        this.animTimer += dt;
        if (this.animTimer > 250) {
          this.animFrame = this.animFrame === 0 ? 1 : 0;
          this.sprite.setFrame(this.animFrame);
          this.animTimer = 0;
        }
      }
    } else if (this.state === "talk") {
      // Face the player
      this.lastDir = playerX > this.container.x ? 1 : -1;
      this.sprite.setFlipX(this.lastDir < 0);
      if (time > this.speechUntil) {
        this.state = "idle";
        this.nextActionTime = time + 2000;
      }
    }
  }

  tryInteract(time: number): boolean {
    // Check if player has fish to cook
    const fishCount = this.world.inventory.getQuantity("fish");
    if (fishCount > 0) {
      this.world.inventory.removeItem("fish", 1);
      this.cookedFishCount++;
      const line = WIFE_FISH_COOK[Math.floor(Math.random() * WIFE_FISH_COOK.length)];
      this.speak(line, 3000);
      // Heal player
      this.world.heal(20);
      this.world.store.toast("🐟 Cooked fish! +20 HP");
      this.world.vfx?.sparkBurst(this.container.x, this.container.y, 0xffaa44, 8, 40);
      this.world.audio.uiClick();
      this.state = "talk";
      if (this.cookedFishCount >= 1) achievements.unlock("first_cooked_fish");
      if (this.cookedFishCount >= 10) achievements.unlock("master_chef");
      return true;
    }

    // Otherwise, give dialogue — rotate through greetings and hints
    if (this.greetingIndex < WIFE_GREETINGS.length) {
      this.speak(WIFE_GREETINGS[this.greetingIndex], 5000);
      this.greetingIndex++;
    } else {
      this.speak(WIFE_HINTS[this.hintIndex % WIFE_HINTS.length], 5000);
      this.hintIndex++;
    }
    this.state = "talk";
    return true;
  }

  /** Called by the dark twist to make the wife speak her final lines. */
  speakFromDarkTwist(text: string, duration: number): void {
    this.speak(text, duration);
    this.state = "talk";
  }

  destroy(): void {
    if (this.speechText) this.speechText.destroy();
    this.container.destroy();
    this.alive = false;
  }
}

// ============================================================
// FISHING MECHANIC
// ============================================================

type FishingState = "idle" | "casting" | "waiting" | "reeling";

class FishingLine {
  container: Phaser.GameObjects.Container;
  private line: Phaser.GameObjects.Graphics;
  private bobber: Phaser.GameObjects.Arc;
  private world: WorldLayer;
  private state: FishingState = "idle";
  private biteTime = 0;
  private hasBite = false;
  private alive = true;

  constructor(world: WorldLayer) {
    this.world = world;
    const scene = world.scene;
    this.line = scene.add.graphics().setDepth(50);
    this.bobber = scene.add.circle(0, 0, 3, 0xff4444).setDepth(51).setVisible(false);
    this.container = scene.add.container(0, 0, [this.line, this.bobber]).setDepth(50);
  }

  get alive_(): boolean { return this.alive; }
  get state_(): FishingState { return this.state; }
  get hasBite_(): boolean { return this.hasBite; }

  cast(fromX: number, fromY: number, toX: number, toY: number, time: number): void {
    this.container.setPosition(fromX, fromY);
    this.bobber.setPosition(toX - fromX, toY - fromY).setVisible(true);
    this.state = "casting";
    // Transition to waiting after a short cast animation
    this.world.scene.time.delayedCall(500, () => {
      if (this.state === "casting") {
        this.state = "waiting";
        // Random bite time: 2-8 seconds
        this.biteTime = time + 2000 + Math.random() * 6000;
        this.hasBite = false;
      }
    });
  }

  update(time: number): void {
    if (this.state === "waiting" && !this.hasBite && time >= this.biteTime) {
      this.hasBite = true;
      // Bob the bobber
      this.world.scene.tweens.add({
        targets: this.bobber,
        y: this.bobber.y - 4,
        duration: 200,
        yoyo: true,
        repeat: 3,
      });
      this.world.store.toast("🐟 A fish is biting! Press E to reel it in!");
    }

    // Draw fishing line
    if (this.state !== "idle") {
      this.line.clear();
      this.line.lineStyle(1, 0xffffff, 0.6);
      this.line.beginPath();
      this.line.moveTo(0, 0);
      this.line.lineTo(this.bobber.x, this.bobber.y);
      this.line.strokePath();
    }
  }

  reel(): { success: boolean; fish: boolean } {
    if (this.state === "waiting" && this.hasBite) {
      this.reset();
      return { success: true, fish: true };
    }
    // Reeled too early or too late
    this.reset();
    return { success: false, fish: false };
  }

  reset(): void {
    this.state = "idle";
    this.hasBite = false;
    this.bobber.setVisible(false);
    this.line.clear();
  }

  destroy(): void {
    this.line.destroy();
    this.bobber.destroy();
    this.container.destroy();
    this.alive = false;
  }
}/** A captured creature deployed as a combat ally — follows player, attacks hostiles. */
class DeployedAlly {
  container: Phaser.GameObjects.Container;
  private alive = true;
  private world: WorldLayer;
  private entry: NemesisEntry;
  private hp: number;
  private maxHp: number;
  private damage: number;
  private speed: number;
  private attackCd = 0;
  private animKey: string;
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;
  private lightGlow: Phaser.GameObjects.Image;
  private walkTimer = 0;
  private lastDir = 0;
  private nameTag: Phaser.GameObjects.Text;
  private hpBar: Phaser.GameObjects.Graphics;

  constructor(world: WorldLayer, x: number, y: number, entry: NemesisEntry) {
    this.world = world;
    this.entry = entry;
    this.maxHp = entry.maxHp;
    this.hp = entry.maxHp;
    this.damage = entry.damage;
    this.speed = entry.speed;
    this.animKey = creatureKey(entry.hostility, world.worldTheme?.id);
    const scene = world.scene;
    const radius = 14 + entry.hostility * 2;

    this.shadow = scene.add.ellipse(0, 2, radius * 2.8, radius * 0.9, 0x000000, 0.2);
    this.sprite = scene.add.sprite(0, 0, this.animKey, 0).setOrigin(0.5, 0.7).setScale(1.2);

    // green ally glow
    this.lightGlow = scene.add
      .image(0, 0, "soft-glow")
      .setDisplaySize(radius * 4, radius * 4)
      .setTint(0x44ff88)
      .setAlpha(0.15)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(19);

    this.container = scene.add.container(x, y, [this.lightGlow, this.shadow, this.sprite]).setDepth(20 + y);

    // name tag
    this.nameTag = scene.add.text(x, y - 30, entry.name, {
      fontFamily: "'M PLUS Rounded 1c', sans-serif",
      fontSize: "10px",
      color: "#44ff88",
      stroke: "#1a1a22",
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setResolution(4).setScale(0.6).setDepth(30);

    this.hpBar = scene.add.graphics().setDepth(31);
  }

  get alive_(): boolean { return this.alive; }
  get entryId(): string { return this.entry.id; }

  update(dt: number, playerX: number, playerY: number): void {
    if (!this.alive) return;

    // Find nearest hostile creature
    let nearestEnemy: Creature | null = null;
    let nearestDist = Infinity;
    for (const c of this.world.creatures) {
      if (!c.alive_) continue;
      const d = Math.hypot(c.container.x - this.container.x, c.container.y - this.container.y);
      if (d < 250 && d < nearestDist) {
        nearestDist = d;
        nearestEnemy = c;
      }
    }

    // Also check beasts
    let nearestBeast: LegendaryBeast | null = null;
    let nearestBeastDist = Infinity;
    for (const b of this.world.beasts) {
      if (!b.alive_) continue;
      const d = Math.hypot(b.container.x - this.container.x, b.container.y - this.container.y);
      if (d < 250 && d < nearestBeastDist) {
        nearestBeastDist = d;
        nearestBeast = b;
      }
    }

    // Decide target: enemy if closer than beast, else beast, else follow player
    let targetX: number, targetY: number;
    let attacking = false;

    if (nearestEnemy && nearestDist < 40) {
      attacking = true;
      targetX = this.container.x;
      targetY = this.container.y;
      this.attackCd -= dt;
      if (this.attackCd <= 0) {
        this.attackCd = 800;
        this.sprite.setFrame(has8Directions(this.sprite) ? 3 * DIRS_3D + this.lastDir : 3);
        nearestEnemy.takeDamage(this.damage);
        this.world.vfx?.sparkBurst(nearestEnemy.container.x, nearestEnemy.container.y, 0x44ff88, 6, 60);
      }
    } else if (nearestBeast && nearestBeastDist < 40) {
      attacking = true;
      targetX = this.container.x;
      targetY = this.container.y;
      this.attackCd -= dt;
      if (this.attackCd <= 0) {
        this.attackCd = 800;
        this.sprite.setFrame(has8Directions(this.sprite) ? 3 * DIRS_3D + this.lastDir : 3);
        nearestBeast.takeDamage(this.damage);
        this.world.vfx?.sparkBurst(nearestBeast.container.x, nearestBeast.container.y, 0x44ff88, 6, 60);
      }
    } else if (nearestEnemy && nearestDist < 250) {
      targetX = nearestEnemy.container.x;
      targetY = nearestEnemy.container.y;
    } else if (nearestBeast && nearestBeastDist < 250) {
      targetX = nearestBeast.container.x;
      targetY = nearestBeast.container.y;
    } else {
      // Follow player at a distance
      const pdx = playerX - this.container.x;
      const pdy = playerY - this.container.y;
      const pd = Math.hypot(pdx, pdy);
      if (pd > 80) {
        targetX = playerX;
        targetY = playerY;
      } else {
        targetX = this.container.x;
        targetY = this.container.y;
      }
    }

    // Move toward target
    if (!attacking) {
      const mdx = targetX - this.container.x;
      const mdy = targetY - this.container.y;
      const md = Math.hypot(mdx, mdy);
      if (md > 5) {
        const step = this.speed * (dt / 1000);
        const nx = this.container.x + (mdx / md) * Math.min(step, md);
        const ny = this.container.y + (mdy / md) * Math.min(step, md);
        const { tx, ty } = this.world.pixelToTile(nx, ny);
        if (this.world.isCreatureWalkable(tx, ty)) {
          this.container.setPosition(nx, ny);
          this.lastDir = dirFromVelocity(mdx, mdy);
          const is3d = has8Directions(this.sprite);
          if (is3d) {
            this.walkTimer += dt;
            const anim = Math.floor(this.walkTimer / 200) % 2 + 1;
            this.sprite.setFrame(anim * DIRS_3D + this.lastDir);
          } else {
            this.sprite.setFlipX(this.lastDir >= 4 && this.lastDir <= 6);
            this.walkTimer += dt;
            const frame = Math.floor(this.walkTimer / 200) % 2 + 1;
            this.sprite.setFrame(frame);
          }
        } else {
          this.sprite.setFrame(has8Directions(this.sprite) ? this.lastDir : 0);
        }
      } else {
        this.sprite.setFrame(has8Directions(this.sprite) ? this.lastDir : 0);
      }
    }

    this.container.setDepth(20 + this.container.y);

    // Update name tag + HP bar
    this.nameTag.setPosition(this.container.x, this.container.y - 30);
    this.hpBar.clear();
    if (this.hp < this.maxHp) {
      const barW = 30;
      const barH = 3;
      const bx = this.container.x - barW / 2;
      const by = this.container.y - 22;
      this.hpBar.fillStyle(0x000000, 0.5);
      this.hpBar.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
      this.hpBar.fillStyle(0x44ff88, 0.9);
      this.hpBar.fillRect(bx, by, barW * (this.hp / this.maxHp), barH);
    }
  }

  takeDamage(amount: number): void {
    this.hp -= amount;
    this.world.vfx?.hitFlash(this.sprite);
    if (this.hp <= 0) {
      this.alive = false;
      this.world.vfx?.deathDissolve(this.container.x, this.container.y, 0x44ff88, 1);
      this.world.audio?.death();
      this.nameTag.destroy();
      this.hpBar.destroy();
      this.container.destroy();
      this.world.store.toast(`${this.entry.name} fell in battle!`);
    }
  }

  destroy(): void {
    this.alive = false;
    this.nameTag.destroy();
    this.hpBar.destroy();
    this.container.destroy();
  }
}

/** A flying stone projectile — sprite-based with rotation and lob arc. */
class Stone {
  sprite: Phaser.GameObjects.Sprite;
  private trail: Phaser.GameObjects.Image;
  private vx: number;
  private vy: number;
  private life: number;
  private damage: number;
  private alive = true;
  private world: WorldLayer;
  private scale: number;
  private lobHeight: number;
  private travelTime = 0;
  private startX: number;
  private startY: number;
  private totalDist: number;

  constructor(world: WorldLayer, x: number, y: number, vx: number, vy: number, damage: number, scale: number, lobHeight: number) {
    this.world = world;
    this.vx = vx;
    this.vy = vy;
    this.life = 4000;
    this.damage = damage;
    this.scale = scale;
    this.lobHeight = lobHeight;
    this.startX = x;
    this.startY = y;
    this.totalDist = Math.hypot(vx, vy) * (this.life / 1000);
    this.trail = world.scene.add
      .image(x, y, "soft-glow")
      .setDisplaySize(20 * scale, 20 * scale)
      .setTint(0x888890)
      .setAlpha(0.3)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(49);
    this.sprite = world.scene.add.sprite(x, y, "stone-proj", 0).setDepth(50).setScale(scale);
  }

  get alive_(): boolean { return this.alive; }

  update(dt: number, playerX: number, playerY: number): { hit: boolean; damage: number } | null {
    if (!this.alive) return null;
    this.life -= dt;
    if (this.life <= 0) {
      this.destroy();
      return null;
    }
    this.travelTime += dt;
    this.sprite.x += this.vx * (dt / 1000);
    this.sprite.y += this.vy * (dt / 1000);
    // Parabolic lob arc: peak at midpoint of travel
    const traveled = Math.hypot(this.sprite.x - this.startX, this.sprite.y - this.startY);
    const progress = Math.min(1, traveled / this.totalDist);
    const arcOffset = Math.sin(progress * Math.PI) * this.lobHeight;
    this.sprite.y -= arcOffset * (dt / 1000) * 2; // apply arc as continuous offset
    // rotate based on velocity
    this.sprite.rotation = Math.atan2(this.vy, this.vx);
    // trail follows
    this.trail.setPosition(this.sprite.x, this.sprite.y);

    const hitRadius = 18 + this.scale * 15;
    const dist = Math.hypot(this.sprite.x - playerX, this.sprite.y - playerY);
    if (dist < hitRadius) {
      this.world.vfx?.sparkBurst(this.sprite.x, this.sprite.y, 0xaaaaaa, Math.floor(8 * this.scale), 60);
      this.world.audio?.stoneImpact();
      this.destroy();
      return { hit: true, damage: this.damage };
    }
    return null;
  }

  destroy(): void {
    this.alive = false;
    this.sprite.destroy();
    this.trail.destroy();
  }
}

/** A fired agent wandering the world. */
class GhostNPC {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private shadow: Phaser.GameObjects.Ellipse;

  info: FiredAgent;
  private dir: Dir = "down";
  private wanderAt = 0;
  private targetX: number;
  private targetY: number;
  private moving = false;
  private world: WorldLayer;

  constructor(world: WorldLayer, info: FiredAgent) {
    this.world = world;
    this.info = info;
    const scene = world.scene;
    const px = info.worldX * TILE_PX + TILE_PX / 2 + world.offset.x;
    const py = info.worldY * TILE_PX + TILE_PX / 2 + world.offset.y;

    this.shadow = scene.add.ellipse(0, 2, 48, 18, 0x000000, 0.2).setDepth(0);
    const texKey = info.appearance ? `char-ghost-${info.id}` : `char-${info.sprite}`;
    if (info.appearance) {
      generateCharTexture(scene, texKey, info.appearance);
      const dirs: Dir[] = ["down", "left", "right", "up"];
      const FPR = 8;
      if (!scene.anims.exists(`${texKey}-work`)) {
        dirs.forEach((dir, row) => {
          const base = row * FPR;
          scene.anims.create({ key: `${texKey}-walk-${dir}`, frames: scene.anims.generateFrameNumbers(texKey, { frames: [base, base+1, base+2, base+3, base+4, base+5] }), frameRate: 10, repeat: -1 });
          const breath = Array(24).fill(base + 6); breath.push(base + 7); breath.push(base + 6);
          scene.anims.create({ key: `${texKey}-idle-${dir}`, frames: scene.anims.generateFrameNumbers(texKey, { frames: breath }), frameRate: 10, repeat: -1, repeatDelay: Math.random() * 2 });
        });
        scene.anims.create({ key: `${texKey}-work`, frames: scene.anims.generateFrameNumbers(texKey, { frames: [6, 7] }), frameRate: 2.5, repeat: -1 });
      }
    }
    this.sprite = scene.add.sprite(0, 0, texKey, 0).setOrigin(0.5, 1).setScale(1).setDepth(5);
    this.sprite.setTint(0x8888aa);

    this.label = scene.add
      .text(0, -108, info.name, {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "16px",
        color: "#aaaacc",
        stroke: "#1a1a22",
        strokeThickness: 3,
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.7)
      .setDepth(5);

    this.container = scene.add.container(px, py, [this.shadow, this.sprite, this.label]);
    this.targetX = px;
    this.targetY = py;
    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on("pointerdown", () => world.onGhostClick(this.info.id));
  }

  update(time: number, dt: number): void {
    const c = this.info.appearance ? `char-ghost-${this.info.id}` : `char-${this.info.sprite}`;

    if (!this.moving && time > this.wanderAt) {
      const range = 6;
      for (let tries = 0; tries < 10; tries++) {
        const dx = Math.floor((Math.random() - 0.5) * range * 2);
        const dy = Math.floor((Math.random() - 0.5) * range * 2);
        const tx = Math.floor((this.container.x - this.world.offset.x) / TILE_PX) + dx;
        const ty = Math.floor((this.container.y - this.world.offset.y) / TILE_PX) + dy;
        if (this.world.isCreatureWalkable(tx, ty)) {
          this.targetX = tx * TILE_PX + TILE_PX / 2 + this.world.offset.x;
          this.targetY = ty * TILE_PX + TILE_PX / 2 + this.world.offset.y;
          this.moving = true;
          break;
        }
      }
      this.wanderAt = time + 3000 + Math.random() * 8000;
    }

    if (this.moving) {
      const dx = this.targetX - this.container.x;
      const dy = this.targetY - this.container.y;
      const d = Math.hypot(dx, dy);
      const speed = 80;
      const step = speed * (dt / 1000);
      if (d <= step) {
        this.container.setPosition(this.targetX, this.targetY);
        this.moving = false;
        this.play(`${c}-idle-${this.dir}`);
      } else {
        this.container.x += (dx / d) * step;
        this.container.y += (dy / d) * step;
        this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
        this.play(`${c}-walk-${this.dir}`);
      }
    } else {
      this.play(`${c}-idle-${this.dir}`);
    }

    this.container.setDepth(10 + this.container.y);
  }

  private play(key: string): void {
    if (this.sprite.anims.currentAnim?.key !== key || !this.sprite.anims.isPlaying) {
      this.sprite.play(key, true);
    }
  }

  destroy(): void {
    this.container.destroy();
  }
}

/**
 * Manages the infinite procedural world outside the office.
 * Renders chunks, handles world-tile collision, and spawns fired agent ghosts.
 * Integrated into OfficeScene — no scene transition needed.
 */
export class WorldLayer {
  scene: Phaser.Scene;
  store: Store;
  private net: Net;
  offset: WorldOffset;
  private officeW: number;
  private officeH: number;
  /** Active world theme (null = HQ/default). Set from registry on init. */
  worldTheme: WorldTheme | null = null;

  vfx: VFXManager;
  audio: AudioSystem;
  lighting: LightingSystem;
  hud: HUDSystem;

  private chunks = new Map<string, Chunk>();
  private chunkGraphics = new Map<string, Phaser.GameObjects.Container>();
  private chunkLights = new Map<string, LightSource[]>();
  private ghosts = new Map<string, GhostNPC>();

  // --- Cached downscaled textures (avoids per-tile canvas creation) ---
  private downscaledTexCache = new Map<string, HTMLCanvasElement>();

  // --- Web Worker for background chunk generation ---
  private worker: Worker | null = null;
  private pendingChunks = new Map<string, Chunk>();
  private workerRequested = new Set<string>();
  private doorPreloaded = false;
  private lastChunkCX = Number.NaN;
  private lastChunkCY = Number.NaN;
  private lastChunkVX = 0;
  private lastChunkVY = 0;

  // --- Chunk rendering ---
  private renderingQueue: RenderJob[] = [];

  // --- Deferred IndexedDB saves ---
  private pendingSaves: { texKey: string; ss: number; canvas: HTMLCanvasElement; tier: string }[] = [];
  private saveTimerId: ReturnType<typeof setTimeout> | null = null;
  private suppressSaves = false;

  private ghostDialog!: HintTag;
  private recruitedHint!: Phaser.GameObjects.Text;
  private damageFlash!: Phaser.GameObjects.Rectangle;
  creatures: Creature[] = [];
  beasts: LegendaryBeast[] = [];
  slugs: Slug[] = [];
  private stones: Stone[] = [];
  private friendlies: FriendlyCreature[] = [];
  private dogs: Dog[] = [];
  private fetchBalls: FetchBall[] = [];
  private leprechauns: Leprechaun[] = [];
  factions: FactionManager;
  private hp = MAX_HP;
  private currentAmbientBiome: string | null = null;
  private tennisChunks = new Set<string>();
  private lastStoneTime = 0;
  private lastSpawnTime = 0;
  private lastBeastTime = 0;
  private lastFriendlySpawnTime = 0;
  private lastSlugSpawnTime = 0;
  private lastDogSpawnTime = 0;
  private lastLeprechaunSpawnTime = 0;

  // --- inventory ---
  inventory = new Inventory();

  // --- golf state ---
  /** Speedrun timer: timestamp when golf club was first picked up (null = not started). */
  speedrunStartTime: number | null = null;
  private golfBall: Phaser.GameObjects.Image | null = null;
  private golfBallVx = 0;
  private golfBallVy = 0;
  private golfBallActive = false;
  private golfLastClub: string | null = null;
  private golfHint!: HintTag;
  private golfPowerBar!: Phaser.GameObjects.Graphics;
  private golfPower = 0; // 0..1 oscillating
  private golfPowerDir = 1; // direction of oscillation
  private golfPowerActive = false; // true when charging (near ball with club)
  private golfHolesSunk = 0;
  private golfStrokes = 0; // strokes on current hole
  private golfTotalStrokes = 0; // total strokes across all holes
  private golfPar = 0; // par for current hole (0 = not yet computed)
  private golfTotalPar = 0; // total par across all holes played
  private golfFlagCacheKey = "";
  private golfFlagCache: { flagX: number; flagY: number; foundFlag: boolean } | null = null;

  // --- tennis state ---
  private tennisBall: Phaser.GameObjects.Image | null = null;
  private tennisBallVx = 0;
  private tennisBallVy = 0;
  private tennisBallActive = false;
  private tennisHint!: HintTag;
  private tennisPowerBar!: Phaser.GameObjects.Graphics;
  private tennisPower = 0;
  private tennisPowerDir = 1;
  private tennisPowerActive = false;
  private tennisScore = 0;
  private tennisRallies = 0;
  private tennisWallCacheKey = "";
  private tennisWallCache: { wallX: number; wallY: number; foundWall: boolean } | null = null;

  // --- axe / leprechaun / big tree state ---
  private axeHint!: HintTag;
  private bigTreesChopped = 0;

  // --- weapon / combat state ---
  private weapon: WeaponType | null = null;
  private weaponCooldown = 0;
  private weaponCooldownMax = 0;
  private weaponDamage = 0;
  private weaponCooldownBar!: Phaser.GameObjects.Graphics;
  private lastNoWeaponToast = 0;
  private voidShards = 0;

  // --- nemesis registry ---
  nemesis = new NemesisRegistry();
  private capturedRoster: NemesisEntry[] = [];
  private captureHint!: HintTag;
  private deployedAllies: DeployedAlly[] = [];
  private lastNemesisSave = 0;
  private nemesisPanel: HTMLDivElement | null = null;

  // --- arrow projectile (crystal bow) ---
  private arrow: Phaser.GameObjects.Image | null = null;
  private arrowVx = 0;
  private arrowVy = 0;
  private arrowDamage = 0;
  private arrowActive = false;
  private arrowTrail: Phaser.GameObjects.Image | null = null;

  // --- flower picking state ---
  private flowers = 0;
  private flowerHint!: HintTag;

  // --- dog fetch state ---
  private fetchHint!: HintTag;

  // --- leprechaun NPC state ---
  private lepHint!: HintTag;

  // --- cabin building state ---
  private buildHint!: HintTag;
  private cabinBuilt = false;
  private cabinTileX = -1;
  private cabinTileY = -1;

  // --- wife NPC + fishing state ---
  private wife: Wife | null = null;
  private fishingLine: FishingLine | null = null;
  private fishHint!: HintTag;
  private fishCaught = 0;
  private campfireSprite: Phaser.GameObjects.Sprite | null = null;

  // --- leprechaun dark twist state ---
  private lepTradesDone = 0;
  private darkTwistTriggered = false;
  private darkTwistPhase = 0; // 0=not started, 1=lep appears, 2=monologue, 3=wife fades, 4=rift opens, 5=complete
  private darkTwistTimer = 0;
  private darkLepContainer: Phaser.GameObjects.Container | null = null;
  private darkLepSprite: Phaser.GameObjects.Sprite | null = null;
  private darkLepSpeech: Phaser.GameObjects.Text | null = null;
  private darkRiftGfx: Phaser.GameObjects.GameObject | null = null;

  /** Current player HP (read-only access for achievement checks). */
  get playerHp(): number { return this.hp; }
  /** Cabin position for wife NPC spawning (Phase 8). */
  get cabinPos(): { x: number; y: number } | null {
    return this.cabinBuilt ? { x: this.cabinTileX, y: this.cabinTileY } : null;
  }
  /** Clear death state — called by scene after teleport completes. */
  clearDeath(): void { this.isDying = false; }
  private officeGrid: Grid | null = null;
  private invulnUntil = 0;
  private isDying = false;

  constructor(scene: Phaser.Scene, store: Store, net: Net, officeW: number, officeH: number) {
    this.scene = scene;
    this.store = store;
    this.net = net;
    this.officeW = officeW;
    this.officeH = officeH;
    // world tiles start just below the office
    this.offset = { x: 0, y: officeH };
    // Load world theme from registry (set by BootScene if world-theme.json exists)
    this.worldTheme = scene.registry.get("worldTheme") ?? null;

    // Initialize visual upgrade systems
    this.vfx = new VFXManager(scene);
    this.audio = new AudioSystem();
    this.lighting = new LightingSystem(scene);
    this.hud = new HUDSystem(scene);

    // Initialize faction conflict system
    this.factions = new FactionManager(this);

    // Load persisted nemesis/roster data
    this.loadNemesis();

    this.ghostDialog = createHintTag(scene);

    this.recruitedHint = scene.add
      .text(0, 0, "", {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "16px",
        color: "#4cb866",
        stroke: "#1a1a22",
        strokeThickness: 3,
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.8)
      .setDepth(950)
      .setVisible(false);

    // damage flash overlay — red tint on hit
    this.damageFlash = scene.add
      .rectangle(0, 0, scene.scale.width, scene.scale.height, 0xff0000, 0)
      .setOrigin(0, 0)
      .setDepth(950)
      .setScrollFactor(0);

    // golf interaction hint
    this.golfHint = createHintTag(scene);

    // golf power bar — oscillating charge bar above player's head
    this.golfPowerBar = scene.add.graphics().setDepth(410).setVisible(false);

    // tennis interaction hint
    this.tennisHint = createHintTag(scene);

    // tennis power bar
    this.tennisPowerBar = scene.add.graphics().setDepth(410).setVisible(false);

    // flower picking hint
    this.flowerHint = createHintTag(scene);

    // axe / leprechaun / big tree interaction hint
    this.axeHint = createHintTag(scene);

    // fetch / dog interaction hint
    this.fetchHint = createHintTag(scene);

    // leprechaun NPC interaction hint
    this.lepHint = createHintTag(scene);

    // cabin building hint
    this.buildHint = createHintTag(scene);

    // fishing hint
    this.fishHint = createHintTag(scene);

    // weapon cooldown bar — shows above player while on cooldown
    this.weaponCooldownBar = scene.add.graphics().setDepth(410).setVisible(false);

    // capture hint — shows above weakened creatures
    this.captureHint = createHintTag(scene);

    // Spawn the background worker for chunk generation
    try {
      this.worker = new WorldgenWorker();
      this.worker.onmessage = (e: MessageEvent) => {
        const { cx, cy, biome, tiles } = e.data;
        const key = `${cx},${cy}`;
        const chunk: Chunk = { cx, cy, biome, tiles };
        // Store in pendingChunks — loadChunk will cache globally and apply overrides
        this.pendingChunks.set(key, chunk);
        this.workerRequested.delete(key);
      };
    } catch {
      this.worker = null;
    }

    // Clean up on scene shutdown (restart) — terminates worker, destroys
    // lights/vfx/audio/hud, and clears per-instance chunk state.
    this.scene.events.once("shutdown", () => this.destroy());
  }

  /** Public read-only access to owned weapons (for scene snapshot). */
  get ownedWeaponsList(): string[] { return this.inventory.getOwnedWeapons(); }
  /** Public read-only access to current weapon (for scene snapshot). */
  get currentWeapon(): string | null { return this.weapon; }

  /** Get hostility level at a pixel position (0–5). */
  getHostilityAt(px: number, py: number): number {
    if (!this.isOutside(px, py)) return 0;
    const { tx, ty } = this.pixelToTile(px, py);
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    return hostilityAt(cx, cy, this.worldTheme?.worldgen?.hostilityThresholds);
  }

  /** Chunk distance from the office origin (0,0). */
  chunkDistance(px: number, py: number): number {
    if (!this.isOutside(px, py)) return 0;
    const { tx, ty } = this.pixelToTile(px, py);
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    return Math.hypot(cx, cy);
  }

  /** Whether the player is outside the office map bounds (in the world). */
  isOutside(playerX: number, playerY: number): boolean {
    return playerY >= this.officeH || playerX < 0 || playerX >= this.officeW;
  }

  /** Gradual darkness factor (0 = inside office, 1 = full darkness).
   *  Ramps up over ~25 tiles from the office edge so night fades in smoothly.
   *  Uses rectangular distance so the factor starts as soon as the player
   *  crosses any boundary (not a circular approximation). */
  distanceFactor(playerX: number, playerY: number): number {
    const dx = playerX < 0 ? -playerX : playerX > this.officeW ? playerX - this.officeW : 0;
    const dy = playerY < 0 ? -playerY : playerY > this.officeH ? playerY - this.officeH : 0;
    const distOutside = Math.hypot(dx, dy);
    const rampPx = 250 * TILE_PX;
    return Math.min(1, distOutside / rampPx);
  }

  /** Convert world pixels to world tile coordinates. */
  pixelToTile(px: number, py: number): { tx: number; ty: number } {
    return {
      tx: Math.floor((px - this.offset.x) / TILE_PX),
      ty: Math.floor((py - this.offset.y) / TILE_PX),
    };
  }

  /** Get the tile type at world tile coordinates. Generates the chunk if needed. */
  private getTileAt(worldTileX: number, worldTileY: number): number {
    if (worldTileY < 0) return TILE.WALL;
    const cx = Math.floor(worldTileX / CHUNK_SIZE);
    const cy = Math.floor(worldTileY / CHUNK_SIZE);
    const key = `${cx},${cy}`;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      this.loadChunk(cx, cy);
      chunk = this.chunks.get(key);
      if (!chunk) return TILE.WALL;
    }
    const localX = ((worldTileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localY = ((worldTileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.tiles[localY * CHUNK_SIZE + localX];
  }

  /** Get the tile type at world tile coordinates without generating chunks.
   *  Returns -1 if the chunk isn't loaded yet. Use for per-frame scans to avoid
   *  mid-frame chunk generation spikes. */
  private getTileAtLoaded(worldTileX: number, worldTileY: number): number {
    if (worldTileY < 0) return TILE.WALL;
    const cx = Math.floor(worldTileX / CHUNK_SIZE);
    const cy = Math.floor(worldTileY / CHUNK_SIZE);
    const key = `${cx},${cy}`;
    const chunk = this.chunks.get(key);
    if (!chunk) return -1;
    const localX = ((worldTileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localY = ((worldTileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.tiles[localY * CHUNK_SIZE + localX];
  }

  /** Set the tile type at world tile coordinates and re-render the chunk. */
  private setTileAt(worldTileX: number, worldTileY: number, newTile: number): void {
    const cx = Math.floor(worldTileX / CHUNK_SIZE);
    const cy = Math.floor(worldTileY / CHUNK_SIZE);
    const key = `${cx},${cy}`;
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    const localX = ((worldTileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localY = ((worldTileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const tileIndex = localY * CHUNK_SIZE + localX;
    chunk.tiles[tileIndex] = newTile;
    // Persist the override via the server
    this.net.send({ type: "tile_update", cx, cy, tileIndex, tile: newTile });
    // Also track locally in the store
    if (!this.store.chunkOverrides[key]) this.store.chunkOverrides[key] = {};
    this.store.chunkOverrides[key][tileIndex] = newTile;
    // Invalidate cached canvas texture so renderChunk redraws with the new tile
    this.invalidateChunkTexture(cx, cy);
    // Keep old container visible while re-rendering to avoid flicker
    const oldContainer = this.chunkGraphics.get(key);
    this.chunkGraphics.delete(key);
    this.removeChunkLights(key);
    this.renderChunk(chunk);
    // Flush the render job immediately so the new chunk is fully painted
    this.processRenderJobsNow();
    // Now destroy the old container after the new one is ready
    if (oldContainer) {
      oldContainer.destroy(true);
    }
  }

  /** Apply a tile update received from another player via the server. */
  applyRemoteTileUpdate(cx: number, cy: number, tileIndex: number, tile: number): void {
    const key = `${cx},${cy}`;
    // Track in local store
    if (!this.store.chunkOverrides[key]) this.store.chunkOverrides[key] = {};
    this.store.chunkOverrides[key][tileIndex] = tile;
    // If the chunk is currently loaded, apply the override and re-render
    const chunk = this.chunks.get(key);
    if (chunk) {
      chunk.tiles[tileIndex] = tile;
      this.invalidateChunkTexture(cx, cy);
      const oldContainer = this.chunkGraphics.get(key);
      if (oldContainer) {
        oldContainer.destroy(true);
        this.chunkGraphics.delete(key);
      }
      this.removeChunkLights(key);
      this.renderChunk(chunk);
    }
  }

  /** Check if a world tile is walkable. Generates the chunk if needed. */
  isTileWalkable(worldTileX: number, worldTileY: number): boolean {
    if (worldTileY < 0) return false;
    const cx = Math.floor(worldTileX / CHUNK_SIZE);
    const cy = Math.floor(worldTileY / CHUNK_SIZE);
    const key = `${cx},${cy}`;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      this.loadChunk(cx, cy);
      chunk = this.chunks.get(key);
      if (!chunk) return false;
    }
    const localX = ((worldTileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localY = ((worldTileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return isWalkable(chunk.tiles[localY * CHUNK_SIZE + localX]);
  }

  /** Check if a world tile is walkable without generating chunks.
   *  Returns true (optimistic) for pending/worker-requested chunks to avoid invisible walls.
   *  Only returns false for loaded chunks that are actually non-walkable, or tiles above the map. */
  isTileWalkableLoaded(worldTileX: number, worldTileY: number): boolean {
    if (worldTileY < 0) return false;
    const cx = Math.floor(worldTileX / CHUNK_SIZE);
    const cy = Math.floor(worldTileY / CHUNK_SIZE);
    const key = `${cx},${cy}`;
    const chunk = this.chunks.get(key);
    if (!chunk) {
      // Chunk not loaded yet — if worker is generating it, be optimistic
      if (this.pendingChunks.has(key) || this.workerRequested.has(key)) return true;
      return false;
    }
    const localX = ((worldTileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localY = ((worldTileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return isWalkable(chunk.tiles[localY * CHUNK_SIZE + localX]);
  }

  /** Check if a world tile is walkable for creatures — excludes tiles within 4 of a tennis court. */
  isCreatureWalkable(worldTileX: number, worldTileY: number): boolean {
    if (!this.isTileWalkableLoaded(worldTileX, worldTileY)) return false;
    // Fast path: if no nearby chunks contain tennis tiles, skip the 81-tile scan
    const minCX = Math.floor((worldTileX - 4) / CHUNK_SIZE);
    const maxCX = Math.floor((worldTileX + 4) / CHUNK_SIZE);
    const minCY = Math.floor((worldTileY - 4) / CHUNK_SIZE);
    const maxCY = Math.floor((worldTileY + 4) / CHUNK_SIZE);
    let hasTennis = false;
    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        if (this.tennisChunks.has(`${cx},${cy}`)) { hasTennis = true; break; }
      }
      if (hasTennis) break;
    }
    if (!hasTennis) return true;
    // scan 4-tile radius for any tennis court tiles
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const cx = Math.floor((worldTileX + dx) / CHUNK_SIZE);
        const cy = Math.floor((worldTileY + dy) / CHUNK_SIZE);
        const key = `${cx},${cy}`;
        const chunk = this.chunks.get(key);
        if (!chunk) continue;
        const lx = (((worldTileX + dx) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const ly = (((worldTileY + dy) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const t = chunk.tiles[ly * CHUNK_SIZE + lx];
        if (t === TILE.TENNIS_COURT || t === TILE.TENNIS_NET || t === TILE.TENNIS_WALL ||
            t === TILE.TENNIS_RACKET || t === TILE.TENNIS_BALL ||
            t === TILE.LEPRECHAUN) {
          return false;
        }
      }
    }
    return true;
  }

  /** Set the office walkability grid so world collision can check office tiles. */
  setOfficeGrid(grid: Grid): void {
    this.officeGrid = grid;
  }

  /** Instantly restore player HP to full (fridge snack break). */
  healFull(): void {
    this.hp = MAX_HP;
    this.hud.setHealth(this.hp, MAX_HP);
  }

  /** Heal player by a specific amount (capped at max). */
  heal(amount: number): void {
    if (this.hp < MAX_HP) {
      this.hp = Math.min(MAX_HP, this.hp + amount);
      this.hud.setHealth(this.hp, MAX_HP);
    }
  }

  /** Get speed multiplier at a pixel position (1 = normal, <1 = slow). */
  getTileSpeedAt(px: number, py: number): number {
    if (!this.isOutside(px, py)) return 1;
    const { tx, ty } = this.pixelToTile(px, py);
    if (ty < 0) return 1;
    const tile = this.getTileAtLoaded(tx, ty);
    if (tile < 0) return 1;
    return tileSpeed(tile);
  }

  private static _walkChecks = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];

  /** Check if the player can walk to a pixel position (world collision). */
  canWalk(px: number, py: number): boolean {
    const halfW = 18;
    const checks = WorldLayer._walkChecks;
    checks[0].x = px - halfW; checks[0].y = py - 2;
    checks[1].x = px + halfW; checks[1].y = py - 2;
    checks[2].x = px; checks[2].y = py - 14;
    checks[3].x = px; checks[3].y = py + 8;
    for (const p of checks) {
      const { tx, ty } = this.pixelToTile(p.x, p.y);
      if (ty < 0) {
        const otx = Math.floor(p.x / TILE_PX);
        const oty = Math.floor(p.y / TILE_PX);
        if (this.officeGrid?.ok(otx, oty)) continue;
        return false;
      }
      if (!this.isTileWalkableLoaded(tx, ty)) {
        const cx = Math.floor(tx / CHUNK_SIZE);
        const cy = Math.floor(ty / CHUNK_SIZE);
        const key = `${cx},${cy}`;
        if (this.chunks.has(key)) return false; // chunk loaded → tile genuinely blocked
        this.requestChunk(cx, cy);
        continue; // chunk not loaded yet → optimistic
      }
    }
    return true;
  }

  /** If the player is stuck inside a non-walkable tile (e.g. chunk loaded
   *  after player walked into it), find the nearest walkable tile and
   *  return the corrected pixel position. Returns null if no rescue needed. */
  rescuePlayer(px: number, py: number): { x: number; y: number } | null {
    // Only rescue if the player is truly stuck — i.e. they can't move in
    // ANY cardinal direction.  This happens when a chunk loads under the
    // player after they walked in optimistically and they're surrounded by
    // non-walkable tiles.  If they can still move in some direction, let
    // normal collision handle it — teleporting is jarring.
    const { tx, ty } = this.pixelToTile(px, py);
    if (ty < 0) return null;
    // Check if the player can move in any cardinal direction
    const nudge = TILE_PX * 0.5;
    if (this.canWalk(px + nudge, py)) return null;
    if (this.canWalk(px - nudge, py)) return null;
    if (this.canWalk(px, py + nudge)) return null;
    if (this.canWalk(px, py - nudge)) return null;
    // Truly stuck — find nearest walkable tile
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    if (!this.chunks.has(`${cx},${cy}`)) return null; // chunk not loaded → not stuck
    for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring only
          if (this.isTileWalkableLoaded(tx + dx, ty + dy)) {
            return this.worldTileToPixel(tx + dx, ty + dy);
          }
        }
      }
    }
    return null;
  }

  /** Build a local walkability grid for outdoor A* pathfinding.
   *  Scans a radius×radius tile window around the player pixel position.
   *  Unloaded chunks are treated as walkable (optimistic) to avoid blocking. */
  buildLocalWalkGrid(px: number, py: number, radius: number): Grid {
    const { tx: centerTx, ty: centerTy } = this.pixelToTile(px, py);
    const size = radius * 2 + 1;
    const walkable: boolean[][] = [];
    for (let y = 0; y < size; y++) {
      walkable[y] = [];
      for (let x = 0; x < size; x++) {
        const wtx = centerTx - radius + x;
        const wty = centerTy - radius + y;
        walkable[y][x] = this.isTileWalkableLoaded(wtx, wty);
      }
    }
    return new Grid(size, size, walkable);
  }

  /** Convert a world tile coordinate back to pixel center, accounting for offset. */
  worldTileToPixel(wtx: number, wty: number): { x: number; y: number } {
    return {
      x: wtx * TILE_PX + TILE_PX / 2 + this.offset.x,
      y: wty * TILE_PX + TILE_PX / 2 + this.offset.y,
    };
  }

  /** Load/unload chunks around the player. Loads at most MAX_CHUNKS_PER_FRAME per frame to avoid spikes.
   *  When vx/vy are provided, chunks in the movement direction are prioritised (predictive preloading). */
  updateChunks(playerX: number, playerY: number, vx = 0, vy = 0): void {
    const { tx, ty } = this.pixelToTile(playerX, playerY);
    const pcx = Math.floor(tx / CHUNK_SIZE);
    const pcy = Math.floor(ty / CHUNK_SIZE);

    // Skip the expensive O(n²) scan + sort if the player hasn't crossed a chunk
    // boundary and velocity direction hasn't changed.  We still run processRenderJobs
    // and unload checks below every frame.
    const vlen = Math.hypot(vx, vy);
    const nvx = vlen > 0 ? vx / vlen : 0;
    const nvy = vlen > 0 ? vy / vlen : 0;
    const sameChunk = pcx === this.lastChunkCX && pcy === this.lastChunkCY;
    const sameDir = nvx === this.lastChunkVX && nvy === this.lastChunkVY;

    let needed: { cx: number; cy: number; priority: number }[] = [];

    if (!sameChunk || !sameDir) {
      this.lastChunkCX = pcx;
      this.lastChunkCY = pcy;
      this.lastChunkVX = nvx;
      this.lastChunkVY = nvy;

      // Collect needed chunks; sort key combines distance with directional bias
      // so chunks the player is walking toward load before equally-distant ones
      // behind/orthogonal.  The bias term (nvx*dx + nvy*dy) ranges -LOAD_RADIUS..+LOAD_RADIUS;
      // we scale it to compete with distance (0..LOAD_RADIUS²).
      const BIAS_WEIGHT = LOAD_RADIUS;
      for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy++) {
        for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
          const ncy = pcy + dy;
          if (ncy < 0) continue;
          const ncx = pcx + dx;
          const key = `${ncx},${ncy}`;
          if (this.chunks.has(key)) continue;
          const dist = dx * dx + dy * dy;
          const dirAlign = nvx * dx + nvy * dy;
          const priority = dist - dirAlign * BIAS_WEIGHT;
          needed.push({ cx: ncx, cy: ncy, priority });
        }
      }
      needed.sort((a, b) => a.priority - b.priority);

      // Request all needed chunks from the worker first (non-blocking)
      for (const n of needed) this.requestChunk(n.cx, n.cy);

      // Pre-request chunks one ring beyond LOAD_RADIUS so the worker has a head start.
      // These are NOT loaded — just sent to the worker so tile data is ready by the time
      // the player moves close enough to need them.
      const preRadius = LOAD_RADIUS + 1;
      for (let dy = -preRadius; dy <= preRadius; dy++) {
        for (let dx = -preRadius; dx <= preRadius; dx++) {
          if (Math.abs(dx) <= LOAD_RADIUS && Math.abs(dy) <= LOAD_RADIUS) continue; // already requested above
          const ncy = pcy + dy;
          if (ncy < 0) continue;
          const ncx = pcx + dx;
          this.requestChunk(ncx, ncy);
        }
      }
    } else {
      // Same chunk + direction — just re-scan for any newly needed chunks
      // without the full sort (worker requests are idempotent)
      for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy++) {
        for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
          const ncy = pcy + dy;
          if (ncy < 0) continue;
          const ncx = pcx + dx;
          const key = `${ncx},${ncy}`;
          if (this.chunks.has(key)) continue;
          needed.push({ cx: ncx, cy: ncy, priority: 0 });
        }
      }
    }

    // Continue painting any in-progress chunk renders (time-sliced across frames)
    this.processRenderJobs();

    // Load only chunks that are ready (pre-generated by worker) or fall back
    // to synchronous generation.  This avoids CPU spikes during traversal —
    // if the worker hasn't finished a chunk yet, we skip it this frame and
    // pick it up next frame when it's ready.
    let loaded = 0;
    for (const n of needed) {
      if (loaded >= MAX_CHUNKS_PER_FRAME) break;
      const key = `${n.cx},${n.cy}`;
      const cacheKey = `${this.store.worldSeed}:${key}`;
      if (this.pendingChunks.has(key) || globalChunkCache.has(cacheKey)) {
        // Worker pre-generated or globally cached — render only (no CPU spike)
        this.loadChunk(n.cx, n.cy);
        loaded++;
      } else if (!this.workerRequested.has(key) && !this.worker) {
        // No worker — fall back to synchronous generation
        this.loadChunk(n.cx, n.cy);
        loaded++;
      }
      // else: worker is still generating — skip this frame, try again next frame
    }
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - pcx) > UNLOAD_RADIUS || Math.abs(chunk.cy - pcy) > UNLOAD_RADIUS) {
        this.removeChunkLights(key);
        this.chunkGraphics.get(key)?.destroy();
        this.chunkGraphics.delete(key);
        this.invalidateChunkTexture(chunk.cx, chunk.cy);
        this.chunks.delete(key);
        this.tennisChunks.delete(key);
      }
    }

    // Drop any render jobs for chunks that are now out of range
    this.renderingQueue = this.renderingQueue.filter(job => {
      const dx = Math.abs(job.chunk.cx - pcx);
      const dy = Math.abs(job.chunk.cy - pcy);
      if (dx > UNLOAD_RADIUS || dy > UNLOAD_RADIUS) {
        this.scene.textures.remove(job.texKey);
        job.container.destroy();
        return false;
      }
      return true;
    });
  }

  /** Returns the list of chunks needed around the door exit, sorted by distance. */
  getDoorChunkList(): { cx: number; cy: number }[] {
    const doorX = this.officeW / 2;
    const doorY = this.officeH + TILE_PX;
    const { tx, ty } = this.pixelToTile(doorX, doorY);
    const pcx = Math.floor(tx / CHUNK_SIZE);
    const pcy = Math.floor(ty / CHUNK_SIZE);

    const needed: { cx: number; cy: number; dist: number }[] = [];
    for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy++) {
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
        const ncy = pcy + dy;
        if (ncy < 0) continue;
        const ncx = pcx + dx;
        const key = `${ncx},${ncy}`;
        if (this.chunks.has(key)) continue;
        needed.push({ cx: ncx, cy: ncy, dist: dx * dx + dy * dy });
      }
    }
    needed.sort((a, b) => a.dist - b.dist);
    return needed.map((n) => ({ cx: n.cx, cy: n.cy }));
  }

  /** Load a single chunk by coordinates. Safe to call incrementally.
   *  Prefers worker-pre-generated tiles (render-only, no CPU spike) but falls
   *  back to synchronous generation if the worker hasn't delivered yet. */
  loadSingleChunk(cx: number, cy: number): void {
    this.loadChunk(cx, cy);
  }

  /** Call after all door chunks are loaded to do post-load cleanup. */
  finishDoorPreload(): void {
    this.removeExtraBalls();
  }

  /** Check if any chunk render jobs are still in progress. */
  hasRenderJobs(): boolean {
    return this.renderingQueue.length > 0;
  }

  /** Process all pending render jobs synchronously (flush, ignores time budget).
   *  Suppresses IndexedDB saves — loading-screen chunks are in globalChunkCache
   *  and don't need persistence (which would cause toBlob() jank during gameplay). */
  processRenderJobsNow(): void {
    const prevSuppress = this.suppressSaves;
    this.suppressSaves = true;
    while (this.renderingQueue.length > 0) {
      const prevLen = this.renderingQueue.length;
      this.processRenderJobs();
      if (this.renderingQueue.length === prevLen) break; // no progress — avoid infinite loop
    }
    this.suppressSaves = prevSuppress;
  }

  /** Synchronously preload all chunks around the door exit. Call once after
   *  construction so the player doesn't hit a freeze when first walking outside. */
  preloadDoorChunks(): void {
    const needed = this.getDoorChunkList();
    for (const n of needed) {
      this.loadChunk(n.cx, n.cy);
    }
    // Flush any time-sliced render jobs so all door chunks are fully painted
    // before the boot sequence continues.
    while (this.renderingQueue.length > 0) {
      this.processRenderJobs();
    }
    this.removeExtraBalls();
  }

  private scanTennisTiles(chunk: Chunk): void {
    const key = `${chunk.cx},${chunk.cy}`;
    for (let i = 0; i < chunk.tiles.length; i++) {
      const t = chunk.tiles[i];
      if (t === TILE.TENNIS_COURT || t === TILE.TENNIS_NET || t === TILE.TENNIS_WALL ||
          t === TILE.TENNIS_RACKET || t === TILE.TENNIS_BALL ||
          t === TILE.LEPRECHAUN) {
        this.tennisChunks.add(key);
        return;
      }
    }
  }

  private loadChunk(cx: number, cy: number): void {
    // never generate chunks above the office (cy < 0)
    if (cy < 0) return;
    const key = `${cx},${cy}`;
    if (this.chunks.has(key)) return;

    // Check global cache first — chunk data persists across scene restarts
    const cacheKey = `${this.store.worldSeed}:${key}`;
    const cached = globalChunkCache.get(cacheKey);
    if (cached) {
      // Clone tiles so overrides don't mutate the cached copy
      const chunk: Chunk = { cx, cy, biome: cached.biome, tiles: [...cached.tiles] };
      this.applyChunkOverrides(chunk);
      this.chunks.set(key, chunk);
      this.scanTennisTiles(chunk);
      this.renderChunk(chunk);
      return;
    }

    // Use pre-generated tiles from the worker if available
    const pending = this.pendingChunks.get(key);
    if (pending) {
      this.pendingChunks.delete(key);
      // Cache raw data before overrides (clone so overrides don't mutate the cache)
      globalChunkCache.set(cacheKey, { cx, cy, biome: pending.biome, tiles: [...pending.tiles] });
      this.applyChunkOverrides(pending);
      this.chunks.set(key, pending);
      this.scanTennisTiles(pending);
      this.renderChunk(pending);
      return;
    }

    // Fallback: generate synchronously on the main thread
    const chunk = generateChunk(this.store.worldSeed, cx, cy, this.worldTheme);
    // Cache raw data before overrides (clone so overrides don't mutate the cache)
    globalChunkCache.set(cacheKey, { cx, cy, biome: chunk.biome, tiles: [...chunk.tiles] });
    this.applyChunkOverrides(chunk);
    this.chunks.set(key, chunk);
    this.scanTennisTiles(chunk);
    this.renderChunk(chunk);
  }

  /** Apply persisted tile overrides to a chunk after generation. */
  private applyChunkOverrides(chunk: Chunk): void {
    const key = `${chunk.cx},${chunk.cy}`;
    const overrides = this.store.chunkOverrides[key];
    if (!overrides) return;
    for (const [idx, tile] of Object.entries(overrides)) {
      chunk.tiles[Number(idx)] = tile;
    }
  }

  /** Request background generation of a chunk via the Web Worker.
   *  The result will appear in pendingChunks and be picked up by loadChunk. */
  requestChunk(cx: number, cy: number): void {
    if (cy < 0) return;
    if (!this.worker) return;
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.pendingChunks.has(key) || this.workerRequested.has(key)) return;
    // Skip worker request if already cached globally — loadChunk will use it
    const cacheKey = `${this.store.worldSeed}:${key}`;
    if (globalChunkCache.has(cacheKey)) return;
    this.workerRequested.add(key);
    this.worker.postMessage({ worldSeed: this.store.worldSeed, cx, cy, theme: this.worldTheme });
  }

  /** Request worker generation for door chunks without any canvas rendering.
   *  Called when the player is inside the office so tile data is ready
   *  by the time they walk outside, without blocking the main thread. */
  preloadDoorChunksWorkerOnly(): void {
    if (this.doorPreloaded) return;
    this.doorPreloaded = true;
    const doorX = this.officeW / 2;
    const doorY = this.officeH + TILE_PX;
    const { tx, ty } = this.pixelToTile(doorX, doorY);
    const pcx = Math.floor(tx / CHUNK_SIZE);
    const pcy = Math.floor(ty / CHUNK_SIZE);
    for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy++) {
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
        this.requestChunk(pcx + dx, pcy + dy);
      }
    }
  }

  /** Request worker generation around an arbitrary position (non-blocking). */
  preloadChunksAt(px: number, py: number): void {
    const { tx, ty } = this.pixelToTile(px, py);
    const pcx = Math.floor(tx / CHUNK_SIZE);
    const pcy = Math.floor(ty / CHUNK_SIZE);
    for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy++) {
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
        this.requestChunk(pcx + dx, pcy + dy);
      }
    }
  }

  /** Returns chunks needed around a position, sorted by distance. */
  getChunksAt(px: number, py: number): { cx: number; cy: number }[] {
    const { tx, ty } = this.pixelToTile(px, py);
    const pcx = Math.floor(tx / CHUNK_SIZE);
    const pcy = Math.floor(ty / CHUNK_SIZE);
    const needed: { cx: number; cy: number; dist: number }[] = [];
    for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy++) {
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
        const ncy = pcy + dy;
        if (ncy < 0) continue;
        const ncx = pcx + dx;
        const key = `${ncx},${ncy}`;
        if (this.chunks.has(key)) continue;
        needed.push({ cx: ncx, cy: ncy, dist: dx * dx + dy * dy });
      }
    }
    needed.sort((a, b) => a.dist - b.dist);
    return needed.map((n) => ({ cx: n.cx, cy: n.cy }));
  }

  /** Pre-generate a batch of chunks via the worker. Returns immediately;
   *  results arrive asynchronously in pendingChunks. */
  preGenerateChunks(coords: { cx: number; cy: number }[]): void {
    for (const { cx, cy } of coords) this.requestChunk(cx, cy);
  }

  /** Check whether a chunk's tiles have been pre-generated by the worker. */
  hasPendingChunk(cx: number, cy: number): boolean {
    return this.pendingChunks.has(`${cx},${cy}`);
  }

  /** Wait for all worker-requested chunks to be generated, then load+render them all.
   *  Returns a Promise that resolves when all chunks are loaded and rendered.
   *  Falls back to sync generation after 10s if worker is unresponsive. */
  async waitForChunksAndRender(coords: { cx: number; cy: number }[]): Promise<void> {
    // If no worker, chunks are already sync-generated by loadChunk — just load+render
    if (!this.worker) {
      for (const c of coords) this.loadChunk(c.cx, c.cy);
      this.processRenderJobsNow();
      return;
    }

    // Track how long we've been waiting — fall back to sync after 10s
    const startTime = performance.now();
    const FALLBACK_MS = 10000;

    // Poll until all requested chunks are either pending (worker delivered) or cached
    const checkReady = (): boolean => {
      for (const c of coords) {
        const key = `${c.cx},${c.cy}`;
        const cacheKey = `${this.store.worldSeed}:${key}`;
        if (this.chunks.has(key)) continue; // already loaded
        if (this.pendingChunks.has(key)) continue; // worker delivered, ready to load
        if (globalChunkCache.has(cacheKey)) continue; // globally cached
        if (this.workerRequested.has(key)) {
          // Still generating — if we've waited too long, abandon the worker request
          // and let loadChunk fall back to sync generation
          if (performance.now() - startTime > FALLBACK_MS) {
            this.workerRequested.delete(key);
            continue;
          }
          return false;
        }
        // Not requested, not cached, not pending — request it now
        this.requestChunk(c.cx, c.cy);
        return false;
      }
      return true;
    };

    // Wait with exponential backoff (1ms → 2ms → 4ms → ... max 16ms)
    let delay = 1;
    while (!checkReady()) {
      await new Promise<void>(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 16);
    }

    // All chunks ready — load and render them all now
    for (const c of coords) this.loadChunk(c.cx, c.cy);
    this.processRenderJobsNow();
  }

  /** Preload cached chunk canvas textures from IndexedDB for the given coords.
   *  Each hit is registered as a Phaser texture so renderChunk skips painting.
   *  Returns the number of cache hits. */
  async preloadCachedCanvases(coords: { cx: number; cy: number }[]): Promise<number> {
    const tier = this.worldTheme?.assets?.assetTier ?? "ai";
    const entries = coords.map(c => ({
      texKey: this.chunkTexKey(c.cx, c.cy),
      ssFactor: SS_FACTOR,
      assetTier: tier,
    }));
    const loaded = await preloadChunkCanvases(entries);
    let hits = 0;
    for (const [texKey, img] of loaded) {
      if (this.scene.textures.exists(texKey)) {
        // Already registered (e.g. from a previous scene in same page session)
        continue;
      }
      this.scene.textures.addImage(texKey, img as unknown as HTMLImageElement);
      hits++;
    }
    return hits;
  }

  private removeChunkLights(key: string): void {
    const lights = this.chunkLights.get(key);
    if (lights) {
      for (const light of lights) {
        this.lighting.removeLight(light);
      }
      this.chunkLights.delete(key);
    }
  }

  /** Texture cache key for a chunk's static tile rendering. */
  chunkTexKey(cx: number, cy: number): string {
    return `chunk-rt-v8-${this.store.worldSeed}:${cx},${cy}`;
  }

  /** Remove a cached chunk canvas texture so the next renderChunk redraws it. */
  private invalidateChunkTexture(cx: number, cy: number): void {
    const texKey = this.chunkTexKey(cx, cy);
    if (this.scene.textures.exists(texKey)) {
      this.scene.textures.remove(texKey);
    }
    removeChunkCanvas(texKey, SS_FACTOR, this.worldTheme?.assets?.assetTier ?? "ai");
  }

  private renderChunk(chunk: Chunk): void {
    const key = `${chunk.cx},${chunk.cy}`;
    const chunkPxSize = CHUNK_SIZE * TILE_PX;
    const texKey = this.chunkTexKey(chunk.cx, chunk.cy);
    const container = this.scene.add.container(0, 0).setDepth(-1);
    const ox = chunk.cx * CHUNK_SIZE * TILE_PX + this.offset.x;
    const oy = chunk.cy * CHUNK_SIZE * TILE_PX + this.offset.y;
    const chunkLightList: LightSource[] = [];

    const overlayTextures: Record<number, string> = {
      [TILE.GOLF_CLUB]: "golf-club",
      [TILE.GOLF_BALL]: "golf-ball",
      [TILE.GOLF_BAG]: "golf-bag",
      [TILE.DRIVER]: "golf-club",
      [TILE.IRON_CLUB]: "golf-club",
      [TILE.WEDGE]: "golf-club",
      [TILE.PUTTER]: "golf-club",
      [TILE.BIG_TREE]: "big-tree",
      [TILE.BIG_ROCK]: "big-rock",
      [TILE.PALM_TREE]: "palm-tree",
      [TILE.MYSTIC_TREE]: "mystic-tree",
      [TILE.AXE]: "axe",
      [TILE.LEPRECHAUN]: "leprechaun",
      [TILE.TEE_BOX]: "tee-box",
      [TILE.TENNIS_COURT]: "tennis-court",
      [TILE.TENNIS_WALL]: "tennis-wall",
      [TILE.TENNIS_RACKET]: "tennis-racket",
      [TILE.TENNIS_BALL]: "tennis-ball",
      [TILE.TENNIS_NET]: "tennis-net",
      [TILE.CABIN_WALL]: "cabin-wall",
      [TILE.CABIN_DOOR]: "cabin-door",
      [TILE.CABIN_WINDOW]: "cabin-window",
      [TILE.CABIN_ROOF]: "cabin-roof",
      [TILE.LAKE_SHORE]: "lake-shore",
    };

    const edgeTileColors: Record<number, string> = {
      [TILE.WATER]: "rgba(42,80,110,0.7)",
      [TILE.LAKE]: "rgba(30,60,90,0.7)",
      [TILE.POND]: "rgba(40,70,50,0.6)",
      [TILE.LAVA]: "rgba(30,8,4,0.8)",
      [TILE.ACID]: "rgba(50,80,16,0.6)",
    };

    const SS = SS_FACTOR;
    const ssPxSize = chunkPxSize * SS;
    const ssTilePx = TILE_PX * SS;

    // If canvas texture already exists (cached from a previous visit), skip painting
    // and go straight to creating the display image + dynamic sprites.
    if (this.scene.textures.exists(texKey)) {
      this.finishRenderChunk(chunk, texKey, container, ox, oy, SS, chunkLightList);
      this.chunkGraphics.set(key, container);
      this.chunkLights.set(key, chunkLightList);
      return;
    }

    // Create canvas and start time-sliced rendering
    const canvasTex = this.scene.textures.createCanvas(texKey, ssPxSize, ssPxSize);
    if (!canvasTex) {
      this.chunkGraphics.set(key, container);
      this.chunkLights.set(key, chunkLightList);
      return;
    }
    canvasTex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    const ctx = canvasTex.getContext();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const worldTilesTex = this.scene.textures.exists("world-tiles-theme")
      ? this.scene.textures.get("world-tiles-theme")
      : this.scene.textures.get("world-tiles");

    const job: RenderJob = {
      chunk, texKey, canvasTex, ctx, ssTilePx, SS,
      currentRow: 0,
      overlayTextures, edgeTileColors, worldTilesTex,
      ox, oy, chunkLightList, container,
      useAiTextures: this.worldTheme?.assets?.assetTier !== "procedural",
    };
    this.renderingQueue.push(job);
  }

  /** Paint a single row of a chunk render job. Returns true if job is complete. */
  private paintRenderRow(job: RenderJob): boolean {
    const EDGE_WIDTH = 4;
    const { chunk, ctx, ssTilePx, SS, worldTilesTex, overlayTextures, edgeTileColors } = job;
    const y = job.currentRow;

    const tileToFrame = (tile: number, variant: number): number => {
      if (tile === TILE.WATER || tile === TILE.LAKE) return 21;
      if (tile === TILE.LAKE_SHORE) return TILE.SAND + variant * WORLD_TILE_FRAMES;
      if (tile >= 22) return TILE.GRASS + variant * WORLD_TILE_FRAMES;
      return tile + variant * WORLD_TILE_FRAMES;
    };

    const drawTexToCanvas = (textureKey: string, px: number, py: number, w: number = ssTilePx, h: number = ssTilePx) => {
      const scaledKey = `${textureKey}-ss${SS}`;
      if (SS < 4 && this.scene.textures.exists(scaledKey)) {
        const tex = this.scene.textures.get(scaledKey);
        const fr = tex.get(0);
        if (fr) {
          ctx.drawImage(
            fr.source.image as CanvasImageSource,
            fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight,
            px, py, w, h,
          );
          return;
        }
      }
      if (!this.scene.textures.exists(textureKey)) return;

      // Check the downscaled cache first — avoids recreating temporary canvases per tile
      const cacheKey = `${textureKey}:${w}x${h}`;
      const cached = this.downscaledTexCache.get(cacheKey);
      if (cached) {
        ctx.drawImage(cached, 0, 0, cached.width, cached.height, px, py, w, h);
        return;
      }

      const tex = this.scene.textures.get(textureKey);
      const fr = tex.get(0);
      if (!fr) return;
      const srcW = fr.cutWidth;
      const srcH = fr.cutHeight;
      if (srcW > w * 2 || srcH > h * 2) {
        let curW = srcW;
        let curH = srcH;
        let curCanvas: HTMLCanvasElement | undefined;
        while (curW > w * 2 || curH > h * 2) {
          const nextW = Math.max(w * 2, Math.floor(curW / 2));
          const nextH = Math.max(h * 2, Math.floor(curH / 2));
          const next = document.createElement("canvas");
          next.width = nextW;
          next.height = nextH;
          const nctx = next.getContext("2d")!;
          nctx.imageSmoothingEnabled = true;
          nctx.imageSmoothingQuality = "high";
          if (curCanvas) {
            nctx.drawImage(curCanvas, 0, 0, curW, curH, 0, 0, nextW, nextH);
          } else {
            nctx.drawImage(
              fr.source.image as CanvasImageSource,
              fr.cutX, fr.cutY, srcW, srcH,
              0, 0, nextW, nextH,
            );
          }
          curCanvas = next;
          curW = nextW;
          curH = nextH;
        }
        // Cache the final downscaled canvas
        this.downscaledTexCache.set(cacheKey, curCanvas!);
        ctx.drawImage(curCanvas!, 0, 0, curW, curH, px, py, w, h);
      } else {
        ctx.drawImage(
          fr.source.image as CanvasImageSource,
          fr.cutX, fr.cutY, srcW, srcH,
          px, py, w, h,
        );
      }
    };

    // Pass 1: draw base tiles for row y
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const tile = chunk.tiles[y * CHUNK_SIZE + x];
      const px = x * ssTilePx;
      const py = y * ssTilePx;
      const worldTileX = chunk.cx * CHUNK_SIZE + x;
      const worldTileY = chunk.cy * CHUNK_SIZE + y;
      let h = (worldTileX * 374761393 + worldTileY * 668265263) | 0;
      h = (h ^ (h >>> 13)) | 0;
      const variant = (h & 0x7fffffff) % WORLD_VARIANTS;
      const frame = tileToFrame(tile, variant);

      const aiObjKeyForBase = job.useAiTextures ? AI_OBJECT_TEXTURES[tile] : undefined;
      const aiTextures = job.useAiTextures ? AI_TILE_TEXTURES[tile] : undefined;
      if (aiObjKeyForBase && this.scene.textures.exists(aiObjKeyForBase)) {
        const grassTexs = AI_TILE_TEXTURES[TILE.GRASS];
        if (grassTexs && this.scene.textures.exists(grassTexs[variant % grassTexs.length])) {
          drawTexToCanvas(grassTexs[variant % grassTexs.length], px, py);
        } else {
          const grassFrame = worldTilesTex.get(tileToFrame(TILE.GRASS, variant));
          if (grassFrame) {
            ctx.drawImage(
              grassFrame.source.image as CanvasImageSource,
              grassFrame.cutX, grassFrame.cutY, grassFrame.cutWidth, grassFrame.cutHeight,
              px, py, ssTilePx, ssTilePx,
            );
          }
        }
      } else if (aiTextures && this.scene.textures.exists(aiTextures[variant % aiTextures.length])) {
        drawTexToCanvas(aiTextures[variant % aiTextures.length], px, py);
      } else {
        const fr = worldTilesTex.get(frame);
        if (fr) {
          ctx.drawImage(
            fr.source.image as CanvasImageSource,
            fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight,
            px, py, ssTilePx, ssTilePx,
          );
        }
      }

      if (tile === TILE.TENNIS_BALL || tile === TILE.TENNIS_RACKET || tile === TILE.TENNIS_NET) {
        drawTexToCanvas(resolveItemTex(this.scene, "tennis-court"), px, py);
      }

      const aiObjKey = job.useAiTextures ? (AI_OBJECT_TEXTURES[tile] ?? AI_ITEM_TEXTURES[overlayTextures[tile]]) : undefined;
      const overlayKey = aiObjKey ?? overlayTextures[tile];

      if (tile === TILE.TEE_BOX) {
        const grassTexs = job.useAiTextures ? AI_TILE_TEXTURES[TILE.GRASS] : undefined;
        if (grassTexs && this.scene.textures.exists(grassTexs[variant % grassTexs.length])) {
          drawTexToCanvas(grassTexs[variant % grassTexs.length], px, py);
        } else {
          const grassFrame = worldTilesTex.get(tileToFrame(TILE.GRASS, variant));
          if (grassFrame) {
            ctx.drawImage(
              grassFrame.source.image as CanvasImageSource,
              grassFrame.cutX, grassFrame.cutY, grassFrame.cutWidth, grassFrame.cutHeight,
              px, py, ssTilePx, ssTilePx,
            );
          }
        }
        let teeNeighbors = 0;
        for (let ndy = -1; ndy <= 1; ndy++) {
          for (let ndx = -1; ndx <= 1; ndx++) {
            if (ndx === 0 && ndy === 0) continue;
            const nTile = this.getTileAtLoaded(worldTileX + ndx, worldTileY + ndy);
            if (nTile === TILE.TEE_BOX) teeNeighbors++;
          }
        }
        if (teeNeighbors === 8 && overlayKey && this.scene.textures.exists(overlayKey)) {
          const signSize = ssTilePx * 0.75;
          const signOff = ssTilePx * 0.125;
          drawTexToCanvas(overlayKey, px + signOff, py + signOff, signSize, signSize);
        }
      } else if (overlayKey) {
        if (this.scene.textures.exists(overlayKey)) {
          if (tile === TILE.LEPRECHAUN) {
            drawTexToCanvas(overlayKey, px - ssTilePx / 2, py - ssTilePx / 2, ssTilePx * 2, ssTilePx * 2);
          } else {
            drawTexToCanvas(overlayKey, px, py);
          }
        }
      }
    }

    // Pass 2: edge gradients for row y
    const ssEdge = EDGE_WIDTH * SS;
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const tile = chunk.tiles[y * CHUNK_SIZE + x];
      const edgeColor = edgeTileColors[tile];
      if (!edgeColor) continue;

      const px = x * ssTilePx;
      const py = y * ssTilePx;
      const worldTileX = chunk.cx * CHUNK_SIZE + x;
      const worldTileY = chunk.cy * CHUNK_SIZE + y;

      const nTile = y > 0
        ? chunk.tiles[(y - 1) * CHUNK_SIZE + x]
        : this.getTileAtLoaded(worldTileX, worldTileY - 1);
      const sTile = y < CHUNK_SIZE - 1
        ? chunk.tiles[(y + 1) * CHUNK_SIZE + x]
        : this.getTileAtLoaded(worldTileX, worldTileY + 1);
      const wTile = x > 0
        ? chunk.tiles[y * CHUNK_SIZE + (x - 1)]
        : this.getTileAtLoaded(worldTileX - 1, worldTileY);
      const eTile = x < CHUNK_SIZE - 1
        ? chunk.tiles[y * CHUNK_SIZE + (x + 1)]
        : this.getTileAtLoaded(worldTileX + 1, worldTileY);

      if (nTile >= 0 && nTile !== tile) {
        const grad = ctx.createLinearGradient(0, py, 0, py + ssEdge);
        grad.addColorStop(0, edgeColor);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(px, py, ssTilePx, ssEdge);
      }
      if (sTile >= 0 && sTile !== tile) {
        const grad = ctx.createLinearGradient(0, py + ssTilePx - ssEdge, 0, py + ssTilePx);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, edgeColor);
        ctx.fillStyle = grad;
        ctx.fillRect(px, py + ssTilePx - ssEdge, ssTilePx, ssEdge);
      }
      if (wTile >= 0 && wTile !== tile) {
        const grad = ctx.createLinearGradient(px, 0, px + ssEdge, 0);
        grad.addColorStop(0, edgeColor);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(px, py, ssEdge, ssTilePx);
      }
      if (eTile >= 0 && eTile !== tile) {
        const grad = ctx.createLinearGradient(px + ssTilePx - ssEdge, 0, px + ssTilePx, 0);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, edgeColor);
        ctx.fillStyle = grad;
        ctx.fillRect(px + ssTilePx - ssEdge, py, ssEdge, ssTilePx);
      }
    }

    // Pass 3: color jitter for row y
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const worldTileX = chunk.cx * CHUNK_SIZE + x;
      const worldTileY = chunk.cy * CHUNK_SIZE + y;
      let h2 = (worldTileX * 2246822519 + worldTileY * 3266489917) | 0;
      h2 = (h2 ^ (h2 >>> 16)) | 0;
      const brightness = ((h2 & 0x1f) - 16);
      const px = x * ssTilePx;
      const py = y * ssTilePx;
      ctx.fillStyle = brightness > 0
        ? `rgba(255,255,255,${brightness / 400})`
        : `rgba(0,0,0,${-brightness / 400})`;
      ctx.fillRect(px, py, ssTilePx, ssTilePx);
    }

    job.currentRow++;
    return job.currentRow >= CHUNK_SIZE;
  }

  /** Paint at most 1 render job per frame to avoid stalls. processRenderJobsNow flushes all. */
  private processRenderJobs(): void {
    if (this.renderingQueue.length === 0) return;
    const remaining: RenderJob[] = [];
    let rendered = 0;
    for (const job of this.renderingQueue) {
      // Skip if texture was destroyed (chunk unloaded / scene restart) mid-render
      if (!this.scene.textures.exists(job.texKey)) continue;

      // Only render 1 chunk per frame during gameplay
      if (rendered >= 1) {
        remaining.push(job);
        continue;
      }

      // Paint all rows for this chunk in one frame
      while (job.currentRow < CHUNK_SIZE) {
        const done = this.paintRenderRow(job);
        if (done) break;
      }

      if (job.currentRow >= CHUNK_SIZE) {
        // All rows painted — finalize canvas and create display objects
        try {
          job.canvasTex.refresh();
        } catch {
          // Texture source was destroyed (chunk unloaded / scene restart)
          continue;
        }
        this.finishRenderChunk(job.chunk, job.texKey, job.container, job.ox, job.oy, job.SS, job.chunkLightList);
        const key = `${job.chunk.cx},${job.chunk.cy}`;
        this.chunkGraphics.set(key, job.container);
        this.chunkLights.set(key, job.chunkLightList);
        rendered++;

        // Queue canvas for deferred batch save to IndexedDB.
        // Skipped during loading screen (suppressSaves) — those chunks are
        // in globalChunkCache and don't need persistence, which avoids
        // toBlob() jank during the first ~15s of gameplay.
        if (!this.suppressSaves) {
          const tier = this.worldTheme?.assets?.assetTier ?? "ai";
          this.pendingSaves.push({ texKey: job.texKey, ss: job.SS, canvas: job.canvasTex.getSourceImage() as HTMLCanvasElement, tier });
          this.scheduleSaveFlush();
        }
      } else {
        remaining.push(job);
      }
    }
    this.renderingQueue = remaining;
  }

  /** Debounce batch save — flushes all pending canvas saves 5s after the last render. */
  private scheduleSaveFlush(): void {
    if (this.saveTimerId) clearTimeout(this.saveTimerId);
    this.saveTimerId = setTimeout(() => {
      this.saveTimerId = null;
      const batch = this.pendingSaves.splice(0);
      if (batch.length === 0) return;
      const ric = (globalThis as any).requestIdleCallback;
      const flush = () => {
        for (const item of batch) {
          if (this.scene.textures.exists(item.texKey)) {
            saveChunkCanvas(item.texKey, item.ss, item.canvas, item.tier);
          }
        }
      };
      if (ric) {
        ric(flush, { timeout: 10000 });
      } else {
        setTimeout(flush, 0);
      }
    }, 5000);
  }

  /** Create the display image, water sprites, and light sources for a finished chunk. */
  private finishRenderChunk(
    chunk: Chunk,
    texKey: string,
    container: Phaser.GameObjects.Container,
    ox: number,
    oy: number,
    SS: number,
    chunkLightList: LightSource[],
  ): void {
    const img = this.scene.add.image(ox, oy, texKey);
    img.setOrigin(0, 0);
    img.setScale(1 / SS);
    container.add(img);

    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const tile = chunk.tiles[y * CHUNK_SIZE + x];
        const px = x * TILE_PX;
        const py = y * TILE_PX;

        if (tile === TILE.WATER && (x % 3 === 0) && (y % 3 === 0)) {
          const waterSprite = this.scene.add.sprite(ox + px, oy + py, "world-tiles", 21);
          waterSprite.setOrigin(0, 0);
          waterSprite.play({ key: "water-anim", repeat: -1 }, true);
          container.add(waterSprite);
        }
        if (tile === TILE.LAKE && (x % 3 === 0) && (y % 3 === 0)) {
          const lakeSprite = this.scene.add.sprite(ox + px, oy + py, "world-tiles", 21);
          lakeSprite.setOrigin(0, 0);
          lakeSprite.play({ key: "water-anim", repeat: -1 }, true);
          lakeSprite.setTint(0x4488aa);
          container.add(lakeSprite);
        }

        if (tile === TILE.FOUNTAIN) {
          const fountainSprite = this.scene.add.sprite(
            ox + px + TILE_PX / 2 - 96,
            oy + py + TILE_PX / 2 - 96,
            "fountain-sheet", 0,
          );
          fountainSprite.setOrigin(0, 0);
          fountainSprite.setDepth(-0.5);
          fountainSprite.play({ key: "fountain-anim", repeat: -1 }, true);
          container.add(fountainSprite);
        }

        if (chunkLightList.length < MAX_LIGHTS_PER_CHUNK) {
          if (tile === TILE.LAVA) {
            chunkLightList.push(this.lighting.addLight(ox + px + TILE_PX / 2, oy + py + TILE_PX / 2, 80, 0xff6600, 0.4, 0.1, 0.005));
          } else if (tile === TILE.CRYSTAL) {
            chunkLightList.push(this.lighting.addLight(ox + px + TILE_PX / 2, oy + py + TILE_PX / 2, 60, 0x44aaff, 0.3, 0.05, 0.003));
          } else if (tile === TILE.VOID) {
            chunkLightList.push(this.lighting.addLight(ox + px + TILE_PX / 2, oy + py + TILE_PX / 2, 70, 0xaa00ff, 0.25, 0.08, 0.004));
          } else if (tile === TILE.FOUNTAIN) {
            chunkLightList.push(this.lighting.addLight(ox + px + TILE_PX / 2, oy + py + TILE_PX / 2, 50, 0x88ccff, 0.2, 0.03, 0.002));
          } else if (tile === TILE.MYSTIC_TREE) {
            chunkLightList.push(this.lighting.addLight(ox + px + TILE_PX / 2, oy + py + TILE_PX / 2, 45, 0xff6600, 0.2, 0.06, 0.003));
          }
        }
      }
    }
  }

  /** Sync ghost NPCs with the store's fired agents. */
  syncGhosts(): void {
    for (const [id, fa] of this.store.firedAgents) {
      if (!this.ghosts.has(id)) {
        this.ghosts.set(id, new GhostNPC(this, fa));
      }
    }
    for (const [id, ghost] of this.ghosts) {
      if (!this.store.firedAgents.has(id)) {
        ghost.destroy();
        this.ghosts.delete(id);
      }
    }
  }

  onGhostClick(firedAgentId: string): void {
    this.tryRecruit(firedAgentId);
  }

  /** Spawn a brief particle burst at a world position. */
  particleBurst(x: number, y: number, color: number, count: number, speed: number): void {
    this.vfx.sparkBurst(x, y, color, count, speed);
  }

  private tryRecruit(firedAgentId: string): void {
    const ghost = this.ghosts.get(firedAgentId);
    if (!ghost) return;
    const px = this.scene.cameras.main.scrollX + this.scene.cameras.main.width / 2;
    const py = this.scene.cameras.main.scrollY + this.scene.cameras.main.height / 2;
    // use player position from the scene registry
    const playerPos = this.scene.registry.get("playerPos") as { x: number; y: number } | undefined;
    const cx = playerPos?.x ?? px;
    const cy = playerPos?.y ?? py;
    const dist = Math.hypot(cx - ghost.container.x, cy - ghost.container.y);
    if (dist > 140) return;

    this.net.send({ type: "recruit", firedAgentId });
    this.vfx.recruitBeam(ghost.container.x, ghost.container.y);
    this.audio.recruit();
    this.showRecruitedHint(ghost.info.name, cx, cy);
  }

  private showRecruitedHint(name: string, px: number, py: number): void {
    this.recruitedHint
      .setText(`${name} is coming back to the office!`)
      .setPosition(px, py - 120)
      .setVisible(true);
    this.scene.time.delayedCall(3000, () => this.recruitedHint.setVisible(false));
  }

  /** Remove all GOLF_BALL tiles from loaded chunks except the one nearest to the office door. */
  private removeExtraBalls(): void {
    let bestBall: { cx: number; cy: number; lx: number; ly: number; dist: number } | null = null;
    for (const [, chunk] of this.chunks) {
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          if (chunk.tiles[y * CHUNK_SIZE + x] === TILE.GOLF_BALL) {
            const worldTx = chunk.cx * CHUNK_SIZE + x;
            const worldTy = chunk.cy * CHUNK_SIZE + y;
            // distance from office door (~14, 0)
            const d = Math.hypot(worldTx - 14, worldTy);
            if (!bestBall || d < bestBall.dist) {
              bestBall = { cx: chunk.cx, cy: chunk.cy, lx: x, ly: y, dist: d };
            }
          }
        }
      }
    }
    // remove all balls except the best one
    for (const [key, chunk] of this.chunks) {
      let changed = false;
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          if (chunk.tiles[y * CHUNK_SIZE + x] === TILE.GOLF_BALL) {
            if (bestBall && chunk.cx === bestBall.cx && chunk.cy === bestBall.cy && x === bestBall.lx && y === bestBall.ly) {
              continue; // keep this one
            }
            chunk.tiles[y * CHUNK_SIZE + x] = TILE.TEE_BOX;
            changed = true;
          }
        }
      }
      if (changed) {
        const oldContainer = this.chunkGraphics.get(key);
        if (oldContainer) {
          oldContainer.destroy(true);
          this.chunkGraphics.delete(key);
        }
        this.removeChunkLights(key);
        this.invalidateChunkTexture(chunk.cx, chunk.cy);
        this.renderChunk(chunk);
      }
    }
  }

  /** Find the next golf flag (not at sunkTx/sunkTy) and spawn a ball on its tee box. */
  private spawnBallAtNextHole(sunkTx: number, sunkTy: number): boolean {
    // search loaded chunks first, then load nearby chunks if needed
    let bestFlag: { tx: number; ty: number; dist: number } | null = null;

    // search a 5x5 chunk area around the sunk flag
    const baseCx = Math.floor(sunkTx / CHUNK_SIZE);
    const baseCy = Math.floor(sunkTy / CHUNK_SIZE);
    for (let cy = baseCy - 2; cy <= baseCy + 2; cy++) {
      for (let cx = baseCx - 2; cx <= baseCx + 2; cx++) {
        if (cy < 0) continue;
        const key = `${cx},${cy}`;
        let chunk = this.chunks.get(key);
        if (!chunk) {
          this.loadChunk(cx, cy);
          chunk = this.chunks.get(key);
          if (!chunk) continue;
        }
        for (let y = 0; y < CHUNK_SIZE; y++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            if (chunk.tiles[y * CHUNK_SIZE + x] === TILE.GOLF_FLAG) {
              const worldTx = cx * CHUNK_SIZE + x;
              const worldTy = cy * CHUNK_SIZE + y;
              // skip the flag we just sank
              if (Math.hypot(worldTx - sunkTx, worldTy - sunkTy) < 3) continue;
              const d = Math.hypot(worldTx - sunkTx, worldTy - sunkTy);
              if (!bestFlag || d < bestFlag.dist) {
                bestFlag = { tx: worldTx, ty: worldTy, dist: d };
              }
            }
          }
        }
      }
    }

    if (!bestFlag) return false;

    // find the tee box nearest to this flag (loaded-only to avoid chunk gen spikes)
    let bestTee: { tx: number; ty: number; dist: number } | null = null;
    for (let dy = -20; dy <= 20; dy++) {
      for (let dx = -20; dx <= 20; dx++) {
        const tx = bestFlag.tx + dx;
        const ty = bestFlag.ty + dy;
        const tile = this.getTileAtLoaded(tx, ty);
        if (tile === TILE.TEE_BOX) {
          const d = Math.hypot(dx, dy);
          if (!bestTee || d < bestTee.dist) {
            bestTee = { tx, ty, dist: d };
          }
        }
      }
    }

    if (bestTee) {
      this.setTileAt(bestTee.tx, bestTee.ty, TILE.GOLF_BALL);
      // spawn effect
      const px = bestTee.tx * TILE_PX + TILE_PX / 2 + this.offset.x;
      const py = bestTee.ty * TILE_PX + TILE_PX / 2 + this.offset.y;
      this.vfx.sparkBurst(px, py, 0xffffff, 16, 60);
      return true;
    }
    return false;
  }

  /** Called every frame. Manages chunks, ghosts, compass, hazards, and interaction. */
  update(time: number, dt: number, playerX: number, playerY: number, ePressed: boolean, vx = 0, vy = 0, playerDir: Dir = "down", attackPressed = false): void {
    const outside = this.isOutside(playerX, playerY);

    // show compass + health bar when outside
    if (outside) {
      const doorX = this.officeW / 2;
      const doorY = this.officeH;
      const dx = doorX - playerX;
      const dy = doorY - playerY;
      const distTiles = Math.round(Math.hypot(dx, dy) / TILE_PX);
      const { tx, ty } = this.pixelToTile(playerX, playerY);
      const cx = Math.floor(tx / CHUNK_SIZE);
      const cy = Math.floor(ty / CHUNK_SIZE);
      const hostility = hostilityAt(cx, cy, this.worldTheme?.worldgen?.hostilityThresholds);
      const biomeList = this.worldTheme?.worldgen?.biomes ?? ["meadow", "forest", "ruins", "wasteland", "void", "infernal"];
      const biomeName = biomeList[Math.min(Math.round(hostility), biomeList.length - 1)] ?? "meadow";
      const biomeDisplay = biomeName.toUpperCase();

      // HUD compass
      this.hud.updateCompass(true, dx, dy, distTiles, biomeDisplay);
      this.hud.setHealth(this.hp, MAX_HP);
      this.hud.showHealthBar();

      // Audio: play biome music
      // this.audio.playMusic(biomeName);

      // Ambient particles for biome — only restart when biome changes
      if (this.currentAmbientBiome !== biomeName) {
        this.currentAmbientBiome = biomeName;
        this.vfx.startAmbient(biomeName as any);
      }

      // --- spawn creatures based on hostility (skip farthest infernal region) ---
      if (this.creatures.length < CREATURE_CAP && time - this.lastSpawnTime > 1500 + Math.random() * 2000) {
        if (hostility >= 0 && hostility < 5) {
          const spawnCount = hostility === 0 ? 1 : 2 + Math.floor(hostility / 2);
          let spawnedAny = false;
          for (let s = 0; s < spawnCount; s++) {
            // try up to 5 positions to find a walkable tile
            let placed = false;
            for (let attempt = 0; attempt < 5 && !placed; attempt++) {
              const angle = Math.random() * Math.PI * 2;
              const dist = hostility === 0 ? 1400 + Math.random() * 600 : 250 + Math.random() * 300;
              const sx = playerX + Math.cos(angle) * dist;
              const sy = playerY + Math.sin(angle) * dist;
              const { tx, ty } = this.pixelToTile(sx, sy);
              if (this.isCreatureWalkable(tx, ty)) {
                const creature = new Creature(this, sx, sy, hostility);
                // Chance to spawn as a tracked Nemesis — scales with hostility
                const nemesisChance = 0.1 + hostility * 0.08;
                if (Math.random() < nemesisChance) {
                  const chunkKey = `${Math.floor(tx / CHUNK_SIZE)},${Math.floor(ty / CHUNK_SIZE)}`;
                  const entry = this.nemesis.create(hostility, creature.maxHp, creature.maxHp * 0.5, 70 + hostility * 25, chunkKey);
                  creature.linkNemesis(entry);
                }
                this.creatures.push(creature);
                placed = true;
                spawnedAny = true;
              }
            }
          }
          if (spawnedAny) this.lastSpawnTime = time;
        } else {
          this.lastSpawnTime = time;
        }
      }

      // --- spawn friendly creatures in the meadow (hostility 0) ---
      if (this.friendlies.length < FRIENDLY_CAP && time - this.lastFriendlySpawnTime > 1500 + Math.random() * 2000) {
        this.lastFriendlySpawnTime = time;
        if (Math.round(hostility) === 0) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 200 + Math.random() * 200;
          const sx = playerX + Math.cos(angle) * dist;
          const sy = playerY + Math.sin(angle) * dist;
          const { tx, ty } = this.pixelToTile(sx, sy);
          if (this.isCreatureWalkable(tx, ty)) {
            const typeIndex = Math.floor(Math.random() * friendlyCreatureCount(this.worldTheme?.id));
            this.friendlies.push(new FriendlyCreature(this, sx, sy, typeIndex));
          }
        }
      }

      // --- spawn slugs in forest+ (hostility >= 1) — garden pests ---
      if (this.slugs.length < SLUG_CAP && time - this.lastSlugSpawnTime > 2000 + Math.random() * 3000) {
        this.lastSlugSpawnTime = time;
        if (Math.round(hostility) >= 1) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 150 + Math.random() * 250;
          const sx = playerX + Math.cos(angle) * dist;
          const sy = playerY + Math.sin(angle) * dist;
          const { tx, ty } = this.pixelToTile(sx, sy);
          if (this.isCreatureWalkable(tx, ty)) {
            this.slugs.push(new Slug(this, sx, sy));
          }
        }
      }

      // --- spawn dog near the big lake — friendly fetch companion ---
      const lakePxX = BIG_LAKE_WT_X * TILE_PX + TILE_PX / 2 + this.offset.x;
      const lakePxY = BIG_LAKE_WT_Y * TILE_PX + TILE_PX / 2 + this.offset.y;
      const lakeRadiusPx = BIG_LAKE_RADIUS * TILE_PX;
      const distToLake = Math.hypot(playerX - lakePxX, playerY - lakePxY);
      if (this.dogs.length === 0 && time - this.lastDogSpawnTime > 8000 && distToLake < lakeRadiusPx + 800) {
        this.lastDogSpawnTime = time;
        // Spawn near the lake shore (just outside the radius)
        const angle = Math.random() * Math.PI * 2;
        const shoreDist = lakeRadiusPx + 50 + Math.random() * 150;
        const sx = lakePxX + Math.cos(angle) * shoreDist;
        const sy = lakePxY + Math.sin(angle) * shoreDist;
        const { tx, ty } = this.pixelToTile(sx, sy);
        if (this.isCreatureWalkable(tx, ty)) {
          this.dogs.push(new Dog(this, sx, sy));
          this.store.toast("🐶 A friendly dog appeared by the lake!");
        }
      }

      // --- spawn leprechaun NPC in forest/ruins/wasteland (hostility >= 2) ---
      if (this.leprechauns.length === 0 && time - this.lastLeprechaunSpawnTime > 15000 && hostility >= 2) {
        this.lastLeprechaunSpawnTime = time;
        const angle = Math.random() * Math.PI * 2;
        const dist = 250 + Math.random() * 200;
        const sx = playerX + Math.cos(angle) * dist;
        const sy = playerY + Math.sin(angle) * dist;
        const { tx, ty } = this.pixelToTile(sx, sy);
        if (this.isCreatureWalkable(tx, ty)) {
          this.leprechauns.push(new Leprechaun(this, sx, sy));
          this.store.toast("🍀 A leprechaun is lurking nearby...");
        }
      }

      // --- throw stones at player from random directions ---
      if (hostility >= 2 && time - this.lastStoneTime > STONE_INTERVAL - hostility * 500) {
        this.lastStoneTime = time;
        const angle = Math.random() * Math.PI * 2;
        const dist = 350;
        const ox = playerX + Math.cos(angle) * dist;
        const oy = playerY + Math.sin(angle) * dist;
        // velocity toward player with slight inaccuracy
        const targetAngle = Math.atan2(playerY - oy, playerX - ox) + (Math.random() - 0.5) * 0.3;
        const stoneSpeed = 200 + hostility * 50;
        const damage = 5 + hostility * 4;
        const stoneScale = 0.6 + hostility * 0.25;
        const lobHeight = (hostility - 1) * 20;
        this.stones.push(new Stone(this, ox, oy, Math.cos(targetAngle) * stoneSpeed, Math.sin(targetAngle) * stoneSpeed, damage, stoneScale, lobHeight));
      }

      // --- roll for legendary beast spawn (more frequent + bigger beasts further out) ---
      const beastCap = 2 + Math.floor(hostility / 2);
      const beastInterval = BEAST_SPAWN_INTERVAL - hostility * 800;
      if (this.beasts.length < beastCap && time - this.lastBeastTime > beastInterval) {
        this.lastBeastTime = time;
        // pick a beast that matches current hostility
        let candidates = (BEASTS_BY_THEME[this.worldTheme?.id ?? ""] ?? BEASTS).filter((b) => hostility >= b.minHostility);
        // In conflict zones (hostility 3+ with conflict config), war bosses can replace regular beasts
        const warBosses = WAR_BOSSES_BY_THEME[this.worldTheme?.id ?? ""];
        if (warBosses && hostility >= 3 && this.factions.hasConflict && Math.random() < 0.4) {
          candidates = warBosses.filter((b) => hostility >= b.minHostility);
        }
        if (candidates.length > 0) {
          // weighted random — bias toward beasts whose minHostility is close to
          // current hostility so bigger beasts appear more often further out
          const weighted = candidates.map((b) => {
            const distance = hostility - b.minHostility;
            const proximityBoost = Math.max(0.1, 1 - distance * 0.25);
            return { ...b, weight: b.rarity * proximityBoost };
          });
          const totalWeight = weighted.reduce((s, b) => s + b.weight, 0);
          let roll = Math.random() * totalWeight;
          let chosen = weighted[0];
          for (const b of weighted) {
            roll -= b.weight;
            if (roll <= 0) {
              chosen = b;
              break;
            }
          }
          // spawn at distance — try multiple positions to find walkable tile
          let spawned = false;
          for (let attempt = 0; attempt < 8 && !spawned; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 400 + Math.random() * 250;
            const sx = playerX + Math.cos(angle) * dist;
            const sy = playerY + Math.sin(angle) * dist;
            const { tx, ty } = this.pixelToTile(sx, sy);
            if (this.isCreatureWalkable(tx, ty)) {
              this.beasts.push(new LegendaryBeast(this, chosen, sx, sy));
              this.hud.showBeastBanner(chosen.name, Math.round(dist / TILE_PX));
              this.audio.beastRoar();
              this.vfx.shockwave(sx, sy, 0xff4444, 3);
              this.scene.time.delayedCall(4000, () => this.hud.hideBeastBanner());
              spawned = true;
            }
          }
        }
      }

      // --- update faction conflict system (hostility 3+ zones) ---
      const factionHit = this.factions.update(dt, playerX, playerY, hostility);
      if (factionHit && time > this.invulnUntil && !this.isDying) {
        this.takeDamage(factionHit.damage, playerX, playerY, time);
      }
    } else {
      this.hud.updateCompass(false, 0, 0, 0, "");
      this.hud.hideHealthBar();
      this.hud.hideBeastBanner();
      this.vfx.stopAmbient();
      this.currentAmbientBiome = null;
      this.audio.stopMusic();
      // clear creatures and beasts when back in office
      for (const c of this.creatures) c.destroy();
      this.creatures = [];
      for (const b of this.beasts) b.destroy();
      this.beasts = [];
      for (const s of this.stones) s.destroy();
      this.stones = [];
      for (const f of this.friendlies) f.destroy();
      this.friendlies = [];
      for (const sl of this.slugs) sl.destroy();
      this.slugs = [];
      for (const dg of this.dogs) dg.destroy();
      this.dogs = [];
      for (const fb of this.fetchBalls) fb.destroy();
      this.fetchBalls = [];
      for (const lep of this.leprechauns) lep.destroy();
      this.leprechauns = [];
      this.factions.clear();
      if (this.wife) { this.wife.destroy(); this.wife = null; }
      if (this.fishingLine) { this.fishingLine.destroy(); this.fishingLine = null; }
      if (this.campfireSprite) { this.campfireSprite.destroy(); this.campfireSprite = null; }
      if (this.darkLepContainer) { this.darkLepContainer.destroy(); this.darkLepContainer = null; }
      if (this.darkLepSpeech) { this.darkLepSpeech.destroy(); this.darkLepSpeech = null; }
      if (this.darkRiftGfx) { this.darkRiftGfx.destroy(); this.darkRiftGfx = null; }
      this.darkLepSprite = null;
      // Preserve phase 8 (twist complete) so empty_cabin achievement can still trigger
      if (this.darkTwistPhase !== 8) this.darkTwistPhase = 0;
      this.fishHint.setVisible(false);
      this.buildHint.setVisible(false);
      // heal in office
      if (this.hp < MAX_HP) {
        this.hp = Math.min(MAX_HP, this.hp + 20 * (dt / 1000));
      }
    }

    // load/unload chunks — when inside, only request worker generation
    // (non-blocking) so tile data is ready when the player walks outside.
    // Canvas rendering happens only when outside to keep the game responsive.
    if (outside) {
      this.updateChunks(playerX, playerY, vx, vy);
    } else {
      this.preloadDoorChunksWorkerOnly();
      this.processRenderJobs();
    }

    // update ghosts
    for (const ghost of this.ghosts.values()) {
      ghost.update(time, dt);
    }

    // --- update creatures ---
    for (const c of this.creatures) {
      const hit = c.update(dt, playerX, playerY);
      if (hit && time > this.invulnUntil && !this.isDying) {
        this.takeDamage(hit.damage, playerX, playerY, time);
      }
      // despawn creatures that wandered too far — frees cap for current biome
      const cd = Math.hypot(playerX - c.container.x, playerY - c.container.y);
      if (cd > 900) c.destroy();
    }
    this.creatures = this.creatures.filter((c) => c.alive_);

    // --- capture system: check for weakened creatures near player ---
    let captureTarget: Creature | null = null;
    let captureDist = Infinity;
    if (outside && !this.isDying) {
      for (const c of this.creatures) {
        if (!c.alive_ || !c.captureReady) continue;
        const d = Math.hypot(playerX - c.container.x, playerY - c.container.y);
        if (d < 60 && d < captureDist) {
          captureDist = d;
          captureTarget = c;
        }
      }
    }

    if (captureTarget) {
      const hpPct = Math.round(captureTarget.hpRatio * 100);
      this.captureHint
        .setText(isTouchDevice() ? `TAP Capture (${hpPct}% HP)` : `E: Capture (${hpPct}% HP)`)
        .setPosition(captureTarget.container.x, captureTarget.container.y - 45)
        .setVisible(true);
      if (ePressed) {
        this.tryCapture(captureTarget, time);
      }
    } else {
      this.captureHint.setVisible(false);
    }

    // --- update friendly creatures ---
    for (const f of this.friendlies) {
      f.update(time, dt, playerX, playerY);
      const fd = Math.hypot(playerX - f.container.x, playerY - f.container.y);
      if (fd > 900) f.destroy();
    }
    this.friendlies = this.friendlies.filter((f) => f.alive_);

    // --- update slugs ---
    for (const sl of this.slugs) {
      const hit = sl.update(time, dt, playerX, playerY);
      if (hit && time > this.invulnUntil && !this.isDying) {
        this.takeDamage(hit.damage, playerX, playerY, time);
      }
      const sld = Math.hypot(playerX - sl.container.x, playerY - sl.container.y);
      if (sld > 900) sl.destroy();
    }
    this.slugs = this.slugs.filter((sl) => sl.alive_);

    // --- update fetch balls ---
    for (const fb of this.fetchBalls) {
      fb.update(dt);
    }
    this.fetchBalls = this.fetchBalls.filter((fb) => fb.alive);

    // --- update dogs ---
    for (const dg of this.dogs) {
      dg.update(time, dt, playerX, playerY);
      const dd = Math.hypot(playerX - dg.container.x, playerY - dg.container.y);
      if (dd > 1200) dg.destroy();
    }
    this.dogs = this.dogs.filter((dg) => dg.alive_);

    // --- update leprechauns ---
    for (const lep of this.leprechauns) {
      lep.update(time, dt, playerX, playerY);
      const ld = Math.hypot(playerX - lep.container.x, playerY - lep.container.y);
      if (ld > 1500) lep.destroy();
    }
    this.leprechauns = this.leprechauns.filter((lep) => lep.alive_);

    // --- update wife NPC ---
    if (this.wife) {
      this.wife.update(time, dt, playerX, playerY);
    }

    // --- update fishing line ---
    if (this.fishingLine) {
      this.fishingLine.update(time);
    }

    // --- update leprechaun dark twist ---
    this.updateDarkTwist(time, playerX, playerY);

    // --- update deployed allies ---
    for (const a of this.deployedAllies) {
      if (a.alive_) a.update(dt, playerX, playerY);
    }
    this.deployedAllies = this.deployedAllies.filter((a) => a.alive_);

    // --- update legendary beasts ---
    let nearestBeast: LegendaryBeast | null = null;
    let nearestBeastDist = Infinity;
    for (const b of this.beasts) {
      const hit = b.update(dt, playerX, playerY);
      if (hit && time > this.invulnUntil && !this.isDying) {
        this.takeDamage(hit.damage, playerX, playerY, time);
      }
      const bd = Math.hypot(playerX - b.container.x, playerY - b.container.y);
      if (bd < nearestBeastDist) {
        nearestBeastDist = bd;
        nearestBeast = b;
      }
      // despawn beasts that are too far — frees cap for current biome
      if (bd > 1200) b.destroy();
    }
    this.beasts = this.beasts.filter((b) => b.alive_);

    // show beast banner when one is near
    if (nearestBeast && nearestBeastDist < 600) {
      this.hud.showBeastBanner(nearestBeast.name, Math.round(nearestBeastDist / TILE_PX));
    } else if (this.beasts.length === 0) {
      this.hud.hideBeastBanner();
    }

    // --- update stones ---
    for (const s of this.stones) {
      const hit = s.update(dt, playerX, playerY);
      if (hit && time > this.invulnUntil && !this.isDying) {
        this.takeDamage(hit.damage, playerX, playerY, time);
      }
    }
    this.stones = this.stones.filter((s) => s.alive_);

    // --- update arrow projectile (crystal bow) ---
    if (this.arrowActive && this.arrow) {
      const arrowDt = dt / 1000;
      this.arrow.x += this.arrowVx * arrowDt;
      this.arrow.y += this.arrowVy * arrowDt;
      this.arrowTrail?.setPosition(this.arrow.x, this.arrow.y);

      // Check creature collisions
      let hitSomething = false;
      for (const c of this.creatures) {
        if (!c.alive_) continue;
        const dist = Math.hypot(this.arrow.x - c.container.x, this.arrow.y - c.container.y);
        if (dist < 24) {
          c.takeDamage(this.arrowDamage);
          this.vfx.sparkBurst(this.arrow.x, this.arrow.y, 0x44ffdd, 10, 80);
          this.audio.hit();
          hitSomething = true;
          break;
        }
      }

      // Check beast collisions
      if (!hitSomething) {
        for (const b of this.beasts) {
          if (!b.alive_) continue;
          const dist = Math.hypot(this.arrow.x - b.container.x, this.arrow.y - b.container.y);
          if (dist < 30) {
            b.takeDamage(this.arrowDamage);
            this.vfx.sparkBurst(this.arrow.x, this.arrow.y, 0x44ffdd, 10, 80);
            this.audio.hit();
            hitSomething = true;
            break;
          }
        }
      }

      // Check slug collisions
      if (!hitSomething) {
        for (const sl of this.slugs) {
          if (!sl.alive_) continue;
          const dist = Math.hypot(this.arrow.x - sl.container.x, this.arrow.y - sl.container.y);
          if (dist < 24) {
            sl.takeDamage(this.arrowDamage);
            this.vfx.sparkBurst(this.arrow.x, this.arrow.y, 0x44ffdd, 10, 80);
            this.audio.hit();
            hitSomething = true;
            break;
          }
        }
      }

      // Check wall/tile collision or out of range
      const { tx: atx, ty: aty } = this.pixelToTile(this.arrow.x, this.arrow.y);
      const arrowTile = this.getTileAtLoaded(atx, aty);
      const arrowDist = Math.hypot(this.arrow.x - playerX, this.arrow.y - playerY);
      if (hitSomething || (arrowTile >= 0 && !isWalkable(arrowTile)) || arrowDist > 400) {
        if (!hitSomething) {
          this.vfx.sparkBurst(this.arrow.x, this.arrow.y, 0x44ffdd, 6, 50);
        }
        this.arrow.destroy();
        this.arrow = null;
        this.arrowTrail?.destroy();
        this.arrowTrail = null;
        this.arrowActive = false;
      }
    }

    // --- tile hazard damage (water, lava, void) ---
    if (outside) {
      const { tx, ty } = this.pixelToTile(playerX, playerY);
      const tile = this.getTileAtLoaded(tx, ty);
      if (tile < 0) return; // chunk not loaded yet — skip damage check
      const dmg = tileDamage(tile) * (dt / 1000);
      if (dmg > 0 && !this.isDying && (dmg === Infinity || time > this.invulnUntil)) {
        const isVoid = dmg === Infinity;
        this.takeDamage(isVoid ? MAX_HP : dmg, playerX, playerY, time);
        if (isVoid) {
          this.vfx.sparkBurst(playerX, playerY, 0xaa44ff, 20, 100);
          this.vfx.sparkBurst(playerX, playerY, 0x000000, 12, 60);
          this.vfx.shake("large");
          this.audio.voidDeath();
          achievements.unlock("void_death");
        } else if (tile === TILE.LAVA) {
          this.vfx.sparkBurst(playerX, playerY, 0xff6020, 8, 50);
          this.audio.hit();
        }
      }
    }

    // --- player attack (SPACE) ---
    if (outside && attackPressed && !this.isDying) {
      this.tryAttack(time, playerX, playerY, playerDir);
    }

    // --- weapon cooldown bar ---
    if (outside && this.weapon && time < this.weaponCooldown) {
      const remaining = (this.weaponCooldown - time) / this.weaponCooldownMax;
      const barW = 50;
      const barH = 5;
      const bx = playerX - barW / 2;
      const by = playerY - 60;
      this.weaponCooldownBar.clear();
      this.weaponCooldownBar.fillStyle(0x000000, 0.5);
      this.weaponCooldownBar.fillRect(bx - 2, by - 2, barW + 4, barH + 4);
      this.weaponCooldownBar.fillStyle(0xffaa00, 0.9);
      this.weaponCooldownBar.fillRect(bx, by, barW * remaining, barH);
      this.weaponCooldownBar.setVisible(true);
    } else {
      this.weaponCooldownBar.setVisible(false);
    }

    // --- update lighting ---
    const distFactor = this.distanceFactor(playerX, playerY);
    const nightFactor = this.lighting.getNightFactor(time);
    this.lighting.update(time, playerX, playerY, distFactor, nightFactor);

    // --- update minimap when outside ---
    if (outside) {
      const entities = this.creatures.map((c) => ({
        x: c.container.x, y: c.container.y, color: 0xff4444, size: 2,
      }));
      this.beasts.forEach((b) => entities.push({
        x: b.container.x, y: b.container.y, color: 0xffdd44, size: 4,
      }));
      this.ghosts.forEach((g) => entities.push({
        x: g.container.x, y: g.container.y, color: 0x4cb866, size: 3,
      }));
      this.friendlies.forEach((f) => entities.push({
        x: f.container.x, y: f.container.y, color: 0xffaaee, size: 2,
      }));
      this.hud.updateMinimap(true, playerX, playerY, entities, this.officeW / 2, this.officeH);
    } else {
      this.hud.updateMinimap(false, 0, 0, [], 0, 0);
    }

    // --- golf interaction ---
    if (outside) {
      const { tx: ptx, ty: pty } = this.pixelToTile(playerX, playerY);

      // update golf ball physics
      if (this.golfBallActive && this.golfBall) {
        const ballDt = dt / 1000;
        this.golfBall.x += this.golfBallVx * ballDt;
        this.golfBall.y += this.golfBallVy * ballDt;
        // terrain-based friction
        const { tx: btx, ty: bty } = this.pixelToTile(this.golfBall.x, this.golfBall.y);
        const ballTile = this.getTileAt(btx, bty);
        let friction = 0.985; // default (grass)
        if (ballTile === TILE.FAIRWAY) friction = 0.992; // rolls far
        else if (ballTile === TILE.SAND_TRAP) friction = this.golfLastClub === "wedge" ? 0.975 : 0.92; // wedge escapes sand
        else if (ballTile === TILE.TEE_BOX) friction = 0.995; // tee off, minimal drag
        else if (ballTile === TILE.POND) friction = 0.8; // water — ball stops fast
        this.golfBallVx *= friction;
        this.golfBallVy *= friction;
        // check if ball reached the flag
        if (ballTile === TILE.GOLF_FLAG) {
          // SUNK!
          const bx = this.golfBall.x;
          const by = this.golfBall.y;
          this.golfBallActive = false;
          this.golfBall.setVisible(false);
          this.golfBall = null;
          this.golfHolesSunk++;
          this.golfTotalStrokes += this.golfStrokes;
          this.vfx.celebrate(bx, by);
          this.vfx.sparkBurst(bx, by, 0xffdd44, 30, 120);
          this.vfx.shake("medium");
          const par = this.golfPar || 4;
          const diff = this.golfStrokes - par;
          let scoreLabel: string;
          if (this.golfStrokes === 1) scoreLabel = "HOLE IN ONE!";
          else if (diff <= -4) scoreLabel = "CONDOR!";
          else if (diff === -3) scoreLabel = "ALBATROSS!";
          else if (diff === -2) scoreLabel = "EAGLE!";
          else if (diff === -1) scoreLabel = "BIRDIE!";
          else if (diff === 0) scoreLabel = "PAR!";
          else scoreLabel = "Sunk it!";
          this.golfTotalPar += par;
          const vsPar = this.golfTotalStrokes - this.golfTotalPar;
          const vsParStr = vsPar <= 0 ? `${vsPar} under par` : `+${vsPar} over par`;
          this.store.toast(`${scoreLabel} 🏌️ Hole ${this.golfHolesSunk}: ${this.golfStrokes} stroke${this.golfStrokes > 1 ? "s" : ""} (par ${par}). Total: ${this.golfTotalStrokes} (${vsParStr})`);
          achievements.unlock("hole_in_one");
          this.audio.recruit(); // celebratory sound
          // reset strokes for next hole
          this.golfStrokes = 0;
          this.golfPar = 0;
          // spawn ball at the next hole's tee box
          const spawned = this.spawnBallAtNextHole(btx, bty);
          if (spawned) {
            this.store.toast(`Ball spawned at hole ${this.golfHolesSunk + 1} tee. ⛳`);
          } else {
            this.store.toast("No more holes nearby — explore to find more! 🏌️");
          }
        } else if (ballTile === TILE.POND && Math.hypot(this.golfBallVx, this.golfBallVy) < 15) {
          // water hazard — ball sinks in pond
          const wx = this.golfBall.x;
          const wy = this.golfBall.y;
          this.golfBallActive = false;
          this.golfBall?.setVisible(false);
          this.golfBall = null;
          this.golfStrokes++; // penalty stroke
          const par = this.golfPar || 4;
          if (this.golfStrokes >= par && this.golfFlagCache?.foundFlag) {
            // penalty reached par — auto-sink, no bogey
            this.store.toast(`💦 Water hazard! +1 penalty. The course guides your ball home... ✨ (par ${par} reached)`);
            achievements.unlock("water_hazard");
            this.vfx.sparkBurst(wx, wy, 0x4488ff, 12, 60);
            // launch ball to flag from water edge
            const dropPx = btx * TILE_PX + TILE_PX / 2 + this.offset.x;
            const dropPy = (bty - 1) * TILE_PX + TILE_PX / 2 + this.offset.y;
            const dx = this.golfFlagCache.flagX - dropPx;
            const dy = this.golfFlagCache.flagY - dropPy;
            const dist = Math.hypot(dx, dy);
            const autoSpeed = Math.max(dist * 3, 200);
            this.golfBallVx = (dx / dist) * autoSpeed;
            this.golfBallVy = (dy / dist) * autoSpeed;
            this.golfBall = this.scene.add.image(dropPx, dropPy, resolveItemTex(this.scene, "golf-ball")).setDepth(50).setScale(0.3);
            this.golfBallActive = true;
            this.vfx.sparkBurst(dropPx, dropPy, 0x44ff88, 16, 80);
          } else {
            this.store.toast(`💦 Water hazard! +1 penalty stroke. (Stroke ${this.golfStrokes}) Drop near the edge and hit again.`);
            achievements.unlock("water_hazard");
            this.vfx.sparkBurst(wx, wy, 0x4488ff, 12, 60);
            // place ball back on grass near the water's edge
            const dropTx = btx;
            const dropTy = bty - 1;
            if (this.getTileAt(dropTx, dropTy) !== TILE.POND) {
              this.setTileAt(dropTx, dropTy, TILE.GOLF_BALL);
            } else {
              // try other directions
              for (const [dx2, dy2] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
                if (this.getTileAt(btx + dx2, bty + dy2) !== TILE.POND) {
                  this.setTileAt(btx + dx2, bty + dy2, TILE.GOLF_BALL);
                  break;
                }
              }
            }
          }
        } else if (Math.hypot(this.golfBallVx, this.golfBallVy) < 5) {
          // ball stopped — check if player has reached par (no bogey allowed)
          const par = this.golfPar || 4;
          if (this.golfStrokes >= par && this.golfFlagCache?.foundFlag) {
            // AUTO-SINK: the course guides the ball home — no bogey possible
            const bx = this.golfBall.x;
            const by = this.golfBall.y;
            const dx = this.golfFlagCache.flagX - bx;
            const dy = this.golfFlagCache.flagY - by;
            const dist = Math.hypot(dx, dy);
            const autoSpeed = Math.max(dist * 3, 200);
            this.golfBallVx = (dx / dist) * autoSpeed;
            this.golfBallVy = (dy / dist) * autoSpeed;
            this.vfx.sparkBurst(bx, by, 0x44ff88, 16, 80);
            this.store.toast(`The course guides your ball home... ✨ (par ${par} reached)`);
            // keep ball active — it will sink on next frame when it hits the flag
          } else {
            // ball stopped — place it on the ground so player can hit it again
            this.golfBallActive = false;
            this.setTileAt(btx, bty, TILE.GOLF_BALL);
            this.golfBall?.setVisible(false);
            this.golfBall = null;
            if (ballTile === TILE.SAND_TRAP) {
              this.store.toast(`Ball landed in a sand trap! ⛳ Stroke ${this.golfStrokes}. Tip: use a Wedge to escape.`);
            } else {
              this.store.toast(`Ball stopped. Stroke ${this.golfStrokes}. Walk up and hit again! 🏌️`);
            }
          }
        }
      }

      // scan nearby tiles for golf items (use loaded-only to avoid mid-frame chunk gen)
      let nearestClub: { tx: number; ty: number; d: number } | null = null;
      let nearestBall: { tx: number; ty: number; d: number } | null = null;
      let nearestGolfBag: { tx: number; ty: number; d: number } | null = null;
      let nearestClubTile: { tx: number; ty: number; d: number; tile: number } | null = null;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const ctx2 = ptx + dx;
          const cty2 = pty + dy;
          const t = this.getTileAtLoaded(ctx2, cty2);
          if (t < 0) continue;
          const cx2 = ctx2 * TILE_PX + TILE_PX / 2 + this.offset.x;
          const cy2 = cty2 * TILE_PX + TILE_PX / 2 + this.offset.y;
          const d = Math.hypot(playerX - cx2, playerY - cy2);
          if (t === TILE.GOLF_CLUB && (!nearestClub || d < nearestClub.d)) {
            nearestClub = { tx: ctx2, ty: cty2, d };
          }
          if (t === TILE.GOLF_BALL && (!nearestBall || d < nearestBall.d)) {
            nearestBall = { tx: ctx2, ty: cty2, d };
          }
          if (t === TILE.GOLF_BAG && (!nearestGolfBag || d < nearestGolfBag.d)) {
            nearestGolfBag = { tx: ctx2, ty: cty2, d };
          }
          if ((t === TILE.DRIVER || t === TILE.IRON_CLUB || t === TILE.WEDGE || t === TILE.PUTTER) &&
              (!nearestClubTile || d < nearestClubTile.d)) {
            nearestClubTile = { tx: ctx2, ty: cty2, d, tile: t };
          }
        }
      }

      // golf bag pickup — introduces inventory system
      if (nearestGolfBag && nearestGolfBag.d < 100 && !this.inventory.hasItem("golf_bag")) {
        this.golfHint
          .setText(isTouchDevice() ? "TAP Pick up golf bag" : "E: Pick up golf bag")
          .setPosition(nearestGolfBag.tx * TILE_PX + TILE_PX / 2 + this.offset.x, nearestGolfBag.ty * TILE_PX + this.offset.y - 10)
          .setVisible(true);
        if (ePressed) {
          this.inventory.addItem("golf_bag");
          this.setTileAt(nearestGolfBag.tx, nearestGolfBag.ty, TILE.GRASS);
          this.store.toast("Golf bag! ⛳ Find clubs to fill it. Press 1-6 to swap items.");
          this.vfx.sparkBurst(
            nearestGolfBag.tx * TILE_PX + TILE_PX / 2 + this.offset.x,
            nearestGolfBag.ty * TILE_PX + TILE_PX / 2 + this.offset.y,
            0x88cc88, 12, 60,
          );
          this.audio.uiClick();
          achievements.unlock("golf_bag_pickup");
        }
      } else if (nearestClubTile && nearestClubTile.d < 100 && !this.inventory.hasItem(
        nearestClubTile.tile === TILE.DRIVER ? "driver" :
        nearestClubTile.tile === TILE.IRON_CLUB ? "iron" :
        nearestClubTile.tile === TILE.WEDGE ? "wedge" : "putter"
      )) {
        const clubId =
          nearestClubTile.tile === TILE.DRIVER ? "driver" :
          nearestClubTile.tile === TILE.IRON_CLUB ? "iron" :
          nearestClubTile.tile === TILE.WEDGE ? "wedge" : "putter";
        const clubName =
          nearestClubTile.tile === TILE.DRIVER ? "Driver" :
          nearestClubTile.tile === TILE.IRON_CLUB ? "Iron" :
          nearestClubTile.tile === TILE.WEDGE ? "Sand Wedge" : "Putter";
        const clubToast =
          nearestClubTile.tile === TILE.DRIVER ? "Driver! High power, low accuracy. Press the slot number to equip." :
          nearestClubTile.tile === TILE.IRON_CLUB ? "Iron! Versatile mid-range club." :
          nearestClubTile.tile === TILE.WEDGE ? "Sand Wedge! Escapes sand traps. Try it!" :
          "Putter! Low power, pinpoint accuracy.";
        this.golfHint
          .setText(isTouchDevice() ? `TAP Pick up ${clubName}` : `E: Pick up ${clubName}`)
          .setPosition(nearestClubTile.tx * TILE_PX + TILE_PX / 2 + this.offset.x, nearestClubTile.ty * TILE_PX + this.offset.y - 10)
          .setVisible(true);
        if (ePressed) {
          this.inventory.addItem(clubId);
          this.equipWeapon("golf_club");
          this.setTileAt(nearestClubTile.tx, nearestClubTile.ty, TILE.TEE_BOX);
          this.store.toast(`Picked up ${clubName}! ${clubToast}`);
          this.vfx.sparkBurst(
            nearestClubTile.tx * TILE_PX + TILE_PX / 2 + this.offset.x,
            nearestClubTile.ty * TILE_PX + TILE_PX / 2 + this.offset.y,
            0x88cc88, 10, 60,
          );
          achievements.unlock("club_pickup");
          if (this.speedrunStartTime === null) {
            this.speedrunStartTime = Date.now();
          }
        }
      } else if (nearestClub && nearestClub.d < 100 && !this.inventory.hasGolfClub()) {
        this.golfHint
          .setText(isTouchDevice() ? "TAP Pick up golf club" : "E: Pick up golf club")
          .setPosition(nearestClub.tx * TILE_PX + TILE_PX / 2 + this.offset.x, nearestClub.ty * TILE_PX + this.offset.y - 10)
          .setVisible(true);
        if (ePressed) {
          this.inventory.addItem("golf_club");
          this.equipWeapon("golf_club");
          this.setTileAt(nearestClub.tx, nearestClub.ty, TILE.TEE_BOX);
          this.store.toast("Picked up golf club! ⛳ Press SPACE to swing.");
          this.vfx.sparkBurst(
            nearestClub.tx * TILE_PX + TILE_PX / 2 + this.offset.x,
            nearestClub.ty * TILE_PX + TILE_PX / 2 + this.offset.y,
            0x88cc88, 10, 60,
          );
          achievements.unlock("club_pickup");
          if (this.speedrunStartTime === null) {
            this.speedrunStartTime = Date.now();
          }
        }
      } else if (nearestBall && nearestBall.d < 100 && this.inventory.hasGolfClub() && !this.golfBallActive) {
        // find the flag direction — cached per ball tile to avoid 41x41 scan every frame
        const ballKey = `${nearestBall.tx},${nearestBall.ty}`;
        let flagX = 0, flagY = 0, foundFlag = false;
        if (this.golfFlagCacheKey === ballKey && this.golfFlagCache) {
          ({ flagX, flagY, foundFlag } = this.golfFlagCache);
        } else {
          for (let sy = -20; sy <= 20 && !foundFlag; sy++) {
            for (let sx = -20; sx <= 20 && !foundFlag; sx++) {
              if (this.getTileAtLoaded(nearestBall.tx + sx, nearestBall.ty + sy) === TILE.GOLF_FLAG) {
                flagX = (nearestBall.tx + sx) * TILE_PX + TILE_PX / 2 + this.offset.x;
                flagY = (nearestBall.ty + sy) * TILE_PX + TILE_PX / 2 + this.offset.y;
                foundFlag = true;
              }
            }
          }
          this.golfFlagCacheKey = ballKey;
          this.golfFlagCache = { flagX, flagY, foundFlag };
          // compute par for this hole based on ball-to-flag distance (generous)
          if (foundFlag && this.golfPar === 0) {
            const flagTileX = Math.round((flagX - this.offset.x) / TILE_PX - 0.5);
            const flagTileY = Math.round((flagY - this.offset.y) / TILE_PX - 0.5);
            const tileDist = Math.hypot(flagTileX - nearestBall.tx, flagTileY - nearestBall.ty);
            this.golfPar = Math.max(4, Math.ceil(tileDist / 4) + 2);
          }
        }
        const ballPx = nearestBall.tx * TILE_PX + TILE_PX / 2 + this.offset.x;
        const ballPy = nearestBall.ty * TILE_PX + TILE_PX / 2 + this.offset.y;

        // club type modifiers
        const activeClub = this.inventory.getActiveClub();
        const clubName = activeClub === "driver" ? "Driver" : activeClub === "iron" ? "Iron" : activeClub === "wedge" ? "Wedge" : activeClub === "putter" ? "Putter" : "Club";
        // power range per club type
        const powerMin = activeClub === "putter" ? 0.05 : activeClub === "wedge" ? 0.15 : activeClub === "iron" ? 0.2 : 0.25;
        const powerMax = activeClub === "putter" ? 0.35 : activeClub === "wedge" ? 0.7 : activeClub === "iron" ? 0.85 : 1.0;
        // accuracy: deviation in radians (0 = perfect)
        const inaccuracy = activeClub === "putter" ? 0 : activeClub === "wedge" ? 0.03 : activeClub === "iron" ? 0.08 : 0.15;

        // power bar is active — oscillate and show above player
        this.golfPowerActive = true;
        this.golfHint
          .setText(`${isTouchDevice() ? "TAP" : "E"}: Swing ${clubName}! (stroke ${this.golfStrokes + 1}${this.golfPar ? `, par ${this.golfPar}` : ""})`)
          .setPosition(ballPx, ballPy - 30)
          .setVisible(true);

        // update oscillating power
        this.golfPower += this.golfPowerDir * (dt / 1000) * 1.2; // full cycle ~1.7s
        if (this.golfPower >= 1) { this.golfPower = 1; this.golfPowerDir = -1; }
        if (this.golfPower <= 0) { this.golfPower = 0; this.golfPowerDir = 1; }

        // draw the power bar above the player
        const barW = 60;
        const barH = 8;
        const barX = playerX - barW / 2;
        const barY = playerY - 110;
        // map raw 0..1 to club power range for display
        const displayPower = powerMin + this.golfPower * (powerMax - powerMin);
        const power = displayPower;
        // color: blue (0x4488ff) at 0 → yellow (0xffdd44) at 0.5 → red (0xff4444) at 1
        const r = Math.floor(0x44 + (0xff - 0x44) * this.golfPower);
        const g = Math.floor(0x88 + (0x44 - 0x88) * this.golfPower);
        const b = Math.floor(0xff + (0x44 - 0xff) * this.golfPower);
        const fillColor = (r << 16) | (g << 8) | b;

        this.golfPowerBar.clear();
        // background
        this.golfPowerBar.fillStyle(0x000000, 0.6);
        this.golfPowerBar.fillRoundedRect(barX - 2, barY - 2, barW + 4, barH + 4, 3);
        // fill
        this.golfPowerBar.fillStyle(fillColor, 1);
        this.golfPowerBar.fillRoundedRect(barX, barY, barW * this.golfPower, barH, 2);
        // border
        this.golfPowerBar.lineStyle(1, 0xffffff, 0.5);
        this.golfPowerBar.strokeRoundedRect(barX, barY, barW, barH, 2);
        this.golfPowerBar.setVisible(true);

        if (ePressed) {
          // capture power mapped to club range → speed
          const hitSpeed = 80 + power * 480;
          this.golfLastClub = activeClub;
          // check if ball is on a sand trap
          const ballTileType = this.getTileAtLoaded(nearestBall.tx, nearestBall.ty);
          const isMagicalWedgeShot = activeClub === "wedge" && ballTileType === TILE.SAND_TRAP;
          if (isMagicalWedgeShot && foundFlag) {
            // MAGICAL WEDGE — auto hole in one from sand!
            const dx = flagX - ballPx;
            const dy = flagY - ballPy;
            const dist = Math.hypot(dx, dy);
            const magicSpeed = Math.max(dist * 3, 200);
            this.golfBallVx = (dx / dist) * magicSpeed;
            this.golfBallVy = (dy / dist) * magicSpeed;
            this.vfx.sparkBurst(ballPx, ballPy, 0x44ff88, 24, 100);
            this.store.toast("✨ MAGICAL WEDGE! The sand glows green... the ball flies true! ✨");
            achievements.unlock("magical_wedge");
          } else if (foundFlag) {
            const dx = flagX - ballPx;
            const dy = flagY - ballPy;
            let angle = Math.atan2(dy, dx);
            if (inaccuracy > 0) {
              angle += (Math.random() - 0.5) * 2 * inaccuracy;
            }
            this.golfBallVx = Math.cos(angle) * hitSpeed;
            this.golfBallVy = Math.sin(angle) * hitSpeed;
          } else {
            this.golfBallVx = 0;
            this.golfBallVy = hitSpeed;
          }
          this.golfBall = this.scene.add.image(ballPx, ballPy, resolveItemTex(this.scene, "golf-ball")).setDepth(50).setScale(0.3);
          this.golfBallActive = true;
          this.golfStrokes++;
          this.setTileAt(nearestBall.tx, nearestBall.ty, TILE.TEE_BOX);
          if (!isMagicalWedgeShot) {
            this.vfx.sparkBurst(ballPx, ballPy, 0xffffff, 8 + Math.floor(power * 16), 60 + power * 80);
          }
          this.audio.golfSwing();
          achievements.unlock("first_swing");
          const powerLabel = isMagicalWedgeShot ? "MAGICAL!" : this.golfPower > 0.75 ? "POWER DRIVE!" : this.golfPower > 0.4 ? "Nice shot!" : "Soft tap.";
          this.store.toast(`Fore! ${clubName} — ${powerLabel} Stroke ${this.golfStrokes}. 🏌️`);
          // reset power bar
          this.golfPowerActive = false;
          this.golfPower = 0;
          this.golfPowerDir = 1;
          this.golfPowerBar.setVisible(false);
        }
      } else {
        this.golfHint.setVisible(false);
        if (this.golfPowerActive) {
          this.golfPowerActive = false;
          this.golfPower = 0;
          this.golfPowerDir = 1;
          this.golfPowerBar.setVisible(false);
        }
      }
    } else {
      this.golfHint.setVisible(false);
      this.golfPowerBar.setVisible(false);
      this.golfPowerActive = false;
      this.golfPower = 0;
      this.golfPowerDir = 1;
      // reset golf state when entering office
      if (this.golfBallActive) {
        this.golfBall?.setVisible(false);
        this.golfBall = null;
        this.golfBallActive = false;
      }
      // reset arrow when entering office
      if (this.arrowActive) {
        this.arrow?.destroy();
        this.arrow = null;
        this.arrowTrail?.destroy();
        this.arrowTrail = null;
        this.arrowActive = false;
      }
      this.captureHint.setVisible(false);
      this.fetchHint.setVisible(false);
      this.lepHint.setVisible(false);
      this.buildHint.setVisible(false);
      this.fishHint.setVisible(false);
      if (this.deployedAllies.length > 0) {
        this.recallAllies();
      }
    }

    // --- tennis interaction ---
    if (outside) {
      const { tx: tptx, ty: tpty } = this.pixelToTile(playerX, playerY);

      // update tennis ball physics
      if (this.tennisBallActive && this.tennisBall) {
        const ballDt = dt / 1000;
        this.tennisBall.x += this.tennisBallVx * ballDt;
        this.tennisBall.y += this.tennisBallVy * ballDt;
        // friction — ball slows down gradually
        this.tennisBallVx *= 0.992;
        this.tennisBallVy *= 0.992;

        const { tx: btx, ty: bty } = this.pixelToTile(this.tennisBall.x, this.tennisBall.y);
        const ballTile = this.getTileAt(btx, bty);

        // check if ball hit the wall — bounce back
        if (ballTile === TILE.TENNIS_WALL) {
          // determine bounce direction — reverse the dominant axis
          const { tx: prevTx, ty: prevTy } = this.pixelToTile(
            this.tennisBall.x - this.tennisBallVx * ballDt,
            this.tennisBall.y - this.tennisBallVy * ballDt,
          );
          const dtx = btx - prevTx;
          const dty = bty - prevTy;
          if (Math.abs(dtx) > Math.abs(dty)) {
            this.tennisBallVx = -this.tennisBallVx * 0.85;
          } else {
            this.tennisBallVy = -this.tennisBallVy * 0.85;
          }
          // push ball out of wall
          this.tennisBall.x += this.tennisBallVx * ballDt * 2;
          this.tennisBall.y += this.tennisBallVy * ballDt * 2;
          // award points for successful wall hit
          this.tennisScore += 10;
          this.tennisRallies++;
          this.vfx.sparkBurst(this.tennisBall.x, this.tennisBall.y, 0xeeff44, 12, 80);
          this.audio.tennisBounce();
          this.store.toast(`Wall hit! +10 🎾 Rally: ${this.tennisRallies} | Score: ${this.tennisScore}`);
          achievements.unlock("tennis_first_hit");
          if (this.tennisRallies >= 5) achievements.unlock("tennis_rally");
          if (this.tennisRallies >= 15) achievements.unlock("tennis_pro");
        }

        // check if ball stopped
        if (Math.hypot(this.tennisBallVx, this.tennisBallVy) < 8) {
          this.tennisBallActive = false;
          // place ball back on the court
          const stopTile = this.getTileAt(btx, bty);
          if (stopTile === TILE.TENNIS_COURT || stopTile === TILE.TENNIS_NET) {
            this.setTileAt(btx, bty, TILE.TENNIS_BALL);
          } else {
            // ball landed off-court — place it back on nearest court tile
            let placed = false;
            for (let r = 1; r <= 5 && !placed; r++) {
              for (let dy = -r; dy <= r && !placed; dy++) {
                for (let dx = -r; dx <= r && !placed; dx++) {
                  const t = this.getTileAt(btx + dx, bty + dy);
                  if (t === TILE.TENNIS_COURT) {
                    this.setTileAt(btx + dx, bty + dy, TILE.TENNIS_BALL);
                    placed = true;
                  }
                }
              }
            }
          }
          this.tennisBall?.setVisible(false);
          this.tennisBall = null;
          if (this.tennisRallies > 0) {
            this.store.toast(`Ball stopped. Rally of ${this.tennisRallies}! Score: ${this.tennisScore} 🎾`);
            this.tennisRallies = 0;
          } else {
            this.store.toast("Ball stopped. Pick it up and serve! 🎾");
          }
        }
      }

      // scan nearby tiles for tennis items (use loaded-only to avoid mid-frame chunk gen)
      let nearestRacket: { tx: number; ty: number; d: number } | null = null;
      let nearestTennisBall: { tx: number; ty: number; d: number } | null = null;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const ctx2 = tptx + dx;
          const cty2 = tpty + dy;
          const t = this.getTileAtLoaded(ctx2, cty2);
          if (t < 0) continue;
          const cx2 = ctx2 * TILE_PX + TILE_PX / 2 + this.offset.x;
          const cy2 = cty2 * TILE_PX + TILE_PX / 2 + this.offset.y;
          const d = Math.hypot(playerX - cx2, playerY - cy2);
          if (t === TILE.TENNIS_RACKET && (!nearestRacket || d < nearestRacket.d)) {
            nearestRacket = { tx: ctx2, ty: cty2, d };
          }
          if (t === TILE.TENNIS_BALL && (!nearestTennisBall || d < nearestTennisBall.d)) {
            nearestTennisBall = { tx: ctx2, ty: cty2, d };
          }
        }
      }

      // show hint and handle E press for racket pickup
      if (nearestRacket && nearestRacket.d < 100 && !this.inventory.hasItem("tennis_racket")) {
        this.tennisHint
          .setText(isTouchDevice() ? "TAP Pick up tennis racket" : "E: Pick up tennis racket")
          .setPosition(nearestRacket.tx * TILE_PX + TILE_PX / 2 + this.offset.x, nearestRacket.ty * TILE_PX + this.offset.y - 10)
          .setVisible(true);
        if (ePressed) {
          this.inventory.addItem("tennis_racket");
          this.inventory.addItem("tennis_ball", 3);
          this.equipWeapon("tennis_racket");
          this.setTileAt(nearestRacket.tx, nearestRacket.ty, TILE.TENNIS_COURT);
          this.store.toast("Picked up tennis racket! 🎾 Press SPACE to bonk.");
          this.vfx.sparkBurst(
            nearestRacket.tx * TILE_PX + TILE_PX / 2 + this.offset.x,
            nearestRacket.ty * TILE_PX + TILE_PX / 2 + this.offset.y,
            0xeeff44, 10, 60,
          );
          achievements.unlock("tennis_pickup");
        }
      } else if (nearestTennisBall && nearestTennisBall.d < 100 && this.inventory.hasItem("tennis_racket") && !this.tennisBallActive) {
        // find the nearest wall — cached per ball tile
        const ballKey = `${nearestTennisBall.tx},${nearestTennisBall.ty}`;
        let wallX = 0, wallY = 0, foundWall = false;
        if (this.tennisWallCacheKey === ballKey && this.tennisWallCache) {
          ({ wallX, wallY, foundWall } = this.tennisWallCache);
        } else {
          for (let sy = -15; sy <= 15 && !foundWall; sy++) {
            for (let sx = -15; sx <= 15 && !foundWall; sx++) {
              if (this.getTileAtLoaded(nearestTennisBall.tx + sx, nearestTennisBall.ty + sy) === TILE.TENNIS_WALL) {
                wallX = (nearestTennisBall.tx + sx) * TILE_PX + TILE_PX / 2 + this.offset.x;
                wallY = (nearestTennisBall.ty + sy) * TILE_PX + TILE_PX / 2 + this.offset.y;
                foundWall = true;
              }
            }
          }
          this.tennisWallCacheKey = ballKey;
          this.tennisWallCache = { wallX, wallY, foundWall };
        }
        const ballPx = nearestTennisBall.tx * TILE_PX + TILE_PX / 2 + this.offset.x;
        const ballPy = nearestTennisBall.ty * TILE_PX + TILE_PX / 2 + this.offset.y;

        // power bar is active — oscillate and show above player
        this.tennisPowerActive = true;
        this.tennisHint
          .setText(`E: Serve! (rally ${this.tennisRallies})`)
          .setPosition(ballPx, ballPy - 30)
          .setVisible(true);

        // update oscillating power
        this.tennisPower += this.tennisPowerDir * (dt / 1000) * 1.5; // faster than golf
        if (this.tennisPower >= 1) { this.tennisPower = 1; this.tennisPowerDir = -1; }
        if (this.tennisPower <= 0) { this.tennisPower = 0; this.tennisPowerDir = 1; }

        // draw the power bar above the player
        const barW = 60;
        const barH = 8;
        const barX = playerX - barW / 2;
        const barY = playerY - 110;
        const power = this.tennisPower;
        // color: green at 0 → yellow at 0.5 → red at 1
        const r = Math.floor(0x44 + (0xff - 0x44) * power);
        const g = Math.floor(0xff + (0x44 - 0xff) * power);
        const b = Math.floor(0x44 + (0x44 - 0x44) * power);
        const fillColor = (r << 16) | (g << 8) | b;

        this.tennisPowerBar.clear();
        this.tennisPowerBar.fillStyle(0x000000, 0.6);
        this.tennisPowerBar.fillRoundedRect(barX - 2, barY - 2, barW + 4, barH + 4, 3);
        this.tennisPowerBar.fillStyle(fillColor, 1);
        this.tennisPowerBar.fillRoundedRect(barX, barY, barW * power, barH, 2);
        this.tennisPowerBar.lineStyle(1, 0xffffff, 0.5);
        this.tennisPowerBar.strokeRoundedRect(barX, barY, barW, barH, 2);
        this.tennisPowerBar.setVisible(true);

        if (ePressed) {
          // capture power: 0.2 (min) to 1.0 (max) → speed 150 to 500
          const hitSpeed = 150 + power * 350;
          if (foundWall) {
            const dx = wallX - ballPx;
            const dy = wallY - ballPy;
            const dist = Math.hypot(dx, dy);
            this.tennisBallVx = (dx / dist) * hitSpeed;
            this.tennisBallVy = (dy / dist) * hitSpeed;
          } else {
            this.tennisBallVx = 0;
            this.tennisBallVy = -hitSpeed;
          }
          this.tennisBall = this.scene.add.image(ballPx, ballPy, resolveItemTex(this.scene, "tennis-ball")).setDepth(50).setScale(0.3);
          this.tennisBallActive = true;
          this.setTileAt(nearestTennisBall.tx, nearestTennisBall.ty, TILE.TENNIS_COURT);
          this.vfx.sparkBurst(ballPx, ballPy, 0xeeff44, 8 + Math.floor(power * 16), 60 + power * 80);
          this.audio.tennisHit();
          achievements.unlock("tennis_first_swing");
          const powerLabel = power > 0.75 ? "SMASH!" : power > 0.4 ? "Nice serve!" : "Soft touch.";
          this.store.toast(`Tennis! ${powerLabel} 🎾`);
          // reset power bar
          this.tennisPowerActive = false;
          this.tennisPower = 0;
          this.tennisPowerDir = 1;
          this.tennisPowerBar.setVisible(false);
        }
      } else {
        this.tennisHint.setVisible(false);
        if (this.tennisPowerActive) {
          this.tennisPowerActive = false;
          this.tennisPower = 0;
          this.tennisPowerDir = 1;
          this.tennisPowerBar.setVisible(false);
        }
      }
    } else {
      this.tennisHint.setVisible(false);
      this.tennisPowerBar.setVisible(false);
      this.tennisPowerActive = false;
      this.tennisPower = 0;
      this.tennisPowerDir = 1;
      // reset tennis state when entering office
      if (this.tennisBallActive) {
        this.tennisBall?.setVisible(false);
        this.tennisBall = null;
        this.tennisBallActive = false;
      }
    }

    // --- flower picking ---
    if (outside) {
      const { tx: ptx, ty: pty } = this.pixelToTile(playerX, playerY);
      let nearestFlower: { tx: number; ty: number; d: number } | null = null;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ftx = ptx + dx;
          const fty = pty + dy;
          const ft = this.getTileAtLoaded(ftx, fty);
          if (ft === TILE.FLOWER) {
            const fx = ftx * TILE_PX + TILE_PX / 2 + this.offset.x;
            const fy = fty * TILE_PX + TILE_PX / 2 + this.offset.y;
            const d = Math.hypot(playerX - fx, playerY - fy);
            if (!nearestFlower || d < nearestFlower.d) {
              nearestFlower = { tx: ftx, ty: fty, d };
            }
          }
        }
      }
      if (nearestFlower && nearestFlower.d < 80) {
        this.flowerHint
          .setText(isTouchDevice() ? "TAP Pick flower" : "E: Pick flower")
          .setPosition(
            nearestFlower.tx * TILE_PX + TILE_PX / 2 + this.offset.x,
            nearestFlower.ty * TILE_PX + this.offset.y - 10,
          )
          .setVisible(true);
        if (ePressed) {
          this.setTileAt(nearestFlower.tx, nearestFlower.ty, TILE.GRASS);
          this.flowers++;
          this.store.toast(`Picked a flower! 🌸 (${this.flowers})`);
          this.vfx.sparkBurst(
            nearestFlower.tx * TILE_PX + TILE_PX / 2 + this.offset.x,
            nearestFlower.ty * TILE_PX + TILE_PX / 2 + this.offset.y,
            0xff88cc, 10, 60,
          );
          this.audio.uiClick();
        }
      } else {
        this.flowerHint.setVisible(false);
      }
    } else {
      this.flowerHint.setVisible(false);
    }

    // --- dog fetch: throw ball into water ---
    if (outside) {
      let nearestWater: { x: number; y: number; d: number } | null = null;
      const { tx: wptx, ty: wpty } = this.pixelToTile(playerX, playerY);
      for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          const wtx = wptx + dx;
          const wty = wpty + dy;
          const tile = this.getTileAtLoaded(wtx, wty);
          if (tile === TILE.WATER || tile === TILE.POND) {
            const wx = wtx * TILE_PX + TILE_PX / 2 + this.offset.x;
            const wy = wty * TILE_PX + TILE_PX / 2 + this.offset.y;
            const d = Math.hypot(playerX - wx, playerY - wy);
            if (!nearestWater || d < nearestWater.d) {
              nearestWater = { x: wx, y: wy, d };
            }
          }
        }
      }

      const hasBall = this.inventory.hasItem("tennis_ball") || this.inventory.hasItem("stick");
      const hasDog = this.dogs.length > 0;
      if (nearestWater && nearestWater.d < 400 && hasBall && hasDog) {
        this.fetchHint
          .setText(isTouchDevice() ? "TAP Throw ball" : "E: Throw ball 🎾")
          .setPosition(nearestWater.x, nearestWater.y - 20)
          .setVisible(true);
        if (ePressed) {
          // consume the item — try tennis ball first, then stick
          if (!this.inventory.removeItem("tennis_ball")) {
            this.inventory.removeItem("stick");
          }
          // throw ball toward water
          const dx = nearestWater.x - playerX;
          const dy = nearestWater.y - playerY;
          const dist = Math.hypot(dx, dy);
          const speed = 200;
          const vx = (dx / dist) * speed;
          const vy = (dy / dist) * speed;
          const ball = new FetchBall(this.scene, playerX, playerY - 10, vx, vy, nearestWater.x, nearestWater.y);
          this.fetchBalls.push(ball);
          // assign nearest dog to fetch
          let nearestDog: Dog | null = null;
          let nearestDogDist = Infinity;
          for (const dg of this.dogs) {
            const d = Math.hypot(dg.container.x - nearestWater.x, dg.container.y - nearestWater.y);
            if (d < nearestDogDist) {
              nearestDogDist = d;
              nearestDog = dg;
            }
          }
          if (nearestDog) {
            nearestDog.fetchBall(ball);
          }
          this.vfx.sparkBurst(playerX, playerY - 10, 0xccff44, 6, 40);
          this.audio.uiClick();
        }
      } else {
        this.fetchHint.setVisible(false);
      }
    } else {
      this.fetchHint.setVisible(false);
    }

    // --- NPC leprechaun interaction ---
    if (outside && this.leprechauns.length > 0) {
      let nearestLepNPC: Leprechaun | null = null;
      let nearestLepDist = Infinity;
      for (const lep of this.leprechauns) {
        if (!lep.alive_) continue;
        const d = Math.hypot(playerX - lep.container.x, playerY - lep.container.y);
        if (d < nearestLepDist) {
          nearestLepDist = d;
          nearestLepNPC = lep;
        }
      }
      if (nearestLepNPC && nearestLepDist < 100) {
        const step = nearestLepNPC.tradeStep_;
        if (step && this.inventory.getQuantity(step.require) >= step.requireCount) {
          this.lepHint
            .setText(isTouchDevice() ? `TAP Trade ${step.require} → ${step.give}` : `E: Trade ${step.require} → ${step.give} 🍀`)
            .setPosition(nearestLepNPC.container.x, nearestLepNPC.container.y - 30)
            .setVisible(true);
          if (ePressed) {
            nearestLepNPC.tryInteract(time);
          }
        } else if (step) {
          this.lepHint
            .setText(`Bring ${step.requireCount}x ${step.require}`)
            .setPosition(nearestLepNPC.container.x, nearestLepNPC.container.y - 30)
            .setVisible(true);
        } else {
          this.lepHint.setVisible(false);
        }
      } else {
        this.lepHint.setVisible(false);
      }
    } else {
      this.lepHint.setVisible(false);
    }

    // --- cabin building near lake shore ---
    if (outside && !this.cabinBuilt) {
      const { tx: bptx, ty: bpty } = this.pixelToTile(playerX, playerY);
      let nearestShore: { tx: number; ty: number; d: number } | null = null;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const stx = bptx + dx;
          const sty = bpty + dy;
          const t = this.getTileAtLoaded(stx, sty);
          if (t === TILE.LAKE_SHORE) {
            const sx = stx * TILE_PX + TILE_PX / 2 + this.offset.x;
            const sy = sty * TILE_PX + TILE_PX / 2 + this.offset.y;
            const d = Math.hypot(playerX - sx, playerY - sy);
            if (!nearestShore || d < nearestShore.d) {
              nearestShore = { tx: stx, ty: sty, d };
            }
          }
        }
      }
      const woodCount = this.inventory.getQuantity("wood");
      if (nearestShore && nearestShore.d < 100 && woodCount >= 10) {
        this.buildHint
          .setText(isTouchDevice() ? "TAP Build cabin (10 wood)" : "E: Build cabin (10 wood) 🏠")
          .setPosition(nearestShore.tx * TILE_PX + TILE_PX / 2 + this.offset.x, nearestShore.ty * TILE_PX + this.offset.y - 10)
          .setVisible(true);
        if (ePressed) {
          this.inventory.removeItem("wood", 10);
          this.buildCabin(nearestShore.tx, nearestShore.ty);
          this.store.toast("🏠 Built a cozy cabin by the lake!");
          this.vfx.celebrate(
            nearestShore.tx * TILE_PX + TILE_PX / 2 + this.offset.x,
            nearestShore.ty * TILE_PX + TILE_PX / 2 + this.offset.y,
          );
          this.vfx.sparkBurst(
            nearestShore.tx * TILE_PX + TILE_PX / 2 + this.offset.x,
            nearestShore.ty * TILE_PX + TILE_PX / 2 + this.offset.y,
            0xddaa44, 20, 80,
          );
          this.audio.uiClick();
          achievements.unlock("cabin_builder");
        }
      } else if (nearestShore && nearestShore.d < 100 && woodCount < 10) {
        this.buildHint
          .setText(`Need 10 wood (have ${woodCount})`)
          .setPosition(nearestShore.tx * TILE_PX + TILE_PX / 2 + this.offset.x, nearestShore.ty * TILE_PX + this.offset.y - 10)
          .setVisible(true);
      } else {
        this.buildHint.setVisible(false);
      }
    } else {
      this.buildHint.setVisible(false);
    }

    // --- wife NPC interaction ---
    if (outside && this.wife) {
      const wifeDist = Math.hypot(playerX - this.wife.container.x, playerY - this.wife.container.y);
      if (wifeDist < 80) {
        const fishCount = this.inventory.getQuantity("fish");
        const hint = fishCount > 0
          ? (isTouchDevice() ? "TAP Cook fish (+20 HP)" : "E: Cook fish (+20 HP) 🐟")
          : (isTouchDevice() ? "TAP Talk" : "E: Talk 💬");
        this.fishHint
          .setText(hint)
          .setPosition(this.wife.container.x, this.wife.container.y - 30)
          .setVisible(true);
        if (ePressed) {
          this.wife.tryInteract(time);
          achievements.unlock("wife_companion");
        }
      } else {
        this.fishHint.setVisible(false);
      }
    } else {
      this.fishHint.setVisible(false);
    }

    // --- fishing mechanic ---
    if (outside && this.inventory.hasItem("fishing_rod")) {
      // If already fishing, handle reel
      if (this.fishingLine && this.fishingLine.alive_ && this.fishingLine.state_ !== "idle") {
        if (ePressed) {
          const result = this.fishingLine.reel();
          if (result.success && result.fish) {
            this.inventory.addItem("fish", 1);
            this.fishCaught++;
            this.store.toast("🐟 Caught a fish!");
            this.vfx.sparkBurst(playerX, playerY, 0x44aaff, 8, 40);
            this.audio.uiClick();
            achievements.unlock("first_fish");
            if (this.fishCaught >= 10) achievements.unlock("fish_master");
          } else {
            this.store.toast("The fish got away...");
          }
        }
        this.fishHint
          .setText(this.fishingLine.hasBite_ ? "E: REEL IN! 🐟" : "Waiting for a bite...")
          .setPosition(playerX, playerY - 30)
          .setVisible(true);
      } else {
        // Check if near lake water
        const { tx: ftx, ty: fty } = this.pixelToTile(playerX, playerY);
        let nearestLake: { tx: number; ty: number; d: number } | null = null;
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const ltx = ftx + dx;
            const lty = fty + dy;
            const t = this.getTileAtLoaded(ltx, lty);
            if (t === TILE.LAKE) {
              const lx = ltx * TILE_PX + TILE_PX / 2 + this.offset.x;
              const ly = lty * TILE_PX + TILE_PX / 2 + this.offset.y;
              const d = Math.hypot(playerX - lx, playerY - ly);
              if (!nearestLake || d < nearestLake.d) {
                nearestLake = { tx: ltx, ty: lty, d };
              }
            }
          }
        }
        if (nearestLake && nearestLake.d < 120) {
          this.fishHint
            .setText(isTouchDevice() ? "TAP Cast line" : "E: Cast line 🎣")
            .setPosition(playerX, playerY - 30)
            .setVisible(true);
          if (ePressed) {
            if (!this.fishingLine) this.fishingLine = new FishingLine(this);
            const targetX = nearestLake.tx * TILE_PX + TILE_PX / 2 + this.offset.x;
            const targetY = nearestLake.ty * TILE_PX + TILE_PX / 2 + this.offset.y;
            this.fishingLine.cast(playerX, playerY - 10, targetX, targetY, time);
            this.store.toast("🎣 Cast the line! Wait for a bite...");
          }
        } else {
          this.fishHint.setVisible(false);
        }
      }
    } else if (!this.fishingLine || this.fishingLine.state_ === "idle") {
      this.fishHint.setVisible(false);
    }

    // --- axe pickup, leprechaun trade, big tree chopping ---
    if (outside) {
      const { tx: ptx2, ty: pty2 } = this.pixelToTile(playerX, playerY);
      let nearestAxe: { tx: number; ty: number; d: number } | null = null;
      let nearestLep: { tx: number; ty: number; d: number } | null = null;
      let nearestBigTree: { tx: number; ty: number; d: number } | null = null;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const itx = ptx2 + dx;
          const ity = pty2 + dy;
          const t = this.getTileAtLoaded(itx, ity);
          if (t < 0) continue;
          const ix = itx * TILE_PX + TILE_PX / 2 + this.offset.x;
          const iy = ity * TILE_PX + TILE_PX / 2 + this.offset.y;
          const d = Math.hypot(playerX - ix, playerY - iy);
          if (t === TILE.AXE && (!nearestAxe || d < nearestAxe.d)) nearestAxe = { tx: itx, ty: ity, d };
          if (t === TILE.LEPRECHAUN && (!nearestLep || d < nearestLep.d)) nearestLep = { tx: itx, ty: ity, d };
          if (t === TILE.BIG_TREE && (!nearestBigTree || d < nearestBigTree.d)) nearestBigTree = { tx: itx, ty: ity, d };
          if (t === TILE.PALM_TREE) achievements.unlock("palm_grove");
          if (t === TILE.MYSTIC_TREE) achievements.unlock("mystic_grove");
          if (t === TILE.BIG_ROCK) achievements.unlock("big_rock_hunter");
          if (t === TILE.LAKE || t === TILE.LAKE_SHORE) achievements.unlock("lake_discovery");
        }
      }

      if (nearestAxe && nearestAxe.d < 100 && !this.inventory.hasItem("axe")) {
        this.axeHint
          .setText(isTouchDevice() ? "TAP Pick up axe" : "E: Pick up axe")
          .setPosition(nearestAxe.tx * TILE_PX + TILE_PX / 2 + this.offset.x, nearestAxe.ty * TILE_PX + this.offset.y - 10)
          .setVisible(true);
        if (ePressed) {
          this.inventory.addItem("axe");
          this.equipWeapon("axe");
          this.setTileAt(nearestAxe.tx, nearestAxe.ty, TILE.GRASS);
          this.store.toast("Picked up axe! 🪓 Press SPACE to attack.");
          this.vfx.sparkBurst(
            nearestAxe.tx * TILE_PX + TILE_PX / 2 + this.offset.x,
            nearestAxe.ty * TILE_PX + TILE_PX / 2 + this.offset.y,
            0xcc8844, 10, 60,
          );
          this.audio.uiClick();
        }
      } else if (nearestLep && nearestLep.d < 100 && this.inventory.hasGolfClub() && !this.inventory.hasItem("axe")) {
        // Legacy: static tile leprechaun still offers one-time club→axe trade
        const hasWedge = this.inventory.hasItem("wedge");
        const tradeText = hasWedge
          ? (isTouchDevice() ? "TAP Trade magical wedge for axe" : "E: Trade magical wedge for axe")
          : (isTouchDevice() ? "TAP Trade club for axe" : "E: Trade club for axe");
        this.axeHint
          .setText(tradeText)
          .setPosition(nearestLep.tx * TILE_PX + TILE_PX / 2 + this.offset.x, nearestLep.ty * TILE_PX + this.offset.y - 10)
          .setVisible(true);
        if (ePressed) {
          if (hasWedge) {
            this.inventory.removeItem("wedge");
          } else {
            const items = this.inventory.getItems();
            const clubItem = items.find(i => i && (i.id === "golf_club" || i.id === "driver" || i.id === "iron" || i.id === "wedge" || i.id === "putter"));
            if (clubItem) this.inventory.removeItem(clubItem.id);
          }
          this.inventory.addItem("axe");
          this.equipWeapon("axe");
          this.setTileAt(nearestLep.tx, nearestLep.ty, TILE.GRASS);
          const tradeToast = hasWedge
            ? "Traded the magical wedge for axe! The leprechaun cackles and vanishes with his prize. 🍀🪓"
            : "Traded golf club for axe! The leprechaun vanishes. 🍀🪓 Press SPACE to attack.";
          this.store.toast(tradeToast);
          this.vfx.sparkBurst(
            nearestLep.tx * TILE_PX + TILE_PX / 2 + this.offset.x,
            nearestLep.ty * TILE_PX + TILE_PX / 2 + this.offset.y,
            0x44ff44, 16, 80,
          );
          this.vfx.celebrate(
            nearestLep.tx * TILE_PX + TILE_PX / 2 + this.offset.x,
            nearestLep.ty * TILE_PX + TILE_PX / 2 + this.offset.y,
          );
          this.audio.recruit();
          achievements.unlock("leprechaun_trade");
        }
      } else if (nearestBigTree && nearestBigTree.d < 100 && this.inventory.hasItem("axe")) {
        this.axeHint
          .setText(isTouchDevice() ? "TAP Chop big tree" : "E: Chop big tree")
          .setPosition(nearestBigTree.tx * TILE_PX + TILE_PX / 2 + this.offset.x, nearestBigTree.ty * TILE_PX + this.offset.y - 10)
          .setVisible(true);
        if (ePressed) {
          this.setTileAt(nearestBigTree.tx, nearestBigTree.ty, TILE.GRASS);
          this.bigTreesChopped++;
          this.store.toast(`Chopped down a big tree! 🌳 (${this.bigTreesChopped})`);
          this.vfx.sparkBurst(
            nearestBigTree.tx * TILE_PX + TILE_PX / 2 + this.offset.x,
            nearestBigTree.ty * TILE_PX + TILE_PX / 2 + this.offset.y,
            0x4a8a3a, 20, 100,
          );
          this.vfx.shake("medium");
          this.audio.hit();
          achievements.unlock("first_chop");
          if (this.bigTreesChopped >= 20) achievements.unlock("lumberjack");
          // wood + stick drops
          this.inventory.addItem("wood", 2);
          if (this.inventory.getQuantity("wood") >= 10) achievements.unlock("wood_gatherer");
          if (Math.random() < 0.5) this.inventory.addItem("stick", 1);
          // 40% chance of loot
          if (Math.random() < 0.4) {
            achievements.unlock("tree_loot");
            this.store.toast("You found something in the tree! 🎁");
            this.vfx.celebrate(
              nearestBigTree.tx * TILE_PX + TILE_PX / 2 + this.offset.x,
              nearestBigTree.ty * TILE_PX + TILE_PX / 2 + this.offset.y,
            );
          }
        }
      } else {
        this.axeHint.setVisible(false);
      }
    } else {
      this.axeHint.setVisible(false);
    }

    // periodic nemesis save (every 10s)
    if (time - this.lastNemesisSave > 10000) {
      this.lastNemesisSave = time;
      this.saveNemesis();
    }

    // find nearest ghost for dialogue
    let nearestGhost: { id: string; d: number; ghost: GhostNPC } | null = null;
    for (const [id, ghost] of this.ghosts) {
      const d = Math.hypot(playerX - ghost.container.x, playerY - ghost.container.y);
      if (d < 140 && (!nearestGhost || d < nearestGhost.d)) {
        nearestGhost = { id, d, ghost };
      }
    }

    if (nearestGhost && nearestGhost.d < 140) {
      const fa = nearestGhost.ghost.info;
      const line = this.ghostLine(fa);
      this.ghostDialog
        .setText(`${fa.name}: "${line}"\nE: recruit back to office`)
        .setPosition(nearestGhost.ghost.container.x, nearestGhost.ghost.container.y - 130)
        .setVisible(true);
      achievements.unlock("ghost_encounter");
      if (fa.mood === "melancholy") achievements.unlock("melancholy_ghost");
      if (fa.mood === "hostile") achievements.unlock("hostile_ghost");
    } else {
      this.ghostDialog.setVisible(false);
    }

    // E: recruit nearest ghost
    if (ePressed && nearestGhost && nearestGhost.d < 140) {
      this.tryRecruit(nearestGhost.id);
    }
  }

  /** Equip a weapon, updating combat stats. */
  equipWeapon(type: WeaponType): void {
    const def = WEAPONS[type];
    this.weapon = type;
    this.weaponDamage = def.damage;
    this.weaponCooldownMax = def.cooldown;
  }

  /** Cycle to next owned weapon. */
  swapWeapon(): void {
    this.inventory.cycleActive();
    const activeType = this.inventory.getActiveWeaponType();
    if (activeType) {
      this.equipWeapon(activeType);
      const def = WEAPONS[activeType];
      this.store.toast(`Equipped: ${def.name} (${def.damage} dmg)`);
    }
  }

  /** Add void shards and check for upgrade threshold. */
  addShards(count: number): void {
    this.voidShards += count;
    this.store.toast(`+${count} void shard${count > 1 ? "s" : ""} (total: ${this.voidShards})`);
    // Upgrade thresholds: 5 shards → iron sword, 15 → void blade
    if (this.voidShards >= 5 && !this.inventory.hasItem("iron_sword")) {
      this.inventory.addItem("iron_sword");
      this.equipWeapon("iron_sword");
      this.voidShards -= 5;
      this.vfx.celebrate(this.scene.cameras.main.midPoint.x, this.scene.cameras.main.midPoint.y);
      this.store.toast("Forged Iron Sword from void shards! (25 dmg, 600ms cd)");
      achievements.unlock("iron_sword_pickup");
    } else if (this.voidShards >= 15 && !this.inventory.hasItem("void_blade")) {
      this.inventory.addItem("void_blade");
      this.equipWeapon("void_blade");
      this.voidShards -= 15;
      this.vfx.celebrate(this.scene.cameras.main.midPoint.x, this.scene.cameras.main.midPoint.y);
      this.store.toast("Forged Void Blade from void shards! (40 dmg, 400ms cd)");
      achievements.unlock("void_blade_pickup");
    } else if (this.voidShards >= 30 && !this.inventory.hasItem("flame_greatsword")) {
      this.inventory.addItem("flame_greatsword");
      this.equipWeapon("flame_greatsword");
      this.voidShards -= 30;
      this.vfx.celebrate(this.scene.cameras.main.midPoint.x, this.scene.cameras.main.midPoint.y);
      this.store.toast("Forged Flame Greatsword! (60 dmg, AoE splash)");
      achievements.unlock("legendary_weapon");
    } else if (this.voidShards >= 30 && !this.inventory.hasItem("void_daggers")) {
      this.inventory.addItem("void_daggers");
      this.equipWeapon("void_daggers");
      this.voidShards -= 30;
      this.vfx.celebrate(this.scene.cameras.main.midPoint.x, this.scene.cameras.main.midPoint.y);
      this.store.toast("Forged Void Daggers! (35 dmg x2, 300ms cd)");
      achievements.unlock("legendary_weapon");
    } else if (this.voidShards >= 30 && !this.inventory.hasItem("crystal_bow")) {
      this.inventory.addItem("crystal_bow");
      this.equipWeapon("crystal_bow");
      this.voidShards -= 30;
      this.vfx.celebrate(this.scene.cameras.main.midPoint.x, this.scene.cameras.main.midPoint.y);
      this.store.toast("Forged Crystal Bow! (50 dmg, ranged)");
      achievements.unlock("legendary_weapon");
    }
    this.saveNemesis();
  }

  /** Get the captured creature roster. */
  getRoster(): NemesisEntry[] {
    return this.capturedRoster;
  }

  /** Deploy a captured creature as a combat ally near the player. */
  deployAlly(entry: NemesisEntry, playerX: number, playerY: number): boolean {
    if (this.deployedAllies.length >= 3) {
      this.store.toast("Max 3 allies deployed. Recall one first.");
      return false;
    }
    if (this.deployedAllies.some((a) => a.alive_ && a.entryId === entry.id)) {
      this.store.toast(`${entry.name} is already deployed.`);
      return false;
    }
    // Spawn near player
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 30;
    const x = playerX + Math.cos(angle) * dist;
    const y = playerY + Math.sin(angle) * dist;
    const ally = new DeployedAlly(this, x, y, entry);
    this.deployedAllies.push(ally);
    this.vfx.sparkBurst(x, y, 0x44ff88, 12, 60);
    this.store.toast(`${entry.name} deployed!`);
    return true;
  }

  /** Recall all deployed allies. */
  recallAllies(): void {
    for (const a of this.deployedAllies) {
      if (a.alive_) {
        this.vfx.sparkBurst(a.container.x, a.container.y, 0x44ff88, 8, 40);
        a.destroy();
      }
    }
    this.deployedAllies = [];
  }

  /** Get set of currently deployed ally entry IDs. */
  getDeployedIds(): Set<string> {
    const ids = new Set<string>();
    for (const a of this.deployedAllies) {
      if (a.alive_) ids.add(a.entryId);
    }
    return ids;
  }

  /** Save nemesis data + roster to localStorage. */
  saveNemesis(): void {
    try {
      const data = {
        nemesis: this.nemesis.serialize(),
        roster: this.capturedRoster,
        voidShards: this.voidShards,
        inventory: this.inventory.serialize(),
      };
      localStorage.setItem("agentHeights_nemesis", JSON.stringify(data));
    } catch {
      // localStorage might be full or unavailable
    }
  }

  /** Load nemesis data + roster from localStorage. */
  loadNemesis(): void {
    try {
      const raw = localStorage.getItem("agentHeights_nemesis");
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.nemesis) this.nemesis.deserialize(data.nemesis);
      if (data.roster) this.capturedRoster = data.roster;
      if (data.voidShards) this.voidShards = data.voidShards;
      if (data.inventory) this.inventory.deserialize(data.inventory);
    } catch {
      // ignore corrupt data
    }
  }

  /** Toggle the nemesis info panel on/off. */
  toggleNemesisPanel(): void {
    if (this.nemesisPanel) {
      this.nemesisPanel.remove();
      this.nemesisPanel = null;
      return;
    }

    const active = this.nemesis.active();
    const overlay = document.createElement("div");
    overlay.id = "nemesis-codex-modal";

    const card = document.createElement("div");
    card.className = "nemesis-codex";

    // Header
    const header = document.createElement("div");
    header.className = "nemesis-codex-header";
    header.innerHTML = `<span class="nemesis-codex-title">NEMESIS CODEX</span>`;
    const closeBtn = document.createElement("button");
    closeBtn.className = "btn mini";
    closeBtn.textContent = "Close";
    header.appendChild(closeBtn);
    card.appendChild(header);

    // Body
    const body = document.createElement("div");
    body.className = "nemesis-codex-body";

    // ── Active Nemeses section ──
    const activeSection = document.createElement("div");
    const activeTitle = document.createElement("div");
    activeTitle.className = "nemesis-section-title active";
    activeTitle.innerHTML = `Active Nemeses <span class="count">${active.length}</span>`;
    activeSection.appendChild(activeTitle);

    if (active.length === 0) {
      const empty = document.createElement("div");
      empty.className = "nemesis-empty";
      empty.textContent = "No active nemeses. Go antagonize some creatures!";
      activeSection.appendChild(empty);
    } else {
      for (const entry of active.slice(0, 8)) {
        activeSection.appendChild(this.buildNemesisCard(entry, false));
      }
    }
    body.appendChild(activeSection);

    // ── Captured Roster section ──
    const rosterSection = document.createElement("div");
    const rosterTitle = document.createElement("div");
    rosterTitle.className = "nemesis-section-title captured";
    rosterTitle.innerHTML = `Captured Roster <span class="count">${this.capturedRoster.length}</span>`;
    rosterSection.appendChild(rosterTitle);

    if (this.capturedRoster.length === 0) {
      const empty = document.createElement("div");
      empty.className = "nemesis-empty";
      empty.textContent = "No captured creatures. Weaken them and press E to capture!";
      rosterSection.appendChild(empty);
    } else {
      for (const entry of this.capturedRoster.slice(0, 8)) {
        rosterSection.appendChild(this.buildNemesisCard(entry, true));
      }
    }
    body.appendChild(rosterSection);

    card.appendChild(body);

    // Footer — resource stats
    const footer = document.createElement("div");
    footer.className = "nemesis-codex-footer";
    footer.innerHTML = `
      <div class="nemesis-footer-stat"><span class="icon"> shards</span> Void Shards: <span class="val">${this.voidShards}</span></div>
      <div class="nemesis-footer-stat"><span class="icon"> Weapons</span> <span class="val">${this.inventory.getOwnedWeapons().length}</span></div>
    `;
    card.appendChild(footer);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Wire close
    closeBtn.addEventListener("click", () => {
      overlay.remove();
      this.nemesisPanel = null;
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        this.nemesisPanel = null;
      }
    });

    this.nemesisPanel = overlay;
  }

  /** Build a nemesis card element for the codex. */
  private buildNemesisCard(entry: NemesisEntry, captured: boolean): HTMLElement {
    const card = document.createElement("div");
    card.className = `nemesis-card ${captured ? "captured-card" : "active-card"}`;

    // Top row: rank badge + name + title
    const top = document.createElement("div");
    top.className = "nemesis-card-top";
    const badge = document.createElement("span");
    badge.className = `nemesis-rank-badge ${entry.rank}`;
    badge.textContent = entry.rank;
    top.appendChild(badge);
    const nameSpan = document.createElement("span");
    nameSpan.className = "nemesis-card-name";
    nameSpan.textContent = entry.name;
    top.appendChild(nameSpan);
    if (entry.title) {
      const titleSpan = document.createElement("span");
      titleSpan.className = "nemesis-card-title";
      titleSpan.textContent = `— ${entry.title}`;
      top.appendChild(titleSpan);
    }
    card.appendChild(top);

    // HP bar
    const hpRow = document.createElement("div");
    hpRow.className = "nemesis-hp-row";
    const hpLabel = document.createElement("span");
    hpLabel.className = "nemesis-hp-label";
    hpLabel.textContent = "HP";
    hpRow.appendChild(hpLabel);
    const hpBar = document.createElement("div");
    hpBar.className = "nemesis-hp-bar";
    const hpFill = document.createElement("div");
    const hpPct = entry.maxHp > 0 ? (entry.hp / entry.maxHp) * 100 : 0;
    const hpClass = hpPct > 60 ? "high" : hpPct > 30 ? "mid" : "low";
    hpFill.className = `nemesis-hp-fill ${hpClass}`;
    hpFill.style.width = `${hpPct}%`;
    hpBar.appendChild(hpFill);
    hpRow.appendChild(hpBar);
    const hpText = document.createElement("span");
    hpText.className = "nemesis-hp-label";
    hpText.textContent = `${entry.hp}/${entry.maxHp}`;
    hpRow.appendChild(hpText);
    card.appendChild(hpRow);

    // Stat chips
    const stats = document.createElement("div");
    stats.className = "nemesis-stats";
    stats.innerHTML = `
      <span class="nemesis-stat">Kills: <span class="val">${entry.playerKills}</span></span>
      <span class="nemesis-stat">Encounters: <span class="val">${entry.encounters}</span></span>
      <span class="nemesis-stat">DMG: <span class="val">${entry.damage}</span></span>
      <span class="nemesis-stat">SPD: <span class="val">${entry.speed}</span></span>
    `;
    card.appendChild(stats);

    // Traits + weaknesses as badges
    const traits = document.createElement("div");
    traits.className = "nemesis-traits";
    if (entry.traitIds.length > 0) {
      for (const id of entry.traitIds) {
        const t = this.nemesis.getTrait(id);
        const badge = document.createElement("span");
        badge.className = "nemesis-trait";
        badge.textContent = t?.name ?? id;
        if (t?.desc) badge.title = t.desc;
        traits.appendChild(badge);
      }
    } else {
      const none = document.createElement("span");
      none.className = "nemesis-traits-empty";
      none.textContent = "No traits";
      traits.appendChild(none);
    }
    if (entry.weaknessIds.length > 0) {
      for (const id of entry.weaknessIds) {
        const w = this.nemesis.getWeakness(id);
        const badge = document.createElement("span");
        badge.className = "nemesis-weakness";
        badge.textContent = w?.name ?? id;
        if (w?.desc) badge.title = w.desc;
        traits.appendChild(badge);
      }
    }
    card.appendChild(traits);

    return card;
  }

  /** Attempt to capture a weakened creature. */
  private tryCapture(creature: Creature, time: number): void {
    // Success chance: lower HP = higher chance. 25% HP → 75% chance, 1% HP → 99% chance
    const hpRatio = creature.hpRatio;
    const successChance = Math.min(0.99, 1 - hpRatio - 0.1);
    const roll = Math.random();

    if (roll < successChance) {
      // Success!
      const name = creature.nemesisId
        ? this.nemesis.get(creature.nemesisId)?.name ?? "Unknown Beast"
        : "Wild Creature";

      // Mark nemesis as captured if applicable
      if (creature.nemesisId) {
        this.nemesis.markCaptured(creature.nemesisId);
        const entry = this.nemesis.get(creature.nemesisId);
        if (entry) this.capturedRoster.push(entry);
      } else {
        // Create a nemesis entry for non-nemesis creatures
        const { tx, ty } = this.pixelToTile(creature.container.x, creature.container.y);
        const chunkKey = `${Math.floor(tx / CHUNK_SIZE)},${Math.floor(ty / CHUNK_SIZE)}`;
        const entry = this.nemesis.create(1, creature.maxHp, creature.maxHp * 0.5, 70, chunkKey);
        entry.captured = true;
        this.capturedRoster.push(entry);
      }

      // VFX
      this.vfx.sparkBurst(creature.container.x, creature.container.y, 0x44ff88, 20, 100);
      this.vfx.shockwave(creature.container.x, creature.container.y, 0x44ff88, 2);
      this.vfx.celebrate(creature.container.x, creature.container.y);
      this.audio.recruit();
      this.store.toast(`Captured ${name}! Added to roster. (${this.capturedRoster.length} captured)`);
      achievements.unlock("first_capture");
      this.saveNemesis();

      // Remove creature from world
      creature.destroy();
    } else {
      // Failed — creature becomes capture-immune for 5s and flees
      creature.captureImmune = time + 5000;
      this.vfx.sparkBurst(creature.container.x, creature.container.y, 0xff4444, 8, 60);
      this.store.toast("Capture failed! The creature resists.");
      this.audio.uiClick();
    }
  }

  /** Player attacks with equipped weapon — melee cone or ranged projectile. */
  private tryAttack(time: number, playerX: number, playerY: number, playerDir: Dir): void {
    // No weapon — punch does nothing
    if (!this.weapon) {
      if (time - this.lastNoWeaponToast > 3000) {
        this.lastNoWeaponToast = time;
        this.store.toast("You have no weapon. You punch. It does nothing.");
      }
      return;
    }

    // On cooldown
    if (time < this.weaponCooldown) return;

    const def = WEAPONS[this.weapon];
    this.weaponCooldown = time + def.cooldown;

    // Direction vector
    const dirVec = { down: { x: 0, y: 1 }, up: { x: 0, y: -1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[playerDir];
    const facingAngle = Math.atan2(dirVec.y, dirVec.x);

    // Spawn slash VFX arc
    this.spawnSlashVFX(playerX, playerY, facingAngle, def.color, def.range);
    achievements.unlock("first_swing");

    // Attack sound
    this.audio.creatureGrowl(); // reuse as a swing sound for now

    if (def.melee) {
      // Melee: scan creatures in range within ±hitCone degrees of facing
      const hitConeRad = (def.hitCone * Math.PI) / 180;

      for (const c of this.creatures) {
        if (!c.alive_) continue;
        const dx = c.container.x - playerX;
        const dy = c.container.y - playerY;
        const dist = Math.hypot(dx, dy);
        if (dist > def.range) continue;
        const angle = Math.atan2(dy, dx);
        let diff = Math.abs(angle - facingAngle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff <= hitConeRad) {
          c.takeDamage(this.weaponDamage);
          if (def.hitsTwice) c.takeDamage(this.weaponDamage);
        }
      }

      // Also hit beasts
      for (const b of this.beasts) {
        if (!b.alive_) continue;
        const dx = b.container.x - playerX;
        const dy = b.container.y - playerY;
        const dist = Math.hypot(dx, dy);
        if (dist > def.range) continue;
        const angle = Math.atan2(dy, dx);
        let diff = Math.abs(angle - facingAngle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff <= hitConeRad) {
          b.takeDamage(this.weaponDamage);
          if (def.hitsTwice) b.takeDamage(this.weaponDamage);
        }
      }

      // Also hit slugs
      for (const sl of this.slugs) {
        if (!sl.alive_) continue;
        const dx = sl.container.x - playerX;
        const dy = sl.container.y - playerY;
        const dist = Math.hypot(dx, dy);
        if (dist > def.range) continue;
        const angle = Math.atan2(dy, dx);
        let diff = Math.abs(angle - facingAngle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff <= hitConeRad) {
          sl.takeDamage(this.weaponDamage);
          if (def.hitsTwice) sl.takeDamage(this.weaponDamage);
        }
      }

      // Also hit faction NPCs
      this.factions.damageNear(playerX, playerY, def.range, this.weaponDamage);

      // AoE splash for flame greatsword
      if (def.aoeRadius) {
        for (const c of this.creatures) {
          if (!c.alive_) continue;
          const dist = Math.hypot(c.container.x - playerX, c.container.y - playerY);
          if (dist <= def.aoeRadius) {
            c.takeDamage(this.weaponDamage);
          }
        }
        for (const b of this.beasts) {
          if (!b.alive_) continue;
          const dist = Math.hypot(b.container.x - playerX, b.container.y - playerY);
          if (dist <= def.aoeRadius) {
            b.takeDamage(this.weaponDamage);
          }
        }
        for (const sl of this.slugs) {
          if (!sl.alive_) continue;
          const dist = Math.hypot(sl.container.x - playerX, sl.container.y - playerY);
          if (dist <= def.aoeRadius) {
            sl.takeDamage(this.weaponDamage);
          }
        }
        this.vfx.shockwave(playerX, playerY, def.color, 3);
      }
    } else {
      // Ranged: spawn arrow projectile (crystal bow)
      const speed = 400;
      this.arrowVx = dirVec.x * speed;
      this.arrowVy = dirVec.y * speed;
      this.arrowDamage = this.weaponDamage;
      this.arrow = this.scene.add.image(playerX, playerY, "crystal-arrow")
        .setDepth(50)
        .setScale(0.8)
        .setRotation(facingAngle);
      this.arrowTrail = this.scene.add.image(playerX, playerY, "soft-glow")
        .setDisplaySize(16, 16)
        .setTint(0x44ffdd)
        .setAlpha(0.4)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(49);
      this.arrowActive = true;
    }
  }

  /** Spawn a slash arc VFX in the facing direction. */
  private spawnSlashVFX(x: number, y: number, angle: number, color: number, range: number): void {
    const scene = this.scene;
    const slash = scene.add.image(x, y, "slash-vfx")
      .setOrigin(0, 0.5)
      .setScale(range / 64, 1)
      .setRotation(angle)
      .setTint(color)
      .setAlpha(0.8)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(200);

    scene.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: range / 64 * 1.3,
      duration: 200,
      ease: "Cubic.easeOut",
      onComplete: () => slash.destroy(),
    });

    // Small spark burst at arc end
    const endX = x + Math.cos(angle) * range * 0.8;
    const endY = y + Math.sin(angle) * range * 0.8;
    this.vfx.sparkBurst(endX, endY, color, 6, 60);
  }

  /** Called when a leprechaun trade is completed. */
  onLeprechaunTrade(tradesCompleted: number): void {
    achievements.unlock("leprechaun_trade");
    if (tradesCompleted >= 2) achievements.unlock("leprechaun_dealer");
    if (tradesCompleted >= 4) {
      achievements.unlock("leprechaun_master");
      this.lepTradesDone = 4;
    }
  }

  /** Check if the dark twist should trigger — all 4 trades done, cabin built, player near cabin. */
  private updateDarkTwist(time: number, playerX: number, playerY: number): void {
    // Trigger condition: all 4 trades done, wife exists, player near cabin, not yet triggered
    if (!this.darkTwistTriggered && this.lepTradesDone >= 4 && this.wife && this.cabinBuilt) {
      const cabinPx = this.cabinTileX * TILE_PX + TILE_PX / 2 + this.offset.x;
      const cabinPy = this.cabinTileY * TILE_PX + TILE_PX / 2 + this.offset.y;
      const dist = Math.hypot(playerX - cabinPx, playerY - cabinPy);
      if (dist < 200) {
        this.startDarkTwist(time, cabinPx, cabinPy);
      }
      return;
    }

    // Advance the dark twist sequence
    if (this.darkTwistTriggered && this.darkTwistPhase > 0) {
      this.advanceDarkTwist(time, playerX, playerY);
    }

    // Check for empty cabin return after dark twist is complete
    if (this.darkTwistPhase === 8 && this.cabinBuilt) {
      const cabinPx = this.cabinTileX * TILE_PX + TILE_PX / 2 + this.offset.x;
      const cabinPy = this.cabinTileY * TILE_PX + TILE_PX / 2 + this.offset.y;
      const dist = Math.hypot(playerX - cabinPx, playerY - cabinPy);
      if (dist < 100) {
        achievements.unlock("empty_cabin");
      }
    }
  }

  /** Begin the dark twist sequence at the cabin. */
  private startDarkTwist(time: number, cabinX: number, cabinY: number): void {
    this.darkTwistTriggered = true;
    this.darkTwistPhase = 1;
    this.darkTwistTimer = time + 1000; // 1s before lep appears

    // Screen darkening effect
    this.store.toast("Something is wrong... the air grows cold.");
    this.vfx?.sparkBurst(cabinX, cabinY, 0xaa00ff, 30, 120);

    // Spawn the dark leprechaun near the cabin
    const lepX = cabinX + 60;
    const lepY = cabinY + 20;
    const scene = this.scene;
    this.darkLepSprite = scene.add.sprite(0, 0, "leprechaun-npc", 0).setDepth(1).setScale(1.3).setTint(0xaa44ff);
    this.darkLepContainer = scene.add.container(lepX, lepY, [this.darkLepSprite]).setDepth(30 + lepY);
    // glow
    const glow = scene.add.image(0, 0, "void-glow").setDepth(0).setScale(0.8).setAlpha(0.4);
    this.darkLepContainer.add(glow);

    this.darkLepSpeech = scene.add.text(lepX, lepY - 40, "", {
      fontFamily: "'M PLUS Rounded 1c', sans-serif",
      fontSize: "12px",
      color: "#ddaaff",
      backgroundColor: "rgba(20,0,30,0.85)",
      padding: { x: 8, y: 5 },
      wordWrap: { width: 280 },
    }).setOrigin(0.5).setDepth(100);

    achievements.unlock("dark_twist");
  }

  /** Advance through the dark twist phases. */
  private advanceDarkTwist(time: number, playerX: number, playerY: number): void {
    if (!this.darkLepContainer || !this.darkLepSpeech) return;
    const lepX = this.darkLepContainer.x;
    const lepY = this.darkLepContainer.y;

    // Update speech position
    this.darkLepSpeech.setPosition(lepX, lepY - 40);

    // Face the player
    if (this.darkLepSprite) {
      this.darkLepSprite.setFlipX(playerX < lepX);
    }

    switch (this.darkTwistPhase) {
      case 1: // Lep appears, first line
        if (time >= this.darkTwistTimer) {
          this.darkLepSpeech.setText("So... ye finally came home to yer little cabin. How cozy.");
          this.darkTwistPhase = 2;
          this.darkTwistTimer = time + 4000;
        }
        break;

      case 2: // The reveal
        if (time >= this.darkTwistTimer) {
          this.darkLepSpeech.setText("Did ye really think a wife would just... appear? Waiting for ye by a lake? Ye built that cabin with wood I led ye to find.");
          this.darkTwistPhase = 3;
          this.darkTwistTimer = time + 6000;
        }
        break;

      case 3: // Wife is an illusion
        if (time >= this.darkTwistTimer) {
          this.darkLepSpeech.setText("She was never real, human. A pretty illusion. A lure. I needed ye settled... comfortable... distracted. And now ye are.");
          // Start wife fade
          if (this.wife) {
            this.wife.speakFromDarkTwist("I... I thought I was... real? Am I... not... real?", 5000);
            this.scene.tweens.add({
              targets: this.wife.container,
              alpha: 0,
              duration: 4000,
              ease: "Power2",
            });
          }
          this.darkTwistPhase = 4;
          this.darkTwistTimer = time + 5000;
        }
        break;

      case 4: // The theft + void rift
        if (time >= this.darkTwistTimer) {
          this.darkLepSpeech.setText("Thank ye for the gold, the clover, the fish... all of it. Every gift has a price, human. I told ye. I ALWAYS told ye.");
          // Steal gold coins and four_leaf_clover
          const goldStolen = this.inventory.getQuantity("gold_coin");
          if (goldStolen > 0) this.inventory.removeItem("gold_coin", goldStolen);
          if (this.inventory.hasItem("four_leaf_clover")) this.inventory.removeItem("four_leaf_clover");
          this.store.toast("💔 The leprechaun stole your gold and four-leaf clover!");
          this.vfx?.sparkBurst(lepX, lepY, 0xffdd00, 20, 100);

          // Open void rift at cabin center
          const cabinPx = this.cabinTileX * TILE_PX + TILE_PX / 2 + this.offset.x;
          const cabinPy = this.cabinTileY * TILE_PX + TILE_PX / 2 + this.offset.y;
          this.openVoidRift(cabinPx, cabinPy);

          this.darkTwistPhase = 5;
          this.darkTwistTimer = time + 4000;
        }
        break;

      case 5: // Lep vanishes, rift spawns creatures
        if (time >= this.darkTwistTimer) {
          this.darkLepSpeech.setText("The void is hungry, human. And ye fed it well. Goodbye... for now.");
          this.darkTwistPhase = 6;
          this.darkTwistTimer = time + 3000;
        }
        break;

      case 6: // Lep fades, spawn wraiths
        if (time >= this.darkTwistTimer) {
          // Fade out the dark leprechaun
          this.scene.tweens.add({
            targets: this.darkLepContainer,
            alpha: 0,
            duration: 1500,
            ease: "Power2",
            onComplete: () => {
              if (this.darkLepContainer) { this.darkLepContainer.destroy(); this.darkLepContainer = null; }
              if (this.darkLepSpeech) { this.darkLepSpeech.destroy(); this.darkLepSpeech = null; }
              this.darkLepSprite = null;
            },
          });

          // Destroy wife
          if (this.wife) {
            this.wife.destroy();
            this.wife = null;
          }

          // Spawn void wraiths near the cabin
          const cabinPx = this.cabinTileX * TILE_PX + TILE_PX / 2 + this.offset.x;
          const cabinPy = this.cabinTileY * TILE_PX + TILE_PX / 2 + this.offset.y;
          for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const sx = cabinPx + Math.cos(angle) * 80;
            const sy = cabinPy + Math.sin(angle) * 80;
            const { tx, ty } = this.pixelToTile(sx, sy);
            if (this.isCreatureWalkable(tx, ty)) {
              const wraith = new Creature(this, sx, sy, 4); // high hostility = wraith
              this.creatures.push(wraith);
              this.vfx?.sparkBurst(sx, sy, 0xaa00ff, 10, 60);
            }
          }
          this.store.toast("⚠️ Void wraiths emerge from the rift! Defend yourself!");

          // Pulse the rift
          if (this.darkRiftGfx) {
            this.scene.tweens.add({
              targets: this.darkRiftGfx,
              alpha: 0.3,
              duration: 2000,
              yoyo: true,
              repeat: -1,
            });
          }

          this.darkTwistPhase = 7;
          this.darkTwistTimer = time + 8000;
        }
        break;

      case 7: // Rift closes after time
        if (time >= this.darkTwistTimer) {
          // Close the rift
          if (this.darkRiftGfx) {
            this.scene.tweens.add({
              targets: this.darkRiftGfx,
              alpha: 0,
              duration: 2000,
              ease: "Power2",
              onComplete: () => {
                if (this.darkRiftGfx) { this.darkRiftGfx.destroy(); this.darkRiftGfx = null; }
              },
            });
          }
          this.store.toast("The void rift seals... but the cabin is silent now.");
          this.darkTwistPhase = 8; // complete
          achievements.unlock("dark_twist_survivor");
        }
        break;
    }
  }

  /** Open a visual void rift at a position. */
  private openVoidRift(x: number, y: number): void {
    const scene = this.scene;
    if (scene.textures.exists("void-rift")) {
      const riftImg = scene.add.image(x, y, "void-rift").setDepth(28);
      riftImg.setScale(1.2);
      this.darkRiftGfx = riftImg;
    } else {
      const gfx = scene.add.graphics().setDepth(28);
      gfx.fillStyle(0x440066, 0.6);
      gfx.fillEllipse(x, y, 80, 50);
      gfx.lineStyle(3, 0xaa00ff, 0.8);
      gfx.strokeEllipse(x, y, 80, 50);
      gfx.lineStyle(1, 0xddaaff, 0.5);
      gfx.strokeEllipse(x, y, 60, 38);
      this.darkRiftGfx = gfx;
    }

    // Add void glow light
    this.vfx?.sparkBurst(x, y, 0xaa00ff, 40, 150);
  }

  /** Build a cabin at the given tile location (near lake shore). 3x3 structure. */
  private buildCabin(tx: number, ty: number): void {
    // Find a build spot — 2 tiles away from shore, on walkable ground
    let buildX = tx;
    let buildY = ty;
    for (let attempt = 0; attempt < 8; attempt++) {
      const ox = Math.floor((Math.random() - 0.5) * 4);
      const oy = Math.floor((Math.random() - 0.5) * 4);
      const cx = tx + ox;
      const cy = ty + oy;
      // Check 3x3 area is clear (walkable and not water/lake)
      let clear = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const t = this.getTileAtLoaded(cx + dx, cy + dy);
          if (t === TILE.LAKE || t === TILE.WATER || t === TILE.POND || t === TILE.LAVA || t === TILE.VOID) {
            clear = false;
            break;
          }
        }
        if (!clear) break;
      }
      if (clear) {
        buildX = cx;
        buildY = cy;
        break;
      }
    }

    // Place 3x3 cabin:
    //  R R R
    //  W D W   (D=door, W=wall, one wall has window)
    //  W W W
    const layout = [
      [TILE.CABIN_ROOF, TILE.CABIN_ROOF, TILE.CABIN_ROOF],
      [TILE.CABIN_WALL, TILE.CABIN_DOOR, TILE.CABIN_WINDOW],
      [TILE.CABIN_WALL, TILE.CABIN_WALL, TILE.CABIN_WALL],
    ];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tile = layout[dy + 1][dx + 1];
        this.setTileAt(buildX + dx, buildY + dy, tile);
      }
    }
    this.cabinBuilt = true;
    this.cabinTileX = buildX;
    this.cabinTileY = buildY;

    // Spawn wife NPC at the cabin door
    const doorPx = buildX * TILE_PX + TILE_PX / 2 + this.offset.x;
    const doorPy = (buildY + 1) * TILE_PX + TILE_PX / 2 + this.offset.y; // below door
    this.wife = new Wife(this, doorPx, doorPy);

    // Spawn campfire next to the cabin
    const firePx = (buildX - 1) * TILE_PX + TILE_PX / 2 + this.offset.x;
    const firePy = (buildY + 1) * TILE_PX + TILE_PX / 2 + this.offset.y;
    if (this.scene.textures.exists("campfire")) {
      if (!this.scene.anims.exists("campfire-anim")) {
        this.scene.anims.create({
          key: "campfire-anim",
          frames: [
            { key: "campfire", frame: "campfire-0" },
            { key: "campfire", frame: "campfire-1" },
          ],
          frameRate: 6,
          repeat: -1,
        });
      }
      this.campfireSprite = this.scene.add.sprite(firePx, firePy, "campfire", "campfire-0");
      this.campfireSprite.setOrigin(0.5, 0.7);
      this.campfireSprite.play("campfire-anim", true);
    }

    // Give player a fishing rod
    this.inventory.addItem("fishing_rod");
    this.store.toast("🎣 Got a fishing rod! Cast into the lake to catch fish.");
  }

  /** Called when the player catches a fleeing leprechaun that stole an item. */
  onLeprechaunCaught(stolenItem: string): void {
    this.inventory.addItem(stolenItem, 1);
    this.inventory.addItem("gold_coin", 1);
    this.store.toast("🍀 You caught the leprechaun! Got your item back + a gold coin!");
    achievements.unlock("leprechaun_chase");
  }

  /** Called when the dog successfully retrieves a thrown ball. */
  onDogFetch(count: number): void {
    // heal a small amount
    if (this.hp < MAX_HP) {
      this.hp = Math.min(MAX_HP, this.hp + 5);
      this.hud.setHealth(this.hp, MAX_HP);
    }
    // give a small reward — sometimes fish, sometimes stick
    if (Math.random() < 0.4) {
      this.inventory.addItem("fish", 1);
      this.store.toast("🎾 Good boy! The dog brought back a fish too!");
    } else if (Math.random() < 0.3) {
      this.inventory.addItem("stick", 1);
    }
    // return the tennis ball
    this.inventory.addItem("tennis_ball", 1);

    achievements.unlock("fetch_boy");
    if (count >= 10) {
      achievements.unlock("fetch_master");
    }
    if (count >= 25) {
      achievements.unlock("fetch_legend");
    }
  }

  /** Player takes damage — flash red, shake screen, update health bar, maybe teleport home. */
  private takeDamage(amount: number, playerX: number, playerY: number, time: number): void {
    this.hp -= amount;
    this.invulnUntil = time + 500; // 0.5s invulnerability
    this.damageFlash.setFillStyle(0xff0000, 0.4);
    this.scene.tweens.add({
      targets: this.damageFlash,
      fillAlpha: 0,
      duration: 300,
    });
    this.vfx.shake("small");
    this.vfx.damageNumber(playerX, playerY - 40, amount);
    this.audio.hit();
    this.hud.setHealth(this.hp, MAX_HP);

    if (this.hp <= 0) {
      this.hp = MAX_HP * 0.5;
      this.hud.setHealth(this.hp, MAX_HP);
      this.isDying = true;
      achievements.unlock("knocked_out");
      // Recall deployed allies
      this.recallAllies();
      // Record nemesis player kills before clearing
      let promoted = false;
      for (const c of this.creatures) {
        if (c.nemesisId) {
          this.nemesis.recordPlayerKill(c.nemesisId);
          const entry = this.nemesis.get(c.nemesisId);
          if (entry && entry.playerKills === 1 && !promoted) {
            // First kill by this nemesis — promote and toast
            this.nemesis.promote(c.nemesisId);
            this.store.toast(`${entry.name} killed you and was promoted to ${entry.title}!`);
            promoted = true;
          }
        }
        c.destroy();
      }
      if (promoted) this.saveNemesis();
      this.creatures = [];
      for (const s of this.stones) s.destroy();
      this.stones = [];
      for (const f of this.friendlies) f.destroy();
      this.friendlies = [];
      for (const sl of this.slugs) sl.destroy();
      this.slugs = [];
      for (const dg of this.dogs) dg.destroy();
      this.dogs = [];
      for (const fb of this.fetchBalls) fb.destroy();
      this.fetchBalls = [];
      for (const lep of this.leprechauns) lep.destroy();
      this.leprechauns = [];
      this.factions.clear();
      if (this.wife) { this.wife.destroy(); this.wife = null; }
      if (this.fishingLine) { this.fishingLine.destroy(); this.fishingLine = null; }
      if (this.darkLepContainer) { this.darkLepContainer.destroy(); this.darkLepContainer = null; }
      if (this.darkLepSpeech) { this.darkLepSpeech.destroy(); this.darkLepSpeech = null; }
      if (this.darkRiftGfx) { this.darkRiftGfx.destroy(); this.darkRiftGfx = null; }
      this.darkLepSprite = null;
      if (this.arrowActive) {
        this.arrow?.destroy();
        this.arrow = null;
        this.arrowTrail?.destroy();
        this.arrowTrail = null;
        this.arrowActive = false;
      }
      const scene = this.scene as Phaser.Scene;
      const spawn = scene.registry.get("spawnTile") as { x: number; y: number } | undefined;
      if (spawn) {
        const px = spawn.x * TILE_PX + TILE_PX / 2;
        const py = spawn.y * TILE_PX + TILE_PX / 2;
        scene.registry.set("teleportTo", { x: px, y: py });
      }
    }
  }

  private ghostLine(fa: FiredAgent): string {
    const task = fa.lastTask ? fa.lastTask.slice(0, 40) : "nothing";
    const lines: Record<string, string[]> = {
      melancholy: [
        `I remember when I used to work on ${task}...`,
        "Nobody even said goodbye.",
        "The office lights were warmer.",
        "I just wanted to finish my task...",
      ],
      hostile: [
        `You fired me. Over ${task}. Really?`,
        "Don't come near me.",
        "I was good at my job and you know it.",
        "Get lost, boss.",
      ],
      wandering: [
        "Which way is the office...? I forgot.",
        "These fields all look the same.",
        "I think I was working on something...",
        "Have you seen my desk?",
      ],
      dormant: [
        "...zzz... just five more minutes...",
        "...the build is still running...",
        "...pushing to main...",
        "...one more turn...",
      ],
    };
    const pool = lines[fa.mood] ?? lines.wandering;
    const bucket = Math.floor(this.scene.time.now / 4000);
    const seed = (fa.id.charCodeAt(0) + bucket) % pool.length;
    return pool[seed];
  }

  private _destroyed = false;

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.worker?.terminate();
    this.worker = null;
    for (const key of this.chunkLights.keys()) this.removeChunkLights(key);
    for (const g of this.chunkGraphics.values()) g.destroy();
    for (const g of this.ghosts.values()) g.destroy();
    for (const f of this.friendlies) f.destroy();
    for (const sl of this.slugs) sl.destroy();
    for (const dg of this.dogs) dg.destroy();
    for (const fb of this.fetchBalls) fb.destroy();
    for (const lep of this.leprechauns) lep.destroy();
    if (this.wife) this.wife.destroy();
    if (this.fishingLine) this.fishingLine.destroy();
    if (this.campfireSprite) this.campfireSprite.destroy();
    if (this.darkLepContainer) this.darkLepContainer.destroy();
    if (this.darkLepSpeech) this.darkLepSpeech.destroy();
    if (this.darkRiftGfx) this.darkRiftGfx.destroy();
    // Clean up cached canvas textures to free GPU memory
    for (const chunk of this.chunks.values()) {
      this.invalidateChunkTexture(chunk.cx, chunk.cy);
    }
    this.chunks.clear();
    this.chunkGraphics.clear();
    this.ghosts.clear();
    this.friendlies = [];
    this.pendingChunks.clear();
    this.workerRequested.clear();
    this.renderingQueue = [];
    this.nemesisPanel?.remove();
    this.nemesisPanel = null;
    this.vfx.destroy();
    this.lighting.destroy();
    this.hud.destroy();
    this.audio.destroy();
  }
}
