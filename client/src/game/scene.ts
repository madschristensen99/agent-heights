import Phaser from "phaser";
import type { Store, HelicopterDelivery } from "../store";
import type { Net } from "../net";
import { AgentNPC, AgentResourcesNPC, HermesNPC, feetOf, tileOf, TILE_PX, STATUS_COLORS, agentTextureKey, createHintTag, type HintTag, type Dir } from "./agent";
import { AGENT_RESOURCES_ID, HERMES_ID, type CharAppearance, type AgentInfo, type LogEntry, type PlatformEvent, PLATFORM_CREDENTIAL_FIELDS, PLATFORM_CATALOG, getPlatformEntry } from "../../../shared/types";
import { Grid, findPath, type Tile } from "./path";
import { WorldLayer, LOAD_RADIUS } from "./world";
import { BloomPipeline, ColorGradePipeline, DOFPipeline } from "./shaders";
import { generateAllTextures } from "./textures";
import { generateCharTexture, generateCharPreviewDataURL, CHAR_FRAMES_PER_ROW } from "./chargen";
import { getServerByUrl } from "../../../shared/mcp-catalog";
import { upgradeFurniture, CHAIR_TEX_DOWN, CHAIR_TEX_UP, CHAIR_TEX_LEFT, CHAIR_TEX_RIGHT, MONITOR_TEX, MONITOR_SIDE_TEX, resolveChairTex } from "./furniture";
import { upgradeWorkshop } from "./workshop";
import { AI_OFFICE_TEXTURES } from "./ai-tiles";
import { achievements, ACHIEVEMENTS } from "./achievements";
import { touchInput, isTouchDevice } from "../touch";
import { md } from "../ui/md";
import { getToken } from "../auth";
import { VoiceManager } from "../voice";
import { ScreenShareManager } from "../screen-share";
import { WebcamManager } from "../webcam";

const PLAYER_SPEED = 380;

function hintLabel(text: string): string {
  return isTouchDevice() ? text.replace(/^E:\s*/, "TAP ") : text;
}

interface PlatformMailbox {
  platform: string | null;
  color: number;
  colorLight: number;
  colorDark: number;
  tile: Tile;
  flagUp: boolean;
  pendingCount: number;
  lastMessage: string;
  slotIndex: number;
}

/** Tile positions for the 6 mailbox slots along the north wall of the mail room. */
const MAILBOX_TILES: Tile[] = [
  { x: 2, y: 13 },
  { x: 3, y: 13 },
  { x: 5, y: 13 },
  { x: 6, y: 13 },
  { x: 8, y: 13 },
  { x: 9, y: 13 },
];

/** Dark navy color for unassigned mailboxes. */
const UNASSIGNED_COLOR = 0x1a2a4a;

/** Mapping of platform names to icon URLs for logo display.
 *  Platforms not listed here will fall back to a colored dot.
 *  Most icons use cdn.simpleicons.org; platforms removed from Simple Icons
 *  (Slack, Twilio, Microsoft Teams) use jsDelivr with pinned older versions. */
const PLATFORM_ICON_SLUGS: Record<string, string> = {
  Slack: "https://cdn.jsdelivr.net/npm/simple-icons@15/icons/slack.svg",
  Discord: "discord",
  Telegram: "telegram",
  WhatsApp: "whatsapp",
  Signal: "signal",
  Email: "gmail",
  SMS: "https://cdn.jsdelivr.net/npm/simple-icons@15/icons/twilio.svg",
  "Microsoft Teams": "https://cdn.jsdelivr.net/npm/simple-icons@12/icons/microsoftteams.svg",
  "Google Chat": "googlechat",
  Matrix: "matrix",
  Mattermost: "mattermost",
  LINE: "line",
  BlueBubbles: "imessage",
  ntfy: "ntfy",
  SimpleX: "simplex",
  "Home Assistant": "homeassistant",
  "Teams Meetings": "https://cdn.jsdelivr.net/npm/simple-icons@12/icons/microsoftteams.svg",
  "MS Graph Webhook": "https://cdn.jsdelivr.net/npm/simple-icons@12/icons/microsoftteams.svg",
  QQ: "qq",
};

/** Get a logo img element for a platform, or null if no icon is available. */
function platformLogoImg(platform: string, size: number): HTMLImageElement | null {
  const iconRef = PLATFORM_ICON_SLUGS[platform];
  if (!iconRef) return null;
  const img = document.createElement("img");
  img.src = iconRef.startsWith("http") ? iconRef : `https://cdn.simpleicons.org/${iconRef}`;
  img.alt = platform;
  img.style.cssText = `width:${size}px;height:${size}px;flex-shrink:0;object-fit:contain;`;
  img.onerror = () => { img.style.display = "none"; };
  return img;
}

export class OfficeScene extends Phaser.Scene {
  private store!: Store;
  private grid!: Grid;
  private npcs = new Map<string, AgentNPC>();
  private agentResources: AgentResourcesNPC | null = null;
  private hermes: HermesNPC | null = null;
  private agentResourcesSeat: Tile | null = null;
  private agentResourcesOfficeZone: Phaser.GameObjects.Zone | null = null;
  private seats: Tile[] = [];
  private extraSpots: Tile[] = [];
  private monitors: Phaser.GameObjects.Sprite[] = [];
  private chairs: Phaser.GameObjects.Sprite[] = [];
  private agentResourcesMonitor: Phaser.GameObjects.Sprite | null = null;
  private hermesSeat: Tile | null = null;
  private hermesMonitor: Phaser.GameObjects.Sprite | null = null;
  private spawnTile: Tile = { x: 14, y: 16 };
  private doorTile: Tile = { x: 14, y: 17 };
  private boardTile: Tile = { x: 14, y: 2 };
  private boardHint!: HintTag;
  private coffeeTile: Tile = { x: 26, y: 2 };
  private coffeeUntil = 0;
  private coffeeHint!: HintTag;

  // --- projector screen (top-left wall) ---
  private projectorTile: Tile = { x: 6, y: 0 };
  private projectorHint!: HintTag;
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
  private fridgeTile: Tile = { x: 24, y: 2 };
  private coolerTile: Tile = { x: 22, y: 2 };
  private clockTile: Tile = { x: 1, y: 3 };
  private vendingTile: Tile | null = null;

  // --- projector control panel + speaker (where clock used to be) ---
  private projectorControlTile: Tile = { x: 6, y: 1 };
  private projectorSpeakerTile: Tile = { x: 7, y: 1 };
  private projectorControlHint!: HintTag;
  private projectorSpeakerHint!: HintTag;
  private projectorControlGfx!: Phaser.GameObjects.Graphics;
  private projectorSpeakerGfx!: Phaser.GameObjects.Graphics;
  private projectorMuted = true;
  private screenShareTile: Tile = { x: 5, y: 1 };
  private screenShareHint!: HintTag;
  private screenShareGfx!: Phaser.GameObjects.Graphics;

  // --- phone booth (webcam broadcast) ---
  private phoneBoothTile: Tile = { x: 3, y: 2 };
  private phoneBoothHint!: HintTag;
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
  private mailboxHint!: HintTag;
  private mailboxUntil = 0; // cooldown for checking mail
  private mailboxHasMail = false;
  private mailboxNextMail = 0; // timestamp when next mail arrives
  private mailboxPx = { x: 0, y: 0 };

  // --- platform mailboxes (mail room) ---
  private platformMailboxGfx!: Phaser.GameObjects.Graphics;
  private platformMailboxHint!: HintTag;
  private platformMailboxes: PlatformMailbox[] = [];
  private mailDigestRequested = false;

  private fridgeHint!: HintTag;
  private coolerHint!: HintTag;
  private clockHint!: HintTag;
  private vendingHint!: HintTag;
  private sofaHint!: HintTag;
  private filingHint!: HintTag;
  private plantHint!: HintTag;
  // mailboxHint declared above with mailbox fields

  // --- wardrobe (break room) ---
  private wardrobeTile: Tile = { x: 21, y: 18 };
  private wardrobeHint!: HintTag;
  private wardrobeGfx!: Phaser.GameObjects.Graphics;

  // --- nemesis terminal (break room) ---
  private nemesisTerminalTile: Tile = { x: 20, y: 14 };
  private nemesisTerminalHint!: HintTag;
  private nemesisTerminalGfx!: Phaser.GameObjects.Graphics;

  private trophyTile: Tile = { x: 1, y: 8 };
  private trophyHint!: HintTag;
  private trophyGfx!: Phaser.GameObjects.Graphics;
  private trophyAchCount = -1;
  private sceneStart = 0;

  private hallOfFameTile: Tile = { x: 1, y: 5 };
  private hallOfFameHint!: HintTag;
  private hallOfFameGfx!: Phaser.GameObjects.Graphics;
  private chimneyGfx!: Phaser.GameObjects.Graphics;

  // --- helicopter / red button ---
  private redButtonTile: Tile = { x: 25, y: 7 };
  private redButtonHint!: HintTag;
  private redButtonUntil = 0;
  private padCenter = { x: 1200, y: -195 };
  private padFrontPx = { x: 1158, y: -138 };
  private heliActive = false;
  private heliContainer: Phaser.GameObjects.Container | null = null;
  private heliRotor: Phaser.GameObjects.Graphics | null = null;
  private heliAgent: Phaser.GameObjects.Container | null = null;
  private heliElevatorGfx: Phaser.GameObjects.Graphics | null = null;
  private heliDelivery: HelicopterDelivery | null = null;
  private heliSound: { stop: () => void } | null = null;
  private pendingHeliAgents: string[] = [];
  private initialSyncDone = false;

  private world!: WorldLayer;
  private theme: "classic" | "agentHeights" = "classic";
  /** Pixel positions of chimney tiles — for smoke when devops agents work. */
  private chimneyPositions: { x: number; y: number }[] = [];
  /** Server rack tile positions for E-interaction. */
  private serverRackTiles: Tile[] = [];
  private serverRackHint!: HintTag;

  // --- world portal (near server racks) ---
  private portalContainer: Phaser.GameObjects.Container | null = null;
  private portalCollider: Phaser.Physics.Arcade.Collider | null = null;
  private portalZone: Phaser.GameObjects.Arc | null = null;
  private portalHint!: Phaser.GameObjects.Text;

  // --- MCP Forge (break room) ---
  // Each tile is the center of the multi-tile piece for proximity checks.
  private warTableTile: Tile = { x: 26, y: 15 };   // 2×2 at (25,14) — forge station
  private scrapBinTile: Tile = { x: 28, y: 18 };   // 1×2 at (28,17) — tool rack
  private radioTile: Tile = { x: 28, y: 14 };      // 1×1 at (28,14) — status monitor
  private workbenchTile: Tile = { x: 24, y: 18 };  // 2×1 at (23,18) — code terminal
  private researchTile: Tile = { x: 23, y: 14 };   // 2×1 at (22,14) — blueprint desk
  private warTableHint!: HintTag;
  private scrapBinHint!: HintTag;
  private radioHint!: HintTag;
  private workbenchHint!: HintTag;
  private researchHint!: HintTag;
  private allHints: HintTag[] = [];

  /** Store listeners are registered once; they survive scene restarts. */
  private wired = false;
  private ready = false;

  private mapPx = { w: 960, h: 640 };
  private player!: Phaser.GameObjects.Sprite;
  private playerLabel!: Phaser.GameObjects.Text;
  private playerNameBg!: Phaser.GameObjects.Graphics;
  private playerDir: Dir = "down";
  private playerTexKey = "boss";
  private keys!: Record<"W" | "A" | "S" | "D" | "E" | "Q" | "R" | "T" | "SPACE", Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private selectRing!: Phaser.GameObjects.Ellipse;
  private lightingOverlay!: Phaser.GameObjects.Graphics;
  private monitorGlows: Phaser.GameObjects.Arc[] = [];

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
  /** Current tab in the agent monitor. */
  private agentViewTab: "screen" | "files" | "terminal" | "tasks" | "chat" | "memory" | "stats" = "screen";
  /** Current file browser path within the agent workspace. */
  private agentFsPath = ".";
  /** Unsubscribe functions for agent log/FS listeners. */
  private agentViewCleanup: (() => void)[] = [];
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

  // ── Tap-to-walk + tap-to-interact ──
  private playerPath: Tile[] = [];
  private playerTargetPx: { x: number; y: number } | null = null;
  private pendingInteract: boolean = false;
  private pendingAgentId: string | null = null;
  private pathMarker: Phaser.GameObjects.Arc | null = null;

  // ── Camera controls (pinch-zoom, pan, recenter) ──
  private cameraMode: "follow" | "free" = "follow";
  private userZoom: number | null = null;
  private pinchPointers: Map<number, Phaser.Input.Pointer> = new Map();
  private pinchStartDist = 0;
  private pinchStartZoom = 1;
  private panPointer: Phaser.Input.Pointer | null = null;
  private panStartScrollX = 0;
  private panStartScrollY = 0;
  private tapStartX = 0;
  private tapStartY = 0;
  private tapMoved = false;

  constructor() {
    super("office");
  }

  create(): void {
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

    // Projector video overlay: position during prerender for accurate camera placement
    this.events.on("prerender", () => {
      this.updateProjectorVideo();
      this.updateProjectorVideoOverlays();
    });

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
      // If this is the agent being viewed in the modal and on the screen tab, update the modal
      if (agentId === this.agentViewAgentId && this.agentViewTab === "screen") {
        const img = document.getElementById("agent-view-screen-img") as HTMLImageElement | null;
        if (img) {
          img.src = `data:image/jpeg;base64,${frame}`;
          img.style.display = "block";
        }
        const placeholder = document.getElementById("agent-view-screen-placeholder");
        if (placeholder) placeholder.style.display = "none";
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
      this.closePortal();
      for (const overlay of this.monitorMatrixOverlays.values()) overlay.destroy();
      this.monitorMatrixOverlays.clear();
      this.matrixColumns = [];
    });
    // HQ2 and org rooms use the agentHeights (big open office) theme; private offices use user's chosen theme.
    // Before room_state arrives, roomId is null — default to HQ2 theme since that's where
    // players start. This prevents a brief flash of the wrong room layout.
    const isHq2 = this.store.roomId === "hq2" || this.store.roomId === null || this.store.isOrgRoom;
    this.theme = isHq2 ? "agentHeights" : (this.store.settings.game.theme === "agentHeights" ? "agentHeights" : "classic");
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
    try {
      const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
      const pipelines = renderer?.pipelines as any;
      if (pipelines) {
        if (!pipelines.has("BloomFX")) pipelines.addPostPipeline("BloomFX", BloomPipeline);
        if (!pipelines.has("ColorGrade")) pipelines.addPostPipeline("ColorGrade", ColorGradePipeline);
        if (!pipelines.has("DOF")) pipelines.addPostPipeline("DOF", DOFPipeline);
        // apply pipelines to camera (order: Bloom -> ColorGrade -> DOF)
        this.cameras.main.setPostPipeline("BloomFX");
        this.cameras.main.setPostPipeline("ColorGrade");
        this.cameras.main.setPostPipeline("DOF");
      }
    } catch (err) {
      console.warn("[scene] Post-pipeline setup failed — continuing without visual effects:", err);
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
    this.initialSyncDone = false;
    this.agentResources = null;
    this.hermes = null;
    this.agentResourcesSeat = null;
    this.seats = [];
    this.extraSpots = [];
    this.monitors = [];
    this.chairs = [];
    this.agentResourcesMonitor = null;
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
            this.theme === "agentHeights" ? "agentHeights" : "office",
            `tiles-${this.theme}`,
          )!;
          // draw a floor backdrop so empty map tiles aren't white
          const floorColor = this.theme === "agentHeights" ? 0x4a6a8a : 0xd4d0c8;
          const aiFloorKey = this.theme === "agentHeights"
            ? AI_OFFICE_TEXTURES.floorAgentHeights
            : AI_OFFICE_TEXTURES.floorClassic;
          if (this.textures.exists(aiFloorKey)) {
            const floorSprite = this.add.tileSprite(0, 0, map.widthInPixels, map.heightInPixels, aiFloorKey).setDepth(-1).setOrigin(0, 0);
            // Texture is 256x256 but each office tile is 64x64 — scale down to match
            floorSprite.tileScaleX = TILE_PX / 256;
            floorSprite.tileScaleY = TILE_PX / 256;
          } else {
            const bg = this.add.graphics().setDepth(-1);
            bg.fillStyle(floorColor, 1);
            bg.fillRect(0, 0, map.widthInPixels, map.heightInPixels);
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
          }

          map.createLayer("Ground", tiles)!.setDepth(0).setAlpha(0);

          const walls = map.createLayer("Walls", tiles)!.setDepth(1);
          const furniture = map.createLayer("Furniture", tiles)!.setDepth(2);
          walls.setCollisionByProperty({ solid: true });
          furniture.setCollisionByProperty({ solid: true });

          // Apply AI wall textures — specific texture per wall side, full opacity
          const tex = this.textures;
          const brickKey = "ai-wall_2";       // red brick — left wall
          const stoneKey = "ai-wall_0";       // gray stone — bottom wall
          const lightStoneKey = "ai-wall_1";  // light stone — top wall
          const drywallKey = AI_OFFICE_TEXTURES.wallBlue; // blue accent wall — right wall
          const hasBrick = tex.exists(brickKey);
          const hasStone = tex.exists(stoneKey);
          const hasLightStone = tex.exists(lightStoneKey);
          const hasDrywall = tex.exists(drywallKey);
          if (hasBrick || hasStone || hasLightStone || hasDrywall) {
            for (let y = 0; y < map.height; y++) {
              for (let x = 0; x < map.width; x++) {
                const wt = walls.getTileAt(x, y);
                if (!wt) continue;
                // Skip door tiles (index 13-14) and window tiles (index 10) so they remain visible
                if (wt.index === 13 || wt.index === 14 || wt.index === 10) continue;
                let wallKey: string | null = null;
                if (x === 0 && hasBrick) wallKey = brickKey;           // left wall = brick
                else if (y === map.height - 1 && hasStone) wallKey = stoneKey; // bottom wall = stone
                else if (x === map.width - 1 && hasDrywall) wallKey = drywallKey; // right wall = drywall
                else if (y <= 1 && hasLightStone) wallKey = lightStoneKey; // top wall = light stone
                if (wallKey) {
                  const ws = this.add.image(x * TILE_PX, y * TILE_PX, wallKey)
                    .setOrigin(0, 0)
                    .setDepth(1.05);
                  ws.setDisplaySize(TILE_PX, TILE_PX);
                }
              }
            }
          }

          // Draw windows on top of the top wall (above AI textures) so they're always visible
          for (let x = 0; x < map.width; x++) {
            const wt = walls.getTileAt(x, 1);
            if (wt && wt.index === 10) {
              const wx = x * TILE_PX;
              const wy = 1 * TILE_PX;
              const wg = this.add.graphics().setDepth(1.1);
              // Window frame
              wg.fillStyle(0x4a4a50, 1);
              wg.fillRoundedRect(wx + 5, wy + 6, 54, 40, 4);
              // Glass
              wg.fillStyle(0x88bbdd, 0.8);
              wg.fillRoundedRect(wx + 8, wy + 9, 48, 34, 3);
              // Reflection highlight
              wg.fillStyle(0xaaddee, 0.5);
              wg.fillRoundedRect(wx + 10, wy + 11, 20, 14, 2);
              // Cross mullions
              wg.lineStyle(1.5, 0x4a4a50, 0.8);
              wg.beginPath();
              wg.moveTo(wx + 32, wy + 9);
              wg.lineTo(wx + 32, wy + 43);
              wg.moveTo(wx + 8, wy + 26);
              wg.lineTo(wx + 56, wy + 26);
              wg.strokePath();
              // Windowsill
              wg.fillStyle(0x5a5a60, 1);
              wg.fillRoundedRect(wx + 4, wy + 44, 56, 5, 2);
            }
          }

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
            } else if (obj.name === "agent-resources-seat") {
              this.agentResourcesSeat = { x: tx, y: ty };
            } else if (obj.name === "agent-resources-monitor") {
              // Side-view monitor on Agent Resources's desk — thin profile, screen faces right toward her
              const mx = (obj.x ?? 0) + TILE_PX * 0.35;
              const my = (obj.y ?? 0) - TILE_PX * 0.15;
              const spr = this.add
                .sprite(mx, my, MONITOR_SIDE_TEX, "0")
                .setDepth(10 + (obj.y ?? 0) - 10);
              this.agentResourcesMonitor = spr;
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
                .sprite(cx, cy, resolveChairTex(this, CHAIR_TEX_DOWN))
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

          // Agent Resources — the office manager NPC
          if (this.agentResourcesSeat) {
            // Create Agent Resources's left-facing chair sprite
            const ycx = this.agentResourcesSeat.x * TILE_PX + TILE_PX / 2;
            const ycy = this.agentResourcesSeat.y * TILE_PX + TILE_PX / 2;
            this.add
              .sprite(ycx, ycy, resolveChairTex(this, CHAIR_TEX_LEFT))
              .setDepth(5 + this.agentResourcesSeat.y * TILE_PX + 1);

            this.agentResources = new AgentResourcesNPC(this, this.grid, this.agentResourcesSeat, (clicked) =>
              this.walkToAgent(clicked),
            );

            // clickable zone over Agent Resources's office — clicking anywhere inside opens her chat
            const zo = { x0: 22, y0: 8, x1: 27, y1: 11 };
            const zx = (zo.x0 + zo.x1 + 1) / 2 * TILE_PX;
            const zy = (zo.y0 + zo.y1 + 1) / 2 * TILE_PX;
            const zw = (zo.x1 - zo.x0 + 1) * TILE_PX;
            const zh = (zo.y1 - zo.y0 + 1) * TILE_PX;
            this.agentResourcesOfficeZone = this.add.zone(zx, zy, zw, zh);
            this.agentResourcesOfficeZone.setInteractive({ useHandCursor: true });
            this.agentResourcesOfficeZone.on("pointerdown", () => this.walkToAgent(AGENT_RESOURCES_ID));
          }

          // Hermes — right-facing chair at the mail room desk
          if (this.hermesSeat) {
            const hcx = this.hermesSeat.x * TILE_PX + TILE_PX / 2;
            const hcy = this.hermesSeat.y * TILE_PX + TILE_PX / 2;
            this.add
              .sprite(hcx, hcy, resolveChairTex(this, CHAIR_TEX_RIGHT))
              .setDepth(5 + this.hermesSeat.y * TILE_PX + 1);

            this.hermes = new HermesNPC(this, this.grid, this.hermesSeat, (clicked) =>
              this.walkToAgent(clicked),
            );
          }

          // standing spots for agents hired beyond the 8 desks — stable order so
          // every client agrees on who stands where
          for (let y = 3; y < map.height - 2 && this.extraSpots.length < 96; y++) {
            for (let x = 2; x < map.width - 2; x++) {
              if (!walkable[y][x] || (x + y) % 3 !== 0) continue;
              if (this.seats.some((s) => s && s.x === x && s.y === y)) continue;
              if (this.agentResourcesSeat && this.agentResourcesSeat.x === x && this.agentResourcesSeat.y === y) continue;
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
              fontSize: "18px",
              color: "#ffffff",
              stroke: "#0d1018",
              strokeThickness: 4,
            })
            .setResolution(4)
            .setOrigin(0.5, 1)
            .setScale(0.75);
          this.drawPlayerNameBg(0x3a8cd4);

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
          this.drawCulturalWalls();
          this.drawHelipad();
          this.drawRedButton();
          this.drawWardrobe();
          this.drawNemesisTerminal();
          this.boardHint = this.makeHint();

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
          this.nemesisTerminalHint = this.makeHint();
          this.projectorHint = this.makeHint();
          this.phoneBoothHint = this.makeHint();
          this.screenShareHint = this.makeHint();
          this.allHints = [
            this.boardHint, this.coffeeHint, this.fridgeHint, this.coolerHint,
            this.clockHint, this.vendingHint, this.sofaHint, this.filingHint,
            this.plantHint, this.mailboxHint, this.platformMailboxHint,
            this.redButtonHint, this.wardrobeHint, this.nemesisTerminalHint,
            this.projectorHint,
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

          // Initialize platform mailboxes in the mail room from settings
          this.platformMailboxes = this.buildPlatformMailboxes();
          this.platformMailboxGfx = this.add.graphics().setDepth(6);
          this.drawPlatformMailboxes();

          // Sync mailbox state from the store (populated by server on connect)
          for (const mb of this.platformMailboxes) {
            if (!mb.platform) continue;
            const state = this.store.platformMailboxes.get(mb.platform);
            if (state) {
              mb.flagUp = state.flagUp;
              mb.pendingCount = state.pendingCount;
              mb.lastMessage = state.lastMessage;
            }
          }
          this.drawPlatformMailboxes();

          // Subscribe to platform connection state updates (Hermes Agent gateway)
          this.store.onPlatformConnection(() => {
            this.drawPlatformMailboxes();
          });

          // Subscribe to live mailbox updates from the server
          this.store.onMailboxUpdate((platform, flagUp, pendingCount, lastMessage) => {
            const mb = this.platformMailboxes.find((m) => m.platform === platform);
            if (!mb) return;
            const wasUp = mb.flagUp;
            mb.flagUp = flagUp;
            mb.pendingCount = pendingCount;
            mb.lastMessage = lastMessage;
            this.drawPlatformMailboxes();

            // When a flag goes up, have Hermes walk to the mailbox to sort
            if (flagUp && !wasUp && this.hermes) {
              this.hermes.sortMail(mb.tile);

              // After sorting (~4s), deliver to a random idle agent's desk
              this.time.delayedCall(4500, () => {
                if (!this.hermes) return;
                const idleAgents: { id: string; tile: import("./path").Tile }[] = [];
                for (const [id, npc] of this.npcs) {
                  const info = this.store.agents.get(id);
                  if (info && info.status === "idle" && info.role !== "manager") {
                    idleAgents.push({ id, tile: npc.tile() });
                  }
                }
                if (idleAgents.length > 0) {
                  const target = idleAgents[Math.floor(Math.random() * idleAgents.length)];
                  this.hermes.deliverTo(target.tile);
                }
              });
            }
          });

          // Subscribe to mailbox message responses (when player presses E)
          this.store.onMailboxMessages((platform, events) => {
            if (events.length === 0) {
              this.store.toast(`[${platform}] No messages.`);
              return;
            }
            this.showMailboxConversationModal(platform, events);
            const mb = this.platformMailboxes.find((m) => m.platform === platform);
            if (mb) {
              const mbPx = { x: mb.tile.x * TILE_PX + TILE_PX / 2, y: mb.tile.y * TILE_PX + TILE_PX / 2 };
              this.world.vfx.sparkBurst(mbPx.x, mbPx.y, mb.color, 8, 50);
              this.world.audio.uiClick();
            }
          });

          // Subscribe to mail digest responses
          const mailDigestHandler = (digest: { totalUnread: number; byPlatform: { platform: string; unread: number; lastMessage: string }[]; queued: number }) => {
            if (digest.totalUnread === 0 && digest.queued === 0) {
              this.store.toast("📬 No new mail across any platform.");
              return;
            }
            const parts: string[] = [];
            for (const p of digest.byPlatform) {
              if (p.unread > 0) parts.push(`${p.platform}: ${p.unread}`);
            }
            const queuedStr = digest.queued > 0 ? ` + ${digest.queued} queued` : "";
            this.store.toast(`📬 ${digest.totalUnread} unread (${parts.join(", ")})${queuedStr}`);
          };
          this.store.onMailDigest(mailDigestHandler);
          this.events.once("shutdown", () => this.store.offMailDigest(mailDigestHandler));
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
        name: "world cleanup & lighting",
        fn: () => {
          this.world.finishDoorPreload();

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
          cam.setZoom(this.defaultZoom());

          // --- camera controls: pinch-zoom, wheel-zoom, pan, tap-to-walk ---
          this.setupCameraControls();

          // --- lighting system ---
          // vignette: darkened edges fixed to screen
          this.lightingOverlay = this.add.graphics().setDepth(900).setScrollFactor(0);
          this.drawVignette();

          // day/night tint and brightness boost are handled by LightingSystem
          // (lighting.ts) — no duplicate overlays needed here.

          const onResize = () => {
            if (this.userZoom === null) {
              cam.setZoom(this.defaultZoom());
            } else {
              cam.setZoom(this.clampZoom(this.userZoom));
            }
            this.drawVignette();
          };
          this.scale.on("resize", onResize);
          this.events.once("shutdown", () => this.scale.off("resize", onResize));

          // monitor glow pool — one per monitor slot
          this.monitors.forEach(() => {
            const glow = this.add.circle(0, 0, 48, 0x4affa8, 0).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
            this.monitorGlows.push(glow);
          });

          this.cursors = this.input.keyboard!.createCursorKeys();
          this.keys = this.input.keyboard!.addKeys("W,A,S,D,E,Q,R,T,SPACE") as OfficeScene["keys"];
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
              if (this.store.roomId === null) return; // room_state not yet received — skip theme check
              const isHq2 = this.store.roomId === "hq2" || this.store.isOrgRoom;
              const desiredTheme = isHq2 ? "agentHeights" : (this.store.settings.game.theme === "agentHeights" ? "agentHeights" : "classic");
              if (desiredTheme !== this.theme) {
                console.log("[scene] theme changed — restarting scene");
                if (desiredTheme === "agentHeights") achievements.unlock("agentHeights_mode");
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
              // Rebuild mailboxes if platform assignments changed
              const prevPlatforms = this.platformMailboxes.map((m) => m.platform).join(",");
              const newPlatforms = (this.store.settings.mailboxPlatforms ?? []).join(",");
              if (prevPlatforms !== newPlatforms) {
                this.platformMailboxes = this.buildPlatformMailboxes();
                for (const mb of this.platformMailboxes) {
                  if (!mb.platform) continue;
                  const state = this.store.platformMailboxes.get(mb.platform);
                  if (state) {
                    mb.flagUp = state.flagUp;
                    mb.pendingCount = state.pendingCount;
                    mb.lastMessage = state.lastMessage;
                  }
                }
                this.drawPlatformMailboxes();
              }
              this.syncAgents();
              this.world.syncGhosts();
              this.updateChimneySmoke();
            });
            this.store.onHuddle((agentIds) => {
              if (this.ready) this.startHuddle(agentIds);
            });
            this.store.onHelicopter((delivery) => {
              console.log(`[heli-debug] onHelicopter callback: ready=${this.ready}, heliActive=${this.heliActive}, name=${delivery?.name}`);
              if (this.ready && !this.heliActive) this.triggerHelicopter(delivery);
            });
            this.store.onAssembly((agentIds) => {
              if (this.ready) this.startAssembly(agentIds);
            });
            this.store.onNpcState((npcId, x, y, dir, state) => {
              if (!this.ready || this.store.roomId === "hq2") return;
              if (npcId === AGENT_RESOURCES_ID) this.agentResources?.remoteUpdate(x, y, dir, state);
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
          // to "agentHeights".  Restart if the current room requires a different theme.
          if (this.store.roomId !== null) {
            const isHq2 = this.store.roomId === "hq2" || this.store.isOrgRoom;
            const desiredTheme = isHq2 ? "agentHeights" : (this.store.settings.game.theme === "agentHeights" ? "agentHeights" : "classic");
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

          // If inside a deployed world, spawn return portal at spawn point
          if (this.store.currentWorld) {
            this.spawnReturnPortal();
          }

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

  /** Draw rounded background behind player nameplate with accent bar. */
  private drawPlayerNameBg(accentColor: number = 0x3a8cd4): void {
    const g = this.playerNameBg;
    g.clear();
    const w = this.playerLabel.displayWidth + 22;
    const h = 22;
    const r = 5;
    const x = -w / 2;
    const y = -18;
    g.fillStyle(0x0d1018, 0.78);
    g.fillRoundedRect(x, y, w, h, r);
    g.fillStyle(accentColor, 0.85);
    g.fillRect(x + 2, y + 3, 3, h - 6);
    g.lineStyle(1, 0xffffff, 0.18);
    g.strokeRoundedRect(x, y, w, h, r);
  }

  /** Draw the vignette overlay — disabled (was causing visible black frame). */
  private drawVignette(): void {
    this.lightingOverlay?.clear();
  }

  /** Update lighting: monitor glows, day/night cycle, vignette refresh. */
  private updateLighting(time: number): void {
    // Day/night darkness and brightness boost are handled by LightingSystem (lighting.ts).
    // This method only handles monitor glows and matrix rain.

    // monitor glows: pulse for working agents
    const pulse = 0.15 + Math.sin(time * 0.003) * 0.05;
    this.monitors.forEach((m, i) => {
      const glow = this.monitorGlows[i];
      if (!glow) return;
      const agent = [...this.store.agents.values()].find((a) => a.deskIndex === i);
      if (agent && agent.status !== "idle" && agent.status !== "waiting") {
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

  private defaultZoom(): number {
    const z = Math.max(this.scale.width / this.mapPx.w, this.scale.height / this.mapPx.h);
    if (isTouchDevice() && Math.min(this.scale.width, this.scale.height) < 480) {
      return Math.max(1, Math.min(z, 1.0));
    }
    return Math.max(1, Math.ceil(z));
  }

  private minZoom(): number {
    return this.defaultZoom() * 0.4;
  }

  private maxZoom(): number {
    return this.defaultZoom() * 3;
  }

  /** Clamp a zoom value to the allowed range. */
  private clampZoom(z: number): number {
    return Math.max(this.minZoom(), Math.min(z, this.maxZoom()));
  }

  /** Recenter camera on player and reset zoom to default. */
  recenterCamera(): void {
    this.cameraMode = "follow";
    this.userZoom = null;
    this.cameras.main.startFollow(this.player, true);
    this.cameras.main.setZoom(this.defaultZoom());
  }

  /** Enter a deployed world — fade out, reconnect WebSocket to the world instance, fade in. */
  enterWorldPortal(branchName: string, worldUrl: string): void {
    if (this.store.worldTransitioning) return;
    this.store.worldTransitioning = true;

    // Derive WebSocket host from the world URL
    let host: string;
    try {
      const u = new URL(worldUrl);
      host = u.host;
    } catch {
      host = worldUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    }

    this.cameras.main.fadeOut(600, 10, 10, 30);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      // Reconnect to the world instance
      const net = this.game.registry.get("net") as Net;
      net.reconnectToHost(host);

      this.store.currentWorld = { branchName, host, url: worldUrl };
      this.store.worldTransitioning = false;
      this.store.toggleGitHubPanel(false);

      // Reset scene state for the new world
      this.store.reset();
      this.scene.restart();

      this.cameras.main.fadeIn(600, 10, 10, 30);
      this.store.toast(`Entering world: ${branchName}`);
    });
  }

  /** Exit the current world — fade out, reconnect to default host, fade in. */
  exitWorld(): void {
    if (this.store.worldTransitioning) return;
    if (!this.store.currentWorld) return;

    this.store.worldTransitioning = true;

    this.cameras.main.fadeOut(600, 10, 10, 30);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      const net = this.game.registry.get("net") as Net;
      net.resetHost();

      this.store.currentWorld = null;
      this.store.worldTransitioning = false;

      this.store.reset();
      this.scene.restart();

      this.cameras.main.fadeIn(600, 10, 10, 30);
      this.store.toast("Returning to Agent Heights");
    });
  }

  /** Open a glowing portal near the server racks that leads to a deployed world. */
  openPortal(branchName: string, worldUrl: string): void {
    // Close existing portal if any
    this.closePortal();

    // Find a position near the server racks
    if (this.serverRackTiles.length === 0) return;
    const rack = this.serverRackTiles[0];
    const px = rack.x * TILE_PX + TILE_PX / 2;
    const py = (rack.y - 2) * TILE_PX + TILE_PX / 2; // 2 tiles above the rack

    this.store.portalTarget = { branchName, url: worldUrl };
    this.store.toggleGitHubPanel(false);

    // Create portal visual: layered glowing circles
    const container = this.add.container(px, py);
    container.setDepth(9000);

    // Outer glow ring
    const outerRing = this.add.circle(0, 0, 36, 0x4a6a8a, 0.15)
      .setStrokeStyle(3, 0x6a9ad6, 0.6);
    // Inner swirling vortex
    const innerRing = this.add.circle(0, 0, 24, 0x2a4a6a, 0.3)
      .setStrokeStyle(2, 0x8fc9f0, 0.8);
    // Core
    const core = this.add.circle(0, 0, 14, 0x1a2a4a, 0.5)
      .setStrokeStyle(1, 0xc0e0ff, 0.9);

    container.add([outerRing, innerRing, core]);

    // Animate: pulsing + rotation effect
    this.tweens.add({
      targets: outerRing,
      scale: { from: 1, to: 1.3 },
      alpha: { from: 0.15, to: 0.05 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
    this.tweens.add({
      targets: innerRing,
      scale: { from: 1, to: 0.8 },
      alpha: { from: 0.3, to: 0.6 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
    this.tweens.add({
      targets: core,
      scale: { from: 1, to: 1.15 },
      alpha: { from: 0.5, to: 0.8 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    this.portalContainer = container;

    // Hint text above portal
    this.portalHint = this.add.text(px, py - 56, `🌀 Walk in to enter\n${branchName}`, {
      fontSize: "12px",
      color: "#c0e0ff",
      align: "center",
      stroke: "#000",
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9001);

    // Pulsing hint
    this.tweens.add({
      targets: this.portalHint,
      alpha: { from: 0.7, to: 1 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    // Physics zone for overlap detection
    this.portalZone = this.add.circle(px, py, 28, 0x000000, 0);
    this.physics.add.existing(this.portalZone, true);
    (this.portalZone.body as Phaser.Physics.Arcade.Body).setCircle(28, 0, 0);

    this.portalCollider = this.physics.add.overlap(this.player, this.portalZone, () => {
      this.closePortal();
      this.enterWorldPortal(branchName, worldUrl);
    });

    this.store.toast(`Portal opened — walk in to enter ${branchName}`);
  }

  /** Close and destroy the active portal. */
  closePortal(): void {
    if (this.portalCollider) {
      this.portalCollider.destroy();
      this.portalCollider = null;
    }
    if (this.portalZone) {
      this.portalZone.destroy();
      this.portalZone = null;
    }
    if (this.portalContainer) {
      this.portalContainer.destroy();
      this.portalContainer = null;
    }
    if (this.portalHint) {
      this.portalHint.destroy();
      this.portalHint = null as any;
    }
    this.store.portalTarget = null;
  }

  /** Spawn a return portal at the player spawn point (used inside deployed worlds). */
  private spawnReturnPortal(): void {
    if (!this.store.currentWorld) return;

    const spawn = feetOf(this.spawnTile);
    const px = spawn.x;
    const py = spawn.y;

    // Create return portal visual (green-tinted to distinguish from entry portal)
    const container = this.add.container(px, py - 20);
    container.setDepth(9000);

    const outerRing = this.add.circle(0, 0, 36, 0x2a6a4a, 0.15)
      .setStrokeStyle(3, 0x5ad6a0, 0.6);
    const innerRing = this.add.circle(0, 0, 24, 0x1a4a2a, 0.3)
      .setStrokeStyle(2, 0x8ff0c0, 0.8);
    const core = this.add.circle(0, 0, 14, 0x0a2a1a, 0.5)
      .setStrokeStyle(1, 0xc0ffd0, 0.9);

    container.add([outerRing, innerRing, core]);

    this.tweens.add({
      targets: outerRing,
      scale: { from: 1, to: 1.3 },
      alpha: { from: 0.15, to: 0.05 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
    this.tweens.add({
      targets: innerRing,
      scale: { from: 1, to: 0.8 },
      alpha: { from: 0.3, to: 0.6 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
    this.tweens.add({
      targets: core,
      scale: { from: 1, to: 1.15 },
      alpha: { from: 0.5, to: 0.8 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    this.portalContainer = container;

    // Hint text
    this.portalHint = this.add.text(px, py - 60, "🌀 Return to HQ", {
      fontSize: "12px",
      color: "#c0ffd0",
      align: "center",
      stroke: "#000",
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9001);

    this.tweens.add({
      targets: this.portalHint,
      alpha: { from: 0.7, to: 1 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    // Physics overlap
    this.portalZone = this.add.circle(px, py - 20, 28, 0x000000, 0);
    this.physics.add.existing(this.portalZone, true);
    (this.portalZone.body as Phaser.Physics.Arcade.Body).setCircle(28, 0, 0);

    this.portalCollider = this.physics.add.overlap(this.player, this.portalZone, () => {
      this.exitWorld();
    });
  }

  /** Set up input listeners for pinch-zoom, wheel-zoom, pan, and tap-to-walk. */
  private setupCameraControls(): void {
    // Enable multi-touch (Phaser needs to be told to track extra pointers)
    this.input.addPointer(2);

    // ── Recenter camera event (from HUD recenter button) ──
    const onRecenter = () => this.recenterCamera();
    window.addEventListener("recenter-camera", onRecenter);
    this.events.once("shutdown", () => window.removeEventListener("recenter-camera", onRecenter));

    // ── Wheel zoom (desktop) ──
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const factor = dy > 0 ? 0.9 : 1.1;
      const newZoom = this.clampZoom(cam.zoom * factor);
      cam.setZoom(newZoom);
      this.userZoom = newZoom;
    });

    // ── Pointer down: track for pinch, pan, or tap-to-walk ──
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // Ignore clicks on interactive game objects (agents, monitors) — they have their own handlers
      if (this.input.manager.hitTest(pointer, [], this.cameras.main).length > 0) return;

      this.pinchPointers.set(pointer.id, pointer);
      this.tapStartX = pointer.x;
      this.tapStartY = pointer.y;
      this.tapMoved = false;

      if (this.pinchPointers.size === 2) {
        // Start pinch-zoom
        const pts = [...this.pinchPointers.values()];
        this.pinchStartDist = Phaser.Math.Distance.Between(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
        this.pinchStartZoom = this.cameras.main.zoom;
        this.panPointer = null;
      } else if (this.pinchPointers.size === 1) {
        // Potential pan or tap — track as pan candidate
        this.panPointer = pointer;
        this.panStartScrollX = this.cameras.main.scrollX;
        this.panStartScrollY = this.cameras.main.scrollY;
      }
    });

    // ── Pointer move: handle pinch-zoom, pan, and tap movement detection ──
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.pinchPointers.has(pointer.id)) return;

      // Detect if this is a tap vs drag
      const moveDist = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.tapStartX, this.tapStartY);
      if (moveDist > 10) this.tapMoved = true;

      if (this.pinchPointers.size === 2) {
        // Pinch-zoom
        const pts = [...this.pinchPointers.values()];
        const dist = Phaser.Math.Distance.Between(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
        if (this.pinchStartDist > 0) {
          const ratio = dist / this.pinchStartDist;
          const newZoom = this.clampZoom(this.pinchStartZoom * ratio);
          this.cameras.main.setZoom(newZoom);
          this.userZoom = newZoom;
        }
        return;
      }

      // One-finger pan (only in free mode or if moved significantly)
      if (this.panPointer === pointer && this.tapMoved && this.cameraMode === "free") {
        const cam = this.cameras.main;
        const dx = (pointer.x - this.panPointer.downX) / cam.zoom;
        const dy = (pointer.y - this.panPointer.downY) / cam.zoom;
        cam.scrollX = this.panStartScrollX - dx;
        cam.scrollY = this.panStartScrollY - dy;
      }
    });

    // ── Pointer up: handle tap-to-walk or finalize pinch/pan ──
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      this.pinchPointers.delete(pointer.id);

      if (this.panPointer === pointer) {
        // If it was a tap (not a drag) and no pinch happened, do tap-to-walk
        if (!this.tapMoved && this.pinchPointers.size === 0) {
          this.handleTapToWalk(pointer);
        }
        this.panPointer = null;
      }

      // If one pointer remains after pinch, keep it as pan candidate
      if (this.pinchPointers.size === 1) {
        const remaining = [...this.pinchPointers.values()][0];
        this.panPointer = remaining;
        this.panStartScrollX = this.cameras.main.scrollX;
        this.panStartScrollY = this.cameras.main.scrollY;
        this.tapMoved = true; // prevent tap-to-walk after pinch
      }
    });

    // ── Two-finger pan: switch to free mode when user starts dragging with 2 fingers ──
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.pinchPointers.size === 2 && this.cameraMode === "follow") {
        // Two-finger gesture implies user wants to look around
        this.cameraMode = "free";
        this.cameras.main.stopFollow();
      }
    });
  }

  /** Handle a tap on the game world: walk to interactable (mobile only). */
  private handleTapToWalk(pointer: Phaser.Input.Pointer): void {
    if (this.inPhoneBooth) return;
    if (!isTouchDevice()) return; // Desktop uses WASD + click agents directly
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

    // Check if tapping near an interactable — walk to it and interact
    const interactable = this.findInteractableAt(worldPoint.x, worldPoint.y);
    if (interactable) {
      const dest = this.findAdjacentWalkable(interactable.tile);
      if (dest) {
        this.walkToTile(dest);
        this.pendingInteract = true;
        this.showPathMarker(dest);
        return;
      }
    }

    // Tap empty ground: walk there (mobile only)
    this.pendingInteract = false;
    const targetTile = tileOf(worldPoint.x, worldPoint.y);
    const outside = this.world.isOutside(worldPoint.x, worldPoint.y);
    if (outside) {
      this.playerPath = [];
      this.playerTargetPx = { x: worldPoint.x, y: worldPoint.y };
      this.showPathMarkerPx(worldPoint.x, worldPoint.y);
    } else {
      this.walkToTile(targetTile);
      this.showPathMarker(targetTile);
    }
  }

  /** Walk player to a tile using A* pathfinding (office only). */
  private walkToTile(dest: Tile): void {
    this.playerTargetPx = null;
    const start = tileOf(this.player.x, this.player.y);
    if (start.x === dest.x && start.y === dest.y) {
      this.playerPath = [];
      return;
    }
    const path = findPath(this.grid, start, dest);
    this.playerPath = path;
  }

  /** Walk to an agent/NPC and then select+talk to them on arrival (mobile only). */
  private walkToAgent(id: string): void {
    // Desktop: select immediately, no walking
    if (!isTouchDevice()) {
      this.selectAgent(id);
      return;
    }

    // Mobile: walk to the agent first, then select on arrival
    let npcX = 0, npcY = 0;
    if (id === AGENT_RESOURCES_ID && this.agentResources) {
      npcX = this.agentResources.container.x;
      npcY = this.agentResources.container.y;
    } else if (id === HERMES_ID && this.hermes) {
      npcX = this.hermes.container.x;
      npcY = this.hermes.container.y;
    } else {
      const npc = this.npcs.get(id);
      if (!npc) return;
      npcX = npc.container.x;
      npcY = npc.container.y;
    }

    // If already close enough, just interact now
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, npcX, npcY);
    if (dist < 144) {
      this.selectAgent(id);
      return;
    }

    // Walk to a tile adjacent to the agent, then interact
    const agentTile = tileOf(npcX, npcY);
    const dest = this.findAdjacentWalkable(agentTile);
    if (dest) {
      this.walkToTile(dest);
      this.pendingAgentId = id;
      this.pendingInteract = false;
      this.showPathMarker(dest);
    } else {
      // No walkable adjacent tile — just select directly
      this.selectAgent(id);
    }
  }

  /** Select an agent and open chat. */
  private selectAgent(id: string): void {
    this.store.select(id);
    if (id === AGENT_RESOURCES_ID) achievements.unlock("agent-resources_visit");
    setTimeout(() => {
      (document.getElementById("d-chat") as HTMLInputElement | null)?.focus();
    }, 0);
  }

  /** Show a visual marker at a tile destination. */
  private showPathMarker(tile: Tile): void {
    this.showPathMarkerPx(tile.x * TILE_PX + 32, tile.y * TILE_PX + 32);
  }

  /** Show a visual marker at a pixel position. */
  private showPathMarkerPx(px: number, py: number): void {
    if (this.pathMarker) this.pathMarker.destroy();
    this.pathMarker = this.add.circle(px, py, 8, 0x4a9cd8, 0.7)
      .setStrokeStyle(2, 0xffffff, 0.5)
      .setDepth(9999);
    this.tweens.add({
      targets: this.pathMarker,
      alpha: 0,
      scale: 2,
      duration: 600,
      repeat: -1,
      onRepeat: () => { if (this.pathMarker) this.pathMarker.setAlpha(0.7).setScale(1); },
    });
  }

  /** Clear the path marker. */
  private clearPathMarker(): void {
    if (this.pathMarker) {
      this.pathMarker.destroy();
      this.pathMarker = null;
    }
  }

  /** Find a walkable tile adjacent to the given tile. */
  private findAdjacentWalkable(tile: Tile): Tile | null {
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const;
    const outside = this.world.isOutside(tile.x * TILE_PX + 32, tile.y * TILE_PX + 32);
    for (const [dx, dy] of dirs) {
      const x = tile.x + dx;
      const y = tile.y + dy;
      if (outside) {
        if (this.world.isTileWalkable(
          Math.floor((x * TILE_PX - this.world.offset.x) / TILE_PX),
          Math.floor((y * TILE_PX - this.world.offset.y) / TILE_PX),
        )) return { x, y };
      } else {
        if (this.grid.ok(x, y)) return { x, y };
      }
    }
    return null;
  }

  /** Type for a tappable interactable. */
  private findInteractableAt(wx: number, wy: number): { tile: Tile; pxX: number; pxY: number; radius: number } | null {
    type Hit = { tile: Tile; pxX: number; pxY: number; radius: number };
    const candidates: Hit[] = [
      { tile: this.coffeeTile, pxX: this.coffeeTile.x * TILE_PX + 32, pxY: this.coffeeTile.y * TILE_PX + 32, radius: 96 },
      { tile: this.boardTile, pxX: this.boardTile.x * TILE_PX + 32, pxY: this.boardTile.y * TILE_PX + 52, radius: 96 },
      { tile: this.fridgeTile, pxX: this.fridgeTile.x * TILE_PX + 32, pxY: this.fridgeTile.y * TILE_PX + 32, radius: 96 },
      { tile: this.coolerTile, pxX: this.coolerTile.x * TILE_PX + 32, pxY: this.coolerTile.y * TILE_PX + 32, radius: 96 },
      { tile: this.clockTile, pxX: this.clockTile.x * TILE_PX + 32, pxY: this.clockTile.y * TILE_PX + 32, radius: 96 },
      { tile: this.wardrobeTile, pxX: this.wardrobeTile.x * TILE_PX + 32, pxY: this.wardrobeTile.y * TILE_PX + 32, radius: 96 },
      { tile: this.trophyTile, pxX: this.trophyTile.x * TILE_PX + 32, pxY: this.trophyTile.y * TILE_PX + 40, radius: 96 },
      { tile: this.hallOfFameTile, pxX: this.hallOfFameTile.x * TILE_PX + 10, pxY: this.hallOfFameTile.y * TILE_PX + 32, radius: 96 },
      { tile: this.redButtonTile, pxX: this.redButtonTile.x * TILE_PX + 32, pxY: this.redButtonTile.y * TILE_PX + 32, radius: 96 },
      { tile: this.projectorControlTile, pxX: this.projectorControlTile.x * TILE_PX + 32, pxY: this.projectorControlTile.y * TILE_PX + 32, radius: 80 },
      { tile: this.projectorSpeakerTile, pxX: this.projectorSpeakerTile.x * TILE_PX + 32, pxY: this.projectorSpeakerTile.y * TILE_PX + 32, radius: 80 },
      { tile: this.screenShareTile, pxX: this.screenShareTile.x * TILE_PX + 32, pxY: this.screenShareTile.y * TILE_PX + 32, radius: 80 },
      { tile: this.phoneBoothTile, pxX: this.phoneBoothTile.x * TILE_PX + 32, pxY: this.phoneBoothTile.y * TILE_PX + 32, radius: 80 },
      { tile: this.warTableTile, pxX: this.warTableTile.x * TILE_PX + 32, pxY: this.warTableTile.y * TILE_PX + 32, radius: 96 },
      { tile: this.scrapBinTile, pxX: this.scrapBinTile.x * TILE_PX + 32, pxY: this.scrapBinTile.y * TILE_PX + 32, radius: 96 },
      { tile: this.radioTile, pxX: this.radioTile.x * TILE_PX + 32, pxY: this.radioTile.y * TILE_PX + 32, radius: 96 },
      { tile: this.workbenchTile, pxX: this.workbenchTile.x * TILE_PX + 32, pxY: this.workbenchTile.y * TILE_PX + 32, radius: 96 },
      { tile: this.researchTile, pxX: this.researchTile.x * TILE_PX + 32, pxY: this.researchTile.y * TILE_PX + 32, radius: 96 },
    ];

    if (this.vendingTile) {
      candidates.push({ tile: this.vendingTile, pxX: this.vendingTile.x * TILE_PX + 32, pxY: this.vendingTile.y * TILE_PX + 32, radius: 96 });
    }
    if (this.sofaTile) {
      candidates.push({ tile: this.sofaTile, pxX: this.sofaTile.x * TILE_PX + 32, pxY: this.sofaTile.y * TILE_PX + 32, radius: 96 });
    }
    for (const ft of this.filingTiles) {
      candidates.push({ tile: ft, pxX: ft.x * TILE_PX + 32, pxY: ft.y * TILE_PX + 32, radius: 80 });
    }
    for (const pt of this.plantTiles) {
      candidates.push({ tile: pt, pxX: pt.x * TILE_PX + 32, pxY: pt.y * TILE_PX + 32, radius: 80 });
    }
    for (const pm of this.platformMailboxes) {
      candidates.push({ tile: pm.tile, pxX: pm.tile.x * TILE_PX + TILE_PX / 2, pxY: pm.tile.y * TILE_PX + TILE_PX / 2, radius: 80 });
    }
    for (const sr of this.serverRackTiles) {
      candidates.push({ tile: sr, pxX: sr.x * TILE_PX + 32, pxY: sr.y * TILE_PX + 32, radius: 96 });
    }
    // Mailbox
    candidates.push({ tile: { x: 0, y: 0 }, pxX: this.mailboxPx.x, pxY: this.mailboxPx.y, radius: 80 });

    let best: Hit | null = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const d = Phaser.Math.Distance.Between(wx, wy, c.pxX, c.pxY);
      if (d < c.radius && d < bestDist) {
        best = c;
        bestDist = d;
      }
    }
    return best;
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

  /** Create a standard proximity hint with dark bg, key badge, and white text. */
  private makeHint(): HintTag {
    return createHintTag(this);
  }

  /** Set interactable tile positions based on the current theme. */
  private setupInteractables(): void {
    if (this.theme === "agentHeights") {
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

  /** Build platform mailbox objects from settings + catalog. */
  private buildPlatformMailboxes(): PlatformMailbox[] {
    const slots = this.store.settings.mailboxPlatforms ?? [null, null, null, null, null, null];
    return MAILBOX_TILES.map((tile, i) => {
      const platform = slots[i] ?? null;
      const entry = platform ? getPlatformEntry(platform) : undefined;
      const color = entry?.color ?? UNASSIGNED_COLOR;
      return {
        platform,
        color,
        colorLight: Phaser.Display.Color.IntegerToColor(color).lighten(20).color,
        colorDark: Phaser.Display.Color.IntegerToColor(color).darken(20).color,
        tile: { x: tile.x, y: tile.y },
        flagUp: false,
        pendingCount: 0,
        lastMessage: "",
        slotIndex: i,
      };
    });
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

    // Unassigned mailbox — show platform picker
    if (!nearest.platform) {
      this.showPlatformPickerModal(nearest.slotIndex);
      return true;
    }

    const platform = nearest.platform;
    const slotIndex = nearest.slotIndex;
    const connected = this.store.isPlatformConnected(platform);

    // Show a small action menu for the assigned mailbox
    this.showMailboxActionModal(platform, slotIndex, connected);
    return true;
  }

  /** Show a small action menu for an assigned mailbox: check, configure, change, or unassign. */
  private showMailboxActionModal(platform: string, slotIndex: number, connected: boolean): void {
    const net = this.game.registry.get("net") as import("../net").Net;

    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.55); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      font-family: 'M PLUS Rounded 1c', system-ui, sans-serif;
    `;

    const card = document.createElement("div");
    card.style.cssText = `
      background: #f5f0e6; border: 3px solid #d4c5a9; border-radius: 16px;
      width: 360px; box-shadow: 0 12px 48px rgba(0,0,0,0.3); overflow: hidden;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      background: #e8dcc8; border-bottom: 2px solid #d4c5a9;
      padding: 16px 24px; display: flex; align-items: center; gap: 12px;
    `;
    const entry = getPlatformEntry(platform);
    const colorHex = entry ? "#" + entry.color.toString(16).padStart(6, "0") : "#888";
    const logoSlug = PLATFORM_ICON_SLUGS[platform];
    const logoHtml = logoSlug
      ? `<img src="https://cdn.simpleicons.org/${logoSlug}" alt="${platform}" style="width:20px;height:20px;flex-shrink:0;object-fit:contain;" onerror="this.style.display='none'">`
      : `<span style="width:20px;height:20px;border-radius:5px;background:${colorHex};border:2px solid rgba(0,0,0,0.15);flex-shrink:0;"></span>`;
    header.innerHTML = `
      ${logoHtml}
      <span style="font-size:18px;font-weight:bold;color:#3d3528;flex:1;">${platform} Mailbox</span>
      <span style="font-size:13px;font-weight:bold;color:${connected ? "#4a9b4a" : "#b07050"};">
        ${connected ? "● Connected" : "○ Not connected"}
      </span>
    `;
    card.appendChild(header);

    const body = document.createElement("div");
    body.style.cssText = "padding: 16px 20px; display: flex; flex-direction: column; gap: 10px;";

    const makeBtn = (label: string, color: string, onclick: () => void) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.style.cssText = `
        padding: 12px 16px; border: 2px solid ${color}; border-radius: 10px;
        background: none; color: ${color}; font-size: 15px; font-weight: bold;
        cursor: pointer; font-family: inherit; text-align: left;
        transition: background 0.2s;
      `;
      btn.addEventListener("mouseenter", () => { btn.style.background = `${color}15`; });
      btn.addEventListener("mouseleave", () => { btn.style.background = "none"; });
      btn.onclick = onclick;
      return btn;
    };

    if (connected) {
      body.appendChild(makeBtn("📬 Check Messages", "#4a9b4a", () => {
        overlay.remove();
        net.send({ type: "check_mailbox", platform });
        let responded = false;
        const timeout = this.time.delayedCall(2000, () => {
          if (!responded) {
            responded = true;
            this.store.toast(`[${platform}] No response from server. Make sure you're in your office.`);
          }
        });
        const onMessages = (respPlatform: string, _events: any[]) => {
          if (responded || respPlatform !== platform) return;
          responded = true;
          timeout.remove();
          this.store.offMailboxMessages(onMessages);
        };
        this.store.onMailboxMessages(onMessages);
      }));
    } else {
      body.appendChild(makeBtn("⚙ Set Up / Configure", "#8b7355", () => {
        overlay.remove();
        this.showPlatformConnectModal(platform);
        net.send({ type: "connect_platform", platform });
      }));
    }

    body.appendChild(makeBtn("🔄 Change Platform", "#6c5ce7", () => {
      overlay.remove();
      this.showPlatformPickerModal(slotIndex);
    }));

    body.appendChild(makeBtn("✕ Unassign Mailbox", "#b07050", () => {
      net.send({ type: "set_mailbox_platform", slot: slotIndex, platform: null });
      overlay.remove();
    }));

    card.appendChild(body);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.cssText = `
      margin: 0 20px 16px; padding: 8px; background: none; border: 2px solid #8b7355;
      border-radius: 8px; color: #8b7355; font-size: 13px; font-weight: bold;
      cursor: pointer; font-family: inherit;
    `;
    closeBtn.onclick = () => overlay.remove();
    card.appendChild(closeBtn);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  }

  /** Show a conversation thread modal for a platform mailbox with reply capability. */
  private showMailboxConversationModal(platform: string, events: PlatformEvent[]): void {
    const net = this.game.registry.get("net") as import("../net").Net;
    const entry = getPlatformEntry(platform);
    const colorHex = entry ? "#" + entry.color.toString(16).padStart(6, "0") : "#888";
    const logoSlug = PLATFORM_ICON_SLUGS[platform];

    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.55); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      font-family: 'M PLUS Rounded 1c', system-ui, sans-serif;
    `;

    const card = document.createElement("div");
    card.style.cssText = `
      background: #f5f0e6; border: 3px solid #d4c5a9; border-radius: 16px;
      width: 480px; max-height: 80vh; box-shadow: 0 12px 48px rgba(0,0,0,0.3);
      overflow: hidden; display: flex; flex-direction: column;
    `;

    // Header
    const header = document.createElement("div");
    header.style.cssText = `
      background: #e8dcc8; border-bottom: 2px solid #d4c5a9;
      padding: 14px 20px; display: flex; align-items: center; gap: 10px;
    `;
    const logoHtml = logoSlug
      ? `<img src="https://cdn.simpleicons.org/${logoSlug}" alt="${platform}" style="width:22px;height:22px;flex-shrink:0;object-fit:contain;" onerror="this.style.display='none'">`
      : `<span style="width:22px;height:22px;border-radius:6px;background:${colorHex};border:2px solid rgba(0,0,0,0.15);flex-shrink:0;"></span>`;
    header.innerHTML = `${logoHtml}<span style="font-size:17px;font-weight:bold;color:#3d3528;flex:1;">${platform} Inbox</span><span style="font-size:12px;color:#8b7355;">${events.length} message${events.length > 1 ? "s" : ""}</span>`;
    card.appendChild(header);

    // Message list (scrollable)
    const list = document.createElement("div");
    list.style.cssText = "flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px;";

    for (const ev of events) {
      const msg = document.createElement("div");
      const isInbound = ev.direction === "inbound";
      msg.style.cssText = `
        padding: 10px 14px; border-radius: 12px; max-width: 85%;
        ${isInbound
          ? "background: #fff; border: 1px solid #e0d8c8; align-self: flex-start;"
          : "background: #e3f2e3; border: 1px solid #c8e0c8; align-self: flex-end;"}
      `;
      const time = new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const dirIcon = isInbound ? "←" : "→";
      msg.innerHTML = `
        <div style="font-size:11px;color:#8b7355;margin-bottom:4px;">${dirIcon} <b>${ev.sender}</b> · ${time}</div>
        <div style="font-size:14px;color:#3d3528;word-wrap:break-word;">${ev.text.slice(0, 500)}</div>
      `;
      list.appendChild(msg);
    }
    card.appendChild(list);

    // Reply area
    const replyArea = document.createElement("div");
    replyArea.style.cssText = "padding: 12px 16px; border-top: 2px solid #d4c5a9; display: flex; gap: 8px;";

    const replyInput = document.createElement("input");
    replyInput.type = "text";
    replyInput.placeholder = "Reply to last sender...";
    replyInput.style.cssText = `
      flex: 1; padding: 10px 12px; border: 2px solid #d4c5a9; border-radius: 10px;
      font-size: 14px; font-family: inherit; outline: none; background: #fff;
    `;
    replyArea.appendChild(replyInput);

    // Pre-fill target with last inbound sender
    const lastInbound = events.find((e) => e.direction === "inbound");
    if (lastInbound) {
      replyInput.placeholder = `Reply to ${lastInbound.sender}...`;
    }

    const sendBtn = document.createElement("button");
    sendBtn.textContent = "Send";
    sendBtn.style.cssText = `
      padding: 10px 20px; border: 2px solid #4a9b4a; border-radius: 10px;
      background: #4a9b4a; color: #fff; font-size: 14px; font-weight: bold;
      cursor: pointer; font-family: inherit; white-space: nowrap;
    `;
    sendBtn.addEventListener("mouseenter", () => { sendBtn.style.background = "#3a8b3a"; });
    sendBtn.addEventListener("mouseleave", () => { sendBtn.style.background = "#4a9b4a"; });
    sendBtn.onclick = () => {
      const text = replyInput.value.trim();
      if (!text) return;
      const target = lastInbound?.sender ?? "";
      net.send({ type: "reply_mailbox", platform, target, text });
      // Add optimistic outbound message to the list
      const msg = document.createElement("div");
      msg.style.cssText = "padding: 10px 14px; border-radius: 12px; max-width: 85%; background: #e3f2e3; border: 1px solid #c8e0c8; align-self: flex-end;";
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      msg.innerHTML = `
        <div style="font-size:11px;color:#8b7355;margin-bottom:4px;">→ <b>You</b> · ${time}</div>
        <div style="font-size:14px;color:#3d3528;word-wrap:break-word;">${text.slice(0, 500)}</div>
      `;
      list.appendChild(msg);
      list.scrollTop = list.scrollHeight;
      replyInput.value = "";
    };
    replyInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendBtn.click(); });
    replyArea.appendChild(sendBtn);
    card.appendChild(replyArea);

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.cssText = `
      margin: 0 16px 12px; padding: 8px; background: none; border: 2px solid #8b7355;
      border-radius: 8px; color: #8b7355; font-size: 13px; font-weight: bold;
      cursor: pointer; font-family: inherit;
    `;
    closeBtn.onclick = () => overlay.remove();
    card.appendChild(closeBtn);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  }

  /** Platform-specific setup steps for the connect modal. */
  private static readonly PLATFORM_SETUP_STEPS: Record<string, { title: string; body: string; cmd?: string }[]> = {
    Slack: [
      {
        title: "Slack — Create a Slack App",
        body: `1. Go to https://api.slack.com/apps\n2. Click "Create New App" → "From scratch"\n3. Name it (e.g. "Agent Heights Bot")\n4. Pick your workspace → Create App`,
      },
      {
        title: "Slack — Add Bot Scopes",
        body: `1. Left sidebar → "OAuth & Permissions"\n2. Under "Bot Token Scopes" add:\n   - chat:write\n   - channels:history\n   - channels:read\n   - groups:history\n   - groups:read\n   - im:history\n   - im:write\n   - mpim:history`,
      },
      {
        title: "Slack — Install & Copy Tokens",
        body: `1. Click "Install to Workspace" at the top\n2. Authorize the app\n3. Copy the "Bot User OAuth Token"\n   (starts with xoxb-)\n4. Go to Basic Information →\n   App-Level Tokens → Generate Token\n   with scope connections:write\n   (starts with xapp-)`,
      },
      {
        title: "Slack — Invite Bot to Channels",
        body: `In Slack, invite your bot to any channel\nwhere agents should receive messages:\n\n  /invite @Agent Heights Bot\n\nOnce done, interact with the Slack mailbox\nagain to check messages.`,
      },
    ],
    Discord: [
      {
        title: "Discord — Create Application",
        body: `1. Go to https://discord.com/developers/applications\n2. Click "New Application"\n3. Name it (e.g. "Agent Heights") → Create`,
      },
      {
        title: "Discord — Add a Bot",
        body: `1. Left sidebar → "Bot"\n2. Click "Add Bot" → Yes, do it!\n3. Under "Privileged Gateway Intents" enable:\n   - Message Content Intent\n   - Server Members Intent\n4. Click "Save Changes"`,
      },
      {
        title: "Discord — Copy Bot Token",
        body: `1. Still on the Bot page, click\n   "Reset Token" (or "Copy" if visible)\n2. Copy the token — store it safely,\n   it won't be shown again`,
      },
      {
        title: "Discord — Invite Bot to Server",
        body: `1. Left sidebar → "OAuth2" → "URL Generator"\n2. Under Scopes check: bot\n3. Under Bot Permissions check:\n   - Send Messages\n   - Read Message History\n4. Open the generated URL in your browser\n5. Select your server → Authorize`,
      },
    ],
    Telegram: [
      {
        title: "Telegram — Create a Bot",
        body: `1. Open Telegram and message @BotFather\n2. Send: /newbot\n3. Give it a name (e.g. "Agent Heights")\n4. Give it a username ending in "bot"\n   (e.g. "agent_heights_bot")`,
      },
      {
        title: "Telegram — Copy Bot Token",
        body: `BotFather will respond with an HTTP API\ntoken that looks like:\n\n  123456789:ABCdefGHIjklMNOpqrSTUvwxYZ\n\nCopy this token — you'll need it below.`,
      },
    ],
    WhatsApp: [
      {
        title: "WhatsApp — Set Up Twilio",
        body: `WhatsApp Business API requires a provider.\nTwilio is the easiest:\n\n1. Sign up at https://www.twilio.com\n2. Navigate to Messaging → WhatsApp\n3. Activate the WhatsApp sandbox (free)\n   or apply for production access`,
      },
      {
        title: "WhatsApp — Copy Credentials",
        body: `From the Twilio console, copy:\n   - Account SID (starts with AC...)\n   - Auth Token\n   - Your WhatsApp number\n     (sandbox: +14155238886)`,
      },
    ],
    Signal: [
      {
        title: "Signal — Register a Number",
        body: `Signal requires a dedicated phone number\nregistered via signal-cli.\n\n1. Install signal-cli on your server:\n     sudo apt install signal-cli\n2. Register a number:\n     signal-cli -u +15551234567 register\n3. Verify with the SMS code:\n     signal-cli -u +15551234567 verify 123-456`,
        cmd: "signal-cli -u +15551234567 register",
      },
    ],
    Email: [
      {
        title: "Email — Create an App Password",
        body: `Hermes connects via IMAP/SMTP.\n\nFor Gmail:\n1. Enable 2-Step Verification\n2. Go to https://myaccount.google.com/apppasswords\n3. Generate an app password for "Mail"\n4. Copy the 16-character password\n\nFor other providers, use your IMAP/SMTP\ncredentials directly.`,
      },
      {
        title: "Email — Note IMAP/SMTP Settings",
        body: `You'll need:\n   - IMAP server (e.g. imap.gmail.com)\n   - IMAP port (usually 993, SSL)\n   - SMTP server (e.g. smtp.gmail.com)\n   - SMTP port (usually 587, TLS)\n   - Email address\n   - App password`,
      },
    ],
    SMS: [
      {
        title: "SMS — Set Up Twilio",
        body: `SMS messaging uses Twilio as the\nprovider.\n\n1. Sign up at https://www.twilio.com\n2. Navigate to Phone Numbers\n3. Buy or claim a phone number\n   (trial numbers work for testing)`,
      },
      {
        title: "SMS — Copy Credentials",
        body: `From the Twilio console, copy:\n   - Account SID (starts with AC...)\n   - Auth Token\n   - Your Twilio phone number\n     (e.g. +15551234567)\n\nMake sure the number has SMS\ncapabilities enabled.`,
      },
    ],
    "Microsoft Teams": [
      {
        title: "Teams — Register an App",
        body: `1. Go to https://entra.microsoft.com\n   (Microsoft Entra ID, formerly Azure AD)\n2. App registrations → New registration\n3. Name it (e.g. "Agent Heights Bot")\n4. Supported account types:\n   "Single tenant" is fine for most\n5. Click Register`,
      },
      {
        title: "Teams — Create a Bot",
        body: `1. Go to https://dev.teams.microsoft.com/bots\n2. Click "New Bot"\n3. Name it and select your tenant\n4. Copy the Bot ID (App ID)\n5. Generate a client secret and copy it\n   (this is your Bot Password)`,
      },
      {
        title: "Teams — Copy Credentials",
        body: `You'll need three values:\n   - App (Bot) ID — from the bot portal\n   - Tenant ID — from Entra ID overview\n   - Bot Password — the client secret\n   you generated\n\nKeep these safe — you'll enter them\nin the next step.`,
      },
    ],
    "Google Chat": [
      {
        title: "Google Chat — Create a Project",
        body: `1. Go to https://console.cloud.google.com\n2. Create a new project\n   (e.g. "agent-heights-chat")\n3. Enable the Google Chat API\n   from the API Library`,
      },
      {
        title: "Google Chat — Create a Service Account",
        body: `1. IAM & Admin → Service Accounts\n2. Create a service account\n3. Grant it the Chat API scope\n4. Create a JSON key and download it\n\nThe JSON file contains your\nproject_id and service account\ncredentials.`,
      },
      {
        title: "Google Chat — Configure the App",
        body: `1. Go to the Chat API configuration page\n2. Set up your bot app:\n   - Name: "Agent Heights"\n   - Avatar URL (optional)\n   - Functionality: Bot\n3. Add the service account email\n   as an authorized user\n4. Copy the Project ID and the\n   full service account JSON`,
      },
    ],
    Matrix: [
      {
        title: "Matrix — Choose a Homeserver",
        body: `Matrix is a federated protocol — you\nneed a homeserver account.\n\nOptions:\n   - matrix.org (free, public)\n   - self-host (e.g. Synapse, Dendrite)\n   -EMS (Element Matrix Services)\n\nCreate an account for your bot.`,
      },
      {
        title: "Matrix — Get an Access Token",
        body: `1. Log in to your homeserver as the bot\n   account (via Element or curl)\n2. Get the access token from\n   Settings → Help & About → Access Token\n   (in Element desktop)\n\nOr via API:\n   curl -XPOST https://matrix.org/_matrix/client/v3/login\n     -d '{"type":"m.login.password",\n          "identifier":{"type":"m.id.user",\n          "user":"botname"},\n          "password":"..."}'`,
      },
      {
        title: "Matrix — Copy Credentials",
        body: `You'll need:\n   - Homeserver URL\n     (e.g. https://matrix.org)\n   - Access Token (starts with syt_...)\n   - User ID (e.g. @bot:matrix.org)\n\nMake sure the bot is invited to\nany rooms where agents should\nreceive messages.`,
      },
    ],
    Mattermost: [
      {
        title: "Mattermost — Set Up Your Server",
        body: `Mattermost is self-hosted chat.\n\n1. Install Mattermost or use an\n   existing server\n2. Create a bot account:\n   System Console → Bot Accounts\n   (enable if needed)\n3. Integrations → Bot Accounts\n   → Create Bot`,
      },
      {
        title: "Mattermost — Copy Credentials",
        body: `You'll need:\n   - Server URL (e.g. https://chat.example.com)\n   - Bot Token (from the bot account)\n   - Team Name (e.g. "engineering")\n\nInvite the bot to channels where\nagents should receive messages.`,
      },
    ],
    LINE: [
      {
        title: "LINE — Create a Provider",
        body: `1. Go to https://developers.line.biz\n2. Log in with a LINE account\n3. Create a Provider\n4. Create a Messaging API channel\n5. Name it (e.g. "Agent Heights")`,
      },
      {
        title: "LINE — Copy Credentials",
        body: `From the channel settings page:\n   - Channel Access Token\n     (issue via "Issue" button)\n   - Channel Secret\n   (found under "Channel secret")\n\nConfigure your webhook URL to point\nto your Hermes gateway.`,
      },
    ],
    IRC: [
      {
        title: "IRC — Choose a Network",
        body: `IRC is a classic chat protocol.\n\n1. Pick an IRC network\n   (e.g. irc.libera.chat, irc.oftc.net)\n2. Register a nickname for your bot\n   via NickServ\n3. Note the server address and port\n   (usually 6697 for TLS)`,
      },
      {
        title: "IRC — Identify Channels",
        body: `List the channels the bot should join\nand monitor, e.g.:\n   #general, #support, #dev\n\nMake sure the bot nickname is\nregistered and identified with\nNickServ so it can join restricted\nchannels.`,
      },
    ],
    BlueBubbles: [
      {
        title: "BlueBubbles — Install the Server",
        body: `BlueBubbles lets you send/receive\niMessage programmatically.\n\n1. You need a Mac that's always on\n2. Download BlueBubbles Server\n   from https://bluebubbles.app\n3. Install and launch the server\n4. Follow the setup wizard to connect\n   your iMessage account`,
      },
      {
        title: "BlueBubbles — Copy Credentials",
        body: `From the BlueBubbles Server UI:\n   - Server URL (e.g. http://192.168.1.100:1234)\n   - Password (set during setup)\n\nMake sure the server is accessible\nfrom your Hermes gateway host.`,
      },
    ],
    ntfy: [
      {
        title: "ntfy — Choose a Server",
        body: `ntfy is a simple push notification\nservice.\n\n1. Use the public server at\n   https://ntfy.sh (free)\n   or self-host your own\n2. Pick a topic name for your agents\n   (e.g. "agent-heights-msgs")\n3. Subscribe to the topic in the\n   ntfy app on your phone`,
      },
      {
        title: "ntfy — Copy Credentials",
        body: `You'll need:\n   - Server URL (e.g. https://ntfy.sh)\n   - Topic name\n\nNo authentication needed for the\npublic server. For self-hosted,\nadd an access token if configured.`,
      },
    ],
    SimpleX: [
      {
        title: "SimpleX — Set Up via Hermes",
        body: `SimpleX Chat is a privacy-focused\nmessaging platform with no user IDs.\n\nConfiguration is handled by Hermes\nAgent directly — no credential entry\nneeded in this modal.\n\nRun on your server:\n  hermes gateway setup simplex\n\nFollow the prompts to create an\nSMP address and share it with\ncontacts who should message your\nagents.`,
      },
    ],
    "Open WebUI": [
      {
        title: "Open WebUI — Set Up Your Instance",
        body: `Open WebUI is a self-hosted AI\nfrontend compatible with OpenAI APIs.\n\n1. Install Open WebUI\n   (https://github.com/open-webui/open-webui)\n2. Create an admin account\n3. Generate an API key from\n   Settings → API Keys`,
      },
      {
        title: "Open WebUI — Copy Credentials",
        body: `You'll need:\n   - Server URL (e.g. http://localhost:3000)\n   - API Key\n\nMake sure your Hermes gateway can\nreach the Open WebUI instance.`,
      },
    ],
    Webhooks: [
      {
        title: "Webhooks — Configure Your Endpoint",
        body: `The webhook adapter sends and\nreceives messages via HTTP POST.\n\n1. Set up an endpoint URL that can\n   receive POST requests with JSON\n   body containing message data\n2. Optionally set a shared secret\n   for HMAC signature verification\n3. Make sure the URL is reachable\n   from your Hermes gateway`,
      },
    ],
    DingTalk: [
      {
        title: "DingTalk — Create an App",
        body: `DingTalk is Alibaba's workplace\nmessaging platform.\n\n1. Go to https://open-dev.dingtalk.com\n2. Create an enterprise app\n3. Enable robot (bot) capability\n4. Configure message receiving mode\n   (HTTP or Stream)`,
      },
      {
        title: "DingTalk — Copy Credentials",
        body: `From the app management page:\n   - App Key\n   - App Secret\n\nConfigure the message callback URL\nto point to your Hermes gateway.`,
      },
    ],
    "Feishu/Lark": [
      {
        title: "Feishu/Lark — Create an App",
        body: `Feishu (China) / Lark (international)\nis ByteDance's workplace platform.\n\n1. Go to https://open.feishu.cn\n   (or https://open.larksuite.com)\n2. Create an enterprise app\n3. Enable the bot capability\n4. Add message receiving permissions`,
      },
      {
        title: "Feishu/Lark — Copy Credentials",
        body: `From the app credentials page:\n   - App ID (starts with cli_...)\n   - App Secret\n\nConfigure the event subscription URL\nto point to your Hermes gateway.`,
      },
    ],
    WeCom: [
      {
        title: "WeCom — Create an App",
        body: `WeCom (WeChat Work) is Tencent's\nenterprise messaging platform.\n\n1. Go to https://work.weixin.qq.com\n2. Navigate to App Management\n3. Create a custom app\n4. Enable the bot/receiving message\n   capability`,
      },
      {
        title: "WeCom — Copy Credentials",
        body: `You'll need:\n   - Corp ID (from admin console)\n   - Agent ID (from the app)\n   - Secret (from the app)\n\nConfigure the callback URL to point\nto your Hermes gateway.`,
      },
    ],
    "WeCom Callback": [
      {
        title: "WeCom Callback — Set Up",
        body: `WeCom callback mode receives\nmessages via webhook.\n\n1. In WeCom admin console, go to\n   your app → Receive Messages\n2. Set the callback URL to your\n   Hermes gateway endpoint\n3. Set a Token and Encoding AES Key\n   (generate or let WeCom provide)`,
      },
      {
        title: "WeCom Callback — Copy Credentials",
        body: `You'll need:\n   - Token\n   - Encoding AES Key\n   - Corp ID\n\nThese are used to verify and\ndecrypt incoming webhook payloads.`,
      },
    ],
    Weixin: [
      {
        title: "Weixin — Set Up iLink Bot",
        body: `WeChat (personal) can be bridged\nvia the iLink Bot API.\n\n1. Contact iLink to get a bot token\n   (https://www.ilink.com)\n2. The bot will manage a WeChat\n   account on your behalf\n3. Configure message forwarding to\n   your Hermes gateway`,
      },
    ],
    QQ: [
      {
        title: "QQ — Create a Bot",
        body: `QQ Bot uses Tencent's official\nBot API v2.\n\n1. Go to https://q.qq.com\n2. Register as a developer\n3. Create a bot application\n4. Configure the message receiving\n   endpoint`,
      },
      {
        title: "QQ — Copy Credentials",
        body: `From the bot management page:\n   - App ID\n   - Token\n\nConfigure the webhook URL to point\nto your Hermes gateway.`,
      },
    ],
    Yuanbao: [
      {
        title: "Yuanbao — Set Up via Hermes",
        body: `Yuanbao is Tencent's AI chat\nplatform with DM and group chat.\n\nConfiguration is handled by Hermes\nAgent directly — no credential entry\nneeded in this modal.\n\nRun on your server:\n  hermes gateway setup yuanbao\n\nFollow the prompts to authenticate\nand configure your Yuanbao account.`,
      },
    ],
    "Home Assistant": [
      {
        title: "Home Assistant — Enable Conversation",
        body: `Home Assistant has a built-in\nconversation integration.\n\n1. Go to https://www.home-assistant.io\n   to install if needed\n2. In HA, go to Settings →\n   Devices & Services → Add\n   Integration → Conversation\n3. Enable the conversation API`,
      },
      {
        title: "Home Assistant — Create a Token",
        body: `1. In HA, go to your profile\n   (bottom left)\n2. Scroll to "Long-Lived Access Tokens"\n3. Create a token named "Hermes"\n4. Copy the token\n\nYou'll also need your HA URL\n(e.g. http://homeassistant.local:8123)`,
      },
    ],
    "Teams Meetings": [
      {
        title: "Teams Meetings — Register an App",
        body: `Teams Meetings bot requires a\nMicrosoft Bot Framework app.\n\n1. Go to https://entra.microsoft.com\n2. App registrations → New registration\n3. Name it (e.g. "Agent Heights Meetings")\n4. Single tenant is fine for most\n5. Click Register`,
      },
      {
        title: "Teams Meetings — Configure Bot",
        body: `1. Go to https://dev.teams.microsoft.com/bots\n2. Create a new bot\n3. Enable "Calling" and "Meeting"\n   capabilities\n4. Copy the Bot ID (App ID)\n5. Generate a client secret`,
      },
      {
        title: "Teams Meetings — Copy Credentials",
        body: `You'll need:\n   - App (Bot) ID\n   - Tenant ID\n   - Bot Password (client secret)\n\nThe bot will join scheduled\nmeetings and can transcribe/\nrespond to meeting chat.`,
      },
    ],
    "MS Graph Webhook": [
      {
        title: "MS Graph — Register an App",
        body: `Microsoft Graph webhooks receive\nchange notifications for Teams and\nOutlook messages.\n\n1. Go to https://entra.microsoft.com\n2. App registrations → New registration\n3. Add API permissions:\n   - ChannelMessage.Read.All\n   - Mail.Read\n4. Grant admin consent`,
      },
      {
        title: "MS Graph — Create Subscription",
        body: `1. Create a client secret for your app\n2. Use the Graph API to create a\n   subscription:\n   POST /subscriptions\n   with your notification URL\n3. The notification URL must point\nto your Hermes gateway endpoint`,
      },
      {
        title: "MS Graph — Copy Credentials",
        body: `You'll need:\n   - Client (App) ID\n   - Client Secret\n   - Tenant ID\n\nThese are used to obtain access\ntokens for calling the Graph API\nand managing subscriptions.`,
      },
    ],
    Raft: [
      {
        title: "Raft — Set Up via Hermes",
        body: `Raft is a messaging platform\nintegrated through Hermes Agent.\n\nConfiguration is handled by Hermes\nAgent directly — no credential entry\nneeded in this modal.\n\nRun on your server:\n  hermes gateway setup raft\n\nFollow the prompts to configure\nyour Raft connection.`,
      },
    ],
  };

  /** Show a multi-step modal walking the user through platform setup with credential input. */
  private showPlatformConnectModal(platform: string): void {
    const state = this.store.platformStates.find((s) => s.platform === platform);
    const gatewayRunning = state?.gatewayRunning ?? false;
    const net = this.game.registry.get("net") as import("../net").Net;

    const instructionSteps = OfficeScene.PLATFORM_SETUP_STEPS[platform] ?? [];
    const credFields = PLATFORM_CREDENTIAL_FIELDS[platform] ?? [];
    const totalSteps = instructionSteps.length + 1;

    // ── Build the entire modal as a single DOM element ──
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.55); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      font-family: 'M PLUS Rounded 1c', system-ui, sans-serif;
    `;

    const card = document.createElement("div");
    card.style.cssText = `
      background: #f5f0e6; border: 3px solid #d4c5a9; border-radius: 16px;
      width: 520px; max-height: 90vh; display: flex; flex-direction: column;
      box-shadow: 0 12px 48px rgba(0,0,0,0.3); overflow: hidden;
    `;

    // ── Header ──
    const header = document.createElement("div");
    header.style.cssText = `
      background: #e8dcc8; border-bottom: 2px solid #d4c5a9;
      padding: 16px 24px; display: flex; align-items: center; gap: 12px;
      flex-shrink: 0;
    `;
    const connectLogoSlug = PLATFORM_ICON_SLUGS[platform];
    const connectLogoHtml = connectLogoSlug
      ? `<img src="https://cdn.simpleicons.org/${connectLogoSlug}" alt="${platform}" style="width:28px;height:28px;flex-shrink:0;object-fit:contain;" onerror="this.parentElement.innerHTML='✉'">`
      : `<span style="font-size:28px;">✉</span>`;
    header.innerHTML = `
      ${connectLogoHtml}
      <span style="font-size:20px;font-weight:bold;color:#3d3528;flex:1;">${platform} Mailbox</span>
      <span style="font-size:13px;font-weight:bold;color:${gatewayRunning ? "#4a9b4a" : "#b07050"};">
        ${gatewayRunning ? "● Connected" : "○ Not connected"}
      </span>
    `;
    card.appendChild(header);

    // ── Content area (scrollable) ──
    const content = document.createElement("div");
    content.style.cssText = `
      padding: 24px 30px; flex: 1; overflow-y: auto;
      display: flex; flex-direction: column; gap: 0;
    `;
    card.appendChild(content);

    // Step badge
    const stepBadge = document.createElement("div");
    stepBadge.style.cssText = `
      display: inline-block; background: #8b7355; color: #fff;
      font-size: 12px; font-weight: bold; padding: 4px 12px;
      border-radius: 12px; margin-bottom: 16px; align-self: flex-start;
    `;
    content.appendChild(stepBadge);

    // Title
    const titleEl = document.createElement("div");
    titleEl.style.cssText = "font-size:17px;font-weight:bold;color:#3d3528;margin-bottom:16px;line-height:1.3;";
    content.appendChild(titleEl);

    // Body (instruction text)
    const bodyEl = document.createElement("div");
    bodyEl.style.cssText = "font-size:14px;color:#6b5d4a;line-height:1.8;white-space:pre-wrap;margin-bottom:20px;";
    content.appendChild(bodyEl);

    // Command box
    const cmdBox = document.createElement("div");
    cmdBox.style.cssText = `
      background: #3d3528; color: #e8dcc8; font-family: monospace;
      font-size: 13px; padding: 10px 16px; border-radius: 8px;
      border: 1px solid #8b7355; margin-bottom: 20px; display: none;
    `;
    content.appendChild(cmdBox);

    // Form container
    const formContainer = document.createElement("div");
    formContainer.style.cssText = "display:none;flex-direction:column;gap:18px;";

    const formSubtitle = document.createElement("div");
    formSubtitle.textContent = `Write your ${platform} credentials on the envelope:`;
    formSubtitle.style.cssText = "font-size:14px;color:#6b5d4a;margin-bottom:4px;";
    formContainer.appendChild(formSubtitle);

    const inputs: HTMLInputElement[] = [];
    for (const field of credFields) {
      const wrapper = document.createElement("div");
      wrapper.style.cssText = "display:flex;flex-direction:column;gap:6px;";

      const label = document.createElement("div");
      label.textContent = field.label;
      label.style.cssText = "font-size:12px;font-weight:600;color:#8b7355;";

      const input = document.createElement("input");
      input.type = field.type;
      input.placeholder = field.placeholder;
      input.dataset.key = field.key;
      input.style.cssText = `
        width: 100%; padding: 10px 14px; background: #fffcf5;
        border: 2px solid #d4c5a9; border-radius: 8px;
        color: #3d3528; font-size: 14px; font-family: monospace;
        box-sizing: border-box; outline: none; transition: border-color 0.2s;
      `;
      input.addEventListener("focus", () => { input.style.borderColor = "#8b7355"; });
      input.addEventListener("blur", () => { input.style.borderColor = "#d4c5a9"; });

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      formContainer.appendChild(wrapper);
      inputs.push(input);
    }

    const resultMsg = document.createElement("div");
    resultMsg.style.cssText = "font-size:13px;min-height:22px;text-align:center;color:#6b5d4a;";
    formContainer.appendChild(resultMsg);

    content.appendChild(formContainer);

    // ── Footer ──
    const footer = document.createElement("div");
    footer.style.cssText = `
      padding: 16px 24px; border-top: 2px solid #d4c5a9;
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      flex-shrink: 0;
    `;

    // Step dots
    const dotsContainer = document.createElement("div");
    dotsContainer.style.cssText = "display:flex;gap:10px;";
    const dotEls: HTMLSpanElement[] = [];
    for (let i = 0; i < totalSteps; i++) {
      const dot = document.createElement("span");
      dot.textContent = "○";
      dot.style.cssText = "font-size:16px;color:#c4b89a;";
      dotsContainer.appendChild(dot);
      dotEls.push(dot);
    }
    footer.appendChild(dotsContainer);

    // Buttons row
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:20px;align-items:center;";

    const makeBtn = (label: string, color: string) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.style.cssText = `
        background: none; border: none; font-size: 15px; font-weight: bold;
        color: ${color}; cursor: pointer; font-family: inherit;
        padding: 4px 8px;
      `;
      return btn;
    };

    const prevBtn = makeBtn("‹ Back", "#8b7355");
    const nextBtn = makeBtn("Next ›", "#8b7355");
    const submitBtn = makeBtn("Send ✉", "#4a9b4a");
    const closeBtn = makeBtn("Close", "#b07050");

    btnRow.appendChild(prevBtn);
    btnRow.appendChild(nextBtn);
    btnRow.appendChild(submitBtn);
    btnRow.appendChild(closeBtn);
    footer.appendChild(btnRow);

    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // ── Step rendering logic ──
    let currentStep = 0;
    let submitting = false;

    const renderStep = () => {
      const isCredStep = currentStep === instructionSteps.length;
      const stepNum = currentStep + 1;

      stepBadge.textContent = `Step ${stepNum} of ${totalSteps}`;

      if (isCredStep) {
        titleEl.textContent = "Enter Credentials";
        bodyEl.textContent = "";
        cmdBox.style.display = "none";
        formContainer.style.display = "flex";
        resultMsg.textContent = "";
      } else {
        const step = instructionSteps[currentStep];
        titleEl.textContent = step.title;
        bodyEl.innerHTML = step.body.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#6c5ce7;text-decoration:underline;">$1</a>');
        formContainer.style.display = "none";
        if (step.cmd) {
          cmdBox.style.display = "block";
          cmdBox.textContent = `$ ${step.cmd}`;
        } else {
          cmdBox.style.display = "none";
        }
      }

      // Update dots
      for (let i = 0; i < dotEls.length; i++) {
        dotEls[i].textContent = i === currentStep ? "●" : i < currentStep ? "✓" : "○";
        dotEls[i].style.color = i < currentStep ? "#4a9b4a" : i === currentStep ? "#8b7355" : "#c4b89a";
      }

      // Show/hide buttons
      prevBtn.style.display = currentStep > 0 ? "" : "none";
      nextBtn.style.display = (!isCredStep && currentStep < totalSteps - 1) ? "" : "none";
      submitBtn.style.display = (isCredStep && !submitting) ? "" : "none";
    };

    prevBtn.onclick = () => { if (currentStep > 0) { currentStep--; renderStep(); } };
    nextBtn.onclick = () => { if (currentStep < totalSteps - 1) { currentStep++; renderStep(); } };

    // Listen for config result
    const onConfigResult = (respPlatform: string, success: boolean, error?: string) => {
      if (respPlatform !== platform || !submitting) return;
      submitting = false;
      if (success) {
        resultMsg.style.color = "#4a9b4a";
        resultMsg.textContent = "✓ Envelope sealed! Your mailbox is now connected.";
        submitBtn.style.display = "";
        submitBtn.textContent = "Done ✓";
        submitBtn.onclick = closeModal;
      } else {
        resultMsg.style.color = "#b07050";
        resultMsg.textContent = `✗ ${error ?? "Could not deliver. Try again."}`;
        submitBtn.style.display = "";
        submitBtn.textContent = "Send ✉";
      }
    };
    this.store.onPlatformConfigResult(onConfigResult);

    submitBtn.onclick = () => {
      if (submitting) return;
      const credentials: Record<string, string> = {};
      let missing = false;
      for (const input of inputs) {
        const val = input.value.trim();
        if (!val) {
          missing = true;
          input.style.borderColor = "#b07050";
        } else {
          input.style.borderColor = "#d4c5a9";
          credentials[input.dataset.key!] = val;
        }
      }
      if (missing) {
        resultMsg.style.color = "#b07050";
        resultMsg.textContent = "Please fill in all fields on the envelope.";
        return;
      }

      submitting = true;
      submitBtn.style.display = "none";
      resultMsg.style.color = "#6b5d4a";
      resultMsg.textContent = "Delivering...";
      net.send({ type: "configure_platform", platform, credentials });
    };

    const closeModal = () => {
      this.store.offPlatformConfigResult(onConfigResult);
      overlay.remove();
    };
    closeBtn.onclick = closeModal;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

    renderStep();
  }

  /** Show a scrollable platform picker modal for assigning a platform to a mailbox slot. */
  private showPlatformPickerModal(slot: number): void {
    const net = this.game.registry.get("net") as import("../net").Net;
    const assigned = new Set(this.store.settings.mailboxPlatforms?.filter((p): p is string => p !== null) ?? []);

    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.55); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      font-family: 'M PLUS Rounded 1c', system-ui, sans-serif;
    `;

    const card = document.createElement("div");
    card.style.cssText = `
      background: #f5f0e6; border: 3px solid #d4c5a9; border-radius: 16px;
      width: 480px; max-height: 80vh; display: flex; flex-direction: column;
      box-shadow: 0 12px 48px rgba(0,0,0,0.3); overflow: hidden;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      background: #e8dcc8; border-bottom: 2px solid #d4c5a9;
      padding: 16px 24px; display: flex; align-items: center; gap: 12px;
      flex-shrink: 0;
    `;
    header.innerHTML = `
      <span style="font-size:28px;">✉</span>
      <span style="font-size:20px;font-weight:bold;color:#3d3528;flex:1;">Mailbox ${slot + 1} — Choose Platform</span>
    `;
    card.appendChild(header);

    const list = document.createElement("div");
    list.style.cssText = `
      padding: 12px 16px; flex: 1; overflow-y: auto;
      display: flex; flex-direction: column; gap: 6px;
    `;
    card.appendChild(list);

    const tierLabels: Record<number, string> = { 1: "Popular", 2: "Available", 3: "Regional / Niche" };
    let lastTier = 0;

    for (const entry of PLATFORM_CATALOG) {
      if (entry.tier !== lastTier) {
        lastTier = entry.tier;
        const tierHeader = document.createElement("div");
        tierHeader.textContent = tierLabels[entry.tier] ?? "Other";
        tierHeader.style.cssText = `
          font-size: 12px; font-weight: bold; color: #8b7355;
          text-transform: uppercase; letter-spacing: 1px;
          margin: 12px 0 4px 0; padding-bottom: 4px;
          border-bottom: 1px solid #d4c5a9;
        `;
        if (entry.tier === 1) tierHeader.style.marginTop = "0";
        list.appendChild(tierHeader);
      }

      const isAssigned = assigned.has(entry.name);
      const item = document.createElement("div");
      item.style.cssText = `
        display: flex; align-items: center; gap: 12px; padding: 10px 14px;
        background: ${isAssigned ? "#e0d8c8" : "#fffcf5"};
        border: 2px solid #d4c5a9; border-radius: 10px;
        cursor: ${isAssigned ? "not-allowed" : "pointer"};
        transition: border-color 0.2s, background 0.2s;
        opacity: ${isAssigned ? "0.5" : "1"};
      `;
      if (!isAssigned) {
        item.addEventListener("mouseenter", () => { item.style.borderColor = "#8b7355"; });
        item.addEventListener("mouseleave", () => { item.style.borderColor = "#d4c5a9"; });
      }

      const logo = platformLogoImg(entry.name, 24);
      if (logo) {
        item.appendChild(logo);
      } else {
        const colorDot = document.createElement("div");
        colorDot.style.cssText = `
          width: 24px; height: 24px; border-radius: 6px; flex-shrink: 0;
          background: #${entry.color.toString(16).padStart(6, "0")};
          border: 2px solid rgba(0,0,0,0.15);
        `;
        item.appendChild(colorDot);
      }

      const textCol = document.createElement("div");
      textCol.style.cssText = "flex:1;display:flex;flex-direction:column;";
      const nameEl = document.createElement("div");
      nameEl.textContent = entry.name + (isAssigned ? " (in use)" : "");
      nameEl.style.cssText = "font-size:15px;font-weight:bold;color:#3d3528;";
      const descEl = document.createElement("div");
      descEl.textContent = entry.description;
      descEl.style.cssText = "font-size:12px;color:#8b7355;";
      textCol.appendChild(nameEl);
      textCol.appendChild(descEl);
      item.appendChild(textCol);

      if (!isAssigned) {
        item.onclick = () => {
          net.send({ type: "set_mailbox_platform", slot, platform: entry.name });
          overlay.remove();
        };
      }

      list.appendChild(item);
    }

    // Unassign option
    const unassignBtn = document.createElement("button");
    unassignBtn.textContent = "Unassign this mailbox";
    unassignBtn.style.cssText = `
      margin: 12px 16px; padding: 10px; background: none; border: 2px solid #b07050;
      border-radius: 8px; color: #b07050; font-size: 14px; font-weight: bold;
      cursor: pointer; font-family: inherit; flex-shrink: 0;
    `;
    unassignBtn.onclick = () => {
      net.send({ type: "set_mailbox_platform", slot, platform: null });
      overlay.remove();
    };
    card.appendChild(unassignBtn);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.cssText = `
      margin: 0 16px 16px; padding: 10px; background: none; border: 2px solid #8b7355;
      border-radius: 8px; color: #8b7355; font-size: 14px; font-weight: bold;
      cursor: pointer; font-family: inherit; flex-shrink: 0;
    `;
    closeBtn.onclick = () => overlay.remove();
    card.appendChild(closeBtn);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
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

    // Nemesis Terminal — open codex panel
    const ntPx = { x: this.nemesisTerminalTile.x * TILE_PX + 32, y: this.nemesisTerminalTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, ntPx.x, ntPx.y) < 144) {
      this.world.toggleNemesisPanel();
      this.world.audio.uiClick();
      return true;
    }

    // ── MCP Forge (before plants — plants at (26,16) overlap forge station) ──
    const wtPx = { x: this.warTableTile.x * TILE_PX + 32, y: this.warTableTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, wtPx.x, wtPx.y) < 144) {
      this.store.toggleForgePanel(true);
      this.store.requestForgeList();
      this.world.audio.uiClick();
      return true;
    }

    const sbPx = { x: this.scrapBinTile.x * TILE_PX + 32, y: this.scrapBinTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, sbPx.x, sbPx.y) < 144) {
      const toolCount = this.store.forgeServers.reduce((n, s) => n + s.tools.length, 0);
      this.store.toast(`Tool rack: ${toolCount} MCP tool(s) across ${this.store.forgeServers.length} server(s).`);
      this.world.audio.uiClick();
      return true;
    }

    const rdPx = { x: this.radioTile.x * TILE_PX + 32, y: this.radioTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, rdPx.x, rdPx.y) < 144) {
      const running = this.store.forgeServers.filter(s => s.status === "running").length;
      const errored = this.store.forgeServers.filter(s => s.status === "error").length;
      this.store.toast(`MCP Status: ${running} running, ${errored} error(s), ${this.store.forgeServers.length} total.`);
      this.world.audio.uiClick();
      return true;
    }

    const wbPx = { x: this.workbenchTile.x * TILE_PX + 32, y: this.workbenchTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, wbPx.x, wbPx.y) < 144) {
      this.store.toast("Code terminal ready. Agents can write MCP servers here.");
      this.world.audio.uiClick();
      return true;
    }

    const rsPx = { x: this.researchTile.x * TILE_PX + 32, y: this.researchTile.y * TILE_PX + 32 };
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, rsPx.x, rsPx.y) < 144) {
      this.store.toast("Blueprint desk: MCP server architecture and tool schemas.");
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
    const agents = [...this.store.agents.values()].filter((a) => a.id !== AGENT_RESOURCES_ID);
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
      hint: HintTag;
      dist: number;
      label: string;
      hx: number;
      hy: number;
    }
    const candidates: Candidate[] = [];
    const add = (
      hint: HintTag,
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

    // Nemesis Terminal
    {
      const px = { x: this.nemesisTerminalTile.x * TILE_PX + 32, y: this.nemesisTerminalTile.y * TILE_PX + 32 };
      add(this.nemesisTerminalHint, px.x, px.y, 144, "E: NEMESIS CODEX", px.x, px.y + 64);
    }

    // Forge Station
    {
      const px = { x: this.warTableTile.x * TILE_PX + 32, y: this.warTableTile.y * TILE_PX + 32 };
      add(this.warTableHint, px.x, px.y, 144, "E: MCP FORGE", px.x, px.y + 64);
    }

    // Tool Rack
    {
      const px = { x: this.scrapBinTile.x * TILE_PX + 32, y: this.scrapBinTile.y * TILE_PX + 32 };
      add(this.scrapBinHint, px.x, px.y, 144, "E: TOOL RACK", px.x, px.y + 64);
    }

    // Status Monitor
    {
      const px = { x: this.radioTile.x * TILE_PX + 32, y: this.radioTile.y * TILE_PX + 32 };
      add(this.radioHint, px.x, px.y, 144, "E: STATUS", px.x, px.y + 64);
    }

    // Code Terminal
    {
      const px = { x: this.workbenchTile.x * TILE_PX + 32, y: this.workbenchTile.y * TILE_PX + 32 };
      add(this.workbenchHint, px.x, px.y, 144, "E: TERMINAL", px.x, px.y + 64);
    }

    // Blueprint Desk
    {
      const px = { x: this.researchTile.x * TILE_PX + 32, y: this.researchTile.y * TILE_PX + 32 };
      add(this.researchHint, px.x, px.y, 144, "E: BLUEPRINT", px.x, px.y + 64);
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
      let anyPmNearby = false;
      for (const pm of this.platformMailboxes) {
        const pmPx = { x: pm.tile.x * TILE_PX + TILE_PX / 2, y: pm.tile.y * TILE_PX + TILE_PX / 2 };
        const pmDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, pmPx.x, pmPx.y);
        if (pmDist < 200) anyPmNearby = true;
        if (pmDist < 100 && pmDist < nearestPmDist) {
          nearestPm = pm;
          nearestPmDist = pmDist;
        }
      }
      // Auto-request mail digest once when entering the mail room area
      if (anyPmNearby && !this.mailDigestRequested) {
        this.mailDigestRequested = true;
        const net = this.game.registry.get("net") as import("../net").Net;
        net.send({ type: "request_mail_digest" });
      } else if (!anyPmNearby && this.mailDigestRequested) {
        this.mailDigestRequested = false;
      }
      if (nearestPm) {
        const pmPx = { x: nearestPm.tile.x * TILE_PX + TILE_PX / 2, y: nearestPm.tile.y * TILE_PX + TILE_PX / 2 };
        const label = !nearestPm.platform
          ? "E: SET UP"
          : nearestPm.flagUp
            ? `E: CHECK ${nearestPm.platform.toUpperCase()}`
            : "E: EMPTY";
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
      if (mb.platform) {
        g.fillStyle(0xe8e4d0, 1);
        g.fillRoundedRect(px - 10, py + 2, 20, 7, 1);
        g.fillStyle(0x33373d, 1);
        const label = mb.platform.slice(0, 4);
        for (let i = 0; i < label.length; i++) {
          g.fillRect(px - 8 + i * 4, py + 4, 3, 1);
          g.fillRect(px - 8 + i * 4, py + 6, 2, 1);
        }
      } else {
        // Unassigned — show a small "+" icon on the label plate
        g.fillStyle(0x2a3a5a, 1);
        g.fillRoundedRect(px - 10, py + 2, 20, 7, 1);
        g.fillStyle(0x4a5a7a, 1);
        g.fillRect(px - 1, py + 4, 3, 1);
        g.fillRect(px, py + 3, 1, 3);
      }
      // red flag — up when mail pending, down when empty (only for assigned mailboxes)
      if (mb.platform && mb.flagUp) {
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
      } else if (mb.platform) {
        g.fillStyle(0xc83030, 1);
        g.fillRect(px + 12, py - 2, 2, 10);
        g.fillRect(px + 12, py + 6, 8, 3);
        g.fillStyle(0xe84848, 1);
        g.fillRect(px + 13, py - 1, 1, 8);
        g.fillRect(px + 13, py + 7, 6, 1);
      }

      // Disconnected indicator — show a small red dot if platform not connected via Hermes
      if (mb.platform && !this.store.isPlatformConnected(mb.platform)) {
        g.fillStyle(0xff4444, 0.9);
        g.fillCircle(px - 14, py - 10, 3);
        g.fillStyle(0xffffff, 0.8);
        g.fillRect(px - 15, py - 11, 2, 1);
        g.fillRect(px - 15, py - 9, 2, 1);
      }
    }
  }

  /** Draw a helicopter pad on the roof of the building, in a 3/4 diagonal perspective. */
  private drawHelipad(): void {
    const g = this.add.graphics().setDepth(-0.5);

    const mapPxW = 30 * TILE_PX; // 1920
    const cx = mapPxW / 2 + 240; // 1200 — shifted right
    const roofY = 0;             // top edge of the office map

    // ── LAYOUT ── bigger pad, viewed at a diagonal 3/4 angle.
    // The skew shifts the back of the pad to the right, simulating a
    // camera that's looking from the front-left rather than dead-centre.
    const padRX = 210;           // horizontal radius (bigger!)
    const padRY = 57;            // vertical radius (foreshortened)
    const padCY = roofY - 195;   // pad centre, high above the roof
    const skew  = 42;            // horizontal offset applied to back vs front

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
    const colW = 14;
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
    const stairCount = 18;
    const stairBaseW = 120;
    const stairTopW  = 72;
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

    // Top surface — procedural asphalt that follows the skewed ellipse
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
    const hW = 84;
    const hH = 24;
    const hT = 12;
    const hSkew = 9;
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

  /** Draw a big red emergency button on the wall in Agent Resources's office. */
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

  /** Draw a nemesis codex terminal in the break room. */
  private drawNemesisTerminal(): void {
    this.nemesisTerminalGfx = this.add.graphics().setDepth(3);
    const g = this.nemesisTerminalGfx;
    const bx = this.nemesisTerminalTile.x * TILE_PX;
    const by = this.nemesisTerminalTile.y * TILE_PX;

    // shadow
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(bx + 32, by + 60, 52, 10);

    // desk/stand
    g.fillStyle(0x2a2a35, 1);
    g.fillRoundedRect(bx + 8, by + 40, 48, 20, 3);
    g.fillStyle(0x1a1a22, 1);
    g.fillRoundedRect(bx + 10, by + 42, 44, 16, 2);

    // terminal body — dark metal
    g.fillStyle(0x1a1a2a, 1);
    g.fillRoundedRect(bx + 6, by + 4, 52, 42, 4);
    g.fillStyle(0x2a2a3a, 1);
    g.fillRoundedRect(bx + 8, by + 6, 48, 38, 3);

    // screen — glowing green
    g.fillStyle(0x0a1a0a, 1);
    g.fillRoundedRect(bx + 12, by + 10, 40, 30, 2);
    g.fillStyle(0x4affa8, 0.15);
    g.fillRoundedRect(bx + 12, by + 10, 40, 30, 2);

    // scanlines
    g.fillStyle(0x4affa8, 0.08);
    for (let i = 0; i < 6; i++) {
      g.fillRect(bx + 12, by + 12 + i * 5, 40, 2);
    }

    // screen text lines (decorative)
    g.fillStyle(0x4affa8, 0.6);
    g.fillRect(bx + 15, by + 14, 20, 2);
    g.fillRect(bx + 15, by + 18, 14, 2);
    g.fillRect(bx + 15, by + 22, 24, 2);
    g.fillRect(bx + 15, by + 26, 10, 2);
    g.fillRect(bx + 15, by + 30, 18, 2);

    // power LED
    g.fillStyle(0x4affa8, 0.9);
    g.fillCircle(bx + 52, by + 44, 1.5);

    // glow
    g.fillStyle(0x4affa8, 0.05);
    g.fillCircle(bx + 32, by + 25, 40);
  }

  /** Create the helicopter visual as a container and return it.
   *  Layering (bottom to top): landing skids → body → rotor.
   *  The rotor is a separate graphics positioned at (0, -30) so its
   *  rotation spins the blades in-place above the body. */
  private drawHelicopter(): Phaser.GameObjects.Container {
    const heliKey = "ai-fur-helicopter_top";

    if (this.textures.exists(heliKey)) {
      // --- AI sprite version ---
      // Shadow under the helicopter
      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.2);
      shadow.fillEllipse(0, 26, 90, 14);

      // AI helicopter sprite — centered at origin, sized to show full helicopter with padding
      const bodyImg = this.add.image(0, 0, heliKey)
        .setOrigin(0.5, 0.5)
        .setDisplaySize(160, 160);

      // --- rotor (top layer, positioned above body so rotation spins in-place) ---
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
      return this.add.container(0, 0, [shadow, bodyImg, rotor]);
    }

    // --- Fallback: procedural helicopter ---
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
    this.heliSound = this.world?.audio.helicopter() ?? null;
    console.log(`[heli-debug] triggerHelicopter: agentName=${agentName}, world=${!!this.world}, audio=${!!this.world?.audio}, heliSound=${!!this.heliSound}, ready=${this.ready}, heliActive=${this.heliActive}`);

    // Send the hire WS message immediately so the agent appears in the
    // sidebar and is interactable right away. The helicopter animation
    // is purely cosmetic — syncAgents() will replace the cosmetic sprite
    // with the real NPC when the server confirms.
    // Skip if the server already created the agent (Agent Resources hire).
    if (delivery && !delivery.alreadyHired) {
      const net = this.game.registry.get("net") as import("../net").Net;
      net.send({
        type: "hire",
        name: delivery.name,
        provider: "cline",
        model: delivery.model,
        systemPrompt: delivery.systemPrompt,
        role: "worker",
        appearance: delivery.appearance,
        mcpServers: delivery.mcpServers,
        cdpSolana: delivery.cdpSolana,
        crossmintWallet: delivery.crossmintWallet,
      });
    }

    const padCx = this.padCenter.x;
    const padCy = this.padCenter.y;

    // create helicopter high above the pad (same x, well above)
    const heli = this.drawHelicopter();
    heli.setScale(1.5);
    heli.setPosition(padCx, padCy - 600);
    heli.setDepth(-0.4);
    heli.setAlpha(0);
    this.heliContainer = heli;

    // fade in as it descends from the sky
    this.tweens.add({
      targets: heli,
      alpha: 1,
      duration: 750,
      ease: "Cubic.in",
    });

    // descend slowly to the pad — soft landing with ease-out at the end
    this.tweens.add({
      targets: heli,
      y: padCy,
      duration: 2750,
      ease: "Cubic.out",
      onComplete: () => {
        // landed — pause for rotor spin-down, then unload agent
        this.time.delayedCall(500, () => this.heliUnload());
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
        // Process any agents that were deferred during the helicopter
        // animation — spawn them at the elevator exit now.
        if (this.pendingHeliAgents.length > 0) {
          this.syncPendingHeliAgents(exitX, exitY);
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

  /** Create NPCs for agents deferred during the helicopter animation.
   *  Called when the elevator lands — spawns each pending agent at the
   *  elevator exit so they walk into the office naturally. */
  private syncPendingHeliAgents(exitX: number, exitY: number): void {
    const pending = this.pendingHeliAgents.splice(0);
    for (const id of pending) {
      const info = this.store.agents.get(id);
      if (!info) continue;
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
      const spawnPx = tileOf(exitX, exitY);
      const npc = new AgentNPC(this, this.grid, info, spawnPx, seat, (clicked) =>
        this.walkToAgent(clicked),
        (agentId) => this.getSeatForAgentId(agentId),
      );
      this.npcs.set(id, npc);
    }
  }

  /** Tear down all helicopter cosmetic state.  Called either from
   *  syncAgents (when the real NPC arrives) or from heliTakeoff's
   *  delayed call (fallback if the server is slow to confirm). */
  private endHelicopter(): void {
    this.heliAgent?.destroy();
    this.heliAgent = null;
    this.heliElevatorGfx?.destroy();
    this.heliElevatorGfx = null;
    this.heliActive = false;
    this.heliDelivery = null;
    this.heliSound?.stop();
    this.heliSound = null;
    // Fallback: if the elevator never completed but we're tearing down,
    // spawn any pending agents at the elevator exit inside the office.
    if (this.pendingHeliAgents.length > 0) {
      const exitX = 14 * TILE_PX + 32;
      const exitY = 3 * TILE_PX + 52;
      this.syncPendingHeliAgents(exitX, exitY);
    }
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

  /** Convert a world-space rect to screen-space pixels using the main camera. */
  private worldRectToScreen(wx: number, wy: number, ww: number, wh: number): { x: number; y: number; w: number; h: number } {
    const cam = this.cameras.main;
    const canvas = this.game.canvas.getBoundingClientRect();
    // Use camera worldView for accurate position (accounts for follow lerp and rounding)
    const view = cam.worldView;
    const sx = canvas.left + (wx - view.x) * cam.zoom;
    const sy = canvas.top + (wy - view.y) * cam.zoom;
    return { x: sx, y: sy, w: ww * cam.zoom, h: wh * cam.zoom };
  }

  /** Update the YouTube IFrame overlay to match the projector screen position. */
  private updateProjectorVideo(): void {
    const channel = this.store.projectorChannel;
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

    // Convert world position to screen position
    const rect = this.worldRectToScreen(px - sw / 2, py - sh / 2, sw, sh);

    this.projectorIframe.style.left = `${rect.x}px`;
    this.projectorIframe.style.top = `${rect.y}px`;
    this.projectorIframe.style.width = `${rect.w}px`;
    this.projectorIframe.style.height = `${rect.h}px`;
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

    // Invisible interactive zone so clicking the board opens it
    const boardZone = this.add.zone(bx, by + bh / 2, bw + 12, bh + 12);
    boardZone.setDepth(3);
    boardZone.setInteractive({ useHandCursor: true });
    boardZone.on("pointerdown", () => this.store.toggleBoard(true));
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

  // ── Cultural perimeter wall overlays ────────────────────────────────

  /** Master method — draws cultural overlays on all four perimeter walls + corners. */
  private drawCulturalWalls(): void {
    this.drawNorthWallAsian();
    this.drawSouthWallMediterranean();
    this.drawWestWallVictorian();
    this.drawEastWallArtDeco();
    this.drawCornerAccents();
  }

  /** North wall (y=0) — East Asian inspired: pagoda eaves, lattice, lanterns, bamboo. */
  private drawNorthWallAsian(): void {
    const g = this.add.graphics().setDepth(1);
    const mapPxW = 30 * TILE_PX;
    const wallY = 0;

    // --- Pagoda eaves: overhanging roofline with upturned corners ---
    const eaveH = 14;
    const eaveOverhang = 10;
    // Main eave band — warm wood tone
    g.fillStyle(0x6a4a32, 1);
    g.fillRect(-eaveOverhang, wallY - eaveH, mapPxW + eaveOverhang * 2, eaveH);
    // Eave top highlight
    g.fillStyle(0x8a6a42, 1);
    g.fillRect(-eaveOverhang, wallY - eaveH, mapPxW + eaveOverhang * 2, 3);
    // Eave bottom shadow
    g.fillStyle(0x4a3a22, 1);
    g.fillRect(-eaveOverhang, wallY - 3, mapPxW + eaveOverhang * 2, 3);

    // Upturned corners — left
    g.fillStyle(0x6a4a32, 1);
    g.beginPath();
    g.moveTo(-eaveOverhang, wallY);
    g.lineTo(-eaveOverhang - 16, wallY - eaveH - 6);
    g.lineTo(-eaveOverhang - 10, wallY - eaveH - 6);
    g.lineTo(-eaveOverhang + 4, wallY - 2);
    g.closePath();
    g.fillPath();
    g.fillStyle(0x8a6a42, 1);
    g.fillRect(-eaveOverhang - 16, wallY - eaveH - 6, 6, 2);

    // Upturned corners — right
    g.fillStyle(0x6a4a32, 1);
    g.beginPath();
    g.moveTo(mapPxW + eaveOverhang, wallY);
    g.lineTo(mapPxW + eaveOverhang + 16, wallY - eaveH - 6);
    g.lineTo(mapPxW + eaveOverhang + 10, wallY - eaveH - 6);
    g.lineTo(mapPxW + eaveOverhang - 4, wallY - 2);
    g.closePath();
    g.fillPath();
    g.fillStyle(0x8a6a42, 1);
    g.fillRect(mapPxW + eaveOverhang + 10, wallY - eaveH - 6, 6, 2);

    // Eave underside — dark recessed area
    g.fillStyle(0x2a1a12, 1);
    g.fillRect(-eaveOverhang, wallY - 4, mapPxW + eaveOverhang * 2, 4);

    // --- Lattice pattern (sukashi-kumiko) across upper wall ---
    g.lineStyle(1, 0x8a6a42, 0.25);
    const latTop = wallY + 6;
    const latBot = wallY + 22;
    const latSpacing = 12;
    for (let x = TILE_PX; x < mapPxW - TILE_PX; x += latSpacing) {
      g.beginPath();
      g.moveTo(x, latTop);
      g.lineTo(x, latBot);
      g.strokePath();
    }
    for (let y = latTop; y <= latBot; y += 8) {
      g.beginPath();
      g.moveTo(TILE_PX, y);
      g.lineTo(mapPxW - TILE_PX, y);
      g.strokePath();
    }
    // Diagonal lattice accents
    g.lineStyle(1, 0x8a6a42, 0.15);
    for (let x = TILE_PX; x < mapPxW - TILE_PX; x += latSpacing * 2) {
      g.beginPath();
      g.moveTo(x, latTop);
      g.lineTo(x + latSpacing, latBot);
      g.strokePath();
      g.beginPath();
      g.moveTo(x + latSpacing, latTop);
      g.lineTo(x, latBot);
      g.strokePath();
    }

    // --- Stone lanterns at intervals ---
    const lanternPositions = [5, 15, 25];
    for (const lx of lanternPositions) {
      const px = lx * TILE_PX + TILE_PX / 2;
      const py = wallY + TILE_PX - 6;

      // Lantern base — small stone block
      g.fillStyle(0x5a5a52, 1);
      g.fillRect(px - 8, py - 4, 16, 4);
      g.fillStyle(0x6a6a62, 1);
      g.fillRect(px - 8, py - 4, 16, 1);

      // Lantern body — stone frame
      g.fillStyle(0x6a6a62, 1);
      g.fillRect(px - 7, py - 18, 14, 14);
      g.fillStyle(0x4a4a42, 1);
      g.fillRect(px - 7, py - 18, 14, 1);
      g.fillRect(px - 7, py - 5, 14, 1);

      // Glowing window
      g.fillStyle(0xffaa44, 0.7);
      g.fillRect(px - 5, py - 16, 10, 10);
      g.fillStyle(0xffdd88, 0.4);
      g.fillRect(px - 4, py - 15, 8, 8);

      // Lantern cap — pyramidal stone
      g.fillStyle(0x5a5a52, 1);
      g.beginPath();
      g.moveTo(px - 10, py - 18);
      g.lineTo(px, py - 24);
      g.lineTo(px + 10, py - 18);
      g.closePath();
      g.fillPath();
      g.fillStyle(0x6a6a62, 1);
      g.beginPath();
      g.moveTo(px - 10, py - 18);
      g.lineTo(px, py - 24);
      g.lineTo(px + 3, py - 21);
      g.lineTo(px - 7, py - 18);
      g.closePath();
      g.fillPath();
    }

    // --- Bamboo accents at 1/4, 1/2, 3/4 ---
    const bambooPositions = [7, 14, 22];
    for (const bx of bambooPositions) {
      const px = bx * TILE_PX + TILE_PX / 2;
      // Bamboo stalk
      g.fillStyle(0x4a7a3a, 0.5);
      g.fillRect(px - 3, wallY + 4, 6, TILE_PX - 8);
      // Bamboo segments
      g.fillStyle(0x3a6a2a, 0.6);
      for (let seg = 0; seg < 4; seg++) {
        g.fillRect(px - 3, wallY + 8 + seg * 12, 6, 1);
      }
      // Highlight
      g.fillStyle(0x6a9a4a, 0.3);
      g.fillRect(px - 3, wallY + 4, 1, TILE_PX - 8);
    }
  }

  /** South wall (y=19) — Mediterranean: arched entry, terracotta band, balconies, marble. */
  private drawSouthWallMediterranean(): void {
    const g = this.add.graphics().setDepth(1);
    const mapPxW = 30 * TILE_PX;
    const wallY = 19 * TILE_PX;
    const wallH = TILE_PX;

    // --- Terracotta band across mid-height ---
    const bandY = wallY + wallH * 0.35;
    const bandH = 10;
    g.fillStyle(0xa65a3a, 0.7);
    g.fillRect(0, bandY, mapPxW, bandH);
    g.fillStyle(0xc67a4a, 0.5);
    g.fillRect(0, bandY, mapPxW, 2);
    g.fillStyle(0x8a4a2a, 0.5);
    g.fillRect(0, bandY + bandH - 2, mapPxW, 2);

    // --- Wrought-iron balcony railings at 3 positions ---
    const balconyPositions = [4, 11, 22];
    for (const bx of balconyPositions) {
      const px = bx * TILE_PX;
      const railY = wallY + wallH * 0.15;
      const railW = TILE_PX * 1.5;
      const railH = 16;

      // Railing top rail
      g.fillStyle(0x3a3a3a, 0.8);
      g.fillRect(px, railY, railW, 2);
      // Railing bottom rail
      g.fillRect(px, railY + railH - 2, railW, 2);
      // Vertical balusters
      for (let sx = 0; sx < railW; sx += 6) {
        g.fillRect(px + sx, railY, 1, railH);
      }
      // Scrollwork — decorative S-curves (approximated with line segments)
      g.lineStyle(1.5, 0x3a3a3a, 0.7);
      for (let sx = 4; sx < railW - 4; sx += 16) {
        g.beginPath();
        g.moveTo(px + sx, railY + 4);
        for (let t = 0; t <= 1; t += 0.25) {
          const it = 1 - t;
          g.lineTo(px + sx + it * it * 0 + 2 * it * t * 8 + t * t * 4, railY + 4 + it * it * 0 + 2 * it * t * -2 + t * t * (railH / 2 - 4));
        }
        for (let t = 0; t <= 1; t += 0.25) {
          const it = 1 - t;
          g.lineTo(px + sx + 4 + it * it * 0 + 2 * it * t * -4 + t * t * 8, railY + railH / 2 + it * it * 0 + 2 * it * t * (railH / 2 - 4) + t * t * (railH - 4 - railH / 2));
        }
        g.strokePath();
      }
      // Balcony base — stone corbel
      g.fillStyle(0x8a7a6a, 0.8);
      g.fillRect(px + railW / 2 - 8, railY + railH, 16, 6);
      g.fillStyle(0x6a5a4a, 0.8);
      g.fillRect(px + railW / 2 - 8, railY + railH + 4, 16, 2);
    }

    // --- Marble veining overlay on lower wall ---
    g.lineStyle(1, 0xeae6e0, 0.15);
    for (let i = 0; i < 8; i++) {
      const startX = (i / 8) * mapPxW + Math.sin(i * 3.7) * 20;
      const startY = wallY + wallH * 0.6;
      g.beginPath();
      g.moveTo(startX, startY);
      let x = startX, y = startY;
      for (let seg = 0; seg < 6; seg++) {
        x += 12 + Math.sin(i + seg) * 8;
        y += 3 + Math.cos(i + seg * 2) * 4;
        g.lineTo(x, y);
      }
      g.strokePath();
    }
  }

  /** West wall (x=0) — Victorian Industrial: enhanced brick, pipes, sign bracket, downspout. */
  private drawWestWallVictorian(): void {
    const g = this.add.graphics().setDepth(1);
    const wallX = 0;
    const mapPxH = 20 * TILE_PX;

    // --- Enhanced brickwork overlay ---
    // Reddish-brown brick color variation
    const brickColors = [0x6a3a2a, 0x5a2a1a, 0x7a4a3a, 0x6a3a2a, 0x4a2a1a];
    const brickH = 12;
    const brickW = 28;
    for (let row = 0; row < Math.floor(mapPxH / brickH); row++) {
      const y = row * brickH;
      const offset = row % 2 === 0 ? 0 : brickW / 2;
      for (let bx = 0; bx < 3; bx++) {
        const x = bx * brickW + offset;
        if (x + brickW > TILE_PX) break;
        const colorIdx = (row * 3 + bx) % brickColors.length;
        g.fillStyle(brickColors[colorIdx], 0.35);
        g.fillRect(wallX + x, y, brickW, brickH);
      }
      // Mortar lines — horizontal
      g.fillStyle(0x2a1a12, 0.4);
      g.fillRect(wallX, y, TILE_PX, 1);
    }
    // Mortar lines — vertical (staggered)
    for (let row = 0; row < Math.floor(mapPxH / brickH); row++) {
      const y = row * brickH;
      const offset = row % 2 === 0 ? 0 : brickW / 2;
      for (let bx = 0; bx < 3; bx++) {
        const x = bx * brickW + offset;
        if (x + brickW > TILE_PX) break;
        g.fillStyle(0x2a1a12, 0.35);
        g.fillRect(wallX + x, y, 1, brickH);
      }
    }

    // Corbelling at top — 3 courses projecting outward
    for (let course = 0; course < 3; course++) {
      const cy = course * 4;
      const proj = 3 + course * 2;
      g.fillStyle(0x5a3a2a, 0.7);
      g.fillRect(wallX - proj, cy, TILE_PX + proj, 4);
      g.fillStyle(0x6a4a3a, 0.5);
      g.fillRect(wallX - proj, cy, TILE_PX + proj, 1);
    }

    // --- Steam-punk pipes running vertically ---
    const pipePositions = [3, 10];
    for (const py of pipePositions) {
      const pipeY = py * TILE_PX;
      const pipeX = wallX + TILE_PX - 10;

      // Pipe body — vertical
      g.fillStyle(0x5a5a5a, 0.8);
      g.fillRect(pipeX, pipeY, 8, TILE_PX * 2);
      // Pipe highlight
      g.fillStyle(0x7a7a7a, 0.6);
      g.fillRect(pipeX, pipeY, 2, TILE_PX * 2);
      // Pipe shadow
      g.fillStyle(0x3a3a3a, 0.6);
      g.fillRect(pipeX + 6, pipeY, 2, TILE_PX * 2);

      // Pipe joints — riveted flanges every tile
      for (let seg = 0; seg < 2; seg++) {
        const jy = pipeY + seg * TILE_PX + TILE_PX / 2;
        g.fillStyle(0x4a4a4a, 0.8);
        g.fillRect(pipeX - 3, jy - 3, 14, 6);
        g.fillStyle(0x6a6a6a, 0.6);
        g.fillRect(pipeX - 3, jy - 3, 14, 1);
        // Rivets
        g.fillStyle(0x8a8a8a, 0.7);
        g.fillCircle(pipeX - 1, jy, 1);
        g.fillCircle(pipeX + 9, jy, 1);
      }

      // Valve gauge at midpoint
      const gy = pipeY + TILE_PX;
      g.fillStyle(0x3a3a3a, 0.8);
      g.fillCircle(pipeX + 4, gy, 8);
      g.fillStyle(0xaa9988, 0.7);
      g.fillCircle(pipeX + 4, gy, 6);
      g.fillStyle(0x2a2a2a, 0.8);
      g.fillCircle(pipeX + 4, gy, 5);
      // Gauge needle
      g.lineStyle(1.5, 0xdd4444, 0.8);
      g.beginPath();
      g.moveTo(pipeX + 4, gy);
      g.lineTo(pipeX + 4 + 3, gy - 3);
      g.strokePath();
      // Gauge tick marks
      g.lineStyle(0.8, 0xaaaaaa, 0.5);
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        g.beginPath();
        g.moveTo(pipeX + 4 + Math.cos(ang) * 4, gy + Math.sin(ang) * 4);
        g.lineTo(pipeX + 4 + Math.cos(ang) * 5, gy + Math.sin(ang) * 5);
        g.strokePath();
      }
    }

    // --- Ornate iron sign bracket near middle ---
    const bracketY = 8 * TILE_PX;
    const bracketX = wallX + TILE_PX - 2;
    g.lineStyle(2, 0x2a2a2a, 0.8);
    // Bracket arm
    g.beginPath();
    g.moveTo(bracketX, bracketY);
    g.lineTo(bracketX + 20, bracketY);
    g.strokePath();
    // Decorative curl (approximated with line segments)
    g.beginPath();
    g.moveTo(bracketX + 20, bracketY);
    for (let t = 0; t <= 1; t += 0.2) {
      const it = 1 - t;
      g.lineTo(bracketX + 20 + it * it * 0 + 2 * it * t * 8 + t * t * 4, bracketY + it * it * 0 + 2 * it * t * 4 + t * t * 10);
    }
    for (let t = 0; t <= 1; t += 0.2) {
      const it = 1 - t;
      g.lineTo(bracketX + 24 + it * it * 0 + 2 * it * t * -4 + t * t * -2, bracketY + 10 + it * it * 0 + 2 * it * t * -2 + t * t * -4);
    }
    g.strokePath();
    // Bracket mount
    g.fillStyle(0x3a3a3a, 0.8);
    g.fillRect(bracketX - 2, bracketY - 4, 4, 8);

    // --- Decorative rain downspout near bottom ---
    const spoutY = 16 * TILE_PX;
    const spoutX = wallX + TILE_PX - 6;
    g.fillStyle(0x4a4a4a, 0.7);
    g.fillRect(spoutX, spoutY, 5, 3 * TILE_PX);
    g.fillStyle(0x6a6a6a, 0.5);
    g.fillRect(spoutX, spoutY, 1, 3 * TILE_PX);
    // Spout head — gargoyle-like cone
    g.fillStyle(0x3a3a3a, 0.8);
    g.beginPath();
    g.moveTo(spoutX - 4, spoutY + 3 * TILE_PX);
    g.lineTo(spoutX + 2, spoutY + 3 * TILE_PX + 14);
    g.lineTo(spoutX + 9, spoutY + 3 * TILE_PX);
    g.closePath();
    g.fillPath();
    g.fillStyle(0x5a5a5a, 0.5);
    g.beginPath();
    g.moveTo(spoutX - 4, spoutY + 3 * TILE_PX);
    g.lineTo(spoutX + 2, spoutY + 3 * TILE_PX + 14);
    g.lineTo(spoutX, spoutY + 3 * TILE_PX);
    g.closePath();
    g.fillPath();
  }

  /** East wall (x=29) — Art Deco: glass curtain wall, sunburst, neon, chevrons. */
  private drawEastWallArtDeco(): void {
    const g = this.add.graphics().setDepth(1);
    const wallX = 29 * TILE_PX;
    const mapPxH = 20 * TILE_PX;
    const wallW = TILE_PX;

    // --- Glass curtain wall panels ---
    const panelW = 16;
    const panelCount = Math.floor(mapPxH / panelW);
    for (let i = 0; i < panelCount; i++) {
      const py = i * panelW;
      // Glass panel — dark stone tones matching the other 3 walls' intensity
      const isLight = i % 2 === 0;
      g.fillStyle(isLight ? 0x6a6058 : 0x4a4038, 0.85);
      g.fillRect(wallX, py, wallW, panelW);
      // Mullion frame
      g.fillStyle(0x6a6a6a, 0.6);
      g.fillRect(wallX, py, wallW, 1);
      g.fillRect(wallX, py + panelW - 1, wallW, 1);
      // Vertical mullion
      g.fillRect(wallX + wallW / 2 - 1, py, 2, panelW);
      // Glass reflection — diagonal streak (warm highlight, not blue)
      g.fillStyle(0xeae0d0, 0.15);
      g.fillRect(wallX + 4, py + 2, wallW - 8, 3);
      g.fillRect(wallX + 6, py + 6, wallW - 12, 2);
    }

    // --- Art Deco sunburst at top center ---
    const sunCx = wallX + wallW / 2;
    const sunCy = 2 * TILE_PX;
    const sunR = 28;
    g.lineStyle(1.5, 0xddaa44, 0.6);
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      g.beginPath();
      g.moveTo(sunCx, sunCy);
      g.lineTo(sunCx + Math.cos(angle) * sunR, sunCy + Math.sin(angle) * sunR);
      g.strokePath();
    }
    // Sunburst inner circle
    g.fillStyle(0xddaa44, 0.5);
    g.fillCircle(sunCx, sunCy, 6);
    g.fillStyle(0xffcc66, 0.4);
    g.fillCircle(sunCx, sunCy, 4);
    // Sunburst outer ring
    g.lineStyle(1, 0xddaa44, 0.3);
    g.beginPath();
    g.arc(sunCx, sunCy, sunR, 0, Math.PI * 2);
    g.strokePath();

    // --- Neon accent strips ---
    const neonPositions = [6, 12, 17];
    const neonColors = [0x00ffff, 0xff00ff, 0x00ffff];
    for (let i = 0; i < neonPositions.length; i++) {
      const ny = neonPositions[i] * TILE_PX;
      const color = neonColors[i];
      // Glow
      g.fillStyle(color, 0.08);
      g.fillRect(wallX + 2, ny, 3, TILE_PX);
      g.fillStyle(color, 0.15);
      g.fillRect(wallX + 3, ny, 1, TILE_PX);
      // Core line
      g.fillStyle(color, 0.4);
      g.fillRect(wallX + 3, ny, 1, TILE_PX);
    }

    // --- Chevron band across midsection ---
    const chevY = 9 * TILE_PX;
    const chevH = 20;
    g.fillStyle(0xddaa44, 0.3);
    g.fillRect(wallX, chevY, wallW, chevH);
    // Chevron pattern
    g.fillStyle(0x2a2a3a, 0.5);
    const chevStep = 8;
    for (let cy = 0; cy < chevH; cy += chevStep) {
      for (let cx = 0; cx < wallW; cx += chevStep) {
        g.beginPath();
        g.moveTo(wallX + cx, chevY + cy);
        g.lineTo(wallX + cx + chevStep / 2, chevY + cy + chevStep / 2);
        g.lineTo(wallX + cx, chevY + cy + chevStep);
        g.lineTo(wallX + cx, chevY + cy + chevStep - 2);
        g.lineTo(wallX + cx + chevStep / 2 - 2, chevY + cy + chevStep / 2);
        g.lineTo(wallX + cx, chevY + cy + 2);
        g.closePath();
        g.fillPath();
      }
    }
    // Chevron band borders
    g.fillStyle(0xddaa44, 0.5);
    g.fillRect(wallX, chevY, wallW, 1);
    g.fillRect(wallX, chevY + chevH - 1, wallW, 1);
  }

  /** Four building corners — Mesoamerican stepped pyramid blocks with glyph carvings. */
  private drawCornerAccents(): void {
    const g = this.add.graphics().setDepth(0.5);
    const mapPxW = 30 * TILE_PX;
    const mapPxH = 20 * TILE_PX;
    const corners = [
      { x: 0, y: 0 },
      { x: mapPxW - TILE_PX, y: 0 },
      { x: 0, y: mapPxH - TILE_PX },
      { x: mapPxW - TILE_PX, y: mapPxH - TILE_PX },
    ];

    for (let ci = 0; ci < corners.length; ci++) {
      const c = corners[ci];
      const isLeft = c.x === 0;
      const isTop = c.y === 0;

      // Stepped pyramid blocks — 3 courses projecting outward
      for (let step = 0; step < 3; step++) {
        const proj = 4 + step * 4;
        const sx = isLeft ? c.x - proj : c.x + TILE_PX - 8 + proj;
        const sy = isTop ? c.y - proj : c.y + TILE_PX - 8 + proj;

        // Stone block
        g.fillStyle(0x6a5a4a, 0.7);
        g.fillRect(sx, sy, 8 + proj, 8 + proj);
        // Block highlight
        g.fillStyle(0x8a7a6a, 0.5);
        g.fillRect(sx, sy, 8 + proj, 2);
        if (isLeft) g.fillRect(sx, sy, 2, 8 + proj);
        else g.fillRect(sx + (8 + proj) - 2, sy, 2, 8 + proj);
        // Block shadow
        g.fillStyle(0x4a3a2a, 0.5);
        g.fillRect(sx, sy + (8 + proj) - 2, 8 + proj, 2);
        if (!isLeft) g.fillRect(sx, sy, 2, 8 + proj);
        else g.fillRect(sx + (8 + proj) - 2, sy, 2, 8 + proj);
      }

      // Glyph carving on the inner face of the corner
      const glyphCx = c.x + TILE_PX / 2;
      const glyphCy = c.y + TILE_PX / 2;
      const glyphSeed = ci * 137 + 42;

      // Stepped fret glyph (Mesoamerican step motif)
      g.lineStyle(1.5, 0x4a3a2a, 0.5);
      const steps = 3;
      const stepSize = 6;
      let gx = glyphCx - (steps * stepSize) / 2;
      let gy = glyphCy - (steps * stepSize) / 2;
      g.beginPath();
      g.moveTo(gx, gy);
      for (let s = 0; s < steps; s++) {
        g.lineTo(gx + stepSize, gy);
        g.lineTo(gx + stepSize, gy + stepSize);
        gx += stepSize / 2;
        gy += stepSize / 2;
      }
      g.strokePath();

      // Spiral accent (deterministic based on seed)
      g.lineStyle(1, 0x4a3a2a, 0.35);
      g.beginPath();
      const spCx = glyphCx + ((glyphSeed % 7) - 3) * 4;
      const spCy = glyphCy + ((glyphSeed % 5) - 2) * 4;
      for (let a = 0; a < Math.PI * 3; a += 0.15) {
        const r = 2 + a * 1.5;
        const px = spCx + Math.cos(a + glyphSeed) * r;
        const py = spCy + Math.sin(a + glyphSeed) * r;
        if (a === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
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

    const sheets = ["boss", "char-agent-resources", "char-hermes", ...Array.from({ length: 8 }, (_, i) => `char-${i}`)];
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

    if (!this.anims.exists("fountain-anim")) {
      this.anims.create({ key: "fountain-anim", frames: this.anims.generateFrameNumbers("fountain-sheet", { frames: [0, 1, 2, 3] }), frameRate: 6, repeat: -1 });
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

  /** Resolve an agent's deskIndex to their seat tile. */
  private getSeatForAgentId(agentId: string): Tile | null {
    const info = this.store.agents.get(agentId);
    if (!info) return null;
    const overflow = info.deskIndex - this.seats.length;
    return this.seats[info.deskIndex]
      ?? this.extraSpots[overflow % Math.max(this.extraSpots.length, 1)]
      ?? this.spawnTile
      ?? null;
  }

  private syncAgents(): void {
    for (const [id, info] of this.store.agents) {
      if (id === AGENT_RESOURCES_ID) {
        this.agentResources?.sync(info);
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
        // If the helicopter cinematic is still playing, defer NPC creation
        // until the agent walks out of the elevator. The agent is already
        // in the sidebar and interactable — they just shouldn't appear in
        // the office until the animation completes.
        if (this.heliActive) {
          this.pendingHeliAgents.push(id);
          continue;
        }
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
        // On initial page load, spawn agents at their desk so they don't all
        // walk in from the door.
        const spawnTile = !this.initialSyncDone ? seat
          : this.doorTile;
        const npc = new AgentNPC(this, this.grid, info, spawnTile, seat, (clicked) =>
          this.walkToAgent(clicked),
          (agentId) => this.getSeatForAgentId(agentId),
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
    this.initialSyncDone = true;
    // monitors glow whenever someone's at the desk — working or just typing;
    // they only go dark during the post-task break (done/error linger)
    this.monitors.forEach((m, i) => {
      const agent = [...this.store.agents.values()].find((a) => a.deskIndex === i);
      if (!agent) {
        // Unassigned desk — black screen
        m?.setFrame("2").clearTint();
      } else if (agent.status === "idle" || agent.status === "waiting") {
        // Assigned but idle (or waiting at another desk) — code editor look
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
        chair.setTexture(resolveChairTex(this, CHAIR_TEX_UP));
      } else {
        chair.setTexture(resolveChairTex(this, CHAIR_TEX_DOWN));
      }
    });

    // Agent Resources's monitor — always on since she's always at her desk
    if (this.agentResourcesMonitor) {
      const agentResourcesInfo = this.store.agents.get(AGENT_RESOURCES_ID);
      if (agentResourcesInfo && agentResourcesInfo.status !== "idle") {
        this.agentResourcesMonitor.setFrame("1");
        this.agentResourcesMonitor.setTint(STATUS_COLORS[agentResourcesInfo.status]);
      } else {
        this.agentResourcesMonitor.setFrame("0");
        this.agentResourcesMonitor.clearTint();
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
        this.agentResources?.update(time, dt, false, this.player.x, this.player.y);
        this.hermes?.update(time, dt);
      }
      const sel = this.store.selectedId ? this.npcs.get(this.store.selectedId) : null;
      const selAgentResources = this.store.selectedId === AGENT_RESOURCES_ID ? this.agentResources : null;
      const selHermes = this.store.selectedId === HERMES_ID ? this.hermes : null;
      this.selectRing.setVisible(!!(sel || selAgentResources || selHermes));
      if (sel) this.selectRing.setPosition(sel.container.x, sel.container.y + 1);
      else if (selAgentResources) this.selectRing.setPosition(selAgentResources.container.x, selAgentResources.container.y + 1);
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
      // Joystick input cancels any active tap-to-walk path
      this.playerPath = [];
      this.playerTargetPx = null;
      this.pendingInteract = false;
      this.pendingAgentId = null;
      this.clearPathMarker();
    }

    // Tap-to-walk: follow A* path inside office, or straight-line outside
    if (this.playerPath.length > 0) {
      const next = this.playerPath[0];
      const targetPx = { x: next.x * TILE_PX + TILE_PX / 2, y: next.y * TILE_PX + TILE_PX / 2 };
      const dx = targetPx.x - this.player.x;
      const dy = targetPx.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 8) {
        // Reached this tile — advance to next
        this.playerPath.shift();
        if (this.playerPath.length === 0) {
          // Path complete
          this.clearPathMarker();
          if (this.pendingAgentId) {
            const aid = this.pendingAgentId;
            this.pendingAgentId = null;
            this.selectAgent(aid);
          } else if (this.pendingInteract) {
            this.pendingInteract = false;
            // Simulate E press via touchInput so the full ePressed block runs next frame
            touchInput.action = "interact";
          }
        }
      } else {
        vx = dx / dist;
        vy = dy / dist;
      }
    } else if (this.playerTargetPx) {
      // Outside: straight-line movement to target
      const dx = this.playerTargetPx.x - this.player.x;
      const dy = this.playerTargetPx.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 12) {
        this.playerTargetPx = null;
        this.clearPathMarker();
        if (this.pendingAgentId) {
          const aid = this.pendingAgentId;
          this.pendingAgentId = null;
          this.selectAgent(aid);
        } else if (this.pendingInteract) {
          this.pendingInteract = false;
          touchInput.action = "interact";
        }
      } else {
        vx = dx / dist;
        vy = dy / dist;
      }
    }

    // Keyboard input cancels tap-to-walk
    if (left || right || up || down) {
      this.playerPath = [];
      this.playerTargetPx = null;
      this.pendingInteract = false;
      this.pendingAgentId = null;
      this.clearPathMarker();
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
    }
    const accentColor = time < this.coffeeUntil ? 0xb0741f : time < this.sofaUntil ? 0x9a7acb : 0x3a8cd4;
    this.drawPlayerNameBg(accentColor);
    this.playerLabel
      .setPosition(this.player.x, this.player.y - 108)
      .setDepth(10 + this.player.y);
    this.playerNameBg
      .setPosition(this.player.x, this.player.y - 108)
      .setDepth(10 + this.player.y - 0.1);
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
      // server rack — query Railway + GitHub data, or open code editor if inside a world
      if (this.nearestTile(this.serverRackTiles, 150)) {
        if (this.store.currentWorld) {
          // Inside a deployed world — open code editor for this world's branch
          this.store.toggleCodeEditor(true);
          this.store.codeEditorBranch = this.store.currentWorld.branchName;
          this.store.codeEditorFile = null;
          this.store.codeEditorPath = "";
          this.store.codeEditorDir = [];
          this.store.sendFn?.({ type: "github_list_dir", branchName: this.store.currentWorld.branchName, path: "" });
          this.store.toast("Opening code editor...");
        } else {
          const net = this.game.registry.get("net") as Net;
          net.send({ type: "railway_query" });
          net.send({ type: "github_query" });
          net.send({ type: "railway_list_deployments" });
          this.store.toast("Querying Railway + GitHub...");
        }
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
          // also check Agent Resources
          if (this.agentResources) {
            const d = Phaser.Math.Distance.Between(
              this.player.x,
              this.player.y,
              this.agentResources.container.x,
              this.agentResources.container.y,
            );
            if (d < 144 && (!best || d < best.d)) best = { id: AGENT_RESOURCES_ID, d };
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
            if (best.id === AGENT_RESOURCES_ID) achievements.unlock("agent-resources_visit");
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

    // --- projector screen video overlay (deferred to postupdate for accurate camera position) ---

    // --- agents ---
    for (const npc of this.npcs.values()) npc.update(time, dt, this.store.settings.game.idleWander, this.player.x, this.player.y);
    // Run Agent Resources/Hermes state machine unless we're a visitor in someone else's private office
    const myRole = this._myUserId ? this.store.roomPlayers.get(this._myUserId)?.role : undefined;
    const isVisitor = (myRole === "member" || myRole === "guest") && this.store.roomId !== "hq2";
    if (!isVisitor) {
      this.agentResources?.update(time, dt, false, this.player.x, this.player.y);
      this.hermes?.update(time, dt);
    }

    // selection ring
    const sel = this.store.selectedId ? this.npcs.get(this.store.selectedId) : null;
    const selAgentResources = this.store.selectedId === AGENT_RESOURCES_ID ? this.agentResources : null;
    const selHermes = this.store.selectedId === HERMES_ID ? this.hermes : null;
    this.selectRing.setVisible(!!(sel || selAgentResources || selHermes));
    if (sel) this.selectRing.setPosition(sel.container.x, sel.container.y + 1);
    else if (selAgentResources) this.selectRing.setPosition(selAgentResources.container.x, selAgentResources.container.y + 1);
    else if (selHermes) this.selectRing.setPosition(selHermes.container.x, selHermes.container.y + 1);

    // --- lighting ---
    this.updateLighting(time);

    // --- world layer: chunks, ghosts, compass, recruit ---
    this.registry.set("playerPos", { x: this.player.x, y: this.player.y });
    const spacePressed = Phaser.Input.Keyboard.JustDown(this.keys.SPACE);
    this.world.update(time, dt, this.player.x, this.player.y, ePressed, vx, vy, this.playerDir, spacePressed);
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

    // R: deploy next captured ally (when outside)
    const rPressed = Phaser.Input.Keyboard.JustDown(this.keys.R);
    if (outside && rPressed) {
      const roster = this.world.getRoster();
      if (roster.length === 0) {
        this.store.toast("No captured creatures to deploy. Weaken and capture some first!");
      } else {
        // Deploy first roster entry not already deployed
        const deployed = this.world.getDeployedIds();
        const next = roster.find((e) => !deployed.has(e.id));
        if (next) {
          this.world.deployAlly(next, this.player.x, this.player.y);
        } else {
          // All deployed — recall them
          this.world.recallAllies();
          this.store.toast("All allies recalled.");
        }
      }
    }

    // T: swap weapon (cycle owned weapons)
    const tPressed = Phaser.Input.Keyboard.JustDown(this.keys.T);
    if (tPressed) {
      this.world.swapWeapon();
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
      if (this.agentResources) {
        const s = this.agentResources.getState();
        this.net?.send({ type: "npc_update", npcId: AGENT_RESOURCES_ID, ...s });
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
            fontFamily: "'M PLUS Rounded 1c', sans-serif",
            fontSize: "18px",
            color: "#ffffff",
            stroke: "#0d1018",
            strokeThickness: 4,
          })
          .setResolution(4)
          .setOrigin(0.5, 1)
          .setScale(0.75)
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
      {
        const w = entry.label.displayWidth + 22;
        const h = 22;
        const r = 5;
        const x = -w / 2;
        const y = -18;
        entry.nameBg.fillStyle(0x0d1018, 0.78);
        entry.nameBg.fillRoundedRect(x, y, w, h, r);
        entry.nameBg.fillStyle(0x4cb866, 0.85);
        entry.nameBg.fillRect(x + 2, y + 3, 3, h - 6);
        entry.nameBg.lineStyle(1, 0xffffff, 0.18);
        entry.nameBg.strokeRoundedRect(x, y, w, h, r);
      }

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
    this.agentViewTab = "screen";
    this.agentFsPath = ".";
    this.agentViewCleanup = [];

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
      background: rgba(20,50,100,0.4); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); z-index: 1000;
      display: flex; align-items: center; justify-content: center;
    `;
    modal.innerHTML = `
      <div style="background: linear-gradient(to bottom, rgba(235,245,255,0.95), rgba(200,225,250,0.9)); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.6); border-radius: 14px; padding: 0; max-width: 90vw; max-height: 90vh; position: relative; display:flex; flex-direction:column; box-shadow: 0 12px 48px rgba(0,80,180,0.2), inset 0 1px 0 rgba(255,255,255,0.8);">
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; background: linear-gradient(to bottom, rgba(120,180,240,0.7), rgba(80,140,220,0.5)); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-radius: 13px 13px 0 0; border-bottom: 1px solid rgba(255,255,255,0.4);">
          <div>
            <span style="color: #ffffff; font-weight: bold; font-size: 1.1rem; text-shadow: 0 1px 3px rgba(0,60,140,0.4);">${agent.name}</span>
            <span style="color: rgba(255,255,255,0.8); font-size: 0.8rem; margin-left: 8px; text-shadow: 0 1px 2px rgba(0,60,140,0.3);">${agent.status.toUpperCase()}</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button id="agent-view-broadcast" style="padding: 5px 14px; border: 1px solid rgba(255,255,255,0.4); border-radius: 16px; background: linear-gradient(to bottom, rgba(140,200,255,0.8), rgba(80,150,230,0.6)); color: #fff; font-size: 0.8rem; cursor: pointer; text-shadow: 0 1px 2px rgba(0,60,140,0.3); box-shadow: inset 0 1px 0 rgba(255,255,255,0.5);">Broadcast to Projector</button>
            <button id="agent-view-close" style="padding: 5px 14px; border: 1px solid rgba(255,180,180,0.5); border-radius: 16px; background: linear-gradient(to bottom, rgba(255,150,150,0.7), rgba(230,100,100,0.5)); color: #fff; font-size: 0.8rem; cursor: pointer; text-shadow: 0 1px 2px rgba(140,30,30,0.3); box-shadow: inset 0 1px 0 rgba(255,255,255,0.4);">Close</button>
          </div>
        </div>
        <div id="agent-view-tabs" style="display:flex;gap:2px;padding:4px 10px;background:linear-gradient(to bottom,rgba(220,235,250,0.6),rgba(200,220,245,0.4));border-bottom:1px solid rgba(255,255,255,0.3);">
          <button class="av-tab" data-tab="screen" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 4px;border:1px solid rgba(255,255,255,0.5);border-bottom:none;border-radius:10px 10px 0 0;background:linear-gradient(to bottom,rgba(255,255,255,0.9),rgba(220,240,255,0.7));color:#1a6bb0;font-size:0.78rem;cursor:pointer;font-weight:bold;text-shadow:0 1px 0 rgba(255,255,255,0.8);box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);"><svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="tg-sc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ec8ee"/><stop offset="1" stop-color="#2a8cd4"/></linearGradient><linearGradient id="tg-sb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0f0f0"/><stop offset="1" stop-color="#b0b0b0"/></linearGradient></defs><rect x="1" y="1" width="14" height="10" rx="1.5" fill="url(#tg-sb)" stroke="#888" stroke-width="0.5"/><rect x="2.5" y="2.5" width="11" height="7" rx="0.5" fill="url(#tg-sc)"/><rect x="2.5" y="2.5" width="11" height="2.5" rx="0.5" fill="rgba(255,255,255,0.35)"/><rect x="5.5" y="11.5" width="5" height="1.5" rx="0.3" fill="#aaa"/><rect x="3.5" y="13.5" width="9" height="1.2" rx="0.4" fill="#999"/></svg> Screen</button>
          <button class="av-tab" data-tab="files" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 4px;border:1px solid rgba(180,200,225,0.4);border-bottom:none;border-radius:10px 10px 0 0;background:linear-gradient(to bottom,rgba(200,220,245,0.5),rgba(180,205,235,0.3));color:#4a7a9a;font-size:0.78rem;cursor:pointer;"><svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="tg-fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="0.5" stop-color="#f5cc60"/><stop offset="1" stop-color="#d8a830"/></linearGradient></defs><path d="M1 4 Q1 3 2 3 L5.5 3 Q6 3 6.5 3.5 L8 5 L14 5 Q15 5 15 6 L15 13 Q15 14 14 14 L2 14 Q1 14 1 13 Z" fill="url(#tg-fl)" stroke="#c08820" stroke-width="0.5"/><rect x="1" y="6" width="14" height="0.8" fill="rgba(255,255,255,0.5)"/><path d="M1 7 L15 7 L15 13 Q15 14 14 14 L2 14 Q1 14 1 13 Z" fill="url(#tg-fl)" opacity="0.7"/></svg> Files</button>
          <button class="av-tab" data-tab="terminal" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 4px;border:1px solid rgba(180,200,225,0.4);border-bottom:none;border-radius:10px 10px 0 0;background:linear-gradient(to bottom,rgba(200,220,245,0.5),rgba(180,205,235,0.3));color:#4a7a9a;font-size:0.78rem;cursor:pointer;"><svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="tg-tt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8e8e8"/><stop offset="1" stop-color="#b8b8b8"/></linearGradient><linearGradient id="tg-ts" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2a3a"/><stop offset="1" stop-color="#0a1525"/></linearGradient></defs><rect x="1" y="1" width="14" height="11" rx="1.5" fill="url(#tg-tt)" stroke="#888" stroke-width="0.5"/><rect x="1" y="1" width="14" height="3" rx="1.5" fill="#c8c8c8"/><circle cx="3" cy="2.5" r="0.8" fill="#ff6058"/><circle cx="5" cy="2.5" r="0.8" fill="#ffbd2e"/><circle cx="7" cy="2.5" r="0.8" fill="#28ca42"/><rect x="2.5" y="5" width="11" height="6" rx="0.5" fill="url(#tg-ts)"/><path d="M3.5 7 L5 8.5 L3.5 10" stroke="#5dd55d" stroke-width="0.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="5.5" y="9.5" width="4" height="0.8" fill="#5dd55d" rx="0.2"/></svg> Terminal</button>
          <button class="av-tab" data-tab="tasks" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 4px;border:1px solid rgba(180,200,225,0.4);border-bottom:none;border-radius:10px 10px 0 0;background:linear-gradient(to bottom,rgba(200,220,245,0.5),rgba(180,205,235,0.3));color:#4a7a9a;font-size:0.78rem;cursor:pointer;"><svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="tg-tk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8f8f8"/><stop offset="1" stop-color="#d0d0d0"/></linearGradient><linearGradient id="tg-tc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5dd55d"/><stop offset="1" stop-color="#2a8c2a"/></linearGradient></defs><rect x="3" y="2" width="10" height="12" rx="1" fill="url(#tg-tk)" stroke="#999" stroke-width="0.5"/><rect x="5" y="1" width="6" height="2.5" rx="1" fill="#888"/><rect x="4.5" y="5" width="7" height="0.8" fill="#ccc" rx="0.2"/><path d="M4.5 9 L6 10.5 L8.5 7.5" stroke="url(#tg-tc)" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="4.5" y="11.5" width="7" height="0.8" fill="#ccc" rx="0.2"/></svg> Tasks</button>
          <button class="av-tab" data-tab="chat" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 4px;border:1px solid rgba(180,200,225,0.4);border-bottom:none;border-radius:10px 10px 0 0;background:linear-gradient(to bottom,rgba(200,220,245,0.5),rgba(180,205,235,0.3));color:#4a7a9a;font-size:0.78rem;cursor:pointer;"><svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="tg-ch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8e0f8"/><stop offset="1" stop-color="#5fb8e8"/></linearGradient></defs><path d="M2 2 L14 2 Q15 2 15 3 L15 10 Q15 11 14 11 L6 11 L3 14 L3 11 L2 11 Q1 11 1 10 L1 3 Q1 2 2 2 Z" fill="url(#tg-ch)" stroke="#2a8cd4" stroke-width="0.5"/><circle cx="5" cy="6.5" r="1" fill="#fff"/><circle cx="8" cy="6.5" r="1" fill="#fff"/><circle cx="11" cy="6.5" r="1" fill="#fff"/></svg> Chat</button>
          <button class="av-tab" data-tab="memory" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 4px;border:1px solid rgba(180,200,225,0.4);border-bottom:none;border-radius:10px 10px 0 0;background:linear-gradient(to bottom,rgba(200,220,245,0.5),rgba(180,205,235,0.3));color:#4a7a9a;font-size:0.78rem;cursor:pointer;"><svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="tg-mc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8c8e8"/><stop offset="0.5" stop-color="#78a8d0"/><stop offset="1" stop-color="#5088b8"/></linearGradient></defs><rect x="2" y="3" width="12" height="8" rx="1" fill="url(#tg-mc)" stroke="#406890" stroke-width="0.5"/><rect x="3.5" y="4.5" width="9" height="5" rx="0.5" fill="#2a5878" opacity="0.6"/><rect x="3" y="11" width="1" height="2.5" fill="#888"/><rect x="5.5" y="11" width="1" height="2.5" fill="#888"/><rect x="8" y="11" width="1" height="2.5" fill="#888"/><rect x="10.5" y="11" width="1" height="2.5" fill="#888"/><rect x="4.5" y="5.5" width="2" height="1" fill="#5dd55d" rx="0.2"/><rect x="7.5" y="5.5" width="2" height="1" fill="#ffcc44" rx="0.2"/><rect x="4.5" y="7.5" width="2" height="1" fill="#5dd5ff" rx="0.2"/><rect x="7.5" y="7.5" width="2" height="1" fill="#ff8844" rx="0.2"/></svg> Memory</button>
          <button class="av-tab" data-tab="stats" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 4px;border:1px solid rgba(180,200,225,0.4);border-bottom:none;border-radius:10px 10px 0 0;background:linear-gradient(to bottom,rgba(200,220,245,0.5),rgba(180,205,235,0.3));color:#4a7a9a;font-size:0.78rem;cursor:pointer;"><svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="tg-s1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ec8ee"/><stop offset="1" stop-color="#2a8cd4"/></linearGradient><linearGradient id="tg-s2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5dd55d"/><stop offset="1" stop-color="#2a8c2a"/></linearGradient><linearGradient id="tg-s3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcc88"/><stop offset="1" stop-color="#e8a830"/></linearGradient></defs><rect x="2" y="9" width="3" height="5" rx="0.5" fill="url(#tg-s1)" stroke="#2a8cd4" stroke-width="0.3"/><rect x="6.5" y="6" width="3" height="8" rx="0.5" fill="url(#tg-s2)" stroke="#2a8c2a" stroke-width="0.3"/><rect x="11" y="3" width="3" height="11" rx="0.5" fill="url(#tg-s3)" stroke="#e8a830" stroke-width="0.3"/><rect x="2" y="9" width="3" height="1.5" fill="rgba(255,255,255,0.35)" rx="0.3"/><rect x="6.5" y="6" width="3" height="1.5" fill="rgba(255,255,255,0.35)" rx="0.3"/><rect x="11" y="3" width="3" height="1.5" fill="rgba(255,255,255,0.35)" rx="0.3"/></svg> Stats</button>
        </div>
        <div id="agent-view-content" style="width: 900px; height: 560px; background: linear-gradient(to bottom, rgba(255,255,255,0.95), rgba(240,248,255,0.9)); border-radius: 0 0 12px 12px; overflow: hidden;">
        </div>
        ${agent.task ? `<div style="color: #4a7a9a; font-size: 0.75rem; margin: 6px 14px 10px; text-shadow: 0 1px 0 rgba(255,255,255,0.5);">Task: ${agent.task}</div>` : ""}
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
        if (this.net) this.net.send({ type: "agent_broadcast_stop" });
        broadcastBtn.textContent = "Broadcast to Projector";
        (broadcastBtn as HTMLButtonElement).style.background = "linear-gradient(to bottom, rgba(140,200,255,0.8), rgba(80,150,230,0.6))";
      } else {
        if (this.net) this.net.send({ type: "agent_broadcast_start", agentId: agent.id });
        broadcastBtn.textContent = "Stop Broadcast";
        (broadcastBtn as HTMLButtonElement).style.background = "linear-gradient(to bottom, rgba(255,150,150,0.7), rgba(230,100,100,0.5))";
      }
    });

    if (this.agentBroadcastAgentId === agent.id) {
      broadcastBtn.textContent = "Stop Broadcast";
      (broadcastBtn as HTMLButtonElement).style.background = "linear-gradient(to bottom, rgba(255,150,150,0.7), rgba(230,100,100,0.5))";
    }

    // Wire tab buttons
    modal.querySelectorAll(".av-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = (btn as HTMLElement).dataset.tab as "screen" | "files" | "terminal" | "tasks" | "chat" | "memory" | "stats";
        this.switchAgentViewTab(tab, agent.id);
      });
    });

    // Click outside to close
    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.closeAgentViewModal();
    });

    // Render initial tab (screen)
    this.renderAgentViewTab(agent.id);
  }

  /** Switch to a different tab in the agent monitor. */
  private switchAgentViewTab(tab: "screen" | "files" | "terminal" | "tasks" | "chat" | "memory" | "stats", agentId: string): void {
    this.agentViewTab = tab;
    // Update tab button styles
    const modal = document.getElementById("agent-view-modal");
    if (modal) {
      modal.querySelectorAll(".av-tab").forEach(btn => {
        const isActive = (btn as HTMLElement).dataset.tab === tab;
        const svg = btn.querySelector('svg');
        if (isActive) {
          (btn as HTMLElement).style.background = "linear-gradient(to bottom,rgba(255,255,255,0.9),rgba(220,240,255,0.7))";
          (btn as HTMLElement).style.color = "#1a6bb0";
          (btn as HTMLElement).style.fontWeight = "bold";
          (btn as HTMLElement).style.textShadow = "0 1px 0 rgba(255,255,255,0.8)";
          if (svg) (svg as SVGElement).style.opacity = "1";
        } else {
          (btn as HTMLElement).style.background = "linear-gradient(to bottom,rgba(200,220,245,0.5),rgba(180,205,235,0.3))";
          (btn as HTMLElement).style.color = "#4a7a9a";
          (btn as HTMLElement).style.fontWeight = "normal";
          (btn as HTMLElement).style.textShadow = "";
          if (svg) (svg as SVGElement).style.opacity = "0.5";
        }
      });
    }
    // Clean up previous tab listeners
    for (const cleanup of this.agentViewCleanup) cleanup();
    this.agentViewCleanup = [];

    // Handle log subscription lifecycle
    if (tab === "terminal") {
      if (this.net) this.net.send({ type: "agent_log_subscribe", agentId });
    } else {
      if (this.net) this.net.send({ type: "agent_log_unsubscribe", agentId });
    }

    this.renderAgentViewTab(agentId);
  }

  /** Render the current tab content. */
  private renderAgentViewTab(agentId: string): void {
    const content = document.getElementById("agent-view-content");
    if (!content) return;
    const agent = this.store.agents.get(agentId);
    if (!agent) return;

    if (this.agentViewTab === "screen") {
      content.innerHTML = this.renderAgentScreenTab(agent);
    } else if (this.agentViewTab === "files") {
      this.renderFilesTab(agentId, content);
    } else if (this.agentViewTab === "terminal") {
      this.renderTerminalTab(agentId, content);
    } else if (this.agentViewTab === "tasks") {
      this.renderTasksTab(agentId, content);
    } else if (this.agentViewTab === "chat") {
      this.renderChatTab(agentId, content);
    } else if (this.agentViewTab === "memory") {
      this.renderMemoryTab(agentId, content);
    } else if (this.agentViewTab === "stats") {
      this.renderStatsTab(agentId, content);
    }
  }

  /** Render the Files tab — file browser with upload/download/delete. */
  private renderFilesTab(agentId: string, content: HTMLElement): void {
    content.innerHTML = `
      <div style="width:100%;height:100%;display:flex;flex-direction:column;font-family:'Segoe UI',Tahoma,sans-serif;color:#1a3a5a;font-size:0.8rem;">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:linear-gradient(to bottom,rgba(255,255,255,0.6),rgba(220,240,255,0.4));backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid rgba(255,255,255,0.4);">
          <span style="color:#4a7a9a;font-size:0.7rem;">Path:</span>
          <span id="av-fs-path" style="color:#1a6bb0;flex:1;font-weight:bold;text-shadow:0 1px 0 rgba(255,255,255,0.5);">${this.agentFsPath}</span>
          <button id="av-fs-up" style="padding:3px 12px;border:1px solid rgba(255,255,255,0.5);border-radius:14px;background:linear-gradient(to bottom,rgba(255,255,255,0.8),rgba(220,240,255,0.5));color:#1a6bb0;font-size:0.7rem;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);">Up</button>
          <label style="padding:3px 12px;border:1px solid rgba(255,255,255,0.4);border-radius:14px;background:linear-gradient(to bottom,rgba(120,180,240,0.7),rgba(80,150,220,0.5));color:#fff;font-size:0.7rem;cursor:pointer;text-shadow:0 1px 2px rgba(0,60,140,0.3);box-shadow:inset 0 1px 0 rgba(255,255,255,0.5);">
            Upload
            <input id="av-fs-upload-input" type="file" style="display:none;" />
          </label>
        </div>
        <div id="av-fs-listing" style="flex:1;overflow-y:auto;padding:4px 0;background:linear-gradient(to bottom,rgba(255,255,255,0.9),rgba(245,250,255,0.8));"></div>
        <div id="av-fs-viewer" style="display:none;flex:1;overflow:hidden;border-top:1px solid rgba(255,255,255,0.4);flex-direction:column;">
          <div style="display:flex;align-items:center;gap:6px;padding:6px 14px;background:linear-gradient(to bottom,rgba(255,255,255,0.6),rgba(220,240,255,0.4));backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);">
            <span id="av-fs-filename" style="color:#1a6bb0;font-size:0.75rem;flex:1;font-weight:bold;text-shadow:0 1px 0 rgba(255,255,255,0.5);"></span>
            <button id="av-fs-edit" style="padding:3px 12px;border:1px solid rgba(255,255,255,0.4);border-radius:14px;background:linear-gradient(to bottom,rgba(120,220,120,0.7),rgba(60,180,80,0.5));color:#fff;font-size:0.7rem;cursor:pointer;text-shadow:0 1px 2px rgba(20,100,30,0.3);box-shadow:inset 0 1px 0 rgba(255,255,255,0.4);">Edit</button>
            <button id="av-fs-save" style="display:none;padding:3px 12px;border:1px solid rgba(255,255,255,0.4);border-radius:14px;background:linear-gradient(to bottom,rgba(120,220,120,0.7),rgba(60,180,80,0.5));color:#fff;font-size:0.7rem;cursor:pointer;text-shadow:0 1px 2px rgba(20,100,30,0.3);box-shadow:inset 0 1px 0 rgba(255,255,255,0.4);">Save</button>
            <button id="av-fs-cancel-edit" style="display:none;padding:3px 12px;border:1px solid rgba(255,255,255,0.5);border-radius:14px;background:linear-gradient(to bottom,rgba(255,255,255,0.8),rgba(220,240,255,0.5));color:#4a7a9a;font-size:0.7rem;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);">Cancel</button>
            <button id="av-fs-download" style="padding:3px 12px;border:1px solid rgba(255,255,255,0.4);border-radius:14px;background:linear-gradient(to bottom,rgba(120,180,240,0.7),rgba(80,150,220,0.5));color:#fff;font-size:0.7rem;cursor:pointer;text-shadow:0 1px 2px rgba(0,60,140,0.3);box-shadow:inset 0 1px 0 rgba(255,255,255,0.5);">Download</button>
            <button id="av-fs-delete" style="padding:3px 12px;border:1px solid rgba(255,180,180,0.5);border-radius:14px;background:linear-gradient(to bottom,rgba(255,150,150,0.7),rgba(230,100,100,0.5));color:#fff;font-size:0.7rem;cursor:pointer;text-shadow:0 1px 2px rgba(140,30,30,0.3);box-shadow:inset 0 1px 0 rgba(255,255,255,0.4);">Delete</button>
            <button id="av-fs-close-viewer" style="padding:3px 12px;border:1px solid rgba(255,255,255,0.5);border-radius:14px;background:linear-gradient(to bottom,rgba(255,255,255,0.8),rgba(220,240,255,0.5));color:#4a7a9a;font-size:0.7rem;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);">Back</button>
          </div>
          <pre id="av-fs-content" style="flex:1;overflow:auto;margin:0;padding:14px;background:rgba(255,255,255,0.85);color:#1a3a5a;font-size:0.75rem;line-height:1.4;white-space:pre-wrap;word-break:break-all;"></pre>
          <textarea id="av-fs-editor" style="display:none;flex:1;margin:0;padding:14px;background:rgba(255,255,255,0.9);color:#1a3a5a;font-size:0.75rem;line-height:1.4;border:none;border-top:1px solid rgba(255,255,255,0.4);font-family:'Consolas',monospace;resize:none;outline:none;" spellcheck="false"></textarea>
        </div>
      </div>
    `;

    // Request listing
    if (this.net) this.net.send({ type: "agent_fs_list", agentId, path: this.agentFsPath });

    // Listen for listing responses
    const onListing = (respAgentId: string, path: string, entries: { name: string; isDir: boolean; size: number; mtime: number }[]) => {
      if (respAgentId !== agentId || path !== this.agentFsPath) return;
      const listingEl = document.getElementById("av-fs-listing");
      if (!listingEl) return;
      if (entries.length === 0) {
        listingEl.innerHTML = `<div style="padding:16px;color:#7aaac0;text-align:center;">Empty directory</div>`;
        return;
      }
      listingEl.innerHTML = entries.map(e => {
        const icon = e.isDir ? "📁" : "📄";
        const sizeStr = e.isDir ? "" : this.formatFileSize(e.size);
        const timeStr = new Date(e.mtime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return `<div class="av-fs-item" data-name="${e.name}" data-dir="${e.isDir}" style="display:flex;align-items:center;gap:8px;padding:5px 14px;cursor:pointer;border-bottom:1px solid rgba(220,235,250,0.5);transition:background 0.15s;">
          <span style="font-size:0.9rem;filter:drop-shadow(0 1px 2px rgba(0,80,160,0.15));">${icon}</span>
          <span style="flex:1;color:${e.isDir ? "#1a6bb0" : "#1a3a5a"};text-shadow:0 1px 0 rgba(255,255,255,0.5);">${e.name}</span>
          <span style="color:#7aaac0;font-size:0.65rem;">${sizeStr}</span>
          <span style="color:#a0c0d8;font-size:0.65rem;">${timeStr}</span>
        </div>`;
      }).join("");

      // Wire item clicks
      listingEl.querySelectorAll(".av-fs-item").forEach(item => {
        item.addEventListener("click", () => {
          const name = (item as HTMLElement).dataset.name!;
          const isDir = (item as HTMLElement).dataset.dir === "true";
          const newPath = this.agentFsPath === "." ? name : `${this.agentFsPath}/${name}`;
          if (isDir) {
            this.agentFsPath = newPath;
            if (this.net) this.net.send({ type: "agent_fs_list", agentId, path: newPath });
            const pathEl = document.getElementById("av-fs-path");
            if (pathEl) pathEl.textContent = newPath;
          } else {
            // Read file
            if (this.net) this.net.send({ type: "agent_fs_read", agentId, path: newPath });
            this.agentFsCurrentFile = newPath;
          }
        });
      });
    };
    this.store.onAgentFsListing(onListing);
    this.agentViewCleanup.push(() => this.store.offAgentFsListing(onListing));

    // Listen for file content
    const onContent = (respAgentId: string, path: string, fileContent: string, error?: string) => {
      if (respAgentId !== agentId) return;
      const viewer = document.getElementById("av-fs-viewer");
      const filenameEl = document.getElementById("av-fs-filename");
      const contentEl = document.getElementById("av-fs-content");
      const listingEl = document.getElementById("av-fs-listing");
      if (!viewer || !filenameEl || !contentEl) return;
      viewer.style.display = "flex";
      if (listingEl) listingEl.style.display = "none";
      filenameEl.textContent = path;
      if (error) {
        contentEl.textContent = `Error: ${error}`;
        contentEl.style.color = "#c62828";
      } else {
        this.agentFsRawContent = fileContent;
        if (path.endsWith(".md")) {
          contentEl.innerHTML = md(fileContent);
          contentEl.style.color = "#1a3a5a";
        } else {
          contentEl.textContent = fileContent;
          contentEl.style.color = "#1a3a5a";
        }
      }
    };
    this.store.onAgentFsContent(onContent);
    this.agentViewCleanup.push(() => this.store.offAgentFsContent(onContent));

    // Listen for FS results (write/delete/upload)
    const onResult = (respAgentId: string, _path: string, action: string, success: boolean, error?: string) => {
      if (respAgentId !== agentId) return;
      if (success) {
        // Refresh listing
        if (this.net) this.net.send({ type: "agent_fs_list", agentId, path: this.agentFsPath });
        this.store.toast(`File ${action} successful`);
      } else {
        this.store.toast(`File ${action} failed: ${error ?? "unknown error"}`);
      }
    };
    this.store.onAgentFsResult(onResult);
    this.agentViewCleanup.push(() => this.store.offAgentFsResult(onResult));

    // Wire Up button
    document.getElementById("av-fs-up")?.addEventListener("click", () => {
      if (this.agentFsPath === ".") return;
      const parts = this.agentFsPath.split("/");
      parts.pop();
      this.agentFsPath = parts.join("/") || ".";
      if (this.net) this.net.send({ type: "agent_fs_list", agentId, path: this.agentFsPath });
      const pathEl = document.getElementById("av-fs-path");
      if (pathEl) pathEl.textContent = this.agentFsPath;
    });

    // Wire upload
    const uploadInput = document.getElementById("av-fs-upload-input") as HTMLInputElement | null;
    uploadInput?.addEventListener("change", () => {
      const file = uploadInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1] ?? "";
        const uploadPath = this.agentFsPath === "." ? file.name : `${this.agentFsPath}/${file.name}`;
        if (this.net) this.net.send({ type: "agent_fs_upload", agentId, path: uploadPath, content: base64, encoding: "base64" });
      };
      reader.readAsDataURL(file);
    });

    // Wire viewer buttons
    document.getElementById("av-fs-close-viewer")?.addEventListener("click", () => {
      const viewer = document.getElementById("av-fs-viewer");
      const listingEl = document.getElementById("av-fs-listing");
      if (viewer) viewer.style.display = "none";
      if (listingEl) listingEl.style.display = "block";
    });

    document.getElementById("av-fs-download")?.addEventListener("click", () => {
      const filename = this.agentFsCurrentFile?.split("/").pop() ?? "download";
      const contentEl = document.getElementById("av-fs-content");
      if (!contentEl) return;
      const blob = new Blob([this.agentFsRawContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById("av-fs-delete")?.addEventListener("click", () => {
      if (!this.agentFsCurrentFile) return;
      if (!confirm(`Delete ${this.agentFsCurrentFile}?`)) return;
      if (this.net) this.net.send({ type: "agent_fs_delete", agentId, path: this.agentFsCurrentFile });
      const viewer = document.getElementById("av-fs-viewer");
      const listingEl = document.getElementById("av-fs-listing");
      if (viewer) viewer.style.display = "none";
      if (listingEl) listingEl.style.display = "block";
    });

    // Wire edit/save/cancel
    document.getElementById("av-fs-edit")?.addEventListener("click", () => {
      const contentEl = document.getElementById("av-fs-content") as HTMLPreElement | null;
      const editorEl = document.getElementById("av-fs-editor") as HTMLTextAreaElement | null;
      const editBtn = document.getElementById("av-fs-edit");
      const saveBtn = document.getElementById("av-fs-save");
      const cancelBtn = document.getElementById("av-fs-cancel-edit");
      if (!contentEl || !editorEl) return;
      editorEl.value = this.agentFsRawContent;
      contentEl.style.display = "none";
      editorEl.style.display = "block";
      if (editBtn) editBtn.style.display = "none";
      if (saveBtn) saveBtn.style.display = "inline-block";
      if (cancelBtn) cancelBtn.style.display = "inline-block";
      editorEl.focus();
    });

    document.getElementById("av-fs-save")?.addEventListener("click", () => {
      if (!this.agentFsCurrentFile) return;
      const editorEl = document.getElementById("av-fs-editor") as HTMLTextAreaElement | null;
      const contentEl = document.getElementById("av-fs-content") as HTMLPreElement | null;
      const editBtn = document.getElementById("av-fs-edit");
      const saveBtn = document.getElementById("av-fs-save");
      const cancelBtn = document.getElementById("av-fs-cancel-edit");
      if (!editorEl || !contentEl) return;
      const newContent = editorEl.value;
      if (this.net) this.net.send({ type: "agent_fs_write", agentId, path: this.agentFsCurrentFile, content: newContent });
      this.agentFsRawContent = newContent;
      if (this.agentFsCurrentFile?.endsWith(".md")) {
        contentEl.innerHTML = md(newContent);
      } else {
        contentEl.textContent = newContent;
      }
      contentEl.style.display = "block";
      editorEl.style.display = "none";
      if (editBtn) editBtn.style.display = "inline-block";
      if (saveBtn) saveBtn.style.display = "none";
      if (cancelBtn) cancelBtn.style.display = "none";
    });

    document.getElementById("av-fs-cancel-edit")?.addEventListener("click", () => {
      const contentEl = document.getElementById("av-fs-content") as HTMLPreElement | null;
      const editorEl = document.getElementById("av-fs-editor") as HTMLTextAreaElement | null;
      const editBtn = document.getElementById("av-fs-edit");
      const saveBtn = document.getElementById("av-fs-save");
      const cancelBtn = document.getElementById("av-fs-cancel-edit");
      if (contentEl) contentEl.style.display = "block";
      if (editorEl) editorEl.style.display = "none";
      if (editBtn) editBtn.style.display = "inline-block";
      if (saveBtn) saveBtn.style.display = "none";
      if (cancelBtn) cancelBtn.style.display = "none";
    });
  }

  /** Current file being viewed in the file browser. */
  private agentFsCurrentFile: string | null = null;
  /** Raw content of the currently viewed file (before markdown rendering). */
  private agentFsRawContent = "";

  /** Render the Terminal tab — live log stream. */
  private renderTerminalTab(agentId: string, content: HTMLElement): void {
    content.innerHTML = `
      <div style="width:100%;height:100%;display:flex;flex-direction:column;font-family:'Courier New',monospace;color:#c0d0e0;font-size:0.78rem;">
        <div style="display:flex;align-items:center;gap:8px;padding:6px 14px;background:linear-gradient(to bottom,rgba(255,255,255,0.6),rgba(220,240,255,0.4));backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid rgba(255,255,255,0.4);flex-wrap:wrap;">
          <span style="color:#4a7a9a;font-size:0.7rem;">Live Log Stream</span>
          <span id="av-term-status" style="color:#3aaa3a;font-size:0.65rem;text-shadow:0 0 4px rgba(60,200,60,0.3);">● connected</span>
          <div style="display:flex;gap:4px;margin-left:8px;">
            <label style="display:flex;align-items:center;gap:2px;color:#4a7a9a;font-size:0.65rem;cursor:pointer;"><input class="av-term-filter" type="checkbox" value="status" checked /> status</label>
            <label style="display:flex;align-items:center;gap:2px;color:#4a7a9a;font-size:0.65rem;cursor:pointer;"><input class="av-term-filter" type="checkbox" value="text" checked /> text</label>
            <label style="display:flex;align-items:center;gap:2px;color:#4a7a9a;font-size:0.65rem;cursor:pointer;"><input class="av-term-filter" type="checkbox" value="tool" checked /> tool</label>
            <label style="display:flex;align-items:center;gap:2px;color:#4a7a9a;font-size:0.65rem;cursor:pointer;"><input class="av-term-filter" type="checkbox" value="result" checked /> result</label>
            <label style="display:flex;align-items:center;gap:2px;color:#4a7a9a;font-size:0.65rem;cursor:pointer;"><input class="av-term-filter" type="checkbox" value="error" checked /> error</label>
            <label style="display:flex;align-items:center;gap:2px;color:#4a7a9a;font-size:0.65rem;cursor:pointer;"><input class="av-term-filter" type="checkbox" value="boss" checked /> boss</label>
          </div>
          <button id="av-term-clear" style="margin-left:auto;padding:3px 12px;border:1px solid rgba(255,255,255,0.5);border-radius:14px;background:linear-gradient(to bottom,rgba(255,255,255,0.8),rgba(220,240,255,0.5));color:#4a7a9a;font-size:0.7rem;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);">Clear</button>
          <label style="display:flex;align-items:center;gap:4px;color:#4a7a9a;font-size:0.7rem;cursor:pointer;">
            <input id="av-term-autoscroll" type="checkbox" checked /> Auto-scroll
          </label>
        </div>
        <div id="av-terminal-log" style="flex:1;overflow-y:auto;padding:8px 14px;background:linear-gradient(to bottom,#0a1525,#0d1a30);"></div>
      </div>
    `;

    const logEl = document.getElementById("av-terminal-log")!;

    const getActiveFilters = (): Set<string> => {
      const filters = new Set<string>();
      document.querySelectorAll(".av-term-filter").forEach((cb: Element) => {
        const input = cb as HTMLInputElement;
        if (input.checked) filters.add(input.value);
      });
      return filters;
    };

    // Listen for log history
    const onHistory = (respAgentId: string, entries: LogEntry[]) => {
      if (respAgentId !== agentId) return;
      const filters = getActiveFilters();
      logEl.innerHTML = entries.filter(e => filters.has(e.kind)).map(e => this.formatLogEntry(e)).join("");
      this.scrollToTerminalBottom();
    };
    this.store.onAgentLogHistory(onHistory);
    this.agentViewCleanup.push(() => this.store.offAgentLogHistory(onHistory));

    // Listen for live log entries
    const onLog = (respAgentId: string, entry: LogEntry) => {
      if (respAgentId !== agentId) return;
      const filters = getActiveFilters();
      if (!filters.has(entry.kind)) return;
      logEl.insertAdjacentHTML("beforeend", this.formatLogEntry(entry));
      this.scrollToTerminalBottom();
    };
    this.store.onAgentLog(onLog);
    this.agentViewCleanup.push(() => this.store.offAgentLog(onLog));

    // Wire filter changes — re-render from stored logs
    document.querySelectorAll(".av-term-filter").forEach(cb => {
      cb.addEventListener("change", () => {
        const filters = getActiveFilters();
        const allLogs = this.store.logs.get(agentId) ?? [];
        logEl.innerHTML = allLogs.filter(e => filters.has(e.kind)).map(e => this.formatLogEntry(e)).join("");
        this.scrollToTerminalBottom();
      });
    });

    // Wire clear button
    document.getElementById("av-term-clear")?.addEventListener("click", () => {
      logEl.innerHTML = "";
    });
  }

  /** Format a log entry as HTML for the terminal. */
  private formatLogEntry(entry: LogEntry): string {
    const colors: Record<string, string> = {
      status: "#888",
      text: "#e0e0e0",
      tool: "#4a8cd4",
      result: "#44cc66",
      error: "#cc4444",
      boss: "#cc8844",
    };
    const color = colors[entry.kind] ?? "#c0c0d0";
    const time = new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const prefix: Record<string, string> = {
      status: "STATUS",
      text: "TEXT",
      tool: "TOOL",
      result: "RESULT",
      error: "ERROR",
      boss: "BOSS",
    };
    const tag = prefix[entry.kind] ?? entry.kind.toUpperCase();
    return `<div style="padding:1px 0;"><span style="color:#444;">[${time}]</span> <span style="color:${color};font-weight:bold;">${tag}</span> <span style="color:${color};">${this.escapeHtml(entry.text)}</span></div>`;
  }

  /** Scroll terminal to bottom if auto-scroll is enabled. */
  private scrollToTerminalBottom(): void {
    const autoScroll = document.getElementById("av-term-autoscroll") as HTMLInputElement | null;
    if (autoScroll && !autoScroll.checked) return;
    const logEl = document.getElementById("av-terminal-log");
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
  }

  /** Escape HTML special characters. */
  private escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /** Format file size for display. */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  /** Render the Tasks tab — current task, queue, history, and inject controls. */
  private renderTasksTab(agentId: string, content: HTMLElement): void {
    content.innerHTML = `
      <div style="width:100%;height:100%;display:flex;flex-direction:column;font-family:'Segoe UI',Tahoma,sans-serif;color:#1a3a5a;font-size:0.8rem;">
        <!-- Task injection bar -->
        <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:linear-gradient(to bottom,rgba(255,255,255,0.6),rgba(220,240,255,0.4));backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid rgba(255,255,255,0.4);">
          <input id="av-task-input" type="text" placeholder="Inject a task..." style="flex:1;padding:6px 12px;border:1px solid rgba(255,255,255,0.5);border-radius:8px;background:rgba(255,255,255,0.7);color:#1a3a5a;font-size:0.8rem;font-family:'Segoe UI',Tahoma,sans-serif;box-shadow:inset 0 1px 2px rgba(0,60,140,0.1);" />
          <button id="av-task-send" style="padding:5px 16px;border:1px solid rgba(255,255,255,0.4);border-radius:16px;background:linear-gradient(to bottom,rgba(120,180,240,0.7),rgba(80,150,220,0.5));color:#fff;font-size:0.8rem;cursor:pointer;text-shadow:0 1px 2px rgba(0,60,140,0.3);box-shadow:inset 0 1px 0 rgba(255,255,255,0.5);">Assign</button>
          <button id="av-task-stop" style="padding:5px 16px;border:1px solid rgba(255,180,180,0.5);border-radius:16px;background:linear-gradient(to bottom,rgba(255,150,150,0.7),rgba(230,100,100,0.5));color:#fff;font-size:0.8rem;cursor:pointer;text-shadow:0 1px 2px rgba(140,30,30,0.3);box-shadow:inset 0 1px 0 rgba(255,255,255,0.4);">Stop</button>
        </div>
        <!-- Task info display -->
        <div id="av-task-info" style="flex:1;overflow-y:auto;padding:14px;background:linear-gradient(to bottom,rgba(255,255,255,0.9),rgba(245,250,255,0.8));"></div>
      </div>
    `;

    const infoEl = document.getElementById("av-task-info")!;

    // Request task info from server
    // We'll use the agent_inject_task handler's response, but also need a way to just get info.
    // For now, render from the local store's AgentInfo (which has current task) and listen for agent_task_info.
    const agent = this.store.agents.get(agentId);
    if (agent) {
      this.renderTaskInfoContent(infoEl, agent.task, [], []);
    }

    // Listen for task info responses
    const onTaskInfo = (respAgentId: string, currentTask: string | null, queue: { task: string; handoffTo: string | null }[], history: { task: string; success: boolean; ts: number; durationMs: number }[]) => {
      if (respAgentId !== agentId) return;
      this.renderTaskInfoContent(infoEl, currentTask, queue, history);
    };
    this.store.onAgentTaskInfo(onTaskInfo);
    this.agentViewCleanup.push(() => this.store.offAgentTaskInfo(onTaskInfo));

    // Wire task input
    const taskInput = document.getElementById("av-task-input") as HTMLInputElement;
    const sendTask = () => {
      const task = taskInput.value.trim();
      if (!task) return;
      if (this.net) this.net.send({ type: "agent_inject_task", agentId, task });
      taskInput.value = "";
    };
    document.getElementById("av-task-send")?.addEventListener("click", sendTask);
    taskInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendTask();
    });

    // Wire stop button
    document.getElementById("av-task-stop")?.addEventListener("click", () => {
      if (this.net) this.net.send({ type: "stop", agentId });
    });
  }

  /** Render the task info content (current task, queue, history). */
  private renderTaskInfoContent(el: HTMLElement, currentTask: string | null, queue: { task: string; handoffTo: string | null }[], history: { task: string; success: boolean; ts: number; durationMs: number }[]): void {
    const queueHtml = queue.length > 0
      ? queue.map((q, i) => `<div style="padding:8px 14px;background:rgba(220,240,255,0.5);border-left:3px solid #1a6bb0;margin-bottom:6px;border-radius:0 8px 8px 0;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);"><span style="color:#7aaac0;font-size:0.65rem;">#${i + 1}</span> <span style="color:#1a3a5a;text-shadow:0 1px 0 rgba(255,255,255,0.5);">${this.escapeHtml(q.task)}</span>${q.handoffTo ? ` <span style="color:#4a7a9a;font-size:0.65rem;">→ ${q.handoffTo}</span>` : ""}</div>`).join("")
      : `<div style="color:#7aaac0;font-size:0.7rem;padding:8px 0;">No queued tasks</div>`;

    const historyHtml = history.length > 0
      ? history.slice(0, 10).map(h => {
          const status = h.success ? "✓" : "✗";
          const color = h.success ? "#3aaa3a" : "#e04848";
          const duration = h.durationMs < 1000 ? `${h.durationMs}ms` : `${(h.durationMs / 1000).toFixed(1)}s`;
          const time = new Date(h.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          return `<div style="padding:5px 14px;border-bottom:1px solid rgba(220,235,250,0.5);"><span style="color:${color};text-shadow:0 0 4px ${color}55;">${status}</span> <span style="color:#7aaac0;font-size:0.65rem;">[${time}]</span> <span style="color:#1a3a5a;text-shadow:0 1px 0 rgba(255,255,255,0.5);">${this.escapeHtml(h.task.slice(0, 80))}${h.task.length > 80 ? "…" : ""}</span> <span style="color:#a0c0d8;font-size:0.65rem;">${duration}</span></div>`;
        }).join("")
      : `<div style="color:#7aaac0;font-size:0.7rem;padding:8px 0;">No task history yet</div>`;

    el.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="color:#4a7a9a;font-size:0.65rem;text-transform:uppercase;margin-bottom:6px;text-shadow:0 1px 0 rgba(255,255,255,0.5);">Current Task</div>
        <div style="background:rgba(220,240,255,0.5);padding:14px;border-radius:8px;color:#1a3a5a;font-size:0.8rem;line-height:1.4;border:1px solid rgba(255,255,255,0.4);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);">
          ${currentTask ? this.escapeHtml(currentTask) : '<span style="color:#7aaac0;">No active task — agent is idle</span>'}
        </div>
      </div>
      <div style="margin-bottom:16px;">
        <div style="color:#4a7a9a;font-size:0.65rem;text-transform:uppercase;margin-bottom:6px;text-shadow:0 1px 0 rgba(255,255,255,0.5);">Task Queue (${queue.length})</div>
        ${queueHtml}
      </div>
      <div>
        <div style="color:#4a7a9a;font-size:0.65rem;text-transform:uppercase;margin-bottom:6px;text-shadow:0 1px 0 rgba(255,255,255,0.5);">Recent History</div>
        ${historyHtml}
      </div>
    `;
  }

  /** Render the Chat tab — boss-to-agent chat using existing chat message + log entries. */
  private renderChatTab(agentId: string, content: HTMLElement): void {
    content.innerHTML = `
      <div style="width:100%;height:100%;display:flex;flex-direction:column;font-family:'Segoe UI',Tahoma,sans-serif;color:#1a3a5a;font-size:0.8rem;">
        <div id="av-chat-log" style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:linear-gradient(to bottom,rgba(255,255,255,0.9),rgba(245,250,255,0.8));"></div>
        <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:linear-gradient(to bottom,rgba(255,255,255,0.6),rgba(220,240,255,0.4));backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-top:1px solid rgba(255,255,255,0.4);">
          <input id="av-chat-input" type="text" placeholder="Say something to the agent..." style="flex:1;padding:8px 14px;border:1px solid rgba(255,255,255,0.5);border-radius:20px;background:rgba(255,255,255,0.7);color:#1a3a5a;font-size:0.8rem;font-family:'Segoe UI',Tahoma,sans-serif;box-shadow:inset 0 1px 2px rgba(0,60,140,0.1);" />
          <button id="av-chat-send" style="padding:8px 18px;border:1px solid rgba(255,255,255,0.4);border-radius:18px;background:linear-gradient(to bottom,rgba(120,180,240,0.7),rgba(80,150,220,0.5));color:#fff;font-size:0.8rem;cursor:pointer;text-shadow:0 1px 2px rgba(0,60,140,0.3);box-shadow:inset 0 1px 0 rgba(255,255,255,0.5);">Send</button>
        </div>
      </div>
    `;

    const chatLogEl = document.getElementById("av-chat-log")!;
    const agent = this.store.agents.get(agentId);

    // Render existing chat history from store logs (boss + text entries)
    const renderChatHistory = () => {
      const logs = this.store.logs.get(agentId) ?? [];
      const chatEntries = logs.filter(e => e.kind === "boss" || e.kind === "text");
      chatLogEl.innerHTML = chatEntries.map(e => {
        const isBoss = e.kind === "boss";
        const time = new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const name = isBoss ? (this.store.player?.name ?? "Boss") : (agent?.name ?? "Agent");
        const align = isBoss ? "flex-end" : "flex-start";
        const bg = isBoss ? "rgba(180,220,250,0.6)" : "rgba(200,240,200,0.5)";
        const color = isBoss ? "#1a6bb0" : "#2a8a3a";
        return `<div style="align-self:${align};max-width:75%;display:flex;flex-direction:column;gap:2px;">
          <span style="color:#7aaac0;font-size:0.6rem;padding:0 10px;">${name} · ${time}</span>
          <div style="background:${bg};padding:10px 14px;border-radius:14px;color:${color};font-size:0.8rem;line-height:1.4;border:1px solid rgba(255,255,255,0.4);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);box-shadow:inset 0 1px 0 rgba(255,255,255,0.5);text-shadow:0 1px 0 rgba(255,255,255,0.3);">${this.escapeHtml(e.text)}</div>
        </div>`;
      }).join("");
      chatLogEl.scrollTop = chatLogEl.scrollHeight;
    };
    renderChatHistory();

    // Listen for new log entries to update chat
    const onLog = (respAgentId: string, entry: LogEntry) => {
      if (respAgentId !== agentId) return;
      if (entry.kind !== "boss" && entry.kind !== "text") return;
      const isBoss = entry.kind === "boss";
      const time = new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const name = isBoss ? (this.store.player?.name ?? "Boss") : (agent?.name ?? "Agent");
      const align = isBoss ? "flex-end" : "flex-start";
      const bg = isBoss ? "rgba(180,220,250,0.6)" : "rgba(200,240,200,0.5)";
      const color = isBoss ? "#1a6bb0" : "#2a8a3a";
      chatLogEl.insertAdjacentHTML("beforeend", `<div style="align-self:${align};max-width:75%;display:flex;flex-direction:column;gap:2px;">
        <span style="color:#7aaac0;font-size:0.6rem;padding:0 10px;">${name} · ${time}</span>
        <div style="background:${bg};padding:10px 14px;border-radius:14px;color:${color};font-size:0.8rem;line-height:1.4;border:1px solid rgba(255,255,255,0.4);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);box-shadow:inset 0 1px 0 rgba(255,255,255,0.5);text-shadow:0 1px 0 rgba(255,255,255,0.3);">${this.escapeHtml(entry.text)}</div>
      </div>`);
      chatLogEl.scrollTop = chatLogEl.scrollHeight;
    };
    this.store.onAgentLog(onLog);
    this.agentViewCleanup.push(() => this.store.offAgentLog(onLog));

    // Wire send
    const chatInput = document.getElementById("av-chat-input") as HTMLInputElement;
    const sendChat = () => {
      const text = chatInput.value.trim();
      if (!text) return;
      if (this.net) this.net.send({ type: "chat", agentId, text });
      chatInput.value = "";
    };
    document.getElementById("av-chat-send")?.addEventListener("click", sendChat);
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChat();
    });
  }

  /** Render the Memory tab — view agent's conversation history with the LLM. */
  private renderMemoryTab(agentId: string, content: HTMLElement): void {
    content.innerHTML = `
      <div style="width:100%;height:100%;display:flex;flex-direction:column;font-family:'Segoe UI',Tahoma,sans-serif;color:#1a3a5a;font-size:0.78rem;">
        <div style="display:flex;align-items:center;gap:8px;padding:6px 14px;background:linear-gradient(to bottom,rgba(255,255,255,0.6),rgba(220,240,255,0.4));backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid rgba(255,255,255,0.4);">
          <span style="color:#4a7a9a;font-size:0.7rem;">Conversation Memory</span>
          <span id="av-mem-count" style="color:#7aaac0;font-size:0.65rem;"></span>
          <button id="av-mem-refresh" style="margin-left:auto;padding:3px 12px;border:1px solid rgba(255,255,255,0.5);border-radius:14px;background:linear-gradient(to bottom,rgba(255,255,255,0.8),rgba(220,240,255,0.5));color:#4a7a9a;font-size:0.7rem;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);">Refresh</button>
        </div>
        <div id="av-mem-list" style="flex:1;overflow-y:auto;padding:10px 14px;display:flex;flex-direction:column;gap:8px;background:linear-gradient(to bottom,rgba(255,255,255,0.9),rgba(245,250,255,0.8));">
          <div style="color:#7aaac0;font-size:0.7rem;padding:20px;text-align:center;">Loading conversation history...</div>
        </div>
      </div>
    `;

    const listEl = document.getElementById("av-mem-list")!;
    const countEl = document.getElementById("av-mem-count")!;

    // Request memory from server
    if (this.net) this.net.send({ type: "agent_memory_request", agentId });

    // Listen for memory response
    const onMemory = (respAgentId: string, messages: { role: string; content: string }[]) => {
      if (respAgentId !== agentId) return;
      countEl.textContent = `${messages.length} messages`;

      if (messages.length === 0) {
        listEl.innerHTML = `<div style="color:#7aaac0;font-size:0.7rem;padding:20px;text-align:center;">No conversation history. The agent hasn't been given any tasks yet.</div>`;
        return;
      }

      const roleColors: Record<string, string> = {
        system: "#7aaac0",
        user: "#1a6bb0",
        assistant: "#2a8a3a",
        tool: "#cc8844",
        unknown: "#a0c0d8",
      };
      const roleLabels: Record<string, string> = {
        system: "SYSTEM",
        user: "USER",
        assistant: "ASSISTANT",
        tool: "TOOL",
        unknown: "???",
      };

      listEl.innerHTML = messages.map(m => {
        const color = roleColors[m.role] ?? "#888";
        const label = roleLabels[m.role] ?? m.role.toUpperCase();
        const isLong = m.content.length > 500;
        const displayContent = isLong ? m.content.slice(0, 500) + "..." : m.content;
        return `<div style="background:rgba(220,240,255,0.4);border-left:3px solid ${color};padding:10px 14px;border-radius:0 8px 8px 0;border:1px solid rgba(255,255,255,0.3);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);">
          <div style="color:${color};font-size:0.6rem;font-weight:bold;margin-bottom:4px;text-shadow:0 1px 0 rgba(255,255,255,0.5);">${label}</div>
          <div style="color:#1a3a5a;font-size:0.75rem;line-height:1.4;white-space:pre-wrap;word-break:break-word;text-shadow:0 1px 0 rgba(255,255,255,0.3);">${this.escapeHtml(displayContent)}</div>
        </div>`;
      }).join("");
    };
    this.store.onAgentMemory(onMemory);
    this.agentViewCleanup.push(() => this.store.offAgentMemory(onMemory));

    // Wire refresh button
    document.getElementById("av-mem-refresh")?.addEventListener("click", () => {
      if (this.net) this.net.send({ type: "agent_memory_request", agentId });
    });
  }

  /** Render the Stats tab — agent info dashboard with editable system prompt. */
  private renderStatsTab(agentId: string, content: HTMLElement): void {
    const agent = this.store.agents.get(agentId);
    if (!agent) return;
    content.innerHTML = this.renderAgentDashboard(agent);

    // Wire up system prompt editing
    const isBuiltIn = agent.id === AGENT_RESOURCES_ID || agent.id === HERMES_ID;
    const editBtn = document.getElementById("av-stats-prompt-edit");
    const saveBtn = document.getElementById("av-stats-prompt-save");
    const cancelBtn = document.getElementById("av-stats-prompt-cancel");
    const display = document.getElementById("av-stats-prompt-display");
    const editor = document.getElementById("av-stats-prompt-editor") as HTMLTextAreaElement | null;

    if (isBuiltIn) {
      editBtn?.setAttribute("style", "display:none;");
    }

    editBtn?.addEventListener("click", () => {
      if (display) display.style.display = "none";
      if (editor) {
        editor.style.display = "block";
        editor.value = agent.systemPrompt || "";
        editor.focus();
      }
      editBtn.style.display = "none";
      if (saveBtn) saveBtn.style.display = "inline-block";
      if (cancelBtn) cancelBtn.style.display = "inline-block";
    });

    saveBtn?.addEventListener("click", () => {
      if (editor && this.net) {
        this.net.send({ type: "update_agent", agentId, systemPrompt: editor.value });
      }
      if (display) {
        const newText = editor?.value || "";
        display.textContent = newText || "No custom system prompt set.";
        display.style.color = newText ? "#4a7a9a" : "#a0c0d8";
        display.style.display = "block";
      }
      if (editor) editor.style.display = "none";
      editBtn!.style.display = "inline-block";
      if (saveBtn) saveBtn.style.display = "none";
      if (cancelBtn) cancelBtn.style.display = "none";
    });

    cancelBtn?.addEventListener("click", () => {
      if (display) display.style.display = "block";
      if (editor) editor.style.display = "none";
      editBtn!.style.display = "inline-block";
      if (saveBtn) saveBtn.style.display = "none";
      if (cancelBtn) cancelBtn.style.display = "none";
    });
  }

  /** Render the Screen tab — live browser screenshot with dashboard fallback. */
  private renderAgentScreenTab(agent: AgentInfo): string {
    const serverOrigin = window.location.origin;
    const authToken = getToken();
    const tokenParam = authToken ? `&token=${encodeURIComponent(authToken)}` : "";
    return `
      <div style="width:100%;height:100%;display:flex;flex-direction:column;font-family:'Segoe UI',Tahoma,sans-serif;color:#1a3a5a;font-size:0.8rem;">
        <div style="flex:1;position:relative;background:linear-gradient(to bottom,#b8e0f8,#7ec8ee,#5fb8e8);overflow:hidden;">
          <img id="agent-view-screen-img" src="${serverOrigin}/api/agent-screenshot/${agent.id}?t=${Date.now()}${tokenParam}"
            style="display:none;width:100%;height:100%;object-fit:contain;image-rendering:auto;"
            onerror="this.style.display='none';document.getElementById('agent-view-screen-placeholder').style.display='flex';"
            onload="this.style.display='block';document.getElementById('agent-view-screen-placeholder').style.display='none';"
          />
          <div id="agent-view-screen-placeholder" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#1a6bb0;gap:10px;text-shadow:0 1px 2px rgba(255,255,255,0.6);">
            <div style="font-size:2.5rem;filter:drop-shadow(0 2px 4px rgba(0,80,160,0.2));">🖥️</div>
            <div style="font-size:0.85rem;color:#1a6bb0;">Waiting for ${agent.name} to open a browser…</div>
            <div style="font-size:0.7rem;color:#3a8cb8;">The agent can use the <code style="color:#1a6bb0;background:rgba(255,255,255,0.5);padding:2px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.6);">browse_url</code> tool to navigate to websites.</div>
          </div>
        </div>
        <div style="padding:6px 14px;background:linear-gradient(to bottom,rgba(255,255,255,0.6),rgba(220,240,255,0.4));backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-top:1px solid rgba(255,255,255,0.4);display:flex;align-items:center;gap:8px;">
          <span style="color:#4a7a9a;font-size:0.7rem;">URL:</span>
          <span id="agent-view-url" style="color:#1a6bb0;font-size:0.7rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">—</span>
        </div>
      </div>
    `;
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
    if (agent.id === AGENT_RESOURCES_ID) {
      spriteImg = "assets/characters/char-agent-resources.png";
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
        const letter = name.charAt(0).toUpperCase();
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><rect width="14" height="14" rx="2" fill="#1a2a3a"/><text x="7" y="10" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="bold" fill="#6aaadf">${letter}</text></svg>`;
        const fallback = `data:image/svg+xml,${encodeURIComponent(svg)}`;
        iconHtml = `<img src="${icon}" style="width:14px;height:14px;object-fit:contain;" onerror="this.onerror=null;this.src='${fallback}'" />`;
      } else {
        iconHtml = `<span style="font-size:0.6rem;">🔌</span>`;
      }
      return `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(180,220,250,0.4);padding:3px 10px;border-radius:12px;color:#1a6bb0;font-size:0.7rem;border:1px solid rgba(255,255,255,0.4);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);">${iconHtml}${name}</span>`;
    }).join("");

    return `
      <div style="width:100%;height:100%;display:flex;flex-direction:column;font-family:'Segoe UI',Tahoma,sans-serif;color:#1a3a5a;font-size:0.8rem;">
        <!-- Header bar -->
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:linear-gradient(to bottom,rgba(120,180,240,0.5),rgba(80,150,220,0.3));backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid rgba(255,255,255,0.4);">
          <div style="position:relative;width:48px;height:48px;flex-shrink:0;filter:drop-shadow(0 2px 4px rgba(0,80,160,0.2));">
            <img src="${spriteImg}" style="width:48px;height:48px;object-fit:contain;image-rendering:pixelated;" />
            <div style="position:absolute;bottom:-2px;right:-2px;font-size:1rem;">${mood}</div>
          </div>
          <div>
            <div style="color:${agent.accent};font-size:1.1rem;font-weight:bold;text-shadow:0 1px 2px rgba(255,255,255,0.5);">${agent.name}</div>
          </div>
          <div style="margin-left:auto;display:flex;align-items:center;gap:6px;">
            <div style="width:8px;height:8px;border-radius:50%;background:${sc};box-shadow:0 0 8px ${sc};"></div>
            <span style="color:${sc};font-size:0.75rem;text-transform:uppercase;text-shadow:0 1px 2px rgba(255,255,255,0.3);">${agent.status}</span>
          </div>
        </div>

        <!-- Body -->
        <div style="flex:1;display:flex;gap:1px;background:rgba(180,210,240,0.3);">
          <!-- Left panel: stats -->
          <div style="flex:1;padding:16px;background:linear-gradient(to bottom,rgba(255,255,255,0.85),rgba(245,250,255,0.75));">
            <div style="color:#4a7a9a;font-size:0.65rem;text-transform:uppercase;margin-bottom:8px;text-shadow:0 1px 0 rgba(255,255,255,0.5);">Performance</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div style="background:rgba(220,240,255,0.5);padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.4);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);box-shadow:inset 0 1px 0 rgba(255,255,255,0.5);">
                <div style="color:#7aaac0;font-size:0.65rem;">Tasks Done</div>
                <div style="color:#3aaa3a;font-size:1.4rem;font-weight:bold;text-shadow:0 1px 0 rgba(255,255,255,0.5);">${agent.tasksDone}</div>
              </div>
              <div style="background:rgba(220,240,255,0.5);padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.4);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);box-shadow:inset 0 1px 0 rgba(255,255,255,0.5);">
                <div style="color:#7aaac0;font-size:0.65rem;">Role</div>
                <div style="color:#8855cc;font-size:1rem;font-weight:bold;text-transform:capitalize;text-shadow:0 1px 0 rgba(255,255,255,0.5);">${agent.role}</div>
              </div>
              <div style="background:rgba(220,240,255,0.5);padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.4);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);box-shadow:inset 0 1px 0 rgba(255,255,255,0.5);">
                <div style="color:#7aaac0;font-size:0.65rem;">Desk</div>
                <div style="color:#1a3a5a;font-size:1rem;">#${agent.deskIndex}</div>
              </div>
              <div style="background:rgba(220,240,255,0.5);padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.4);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);box-shadow:inset 0 1px 0 rgba(255,255,255,0.5);">
                <div style="color:#7aaac0;font-size:0.65rem;">Mood</div>
                <div style="color:#1a3a5a;font-size:1rem;text-transform:capitalize;">${agent.mood ?? "neutral"}</div>
              </div>
            </div>

            <div style="color:#4a7a9a;font-size:0.65rem;text-transform:uppercase;margin:16px 0 8px;text-shadow:0 1px 0 rgba(255,255,255,0.5);">MCP Servers (${mcpCount})</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">
              ${mcpCount > 0
                ? mcpBadges
                : `<span style="color:#7aaac0;font-size:0.7rem;">No MCP servers configured</span>`}
            </div>

            ${agent.personality ? `
            <div style="color:#4a7a9a;font-size:0.65rem;text-transform:uppercase;margin:16px 0 8px;text-shadow:0 1px 0 rgba(255,255,255,0.5);">Personality</div>
            <div style="display:flex;flex-direction:column;gap:5px;">
              ${[
                ["Openness", agent.personality.openness],
                ["Conscientiousness", agent.personality.conscientiousness],
                ["Extraversion", agent.personality.extraversion],
                ["Agreeableness", agent.personality.agreeableness],
                ["Neuroticism", agent.personality.neuroticism],
              ].map(([label, val]) => `
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="color:#7aaac0;font-size:0.65rem;width:110px;">${label}</span>
                  <div style="flex:1;height:8px;background:rgba(220,235,250,0.5);border-radius:4px;overflow:hidden;border:1px solid rgba(255,255,255,0.3);box-shadow:inset 0 1px 2px rgba(0,60,140,0.1);">
                    <div style="width:${Math.round((val as number) * 100)}%;height:100%;background:linear-gradient(to right,${agent.accent},rgba(120,180,240,0.8));border-radius:4px;box-shadow:0 0 4px ${agent.accent}55;"></div>
                  </div>
                </div>
              `).join("")}
            </div>` : ""}
          </div>

          <!-- Right panel: current task + system prompt -->
          <div style="flex:1;padding:16px;background:linear-gradient(to bottom,rgba(255,255,255,0.85),rgba(245,250,255,0.75));display:flex;flex-direction:column;">
            <div style="color:#4a7a9a;font-size:0.65rem;text-transform:uppercase;margin-bottom:8px;text-shadow:0 1px 0 rgba(255,255,255,0.5);">Current Task</div>
            <div style="background:rgba(220,240,255,0.5);padding:14px;border-radius:8px;flex:1;overflow-y:auto;color:#1a3a5a;font-size:0.8rem;line-height:1.4;border:1px solid rgba(255,255,255,0.4);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);box-shadow:inset 0 1px 0 rgba(255,255,255,0.5);text-shadow:0 1px 0 rgba(255,255,255,0.3);">
              ${agent.task ? agent.task : `<span style="color:#7aaac0;">No active task — agent is idle and ready for work.</span>`}
            </div>

            <div style="color:#4a7a9a;font-size:0.65rem;text-transform:uppercase;margin:12px 0 8px;text-shadow:0 1px 0 rgba(255,255,255,0.5);display:flex;align-items:center;justify-content:space-between;">
              <span>System Prompt</span>
              <div style="display:flex;gap:4px;">
                <button id="av-stats-prompt-edit" style="padding:2px 10px;border:1px solid rgba(255,255,255,0.5);border-radius:12px;background:linear-gradient(to bottom,rgba(255,255,255,0.8),rgba(220,240,255,0.5));color:#1a6bb0;font-size:0.65rem;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);">Edit</button>
                <button id="av-stats-prompt-save" style="display:none;padding:2px 10px;border:1px solid rgba(255,255,255,0.4);border-radius:12px;background:linear-gradient(to bottom,rgba(120,220,120,0.7),rgba(60,180,80,0.5));color:#fff;font-size:0.65rem;cursor:pointer;text-shadow:0 1px 2px rgba(20,100,30,0.3);box-shadow:inset 0 1px 0 rgba(255,255,255,0.4);">Save</button>
                <button id="av-stats-prompt-cancel" style="display:none;padding:2px 10px;border:1px solid rgba(255,255,255,0.5);border-radius:12px;background:linear-gradient(to bottom,rgba(255,255,255,0.8),rgba(220,240,255,0.5));color:#4a7a9a;font-size:0.65rem;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);">Cancel</button>
              </div>
            </div>
            <div id="av-stats-prompt-display" style="background:rgba(220,240,255,0.5);padding:14px;border-radius:8px;max-height:120px;overflow-y:auto;color:#4a7a9a;font-size:0.7rem;line-height:1.4;border:1px solid rgba(255,255,255,0.4);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);box-shadow:inset 0 1px 0 rgba(255,255,255,0.5);">
              ${agent.systemPrompt ? agent.systemPrompt.slice(0, 500) + (agent.systemPrompt.length > 500 ? "…" : "") : `<span style="color:#a0c0d8;">No custom system prompt set.</span>`}
            </div>
            <textarea id="av-stats-prompt-editor" style="display:none;max-height:120px;min-height:80px;padding:14px;background:rgba(255,255,255,0.9);color:#1a3a5a;font-size:0.7rem;line-height:1.4;border:1px solid rgba(255,255,255,0.4);border-radius:8px;font-family:'Segoe UI',Tahoma,sans-serif;resize:vertical;outline:none;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);" spellcheck="false" placeholder="Standing instructions for this agent, e.g. 'You are a senior TypeScript reviewer. Always write tests first.'"></textarea>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding:8px 16px;background:linear-gradient(to bottom,rgba(255,255,255,0.6),rgba(220,240,255,0.4));backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-top:1px solid rgba(255,255,255,0.4);display:flex;justify-content:space-between;align-items:center;">
          <span style="color:#7aaac0;font-size:0.65rem;">Agent ID: ${agent.id.slice(0, 8)}…</span>
          <span style="color:#7aaac0;font-size:0.65rem;">Live browser feed will appear here when available</span>
        </div>
      </div>
    `;
  }

  /** Close the agent view modal and stop the screenshot stream. */
  private closeAgentViewModal(): void {
    if (this.agentViewAgentId && this.net) {
      this.net.send({ type: "agent_view_stop", agentId: this.agentViewAgentId });
      this.net.send({ type: "agent_log_unsubscribe", agentId: this.agentViewAgentId });
    }
    // Clean up tab listeners
    for (const cleanup of this.agentViewCleanup) cleanup();
    this.agentViewCleanup = [];
    this.agentViewAgentId = null;
    this.agentFsCurrentFile = null;
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
    const px = this.projectorTile.x * TILE_PX + 32;
    const py = this.projectorTile.y * TILE_PX - 100;
    const sw = 480;
    const sh = 288;

    const hasWebcam = !!this.webcamVideoEl && this.webcamVideoEl.style.display !== "none";
    const hasScreenShare = !!this.screenShareVideoEl && this.screenShareVideoEl.style.display !== "none";

    if (hasWebcam && hasScreenShare) {
      // Split-screen: left half = screen share, right half = webcam
      const halfW = sw / 2;
      const ssRect = this.worldRectToScreen(px - sw / 2, py - sh / 2, halfW, sh);
      const wcRect = this.worldRectToScreen(px, py - sh / 2, halfW, sh);

      this.screenShareVideoEl!.style.left = `${ssRect.x}px`;
      this.screenShareVideoEl!.style.top = `${ssRect.y}px`;
      this.screenShareVideoEl!.style.width = `${ssRect.w}px`;
      this.screenShareVideoEl!.style.height = `${ssRect.h}px`;

      this.webcamVideoEl!.style.left = `${wcRect.x}px`;
      this.webcamVideoEl!.style.top = `${wcRect.y}px`;
      this.webcamVideoEl!.style.width = `${wcRect.w}px`;
      this.webcamVideoEl!.style.height = `${wcRect.h}px`;
    } else if (hasWebcam) {
      // Webcam only — full projector
      const rect = this.worldRectToScreen(px - sw / 2, py - sh / 2, sw, sh);
      this.webcamVideoEl!.style.left = `${rect.x}px`;
      this.webcamVideoEl!.style.top = `${rect.y}px`;
      this.webcamVideoEl!.style.width = `${rect.w}px`;
      this.webcamVideoEl!.style.height = `${rect.h}px`;
    } else if (hasScreenShare) {
      // Screen share only — full projector
      const rect = this.worldRectToScreen(px - sw / 2, py - sh / 2, sw, sh);
      this.screenShareVideoEl!.style.left = `${rect.x}px`;
      this.screenShareVideoEl!.style.top = `${rect.y}px`;
      this.screenShareVideoEl!.style.width = `${rect.w}px`;
      this.screenShareVideoEl!.style.height = `${rect.h}px`;
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
      if (agent.deskIndex >= 0 && agent.status !== "idle" && agent.status !== "done" && agent.status !== "error" && agent.status !== "waiting") {
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
