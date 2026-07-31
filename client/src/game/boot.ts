import Phaser from "phaser";
import { CHAR_VARIANTS } from "../../../shared/types";
import { CHAR_FRAME_W, CHAR_FRAME_H, CHAR_FRAMES_PER_ROW } from "./chargen";
import { getTextureGenerationSteps } from "./textures";
import type { Dir } from "./agent";
import { onAuthChange, isAuthEnabled, type AuthState } from "../auth";
import { Store } from "../store";
import { AI_CHAR_TEXTURES } from "./ai-tiles";
import { setCharTextureProvider } from "./chargen";
import type { CharTextureProvider } from "../../../shared/char-draw";

/**
 * Boot scene — shows a loading bar while assets load, then generates all
 * procedural textures and animations before starting the main OfficeScene.
 * Texture generation is spread across frames so the progress bar moves
 * visibly as each category is generated.
 */
export class BootScene extends Phaser.Scene {
  private bar!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;

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
    this.load.spritesheet("boss", `assets/characters/boss.png${v}`, {
      frameWidth: CHAR_FRAME_W,
      frameHeight: CHAR_FRAME_H,
    });
    this.load.spritesheet("char-agent-resources", `assets/characters/char-agent-resources.png${v}`, {
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

    // AI texture atlases (replaces 124+ individual requests with 4)
    const atlasVer = "?v=268";
    this.load.image("ai-tiles-atlas", `assets/atlases/ai-tiles-atlas.webp${atlasVer}`);
    this.load.json("ai-tiles-atlas-meta", `assets/atlases/ai-tiles-atlas.json${atlasVer}`);
    this.load.image("ai-sprites-atlas", `assets/atlases/ai-sprites-atlas.webp${atlasVer}`);
    this.load.json("ai-sprites-atlas-meta", `assets/atlases/ai-sprites-atlas.json${atlasVer}`);

    const w = this.scale.width;
    const h = this.scale.height;
    this.bar = this.add.graphics();
    this.statusText = this.add
      .text(w / 2, h / 2 - 40, "Loading assets…", {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "20px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setResolution(2);

    this.load.on("progress", (value: number) => {
      this.bar.clear();
      this.bar.fillStyle(0x222233, 1);
      this.bar.fillRoundedRect(w / 2 - 160, h / 2, 320, 24, 6);
      this.bar.fillStyle(0x3a8cd4, 1);
      this.bar.fillRoundedRect(w / 2 - 160, h / 2, 320 * value, 24, 6);
    });

    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      console.warn("[Asset Load Error]", file.key, file.url);
    });
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const barX = w / 2 - 160;
    const barY = h / 2;
    const barW = 320;
    const barH = 24;

    // Unpack AI texture atlases into individual Phaser textures so existing
    // code that references keys like "ai-grass_0" works without changes.
    this.unpackAtlas("ai-tiles-atlas", "ai-tiles-atlas-meta");
    this.unpackAtlas("ai-sprites-atlas", "ai-sprites-atlas-meta");

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

    // Get texture generation steps + animation step
    const texSteps = getTextureGenerationSteps(this);
    const totalSteps = texSteps.length + 1; // +1 for animations

    const updateBar = (progress: number, label: string) => {
      this.statusText.setText(label);
      this.bar.clear();
      this.bar.fillStyle(0x222233, 1);
      this.bar.fillRoundedRect(barX, barY, barW, barH, 6);
      this.bar.fillStyle(0x4cb866, 1);
      this.bar.fillRoundedRect(barX, barY, barW * progress, barH, 6);
    };

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
        updateBar(1, "Ready!");
        const store = this.game.registry.get("store") as Store | undefined;
        const startOffice = () => {
          if (this.scene.isActive("office")) return;
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
            if (state.session) {
              if (!store || store.initialDataReady) {
                startOfficeOnce();
              } else {
                updateBar(1, "Connecting to server…");
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
          if (!store || store.initialDataReady) {
            startOffice();
          } else {
            updateBar(1, "Connecting to server…");
            this.time.delayedCall(10000, () => startOffice());
            store.onInitialData(() => startOffice());
          }
        }
        return;
      }

      const step = allSteps[stepIndex];
      const progress = stepIndex / totalSteps;
      updateBar(progress, `Generating ${step.name}…`);

      // Run the step on the next frame so the bar update renders first
      this.time.delayedCall(0, () => {
        step.fn();
        stepIndex++;
        // Update bar to show this step completed
        updateBar(stepIndex / totalSteps, `Done: ${step.name}`);
        // Schedule next step on the following frame
        this.time.delayedCall(0, processNextStep);
      });
    };

    // Start processing on the next frame so "Generating…" text renders first
    this.time.delayedCall(0, processNextStep);
  }

  /** Unpack a texture atlas into individual Phaser image textures.
   *  Uses addImage (not createCanvas) so WebGL mipmaps are generated,
   *  preserving full detail at 4:1 minification (256px→64px tiles). */
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
      this.textures.addImage(texKey, off as unknown as HTMLImageElement);
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
    const sheets = [...Array.from({ length: CHAR_VARIANTS }, (_, i) => `char-${i}`), "boss", "char-agent-resources"];
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
