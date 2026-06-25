/**
 * Visual Effects Manager
 *
 * Centralized system for all particle effects, impact VFX, environmental
 * particles, and screen-space effects. Uses Phaser's built-in particle
 * emitters with procedurally generated textures from textures.ts.
 */

import Phaser from "phaser";

export class VFXManager {
  private scene: Phaser.Scene;
  private ambientEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private sparkPool: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private sparkPoolIdx = 0;
  private readonly SPARK_POOL_SIZE = 12;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // Pre-create a pool of spark emitters (hidden, reused via explode())
    for (let i = 0; i < this.SPARK_POOL_SIZE; i++) {
      const emitter = this.scene.add.particles(0, 0, "spark", {
        speed: { min: 30, max: 100 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.8, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 300, max: 600 },
        quantity: 12,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      });
      emitter.setActive(false).setVisible(false);
      this.sparkPool.push(emitter);
    }
  }

  /** Burst of sparks at a position — for hits, impacts, explosions. */
  sparkBurst(x: number, y: number, color: number, count = 12, speed = 100): void {
    const emitter = this.sparkPool[this.sparkPoolIdx];
    this.sparkPoolIdx = (this.sparkPoolIdx + 1) % this.SPARK_POOL_SIZE;
    emitter.setActive(true).setVisible(true);
    emitter.explode(count, x, y);
    this.scene.time.delayedCall(700, () => {
      emitter.setActive(false).setVisible(false);
    });
  }

  /** Dust cloud — for footsteps, landings, creature movement. */
  dustCloud(x: number, y: number, count = 6, scale = 1): void {
    const emitter = this.scene.add.particles(x, y, "dust", {
      speed: { min: 20, max: 60 },
      angle: { min: 220, max: 320 },
      scale: { start: scale, end: 0 },
      alpha: { start: 0.6, end: 0 },
      lifespan: { min: 400, max: 700 },
      quantity: count,
      gravityY: -30,
      emitting: false,
    });
    emitter.explode(count, x, y);
    this.scene.time.delayedCall(800, () => emitter.destroy());
  }

  /** Expanding shockwave ring — for beast deaths, big impacts. */
  shockwave(x: number, y: number, color = 0xffffff, maxScale = 4): void {
    const ring = this.scene.add.image(x, y, "shockwave").setDepth(45).setTint(color);
    this.scene.tweens.add({
      targets: ring,
      scale: { from: 0.5, to: maxScale },
      alpha: { from: 0.8, to: 0 },
      duration: 500,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  /** Recruit beam — green pillar of light for ghost recruitment. */
  recruitBeam(x: number, y: number): void {
    const beam = this.scene.add.image(x, y - 48, "recruit-beam").setDepth(40).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: beam,
      alpha: { from: 0, to: 1 },
      duration: 200,
      yoyo: true,
      hold: 400,
      onComplete: () => beam.destroy(),
    });
    // rising sparkles
    this.sparkBurst(x, y, 0x4cb866, 16, 60);
    this.scene.tweens.add({
      targets: beam,
      y: y - 80,
      duration: 800,
      ease: "Sine.easeOut",
    });
  }

  /** Hit flash — brief white overlay on a sprite when it takes damage. */
  hitFlash(sprite: Phaser.GameObjects.Sprite, duration = 80): void {
    sprite.setTint(0xffffff);
    this.scene.time.delayedCall(duration, () => sprite.clearTint());
  }

  /** Screen shake wrapper with intensity presets. */
  shake(intensity: "small" | "medium" | "large" = "medium"): void {
    const config = {
      small: { duration: 150, intensity: 0.005 },
      medium: { duration: 250, intensity: 0.01 },
      large: { duration: 500, intensity: 0.02 },
    };
    const c = config[intensity];
    this.scene.cameras.main.shake(c.duration, c.intensity);
  }

  /** Subtle continuous rumble — for nearby behemoths. Intensity 0–1. */
  rumble(intensity: number): void {
    this.scene.cameras.main.shake(120, 0.002 * intensity);
  }

  /** Hit-stop: brief freeze frame on heavy impacts. */
  hitStop(duration = 80): void {
    this.scene.time.timeScale = 0;
    this.scene.time.delayedCall(duration, () => {
      this.scene.time.timeScale = 1;
    });
  }

  /** Floating damage number — rises and fades. */
  damageNumber(x: number, y: number, amount: number, color = 0xff4444): void {
    const text = this.scene.add
      .text(x, y, `-${Math.round(amount)}`, {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "18px",
        color: `#${color.toString(16).padStart(6, "0")}`,
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setResolution(2);

    this.scene.tweens.add({
      targets: text,
      y: y - 40,
      alpha: 0,
      scale: { from: 1.2, to: 0.8 },
      duration: 800,
      ease: "Quad.easeOut",
      onComplete: () => text.destroy(),
    });
  }

  /** Death dissolve — entity fades and scatters particles. */
  deathDissolve(x: number, y: number, color: number, scale = 1): void {
    // particle scatter
    this.sparkBurst(x, y, color, 20, 120 * scale);
    this.dustCloud(x, y, 8, scale);
    this.shockwave(x, y, color, 3 * scale);
  }

  /** Level-up / celebration effect — golden burst. */
  celebrate(x: number, y: number): void {
    this.sparkBurst(x, y, 0xffdd44, 24, 100);
    const ring = this.scene.add.image(x, y, "shockwave").setDepth(45).setTint(0xffdd44);
    this.scene.tweens.add({
      targets: ring,
      scale: { from: 0.5, to: 3 },
      alpha: { from: 0.9, to: 0 },
      duration: 600,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  /** Start ambient biome particles — pollen, ash, snow, etc. */
  startAmbient(type: "meadow" | "forest" | "ruins" | "wasteland" | "void" | "infernal"): void {
    this.stopAmbient();
    const config = AMBIENT_CONFIG[type];
    if (!config) return;

    this.ambientEmitter = this.scene.add.particles(0, 0, config.texture, {
      x: { min: 0, max: this.scene.scale.width },
      y: { min: -20, max: this.scene.scale.height + 20 },
      speedX: config.speedX,
      speedY: config.speedY,
      scale: { min: config.scaleMin, max: config.scaleMax },
      alpha: { min: config.alphaMin, max: config.alphaMax },
      lifespan: config.lifespan,
      quantity: config.quantity,
      frequency: config.frequency,
      tint: config.tint,
      blendMode: config.blend,
    });
    this.ambientEmitter.setDepth(880).setScrollFactor(0);
  }

  /** Stop ambient particles. */
  stopAmbient(): void {
    if (this.ambientEmitter) {
      this.ambientEmitter.destroy();
      this.ambientEmitter = null;
    }
  }

  /** Update ambient particle position to follow camera. */
  update(): void {
    // Particles are scrollFactor 0 so they stay on screen
  }

  destroy(): void {
    this.stopAmbient();
    for (const e of this.sparkPool) e.destroy();
    this.sparkPool = [];
  }
}

const AMBIENT_CONFIG: Record<string, {
  texture: string;
  speedX: { min: number; max: number };
  speedY: { min: number; max: number };
  scaleMin: number;
  scaleMax: number;
  alphaMin: number;
  alphaMax: number;
  lifespan: number;
  quantity: number;
  frequency: number;
  tint: number;
  blend: number;
}> = {
  meadow: {
    texture: "spark",
    speedX: { min: -10, max: 10 },
    speedY: { min: 5, max: 20 },
    scaleMin: 0.1,
    scaleMax: 0.3,
    alphaMin: 0.2,
    alphaMax: 0.5,
    lifespan: 6000,
    quantity: 1,
    frequency: 200,
    tint: 0xffee88,
    blend: Phaser.BlendModes.ADD,
  },
  forest: {
    texture: "dust",
    speedX: { min: -15, max: 15 },
    speedY: { min: 10, max: 25 },
    scaleMin: 0.15,
    scaleMax: 0.35,
    alphaMin: 0.15,
    alphaMax: 0.4,
    lifespan: 5000,
    quantity: 1,
    frequency: 300,
    tint: 0x88aa66,
    blend: Phaser.BlendModes.NORMAL,
  },
  ruins: {
    texture: "dust",
    speedX: { min: -20, max: 20 },
    speedY: { min: -5, max: 10 },
    scaleMin: 0.2,
    scaleMax: 0.5,
    alphaMin: 0.1,
    alphaMax: 0.3,
    lifespan: 4000,
    quantity: 1,
    frequency: 250,
    tint: 0xaaaaaa,
    blend: Phaser.BlendModes.NORMAL,
  },
  wasteland: {
    texture: "dust",
    speedX: { min: -40, max: -10 },
    speedY: { min: -5, max: 5 },
    scaleMin: 0.2,
    scaleMax: 0.6,
    alphaMin: 0.15,
    alphaMax: 0.35,
    lifespan: 3000,
    quantity: 2,
    frequency: 150,
    tint: 0xccaa88,
    blend: Phaser.BlendModes.NORMAL,
  },
  void: {
    texture: "spark",
    speedX: { min: -5, max: 5 },
    speedY: { min: -10, max: -2 },
    scaleMin: 0.1,
    scaleMax: 0.25,
    alphaMin: 0.2,
    alphaMax: 0.5,
    lifespan: 5000,
    quantity: 1,
    frequency: 200,
    tint: 0xaa00ff,
    blend: Phaser.BlendModes.ADD,
  },
  infernal: {
    texture: "spark",
    speedX: { min: -10, max: 10 },
    speedY: { min: -30, max: -10 },
    scaleMin: 0.1,
    scaleMax: 0.3,
    alphaMin: 0.3,
    alphaMax: 0.6,
    lifespan: 3000,
    quantity: 2,
    frequency: 100,
    tint: 0xff6600,
    blend: Phaser.BlendModes.ADD,
  },
};
