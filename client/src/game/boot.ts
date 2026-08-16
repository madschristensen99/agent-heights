import Phaser from "phaser";
import { CHAR_VARIANTS, type WorldTheme } from "../../../shared/types";
import { CHAR_FRAME_W, CHAR_FRAME_H, CHAR_FRAMES_PER_ROW } from "./chargen";
import { getTextureGenerationSteps } from "./textures";
import type { Dir } from "./agent";
import { onAuthChange, isAuthEnabled, type AuthState } from "../auth";
import { Store } from "../store";
import {
  AI_CHAR_TEXTURES,
  AI_HAIR_STYLES, AI_HAIR_DIRS, AI_HAIR_POSES, hairFrameKey,
  AI_BEARD_STYLES, beardFrameKey,
  AI_SHIRT_STYLES, shirtFrameKey,
  AI_PANTS_STYLES, pantsFrameKey,
  AI_ACCESSORY_STYLES, accessoryFrameKey,
  AI_HEAD_FEATURE_STYLES, headFeatureFrameKey,
  AI_TILE_TEXTURES, AI_OBJECT_TEXTURES,
} from "./ai-tiles";
import { SS_FACTOR } from "./world";
import * as loadingOverlay from "./loading-overlay";
import { setCharTextureProvider, setCharComponentProvider } from "./chargen";
import type { CharTextureProvider, CharComponentProvider } from "../../../shared/char-draw";

/**
 * Boot scene — shows a loading bar while assets load, then generates all
 * procedural textures and animations before starting the main OfficeScene.
 * Texture generation is spread across frames so the progress bar moves
 * visibly as each category is generated.
 */
export class BootScene extends Phaser.Scene {

  constructor() {
    super("boot");
  }

  preload(): void {
    const v = "?v=8x";
    this.load.tilemapTiledJSON("map-classic", `assets/maps/office.json${v}`);
    this.load.tilemapTiledJSON("map-agentHeights", `assets/maps/agentHeights.json${v}`);
    this.load.image("tiles-classic", `assets/tilesets/office.png${v}`);
    this.load.image("tiles-agentHeights", `assets/tilesets/agentHeights.png${v}`);
    for (let i = 0; i < CHAR_VARIANTS; i++) {
      this.load.spritesheet(`char-${i}`, `assets/characters/char-${i}.png${v}`, {
        frameWidth: CHAR_FRAME_W,
        frameHeight: CHAR_FRAME_H,
      });
    }
    this.load.spritesheet("char-office-manager", `assets/characters/char-office-manager.png${v}`, {
      frameWidth: CHAR_FRAME_W,
      frameHeight: CHAR_FRAME_H,
    });
    this.load.spritesheet("char-hermes", `assets/characters/char-hermes.png${v}`, {
      frameWidth: CHAR_FRAME_W,
      frameHeight: CHAR_FRAME_H,
    });
    this.load.spritesheet("bubble", "assets/sprites/bubble.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("world-tiles", "assets/tilesets/world.png", {
      frameWidth: 64,
      frameHeight: 64,
    });

    // ── World Theme ──────────────────────────────────────────────────
    // Load world-theme.json through Phaser's own loader (NOT fetch()).
    // Phaser does not await Promises returned by async preload(), so a
    // fetch()-based approach races against loader.start() — if the loader
    // finishes before the fetch resolves, AI atlases are never queued and
    // the game silently falls back to procedural textures.
    this.load.json("world-theme", "assets/world-theme.json?v=" + Date.now());

    // AI texture atlases — always loaded unconditionally. For procedural-tier
    // worlds, they are removed in create() after reading the theme. This
    // eliminates the race condition entirely.
    const atlasVer = "?v=276";
    this.load.image("ai-tiles-atlas", `assets/atlases/ai-tiles-atlas.webp${atlasVer}`);
    this.load.json("ai-tiles-atlas-meta", `assets/atlases/ai-tiles-atlas.json${atlasVer}`);
    this.load.image("ai-sprites-atlas", `assets/atlases/ai-sprites-atlas.webp${atlasVer}`);
    this.load.json("ai-sprites-atlas-meta", `assets/atlases/ai-sprites-atlas.json${atlasVer}`);
    this.load.image("ai-hair-atlas", `assets/atlases/ai-hair-atlas.webp${atlasVer}`);
    this.load.json("ai-hair-atlas-meta", `assets/atlases/ai-hair-atlas.json${atlasVer}`);
    this.load.image("ai-beard-atlas", `assets/atlases/ai-beard-atlas.webp${atlasVer}`);
    this.load.json("ai-beard-atlas-meta", `assets/atlases/ai-beard-atlas.json${atlasVer}`);
    this.load.image("ai-shirt-atlas", `assets/atlases/ai-shirt-atlas.webp${atlasVer}`);
    this.load.json("ai-shirt-atlas-meta", `assets/atlases/ai-shirt-atlas.json${atlasVer}`);
    this.load.image("ai-pants-atlas", `assets/atlases/ai-pants-atlas.webp${atlasVer}`);
    this.load.json("ai-pants-atlas-meta", `assets/atlases/ai-pants-atlas.json${atlasVer}`);
    this.load.image("ai-accessory-atlas", `assets/atlases/ai-accessory-atlas.webp${atlasVer}`);
    this.load.json("ai-accessory-atlas-meta", `assets/atlases/ai-accessory-atlas.json${atlasVer}`);
    this.load.image("ai-headFeature-atlas", `assets/atlases/ai-headFeature-atlas.webp${atlasVer}`);
    this.load.json("ai-headFeature-atlas-meta", `assets/atlases/ai-headFeature-atlas.json${atlasVer}`);

    // 3D creature spritesheets (8 directions × 4 animation frames, 128px cells)
    // Always loaded — removed for procedural-tier worlds in create().
    const creature3dVer = "?v=3d5";
    const creature3dKeys = [
      "creature-slime", "creature-wolf", "creature-skeleton", "creature-imp",
      "creature-wraith", "creature-fire-elemental",
      "beast-groveheart", "beast-stone-colossus", "beast-ash-wyrm",
      "beast-void-leviathan", "beast-infernal-sovereign",
      "friendly-unicorn", "friendly-fairy-bunny", "friendly-baby-dragon", "friendly-crystal-fox",
    ];
    for (const key of creature3dKeys) {
      const file = key.replace(/-/g, "_");
      this.load.spritesheet(key, `assets/ai/creatures3d/${file}.png${creature3dVer}`, {
        frameWidth: 128,
        frameHeight: 128,
      });
    }

    this.load.on("progress", (value: number) => {
      loadingOverlay.setProgress(0.4 * value, "Loading assets…");
    });

    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      if (file.key === "world-theme") {
        console.log("[boot] world-theme.json not found — running in HQ mode");
        return;
      }
      if (file.key.startsWith("creature-") || file.key.startsWith("beast-") || file.key.startsWith("friendly-")) {
        console.warn(`[3D Sprite] ${file.key} not found — using procedural fallback`);
        this.textures.remove(file.key);
        return;
      }
      console.warn("[Asset Load Error]", file.key, file.url);
    });

    // Theme-specific assets (tilemap, tileset, spritesheets) are queued
    // after world-theme.json parses, since their paths come from the theme.
    // Files added via this.load.* during an active load are picked up
    // automatically by Phaser's loader.
    let themeAssetsQueued = false;
    this.load.on("filecomplete", (key: string) => {
      if (key !== "world-theme" || themeAssetsQueued) return;
      themeAssetsQueued = true;
      const themeData = this.cache.json.get("world-theme") as WorldTheme | undefined;
      if (!themeData) return;
      console.log(`[boot] World theme found: ${themeData.name} (${themeData.id})`);

      this.load.tilemapTiledJSON("map-theme", themeData.office.tilemapPath);
      this.load.image("tiles-theme", themeData.office.tilesetPath);

      if (themeData.assets.worldTileSpritesheetPath) {
        this.load.spritesheet("world-tiles-theme", themeData.assets.worldTileSpritesheetPath, {
          frameWidth: 64,
          frameHeight: 64,
        });
      }
      if (themeData.assets.furnitureSpritesheetPath) {
        this.load.spritesheet("furniture-theme", themeData.assets.furnitureSpritesheetPath, {
          frameWidth: 64,
          frameHeight: 64,
        });
      }
      if (themeData.assets.characterSpritesheetPath) {
        this.load.spritesheet("chars-theme", themeData.assets.characterSpritesheetPath, {
          frameWidth: CHAR_FRAME_W,
          frameHeight: CHAR_FRAME_H,
        });
      }
      if (themeData.agentWorkAnim) {
        this.load.spritesheet("agent-work-anim", themeData.agentWorkAnim.spritesheetPath, {
          frameWidth: CHAR_FRAME_W,
          frameHeight: CHAR_FRAME_H,
        });
      }
    });
  }

  create(): void {

    // Read world theme from Phaser's JSON cache (loaded via this.load.json
    // in preload) and publish it to the registry for downstream scenes.
    const theme = this.cache.json.get("world-theme") as WorldTheme | undefined;
    if (theme) {
      this.registry.set("worldTheme", theme);
    }

    // For procedural-tier worlds, remove AI atlas textures and 3D creature
    // spritesheets that were loaded unconditionally in preload() to free
    // GPU memory. They are not needed for procedural rendering.
    const isAiTier = !theme || theme.assets?.assetTier === "ai";
    if (!isAiTier) {
      const aiTexKeys = [
        "ai-tiles-atlas", "ai-sprites-atlas",
        "ai-hair-atlas", "ai-beard-atlas", "ai-shirt-atlas",
        "ai-pants-atlas", "ai-accessory-atlas", "ai-headFeature-atlas",
        "creature-slime", "creature-wolf", "creature-skeleton", "creature-imp",
        "creature-wraith", "creature-fire-elemental",
        "beast-groveheart", "beast-stone-colossus", "beast-ash-wyrm",
        "beast-void-leviathan", "beast-infernal-sovereign",
        "friendly-unicorn", "friendly-fairy-bunny", "friendly-baby-dragon", "friendly-crystal-fox",
      ];
      for (const key of aiTexKeys) {
        if (this.textures.exists(key)) this.textures.remove(key);
      }
      const aiMetaKeys = [
        "ai-tiles-atlas-meta", "ai-sprites-atlas-meta",
        "ai-hair-atlas-meta", "ai-beard-atlas-meta", "ai-shirt-atlas-meta",
        "ai-pants-atlas-meta", "ai-accessory-atlas-meta", "ai-headFeature-atlas-meta",
      ];
      for (const key of aiMetaKeys) {
        if (this.cache.json.has(key)) this.cache.json.remove(key);
      }
      console.log("[boot] Procedural asset tier — removed AI textures");
    }

    // Only unpack AI atlases if they were loaded (AI tier or HQ mode).
    // Procedural-tier worlds skip this entirely.
    if (this.textures.exists("ai-tiles-atlas")) {
      // Unpack tile + sprite atlases into individual Phaser textures.
      // Hair atlas is NOT unpacked — we extract ImageData directly from it
      // to avoid creating 360 GPU textures that are never rendered by Phaser.
      this.unpackAtlas("ai-tiles-atlas", "ai-tiles-atlas-meta");
      this.unpackAtlas("ai-sprites-atlas", "ai-sprites-atlas-meta");

      // Free atlas source textures after unpacking — saves ~128MB of GPU memory.
      // The individual sub-textures are already extracted; the atlas source is no longer needed.
      this.textures.remove("ai-tiles-atlas");
      this.textures.remove("ai-sprites-atlas");
    }

    // Pre-scale AI tile textures to the target SS size so renderChunk doesn't
    // create intermediate canvases per tile. At SS=4 (desktop), source is 256px
    // and target is 256px — no pre-scaling needed. At SS=1 (mobile), source is
    // 256px and target is 64px — pre-scale once here instead of 1024 times per chunk.
    if (SS_FACTOR < 4) {
      const targetPx = 64 * SS_FACTOR; // TILE_PX * SS
      const allTileKeys = new Set<string>();
      for (const keys of Object.values(AI_TILE_TEXTURES)) for (const k of keys) allTileKeys.add(k);
      for (const k of Object.values(AI_OBJECT_TEXTURES)) allTileKeys.add(k);
      for (const texKey of allTileKeys) {
        if (!this.textures.exists(texKey)) continue;
        const tex = this.textures.get(texKey);
        const src = tex.getSourceImage() as HTMLImageElement;
        if (src.width <= targetPx) continue; // already small enough
        const scaledKey = `${texKey}-ss${SS_FACTOR}`;
        if (this.textures.exists(scaledKey)) continue;
        // Step-down scale through intermediate sizes for quality
        let curW = src.width;
        let curH = src.height;
        let curCanvas: HTMLCanvasElement | undefined;
        while (curW > targetPx * 2 || curH > targetPx * 2) {
          const nextW = Math.max(targetPx, Math.floor(curW / 2));
          const nextH = Math.max(targetPx, Math.floor(curH / 2));
          const next = document.createElement("canvas");
          next.width = nextW;
          next.height = nextH;
          const nctx = next.getContext("2d")!;
          nctx.imageSmoothingEnabled = true;
          nctx.imageSmoothingQuality = "high";
          if (curCanvas) {
            nctx.drawImage(curCanvas, 0, 0, curW, curH, 0, 0, nextW, nextH);
          } else {
            nctx.drawImage(src, 0, 0, curW, curH, 0, 0, nextW, nextH);
          }
          curCanvas = next;
          curW = nextW;
          curH = nextH;
        }
        // Final scale to targetPx
        const final = document.createElement("canvas");
        final.width = targetPx;
        final.height = targetPx;
        const fctx = final.getContext("2d")!;
        fctx.imageSmoothingEnabled = true;
        fctx.imageSmoothingQuality = "high";
        if (curCanvas) {
          fctx.drawImage(curCanvas, 0, 0, curW, curH, 0, 0, targetPx, targetPx);
        } else {
          fctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, targetPx, targetPx);
        }
        this.textures.addImage(scaledKey, final as unknown as HTMLImageElement);
      }
    }

    // Extract ImageData from loaded AI char texture patches for character generation
    const provider: CharTextureProvider = {};
    for (const [field, texKey] of Object.entries(AI_CHAR_TEXTURES)) {
      if (this.textures.exists(texKey)) {
        const tex = this.textures.get(texKey);
        const src = tex.getSourceImage() as HTMLImageElement;
        const canvas = document.createElement("canvas");
        canvas.width = src.width;
        canvas.height = src.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(src, 0, 0);
        provider[field as keyof CharTextureProvider] = ctx.getImageData(0, 0, src.width, src.height);
      }
    }
    if (Object.keys(provider).length > 0) {
      setCharTextureProvider(provider);
    }

    // Extract ImageData from AI component atlases directly — no individual Phaser textures needed.
    // This avoids creating hundreds of GPU textures just to read pixel data once.
    const compProvider: CharComponentProvider = { hair: {}, beard: {}, shirt: {}, pants: {}, accessory: {}, headFeature: {} };

    // Helper: extract all frames for a component type from its atlas
    const extractComponentAtlas = (
      atlasKey: string,
      metaKey: string,
      styles: readonly string[],
      frameKeyFn: (style: string, dir: string, pose: number) => string,
      target: Record<string, ImageData[]>,
    ): void => {
      const meta = this.cache.json.get(metaKey) as
        | { frames: Record<string, { x: number; y: number; w: number; h: number }> }
        | undefined;
      if (!this.textures.exists(atlasKey) || !meta?.frames) return;
      const atlasImg = this.textures.get(atlasKey).getSourceImage() as CanvasImageSource;
      for (const style of styles) {
        const frames: ImageData[] = [];
        let allLoaded = true;
        for (const dir of AI_HAIR_DIRS) {
          for (let pose = 0; pose < AI_HAIR_POSES; pose++) {
            const key = frameKeyFn(style, dir, pose);
            const frame = meta.frames[key];
            if (!frame) { allLoaded = false; break; }
            const canvas = document.createElement("canvas");
            canvas.width = frame.w;
            canvas.height = frame.h;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(atlasImg, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
            frames.push(ctx.getImageData(0, 0, frame.w, frame.h));
          }
          if (!allLoaded) break;
        }
        if (allLoaded && frames.length === AI_HAIR_DIRS.length * AI_HAIR_POSES) {
          target[style] = frames;
        }
      }
      // Free the atlas source texture — ImageData is already extracted.
      this.textures.remove(atlasKey);
    };

    extractComponentAtlas("ai-hair-atlas", "ai-hair-atlas-meta", AI_HAIR_STYLES, hairFrameKey, compProvider.hair!);
    extractComponentAtlas("ai-shirt-atlas", "ai-shirt-atlas-meta", AI_SHIRT_STYLES, shirtFrameKey, compProvider.shirt!);
    extractComponentAtlas("ai-pants-atlas", "ai-pants-atlas-meta", AI_PANTS_STYLES, pantsFrameKey, compProvider.pants!);

    // Defer non-critical component extraction (beard, accessory, headFeature)
    // to after the game starts — these are rarely needed immediately and
    // each extractComponentAtlas call does many canvas + getImageData operations.
    const deferredProvider: CharComponentProvider = { beard: {}, accessory: {}, headFeature: {} };
    const deferredExtract = () => {
      extractComponentAtlas("ai-beard-atlas", "ai-beard-atlas-meta", AI_BEARD_STYLES, beardFrameKey, deferredProvider.beard!);
      extractComponentAtlas("ai-accessory-atlas", "ai-accessory-atlas-meta", AI_ACCESSORY_STYLES, accessoryFrameKey, deferredProvider.accessory!);
      extractComponentAtlas("ai-headFeature-atlas", "ai-headFeature-atlas-meta", AI_HEAD_FEATURE_STYLES, headFeatureFrameKey, deferredProvider.headFeature!);
      // Merge into the main provider
      const merged = { ...compProvider, ...deferredProvider } as CharComponentProvider;
      setCharComponentProvider(merged);
    };
    // Run after the game has started — atlas sources persist in the global
    // TextureManager so extraction works even after BootScene shuts down.
    setTimeout(deferredExtract, 2000);

    const hasAny =
      (compProvider.hair && Object.keys(compProvider.hair).length > 0) ||
      (compProvider.beard && Object.keys(compProvider.beard).length > 0) ||
      (compProvider.shirt && Object.keys(compProvider.shirt).length > 0) ||
      (compProvider.pants && Object.keys(compProvider.pants).length > 0) ||
      (compProvider.accessory && Object.keys(compProvider.accessory).length > 0) ||
      (compProvider.headFeature && Object.keys(compProvider.headFeature).length > 0);
    if (hasAny) {
      setCharComponentProvider(compProvider);
    }

    // Get texture generation steps + animation step
    const texSteps = getTextureGenerationSteps(this);
    const totalSteps = texSteps.length + 1; // +1 for animations

    loadingOverlay.setSegment(0.4, 0.7);

    // Process steps in batches so the bar visibly progresses.
    // Heavy steps (Creatures, Beasts, Friendly, World objects) run individually;
    // light steps (Effects, Glows, Items, Tennis, Emotes, Animations) batch into one frame.
    const heavyNames = new Set(["Creatures", "Beasts", "Friendly creatures", "World objects"]);
    const heavySteps = texSteps.filter((s) => heavyNames.has(s.name));
    const lightSteps = texSteps.filter((s) => !heavyNames.has(s.name));
    const allSteps: Array<{ name: string; fn: () => void }> = [
      ...heavySteps,
      { name: "Effects & items", fn: () => { for (const s of lightSteps) s.fn(); } },
      { name: "Animations", fn: () => this.createAnimations() },
    ];
    let stepIndex = 0;

    const processNextStep = () => {
      if (stepIndex >= allSteps.length) {
        loadingOverlay.updateProgress(1, "Ready!");
        console.log(`[boot] texture steps done at ${performance.now().toFixed(0)}ms`);
        const store = this.game.registry.get("store") as Store | undefined;
        const startOffice = () => {
          if (this.scene.isActive("office")) return;
          console.log(`[boot] starting OfficeScene at ${performance.now().toFixed(0)}ms`);
          this.scene.start("office");
        };

        if (isAuthEnabled) {
          let officeStarted = false;
          const startOfficeOnce = () => {
            if (officeStarted) return;
            officeStarted = true;
            startOffice();
          };
          const tryStart = (state: AuthState) => {
            if (state.loading) return;
            console.log(`[boot] auth state: session=${!!state.session} initialDataReady=${store?.initialDataReady} at ${performance.now().toFixed(0)}ms`);
            if (state.session) {
              if (!store || store.initialDataReady) {
                startOfficeOnce();
              } else {
                loadingOverlay.updateProgress(1, "Connecting to server…");
                this.time.delayedCall(10000, () => startOfficeOnce());
                store.onInitialData(() => startOfficeOnce());
              }
            } else {
              this.time.delayedCall(15000, () => {
                if (!officeStarted) startOfficeOnce();
              });
            }
          };
          onAuthChange(tryStart);
          this.time.delayedCall(15000, () => startOfficeOnce());
        } else {
          console.log(`[boot] no auth, initialDataReady=${store?.initialDataReady} at ${performance.now().toFixed(0)}ms`);
          if (!store || store.initialDataReady) {
            startOffice();
          } else {
            loadingOverlay.updateProgress(1, "Connecting to server…");
            this.time.delayedCall(10000, () => startOffice());
            store.onInitialData(() => startOffice());
          }
        }
        return;
      }

      const step = allSteps[stepIndex];
      const progress = stepIndex / totalSteps;
      loadingOverlay.updateProgress(progress, `Generating ${step.name}…`);

      // Run the step on the next frame so the bar update renders first
      this.time.delayedCall(0, () => {
        step.fn();
        stepIndex++;
        // Update bar to show this step completed
        loadingOverlay.updateProgress(stepIndex / totalSteps, `Done: ${step.name}`);
        // Schedule next step on the following frame
        this.time.delayedCall(0, processNextStep);
      });
    };

    // Start processing on the next frame so "Generating…" text renders first
    this.time.delayedCall(0, processNextStep);
  }

  /** Unpack a texture atlas into individual Phaser image textures.
   *  Uses addImage for power-of-two textures (enables WebGL mipmaps for
   *  sharp detail at 4:1 minification). Uses createCanvas for NPOT textures
   *  (e.g. 64×96 character pieces) to avoid GL_INVALID_OPERATION mipmap errors. */
  private unpackAtlas(atlasKey: string, metaKey: string): void {
    if (!this.textures.exists(atlasKey)) return;
    const meta = this.cache.json.get(metaKey) as
      | { frames: Record<string, { x: number; y: number; w: number; h: number }> }
      | undefined;
    if (!meta?.frames) return;
    const atlasImage = this.textures.get(atlasKey).getSourceImage() as CanvasImageSource;
    for (const [texKey, frame] of Object.entries(meta.frames)) {
      if (this.textures.exists(texKey)) continue;
      const off = document.createElement("canvas");
      off.width = frame.w;
      off.height = frame.h;
      const ctx = off.getContext("2d")!;
      ctx.drawImage(atlasImage, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
      const isPOT = (frame.w & (frame.w - 1)) === 0 && (frame.h & (frame.h - 1)) === 0;
      if (isPOT) {
        this.textures.addImage(texKey, off as unknown as HTMLImageElement);
      } else {
        const ct = this.textures.createCanvas(texKey, frame.w, frame.h);
        if (ct) {
          const cctx = ct.getContext();
          cctx.drawImage(off, 0, 0);
          ct.refresh();
        }
      }
    }
  }

  private createAnimations(): void {
    // --- creature animations ---
    const creatureNames = ["slime", "wolf", "skeleton", "imp", "wraith", "fire-elemental"];
    for (const name of creatureNames) {
      const key = `creature-${name}`;
      if (this.anims.exists(`${key}-idle`)) continue;
      this.anims.create({
        key: `${key}-idle`,
        frames: this.anims.generateFrameNumbers(key, { frames: [0, 1, 0, 2] }),
        frameRate: 3,
        repeat: -1,
      });
      this.anims.create({
        key: `${key}-walk`,
        frames: this.anims.generateFrameNumbers(key, { frames: [1, 2, 1, 2] }),
        frameRate: 8,
        repeat: -1,
      });
      this.anims.create({
        key: `${key}-attack`,
        frames: this.anims.generateFrameNumbers(key, { frames: [3, 0] }),
        frameRate: 6,
        repeat: 0,
      });
    }

    // --- beast animations ---
    const beastNames = ["groveheart", "stone-colossus", "ash-wyrm", "void-leviathan", "infernal-sovereign"];
    for (const name of beastNames) {
      const key = `beast-${name}`;
      if (this.anims.exists(`${key}-idle`)) continue;
      this.anims.create({
        key: `${key}-idle`,
        frames: this.anims.generateFrameNumbers(key, { frames: [0, 1, 0, 2] }),
        frameRate: 2,
        repeat: -1,
      });
      this.anims.create({
        key: `${key}-move`,
        frames: this.anims.generateFrameNumbers(key, { frames: [1, 2, 1, 2] }),
        frameRate: 5,
        repeat: -1,
      });
      this.anims.create({
        key: `${key}-attack`,
        frames: this.anims.generateFrameNumbers(key, { frames: [3, 0] }),
        frameRate: 4,
        repeat: 0,
      });
    }

    // --- friendly creature animations ---
    const friendlyNames = ["unicorn", "fairy-bunny", "baby-dragon", "crystal-fox"];
    for (const name of friendlyNames) {
      const key = `friendly-${name}`;
      if (this.anims.exists(`${key}-idle`)) continue;
      this.anims.create({
        key: `${key}-idle`,
        frames: this.anims.generateFrameNumbers(key, { frames: [0, 1, 0, 2] }),
        frameRate: 3,
        repeat: -1,
      });
      this.anims.create({
        key: `${key}-walk`,
        frames: this.anims.generateFrameNumbers(key, { frames: [1, 2, 1, 2] }),
        frameRate: 6,
        repeat: -1,
      });
      this.anims.create({
        key: `${key}-hop`,
        frames: this.anims.generateFrameNumbers(key, { frames: [3, 1, 0] }),
        frameRate: 5,
        repeat: 0,
      });
    }

    // --- character sheet animations ---
    const sheets = [...Array.from({ length: CHAR_VARIANTS }, (_, i) => `char-${i}`), "char-office-manager", "char-hermes"];
    const dirs: Dir[] = ["down", "left", "right", "up"];
    for (const key of sheets) {
      if (this.anims.exists(`${key}-work`)) continue;
      dirs.forEach((dir, row) => {
        const base = row * CHAR_FRAMES_PER_ROW;
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

    // --- water animation ---
    if (!this.anims.exists("water-anim")) {
      this.anims.create({
        key: "water-anim",
        frames: this.anims.generateFrameNumbers("world-tiles", { frames: [21, 22, 23] }),
        frameRate: 4,
        repeat: -1,
      });
    }

    // --- fountain animation ---
    if (!this.anims.exists("fountain-anim")) {
      this.anims.create({
        key: "fountain-anim",
        frames: this.anims.generateFrameNumbers("fountain-sheet", { frames: [0, 1, 2, 3] }),
        frameRate: 6,
        repeat: -1,
      });
    }
  }
}
