/**
 * Modern HUD System
 *
 * Replaces monospace text overlays with styled game UI:
 * - Health bar with gradient fill, damage flash, low-HP pulse
 * - Graphical compass with rotating needle
 * - Beast danger banner with animated styling
 * - Minimap showing nearby entities
 * - Proximity hints with styled tooltip boxes
 */

import Phaser from "phaser";

export class HUDSystem {
  private scene: Phaser.Scene;

  // Health bar
  private healthBar!: Phaser.GameObjects.Graphics;
  private healthBarGlow!: Phaser.GameObjects.Image;
  private hp = 100;
  private maxHp = 100;
  private lowHpPulse = 0;

  // Compass
  private compass!: Phaser.GameObjects.Graphics;
  private compassText!: Phaser.GameObjects.Text;

  // Beast banner
  private beastBanner!: Phaser.GameObjects.Graphics;
  private beastBannerText!: Phaser.GameObjects.Text;
  private beastBannerVisible = false;

  // Minimap
  private minimap!: Phaser.GameObjects.Graphics;

  // Hint boxes
  private hints = new Map<string, Phaser.GameObjects.Container>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.create();
  }

  private create(): void {
    // --- Health bar ---
    this.healthBarGlow = this.scene.add
      .image(0, 0, "soft-glow")
      .setDisplaySize(160, 60)
      .setTint(0xff0000)
      .setAlpha(0)
      .setDepth(948)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.healthBar = this.scene.add.graphics().setDepth(950).setScrollFactor(0).setVisible(false);

    // --- Compass ---
    this.compass = this.scene.add.graphics().setDepth(950).setScrollFactor(0).setVisible(false);
    this.compassText = this.scene.add
      .text(0, 0, "", {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "12px",
        color: "#aabbdd",
        stroke: "#0a0a14",
        strokeThickness: 3,
      })
      .setResolution(3)
      .setOrigin(0.5, 0)
      .setDepth(951)
      .setScrollFactor(0)
      .setVisible(false);

    // --- Beast banner ---
    this.beastBanner = this.scene.add.graphics().setDepth(950).setScrollFactor(0).setVisible(false);
    this.beastBannerText = this.scene.add
      .text(0, 0, "", {
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "18px",
        color: "#ffcc44",
        stroke: "#1a0a00",
        strokeThickness: 4,
      })
      .setResolution(3)
      .setOrigin(0.5, 0.5)
      .setDepth(951)
      .setScrollFactor(0)
      .setVisible(false);

    // --- Minimap ---
    this.minimap = this.scene.add.graphics().setDepth(949).setScrollFactor(0).setVisible(false);
  }

  // ============================================================
  // Health Bar
  // ============================================================

  setHealth(hp: number, maxHp: number): void {
    this.hp = hp;
    this.maxHp = maxHp;
    this.drawHealthBar();
  }

  showHealthBar(): void {
    this.healthBar.setVisible(true);
  }

  hideHealthBar(): void {
    this.healthBar.setVisible(false);
    this.healthBarGlow.setAlpha(0);
  }

  private drawHealthBar(): void {
    const g = this.healthBar;
    g.clear();
    const w = 140;
    const h = 18;
    const x = this.scene.scale.width - w - 20;
    const y = 20;
    const pct = Math.max(0, this.hp / this.maxHp);

    // outer frame — dark with subtle border
    g.fillStyle(0x000000, 0.75);
    g.fillRoundedRect(x - 5, y - 5, w + 10, h + 10, 6);
    g.lineStyle(1.5, 0xffffff, 0.2);
    g.strokeRoundedRect(x - 5, y - 5, w + 10, h + 10, 6);

    // inner background
    g.fillStyle(0x1a1a22, 1);
    g.fillRoundedRect(x, y, w, h, 4);

    // fill — gradient from red to green based on health
    const r = Math.floor(255 * (1 - pct));
    const gr = Math.floor(200 * pct);
    const fillColor = (r << 16) | (gr << 8);

    // glow under fill
    if (pct > 0) {
      g.fillStyle(fillColor, 0.3);
      g.fillRoundedRect(x - 2, y - 2, w * pct + 4, h + 4, 5);
    }

    // main fill
    g.fillStyle(fillColor, 0.9);
    g.fillRoundedRect(x, y, w * pct, h, 4);

    // top highlight
    g.fillStyle(0xffffff, 0.2);
    g.fillRoundedRect(x, y, w * pct, h * 0.4, 4);

    // segment lines
    g.lineStyle(1, 0x000000, 0.3);
    for (let i = 1; i < 5; i++) {
      const sx = x + (w / 5) * i;
      if (sx < x + w * pct) {
        g.moveTo(sx, y + 2);
        g.lineTo(sx, y + h - 2);
      }
    }
    g.strokePath();

    // heart icon
    g.fillStyle(0xff4466, 1);
    g.fillCircle(x - 14, y + h / 2, 6);
    g.fillStyle(0xff6688, 0.6);
    g.fillCircle(x - 16, y + h / 2 - 2, 3);

    // low HP glow
    if (pct < 0.3) {
      this.lowHpPulse += 0.05;
      const pulseAlpha = (Math.sin(this.lowHpPulse) * 0.5 + 0.5) * 0.3;
      this.healthBarGlow.setPosition(x + w / 2, y + h / 2).setAlpha(pulseAlpha);
    } else {
      this.healthBarGlow.setAlpha(0);
    }
  }

  // ============================================================
  // Compass
  // ============================================================

  updateCompass(
    visible: boolean,
    doorDx: number,
    doorDy: number,
    distTiles: number,
    biomeName: string,
  ): void {
    this.compass.setVisible(visible);
    this.compassText.setVisible(visible);
    if (!visible) return;

    const cx = 60;
    const cy = 50;
    const g = this.compass;
    g.clear();

    // compass background circle
    g.fillStyle(0x000000, 0.6);
    g.fillCircle(cx, cy, 28);
    g.lineStyle(2, 0x4a5a7a, 0.6);
    g.strokeCircle(cx, cy, 28);
    g.lineStyle(1, 0x2a3a5a, 0.4);
    g.strokeCircle(cx, cy, 22);

    // cardinal markers
    g.fillStyle(0x6a7a9a, 0.6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const tx = cx + Math.cos(a) * 24;
      const ty = cy + Math.sin(a) * 24;
      g.fillCircle(tx, ty, i % 2 === 0 ? 2.5 : 1.5);
    }

    // N marker
    g.fillStyle(0xff6644, 0.8);
    g.fillCircle(cx, cy - 24, 3);

    // needle — points toward office
    const angle = Math.atan2(doorDy, doorDx);
    const needleLen = 20;
    const nx = cx + Math.cos(angle) * needleLen;
    const ny = cy + Math.sin(angle) * needleLen;

    // needle shadow
    g.lineStyle(4, 0x000000, 0.3);
    g.lineBetween(cx + 1, cy + 1, nx + 1, ny + 1);

    // needle — two-tone
    g.lineStyle(3, 0x4a9cd8, 1);
    g.lineBetween(cx, cy, nx, ny);

    // needle tip
    g.fillStyle(0x6abce8, 1);
    g.fillCircle(nx, ny, 4);

    // center pin
    g.fillStyle(0xaaaaaa, 1);
    g.fillCircle(cx, cy, 3);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(cx - 1, cy - 1, 1.5);

    // text below
    this.compassText
      .setPosition(cx, cy + 32)
      .setText(`${distTiles} tiles  |  ${biomeName}\nQ: TELEPORT`);
  }

  // ============================================================
  // Beast Banner
  // ============================================================

  showBeastBanner(name: string, distTiles: number): void {
    this.beastBannerVisible = true;
    this.beastBanner.setVisible(true);
    this.beastBannerText.setVisible(true).setText(`⚠ ${name} — ${distTiles} tiles`);

    const cx = this.scene.scale.width / 2;
    const cy = 50;
    const w = this.beastBannerText.width + 40;
    const h = 32;

    this.beastBanner.clear();
    // glow background
    this.beastBanner.fillStyle(0xff0000, 0.15);
    this.beastBanner.fillRoundedRect(cx - w / 2 - 6, cy - h / 2 - 6, w + 12, h + 12, 8);
    // frame
    this.beastBanner.fillStyle(0x2a0a0a, 0.85);
    this.beastBanner.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 6);
    this.beastBanner.lineStyle(2, 0xff4444, 0.6);
    this.beastBanner.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 6);
    // top accent
    this.beastBanner.fillStyle(0xff4444, 0.3);
    this.beastBanner.fillRoundedRect(cx - w / 2, cy - h / 2, w, 4, 6);

    this.beastBannerText.setPosition(cx, cy);

    // pulse animation
    this.scene.tweens.add({
      targets: [this.beastBanner, this.beastBannerText],
      alpha: { from: 1, to: 0.7 },
      duration: 600,
      yoyo: true,
      repeat: -1,
    });
  }

  hideBeastBanner(): void {
    if (!this.beastBannerVisible) return;
    this.beastBannerVisible = false;
    this.beastBanner.setVisible(false);
    this.beastBannerText.setVisible(false);
    this.scene.tweens.killTweensOf([this.beastBanner, this.beastBannerText]);
  }

  // ============================================================
  // Minimap
  // ============================================================

  updateMinimap(
    visible: boolean,
    playerX: number,
    playerY: number,
    entities: { x: number; y: number; color: number; size?: number }[],
    doorX: number,
    doorY: number,
  ): void {
    this.minimap.setVisible(visible);
    if (!visible) return;

    const g = this.minimap;
    g.clear();

    const size = 100;
    const mx = this.scene.scale.width - size - 20;
    const my = this.scene.scale.height - size - 20;
    const range = 800; // pixels shown on minimap
    const scale = size / range;

    // background
    g.fillStyle(0x000000, 0.6);
    g.fillRoundedRect(mx - 4, my - 4, size + 8, size + 8, 6);
    g.fillStyle(0x0a0a14, 0.8);
    g.fillRoundedRect(mx, my, size, size, 4);
    g.lineStyle(1.5, 0x4a5a7a, 0.4);
    g.strokeRoundedRect(mx, my, size, size, 4);

    // grid lines
    g.lineStyle(1, 0x2a3a5a, 0.2);
    for (let i = 1; i < 4; i++) {
      g.moveTo(mx + (size / 4) * i, my);
      g.lineTo(mx + (size / 4) * i, my + size);
      g.moveTo(mx, my + (size / 4) * i);
      g.lineTo(mx + size, my + (size / 4) * i);
    }
    g.strokePath();

    // door marker
    const ddx = (doorX - playerX) * scale;
    const ddy = (doorY - playerY) * scale;
    const dpx = mx + size / 2 + Phaser.Math.Clamp(ddx, -size / 2, size / 2);
    const dpy = my + size / 2 + Phaser.Math.Clamp(ddy, -size / 2, size / 2);
    g.fillStyle(0x4cb866, 0.9);
    g.fillCircle(dpx, dpy, 4);
    g.fillStyle(0x88ffaa, 0.4);
    g.fillCircle(dpx, dpy, 6);

    // entity markers
    for (const e of entities) {
      const ex = (e.x - playerX) * scale;
      const ey = (e.y - playerY) * scale;
      if (Math.abs(ex) > size / 2 || Math.abs(ey) > size / 2) continue;
      const px = mx + size / 2 + ex;
      const py = my + size / 2 + ey;
      g.fillStyle(e.color, 0.9);
      g.fillCircle(px, py, e.size ?? 2);
    }

    // player center
    g.fillStyle(0xffffff, 1);
    g.fillCircle(mx + size / 2, my + size / 2, 3);
    g.fillStyle(0xffffff, 0.3);
    g.fillCircle(mx + size / 2, my + size / 2, 5);
  }

  // ============================================================
  // Proximity Hints
  // ============================================================

  showHint(key: string, x: number, y: number, text: string): void {
    let container = this.hints.get(key);
    if (!container) {
      const bg = this.scene.add.graphics().setDepth(99);
      const label = this.scene.add
        .text(0, 0, "", {
          fontFamily: "'M PLUS Rounded 1c', sans-serif",
          fontSize: "14px",
          color: "#1d2126",
          stroke: "#f4f6f8",
          strokeThickness: 3,
        })
        .setResolution(3)
        .setOrigin(0.5, 1)
        .setScale(0.8)
        .setDepth(100);

      container = this.scene.add.container(0, 0, [bg, label]).setDepth(99);
      this.hints.set(key, container);
    }

    const bg = container.getAt(0) as Phaser.GameObjects.Graphics;
    const label = container.getAt(1) as Phaser.GameObjects.Text;
    label.setText(text);
    container.setPosition(x, y).setVisible(true);

    // draw tooltip background
    bg.clear();
    const w = label.width * 0.8 + 16;
    const h = 20;
    bg.fillStyle(0x000000, 0.5);
    bg.fillRoundedRect(-w / 2, -h, w, h, 4);
    bg.lineStyle(1, 0xffffff, 0.15);
    bg.strokeRoundedRect(-w / 2, -h, w, h, 4);
  }

  hideHint(key: string): void {
    const container = this.hints.get(key);
    if (container) container.setVisible(false);
  }

  destroy(): void {
    this.healthBar.destroy();
    this.healthBarGlow.destroy();
    this.compass.destroy();
    this.compassText.destroy();
    this.beastBanner.destroy();
    this.beastBannerText.destroy();
    this.minimap.destroy();
    for (const c of this.hints.values()) c.destroy();
    this.hints.clear();
  }
}
