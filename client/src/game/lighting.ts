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

interface LightSource {
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
    this.dayNightTint = scene.add
      .rectangle(0, 0, scene.scale.width, scene.scale.height, 0x000000, 0)
      .setOrigin(0, 0)
      .setDepth(890)
      .setScrollFactor(0);

    // Ambient darkness — controls overall visibility (stronger at night)
    this.ambientDarkness = scene.add
      .rectangle(0, 0, scene.scale.width, scene.scale.height, 0x000020, 0)
      .setOrigin(0, 0)
      .setDepth(845)
      .setScrollFactor(0);

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
   *  @param darknessFactor 0 = fully lit (inside office), 1 = full night darkness */
  update(time: number, playerX: number, playerY: number, darknessFactor: number): void {
    // Day/night cycle: 120s full cycle
    const cycle = (time / 120000) % 1;
    const nightFactor = (Math.sin(cycle * Math.PI * 2 - Math.PI / 2) + 1) / 2; // 0 = day, 1 = night

    // Brightness boost: peaks just outside the office, fades over ~15 tiles
    const brightnessFactor = darknessFactor > 0 ? Math.max(0, 1 - darknessFactor * 7) : 0;
    this.brightnessBoost.setFillStyle(0xffd88a, brightnessFactor * 0.06);

    // Darkness: delayed onset — doesn't start until ~10 tiles out so the
    // brightness boost dominates near the office edge
    const delayedDarkness = Math.max(0, (darknessFactor - 0.1) / 0.9);
    this.dayNightTint.setFillStyle(0x0a0a30, nightFactor * 0.35 * delayedDarkness);
    this.ambientDarkness.setFillStyle(0x000020, nightFactor * 0.25 * delayedDarkness);

    // Pulse all lights
    for (const light of this.lights) {
      const pulseVal = light.pulse > 0 ? Math.sin(time * light.pulseSpeed) * light.pulse : 0;
      light.sprite.setAlpha(light.intensity + pulseVal);
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
    this.brightnessBoost.destroy();
    this.dayNightTint.destroy();
    this.ambientDarkness.destroy();
  }
}
