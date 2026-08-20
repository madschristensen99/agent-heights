import Phaser from "phaser";
import type { ThemeConflict, ThemeConflictFaction } from "../../../shared/types";
import type { WorldLayer } from "./world";

/** Faction identifiers — "A" or "B". */
export type FactionSide = "A" | "B";

/** Map a movement vector to one of 8 direction indices (0=S, 1=SE, 2=E, 3=NE, 4=N, 5=NW, 6=W, 7=SW). */
function dirFromVelocity(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  return ((Math.round((Math.PI / 2 - Math.atan2(dy, dx)) / (Math.PI / 4)) % 8) + 8) % 8;
}

/** Check if a sprite's texture is a 3D-rendered 8-directional spritesheet (≥1024px wide). */
function has8Directions(sprite: Phaser.GameObjects.Sprite): boolean {
  const src = sprite.texture.getSourceImage() as HTMLImageElement;
  return src.width >= 8 * 128;
}

const DIRS_3D = 8;

/**
 * A faction NPC — a soldier from one of two opposing factions.
 * They patrol, engage enemies of the other faction, and can hit the player
 * with crossfire if the player wanders too close.
 */
export class FactionNPC {
  container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;
  private banner: Phaser.GameObjects.Rectangle;
  private hp: number;
  private maxHp: number;
  private speed: number;
  private damage: number;
  private attackCd = 0;
  private alive = true;
  private world: WorldLayer;
  side: FactionSide;
  faction: ThemeConflictFaction;
  private moveTimer = 0;
  private lastDir = 0;
  private patrolTargetX = 0;
  private patrolTargetY = 0;
  private patrolTimer = 0;

  get alive_(): boolean { return this.alive; }

  constructor(world: WorldLayer, side: FactionSide, faction: ThemeConflictFaction, x: number, y: number, hostility: number) {
    this.world = world;
    this.side = side;
    this.faction = faction;
    this.maxHp = 30 + hostility * 15;
    this.hp = this.maxHp;
    this.speed = 60 + hostility * 12;
    this.damage = 6 + hostility * 3;
    const scene = world.scene;
    const radius = 12;

    this.shadow = scene.add.ellipse(0, 2, radius * 2.8, radius * 0.9, 0x000000, 0.25);

    // Use creature sprite as base — faction NPCs reuse creature textures
    const texKey = `creature-${world.worldTheme?.id ?? "default"}-${Math.min(Math.floor(hostility), 4)}`;
    this.sprite = scene.add.sprite(0, 0, texKey, 0).setOrigin(0.5, 0.7).setScale(1.0);

    // Faction color banner — small rectangle above the NPC
    this.banner = scene.add.rectangle(0, -18, 8, 4, faction.color, 1).setDepth(22);

    this.container = scene.add.container(x, y, [this.shadow, this.sprite, this.banner]).setDepth(20 + y);

    // Tint the sprite slightly toward faction color for visual distinction
    this.sprite.setTint(faction.color);

    this.pickNewPatrolTarget();
  }

  private pickNewPatrolTarget(): void {
    const range = 200;
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * range;
    this.patrolTargetX = this.container.x + Math.cos(angle) * dist;
    this.patrolTargetY = this.container.y + Math.sin(angle) * dist;
    this.patrolTimer = 3000 + Math.random() * 4000;
  }

  /**
   * Update the faction NPC.
   * @param dt Delta time in ms
   * @param playerX Player pixel X
   * @param playerY Player pixel Y
   * @param enemies Array of opposing faction NPCs to target
   * @returns { hit, damage } if the NPC hit the player with crossfire, null otherwise
   */
  update(
    dt: number,
    playerX: number,
    playerY: number,
    enemies: FactionNPC[],
  ): { hit: boolean; damage: number } | null {
    if (!this.alive) return null;

    this.patrolTimer -= dt;
    this.attackCd -= dt;

    // Find nearest living enemy
    let nearestEnemy: FactionNPC | null = null;
    let nearestDist = Infinity;
    for (const e of enemies) {
      if (!e.alive_) continue;
      const d = Math.hypot(e.container.x - this.container.x, e.container.y - this.container.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearestEnemy = e;
      }
    }

    // Determine target: enemy if close, else patrol point, else player if very close
    let targetX: number;
    let targetY: number;
    let aggro = false;

    if (nearestEnemy && nearestDist < 350) {
      // Engage enemy faction NPC
      targetX = nearestEnemy.container.x;
      targetY = nearestEnemy.container.y;
      aggro = true;
    } else {
      // Check if player is very close — crossfire risk
      const pdx = playerX - this.container.x;
      const pdy = playerY - this.container.y;
      const pdist = Math.hypot(pdx, pdy);
      if (pdist < 120) {
        // Player in proximity — attack if in range, but don't chase
        targetX = this.container.x;
        targetY = this.container.y;
        if (pdist < 40 && this.attackCd <= 0) {
          this.attackCd = 1200;
          this.world.vfx?.sparkBurst(this.container.x, this.container.y, this.faction.color, 4, 50);
          return { hit: true, damage: Math.floor(this.damage * 0.5) }; // crossfire — reduced damage
        }
      } else {
        // Patrol
        targetX = this.patrolTargetX;
        targetY = this.patrolTargetY;
        if (this.patrolTimer <= 0) {
          this.pickNewPatrolTarget();
        }
      }
    }

    // Move toward target
    const dx = targetX - this.container.x;
    const dy = targetY - this.container.y;
    const dist = Math.hypot(dx, dy);

    let moving = false;
    if (dist > 30) {
      const step = this.speed * (dt / 1000);
      const nx = this.container.x + (dx / dist) * step;
      const ny = this.container.y + (dy / dist) * step;
      const { tx, ty } = this.world.pixelToTile(nx, ny);
      if (this.world.isCreatureWalkable(tx, ty)) {
        this.container.setPosition(nx, ny);
        this.container.setDepth(20 + ny);
        moving = true;
        this.lastDir = dirFromVelocity(dx, dy);
      } else if (!aggro) {
        // Can't reach patrol target — pick a new one
        this.pickNewPatrolTarget();
      }
    } else if (!aggro && this.patrolTimer <= 0) {
      this.pickNewPatrolTarget();
    }

    // Attack enemy NPC if in range
    if (aggro && nearestEnemy && nearestDist < 36 && this.attackCd <= 0) {
      this.attackCd = 1000;
      this.world.vfx?.sparkBurst(this.container.x, this.container.y, this.faction.color, 6, 70);
      this.world.vfx?.damageNumber(nearestEnemy.container.x, nearestEnemy.container.y - 20, this.damage);
      nearestEnemy.takeDamage(this.damage);
    }

    // Animation
    const is3d = has8Directions(this.sprite);
    if (is3d) {
      if (moving) {
        this.moveTimer += dt;
        const anim = Math.floor(this.moveTimer / 200) % 2 + 1;
        this.sprite.setFrame(anim * DIRS_3D + this.lastDir);
      } else {
        this.sprite.setFrame(this.lastDir);
      }
    } else {
      this.sprite.setFlipX(this.lastDir >= 4 && this.lastDir <= 6);
      if (moving) {
        this.moveTimer += dt;
        const frame = Math.floor(this.moveTimer / 200) % 2 + 1;
        this.sprite.setFrame(frame);
      } else {
        this.sprite.setFrame(0);
      }
    }

    return null;
  }

  takeDamage(amount: number): void {
    this.hp -= amount;
    this.world.vfx?.hitFlash(this.sprite);
    if (this.hp <= 0) {
      this.alive = false;
      this.world.vfx?.deathDissolve(this.container.x, this.container.y, this.faction.color, 0.8);
      this.world.vfx?.sparkBurst(this.container.x, this.container.y, this.faction.color, 12, 100);
    }
  }

  destroy(): void {
    this.container.destroy();
  }
}

/** Maximum faction NPCs per side on screen. */
const FACTION_CAP_PER_SIDE = 6;

/** Minimum hostility for faction spawns. */
const FACTION_MIN_HOSTILITY = 3;

/** Spawn interval in ms. */
const FACTION_SPAWN_INTERVAL = 4000;

/**
 * Manages faction NPC spawning, updates, and cleanup for a themed world.
 * Owned by WorldLayer and updated each frame when the player is outside.
 */
export class FactionManager {
  private world: WorldLayer;
  private conflict: ThemeConflict | null;
  private factionA: FactionNPC[] = [];
  private factionB: FactionNPC[] = [];
  private lastSpawnTime = 0;
  private toastShown = false;
  private minHostility: number;
  private spawnInterval: number;
  private capPerSide: number;
  private territoryGfx: Phaser.GameObjects.Graphics | null = null;
  private territoryUpdateTimer = 0;

  constructor(world: WorldLayer) {
    this.world = world;
    this.conflict = world.worldTheme?.conflict ?? null;
    this.minHostility = this.conflict?.minHostility ?? FACTION_MIN_HOSTILITY;
    this.spawnInterval = this.conflict?.spawnInterval ?? FACTION_SPAWN_INTERVAL;
    this.capPerSide = this.conflict?.capPerSide ?? FACTION_CAP_PER_SIDE;
  }

  get hasConflict(): boolean { return this.conflict !== null; }

  /** Current total faction NPC count. */
  get count(): number { return this.factionA.length + this.factionB.length; }

  /** Update all faction NPCs. Returns player crossfire hit info or null. */
  update(dt: number, playerX: number, playerY: number, hostility: number): { hit: boolean; damage: number } | null {
    if (!this.conflict) return null;

    // Spawn faction NPCs in conflict zones (hostility >= minHostility)
    if (hostility >= this.minHostility && this.count < this.capPerSide * 2) {
      const time = this.world.scene.time.now;
      if (time - this.lastSpawnTime > this.spawnInterval) {
        this.lastSpawnTime = time;
        this.spawnNearby(playerX, playerY, hostility);
      }
    }

    // Update faction A — they target faction B
    let crossfire: { hit: boolean; damage: number } | null = null;
    for (const npc of this.factionA) {
      const hit = npc.update(dt, playerX, playerY, this.factionB);
      if (hit && !crossfire) crossfire = hit;
    }
    // Update faction B — they target faction A
    for (const npc of this.factionB) {
      const hit = npc.update(dt, playerX, playerY, this.factionA);
      if (hit && !crossfire) crossfire = hit;
    }

    // Clean up dead NPCs after a delay (let death animation play)
    this.cleanupDead();

    // Update territory zone markers periodically
    this.territoryUpdateTimer -= dt;
    if (this.territoryUpdateTimer <= 0) {
      this.territoryUpdateTimer = 500;
      this.updateTerritoryMarkers();
    }

    return crossfire;
  }

  /** Draw semi-transparent colored circles on the ground around faction NPC clusters. */
  private updateTerritoryMarkers(): void {
    if (!this.conflict) return;

    // Lazily create the graphics object
    if (!this.territoryGfx) {
      this.territoryGfx = this.world.scene.add.graphics().setDepth(5);
    }
    this.territoryGfx.clear();

    // Draw a colored circle around each living faction NPC
    const drawTerritory = (npcs: FactionNPC[], color: number) => {
      for (const npc of npcs) {
        if (!npc.alive_) continue;
        this.territoryGfx!.fillStyle(color, 0.08);
        this.territoryGfx!.fillCircle(npc.container.x, npc.container.y, 80);
        this.territoryGfx!.lineStyle(2, color, 0.15);
        this.territoryGfx!.strokeCircle(npc.container.x, npc.container.y, 80);
      }
    };

    drawTerritory(this.factionA, this.conflict.factionA.color);
    drawTerritory(this.factionB, this.conflict.factionB.color);
  }

  /** Spawn a pair of faction NPCs near the player — one from each side. */
  private spawnNearby(playerX: number, playerY: number, hostility: number): void {
    if (!this.conflict) return;

    // Show toast on first spawn
    if (!this.toastShown) {
      this.toastShown = true;
      this.world.store.toast(`⚔️ ${this.conflict.factionA.name} vs ${this.conflict.factionB.name} — war zone!`);
    }

    // Spawn faction A NPC
    if (this.factionA.length < this.capPerSide) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 300 + Math.random() * 200;
      const sx = playerX + Math.cos(angle) * dist;
      const sy = playerY + Math.sin(angle) * dist;
      const { tx, ty } = this.world.pixelToTile(sx, sy);
      if (this.world.isCreatureWalkable(tx, ty)) {
        this.factionA.push(new FactionNPC(this.world, "A", this.conflict.factionA, sx, sy, hostility));
      }
    }

    // Spawn faction B NPC — on opposite side to create crossfire
    if (this.factionB.length < this.capPerSide) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 300 + Math.random() * 200;
      const sx = playerX + Math.cos(angle) * dist;
      const sy = playerY + Math.sin(angle) * dist;
      const { tx, ty } = this.world.pixelToTile(sx, sy);
      if (this.world.isCreatureWalkable(tx, ty)) {
        this.factionB.push(new FactionNPC(this.world, "B", this.conflict.factionB, sx, sy, hostility));
      }
    }
  }

  /** Remove destroyed NPCs from the arrays. */
  private cleanupDead(): void {
    this.factionA = this.factionA.filter((n) => {
      if (!n.alive_ && !n.container.active) {
        n.destroy();
        return false;
      }
      if (!n.alive_) {
        // Mark for removal — destroy container after one more frame
        n.container.setActive(false);
      }
      return true;
    });
    this.factionB = this.factionB.filter((n) => {
      if (!n.alive_ && !n.container.active) {
        n.destroy();
        return false;
      }
      if (!n.alive_) {
        n.container.setActive(false);
      }
      return true;
    });
  }

  /** Deal area damage to faction NPCs near a point (e.g. from player weapon). */
  damageNear(x: number, y: number, radius: number, damage: number): void {
    for (const npc of [...this.factionA, ...this.factionB]) {
      if (!npc.alive_) continue;
      const d = Math.hypot(npc.container.x - x, npc.container.y - y);
      if (d < radius) {
        npc.takeDamage(damage);
      }
    }
  }

  /** Destroy all faction NPCs and reset state. */
  clear(): void {
    for (const n of this.factionA) n.destroy();
    for (const n of this.factionB) n.destroy();
    this.factionA = [];
    this.factionB = [];
    this.lastSpawnTime = 0;
    this.toastShown = false;
    this.territoryGfx?.clear();
  }
}
