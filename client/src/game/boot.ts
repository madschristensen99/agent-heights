import Phaser from "phaser";
import { CHAR_VARIANTS } from "../../../shared/types";
import { CHAR_FRAME_W, CHAR_FRAME_H, CHAR_FRAMES_PER_ROW } from "./chargen";
import { generateAllTextures } from "./textures";
import type { Dir } from "./agent";

/**
 * Boot scene — shows a loading bar while assets load, then generates all
 * procedural textures and animations before starting the main OfficeScene.
 * This moves heavy synchronous work out of OfficeScene.create() so the game
 * starts smoothly with no black screen gap.
 */
export class BootScene extends Phaser.Scene {
  private bar!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super("boot");
  }

  preload(): void {
    const v = "?v=2x";
    this.load.tilemapTiledJSON("map-classic", "assets/maps/office.json");
    this.load.tilemapTiledJSON("map-lumon", "assets/maps/lumon.json");
    this.load.image("tiles-classic", "assets/tilesets/office.png");
    this.load.image("tiles-lumon", "assets/tilesets/lumon.png");
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
    this.load.spritesheet("char-yuki", `assets/characters/char-yuki.png${v}`, {
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
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    // Show "Generating world…" phase, then defer heavy synchronous work to the
    // next frame so this text actually renders before the main thread blocks.
    this.statusText.setText("Generating world…");
    this.bar.clear();
    this.bar.fillStyle(0x222233, 1);
    this.bar.fillRoundedRect(w / 2 - 160, h / 2, 320, 24, 6);
    this.bar.fillStyle(0x4cb866, 1);
    this.bar.fillRoundedRect(w / 2 - 160, h / 2, 320, 24, 6);

    this.time.delayedCall(0, () => {
      generateAllTextures(this);
      this.createAnimations();
      this.scene.start("office");
    });
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
    const sheets = [...Array.from({ length: CHAR_VARIANTS }, (_, i) => `char-${i}`), "boss", "char-yuki"];
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
  }
}
