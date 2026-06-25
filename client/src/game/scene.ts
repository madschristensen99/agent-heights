import Phaser from "phaser";
import type { Store } from "../store";
import { AgentNPC, YukiNPC, feetOf, tileOf, TILE_PX, STATUS_COLORS, agentTextureKey, type Dir } from "./agent";
import { YUKI_ID } from "../../../shared/types";
import { Grid, type Tile } from "./path";
import { WorldLayer } from "./world";
import { BloomPipeline, ColorGradePipeline, DOFPipeline } from "./shaders";
import { generateAllTextures } from "./textures";
import { generateCharTexture, CHAR_FRAMES_PER_ROW } from "./chargen";
import { upgradeFurniture, CHAIR_TEX_DOWN, CHAIR_TEX_UP, CHAIR_TEX_LEFT, MONITOR_TEX } from "./furniture";
import { achievements, ACHIEVEMENTS } from "./achievements";

const PLAYER_SPEED = 380;

export class OfficeScene extends Phaser.Scene {
  private store!: Store;
  private grid!: Grid;
  private npcs = new Map<string, AgentNPC>();
  private yuki: YukiNPC | null = null;
  private yukiSeat: Tile | null = null;
  private yukiOfficeZone: Phaser.GameObjects.Zone | null = null;
  private seats: Tile[] = [];
  private extraSpots: Tile[] = [];
  private monitors: Phaser.GameObjects.Sprite[] = [];
  private chairs: Phaser.GameObjects.Sprite[] = [];
  private yukiMonitor: Phaser.GameObjects.Sprite | null = null;
  private spawnTile: Tile = { x: 14, y: 16 };
  private doorTile: Tile = { x: 14, y: 17 };
  private boardTile: Tile = { x: 14, y: 2 };
  private boardHint!: Phaser.GameObjects.Text;
  private coffeeTile: Tile = { x: 23, y: 2 };
  private coffeeUntil = 0;
  private coffeeHint!: Phaser.GameObjects.Text;

  // --- new office interactables ---
  private fridgeTile: Tile = { x: 26, y: 2 };
  private coolerTile: Tile = { x: 28, y: 4 };
  private clockTile: Tile = { x: 6, y: 1 };
  private vendingTile: Tile | null = null;
  private sofaTile: Tile | null = null;
  private filingTiles: Tile[] = [];
  private plantTiles: Tile[] = [];

  private fridgeUntil = 0; // cooldown for fridge
  private coolerUntil = 0; // cooldown for water cooler
  private clockUntil = 0; // cooldown for clock
  private filingUntil = 0; // cooldown for filing cabinets
  private vendingUntil = 0; // cooldown for vending machine
  private plantUntil = 0; // buff duration for watered plants
  private plantCooldownUntil = 0; // cooldown for watering
  private sofaUntil = 0; // cooldown for sofa

  private mailboxGfx!: Phaser.GameObjects.Graphics;
  private mailboxHint!: Phaser.GameObjects.Text;
  private mailboxUntil = 0; // cooldown for checking mail
  private mailboxHasMail = false;
  private mailboxNextMail = 0; // timestamp when next mail arrives
  private mailboxPx = { x: 0, y: 0 };

  private fridgeHint!: Phaser.GameObjects.Text;
  private coolerHint!: Phaser.GameObjects.Text;
  private clockHint!: Phaser.GameObjects.Text;
  private vendingHint!: Phaser.GameObjects.Text;
  private sofaHint!: Phaser.GameObjects.Text;
  private filingHint!: Phaser.GameObjects.Text;
  private plantHint!: Phaser.GameObjects.Text;
  // mailboxHint declared above with mailbox fields

  private trophyTile: Tile = { x: 2, y: 2 };
  private trophyHint!: Phaser.GameObjects.Text;
  private trophyGfx!: Phaser.GameObjects.Graphics;
  private trophyAchCount = -1;
  private sceneStart = 0;

  private hallOfFameTile: Tile = { x: 1, y: 15 };
  private hallOfFameHint!: Phaser.GameObjects.Text;
  private hallOfFameGfx!: Phaser.GameObjects.Graphics;

  // --- helicopter / red button ---
  private redButtonTile: Tile = { x: 25, y: 7 };
  private redButtonHint!: Phaser.GameObjects.Text;
  private redButtonUntil = 0;
  private padCenter = { x: 960, y: -130 };
  private padFrontPx = { x: 932, y: -92 };
  private heliActive = false;
  private heliContainer: Phaser.GameObjects.Container | null = null;
  private heliRotor: Phaser.GameObjects.Graphics | null = null;
  private heliAgent: Phaser.GameObjects.Container | null = null;
  private heliElevatorGfx: Phaser.GameObjects.Graphics | null = null;

  private world!: WorldLayer;
  private theme: "classic" | "lumon" = "classic";
  /** Pixel positions of chimney tiles — for smoke when devops agents work. */
  private chimneyPositions: { x: number; y: number }[] = [];
  /** Store listeners are registered once; they survive scene restarts. */
  private wired = false;
  private ready = false;

  private mapPx = { w: 960, h: 640 };
  private player!: Phaser.GameObjects.Sprite;
  private playerLabel!: Phaser.GameObjects.Text;
  private playerNameBg!: Phaser.GameObjects.Graphics;
  private playerDir: Dir = "down";
  private playerTexKey = "boss";
  private keys!: Record<"W" | "A" | "S" | "D" | "E" | "Q", Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private selectRing!: Phaser.GameObjects.Ellipse;
  private lightingOverlay!: Phaser.GameObjects.Graphics;
  private monitorGlows: Phaser.GameObjects.Arc[] = [];
  private dayNightTint!: Phaser.GameObjects.Rectangle;
  private brightnessBoost!: Phaser.GameObjects.Rectangle;

  constructor() {
    super("office");
  }

  create(): void {
    this.store = this.game.registry.get("store") as Store;
    this.theme = this.store.settings.game.theme === "lumon" ? "lumon" : "classic";

    // register post-processing pipelines (once)
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (renderer && !renderer.pipelines.has("BloomFX")) {
      renderer.pipelines.add("BloomFX", new BloomPipeline(this.game));
    }
    if (renderer && !renderer.pipelines.has("ColorGrade")) {
      renderer.pipelines.add("ColorGrade", new ColorGradePipeline(this.game));
    }
    if (renderer && !renderer.pipelines.has("DOF")) {
      renderer.pipelines.add("DOF", new DOFPipeline(this.game));
    }
    // apply pipelines to camera (order: Bloom -> ColorGrade -> DOF)
    if (renderer) {
      this.cameras.main.setPostPipeline("BloomFX");
      this.cameras.main.setPostPipeline("ColorGrade");
      this.cameras.main.setPostPipeline("DOF");
    }

    // Initialize audio on first user interaction
    this.input.once("pointerdown", () => {
      this.world?.audio.init();
      this.world?.audio.resume();
    });
    this.input.keyboard?.once("keydown", () => {
      this.world?.audio.init();
      this.world?.audio.resume();
    });

    // a theme change restarts the scene — drop everything the last run built
    this.npcs.clear();
    this.yuki = null;
    this.yukiSeat = null;
    this.seats = [];
    this.extraSpots = [];
    this.monitors = [];
    this.chairs = [];
    this.yukiMonitor = null;
    this.coffeeUntil = 0;
    this.fridgeUntil = 0;
    this.coolerUntil = 0;
    this.clockUntil = 0;
    this.filingUntil = 0;
    this.vendingUntil = 0;
    this.plantUntil = 0;
    this.plantCooldownUntil = 0;
    this.sofaUntil = 0;
    this.heliActive = false;
    this.heliContainer?.destroy();
    this.heliContainer = null;
    this.heliRotor = null;
    this.heliAgent?.destroy();
    this.heliAgent = null;
    this.heliElevatorGfx?.destroy();
    this.heliElevatorGfx = null;

    // Procedural textures and animations were created by BootScene and persist
    // in the global TextureManager.  The existence guards make these fast
    // no-ops on first run; they only do work on scene restart.
    generateAllTextures(this);
    this.ensureAllAnimations();

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

    // Overlay enhanced procedural furniture on top of the tile-based furniture layer
    upgradeFurniture(this, furniture);

    // Scan for chimney tiles to position smoke emitters
    this.chimneyPositions = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const t = furniture.getTileAt(x, y);
        if (t && (t.index === 36 || t.properties?.chimney)) {
          this.chimneyPositions.push({ x: x * TILE_PX + TILE_PX / 2, y: y * TILE_PX + 4 });
        }
      }
    }

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
        // Procedural monitor on Yuki's desk — standing up, facing left
        const mx = (obj.x ?? 0) + TILE_PX / 2;
        const my = (obj.y ?? 0) - TILE_PX * 0.35;
        const spr = this.add
          .sprite(mx, my, MONITOR_TEX, "0")
          .setDepth(10 + (obj.y ?? 0) - 10);
        this.yukiMonitor = spr;
      } else if (obj.name.startsWith("seat-")) {
        const idx = Number(obj.name.slice(5));
        this.seats[idx] = { x: tx, y: ty };
        // Create chair sprite at seat position, facing down (unassigned default)
        const cx = tx * TILE_PX + TILE_PX / 2;
        const cy = ty * TILE_PX + TILE_PX / 2;
        const chair = this.add
          .sprite(cx, cy, CHAIR_TEX_DOWN)
          .setDepth(5 + ty * TILE_PX + 1);
        this.chairs[idx] = chair;
      } else if (obj.name.startsWith("monitor-")) {
        const idx = Number(obj.name.slice(8));
        // Procedural monitor standing on top of desk
        const mx = (obj.x ?? 0) + TILE_PX / 2;
        const my = (obj.y ?? 0) - TILE_PX * 0.35;
        const spr = this.add
          .sprite(mx, my, MONITOR_TEX, "0")
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
      // Create Yuki's left-facing chair sprite
      const ycx = this.yukiSeat.x * TILE_PX + TILE_PX / 2;
      const ycy = this.yukiSeat.y * TILE_PX + TILE_PX / 2;
      this.add
        .sprite(ycx, ycy, CHAIR_TEX_LEFT)
        .setDepth(5 + this.yukiSeat.y * TILE_PX + 1);

      this.yuki = new YukiNPC(this, this.grid, this.yukiSeat, (clicked) =>
        this.store.select(clicked),
      );

      // clickable zone over Yuki's office — clicking anywhere inside opens her chat
      const zo = { x0: 22, y0: 8, x1: 27, y1: 11 };
      const zx = (zo.x0 + zo.x1 + 1) / 2 * TILE_PX;
      const zy = (zo.y0 + zo.y1 + 1) / 2 * TILE_PX;
      const zw = (zo.x1 - zo.x0 + 1) * TILE_PX;
      const zh = (zo.y1 - zo.y0 + 1) * TILE_PX;
      this.yukiOfficeZone = this.add.zone(zx, zy, zw, zh);
      this.yukiOfficeZone.setInteractive({ useHandCursor: true });
      this.yukiOfficeZone.on("pointerdown", () => this.store.select(YUKI_ID));
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

    // Generate boss texture from player appearance (if set)
    this.refreshBossTexture();

    // the boss (you)
    const feet = feetOf(this.spawnTile);
    this.player = this.add.sprite(feet.x, feet.y, this.playerTexKey, 0)
      .setOrigin(0.5, 1)
      .setScale(0.5);
    // no physics body — we do manual movement for smoothness

    this.playerNameBg = this.add.graphics();
    this.playerLabel = this.add
      .text(0, 0, "BOSS", {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
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
    this.drawTrophyCase();
    this.drawHallOfFameBoard();
    this.drawHelipad();
    this.drawRedButton();
    this.boardHint = this.add
      .text(0, 0, "", {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
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

    this.coffeeHint = this.makeHint();
    this.fridgeHint = this.makeHint();
    this.coolerHint = this.makeHint();
    this.clockHint = this.makeHint();
    this.vendingHint = this.makeHint();
    this.sofaHint = this.makeHint();
    this.filingHint = this.makeHint();
    this.plantHint = this.makeHint();
    this.trophyHint = this.makeHint();
    this.hallOfFameHint = this.makeHint();
    this.mailboxHint = this.makeHint();
    this.redButtonHint = this.makeHint();

    // Set interactable tile positions based on theme
    this.setupInteractables();

    this.sceneStart = this.time.now;

    this.mapPx = { w: map.widthInPixels, h: map.heightInPixels };
    // world layer — infinite procedural world outside the office
    this.world = new WorldLayer(this, this.store, this.game.registry.get("net"), map.widthInPixels, map.heightInPixels);
    this.world.setOfficeGrid(this.grid);
    // Preload world chunks around the door so there's no freeze on first exit
    this.world.preloadDoorChunks();

    // Warm up the particle system so the first biome ambient doesn't cause a
    // stutter.  The first ParticleEmitter render compiles WebGL shaders and
    // allocates GPU buffers.  We create the emitter now and let it render for
    // a few frames (during the loading screen) before destroying it — the
    // compiled shader stays cached in Phaser's shader manager.
    this.world.vfx.startAmbient("meadow");
    this.time.delayedCall(200, () => this.world.vfx.stopAmbient());

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

    // conspicuous mailbox to the left of the front door
    this.mailboxPx = { x: doorPxX - TILE_PX * 3, y: doorPxY + 24 };
    this.mailboxGfx = this.add.graphics().setDepth(3);
    this.mailboxHasMail = true; // start with mail
    this.mailboxNextMail = this.time.now + 45000; // next mail arrives in 45s
    this.drawMailbox();

    const cam = this.cameras.main;
    // no camera bounds — the world is infinite
    cam.startFollow(this.player, true);
    cam.setZoom(this.bestZoom());
    const onResize = () => {
      cam.setZoom(this.bestZoom());
      this.drawVignette();
      this.dayNightTint.setSize(this.scale.width, this.scale.height);
      this.brightnessBoost.setSize(this.scale.width, this.scale.height);
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

    // brightness boost: makes the area just outside the office brighter than inside
    this.brightnessBoost = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0xffffff, 0)
      .setOrigin(0, 0)
      .setDepth(830)
      .setBlendMode(Phaser.BlendModes.ADD)
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
          if (theme === "lumon") achievements.unlock("lumon_mode");
          this.ready = false;
          this.scene.restart();
          return;
        }
        // refresh boss texture if player appearance changed
        const prevKey = this.playerTexKey;
        this.refreshBossTexture();
        if (prevKey !== this.playerTexKey && this.player) {
          this.player.setTexture(this.playerTexKey, 0).setScale(0.5);
        }
        this.syncAgents();
        this.world.syncGhosts();
        this.updateChimneySmoke();
      });
      this.store.onHuddle((agentIds) => {
        if (this.ready) this.startHuddle(agentIds);
      });
    }
    this.ready = true;
    this.syncAgents();
    this.world.syncGhosts();

    // Fade in from black so the transition from BootScene is seamless.
    this.cameras.main.fadeIn(400, 0, 0, 0);
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
    const distFactor = this.world.distanceFactor(this.player.x, this.player.y);
    // brightness boost: peaks just outside the office, fades over ~15 tiles
    const brightnessFactor = distFactor > 0 ? Math.max(0, 1 - distFactor * 7) : 0;
    this.brightnessBoost.setFillStyle(0xffd88a, brightnessFactor * 0.06);
    // darkness: delayed onset — doesn't start until ~10 tiles out
    const delayedDarkness = Math.max(0, (distFactor - 0.1) / 0.9);
    this.dayNightTint.setFillStyle(0x0a0a30, nightFactor * 0.3 * delayedDarkness);

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

  /** Create a standard proximity hint text object. */
  private makeHint(): Phaser.GameObjects.Text {
    return this.add
      .text(0, 0, "", {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
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
  }

  /** Set interactable tile positions based on the current theme. */
  private setupInteractables(): void {
    if (this.theme === "lumon") {
      this.clockTile = { x: 14, y: 1 };
      this.vendingTile = { x: 27, y: 2 };
      this.sofaTile = null;
      this.hallOfFameTile = { x: 1, y: 15 };
      this.filingTiles = [
        { x: 1, y: 3 }, { x: 1, y: 4 }, { x: 1, y: 12 }, { x: 1, y: 13 },
        { x: 20, y: 3 }, { x: 20, y: 12 }, { x: 22, y: 11 },
      ];
      this.plantTiles = [
        { x: 20, y: 17 }, { x: 5, y: 17 }, { x: 11, y: 9 },
        { x: 26, y: 16 }, { x: 27, y: 11 },
      ];
    } else {
      this.clockTile = { x: 6, y: 1 };
      this.vendingTile = null;
      this.sofaTile = { x: 23, y: 13 };
      this.hallOfFameTile = { x: 1, y: 15 };
      this.filingTiles = [
        { x: 1, y: 6 }, { x: 1, y: 7 }, { x: 20, y: 3 },
        { x: 20, y: 4 }, { x: 22, y: 11 },
      ];
      this.plantTiles = [
        { x: 1, y: 17 }, { x: 20, y: 2 }, { x: 28, y: 7 },
        { x: 27, y: 13 }, { x: 11, y: 8 }, { x: 26, y: 16 },
        { x: 5, y: 17 }, { x: 27, y: 11 },
      ];
    }
  }

  /** Find the nearest tile from a list within maxDist pixels. */
  private nearestTile(tiles: Tile[], maxDist: number): Tile | null {
    let best: Tile | null = null;
    let bestD = Infinity;
    for (const t of tiles) {
      const px = t.x * TILE_PX + 32;
      const py = t.y * TILE_PX + 32;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, px, py);
      if (d < maxDist && d < bestD) {
        best = t;
        bestD = d;
      }
    }
    return best;
  }

  /** Try interacting with any new office object. Returns true if an interaction fired. */
  private tryOfficeInteract(time: number): boolean {
    // Fridge — full HP heal
    const fridgePx = { x: this.fridgeTile.x * TILE_PX + 32, y: this.fridgeTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, fridgePx.x, fridgePx.y) < 144) {
      if (time < this.fridgeUntil) {
        this.store.toast("Fridge is restocking.");
      } else {
        this.fridgeUntil = time + 30000;
        this.world.healFull();
        this.store.toast("Snack break! HP fully restored.");
        this.world.vfx.sparkBurst(fridgePx.x, fridgePx.y, 0x4acb4a, 12, 80);
        this.world.vfx.celebrate(fridgePx.x, fridgePx.y);
        this.world.audio.uiClick();
      }
      return true;
    }

    // Water Cooler — agent gossip
    const coolerPx = { x: this.coolerTile.x * TILE_PX + 32, y: this.coolerTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, coolerPx.x, coolerPx.y) < 144) {
      if (time < this.coolerUntil) {
        this.store.toast("You just checked the cooler.");
      } else {
        this.coolerUntil = time + 5000;
        this.waterCoolerGossip();
        this.world.vfx.sparkBurst(coolerPx.x, coolerPx.y, 0x4a9cd8, 8, 60);
        this.world.audio.uiClick();
        if (achievements.incStat("cooler") >= 5) achievements.unlock("gossip_monger");
      }
      return true;
    }

    // Clock — session stats
    const clockPx = { x: this.clockTile.x * TILE_PX + 32, y: this.clockTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, clockPx.x, clockPx.y) < 160) {
      if (time >= this.clockUntil) {
        this.clockUntil = time + 2000;
        this.clockStats(time);
        this.world.audio.uiClick();
      }
      return true;
    }

    // Vending Machine — random consumable
    if (this.vendingTile) {
      const vPx = { x: this.vendingTile.x * TILE_PX + 32, y: this.vendingTile.y * TILE_PX + 32 };
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, vPx.x, vPx.y) < 144) {
        if (time < this.vendingUntil) {
          this.store.toast("Vending machine is restocking.");
        } else {
          this.vendingUntil = time + 15000;
          this.vendingMachine(vPx.x, vPx.y, time);
        }
        return true;
      }
    }

    // Sofa — power nap speed boost
    if (this.sofaTile) {
      const sPx = { x: this.sofaTile.x * TILE_PX + 32, y: this.sofaTile.y * TILE_PX + 32 };
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, sPx.x, sPx.y) < 144) {
        if (time < this.sofaUntil) {
          this.store.toast("You're already rested.");
        } else {
          this.sofaUntil = time + 10000;
          this.store.toast("Power nap! 1.5x speed for 10s.");
          this.world.vfx.sparkBurst(sPx.x, sPx.y, 0x9a7acb, 10, 60);
          this.world.audio.uiClick();
          achievements.unlock("power_nap");
          if (time < this.coffeeUntil) achievements.unlock("speed_demon");
        }
        return true;
      }
    }

    // Filing Cabinets — browse past work
    const filingNear = this.nearestTile(this.filingTiles, 144);
    if (filingNear) {
      if (time < this.filingUntil) {
        this.store.toast("You just browsed the files.");
      } else {
        this.filingUntil = time + 3000;
        this.filingCabinet(filingNear.x * TILE_PX + 32, filingNear.y * TILE_PX + 32);
      }
      return true;
    }

    // Plants — water for morale boost
    const plantNear = this.nearestTile(this.plantTiles, 144);
    if (plantNear) {
      if (time < this.plantCooldownUntil) {
        this.store.toast("Plants are still moist.");
      } else {
        this.plantCooldownUntil = time + 60000;
        this.plantUntil = time + 30000;
        const px = plantNear.x * TILE_PX + 32;
        const py = plantNear.y * TILE_PX + 32;
        this.store.toast("Plants watered! Team morale boosted for 30s.");
        this.world.vfx.sparkBurst(px, py, 0x4acb4a, 16, 70);
        this.world.vfx.celebrate(px, py);
        this.world.audio.uiClick();
        achievements.unlock("green_thumb");
      }
      return true;
    }

    // Mailbox — check mail
    const mbDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.mailboxPx.x, this.mailboxPx.y);
    if (mbDist < 120) {
      if (time < this.mailboxUntil) {
        this.store.toast("The mailbox is empty. Check back later.");
      } else if (this.mailboxHasMail) {
        this.mailboxHasMail = false;
        this.mailboxUntil = time + 5000;
        this.mailboxNextMail = time + 45000 + Math.random() * 30000;
        this.drawMailbox();
        const mailMessages = [
          "You got a letter from HQ: 'Keep up the good work!'",
          "Junk mail — buy one get one on office supplies.",
          "A postcard from a rival AI lab. Nice view.",
          "Performance bonus check! ...It's a coupon for the vending machine.",
          "A handwritten note: 'Don't forget to water the plants.'",
          "Speedrun community newsletter — new strats inside!",
        ];
        this.store.toast(mailMessages[Math.floor(Math.random() * mailMessages.length)]);
        this.world.vfx.sparkBurst(this.mailboxPx.x, this.mailboxPx.y, 0xffdd44, 10, 60);
        this.world.audio.uiClick();
      } else {
        this.store.toast("No mail yet. The flag is down for a reason.");
      }
      return true;
    }

    // Red Button — summon helicopter
    const rbPx = { x: this.redButtonTile.x * TILE_PX + 32, y: this.redButtonTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, rbPx.x, rbPx.y) < 160) {
      if (this.heliActive) {
        this.store.toast("Helicopter is already on the way!");
      } else if (time < this.redButtonUntil) {
        this.store.toast("The button is cooling down.");
      } else {
        this.redButtonUntil = time + 30000;
        this.triggerHelicopter();
      }
      return true;
    }

    return false;
  }

  /** Water cooler: show a random agent's current status. */
  private waterCoolerGossip(): void {
    const agents = [...this.store.agents.values()].filter((a) => a.id !== YUKI_ID);
    if (agents.length === 0) {
      this.store.toast("The water cooler bubbles quietly. Nobody to gossip about yet.");
      return;
    }
    const a = agents[Math.floor(Math.random() * agents.length)];
    const statusText: Record<string, string> = {
      idle: "is twiddling their thumbs",
      thinking: "is pondering something deep",
      working: `is heads-down on: ${a.task?.slice(0, 50) ?? "..."}`,
      done: "just finished a task — time for a break!",
      error: "ran into trouble on their last task",
    };
    this.store.toast(`${a.name} ${statusText[a.status] ?? "is doing something"}.`);
  }

  /** Clock: show session time and task stats. */
  private clockStats(time: number): void {
    const elapsed = Math.floor((time - this.sceneStart) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const totalTasks = [...this.store.agents.values()].reduce((s, a) => s + a.tasksDone, 0);
    this.store.toast(`Session: ${mins}m ${secs}s | Tasks completed: ${totalTasks}`);
  }

  /** Vending machine: random consumable effect. */
  private vendingMachine(px: number, py: number, time: number): void {
    const roll = Math.random();
    if (roll < 0.4) {
      this.sofaUntil = Math.max(this.sofaUntil, time + 10000);
      this.store.toast("Energy Drink! 1.5x speed for 10s.");
      this.world.vfx.sparkBurst(px, py, 0xff6600, 12, 80);
    } else if (roll < 0.7) {
      this.world.healFull();
      this.store.toast("Healthy snack! HP fully restored.");
      this.world.vfx.sparkBurst(px, py, 0x4acb4a, 12, 80);
    } else if (roll < 0.9) {
      this.store.toast("Brain bar! Your agents feel sharper today.");
      this.world.vfx.sparkBurst(px, py, 0xffdd44, 12, 80);
    } else {
      this.store.toast("Mystery snack! It tastes like... existential dread.");
      this.world.vfx.sparkBurst(px, py, 0xaa44ff, 12, 80);
      achievements.unlock("mystery_snack");
      if (achievements.incStat("mysterySnacks") >= 3) achievements.unlock("existential_dread");
    }
    this.world.vfx.celebrate(px, py);
    this.world.audio.uiClick();
  }

  /** Filing cabinet: show a random past log entry. */
  private filingCabinet(px: number, py: number): void {
    const entries = this.store.feed.filter(
      (f) => f.entry.kind === "text" || f.entry.kind === "result" || f.entry.kind === "boss",
    );
    if (entries.length === 0) {
      this.store.toast("The cabinets are empty. No completed work yet.");
      return;
    }
    const entry = entries[Math.floor(Math.random() * entries.length)];
    const text = entry.entry.text.slice(0, 80);
    this.store.toast(`${entry.name}: "${text}..."`);
    this.world.vfx.sparkBurst(px, py, 0xb0741f, 8, 50);
    this.world.audio.uiClick();
  }

  /** Update proximity hints for all new interactables. */
  private updateInteractHints(time: number): void {
    // Fridge
    const fridgePx = { x: this.fridgeTile.x * TILE_PX + 32, y: this.fridgeTile.y * TILE_PX + 32 };
    const fridgeDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, fridgePx.x, fridgePx.y);
    if (fridgeDist < 144) {
      this.fridgeHint
        .setPosition(fridgePx.x, fridgePx.y + 64)
        .setText(time < this.fridgeUntil ? "E: RESTOCKING..." : "E: SNACK")
        .setVisible(true);
    } else {
      this.fridgeHint.setVisible(false);
    }

    // Water Cooler
    const coolerPx = { x: this.coolerTile.x * TILE_PX + 32, y: this.coolerTile.y * TILE_PX + 32 };
    const coolerDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, coolerPx.x, coolerPx.y);
    if (coolerDist < 144) {
      this.coolerHint
        .setPosition(coolerPx.x, coolerPx.y + 64)
        .setText(time < this.coolerUntil ? "E: ..." : "E: GOSSIP")
        .setVisible(true);
    } else {
      this.coolerHint.setVisible(false);
    }

    // Clock
    const clockPx = { x: this.clockTile.x * TILE_PX + 32, y: this.clockTile.y * TILE_PX + 32 };
    const clockDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, clockPx.x, clockPx.y);
    if (clockDist < 160) {
      this.clockHint
        .setPosition(clockPx.x, clockPx.y + 64)
        .setText("E: CHECK TIME")
        .setVisible(true);
    } else {
      this.clockHint.setVisible(false);
    }

    // Vending
    if (this.vendingTile) {
      const vPx = { x: this.vendingTile.x * TILE_PX + 32, y: this.vendingTile.y * TILE_PX + 32 };
      const vDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, vPx.x, vPx.y);
      if (vDist < 144) {
        this.vendingHint
          .setPosition(vPx.x, vPx.y + 64)
          .setText(time < this.vendingUntil ? "E: RESTOCKING..." : "E: BUY SNACK")
          .setVisible(true);
      } else {
        this.vendingHint.setVisible(false);
      }
    } else {
      this.vendingHint.setVisible(false);
    }

    // Sofa
    if (this.sofaTile) {
      const sPx = { x: this.sofaTile.x * TILE_PX + 32, y: this.sofaTile.y * TILE_PX + 32 };
      const sDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, sPx.x, sPx.y);
      if (sDist < 144) {
        this.sofaHint
          .setPosition(sPx.x, sPx.y + 64)
          .setText(time < this.sofaUntil ? "E: ALREADY RESTED" : "E: POWER NAP")
          .setVisible(true);
      } else {
        this.sofaHint.setVisible(false);
      }
    } else {
      this.sofaHint.setVisible(false);
    }

    // Filing — check nearest
    const filingNear = this.nearestTile(this.filingTiles, 144);
    if (filingNear) {
      const fPx = { x: filingNear.x * TILE_PX + 32, y: filingNear.y * TILE_PX + 32 };
      this.filingHint
        .setPosition(fPx.x, fPx.y + 64)
        .setText(time < this.filingUntil ? "E: BROWSING..." : "E: BROWSE FILES")
        .setVisible(true);
    } else {
      this.filingHint.setVisible(false);
    }

    // Plants — check nearest
    const plantNear = this.nearestTile(this.plantTiles, 144);
    if (plantNear) {
      const pPx = { x: plantNear.x * TILE_PX + 32, y: plantNear.y * TILE_PX + 32 };
      this.plantHint
        .setPosition(pPx.x, pPx.y + 64)
        .setText(time < this.plantUntil ? "E: BOOSTED!" : time < this.plantCooldownUntil ? "E: STILL MOIST" : "E: WATER PLANTS")
        .setVisible(true);
    } else {
      this.plantHint.setVisible(false);
    }

    // Mailbox
    const mbDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.mailboxPx.x, this.mailboxPx.y);
    if (mbDist < 120) {
      this.mailboxHint
        .setPosition(this.mailboxPx.x, this.mailboxPx.y + 64)
        .setText(this.mailboxHasMail ? "E: CHECK MAIL" : "E: EMPTY")
        .setVisible(true);
    } else {
      this.mailboxHint.setVisible(false);
    }

    // Red Button
    const rbPx = { x: this.redButtonTile.x * TILE_PX + 32, y: this.redButtonTile.y * TILE_PX + 32 };
    const rbDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, rbPx.x, rbPx.y);
    if (rbDist < 160) {
      this.redButtonHint
        .setPosition(rbPx.x, rbPx.y + 64)
        .setText(this.heliActive ? "..." : time < this.redButtonUntil ? "E: COOLING" : "E: PUSH!")
        .setVisible(true);
    } else {
      this.redButtonHint.setVisible(false);
    }
  }

  /** Redraw the mailbox graphics, showing the flag up or down based on mail state. */
  private drawMailbox(): void {
    const mbX = this.mailboxPx.x;
    const mbY = this.mailboxPx.y;
    const g = this.mailboxGfx;
    g.clear();
    // ground shadow
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(mbX, mbY + 52, 36, 8);
    // post — wooden, with grain shading
    g.fillStyle(0x6a4a2a, 1);
    g.fillRect(mbX - 5, mbY + 20, 10, 32);
    g.fillStyle(0x7a5a3a, 1);
    g.fillRect(mbX - 5, mbY + 20, 3, 32);
    g.fillStyle(0x4a3a1a, 1);
    g.fillRect(mbX + 2, mbY + 20, 3, 32);
    // mailbox body — blue, rounded top
    const mbBlue = this.theme === "lumon" ? 0x3a6f57 : 0x2a5cb8;
    const mbBlueLi = this.theme === "lumon" ? 0x4c8a6e : 0x3a78d8;
    const mbBlueDk = this.theme === "lumon" ? 0x2a5440 : 0x1a4090;
    g.fillStyle(mbBlueDk, 1);
    g.fillRoundedRect(mbX - 22, mbY - 12, 44, 36, 6);
    g.fillStyle(mbBlue, 1);
    g.fillRoundedRect(mbX - 21, mbY - 11, 42, 34, 5);
    // top highlight
    g.fillStyle(mbBlueLi, 1);
    g.fillRoundedRect(mbX - 20, mbY - 10, 40, 8, 4);
    g.fillStyle(0xffffff, 0.12);
    g.fillRoundedRect(mbX - 19, mbY - 9, 38, 3, 2);
    // bottom shadow
    g.fillStyle(mbBlueDk, 1);
    g.fillRoundedRect(mbX - 21, mbY + 14, 42, 8, 3);
    // mail slot — dark recessed
    g.fillStyle(0x0a0a14, 1);
    g.fillRoundedRect(mbX - 14, mbY - 4, 28, 5, 2);
    g.fillStyle(0x1a1a28, 1);
    g.fillRoundedRect(mbX - 13, mbY - 3, 26, 3, 1);
    // label plate
    g.fillStyle(0xe8e4d0, 1);
    g.fillRoundedRect(mbX - 12, mbY + 4, 24, 8, 1);
    g.fillStyle(0x33373d, 1);
    g.fillRect(mbX - 9, mbY + 6, 18, 1);
    g.fillRect(mbX - 9, mbY + 9, 14, 1);
    // red flag — up when mail, down when empty
    if (this.mailboxHasMail) {
      g.fillStyle(0xc83030, 1);
      g.fillRect(mbX + 18, mbY - 8, 3, 16);
      g.fillRect(mbX + 18, mbY - 8, 10, 4);
      g.fillStyle(0xe84848, 1);
      g.fillRect(mbX + 19, mbY - 7, 1, 14);
      g.fillRect(mbX + 19, mbY - 7, 8, 2);
      g.fillStyle(0x8a2020, 1);
      g.fillCircle(mbX + 19, mbY + 7, 2);
    } else {
      g.fillStyle(0xc83030, 1);
      g.fillRect(mbX + 18, mbY + 2, 3, 14);
      g.fillRect(mbX + 18, mbY + 12, 10, 4);
      g.fillStyle(0xe84848, 1);
      g.fillRect(mbX + 19, mbY + 3, 1, 12);
      g.fillRect(mbX + 19, mbY + 13, 8, 2);
      g.fillStyle(0x8a2020, 1);
      g.fillCircle(mbX + 19, mbY + 3, 2);
    }
  }

  /** Draw a helicopter pad on the roof of the building, in a 3/4 diagonal perspective. */
  private drawHelipad(): void {
    const g = this.add.graphics().setDepth(-0.5);

    const mapPxW = 30 * TILE_PX; // 1920
    const cx = mapPxW / 2;       // 960
    const roofY = 0;             // top edge of the office map

    // ── LAYOUT ── bigger pad, viewed at a diagonal 3/4 angle.
    // The skew shifts the back of the pad to the right, simulating a
    // camera that's looking from the front-left rather than dead-centre.
    const padRX = 140;           // horizontal radius (bigger!)
    const padRY = 38;            // vertical radius (foreshortened)
    const padCY = roofY - 130;   // pad centre, high above the roof
    const skew  = 28;            // horizontal offset applied to back vs front

    // Helper: map a parametric angle (0..2π) to a screen point on the
    // skewed ellipse.  t=0 is the front-centre, t=π is the back-centre.
    const padPoint = (angle: number, rxScale = 1, ryScale = 1) => {
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      // base ellipse point
      let px = cosA * padRX * rxScale;
      let py = sinA * padRY * ryScale;
      // apply skew: back half (sinA < 0) shifts right, front half shifts left
      px += skew * (-sinA / padRY) * padRY;
      return { x: cx + px, y: padCY + py };
    };

    // Key pad edge point — front-centre (where stairs connect)
    const padFront = padPoint(Math.PI / 2);

    // ── COLUMNS ── four support pillars at ~45° intervals, asymmetric
    // heights because of the diagonal view.  Back columns are taller.
    const colW = 9;
    const colAngles = [
      { angle: -Math.PI * 0.75, base: 0x5a5a66, hi: 0x727280, lo: 0x404048 }, // back-left
      { angle: -Math.PI * 0.25, base: 0x52525e, hi: 0x6a6a76, lo: 0x383840 }, // back-right
      { angle:  Math.PI * 0.75, base: 0x48484e, hi: 0x60606a, lo: 0x303036 }, // front-left
      { angle:  Math.PI * 0.25, base: 0x424248, hi: 0x58585e, lo: 0x2c2c32 }, // front-right
    ];

    const drawCol = (x: number, topY: number, base: number, hi: number, lo: number) => {
      const h = roofY - topY;
      // main shaft
      g.fillStyle(base, 1);
      g.fillRect(x - colW / 2, topY, colW, h);
      // left highlight stripe
      g.fillStyle(hi, 1);
      g.fillRect(x - colW / 2, topY, 2.5, h);
      // right shadow stripe
      g.fillStyle(lo, 1);
      g.fillRect(x + colW / 2 - 2.5, topY, 2.5, h);
      // fluting — two thin grooves
      g.fillStyle(lo, 0.4);
      g.fillRect(x - 1, topY, 1, h);
      g.fillRect(x + 1, topY, 1, h);
      // capital (top plate)
      g.fillStyle(base, 1);
      g.fillEllipse(x, topY, colW + 8, 5);
      g.fillStyle(hi, 0.5);
      g.fillEllipse(x, topY - 1, colW + 6, 3);
      // base plate on roof
      g.fillStyle(0x2a2a30, 1);
      g.fillEllipse(x, roofY - 1, colW + 12, 6);
      g.fillStyle(0x3a3a40, 0.6);
      g.fillEllipse(x, roofY - 2, colW + 10, 4);
    };

    // Draw back columns first (taller — they reach the back rim of the pad)
    for (const c of colAngles) {
      if (Math.sin(c.angle) > 0) continue; // skip front columns
      const p = padPoint(c.angle, 0.82);
      drawCol(p.x, p.y, c.base, c.hi, c.lo);
    }

    // ── STAIRS ── wider, more dramatic, with railing posts
    const stairCount = 12;
    const stairBaseW = 80;
    const stairTopW  = 48;
    const stairBaseY = roofY;
    const stairTopY  = padFront.y + 4;
    const stairH     = stairBaseY - stairTopY;
    // stairs shift slightly left to align with the pad's front-centre
    const stairCX = padFront.x;

    // Staircase side walls — give visible depth
    g.fillStyle(0x30303a, 1);
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(stairCX + side * stairBaseW / 2, stairBaseY);
      g.lineTo(stairCX + side * stairTopW  / 2, stairTopY);
      g.lineTo(stairCX + side * stairTopW  / 2, stairTopY + 5);
      g.lineTo(stairCX + side * stairBaseW / 2, stairBaseY + 5);
      g.closePath();
      g.fillPath();
    }

    for (let i = 0; i < stairCount; i++) {
      const t0 = i / stairCount;
      const t1 = (i + 1) / stairCount;
      const y0 = stairBaseY - t0 * stairH;
      const y1 = stairBaseY - t1 * stairH;
      const w0 = stairBaseW + (stairTopW - stairBaseW) * t0;
      const w1 = stairBaseW + (stairTopW - stairBaseW) * t1;

      // Riser (vertical face) — dark with gradient feel
      g.fillStyle(0x44444e, 1);
      g.beginPath();
      g.moveTo(stairCX - w0 / 2, y0);
      g.lineTo(stairCX + w0 / 2, y0);
      g.lineTo(stairCX + w1 / 2, y1);
      g.lineTo(stairCX - w1 / 2, y1);
      g.closePath();
      g.fillPath();

      // Tread (horizontal surface) — lighter, thin ellipse
      if (i < stairCount - 1) {
        g.fillStyle(0x585862, 1);
        g.fillEllipse(stairCX, y1, w1, w1 * 0.14);
        // front edge highlight
        g.fillStyle(0x6a6a74, 0.5);
        g.fillEllipse(stairCX, y1 - 1, w1 * 0.9, w1 * 0.1);
      }
    }

    // Stair railing — posts on both sides with a handrail
    g.lineStyle(2, 0x888890, 0.8);
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(stairCX + side * stairBaseW / 2, stairBaseY - 2);
      g.lineTo(stairCX + side * stairTopW  / 2, stairTopY - 2);
      g.strokePath();
      // railing posts
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const ry = stairBaseY - t * stairH;
        const rw = stairBaseW + (stairTopW - stairBaseW) * t;
        g.fillStyle(0x707078, 0.7);
        g.fillRect(stairCX + side * rw / 2 - 1, ry - 6, 2, 6);
      }
    }

    // ── PAD SLAB ── drawn as a skewed ellipse polygon for the 3/4 look
    const padPoly = (rxScale = 1, yOff = 0) => {
      const segs = 48;
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= segs; i++) {
        pts.push(padPoint((i / segs) * Math.PI * 2, rxScale, 1));
      }
      g.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i === 0) g.moveTo(pts[i].x, pts[i].y + yOff);
        else g.lineTo(pts[i].x, pts[i].y + yOff);
      }
      g.closePath();
    };

    // Drop shadow beneath the pad
    g.fillStyle(0x000000, 0.25);
    padPoly(1.02, 6);
    g.fillPath();

    // Slab thickness / edge — darker, offset down
    g.fillStyle(0x282830, 1);
    padPoly(1, 5);
    g.fillPath();
    g.fillStyle(0x30303a, 1);
    padPoly(0.99, 3);
    g.fillPath();

    // Top asphalt surface
    g.fillStyle(0x383840, 1);
    padPoly(1, 0);
    g.fillPath();

    // Surface gradient — lighter near the front (closer to viewer)
    g.fillStyle(0x44444e, 0.5);
    padPoly(0.7, padRY * 0.3);
    g.fillPath();

    // Texture speckles
    g.fillStyle(0x4c4c56, 0.3);
    for (let i = 0; i < 45; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.82;
      const p = padPoint(a, r, r);
      g.fillRect(p.x, p.y, 2, 2);
    }

    // ── PAD MARKINGS (all follow the skewed ellipse) ──

    // Outer safety ring — solid white, thick
    g.lineStyle(3.5, 0xf0f0f0, 0.92);
    const ringSegs = 48;
    g.beginPath();
    for (let i = 0; i <= ringSegs; i++) {
      const p = padPoint((i / ringSegs) * Math.PI * 2, (padRX - 12) / padRX, (padRY - 8) / padRY);
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    g.closePath();
    g.strokePath();

    // Dashed inner ring
    const dashCount = 32;
    g.lineStyle(2.5, 0xf0f0f0, 0.6);
    for (let i = 0; i < dashCount; i++) {
      if (i % 2 !== 0) continue;
      const a0 = (i / dashCount) * Math.PI * 2;
      const a1 = ((i + 1) / dashCount) * Math.PI * 2;
      const segs = 5;
      g.beginPath();
      for (let s = 0; s <= segs; s++) {
        const a = a0 + (a1 - a0) * (s / segs);
        const p = padPoint(a, (padRX - 28) / padRX, (padRY - 12) / padRY);
        if (s === 0) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
      }
      g.strokePath();
    }

    // H marker — foreshortened and skewed to lie flat on the angled pad
    const hW = 56;
    const hH = 16;
    const hT = 8;
    // skew the H slightly to match the pad's diagonal
    const hSkew = 6;
    g.fillStyle(0xf0f0f0, 1);
    // left leg (skewed)
    g.beginPath();
    g.moveTo(cx - hW / 2 - hSkew, padCY - hH / 2);
    g.lineTo(cx - hW / 2 + hT - hSkew, padCY - hH / 2);
    g.lineTo(cx - hW / 2 + hT + hSkew, padCY + hH / 2);
    g.lineTo(cx - hW / 2 + hSkew, padCY + hH / 2);
    g.closePath();
    g.fillPath();
    // right leg (skewed)
    g.beginPath();
    g.moveTo(cx + hW / 2 - hT - hSkew, padCY - hH / 2);
    g.lineTo(cx + hW / 2 - hSkew, padCY - hH / 2);
    g.lineTo(cx + hW / 2 + hSkew, padCY + hH / 2);
    g.lineTo(cx + hW / 2 - hT + hSkew, padCY + hH / 2);
    g.closePath();
    g.fillPath();
    // crossbar (skewed parallelogram)
    g.beginPath();
    g.moveTo(cx - hW / 2 - hSkew, padCY - hT / 2);
    g.lineTo(cx + hW / 2 - hSkew, padCY - hT / 2);
    g.lineTo(cx + hW / 2 + hSkew, padCY + hT / 2);
    g.lineTo(cx - hW / 2 + hSkew, padCY + hT / 2);
    g.closePath();
    g.fillPath();

    // ── CORNER APPROACH LIGHTS ── glowing yellow with halo
    for (const c of colAngles) {
      const p = padPoint(c.angle, 0.72, 0.72);
      // halo
      g.fillStyle(0xffee88, 0.15);
      g.fillCircle(p.x, p.y, 9);
      g.fillStyle(0xffee88, 0.25);
      g.fillCircle(p.x, p.y, 6);
      // core
      g.fillStyle(0xffcc44, 1);
      g.fillCircle(p.x, p.y, 3.5);
      g.fillStyle(0xffffff, 0.7);
      g.fillCircle(p.x, p.y, 1.5);
    }

    // ── RAILING around the pad edge ── small posts at intervals
    const railPosts = 16;
    for (let i = 0; i < railPosts; i++) {
      const a = (i / railPosts) * Math.PI * 2;
      const p = padPoint(a, 0.96, 0.96);
      // skip the front section where stairs connect
      if (Math.sin(a) > 0.7) continue;
      g.fillStyle(0x8a8a92, 0.7);
      g.fillRect(p.x - 1, p.y - 8, 2, 8);
      g.fillStyle(0xaab0b8, 0.5);
      g.fillRect(p.x - 0.5, p.y - 8, 1, 8);
    }
    // railing rail — thin line following the pad rim
    g.lineStyle(1.5, 0x8a8a92, 0.5);
    g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      if (Math.sin(a) > 0.7) { // gap for stairs
        g.moveTo(padPoint(a, 0.96, 0.96).x, padPoint(a, 0.96, 0.96).y - 8);
        continue;
      }
      const p = padPoint(a, 0.96, 0.96);
      if (i === 0 || Math.sin(a) > 0.65) g.moveTo(p.x, p.y - 8);
      else g.lineTo(p.x, p.y - 8);
    }
    g.strokePath();

    // ── FRONT COLUMNS (drawn last — overlap pad rim for depth) ──
    for (const c of colAngles) {
      if (Math.sin(c.angle) <= 0) continue; // skip back columns
      const p = padPoint(c.angle, 0.82);
      drawCol(p.x, p.y, c.base, c.hi, c.lo);
    }

    // ── BEACON ── a tall light pole at the back-right of the pad
    const beaconP = padPoint(-Math.PI * 0.15, 0.7, 0.7);
    g.fillStyle(0x555560, 1);
    g.fillRect(beaconP.x - 1.5, beaconP.y - 34, 3, 34);
    // beacon housing
    g.fillStyle(0x444450, 1);
    g.fillRoundedRect(beaconP.x - 4, beaconP.y - 40, 8, 8, 2);
    // glowing top
    g.fillStyle(0xff3322, 0.2);
    g.fillCircle(beaconP.x, beaconP.y - 42, 10);
    g.fillStyle(0xff3322, 0.4);
    g.fillCircle(beaconP.x, beaconP.y - 42, 6);
    g.fillStyle(0xff5544, 1);
    g.fillCircle(beaconP.x, beaconP.y - 42, 3);
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(beaconP.x, beaconP.y - 43, 1.5);

    // ── WIND SOCK ── on a pole at the back-left, blowing right
    const wsP = padPoint(-Math.PI * 0.85, 0.75, 0.75);
    g.fillStyle(0x666666, 1);
    g.fillRect(wsP.x, wsP.y - 28, 2, 28);
    // pole top cap
    g.fillStyle(0x888888, 1);
    g.fillCircle(wsP.x + 1, wsP.y - 28, 2);
    // sock — orange, striped, blowing to the right
    g.fillStyle(0xff8833, 0.95);
    g.beginPath();
    g.moveTo(wsP.x + 2, wsP.y - 24);
    g.lineTo(wsP.x + 28, wsP.y - 18);
    g.lineTo(wsP.x + 28, wsP.y - 14);
    g.lineTo(wsP.x + 2, wsP.y - 12);
    g.closePath();
    g.fillPath();
    // white stripes on sock
    g.fillStyle(0xffffff, 0.5);
    g.beginPath();
    g.moveTo(wsP.x + 8, wsP.y - 23);
    g.lineTo(wsP.x + 12, wsP.y - 22);
    g.lineTo(wsP.x + 12, wsP.y - 13);
    g.lineTo(wsP.x + 8, wsP.y - 14);
    g.closePath();
    g.fillPath();
    g.beginPath();
    g.moveTo(wsP.x + 18, wsP.y - 20);
    g.lineTo(wsP.x + 22, wsP.y - 19);
    g.lineTo(wsP.x + 22, wsP.y - 14);
    g.lineTo(wsP.x + 18, wsP.y - 13);
    g.closePath();
    g.fillPath();

    // Store pad coordinates for helicopter arrival sequence
    this.padCenter = { x: cx, y: padCY };
    const _pf = padPoint(Math.PI / 2);
    this.padFrontPx = { x: _pf.x, y: _pf.y };
  }

  /** Draw a big red emergency button on the wall in Yuki's office. */
  private drawRedButton(): void {
    const g = this.add.graphics().setDepth(3);
    const bx = this.redButtonTile.x * TILE_PX + 32;
    const by = this.redButtonTile.y * TILE_PX + 56;

    // mounting plate
    g.fillStyle(0x2a2a30, 1);
    g.fillRoundedRect(bx - 22, by - 22, 44, 44, 6);
    g.fillStyle(0x48484e, 1);
    g.fillRoundedRect(bx - 20, by - 20, 40, 40, 5);
    // screws
    g.fillStyle(0x666666, 1);
    for (const [sx, sy] of [[-16, -16], [16, -16], [-16, 16], [16, 16]] as const) {
      g.fillCircle(bx + sx, by + sy, 2);
    }
    // glass dome cover (semi-transparent ring)
    g.fillStyle(0xaaaaaa, 0.08);
    g.fillCircle(bx, by, 19);
    g.lineStyle(1.5, 0x888888, 0.3);
    g.strokeCircle(bx, by, 19);
    // red button — dark outer ring
    g.fillStyle(0x881111, 1);
    g.fillCircle(bx, by, 13);
    // red button — bright top
    g.fillStyle(0xdd2222, 1);
    g.fillCircle(bx, by, 11);
    g.fillStyle(0xff3333, 1);
    g.fillCircle(bx - 1, by - 1, 9);
    // specular highlight
    g.fillStyle(0xff8888, 0.7);
    g.fillCircle(bx - 3, by - 3, 4);
    g.fillStyle(0xffaaaa, 0.5);
    g.fillCircle(bx - 4, by - 4, 2);
  }

  /** Create the helicopter visual as a container and return it.
   *  Layering (bottom to top): landing skids → body → rotor.
   *  The rotor is a separate graphics positioned at (0, -30) so its
   *  rotation spins the blades in-place above the body. */
  private drawHelicopter(): Phaser.GameObjects.Container {
    // --- landing skids (bottom layer) ---
    const skids = this.add.graphics();
    skids.fillStyle(0x000000, 0.2);
    skids.fillEllipse(0, 26, 90, 14);
    skids.fillStyle(0x3a3a40, 1);
    skids.fillRect(-38, 22, 76, 4);
    skids.fillRect(-32, 16, 3, 10);
    skids.fillRect(28, 16, 3, 10);

    // --- body (middle layer) ---
    const body = this.add.graphics();
    // tail boom
    body.fillStyle(0x1a5a2a, 1);
    body.fillRect(28, -5, 52, 10);
    body.fillStyle(0x226632, 1);
    body.fillRect(28, -5, 52, 3);
    // tail housing
    body.fillStyle(0x1a5a2a, 1);
    body.fillRoundedRect(72, -12, 18, 24, 4);
    // tail fin
    body.fillStyle(0x226632, 1);
    body.fillTriangle(78, -12, 90, -12, 84, -28);
    // tail rotor blade
    body.fillStyle(0x333333, 1);
    body.fillRect(88, -24, 2, 18);
    // fuselage — main body
    body.fillStyle(0x1a5a2a, 1);
    body.fillRoundedRect(-42, -22, 84, 44, 14);
    // top highlight
    body.fillStyle(0x226632, 1);
    body.fillRoundedRect(-40, -22, 80, 12, 10);
    // belly shadow
    body.fillStyle(0x144a20, 1);
    body.fillRoundedRect(-40, 8, 80, 14, 10);
    // cockpit windshield
    body.fillStyle(0x88bbdd, 0.85);
    body.fillRoundedRect(-34, -18, 44, 22, 8);
    body.fillStyle(0xaaddee, 0.5);
    body.fillRoundedRect(-32, -17, 20, 10, 5);
    // door outline
    body.lineStyle(1.5, 0x144a20, 0.6);
    body.strokeRoundedRect(8, -14, 24, 28, 4);
    // side stripe
    body.fillStyle(0xeeee44, 0.8);
    body.fillRect(-20, -1, 48, 3);
    // rotor mast sticking up from the body
    body.fillStyle(0x444444, 1);
    body.fillRect(-2, -30, 4, 8);

    // --- rotor (top layer, positioned at y=-30 so rotation spins in-place) ---
    const rotor = this.add.graphics();
    rotor.setPosition(0, -30);
    // rotor hub
    rotor.fillStyle(0x555555, 1);
    rotor.fillCircle(0, 0, 5);
    // rotor blades — drawn centered at (0,0) so rotation spins them in place
    rotor.lineStyle(4, 0x222222, 1);
    rotor.beginPath();
    rotor.moveTo(-48, 0);
    rotor.lineTo(48, 0);
    rotor.strokePath();
    rotor.lineStyle(2, 0x333333, 0.6);
    rotor.beginPath();
    rotor.moveTo(-30, 0);
    rotor.lineTo(30, 0);
    rotor.strokePath();

    this.heliRotor = rotor;
    // container children render in order: skids (bottom) → body → rotor (top)
    return this.add.container(0, 0, [skids, body, rotor]);
  }

  /** Summon the helicopter — full cinematic sequence.
   *  The heli descends from high above the pad straight down, lands softly,
   *  then unloads the agent. */
  private triggerHelicopter(): void {
    this.heliActive = true;
    this.store.toast("Helicopter summoned! Agent incoming...");
    this.world?.audio.uiClick();

    const padCx = this.padCenter.x;
    const padCy = this.padCenter.y;

    // create helicopter high above the pad (same x, well above)
    const heli = this.drawHelicopter();
    heli.setPosition(padCx, padCy - 600);
    heli.setDepth(-0.4);
    heli.setAlpha(0);
    this.heliContainer = heli;

    // fade in as it descends from the sky
    this.tweens.add({
      targets: heli,
      alpha: 1,
      duration: 1500,
      ease: "Cubic.in",
    });

    // descend slowly to the pad — soft landing with ease-out at the end
    this.tweens.add({
      targets: heli,
      y: padCy,
      duration: 5500,
      ease: "Cubic.out",
      onComplete: () => {
        // landed — pause for rotor spin-down, then unload agent
        this.time.delayedCall(1000, () => this.heliUnload());
      },
    });
  }

  /** Agent exits helicopter and walks to elevator entrance on the pad. */
  private heliUnload(): void {
    if (!this.heliContainer) return;
    const padCx = this.padCenter.x;
    const padCy = this.padCenter.y;
    const elevX = this.padFrontPx.x;
    const elevY = this.padFrontPx.y;

    const agentKey = `char-${Math.floor(Math.random() * 8)}`;
    const sprite = this.add
      .sprite(0, 0, agentKey, 6)
      .setOrigin(0.5, 1)
      .setScale(0.5);
    const label = this.add
      .text(0, -108, "AGENT", {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "16px",
        color: "#1d2126",
        stroke: "#f4f6f8",
        strokeThickness: 3,
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.7);

    const agent = this.add.container(padCx + 30, padCy, [sprite, label]);
    agent.setDepth(-0.3);
    this.heliAgent = agent;
    sprite.play(`${agentKey}-walk-down`);

    // walk to elevator entrance on pad
    this.tweens.add({
      targets: agent,
      x: elevX,
      y: elevY,
      duration: 1200,
      ease: "Quad.inOut",
      onComplete: () => {
        this.heliElevatorDescend(agentKey, sprite);
      },
    });
  }

  /** Elevator descends from the helipad to the office interior. */
  private heliElevatorDescend(
    agentKey: string,
    sprite: Phaser.GameObjects.Sprite,
  ): void {
    const elevX = this.padFrontPx.x;
    const elevStartY = this.padFrontPx.y;
    // elevator exit inside the office — tile {x:14, y:3}
    const exitX = 14 * TILE_PX + 32;
    const exitY = 3 * TILE_PX + 52;

    // draw elevator platform
    const elev = this.add.graphics().setDepth(5);
    elev.fillStyle(0x000000, 0.3);
    elev.fillRoundedRect(elevX - 32, elevStartY - 32, 64, 64, 6);
    elev.fillStyle(0x444450, 1);
    elev.fillRoundedRect(elevX - 30, elevStartY - 30, 60, 60, 5);
    elev.fillStyle(0x555560, 1);
    elev.fillRoundedRect(elevX - 28, elevStartY - 28, 56, 56, 4);
    // door seam
    elev.lineStyle(2, 0x222228, 0.8);
    elev.beginPath();
    elev.moveTo(elevX, elevStartY - 28);
    elev.lineTo(elevX, elevStartY + 28);
    elev.strokePath();
    // indicator lights
    elev.fillStyle(0xffcc44, 1);
    elev.fillCircle(elevX - 20, elevStartY - 22, 2);
    elev.fillCircle(elevX + 20, elevStartY - 22, 2);
    this.heliElevatorGfx = elev;

    // hide agent inside elevator
    if (this.heliAgent) this.heliAgent.setVisible(false);

    // descend
    this.tweens.add({
      targets: elev,
      y: exitY - elevStartY,
      duration: 2000,
      ease: "Cubic.inOut",
      onComplete: () => {
        // agent emerges from elevator
        if (this.heliAgent) {
          this.heliAgent.setPosition(exitX, exitY);
          this.heliAgent.setVisible(true);
          this.heliAgent.setDepth(10 + exitY);
          sprite.play(`${agentKey}-walk-down`);

          // walk to centre of office and idle
          const finalX = 14 * TILE_PX + 32;
          const finalY = 8 * TILE_PX + 52;
          this.tweens.add({
            targets: this.heliAgent,
            x: finalX,
            y: finalY,
            duration: 1500,
            ease: "Quad.inOut",
            onComplete: () => {
              sprite.play(`${agentKey}-idle-down`);
              this.heliAgent?.setDepth(10 + finalY);
            },
          });
        }
        // remove elevator visual
        this.time.delayedCall(600, () => {
          elev.destroy();
          this.heliElevatorGfx = null;
        });
        // helicopter takes off simultaneously
        this.heliTakeoff();
      },
    });
  }

  /** Helicopter lifts off and flies away. */
  private heliTakeoff(): void {
    if (!this.heliContainer) return;
    const padCx = this.padCenter.x;
    const padCy = this.padCenter.y;

    // lift off straight up slowly, then fly away to the side
    this.tweens.add({
      targets: this.heliContainer,
      y: padCy - 250,
      duration: 2000,
      ease: "Cubic.out",
      onComplete: () => {
        if (!this.heliContainer) return;
        this.tweens.add({
          targets: this.heliContainer,
          x: padCx + 500,
          y: padCy - 500,
          duration: 3000,
          ease: "Cubic.in",
          onComplete: () => {
            this.heliContainer?.destroy();
            this.heliContainer = null;
            this.heliRotor = null;
          },
        });
      },
    });

    // agent fades out after lingering in the office for 10s
    this.time.delayedCall(10000, () => {
      if (this.heliAgent) {
        this.tweens.add({
          targets: this.heliAgent,
          alpha: 0,
          duration: 1000,
          onComplete: () => {
            this.heliAgent?.destroy();
            this.heliAgent = null;
            this.heliActive = false;
          },
        });
      } else {
        this.heliActive = false;
      }
    });
  }

  /** Animate helicopter rotor while active. */
  private updateHelicopter(time: number): void {
    if (this.heliRotor) {
      this.heliRotor.rotation = time * 0.04;
    }
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

  /** Draw a trophy case on the wall — a wooden cabinet with empty cavities that fill with trophies. */
  private drawTrophyCase(): void {
    this.trophyGfx = this.add.graphics().setDepth(3);
    this.updateTrophyCase();
  }

  /** Redraw the trophy case with current achievement unlock state. */
  private updateTrophyCase(): void {
    const g = this.trophyGfx;
    if (!g) return;
    g.clear();

    const tx = this.trophyTile.x * TILE_PX + 32;
    const ty = this.trophyTile.y * TILE_PX + 8;
    const cw = 96;  // case width
    const ch = 120; // case height
    const cols = 6;
    const rows = 4;
    const slotW = 12;
    const slotH = 20;
    const gapX = (cw - cols * slotW) / (cols + 1);
    const gapY = (ch - rows * slotH) / (rows + 1);

    // outer wooden frame
    g.fillStyle(0x3a2818, 1);
    g.fillRoundedRect(tx - cw / 2 - 6, ty - 6, cw + 12, ch + 12, 6);
    // inner dark background (cabinet interior)
    g.fillStyle(0x1a1410, 1);
    g.fillRoundedRect(tx - cw / 2, ty, cw, ch, 4);
    // glass sheen
    g.fillStyle(0xffffff, 0.04);
    g.fillRoundedRect(tx - cw / 2 + 2, ty + 2, cw - 4, ch / 3, 3);

    // wooden shelves
    g.fillStyle(0x3a2818, 0.8);
    for (let r = 1; r < rows; r++) {
      const sy = ty + gapY * r + slotH * r;
      g.fillRect(tx - cw / 2 + 2, sy - 1, cw - 4, 3);
    }

    // draw trophy slots — proportional fill based on unlocked/total
    const unlocked = achievements.getUnlockedIds();
    const allAch = ACHIEVEMENTS.filter((a) => !a.comingSoon);
    const unlockedAch = allAch.filter((a) => unlocked.has(a.id));
    const totalSlots = cols * rows;
    const filledSlots = Math.round(totalSlots * unlockedAch.length / allAch.length);

    // tier-based trophy colors — rarer tiers get more prestigious metals
    const tierColors: Record<string, number> = {
      "First Steps":   0xcd7f32, // bronze
      "Agent Mastery": 0xc0c0c0, // silver
      "Explorer":      0xffd700, // gold
      "Adventurer":    0xff8c00, // amber
      "Warrior":       0xb22222, // ruby red
      "Ghosts":        0x9370db, // amethyst
      "Secret":        0x00ced1, // teal
    };

    // fill from bottom row upward (like a real trophy case)
    let idx = 0;
    for (let row = rows - 1; row >= 0; row--) {
      for (let col = 0; col < cols; col++) {
        const sx = tx - cw / 2 + gapX + col * (slotW + gapX);
        const sy = ty + gapY + row * (slotH + gapY);
        const isFilled = idx < filledSlots;

        if (isFilled) {
          const ach = unlockedAch[idx];
          const color = ach ? (tierColors[ach.tier] ?? 0xffd700) : 0xffd700;
          // trophy cup
          g.fillStyle(color, 1);
          g.fillCircle(sx + slotW / 2, sy + 6, 4);
          g.fillRect(sx + slotW / 2 - 2, sy + 9, 4, 4);
          g.fillRect(sx + slotW / 2 - 4, sy + 13, 8, 2);
          // sparkle
          g.fillStyle(0xffffff, 0.5);
          g.fillCircle(sx + slotW / 2 + 2, sy + 5, 1);
        } else {
          // empty cavity — dark recessed slot
          g.fillStyle(0x0a0808, 0.6);
          g.fillRoundedRect(sx, sy, slotW, slotH, 2);
          // subtle dust
          g.fillStyle(0x2a2a2a, 0.3);
          g.fillCircle(sx + slotW / 2, sy + slotH / 2, 1.5);
        }
        idx++;
      }
    }
  }

  /** Draw a cork-board bulletin board hanging on the west wall — the Hall of Fame. */
  private drawHallOfFameBoard(): void {
    this.hallOfFameGfx = this.add.graphics().setDepth(3);
    const g = this.hallOfFameGfx;

    // Board hangs on the west wall (x=0 tile), protruding slightly into the room.
    // Portrait orientation, centered vertically on the hallOfFameTile row.
    const wallFace = TILE_PX;              // wall tile ends at x=64
    const bx = wallFace + 22;              // board center — hangs ~22px off the wall face
    const by = this.hallOfFameTile.y * TILE_PX + 32;
    const bw = 48;
    const bh = 84;

    // Drop shadow on the wall behind/below the board
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(bx - bw / 2 + 3, by - bh / 2 + 4, bw, bh, 3);

    // Wooden frame — visible thickness so it reads as a 3D object on the wall
    g.fillStyle(0x4a3220, 1);
    g.fillRoundedRect(bx - bw / 2 - 4, by - bh / 2 - 4, bw + 8, bh + 8, 5);
    g.fillStyle(0x5a4030, 1);
    g.fillRoundedRect(bx - bw / 2 - 2, by - bh / 2 - 2, bw + 4, bh + 4, 4);

    // Cork surface
    g.fillStyle(0xcba872, 1);
    g.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 3);

    // Cork texture — scattered dots
    g.fillStyle(0xb8985f, 0.4);
    for (let i = 0; i < 30; i++) {
      const dx = bx - bw / 2 + 4 + Math.random() * (bw - 8);
      const dy = by - bh / 2 + 4 + Math.random() * (bh - 8);
      g.fillCircle(dx, dy, 0.8 + Math.random() * 0.8);
    }

    // Title strip at top
    g.fillStyle(0x2a3848, 0.9);
    g.fillRoundedRect(bx - bw / 2 + 3, by - bh / 2 + 3, bw - 6, 12, 2);

    // Gold star at top center
    g.fillStyle(0xffd700, 1);
    g.fillCircle(bx, by - bh / 2 + 9, 2.5);

    // Mounting nails at top corners — small silver dots on the wall above the board
    g.fillStyle(0x888890, 1);
    g.fillCircle(bx - bw / 2 + 4, by - bh / 2 - 6, 1.5);
    g.fillCircle(bx + bw / 2 - 4, by - bh / 2 - 6, 1.5);
    // nail highlights
    g.fillStyle(0xcccccc, 0.6);
    g.fillCircle(bx - bw / 2 + 3.5, by - bh / 2 - 6.5, 0.7);
    g.fillCircle(bx + bw / 2 - 4.5, by - bh / 2 - 6.5, 0.7);

    // Pinned photos — 3 small polaroid cards stacked vertically
    const photoColors = [0xc44a4a, 0x3a7cb5, 0x3d9152];
    const photoSpacing = 22;
    const photoStartY = by - bh / 2 + 22;
    for (let i = 0; i < photoColors.length; i++) {
      const py = photoStartY + i * photoSpacing;
      // white border
      g.fillStyle(0xf8f6f0, 1);
      g.fillRoundedRect(bx - 14, py - 8, 28, 18, 1);
      // photo content
      g.fillStyle(photoColors[i], 1);
      g.fillRect(bx - 12, py - 6, 24, 10);
      // push pin
      g.fillStyle(0xd44a4a, 1);
      g.fillCircle(bx, py - 10, 2);
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(bx - 0.8, py - 10.8, 0.8);
    }
  }

  /** Create walk/idle/work animations for a custom character texture key. */
  private ensureCharAnimations(key: string): void {
    if (this.anims.exists(`${key}-work`)) return;
    const dirs: Dir[] = ["down", "left", "right", "up"];
    const FRAMES_PER_ROW = 8;
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
      const breathFrames = Array(24).fill(base + 6);
      breathFrames.push(base + 7);
      breathFrames.push(base + 6);
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
    this.anims.create({
      key: `${key}-work`,
      frames: this.anims.generateFrameNumbers(key, { frames: [6, 7] }),
      frameRate: 2.5,
      repeat: -1,
    });
  }

  /** Ensure all game animations exist — called on create() to handle scene restarts. */
  private ensureAllAnimations(): void {
    const creatureNames = ["slime", "wolf", "skeleton", "imp", "wraith", "fire-elemental"];
    for (const name of creatureNames) {
      const key = `creature-${name}`;
      if (this.anims.exists(`${key}-idle`)) continue;
      this.anims.create({ key: `${key}-idle`, frames: this.anims.generateFrameNumbers(key, { frames: [0, 1, 0, 2] }), frameRate: 3, repeat: -1 });
      this.anims.create({ key: `${key}-walk`, frames: this.anims.generateFrameNumbers(key, { frames: [1, 2, 1, 2] }), frameRate: 8, repeat: -1 });
      this.anims.create({ key: `${key}-attack`, frames: this.anims.generateFrameNumbers(key, { frames: [3, 0] }), frameRate: 6, repeat: 0 });
    }

    const beastNames = ["groveheart", "stone-colossus", "ash-wyrm", "void-leviathan", "infernal-sovereign"];
    for (const name of beastNames) {
      const key = `beast-${name}`;
      if (this.anims.exists(`${key}-idle`)) continue;
      this.anims.create({ key: `${key}-idle`, frames: this.anims.generateFrameNumbers(key, { frames: [0, 1, 0, 2] }), frameRate: 2, repeat: -1 });
      this.anims.create({ key: `${key}-move`, frames: this.anims.generateFrameNumbers(key, { frames: [1, 2, 1, 2] }), frameRate: 5, repeat: -1 });
      this.anims.create({ key: `${key}-attack`, frames: this.anims.generateFrameNumbers(key, { frames: [3, 0] }), frameRate: 4, repeat: 0 });
    }

    const friendlyNames = ["unicorn", "fairy-bunny", "baby-dragon", "crystal-fox"];
    for (const name of friendlyNames) {
      const key = `friendly-${name}`;
      if (this.anims.exists(`${key}-idle`)) continue;
      this.anims.create({ key: `${key}-idle`, frames: this.anims.generateFrameNumbers(key, { frames: [0, 1, 0, 2] }), frameRate: 3, repeat: -1 });
      this.anims.create({ key: `${key}-walk`, frames: this.anims.generateFrameNumbers(key, { frames: [1, 2, 1, 2] }), frameRate: 6, repeat: -1 });
      this.anims.create({ key: `${key}-hop`, frames: this.anims.generateFrameNumbers(key, { frames: [3, 1, 0] }), frameRate: 5, repeat: 0 });
    }

    const sheets = ["boss", "char-yuki", ...Array.from({ length: 8 }, (_, i) => `char-${i}`)];
    const dirs: Dir[] = ["down", "left", "right", "up"];
    for (const key of sheets) {
      if (this.anims.exists(`${key}-work`)) continue;
      dirs.forEach((dir, row) => {
        const base = row * CHAR_FRAMES_PER_ROW;
        this.anims.create({ key: `${key}-walk-${dir}`, frames: this.anims.generateFrameNumbers(key, { frames: [base, base + 1, base + 2, base + 3, base + 4, base + 5] }), frameRate: 10, repeat: -1 });
        const breathFrames = Array(24).fill(base + 6);
        breathFrames.push(base + 7);
        breathFrames.push(base + 6);
        this.anims.create({ key: `${key}-idle-${dir}`, frames: this.anims.generateFrameNumbers(key, { frames: breathFrames }), frameRate: 10, repeat: -1, repeatDelay: Math.random() * 2 });
      });
      this.anims.create({ key: `${key}-work`, frames: this.anims.generateFrameNumbers(key, { frames: [6, 7] }), frameRate: 2.5, repeat: -1 });
    }

    if (!this.anims.exists("water-anim")) {
      this.anims.create({ key: "water-anim", frames: this.anims.generateFrameNumbers("world-tiles", { frames: [21, 22, 23] }), frameRate: 4, repeat: -1 });
    }
  }

  /** Generate or refresh the boss texture from the player's appearance. */
  private refreshBossTexture(): void {
    const ap = this.store.player?.appearance;
    if (ap) {
      const key = "boss-custom";
      // Only regenerate if the texture doesn't exist yet or appearance changed
      const existing = this.textures.get(key);
      if (!existing || (this as any)._lastBossAp !== ap) {
        (this as any)._lastBossAp = ap;
        generateCharTexture(this, key, ap);
        this.ensureCharAnimations(key);
      }
      this.playerTexKey = key;
    } else {
      this.playerTexKey = "boss";
    }
  }

  private syncAgents(): void {
    for (const [id, info] of this.store.agents) {
      if (id === YUKI_ID) {
        this.yuki?.sync(info);
        continue;
      }
      const existing = this.npcs.get(id);
      if (existing) {
        existing.sync(info);
      } else {
        // Generate custom texture if agent has an appearance
        if (info.appearance) {
          const key = agentTextureKey(info);
          generateCharTexture(this, key, info.appearance);
          this.ensureCharAnimations(key);
        }
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
        m?.setFrame("0").clearTint();
      } else {
        m?.setFrame("1");
        m?.setTint(STATUS_COLORS[agent.status]);
      }
    });

    // chairs: face up (toward desk) if assigned, face down if unassigned
    this.chairs.forEach((chair, i) => {
      if (!chair) return;
      const agent = [...this.store.agents.values()].find((a) => a.deskIndex === i);
      if (agent) {
        chair.setTexture(CHAIR_TEX_UP);
      } else {
        chair.setTexture(CHAIR_TEX_DOWN);
      }
    });

    // Yuki's monitor — always on since she's always at her desk
    if (this.yukiMonitor) {
      const yukiInfo = this.store.agents.get(YUKI_ID);
      if (yukiInfo && yukiInfo.status !== "idle") {
        this.yukiMonitor.setFrame("1");
        this.yukiMonitor.setTint(STATUS_COLORS[yukiInfo.status]);
      } else {
        this.yukiMonitor.setFrame("0");
        this.yukiMonitor.clearTint();
      }
    }
  }

  /** Toggle chimney smoke based on whether any devops agent is actively working. */
  private updateChimneySmoke(): void {
    if (this.chimneyPositions.length === 0) return;
    const devopsWorking = [...this.store.agents.values()].some(
      (a) => a.role === "devops" && (a.status === "working" || a.status === "thinking"),
    );
    if (devopsWorking) {
      this.world.vfx.startSmoke(this.chimneyPositions);
    } else {
      this.world.vfx.stopSmoke();
    }
  }

  update(time: number, dt: number): void {
    // cap dt so a lag spike (chunk gen, GC, tab switch) doesn't cause a
    // teleport-length step that tunnels through collision
    dt = Math.min(dt, 100);
    // typing in a HUD field? the game keyboard is yours, not the boss's
    const active = document.activeElement?.tagName;
    const typing = active === "INPUT" || active === "TEXTAREA" || active === "SELECT";
    if (typing) {
      this.player.play(`${this.playerTexKey}-idle-${this.playerDir}`, true);
      for (const npc of this.npcs.values()) npc.update(time, dt, this.store.settings.game.idleWander, this.player.x, this.player.y);
      this.yuki?.update(time, dt, false, this.player.x, this.player.y);
      const sel = this.store.selectedId ? this.npcs.get(this.store.selectedId) : null;
      const selYuki = this.store.selectedId === YUKI_ID ? this.yuki : null;
      this.selectRing.setVisible(!!(sel || selYuki));
      if (sel) this.selectRing.setPosition(sel.container.x, sel.container.y + 1);
      else if (selYuki) this.selectRing.setPosition(selYuki.container.x, selYuki.container.y + 1);
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
    const speed = (time < this.coffeeUntil ? PLAYER_SPEED * 2 : time < this.sofaUntil ? PLAYER_SPEED * 1.5 : PLAYER_SPEED) * tileSpeedMult;

    // always use manual movement for consistent feel
    const stepX = vx * speed * (dt / 1000);
    const stepY = vy * speed * (dt / 1000);

    // Sub-step movement to prevent tunneling through walls on large frames.
    // Collision checks only verify the endpoint, so a single big step can
    // skip past walls entirely. Break it into sub-steps of at most half a tile.
    const maxStep = TILE_PX * 0.5;
    const subSteps = Math.max(1, Math.ceil(Math.max(Math.abs(stepX), Math.abs(stepY)) / maxStep));
    const subX = stepX / subSteps;
    const subY = stepY / subSteps;
    for (let i = 0; i < subSteps; i++) {
      if (outside) {
        if (subX !== 0 && this.world.canWalk(this.player.x + subX, this.player.y)) {
          this.player.x += subX;
        }
        if (subY !== 0 && this.world.canWalk(this.player.x, this.player.y + subY)) {
          this.player.y += subY;
        }
      } else {
        if (subX !== 0 && this.canWalkOffice(this.player.x + subX, this.player.y)) {
          this.player.x += subX;
        }
        if (subY !== 0 && this.canWalkOffice(this.player.x, this.player.y + subY)) {
          this.player.y += subY;
        }
      }
    }

    if (vx !== 0 || vy !== 0) {
      this.playerDir =
        Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
      this.player.play(`${this.playerTexKey}-walk-${this.playerDir}`, true);
    } else {
      this.player.play(`${this.playerTexKey}-idle-${this.playerDir}`, true);
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
    this.playerLabel.setColor(time < this.coffeeUntil ? "#b0741f" : time < this.sofaUntil ? "#9a7acb" : "#1d2126");

    // E: grab coffee, talk to the nearest agent, open the task board, or recruit a ghost
    const ePressed = Phaser.Input.Keyboard.JustDown(this.keys.E);
    if (ePressed) {
      // trophy case check — before other interactables
      const trophyPx = { x: this.trophyTile.x * TILE_PX + 32, y: this.trophyTile.y * TILE_PX + 40 };
      const trophyDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, trophyPx.x, trophyPx.y);
      // hall of fame bulletin board — west wall, bottom-left
      const hofPx = { x: 86, y: this.hallOfFameTile.y * TILE_PX + 32 };
      const hofDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, hofPx.x, hofPx.y);
      if (trophyDist < 120) {
        this.store.toggleAchievements();
      } else if (hofDist < 120) {
        this.store.toggleHallOfFame();
      } else
      // try new office interactables first
      if (this.tryOfficeInteract(time)) {
        // handled by a new interactable
      } else {
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
        this.world.vfx.sparkBurst(coffeePx.x, coffeePx.y, 0xb0741f, 12, 80);
        this.world.vfx.celebrate(coffeePx.x, coffeePx.y);
        this.world.audio.coffee();
        if (achievements.incStat("coffee") >= 10) achievements.unlock("coffee_addict");
        if (time < this.sofaUntil) achievements.unlock("speed_demon");
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
          // also check Yuki
          if (this.yuki) {
            const d = Phaser.Math.Distance.Between(
              this.player.x,
              this.player.y,
              this.yuki.container.x,
              this.yuki.container.y,
            );
            if (d < 144 && (!best || d < best.d)) best = { id: YUKI_ID, d };
          }
          this.store.select(best ? best.id : null);
          if (best) {
            if (best.id === YUKI_ID) achievements.unlock("yuki_visit");
            // defer focus so this keypress doesn't type "e" into the chat box
            setTimeout(() => {
              (document.getElementById("d-chat") as HTMLInputElement | null)?.focus();
            }, 0);
          }
        }
      }
    }
    }

    // --- helicopter rotor ---
    this.updateHelicopter(time);

    // --- agents ---
    for (const npc of this.npcs.values()) npc.update(time, dt, this.store.settings.game.idleWander, this.player.x, this.player.y);
    this.yuki?.update(time, dt, false, this.player.x, this.player.y);

    // selection ring
    const sel = this.store.selectedId ? this.npcs.get(this.store.selectedId) : null;
    const selYuki = this.store.selectedId === YUKI_ID ? this.yuki : null;
    this.selectRing.setVisible(!!(sel || selYuki));
    if (sel) this.selectRing.setPosition(sel.container.x, sel.container.y + 1);
    else if (selYuki) this.selectRing.setPosition(selYuki.container.x, selYuki.container.y + 1);

    // --- lighting ---
    this.updateLighting(time);

    // --- world layer: chunks, ghosts, compass, recruit ---
    this.registry.set("playerPos", { x: this.player.x, y: this.player.y });
    this.world.update(time, dt, this.player.x, this.player.y, ePressed, vx, vy);
    this.world.vfx.updateSmoke();

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

    // office proximity hints — skip distance checks when outside
    if (!outside) {
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

      // new interactable proximity hints
      this.updateInteractHints(time);
    } else {
      this.boardHint.setVisible(false);
      this.coffeeHint.setVisible(false);
      this.fridgeHint.setVisible(false);
      this.coolerHint.setVisible(false);
      this.clockHint.setVisible(false);
      this.vendingHint.setVisible(false);
      this.sofaHint.setVisible(false);
      this.filingHint.setVisible(false);
      this.plantHint.setVisible(false);
      this.mailboxHint.setVisible(false);
      this.redButtonHint.setVisible(false);
    }

    // mailbox: new mail arrives on timer
    if (!this.mailboxHasMail && time >= this.mailboxNextMail) {
      this.mailboxHasMail = true;
      this.drawMailbox();
    }

    // --- achievements: exploration ---
    if (outside) {
      achievements.unlock("step_outside");
      const hostility = this.world.getHostilityAt(this.player.x, this.player.y);
      if (hostility >= 0) achievements.unlock("meadow_explorer");
      if (hostility >= 1) achievements.unlock("forest_explorer");
      if (hostility >= 2) achievements.unlock("ruins_explorer");
      if (hostility >= 3) achievements.unlock("wasteland_explorer");
      if (hostility >= 4) achievements.unlock("void_explorer");
      if (hostility >= 5) achievements.unlock("infernal_explorer");
      const chunkDist = this.world.chunkDistance(this.player.x, this.player.y);
      if (chunkDist >= 10) achievements.unlock("deep_diver");
      if (chunkDist >= 18) achievements.unlock("marathoner");
      const df = this.world.distanceFactor(this.player.x, this.player.y);
      if (df >= 1.0) achievements.unlock("night_walker");
      if (this.world.playerHp < 10) achievements.incStat("lowHpOutside", 0); // just touch the stat
    } else {
      // returned to office — check close_call
      if (this.world.playerHp > 0 && this.world.playerHp < 10) {
        achievements.unlock("close_call");
      }
    }

    // insomniac: 60 min in one session
    if ((time - this.sceneStart) >= 3600000) achievements.unlock("insomniac");

    // trophy case — update display only when achievement count changes
    const achCount = achievements.getUnlockedCount();
    if (!outside && achCount !== this.trophyAchCount) {
      this.trophyAchCount = achCount;
      this.updateTrophyCase();
    }
    // trophy case & hall of fame proximity hints — skip when outside
    if (!outside) {
      const trophyPx2 = { x: this.trophyTile.x * TILE_PX + 32, y: this.trophyTile.y * TILE_PX + 68 };
      const trophyDist2 = Phaser.Math.Distance.Between(this.player.x, this.player.y, trophyPx2.x, trophyPx2.y);
      if (trophyDist2 < 120 && !this.store.achievementsOpen) {
        this.trophyHint
          .setPosition(trophyPx2.x, trophyPx2.y + 64)
          .setText("E: TROPHY CASE")
          .setVisible(true);
      } else {
        this.trophyHint.setVisible(false);
      }

      // hall of fame bulletin board — proximity hint (player approaches from the right)
      const hofPx2 = { x: 86, y: this.hallOfFameTile.y * TILE_PX + 32 };
      const hofDist2 = Phaser.Math.Distance.Between(this.player.x, this.player.y, hofPx2.x, hofPx2.y);
      if (hofDist2 < 120 && !this.store.hallOfFameOpen) {
        this.hallOfFameHint
          .setPosition(hofPx2.x + 48, hofPx2.y)
          .setText("E: HALL OF FAME")
          .setVisible(true);
      } else {
        this.hallOfFameHint.setVisible(false);
      }
    } else {
      this.trophyHint.setVisible(false);
      this.hallOfFameHint.setVisible(false);
    }
  }
}

export { tileOf };
