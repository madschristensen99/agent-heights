import Phaser from "phaser";
import { CHAR_VARIANTS } from "../../../shared/types";
import type { Store } from "../store";
import { AgentNPC, YukiNPC, feetOf, tileOf, TILE_PX, STATUS_COLORS, type Dir } from "./agent";
import { Grid, type Tile } from "./path";
import { WorldLayer } from "./world";
import { CRTWarmthPipeline } from "./shaders";

const PLAYER_SPEED = 380;

export class OfficeScene extends Phaser.Scene {
  private store!: Store;
  private grid!: Grid;
  private npcs = new Map<string, AgentNPC>();
  private yuki: YukiNPC | null = null;
  private yukiSeat: Tile | null = null;
  private seats: Tile[] = [];
  private extraSpots: Tile[] = [];
  private monitors: Phaser.GameObjects.Sprite[] = [];
  private spawnTile: Tile = { x: 14, y: 16 };
  private doorTile: Tile = { x: 14, y: 17 };
  private boardTile: Tile = { x: 14, y: 2 };
  private boardHint!: Phaser.GameObjects.Text;
  private coffeeTile: Tile = { x: 23, y: 2 };
  private coffeeUntil = 0;
  private coffeeHint!: Phaser.GameObjects.Text;
  private world!: WorldLayer;
  private theme: "classic" | "lumon" = "classic";
  /** Store listeners are registered once; they survive scene restarts. */
  private wired = false;
  private ready = false;

  private mapPx = { w: 960, h: 640 };
  private player!: Phaser.GameObjects.Sprite;
  private playerLabel!: Phaser.GameObjects.Text;
  private playerNameBg!: Phaser.GameObjects.Graphics;
  private playerDir: Dir = "down";
  private keys!: Record<"W" | "A" | "S" | "D" | "E" | "Q", Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private selectRing!: Phaser.GameObjects.Ellipse;
  private lightingOverlay!: Phaser.GameObjects.Graphics;
  private monitorGlows: Phaser.GameObjects.Arc[] = [];
  private dayNightTint!: Phaser.GameObjects.Rectangle;

  constructor() {
    super("office");
  }

  preload(): void {
    this.load.tilemapTiledJSON("map-classic", "assets/maps/office.json");
    this.load.tilemapTiledJSON("map-lumon", "assets/maps/lumon.json");
    this.load.image("tiles-classic", "assets/tilesets/office.png");
    this.load.image("tiles-lumon", "assets/tilesets/lumon.png");
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
    this.load.spritesheet("char-yuki", "assets/characters/char-yuki.png", {
      frameWidth: 64,
      frameHeight: 96,
    });
    this.load.spritesheet("monitor", "assets/sprites/monitor.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("bubble", "assets/sprites/bubble.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("world-tiles", "assets/tilesets/world.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
  }

  create(): void {
    this.store = this.game.registry.get("store") as Store;
    this.theme = this.store.settings.game.theme === "lumon" ? "lumon" : "classic";

    // register CRT warmth post-processing pipeline (once)
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (renderer && !renderer.pipelines.has("CRTWarmth")) {
      renderer.pipelines.add("CRTWarmth", new CRTWarmthPipeline(this.game));
    }
    // apply to camera
    if (renderer) {
      this.cameras.main.setPostPipeline("CRTWarmth");
    }

    // a theme change restarts the scene — drop everything the last run built
    this.npcs.clear();
    this.yuki = null;
    this.yukiSeat = null;
    this.seats = [];
    this.extraSpots = [];
    this.monitors = [];
    this.coffeeUntil = 0;

    const map = this.make.tilemap({ key: `map-${this.theme}` });
    const tiles = map.addTilesetImage(
      this.theme === "lumon" ? "lumon" : "office",
      `tiles-${this.theme}`,
    )!;

    // draw a floor-colored backdrop so empty map tiles aren't white
    const floorColor = this.theme === "lumon" ? 0xe8e8ec : 0xd4d0c8;
    const bg = this.add.graphics().setDepth(-1);
    bg.fillStyle(floorColor, 1);
    bg.fillRect(0, 0, map.widthInPixels, map.heightInPixels);
    // subtle grid lines for texture
    bg.lineStyle(1, floorColor === 0xd4d0c8 ? 0xc8c4bc : 0xd8d8dc, 0.3);
    for (let x = 0; x <= map.width; x++) {
      bg.moveTo(x * TILE_PX, 0);
      bg.lineTo(x * TILE_PX, map.heightInPixels);
    }
    for (let y = 0; y <= map.height; y++) {
      bg.moveTo(0, y * TILE_PX);
      bg.lineTo(map.widthInPixels, y * TILE_PX);
    }
    bg.strokePath();

    map.createLayer("Ground", tiles)!.setDepth(0);
    const walls = map.createLayer("Walls", tiles)!.setDepth(1);
    const furniture = map.createLayer("Furniture", tiles)!.setDepth(2);
    walls.setCollisionByProperty({ solid: true });
    furniture.setCollisionByProperty({ solid: true });

    // walkability grid for NPC pathfinding
    const walkable: boolean[][] = [];
    for (let y = 0; y < map.height; y++) {
      walkable[y] = [];
      for (let x = 0; x < map.width; x++) {
        const w = walls.getTileAt(x, y);
        const f = furniture.getTileAt(x, y);
        walkable[y][x] = !(w?.properties?.solid || f?.properties?.solid);
      }
    }
    this.grid = new Grid(map.width, map.height, walkable);

    // points authored in the Tiled map
    for (const obj of map.getObjectLayer("Points")?.objects ?? []) {
      const tx = Math.floor((obj.x ?? 0) / TILE_PX);
      const ty = Math.floor((obj.y ?? 0) / TILE_PX);
      if (obj.name === "spawn") {
        this.spawnTile = { x: tx, y: ty };
      } else if (obj.name === "coffee") {
        this.coffeeTile = { x: tx, y: ty };
      } else if (obj.name === "yuki-seat") {
        this.yukiSeat = { x: tx, y: ty };
      } else if (obj.name === "yuki-monitor") {
        // Side view of monitor — thin dark rectangle (back of monitor facing left toward entrance)
        const mx = obj.x ?? 0;
        const my = (obj.y ?? 0) - 4;
        const g = this.add.graphics();
        g.fillStyle(0x2a2a2e, 1);
        g.fillRoundedRect(mx - 4, my - 28, 8, 48, 2);
        g.fillStyle(0x1a1a1e, 1);
        g.fillRect(mx - 2, my + 18, 4, 8);
        g.setDepth(10 + (obj.y ?? 0) - 10);
      } else if (obj.name.startsWith("seat-")) {
        this.seats[Number(obj.name.slice(5))] = { x: tx, y: ty };
      } else if (obj.name.startsWith("monitor-")) {
        const idx = Number(obj.name.slice(8));
        const spr = this.add
          .sprite(obj.x ?? 0, (obj.y ?? 0) - 4, "monitor", 0)
          .setDepth(10 + (obj.y ?? 0) - 10);
        this.monitors[idx] = spr;
      }
    }
    this.doorTile = { x: this.spawnTile.x, y: this.spawnTile.y + 2 };
    this.registry.set("spawnTile", this.spawnTile);

    // carve a door gap — make the bottom wall tiles walkable at the door columns
    // so the player can walk straight out into the world.
    // The door is 2 tiles wide at spawnTile.x and spawnTile.x+1.
    const doorX = this.spawnTile.x;
    for (let dy = 0; dy <= 3; dy++) {
      const ty = this.spawnTile.y + dy;
      if (ty < map.height) {
        walkable[ty][doorX] = true;
        if (doorX + 1 < map.width) walkable[ty][doorX + 1] = true;
      }
    }
    this.grid = new Grid(map.width, map.height, walkable);

    // Yuki — the office manager NPC
    if (this.yukiSeat) {
      this.yuki = new YukiNPC(this, this.grid, this.yukiSeat);
    }

    // standing spots for agents hired beyond the 8 desks — stable order so
    // every client agrees on who stands where
    for (let y = 3; y < map.height - 2 && this.extraSpots.length < 96; y++) {
      for (let x = 2; x < map.width - 2; x++) {
        if (!walkable[y][x] || (x + y) % 3 !== 0) continue;
        if (this.seats.some((s) => s && s.x === x && s.y === y)) continue;
        if (this.yukiSeat && this.yukiSeat.x === x && this.yukiSeat.y === y) continue;
        this.extraSpots.push({ x, y });
      }
    }

    // animations for every character sheet
    const sheets = [...Array.from({ length: CHAR_VARIANTS }, (_, i) => `char-${i}`), "boss", "char-yuki"];
    const dirs: Dir[] = ["down", "left", "right", "up"];
    const FRAMES_PER_ROW = 8;
    for (const key of sheets) {
      if (this.anims.exists(`${key}-work`)) continue; // already built before a restart
      dirs.forEach((dir, row) => {
        const base = row * FRAMES_PER_ROW;
        this.anims.create({
          key: `${key}-walk-${dir}`,
          frames: this.anims.generateFrameNumbers(key, {
            frames: [base, base + 1, base + 2, base + 3, base + 4, base + 5],
          }),
          frameRate: 10,
          repeat: -1,
        });
        // idle: mostly breathing (frame 6) with a quick blink (frame 7)
        // We duplicate frame 6 many times then show frame 7 once, so the
        // blink is a brief single-frame flash among long breathing stretches.
        const breathFrames = Array(24).fill(base + 6);
        breathFrames.push(base + 7); // quick blink
        breathFrames.push(base + 6); // back to breathing
        this.anims.create({
          key: `${key}-idle-${dir}`,
          frames: this.anims.generateFrameNumbers(key, {
            frames: breathFrames,
          }),
          frameRate: 10,
          repeat: -1,
          repeatDelay: Math.random() * 2,
        });
      });
      // work animation — uses down-facing idle/breathing frames (row 0)
      this.anims.create({
        key: `${key}-work`,
        frames: this.anims.generateFrameNumbers(key, { frames: [6, 7] }),
        frameRate: 2.5,
        repeat: -1,
      });
    }

    // water animation — cycles through 3 frames in the world tileset
    if (!this.anims.exists("water-anim")) {
      this.anims.create({
        key: "water-anim",
        frames: this.anims.generateFrameNumbers("world-tiles", { frames: [21, 22, 23] }),
        frameRate: 4,
        repeat: -1,
      });
    }

    // the boss (you)
    const feet = feetOf(this.spawnTile);
    this.player = this.add.sprite(feet.x, feet.y, "boss", 0)
      .setOrigin(0.5, 1);
    // no physics body — we do manual movement for smoothness

    this.playerNameBg = this.add.graphics();
    this.playerLabel = this.add
      .text(0, 0, "BOSS", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#1d2126",
        stroke: "#f4f6f8",
        strokeThickness: 3,
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.7);
    this.drawPlayerNameBg();

    this.selectRing = this.add
      .ellipse(0, 0, 56, 24)
      .setStrokeStyle(2, 0x3a8cd4)
      .setFillStyle(0, 0)
      .setVisible(false)
      .setDepth(9);

    // --- task board on the front wall ---
    this.drawBoard();
    this.boardHint = this.add
      .text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#1d2126",
        stroke: "#f4f6f8",
        strokeThickness: 3,
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.7)
      .setDepth(100)
      .setVisible(false);

    this.coffeeHint = this.add
      .text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#1d2126",
        stroke: "#f4f6f8",
        strokeThickness: 3,
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.7)
      .setDepth(100)
      .setVisible(false);

    this.mapPx = { w: map.widthInPixels, h: map.heightInPixels };
    // world layer — infinite procedural world outside the office
    this.world = new WorldLayer(this, this.store, this.game.registry.get("net"), map.widthInPixels, map.heightInPixels);
    this.world.setOfficeGrid(this.grid);

    // flower beds flanking the front door
    const doorPxX = this.spawnTile.x * TILE_PX + TILE_PX / 2;
    const doorPxY = map.heightInPixels;
    const flowerG = this.add.graphics().setDepth(3);
    const flowerColors = [0xe8c84a, 0xe84a8a, 0x8a4ae8, 0xff6a4a, 0x4ae8ca];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const fx = doorPxX + side * (TILE_PX * 1.5 + i * 14);
        const fy = doorPxY + 10 + Math.sin(i * 1.7) * 8;
        const color = flowerColors[(i + (side > 0 ? 2 : 0)) % flowerColors.length];
        flowerG.fillStyle(0x2a6a2a, 1);
        flowerG.fillCircle(fx, fy + 5, 3);
        flowerG.fillStyle(color, 1);
        flowerG.fillCircle(fx, fy, 5);
        flowerG.fillStyle(0xffdd44, 1);
        flowerG.fillCircle(fx, fy, 2);
      }
    }

    const cam = this.cameras.main;
    // no camera bounds — the world is infinite
    cam.startFollow(this.player, true);
    cam.setZoom(this.bestZoom());
    const onResize = () => {
      cam.setZoom(this.bestZoom());
      this.drawVignette();
      this.dayNightTint.setSize(this.scale.width, this.scale.height);
    };
    this.scale.on("resize", onResize);
    this.events.once("shutdown", () => this.scale.off("resize", onResize));

    // --- lighting system ---
    // vignette: darkened edges fixed to screen
    this.lightingOverlay = this.add.graphics().setDepth(900).setScrollFactor(0);
    this.drawVignette();

    // day/night tint: subtle color overlay that shifts over time
    this.dayNightTint = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0)
      .setOrigin(0, 0)
      .setDepth(890)
      .setScrollFactor(0);

    // monitor glow pool — one per monitor slot
    this.monitors.forEach(() => {
      const glow = this.add.circle(0, 0, 48, 0x4affa8, 0).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
      this.monitorGlows.push(glow);
    });

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,E,Q") as OfficeScene["keys"];
    this.input.keyboard!.on("keydown-ESC", () => {
      this.store.select(null);
      this.store.toggleBoard(false);
    });
    // never swallow keystrokes meant for HUD inputs (onboarding, task box, …)
    this.input.keyboard!.disableGlobalCapture();

    if (!this.wired) {
      this.wired = true;
      this.store.subscribe(() => {
        if (!this.ready) return;
        const theme = this.store.settings.game.theme === "lumon" ? "lumon" : "classic";
        if (theme !== this.theme) {
          this.ready = false;
          this.scene.restart();
          return;
        }
        this.syncAgents();
        this.world.syncGhosts();
      });
      this.store.onHuddle((agentIds) => {
        if (this.ready) this.startHuddle(agentIds);
      });
    }
    this.ready = true;
    this.syncAgents();
    this.world.syncGhosts();
  }

  /** Draw rounded background behind player nameplate. */
  private drawPlayerNameBg(): void {
    const g = this.playerNameBg;
    g.clear();
    const w = this.playerLabel.displayWidth + 16;
    const h = 18;
    const r = 4;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-w / 2, -14, w, h, r);
    g.lineStyle(1, 0xffffff, 0.15);
    g.strokeRoundedRect(-w / 2, -14, w, h, r);
  }

  /** Draw the vignette overlay — darkened edges with radial gradient. */
  private drawVignette(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const g = this.lightingOverlay;
    g.clear();
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(cx, cy);
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const ringW = Math.max(2, (maxR * 0.4) * (1 - t));
      const alpha = Math.pow(t, 2) * 0.4;
      g.fillStyle(0x000000, alpha);
      // top bar
      g.fillRect(0, 0, w, Math.ceil(ringW * 0.5));
      // bottom bar
      g.fillRect(0, h - Math.ceil(ringW * 0.5), w, Math.ceil(ringW * 0.5));
      // left bar
      g.fillRect(0, 0, Math.ceil(ringW * 0.5), h);
      // right bar
      g.fillRect(w - Math.ceil(ringW * 0.5), 0, Math.ceil(ringW * 0.5), h);
    }
  }

  /** Update lighting: monitor glows, day/night cycle, vignette refresh. */
  private updateLighting(time: number): void {
    // day/night cycle: 120s full cycle, shifts between day (0 alpha) and night (0.25 alpha blue)
    const cycle = (time / 120000) % 1;
    const nightFactor = (Math.sin(cycle * Math.PI * 2 - Math.PI / 2) + 1) / 2; // 0 = day, 1 = night
    const outside = this.world.isOutside(this.player.x, this.player.y);
    // only apply day/night tint when outside the office
    if (outside) {
      this.dayNightTint.setFillStyle(0x0a0a30, nightFactor * 0.3);
    } else {
      this.dayNightTint.setFillStyle(0x000000, 0);
    }

    // monitor glows: pulse for working agents
    const pulse = 0.15 + Math.sin(time * 0.003) * 0.05;
    this.monitors.forEach((m, i) => {
      const glow = this.monitorGlows[i];
      if (!glow) return;
      const agent = [...this.store.agents.values()].find((a) => a.deskIndex === i);
      if (agent && agent.status !== "idle") {
        const color = STATUS_COLORS[agent.status];
        glow.setPosition(m.x, m.y + 4);
        glow.setFillStyle(color, pulse);
        glow.setVisible(true);
      } else {
        glow.setVisible(false);
      }
    });
  }

  /** Everyone called to ASSIGN-TO-ALL gathers in a ring around the boss. */
  private startHuddle(agentIds: string[]): void {
    const boss = tileOf(this.player.x, this.player.y);
    const ring: Tile[] = [];
    for (const r of [1, 2]) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const t = { x: boss.x + dx, y: boss.y + dy };
          if (this.grid.ok(t.x, t.y)) ring.push(t);
        }
      }
    }
    const now = this.time.now;
    agentIds.forEach((id, i) => {
      const npc = this.npcs.get(id);
      const spot = ring[i % Math.max(ring.length, 1)];
      if (npc && spot) npc.huddle(spot, boss, now);
    });
  }

  private bestZoom(): number {
    // zoom up until the office covers the whole viewport — the camera
    // follows the boss, so overflow just means you walk to see the rest
    const z = Math.max(this.scale.width / this.mapPx.w, this.scale.height / this.mapPx.h);
    return Math.max(1, Math.ceil(z));
  }

  /** Check if the player can walk to a pixel position inside the office. */
  private canWalkOffice(px: number, py: number): boolean {
    const halfW = 12;
    const checks = [
      { x: px - halfW, y: py - 2 },
      { x: px + halfW, y: py - 2 },
      { x: px, y: py - 10 },
    ];
    for (const p of checks) {
      const tx = Math.floor(p.x / TILE_PX);
      const ty = Math.floor(p.y / TILE_PX);
      if (this.grid.ok(tx, ty)) continue;
      // outside grid bounds — check world collision instead
      if (tx < 0 || ty < 0 || tx >= this.grid.width || ty >= this.grid.height) {
        const wtx = Math.floor((p.x - this.world.offset.x) / TILE_PX);
        const wty = Math.floor((p.y - this.world.offset.y) / TILE_PX);
        if (!this.world.isTileWalkable(wtx, wty)) return false;
        continue;
      }
      return false;
    }
    return true;
  }

  /** Draw a kanban-style task board on the front wall of the office. */
  private drawBoard(): void {
    const bx = this.boardTile.x * TILE_PX + 32;
    const by = this.boardTile.y * TILE_PX + 8;
    const bw = 320;
    const bh = 88;

    const g = this.add.graphics().setDepth(3);
    // outer frame with bevel
    g.fillStyle(0x1a2838, 1);
    g.fillRoundedRect(bx - bw / 2 - 6, by - 6, bw + 12, bh + 12, 6);
    g.fillStyle(0x2a3848, 1);
    g.fillRoundedRect(bx - bw / 2 - 4, by - 4, bw + 8, bh + 8, 5);
    // inner board
    g.fillStyle(0xf0f5fa, 1);
    g.fillRoundedRect(bx - bw / 2, by, bw, bh, 4);
    // top highlight
    g.fillStyle(0xffffff, 0.15);
    g.fillRoundedRect(bx - bw / 2, by, bw, 4, 4);

    // column headers with rounded tabs
    const colW = (bw - 24) / 3;
    const cols = [0xe8a838, 0x4cb866, 0x4a9cd8];
    for (let i = 0; i < 3; i++) {
      const cx = bx - bw / 2 + 8 + i * (colW + 4);
      g.fillStyle(cols[i], 0.8);
      g.fillRoundedRect(cx, by + 8, colW, 16, 3);
      g.fillStyle(0xffffff, 0.2);
      g.fillRoundedRect(cx, by + 8, colW, 4, 3);
    }

    // sticky notes with shadows
    const notes: { col: number; y: number; color: number }[] = [
      { col: 0, y: 32, color: 0xffe69e },
      { col: 0, y: 60, color: 0xffe69e },
      { col: 1, y: 32, color: 0xc4e8c4 },
      { col: 2, y: 32, color: 0xc4d8f0 },
    ];
    for (const n of notes) {
      const nx = bx - bw / 2 + 16 + n.col * (colW + 4);
      // shadow
      g.fillStyle(0x000000, 0.12);
      g.fillRoundedRect(nx + 2, n.y + 2, 24, 24, 2);
      // note
      g.fillStyle(n.color, 1);
      g.fillRoundedRect(nx, n.y, 24, 24, 2);
      // highlight
      g.fillStyle(0xffffff, 0.15);
      g.fillRoundedRect(nx, n.y, 24, 4, 2);
    }
  }

  private syncAgents(): void {
    for (const [id, info] of this.store.agents) {
      const existing = this.npcs.get(id);
      if (existing) {
        existing.sync(info);
      } else {
        const overflow = info.deskIndex - this.seats.length;
        const seat =
          this.seats[info.deskIndex] ??
          this.extraSpots[overflow % Math.max(this.extraSpots.length, 1)] ??
          this.spawnTile;
        const npc = new AgentNPC(this, this.grid, info, this.doorTile, seat, (clicked) =>
          this.store.select(clicked),
        );
        this.npcs.set(id, npc);
      }
    }
    for (const [id, npc] of this.npcs) {
      if (!this.store.agents.has(id)) {
        npc.destroy();
        this.npcs.delete(id);
      }
    }
    // monitors glow whenever someone's at the desk — working or just typing;
    // they only go dark during the post-task break (done/error linger)
    this.monitors.forEach((m, i) => {
      const agent = [...this.store.agents.values()].find((a) => a.deskIndex === i);
      if (!agent || agent.status === "idle") {
        m?.setFrame(0).clearTint();
      } else {
        m?.setFrame(1);
        m?.setTint(STATUS_COLORS[agent.status]);
      }
    });
  }

  update(time: number, dt: number): void {
    // typing in a HUD field? the game keyboard is yours, not the boss's
    const active = document.activeElement?.tagName;
    const typing = active === "INPUT" || active === "TEXTAREA" || active === "SELECT";
    if (typing) {
      this.player.play(`boss-idle-${this.playerDir}`, true);
      for (const npc of this.npcs.values()) npc.update(time, dt, this.store.settings.game.idleWander, this.player.x, this.player.y);
      this.yuki?.update(time, dt, false, this.player.x, this.player.y);
      const sel = this.store.selectedId ? this.npcs.get(this.store.selectedId) : null;
      this.selectRing.setVisible(!!sel);
      if (sel) this.selectRing.setPosition(sel.container.x, sel.container.y + 1);
      return;
    }

    // --- player movement ---
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

    const outside = this.world.isOutside(this.player.x, this.player.y);
    const tileSpeedMult = outside ? this.world.getTileSpeedAt(this.player.x, this.player.y) : 1;
    const speed = (time < this.coffeeUntil ? PLAYER_SPEED * 2 : PLAYER_SPEED) * tileSpeedMult;

    // always use manual movement for consistent feel
    const stepX = vx * speed * (dt / 1000);
    const stepY = vy * speed * (dt / 1000);

    if (outside) {
      // world tile collision
      if (stepX !== 0 && this.world.canWalk(this.player.x + stepX, this.player.y)) {
        this.player.x += stepX;
      }
      if (stepY !== 0 && this.world.canWalk(this.player.x, this.player.y + stepY)) {
        this.player.y += stepY;
      }
    } else {
      // office collision via the walkability grid
      if (stepX !== 0 && this.canWalkOffice(this.player.x + stepX, this.player.y)) {
        this.player.x += stepX;
      }
      if (stepY !== 0 && this.canWalkOffice(this.player.x, this.player.y + stepY)) {
        this.player.y += stepY;
      }
    }

    if (vx !== 0 || vy !== 0) {
      this.playerDir =
        Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
      this.player.play(`boss-walk-${this.playerDir}`, true);
    } else {
      this.player.play(`boss-idle-${this.playerDir}`, true);
    }
    this.player.setDepth(10 + this.player.y);
    const playerName = (this.store.player?.name ?? "BOSS").toUpperCase();
    if (this.playerLabel.text !== playerName) {
      this.playerLabel.setText(playerName);
      this.drawPlayerNameBg();
    }
    this.playerLabel
      .setPosition(this.player.x, this.player.y - 108)
      .setDepth(10 + this.player.y);
    this.playerNameBg
      .setPosition(this.player.x, this.player.y - 108)
      .setDepth(10 + this.player.y - 0.1);
    this.playerLabel.setColor(time < this.coffeeUntil ? "#b0741f" : "#1d2126");

    // E: grab coffee, talk to the nearest agent, open the task board, or recruit a ghost
    const ePressed = Phaser.Input.Keyboard.JustDown(this.keys.E);
    if (ePressed) {
      // check the coffee machine
      const coffeePx = { x: this.coffeeTile.x * TILE_PX + 32, y: this.coffeeTile.y * TILE_PX + 32 };
      const coffeeDist = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        coffeePx.x,
        coffeePx.y,
      );
      if (coffeeDist < 144) {
        this.coffeeUntil = time + 15000;
        this.store.toast("Coffee boost! 2x speed for 15s.");
        // coffee particle burst
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * Math.PI * 2;
          const p = this.add.circle(coffeePx.x, coffeePx.y, 2, 0xb0741f, 0.9).setDepth(50);
          this.tweens.add({
            targets: p,
            x: coffeePx.x + Math.cos(angle) * 30,
            y: coffeePx.y + Math.sin(angle) * 30 - 20,
            alpha: 0,
            duration: 600,
            onComplete: () => p.destroy(),
          });
        }
      } else {
        // check the board — it's a big target on the wall
        const boardPx = { x: this.boardTile.x * TILE_PX + 32, y: this.boardTile.y * TILE_PX + 52 };
        const boardDist = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          boardPx.x,
          boardPx.y,
        );
        if (boardDist < 160) {
          this.store.toggleBoard();
        } else {
          let best: { id: string; d: number } | null = null;
          for (const [id, npc] of this.npcs) {
            const d = Phaser.Math.Distance.Between(
              this.player.x,
              this.player.y,
              npc.container.x,
              npc.container.y,
            );
            if (d < 144 && (!best || d < best.d)) best = { id, d };
          }
          this.store.select(best ? best.id : null);
          if (best) {
            // defer focus so this keypress doesn't type "e" into the chat box
            setTimeout(() => {
              (document.getElementById("d-chat") as HTMLInputElement | null)?.focus();
            }, 0);
          }
        }
      }
    }

    // --- agents ---
    for (const npc of this.npcs.values()) npc.update(time, dt, this.store.settings.game.idleWander, this.player.x, this.player.y);
    this.yuki?.update(time, dt, false, this.player.x, this.player.y);

    // selection ring
    const sel = this.store.selectedId ? this.npcs.get(this.store.selectedId) : null;
    this.selectRing.setVisible(!!sel);
    if (sel) this.selectRing.setPosition(sel.container.x, sel.container.y + 1);

    // --- lighting ---
    this.updateLighting(time);

    // --- world layer: chunks, ghosts, compass, recruit ---
    this.registry.set("playerPos", { x: this.player.x, y: this.player.y });
    this.world.update(time, dt, this.player.x, this.player.y, ePressed);

    // Q: teleport back to office when outside
    if (outside && Phaser.Input.Keyboard.JustDown(this.keys.Q)) {
      const spawn = feetOf(this.spawnTile);
      this.cameras.main.fadeOut(200, 10, 10, 30);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.player.setPosition(spawn.x, spawn.y);
        this.cameras.main.fadeIn(300, 10, 10, 30);
      });
    }

    // check for death teleport from world layer
    const teleportTo = this.registry.get("teleportTo") as { x: number; y: number } | undefined;
    if (teleportTo) {
      this.cameras.main.fadeOut(300, 10, 10, 30);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.player.setPosition(teleportTo.x, teleportTo.y);
        this.cameras.main.fadeIn(400, 10, 10, 30);
      });
      this.registry.remove("teleportTo");
      this.store.toast("You were knocked out and dragged back to the office!");
    }

    // board proximity hint
    const boardPx = { x: this.boardTile.x * TILE_PX + 32, y: this.boardTile.y * TILE_PX + 52 };
    const boardDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, boardPx.x, boardPx.y);
    if (boardDist < 160 && !this.store.boardOpen) {
      this.boardHint
        .setPosition(boardPx.x, boardPx.y + 64)
        .setText("E: TASK BOARD")
        .setVisible(true);
    } else {
      this.boardHint.setVisible(false);
    }

    // coffee machine proximity hint
    const coffeePx = { x: this.coffeeTile.x * TILE_PX + 32, y: this.coffeeTile.y * TILE_PX + 32 };
    const coffeeDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, coffeePx.x, coffeePx.y);
    if (coffeeDist < 144) {
      this.coffeeHint
        .setPosition(coffeePx.x, coffeePx.y + 64)
        .setText(time < this.coffeeUntil ? "E: REFILL" : "E: GRAB COFFEE")
        .setVisible(true);
    } else {
      this.coffeeHint.setVisible(false);
    }
  }
}

export { tileOf };
