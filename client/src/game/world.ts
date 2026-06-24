import Phaser from "phaser";
import { CHAR_VARIANTS, CHUNK_SIZE, TILE } from "../../../shared/types";
import type { FiredAgent } from "../../../shared/types";
import type { Store } from "../store";
import type { Net } from "../net";
import { TILE_PX, type Dir } from "./agent";
import { generateChunk, isWalkable, type Chunk, type Biome } from "./worldgen";

const PLAYER_SPEED = 280;
const LOAD_RADIUS = 2; // chunks to load around player
const UNLOAD_RADIUS = 3; // chunks to unload beyond this

/** Color palettes per biome. [floor, wall, accent, bg] */
const BIOME_COLORS: Record<Biome, { floor: number; wall: number; accent: number; bg: number }> = {
  office:    { floor: 0x8a8a99, wall: 0x4a4a55, accent: 0x6a6a7a, bg: 0x3a3a44 },
  ruins:     { floor: 0x7a7a78, wall: 0x3a3a38, accent: 0x5a5a55, bg: 0x2a2a28 },
  overgrown: { floor: 0x5a7a55, wall: 0x2a4a28, accent: 0x3a6a38, bg: 0x1a3a18 },
  void:      { floor: 0x2a2a3a, wall: 0x0a0a12, accent: 0x1a1a2a, bg: 0x050508 },
};

const TILE_COLORS: Record<number, number> = {
  [TILE.FLOOR]: 0x0, // overridden by biome
  [TILE.WALL]: 0x0,
  [TILE.RUBBLE]: 0x8a7a5a,
  [TILE.PILLAR]: 0x9a9a9a,
  [TILE.VINES]: 0x4a8a4a,
  [TILE.VOID]: 0x050508,
};

/** A fired agent wandering the Labyrinth. */
class GhostNPC {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private shadow: Phaser.GameObjects.Ellipse;
  private hint: Phaser.GameObjects.Text;

  info: FiredAgent;
  private dir: Dir = "down";
  private wanderAt = 0;
  private targetX: number;
  private targetY: number;
  private moving = false;
  private scene: WorldScene;

  constructor(scene: WorldScene, info: FiredAgent) {
    this.scene = scene;
    this.info = info;
    const px = info.worldX * TILE_PX + TILE_PX / 2;
    const py = info.worldY * TILE_PX + TILE_PX / 2;

    this.shadow = scene.add.ellipse(0, 0, 44, 16, 0x000000, 0.3);
    this.sprite = scene.add.sprite(0, 0, `char-${info.sprite}`, 0).setOrigin(0.5, 1);
    this.sprite.setTint(0x8888aa); // ghostly tint

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
      .setScale(0.7);

    this.hint = scene.add
      .text(0, -130, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#ddddee",
        stroke: "#1a1a22",
        strokeThickness: 3,
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.7)
      .setVisible(false);

    this.container = scene.add.container(px, py, [
      this.shadow,
      this.sprite,
      this.label,
      this.hint,
    ]);

    this.targetX = px;
    this.targetY = py;
    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on("pointerdown", () => scene.onGhostClick(this.info.id));
  }

  update(time: number, _dt: number, playerX: number, playerY: number): void {
    const c = `char-${this.info.sprite}`;
    const dist = Math.hypot(playerX - this.container.x, playerY - this.container.y);

    // show hint when player is near
    if (dist < 120) {
      const moodLabel: Record<string, string> = {
        melancholy: "...",
        hostile: "!!!",
        wandering: "???",
        dormant: "zzz",
      };
      this.hint
        .setText(`E: ${moodLabel[this.info.mood] ?? "talk"}`)
        .setVisible(true);
    } else {
      this.hint.setVisible(false);
    }

    // wandering AI
    if (!this.moving && time > this.wanderAt) {
      // pick a nearby walkable tile
      const range = 6;
      for (let tries = 0; tries < 10; tries++) {
        const dx = Math.floor((Math.random() - 0.5) * range * 2);
        const dy = Math.floor((Math.random() - 0.5) * range * 2);
        const tx = Math.floor(this.container.x / TILE_PX) + dx;
        const ty = Math.floor(this.container.y / TILE_PX) + dy;
        if (this.scene.isTileWalkable(tx, ty)) {
          this.targetX = tx * TILE_PX + TILE_PX / 2;
          this.targetY = ty * TILE_PX + TILE_PX / 2;
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
      const step = speed * (_dt / 1000);
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

export class WorldScene extends Phaser.Scene {
  private store!: Store;
  private net!: Net;
  private chunks = new Map<string, Chunk>();
  private chunkGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private ghosts = new Map<string, GhostNPC>();
  private player!: Phaser.GameObjects.Sprite;
  private playerLabel!: Phaser.GameObjects.Text;
  private playerDir: Dir = "down";
  private keys!: Record<"W" | "A" | "S" | "D" | "E", Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private returnHint!: Phaser.GameObjects.Text;
  private recruitedHint!: Phaser.GameObjects.Text;
  private wired = false;

  constructor() {
    super("world");
  }

  preload(): void {
    for (let i = 0; i < CHAR_VARIANTS; i++) {
      this.load.spritesheet(`char-${i}`, `assets/characters/char-${i}.png`, {
        frameWidth: 64,
        frameHeight: 96,
      });
    }
    this.load.spritesheet("boss", "assets/characters/boss.png", {
      frameWidth: 64,
      frameHeight: 96,
    });
  }

  create(): void {
    this.store = this.game.registry.get("store") as Store;
    this.net = this.game.registry.get("net") as Net;
    this.chunks.clear();
    this.chunkGraphics.clear();
    this.ghosts.clear();

    // background — dark
    this.cameras.main.setBackgroundColor("#1a1a22");

    // character animations (same as office)
    const sheets = [...Array.from({ length: CHAR_VARIANTS }, (_, i) => `char-${i}`), "boss"];
    const dirs: Dir[] = ["down", "left", "right", "up"];
    for (const key of sheets) {
      if (this.anims.exists(`${key}-work`)) continue;
      dirs.forEach((dir, row) => {
        this.anims.create({
          key: `${key}-walk-${dir}`,
          frames: this.anims.generateFrameNumbers(key, {
            frames: [row * 4, row * 4 + 1, row * 4 + 2, row * 4 + 3],
          }),
          frameRate: 8,
          repeat: -1,
        });
        this.anims.create({
          key: `${key}-idle-${dir}`,
          frames: [{ key, frame: row * 4 }],
          frameRate: 1,
        });
      });
      this.anims.create({
        key: `${key}-work`,
        frames: this.anims.generateFrameNumbers(key, { frames: [12, 13] }),
        frameRate: 2.5,
        repeat: -1,
      });
    }

    // spawn player at the door (top-center of origin chunk)
    const spawnX = Math.floor(CHUNK_SIZE / 2) * TILE_PX + TILE_PX / 2;
    const spawnY = 3 * TILE_PX + TILE_PX / 2;
    this.player = this.add.sprite(spawnX, spawnY, "boss", 0).setOrigin(0.5, 1);
    this.playerDir = "down";

    this.playerLabel = this.add
      .text(0, 0, "BOSS", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#ddddee",
        stroke: "#1a1a22",
        strokeThickness: 3,
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.7);

    // camera — no bounds, follows player
    const cam = this.cameras.main;
    cam.startFollow(this.player, true);
    cam.setZoom(1.5);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,E") as WorldScene["keys"];
    this.input.keyboard!.on("keydown-ESC", () => this.returnToOffice());
    this.input.keyboard!.disableGlobalCapture();

    // hints
    this.returnHint = this.add
      .text(0, 0, "E: RETURN TO OFFICE", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#ddddee",
        stroke: "#1a1a22",
        strokeThickness: 3,
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.7)
      .setDepth(100)
      .setVisible(false);

    this.recruitedHint = this.add
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
      .setDepth(200)
      .setVisible(false);

    // initial chunk load
    this.updateChunks();

    // spawn fired agent ghosts
    if (!this.wired) {
      this.wired = true;
      this.store.subscribe(() => this.syncGhosts());
    }
    this.syncGhosts();
  }

  /** Load/unload chunks around the player. */
  private updateChunks(): void {
    const pcx = Math.floor(this.player.x / (CHUNK_SIZE * TILE_PX));
    const pcy = Math.floor(this.player.y / (CHUNK_SIZE * TILE_PX));

    // load
    for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy++) {
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
        this.loadChunk(pcx + dx, pcy + dy);
      }
    }

    // unload distant chunks
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - pcx) > UNLOAD_RADIUS || Math.abs(chunk.cy - pcy) > UNLOAD_RADIUS) {
        this.chunkGraphics.get(key)?.destroy();
        this.chunkGraphics.delete(key);
        this.chunks.delete(key);
      }
    }
  }

  private loadChunk(cx: number, cy: number): void {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key)) return;

    const chunk = generateChunk(this.store.worldSeed, cx, cy);
    this.chunks.set(key, chunk);
    this.renderChunk(chunk);
  }

  private renderChunk(chunk: Chunk): void {
    const key = `${chunk.cx},${chunk.cy}`;
    const g = this.add.graphics().setDepth(0);
    const palette = BIOME_COLORS[chunk.biome];
    const ox = chunk.cx * CHUNK_SIZE * TILE_PX;
    const oy = chunk.cy * CHUNK_SIZE * TILE_PX;

    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const tile = chunk.tiles[y * CHUNK_SIZE + x];
        const px = ox + x * TILE_PX;
        const py = oy + y * TILE_PX;

        let color: number;
        if (tile === TILE.FLOOR) color = palette.floor;
        else if (tile === TILE.WALL) color = palette.wall;
        else if (tile === TILE.VOID) color = TILE_COLORS[TILE.VOID];
        else color = TILE_COLORS[tile] ?? palette.floor;

        g.fillStyle(color, 1);
        g.fillRect(px, py, TILE_PX, TILE_PX);

        // walls get a top edge highlight
        if (tile === TILE.WALL) {
          g.fillStyle(palette.accent, 0.3);
          g.fillRect(px, py, TILE_PX, 4);
        }

        // pillars and rubble get a small shape
        if (tile === TILE.PILLAR) {
          g.fillStyle(0xaaaaaa, 1);
          g.fillRect(px + 12, py + 12, TILE_PX - 24, TILE_PX - 24);
        } else if (tile === TILE.RUBBLE) {
          g.fillStyle(0x6a5a3a, 1);
          g.fillRect(px + 8, py + 8, TILE_PX - 16, TILE_PX - 16);
        } else if (tile === TILE.VINES) {
          g.fillStyle(0x3a7a3a, 0.6);
          g.fillRect(px + 4, py + 4, TILE_PX - 8, 8);
          g.fillRect(px + 4, py + TILE_PX - 12, TILE_PX - 8, 8);
        }
      }
    }

    this.chunkGraphics.set(key, g);
  }

  /** Check if a world tile is walkable (checks loaded chunks, generates if needed). */
  isTileWalkable(worldTileX: number, worldTileY: number): boolean {
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

  private syncGhosts(): void {
    // add new ghosts
    for (const [id, fa] of this.store.firedAgents) {
      if (!this.ghosts.has(id)) {
        this.ghosts.set(id, new GhostNPC(this, fa));
      }
    }
    // remove recruited ghosts
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

  private tryRecruit(firedAgentId: string): void {
    const ghost = this.ghosts.get(firedAgentId);
    if (!ghost) return;
    const dist = Math.hypot(this.player.x - ghost.container.x, this.player.y - ghost.container.y);
    if (dist > 120) return;

    this.net.send({ type: "recruit", firedAgentId });
    this.showRecruitedHint(ghost.info.name);
  }

  private showRecruitedHint(name: string): void {
    this.recruitedHint
      .setText(`${name} is coming back to the office!`)
      .setPosition(this.player.x, this.player.y - 120)
      .setVisible(true);
    this.time.delayedCall(3000, () => this.recruitedHint.setVisible(false));
  }

  private returnToOffice(): void {
    this.scene.switch("world", "office");
    this.scene.stop("world");
  }

  update(time: number, dt: number): void {
    const active = document.activeElement?.tagName;
    const typing = active === "INPUT" || active === "TEXTAREA" || active === "SELECT";
    if (typing) {
      this.player.play(`boss-idle-${this.playerDir}`, true);
      return;
    }

    // --- player movement with tile collision ---
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const up = this.cursors.up.isDown || this.keys.W.isDown;
    const down = this.cursors.down.isDown || this.keys.S.isDown;
    let vx = (right ? 1 : 0) - (left ? 1 : 0);
    let vy = (down ? 1 : 0) - (up ? 1 : 0);
    if (vx !== 0 && vy !== 0) {
      vx *= 0.7071;
      vy *= 0.7071;
    }

    const speed = PLAYER_SPEED;
    const stepX = vx * speed * (dt / 1000);
    const stepY = vy * speed * (dt / 1000);

    // try X movement
    if (stepX !== 0) {
      const nextX = this.player.x + stepX;
      if (this.canWalk(nextX, this.player.y)) {
        this.player.x = nextX;
      }
    }
    // try Y movement
    if (stepY !== 0) {
      const nextY = this.player.y + stepY;
      if (this.canWalk(this.player.x, nextY)) {
        this.player.y = nextY;
      }
    }

    if (vx !== 0 || vy !== 0) {
      this.playerDir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
      this.player.play(`boss-walk-${this.playerDir}`, true);
    } else {
      this.player.play(`boss-idle-${this.playerDir}`, true);
    }
    this.player.setDepth(10 + this.player.y);
    this.playerLabel
      .setPosition(this.player.x, this.player.y - 108)
      .setDepth(10 + this.player.y)
      .setText((this.store.player?.name ?? "BOSS").toUpperCase());

    // load/unload chunks as player moves
    this.updateChunks();

    // update ghosts
    for (const ghost of this.ghosts.values()) {
      ghost.update(time, dt, this.player.x, this.player.y);
    }

    // E: return to office (near origin door) or recruit nearby ghost
    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      // check return door — top-center of origin chunk
      const doorX = Math.floor(CHUNK_SIZE / 2) * TILE_PX + TILE_PX / 2;
      const doorY = 0;
      const doorDist = Math.hypot(this.player.x - doorX, this.player.y - doorY);
      if (doorDist < 100) {
        this.returnToOffice();
        return;
      }

      // check nearby ghosts
      let nearest: { id: string; d: number } | null = null;
      for (const [id, ghost] of this.ghosts) {
        const d = Math.hypot(this.player.x - ghost.container.x, this.player.y - ghost.container.y);
        if (d < 120 && (!nearest || d < nearest.d)) nearest = { id, d };
      }
      if (nearest) this.tryRecruit(nearest.id);
    }

    // return door hint
    const doorX = Math.floor(CHUNK_SIZE / 2) * TILE_PX + TILE_PX / 2;
    const doorY = 2 * TILE_PX;
    const doorDist = Math.hypot(this.player.x - doorX, this.player.y - doorY);
    if (doorDist < 120) {
      this.returnHint.setPosition(doorX, doorY - 20).setVisible(true);
    } else {
      this.returnHint.setVisible(false);
    }
  }

  /** Check if the player's bounding box can occupy a pixel position. */
  private canWalk(px: number, py: number): boolean {
    // player body is roughly 40px wide, 28px tall, offset from sprite origin (0.5, 1)
    // sprite is 64x96, origin at bottom-center, so feet are at (px, py)
    const halfW = 20;
    const footH = 28;
    const checkPoints = [
      { x: px - halfW, y: py - 4 },
      { x: px + halfW, y: py - 4 },
      { x: px - halfW, y: py - footH },
      { x: px + halfW, y: py - footH },
      { x: px, y: py - footH / 2 },
    ];
    for (const p of checkPoints) {
      const tx = Math.floor(p.x / TILE_PX);
      const ty = Math.floor(p.y / TILE_PX);
      if (!this.isTileWalkable(tx, ty)) return false;
    }
    return true;
  }
}
