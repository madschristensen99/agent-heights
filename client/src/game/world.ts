import Phaser from "phaser";
import { CHUNK_SIZE, TILE } from "../../../shared/types";
import type { FiredAgent } from "../../../shared/types";
import type { Store } from "../store";
import type { Net } from "../net";
import { TILE_PX, type Dir } from "./agent";
import { Grid } from "./path";
import { generateChunk, isWalkable, tileDamage, tileSpeed, type Chunk, hostilityAt } from "./worldgen";

/**
 * World offset: the world tile grid starts at the bottom-left corner of the
 * office map. The office occupies pixels (0,0) to (mapW, mapH). World tiles
 * begin at (0, mapH) so the player walks south through the door into the world.
 */
export interface WorldOffset {
  x: number;
  y: number;
}

const LOAD_RADIUS = 2;
const UNLOAD_RADIUS = 3;
const MAX_HP = 100;
const CREATURE_CAP = 20;
const STONE_INTERVAL = 2500;
const BEAST_SPAWN_INTERVAL = 15000; // check for legendary beast spawns

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

/** A legendary beast — rare, powerful, with a boss bar. */
class LegendaryBeast {
  container: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Arc;
  private eyeL: Phaser.GameObjects.Arc;
  private eyeR: Phaser.GameObjects.Arc;
  private crown: Phaser.GameObjects.Triangle;
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

    this.body = scene.add.circle(0, 0, def.radius, def.color, 1)
      .setStrokeStyle(3, 0x000000, 0.6);
    this.eyeL = scene.add.circle(-def.radius * 0.35, -def.radius * 0.25, 5, def.eyeColor, 1);
    this.eyeR = scene.add.circle(def.radius * 0.35, -def.radius * 0.25, 5, def.eyeColor, 1);
    // crown above head
    this.crown = scene.add.triangle(0, -def.radius - 8, -8, 6, 0, -6, 8, 6, 0xffdd44, 1)
      .setStrokeStyle(1, 0x886600, 1);
    this.hpBar = scene.add.graphics().setDepth(30);

    this.container = scene.add.container(x, y, [this.body, this.eyeL, this.eyeR, this.crown])
      .setDepth(25 + y);
  }

  get alive_(): boolean { return this.alive; }

  update(dt: number, playerX: number, playerY: number): { hit: boolean; damage: number } | null {
    if (!this.alive) return null;
    const dx = playerX - this.container.x;
    const dy = playerY - this.container.y;
    const dist = Math.hypot(dx, dy);

    if (dist < this.aggroRange && dist > 40) {
      const step = this.speed * (dt / 1000);
      const nx = this.container.x + (dx / dist) * step;
      const ny = this.container.y + (dy / dist) * step;
      const { tx, ty } = this.world.pixelToTile(nx, ny);
      if (this.world.isTileWalkable(tx, ty)) {
        this.container.setPosition(nx, ny);
        this.container.setDepth(25 + ny);
      }
    }

    this.attackCd -= dt;
    if (dist < 50 && this.attackCd <= 0) {
      this.attackCd = this.attackCdMax;
      return { hit: true, damage: this.damage };
    }

    // draw hp bar above beast
    this.drawHpBar();
    return null;
  }

  private drawHpBar(): void {
    const g = this.hpBar;
    g.clear();
    const w = 60;
    const h = 6;
    const x = this.container.x - w / 2;
    const y = this.container.y - this.body.radius - 20;
    const pct = Math.max(0, this.hp / this.maxHp);
    g.fillStyle(0x000000, 0.7);
    g.fillRect(x - 2, y - 2, w + 4, h + 4);
    g.fillStyle(0x330000, 1);
    g.fillRect(x, y, w, h);
    g.fillStyle(0xff3333, 1);
    g.fillRect(x, y, w * pct, h);
  }

  takeDamage(amount: number): void {
    this.hp -= amount;
    this.body.setFillStyle(0xffffff, 1);
    this.world.scene.time.delayedCall(80, () => {
      if (this.alive) this.body.setFillStyle(0x2a0a0a, 1);
    });
    if (this.hp <= 0) {
      this.alive = false;
      this.hpBar.clear();
      this.world.particleBurst(this.container.x, this.container.y, 0xffdd44, 24, 120);
      this.world.particleBurst(this.container.x, this.container.y, 0xff4444, 16, 80);
      this.world.scene.cameras.main.shake(400, 0.015);
      this.container.destroy();
    }
  }

  destroy(): void {
    this.alive = false;
    this.hpBar.clear();
    this.container.destroy();
  }
}

/** A hostile creature that chases the player. */
class Creature {
  container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Arc;
  private eyeL: Phaser.GameObjects.Arc;
  private eyeR: Phaser.GameObjects.Arc;
  private hp: number;
  maxHp: number;
  private speed: number;
  private damage: number;
  private attackCd = 0;
  private alive = true;
  private world: WorldLayer;

  constructor(world: WorldLayer, x: number, y: number, hostility: number) {
    this.world = world;
    this.maxHp = 30 + hostility * 30;
    this.hp = this.maxHp;
    this.speed = 70 + hostility * 25;
    this.damage = 10 + hostility * 6;
    const scene = world.scene;
    const radius = 14 + hostility * 2;
    const colors = [0x4a6a3a, 0x6a4a3a, 0x8a3a3a, 0x6a2a2a, 0x4a1a4a, 0x2a0a0a];
    const color = colors[Math.min(hostility, 5)];

    this.sprite = scene.add.circle(0, 0, radius, color, 1).setStrokeStyle(2, 0x000000, 0.4);
    this.eyeL = scene.add.circle(-radius * 0.3, -radius * 0.2, 3, 0xff3333, 1);
    this.eyeR = scene.add.circle(radius * 0.3, -radius * 0.2, 3, 0xff3333, 1);
    this.container = scene.add.container(x, y, [this.sprite, this.eyeL, this.eyeR]).setDepth(20 + y);
  }

  get alive_(): boolean { return this.alive; }

  update(dt: number, playerX: number, playerY: number): { hit: boolean; damage: number } | null {
    if (!this.alive) return null;
    const dx = playerX - this.container.x;
    const dy = playerY - this.container.y;
    const dist = Math.hypot(dx, dy);

    // chase player if within aggro range
    const aggroRange = 300;
    if (dist < aggroRange && dist > 30) {
      const step = this.speed * (dt / 1000);
      const nx = this.container.x + (dx / dist) * step;
      const ny = this.container.y + (dy / dist) * step;
      // simple collision: only move if target tile is walkable
      const { tx, ty } = this.world.pixelToTile(nx, ny);
      if (this.world.isTileWalkable(tx, ty)) {
        this.container.setPosition(nx, ny);
        this.container.setDepth(20 + ny);
      }
    }

    // attack cooldown
    this.attackCd -= dt;
    if (dist < 40 && this.attackCd <= 0) {
      this.attackCd = 1000;
      return { hit: true, damage: this.damage };
    }
    return null;
  }

  takeDamage(amount: number): void {
    this.hp -= amount;
    this.sprite.setFillStyle(0xffffff, 1);
    this.world.scene.time.delayedCall(80, () => {
      if (this.alive) this.sprite.setFillStyle(0x6a4a3a, 1);
    });
    if (this.hp <= 0) {
      this.alive = false;
      this.world.particleBurst(this.container.x, this.container.y, 0x8a3a3a, 12, 80);
      this.container.destroy();
    }
  }

  destroy(): void {
    this.alive = false;
    this.container.destroy();
  }
}

/** A flying stone projectile. */
class Stone {
  sprite: Phaser.GameObjects.Arc;
  private vx: number;
  private vy: number;
  private life: number;
  private damage: number;
  private alive = true;
  private world: WorldLayer;
  constructor(world: WorldLayer, x: number, y: number, vx: number, vy: number, damage: number) {
    this.world = world;
    this.vx = vx;
    this.vy = vy;
    this.life = 3000; // 3 seconds
    this.damage = damage;
    this.sprite = world.scene.add.circle(x, y, 8, 0x888890, 1).setStrokeStyle(2, 0x444450, 1).setDepth(50);
  }

  get alive_(): boolean { return this.alive; }

  update(dt: number, playerX: number, playerY: number): { hit: boolean; damage: number } | null {
    if (!this.alive) return null;
    this.life -= dt;
    if (this.life <= 0) {
      this.destroy();
      return null;
    }
    this.sprite.x += this.vx * (dt / 1000);
    this.sprite.y += this.vy * (dt / 1000);
    const dist = Math.hypot(this.sprite.x - playerX, this.sprite.y - playerY);
    if (dist < 30) {
      this.world.particleBurst(this.sprite.x, this.sprite.y, 0xaaaaaa, 8, 60);
      this.destroy();
      return { hit: true, damage: this.damage };
    }
    return null;
  }

  destroy(): void {
    this.alive = false;
    this.sprite.destroy();
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

    this.shadow = scene.add.ellipse(0, 0, 44, 16, 0x000000, 0.3).setDepth(0);
    this.sprite = scene.add.sprite(0, 0, `char-${info.sprite}`, 0).setOrigin(0.5, 1).setDepth(5);
    this.sprite.setTint(0x8888aa);

    this.label = scene.add
      .text(0, -108, info.name, {
        fontFamily: "monospace",
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
    const c = `char-${this.info.sprite}`;

    if (!this.moving && time > this.wanderAt) {
      const range = 6;
      for (let tries = 0; tries < 10; tries++) {
        const dx = Math.floor((Math.random() - 0.5) * range * 2);
        const dy = Math.floor((Math.random() - 0.5) * range * 2);
        const tx = Math.floor((this.container.x - this.world.offset.x) / TILE_PX) + dx;
        const ty = Math.floor((this.container.y - this.world.offset.y) / TILE_PX) + dy;
        if (this.world.isTileWalkable(tx, ty)) {
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

  private chunks = new Map<string, Chunk>();
  private chunkGraphics = new Map<string, Phaser.GameObjects.Container>();
  private ghosts = new Map<string, GhostNPC>();

  private compass!: Phaser.GameObjects.Text;
  private ghostDialog!: Phaser.GameObjects.Text;
  private recruitedHint!: Phaser.GameObjects.Text;
  private healthBar!: Phaser.GameObjects.Graphics;
  private damageFlash!: Phaser.GameObjects.Rectangle;
  private creatures: Creature[] = [];
  private beasts: LegendaryBeast[] = [];
  private stones: Stone[] = [];
  private hp = MAX_HP;
  private lastStoneTime = 0;
  private lastSpawnTime = 0;
  private lastBeastTime = 0;
  private officeGrid: Grid | null = null;
  private invulnUntil = 0;
  private beastBanner!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, store: Store, net: Net, officeW: number, officeH: number) {
    this.scene = scene;
    this.store = store;
    this.net = net;
    this.officeW = officeW;
    this.officeH = officeH;
    // world tiles start just below the office
    this.offset = { x: 0, y: officeH };

    // compass — fixed to screen
    this.compass = scene.add
      .text(16, 16, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#aaaacc",
        stroke: "#1a1a22",
        strokeThickness: 3,
      })
      .setResolution(4)
      .setOrigin(0, 0)
      .setScale(0.8)
      .setDepth(950)
      .setScrollFactor(0)
      .setVisible(false);

    this.ghostDialog = scene.add
      .text(0, 0, "", {
        fontFamily: "monospace",
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
        fontFamily: "monospace",
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

    // health bar — fixed to screen top-right, above lighting overlays
    this.healthBar = scene.add.graphics().setDepth(950).setScrollFactor(0).setVisible(false);

    // beast banner — shows legendary beast name when one is near
    this.beastBanner = scene.add
      .text(scene.scale.width / 2, 60, "", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#ffcc44",
        stroke: "#1a0a00",
        strokeThickness: 4,
      })
      .setResolution(4)
      .setOrigin(0.5, 0)
      .setScale(0.8)
      .setDepth(950)
      .setScrollFactor(0)
      .setVisible(false);

    // damage flash overlay — red tint on hit
    this.damageFlash = scene.add
      .rectangle(0, 0, scene.scale.width, scene.scale.height, 0xff0000, 0)
      .setOrigin(0, 0)
      .setDepth(950)
      .setScrollFactor(0);

    this.drawHealthBar();
  }

  /** Whether the player is outside the office map bounds (in the world). */
  isOutside(playerX: number, playerY: number): boolean {
    return playerY >= this.officeH || playerX < 0 || playerX > this.officeW;
  }

  /** Convert world pixels to world tile coordinates. */
  pixelToTile(px: number, py: number): { tx: number; ty: number } {
    return {
      tx: Math.floor((px - this.offset.x) / TILE_PX),
      ty: Math.floor((py - this.offset.y) / TILE_PX),
    };
  }

  /** Get the tile type at world tile coordinates. */
  private getTileAt(worldTileX: number, worldTileY: number): number {
    if (worldTileY < 0) return TILE.WALL;
    const cx = Math.floor(worldTileX / CHUNK_SIZE);
    const cy = Math.floor(worldTileY / CHUNK_SIZE);
    const key = `${cx},${cy}`;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = generateChunk(this.store.worldSeed, cx, cy);
      this.chunks.set(key, chunk);
      this.renderChunk(chunk);
    }
    const localX = ((worldTileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localY = ((worldTileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.tiles[localY * CHUNK_SIZE + localX];
  }

  /** Check if a world tile is walkable. Generates the chunk if needed. */
  isTileWalkable(worldTileX: number, worldTileY: number): boolean {
    if (worldTileY < 0) return false;
    const cx = Math.floor(worldTileX / CHUNK_SIZE);
    const cy = Math.floor(worldTileY / CHUNK_SIZE);
    const key = `${cx},${cy}`;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = generateChunk(this.store.worldSeed, cx, cy);
      this.chunks.set(key, chunk);
      this.renderChunk(chunk);
    }
    const localX = ((worldTileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localY = ((worldTileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return isWalkable(chunk.tiles[localY * CHUNK_SIZE + localX]);
  }

  /** Set the office walkability grid so world collision can check office tiles. */
  setOfficeGrid(grid: Grid): void {
    this.officeGrid = grid;
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

  /** Load/unload chunks around the player. */
  updateChunks(playerX: number, playerY: number): void {
    const { tx, ty } = this.pixelToTile(playerX, playerY);
    const pcx = Math.floor(tx / CHUNK_SIZE);
    const pcy = Math.floor(ty / CHUNK_SIZE);

    for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy++) {
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
        const ncy = pcy + dy;
        if (ncy < 0) continue;
        this.loadChunk(pcx + dx, ncy);
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - pcx) > UNLOAD_RADIUS || Math.abs(chunk.cy - pcy) > UNLOAD_RADIUS) {
        this.chunkGraphics.get(key)?.destroy();
        this.chunkGraphics.delete(key);
        this.chunks.delete(key);
      }
    }
  }

  private loadChunk(cx: number, cy: number): void {
    // never generate chunks above the office (cy < 0)
    if (cy < 0) return;
    const key = `${cx},${cy}`;
    if (this.chunks.has(key)) return;
    const chunk = generateChunk(this.store.worldSeed, cx, cy);
    this.chunks.set(key, chunk);
    this.renderChunk(chunk);
  }

  private renderChunk(chunk: Chunk): void {
    const key = `${chunk.cx},${chunk.cy}`;
    const container = this.scene.add.container(0, 0).setDepth(-1);
    const ox = chunk.cx * CHUNK_SIZE * TILE_PX + this.offset.x;
    const oy = chunk.cy * CHUNK_SIZE * TILE_PX + this.offset.y;

    // Map TILE enum values to world tileset frame indices.
    // The tileset has 24 frames: 0-21 map to TILE.GRASS..TILE.WATER,
    // frames 22-23 are water animation frames 1 and 2.
    const tileToFrame = (tile: number): number => {
      if (tile === TILE.WATER) return 21; // frame 0 — animation handled separately
      return tile; // TILE enum values 0-20 map directly to frames 0-20
    };

    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const tile = chunk.tiles[y * CHUNK_SIZE + x];
        const px = ox + x * TILE_PX;
        const py = oy + y * TILE_PX;
        const frame = tileToFrame(tile);

        const sprite = this.scene.add.sprite(px, py, "world-tiles", frame);
        sprite.setOrigin(0, 0);
        sprite.setDepth(-1);

        // Animate water tiles by cycling frames 21-23
        if (tile === TILE.WATER) {
          sprite.play({ key: "water-anim", repeat: -1 }, true);
        }

        container.add(sprite);
      }
    }

    this.chunkGraphics.set(key, container);
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
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const p = this.scene.add.circle(x, y, 2 + Math.random() * 2, color, 0.9).setDepth(40);
      this.scene.tweens.add({
        targets: p,
        x: x + vx,
        y: y + vy,
        alpha: 0,
        scale: 0.2,
        duration: 400 + Math.random() * 200,
        onComplete: () => p.destroy(),
      });
    }
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
    this.particleBurst(ghost.container.x, ghost.container.y, 0x4cb866, 16, 70);
    this.showRecruitedHint(ghost.info.name, cx, cy);
  }

  private showRecruitedHint(name: string, px: number, py: number): void {
    this.recruitedHint
      .setText(`${name} is coming back to the office!`)
      .setPosition(px, py - 120)
      .setVisible(true);
    this.scene.time.delayedCall(3000, () => this.recruitedHint.setVisible(false));
  }

  /** Called every frame. Manages chunks, ghosts, compass, hazards, and interaction. */
  update(time: number, dt: number, playerX: number, playerY: number, ePressed: boolean): void {
    const outside = this.isOutside(playerX, playerY);

    // show compass + health bar when outside
    if (outside) {
      this.compass.setVisible(true);
      const doorX = this.officeW / 2;
      const doorY = this.officeH;
      const dx = doorX - playerX;
      const dy = doorY - playerY;
      const distTiles = Math.round(Math.hypot(dx, dy) / TILE_PX);
      const arrow = this.compassArrow(dx, dy);
      const { tx, ty } = this.pixelToTile(playerX, playerY);
      const cx = Math.floor(tx / CHUNK_SIZE);
      const cy = Math.floor(ty / CHUNK_SIZE);
      const hostility = hostilityAt(cx, cy);
      const biomeName = ["MEADOW", "FOREST", "RUINS", "WASTELAND", "VOID", "INFERNAL"][hostility];
      this.compass.setText(`${arrow} OFFICE: ${distTiles}  |  ${biomeName}\nQ: TELEPORT HOME`);
      this.healthBar.setVisible(true);

      // --- spawn creatures based on hostility ---
      if (this.creatures.length < CREATURE_CAP && time - this.lastSpawnTime > 800 + Math.random() * 1500) {
        this.lastSpawnTime = time;
        if (hostility >= 1) {
          const spawnCount = 1 + Math.floor(hostility / 2);
          for (let s = 0; s < spawnCount; s++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 300 + Math.random() * 250;
            const sx = playerX + Math.cos(angle) * dist;
            const sy = playerY + Math.sin(angle) * dist;
            const { tx, ty } = this.pixelToTile(sx, sy);
            if (this.isTileWalkable(tx, ty)) {
              this.creatures.push(new Creature(this, sx, sy, hostility));
            }
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
        const stoneSpeed = 200 + hostility * 30;
        const damage = 5 + hostility * 3;
        this.stones.push(new Stone(this, ox, oy, Math.cos(targetAngle) * stoneSpeed, Math.sin(targetAngle) * stoneSpeed, damage));
      }

      // --- roll for legendary beast spawn ---
      if (this.beasts.length < 3 && time - this.lastBeastTime > BEAST_SPAWN_INTERVAL) {
        this.lastBeastTime = time;
        // pick a beast that matches current hostility
        const candidates = BEASTS.filter((b) => hostility >= b.minHostility);
        if (candidates.length > 0) {
          // weighted random by rarity (rarer = less likely)
          const roll = Math.random();
          let chosen = candidates[0];
          for (const b of candidates) {
            if (roll < b.rarity) {
              chosen = b;
              break;
            }
          }
          // spawn at distance
          const angle = Math.random() * Math.PI * 2;
          const dist = 500 + Math.random() * 200;
          const sx = playerX + Math.cos(angle) * dist;
          const sy = playerY + Math.sin(angle) * dist;
          const { tx, ty } = this.pixelToTile(sx, sy);
          if (this.isTileWalkable(tx, ty)) {
            this.beasts.push(new LegendaryBeast(this, chosen, sx, sy));
            this.beastBanner.setText(`⚠ ${chosen.name} APPROACHES ⚠`).setVisible(true);
            this.scene.time.delayedCall(4000, () => this.beastBanner.setVisible(false));
          }
        }
      }
    } else {
      this.compass.setVisible(false);
      this.healthBar.setVisible(false);
      // clear creatures and beasts when back in office
      for (const c of this.creatures) c.destroy();
      this.creatures = [];
      for (const b of this.beasts) b.destroy();
      this.beasts = [];
      for (const s of this.stones) s.destroy();
      this.stones = [];
      this.beastBanner.setVisible(false);
      // heal in office
      if (this.hp < MAX_HP) {
        this.hp = Math.min(MAX_HP, this.hp + 20 * (dt / 1000));
        this.drawHealthBar();
      }
    }

    // load/unload chunks
    this.updateChunks(playerX, playerY);

    // update ghosts
    for (const ghost of this.ghosts.values()) {
      ghost.update(time, dt);
    }

    // --- update creatures ---
    for (const c of this.creatures) {
      const hit = c.update(dt, playerX, playerY);
      if (hit && time > this.invulnUntil) {
        this.takeDamage(hit.damage, playerX, playerY, time);
      }
    }
    this.creatures = this.creatures.filter((c) => c.alive_);

    // --- update legendary beasts ---
    let nearestBeast: LegendaryBeast | null = null;
    let nearestBeastDist = Infinity;
    for (const b of this.beasts) {
      const hit = b.update(dt, playerX, playerY);
      if (hit && time > this.invulnUntil) {
        this.takeDamage(hit.damage, playerX, playerY, time);
      }
      const bd = Math.hypot(playerX - b.container.x, playerY - b.container.y);
      if (bd < nearestBeastDist) {
        nearestBeastDist = bd;
        nearestBeast = b;
      }
    }
    this.beasts = this.beasts.filter((b) => b.alive_);

    // show beast banner when one is near
    if (nearestBeast && nearestBeastDist < 600) {
      this.beastBanner.setText(`⚠ ${nearestBeast.name} — ${Math.round(nearestBeastDist / TILE_PX)} tiles`).setVisible(true);
    } else if (this.beasts.length === 0) {
      this.beastBanner.setVisible(false);
    }

    // --- update stones ---
    for (const s of this.stones) {
      const hit = s.update(dt, playerX, playerY);
      if (hit && time > this.invulnUntil) {
        this.takeDamage(hit.damage, playerX, playerY, time);
      }
    }
    this.stones = this.stones.filter((s) => s.alive_);

    // --- tile hazard damage (water, lava, void) ---
    if (outside) {
      const { tx, ty } = this.pixelToTile(playerX, playerY);
      const tile = this.getTileAt(tx, ty);
      const dmg = tileDamage(tile) * (dt / 1000);
      if (dmg > 0 && (dmg === Infinity || time > this.invulnUntil)) {
        const isVoid = dmg === Infinity;
        this.takeDamage(isVoid ? MAX_HP : dmg, playerX, playerY, time);
        // void implosion — purple particles sucked inward
        if (isVoid) {
          this.particleBurst(playerX, playerY, 0xaa44ff, 20, 100);
          this.particleBurst(playerX, playerY, 0x000000, 12, 60);
          this.scene.cameras.main.shake(500, 0.02);
        } else if (tile === TILE.LAVA) {
          // lava burn — orange sparks
          this.particleBurst(playerX, playerY, 0xff6020, 8, 50);
        }
      }
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
    } else {
      this.ghostDialog.setVisible(false);
    }

    // E: recruit nearest ghost
    if (ePressed && nearestGhost && nearestGhost.d < 140) {
      this.tryRecruit(nearestGhost.id);
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
    // screen shake
    this.scene.cameras.main.shake(200, 0.008);
    this.drawHealthBar();

    if (this.hp <= 0) {
      // knocked out — teleport back to office with partial health
      this.hp = MAX_HP * 0.5;
      this.drawHealthBar();
      // clear all threats
      for (const c of this.creatures) c.destroy();
      this.creatures = [];
      for (const s of this.stones) s.destroy();
      this.stones = [];
      // teleport via the scene registry
      const scene = this.scene as Phaser.Scene;
      const spawn = scene.registry.get("spawnTile") as { x: number; y: number } | undefined;
      if (spawn) {
        const px = spawn.x * TILE_PX + TILE_PX / 2;
        const py = spawn.y * TILE_PX + TILE_PX / 2;
        scene.registry.set("teleportTo", { x: px, y: py });
      }
    }
  }

  /** Draw the health bar in the top-right corner. */
  private drawHealthBar(): void {
    const g = this.healthBar;
    g.clear();
    const w = 120;
    const h = 16;
    const x = this.scene.scale.width - w - 16;
    const y = 16;
    const pct = Math.max(0, this.hp / MAX_HP);

    // outer frame
    g.fillStyle(0x000000, 0.7);
    g.fillRoundedRect(x - 4, y - 4, w + 8, h + 8, 5);
    g.lineStyle(1, 0xffffff, 0.12);
    g.strokeRoundedRect(x - 4, y - 4, w + 8, h + 8, 5);
    // background
    g.fillStyle(0x2a2a2a, 1);
    g.fillRoundedRect(x, y, w, h, 3);

    // fill — color shifts from green to red
    const r = Math.floor(255 * (1 - pct));
    const gr = Math.floor(200 * pct);
    g.fillStyle((r << 16) | (gr << 8), 1);
    g.fillRoundedRect(x, y, w * pct, h, 3);
    // top highlight on fill
    g.fillStyle(0xffffff, 0.15);
    g.fillRoundedRect(x, y, w * pct, 4, 3);
  }

  private compassArrow(dx: number, dy: number): string {
    if (Math.abs(dx) < 32 && Math.abs(dy) < 32) return "*";
    const angle = Math.atan2(dy, dx);
    const dirs = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
    const i = Math.round(((angle + Math.PI) / (Math.PI * 2)) * 8) % 8;
    return dirs[i];
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

  destroy(): void {
    for (const g of this.chunkGraphics.values()) g.destroy();
    for (const g of this.ghosts.values()) g.destroy();
    this.chunks.clear();
    this.chunkGraphics.clear();
    this.ghosts.clear();
  }
}
