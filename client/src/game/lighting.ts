/**
 * Dynamic Lighting System
 *
 * Multi-light rendering using additive blend mode sprites.
 * Each light source is a positioned glow sprite that blends additively
 * with the scene. The day/night cycle modulates ambient brightness.
 *
 * Light sources:
 * - Player aura (brighter at night)
 * - Monitor glows (colored by agent status)
 * - Creature hostile glow (red/purple)
 * - Beast auras (large, colored per beast)
 * - Lava tiles (orange)
 * - Crystal tiles (blue)
 * - Void tiles (purple)
 */

import Phaser from "phaser";
import { TILE } from "../../../shared/types";

export interface LightSource {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
  pulse: number;
  pulseSpeed: number;
}

export class LightingSystem {
  private scene: Phaser.Scene;
  private lights: LightSource[] = [];
  private dayNightTint!: Phaser.GameObjects.Rectangle;
  private ambientDarkness!: Phaser.GameObjects.Rectangle;
  private brightnessBoost!: Phaser.GameObjects.Rectangle;
  private lightContainer: Phaser.GameObjects.Container;
  private playerLight: LightSource | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.lightContainer = scene.add.container(0, 0).setDepth(850);

    // Brightness boost — makes the area just outside the office brighter than inside
    this.brightnessBoost = scene.add
      .rectangle(0, 0, scene.scale.width, scene.scale.height, 0xffffff, 0)
      .setOrigin(0, 0)
      .setDepth(830)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScrollFactor(0);

    // Day/night overlay — shifts color temperature over time
    // Positioned in world space each frame to cover the full camera view.
    this.dayNightTint = scene.add
      .rectangle(0, 0, scene.scale.width, scene.scale.height, 0x000000, 0)
      .setOrigin(0, 0)
      .setDepth(890);

    // Ambient darkness — controls overall visibility (stronger at night)
    this.ambientDarkness = scene.add
      .rectangle(0, 0, scene.scale.width, scene.scale.height, 0x000020, 0)
      .setOrigin(0, 0)
      .setDepth(845);

    scene.scale.on("resize", () => {
      this.brightnessBoost.setSize(scene.scale.width, scene.scale.height);
      this.dayNightTint.setSize(scene.scale.width, scene.scale.height);
      this.ambientDarkness.setSize(scene.scale.width, scene.scale.height);
    });
  }

  /** Add a dynamic light source that follows a target. */
  addLight(
    x: number,
    y: number,
    radius: number,
    color: number,
    intensity = 0.5,
    pulse = 0,
    pulseSpeed = 0.003,
  ): LightSource {
    const sprite = this.scene.add
      .image(x, y, "soft-glow")
      .setDisplaySize(radius * 2, radius * 2)
      .setTint(color)
      .setAlpha(intensity)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(850);

    const light: LightSource = { sprite, x, y, radius, color, intensity, pulse, pulseSpeed };
    this.lights.push(light);
    this.lightContainer.add(sprite);
    return light;
  }

  /** Remove a light source. */
  removeLight(light: LightSource): void {
    light.sprite.destroy();
    this.lights = this.lights.filter((l) => l !== light);
  }

  /** Update a light's position and properties. */
  updateLight(light: LightSource, x: number, y: number, intensity?: number): void {
    light.x = x;
    light.y = y;
    light.sprite.setPosition(x, y);
    if (intensity !== undefined) {
      light.intensity = intensity;
    }
  }

  /** Main update — called every frame.
   *  @param darknessFactor 0 = fully lit (inside office), 1 = full night darkness
   *  @param nightFactor 0 = day, 1 = full night (from day/night cycle) */
  update(time: number, playerX: number, playerY: number, darknessFactor: number, nightFactor: number): void {
    // Brightness boost: peaks just outside the office, fades over ~15 tiles
    const brightnessFactor = darknessFactor > 0 ? Math.max(0, 1 - darknessFactor * 7) : 0;
    this.brightnessBoost.setFillStyle(0xffd88a, brightnessFactor * 0.06);

    // Darkness: delayed onset — doesn't start until ~10 tiles out so the
    // brightness boost dominates near the office edge
    const delayedDarkness = Math.max(0, (darknessFactor - 0.1) / 0.9);
    // Make night darker and more ominous — deep blue-purple with higher alpha
    this.dayNightTint.setFillStyle(0x050518, nightFactor * 0.55 * delayedDarkness);
    this.ambientDarkness.setFillStyle(0x000010, nightFactor * 0.45 * delayedDarkness);

    // Resize overlays to cover the full camera world view (handles zoom-out)
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    this.dayNightTint.setSize(view.width, view.height).setPosition(view.x, view.y);
    this.ambientDarkness.setSize(view.width, view.height).setPosition(view.x, view.y);

    // Player aura light — created on first update, follows player, brighter at night
    const auraIntensity = 0.15 + nightFactor * 0.35 * delayedDarkness;
    if (!this.playerLight) {
      this.playerLight = this.addLight(playerX, playerY, 120, 0xffdd88, auraIntensity, 0.03, 0.002);
    } else {
      this.updateLight(this.playerLight, playerX, playerY, auraIntensity);
      // Resize aura at night for wider visibility
      const auraRadius = 100 + nightFactor * 80 * delayedDarkness;
      this.playerLight.sprite.setDisplaySize(auraRadius * 2, auraRadius * 2);
    }

    // Dynamically adjust bloom pipeline — at night, lower threshold and boost strength
    // so light sources radiate and glow intensely against the darkness
    const renderer = this.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (renderer) {
      const bloomPipe = renderer.pipelines.get("BloomFX") as unknown as { setStrength: (n: number) => void; setThreshold: (n: number) => void } | null;
      if (bloomPipe) {
        const nightBloom = nightFactor * delayedDarkness;
        bloomPipe.setStrength(0.6 + nightBloom * 0.8);
        bloomPipe.setThreshold(0.65 - nightBloom * 0.35);
      }
    }

    // Pulse all lights — boost intensity at night so they radiate against the dark
    const nightBoost = 1 + nightFactor * delayedDarkness * 0.8;
    for (const light of this.lights) {
      if (light === this.playerLight) continue; // player light already scaled
      const pulseVal = light.pulse > 0 ? Math.sin(time * light.pulseSpeed) * light.pulse : 0;
      light.sprite.setAlpha(Math.min(1, light.intensity * nightBoost + pulseVal));
    }
  }

  /** Get the day/night factor (0 = full day, 1 = full night). */
  getNightFactor(time: number): number {
    const cycle = (time / 120000) % 1;
    return (Math.sin(cycle * Math.PI * 2 - Math.PI / 2) + 1) / 2;
  }

  /** Create tile-based light sources for a chunk (lava, crystals, void). */
  createTileLights(
    tiles: number[],
    chunkPixelX: number,
    chunkPixelY: number,
    chunkSize: number,
    tilePx: number,
  ): LightSource[] {
    const result: LightSource[] = [];
    for (let y = 0; y < chunkSize; y++) {
      for (let x = 0; x < chunkSize; x++) {
        const tile = tiles[y * chunkSize + x];
        const px = chunkPixelX + x * tilePx + tilePx / 2;
        const py = chunkPixelY + y * tilePx + tilePx / 2;

        if (tile === TILE.LAVA) {
          result.push(this.addLight(px, py, 80, 0xff6600, 0.4, 0.1, 0.005));
        } else if (tile === TILE.CRYSTAL) {
          result.push(this.addLight(px, py, 60, 0x44aaff, 0.3, 0.05, 0.003));
        } else if (tile === TILE.VOID) {
          result.push(this.addLight(px, py, 70, 0xaa00ff, 0.25, 0.08, 0.004));
        }
      }
    }
    return result;
  }

  destroy(): void {
    for (const light of this.lights) light.sprite.destroy();
    this.lights = [];
    this.playerLight = null;
    this.brightnessBoost.destroy();
    this.dayNightTint.destroy();
    this.ambientDarkness.destroy();
  }
}
