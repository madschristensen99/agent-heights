import Phaser from "phaser";
import type { Store, HelicopterDelivery } from "../store";
import type { Net } from "../net";
import { AgentNPC, YukiNPC, HermesNPC, feetOf, tileOf, TILE_PX, STATUS_COLORS, agentTextureKey, type Dir } from "./agent";
import { YUKI_ID, HERMES_ID, type CharAppearance, type AgentInfo } from "../../../shared/types";
import { Grid, type Tile } from "./path";
import { WorldLayer, LOAD_RADIUS } from "./world";
import { BloomPipeline, ColorGradePipeline, DOFPipeline } from "./shaders";
import { generateAllTextures } from "./textures";
import { generateCharTexture, generateCharPreviewDataURL, CHAR_FRAMES_PER_ROW } from "./chargen";
import { getServerByUrl } from "../../../shared/mcp-catalog";
import { upgradeFurniture, CHAIR_TEX_DOWN, CHAIR_TEX_UP, CHAIR_TEX_LEFT, CHAIR_TEX_RIGHT, MONITOR_TEX, MONITOR_SIDE_TEX } from "./furniture";
import { upgradeWorkshop } from "./workshop";
import { achievements, ACHIEVEMENTS } from "./achievements";
import { touchInput, isTouchDevice } from "../touch";
import { VoiceManager } from "../voice";
import { ScreenShareManager } from "../screen-share";
import { WebcamManager } from "../webcam";

const PLAYER_SPEED = 380;

function hintLabel(text: string): string {
  return isTouchDevice() ? text.replace(/^E:\s*/, "TAP ") : text;
}

interface PlatformMailbox {
  platform: string;
  color: number;
  colorLight: number;
  colorDark: number;
  tile: Tile;
  flagUp: boolean;
  pendingCount: number;
  lastMessage: string;
}

const PLATFORM_CONFIG = [
  { platform: "Slack",    color: 0x611f69, tile: { x: 2, y: 13 } },
  { platform: "Discord",  color: 0x5865f2, tile: { x: 3, y: 13 } },
  { platform: "Telegram", color: 0x0088cc, tile: { x: 5, y: 13 } },
  { platform: "WhatsApp", color: 0x25d366, tile: { x: 6, y: 13 } },
  { platform: "Signal",   color: 0x3a76f0, tile: { x: 8, y: 13 } },
  { platform: "Email",    color: 0xea4335, tile: { x: 9, y: 13 } },
];

export class OfficeScene extends Phaser.Scene {
  private store!: Store;
  private grid!: Grid;
  private npcs = new Map<string, AgentNPC>();
  private yuki: YukiNPC | null = null;
  private hermes: HermesNPC | null = null;
  private yukiSeat: Tile | null = null;
  private yukiOfficeZone: Phaser.GameObjects.Zone | null = null;
  private seats: Tile[] = [];
  private extraSpots: Tile[] = [];
  private monitors: Phaser.GameObjects.Sprite[] = [];
  private chairs: Phaser.GameObjects.Sprite[] = [];
  private yukiMonitor: Phaser.GameObjects.Sprite | null = null;
  private hermesSeat: Tile | null = null;
  private hermesMonitor: Phaser.GameObjects.Sprite | null = null;
  private spawnTile: Tile = { x: 14, y: 16 };
  private doorTile: Tile = { x: 14, y: 17 };
  private boardTile: Tile = { x: 14, y: 2 };
  private boardHint!: Phaser.GameObjects.Text;
  private coffeeTile: Tile = { x: 23, y: 2 };
  private coffeeUntil = 0;
  private coffeeHint!: Phaser.GameObjects.Text;

  // --- projector screen (top-left wall) ---
  private projectorTile: Tile = { x: 6, y: 0 };
  private projectorHint!: Phaser.GameObjects.Text;
  private projectorGfx!: Phaser.GameObjects.Graphics;
  private projectorIframe: HTMLIFrameElement | null = null;
  private projectorVideoId: string | null = null;
  private projectorEmbedUrl: string | null = null;
  private static readonly PROJECTOR_CHANNELS: { id: string; label: string; videoId?: string; embedUrl?: string }[] = [
    { id: "brainrot", label: "BRAINROT", videoId: "vTfD20dbxho" },
    { id: "chill",    label: "CHILL",    videoId: "hnsmzzQABBo" },
    { id: "trading",  label: "TRADING",  embedUrl: "https://s.tradingview.com/widgetembed/?frameElementId=tv-projector&symbol=XMRUSD&interval=60&hidesidetoolbar=1&hidetoptoolbar=1&symboledit=0&saveimage=0&toolbarbg=f1f3f6&studies=[]&hideideas=1&theme=dark&style=1&timezone=Etc/UTC" },
  ];

  // --- new office interactables ---
  private fridgeTile: Tile = { x: 26, y: 2 };
  private coolerTile: Tile = { x: 28, y: 4 };
  private clockTile: Tile = { x: 1, y: 3 };
  private vendingTile: Tile | null = null;

  // --- projector control panel + speaker (where clock used to be) ---
  private projectorControlTile: Tile = { x: 6, y: 1 };
  private projectorSpeakerTile: Tile = { x: 7, y: 1 };
  private projectorControlHint!: Phaser.GameObjects.Text;
  private projectorSpeakerHint!: Phaser.GameObjects.Text;
  private projectorControlGfx!: Phaser.GameObjects.Graphics;
  private projectorSpeakerGfx!: Phaser.GameObjects.Graphics;
  private projectorMuted = true;
  private screenShareTile: Tile = { x: 5, y: 1 };
  private screenShareHint!: Phaser.GameObjects.Text;
  private screenShareGfx!: Phaser.GameObjects.Graphics;

  // --- phone booth (webcam broadcast) ---
  private phoneBoothTile: Tile = { x: 3, y: 2 };
  private phoneBoothHint!: Phaser.GameObjects.Text;
  private phoneBoothGfx!: Phaser.GameObjects.Graphics;
  private phoneBoothLight!: Phaser.GameObjects.Graphics;
  private webcam: WebcamManager | null = null;
  private webcamVideoEl: HTMLVideoElement | null = null;
  private screenShareVideoEl: HTMLVideoElement | null = null;
  private webcamPresenterId: string | null = null;
  private webcamPresenterName: string | null = null;
  private inPhoneBooth = false;
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

  // --- platform mailboxes (mail room) ---
  private platformMailboxGfx!: Phaser.GameObjects.Graphics;
  private platformMailboxHint!: Phaser.GameObjects.Text;
  private platformMailboxes: PlatformMailbox[] = [];

  private fridgeHint!: Phaser.GameObjects.Text;
  private coolerHint!: Phaser.GameObjects.Text;
  private clockHint!: Phaser.GameObjects.Text;
  private vendingHint!: Phaser.GameObjects.Text;
  private sofaHint!: Phaser.GameObjects.Text;
  private filingHint!: Phaser.GameObjects.Text;
  private plantHint!: Phaser.GameObjects.Text;
  // mailboxHint declared above with mailbox fields

  // --- wardrobe (break room) ---
  private wardrobeTile: Tile = { x: 21, y: 18 };
  private wardrobeHint!: Phaser.GameObjects.Text;
  private wardrobeGfx!: Phaser.GameObjects.Graphics;

  private trophyTile: Tile = { x: 1, y: 8 };
  private trophyHint!: Phaser.GameObjects.Text;
  private trophyGfx!: Phaser.GameObjects.Graphics;
  private trophyAchCount = -1;
  private sceneStart = 0;

  private hallOfFameTile: Tile = { x: 1, y: 5 };
  private hallOfFameHint!: Phaser.GameObjects.Text;
  private hallOfFameGfx!: Phaser.GameObjects.Graphics;
  private chimneyGfx!: Phaser.GameObjects.Graphics;

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
  private heliDelivery: HelicopterDelivery | null = null;

  private world!: WorldLayer;
  private theme: "classic" | "agenthq" = "classic";
  /** Pixel positions of chimney tiles — for smoke when devops agents work. */
  private chimneyPositions: { x: number; y: number }[] = [];
  /** Server rack tile positions for E-interaction. */
  private serverRackTiles: Tile[] = [];
  private serverRackHint!: Phaser.GameObjects.Text;

  // --- expedition workshop (break room) ---
  // Each tile is the center of the multi-tile piece for proximity checks.
  private warTableTile: Tile = { x: 26, y: 15 };   // 2×2 at (25,14)
  private scrapBinTile: Tile = { x: 28, y: 18 };   // 1×2 at (28,17)
  private radioTile: Tile = { x: 28, y: 14 };      // 1×1 at (28,14)
  private workbenchTile: Tile = { x: 24, y: 18 };  // 2×1 at (23,18)
  private researchTile: Tile = { x: 23, y: 14 };   // 2×1 at (22,14)
  private warTableHint!: Phaser.GameObjects.Text;
  private scrapBinHint!: Phaser.GameObjects.Text;
  private radioHint!: Phaser.GameObjects.Text;
  private workbenchHint!: Phaser.GameObjects.Text;
  private researchHint!: Phaser.GameObjects.Text;
  private allHints: Phaser.GameObjects.Text[] = [];

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

  /** Multiplayer: remote player sprites keyed by userId. */
  private remotePlayers = new Map<string, { sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text; nameBg: Phaser.GameObjects.Graphics; intro?: boolean; texKey: string; appearance: CharAppearance | null; }>();
  /** Voice chat manager — WebRTC proximity voice. */
  private voice: VoiceManager | null = null;
  /** Screen share manager — WebRTC screen sharing on projector. */
  private screenShare: ScreenShareManager | null = null;
  /** Agent currently broadcasting to the projector (null = none). */
  private agentBroadcastAgentId: string | null = null;
  /** Agent currently being viewed in the modal (null = modal closed). */
  private agentViewAgentId: string | null = null;
  /** Projector texture key for agent frames. */
  private projectorAgentTextureKey = "projector-agent-frame";
  /** Phaser image object for agent frames on projector. */
  private projectorAgentImage: Phaser.GameObjects.Image | null = null;
  /** Matrix rain overlays for working monitors — keyed by desk index. */
  private monitorMatrixOverlays: Map<number, Phaser.GameObjects.Image> = new Map();
  /** Matrix rain canvas texture. */
  private monitorMatrixTexKey = "monitor-matrix-rain";
  /** Matrix rain columns state — array of {y, speed, chars[]} per column. */
  private matrixColumns: { y: number; speed: number; chars: string[] }[] = [];
  /** Matrix rain canvas width/height. */
  private static MATRIX_W = 128;
  private static MATRIX_H = 80;
  /** Speaking indicator icons above remote players. */
  private speakingIcons = new Map<string, Phaser.GameObjects.Text>();
  /** Tracks the last roomId the scene rendered — used to detect room changes. */
  private lastRoomId: string | null = null;
  private lastPosSent = 0;
  private lastSentX = 0;
  private lastSentY = 0;

  constructor() {
    super("office");
  }

  create(): void {
    console.log("[scene] OfficeScene.create() called");
    this.store = this.game.registry.get("store") as Store;
    this.net = this.game.registry.get("net") as import("../net").Net;
    this._myUserId = (this.game.registry.get("userId") as string) ?? null;

    // ── Voice chat: create VoiceManager and wire store listeners ──────────
    if (this._myUserId && this.net) {
      this.store.clearVoiceListeners();
      this.voice = new VoiceManager(this._myUserId, (msg) => this.net!.send(msg));
      this.store.onVoicePeer((userId, name) => this.voice?.onPeer(userId, name));
      this.store.onVoiceOffer((fromUserId, sdp) => { void this.voice?.onOffer(fromUserId, sdp); });
      this.store.onVoiceAnswer((fromUserId, sdp) => { void this.voice?.onAnswer(fromUserId, sdp); });
      this.store.onVoiceIce((fromUserId, candidate) => { void this.voice?.onIce(fromUserId, candidate); });
      this.store.onVoicePeerLeft((userId) => this.voice?.onPeerLeft(userId));
      this.events.once("shutdown", () => { this.voice?.stop(); this.voice = null; this.store.sceneRef = null; });
      this.store.sceneRef = this as any;
    }
    // Clean up projector iframe on scene shutdown/restart
    this.events.once("shutdown", () => this.destroyProjectorVideo());

    // ── Screen share + webcam: create managers and wire store listeners ──
    if (this._myUserId && this.net) {
      this.screenShare = new ScreenShareManager(this._myUserId, (msg) => this.net!.send(msg));
      this.screenShare.onRemoteStream = (stream, _userId) => {
        this.attachScreenShareVideo(stream);
      };
      this.screenShare.onStreamEnded = () => {
        this.detachScreenShareVideo();
      };
      this.store.onScreenSharePeer((userId, name) => this.screenShare?.onSharerPeer(userId, name));
      this.store.onScreenShareOffer((fromUserId, sdp) => { void this.screenShare?.onOffer(fromUserId, sdp); });
      this.store.onScreenShareAnswer((fromUserId, sdp) => { void this.screenShare?.onAnswer(fromUserId, sdp); });
      this.store.onScreenShareIce((fromUserId, candidate) => { void this.screenShare?.onIce(fromUserId, candidate); });
      this.store.onScreenSharePeerLeft((userId) => this.screenShare?.onPeerLeft(userId));

      this.webcam = new WebcamManager(this._myUserId, (msg) => this.net!.send(msg));
      this.webcam.onRemoteStream = (stream, _userId) => {
        this.attachWebcamVideo(stream);
      };
      this.webcam.onStreamEnded = () => {
        this.detachWebcamVideo();
      };
      this.webcam.onStateChange = (broadcasting) => {
        this.updatePhoneBoothVisual(broadcasting);
      };
      this.store.onWebcamState((presenterId, presenterName) => {
        this.webcamPresenterId = presenterId;
        this.webcamPresenterName = presenterName;
        if (!presenterId) {
          this.detachWebcamVideo();
        }
      });
      this.store.onWebcamPeer((userId, name) => this.webcam?.onBroadcasterPeer(userId, name));
      this.store.onWebcamOffer((fromUserId, sdp) => { void this.webcam?.onOffer(fromUserId, sdp); });
      this.store.onWebcamAnswer((fromUserId, sdp) => { void this.webcam?.onAnswer(fromUserId, sdp); });
      this.store.onWebcamIce((fromUserId, candidate) => { void this.webcam?.onIce(fromUserId, candidate); });
      this.store.onWebcamPeerLeft((userId) => {
        this.webcam?.onPeerLeft(userId);
        if (this.webcamPresenterId === userId) {
          this.webcamPresenterId = null;
          this.webcamPresenterName = null;
          this.detachWebcamVideo();
        }
      });

      this.events.once("shutdown", () => {
        this.screenShare?.stopSharing();
        this.screenShare = null;
        this.webcam?.destroy();
        this.webcam = null;
        this.detachWebcamVideo();
        this.detachScreenShareVideo();
      });
    }

    // ── Agent screenshot viewing + projector broadcast ────────────────
    this.store.onAgentFrame((agentId, frame) => {
      // If this is the agent being viewed in the modal, update the modal
      if (agentId === this.agentViewAgentId) {
        const content = document.getElementById("agent-view-content");
        if (content) {
          content.innerHTML = `<img src="data:image/jpeg;base64,${frame}" style="width: 100%; height: 100%; object-fit: contain;" />`;
        }
      }
      // If this agent is broadcasting, render on projector
      if (agentId === this.agentBroadcastAgentId) {
        this.updateProjectorAgentFrame(frame);
      }
    });
    this.store.onAgentBroadcastState((agentId) => {
      this.agentBroadcastAgentId = agentId;
      if (!agentId) {
        this.hideProjectorAgentFrame();
      }
      // Update modal broadcast button if open
      const btn = document.getElementById("agent-view-broadcast");
      if (btn) {
        if (agentId && agentId === this.agentViewAgentId) {
          btn.textContent = "Stop Broadcast";
          (btn as HTMLButtonElement).style.background = "#6a2a2a";
        } else {
          btn.textContent = "Broadcast to Projector";
          (btn as HTMLButtonElement).style.background = "#2a4a6a";
        }
      }
    });
    this.events.once("shutdown", () => {
      this.closeAgentViewModal();
      this.hideProjectorAgentFrame();
      for (const overlay of this.monitorMatrixOverlays.values()) overlay.destroy();
      this.monitorMatrixOverlays.clear();
      this.matrixColumns = [];
    });
    // HQ2 and org rooms use the agenthq (big open office) theme; private offices use user's chosen theme.
    // Before room_state arrives, roomId is null — default to HQ2 theme since that's where
    // players start. This prevents a brief flash of the wrong room layout.
    const isHq2 = this.store.roomId === "hq2" || this.store.roomId === null || this.store.isOrgRoom;
    this.theme = isHq2 ? "agenthq" : (this.store.settings.game.theme === "agenthq" ? "agenthq" : "classic");
    this.ready = false;

    // Remove any stale overlay from a previous scene restart
    document.getElementById("office-loading")?.remove();

    // --- DOM loading overlay for phased office init ---
    // Using DOM instead of Phaser Text avoids a canvas-texture crash that
    // occurs when setText is called from delayedCall during scene init.
    // The opaque blue background also hides the office being built behind it.
    const loadOverlay = document.createElement("div");
    loadOverlay.id = "office-loading";
    loadOverlay.style.cssText = `
      position: fixed; inset: 0; z-index: 9998;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: #a3bdd0;
      font-family: 'M PLUS Rounded 1c', system-ui, sans-serif;
    `;
    loadOverlay.innerHTML = `
      <div id="office-loading-label" style="color:#fff; font-size:20px; font-weight:600;
        text-shadow:0 2px 4px rgba(0,0,0,0.3); margin-bottom:18px;">Building office…</div>
      <div style="width:320px; height:24px; background:#222233; border-radius:6px; overflow:hidden;">
        <div id="office-loading-fill" style="width:0%; height:100%; background:#4cb866;
          border-radius:6px; transition:width 0.1s ease;"></div>
      </div>
    `;
    document.body.appendChild(loadOverlay);

    const loadLabel = loadOverlay.querySelector("#office-loading-label") as HTMLDivElement;
    const loadFill = loadOverlay.querySelector("#office-loading-fill") as HTMLDivElement;

    const updateLoadBar = (progress: number, label: string) => {
      loadLabel.textContent = label;
      loadFill.style.width = `${Math.round(progress * 100)}%`;
    };

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
    this.hermes = null;
    this.yukiSeat = null;
    this.seats = [];
    this.extraSpots = [];
    this.monitors = [];
    this.chairs = [];
    this.yukiMonitor = null;
    this.hermesMonitor = null;
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

    // Variables that cross phase boundaries
    let map: Phaser.Tilemaps.Tilemap;
    let walkable: boolean[][];

    // Pre-compute how many door chunks will be needed so the progress bar
    // total is stable from the first frame (avoids glitch when phases are
    // dynamically inserted).
    // doorX = mapW/2, doorY = mapH + TILE_PX (one tile below office)
    // offset = { x: 0, y: mapH }, so ty = floor(TILE_PX / TILE_PX) = 1
    // pcy = floor(1 / CHUNK_SIZE) = 0, so only dy >= 0 chunks are valid
    const doorChunkCount = (() => {
      let count = 0;
      for (let dy = 0; dy <= LOAD_RADIUS; dy++) {
        for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
          count++;
        }
      }
      return count;
    })();

    // Pre-allocate chunk phase slots (filled in by the "world layer" phase)
    const chunkPhases: Array<{ name: string; fn: () => void; skip?: boolean }> = [];
    for (let i = 0; i < doorChunkCount; i++) {
      chunkPhases.push({
        name: `world chunk ${i + 1}/${doorChunkCount}`,
        fn: () => {}, // filled in by "world layer" phase
      });
    }

    const phases: Array<{ name: string; fn: () => void; skip?: boolean }> = [
      {
        name: "textures & animations",
        fn: () => {
          // Procedural textures and animations were created by BootScene and persist
          // in the global TextureManager.  The existence guards make these fast
          // no-ops on first run; they only do work on scene restart.
          generateAllTextures(this);
          this.ensureAllAnimations();
        },
      },
      {
        name: "tilemap & collision",
        fn: () => {
          map = this.make.tilemap({ key: `map-${this.theme}` });
          const tiles = map.addTilesetImage(
            this.theme === "agenthq" ? "agenthq" : "office",
            `tiles-${this.theme}`,
          )!;

          // draw a floor-colored backdrop so empty map tiles aren't white
          const floorColor = this.theme === "agenthq" ? 0x4a6a8a : 0xd4d0c8;
          const bg = this.add.graphics().setDepth(-1);
          bg.fillStyle(floorColor, 1);
          bg.fillRect(0, 0, map.widthInPixels, map.heightInPixels);
          // subtle grid lines for texture
          bg.lineStyle(1, floorColor === 0xd4d0c8 ? 0xc8c4bc : 0x3a5a7a, 0.3);
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
          upgradeWorkshop(this);

          // Remove old clock tile from furniture layer (clock moved to west wall)
          furniture.removeTileAt(6, 1, false);

          // Scan for server rack tiles (GID 35 = tile ID 34) for E-interaction
          this.serverRackTiles = [];
          for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
              const t = furniture.getTileAt(x, y);
              if (t && (t.index === 35 || t.index === 36)) {
                this.serverRackTiles.push({ x, y });
              }
            }
          }

          // walkability grid for NPC pathfinding
          walkable = [];
          for (let y = 0; y < map.height; y++) {
            walkable[y] = [];
            for (let x = 0; x < map.width; x++) {
              const w = walls.getTileAt(x, y);
              const f = furniture.getTileAt(x, y);
              walkable[y][x] = !(w?.properties?.solid || f?.properties?.solid);
            }
          }
          this.grid = new Grid(map.width, map.height, walkable);
        },
      },
      {
        name: "map objects",
        fn: () => {
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
              // Side-view monitor on Yuki's desk — thin profile, screen faces right toward her
              const mx = (obj.x ?? 0) + TILE_PX * 0.35;
              const my = (obj.y ?? 0) - TILE_PX * 0.15;
              const spr = this.add
                .sprite(mx, my, MONITOR_SIDE_TEX, "0")
                .setDepth(10 + (obj.y ?? 0) - 10);
              this.yukiMonitor = spr;
            } else if (obj.name === "hermes-seat") {
              this.hermesSeat = { x: tx, y: ty };
            } else if (obj.name === "hermes-monitor") {
              // Side-view monitor on Hermes's desk — thin profile, screen faces left toward him
              const mx = (obj.x ?? 0) - TILE_PX * 0.35;
              const my = (obj.y ?? 0) - TILE_PX * 0.15;
              const spr = this.add
                .sprite(mx, my, MONITOR_SIDE_TEX, "0")
                .setDepth(10 + (obj.y ?? 0) - 10)
                .setFlipX(true);
              this.hermesMonitor = spr;
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
              spr.setInteractive({ useHandCursor: true });
              spr.on("pointerdown", () => this.openAgentViewModal(idx));
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

          // Hermes — right-facing chair at the mail room desk
          if (this.hermesSeat) {
            const hcx = this.hermesSeat.x * TILE_PX + TILE_PX / 2;
            const hcy = this.hermesSeat.y * TILE_PX + TILE_PX / 2;
            this.add
              .sprite(hcx, hcy, CHAIR_TEX_RIGHT)
              .setDepth(5 + this.hermesSeat.y * TILE_PX + 1);

            this.hermes = new HermesNPC(this, this.grid, this.hermesSeat, (clicked) =>
              this.store.select(clicked),
            );
          }

          // standing spots for agents hired beyond the 8 desks — stable order so
          // every client agrees on who stands where
          for (let y = 3; y < map.height - 2 && this.extraSpots.length < 96; y++) {
            for (let x = 2; x < map.width - 2; x++) {
              if (!walkable[y][x] || (x + y) % 3 !== 0) continue;
              if (this.seats.some((s) => s && s.x === x && s.y === y)) continue;
              if (this.yukiSeat && this.yukiSeat.x === x && this.yukiSeat.y === y) continue;
              if (this.hermesSeat && this.hermesSeat.x === x && this.hermesSeat.y === y) continue;
              this.extraSpots.push({ x, y });
            }
          }
        },
      },
      {
        name: "player & UI",
        fn: () => {
          // Generate boss texture from player appearance (if set)
          this.refreshBossTexture();

          // the boss (you) — spawn at last known position if available
          const myPresence = this._myUserId ? this.store.roomPlayers.get(this._myUserId) : null;
          const spawnX = myPresence?.x ?? feetOf(this.spawnTile).x;
          const spawnY = myPresence?.y ?? feetOf(this.spawnTile).y;
          this.player = this.add.sprite(spawnX, spawnY, this.playerTexKey, 0)
            .setOrigin(0.5, 1)
            .setScale(1);
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
          this.drawProjector();
          this.drawPhoneBooth();
          this.drawScreenShareStation();
          this.drawClock();
          this.drawTrophyCase();
          this.drawHallOfFameBoard();
          this.drawExteriorChimney();
          this.drawHelipad();
          this.drawRedButton();
          this.drawWardrobe();
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
          this.projectorControlHint = this.makeHint();
          this.projectorSpeakerHint = this.makeHint();
          this.vendingHint = this.makeHint();
          this.sofaHint = this.makeHint();
          this.filingHint = this.makeHint();
          this.plantHint = this.makeHint();
          this.trophyHint = this.makeHint();
          this.hallOfFameHint = this.makeHint();
          this.serverRackHint = this.makeHint();
          this.warTableHint = this.makeHint();
          this.scrapBinHint = this.makeHint();
          this.radioHint = this.makeHint();
          this.workbenchHint = this.makeHint();
          this.researchHint = this.makeHint();
          this.mailboxHint = this.makeHint();
          this.platformMailboxHint = this.makeHint();
          this.redButtonHint = this.makeHint();
          this.wardrobeHint = this.makeHint();
          this.projectorHint = this.makeHint();
          this.phoneBoothHint = this.makeHint();
          this.screenShareHint = this.makeHint();
          this.allHints = [
            this.boardHint, this.coffeeHint, this.fridgeHint, this.coolerHint,
            this.clockHint, this.vendingHint, this.sofaHint, this.filingHint,
            this.plantHint, this.mailboxHint, this.platformMailboxHint,
            this.redButtonHint, this.wardrobeHint, this.projectorHint,
            this.projectorControlHint, this.projectorSpeakerHint,
            this.phoneBoothHint, this.screenShareHint, this.trophyHint,
            this.hallOfFameHint, this.serverRackHint, this.warTableHint,
            this.scrapBinHint, this.radioHint, this.workbenchHint,
            this.researchHint,
          ];
        },
      },
      {
        name: "interactables",
        fn: () => {
          // Set interactable tile positions based on theme
          this.setupInteractables();

          // Initialize platform mailboxes in the mail room
          const mailRoomY = 13;
          this.platformMailboxes = PLATFORM_CONFIG.map((cfg) => ({
            platform: cfg.platform,
            color: cfg.color,
            colorLight: Phaser.Display.Color.IntegerToColor(cfg.color).lighten(20).color,
            colorDark: Phaser.Display.Color.IntegerToColor(cfg.color).darken(20).color,
            tile: { x: cfg.tile.x, y: mailRoomY },
            flagUp: false,
            pendingCount: 0,
            lastMessage: "",
          }));
          this.platformMailboxGfx = this.add.graphics().setDepth(6);
          this.drawPlatformMailboxes();
        },
      },
      {
        name: "world layer",
        fn: () => {
          this.sceneStart = this.time.now;

          this.mapPx = { w: map.widthInPixels, h: map.heightInPixels };
          // world layer — infinite procedural world outside the office
          this.world = new WorldLayer(this, this.store, this.game.registry.get("net"), map.widthInPixels, map.heightInPixels);
          this.world.setOfficeGrid(this.grid);

          // Immediately request all door chunks from the background worker so
          // generation runs in parallel with the per-chunk phases below.  By the
          // time each phase fires, the worker will likely have already computed
          // the tile data — the phase only needs to render (GPU work).
          const doorChunks = this.world.getDoorChunkList();
          this.world.preGenerateChunks(doorChunks);

          // Check if all door chunks already have cached canvas textures.
          // If so, load them all in a single phase and skip the rest — this
          // makes re-entering a lobby near-instant instead of showing N
          // "Building world chunk…" phases.
          const allCached = doorChunks.every(c =>
            this.textures.exists(`chunk-rt-${this.store.worldSeed}:${c.cx},${c.cy}`),
          );

          if (allCached) {
            chunkPhases[0].name = `cached chunks (×${doorChunks.length})`;
            chunkPhases[0].fn = () => {
              for (const c of doorChunks) this.world.loadSingleChunk(c.cx, c.cy);
            };
            for (let i = 1; i < chunkPhases.length; i++) {
              chunkPhases[i].skip = true;
            }
          } else {
            // Fill in the pre-allocated chunk phase slots with actual chunk data
            for (let i = 0; i < doorChunks.length && i < chunkPhases.length; i++) {
              const c = doorChunks[i];
              chunkPhases[i].fn = () => {
                this.world.loadSingleChunk(c.cx, c.cy);
              };
            }
          }
        },
      },
      ...chunkPhases,
      {
        name: "world cleanup & vfx",
        fn: () => {
          this.world.finishDoorPreload();

          // Warm up the particle system so the first biome ambient doesn't cause a
          // stutter.  The first ParticleEmitter render compiles WebGL shaders and
          // allocates GPU buffers.  We create the emitter now and let it render for
          // a few frames (during the loading screen) before destroying it — the
          // compiled shader stays cached in Phaser's shader manager.
          this.world.vfx.startAmbient("meadow");
          this.time.delayedCall(200, () => this.world.vfx.stopAmbient());
        },
      },
      {
        name: "lighting & input",
        fn: () => {
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

          const onResize = () => {
            cam.setZoom(this.bestZoom());
            this.drawVignette();
            if (this.dayNightTint) this.dayNightTint.setSize(this.scale.width, this.scale.height);
            if (this.brightnessBoost) this.brightnessBoost.setSize(this.scale.width, this.scale.height);
          };
          this.scale.on("resize", onResize);
          this.events.once("shutdown", () => this.scale.off("resize", onResize));

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
            this.lastRoomId = this.store.roomId;
            this.store.subscribe(() => {
              if (!this.ready) {
                console.log("[scene] store emit but scene not ready — skipping syncAgents");
                return;
              }
              // Room changed — restart scene with appropriate theme
              if (this.store.roomId !== this.lastRoomId) {
                console.log(`[scene] room changed: ${this.lastRoomId} → ${this.store.roomId}`);
                this.lastRoomId = this.store.roomId;
                this.ready = false;
                this.remotePlayers.clear();
                this.scene.restart();
                return;
              }
              console.log("[scene] store emit fired — calling syncAgents. agents in store:", [...this.store.agents.keys()]);
              if (this.store.roomId === null) return; // room_state not yet received — skip theme check
              const isHq2 = this.store.roomId === "hq2" || this.store.isOrgRoom;
              const desiredTheme = isHq2 ? "agenthq" : (this.store.settings.game.theme === "agenthq" ? "agenthq" : "classic");
              if (desiredTheme !== this.theme) {
                console.log("[scene] theme changed — restarting scene");
                if (desiredTheme === "agenthq") achievements.unlock("agenthq_mode");
                this.ready = false;
                this.remotePlayers.clear();
                this.scene.restart();
                return;
              }
              // refresh boss texture if player appearance changed
              const prevKey = this.playerTexKey;
              const regenerated = this.refreshBossTexture();
              if ((regenerated || prevKey !== this.playerTexKey) && this.player) {
                this.player.setTexture(this.playerTexKey, 0).setScale(1);
              }
              this.syncAgents();
              this.world.syncGhosts();
              this.updateChimneySmoke();
            });
            this.store.onHuddle((agentIds) => {
              if (this.ready) this.startHuddle(agentIds);
            });
            this.store.onHelicopter((delivery) => {
              if (this.ready && !this.heliActive) this.triggerHelicopter(delivery);
            });
            this.store.onAssembly((agentIds) => {
              if (this.ready) this.startAssembly(agentIds);
            });
            this.store.onNpcState((npcId, x, y, dir, state) => {
              if (!this.ready || this.store.roomId === "hq2") return;
              if (npcId === YUKI_ID) this.yuki?.remoteUpdate(x, y, dir, state);
              else if (npcId === HERMES_ID) this.hermes?.remoteUpdate(x, y, dir, state);
            });
            this.store.onTileUpdated((cx, cy, tileIndex, tile) => {
              if (!this.ready) return;
              this.world.applyRemoteTileUpdate(cx, cy, tileIndex, tile);
            });
            this.store.onEmote((agentId, emote) => {
              if (!this.ready) return;
              const npc = this.npcs.get(agentId);
              if (npc) npc.showEmote(emote);
            });
            this.store.onAgentChat((fromId, _toId, _fromName, _toName, _text) => {
              if (!this.ready) return;
              const npc = this.npcs.get(fromId);
              if (npc) npc.showEmote("💬", 4000);
            });
          }
          this.ready = true;

          // If room_state arrived while scene was loading, restart to match
          if (this.store.roomId !== this.lastRoomId) {
            console.log(`[scene] ready but room mismatch: lastRoomId=${this.lastRoomId} store.roomId=${this.store.roomId} — restarting`);
            this.lastRoomId = this.store.roomId;
            this.ready = false;
            this.remotePlayers.clear();
            this.scene.restart();
            return;
          }

          // Theme consistency check: room_state may have arrived during the
          // phased init (before the store listener was wired), so lastRoomId
          // already matches but the theme was set from a null roomId default
          // to "agenthq".  Restart if the current room requires a different theme.
          if (this.store.roomId !== null) {
            const isHq2 = this.store.roomId === "hq2" || this.store.isOrgRoom;
            const desiredTheme = isHq2 ? "agenthq" : (this.store.settings.game.theme === "agenthq" ? "agenthq" : "classic");
            if (desiredTheme !== this.theme) {
              console.log(`[scene] ready but theme mismatch: theme=${this.theme} desired=${desiredTheme} (roomId=${this.store.roomId}) — restarting`);
              this.ready = false;
              this.remotePlayers.clear();
              this.scene.restart();
              return;
            }
          }

          // Sync player position from room_state if it arrived after sprite creation
          if (this._myUserId) {
            const me = this.store.roomPlayers.get(this._myUserId);
            if (me && this.player) {
              this.player.setPosition(me.x, me.y);
            }
          }

          // Refresh boss texture now that scene is ready — the snapshot
          // (carrying player.appearance) may have arrived during scene init,
          // before the store subscriber was active (guarded by this.ready).
          const prevKey = this.playerTexKey;
          const regenerated = this.refreshBossTexture();
          if ((regenerated || prevKey !== this.playerTexKey) && this.player) {
            this.player.setTexture(this.playerTexKey, 0).setScale(1);
          }

          this.syncAgents();
          this.world.syncGhosts();

          // Diagnostic: verify NPC state after init
          console.log(`[scene] INIT COMPLETE: yuki=${!!this.yuki} hermes=${!!this.hermes} yukiSeat=${JSON.stringify(this.yukiSeat)} hermesSeat=${JSON.stringify(this.hermesSeat)} npcs=${this.npcs.size} store.agents=${this.store.agents.size} ready=${this.ready}`);

          // Fade in from black so the transition from BootScene is seamless.
          this.cameras.main.fadeIn(400, 0, 0, 0);

          // Clean up loading overlay
          loadOverlay.remove();
        },
      },
    ];

    // Process phases one per frame so the loading bar visibly progresses.
    // All phases (including per-chunk slots) are pre-allocated, so the total
    // is stable from the first frame — no progress bar glitches.
    let phaseIndex = 0;
    const totalPhases = phases.length;

    const processNextPhase = () => {
      if (phaseIndex >= phases.length) {
        // All phases done — clean up loading overlay regardless of crashes
        document.getElementById("office-loading")?.remove();
        return;
      }

      const phase = phases[phaseIndex];

      // Skip phases marked as skip (e.g. cached chunk phases) — process
      // them instantly without a frame delay.
      if (phase.skip) {
        phaseIndex++;
        processNextPhase();
        return;
      }

      const progress = phaseIndex / totalPhases;
      updateLoadBar(progress, `Building ${phase.name}…`);

      // Run the phase on the next frame so the bar update renders first
      this.time.delayedCall(0, () => {
        try {
          phase.fn();
        } catch (err) {
          console.error(`[scene] PHASE "${phase.name}" CRASHED:`, err);
        }
        phaseIndex++;
        updateLoadBar(phaseIndex / totalPhases, `Done: ${phase.name}`);
        this.time.delayedCall(0, processNextPhase);
      });
    };

    // Start processing on the next frame
    this.time.delayedCall(0, processNextPhase);

    // Safety net: remove loading overlay after 20s no matter what
    this.time.delayedCall(20000, () => {
      const ov = document.getElementById("office-loading");
      if (ov) {
        console.warn("[scene] loading overlay still present after 20s — force removing");
        ov.remove();
      }
    });
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

    // matrix rain overlay for working monitors
    this.updateMatrixRain(time);
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

  /** Emergency stop — all agents line up in an organized column by the entrance. */
  private startAssembly(agentIds: string[]): void {
    const door = this.doorTile;
    // Line up in two columns flanking the door, moving inward from the entrance
    const spots: Tile[] = [];
    for (let i = 0; i < 16; i++) {
      const col = i % 2 === 0 ? -1 : 2; // left and right of door
      const row = Math.floor(i / 2);
      const t = { x: door.x + col, y: door.y - row - 1 };
      if (this.grid.ok(t.x, t.y)) spots.push(t);
    }
    agentIds.forEach((id, i) => {
      const npc = this.npcs.get(id);
      const spot = spots[i % Math.max(spots.length, 1)];
      if (npc && spot) npc.assemble(spot, this.time.now);
    });
  }

  private bestZoom(): number {
    // zoom up until the office covers the whole viewport — the camera
    // follows the boss, so overflow just means you walk to see the rest
    const z = Math.max(this.scale.width / this.mapPx.w, this.scale.height / this.mapPx.h);
    // On narrow touch screens, don't over-zoom — cap at a reasonable level
    // so the pixel art doesn't get too large and the player sees enough context
    if (isTouchDevice() && Math.min(this.scale.width, this.scale.height) < 480) {
      return Math.max(1, Math.min(z, 1.0));
    }
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
    if (this.theme === "agenthq") {
      this.clockTile = { x: 1, y: 3 };
      this.projectorControlTile = { x: 6, y: 1 };
      this.projectorSpeakerTile = { x: 7, y: 1 };
      this.vendingTile = null;
      this.sofaTile = { x: 23, y: 13 };
      this.hallOfFameTile = { x: 1, y: 5 };
      this.wardrobeTile = { x: 21, y: 18 };
      this.filingTiles = [
        { x: 20, y: 3 },
        { x: 20, y: 4 }, { x: 22, y: 11 },
        { x: 10, y: 16 }, { x: 10, y: 17 },
      ];
      this.plantTiles = [
        { x: 1, y: 9 }, { x: 12, y: 18 }, { x: 20, y: 2 }, { x: 28, y: 7 },
        { x: 29, y: 13 },
        { x: 16, y: 18 }, { x: 27, y: 11 }, { x: 6, y: 17 },
      ];
    } else {
      this.clockTile = { x: 1, y: 3 };
      this.projectorControlTile = { x: 6, y: 1 };
      this.projectorSpeakerTile = { x: 7, y: 1 };
      this.vendingTile = null;
      this.sofaTile = { x: 23, y: 13 };
      this.hallOfFameTile = { x: 1, y: 5 };
      this.wardrobeTile = { x: 21, y: 18 };
      this.filingTiles = [
        { x: 20, y: 3 },
        { x: 20, y: 4 }, { x: 22, y: 11 },
        { x: 10, y: 16 }, { x: 10, y: 17 },
      ];
      this.plantTiles = [
        { x: 1, y: 9 }, { x: 12, y: 18 }, { x: 20, y: 2 }, { x: 28, y: 7 },
        { x: 29, y: 13 },
        { x: 16, y: 18 }, { x: 27, y: 11 }, { x: 6, y: 17 },
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

  /** Try interacting with a platform mailbox. Returns true if an interaction fired. */
  private tryPlatformMailboxInteract(): boolean {
    let nearest: PlatformMailbox | null = null;
    let nearestDist = Infinity;
    for (const mb of this.platformMailboxes) {
      const mbPx = { x: mb.tile.x * TILE_PX + TILE_PX / 2, y: mb.tile.y * TILE_PX + TILE_PX / 2 };
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, mbPx.x, mbPx.y);
      if (d < 100 && d < nearestDist) {
        nearest = mb;
        nearestDist = d;
      }
    }
    if (!nearest) return false;
    const mbPx = { x: nearest.tile.x * TILE_PX + TILE_PX / 2, y: nearest.tile.y * TILE_PX + TILE_PX / 2 };
    if (nearest.flagUp && nearest.lastMessage) {
      this.store.toast(`[${nearest.platform}] ${nearest.lastMessage}`);
      nearest.flagUp = false;
      nearest.pendingCount = 0;
      this.drawPlatformMailboxes();
      this.world.vfx.sparkBurst(mbPx.x, mbPx.y, nearest.color, 8, 50);
      this.world.audio.uiClick();
    } else {
      this.store.toast(`[${nearest.platform}] No new messages.`);
    }
    return true;
  }

  /** Try interacting with any new office object. Returns true if an interaction fired. */
  private tryOfficeInteract(time: number): boolean {
    // Projector control panel — cycle channels
    const ctrlPx = { x: this.projectorControlTile.x * TILE_PX + 32, y: this.projectorControlTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, ctrlPx.x, ctrlPx.y) < 80) {
      const net = this.game.registry.get("net") as import("../net").Net;
      const channels = OfficeScene.PROJECTOR_CHANNELS;
      const curIdx = channels.findIndex(c => c.id === this.store.projectorChannel);
      const nextIdx = curIdx + 1 >= channels.length ? -1 : curIdx + 1;
      const next = nextIdx === -1 ? "off" : channels[nextIdx].id;
      net.send({ type: "projector_set_channel", channel: next });
      this.world?.audio.uiClick();
      return true;
    }

    // Projector speaker — toggle mute
    const spkPx = { x: this.projectorSpeakerTile.x * TILE_PX + 32, y: this.projectorSpeakerTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, spkPx.x, spkPx.y) < 80) {
      this.projectorMuted = !this.projectorMuted;
      // Send mute/unmute command via YouTube IFrame postMessage API (no reload)
      if (this.projectorIframe?.contentWindow) {
        const cmd = this.projectorMuted ? "mute" : "unMute";
        this.projectorIframe.contentWindow.postMessage(
          JSON.stringify({ event: "command", func: cmd, args: [] }),
          "*",
        );
      }
      this.store.toast(this.projectorMuted ? "Projector muted" : "Projector unmuted");
      this.world?.audio.uiClick();
      return true;
    }

    // Projector screen — cycle channels (also possible directly at screen)
    const projPx = { x: this.projectorTile.x * TILE_PX + 32, y: this.projectorTile.y * TILE_PX - 100 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, projPx.x, projPx.y) < 200) {
      const net = this.game.registry.get("net") as import("../net").Net;
      const channels = OfficeScene.PROJECTOR_CHANNELS;
      const curIdx = channels.findIndex(c => c.id === this.store.projectorChannel);
      const nextIdx = curIdx + 1 >= channels.length ? -1 : curIdx + 1; // -1 means "off"
      const next = nextIdx === -1 ? "off" : channels[nextIdx].id;
      net.send({ type: "projector_set_channel", channel: next });
      this.world?.audio.uiClick();
      return true;
    }

    // Screen share station — start/stop screen sharing
    const ssPx = { x: this.screenShareTile.x * TILE_PX + 32, y: this.screenShareTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, ssPx.x, ssPx.y) < 120) {
      if (this.screenShare?.sharing) {
        this.screenShare.stopSharing();
        this.detachScreenShareVideo();
        this.store.toast("Screen share stopped.");
      } else {
        this.screenShare?.startSharing().then(() => {
          const localStream = this.screenShare?.localStream;
          if (localStream) {
            this.attachScreenShareVideo(localStream);
          }
          this.store.toast("Sharing your screen to the projector!");
        }).catch(() => {
          this.store.toast("Screen share permission denied.");
        });
      }
      this.world?.audio.uiClick();
      return true;
    }

    // Phone booth — start/stop webcam broadcast
    const boothPx = { x: this.phoneBoothTile.x * TILE_PX + 32, y: this.phoneBoothTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, boothPx.x, boothPx.y) < 120) {
      if (this.webcam?.broadcasting) {
        this.webcam.stopBroadcasting();
        this.inPhoneBooth = false;
        if (this.player) this.player.setVisible(true);
        if (this.webcamPresenterId === this._myUserId) {
          this.webcamPresenterId = null;
          this.webcamPresenterName = null;
        }
        this.detachWebcamVideo();
        this.store.toast("Webcam broadcast stopped.");
      } else {
        if (this.webcamPresenterId && this.webcamPresenterId !== this._myUserId) {
          this.store.toast(`${this.webcamPresenterName ?? "Someone"} is already broadcasting.`);
          return true;
        }
        this.webcam?.startBroadcasting().then(() => {
          this.inPhoneBooth = true;
          if (this.player) this.player.setVisible(false);
          // Show broadcaster's own camera on the projector
          const localStream = this.webcam?.localStream;
          if (localStream) {
            this.webcamPresenterId = this._myUserId;
            this.webcamPresenterName = this.store.player?.name ?? "You";
            this.attachWebcamVideo(localStream);
          }
          this.store.toast("ON AIR — webcam broadcasting to projector!");
        }).catch(() => {
          this.store.toast("Camera access denied. Check browser permissions.");
        });
      }
      this.world?.audio.uiClick();
      return true;
    }

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

    // Wardrobe — change appearance
    const wdPx = { x: this.wardrobeTile.x * TILE_PX + 32, y: this.wardrobeTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, wdPx.x, wdPx.y) < 144) {
      this.store.toggleWardrobe(true);
      this.world.audio.uiClick();
      return true;
    }

    // ── Expedition Workshop (before plants — plants at (26,16) overlap war table) ──
    const wtPx = { x: this.warTableTile.x * TILE_PX + 32, y: this.warTableTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, wtPx.x, wtPx.y) < 144) {
      this.store.toast("The war table is empty. No expedition being planned.");
      this.world.audio.uiClick();
      return true;
    }

    const sbPx = { x: this.scrapBinTile.x * TILE_PX + 32, y: this.scrapBinTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, sbPx.x, sbPx.y) < 144) {
      this.store.toast("Scrap pool: 0. Not enough for any robot tier.");
      this.world.audio.uiClick();
      return true;
    }

    const rdPx = { x: this.radioTile.x * TILE_PX + 32, y: this.radioTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, rdPx.x, rdPx.y) < 144) {
      this.store.toast("The radio is silent. No robot deployed.");
      this.world.audio.uiClick();
      return true;
    }

    const wbPx = { x: this.workbenchTile.x * TILE_PX + 32, y: this.workbenchTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, wbPx.x, wbPx.y) < 144) {
      this.store.toast("The workbench is clear. No robot in production.");
      this.world.audio.uiClick();
      return true;
    }

    const rsPx = { x: this.researchTile.x * TILE_PX + 32, y: this.researchTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, rsPx.x, rsPx.y) < 144) {
      this.store.toast("Knowledge level: 0. No expedition data yet.");
      this.world.audio.uiClick();
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

    // Platform mailboxes are handled in tryPlatformMailboxInteract() which is
    // called earlier in the E-press chain, before server racks.

    // Red Button — EMERGENCY STOP: cease all agent work and assemble by entrance
    const rbPx = { x: this.redButtonTile.x * TILE_PX + 32, y: this.redButtonTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, rbPx.x, rbPx.y) < 160) {
      if (time < this.redButtonUntil) {
        this.store.toast("The button is cooling down.");
      } else {
        this.redButtonUntil = time + 10000;
        const net = this.game.registry.get("net") as import("../net").Net;
        net.send({ type: "stop_all" });
        this.world?.audio.uiClick();
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

  /** Update proximity hints — show only the closest interactable. */
  private updateAllHints(time: number): void {
    interface Candidate {
      hint: Phaser.GameObjects.Text;
      dist: number;
      label: string;
      hx: number;
      hy: number;
    }
    const candidates: Candidate[] = [];
    const add = (
      hint: Phaser.GameObjects.Text,
      cx: number, cy: number, radius: number,
      label: string, hx: number, hy: number,
    ): void => {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, cx, cy);
      if (dist < radius) candidates.push({ hint, dist, label, hx, hy });
    };

    // Board
    if (!this.store.boardOpen) {
      const px = { x: this.boardTile.x * TILE_PX + 32, y: this.boardTile.y * TILE_PX + 52 };
      add(this.boardHint, px.x, px.y, 160, "E: TASK BOARD", px.x, px.y + 64);
    }

    // Coffee
    {
      const px = { x: this.coffeeTile.x * TILE_PX + 32, y: this.coffeeTile.y * TILE_PX + 32 };
      add(this.coffeeHint, px.x, px.y, 144, time < this.coffeeUntil ? "E: REFILL" : "E: GRAB COFFEE", px.x, px.y + 64);
    }

    // Fridge
    {
      const px = { x: this.fridgeTile.x * TILE_PX + 32, y: this.fridgeTile.y * TILE_PX + 32 };
      add(this.fridgeHint, px.x, px.y, 144, time < this.fridgeUntil ? "E: RESTOCKING..." : "E: SNACK", px.x, px.y + 64);
    }

    // Water Cooler
    {
      const px = { x: this.coolerTile.x * TILE_PX + 32, y: this.coolerTile.y * TILE_PX + 32 };
      add(this.coolerHint, px.x, px.y, 144, time < this.coolerUntil ? "E: ..." : "E: GOSSIP", px.x, px.y + 64);
    }

    // Clock
    {
      const px = { x: this.clockTile.x * TILE_PX + 32, y: this.clockTile.y * TILE_PX + 32 };
      add(this.clockHint, px.x, px.y, 160, "E: CHECK TIME", px.x, px.y + 48);
    }

    // Vending
    if (this.vendingTile) {
      const px = { x: this.vendingTile.x * TILE_PX + 32, y: this.vendingTile.y * TILE_PX + 32 };
      add(this.vendingHint, px.x, px.y, 144, time < this.vendingUntil ? "E: RESTOCKING..." : "E: BUY SNACK", px.x, px.y + 64);
    }

    // Sofa
    if (this.sofaTile) {
      const px = { x: this.sofaTile.x * TILE_PX + 32, y: this.sofaTile.y * TILE_PX + 32 };
      add(this.sofaHint, px.x, px.y, 144, time < this.sofaUntil ? "E: ALREADY RESTED" : "E: POWER NAP", px.x, px.y + 64);
    }

    // Filing — check nearest
    {
      const near = this.nearestTile(this.filingTiles, 144);
      if (near) {
        const px = { x: near.x * TILE_PX + 32, y: near.y * TILE_PX + 32 };
        add(this.filingHint, px.x, px.y, 144, time < this.filingUntil ? "E: BROWSING..." : "E: BROWSE FILES", px.x, px.y + 64);
      }
    }

    // Wardrobe
    {
      const px = { x: this.wardrobeTile.x * TILE_PX + 32, y: this.wardrobeTile.y * TILE_PX + 32 };
      add(this.wardrobeHint, px.x, px.y, 144, "E: WARDROBE", px.x, px.y + 64);
    }

    // War Table
    {
      const px = { x: this.warTableTile.x * TILE_PX + 32, y: this.warTableTile.y * TILE_PX + 32 };
      add(this.warTableHint, px.x, px.y, 144, "E: WAR TABLE", px.x, px.y + 64);
    }

    // Scrap Bin
    {
      const px = { x: this.scrapBinTile.x * TILE_PX + 32, y: this.scrapBinTile.y * TILE_PX + 32 };
      add(this.scrapBinHint, px.x, px.y, 144, "E: SCRAP BIN", px.x, px.y + 64);
    }

    // Radio
    {
      const px = { x: this.radioTile.x * TILE_PX + 32, y: this.radioTile.y * TILE_PX + 32 };
      add(this.radioHint, px.x, px.y, 144, "E: RADIO", px.x, px.y + 64);
    }

    // Workbench
    {
      const px = { x: this.workbenchTile.x * TILE_PX + 32, y: this.workbenchTile.y * TILE_PX + 32 };
      add(this.workbenchHint, px.x, px.y, 144, "E: WORKBENCH", px.x, px.y + 64);
    }

    // Research
    {
      const px = { x: this.researchTile.x * TILE_PX + 32, y: this.researchTile.y * TILE_PX + 32 };
      add(this.researchHint, px.x, px.y, 144, "E: RESEARCH", px.x, px.y + 64);
    }

    // Plants — check nearest
    {
      const near = this.nearestTile(this.plantTiles, 144);
      if (near) {
        const px = { x: near.x * TILE_PX + 32, y: near.y * TILE_PX + 32 };
        const label = time < this.plantUntil ? "E: BOOSTED!" : time < this.plantCooldownUntil ? "E: STILL MOIST" : "E: WATER PLANTS";
        add(this.plantHint, px.x, px.y, 144, label, px.x, px.y + 64);
      }
    }

    // Mailbox
    add(this.mailboxHint, this.mailboxPx.x, this.mailboxPx.y, 120, this.mailboxHasMail ? "E: CHECK MAIL" : "E: EMPTY", this.mailboxPx.x, this.mailboxPx.y + 64);

    // Platform mailboxes (mail room)
    {
      let nearestPm: PlatformMailbox | null = null;
      let nearestPmDist = Infinity;
      for (const pm of this.platformMailboxes) {
        const pmPx = { x: pm.tile.x * TILE_PX + TILE_PX / 2, y: pm.tile.y * TILE_PX + TILE_PX / 2 };
        const pmDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, pmPx.x, pmPx.y);
        if (pmDist < 100 && pmDist < nearestPmDist) {
          nearestPm = pm;
          nearestPmDist = pmDist;
        }
      }
      if (nearestPm) {
        const pmPx = { x: nearestPm.tile.x * TILE_PX + TILE_PX / 2, y: nearestPm.tile.y * TILE_PX + TILE_PX / 2 };
        const label = nearestPm.flagUp ? `E: CHECK ${nearestPm.platform.toUpperCase()}` : "E: EMPTY";
        add(this.platformMailboxHint, pmPx.x, pmPx.y, 100, label, pmPx.x, pmPx.y + 64);
      }
    }

    // Red Button
    {
      const px = { x: this.redButtonTile.x * TILE_PX + 32, y: this.redButtonTile.y * TILE_PX + 32 };
      add(this.redButtonHint, px.x, px.y, 160, time < this.redButtonUntil ? "E: COOLING" : "E: STOP!", px.x, px.y + 64);
    }

    // Projector control panel + screen (share channel label computation)
    {
      const ch = this.store.projectorChannel;
      const channels = OfficeScene.PROJECTOR_CHANNELS;
      const curIdx = channels.findIndex(c => c.id === ch);
      const nextIdx = curIdx + 1 >= channels.length ? -1 : curIdx + 1;
      const nextLabel = nextIdx === -1 ? "OFF" : channels[nextIdx].label;
      const chLabel = ch === "off" ? `E: ${channels[0].label}` : `E: ${nextLabel}`;

      const ctrlPx = { x: this.projectorControlTile.x * TILE_PX + 32, y: this.projectorControlTile.y * TILE_PX + 32 };
      add(this.projectorControlHint, ctrlPx.x, ctrlPx.y, 80, chLabel, ctrlPx.x, ctrlPx.y + 48);

      const projPx = { x: this.projectorTile.x * TILE_PX + 32, y: this.projectorTile.y * TILE_PX - 100 };
      add(this.projectorHint, projPx.x, projPx.y, 200, chLabel, projPx.x, projPx.y + 64);
    }

    // Projector speaker (mute/unmute)
    {
      const px = { x: this.projectorSpeakerTile.x * TILE_PX + 32, y: this.projectorSpeakerTile.y * TILE_PX + 32 };
      add(this.projectorSpeakerHint, px.x, px.y, 80, this.projectorMuted ? "E: UNMUTE" : "E: MUTE", px.x, px.y + 48);
    }

    // Phone booth
    {
      const px = { x: this.phoneBoothTile.x * TILE_PX + 32, y: this.phoneBoothTile.y * TILE_PX + 32 };
      let label: string;
      if (this.webcam?.broadcasting) {
        label = "E: STOP BROADCAST";
      } else if (this.webcamPresenterId && this.webcamPresenterId !== this._myUserId) {
        label = `OCCUPIED: ${this.webcamPresenterName ?? ""}`;
      } else {
        label = "E: START WEBCAM";
      }
      add(this.phoneBoothHint, px.x, px.y, 120, label, px.x, px.y + 56);
    }

    // Screen share station
    {
      const px = { x: this.screenShareTile.x * TILE_PX + 32, y: this.screenShareTile.y * TILE_PX + 32 };
      const label = this.screenShare?.sharing ? "E: STOP SHARE" : "E: SHARE SCREEN";
      add(this.screenShareHint, px.x, px.y, 120, label, px.x, px.y + 48);
    }

    // Trophy case
    if (!this.store.achievementsOpen) {
      const px = { x: this.trophyTile.x * TILE_PX + 32, y: this.trophyTile.y * TILE_PX + 68 };
      add(this.trophyHint, px.x, px.y, 120, "E: TROPHY CASE", px.x, px.y + 64);
    }

    // Hall of fame bulletin board
    if (!this.store.hallOfFameOpen) {
      const px = { x: this.hallOfFameTile.x * TILE_PX + 10, y: this.hallOfFameTile.y * TILE_PX + 32 };
      add(this.hallOfFameHint, px.x, px.y, 120, "E: HALL OF FAME", px.x + 48, px.y);
    }

    // Server rack
    if (!this.store.railwayPanelOpen) {
      const near = this.nearestTile(this.serverRackTiles, 150);
      if (near) {
        const px = { x: near.x * TILE_PX + 32, y: near.y * TILE_PX + 32 };
        add(this.serverRackHint, px.x, px.y, 150, "E: CHECK SERVERS", px.x, near.y * TILE_PX - 8);
      }
    }

    // Hide all, then show only the closest
    for (const h of this.allHints) h.setVisible(false);
    let best: Candidate | null = null;
    for (const c of candidates) {
      if (!best || c.dist < best.dist) best = c;
    }
    if (best) {
      best.hint.setPosition(best.hx, best.hy).setText(hintLabel(best.label)).setVisible(true);
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
    const mbBlue = 0x2a5cb8;
    const mbBlueLi = 0x3a78d8;
    const mbBlueDk = 0x1a4090;
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

  /** Draw the 6 platform mailboxes along the north wall of the mail room. */
  private drawPlatformMailboxes(): void {
    const g = this.platformMailboxGfx;
    g.clear();
    for (const mb of this.platformMailboxes) {
      const px = mb.tile.x * TILE_PX + TILE_PX / 2;
      const py = mb.tile.y * TILE_PX + TILE_PX / 2;
      // ground shadow
      g.fillStyle(0x000000, 0.2);
      g.fillEllipse(px, py + 28, 28, 6);
      // post
      g.fillStyle(0x6a4a2a, 1);
      g.fillRect(px - 3, py + 12, 6, 18);
      g.fillStyle(0x4a3a1a, 1);
      g.fillRect(px + 1, py + 12, 2, 18);
      // mailbox body — platform-colored, rounded top
      const w = 28, h = 26;
      g.fillStyle(mb.colorDark, 1);
      g.fillRoundedRect(px - w / 2, py - h / 2 - 2, w, h, 5);
      g.fillStyle(mb.color, 1);
      g.fillRoundedRect(px - w / 2 + 1, py - h / 2 - 1, w - 2, h - 2, 4);
      // top highlight
      g.fillStyle(mb.colorLight, 1);
      g.fillRoundedRect(px - w / 2 + 2, py - h / 2, w - 4, 6, 3);
      g.fillStyle(0xffffff, 0.1);
      g.fillRoundedRect(px - w / 2 + 3, py - h / 2 + 1, w - 6, 2, 1);
      // mail slot
      g.fillStyle(0x0a0a14, 1);
      g.fillRoundedRect(px - 9, py - 4, 18, 4, 2);
      // platform label plate
      g.fillStyle(0xe8e4d0, 1);
      g.fillRoundedRect(px - 10, py + 2, 20, 7, 1);
      g.fillStyle(0x33373d, 1);
      const label = mb.platform.slice(0, 4);
      for (let i = 0; i < label.length; i++) {
        g.fillRect(px - 8 + i * 4, py + 4, 3, 1);
        g.fillRect(px - 8 + i * 4, py + 6, 2, 1);
      }
      // red flag — up when mail pending, down when empty
      if (mb.flagUp) {
        g.fillStyle(0xc83030, 1);
        g.fillRect(px + 12, py - 12, 2, 12);
        g.fillRect(px + 12, py - 12, 8, 3);
        g.fillStyle(0xe84848, 1);
        g.fillRect(px + 13, py - 11, 1, 10);
        g.fillRect(px + 13, py - 11, 6, 1);
        // pending count badge
        if (mb.pendingCount > 0) {
          g.fillStyle(0xff4444, 1);
          g.fillCircle(px + 16, py - 14, 5);
          g.fillStyle(0xffffff, 1);
          g.fillRect(px + 14, py - 15, 4, 1);
          g.fillRect(px + 15, py - 16, 2, 3);
        }
      } else {
        g.fillStyle(0xc83030, 1);
        g.fillRect(px + 12, py - 2, 2, 10);
        g.fillRect(px + 12, py + 6, 8, 3);
        g.fillStyle(0xe84848, 1);
        g.fillRect(px + 13, py - 1, 1, 8);
        g.fillRect(px + 13, py + 7, 6, 1);
      }
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

  /** Draw a wardrobe cabinet in the break room for changing your appearance. */
  private drawWardrobe(): void {
    this.wardrobeGfx = this.add.graphics().setDepth(3);
    const g = this.wardrobeGfx;
    const bx = this.wardrobeTile.x * TILE_PX;
    const by = this.wardrobeTile.y * TILE_PX;

    // shadow
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(bx + 32, by + 60, 52, 10);

    // body — dark wood
    g.fillStyle(0x4a3528, 1);
    g.fillRoundedRect(bx + 6, by + 4, 52, 56, 4);
    g.fillStyle(0x5a4232, 1);
    g.fillRoundedRect(bx + 8, by + 6, 48, 52, 3);

    // left door
    g.fillStyle(0x6a4a38, 1);
    g.fillRoundedRect(bx + 10, by + 8, 22, 48, 2);
    g.fillStyle(0x7a5a48, 1);
    g.fillRect(bx + 11, by + 9, 20, 6);

    // right door
    g.fillStyle(0x6a4a38, 1);
    g.fillRoundedRect(bx + 34, by + 8, 22, 48, 2);
    g.fillStyle(0x7a5a48, 1);
    g.fillRect(bx + 35, by + 9, 20, 6);

    // door handles
    g.fillStyle(0xc0a050, 1);
    g.fillCircle(bx + 30, by + 32, 2);
    g.fillCircle(bx + 36, by + 32, 2);

    // top molding
    g.fillStyle(0x3a2818, 1);
    g.fillRoundedRect(bx + 4, by + 2, 56, 6, 2);

    // mirror on left door
    g.fillStyle(0x88aacc, 0.35);
    g.fillRoundedRect(bx + 12, by + 16, 18, 24, 2);
    g.fillStyle(0xffffff, 0.15);
    g.fillRect(bx + 13, by + 17, 16, 3);
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
  private triggerHelicopter(delivery?: HelicopterDelivery): void {
    this.heliActive = true;
    this.heliDelivery = delivery ?? null;
    const agentName = delivery?.name ?? "Agent";
    this.store.toast(`Helicopter summoned! ${agentName} incoming...`);
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

    // Generate a custom texture from the delivery's appearance so the
    // cosmetic sprite matches the real NPC that syncAgents() will create.
    let agentKey = "char-heli-delivery";
    if (this.heliDelivery?.appearance) {
      generateCharTexture(this, agentKey, this.heliDelivery.appearance);
      this.ensureCharAnimations(agentKey);
    } else {
      // No custom appearance — fall back to a pre-generated character spritesheet.
      const spriteIdx = this.heliDelivery?.sprite ?? 0;
      agentKey = `char-${spriteIdx}`;
    }
    const label = this.add
      .text(0, -108, this.heliDelivery?.name ?? "AGENT", {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "16px",
        color: "#1d2126",
        stroke: "#f4f6f8",
        strokeThickness: 3,
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setScale(0.7);

    const sprite = this.add
      .sprite(0, 0, agentKey, 6)
      .setOrigin(0.5, 1)
      .setScale(1);

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
        // agent emerges from elevator — send hire message now so the server
        // creates the agent and broadcasts it back. syncAgents() will replace
        // this cosmetic sprite with the real NPC seamlessly.
        if (this.heliDelivery) {
          const net = this.game.registry.get("net") as import("../net").Net;
          net.send({
            type: "hire",
            name: this.heliDelivery.name,
            provider: "cline",
            model: this.heliDelivery.model,
            systemPrompt: this.heliDelivery.systemPrompt,
            role: "worker",
            appearance: this.heliDelivery.appearance,
            mcpServers: this.heliDelivery.mcpServers,
          });
        }
        if (this.heliAgent && sprite.active) {
          this.heliAgent.setPosition(exitX, exitY);
          this.heliAgent.setVisible(true);
          this.heliAgent.setDepth(10 + exitY);
          sprite.play(`${agentKey}-idle-down`);
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

    // agent fades out quickly — the real NPC replaces it via syncAgents()
    this.time.delayedCall(2000, () => {
      this.endHelicopter();
    });
  }

  /** Animate helicopter rotor while active. */
  private updateHelicopter(time: number): void {
    if (this.heliRotor) {
      this.heliRotor.rotation = time * 0.04;
    }
  }

  /** Tear down all helicopter cosmetic state.  Called either from
   *  syncAgents (when the real NPC arrives) or from heliTakeoff's
   *  delayed call (fallback if the server is slow to confirm). */
  private endHelicopter(): void {
    console.log("[heli] endHelicopter called — tearing down cosmetic sprite");
    this.heliAgent?.destroy();
    this.heliAgent = null;
    this.heliElevatorGfx?.destroy();
    this.heliElevatorGfx = null;
    this.heliActive = false;
    this.heliDelivery = null;
  }

  /** Draw the projector screen frame on the top-left wall. */
  private drawProjector(): void {
    const px = this.projectorTile.x * TILE_PX + 32;
    const py = this.projectorTile.y * TILE_PX - 100;
    const sw = 480;
    const sh = 288;

    this.projectorGfx = this.add.graphics().setDepth(3);
    // outer frame
    this.projectorGfx.fillStyle(0x1a2838, 1);
    this.projectorGfx.fillRoundedRect(px - sw / 2 - 6, py - sh / 2 - 6, sw + 12, sh + 12, 6);
    // inner bezel
    this.projectorGfx.fillStyle(0x2a3848, 1);
    this.projectorGfx.fillRoundedRect(px - sw / 2 - 4, py - sh / 2 - 4, sw + 8, sh + 8, 5);
    // screen surface (dark when off)
    this.projectorGfx.fillStyle(0x0a0a12, 1);
    this.projectorGfx.fillRoundedRect(px - sw / 2, py - sh / 2, sw, sh, 3);

    // Draw control panel and speaker next to projector
    this.drawProjectorControlPanel();
    this.drawProjectorSpeaker();
  }

  /** Draw a wall-mounted TV control panel for channel selection. */
  private drawProjectorControlPanel(): void {
    const px = this.projectorControlTile.x * TILE_PX + 32;
    const py = this.projectorControlTile.y * TILE_PX + 32;
    this.projectorControlGfx = this.add.graphics().setDepth(3);

    // mounting plate
    this.projectorControlGfx.fillStyle(0x1a2838, 1);
    this.projectorControlGfx.fillRoundedRect(px - 20, py - 16, 40, 32, 4);
    this.projectorControlGfx.fillStyle(0x2a3848, 1);
    this.projectorControlGfx.fillRoundedRect(px - 18, py - 14, 36, 28, 3);

    // small screen display
    this.projectorControlGfx.fillStyle(0x0a0a12, 1);
    this.projectorControlGfx.fillRoundedRect(px - 14, py - 10, 28, 12, 2);
    // screen text indicator (channel label drawn as colored dot)
    this.projectorControlGfx.fillStyle(0x4acb4a, 1);
    this.projectorControlGfx.fillCircle(px - 8, py - 4, 2);

    // channel buttons (3 small buttons)
    const btnColors = [0x666666, 0xe74c3c, 0x3498db];
    for (let i = 0; i < 3; i++) {
      const bx = px - 12 + i * 12;
      this.projectorControlGfx.fillStyle(btnColors[i], 1);
      this.projectorControlGfx.fillRoundedRect(bx, py + 4, 8, 6, 1);
    }

    // screws
    this.projectorControlGfx.fillStyle(0x555555, 1);
    this.projectorControlGfx.fillCircle(px - 15, py - 12, 1.5);
    this.projectorControlGfx.fillCircle(px + 15, py - 12, 1.5);
    this.projectorControlGfx.fillCircle(px - 15, py + 12, 1.5);
    this.projectorControlGfx.fillCircle(px + 15, py + 12, 1.5);
  }

  /** Draw a wall-mounted speaker for mute/unmute control. */
  private drawProjectorSpeaker(): void {
    const px = this.projectorSpeakerTile.x * TILE_PX + 32;
    const py = this.projectorSpeakerTile.y * TILE_PX + 32;
    this.projectorSpeakerGfx = this.add.graphics().setDepth(3);

    // mounting plate
    this.projectorSpeakerGfx.fillStyle(0x1a2838, 1);
    this.projectorSpeakerGfx.fillRoundedRect(px - 16, py - 16, 32, 32, 4);
    this.projectorSpeakerGfx.fillStyle(0x2a3848, 1);
    this.projectorSpeakerGfx.fillRoundedRect(px - 14, py - 14, 28, 28, 3);

    // speaker cone (outer ring)
    this.projectorSpeakerGfx.fillStyle(0x0a0a12, 1);
    this.projectorSpeakerGfx.fillCircle(px, py, 10);
    // speaker cone (inner)
    this.projectorSpeakerGfx.fillStyle(0x1a1a2a, 1);
    this.projectorSpeakerGfx.fillCircle(px, py, 8);
    // speaker dust cap
    this.projectorSpeakerGfx.fillStyle(0x2a2a3a, 1);
    this.projectorSpeakerGfx.fillCircle(px, py, 4);
    // highlight
    this.projectorSpeakerGfx.fillStyle(0x3a3a4a, 0.5);
    this.projectorSpeakerGfx.fillCircle(px - 1, py - 1, 2);

    // screws
    this.projectorSpeakerGfx.fillStyle(0x555555, 1);
    this.projectorSpeakerGfx.fillCircle(px - 11, py - 11, 1.5);
    this.projectorSpeakerGfx.fillCircle(px + 11, py - 11, 1.5);
    this.projectorSpeakerGfx.fillCircle(px - 11, py + 11, 1.5);
    this.projectorSpeakerGfx.fillCircle(px + 11, py + 11, 1.5);
  }

  /** Draw a wall-mounted clock at the new location near the chimney. */
  private drawClock(): void {
    const px = this.clockTile.x * TILE_PX + 32;
    const py = this.clockTile.y * TILE_PX + 32;
    const g = this.add.graphics().setDepth(3);

    // mounting plate
    g.fillStyle(0x1a2838, 1);
    g.fillRoundedRect(px - 18, py - 18, 36, 36, 4);
    g.fillStyle(0x2a3848, 1);
    g.fillRoundedRect(px - 16, py - 16, 32, 32, 3);

    // clock face
    g.fillStyle(0xf5f0e0, 1);
    g.fillCircle(px, py, 12);
    g.fillStyle(0x0a0a12, 1);
    g.lineStyle(1.5, 0x0a0a12, 1);
    g.strokeCircle(px, py, 12);

    // hour ticks
    g.fillStyle(0x333333, 1);
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const r1 = 10;
      g.fillCircle(
        px + Math.cos(angle) * r1,
        py + Math.sin(angle) * r1,
        i % 3 === 0 ? 1.5 : 1,
      );
    }

    // hour hand
    g.lineStyle(2, 0x333333, 1);
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px + 4, py - 6);
    g.strokePath();

    // minute hand
    g.lineStyle(1.5, 0x555555, 1);
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px + 8, py - 2);
    g.strokePath();

    // center dot
    g.fillStyle(0x333333, 1);
    g.fillCircle(px, py, 1.5);
  }

  /** Update the YouTube IFrame overlay to match the projector screen position. */
  private updateProjectorVideo(): void {
    const channel = this.store.projectorChannel;
    const cam = this.cameras.main;
    const px = this.projectorTile.x * TILE_PX + 32;
    const py = this.projectorTile.y * TILE_PX - 100;
    const sw = 480;
    const sh = 288;

    // If webcam or screen share video is active, hide YouTube iframe
    const hasWebcam = !!this.webcamVideoEl && this.webcamVideoEl.style.display !== "none";
    const hasScreenShare = !!this.screenShareVideoEl && this.screenShareVideoEl.style.display !== "none";
    if (hasWebcam || hasScreenShare) {
      if (this.projectorIframe) this.projectorIframe.style.display = "none";
      return;
    }

    // Find the config for the current channel
    const ch = OfficeScene.PROJECTOR_CHANNELS.find(c => c.id === channel);
    const videoId = ch?.videoId ?? null;
    const embedUrl = ch?.embedUrl ?? null;

    // Agent channel — hide YouTube iframe, agent frames drawn on canvas
    if (channel === "agent") {
      if (this.projectorIframe) {
        this.projectorIframe.src = "about:blank";
        this.projectorIframe.style.display = "none";
      }
      this.projectorVideoId = null;
      this.projectorEmbedUrl = null;
      return;
    }

    // Channel is off or unknown — stop video and hide iframe
    if (!videoId && !embedUrl) {
      if (this.projectorIframe) {
        this.projectorIframe.src = "about:blank";
        this.projectorIframe.style.display = "none";
      }
      this.projectorVideoId = null;
      this.projectorEmbedUrl = null;
      this.hideProjectorAgentFrame();
      return;
    }

    // Create iframe if it doesn't exist
    if (!this.projectorIframe) {
      this.projectorIframe = document.createElement("iframe");
      this.projectorIframe.style.cssText = `
        position: fixed;
        border: none;
        pointer-events: none;
        z-index: 50;
        border-radius: 3px;
        display: none;
      `;
      this.projectorIframe.allow = "autoplay; encrypted-media";
      this.projectorIframe.setAttribute("frameborder", "0");
      document.body.appendChild(this.projectorIframe);
    }

    // YouTube video channel
    if (videoId) {
      if (this.projectorVideoId !== videoId) {
        this.projectorVideoId = videoId;
        this.projectorEmbedUrl = null;
        this.hideProjectorAgentFrame();
        const muteParam = this.projectorMuted ? 1 : 0;
        this.projectorIframe.src =
          `https://www.youtube.com/embed/${videoId}` +
          `?autoplay=1&loop=1&playlist=${videoId}&controls=0&mute=${muteParam}&modestbranding=1&showinfo=0&rel=0&iv_load_policy=3&enablejsapi=1`;
      }
    } else if (embedUrl) {
      // TradingView or other embed URL
      if (this.projectorEmbedUrl !== embedUrl) {
        this.projectorEmbedUrl = embedUrl;
        this.projectorVideoId = null;
        this.hideProjectorAgentFrame();
        this.projectorIframe.src = embedUrl;
      }
    }

    // Convert world position to screen position using canvas bounding rect
    const canvas = this.game.canvas.getBoundingClientRect();
    const screenX = canvas.left + (px - cam.scrollX) * cam.zoom - (sw * cam.zoom) / 2;
    const screenY = canvas.top + (py - cam.scrollY) * cam.zoom - (sh * cam.zoom) / 2;
    const screenW = sw * cam.zoom;
    const screenH = sh * cam.zoom;

    this.projectorIframe.style.left = `${screenX}px`;
    this.projectorIframe.style.top = `${screenY}px`;
    this.projectorIframe.style.width = `${screenW}px`;
    this.projectorIframe.style.height = `${screenH}px`;
    this.projectorIframe.style.display = "block";
  }

  /** Clean up the projector iframe and video overlays on scene shutdown. */
  private destroyProjectorVideo(): void {
    if (this.projectorIframe) {
      this.projectorIframe.remove();
      this.projectorIframe = null;
      this.projectorVideoId = null;
    }
    if (this.webcamVideoEl) {
      this.webcamVideoEl.remove();
      this.webcamVideoEl = null;
    }
    if (this.screenShareVideoEl) {
      this.screenShareVideoEl.remove();
      this.screenShareVideoEl = null;
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

    const tx = this.trophyTile.x * TILE_PX + 57; // offset for x=1.9 visual position
    const ty = this.trophyTile.y * TILE_PX - 56;
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

  /** Draw a cork-board bulletin board hanging on the south wall — the Hall of Fame. */
  private drawHallOfFameBoard(): void {
    this.hallOfFameGfx = this.add.graphics().setDepth(3);
    const g = this.hallOfFameGfx;

    // Board hangs on the west wall, portrait orientation,
    // centered vertically on the hallOfFameTile row, just right of the wall.
    const bx = this.hallOfFameTile.x * TILE_PX + 10; // just off the west wall
    const by = this.hallOfFameTile.y * TILE_PX + 32;
    const bw = 48;
    const bh = 84;

    // Drop shadow
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(bx - bw / 2 + 3, by - bh / 2 + 4, bw, bh, 3);

    // Wooden frame
    g.fillStyle(0x4a3220, 1);
    g.fillRoundedRect(bx - bw / 2 - 4, by - bh / 2 - 4, bw + 8, bh + 8, 5);
    g.fillStyle(0x5a4030, 1);
    g.fillRoundedRect(bx - bw / 2 - 2, by - bh / 2 - 2, bw + 4, bh + 4, 4);

    // Cork surface
    g.fillStyle(0xcba872, 1);
    g.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 3);

    // Cork texture
    g.fillStyle(0xb8985f, 0.4);
    for (let i = 0; i < 30; i++) {
      const dx = bx - bw / 2 + 4 + Math.random() * (bw - 8);
      const dy = by - bh / 2 + 4 + Math.random() * (bh - 8);
      g.fillCircle(dx, dy, 0.8 + Math.random() * 0.8);
    }

    // Title strip at top
    g.fillStyle(0x2a3848, 0.9);
    g.fillRoundedRect(bx - bw / 2 + 3, by - bh / 2 + 3, bw - 6, 12, 2);

    // Gold star
    g.fillStyle(0xffd700, 1);
    g.fillCircle(bx - bw / 2 + 9, by - bh / 2 + 9, 2.5);

    // Mounting nails at left side (attached to wall)
    g.fillStyle(0x888890, 1);
    g.fillCircle(bx - bw / 2 - 6, by - bh / 2 + 4, 1.5);
    g.fillCircle(bx - bw / 2 - 6, by + bh / 2 - 4, 1.5);
    g.fillStyle(0xcccccc, 0.6);
    g.fillCircle(bx - bw / 2 - 6.5, by - bh / 2 + 3.5, 0.7);
    g.fillCircle(bx - bw / 2 - 6.5, by + bh / 2 - 4.5, 0.7);

    // Pinned photos — 3 small polaroid cards arranged vertically
    const photoColors = [0xc44a4a, 0x3a7cb5, 0x3d9152];
    const photoSpacing = 24;
    const photoStartY = by - bh / 2 + 20;
    for (let i = 0; i < photoColors.length; i++) {
      const py = photoStartY + i * photoSpacing;
      g.fillStyle(0xf8f6f0, 1);
      g.fillRoundedRect(bx - 9, py - 8, 18, 22, 1);
      g.fillStyle(photoColors[i], 1);
      g.fillRect(bx - 7, py - 6, 14, 12);
      g.fillStyle(0xd44a4a, 1);
      g.fillCircle(bx, py - 10, 2);
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(bx - 0.8, py - 10.8, 0.8);
    }
  }

  /** Draw the industrial chimney on the exterior left wall, extending above the roof. */
  private drawExteriorChimney(): void {
    this.chimneyGfx = this.add.graphics().setDepth(1);
    const g = this.chimneyGfx;

    // Chimney sits outside the left wall (x < 64), extending above the roof down to server room
    const wallFace = TILE_PX;        // left wall outer edge at x=64
    const chimW = 28;                 // chimney width at the shaft
    const chimX = wallFace - chimW - 6; // 6px gap from wall
    const roofY = 0;                  // top of building / roof line
    const chimTopY = -52;             // chimney extends 52px above the roof
    const baseY = 14 * TILE_PX;       // server room level

    // Brick body — tapered from base to top
    const baseW = chimW + 8;
    const topW = chimW;

    // Drop shadow on the wall (only the part at/below roof level)
    g.fillStyle(0x000000, 0.2);
    g.fillRect(chimX + 4, roofY, chimW, baseY - roofY);

    // Main brick body — from baseY up to chimTopY (above the roof)
    g.fillStyle(0x4a3328, 1);
    g.beginPath();
    g.moveTo(chimX - 4, baseY);
    g.lineTo(chimX + baseW - 4, baseY);
    g.lineTo(chimX + baseW - 4 - 4, chimTopY + 8);
    g.lineTo(chimX + 4, chimTopY + 8);
    g.closePath();
    g.fillPath();

    // Lighter brick highlight on left side
    g.fillStyle(0x5a4030, 1);
    g.beginPath();
    g.moveTo(chimX - 4, baseY);
    g.lineTo(chimX + 6, baseY);
    g.lineTo(chimX + 6 - 2, chimTopY + 8);
    g.lineTo(chimX + 4, chimTopY + 8);
    g.closePath();
    g.fillPath();

    // Darker shadow on right side
    g.fillStyle(0x3a2820, 1);
    g.beginPath();
    g.moveTo(chimX + baseW - 10, baseY);
    g.lineTo(chimX + baseW - 4, baseY);
    g.lineTo(chimX + baseW - 4 - 4, chimTopY + 8);
    g.lineTo(chimX + baseW - 10 - 3, chimTopY + 8);
    g.closePath();
    g.fillPath();

    // Brick mortar lines — horizontal
    g.lineStyle(1, 0x2a1a12, 0.5);
    for (let y = chimTopY + 16; y < baseY; y += 12) {
      const t = (y - chimTopY) / (baseY - chimTopY);
      const w = baseW - 4 - t * 8;
      const xL = chimX - 4 + (baseW - 4 - w) / 2;
      g.beginPath();
      g.moveTo(xL, y);
      g.lineTo(xL + w, y);
      g.strokePath();
    }

    // Brick mortar lines — vertical (staggered)
    for (let row = 0; row < Math.floor((baseY - chimTopY) / 12); row++) {
      const y = chimTopY + 16 + row * 12;
      const t = (y - chimTopY) / (baseY - chimTopY);
      const w = baseW - 4 - t * 8;
      const xL = chimX - 4 + (baseW - 4 - w) / 2;
      const offset = row % 2 === 0 ? 0 : w / 6;
      for (let bx = 0; bx < 5; bx++) {
        const vx = xL + offset + bx * (w / 5);
        if (vx < xL + w) {
          g.beginPath();
          g.moveTo(vx, y);
          g.lineTo(vx, y + 12);
          g.strokePath();
        }
      }
    }

    // --- Chimney cap (the part above the roof that makes it look like a chimney) ---

    // Corbelled brick course just above roof line (wider than shaft)
    const corbelW = topW + 10;
    const corbelX = chimX + (baseW - 4 - corbelW) / 2 - 3;
    g.fillStyle(0x4a3328, 1);
    g.fillRect(corbelX, roofY - 6, corbelW, 6);
    // corbel highlight/shadow
    g.fillStyle(0x5a4030, 1);
    g.fillRect(corbelX, roofY - 6, corbelW, 2);
    g.fillStyle(0x3a2820, 1);
    g.fillRect(corbelX, roofY - 1, corbelW, 1);

    // Concrete cap — wide slab on top of the shaft
    const capW = topW + 12;
    const capH = 10;
    const capX = chimX + (baseW - 4 - capW) / 2 - 4;
    const capY = chimTopY;
    g.fillStyle(0x6a6058, 1);
    g.fillRect(capX, capY, capW, capH);
    // cap bevel — top highlight
    g.fillStyle(0x8a8078, 1);
    g.fillRect(capX, capY, capW, 2);
    // cap bevel — bottom shadow
    g.fillStyle(0x4a4038, 1);
    g.fillRect(capX, capY + capH - 2, capW, 2);
    // cap left/right edges
    g.fillStyle(0x5a5048, 1);
    g.fillRect(capX, capY, 2, capH);
    g.fillRect(capX + capW - 2, capY, 2, capH);

    // Brick shaft between cap and corbel (the part above the roof, below the cap)
    const shaftTopY = capY + capH;
    const shaftBotY = roofY - 6;
    g.fillStyle(0x4a3328, 1);
    g.fillRect(chimX - 2, shaftTopY, topW + 4, shaftBotY - shaftTopY);
    // shaft highlight on left
    g.fillStyle(0x5a4030, 1);
    g.fillRect(chimX - 2, shaftTopY, 4, shaftBotY - shaftTopY);
    // shaft shadow on right
    g.fillStyle(0x3a2820, 1);
    g.fillRect(chimX + topW - 2, shaftTopY, 4, shaftBotY - shaftTopY);
    // a couple mortar lines on the exposed shaft
    g.lineStyle(1, 0x2a1a12, 0.5);
    for (let y = shaftTopY + 8; y < shaftBotY; y += 10) {
      g.beginPath();
      g.moveTo(chimX - 2, y);
      g.lineTo(chimX + topW + 2, y);
      g.strokePath();
    }

    // Dark opening at top (where smoke comes out) — recessed into the cap
    const openW = topW - 4;
    const openX = chimX + (topW - openW) / 2;
    g.fillStyle(0x0a0608, 1);
    g.fillRect(openX, capY + 2, openW, 5);

    // Inner heat shimmer
    g.fillStyle(0xff6600, 0.12);
    g.fillRect(openX + 1, capY + 2, openW - 2, 3);

    // Store the smoke position above the chimney cap
    this.chimneyPositions = [{ x: openX + openW / 2, y: capY - 2 }];
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

    const sheets = ["boss", "char-yuki", "char-hermes", ...Array.from({ length: 8 }, (_, i) => `char-${i}`)];
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

/** Generate or refresh the boss texture from the player's appearance.
   * Returns true if the texture was regenerated (caller should refresh the sprite). */
  private refreshBossTexture(): boolean {
    const ap = this.store.player?.appearance;
    if (ap) {
      const key = "boss-custom";
      // Only regenerate if the texture doesn't exist yet or appearance changed
      const existing = this.textures.get(key);
      if (!existing || (this as any)._lastBossAp !== ap) {
        (this as any)._lastBossAp = ap;
        generateCharTexture(this, key, ap);
        this.ensureCharAnimations(key);
        this.playerTexKey = key;
        return true;
      }
      this.playerTexKey = key;
      return false;
    } else {
      this.playerTexKey = "boss";
      return false;
    }
  }

  private syncAgents(): void {
    console.log(`[syncAgents] store.agents=${this.store.agents.size} npcs=${this.npcs.size} heliActive=${this.heliActive} ready=${this.ready}`);
    for (const [id, info] of this.store.agents) {
      if (id === YUKI_ID) {
        this.yuki?.sync(info);
        continue;
      }
      if (id === HERMES_ID) {
        this.hermes?.sync(info);
        continue;
      }
      const existing = this.npcs.get(id);
      if (existing) {
        existing.sync(info);
      } else {
        console.log(`[syncAgents] NEW agent detected: id=${id} name=${info.name} desk=${info.deskIndex} appearance=${!!info.appearance}`);
        // If the helicopter cinematic is still playing, tear it down — the
        // real NPC replaces the cosmetic sprite immediately.
        if (this.heliActive) this.endHelicopter();
        // Generate custom texture if agent has an appearance
        if (info.appearance) {
          const key = agentTextureKey(info);
          console.log(`[syncAgents] generating char texture: key=${key}`);
          generateCharTexture(this, key, info.appearance);
          this.ensureCharAnimations(key);
        }
        const overflow = info.deskIndex - this.seats.length;
        const seat =
          this.seats[info.deskIndex] ??
          this.extraSpots[overflow % Math.max(this.extraSpots.length, 1)] ??
          this.spawnTile;
        // When delivered via helicopter, spawn at the elevator exit (top of
        // office) instead of the front door.
        const spawnTile = this.heliActive ? { x: 14, y: 3 } : this.doorTile;
        const npc = new AgentNPC(this, this.grid, info, spawnTile, seat, (clicked) =>
          this.store.select(clicked),
        );
        this.npcs.set(id, npc);
        console.log(`[syncAgents] created NPC for ${info.name} (${id}) at desk ${info.deskIndex} — total NPCs: ${this.npcs.size}`);
      }
    }
    for (const [id, npc] of this.npcs) {
      if (!this.store.agents.has(id)) {
        console.log(`[syncAgents] DESTROYING NPC ${id} — not in store.agents!`);
        npc.destroy();
        this.npcs.delete(id);
      }
    }
    // monitors glow whenever someone's at the desk — working or just typing;
    // they only go dark during the post-task break (done/error linger)
    this.monitors.forEach((m, i) => {
      const agent = [...this.store.agents.values()].find((a) => a.deskIndex === i);
      if (!agent) {
        // Unassigned desk — black screen
        m?.setFrame("2").clearTint();
      } else if (agent.status === "idle") {
        // Assigned but idle — code editor look
        m?.setFrame("0").clearTint();
      } else {
        // Working — lit with status color (matrix overlay drawn in update)
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

    // Hermes's monitor — always on
    if (this.hermesMonitor) {
      this.hermesMonitor.setFrame("1");
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
    if (!this.ready) return;
    // cap dt so a lag spike (chunk gen, GC, tab switch) doesn't cause a
    // teleport-length step that tunnels through collision
    dt = Math.min(dt, 100);
    // typing in a HUD field? the game keyboard is yours, not the boss's
    const active = document.activeElement?.tagName;
    const typing = active === "INPUT" || active === "TEXTAREA" || active === "SELECT";
    if (typing) {
      this.player.play(`${this.playerTexKey}-idle-${this.playerDir}`, true);
      for (const npc of this.npcs.values()) npc.update(time, dt, this.store.settings.game.idleWander, this.player.x, this.player.y);
      const myRoleTyping = this._myUserId ? this.store.roomPlayers.get(this._myUserId)?.role : undefined;
      const isVisitorTyping = (myRoleTyping === "member" || myRoleTyping === "guest") && this.store.roomId !== "hq2";
      if (!isVisitorTyping) {
        this.yuki?.update(time, dt, false, this.player.x, this.player.y);
        this.hermes?.update(time, dt);
      }
      const sel = this.store.selectedId ? this.npcs.get(this.store.selectedId) : null;
      const selYuki = this.store.selectedId === YUKI_ID ? this.yuki : null;
      const selHermes = this.store.selectedId === HERMES_ID ? this.hermes : null;
      this.selectRing.setVisible(!!(sel || selYuki || selHermes));
      if (sel) this.selectRing.setPosition(sel.container.x, sel.container.y + 1);
      else if (selYuki) this.selectRing.setPosition(selYuki.container.x, selYuki.container.y + 1);
      else if (selHermes) this.selectRing.setPosition(selHermes.container.x, selHermes.container.y + 1);
      return;
    }

    // --- player movement ---
    let vx = 0;
    let vy = 0;
    const outside = this.world.isOutside(this.player.x, this.player.y);
    // If broadcasting from phone booth, lock player in place
    if (this.inPhoneBooth) {
      const boothPx = { x: this.phoneBoothTile.x * TILE_PX + 32, y: this.phoneBoothTile.y * TILE_PX + 32 };
      this.player.setPosition(boothPx.x, boothPx.y);
      this.player.setVisible(false);
      this.player.play(`${this.playerTexKey}-idle-${this.playerDir}`, true);
      // skip movement but still update NPCs and other systems
    } else {
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const up = this.cursors.up.isDown || this.keys.W.isDown;
    const down = this.cursors.down.isDown || this.keys.S.isDown;
    vx = (right ? 1 : 0) - (left ? 1 : 0);
    vy = (down ? 1 : 0) - (up ? 1 : 0);

    // Touch joystick input — analog values from -1 to 1
    if (touchInput.moveX !== 0 || touchInput.moveY !== 0) {
      vx = touchInput.moveX;
      vy = touchInput.moveY;
    }

    if (vx !== 0 && vy !== 0 && (left || right || up || down)) {
      vx *= 0.7071;
      vy *= 0.7071;
    }

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
    } // end else (not in phone booth)

    // E: grab coffee, talk to the nearest agent, open the task board, or recruit a ghost
    let ePressed = Phaser.Input.Keyboard.JustDown(this.keys.E);
    if (touchInput.action === "interact") {
      ePressed = true;
      touchInput.action = null;
    }
    if (ePressed) {
      // trophy case check — before other interactables
      const trophyPx = { x: this.trophyTile.x * TILE_PX + 32, y: this.trophyTile.y * TILE_PX + 40 };
      const trophyDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, trophyPx.x, trophyPx.y);
      // hall of fame bulletin board — west wall, above trophy case
      const hofPx = { x: this.hallOfFameTile.x * TILE_PX + 10, y: this.hallOfFameTile.y * TILE_PX + 32 };
      const hofDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, hofPx.x, hofPx.y);
      if (trophyDist < 120) {
        this.store.toggleAchievements();
      } else if (hofDist < 120) {
        this.store.toggleHallOfFame();
      } else
      // platform mailboxes — check before server racks since they overlap in the mail room
      if (this.tryPlatformMailboxInteract()) {
        // handled
      } else
      // server rack — query Railway data
      if (this.nearestTile(this.serverRackTiles, 150)) {
        const net = this.game.registry.get("net") as Net;
        net.send({ type: "railway_query" });
        this.store.toast("Querying Railway...");
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
          // also check Hermes
          if (this.hermes) {
            const d = Phaser.Math.Distance.Between(
              this.player.x,
              this.player.y,
              this.hermes.container.x,
              this.hermes.container.y,
            );
            if (d < 144 && (!best || d < best.d)) best = { id: HERMES_ID, d };
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

    // --- projector screen video overlay ---
    this.updateProjectorVideo();
    this.updateProjectorVideoOverlays();

    // --- agents ---
    for (const npc of this.npcs.values()) npc.update(time, dt, this.store.settings.game.idleWander, this.player.x, this.player.y);
    // Run Yuki/Hermes state machine unless we're a visitor in someone else's private office
    const myRole = this._myUserId ? this.store.roomPlayers.get(this._myUserId)?.role : undefined;
    const isVisitor = (myRole === "member" || myRole === "guest") && this.store.roomId !== "hq2";
    if (!isVisitor) {
      this.yuki?.update(time, dt, false, this.player.x, this.player.y);
      this.hermes?.update(time, dt);
    }

    // selection ring
    const sel = this.store.selectedId ? this.npcs.get(this.store.selectedId) : null;
    const selYuki = this.store.selectedId === YUKI_ID ? this.yuki : null;
    const selHermes = this.store.selectedId === HERMES_ID ? this.hermes : null;
    this.selectRing.setVisible(!!(sel || selYuki || selHermes));
    if (sel) this.selectRing.setPosition(sel.container.x, sel.container.y + 1);
    else if (selYuki) this.selectRing.setPosition(selYuki.container.x, selYuki.container.y + 1);
    else if (selHermes) this.selectRing.setPosition(selHermes.container.x, selHermes.container.y + 1);

    // --- lighting ---
    this.updateLighting(time);

    // --- world layer: chunks, ghosts, compass, recruit ---
    this.registry.set("playerPos", { x: this.player.x, y: this.player.y });
    this.world.update(time, dt, this.player.x, this.player.y, ePressed, vx, vy);
    this.world.vfx.updateSmoke();

    // Q: teleport back to office when outside
    let qPressed = Phaser.Input.Keyboard.JustDown(this.keys.Q);
    if (touchInput.action === "teleport") {
      qPressed = true;
      touchInput.action = null;
    }
    if (outside && qPressed) {
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
      this.registry.remove("teleportTo"); // remove immediately so it doesn't re-trigger next frame
      this.cameras.main.fadeOut(300, 10, 10, 30);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.player.setPosition(teleportTo.x, teleportTo.y);
        this.cameras.main.fadeIn(400, 10, 10, 30);
        this.world.clearDeath(); // re-enable damage now that player is safe
      });
      this.store.toast("You were knocked out and dragged back to the office!");
    }

    // office proximity hints — unified: show only the closest interactable
    if (!outside) {
      this.updateAllHints(time);
    } else {
      for (const h of this.allHints) h.setVisible(false);
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
    // trophy case & hall of fame proximity hints — handled by updateAllHints above

    // ── Multiplayer: send boss position to server (10Hz) ────────────────
    const now = time;
    if (now - this.lastPosSent > 100) {
      const dx = Math.abs(this.player.x - this.lastSentX);
      const dy = Math.abs(this.player.y - this.lastSentY);
      if (dx > 2 || dy > 2 || this.playerDir !== this._lastSentDir) {
        this.net?.send({ type: "player_move", x: this.player.x, y: this.player.y, dir: this.playerDir });
        this.lastSentX = this.player.x;
        this.lastSentY = this.player.y;
        this._lastSentDir = this.playerDir;
      }
      this.lastPosSent = now;
    }

    // ── Multiplayer: sync remote player sprites from store ──────────────
    this.syncRemotePlayers();

    // ── Voice chat: update per-peer volumes and speaking indicators ──────
    if (this.voice?.active && this.player) {
      const isOutdoor = this.world.isOutside(this.player.x, this.player.y);
      this.voice.updateVolumes(this.player.x, this.player.y, this.store.roomPlayers, isOutdoor);
      const speaking = this.voice.getSpeakingPeers();
      for (const [userId, icon] of this.speakingIcons) {
        icon.setVisible(speaking.has(userId));
      }
    }

    // ── Multiplayer: broadcast NPC state (owner only, private rooms only, 5Hz) ──
    const myRoleForNpc = this._myUserId ? this.store.roomPlayers.get(this._myUserId)?.role : undefined;
    const isOwnerForNpc = myRoleForNpc === "owner" && this.store.roomId !== "hq2";
    if (isOwnerForNpc && now - this.lastNpcSyncSent > 200) {
      this.lastNpcSyncSent = now;
      if (this.yuki) {
        const s = this.yuki.getState();
        this.net?.send({ type: "npc_update", npcId: YUKI_ID, ...s });
      }
      if (this.hermes) {
        const s = this.hermes.getState();
        this.net?.send({ type: "npc_update", npcId: HERMES_ID, ...s });
      }
    }
  }

  private _lastSentDir: Dir = "down";
  private lastNpcSyncSent = 0;

  private syncRemotePlayers(): void {
    const storePlayers = this.store.roomPlayers;
    const seen = new Set<string>();

    for (const [userId, p] of storePlayers) {
      // Don't render ourselves
      if (userId === this._myUserId) continue;
      seen.add(userId);

      let entry = this.remotePlayers.get(userId);

      // If the sprite was destroyed (e.g. scene restart), drop the stale entry
      if (entry && !entry.sprite.active) {
        this.remotePlayers.delete(userId);
        entry = undefined;
      }

      // Determine the correct texture key for this player
      let texKey = "boss";
      if (p.appearance) {
        texKey = `remote-${userId}`;
      }

      // If appearance changed, regenerate the texture
      if (entry && p.appearance && JSON.stringify(entry.appearance) !== JSON.stringify(p.appearance)) {
        generateCharTexture(this, texKey, p.appearance);
        this.ensureCharAnimations(texKey);
        entry.appearance = p.appearance;
        entry.texKey = texKey;
        entry.sprite.setTexture(texKey, 0);
      }

      if (!entry) {
        // Generate custom texture if player has an appearance
        if (p.appearance) {
          generateCharTexture(this, texKey, p.appearance);
          this.ensureCharAnimations(texKey);
        }
        const sprite = this.add.sprite(p.x, p.y - 200, texKey, 0)
          .setOrigin(0.5, 1)
          .setScale(1)
          .setAlpha(0)
          .setDepth(10 + p.y);
        const nameBg = this.add.graphics().setAlpha(0);
        const label = this.add
          .text(0, 0, p.name.toUpperCase(), {
            fontFamily: "'M Plus Rounded 1c', sans-serif",
            fontSize: "16px",
            color: "#1d2126",
            stroke: "#f4f6f8",
            strokeThickness: 3,
          })
          .setResolution(4)
          .setOrigin(0.5, 1)
          .setScale(0.7)
          .setAlpha(0)
          .setDepth(10 + p.y + 0.1);
        entry = { sprite, label, nameBg, intro: true, texKey, appearance: p.appearance ?? null };
        this.remotePlayers.set(userId, entry);

        // Speaking indicator (hidden by default, shown when peer is talking)
        const speakIcon = this.add
          .text(0, 0, "🔊", { fontSize: "20px" })
          .setOrigin(0.5, 1)
          .setScale(0.7)
          .setVisible(false)
          .setDepth(10 + p.y + 0.2);
        this.speakingIcons.set(userId, speakIcon);

        // Intro animation: descend from above while cycling through
        // directional profile views (front → side left → back → side right → front)
        // to simulate a 3D spin during the landing.
        const spinDirs: Dir[] = ["down", "left", "up", "right", "down"];
        const introDuration = 1200;
        const stepMs = introDuration / spinDirs.length;
        spinDirs.forEach((dir, i) => {
          this.time.delayedCall(stepMs * i, () => {
            if (entry!.intro) sprite.play(`${texKey}-idle-${dir}`, true);
          });
        });
        // Fade in name label/bg shortly after descent begins
        this.tweens.add({
          targets: [label, nameBg],
          alpha: { from: 0, to: 1 },
          duration: 400,
          delay: 400,
        });
        // Descend + fade in the sprite
        this.tweens.add({
          targets: sprite,
          y: p.y,
          alpha: { from: 0, to: 1 },
          duration: introDuration,
          ease: "Cubic.out",
          onComplete: () => {
            entry!.intro = false;
          },
        });
      }

      // Smoothly interpolate remote player position (skip during intro)
      const target = entry.sprite;
      if (!entry.intro) {
        const lerp = 0.15;
        target.x += (p.x - target.x) * lerp;
        target.y += (p.y - target.y) * lerp;
        target.setDepth(10 + target.y);

        // Play walk/idle animation based on whether they're moving
        const moving = Math.abs(p.x - target.x) > 1 || Math.abs(p.y - target.y) > 1;
        const animKey = `${entry.texKey}-${moving ? "walk" : "idle"}-${p.dir}`;
        if (target.anims.currentAnim?.key !== animKey) {
          target.play(animKey, true);
        }
      }

      // Update name label
      entry.label
        .setPosition(target.x, target.y - 108)
        .setDepth(10 + target.y + 0.1);
      entry.nameBg
        .clear()
        .setPosition(target.x, target.y - 108)
        .setDepth(10 + target.y);

      // Update speaking indicator position
      const speakIcon = this.speakingIcons.get(userId);
      if (speakIcon) {
        speakIcon.setPosition(target.x, target.y - 128).setDepth(10 + target.y + 0.2);
      }
    }

    // Remove sprites for players who left — play exit animation first
    for (const [userId, entry] of this.remotePlayers) {
      if (!seen.has(userId)) {
        this.remotePlayers.delete(userId);
        const { sprite, label, nameBg } = entry;
        // Clean up speaking icon
        const speakIcon = this.speakingIcons.get(userId);
        if (speakIcon) { speakIcon.destroy(); this.speakingIcons.delete(userId); }
        // Disable label/nameBg, fade them out quickly
        this.tweens.add({ targets: [label, nameBg], alpha: 0, duration: 300 });
        // Spin + levitate + fade out
        this.tweens.add({
          targets: sprite,
          y: sprite.y - 200,
          rotation: Math.PI * 6,
          alpha: 0,
          scaleX: 0.3,
          scaleY: 0.3,
          duration: 1200,
          ease: "Quad.in",
          onComplete: () => {
            sprite.destroy();
            label.destroy();
            nameBg.destroy();
          },
        });
      }
    }
  }

  private _myUserId: string | null = null;
  private net: import("../net").Net | null = null;

  // ── Agent screen viewing + projector broadcast ──────────────────────

  /** Open a modal showing a live screenshot feed from an agent's browser. */
  private openAgentViewModal(deskIndex: number): void {
    const agent = [...this.store.agents.values()].find(a => a.deskIndex === deskIndex);
    if (!agent) return;
    this.agentViewAgentId = agent.id;

    // Request screenshot stream from server
    if (this.net) {
      this.net.send({ type: "agent_view_start", agentId: agent.id });
    }

    // Build modal DOM
    const existing = document.getElementById("agent-view-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "agent-view-modal";
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.8); z-index: 1000;
      display: flex; align-items: center; justify-content: center;
    `;
    modal.innerHTML = `
      <div style="background: #1a1a2e; border-radius: 12px; padding: 16px; max-width: 90vw; max-height: 90vh; position: relative;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <div>
            <span style="color: ${agent.accent}; font-weight: bold; font-size: 1.1rem;">${agent.name}</span>
            <span style="color: #888; font-size: 0.8rem; margin-left: 8px;">${agent.status.toUpperCase()}</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="agent-view-broadcast" style="padding: 4px 12px; border: none; border-radius: 6px; background: #2a4a6a; color: #e0e0e0; font-size: 0.8rem; cursor: pointer;">Broadcast to Projector</button>
            <button id="agent-view-close" style="padding: 4px 12px; border: none; border-radius: 6px; background: #333; color: #e0e0e0; font-size: 0.8rem; cursor: pointer;">Close</button>
          </div>
        </div>
        <div id="agent-view-content" style="width: 800px; height: 500px; background: #0a0a12; border-radius: 8px; overflow: hidden;">
          ${this.renderAgentDashboard(agent)}
        </div>
        ${agent.task ? `<div style="color: #888; font-size: 0.75rem; margin-top: 8px;">Task: ${agent.task}</div>` : ""}
      </div>
    `;
    document.body.appendChild(modal);

    // Wire close button
    document.getElementById("agent-view-close")!.addEventListener("click", () => {
      this.closeAgentViewModal();
    });

    // Wire broadcast button
    const broadcastBtn = document.getElementById("agent-view-broadcast")!;
    broadcastBtn.addEventListener("click", () => {
      if (this.agentBroadcastAgentId === agent.id) {
        // Stop broadcasting
        if (this.net) this.net.send({ type: "agent_broadcast_stop" });
        broadcastBtn.textContent = "Broadcast to Projector";
        broadcastBtn.style.background = "#2a4a6a";
      } else {
        // Start broadcasting
        if (this.net) this.net.send({ type: "agent_broadcast_start", agentId: agent.id });
        broadcastBtn.textContent = "Stop Broadcast";
        broadcastBtn.style.background = "#6a2a2a";
      }
    });

    // Update broadcast button state if already broadcasting
    if (this.agentBroadcastAgentId === agent.id) {
      broadcastBtn.textContent = "Stop Broadcast";
      broadcastBtn.style.background = "#6a2a2a";
    }

    // Click outside to close
    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.closeAgentViewModal();
    });
  }

  /** Render an HTML dashboard for an agent — shown when no live screenshot is available. */
  private renderAgentDashboard(agent: AgentInfo): string {
    const statusColor: Record<string, string> = {
      idle: "#888",
      thinking: "#4a8cd4",
      working: "#44cc66",
      done: "#66aa44",
      error: "#cc4444",
    };
    const sc = statusColor[agent.status] ?? "#888";
    const mcpCount = agent.mcpServers?.length ?? 0;
    const moodEmoji: Record<string, string> = {
      content: "😊",
      focused: "🤓",
      bored: "😐",
      frustrated: "😤",
      excited: "🤩",
      anxious: "😰",
      proud: "😎",
    };
    const mood = agent.mood ? (moodEmoji[agent.mood] ?? "🤖") : "🤖";

    // Resolve sprite image for the dashboard header
    let spriteImg: string;
    if (agent.id === YUKI_ID) {
      spriteImg = "assets/characters/char-yuki.png";
    } else if (agent.id === HERMES_ID) {
      spriteImg = "assets/characters/char-hermes.png";
    } else if (agent.appearance) {
      spriteImg = generateCharPreviewDataURL(agent.appearance, 3);
    } else {
      spriteImg = `assets/characters/char-${agent.sprite}.png`;
    }

    // Resolve MCP server icons (from config or catalog fallback)
    const mcpBadges = (agent.mcpServers ?? []).map(s => {
      const icon = s.icon ?? (s.url ? getServerByUrl(s.url)?.icon : undefined);
      const name = s.name ?? s.command ?? "unknown";
      let iconHtml: string;
      if (icon && icon.startsWith("<svg")) {
        iconHtml = `<span style="width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;">${icon.replace(/<svg/, '<svg width="14" height="14"')}</span>`;
      } else if (icon && icon.startsWith("http")) {
        iconHtml = `<img src="${icon}" style="width:14px;height:14px;object-fit:contain;" />`;
      } else {
        iconHtml = `<span style="font-size:0.6rem;">🔌</span>`;
      }
      return `<span style="display:inline-flex;align-items:center;gap:4px;background:#1a2a3a;padding:3px 8px;border-radius:4px;color:#6aaadf;font-size:0.7rem;">${iconHtml}${name}</span>`;
    }).join("");

    return `
      <div style="width:100%;height:100%;display:flex;flex-direction:column;font-family:monospace;color:#c0c0d0;font-size:0.8rem;">
        <!-- Header bar -->
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#111122;border-bottom:1px solid #222244;">
          <div style="position:relative;width:48px;height:48px;flex-shrink:0;">
            <img src="${spriteImg}" style="width:48px;height:48px;object-fit:contain;image-rendering:pixelated;" />
            <div style="position:absolute;bottom:-2px;right:-2px;font-size:1rem;">${mood}</div>
          </div>
          <div>
            <div style="color:${agent.accent};font-size:1.1rem;font-weight:bold;">${agent.name}</div>
            <div style="color:#666;font-size:0.7rem;">${agent.model}</div>
          </div>
          <div style="margin-left:auto;display:flex;align-items:center;gap:6px;">
            <div style="width:8px;height:8px;border-radius:50%;background:${sc};box-shadow:0 0 6px ${sc};"></div>
            <span style="color:${sc};font-size:0.75rem;text-transform:uppercase;">${agent.status}</span>
          </div>
        </div>

        <!-- Body -->
        <div style="flex:1;display:flex;gap:1px;background:#1a1a2e;">
          <!-- Left panel: stats -->
          <div style="flex:1;padding:16px;background:#0d0d18;">
            <div style="color:#555;font-size:0.65rem;text-transform:uppercase;margin-bottom:8px;">Performance</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div style="background:#111122;padding:10px;border-radius:6px;">
                <div style="color:#888;font-size:0.65rem;">Tasks Done</div>
                <div style="color:#44cc88;font-size:1.4rem;font-weight:bold;">${agent.tasksDone}</div>
              </div>
              <div style="background:#111122;padding:10px;border-radius:6px;">
                <div style="color:#888;font-size:0.65rem;">Role</div>
                <div style="color:#aa88ff;font-size:1rem;font-weight:bold;text-transform:capitalize;">${agent.role}</div>
              </div>
              <div style="background:#111122;padding:10px;border-radius:6px;">
                <div style="color:#888;font-size:0.65rem;">Desk</div>
                <div style="color:#e0e0e0;font-size:1rem;">#${agent.deskIndex}</div>
              </div>
              <div style="background:#111122;padding:10px;border-radius:6px;">
                <div style="color:#888;font-size:0.65rem;">Mood</div>
                <div style="color:#e0e0e0;font-size:1rem;text-transform:capitalize;">${agent.mood ?? "neutral"}</div>
              </div>
            </div>

            <div style="color:#555;font-size:0.65rem;text-transform:uppercase;margin:16px 0 8px;">MCP Servers (${mcpCount})</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">
              ${mcpCount > 0
                ? mcpBadges
                : `<span style="color:#555;font-size:0.7rem;">No MCP servers configured</span>`}
            </div>

            ${agent.personality ? `
            <div style="color:#555;font-size:0.65rem;text-transform:uppercase;margin:16px 0 8px;">Personality</div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              ${[
                ["Openness", agent.personality.openness],
                ["Conscientiousness", agent.personality.conscientiousness],
                ["Extraversion", agent.personality.extraversion],
                ["Agreeableness", agent.personality.agreeableness],
                ["Neuroticism", agent.personality.neuroticism],
              ].map(([label, val]) => `
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="color:#888;font-size:0.65rem;width:110px;">${label}</span>
                  <div style="flex:1;height:6px;background:#111122;border-radius:3px;overflow:hidden;">
                    <div style="width:${Math.round((val as number) * 100)}%;height:100%;background:${agent.accent};"></div>
                  </div>
                </div>
              `).join("")}
            </div>` : ""}
          </div>

          <!-- Right panel: current task + system prompt -->
          <div style="flex:1;padding:16px;background:#0d0d18;display:flex;flex-direction:column;">
            <div style="color:#555;font-size:0.65rem;text-transform:uppercase;margin-bottom:8px;">Current Task</div>
            <div style="background:#111122;padding:12px;border-radius:6px;flex:1;overflow-y:auto;color:#e0e0e0;font-size:0.8rem;line-height:1.4;">
              ${agent.task ? agent.task : `<span style="color:#555;">No active task — agent is idle and ready for work.</span>`}
            </div>

            <div style="color:#555;font-size:0.65rem;text-transform:uppercase;margin:12px 0 8px;">System Prompt</div>
            <div style="background:#111122;padding:12px;border-radius:6px;max-height:120px;overflow-y:auto;color:#888;font-size:0.7rem;line-height:1.4;">
              ${agent.systemPrompt ? agent.systemPrompt.slice(0, 500) + (agent.systemPrompt.length > 500 ? "…" : "") : `<span style="color:#444;">No custom system prompt set.</span>`}
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding:8px 16px;background:#111122;border-top:1px solid #222244;display:flex;justify-content:space-between;align-items:center;">
          <span style="color:#444;font-size:0.65rem;">Agent ID: ${agent.id.slice(0, 8)}…</span>
          <span style="color:#444;font-size:0.65rem;">Live browser feed will appear here when available</span>
        </div>
      </div>
    `;
  }

  /** Close the agent view modal and stop the screenshot stream. */
  private closeAgentViewModal(): void {
    if (this.agentViewAgentId && this.net) {
      this.net.send({ type: "agent_view_stop", agentId: this.agentViewAgentId });
    }
    this.agentViewAgentId = null;
    document.getElementById("agent-view-modal")?.remove();
  }

  /** Render an agent screenshot frame onto the projector canvas. */
  private updateProjectorAgentFrame(frame: string): void {
    // Hide YouTube iframe if visible
    if (this.projectorIframe) this.projectorIframe.style.display = "none";

    const img = new Image();
    img.onload = () => {
      // Create or update texture
      if (!this.textures.exists(this.projectorAgentTextureKey)) {
        const tex = this.textures.createCanvas(this.projectorAgentTextureKey, 480, 288);
        if (!tex) return;
      }
      const tex = this.textures.get(this.projectorAgentTextureKey) as Phaser.Textures.CanvasTexture;
      const canvas = tex.getSourceImage() as HTMLCanvasElement;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, 480, 288);
      // Draw screenshot scaled to projector size
      const scale = Math.min(480 / img.width, 288 / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = (480 - dw) / 2;
      const dy = (288 - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
      tex.refresh();

      // Draw or update the image on the projector
      if (!this.projectorAgentImage) {
        const px = this.projectorTile.x * TILE_PX + 32;
        const py = this.projectorTile.y * TILE_PX - 100;
        this.projectorAgentImage = this.add.image(px, py, this.projectorAgentTextureKey).setDepth(3);
      }
      this.projectorAgentImage.setVisible(true);
    };
    img.src = `data:image/jpeg;base64,${frame}`;
  }

  /** Hide the agent frame on the projector. */
  private hideProjectorAgentFrame(): void {
    if (this.projectorAgentImage) this.projectorAgentImage.setVisible(false);
  }

  // ── Phone booth + webcam/screen share video overlay ──────────────────

  /** Draw a wall-mounted screen share station next to the projector. */
  private drawScreenShareStation(): void {
    const px = this.screenShareTile.x * TILE_PX + 32;
    const py = this.screenShareTile.y * TILE_PX + 32;
    this.screenShareGfx = this.add.graphics().setDepth(3);

    // mounting plate
    this.screenShareGfx.fillStyle(0x1a2838, 1);
    this.screenShareGfx.fillRoundedRect(px - 20, py - 16, 40, 32, 4);
    this.screenShareGfx.fillStyle(0x2a3848, 1);
    this.screenShareGfx.fillRoundedRect(px - 18, py - 14, 36, 28, 3);

    // small screen display
    this.screenShareGfx.fillStyle(0x0a0a12, 1);
    this.screenShareGfx.fillRoundedRect(px - 14, py - 10, 28, 12, 2);
    // monitor icon (screen with arrow)
    this.screenShareGfx.fillStyle(0x4a8cd4, 1);
    this.screenShareGfx.fillRect(px - 8, py - 7, 10, 6);
    this.screenShareGfx.fillStyle(0x2a4868, 1);
    this.screenShareGfx.fillRect(px - 6, py - 5, 6, 2);

    // share button (green when sharing, gray when not)
    this.screenShareGfx.fillStyle(0x666666, 1);
    this.screenShareGfx.fillRoundedRect(px - 12, py + 4, 24, 8, 2);

    // screws
    this.screenShareGfx.fillStyle(0x555555, 1);
    this.screenShareGfx.fillCircle(px - 15, py - 12, 1.5);
    this.screenShareGfx.fillCircle(px + 15, py - 12, 1.5);
    this.screenShareGfx.fillCircle(px - 15, py + 12, 1.5);
    this.screenShareGfx.fillCircle(px + 15, py + 12, 1.5);
  }

  /** Draw the phone booth near the projector in the top-left corner. */
  private drawPhoneBooth(): void {
    const px = this.phoneBoothTile.x * TILE_PX + 32;
    const py = this.phoneBoothTile.y * TILE_PX + 32;
    this.phoneBoothGfx = this.add.graphics().setDepth(2);

    // shadow
    this.phoneBoothGfx.fillStyle(0x000000, 0.2);
    this.phoneBoothGfx.fillEllipse(px, py + 28, 44, 10);

    // booth body (back panel)
    this.phoneBoothGfx.fillStyle(0x1a2a3a, 1);
    this.phoneBoothGfx.fillRoundedRect(px - 22, py - 30, 44, 60, 4);
    this.phoneBoothGfx.fillStyle(0x2a3a4a, 1);
    this.phoneBoothGfx.fillRoundedRect(px - 20, py - 28, 40, 56, 3);

    // interior (dark)
    this.phoneBoothGfx.fillStyle(0x0a0a12, 1);
    this.phoneBoothGfx.fillRoundedRect(px - 16, py - 24, 32, 48, 2);

    // door frame
    this.phoneBoothGfx.lineStyle(2, 0x3a4a5a, 1);
    this.phoneBoothGfx.strokeRoundedRect(px - 16, py - 24, 32, 48, 2);

    // small camera lens at top
    this.phoneBoothGfx.fillStyle(0x1a1a2a, 1);
    this.phoneBoothGfx.fillCircle(px, py - 20, 3);
    this.phoneBoothGfx.fillStyle(0x4a8cd4, 0.8);
    this.phoneBoothGfx.fillCircle(px, py - 20, 1.5);

    // "ON AIR" light (off by default)
    this.phoneBoothLight = this.add.graphics().setDepth(3);
    this.updatePhoneBoothVisual(false);

    // roof / sign
    this.phoneBoothGfx.fillStyle(0x2a4a6a, 1);
    this.phoneBoothGfx.fillRoundedRect(px - 24, py - 36, 48, 8, 2);
    this.phoneBoothGfx.fillStyle(0x1a3a5a, 1);
    this.phoneBoothGfx.fillRoundedRect(px - 22, py - 34, 44, 4, 1);
  }

  /** Update the phone booth ON AIR light. */
  private updatePhoneBoothVisual(broadcasting: boolean): void {
    if (!this.phoneBoothLight) return;
    this.phoneBoothLight.clear();
    const px = this.phoneBoothTile.x * TILE_PX + 32;
    const py = this.phoneBoothTile.y * TILE_PX + 32;
    if (broadcasting) {
      // glowing red ON AIR light
      this.phoneBoothLight.fillStyle(0xff3333, 0.3);
      this.phoneBoothLight.fillCircle(px, py - 32, 8);
      this.phoneBoothLight.fillStyle(0xff3333, 1);
      this.phoneBoothLight.fillCircle(px, py - 32, 4);
      this.phoneBoothLight.fillStyle(0xffaaaa, 0.8);
      this.phoneBoothLight.fillCircle(px - 1, py - 33, 1.5);
    } else {
      // dim light
      this.phoneBoothLight.fillStyle(0x333333, 1);
      this.phoneBoothLight.fillCircle(px, py - 32, 4);
    }
  }

  /** Attach a remote webcam stream to a hidden video element for projector display. */
  private attachWebcamVideo(stream: MediaStream): void {
    if (!this.webcamVideoEl) {
      this.webcamVideoEl = document.createElement("video");
      this.webcamVideoEl.autoplay = true;
      this.webcamVideoEl.playsInline = true;
      this.webcamVideoEl.muted = true;
      this.webcamVideoEl.style.cssText = "position:fixed;border:none;pointer-events:none;z-index:51;border-radius:3px;display:none;object-fit:cover;";
      document.body.appendChild(this.webcamVideoEl);
    }
    this.webcamVideoEl.srcObject = stream;
    this.webcamVideoEl.style.display = "block";
  }

  /** Detach the webcam video element from the projector. */
  private detachWebcamVideo(): void {
    if (this.webcamVideoEl) {
      this.webcamVideoEl.srcObject = null;
      this.webcamVideoEl.style.display = "none";
    }
  }

  /** Attach a remote screen share stream to a hidden video element for projector display. */
  private attachScreenShareVideo(stream: MediaStream): void {
    if (!this.screenShareVideoEl) {
      this.screenShareVideoEl = document.createElement("video");
      this.screenShareVideoEl.autoplay = true;
      this.screenShareVideoEl.playsInline = true;
      this.screenShareVideoEl.muted = true;
      this.screenShareVideoEl.style.cssText = "position:fixed;border:none;pointer-events:none;z-index:51;border-radius:3px;display:none;object-fit:contain;";
      document.body.appendChild(this.screenShareVideoEl);
    }
    this.screenShareVideoEl.srcObject = stream;
    this.screenShareVideoEl.style.display = "block";
  }

  /** Detach the screen share video element from the projector. */
  private detachScreenShareVideo(): void {
    if (this.screenShareVideoEl) {
      this.screenShareVideoEl.srcObject = null;
      this.screenShareVideoEl.style.display = "none";
    }
  }

  /** Update positions of webcam and screen share video overlays on the projector.
   *  When both are active, the projector splits into two halves:
   *  left = screen share, right = webcam. */
  private updateProjectorVideoOverlays(): void {
    const cam = this.cameras.main;
    const px = this.projectorTile.x * TILE_PX + 32;
    const py = this.projectorTile.y * TILE_PX - 100;
    const sw = 480;
    const sh = 288;
    const canvas = this.game.canvas.getBoundingClientRect();

    const hasWebcam = !!this.webcamVideoEl && this.webcamVideoEl.style.display !== "none";
    const hasScreenShare = !!this.screenShareVideoEl && this.screenShareVideoEl.style.display !== "none";

    if (hasWebcam && hasScreenShare) {
      // Split-screen: left half = screen share, right half = webcam
      const halfW = sw / 2;
      const ssX = canvas.left + (px - cam.scrollX) * cam.zoom - (sw * cam.zoom) / 2;
      const wcX = ssX + halfW * cam.zoom;
      const screenY = canvas.top + (py - cam.scrollY) * cam.zoom - (sh * cam.zoom) / 2;
      const screenW = halfW * cam.zoom;
      const screenH = sh * cam.zoom;

      this.screenShareVideoEl!.style.left = `${ssX}px`;
      this.screenShareVideoEl!.style.top = `${screenY}px`;
      this.screenShareVideoEl!.style.width = `${screenW}px`;
      this.screenShareVideoEl!.style.height = `${screenH}px`;

      this.webcamVideoEl!.style.left = `${wcX}px`;
      this.webcamVideoEl!.style.top = `${screenY}px`;
      this.webcamVideoEl!.style.width = `${screenW}px`;
      this.webcamVideoEl!.style.height = `${screenH}px`;
    } else if (hasWebcam) {
      // Webcam only — full projector
      const sx = canvas.left + (px - cam.scrollX) * cam.zoom - (sw * cam.zoom) / 2;
      const sy = canvas.top + (py - cam.scrollY) * cam.zoom - (sh * cam.zoom) / 2;
      this.webcamVideoEl!.style.left = `${sx}px`;
      this.webcamVideoEl!.style.top = `${sy}px`;
      this.webcamVideoEl!.style.width = `${sw * cam.zoom}px`;
      this.webcamVideoEl!.style.height = `${sh * cam.zoom}px`;
    } else if (hasScreenShare) {
      // Screen share only — full projector
      const sx = canvas.left + (px - cam.scrollX) * cam.zoom - (sw * cam.zoom) / 2;
      const sy = canvas.top + (py - cam.scrollY) * cam.zoom - (sh * cam.zoom) / 2;
      this.screenShareVideoEl!.style.left = `${sx}px`;
      this.screenShareVideoEl!.style.top = `${sy}px`;
      this.screenShareVideoEl!.style.width = `${sw * cam.zoom}px`;
      this.screenShareVideoEl!.style.height = `${sh * cam.zoom}px`;
    }
  }

  // ── Matrix rain monitor animation ────────────────────────────────────

  private initMatrixRain(): void {
    const cols = Math.floor(OfficeScene.MATRIX_W / 6);
    this.matrixColumns = [];
    for (let i = 0; i < cols; i++) {
      this.matrixColumns.push({
        y: Math.random() * OfficeScene.MATRIX_H,
        speed: 0.5 + Math.random() * 1.0,
        chars: [],
      });
    }
  }

  private updateMatrixRain(_time: number): void {
    const workingDesks = new Set<number>();
    for (const agent of this.store.agents.values()) {
      if (agent.deskIndex >= 0 && agent.status !== "idle" && agent.status !== "done" && agent.status !== "error") {
        workingDesks.add(agent.deskIndex);
      }
    }

    // No working agents — hide all overlays
    if (workingDesks.size === 0) {
      for (const overlay of this.monitorMatrixOverlays.values()) {
        overlay.setVisible(false);
      }
      return;
    }

    // Init columns if needed
    if (this.matrixColumns.length === 0) this.initMatrixRain();

    // Create texture if needed
    if (!this.textures.exists(this.monitorMatrixTexKey)) {
      const ct = this.textures.createCanvas(this.monitorMatrixTexKey, OfficeScene.MATRIX_W, OfficeScene.MATRIX_H);
      if (!ct) return;
    }

    // Update matrix rain canvas
    const tex = this.textures.get(this.monitorMatrixTexKey) as Phaser.Textures.CanvasTexture;
    const canvas = tex.getSourceImage() as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Fade previous frame
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(0, 0, OfficeScene.MATRIX_W, OfficeScene.MATRIX_H);

    // Draw falling characters
    const charSet = "01ABCDEF<>/{}[]#$%&*+-=";
    ctx.font = "6px monospace";
    for (let col = 0; col < this.matrixColumns.length; col++) {
      const mc = this.matrixColumns[col];
      const x = col * 6;
      const y = Math.floor(mc.y) * 6;

      // Bright leading character
      ctx.fillStyle = "#ccffcc";
      ctx.fillText(charSet[Math.floor(Math.random() * charSet.length)], x, y);

      // Trailing dimmer characters
      ctx.fillStyle = "rgba(0,255,0,0.5)";
      for (let trail = 1; trail < 5; trail++) {
        const ty = y - trail * 6;
        if (ty < 0) break;
        ctx.fillText(charSet[Math.floor(Math.random() * charSet.length)], x, ty);
      }

      // Advance column
      mc.y += mc.speed;
      if (mc.y > OfficeScene.MATRIX_H) {
        mc.y = -Math.random() * 15;
        mc.speed = 0.5 + Math.random() * 1.0;
      }
    }
    tex.refresh();

    // Create/update overlays for working monitors
    for (const deskIdx of workingDesks) {
      const monitor = this.monitors[deskIdx];
      if (!monitor) continue;

      let overlay = this.monitorMatrixOverlays.get(deskIdx);
      if (!overlay) {
        overlay = this.add.image(monitor.x, monitor.y, this.monitorMatrixTexKey)
          .setDepth(monitor.depth + 1)
          .setOrigin(0.5, 0.5)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.monitorMatrixOverlays.set(deskIdx, overlay);
      }
      // Position the overlay on the monitor screen area.
      // Screen in the texture is at y: 0.11–0.51 (center 0.31), x: 0.15–0.85 (center 0.5)
      // Monitor sprite origin is 0.5,0.5 so screen center is at offset (0, -0.19 * TILE_PX)
      overlay.setPosition(monitor.x, monitor.y - TILE_PX * 0.19);
      overlay.setDisplaySize(TILE_PX * 0.66, TILE_PX * 0.36);
      overlay.setVisible(true);
    }

    // Hide overlays for non-working monitors
    for (const [deskIdx, overlay] of this.monitorMatrixOverlays) {
      if (!workingDesks.has(deskIdx)) {
        overlay.setVisible(false);
      }
    }
  }
}

export { tileOf };
