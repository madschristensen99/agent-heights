/**
 * Shared character drawing logic — used by both:
 *   scripts/generate-assets.ts (pre-baked PNG spritesheets via pngjs)
 *   client/src/game/chargen.ts  (runtime sprite generation via ImageData)
 *
 * This is the single source of truth for how characters look.
 */

// ------------------------------------------------------------------- palette

export interface CharPalette {
  skin: string;
  hair: string;
  shirt: string;
  shirtShade: string;
  pants: string;
  tie?: string;
  eyeColor?: string;
  hairStyle: string;
  accessory: string;
  headFeature?: string;
  beard?: string;
  bodyType?: "normal" | "fat";
}

// ------------------------------------------------------------- draw surface

export interface DrawSurface {
  width: number;
  height: number;
  set(x: number, y: number, hex: string): void;
  setAlpha(x: number, y: number, hex: string, a: number): void;
  rect(x: number, y: number, w: number, h: number, hex: string): void;
  fillCircle(cx: number, cy: number, r: number, hex: string): void;
  fillCircleAlpha(cx: number, cy: number, r: number, hex: string, a: number): void;
  fillEllipse(cx: number, cy: number, rx: number, ry: number, hex: string): void;
  line(x0: number, y0: number, x1: number, y1: number, hex: string): void;
  lineThick(x0: number, y0: number, x1: number, y1: number, hex: string, thick: number): void;
  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, hex: string): void;
  fillRoundedRect(x: number, y: number, w: number, h: number, r: number, hex: string): void;
  flipH(x: number, y: number, w: number, h: number): void;
}

// ----------------------------------------------------------------- helpers

export function mix(hex1: string, hex2: string, t: number): string {
  const r = Math.round(parseInt(hex1.slice(1, 3), 16) + (parseInt(hex2.slice(1, 3), 16) - parseInt(hex1.slice(1, 3), 16)) * t);
  const g = Math.round(parseInt(hex1.slice(3, 5), 16) + (parseInt(hex2.slice(3, 5), 16) - parseInt(hex1.slice(3, 5), 16)) * t);
  const b = Math.round(parseInt(hex1.slice(5, 7), 16) + (parseInt(hex2.slice(5, 7), 16) - parseInt(hex1.slice(5, 7), 16)) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ------------------------------------------------------------- constants

export const CW = 64;
export const CH = 96;
export const SHOE = "#3a3548";

export type Dir = "down" | "left" | "right" | "up";
export const DIRS: Dir[] = ["down", "left", "right", "up"];

// ------------------------------------------------------------- draw char

export function drawChar(s: DrawSurface, ox: number, oy: number, pal: CharPalette, dir: Dir, pose: number): void {
  const mirror = dir === "left";
  const d: Dir = mirror ? "right" : dir;
  const isFat = pal.bodyType === "fat";

  const isIdle = pose === 6;
  const isBlink = pose === 7;
  const stepping = pose === 1 || pose === 3 || pose === 5;
  const bodyBob = isIdle ? -1 : (stepping ? 1 : 0);
  const headBob = isIdle ? -1 : (stepping ? 2 : (pose === 2 || pose === 4 ? 1 : 0));
  const headSway = pose === 1 ? -1 : pose === 3 ? 1 : pose === 4 ? -1 : 0;
  const armSwingL = pose === 1 ? -1 : pose === 3 ? 1 : pose === 4 ? -1 : 0;
  const armSwingR = pose === 1 ? 1 : pose === 3 ? -1 : pose === 4 ? 1 : 0;
  const armSwing = pose === 1 ? 2 : pose === 3 ? -2 : pose === 4 ? 2 : 0;
  const hairBounce = stepping ? 1 : 0;
  const breathing = isIdle;
  const eyesClosed = isBlink;
  const eyeColor = pal.eyeColor ?? "#2a2040";

  // Shading tones
  const skinLi = mix(pal.skin, "#ffffff", 0.30);
  const skinMid = mix(pal.skin, "#ffffff", 0.10);
  const skinDk = mix(pal.skin, "#000000", 0.20);
  const skinRim = mix(pal.skin, "#ffffff", 0.45);
  const skinOutline = mix(pal.skin, "#000000", 0.55);
  const hairLi = mix(pal.hair, "#ffffff", 0.28);
  const hairMid = mix(pal.hair, "#ffffff", 0.10);
  const hairDk = mix(pal.hair, "#000000", 0.25);
  const hairRim = mix(pal.hair, "#ffffff", 0.50);
  const shirtLi = mix(pal.shirt, "#ffffff", 0.22);
  const shirtMid = mix(pal.shirt, "#ffffff", 0.08);
  const shirtDk = pal.shirtShade;
  const pantsLi = mix(pal.pants, "#ffffff", 0.15);
  const pantsMid = mix(pal.pants, "#ffffff", 0.05);
  const pantsDk = mix(pal.pants, "#000000", 0.22);
  const blush = mix(pal.skin, "#ff88aa", 0.35);
  const shoeLi = mix(SHOE, "#ffffff", 0.18);
  const shoeMid = mix(SHOE, "#ffffff", 0.06);
  const shoeDk = mix(SHOE, "#000000", 0.25);

  // Offset helpers
  const hx = (x: number) => ox + x + headSway;
  const hy = (y: number) => oy + y + headBob;
  const bx = (x: number) => ox + x;
  const by = (y: number) => oy + y + bodyBob;
  const lx = (x: number) => ox + x;
  const ly = (y: number) => oy + y;

  // Shape helpers — dynamic outline based on fill color
  const el = (cx: number, cy: number, rx: number, ry: number, c: string) => s.fillEllipse(cx, cy, rx, ry, c);
  const ci = (cx: number, cy: number, r: number, c: string) => s.fillCircle(cx, cy, r, c);
  const rr = (x: number, y: number, w: number, h: number, r: number, c: string) => s.fillRoundedRect(x, y, w, h, r, c);
  const ciO = (cx: number, cy: number, r: number, fill: string) => {
    s.fillCircle(cx, cy, r + 1, mix(fill, "#000000", 0.55));
    s.fillCircle(cx, cy, r, fill);
  };
  const elO = (cx: number, cy: number, rx: number, ry: number, fill: string) => {
    s.fillEllipse(cx, cy, rx + 1, ry + 1, mix(fill, "#000000", 0.55));
    s.fillEllipse(cx, cy, rx, ry, fill);
  };
  const rrO = (x: number, y: number, w: number, h: number, r: number, fill: string) => {
    s.fillRoundedRect(x - 1, y - 1, w + 2, h + 2, r + 1, mix(fill, "#000000", 0.55));
    s.fillRoundedRect(x, y, w, h, r, fill);
  };

  // ===== HAIR STYLES =====
  const drawHairDown = () => {
    const hs = pal.hairStyle;
    const hb = hairBounce;
    if (hs === "bald") {
      ci(hx(32), hy(18), 16, pal.skin);
      el(hx(32), hy(15), 10, 2, skinDk);
    } else if (hs === "balding") {
      ci(hx(32), hy(18), 16, pal.skin);
      el(hx(17), hy(18), 4, 5 + hb, pal.hair); el(hx(47), hy(18), 4, 5 + hb, pal.hair);
      el(hx(32), hy(14), 6, 3, pal.hair);
      s.set(hx(27), hy(15), pal.skin); s.set(hx(37), hy(15), pal.skin);
      el(hx(32), hy(16), 4, 1, hairDk);
      el(hx(28), hy(12), 3, 2, hairLi); el(hx(36), hy(12), 3, 2, hairMid);
    } else if (hs === "spiky") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      for (let i = -2; i <= 2; i++) { const sx = hx(32 + i * 6); s.set(sx, hy(4 + Math.abs(i) * 2), pal.hair); s.set(sx + 1, hy(5 + Math.abs(i) * 2), pal.hair); s.set(sx - 1, hy(6 + Math.abs(i) * 2), pal.hair); }
      el(hx(17), hy(18), 4, 7 + hb, pal.hair); el(hx(47), hy(18), 4, 7 + hb, pal.hair);
      s.set(hx(24), hy(14), pal.hair); s.set(hx(30), hy(13), pal.hair); s.set(hx(34), hy(13), pal.hair); s.set(hx(40), hy(14), pal.hair);
      el(hx(28), hy(8), 6, 3, hairLi); el(hx(34), hy(10), 7, 3, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "long") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      el(hx(14), hy(22), 5, 16 + hb, pal.hair); el(hx(50), hy(22), 5, 16 + hb, pal.hair);
      rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(26), hy(10), 4, 2, hairRim); el(hx(34), hy(11), 8, 4, hairMid);
      el(hx(43), hy(16), 4, 7, hairDk); el(hx(14), hy(28), 3, 8, hairDk); el(hx(50), hy(28), 3, 8, hairDk);
    } else if (hs === "buzz") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      el(hx(17), hy(18), 4, 5, pal.hair); el(hx(48), hy(18), 4, 5, pal.hair);
      el(hx(28), hy(12), 6, 2, hairLi); el(hx(34), hy(13), 6, 2, hairMid); el(hx(43), hy(16), 3, 5, hairDk);
    } else if (hs === "ponytail") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      el(hx(17), hy(18), 4, 7, pal.hair);
      el(hx(50), hy(15), 3, 8 + hb, pal.hair); s.set(hx(52), hy(17 + hb), pal.hair); s.set(hx(53), hy(20 + hb), pal.hair);
      rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(6), 7, 3, hairLi); el(hx(34), hy(8), 8, 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
      el(hx(51), hy(14), 2, 3, hairLi);
    } else if (hs === "swept") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      el(hx(17), hy(18), 4, 7 + hb, pal.hair); el(hx(47), hy(18), 4, 7 + hb, pal.hair);
      el(hx(36), hy(15), 10, 3, pal.hair);
      rr(hx(25), hy(16), 20, 2, 3, pal.hair);
      s.set(hx(24), hy(15), pal.skin); s.set(hx(25), hy(14), pal.skin);
      s.set(hx(22), hy(13), pal.hair); s.set(hx(23), hy(12), pal.hair);
      el(hx(26), hy(9), 6, 3, hairLi); el(hx(32), hy(11), 7, 3, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "curly") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      ci(hx(22), hy(8), 4, pal.hair); ci(hx(32), hy(6), 5, pal.hair); ci(hx(42), hy(8), 4, pal.hair);
      el(hx(17), hy(19), 4, 8 + hb, pal.hair); el(hx(47), hy(19), 4, 8 + hb, pal.hair);
      ci(hx(25), hy(15), 3, pal.hair); ci(hx(39), hy(15), 3, pal.hair);
      ci(hx(26), hy(8), 2, hairLi); ci(hx(34), hy(7), 2, hairRim); el(hx(38), hy(10), 4, 3, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "bun") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      ci(hx(32), hy(4), 5, pal.hair); ci(hx(32), hy(4), 3, hairMid);
      el(hx(17), hy(18), 4, 7 + hb, pal.hair); el(hx(47), hy(18), 4, 7 + hb, pal.hair);
      rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(34), hy(11), 8, 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
      ci(hx(30), hy(3), 2, hairRim);
    } else if (hs === "mohawk") {
      s.rect(hx(30), hy(2), 4, 14, pal.hair);
      s.set(hx(29), hy(0), pal.hair); s.set(hx(30), hy(0), pal.hair); s.set(hx(31), hy(0), pal.hair); s.set(hx(32), hy(0), pal.hair); s.set(hx(33), hy(0), pal.hair);
      s.set(hx(28), hy(4), pal.hair); s.set(hx(34), hy(4), pal.hair);
      s.set(hx(30), hy(4), hairLi); s.set(hx(31), hy(6), hairMid);
    } else if (hs === "afro") {
      el(hx(32), hy(13), 17, 13, pal.hair);
      ci(hx(18), hy(10), 4, pal.hair); ci(hx(46), hy(10), 4, pal.hair);
      ci(hx(22), hy(5), 4, pal.hair); ci(hx(42), hy(5), 4, pal.hair);
      ci(hx(32), hy(2), 4, pal.hair);
      ci(hx(15), hy(16), 4, pal.hair); ci(hx(49), hy(16), 4, pal.hair);
      el(hx(17), hy(18), 4, 7 + hb, pal.hair); el(hx(47), hy(18), 4, 7 + hb, pal.hair);
      ci(hx(26), hy(8), 3, hairLi); ci(hx(36), hy(10), 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "braids") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      el(hx(14), hy(22), 4, 18 + hb, pal.hair); el(hx(50), hy(22), 4, 18 + hb, pal.hair);
      for (let i = 0; i < 4; i++) { s.set(hx(14), hy(24 + i * 4), hairDk); s.set(hx(50), hy(24 + i * 4), hairDk); }
      rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(34), hy(11), 8, 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "pigtails") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      ci(hx(15), hy(20), 4, pal.hair); ci(hx(49), hy(20), 4, pal.hair);
      ci(hx(15), hy(20), 2, hairMid); ci(hx(49), hy(20), 2, hairMid);
      el(hx(17), hy(18), 4, 7 + hb, pal.hair); el(hx(47), hy(18), 4, 7 + hb, pal.hair);
      rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(34), hy(11), 8, 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "bob") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      el(hx(14), hy(22), 5, 12 + hb, pal.hair); el(hx(50), hy(22), 5, 12 + hb, pal.hair);
      rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(34), hy(11), 8, 4, hairMid);
      el(hx(43), hy(16), 4, 7, hairDk); el(hx(14), hy(28), 3, 6, hairDk); el(hx(50), hy(28), 3, 6, hairDk);
    } else if (hs === "dreadlocks") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      for (const dlx of [14, 20, 26, 38, 44, 50]) { el(hx(dlx), hy(20), 3, 16 + hb, pal.hair); }
      for (const dlx of [14, 20, 26, 38, 44, 50]) { for (let i = 0; i < 3; i++) s.set(hx(dlx), hy(23 + i * 5), hairDk); }
      rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(34), hy(11), 8, 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else {
      el(hx(32), hy(9), 16, 9, pal.hair);
      el(hx(17), hy(18), 4, 7 + hb, pal.hair); el(hx(47), hy(18), 4, 7 + hb, pal.hair);
      rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(26), hy(10), 4, 2, hairRim); el(hx(34), hy(11), 8, 4, hairMid);
      el(hx(43), hy(16), 4, 7, hairDk); s.set(hx(44), hy(14), hairDk); s.set(hx(45), hy(18), hairDk);
    }
  };

  const drawHairUp = () => {
    const hs = pal.hairStyle;
    const hb = hairBounce;
    if (hs === "bald") {
      ci(hx(32), hy(18), 16, pal.skin);
      el(hx(32), hy(18), 14, 3, skinDk);
    } else if (hs === "balding") {
      ci(hx(32), hy(18), 16, pal.skin);
      el(hx(18), hy(20), 4, 8, pal.hair); el(hx(46), hy(20), 4, 8, pal.hair);
      el(hx(32), hy(27), 10, 5, pal.hair);
      el(hx(32), hy(16), 6, 2, pal.hair);
      el(hx(28), hy(14), 3, 2, hairLi); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "spiky") {
      el(hx(32), hy(17), 16, 14, pal.hair);
      for (let i = -2; i <= 2; i++) { const sx = hx(32 + i * 6); s.set(sx, hy(8 + Math.abs(i) * 2), pal.hair); s.set(sx + 1, hy(9 + Math.abs(i) * 2), pal.hair); }
      el(hx(32), hy(27), 14, 7, pal.hair);
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "long") {
      el(hx(32), hy(17), 16, 14, pal.hair); el(hx(32), hy(27), 14, 7, pal.hair);
      el(hx(18), hy(24), 5, 16 + hb, pal.hair); el(hx(46), hy(24), 5, 16 + hb, pal.hair);
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
      el(hx(18), hy(30), 3, 8, hairDk); el(hx(46), hy(30), 3, 8, hairDk);
    } else if (hs === "buzz") {
      el(hx(32), hy(18), 15, 10, pal.hair); el(hx(32), hy(27), 14, 5, pal.hair);
      el(hx(28), hy(13), 6, 2, hairLi); el(hx(34), hy(14), 6, 2, hairMid); el(hx(40), hy(20), 4, 7, hairDk);
    } else if (hs === "ponytail") {
      el(hx(32), hy(17), 16, 14, pal.hair); el(hx(32), hy(27), 14, 7, pal.hair);
      el(hx(48), hy(20), 4, 10 + hb, pal.hair);
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "swept") {
      el(hx(32), hy(17), 16, 14, pal.hair); el(hx(32), hy(27), 14, 7, pal.hair);
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "curly") {
      el(hx(32), hy(17), 16, 14, pal.hair);
      ci(hx(22), hy(12), 4, pal.hair); ci(hx(32), hy(10), 5, pal.hair); ci(hx(42), hy(12), 4, pal.hair);
      el(hx(32), hy(27), 14, 7, pal.hair);
      ci(hx(26), hy(12), 2, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "bun") {
      el(hx(32), hy(17), 16, 14, pal.hair); ci(hx(32), hy(8), 5, pal.hair); ci(hx(32), hy(8), 3, hairMid);
      el(hx(32), hy(27), 14, 7, pal.hair);
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "mohawk") {
      s.rect(hx(30), hy(6), 4, 22, pal.hair);
      s.set(hx(29), hy(4), pal.hair); s.set(hx(34), hy(4), pal.hair);
      el(hx(32), hy(27), 14, 7, pal.hair);
      s.set(hx(30), hy(8), hairLi); s.set(hx(31), hy(12), hairMid);
    } else if (hs === "afro") {
      el(hx(32), hy(15), 17, 15, pal.hair);
      ci(hx(18), hy(12), 4, pal.hair); ci(hx(46), hy(12), 4, pal.hair);
      ci(hx(22), hy(7), 4, pal.hair); ci(hx(42), hy(7), 4, pal.hair);
      ci(hx(32), hy(4), 4, pal.hair);
      el(hx(32), hy(27), 14, 7, pal.hair);
      ci(hx(26), hy(12), 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "braids") {
      el(hx(32), hy(17), 16, 14, pal.hair); el(hx(32), hy(27), 14, 7, pal.hair);
      el(hx(18), hy(24), 4, 18 + hb, pal.hair); el(hx(46), hy(24), 4, 18 + hb, pal.hair);
      for (let i = 0; i < 4; i++) { s.set(hx(18), hy(26 + i * 4), hairDk); s.set(hx(46), hy(26 + i * 4), hairDk); }
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "pigtails") {
      el(hx(32), hy(17), 16, 14, pal.hair); el(hx(32), hy(27), 14, 7, pal.hair);
      ci(hx(16), hy(22), 4, pal.hair); ci(hx(48), hy(22), 4, pal.hair);
      ci(hx(16), hy(22), 2, hairMid); ci(hx(48), hy(22), 2, hairMid);
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "bob") {
      el(hx(32), hy(17), 16, 14, pal.hair); el(hx(32), hy(27), 14, 7, pal.hair);
      el(hx(18), hy(24), 5, 12 + hb, pal.hair); el(hx(46), hy(24), 5, 12 + hb, pal.hair);
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "dreadlocks") {
      el(hx(32), hy(17), 16, 14, pal.hair); el(hx(32), hy(27), 14, 7, pal.hair);
      for (const dlx of [18, 24, 40, 46]) { el(hx(dlx), hy(24), 3, 16 + hb, pal.hair); }
      for (const dlx of [18, 24, 40, 46]) { for (let i = 0; i < 3; i++) s.set(hx(dlx), hy(27 + i * 5), hairDk); }
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else {
      el(hx(32), hy(17), 16, 14, pal.hair); el(hx(32), hy(27), 14, 7, pal.hair);
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(26), hy(12), 3, 2, hairRim); el(hx(34), hy(13), 8, 4, hairMid);
      el(hx(40), hy(20), 5, 9, hairDk); rr(hx(23), hy(29), 18, 4, 3, hairDk);
      s.set(hx(42), hy(18), hairDk); s.set(hx(43), hy(22), hairDk); s.set(hx(44), hy(25), hairDk);
    }
  };

  const drawHairRight = () => {
    const hs = pal.hairStyle;
    const hb = hairBounce;
    if (hs === "bald") {
      ci(hx(32), hy(18), 16, pal.skin);
      el(hx(32), hy(15), 10, 2, skinDk);
    } else if (hs === "balding") {
      ci(hx(32), hy(18), 16, pal.skin);
      el(hx(19), hy(21), 5, 7 + hb, pal.hair);
      el(hx(32), hy(15), 6, 2, pal.hair);
      s.set(hx(28), hy(16), pal.skin);
      el(hx(26), hy(10), 3, 2, hairLi); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "spiky") {
      el(hx(33), hy(9), 18, 9, pal.hair);
      for (let i = -2; i <= 2; i++) { const sx = hx(30 + i * 5); s.set(sx, hy(4 + Math.abs(i) * 2), pal.hair); s.set(sx + 1, hy(5 + Math.abs(i) * 2), pal.hair); }
      el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(8), 5, 2, hairLi); el(hx(32), hy(10), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "long") {
      el(hx(33), hy(9), 18, 9, pal.hair);
      el(hx(17), hy(21), 5, 14 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
      el(hx(17), hy(28), 3, 8, hairDk);
    } else if (hs === "buzz") {
      el(hx(33), hy(9), 18, 9, pal.hair); el(hx(20), hy(21), 4, 7, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair);
      el(hx(26), hy(11), 5, 2, hairLi); el(hx(32), hy(13), 5, 2, hairMid); el(hx(21), hy(19), 3, 7, hairDk);
    } else if (hs === "ponytail") {
      el(hx(33), hy(9), 18, 9, pal.hair);
      el(hx(16), hy(18), 4, 10 + hb, pal.hair); s.set(hx(15), hy(20 + hb), pal.hair); s.set(hx(15), hy(22 + hb), pal.hair);
      el(hx(19), hy(21), 5, 9, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(5), 5, 2, hairLi); el(hx(32), hy(8), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "swept") {
      el(hx(33), hy(9), 18, 9, pal.hair); el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(36), hy(16), 10, 2, pal.hair); rr(hx(27), hy(16), 18, 2, 3, pal.hair);
      s.set(hx(26), hy(15), pal.skin);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "curly") {
      el(hx(33), hy(9), 18, 9, pal.hair);
      ci(hx(24), hy(8), 4, pal.hair); ci(hx(32), hy(6), 5, pal.hair); ci(hx(38), hy(8), 4, pal.hair);
      el(hx(18), hy(21), 5, 10 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); ci(hx(28), hy(16), 3, pal.hair);
      ci(hx(26), hy(8), 2, hairLi); el(hx(32), hy(10), 5, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "bun") {
      el(hx(33), hy(9), 18, 9, pal.hair); ci(hx(28), hy(5), 5, pal.hair); ci(hx(28), hy(5), 3, hairMid);
      el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "mohawk") {
      s.rect(hx(30), hy(2), 4, 18, pal.hair);
      s.set(hx(29), hy(0), pal.hair); s.set(hx(30), hy(0), pal.hair); s.set(hx(31), hy(0), pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair);
      s.set(hx(30), hy(6), hairLi); s.set(hx(31), hy(10), hairMid);
    } else if (hs === "afro") {
      el(hx(32), hy(13), 15, 13, pal.hair);
      ci(hx(20), hy(10), 4, pal.hair); ci(hx(44), hy(10), 4, pal.hair);
      ci(hx(24), hy(5), 4, pal.hair); ci(hx(40), hy(5), 4, pal.hair);
      ci(hx(32), hy(2), 4, pal.hair);
      el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair);
      ci(hx(28), hy(8), 3, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "braids") {
      el(hx(33), hy(9), 18, 9, pal.hair);
      el(hx(17), hy(21), 4, 18 + hb, pal.hair);
      for (let i = 0; i < 4; i++) s.set(hx(17), hy(23 + i * 4), hairDk);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "pigtails") {
      el(hx(33), hy(9), 18, 9, pal.hair);
      ci(hx(16), hy(20), 4, pal.hair); ci(hx(16), hy(20), 2, hairMid);
      el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "bob") {
      el(hx(33), hy(9), 18, 9, pal.hair);
      el(hx(17), hy(21), 5, 12 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
      el(hx(17), hy(28), 3, 6, hairDk);
    } else if (hs === "dreadlocks") {
      el(hx(33), hy(9), 18, 9, pal.hair);
      for (const dlx of [17, 23, 29]) { el(hx(dlx), hy(20), 3, 16 + hb, pal.hair); }
      for (const dlx of [17, 23, 29]) { for (let i = 0; i < 3; i++) s.set(hx(dlx), hy(23 + i * 5), hairDk); }
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else {
      el(hx(33), hy(9), 18, 9, pal.hair); el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(24), hy(10), 3, 2, hairRim); el(hx(32), hy(11), 6, 3, hairMid);
      el(hx(21), hy(19), 4, 9, hairDk); s.set(hx(22), hy(17), hairDk); s.set(hx(23), hy(15), hairDk);
    }
  };

  // ===== ACCESSORIES =====
  const drawAccessory = (dir2: Dir) => {
    const ac = pal.accessory;
    if (ac === "glasses") {
      const gc = mix(pal.shirt, "#000000", 0.3);
      if (dir2 === "down") {
        s.rect(hx(24), hy(21), 6, 1, gc); s.rect(hx(24), hy(25), 6, 1, gc); s.rect(hx(24), hy(21), 1, 5, gc); s.rect(hx(29), hy(21), 1, 5, gc);
        s.rect(hx(33), hy(21), 6, 1, gc); s.rect(hx(33), hy(25), 6, 1, gc); s.rect(hx(33), hy(21), 1, 5, gc); s.rect(hx(38), hy(21), 1, 5, gc);
        s.rect(hx(30), hy(23), 3, 1, gc);
      } else if (dir2 === "right") {
        s.rect(hx(34), hy(21), 6, 1, gc); s.rect(hx(34), hy(25), 6, 1, gc); s.rect(hx(34), hy(21), 1, 5, gc); s.rect(hx(39), hy(21), 1, 5, gc);
      }
    } else if (ac === "headband") {
      const hc = pal.shirt;
      if (dir2 === "down") { rr(hx(19), hy(13), 26, 3, 1, hc); s.set(hx(20), hy(12), hc); s.set(hx(44), hy(12), hc); }
      else if (dir2 === "up") { rr(hx(18), hy(13), 28, 3, 1, hc); }
      else if (dir2 === "right") { rr(hx(22), hy(13), 22, 3, 1, hc); }
    } else if (ac === "earrings") {
      const ec = "#ffd700";
      if (dir2 === "down") { s.set(hx(18), hy(28), ec); s.set(hx(46), hy(28), ec); }
      else if (dir2 === "right") { s.set(hx(28), hy(27), ec); }
    } else if (ac === "cap") {
      const cc = mix(pal.shirt, "#000000", 0.1);
      const ccLi = mix(cc, "#ffffff", 0.2);
      const ccDk = mix(cc, "#000000", 0.25);
      if (dir2 === "down") {
        rr(hx(15), hy(0), 34, 14, 5, cc);
        s.rect(hx(15), hy(13), 34, 1, ccDk);
        s.rect(hx(34), hy(13), 20, 3, cc);
        s.rect(hx(34), hy(15), 20, 1, ccDk);
        s.set(hx(32), hy(0), ccLi);
        s.set(hx(22), hy(3), ccLi);
        s.set(hx(23), hy(2), mix(cc, "#fff", 0.1));
      } else if (dir2 === "up") {
        rr(hx(15), hy(0), 34, 14, 5, cc);
        s.rect(hx(15), hy(13), 34, 1, ccDk);
        s.set(hx(32), hy(0), ccLi);
      } else if (dir2 === "right") {
        rr(hx(19), hy(0), 28, 14, 5, cc);
        s.rect(hx(19), hy(13), 28, 1, ccDk);
        s.rect(hx(38), hy(13), 16, 3, cc);
        s.rect(hx(38), hy(15), 16, 1, ccDk);
        s.set(hx(26), hy(0), ccLi);
        s.set(hx(25), hy(3), mix(cc, "#fff", 0.15));
      }
    } else if (ac === "beanie") {
      const bc = mix(pal.shirt, "#000000", 0.05);
      if (dir2 === "down") {
        rr(hx(16), hy(6), 32, 10, 4, bc);
        s.rect(hx(16), hy(13), 32, 2, mix(bc, "#000", 0.2));
        s.set(hx(32), hy(4), mix(bc, "#fff", 0.3));
        s.set(hx(32), hy(5), mix(bc, "#fff", 0.15));
      } else if (dir2 === "up") {
        rr(hx(16), hy(6), 32, 10, 4, bc);
        s.rect(hx(16), hy(13), 32, 2, mix(bc, "#000", 0.2));
      } else if (dir2 === "right") {
        rr(hx(20), hy(6), 28, 10, 4, bc);
        s.rect(hx(20), hy(13), 28, 2, mix(bc, "#000", 0.2));
        s.set(hx(28), hy(4), mix(bc, "#fff", 0.3));
      }
    } else if (ac === "headphones") {
      const hc = "#3a3a44";
      const hcLi = "#5a5a64";
      if (dir2 === "down") {
        s.rect(hx(18), hy(6), 28, 2, hc);
        ci(hx(16), hy(20), 3, hc); ci(hx(16), hy(20), 2, hcLi);
        ci(hx(48), hy(20), 3, hc); ci(hx(48), hy(20), 2, hcLi);
      } else if (dir2 === "up") {
        s.rect(hx(18), hy(6), 28, 2, hc);
        ci(hx(16), hy(20), 3, hc); ci(hx(48), hy(20), 3, hc);
      } else if (dir2 === "right") {
        s.rect(hx(22), hy(6), 22, 2, hc);
        ci(hx(16), hy(20), 3, hc); ci(hx(16), hy(20), 2, hcLi);
      }
    }
  };

  // ===== HEAD FEATURES (ears, horns, antennae) =====
  const drawHeadFeature = (dir2: Dir) => {
    const hf = pal.headFeature ?? "none";
    if (hf === "none") return;
    if (hf === "cat ears") {
      const inner = mix(pal.hair, "#ffaaaa", 0.4);
      if (dir2 === "down") {
        s.fillTriangle(hx(22), hy(10), hx(17), hy(2), hx(27), hy(5), pal.hair);
        s.fillTriangle(hx(23), hy(9), hx(20), hy(5), hx(26), hy(6), inner);
        s.fillTriangle(hx(42), hy(10), hx(37), hy(5), hx(47), hy(2), pal.hair);
        s.fillTriangle(hx(41), hy(9), hx(38), hy(6), hx(44), hy(5), inner);
      } else if (dir2 === "up") {
        s.fillTriangle(hx(22), hy(10), hx(17), hy(2), hx(27), hy(5), pal.hair);
        s.fillTriangle(hx(42), hy(10), hx(37), hy(5), hx(47), hy(2), pal.hair);
      } else if (dir2 === "right") {
        s.fillTriangle(hx(42), hy(10), hx(37), hy(5), hx(47), hy(2), pal.hair);
        s.fillTriangle(hx(41), hy(9), hx(38), hy(6), hx(44), hy(5), inner);
      }
    } else if (hf === "horns") {
      if (dir2 === "down") {
        s.fillTriangle(hx(20), hy(10), hx(16), hy(0), hx(24), hy(6), "#6a5a4a");
        s.fillTriangle(hx(21), hy(9), hx(18), hy(3), hx(23), hy(7), "#8a7a6a");
        s.fillTriangle(hx(44), hy(10), hx(40), hy(6), hx(48), hy(0), "#6a5a4a");
        s.fillTriangle(hx(43), hy(9), hx(41), hy(7), hx(46), hy(3), "#8a7a6a");
      } else if (dir2 === "up") {
        s.fillTriangle(hx(20), hy(10), hx(16), hy(0), hx(24), hy(6), "#6a5a4a");
        s.fillTriangle(hx(44), hy(10), hx(40), hy(6), hx(48), hy(0), "#6a5a4a");
      } else if (dir2 === "right") {
        s.fillTriangle(hx(44), hy(10), hx(40), hy(6), hx(48), hy(0), "#6a5a4a");
        s.fillTriangle(hx(43), hy(9), hx(41), hy(7), hx(46), hy(3), "#8a7a6a");
      }
    } else if (hf === "antennae") {
      const tip = pal.eyeColor ?? "#00e5ff";
      if (dir2 === "down") {
        s.line(hx(27), hy(8), hx(24), hy(0), pal.hair);
        s.set(hx(24), hy(0), tip); s.set(hx(23), hy(1), tip);
        s.line(hx(37), hy(8), hx(40), hy(0), pal.hair);
        s.set(hx(40), hy(0), tip); s.set(hx(41), hy(1), tip);
      } else if (dir2 === "up") {
        s.line(hx(27), hy(8), hx(24), hy(0), pal.hair);
        s.set(hx(24), hy(0), tip);
        s.line(hx(37), hy(8), hx(40), hy(0), pal.hair);
        s.set(hx(40), hy(0), tip);
      } else if (dir2 === "right") {
        s.line(hx(37), hy(8), hx(40), hy(0), pal.hair);
        s.set(hx(40), hy(0), tip); s.set(hx(41), hy(1), tip);
      }
    } else if (hf === "elf ears") {
      if (dir2 === "down") {
        s.fillTriangle(hx(15), hy(24), hx(11), hy(18), hx(17), hy(26), pal.skin);
        s.set(hx(14), hy(22), skinDk);
        s.fillTriangle(hx(49), hy(24), hx(53), hy(18), hx(47), hy(26), pal.skin);
        s.set(hx(50), hy(22), skinDk);
      } else if (dir2 === "up") {
        s.fillTriangle(hx(15), hy(24), hx(11), hy(18), hx(17), hy(26), pal.hair);
        s.fillTriangle(hx(49), hy(24), hx(53), hy(18), hx(47), hy(26), pal.hair);
      } else if (dir2 === "right") {
        s.fillTriangle(hx(15), hy(24), hx(11), hy(18), hx(17), hy(26), pal.skin);
        s.set(hx(14), hy(22), skinDk);
      }
    }
  };

  // ===== BEARD / FACIAL HAIR =====
  const drawBeard = (dir2: Dir) => {
    const bd = pal.beard ?? "none";
    if (bd === "none") return;
    if (dir2 === "down") {
      if (bd === "stubble") {
        for (let i = 0; i < 8; i++) {
          const sx = 24 + (i * 2);
          s.set(hx(sx), hy(30 + (i % 2)), hairDk);
          s.set(hx(sx + 1), hy(31 + (i % 2)), hairDk);
        }
      } else if (bd === "mustache") {
        s.rect(hx(27), hy(27), 10, 2, pal.hair);
        s.set(hx(27), hy(28), hairDk); s.set(hx(36), hy(28), hairDk);
      } else if (bd === "goatee") {
        el(hx(32), hy(32), 4, 4, pal.hair);
        s.set(hx(30), hy(31), hairDk); s.set(hx(34), hy(31), hairDk);
        s.set(hx(32), hy(35), hairDk);
      } else if (bd === "full_beard") {
        el(hx(32), hy(31), 12, 6, pal.hair);
        el(hx(24), hy(29), 4, 5, pal.hair); el(hx(40), hy(29), 4, 5, pal.hair);
        el(hx(32), hy(33), 10, 3, hairDk);
        s.set(hx(26), hy(28), pal.hair); s.set(hx(38), hy(28), pal.hair);
      }
    } else if (dir2 === "right") {
      if (bd === "stubble") {
        for (let i = 0; i < 5; i++) {
          s.set(hx(38 + i), hy(30 + (i % 2)), hairDk);
        }
      } else if (bd === "mustache") {
        s.rect(hx(36), hy(27), 6, 2, pal.hair);
        s.set(hx(36), hy(28), hairDk);
      } else if (bd === "goatee") {
        el(hx(42), hy(32), 4, 4, pal.hair);
        s.set(hx(40), hy(31), hairDk); s.set(hx(44), hy(35), hairDk);
      } else if (bd === "full_beard") {
        el(hx(42), hy(31), 8, 6, pal.hair);
        el(hx(38), hy(29), 4, 5, pal.hair);
        el(hx(42), hy(33), 6, 3, hairDk);
        s.set(hx(40), hy(28), pal.hair);
      }
    }
  };

  // ===== ROUNDED CHIBI (64x96) — polished, dynamic outlines =====

  if (d === "down") {
    // ---- HEAD: round dome with dynamic outline ----
    ciO(hx(32), hy(18), 17, pal.skin);
    el(hx(32), hy(22), 13, 12, pal.skin);
    drawHairDown();
    drawHeadFeature("down");
    s.set(hx(32), hy(19), pal.skin);
    // Face 3-tone
    el(hx(26), hy(24), 3, 5, skinLi);
    el(hx(27), hy(21), 2, 2, skinRim);
    el(hx(38), hy(25), 3, 5, skinMid);
    el(hx(40), hy(24), 3, 6, skinDk);
    // Chin shadow
    el(hx(32), hy(32), 10, 2, skinDk);
    // Eyebrows
    s.set(hx(26), hy(19), hairDk);
    s.set(hx(27), hy(19), hairDk);
    s.set(hx(36), hy(19), hairDk);
    s.set(hx(37), hy(19), hairDk);
    // Eyes — bigger with double sparkle
    if (eyesClosed) {
      rr(hx(26), hy(23), 4, 2, 2, eyeColor);
      rr(hx(34), hy(23), 4, 2, 2, eyeColor);
    } else {
      el(hx(28), hy(23), 2, 5, eyeColor);
      el(hx(36), hy(23), 2, 5, eyeColor);
      s.set(hx(27), hy(21), "#ffffff");
      s.set(hx(35), hy(21), "#ffffff");
      s.set(hx(28), hy(22), mix(eyeColor, "#ffffff", 0.5));
      s.set(hx(36), hy(22), mix(eyeColor, "#ffffff", 0.5));
    }
    // Mouth — tiny smile
    s.set(hx(31), hy(29), skinDk);
    s.set(hx(32), hy(30), skinDk);
    s.set(hx(33), hy(30), skinDk);
    s.set(hx(34), hy(29), skinDk);
    // Blush — soft alpha
    s.fillCircleAlpha(hx(24), hy(27), 3, blush, 0.35);
    s.fillCircleAlpha(hx(40), hy(27), 3, blush, 0.35);
    drawAccessory("down");
    drawBeard("down");

    // ---- NECK ----
    rr(bx(29), by(34), 6, 4, 2, skinDk);
    s.set(bx(29), by(34), skinOutline);
    s.set(bx(34), by(34), skinOutline);
    s.set(bx(30), by(36), skinDk);
    s.set(bx(31), by(36), skinDk);
    s.set(bx(32), by(36), skinDk);
    s.set(bx(33), by(36), skinDk);

    // ---- TORSO with gradient shading ----
    const tw = isFat ? (breathing ? 30 : 28) : (breathing ? 24 : 22);
    const tx = isFat ? (breathing ? 17 : 18) : (breathing ? 20 : 21);
    rr(bx(tx), by(38), tw, 18, 5, pal.shirt);
    // 3-tone shirt
    rr(bx(tx + 2), by(38), tw - 4, 3, 3, shirtLi);
    rr(bx(tx + 4), by(38), tw - 8, 2, 2, shirtMid);
    rr(bx(tx), by(38), 2, 18, 2, shirtLi);
    rr(bx(tx + 3), by(38), 2, 18, 2, shirtMid);
    rr(bx(tx + tw - 2), by(38), 2, 18, 2, shirtDk);
    // Soft top glow
    for (let xx = tx + 2; xx < tx + tw - 2; xx++) s.setAlpha(bx(xx), by(38), mix(pal.shirt, "#fff", 0.3), 0.2);
    // Collar V-neck
    rr(bx(tx + 4), by(38), tw - 8, 2, 1, shirtLi);
    s.set(bx(tx + 5), by(40), shirtDk);
    s.set(bx(tx + tw - 6), by(40), shirtDk);
    if (pal.tie) {
      rr(bx(30), by(40), 4, 7, 2, pal.tie);
      rr(bx(28), by(45), 8, 2, 1, pal.tie);
      rr(bx(30), by(47), 4, 2, 1, pal.tie);
    }
    // Belt line
    s.rect(bx(tx), by(55), tw, 1, pantsDk);
    // Shirt buttons
    s.set(bx(31), by(42), shirtDk);
    s.set(bx(31), by(46), shirtDk);
    s.set(bx(31), by(50), shirtDk);

    // ---- ARMS ----
    const armLX = isFat ? 14 : 17;
    const armRX = isFat ? 48 : 45;
    elO(bx(armLX + armSwingL), by(45), 4, 7, pal.shirt);
    el(bx(armLX - 1 + armSwingL), by(43), 2, 3, shirtLi);
    el(bx(armLX + armSwingL), by(44), 2, 4, shirtMid);
    elO(bx(armRX + armSwingR), by(45), 4, 7, pal.shirt);
    el(bx(armRX + 1 + armSwingR), by(48), 2, 3, shirtDk);
    ciO(bx(armLX + armSwingL), by(53), 3, pal.skin);
    s.set(bx(armLX - 1 + armSwingL), by(52), skinLi);
    ciO(bx(armRX + armSwingR), by(53), 3, pal.skin);
    s.set(bx(armRX + 1 + armSwingR), by(54), skinDk);

    // ---- LEGS & SHOES with soles ----
    if (stepping) {
      const leftUp = pose === 1 || pose === 5;
      const fx = leftUp ? 33 : 23;
      const rx2 = leftUp ? 23 : 33;
      rrO(lx(fx), ly(58), 8, 14, 3, pal.pants);
      rr(lx(fx), ly(58), 2, 14, 2, pantsLi);
      rr(lx(fx + 3), ly(58), 2, 14, 2, pantsMid);
      el(lx(fx + 4), ly(74), 6, 4, SHOE);
      s.set(lx(fx + 2), ly(73), shoeLi);
      s.set(lx(fx + 3), ly(73), shoeMid);
      s.set(lx(fx + 6), ly(76), shoeDk);
      rrO(lx(rx2), ly(60), 8, 10, 3, pal.pants);
      el(lx(rx2 + 4), ly(72), 6, 4, SHOE);
      s.set(lx(rx2 + 2), ly(71), shoeLi);
    } else {
      const legLX = isFat ? 21 : 23;
      const legRX = isFat ? 35 : 33;
      const legW = isFat ? 9 : 8;
      rrO(lx(legLX), ly(58), legW, 14, 3, pal.pants);
      rrO(lx(legRX), ly(58), legW, 14, 3, pal.pants);
      rr(lx(legLX), ly(58), 2, 14, 2, pantsLi);
      rr(lx(legLX) + 3, ly(58), 2, 14, 2, pantsMid);
      rr(lx(legRX), ly(58), 2, 14, 2, pantsLi);
      rr(lx(legRX) + 3, ly(58), 2, 14, 2, pantsMid);
      el(lx(legLX + 4), ly(74), 6, 4, SHOE);
      el(lx(legRX + 4), ly(74), 6, 4, SHOE);
      s.set(lx(legLX + 2), ly(73), shoeLi);
      s.set(lx(legLX + 3), ly(73), shoeMid);
      s.set(lx(legRX + 2), ly(73), shoeLi);
      s.set(lx(legRX + 3), ly(73), shoeMid);
      s.set(lx(legLX + 6), ly(76), shoeDk);
      s.set(lx(legRX + 6), ly(76), shoeDk);
    }

  } else if (d === "up") {
    // ---- HEAD: all hair ----
    ciO(hx(32), hy(18), 17, pal.hair);
    drawHairUp();
    drawHeadFeature("up");
    drawAccessory("up");

    // ---- NECK ----
    rr(bx(29), by(34), 6, 4, 2, skinDk);
    s.set(bx(29), by(34), skinOutline);
    s.set(bx(34), by(34), skinOutline);
    s.set(bx(30), by(36), skinDk);
    s.set(bx(31), by(36), skinDk);
    s.set(bx(32), by(36), skinDk);
    s.set(bx(33), by(36), skinDk);

    // ---- TORSO (back) ----
    const utw = isFat ? 28 : 22;
    const utx = isFat ? 18 : 21;
    rr(bx(utx), by(38), utw, 18, 5, pal.shirt);
    rr(bx(utx + 2), by(38), utw - 4, 3, 3, shirtLi);
    rr(bx(utx + 4), by(38), utw - 8, 2, 2, shirtMid);
    rr(bx(utx), by(38), 2, 18, 2, shirtLi);
    rr(bx(utx + 2), by(38), 2, 18, 2, shirtMid);
    rr(bx(utx + utw - 2), by(38), 2, 18, 2, shirtDk);
    // Soft top glow
    for (let xx = utx + 2; xx < utx + utw - 2; xx++) s.setAlpha(bx(xx), by(38), mix(pal.shirt, "#fff", 0.3), 0.2);
    // Back seam
    s.set(bx(31), by(40), shirtDk);
    s.set(bx(32), by(42), shirtDk);
    s.set(bx(31), by(44), shirtDk);
    // Belt line
    s.rect(bx(utx), by(55), utw, 1, pantsDk);

    // ---- ARMS ----
    const uarmLX = isFat ? 14 : 17;
    const uarmRX = isFat ? 48 : 45;
    elO(bx(uarmLX + armSwingL), by(45), 4, 7, pal.shirt);
    elO(bx(uarmRX + armSwingR), by(45), 4, 7, pal.shirt);
    el(bx(uarmLX - 1 + armSwingL), by(43), 2, 3, shirtLi);
    el(bx(uarmLX + armSwingL), by(44), 2, 4, shirtMid);
    el(bx(uarmRX + 1 + armSwingR), by(48), 2, 3, shirtDk);
    ciO(bx(uarmLX + armSwingL), by(53), 3, pal.skin);
    ciO(bx(uarmRX + armSwingR), by(53), 3, pal.skin);
    s.set(bx(uarmRX + 1 + armSwingR), by(54), skinDk);

    // ---- LEGS & SHOES with soles ----
    if (stepping) {
      const leftUp = pose === 1 || pose === 5;
      const fx = leftUp ? 33 : 23;
      const rx2 = leftUp ? 23 : 33;
      rrO(lx(fx), ly(58), 8, 14, 3, pal.pants);
      rr(lx(fx), ly(58), 2, 14, 2, pantsLi);
      rr(lx(fx + 3), ly(58), 2, 14, 2, pantsMid);
      el(lx(fx + 4), ly(74), 6, 4, SHOE);
      s.set(lx(fx + 2), ly(73), shoeLi);
      s.set(lx(fx + 3), ly(73), shoeMid);
      s.set(lx(fx + 6), ly(76), shoeDk);
      rrO(lx(rx2), ly(60), 8, 10, 3, pal.pants);
      el(lx(rx2 + 4), ly(72), 6, 4, SHOE);
      s.set(lx(rx2 + 2), ly(71), shoeLi);
    } else {
      rrO(lx(23), ly(58), 8, 14, 3, pal.pants);
      rrO(lx(33), ly(58), 8, 14, 3, pal.pants);
      rr(lx(23), ly(58), 2, 14, 2, pantsLi);
      rr(lx(23) + 3, ly(58), 2, 14, 2, pantsMid);
      rr(lx(33), ly(58), 2, 14, 2, pantsLi);
      rr(lx(33) + 3, ly(58), 2, 14, 2, pantsMid);
      el(lx(27), ly(74), 6, 4, SHOE);
      el(lx(37), ly(74), 6, 4, SHOE);
      s.set(lx(25), ly(73), shoeLi);
      s.set(lx(26), ly(73), shoeMid);
      s.set(lx(35), ly(73), shoeLi);
      s.set(lx(36), ly(73), shoeMid);
      s.set(lx(29), ly(76), shoeDk);
      s.set(lx(39), ly(76), shoeDk);
    }

  } else {
    // ---- RIGHT PROFILE ----
    ciO(hx(32), hy(18), 17, pal.skin);
    el(hx(35), hy(24), 11, 9, pal.skin);
    drawHairRight();
    drawHeadFeature("right");
    s.set(hx(32), hy(19), pal.skin);
    // Ear
    s.set(hx(28), hy(24), skinDk);
    s.set(hx(28), hy(25), pal.skin);
    s.set(hx(28), hy(26), skinDk);
    // Face 3-tone
    el(hx(31), hy(24), 3, 4, skinLi);
    el(hx(30), hy(21), 2, 3, skinRim);
    el(hx(38), hy(24), 3, 5, skinMid);
    el(hx(41), hy(26), 2, 4, skinDk);
    // Chin/jaw shadow
    el(hx(36), hy(31), 8, 2, skinDk);
    // Eyebrow
    s.set(hx(37), hy(19), hairDk);
    s.set(hx(38), hy(19), hairDk);
    // Eye — bigger with double sparkle
    if (eyesClosed) {
      rr(hx(36), hy(23), 4, 2, 2, eyeColor);
    } else {
      el(hx(38), hy(23), 2, 5, eyeColor);
      s.set(hx(37), hy(21), "#ffffff");
      s.set(hx(38), hy(22), mix(eyeColor, "#ffffff", 0.5));
    }
    // Nose
    s.set(hx(45), hy(25), skinDk);
    s.set(hx(46), hy(25), skinDk);
    s.set(hx(46), hy(24), skinLi);
    // Mouth
    s.set(hx(40), hy(29), skinDk);
    s.set(hx(41), hy(30), skinDk);
    s.set(hx(42), hy(30), skinDk);
    s.set(hx(43), hy(29), skinDk);
    // Blush — soft alpha
    s.fillCircleAlpha(hx(32), hy(27), 3, blush, 0.35);
    drawAccessory("right");
    drawBeard("right");

    // ---- NECK ----
    rr(bx(29), by(34), 6, 4, 2, skinDk);
    s.set(bx(29), by(34), skinOutline);
    s.set(bx(34), by(34), skinOutline);
    s.set(bx(30), by(36), skinDk);
    s.set(bx(31), by(36), skinDk);
    s.set(bx(32), by(36), skinDk);
    s.set(bx(33), by(36), skinDk);

    // ---- TORSO (profile) ----
    const rtw = isFat ? 22 : 18;
    const rtx = isFat ? 21 : 23;
    rr(bx(rtx), by(38), rtw, 18, 5, pal.shirt);
    rr(bx(rtx + 2), by(38), rtw - 4, 3, 3, shirtLi);
    rr(bx(rtx + 4), by(38), rtw - 8, 2, 2, shirtMid);
    rr(bx(rtx), by(38), 2, 18, 2, shirtLi);
    rr(bx(rtx + 2), by(38), 2, 18, 2, shirtMid);
    rr(bx(rtx + rtw - 2), by(38), 2, 18, 2, shirtDk);
    // Soft top glow
    for (let xx = rtx + 2; xx < rtx + rtw - 2; xx++) s.setAlpha(bx(xx), by(38), mix(pal.shirt, "#fff", 0.3), 0.2);
    // Collar
    s.set(bx(rtx + 2), by(40), shirtDk);
    s.set(bx(rtx + 3), by(41), shirtDk);
    // Belt line
    s.rect(bx(rtx), by(55), rtw, 1, pantsDk);

    // ---- ARM ----
    const rarmX = 35;
    elO(bx(rarmX + armSwing), by(45), 4, 8, pal.shirt);
    el(bx(rarmX - 1 + armSwing), by(43), 2, 3, shirtLi);
    el(bx(rarmX + armSwing), by(44), 2, 4, shirtMid);
    ciO(bx(rarmX + armSwing), by(54), 3, pal.skin);
    s.set(bx(rarmX - 1 + armSwing), by(53), skinLi);
    s.set(bx(rarmX + 1 + armSwing), by(55), skinDk);

    // ---- LEGS (profile) with soles ----
    const rlegW = isFat ? 10 : 8;
    if (stepping) {
      const leftUp = pose === 1 || pose === 5;
      const frontX = leftUp ? 29 : 25;
      const backX = leftUp ? 25 : 29;
      rrO(lx(frontX), ly(58), rlegW, 14, 3, pal.pants);
      rr(lx(frontX), ly(58), 2, 14, 2, pantsLi);
      rr(lx(frontX) + 3, ly(58), 2, 14, 2, pantsMid);
      el(lx(frontX + 4), ly(74), 6, 4, SHOE);
      s.set(lx(frontX + 2), ly(73), shoeLi);
      s.set(lx(frontX + 3), ly(73), shoeMid);
      s.set(lx(frontX + 6), ly(76), shoeDk);
      // Back leg darker
      rrO(lx(backX), ly(60), rlegW, 10, 3, pantsDk);
      el(lx(backX + 4), ly(72), 6, 4, shoeDk);
    } else {
      rrO(lx(25), ly(58), rlegW, 14, 3, pal.pants);
      rrO(lx(33), ly(58), rlegW, 14, 3, pantsDk);
      rr(lx(25), ly(58), 2, 14, 2, pantsLi);
      rr(lx(25) + 3, ly(58), 2, 14, 2, pantsMid);
      el(lx(29), ly(74), 6, 4, SHOE);
      el(lx(37), ly(74), 6, 4, shoeDk);
      s.set(lx(27), ly(73), shoeLi);
      s.set(lx(28), ly(73), shoeMid);
      s.set(lx(31), ly(76), shoeDk);
    }
  }

  if (mirror) s.flipH(ox, oy, CW, CH);
}
