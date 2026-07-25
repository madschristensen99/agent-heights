import Phaser from "phaser";
import { CHUNK_SIZE, TILE, WORLD_TILE_FRAMES, WORLD_VARIANTS } from "../../../shared/types";
import type { FiredAgent } from "../../../shared/types";
import type { Store } from "../store";
import type { Net } from "../net";
import { isTouchDevice } from "../touch";
import { TILE_PX, type Dir } from "./agent";
import { generateCharTexture } from "./chargen";
import { Grid } from "./path";
import { generateChunk, isWalkable, tileDamage, tileSpeed, type Chunk, hostilityAt } from "./worldgen";
import { creatureKey, beastKey, beastDesignName, friendlyCreatureKey, FRIENDLY_CREATURE_COUNT } from "./textures";
import { VFXManager } from "./effects";
import { LightingSystem, type LightSource } from "./lighting";
import { AudioSystem } from "./audio";
import { HUDSystem } from "./hud";
import { achievements } from "./achievements";
import WorldgenWorker from "./worldgen.worker?worker";

/**
 * World offset: the world tile grid starts at the bottom-left corner of the
 * office map. The office occupies pixels (0,0) to (mapW, mapH). World tiles
 * begin at (0, mapH) so the player walks south through the door into the world.
 */
export interface WorldOffset {
  x: number;
  y: number;
}

export const LOAD_RADIUS = 2;
const UNLOAD_RADIUS = 3;

/**
 * Global cache of generated chunk data, keyed by `${worldSeed}:${cx},${cy}`.
 * Survives scene restarts (room changes, theme switches) so chunks are only
 * generated once per world.  Stores raw generated tiles (before overrides);
 * overrides are re-applied on each loadChunk call.
 */
const globalChunkCache = new Map<string, Chunk>();
const MAX_CHUNKS_PER_FRAME = 3;
const MAX_LIGHTS_PER_CHUNK = 8;
const MAX_HP = 100;
const CREATURE_CAP = 30;
const FRIENDLY_CAP = 12;
const STONE_INTERVAL = 2500;
const BEAST_SPAWN_INTERVAL = 8000; // check for legendary beast spawns

// --- Weapon system ---
type WeaponType = "tennis_racket" | "axe" | "iron_sword" | "void_blade" | "flame_greatsword" | "void_daggers" | "crystal_bow";

interface WeaponDef {
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
  tennis_racket:      { damage: 5,  cooldown: 600,  range: 40,  melee: true,  hitCone: 60, color: 0xeeff44 },
  axe:                { damage: 15, cooldown: 800,  range: 50,  melee: true,  hitCone: 60, color: 0xcc8844 },
  iron_sword:         { damage: 25, cooldown: 600,  range: 55,  melee: true,  hitCone: 60, color: 0xcccccc },
  void_blade:         { damage: 40, cooldown: 400,  range: 60,  melee: true,  hitCone: 60, color: 0xaa44ff },
  flame_greatsword:   { damage: 60, cooldown: 1000, range: 100, melee: true,  hitCone: 60, aoeRadius: 100, color: 0xff6600 },
  void_daggers:       { damage: 35, cooldown: 300,  range: 45,  melee: true,  hitCone: 60, hitsTwice: true, color: 0xdd44ff },
  crystal_bow:        { damage: 50, cooldown: 700,  range: 300, melee: false, hitCone: 0,  color: 0x44ffdd },
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
    this.animKey = beastKey(designName);
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
        this.sprite.setFlipX(dx < 0);
      }
    }

    // animate
    if (moving) {
      this.moveTimer += dt;
      const frame = Math.floor(this.moveTimer / 250) % 2 + 1; // frames 1,2
      this.sprite.setFrame(frame);
    } else {
      this.sprite.setFrame(0);
    }

    // pulse aura
    const pulse = 0.15 + Math.sin(this.moveTimer * 0.005) * 0.05;
    this.aura.setAlpha(pulse);

    this.attackCd -= dt;
    if (dist < 50 && this.attackCd <= 0) {
      this.attackCd = this.attackCdMax;
      // attack frame
      this.sprite.setFrame(3);
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

  constructor(world: WorldLayer, x: number, y: number, hostility: number) {
    this.world = world;
    this.maxHp = 30 + hostility * 30;
    this.hp = this.maxHp;
    this.speed = 70 + hostility * 25;
    this.damage = 10 + hostility * 6;
    const scene = world.scene;
    const radius = 14 + hostility * 2;

    this.animKey = creatureKey(hostility);

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

  get alive_(): boolean { return this.alive; }

  update(dt: number, playerX: number, playerY: number): { hit: boolean; damage: number } | null {
    if (!this.alive) return null;
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
        // face direction
        this.sprite.setFlipX(dx < 0);
      }
    }

    // animation: walk vs idle
    if (moving) {
      this.walkTimer += dt;
      const frame = Math.floor(this.walkTimer / 200) % 2 + 1; // frames 1,2
      this.sprite.setFrame(frame);
    } else {
      this.sprite.setFrame(0);
    }

    // attack cooldown
    this.attackCd -= dt;
    if (dist < 40 && this.attackCd <= 0) {
      this.attackCd = 1000;
      // attack animation — frame 3
      this.sprite.setFrame(3);
      this.world.vfx?.sparkBurst(this.container.x, this.container.y, 0xff3333, 4, 60);
      this.world.audio?.creatureGrowl();
      return { hit: true, damage: this.damage };
    }
    return null;
  }

  takeDamage(amount: number): void {
    this.hp -= amount;
    this.world.vfx?.hitFlash(this.sprite);
    this.world.vfx?.sparkBurst(this.container.x, this.container.y, 0xff4444, 8, 80);
    if (this.hp <= 0) {
      this.alive = false;
      this.world.vfx?.deathDissolve(this.container.x, this.container.y, 0x8a3a3a, 1);
      this.world.audio?.death();
      this.container.destroy();
      achievements.unlock("first_blood");
      if (achievements.incStat("creaturesKilled") >= 20) achievements.unlock("creature_slayer");
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
  private sparkleAt = 0;
  private curiousUntil = 0;

  constructor(world: WorldLayer, x: number, y: number, typeIndex: number) {
    this.world = world;
    const scene = world.scene;
    this.animKey = friendlyCreatureKey(typeIndex);
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
          this.sprite.setFlipX(mdx < 0);
        } else {
          this.moving = false;
        }
      }
      this.container.setDepth(20 + this.container.y);
    }

    // animation: walk vs idle vs hop
    if (this.moving) {
      this.walkTimer += dt;
      const frame = Math.floor(this.walkTimer / 250) % 2 + 1; // frames 1,2
      this.sprite.setFrame(frame);
    } else {
      this.sprite.setFrame(0);
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
  private store: Store;
  private net: Net;
  offset: WorldOffset;
  private officeW: number;
  private officeH: number;

  vfx: VFXManager;
  audio: AudioSystem;
  lighting: LightingSystem;
  hud: HUDSystem;

  private chunks = new Map<string, Chunk>();
  private chunkGraphics = new Map<string, Phaser.GameObjects.Container>();
  private chunkLights = new Map<string, LightSource[]>();
  private ghosts = new Map<string, GhostNPC>();

  // --- Web Worker for background chunk generation ---
  private worker: Worker | null = null;
  private pendingChunks = new Map<string, Chunk>();
  private workerRequested = new Set<string>();

  private ghostDialog!: Phaser.GameObjects.Text;
  private recruitedHint!: Phaser.GameObjects.Text;
  private damageFlash!: Phaser.GameObjects.Rectangle;
  private creatures: Creature[] = [];
  private beasts: LegendaryBeast[] = [];
  private stones: Stone[] = [];
  private friendlies: FriendlyCreature[] = [];
  private hp = MAX_HP;
  private currentAmbientBiome: string | null = null;
  private tennisChunks = new Set<string>();
  private lastStoneTime = 0;
  private lastSpawnTime = 0;
  private lastBeastTime = 0;
  private lastFriendlySpawnTime = 0;

  // --- golf state ---
  private hasGolfClub = false;
  private golfBall: Phaser.GameObjects.Image | null = null;
  private golfBallVx = 0;
  private golfBallVy = 0;
  private golfBallActive = false;
  private golfHint!: Phaser.GameObjects.Text;
  private golfPowerBar!: Phaser.GameObjects.Graphics;
  private golfPower = 0; // 0..1 oscillating
  private golfPowerDir = 1; // direction of oscillation
  private golfPowerActive = false; // true when charging (near ball with club)
  private golfHolesSunk = 0;
  private golfStrokes = 0; // strokes on current hole
  private golfTotalStrokes = 0; // total strokes across all holes
  private golfFlagCacheKey = "";
  private golfFlagCache: { flagX: number; flagY: number; foundFlag: boolean } | null = null;

  // --- tennis state ---
  private hasTennisRacket = false;
  private tennisBall: Phaser.GameObjects.Image | null = null;
  private tennisBallVx = 0;
  private tennisBallVy = 0;
  private tennisBallActive = false;
  private tennisHint!: Phaser.GameObjects.Text;
  private tennisPowerBar!: Phaser.GameObjects.Graphics;
  private tennisPower = 0;
  private tennisPowerDir = 1;
  private tennisPowerActive = false;
  private tennisScore = 0;
  private tennisRallies = 0;
  private tennisWallCacheKey = "";
  private tennisWallCache: { wallX: number; wallY: number; foundWall: boolean } | null = null;

  // --- axe / leprechaun / big tree state ---
  private hasAxe = false;
  private axeHint!: Phaser.GameObjects.Text;
  private bigTreesChopped = 0;

  // --- weapon / combat state ---
  private weapon: WeaponType | null = null;
  private weaponCooldown = 0;
  private weaponCooldownMax = 0;
  private weaponDamage = 0;
  private weaponCooldownBar!: Phaser.GameObjects.Graphics;
  private lastNoWeaponToast = 0;

  // --- arrow projectile (crystal bow) ---
  private arrow: Phaser.GameObjects.Image | null = null;
  private arrowVx = 0;
  private arrowVy = 0;
  private arrowDamage = 0;
  private arrowActive = false;
  private arrowTrail: Phaser.GameObjects.Image | null = null;

  // --- flower picking state ---
  private flowers = 0;
  private flowerHint!: Phaser.GameObjects.Text;

  /** Current player HP (read-only access for achievement checks). */
  get playerHp(): number { return this.hp; }
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

    // Initialize visual upgrade systems
    this.vfx = new VFXManager(scene);
    this.audio = new AudioSystem();
    this.lighting = new LightingSystem(scene);
    this.hud = new HUDSystem(scene);

    this.ghostDialog = scene.add
      .text(0, 0, "", {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "14px",
        color: "#ccccdd",
        stroke: "#1a1a22",
        strokeThickness: 3,
        backgroundColor: "#1a1a22",
        padding: { x: 8, y: 6 },
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.8)
      .setDepth(400)
      .setVisible(false);

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
    this.golfHint = scene.add
      .text(0, 0, "", {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "14px",
        color: "#ffffff",
        stroke: "#1a1a22",
        strokeThickness: 3,
        backgroundColor: "#1a1a22",
        padding: { x: 8, y: 6 },
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.8)
      .setDepth(400)
      .setVisible(false);

    // golf power bar — oscillating charge bar above player's head
    this.golfPowerBar = scene.add.graphics().setDepth(410).setVisible(false);

    // tennis interaction hint
    this.tennisHint = scene.add
      .text(0, 0, "", {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "14px",
        color: "#ffffff",
        stroke: "#1a1a22",
        strokeThickness: 3,
        backgroundColor: "#1a1a22",
        padding: { x: 8, y: 6 },
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.8)
      .setDepth(400)
      .setVisible(false);

    // tennis power bar
    this.tennisPowerBar = scene.add.graphics().setDepth(410).setVisible(false);

    // flower picking hint
    this.flowerHint = scene.add
      .text(0, 0, "", {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "14px",
        color: "#ffffff",
        stroke: "#1a1a22",
        strokeThickness: 3,
        backgroundColor: "#1a1a22",
        padding: { x: 8, y: 6 },
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.8)
      .setDepth(400)
      .setVisible(false);

    // axe / leprechaun / big tree interaction hint
    this.axeHint = scene.add
      .text(0, 0, "", {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "14px",
        color: "#ffffff",
        stroke: "#1a1a22",
        strokeThickness: 3,
        backgroundColor: "#1a1a22",
        padding: { x: 8, y: 6 },
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.8)
      .setDepth(400)
      .setVisible(false);

    // weapon cooldown bar — shows above player while on cooldown
    this.weaponCooldownBar = scene.add.graphics().setDepth(410).setVisible(false);

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

  /** Get hostility level at a pixel position (0–5). */
  getHostilityAt(px: number, py: number): number {
    if (!this.isOutside(px, py)) return 0;
    const { tx, ty } = this.pixelToTile(px, py);
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    return hostilityAt(cx, cy);
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
    return playerY >= this.officeH || playerX < 0 || playerX > this.officeW;
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
    // re-render the chunk to reflect the change
    const oldContainer = this.chunkGraphics.get(key);
    if (oldContainer) {
      oldContainer.destroy(true);
      this.chunkGraphics.delete(key);
    }
    this.removeChunkLights(key);
    this.renderChunk(chunk);
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
   *  Returns false for unloaded chunks (safe default — caller just won't move there). */
  private isTileWalkableLoaded(worldTileX: number, worldTileY: number): boolean {
    if (worldTileY < 0) return false;
    const cx = Math.floor(worldTileX / CHUNK_SIZE);
    const cy = Math.floor(worldTileY / CHUNK_SIZE);
    const key = `${cx},${cy}`;
    const chunk = this.chunks.get(key);
    if (!chunk) return false;
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

  /** Get speed multiplier at a pixel position (1 = normal, <1 = slow). */
  getTileSpeedAt(px: number, py: number): number {
    if (!this.isOutside(px, py)) return 1;
    const { tx, ty } = this.pixelToTile(px, py);
    if (ty < 0) return 1;
    return tileSpeed(this.getTileAt(tx, ty));
  }

  /** Check if the player can walk to a pixel position (world collision). */
  canWalk(px: number, py: number): boolean {
    const halfW = 12;
    const checks = [
      { x: px - halfW, y: py - 2 },
      { x: px + halfW, y: py - 2 },
      { x: px, y: py - 10 },
    ];
    for (const p of checks) {
      const { tx, ty } = this.pixelToTile(p.x, p.y);
      if (ty < 0) {
        const otx = Math.floor(p.x / TILE_PX);
        const oty = Math.floor(p.y / TILE_PX);
        if (this.officeGrid?.ok(otx, oty)) continue;
        return false;
      }
      if (!this.isTileWalkable(tx, ty)) return false;
    }
    return true;
  }

  /** Load/unload chunks around the player. Loads at most MAX_CHUNKS_PER_FRAME per frame to avoid spikes.
   *  When vx/vy are provided, chunks in the movement direction are prioritised (predictive preloading). */
  updateChunks(playerX: number, playerY: number, vx = 0, vy = 0): void {
    const { tx, ty } = this.pixelToTile(playerX, playerY);
    const pcx = Math.floor(tx / CHUNK_SIZE);
    const pcy = Math.floor(ty / CHUNK_SIZE);

    // Normalise velocity for directional bias (zero velocity = pure distance sort)
    const vlen = Math.hypot(vx, vy);
    const nvx = vlen > 0 ? vx / vlen : 0;
    const nvy = vlen > 0 ? vy / vlen : 0;

    // Collect needed chunks; sort key combines distance with directional bias
    // so chunks the player is walking toward load before equally-distant ones
    // behind/orthogonal.  The bias term (nvx*dx + nvy*dy) ranges -LOAD_RADIUS..+LOAD_RADIUS;
    // we scale it to compete with distance (0..LOAD_RADIUS²).
    const BIAS_WEIGHT = LOAD_RADIUS;
    const needed: { cx: number; cy: number; priority: number }[] = [];
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

  /** Synchronously preload all chunks around the door exit. Call once after
   *  construction so the player doesn't hit a freeze when first walking outside. */
  preloadDoorChunks(): void {
    const needed = this.getDoorChunkList();
    for (const n of needed) {
      this.loadChunk(n.cx, n.cy);
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
    const chunk = generateChunk(this.store.worldSeed, cx, cy);
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
    this.worker.postMessage({ worldSeed: this.store.worldSeed, cx, cy });
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
  private chunkTexKey(cx: number, cy: number): string {
    return `chunk-rt-${this.store.worldSeed}:${cx},${cy}`;
  }

  /** Remove a cached chunk canvas texture so the next renderChunk redraws it. */
  private invalidateChunkTexture(cx: number, cy: number): void {
    const texKey = this.chunkTexKey(cx, cy);
    if (this.scene.textures.exists(texKey)) {
      this.scene.textures.remove(texKey);
    }
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
    };

    const tileToFrame = (tile: number, variant: number): number => {
      if (tile === TILE.WATER) return 21;
      if (tile >= 22) return TILE.GRASS + variant * WORLD_TILE_FRAMES;
      return tile + variant * WORLD_TILE_FRAMES;
    };

    // Edge autotiling: tiles that get a colored border where they meet different terrain
    const edgeTileColors: Record<number, string> = {
      [TILE.WATER]: "rgba(42,80,110,0.7)",
      [TILE.POND]: "rgba(40,70,50,0.6)",
      [TILE.LAVA]: "rgba(30,8,4,0.8)",
      [TILE.ACID]: "rgba(50,80,16,0.6)",
    };
    const EDGE_WIDTH = 4;

    // Render static tiles to a persistent canvas texture (survives scene restarts).
    // On subsequent loads, we skip the ~1024 draw calls and just create an Image.
    if (!this.scene.textures.exists(texKey)) {
      const canvasTex = this.scene.textures.createCanvas(texKey, chunkPxSize, chunkPxSize);
      if (canvasTex) {
        const ctx = canvasTex.getContext();
        const worldTilesTex = this.scene.textures.get("world-tiles");

        const drawTexToCanvas = (textureKey: string, px: number, py: number, w: number = TILE_PX, h: number = TILE_PX) => {
          if (!this.scene.textures.exists(textureKey)) return;
          const tex = this.scene.textures.get(textureKey);
          const fr = tex.get(0);
          if (fr) {
            ctx.drawImage(
              fr.source.image as CanvasImageSource,
              fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight,
              px, py, w, h,
            );
          }
        };

        // Pass 1: draw base tiles with per-tile variant selection
        for (let y = 0; y < CHUNK_SIZE; y++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            const tile = chunk.tiles[y * CHUNK_SIZE + x];
            const px = x * TILE_PX;
            const py = y * TILE_PX;
            const worldTileX = chunk.cx * CHUNK_SIZE + x;
            const worldTileY = chunk.cy * CHUNK_SIZE + y;
            // Position hash for variant — deterministic per world tile
            let h = (worldTileX * 374761393 + worldTileY * 668265263) | 0;
            h = (h ^ (h >>> 13)) | 0;
            const variant = (h & 0x7fffffff) % WORLD_VARIANTS;
            const frame = tileToFrame(tile, variant);

            // Draw base tile
            const fr = worldTilesTex.get(frame);
            if (fr) {
              ctx.drawImage(
                fr.source.image as CanvasImageSource,
                fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight,
                px, py, TILE_PX, TILE_PX,
              );
            }

            // Tennis objects (ball/racket/net) sit on court surface, not grass
            if (tile === TILE.TENNIS_BALL || tile === TILE.TENNIS_RACKET || tile === TILE.TENNIS_NET) {
              drawTexToCanvas("tennis-court", px, py);
            }

            // Draw overlay textures (golf items, trees, etc.)
            const overlayKey = overlayTextures[tile];
            if (overlayKey) {
              if (tile === TILE.LEPRECHAUN) {
                // leprechaun rendered at 2x scale, centered on tile
                drawTexToCanvas(overlayKey, px - TILE_PX / 2, py - TILE_PX / 2, TILE_PX * 2, TILE_PX * 2);
              } else {
                drawTexToCanvas(overlayKey, px, py);
              }
            }
          }
        }

        // Pass 2: edge autotiling — draw borders where liquid/hazard tiles meet different terrain
        for (let y = 0; y < CHUNK_SIZE; y++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            const tile = chunk.tiles[y * CHUNK_SIZE + x];
            const edgeColor = edgeTileColors[tile];
            if (!edgeColor) continue;

            const px = x * TILE_PX;
            const py = y * TILE_PX;
            const worldTileX = chunk.cx * CHUNK_SIZE + x;
            const worldTileY = chunk.cy * CHUNK_SIZE + y;

            // Check 4 cardinal neighbors (use chunk data for interior, cross-chunk for borders)
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

            ctx.fillStyle = edgeColor;
            // Draw edge band on sides facing different terrain (skip if neighbor not loaded = -1)
            if (nTile >= 0 && nTile !== tile) ctx.fillRect(px, py, TILE_PX, EDGE_WIDTH);
            if (sTile >= 0 && sTile !== tile) ctx.fillRect(px, py + TILE_PX - EDGE_WIDTH, TILE_PX, EDGE_WIDTH);
            if (wTile >= 0 && wTile !== tile) ctx.fillRect(px, py, EDGE_WIDTH, TILE_PX);
            if (eTile >= 0 && eTile !== tile) ctx.fillRect(px + TILE_PX - EDGE_WIDTH, py, EDGE_WIDTH, TILE_PX);
          }
        }

        canvasTex.refresh();
      }
    }

    // Create an Image from the (now cached) canvas texture — one GPU draw call
    const img = this.scene.add.image(ox, oy, texKey);
    img.setOrigin(0, 0);
    container.add(img);

    // Water animation sprites and light sources are dynamic — always recreated.
    // Water: only create sprites for a subset of tiles to limit per-frame overhead.
    // The static frame is already baked into the canvas texture.
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

        // Fountain: 3x3 animated sprite centered on the fountain tile
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

        // Add tile-based light sources for special tiles (capped per chunk for perf)
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

    this.chunkGraphics.set(key, container);
    this.chunkLights.set(key, chunkLightList);
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
      const hostility = hostilityAt(cx, cy);
      const biomeName = ["meadow", "forest", "ruins", "wasteland", "void", "infernal"][Math.round(hostility)];
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
      if (this.creatures.length < CREATURE_CAP && time - this.lastSpawnTime > 600 + Math.random() * 1200) {
        if (hostility >= 1 && hostility < 5) {
          const spawnCount = 2 + Math.floor(hostility / 2);
          let spawnedAny = false;
          for (let s = 0; s < spawnCount; s++) {
            // try up to 5 positions to find a walkable tile
            let placed = false;
            for (let attempt = 0; attempt < 5 && !placed; attempt++) {
              const angle = Math.random() * Math.PI * 2;
              const dist = 250 + Math.random() * 300;
              const sx = playerX + Math.cos(angle) * dist;
              const sy = playerY + Math.sin(angle) * dist;
              const { tx, ty } = this.pixelToTile(sx, sy);
              if (this.isCreatureWalkable(tx, ty)) {
                this.creatures.push(new Creature(this, sx, sy, hostility));
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
            const typeIndex = Math.floor(Math.random() * FRIENDLY_CREATURE_COUNT);
            this.friendlies.push(new FriendlyCreature(this, sx, sy, typeIndex));
          }
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
        const candidates = BEASTS.filter((b) => hostility >= b.minHostility);
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
      // heal in office
      if (this.hp < MAX_HP) {
        this.hp = Math.min(MAX_HP, this.hp + 20 * (dt / 1000));
      }
    }

    // load/unload chunks — when inside, preload around the door exit so chunks
    // are ready by the time the player walks outside (avoids first-exit hitch)
    if (outside) {
      this.updateChunks(playerX, playerY, vx, vy);
    } else {
      this.updateChunks(this.officeW / 2, this.officeH + TILE_PX);
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

    // --- update friendly creatures ---
    for (const f of this.friendlies) {
      f.update(time, dt, playerX, playerY);
      const fd = Math.hypot(playerX - f.container.x, playerY - f.container.y);
      if (fd > 900) f.destroy();
    }
    this.friendlies = this.friendlies.filter((f) => f.alive_);

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

    // --- tile hazard damage (water, lava, void) ---
    if (outside) {
      const { tx, ty } = this.pixelToTile(playerX, playerY);
      const tile = this.getTileAt(tx, ty);
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
        // friction — ball slows down
        this.golfBallVx *= 0.985;
        this.golfBallVy *= 0.985;
        // check if ball reached the flag
        const { tx: btx, ty: bty } = this.pixelToTile(this.golfBall.x, this.golfBall.y);
        const ballTile = this.getTileAt(btx, bty);
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
          const scoreLabel = this.golfStrokes === 1 ? "HOLE IN ONE!" : this.golfStrokes <= 3 ? "Great round!" : this.golfStrokes <= 5 ? "Nice!" : "Sunk it!";
          this.store.toast(`${scoreLabel} 🏌️ Hole ${this.golfHolesSunk}: ${this.golfStrokes} stroke${this.golfStrokes > 1 ? "s" : ""}. Total: ${this.golfTotalStrokes}`);
          achievements.unlock("hole_in_one");
          this.audio.recruit(); // celebratory sound
          // reset strokes for next hole
          this.golfStrokes = 0;
          // spawn ball at the next hole's tee box
          const spawned = this.spawnBallAtNextHole(btx, bty);
          if (spawned) {
            this.store.toast(`Ball spawned at hole ${this.golfHolesSunk + 1} tee. ⛳`);
          } else {
            this.store.toast("No more holes nearby — explore to find more! 🏌️");
          }
        } else if (Math.hypot(this.golfBallVx, this.golfBallVy) < 5) {
          // ball stopped — place it on the ground so player can hit it again
          this.golfBallActive = false;
          this.setTileAt(btx, bty, TILE.GOLF_BALL);
          this.golfBall?.setVisible(false);
          this.golfBall = null;
          this.store.toast(`Ball stopped. Stroke ${this.golfStrokes}. Walk up and hit again! 🏌️`);
        }
      }

      // scan nearby tiles for golf items (use loaded-only to avoid mid-frame chunk gen)
      let nearestClub: { tx: number; ty: number; d: number } | null = null;
      let nearestBall: { tx: number; ty: number; d: number } | null = null;
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
        }
      }

      // show hint and handle E press
      if (nearestClub && nearestClub.d < 100 && !this.hasGolfClub) {
        this.golfHint
          .setText(isTouchDevice() ? "TAP Pick up golf club" : "E: Pick up golf club")
          .setPosition(nearestClub.tx * TILE_PX + TILE_PX / 2 + this.offset.x, nearestClub.ty * TILE_PX + this.offset.y - 10)
          .setVisible(true);
        if (ePressed) {
          this.hasGolfClub = true;
          this.setTileAt(nearestClub.tx, nearestClub.ty, TILE.TEE_BOX);
          this.store.toast("Picked up golf club! ⛳");
          this.vfx.sparkBurst(
            nearestClub.tx * TILE_PX + TILE_PX / 2 + this.offset.x,
            nearestClub.ty * TILE_PX + TILE_PX / 2 + this.offset.y,
            0x88cc88, 10, 60,
          );
          achievements.unlock("club_pickup");
        }
      } else if (nearestBall && nearestBall.d < 100 && this.hasGolfClub && !this.golfBallActive) {
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
        }
        const ballPx = nearestBall.tx * TILE_PX + TILE_PX / 2 + this.offset.x;
        const ballPy = nearestBall.ty * TILE_PX + TILE_PX / 2 + this.offset.y;

        // power bar is active — oscillate and show above player
        this.golfPowerActive = true;
        this.golfHint
          .setText(`E: Swing! (stroke ${this.golfStrokes + 1})`)
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
        const power = this.golfPower;
        // color: blue (0x4488ff) at 0 → yellow (0xffdd44) at 0.5 → red (0xff4444) at 1
        const r = Math.floor(0x44 + (0xff - 0x44) * power);
        const g = Math.floor(0x88 + (0x44 - 0x88) * power);
        const b = Math.floor(0xff + (0x44 - 0xff) * power);
        const fillColor = (r << 16) | (g << 8) | b;

        this.golfPowerBar.clear();
        // background
        this.golfPowerBar.fillStyle(0x000000, 0.6);
        this.golfPowerBar.fillRoundedRect(barX - 2, barY - 2, barW + 4, barH + 4, 3);
        // fill
        this.golfPowerBar.fillStyle(fillColor, 1);
        this.golfPowerBar.fillRoundedRect(barX, barY, barW * power, barH, 2);
        // border
        this.golfPowerBar.lineStyle(1, 0xffffff, 0.5);
        this.golfPowerBar.strokeRoundedRect(barX, barY, barW, barH, 2);
        this.golfPowerBar.setVisible(true);

        if (ePressed) {
          // capture power: 0.15 (min) to 1.0 (max) → speed 120 to 550
          const hitSpeed = 120 + power * 430;
          if (foundFlag) {
            const dx = flagX - ballPx;
            const dy = flagY - ballPy;
            const dist = Math.hypot(dx, dy);
            this.golfBallVx = (dx / dist) * hitSpeed;
            this.golfBallVy = (dy / dist) * hitSpeed;
          } else {
            this.golfBallVx = 0;
            this.golfBallVy = hitSpeed;
          }
          this.golfBall = this.scene.add.image(ballPx, ballPy, "golf-ball").setDepth(50).setScale(0.7);
          this.golfBallActive = true;
          this.golfStrokes++;
          this.setTileAt(nearestBall.tx, nearestBall.ty, TILE.TEE_BOX);
          this.vfx.sparkBurst(ballPx, ballPy, 0xffffff, 8 + Math.floor(power * 16), 60 + power * 80);
          this.audio.golfSwing();
          achievements.unlock("first_swing");
          const powerLabel = power > 0.75 ? "POWER DRIVE!" : power > 0.4 ? "Nice shot!" : "Soft tap.";
          this.store.toast(`Fore! ${powerLabel} Stroke ${this.golfStrokes}. 🏏`);
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
      if (nearestRacket && nearestRacket.d < 100 && !this.hasTennisRacket) {
        this.tennisHint
          .setText(isTouchDevice() ? "TAP Pick up tennis racket" : "E: Pick up tennis racket")
          .setPosition(nearestRacket.tx * TILE_PX + TILE_PX / 2 + this.offset.x, nearestRacket.ty * TILE_PX + this.offset.y - 10)
          .setVisible(true);
        if (ePressed) {
          this.hasTennisRacket = true;
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
      } else if (nearestTennisBall && nearestTennisBall.d < 100 && this.hasTennisRacket && !this.tennisBallActive) {
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
          this.tennisBall = this.scene.add.image(ballPx, ballPy, "tennis-ball").setDepth(50).setScale(0.7);
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
        }
      }

      if (nearestAxe && nearestAxe.d < 100 && !this.hasAxe) {
        this.axeHint
          .setText(isTouchDevice() ? "TAP Pick up axe" : "E: Pick up axe")
          .setPosition(nearestAxe.tx * TILE_PX + TILE_PX / 2 + this.offset.x, nearestAxe.ty * TILE_PX + this.offset.y - 10)
          .setVisible(true);
        if (ePressed) {
          this.hasAxe = true;
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
      } else if (nearestLep && nearestLep.d < 100 && this.hasGolfClub && !this.hasAxe) {
        this.axeHint
          .setText(isTouchDevice() ? "TAP Trade club for axe" : "E: Trade club for axe")
          .setPosition(nearestLep.tx * TILE_PX + TILE_PX / 2 + this.offset.x, nearestLep.ty * TILE_PX + this.offset.y - 10)
          .setVisible(true);
        if (ePressed) {
          this.hasGolfClub = false;
          this.hasAxe = true;
          this.equipWeapon("axe");
          this.setTileAt(nearestLep.tx, nearestLep.ty, TILE.GRASS);
          this.store.toast("Traded golf club for axe! The leprechaun vanishes. 🍀🪓 Press SPACE to attack.");
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
      } else if (nearestBigTree && nearestBigTree.d < 100 && this.hasAxe) {
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
      for (const c of this.creatures) c.destroy();
      this.creatures = [];
      for (const s of this.stones) s.destroy();
      this.stones = [];
      for (const f of this.friendlies) f.destroy();
      this.friendlies = [];
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
    this.vfx.destroy();
    this.lighting.destroy();
    this.hud.destroy();
    this.audio.destroy();
  }
}
