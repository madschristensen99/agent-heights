/**
 * Voxel character model builder — the 3D equivalent of char-draw.ts.
 *
 * Takes the same CharPalette that the 2D system uses and outputs a list of
 * positioned, colored blocks that a Three.js renderer can display.
 *
 * Coordinate system:
 *   x: left(-) to right(+)
 *   y: down(-) to up(+)
 *   z: front(-) to back(+)
 * All units are in "voxel units" — 1 unit = 1 block.
 */

import { type CharPalette, mix, SHOE } from "./char-draw";

export interface VoxelBlock {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  group: VoxelGroup;
}

export type VoxelGroup =
  | "head"
  | "hair"
  | "face"
  | "neck"
  | "torso"
  | "armL"
  | "armR"
  | "handL"
  | "handR"
  | "legL"
  | "legR"
  | "shoeL"
  | "shoeR"
  | "accessory"
  | "headFeature"
  | "beard"
  | "tie";

export interface VoxelModel {
  blocks: VoxelBlock[];
  /** Named pivot points for procedural animation. */
  joints: {
    head: { x: number; y: number; z: number };
    armL: { x: number; y: number; z: number };
    armR: { x: number; y: number; z: number };
    legL: { x: number; y: number; z: number };
    legR: { x: number; y: number; z: number };
    torso: { x: number; y: number; z: number };
  };
}

// ── Body proportions (derived from char-draw.ts pixel layout) ──────────────
// 2D: head r=17 (34px), torso ~22x18, legs 8x14, total height ~80px
// We scale to voxel units where 1 voxel = ~4px of the original sprite.

const HEAD_W = 8;
const HEAD_H = 8;
const HEAD_D = 8;
const NECK_W = 3;
const NECK_H = 2;
const TORSO_W = 6;
const TORSO_H = 5;
const TORSO_D = 4;
const ARM_W = 2;
const ARM_H = 4;
const ARM_D = 2;
const HAND_R = 1; // 1x1x1 cube
const LEG_W = 2;
const LEG_H = 4;
const LEG_D = 2;
const SHOE_W = 3;
const SHOE_H = 1;
const SHOE_D = 4;

// Y positions (bottom-up, y=0 is ground)
const SHOE_Y = 0;
const LEG_Y = SHOE_H;
const TORSO_Y = LEG_Y + LEG_H;
const NECK_Y = TORSO_Y + TORSO_H;
const HEAD_Y = NECK_Y + NECK_H;

// Total height: 1 + 4 + 5 + 2 + 8 = 20 voxel units

export function buildVoxelModel(pal: CharPalette): VoxelModel {
  const blocks: VoxelBlock[] = [];
  const isFat = pal.bodyType === "fat";
  const torsoW = isFat ? TORSO_W + 2 : TORSO_W;

  // Shading tones (reuse the same mix logic as char-draw.ts)
  const skinLi = mix(pal.skin, "#ffffff", 0.30);
  const skinDk = mix(pal.skin, "#000000", 0.20);
  const hairLi = mix(pal.hair, "#ffffff", 0.28);
  const hairDk = mix(pal.hair, "#000000", 0.25);
  const shirtLi = mix(pal.shirt, "#ffffff", 0.22);
  const shirtDk = pal.shirtShade;
  const pantsLi = mix(pal.pants, "#ffffff", 0.15);
  const shoeLi = mix(SHOE, "#ffffff", 0.18);
  const eyeColor = pal.eyeColor ?? "#2a2040";
  const blush = mix(pal.skin, "#ff88aa", 0.35);

  // ── Head ──────────────────────────────────────────────────────────────
  blocks.push({ x: -HEAD_W / 2, y: HEAD_Y, z: -HEAD_D / 2, w: HEAD_W, h: HEAD_H, d: HEAD_D, color: pal.skin, group: "head" });
  // Subtle face shading — lighter front-left, darker right
  blocks.push({ x: -HEAD_W / 2, y: HEAD_Y + 5, z: -HEAD_D / 2, w: 2, h: 2, d: 1, color: skinLi, group: "face" });
  blocks.push({ x: HEAD_W / 2 - 2, y: HEAD_Y + 1, z: -HEAD_D / 2, w: 2, h: 2, d: 1, color: skinDk, group: "face" });

  // Eyes — two small blocks on the front face
  const eyeY = HEAD_Y + 4;
  const eyeZ = -HEAD_D / 2 - 0.1;
  blocks.push({ x: -2.5, y: eyeY, z: eyeZ, w: 1, h: 2, d: 0.2, color: eyeColor, group: "face" });
  blocks.push({ x: 1.5, y: eyeY, z: eyeZ, w: 1, h: 2, d: 0.2, color: eyeColor, group: "face" });
  // Eye sparkles (tiny white dots)
  blocks.push({ x: -2.5, y: eyeY + 1, z: eyeZ - 0.05, w: 0.4, h: 0.4, d: 0.1, color: "#ffffff", group: "face" });
  blocks.push({ x: 1.5, y: eyeY + 1, z: eyeZ - 0.05, w: 0.4, h: 0.4, d: 0.1, color: "#ffffff", group: "face" });

  // Blush — semi-transparent effect via lighter color
  blocks.push({ x: -HEAD_W / 2, y: HEAD_Y + 3, z: eyeZ, w: 1.5, h: 1.5, d: 0.1, color: blush, group: "face" });
  blocks.push({ x: HEAD_W / 2 - 1.5, y: HEAD_Y + 3, z: eyeZ, w: 1.5, h: 1.5, d: 0.1, color: blush, group: "face" });

  // Mouth — tiny dark block
  blocks.push({ x: -0.5, y: HEAD_Y + 1, z: eyeZ, w: 1, h: 0.5, d: 0.1, color: skinDk, group: "face" });

  // ── Hair ──────────────────────────────────────────────────────────────
  buildHair(blocks, pal, hairLi, hairDk);

  // ── Neck ──────────────────────────────────────────────────────────────
  blocks.push({ x: -NECK_W / 2, y: NECK_Y, z: -NECK_W / 2, w: NECK_W, h: NECK_H, d: NECK_W, color: skinDk, group: "neck" });

  // ── Torso ─────────────────────────────────────────────────────────────
  const torsoX = -torsoW / 2;
  const torsoZ = -TORSO_D / 2;
  blocks.push({ x: torsoX, y: TORSO_Y, z: torsoZ, w: torsoW, h: TORSO_H, d: TORSO_D, color: pal.shirt, group: "torso" });
  // Shirt shading
  blocks.push({ x: torsoX, y: TORSO_Y + TORSO_H - 1, z: torsoZ, w: torsoW, h: 1, d: TORSO_D, color: shirtLi, group: "torso" });
  blocks.push({ x: torsoX + torsoW - 1, y: TORSO_Y, z: torsoZ, w: 1, h: TORSO_H, d: TORSO_D, color: shirtDk, group: "torso" });

  // Tie
  if (pal.tie) {
    blocks.push({ x: -0.5, y: TORSO_Y + 1, z: torsoZ - 0.1, w: 1, h: 3, d: 0.2, color: pal.tie, group: "tie" });
    blocks.push({ x: -1, y: TORSO_Y, z: torsoZ - 0.1, w: 2, h: 1, d: 0.2, color: pal.tie, group: "tie" });
  }

  // ── Arms ──────────────────────────────────────────────────────────────
  const armOffsetX = torsoW / 2;
  // Left arm
  blocks.push({ x: -(armOffsetX + ARM_W), y: TORSO_Y + 1, z: torsoZ, w: ARM_W, h: ARM_H, d: ARM_D, color: pal.shirt, group: "armL" });
  blocks.push({ x: -(armOffsetX + ARM_W), y: TORSO_Y + 1, z: torsoZ, w: 1, h: ARM_H, d: ARM_D, color: shirtLi, group: "armL" });
  blocks.push({ x: -(armOffsetX + ARM_W), y: TORSO_Y + 1 + ARM_H, z: torsoZ, w: HAND_R, h: HAND_R, d: HAND_R, color: pal.skin, group: "handL" });
  // Right arm
  blocks.push({ x: armOffsetX, y: TORSO_Y + 1, z: torsoZ, w: ARM_W, h: ARM_H, d: ARM_D, color: pal.shirt, group: "armR" });
  blocks.push({ x: armOffsetX + ARM_W - 1, y: TORSO_Y + 1, z: torsoZ, w: 1, h: ARM_H, d: ARM_D, color: shirtDk, group: "armR" });
  blocks.push({ x: armOffsetX + ARM_W - 1, y: TORSO_Y + 1 + ARM_H, z: torsoZ, w: HAND_R, h: HAND_R, d: HAND_R, color: pal.skin, group: "handR" });

  // ── Legs ──────────────────────────────────────────────────────────────
  const legOffsetX = isFat ? 2 : 1.5;
  // Left leg
  blocks.push({ x: -(legOffsetX + LEG_W), y: LEG_Y, z: -LEG_W, w: LEG_W, h: LEG_H, d: LEG_D, color: pal.pants, group: "legL" });
  blocks.push({ x: -(legOffsetX + LEG_W), y: LEG_Y, z: -LEG_W, w: 1, h: LEG_H, d: LEG_D, color: pantsLi, group: "legL" });
  blocks.push({ x: -(legOffsetX + LEG_W) - 0.5, y: SHOE_Y, z: -(SHOE_D / 2) - 0.5, w: SHOE_W, h: SHOE_H, d: SHOE_D, color: SHOE, group: "shoeL" });
  blocks.push({ x: -(legOffsetX + LEG_W) - 0.5, y: SHOE_Y, z: -(SHOE_D / 2) - 0.5, w: SHOE_W, h: 0.5, d: 0.5, color: shoeLi, group: "shoeL" });
  // Right leg
  blocks.push({ x: legOffsetX, y: LEG_Y, z: -LEG_W, w: LEG_W, h: LEG_H, d: LEG_D, color: pal.pants, group: "legR" });
  blocks.push({ x: legOffsetX, y: LEG_Y, z: -LEG_W, w: 1, h: LEG_H, d: LEG_D, color: pantsLi, group: "legR" });
  blocks.push({ x: legOffsetX - 0.5, y: SHOE_Y, z: -(SHOE_D / 2) - 0.5, w: SHOE_W, h: SHOE_H, d: SHOE_D, color: SHOE, group: "shoeR" });
  blocks.push({ x: legOffsetX - 0.5, y: SHOE_Y, z: -(SHOE_D / 2) - 0.5, w: SHOE_W, h: 0.5, d: 0.5, color: shoeLi, group: "shoeR" });

  // ── Accessories ───────────────────────────────────────────────────────
  buildAccessory(blocks, pal);

  // ── Head Features ─────────────────────────────────────────────────────
  buildHeadFeature(blocks, pal, eyeColor);

  // ── Beard ─────────────────────────────────────────────────────────────
  buildBeard(blocks, pal, hairDk);

  // ── Joints (pivot points for animation) ───────────────────────────────
  const joints = {
    head: { x: 0, y: NECK_Y + NECK_H, z: 0 },
    armL: { x: -(armOffsetX + ARM_W), y: TORSO_Y + TORSO_H - 1, z: 0 },
    armR: { x: armOffsetX + ARM_W, y: TORSO_Y + TORSO_H - 1, z: 0 },
    legL: { x: -(legOffsetX + LEG_W), y: TORSO_Y, z: 0 },
    legR: { x: legOffsetX + LEG_W, y: TORSO_Y, z: 0 },
    torso: { x: 0, y: TORSO_Y, z: 0 },
  };

  return { blocks, joints };
}

// ── Hair builder ───────────────────────────────────────────────────────────

function buildHair(blocks: VoxelBlock[], pal: CharPalette, hairLi: string, hairDk: string): void {
  const hs = pal.hairStyle;
  const top = HEAD_Y + HEAD_H;

  switch (hs) {
    case "bald":
      // No hair blocks — just a slight skin dome highlight
      break;

    case "balding":
      // Thin ring around sides/back
      blocks.push({ x: -HEAD_W / 2, y: top - 2, z: -HEAD_D / 2, w: HEAD_W, h: 1, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: -HEAD_W / 2, y: top - 1, z: HEAD_D / 2 - 1, w: HEAD_W, h: 1, d: 1, color: pal.hair, group: "hair" });
      break;

    case "buzz":
      // Thin slab barely above scalp
      blocks.push({ x: -HEAD_W / 2, y: top, z: -HEAD_D / 2, w: HEAD_W, h: 1, d: HEAD_D, color: pal.hair, group: "hair" });
      break;

    case "short":
      // Standard top slab with slight side overhang
      blocks.push({ x: -HEAD_W / 2, y: top, z: -HEAD_D / 2, w: HEAD_W, h: 2, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: -HEAD_W / 2 - 1, y: top - 1, z: -HEAD_D / 2, w: 1, h: 3, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: HEAD_W / 2, y: top - 1, z: -HEAD_D / 2, w: 1, h: 3, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: -HEAD_W / 2, y: top + 1, z: -HEAD_D / 2, w: HEAD_W, h: 1, d: HEAD_D, color: hairLi, group: "hair" });
      break;

    case "spiky":
      // Vertical columns of varying height
      blocks.push({ x: -HEAD_W / 2, y: top, z: -HEAD_D / 2, w: HEAD_W, h: 1, d: HEAD_D, color: pal.hair, group: "hair" });
      for (let i = -2; i <= 2; i++) {
        const h = 3 - Math.abs(i);
        blocks.push({ x: i * 2 - 0.5, y: top + 1, z: -1, w: 1, h, d: 2, color: pal.hair, group: "hair" });
      }
      blocks.push({ x: -HEAD_W / 2 - 1, y: top - 1, z: -HEAD_D / 2, w: 1, h: 3, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: HEAD_W / 2, y: top - 1, z: -HEAD_D / 2, w: 1, h: 3, d: HEAD_D, color: pal.hair, group: "hair" });
      break;

    case "long":
      // Top slab + tall side panels
      blocks.push({ x: -HEAD_W / 2, y: top, z: -HEAD_D / 2, w: HEAD_W, h: 2, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: -HEAD_W / 2 - 1, y: top - 2, z: -HEAD_D / 2, w: 1, h: 8, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: HEAD_W / 2, y: top - 2, z: -HEAD_D / 2, w: 1, h: 8, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: -HEAD_W / 2 - 1, y: top - 2, z: -HEAD_D / 2, w: 1, h: 2, d: HEAD_D, color: hairDk, group: "hair" });
      blocks.push({ x: HEAD_W / 2, y: top - 2, z: -HEAD_D / 2, w: 1, h: 2, d: HEAD_D, color: hairDk, group: "hair" });
      break;

    case "ponytail":
      // Top slab + block column hanging from back
      blocks.push({ x: -HEAD_W / 2, y: top, z: -HEAD_D / 2, w: HEAD_W, h: 2, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: -1, y: top - 2, z: HEAD_D / 2, w: 2, h: 5, d: 2, color: pal.hair, group: "hair" });
      blocks.push({ x: -HEAD_W / 2 - 1, y: top - 1, z: -HEAD_D / 2, w: 1, h: 3, d: HEAD_D, color: pal.hair, group: "hair" });
      break;

    case "swept":
      // Asymmetric — higher on one side, sweeping across
      blocks.push({ x: -HEAD_W / 2, y: top, z: -HEAD_D / 2, w: HEAD_W, h: 2, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: 1, y: top + 1, z: -HEAD_D / 2, w: HEAD_W / 2, h: 2, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: -HEAD_W / 2 - 1, y: top - 1, z: -HEAD_D / 2, w: 1, h: 3, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: HEAD_W / 2, y: top - 1, z: -HEAD_D / 2, w: 1, h: 3, d: HEAD_D, color: pal.hair, group: "hair" });
      break;

    case "curly":
      // Clustered cubes approximating spheres
      blocks.push({ x: -HEAD_W / 2, y: top, z: -HEAD_D / 2, w: HEAD_W, h: 1, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: -3, y: top + 1, z: -1, w: 3, h: 3, d: 3, color: pal.hair, group: "hair" });
      blocks.push({ x: 0, y: top + 2, z: -1, w: 3, h: 3, d: 3, color: pal.hair, group: "hair" });
      blocks.push({ x: -HEAD_W / 2 - 1, y: top - 1, z: -HEAD_D / 2, w: 1, h: 4, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: HEAD_W / 2, y: top - 1, z: -HEAD_D / 2, w: 1, h: 4, d: HEAD_D, color: pal.hair, group: "hair" });
      break;

    case "bun":
      // Top slab + cube cluster on top-center
      blocks.push({ x: -HEAD_W / 2, y: top, z: -HEAD_D / 2, w: HEAD_W, h: 2, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: -2, y: top + 2, z: -2, w: 4, h: 4, d: 4, color: pal.hair, group: "hair" });
      blocks.push({ x: -1, y: top + 3, z: -1, w: 2, h: 2, d: 2, color: hairLi, group: "hair" });
      blocks.push({ x: -HEAD_W / 2 - 1, y: top - 1, z: -HEAD_D / 2, w: 1, h: 3, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: HEAD_W / 2, y: top - 1, z: -HEAD_D / 2, w: 1, h: 3, d: HEAD_D, color: pal.hair, group: "hair" });
      break;

    case "mohawk":
      // Single row of tall vertical blocks down center
      blocks.push({ x: -1, y: top, z: -HEAD_D / 2, w: 2, h: 6, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: -1, y: top + 5, z: -HEAD_D / 2, w: 2, h: 1, d: HEAD_D, color: hairLi, group: "hair" });
      break;

    case "afro":
      // Large rounded voxel sphere around head
      blocks.push({ x: -HEAD_W / 2 - 1, y: top - 2, z: -HEAD_D / 2 - 1, w: HEAD_W + 2, h: HEAD_H + 2, d: HEAD_D + 2, color: pal.hair, group: "hair" });
      // Round the corners by adding extra cubes
      blocks.push({ x: -HEAD_W / 2 - 2, y: top - 1, z: -1, w: 1, h: 3, d: 3, color: pal.hair, group: "hair" });
      blocks.push({ x: HEAD_W / 2 + 1, y: top - 1, z: -1, w: 1, h: 3, d: 3, color: pal.hair, group: "hair" });
      blocks.push({ x: -1, y: top + 2, z: -HEAD_D / 2 - 1, w: 3, h: 3, d: 1, color: pal.hair, group: "hair" });
      blocks.push({ x: -1, y: top + 2, z: -1, w: 3, h: 3, d: 1, color: pal.hair, group: "hair" });
      blocks.push({ x: -1, y: top + 3, z: -1, w: 2, h: 2, d: 2, color: hairLi, group: "hair" });
      break;

    case "braids":
      // Top slab + two vertical block columns with darker bands
      blocks.push({ x: -HEAD_W / 2, y: top, z: -HEAD_D / 2, w: HEAD_W, h: 2, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: -HEAD_W / 2 - 1, y: top - 3, z: -HEAD_D / 2, w: 1, h: 8, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: HEAD_W / 2, y: top - 3, z: -HEAD_D / 2, w: 1, h: 8, d: HEAD_D, color: pal.hair, group: "hair" });
      for (let i = 0; i < 3; i++) {
        const by = top - 3 + i * 3;
        blocks.push({ x: -HEAD_W / 2 - 1, y: by, z: -HEAD_D / 2, w: 1, h: 1, d: HEAD_D, color: hairDk, group: "hair" });
        blocks.push({ x: HEAD_W / 2, y: by, z: -HEAD_D / 2, w: 1, h: 1, d: HEAD_D, color: hairDk, group: "hair" });
      }
      break;

    case "pigtails":
      // Top slab + two small cube clusters on sides
      blocks.push({ x: -HEAD_W / 2, y: top, z: -HEAD_D / 2, w: HEAD_W, h: 2, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: -HEAD_W / 2 - 2, y: top - 3, z: -1, w: 3, h: 3, d: 3, color: pal.hair, group: "hair" });
      blocks.push({ x: HEAD_W / 2 - 1, y: top - 3, z: -1, w: 3, h: 3, d: 3, color: pal.hair, group: "hair" });
      blocks.push({ x: -HEAD_W / 2 - 1, y: top - 2, z: 0, w: 1, h: 1, d: 1, color: hairLi, group: "hair" });
      blocks.push({ x: HEAD_W / 2, y: top - 2, z: 0, w: 1, h: 1, d: 1, color: hairLi, group: "hair" });
      break;

    case "bob":
      // Top slab + medium side panels (jaw-length)
      blocks.push({ x: -HEAD_W / 2, y: top, z: -HEAD_D / 2, w: HEAD_W, h: 2, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: -HEAD_W / 2 - 1, y: top - 2, z: -HEAD_D / 2, w: 1, h: 6, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: HEAD_W / 2, y: top - 2, z: -HEAD_D / 2, w: 1, h: 6, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: -HEAD_W / 2 - 1, y: top - 2, z: -HEAD_D / 2, w: 1, h: 2, d: HEAD_D, color: hairDk, group: "hair" });
      blocks.push({ x: HEAD_W / 2, y: top - 2, z: -HEAD_D / 2, w: 1, h: 2, d: HEAD_D, color: hairDk, group: "hair" });
      break;

    case "dreadlocks":
      // Top slab + multiple thin vertical columns around head
      blocks.push({ x: -HEAD_W / 2, y: top, z: -HEAD_D / 2, w: HEAD_W, h: 1, d: HEAD_D, color: pal.hair, group: "hair" });
      const dlockPositions = [
        { x: -HEAD_W / 2 - 1, z: -HEAD_D / 2 },
        { x: -HEAD_W / 2 - 1, z: 0 },
        { x: -HEAD_W / 2 - 1, z: HEAD_D / 2 - 1 },
        { x: HEAD_W / 2, z: -HEAD_D / 2 },
        { x: HEAD_W / 2, z: 0 },
        { x: HEAD_W / 2, z: HEAD_D / 2 - 1 },
      ];
      for (const pos of dlockPositions) {
        blocks.push({ x: pos.x, y: top - 3, z: pos.z, w: 1, h: 7, d: 1, color: pal.hair, group: "hair" });
        for (let i = 0; i < 2; i++) {
          blocks.push({ x: pos.x, y: top - 3 + i * 3, z: pos.z, w: 1, h: 1, d: 1, color: hairDk, group: "hair" });
        }
      }
      break;

    default:
      // "short" fallback
      blocks.push({ x: -HEAD_W / 2, y: top, z: -HEAD_D / 2, w: HEAD_W, h: 2, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: -HEAD_W / 2 - 1, y: top - 1, z: -HEAD_D / 2, w: 1, h: 3, d: HEAD_D, color: pal.hair, group: "hair" });
      blocks.push({ x: HEAD_W / 2, y: top - 1, z: -HEAD_D / 2, w: 1, h: 3, d: HEAD_D, color: pal.hair, group: "hair" });
      break;
  }
}

// ── Accessory builder ──────────────────────────────────────────────────────

function buildAccessory(blocks: VoxelBlock[], pal: CharPalette): void {
  const ac = pal.accessory;
  const top = HEAD_Y + HEAD_H;
  const front = -HEAD_D / 2;

  switch (ac) {
    case "none":
      break;

    case "glasses": {
      const gc = mix(pal.shirt, "#000000", 0.3);
      // Two frames + bridge
      blocks.push({ x: -3, y: HEAD_Y + 4, z: front - 0.2, w: 2, h: 2, d: 0.2, color: gc, group: "accessory" });
      blocks.push({ x: 1, y: HEAD_Y + 4, z: front - 0.2, w: 2, h: 2, d: 0.2, color: gc, group: "accessory" });
      blocks.push({ x: -1, y: HEAD_Y + 4.5, z: front - 0.2, w: 2, h: 0.5, d: 0.2, color: gc, group: "accessory" });
      break;
    }

    case "headband": {
      const hc = pal.shirt;
      blocks.push({ x: -HEAD_W / 2, y: top - 1, z: -HEAD_D / 2, w: HEAD_W, h: 1, d: HEAD_D, color: hc, group: "accessory" });
      break;
    }

    case "earrings": {
      const ec = "#ffd700";
      blocks.push({ x: -HEAD_W / 2 - 1, y: HEAD_Y + 1, z: 0, w: 0.5, h: 0.5, d: 0.5, color: ec, group: "accessory" });
      blocks.push({ x: HEAD_W / 2 + 0.5, y: HEAD_Y + 1, z: 0, w: 0.5, h: 0.5, d: 0.5, color: ec, group: "accessory" });
      break;
    }

    case "cap": {
      const cc = mix(pal.shirt, "#000000", 0.1);
      blocks.push({ x: -HEAD_W / 2, y: top + 1, z: -HEAD_D / 2, w: HEAD_W, h: 2, d: HEAD_D, color: cc, group: "accessory" });
      // Brim extending forward
      blocks.push({ x: -HEAD_W / 2, y: top, z: front - 2, w: HEAD_W, h: 1, d: 2, color: cc, group: "accessory" });
      break;
    }

    case "beanie": {
      const bc = mix(pal.shirt, "#000000", 0.05);
      blocks.push({ x: -HEAD_W / 2, y: top, z: -HEAD_D / 2, w: HEAD_W, h: 3, d: HEAD_D, color: bc, group: "accessory" });
      // Folded band
      blocks.push({ x: -HEAD_W / 2, y: top - 1, z: -HEAD_D / 2, w: HEAD_W, h: 1, d: HEAD_D, color: mix(bc, "#000000", 0.2), group: "accessory" });
      break;
    }

    case "headphones": {
      const hc = "#3a3a44";
      // Band over top
      blocks.push({ x: -1, y: top + 1, z: 0, w: 2, h: 1, d: HEAD_D, color: hc, group: "accessory" });
      // Ear cups
      blocks.push({ x: -HEAD_W / 2 - 1, y: HEAD_Y + 3, z: -1, w: 1, h: 3, d: 3, color: hc, group: "accessory" });
      blocks.push({ x: HEAD_W / 2, y: HEAD_Y + 3, z: -1, w: 1, h: 3, d: 3, color: hc, group: "accessory" });
      break;
    }
  }
}

// ── Head feature builder ───────────────────────────────────────────────────

function buildHeadFeature(blocks: VoxelBlock[], pal: CharPalette, eyeColor: string): void {
  const hf = pal.headFeature ?? "none";
  const top = HEAD_Y + HEAD_H;

  switch (hf) {
    case "none":
      break;

    case "cat ears": {
      const inner = mix(pal.hair, "#ffaaaa", 0.4);
      // Left ear — triangular stack
      blocks.push({ x: -4, y: top + 2, z: -1, w: 2, h: 1, d: 2, color: pal.hair, group: "headFeature" });
      blocks.push({ x: -3.5, y: top + 3, z: -1, w: 1, h: 1, d: 2, color: pal.hair, group: "headFeature" });
      blocks.push({ x: -3.5, y: top + 2, z: -1, w: 1, h: 1, d: 1, color: inner, group: "headFeature" });
      // Right ear
      blocks.push({ x: 2, y: top + 2, z: -1, w: 2, h: 1, d: 2, color: pal.hair, group: "headFeature" });
      blocks.push({ x: 2.5, y: top + 3, z: -1, w: 1, h: 1, d: 2, color: pal.hair, group: "headFeature" });
      blocks.push({ x: 2.5, y: top + 2, z: -1, w: 1, h: 1, d: 1, color: inner, group: "headFeature" });
      break;
    }

    case "horns": {
      // Left horn — diagonal tapered column
      blocks.push({ x: -4, y: top + 1, z: -1, w: 1, h: 1, d: 1, color: "#6a5a4a", group: "headFeature" });
      blocks.push({ x: -4.5, y: top + 2, z: -1, w: 1, h: 1, d: 1, color: "#6a5a4a", group: "headFeature" });
      blocks.push({ x: -5, y: top + 3, z: -1, w: 1, h: 1, d: 1, color: "#6a5a4a", group: "headFeature" });
      blocks.push({ x: -4, y: top + 1.5, z: -1, w: 0.5, h: 0.5, d: 0.5, color: "#8a7a6a", group: "headFeature" });
      // Right horn
      blocks.push({ x: 3, y: top + 1, z: -1, w: 1, h: 1, d: 1, color: "#6a5a4a", group: "headFeature" });
      blocks.push({ x: 3.5, y: top + 2, z: -1, w: 1, h: 1, d: 1, color: "#6a5a4a", group: "headFeature" });
      blocks.push({ x: 4, y: top + 3, z: -1, w: 1, h: 1, d: 1, color: "#6a5a4a", group: "headFeature" });
      blocks.push({ x: 3, y: top + 1.5, z: -1, w: 0.5, h: 0.5, d: 0.5, color: "#8a7a6a", group: "headFeature" });
      break;
    }

    case "antennae": {
      const tip = eyeColor;
      // Left antenna
      blocks.push({ x: -2, y: top + 2, z: 0, w: 0.5, h: 3, d: 0.5, color: pal.hair, group: "headFeature" });
      blocks.push({ x: -2, y: top + 4.5, z: 0, w: 1, h: 1, d: 1, color: tip, group: "headFeature" });
      // Right antenna
      blocks.push({ x: 1.5, y: top + 2, z: 0, w: 0.5, h: 3, d: 0.5, color: pal.hair, group: "headFeature" });
      blocks.push({ x: 1.5, y: top + 4.5, z: 0, w: 1, h: 1, d: 1, color: tip, group: "headFeature" });
      break;
    }

    case "elf ears": {
      // Pointed blocks protruding from sides
      blocks.push({ x: -HEAD_W / 2 - 1, y: HEAD_Y + 3, z: -1, w: 1, h: 2, d: 2, color: pal.skin, group: "headFeature" });
      blocks.push({ x: -HEAD_W / 2 - 1.5, y: HEAD_Y + 4, z: -1, w: 0.5, h: 1, d: 1, color: pal.skin, group: "headFeature" });
      blocks.push({ x: HEAD_W / 2, y: HEAD_Y + 3, z: -1, w: 1, h: 2, d: 2, color: pal.skin, group: "headFeature" });
      blocks.push({ x: HEAD_W / 2 + 0.5, y: HEAD_Y + 4, z: -1, w: 0.5, h: 1, d: 1, color: pal.skin, group: "headFeature" });
      break;
    }
  }
}

// ── Beard builder ──────────────────────────────────────────────────────────

function buildBeard(blocks: VoxelBlock[], pal: CharPalette, hairDk: string): void {
  const bd = pal.beard ?? "none";
  const chinY = HEAD_Y;
  const front = -HEAD_D / 2;

  switch (bd) {
    case "none":
      break;

    case "stubble":
      // Scattered tiny blocks on chin
      for (let i = -2; i <= 2; i++) {
        blocks.push({ x: i, y: chinY, z: front - 0.1, w: 0.5, h: 0.5, d: 0.1, color: hairDk, group: "beard" });
      }
      break;

    case "mustache":
      blocks.push({ x: -2, y: chinY + 2, z: front - 0.1, w: 4, h: 1, d: 0.2, color: pal.hair, group: "beard" });
      blocks.push({ x: -2, y: chinY + 1.5, z: front - 0.1, w: 1, h: 0.5, d: 0.2, color: hairDk, group: "beard" });
      blocks.push({ x: 1, y: chinY + 1.5, z: front - 0.1, w: 1, h: 0.5, d: 0.2, color: hairDk, group: "beard" });
      break;

    case "goatee":
      blocks.push({ x: -1, y: chinY - 1, z: front - 0.1, w: 2, h: 2, d: 0.3, color: pal.hair, group: "beard" });
      blocks.push({ x: -1, y: chinY - 1, z: front - 0.1, w: 0.5, h: 0.5, d: 0.1, color: hairDk, group: "beard" });
      break;

    case "full_beard":
      blocks.push({ x: -HEAD_W / 2 + 1, y: chinY, z: front - 0.1, w: HEAD_W - 2, h: 4, d: 0.3, color: pal.hair, group: "beard" });
      blocks.push({ x: -HEAD_W / 2, y: chinY + 1, z: front - 0.1, w: 1, h: 3, d: 0.3, color: pal.hair, group: "beard" });
      blocks.push({ x: HEAD_W / 2 - 1, y: chinY + 1, z: front - 0.1, w: 1, h: 3, d: 0.3, color: pal.hair, group: "beard" });
      blocks.push({ x: -1, y: chinY - 1, z: front - 0.1, w: 2, h: 1, d: 0.3, color: hairDk, group: "beard" });
      break;
  }
}
