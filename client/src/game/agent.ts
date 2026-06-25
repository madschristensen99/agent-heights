import Phaser from "phaser";
import type { AgentInfo } from "../../../shared/types";
import { YUKI_ID } from "../../../shared/types";
import { findPath, Grid, type Tile } from "./path";

/** Returns the Phaser texture key for an agent's character sprite. */
export function agentTextureKey(info: AgentInfo): string {
  if (info.appearance) return `char-custom-${info.id}`;
  return `char-${info.sprite}`;
}

export const TILE_PX = 64;

export const STATUS_COLORS: Record<AgentInfo["status"], number> = {
  idle: 0x98a4b4,
  thinking: 0xe8a838,
  working: 0x4cb866,
  done: 0x4a9cd8,
  error: 0xe05858,
};

export type Dir = "down" | "left" | "right" | "up";

export function feetOf(tile: Tile): { x: number; y: number } {
  return { x: tile.x * TILE_PX + 32, y: tile.y * TILE_PX + 52 };
}

export function tileOf(x: number, y: number): Tile {
  return { x: Math.floor(x / TILE_PX), y: Math.floor(y / TILE_PX) };
}

const WALK_SPEED = 220;

/** Where agents celebrate a finished task: coffee machine, cooler, sofa. */
const BREAK_SPOTS: Array<{ tile: Tile; face: Dir }> = [
  { tile: { x: 23, y: 3 }, face: "up" }, // coffee machine
  { tile: { x: 28, y: 5 }, face: "up" }, // water cooler  Dogfood the product by building the product
  { tile: { x: 23, y: 14 }, face: "up" }, // sofa, left cushion
  { tile: { x: 24, y: 14 }, face: "up" }, // sofa, right cushion
];

/** Where idle agents hang out — scattered around the water cooler area. */
const WATER_COOLER_SPOTS: Array<{ tile: Tile; face: Dir }> = [
  { tile: { x: 28, y: 5 }, face: "up" },
  { tile: { x: 27, y: 5 }, face: "up" },
  { tile: { x: 26, y: 5 }, face: "up" },
  { tile: { x: 25, y: 5 }, face: "up" },
  { tile: { x: 28, y: 6 }, face: "up" },
  { tile: { x: 26, y: 6 }, face: "up" },
  { tile: { x: 25, y: 6 }, face: "up" },
  { tile: { x: 25, y: 4 }, face: "up" },
  { tile: { x: 26, y: 3 }, face: "up" },
  { tile: { x: 27, y: 3 }, face: "up" },
  { tile: { x: 28, y: 3 }, face: "up" },
  { tile: { x: 25, y: 3 }, face: "up" },
];

/** A hired agent walking around the office, driven by server state. */
export class AgentNPC {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private nameBg: Phaser.GameObjects.Graphics;
  private dot: Phaser.GameObjects.Arc;
  private bubble: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;

  info: AgentInfo;
  private path: Tile[] = [];
  private dir: Dir = "down";
  private wanderAt = 0;
  private seat: Tile;
  private huddleUntil = 0;
  private huddleFace: Tile | null = null;
  private pendingBreak = false;
  private breakUntil = 0;
  private breakFace: Dir | null = null;
  private strollUntil = 0;
  private coolerSpot: Tile | null = null;
  private assembleUntil = 0;
  private scene: Phaser.Scene;

  constructor(
    scene: Phaser.Scene,
    private grid: Grid,
    info: AgentInfo,
    spawn: Tile,
    seat: Tile,
    onClick: (id: string) => void,
  ) {
    this.info = info;
    this.seat = seat;
    this.scene = scene;

    const feet = feetOf(spawn);
    this.shadow = scene.add.ellipse(0, 2, 48, 18, 0x000000, 0.15);
    this.sprite = scene.add.sprite(0, 0, agentTextureKey(info), 0)
      .setOrigin(0.5, 1)
      .setScale(0.5);
    this.nameBg = scene.add.graphics();
    this.label = scene.add
      .text(0, -108, info.name, {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "16px",
        color: "#1d2126",
        stroke: "#f4f6f8",
        strokeThickness: 3,
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.7);
    this.drawNameBg();
    this.dot = scene.add.circle(0, 0, 5, STATUS_COLORS[info.status]).setStrokeStyle(1, 0x000000, 0.3);
    this.bubble = scene.add.sprite(32, -104, "bubble", 0).setVisible(false);

    this.container = scene.add.container(feet.x, feet.y, [
      this.shadow,
      this.sprite,
      this.nameBg,
      this.label,
      this.dot,
      this.bubble,
    ]);
    this.positionDot();

    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on("pointerdown", () => onClick(this.info.id));

    this.sync(info);
    // walk in from the door and head to the water cooler
    this.coolerSpot = WATER_COOLER_SPOTS[info.deskIndex % WATER_COOLER_SPOTS.length].tile;
    const coolerPath = findPath(grid, spawn, this.coolerSpot);
    this.path = coolerPath.length > 0 ? coolerPath : findPath(grid, spawn, seat);
  }

  private positionDot(): void {
    this.dot.setPosition(0 - this.label.displayWidth / 2 - 10, -120);
  }

  /** Draw a rounded background behind the nameplate label. */
  private drawNameBg(): void {
    const g = this.nameBg;
    g.clear();
    const w = this.label.displayWidth + 16;
    const h = 18;
    const x = -w / 2;
    const y = -122;
    const r = 4;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(x, y, w, h, r);
    g.lineStyle(1, 0xffffff, 0.15);
    g.strokeRoundedRect(x, y, w, h, r);
  }

  private get busy(): boolean {
    return this.info.status === "thinking" || this.info.status === "working";
  }

  sync(info: AgentInfo): void {
    const wasBusy = this.busy;
    const wasStatus = this.info.status;
    this.info = info;
    this.dot.setFillStyle(STATUS_COLORS[info.status]);
    if (this.label.text !== info.name) {
      this.label.setText(info.name);
      this.positionDot();
      this.drawNameBg();
    }
    if (this.busy && !wasBusy) {
      // a new task trumps the coffee run
      this.pendingBreak = false;
      this.breakUntil = 0;
      this.breakFace = null;
      this.wanderAt = 0;
      this.hop();
      if (!this.huddling && this.assembleUntil === 0) this.path = findPath(this.grid, this.tile(), this.seat);
    }
    if (info.status === "done" && wasStatus !== "done") {
      this.pendingBreak = true;
      this.confetti();
    }
  }

  tile(): Tile {
    return tileOf(this.container.x, this.container.y);
  }

  /** Gather around the boss for a briefing before heading to the desk. */
  huddle(spot: Tile, boss: Tile, now: number): void {
    this.huddleUntil = now + 3200 + Math.random() * 1800;
    this.huddleFace = boss;
    this.path = findPath(this.grid, this.tile(), spot);
  }

  /** Assemble at a lineup spot near the entrance during emergency stop. */
  assemble(spot: Tile, now: number): void {
    this.huddleUntil = 0;
    this.huddleFace = null;
    this.wanderAt = 0;
    this.breakUntil = 0;
    this.pendingBreak = false;
    this.assembleUntil = now + 30_000;
    this.path = findPath(this.grid, this.tile(), spot);
  }

  private get huddling(): boolean {
    return this.huddleUntil > 0;
  }

  private play(key: string): void {
    if (this.sprite.anims.currentAnim?.key !== key || !this.sprite.anims.isPlaying) {
      this.sprite.play(key, true);
    }
  }

  update(time: number, dt: number, wanderEnabled = true, playerX = 0, playerY = 0): void {
    // after a long frame (tab switch, GC, DOM jank) don't take one giant step;
    // 100ms keeps speed truthful down to 10fps while still preventing teleports
    dt = Math.min(dt, 100);
    const c = agentTextureKey(this.info);
    if (this.huddling && time >= this.huddleUntil) {
      this.huddleUntil = 0;
      this.huddleFace = null;
    }

    const showBubble = this.path.length === 0 && (
      this.huddling ||
      this.info.status === "thinking" ||
      this.info.status === "done" ||
      this.info.status === "error"
    );
    this.bubble.setVisible(showBubble);
    if (showBubble) {
      if (this.info.status === "thinking") {
        this.bubble.setTint(0xe8a838);
        this.bubble.setFrame(Math.floor(time / 350) % 3);
      } else if (this.info.status === "done") {
        this.bubble.setTint(0x4a9cd8);
        this.bubble.setFrame(0);
      } else if (this.info.status === "error") {
        this.bubble.setTint(0xe05858);
        this.bubble.setFrame(0);
      } else {
        this.bubble.clearTint();
        this.bubble.setFrame(Math.floor(time / 350) % 3);
      }
    }

    // --- standing at the entrance during emergency assembly ---
    if (this.assembleUntil > 0) {
      if (time >= this.assembleUntil) {
        this.assembleUntil = 0;
        this.wanderAt = time + 1500 + Math.random() * 1500;
      } else if (this.path.length === 0) {
        this.play(`${c}-idle-${this.dir}`);
        this.container.setDepth(10 + this.container.y);
        return;
      }
    }

    // --- follow path ---
    if (this.path.length > 0) {
      const next = feetOf(this.path[0]);
      const dx = next.x - this.container.x;
      const dy = next.y - this.container.y;
      const dist = Math.hypot(dx, dy);
      const step = (WALK_SPEED * dt) / 1000;
      if (dist <= step) {
        this.container.setPosition(next.x, next.y);
        this.path.shift();
      } else {
        this.container.x += (dx / dist) * step;
        this.container.y += (dy / dist) * step;
        this.dir =
          Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      }
      this.play(`${c}-walk-${this.dir}`);
      this.container.setDepth(10 + this.container.y);
      return;
    }

    // --- gathered around the boss, chatting ---
    if (this.huddling) {
      if (this.huddleFace) {
        const dx = this.huddleFace.x - this.tile().x;
        const dy = this.huddleFace.y - this.tile().y;
        this.dir =
          Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      }
      this.play(`${c}-idle-${this.dir}`);
      this.container.setDepth(10 + this.container.y);
      return;
    }

    // --- arrived / standing ---
    if (this.busy) {
      const at = this.tile();
      if (at.x !== this.seat.x || at.y !== this.seat.y) {
        this.path = findPath(this.grid, at, this.seat);
        if (this.path.length === 0) {
          // pathing failed (e.g. spawned oddly) — snap to the seat
          const feet = feetOf(this.seat);
          this.container.setPosition(feet.x, feet.y);
        }
      } else {
        // at the desk: face the monitor and type away
        this.play(`${c}-work`);
      }
    } else {
      // just finished a task — head to the break room before anything else
      if (this.pendingBreak) {
        this.pendingBreak = false;
        const spot = BREAK_SPOTS[Math.floor(Math.random() * BREAK_SPOTS.length)];
        const path = findPath(this.grid, this.tile(), spot.tile);
        if (path.length > 0) {
          this.path = path;
          this.breakFace = spot.face;
          this.breakUntil = time + 7000 + Math.random() * 5000;
          this.wanderAt = this.breakUntil + 1500;
          this.play(`${c}-walk-${this.dir}`);
          this.container.setDepth(10 + this.container.y);
          return;
        }
      }
      // savoring the coffee / cooler gossip / sofa
      if (time < this.breakUntil) {
        if (this.breakFace) this.dir = this.breakFace;
        this.play(`${c}-idle-${this.dir}`);
        this.container.setDepth(10 + this.container.y);
        return;
      }
      this.breakFace = null;

      // no task? go hang out at the water cooler
      if (!this.coolerSpot) {
        this.coolerSpot = WATER_COOLER_SPOTS[this.info.deskIndex % WATER_COOLER_SPOTS.length].tile;
      }
      const at = this.tile();
      const atCooler = at.x === this.coolerSpot.x && at.y === this.coolerSpot.y;

      if (atCooler) {
        // chilling at the cooler — face the boss if nearby, else face the cooler
        const pdx = playerX - this.container.x;
        const pdy = playerY - this.container.y;
        if (Math.hypot(pdx, pdy) < 192) {
          this.dir =
            Math.abs(pdx) > Math.abs(pdy) ? (pdx > 0 ? "right" : "left") : pdy > 0 ? "down" : "up";
        } else {
          this.dir = "up";
        }
        this.play(`${c}-idle-${this.dir}`);
        if (this.wanderAt === 0) this.wanderAt = time + 8000 + Math.random() * 12000;
        if (wanderEnabled && time > this.wanderAt) {
          this.wanderAt = time + 15000 + Math.random() * 15000;
          this.strollUntil = time + 3000 + Math.random() * 4000;
          const target = this.randomTile();
          if (target) this.path = findPath(this.grid, at, target);
        }
      } else if (time < this.strollUntil) {
        // stretching legs
        this.play(`${c}-idle-${this.dir}`);
      } else {
        // head to the cooler (or back to it after a stroll)
        this.path = findPath(this.grid, at, this.coolerSpot);
        if (this.path.length === 0) {
          // can't reach the cooler — fall back to the seat
          this.path = findPath(this.grid, at, this.seat);
          if (this.path.length === 0) {
            const feet = feetOf(this.seat);
            this.container.setPosition(feet.x, feet.y);
          }
        }
        this.play(`${c}-idle-${this.dir}`);
      }
    }
    this.container.setDepth(10 + this.container.y);
  }

  private randomTile(): Tile | null {
    for (let tries = 0; tries < 20; tries++) {
      const x = 1 + Math.floor(Math.random() * (this.grid.width - 2));
      const y = 2 + Math.floor(Math.random() * (this.grid.height - 4));
      if (this.grid.ok(x, y)) return { x, y };
    }
    return null;
  }

  private hop(): void {
    this.scene.tweens.add({
      targets: this.sprite,
      y: -24,
      duration: 150,
      yoyo: true,
      ease: "Quad.out",
    });
  }

  private confetti(): void {
    const colors = [0xe8a838, 0x4cb866, 0x4a9cd8, 0xe05858, 0xb54a93, 0x2a8f8b];
    const x = this.container.x;
    const y = this.container.y - 40;
    for (let i = 0; i < 14; i++) {
      const piece = this.scene.add.rectangle(x, y, 8, 8, colors[i % colors.length]);
      piece.setDepth(100);
      const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.5;
      const dist = 48 + Math.random() * 48;
      this.scene.tweens.add({
        targets: piece,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 24,
        alpha: 0,
        angle: 360,
        duration: 800 + Math.random() * 400,
        ease: "Quad.out",
        onComplete: () => piece.destroy(),
      });
    }
  }

  destroy(): void {
    this.container.destroy();
  }
}

// --- Yuki's office geometry (must match generate-assets.ts) ---
const YUKI_OFFICE = { x0: 22, y0: 8, x1: 27, y1: 11 };
const YUKI_GREET_TILE: Tile = { x: 23, y: 10 };

type YukiState = "sitting" | "greeting" | "returning";

/** Yuki — the office manager. Sits at her desk; stands up to greet visitors. */
export class YukiNPC {
  container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private nameBg: Phaser.GameObjects.Graphics;
  private shadow: Phaser.GameObjects.Ellipse;
  private dot: Phaser.GameObjects.Arc;

  info!: AgentInfo;
  private seat: Tile;
  private path: Tile[] = [];
  private dir: Dir = "down";
  private state: YukiState = "sitting";
  private greetUntil = 0;
  private wasPlayerInside = false;

  constructor(
    scene: Phaser.Scene,
    private grid: Grid,
    seat: Tile,
    onClick: (id: string) => void,
  ) {
    this.seat = seat;
    const c = "char-yuki";

    const feet = feetOf(seat);
    this.shadow = scene.add.ellipse(0, 2, 48, 18, 0x000000, 0.15);
    this.sprite = scene.add.sprite(0, 0, c, 6).setOrigin(0.5, 1).setScale(0.5);
    this.nameBg = scene.add.graphics();
    this.label = scene.add
      .text(0, -108, "Yuki", {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "16px",
        color: "#1d2126",
        stroke: "#f4f6f8",
        strokeThickness: 3,
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.7);
    this.drawNameBg();
    this.dot = scene.add.circle(0, 0, 5, STATUS_COLORS.idle).setStrokeStyle(1, 0x000000, 0.3);

    this.container = scene.add.container(feet.x, feet.y, [
      this.shadow,
      this.sprite,
      this.nameBg,
      this.label,
      this.dot,
    ]);
    this.container.setDepth(10 + this.container.y);
    // start sitting at desk, facing left toward the entrance
    this.dir = "left";
    this.play(`${c}-idle-left`);

    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on("pointerdown", () => onClick(YUKI_ID));
  }

  /** Update status dot + label from server state. */
  sync(info: AgentInfo): void {
    this.info = info;
    this.dot.setFillStyle(STATUS_COLORS[info.status]);
  }

  private drawNameBg(): void {
    const g = this.nameBg;
    g.clear();
    const w = this.label.displayWidth + 16;
    const h = 18;
    const x = -w / 2;
    const y = -122;
    const r = 4;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(x, y, w, h, r);
    g.lineStyle(1, 0xffffff, 0.15);
    g.strokeRoundedRect(x, y, w, h, r);
  }

  private play(key: string): void {
    if (this.sprite.anims.currentAnim?.key !== key || !this.sprite.anims.isPlaying) {
      this.sprite.play(key, true);
    }
  }

  private tile(): Tile {
    return tileOf(this.container.x, this.container.y);
  }

  update(time: number, _dt: number, _wander: boolean, playerX: number, playerY: number): void {
    const c = "char-yuki";
    const pt = tileOf(playerX, playerY);
    const playerInside =
      pt.x >= YUKI_OFFICE.x0 && pt.x <= YUKI_OFFICE.x1 &&
      pt.y >= YUKI_OFFICE.y0 && pt.y <= YUKI_OFFICE.y1;

    // detect player entering the office
    if (playerInside && !this.wasPlayerInside && this.state === "sitting") {
      this.state = "greeting";
      const path = findPath(this.grid, this.tile(), YUKI_GREET_TILE);
      this.path = path;
      this.greetUntil = 0;
    }
    this.wasPlayerInside = playerInside;

    // --- follow path ---
    if (this.path.length > 0) {
      const next = feetOf(this.path[0]);
      const dx = next.x - this.container.x;
      const dy = next.y - this.container.y;
      const dist = Math.hypot(dx, dy);
      const step = (WALK_SPEED * Math.min(_dt, 100)) / 1000;
      if (dist <= step) {
        this.container.setPosition(next.x, next.y);
        this.path.shift();
      } else {
        this.container.x += (dx / dist) * step;
        this.container.y += (dy / dist) * step;
        this.dir =
          Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      }
      this.play(`${c}-walk-${this.dir}`);
      this.container.setDepth(10 + this.container.y);
      return;
    }

    // --- state-specific idle behaviour ---
    if (this.state === "greeting") {
      // face the player
      const pdx = playerX - this.container.x;
      const pdy = playerY - this.container.y;
      this.dir =
        Math.abs(pdx) > Math.abs(pdy) ? (pdx > 0 ? "right" : "left") : pdy > 0 ? "down" : "up";
      this.play(`${c}-idle-${this.dir}`);
      this.container.setDepth(10 + this.container.y);

      // start a timer once we've arrived and are facing the player
      if (this.greetUntil === 0) this.greetUntil = time + 3500;
      // after greeting (or if the player leaves), head back to the desk
      if (this.greetUntil > 0 && (time >= this.greetUntil || !playerInside)) {
        this.state = "returning";
        this.path = findPath(this.grid, this.tile(), this.seat);
        this.greetUntil = 0;
      }
      return;
    }

    if (this.state === "returning") {
      // arrived back at the seat
      const at = this.tile();
      if (at.x === this.seat.x && at.y === this.seat.y) {
        this.state = "sitting";
        this.dir = "left";
      }
      this.play(`${c}-idle-${this.dir}`);
      this.container.setDepth(10 + this.container.y);
      return;
    }

    // sitting at desk — face left toward the entrance
    this.dir = "left";
    this.play(`${c}-idle-left`);
    this.container.setDepth(10 + this.container.y);
  }

  destroy(): void {
    this.container.destroy();
  }
}
