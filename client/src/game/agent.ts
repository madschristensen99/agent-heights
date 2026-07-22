import Phaser from "phaser";
import type { AgentInfo } from "../../../shared/types";
import { YUKI_ID, HERMES_ID } from "../../../shared/types";
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

/** Max tiles an idle agent shuffles from their desk. */
const DESK_SHUFFLE_RADIUS = 2;

/** A hired agent walking around the office, driven by server state. */
export class AgentNPC {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private nameBg: Phaser.GameObjects.Graphics;
  private dot: Phaser.GameObjects.Arc;
  private bubble: Phaser.GameObjects.Sprite;
  private emoteSprite: Phaser.GameObjects.Sprite;
  private emoteUntil = 0;
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
  private idleSpot: Tile | null = null;
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
      .setScale(1);
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

    this.emoteSprite = scene.add.sprite(0, -140, "emote-icons", 0)
      .setVisible(false)
      .setScale(1.5);

    this.container = scene.add.container(feet.x, feet.y, [
      this.shadow,
      this.sprite,
      this.nameBg,
      this.label,
      this.dot,
      this.bubble,
      this.emoteSprite,
    ]);
    this.positionDot();

    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on("pointerdown", () => onClick(this.info.id));

    this.sync(info);
    // walk in from the door and head to a spot near the desk
    this.idleSpot = this.findDeskAdjacentTile(seat);
    const idlePath = this.idleSpot ? findPath(grid, spawn, this.idleSpot) : [];
    this.path = idlePath.length > 0 ? idlePath : findPath(grid, spawn, seat);
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

  /** Emote name → frame index in the emote-icons spritesheet. */
  static readonly EMOTE_MAP: Record<string, number> = {
    "💡": 0, // lightbulb
    "☕": 1, // coffee
    "💤": 2, // zzz
    "📋": 3, // clipboard
    "💬": 4, // chat
    "💭": 5, // thought
    "✓": 6,  // check
    "!": 7,  // exclamation
  };

  /** Show an emote bubble above the agent for a few seconds. */
  showEmote(emote: string, duration = 3000): void {
    const frame = AgentNPC.EMOTE_MAP[emote] ?? 5; // default to thought
    this.emoteSprite.setFrame(frame);
    this.emoteSprite.setVisible(true);
    this.emoteUntil = this.scene.time.now + duration;
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

    // hide expired emote bubble
    if (this.emoteUntil > 0 && time >= this.emoteUntil) {
      this.emoteUntil = 0;
      this.emoteSprite.setVisible(false);
    }

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
        this.bubble.setFrame(Math.floor(time / 200) % 2 === 0 ? 0 : 2);
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

      // no task? stand near the desk and shuffle around
      if (!this.idleSpot) {
        this.idleSpot = this.findDeskAdjacentTile(this.seat);
      }
      const at = this.tile();
      const atIdle = this.idleSpot && at.x === this.idleSpot.x && at.y === this.idleSpot.y;

      if (atIdle) {
        // standing near the desk — face the boss if nearby, else face the desk
        const pdx = playerX - this.container.x;
        const pdy = playerY - this.container.y;
        if (Math.hypot(pdx, pdy) < 192) {
          this.dir =
            Math.abs(pdx) > Math.abs(pdy) ? (pdx > 0 ? "right" : "left") : pdy > 0 ? "down" : "up";
        } else {
          this.dir = "down";
        }
        this.play(`${c}-idle-${this.dir}`);
        if (this.wanderAt === 0) this.wanderAt = time + 12000 + Math.random() * 16000;
        if (wanderEnabled && time > this.wanderAt) {
          this.wanderAt = time + 20000 + Math.random() * 20000;
          this.strollUntil = time + 4000 + Math.random() * 6000;
          const target = this.shuffleNearDesk(this.seat);
          if (target) this.path = findPath(this.grid, at, target);
        }
      } else if (time < this.strollUntil) {
        // shuffling near the desk
        this.play(`${c}-idle-${this.dir}`);
      } else {
        // head back to the idle spot near the desk
        if (this.idleSpot) {
          this.path = findPath(this.grid, at, this.idleSpot);
        }
        if (this.path.length === 0) {
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

  /** Find a walkable tile adjacent to the desk (not the seat itself). */
  private findDeskAdjacentTile(seat: Tile): Tile | null {
    const candidates: Tile[] = [];
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      const x = seat.x + dx;
      const y = seat.y + dy;
      if (this.grid.ok(x, y) && !(x === seat.x && y === seat.y)) {
        candidates.push({ x, y });
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /** Pick a random walkable tile within DESK_SHUFFLE_RADIUS of the desk. */
  private shuffleNearDesk(seat: Tile): Tile | null {
    for (let tries = 0; tries < 20; tries++) {
      const dx = Math.floor(Math.random() * (DESK_SHUFFLE_RADIUS * 2 + 1)) - DESK_SHUFFLE_RADIUS;
      const dy = Math.floor(Math.random() * (DESK_SHUFFLE_RADIUS * 2 + 1)) - DESK_SHUFFLE_RADIUS;
      const x = seat.x + dx;
      const y = seat.y + dy;
      if (this.grid.ok(x, y) && !(x === seat.x && y === seat.y)) return { x, y };
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
    this.sprite = scene.add.sprite(0, 0, c, 6).setOrigin(0.5, 1).setScale(1);
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

  /** Get current state for broadcasting to other clients. */
  getState(): { x: number; y: number; dir: Dir; state: string } {
    return {
      x: this.container.x,
      y: this.container.y,
      dir: this.dir,
      state: this.state,
    };
  }

  /** Apply remote state from the owner's client — used by visitors. */
  remoteUpdate(x: number, y: number, dir: Dir, state: string): void {
    this.container.setPosition(x, y);
    this.dir = dir;
    this.state = state as YukiState;
    // Clear path — visitors don't run the pathfinding state machine
    this.path = [];
    const c = "char-yuki";
    this.play(`${c}-idle-${this.dir}`);
    this.container.setDepth(10 + this.container.y);
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

type HermesState = "idle" | "sorting" | "delivering" | "collecting";

/** Hermes — the devops core engineer and mail clerk. Sits at his desk in the mail room.
 *  When platform mail arrives, he walks to the mailbox (sorting), then to the target
 *  agent's desk (delivering), then back to his seat (collecting). */
export class HermesNPC {
  container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private nameBg: Phaser.GameObjects.Graphics;
  private shadow: Phaser.GameObjects.Ellipse;
  private dot: Phaser.GameObjects.Arc;
  private emoteSprite: Phaser.GameObjects.Sprite;
  private emoteUntil = 0;

  info!: AgentInfo;
  private seat: Tile;
  private path: Tile[] = [];
  private dir: Dir = "right";
  private state: HermesState = "idle";
  private sortUntil = 0;
  private deliverUntil = 0;
  private scene: Phaser.Scene;

  constructor(
    scene: Phaser.Scene,
    private grid: Grid,
    seat: Tile,
    onClick: (id: string) => void,
  ) {
    this.seat = seat;
    this.scene = scene;
    const c = "char-hermes";

    const feet = feetOf(seat);
    this.shadow = scene.add.ellipse(0, 2, 52, 20, 0x000000, 0.15);
    this.sprite = scene.add.sprite(0, 0, c, 6).setOrigin(0.5, 1).setScale(1);
    this.nameBg = scene.add.graphics();
    this.label = scene.add
      .text(0, -108, "Hermes", {
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
    this.emoteSprite = scene.add.sprite(0, -140, "emote-icons", 0)
      .setVisible(false)
      .setScale(1.5);

    this.container = scene.add.container(feet.x, feet.y, [
      this.shadow,
      this.sprite,
      this.nameBg,
      this.label,
      this.dot,
      this.emoteSprite,
    ]);
    this.container.setDepth(10 + this.container.y);
    this.sprite.play(`${c}-idle-right`);

    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on("pointerdown", () => onClick(HERMES_ID));
  }

  sync(info: AgentInfo): void {
    this.info = info;
    this.dot.setFillStyle(STATUS_COLORS[info.status]);
  }

  /** Get current state for broadcasting to other clients. */
  getState(): { x: number; y: number; dir: Dir; state: string } {
    return {
      x: this.container.x,
      y: this.container.y,
      dir: this.dir,
      state: this.state,
    };
  }

  /** Apply remote state from the owner's client — used by visitors. */
  remoteUpdate(x: number, y: number, dir: Dir, state: string): void {
    this.container.setPosition(x, y);
    this.dir = dir;
    this.state = state as HermesState;
    this.path = [];
    const c = "char-hermes";
    this.play(`${c}-idle-${this.dir}`);
    this.container.setDepth(10 + this.container.y);
  }

  /** Trigger Hermes to sort mail at a specific mailbox tile. */
  sortMail(mailboxTile: Tile): void {
    if (this.state !== "idle") return;
    this.state = "sorting";
    this.path = findPath(this.grid, this.tile(), mailboxTile);
    this.sortUntil = 0;
    this.showEmote("📋", 3000);
  }

  /** Trigger Hermes to deliver a message to an agent's desk tile. */
  deliverTo(deskTile: Tile): void {
    if (this.state === "delivering") return;
    this.state = "delivering";
    this.path = findPath(this.grid, this.tile(), deskTile);
    this.deliverUntil = 0;
    this.showEmote("💬", 4000);
  }

  private showEmote(emote: string, duration = 3000): void {
    const frame = AgentNPC.EMOTE_MAP[emote] ?? 5;
    this.emoteSprite.setFrame(frame);
    this.emoteSprite.setVisible(true);
    this.emoteUntil = this.scene.time.now + duration;
  }

  private play(key: string): void {
    if (this.sprite.anims.currentAnim?.key !== key || !this.sprite.anims.isPlaying) {
      this.sprite.play(key, true);
    }
  }

  private tile(): Tile {
    return tileOf(this.container.x, this.container.y);
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

  update(time: number, dt: number): void {
    const c = "char-hermes";
    dt = Math.min(dt, 100);

    if (this.emoteUntil > 0 && time >= this.emoteUntil) {
      this.emoteUntil = 0;
      this.emoteSprite.setVisible(false);
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

    // --- state-specific behaviour ---
    if (this.state === "sorting") {
      // Arrived at mailbox — sort for a moment, then return to idle
      this.play(`${c}-idle-${this.dir}`);
      this.container.setDepth(10 + this.container.y);
      if (this.sortUntil === 0) this.sortUntil = time + 2000;
      if (time >= this.sortUntil) {
        this.state = "idle";
        this.sortUntil = 0;
        this.path = findPath(this.grid, this.tile(), this.seat);
      }
      return;
    }

    if (this.state === "delivering") {
      // Arrived at agent's desk — hand off the message, then head back
      this.play(`${c}-idle-${this.dir}`);
      this.container.setDepth(10 + this.container.y);
      if (this.deliverUntil === 0) this.deliverUntil = time + 2500;
      if (time >= this.deliverUntil) {
        this.state = "collecting";
        this.deliverUntil = 0;
        this.path = findPath(this.grid, this.tile(), this.seat);
      }
      return;
    }

    if (this.state === "collecting") {
      // Arrived back at seat — return to idle
      const at = this.tile();
      if (at.x === this.seat.x && at.y === this.seat.y) {
        this.state = "idle";
        this.dir = "right";
      }
      this.play(`${c}-idle-${this.dir}`);
      this.container.setDepth(10 + this.container.y);
      return;
    }

    // idle — sitting at desk, facing right
    this.dir = "right";
    this.play(`${c}-idle-right`);
    this.container.setDepth(10 + this.container.y);
  }

  destroy(): void {
    this.container.destroy();
  }
}
