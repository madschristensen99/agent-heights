import Phaser from "phaser";
import type { AgentInfo, CharAppearance } from "../../../shared/types";
import { OFFICE_MANAGER_ID, HERMES_ID, WIZARD_ID } from "../../../shared/types";
import type { WorldTheme } from "../../../shared/types";
import { findPath, Grid, type Tile } from "./path";
import { CHAR_LAYERS } from "./chargen";

/** Returns the Phaser texture key for an agent's character sprite. */
export function agentTextureKey(info: AgentInfo): string {
  if (info.appearance) return `char-custom-${info.id}`;
  return `char-${info.sprite}`;
}

/** Y-offset per layer for depth parallax (pixels). Lower layers are closer to viewer. */
const LAYER_Y_OFFSETS = [0, -1, -2, -3];

export const TILE_PX = 64;

export const STATUS_COLORS: Record<AgentInfo["status"], number> = {
  idle: 0x98a4b4,
  thinking: 0xe8a838,
  working: 0x4cb866,
  done: 0x4a9cd8,
  error: 0xe05858,
  waiting: 0xb47ec4,
};

/**
 * Returns theme-aware status colors. If a theme with custom statusColors is
 * active, those override the defaults. Falls back to STATUS_COLORS.
 */
export function getThemeStatusColors(theme?: WorldTheme | null): Record<AgentInfo["status"], number> {
  if (theme?.statusColors) {
    return { ...STATUS_COLORS, ...theme.statusColors };
  }
  return STATUS_COLORS;
}

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

// --- Shared name tag factory ---

export interface NameTag {
  label: Phaser.GameObjects.Text;
  nameBg: Phaser.GameObjects.Graphics;
  /** Update status color (accent bar). */
  setStatus: (status: AgentInfo["status"]) => void;
  /** Update the name text (redraws background if changed). */
  setName: (name: string) => void;
}

/** Create a name tag (label + dark background with status accent bar) for an NPC. */
function createNameTag(scene: Phaser.Scene, name: string, status: AgentInfo["status"]): NameTag {
  const label = scene.add
    .text(0, -108, name, {
      fontFamily: "'M PLUS Rounded 1c', sans-serif",
      fontSize: "18px",
      color: "#ffffff",
      stroke: "#0d1018",
      strokeThickness: 4,
    })
    .setResolution(4)
    .setOrigin(0.5, 1)
    .setScale(0.75);

  const nameBg = scene.add.graphics();

  function redraw(status: AgentInfo["status"]): void {
    const color = STATUS_COLORS[status];
    const w = label.displayWidth + 22;
    const h = 22;
    const x = -w / 2;
    const y = -126;
    const r = 5;
    nameBg.clear();
    // Dark opaque background for max contrast
    nameBg.fillStyle(0x0d1018, 0.78);
    nameBg.fillRoundedRect(x, y, w, h, r);
    // Status-colored left accent bar
    nameBg.fillStyle(color, 0.85);
    nameBg.fillRect(x + 2, y + 3, 3, h - 6);
    // Subtle border
    nameBg.lineStyle(1, 0xffffff, 0.18);
    nameBg.strokeRoundedRect(x, y, w, h, r);
  }

  redraw(status);

  return {
    label,
    nameBg,
    setStatus: (s) => redraw(s),
    setName: (n) => {
      if (label.text !== n) {
        label.setText(n);
        redraw(status);
      }
    },
  };
}

// --- Shared interaction hint factory ---

export interface HintTag {
  /** Set the label text (parses "E:" / "TAP" prefix into a key badge). */
  setText: (text: string) => HintTag;
  /** Set the world position. */
  setPosition: (x: number, y: number) => HintTag;
  /** Toggle visibility. */
  setVisible: (visible: boolean) => HintTag;
}

/** Create a polished interaction hint with dark bg, key badge, and white text. */
export function createHintTag(scene: Phaser.Scene): HintTag {
  const label = scene.add
    .text(0, 0, "", {
      fontFamily: "'M PLUS Rounded 1c', sans-serif",
      fontSize: "16px",
      color: "#ffffff",
      stroke: "#0d1018",
      strokeThickness: 3,
    })
    .setResolution(4)
    .setOrigin(0.5, 0.5)
    .setScale(0.7);

  const keyLabel = scene.add
    .text(0, 0, "E", {
      fontFamily: "'M PLUS Rounded 1c', sans-serif",
      fontSize: "13px",
      fontStyle: "bold",
      color: "#ffffff",
    })
    .setResolution(4)
    .setOrigin(0.5, 0.5)
    .setScale(0.7);

  const bg = scene.add.graphics();
  const keyBg = scene.add.graphics();

  const container = scene.add
    .container(0, 0, [bg, keyBg, keyLabel, label])
    .setDepth(100)
    .setVisible(false);

  function redraw(text: string): void {
    // Parse key prefix: "E: ..." or "TAP ..."
    const match = text.match(/^(E:\s*|TAP\s+)/);
    const hasKey = !!match;
    const keyStr = match ? match[0].trim().replace(/:$/, "") : "";
    const actionText = hasKey ? text.slice(match![0].length) : text;

    label.setText(actionText);
    keyLabel.setVisible(hasKey);

    const labelW = label.displayWidth;
    const keyW = hasKey ? (keyStr === "E" ? 22 : 38) : 0;
    const gap = hasKey ? 8 : 0;
    const padding = 12;
    const totalW = keyW + gap + labelW + padding * 2;
    const h = 24;
    const r = 5;

    bg.clear();
    bg.fillStyle(0x0d1018, 0.78);
    bg.fillRoundedRect(-totalW / 2, -h, totalW, h, r);
    bg.lineStyle(1, 0xffffff, 0.18);
    bg.strokeRoundedRect(-totalW / 2, -h, totalW, h, r);

    keyBg.clear();
    if (hasKey) {
      const badgeX = -totalW / 2 + padding;
      keyBg.fillStyle(0x3a8cd4, 0.9);
      keyBg.fillRoundedRect(badgeX, -h + 5, keyW, h - 10, 3);
      keyLabel.setText(keyStr === "E" ? "E" : "TAP");
      keyLabel.setPosition(badgeX + keyW / 2, -h / 2);
    }

    label.setPosition(
      -totalW / 2 + padding + keyW + gap + labelW / 2,
      -h / 2,
    );
  }

  return {
    setText(text: string) {
      redraw(text);
      return this;
    },
    setPosition(x: number, y: number) {
      container.setPosition(x, y);
      return this;
    },
    setVisible(visible: boolean) {
      container.setVisible(visible);
      return this;
    },
  };
}

/** A hired agent walking around the office, driven by server state. */
export class AgentNPC {
  container: Phaser.GameObjects.Container;
  /** Primary sprite (body layer or single sprite) — used for interactivity. */
  sprite: Phaser.GameObjects.Sprite;
  /** All layer sprites (when layered rendering is active). */
  private layerSprites: Phaser.GameObjects.Sprite[] = [];
  private nameTag: NameTag;
  private bubble: Phaser.GameObjects.Sprite;
  private emoteSprite: Phaser.GameObjects.Sprite;
  private emoteUntil = 0;
  private lockIcon: Phaser.GameObjects.Container | null = null;
  private shadow: Phaser.GameObjects.Ellipse;
  private baseKey: string;
  private useLayers: boolean;

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
  private getSeatForAgent: ((agentId: string) => Tile | null) | null;
  private waitingSpot: Tile | null = null;
  private waitingFaceTile: Tile | null = null;
  private waitingEmoteAt = 0;

  constructor(
    scene: Phaser.Scene,
    private grid: Grid,
    info: AgentInfo,
    spawn: Tile,
    seat: Tile,
    onClick: (id: string) => void,
    getSeatForAgent?: (agentId: string) => Tile | null,
  ) {
    this.info = info;
    this.seat = seat;
    this.scene = scene;
    this.getSeatForAgent = getSeatForAgent ?? null;

    const feet = feetOf(spawn);
    this.shadow = scene.add.ellipse(0, 2, 48, 18, 0x000000, 0.15);
    this.baseKey = agentTextureKey(info);

    // Check if layered textures exist for this character
    this.useLayers = scene.textures.exists(`${this.baseKey}:L0`);

    const containerChildren: Phaser.GameObjects.GameObject[] = [this.shadow];

    if (this.useLayers) {
      this.layerSprites = [];
      for (let l = 0; l < CHAR_LAYERS; l++) {
        const layerKey = `${this.baseKey}:L${l}`;
        const spr = scene.add.sprite(0, LAYER_Y_OFFSETS[l], layerKey, 0)
          .setOrigin(0.5, 1)
          .setScale(1);
        this.layerSprites.push(spr);
        containerChildren.push(spr);
      }
      // Use body layer (L2) as the primary interactive sprite
      this.sprite = this.layerSprites[2];
    } else {
      this.sprite = scene.add.sprite(0, 0, this.baseKey, 0)
        .setOrigin(0.5, 1)
        .setScale(1);
      containerChildren.push(this.sprite);
    }

    this.nameTag = createNameTag(scene, info.name, info.status);
    this.bubble = scene.add.sprite(-32, -104, "bubble", 0).setVisible(false).setFlipX(true);

    this.emoteSprite = scene.add.sprite(0, -140, "emote-icons", 0)
      .setVisible(false)
      .setScale(1.5);

    // Lock icon for ACL-restricted agents — drawn as vector graphics, shown above the name tag
    const lockGfx = scene.add.graphics();
    lockGfx.lineStyle(1.5, 0xc9852c, 1);
    lockGfx.fillStyle(0xc9852c, 0.15);
    lockGfx.fillRoundedRect(-4, -2, 8, 7, 1);
    lockGfx.strokeRoundedRect(-4, -2, 8, 7, 1);
    lockGfx.beginPath();
    lockGfx.arc(0, -2, 2.5, Math.PI, 0, false);
    lockGfx.strokePath();
    this.lockIcon = scene.add.container(28, -96, [lockGfx]).setVisible(false);

    containerChildren.push(
      this.nameTag.nameBg,
      this.nameTag.label,
      this.bubble,
      this.emoteSprite,
      this.lockIcon,
    );

    this.container = scene.add.container(feet.x, feet.y, containerChildren);

    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on("pointerdown", () => onClick(this.info.id));

    this.sync(info);
    // walk in from the door and head to a spot near the desk
    this.idleSpot = this.findDeskAdjacentTile(seat);
    const idlePath = this.idleSpot ? findPath(grid, spawn, this.idleSpot) : [];
    this.path = idlePath.length > 0 ? idlePath : findPath(grid, spawn, seat);
  }

  private get busy(): boolean {
    return this.info.status === "thinking" || this.info.status === "working";
  }

  sync(info: AgentInfo): void {
    const wasBusy = this.busy;
    const wasStatus = this.info.status;
    this.info = info;
    this.nameTag.setStatus(info.status);
    this.nameTag.setName(info.name);

    // Update lock icon visibility based on ACL
    if (this.lockIcon) {
      const acl = info.acl;
      const hasAcl = acl && ((acl.allowedUserIds && acl.allowedUserIds.length > 0) || (acl.allowedRoles && acl.allowedRoles.length > 0));
      if (hasAcl) {
        this.lockIcon.setVisible(true);
      } else {
        this.lockIcon.setVisible(false);
      }
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
    if (info.status === "waiting" && wasStatus !== "waiting") {
      // Walk to the target agent's desk and wait there.
      this.pendingBreak = false;
      this.breakUntil = 0;
      this.breakFace = null;
      this.wanderAt = 0;
      const targetSeat = info.waitingFor && this.getSeatForAgent ? this.getSeatForAgent(info.waitingFor) : null;
      if (targetSeat) {
        this.waitingFaceTile = targetSeat;
        this.waitingSpot = this.findDeskAdjacentTile(targetSeat);
        if (this.waitingSpot) {
          this.path = findPath(this.grid, this.tile(), this.waitingSpot);
        }
      }
    }
    if (wasStatus === "waiting" && info.status !== "waiting") {
      // Released from waiting — clear waiting state.
      this.waitingSpot = null;
      this.waitingFaceTile = null;
      this.waitingEmoteAt = 0;
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
    if (this.useLayers) {
      // key is like "${baseKey}-walk-down" — convert to "${baseKey}:L${i}-walk-down"
      const suffix = key.slice(this.baseKey.length + 1);
      for (let i = 0; i < this.layerSprites.length; i++) {
        const layerKey = `${this.baseKey}:L${i}-${suffix}`;
        const spr = this.layerSprites[i];
        if (spr.anims.currentAnim?.key !== layerKey || !spr.anims.isPlaying) {
          spr.play(layerKey, true);
        }
      }
    } else {
      if (this.sprite.anims.currentAnim?.key !== key || !this.sprite.anims.isPlaying) {
        this.sprite.play(key, true);
      }
    }
  }

  update(time: number, dt: number, wanderEnabled = true, playerX = 0, playerY = 0): void {
    // after a long frame (tab switch, GC, DOM jank) don't take one giant step;
    // 50ms matches the scene's cap to keep player and NPCs in sync
    dt = Math.min(dt, 50);
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
      this.info.status === "error" ||
      this.info.status === "waiting"
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
      } else if (this.info.status === "waiting") {
        this.bubble.setTint(0xb47ec4);
        this.bubble.setFrame(Math.floor(time / 500) % 3);
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

    // --- waiting at a colleague's desk ---
    if (this.info.status === "waiting" && !this.busy) {
      // Show a periodic waiting emote
      if (this.waitingEmoteAt === 0) this.waitingEmoteAt = time + 2000;
      if (time >= this.waitingEmoteAt) {
        this.showEmote("💭", 2500);
        this.waitingEmoteAt = time + 5000 + Math.random() * 3000;
      }
      // If we have a waiting spot, make sure we're heading there
      if (this.waitingSpot) {
        const at = this.tile();
        if (at.x !== this.waitingSpot.x || at.y !== this.waitingSpot.y) {
          // Not there yet — if no path, try to find one
          if (this.path.length === 0) {
            this.path = findPath(this.grid, at, this.waitingSpot);
          }
        } else {
          // At the waiting spot — face the target agent's desk
          if (this.waitingFaceTile) {
            const dx = this.waitingFaceTile.x - at.x;
            const dy = this.waitingFaceTile.y - at.y;
            this.dir =
              Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
          }
          this.play(`${c}-idle-${this.dir}`);
        }
      } else {
        // No waiting spot found — just stand and wait
        this.play(`${c}-idle-${this.dir}`);
      }
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
    const targets = this.useLayers ? this.layerSprites : [this.sprite];
    for (const spr of targets) {
      this.scene.tweens.add({
        targets: spr,
        y: -24 + (this.useLayers ? LAYER_Y_OFFSETS[(this.layerSprites.indexOf(spr))] : 0),
        duration: 150,
        yoyo: true,
        ease: "Quad.out",
      });
    }
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

// --- Office Manager's office geometry (must match generate-assets.ts) ---
const OFFICE_MANAGER_OFFICE = { x0: 22, y0: 8, x1: 27, y1: 11 };
const OFFICE_MANAGER_GREET_TILE: Tile = { x: 23, y: 10 };

type OfficeManagerState = "sitting" | "greeting" | "returning";

/** Office Manager — sits at her desk; stands up to greet visitors. */
export class OfficeManagerNPC {
  container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private nameTag: NameTag;
  private shadow: Phaser.GameObjects.Ellipse;

  info!: AgentInfo;
  private seat: Tile;
  private path: Tile[] = [];
  private dir: Dir = "down";
  private state: OfficeManagerState = "sitting";
  private greetUntil = 0;
  private wasPlayerInside = false;
  private texKey = "char-office-manager";

  constructor(
    scene: Phaser.Scene,
    private grid: Grid,
    seat: Tile,
    onClick: (id: string) => void,
  ) {
    this.seat = seat;

    const feet = feetOf(seat);
    this.shadow = scene.add.ellipse(0, 2, 48, 18, 0x000000, 0.15);
    this.sprite = scene.add.sprite(0, 0, this.texKey, 6).setOrigin(0.5, 1).setScale(1);
    this.nameTag = createNameTag(scene, "Office Manager", "idle");

    this.container = scene.add.container(feet.x, feet.y, [
      this.shadow,
      this.sprite,
      this.nameTag.nameBg,
      this.nameTag.label,
    ]);
    this.container.setDepth(10 + this.container.y);
    // start sitting at desk, facing left toward the entrance
    this.dir = "left";
    this.play(`${this.texKey}-idle-left`);

    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on("pointerdown", () => onClick(OFFICE_MANAGER_ID));
  }

  /** Update status dot + label from server state. */
  sync(info: AgentInfo): void {
    this.info = info;
    this.nameTag.setStatus(info.status);
    if (info.appearance) {
      const key = agentTextureKey(info);
      if (key !== this.texKey) {
        this.texKey = key;
        this.sprite.setTexture(key, 6);
        this.play(`${key}-idle-${this.dir}`);
      }
    }
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
    this.state = state as OfficeManagerState;
    // Clear path — visitors don't run the pathfinding state machine
    this.path = [];
    this.play(`${this.texKey}-idle-${this.dir}`);
    this.container.setDepth(10 + this.container.y);
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
    const c = this.texKey;
    const pt = tileOf(playerX, playerY);
    const playerInside =
      pt.x >= OFFICE_MANAGER_OFFICE.x0 && pt.x <= OFFICE_MANAGER_OFFICE.x1 &&
      pt.y >= OFFICE_MANAGER_OFFICE.y0 && pt.y <= OFFICE_MANAGER_OFFICE.y1;

    // detect player entering the office
    if (playerInside && !this.wasPlayerInside && this.state === "sitting") {
      this.state = "greeting";
      const path = findPath(this.grid, this.tile(), OFFICE_MANAGER_GREET_TILE);
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
      const step = (WALK_SPEED * Math.min(_dt, 50)) / 1000;
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
  private nameTag: NameTag;
  private shadow: Phaser.GameObjects.Ellipse;
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
  private texKey = "char-hermes";

  constructor(
    scene: Phaser.Scene,
    private grid: Grid,
    seat: Tile,
    onClick: (id: string) => void,
  ) {
    this.seat = seat;
    this.scene = scene;

    const feet = feetOf(seat);
    this.shadow = scene.add.ellipse(0, 2, 52, 20, 0x000000, 0.15);
    this.sprite = scene.add.sprite(0, 0, this.texKey, 6).setOrigin(0.5, 1).setScale(1);
    this.nameTag = createNameTag(scene, "Hermes", "idle");
    this.emoteSprite = scene.add.sprite(0, -140, "emote-icons", 0)
      .setVisible(false)
      .setScale(1.5);

    this.container = scene.add.container(feet.x, feet.y, [
      this.shadow,
      this.sprite,
      this.nameTag.nameBg,
      this.nameTag.label,
      this.emoteSprite,
    ]);
    this.container.setDepth(10 + this.container.y);
    this.sprite.play(`${this.texKey}-idle-right`);

    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on("pointerdown", () => onClick(HERMES_ID));
  }

  sync(info: AgentInfo): void {
    this.info = info;
    this.nameTag.setStatus(info.status);
    if (info.appearance) {
      const key = agentTextureKey(info);
      if (key !== this.texKey) {
        this.texKey = key;
        this.sprite.setTexture(key, 6);
        this.play(`${key}-idle-${this.dir}`);
      }
    }
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
    this.play(`${this.texKey}-idle-${this.dir}`);
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

  update(time: number, dt: number): void {
    const c = this.texKey;
    dt = Math.min(dt, 50);

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

/** Per-world wizard appearance presets. */
const WIZARD_APPEARANCES: Record<string, CharAppearance> = {
  "erics-alley": {
    skin: 2, hairStyle: 10, hair: 9, shirt: 8, pants: 7,
    accessory: 4, accent: 0, beard: 1, eyeColor: 5, headFeature: 0,
  },
  "hawaii": {
    skin: 1, hairStyle: 7, hair: 11, shirt: 5, pants: 16,
    accessory: 2, accent: 5, beard: 3, eyeColor: 3, headFeature: 4,
  },
  "old-south": {
    skin: 0, hairStyle: 5, hair: 11, shirt: 3, pants: 2,
    accessory: 1, accent: 3, beard: 4, eyeColor: 0, headFeature: 0,
  },
};

/** Get the wizard texture key for a given theme (or default). */
export function wizardTextureKey(themeId?: string): string {
  return themeId ? `char-wizard-${themeId}` : "char-0";
}

/** Get the wizard appearance for a given theme (or null for default). */
export function wizardAppearance(themeId?: string): CharAppearance | null {
  return themeId ? WIZARD_APPEARANCES[themeId] ?? null : null;
}

/** Draw a themed prop (spray can, fishing hook, satchel) as a Phaser graphics object. */
function drawWizardProp(scene: Phaser.Scene, themeId?: string): Phaser.GameObjects.Graphics | null {
  if (!themeId) return null;
  const g = scene.add.graphics().setDepth(15);
  if (themeId === "erics-alley") {
    // Spray can — small red cylinder with cap
    g.fillStyle(0xcc3333, 1);
    g.fillRoundedRect(-3, -28, 6, 12, 1);
    g.fillStyle(0x999999, 1);
    g.fillRect(-2, -31, 4, 4);
    g.fillStyle(0xff6644, 0.6);
    g.fillCircle(0, -22, 2);
  } else if (themeId === "hawaii") {
    // Bone fishing hook — curved line
    g.lineStyle(2, 0xf0e6d0, 1);
    g.beginPath();
    g.moveTo(0, -30);
    g.lineTo(0, -22);
    g.arc(3, -22, 5, Math.PI, Math.PI * 1.5, false);
    g.strokePath();
    g.fillStyle(0xf0e6d0, 1);
    g.fillCircle(0, -30, 2);
  } else if (themeId === "old-south") {
    // Satchel — small brown rounded rectangle
    g.fillStyle(0x6b4423, 1);
    g.fillRoundedRect(-5, -26, 10, 8, 2);
    g.fillStyle(0x8b6940, 1);
    g.fillRect(-3, -27, 6, 2);
    g.fillStyle(0x4a3010, 0.5);
    g.fillRoundedRect(-4, -25, 8, 5, 1);
  } else {
    g.destroy();
    return null;
  }
  return g;
}

/** Wizard — the world-builder NPC. Sits at a desk and can be chatted with.
 *  Has GitHub tools on the server side to read and modify world files.
 *  Appearance is themed per-world (graffiti wizard, kahuna, snake oil salesman). */
export class WizardNPC {
  container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private nameTag: NameTag;
  private shadow: Phaser.GameObjects.Ellipse;
  private prop: Phaser.GameObjects.Graphics | null;

  info!: AgentInfo;
  private dir: Dir = "down";
  private texKey = "char-0";

  constructor(
    scene: Phaser.Scene,
    _grid: Grid,
    seat: Tile,
    onClick: (id: string) => void,
    themeId?: string,
  ) {

    const feet = feetOf(seat);
    this.shadow = scene.add.ellipse(0, 2, 50, 18, 0x000000, 0.15);

    // Use themed texture if available
    const themedKey = wizardTextureKey(themeId);
    if (themeId && scene.textures.exists(themedKey)) {
      this.texKey = themedKey;
    }

    this.sprite = scene.add.sprite(0, 0, this.texKey, 6).setOrigin(0.5, 1).setScale(1);
    this.nameTag = createNameTag(scene, "Wizard", "idle");

    // Themed prop accessory
    this.prop = drawWizardProp(scene, themeId);

    const children: Phaser.GameObjects.GameObject[] = [
      this.shadow,
      this.sprite,
    ];
    if (this.prop) children.push(this.prop);
    children.push(this.nameTag.nameBg, this.nameTag.label);

    this.container = scene.add.container(feet.x, feet.y, children);
    this.container.setDepth(10 + this.container.y);
    this.dir = "down";
    this.play(`${this.texKey}-idle-${this.dir}`);

    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on("pointerdown", () => onClick(WIZARD_ID));
  }

  sync(info: AgentInfo): void {
    this.info = info;
    this.nameTag.setStatus(info.status);
    if (info.appearance) {
      const key = agentTextureKey(info);
      if (key !== this.texKey) {
        this.texKey = key;
        this.sprite.setTexture(key, 6);
        this.play(`${key}-idle-${this.dir}`);
      }
    }
  }

  getState(): { x: number; y: number; dir: Dir; state: string } {
    return { x: this.container.x, y: this.container.y, dir: this.dir, state: "idle" };
  }

  remoteUpdate(x: number, y: number, dir: Dir, _state: string): void {
    this.container.setPosition(x, y);
    this.dir = dir;
    this.play(`${this.texKey}-idle-${this.dir}`);
    this.container.setDepth(10 + this.container.y);
  }

  private play(key: string): void {
    if (this.sprite.anims.currentAnim?.key !== key || !this.sprite.anims.isPlaying) {
      this.sprite.play(key, true);
    }
  }

  update(_time: number, _dt: number): void {
    this.play(`${this.texKey}-idle-${this.dir}`);
    this.container.setDepth(10 + this.container.y);
  }

  destroy(): void {
    this.container.destroy();
  }
}
