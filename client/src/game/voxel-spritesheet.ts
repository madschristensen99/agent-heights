/**
 * Voxel spritesheet renderer — renders 3D voxel character models to 2D
 * spritesheets compatible with the existing Phaser animation pipeline.
 *
 * Produces the same layout as chargen.ts:
 *   8 columns (poses 0-7) × 4 rows (down, left, right, up)
 *   Each frame is CW×CH pixels (64×96)
 *
 * Pose mapping (matches char-draw.ts):
 *   0: stand        1: step-left     2: mid-step-left
 *   3: step-right   4: mid-step-right 5: step
 *   6: idle         7: blink
 */
import * as THREE from "three";
import {
  type CharAppearance,
  ACCENT_COLOR_OPTIONS,
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, SHIRT_COLORS,
  PANTS_COLORS, ACCESSORIES, BEARD_STYLES, EYE_COLORS, HEAD_FEATURES,
} from "../../../shared/types";
import { type CharPalette, mix, type Dir, DIRS, CW, CH } from "../../../shared/char-draw";
import { buildVoxelModel, type VoxelGroup, type VoxelModel } from "../../../shared/voxel-model";
import type Phaser from "phaser";

export const CHAR_FRAME_W = CW;
export const CHAR_FRAME_H = CH;
export const CHAR_FRAMES_PER_ROW = 8;

// ── Pose → joint rotations ─────────────────────────────────────────────────
// Maps the 8-pose system to 3D rotations (in radians).
// Positive arm rotation = forward swing, negative = backward.

interface PoseState {
  armL: number;   // rotation around X axis (forward/back swing)
  armR: number;
  legL: number;   // rotation around X axis
  legR: number;
  headBob: number; // vertical offset
  headSway: number; // horizontal offset
  bodyBob: number;  // vertical offset for torso
  eyesClosed: boolean;
}

function poseState(pose: number): PoseState {
  const isIdle = pose === 6;
  const isBlink = pose === 7;
  const stepping = pose === 1 || pose === 3 || pose === 5;

  return {
    armL: pose === 1 ? -0.3 : pose === 3 ? 0.3 : pose === 4 ? -0.2 : 0,
    armR: pose === 1 ? 0.3 : pose === 3 ? -0.3 : pose === 4 ? 0.2 : 0,
    legL: pose === 1 ? 0.25 : pose === 3 ? -0.25 : pose === 4 ? 0.15 : 0,
    legR: pose === 1 ? -0.25 : pose === 3 ? 0.25 : pose === 4 ? -0.15 : 0,
    headBob: isIdle ? -0.3 : (stepping ? 0.5 : (pose === 2 || pose === 4 ? 0.25 : 0)),
    headSway: pose === 1 ? -0.2 : pose === 3 ? 0.2 : pose === 4 ? -0.15 : 0,
    bodyBob: isIdle ? -0.2 : (stepping ? 0.2 : 0),
    eyesClosed: isBlink,
  };
}

// ── Direction → camera azimuth ─────────────────────────────────────────────
// The voxel model faces -Z (front). We rotate the camera around Y to get
// different viewing angles.

const DIR_AZIMUTH: Record<Dir, number> = {
  down: 0,        // looking at front
  right: -Math.PI / 2,  // looking from the right side
  left: Math.PI / 2,    // looking from the left side (mirrored in 2D)
  up: Math.PI,          // looking at back
};

// ── Appearance → Palette ───────────────────────────────────────────────────

function appearanceToPalette(ap: CharAppearance): CharPalette {
  return {
    skin: SKIN_TONES[ap.skin % SKIN_TONES.length],
    hair: HAIR_COLORS[ap.hair % HAIR_COLORS.length],
    shirt: SHIRT_COLORS[ap.shirt % SHIRT_COLORS.length],
    shirtShade: mix(SHIRT_COLORS[ap.shirt % SHIRT_COLORS.length], "#000000", 0.2),
    pants: PANTS_COLORS[ap.pants % PANTS_COLORS.length],
    hairStyle: HAIR_STYLES[ap.hairStyle % HAIR_STYLES.length],
    accessory: ACCESSORIES[ap.accessory % ACCESSORIES.length],
    eyeColor: EYE_COLORS[ap.eyeColor % EYE_COLORS.length],
    headFeature: HEAD_FEATURES[ap.headFeature % HEAD_FEATURES.length],
    beard: BEARD_STYLES[ap.beard % BEARD_STYLES.length],
    tie: ACCENT_COLOR_OPTIONS[ap.accent % ACCENT_COLOR_OPTIONS.length],
  };
}

// ── Voxel spritesheet renderer ─────────────────────────────────────────────

// Shared off-screen renderer (lazily initialized, reused across calls)
let sharedRenderer: THREE.WebGLRenderer | null = null;
let sharedScene: THREE.Scene | null = null;
let sharedCamera: THREE.PerspectiveCamera | null = null;

function getSharedRenderer(): THREE.WebGLRenderer {
  if (!sharedRenderer) {
    const canvas = document.createElement("canvas");
    canvas.width = CW;
    canvas.height = CH;
    sharedRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    sharedRenderer.setPixelRatio(1);
    sharedRenderer.setSize(CW, CH);
    sharedRenderer.shadowMap.enabled = false;
  }
  return sharedRenderer;
}

function getSharedScene(): THREE.Scene {
  if (!sharedScene) {
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(10, 20, 10);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x8090ff, 0.2);
    fill.position.set(-10, 10, -5);
    scene.add(fill);

    sharedScene = scene;
  }
  return sharedScene;
}

function getSharedCamera(): THREE.PerspectiveCamera {
  if (!sharedCamera) {
    sharedCamera = new THREE.PerspectiveCamera(30, CW / CH, 0.1, 100);
  }
  return sharedCamera;
}

type PartName = VoxelGroup | "root";

function buildJointGroups(model: VoxelModel): {
  root: THREE.Group;
  parts: Map<PartName, THREE.Group>;
  cleanup: () => void;
} {
  const scene = getSharedScene();
  const root = new THREE.Group();
  scene.add(root);

  // Create sub-groups for each animatable body part
  const partDefs: { name: VoxelGroup; parent: VoxelGroup | "root"; pivot: { x: number; y: number; z: number } }[] = [
    { name: "torso", parent: "root", pivot: model.joints.torso },
    { name: "head", parent: "root", pivot: model.joints.head },
    { name: "armL", parent: "torso", pivot: model.joints.armL },
    { name: "armR", parent: "torso", pivot: model.joints.armR },
    { name: "legL", parent: "root", pivot: model.joints.legL },
    { name: "legR", parent: "root", pivot: model.joints.legR },
  ];

  const parts = new Map<PartName, THREE.Group>();
  parts.set("root", root);

  for (const def of partDefs) {
    const g = new THREE.Group();
    g.position.set(def.pivot.x, def.pivot.y, def.pivot.z);
    const parent = parts.get(def.parent as PartName) ?? root;
    parent.add(g);
    parts.set(def.name, g);
  }

  // Map each block to its appropriate group
  const blockToGroup: Record<VoxelGroup, PartName> = {
    head: "head",
    hair: "head",
    face: "head",
    neck: "root",
    torso: "torso",
    armL: "armL",
    armR: "armR",
    handL: "armL",
    handR: "armR",
    legL: "legL",
    legR: "legR",
    shoeL: "legL",
    shoeR: "legR",
    accessory: "head",
    headFeature: "head",
    beard: "head",
    tie: "torso",
  };

  const meshes: THREE.Mesh[] = [];

  for (const block of model.blocks) {
    const targetGroupName = blockToGroup[block.group] ?? "root";
    const targetGroup = parts.get(targetGroupName as PartName) ?? root;

    // Position relative to the group's pivot
    const geo = new THREE.BoxGeometry(block.w, block.h, block.d);
    const mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(block.color),
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Block center relative to the joint pivot
    const pivot = partDefs.find((d) => d.name === targetGroupName)?.pivot ?? { x: 0, y: 0, z: 0 };
    mesh.position.set(
      block.x + block.w / 2 - pivot.x,
      block.y + block.h / 2 - pivot.y,
      block.z + block.d / 2 - pivot.z,
    );

    targetGroup.add(mesh);
    meshes.push(mesh);
  }

  const cleanup = () => {
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    scene.remove(root);
  };

  return { root, parts, cleanup };
}

/** Apply pose rotations to joint groups. */
function applyPose(parts: Map<PartName, THREE.Group>, ps: PoseState, dir: Dir): void {
  // Reset all rotations
  for (const [, g] of parts) {
    g.rotation.set(0, 0, 0);
  }

  const root = parts.get("root")!;

  // Body bob (vertical offset)
  root.position.y = ps.bodyBob;

  // Head bob + sway
  const head = parts.get("head");
  if (head) {
    head.position.y = (head.userData.baseY ?? head.position.y) + ps.headBob;
    head.userData.baseY = head.userData.baseY ?? head.position.y - ps.headBob;
    head.position.x = ps.headSway;
  }

  // Arm swings (rotate around X for forward/back, around Z for left/right sway)
  const armL = parts.get("armL");
  const armR = parts.get("armR");
  if (armL) armL.rotation.x = ps.armL;
  if (armR) armR.rotation.x = ps.armR;

  // Leg swings
  const legL = parts.get("legL");
  const legR = parts.get("legR");
  if (legL) legL.rotation.x = ps.legL;
  if (legR) legR.rotation.x = ps.legR;

  // Mirror for "left" direction (flip X scale)
  if (dir === "left") {
    root.scale.x = -1;
  } else {
    root.scale.x = 1;
  }
}

/** Render a single frame to the renderer's canvas. */
function renderFrame(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  dir: Dir,
  parts: Map<PartName, THREE.Group>,
  pose: number,
): HTMLCanvasElement {
  const ps = poseState(pose);
  applyPose(parts, ps, dir);

  // Position camera based on direction
  const azimuth = DIR_AZIMUTH[dir];
  const elevation = 0.15; // slight downward look
  const distance = 28;
  const targetY = 9; // look at mid-torso

  camera.position.set(
    distance * Math.cos(elevation) * Math.sin(azimuth),
    distance * Math.sin(elevation) + targetY,
    distance * Math.cos(elevation) * Math.cos(azimuth),
  );
  camera.lookAt(0, targetY, 0);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  return renderer.domElement;
}

/**
 * Render a full voxel character spritesheet to a canvas.
 * Layout: 8 columns (poses) × 4 rows (directions), each frame CW×CH.
 */
export function renderVoxelSheet(ap: CharAppearance): HTMLCanvasElement {
  const pal = appearanceToPalette(ap);
  const model = buildVoxelModel(pal);

  const renderer = getSharedRenderer();
  const scene = getSharedScene();
  const camera = getSharedCamera();

  const { parts, cleanup } = buildJointGroups(model);

  // Create output canvas
  const cols = CHAR_FRAMES_PER_ROW;
  const rows = DIRS.length;
  const sheetCanvas = document.createElement("canvas");
  sheetCanvas.width = CW * cols;
  sheetCanvas.height = CH * rows;
  const ctx = sheetCanvas.getContext("2d")!;

  // Render each direction × pose combination
  for (let row = 0; row < rows; row++) {
    const dir = DIRS[row];
    for (let col = 0; col < cols; col++) {
      const frameCanvas = renderFrame(renderer, scene, camera, dir, parts, col);
      ctx.drawImage(frameCanvas, col * CW, row * CH);
    }
  }

  cleanup();
  return sheetCanvas;
}

/**
 * Generate a voxel character spritesheet and register it as a Phaser texture.
 * Drop-in replacement for generateCharTexture() from chargen.ts.
 */
export function generateVoxelCharTexture(scene: Phaser.Scene, key: string, ap: CharAppearance): void {
  const canvas = renderVoxelSheet(ap);

  if (scene.textures.exists(key)) {
    const existing = scene.textures.get(key);
    if (existing && typeof (existing as any).context !== "undefined") {
      const ctx = (existing as any).context as CanvasRenderingContext2D;
      ctx.clearRect(0, 0, (existing as any).width, (existing as any).height);
      ctx.drawImage(canvas, 0, 0);
      (existing as any).refresh();
      return;
    }
    scene.textures.remove(key);
  }

  const tex = scene.textures.addCanvas(key, canvas);
  if (tex) {
    const cols = CHAR_FRAMES_PER_ROW;
    const rows = DIRS.length;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        tex.add(row * cols + col, 0, col * CHAR_FRAME_W, row * CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H);
      }
    }
  }
}

/**
 * Generate a single-frame preview (down-facing idle) as a data URL.
 * Drop-in replacement for generateCharPreviewDataURL().
 */
export function generateVoxelPreviewDataURL(ap: CharAppearance, _scale = 3): string {
  const pal = appearanceToPalette(ap);
  const model = buildVoxelModel(pal);

  const renderer = getSharedRenderer();
  const scene = getSharedScene();
  const camera = getSharedCamera();

  const { parts, cleanup } = buildJointGroups(model);

  const canvas = renderFrame(renderer, scene, camera, "down", parts, 6);
  cleanup();

  return canvas.toDataURL();
}
