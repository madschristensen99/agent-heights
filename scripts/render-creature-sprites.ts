/**
 * Creature Sprite Renderer (3D → 2D)
 *
 * Renders 3D GLB models into 8-directional × 4-frame sprite sheets using
 * Playwright (headless Chromium) + Three.js for WebGL rendering.
 *
 * Pipeline per creature:
 *   1. Load GLB file from client/public/assets/ai/models/
 *   2. Set up Three.js scene with orthographic camera (angled top-down view)
 *   3. For each of 8 directions × 4 animation frames:
 *      a. Rotate model around Y axis for direction
 *      b. Apply procedural animation transform (bob, lean, scale)
 *      c. Render to 128×128 WebGL canvas
 *      d. Copy to spritesheet canvas
 *   4. Export spritesheet as PNG (1024×512 = 8 cols × 4 rows)
 *   5. Save to client/public/assets/ai/creatures3d/<creature_key>.png
 *
 * Frame layout (8 cols × 4 rows):
 *   Col 0-7: S, SE, E, NE, N, NW, W, SW (clockwise from south)
 *   Row 0:   idle
 *   Row 1:   walk1
 *   Row 2:   walk2
 *   Row 3:   attack
 *   Frame index = row * 8 + col
 *
 * Usage:
 *   pnpm tsx scripts/render-creature-sprites.ts                    # render all
 *   pnpm tsx scripts/render-creature-sprites.ts --filter slime      # filter by name
 *   pnpm tsx scripts/render-creature-sprites.ts --dry-run           # list without rendering
 *
 * Requires: npx playwright install chromium
 * Output: client/public/assets/ai/creatures3d/ (PNG sprite sheets)
 */
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_DIR = join(ROOT, "client", "public", "assets", "ai", "models");
const OUTPUT_DIR = join(ROOT, "client", "public", "assets", "ai", "creatures3d");

const THREE_PATH = join(ROOT, "node_modules", "three", "build", "three.module.js");
const GLTF_LOADER_PATH = join(ROOT, "node_modules", "three", "examples", "jsm", "loaders", "GLTFLoader.js");
const BUF_GEOM_UTILS_PATH = join(ROOT, "node_modules", "three", "examples", "jsm", "utils", "BufferGeometryUtils.js");
const SKELETON_UTILS_PATH = join(ROOT, "node_modules", "three", "examples", "jsm", "utils", "SkeletonUtils.js");

const FRAME_SIZE = 128;
const DIRS = 8;
const ANIMS = 4;

// Load .env manually
try {
  const envPath = resolve(ROOT, ".env");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // .env not found
}

// =============================================================== creature defs

const CREATURE_KEYS: string[] = [
  "creature_slime", "creature_wolf", "creature_skeleton", "creature_imp",
  "creature_wraith", "creature_fire_elemental",
  "beast_groveheart", "beast_stone_colossus", "beast_ash_wyrm",
  "beast_void_leviathan", "beast_infernal_sovereign",
  "friendly_unicorn", "friendly_fairy_bunny", "friendly_baby_dragon", "friendly_crystal_fox",
];

// =============================================================== HTML template

const RENDER_HTML = `<!DOCTYPE html>
<html>
<head>
<script type="importmap">
{"imports":{"three":"http://localhost/three.module.js"}}
</script>
</head>
<body>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'http://localhost/GLTFLoader.js';
window.THREE = THREE;
window.GLTFLoader = GLTFLoader;
window.__ready = true;
</script>
</body>
</html>`;

// =============================================================== rendering

function parseArgs(): { filter?: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let filter: string | undefined;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--filter" && args[i + 1]) filter = args[i + 1];
    if (args[i] === "--dry-run") dryRun = true;
  }
  return { filter, dryRun };
}

/**
 * Render a single creature's GLB into a sprite sheet data URL.
 * Runs inside the Playwright browser context.
 */
const RENDER_FN = async (glbUrl: string) => {
  const THREE = (window as any).THREE;
  const GLTFLoader = (window as any).GLTFLoader;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(128, 128);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  // Orthographic camera — 45° elevation for a 2.5D top-down look
  const cam = new THREE.OrthographicCamera(-0.7, 0.7, 0.7, -0.7, 0.01, 100);
  const elev = (45 * Math.PI) / 180;
  cam.position.set(0, Math.sin(elev) * 2, Math.cos(elev) * 2);
  cam.lookAt(0, 0, 0);

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
  keyLight.position.copy(cam.position);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x8899ff, 0.25);
  fillLight.position.set(-1, 0.5, -1);
  scene.add(fillLight);

  // Load GLB
  const loader = new GLTFLoader();
  const gltf = await new Promise<any>((res, rej) => {
    loader.load(glbUrl, res, undefined, rej);
  });
  const model = gltf.scene;
  scene.add(model);

  // Auto-fit model into view
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = 1.3 / maxDim;
  model.scale.setScalar(scale);
  model.position.x = -center.x * scale;
  model.position.z = -center.z * scale;
  const baseY = -center.y * scale + 0.15;
  model.position.y = baseY;

  // Direction rotations (model faces -Z = South = toward camera at rotation 0)
  const dirRotations = [
    0,                    // 0: S
    -Math.PI / 4,         // 1: SE
    -Math.PI / 2,         // 2: E
    (-3 * Math.PI) / 4,   // 3: NE
    Math.PI,              // 4: N
    (3 * Math.PI) / 4,    // 5: NW
    Math.PI / 2,          // 6: W
    Math.PI / 4,          // 7: SW
  ];

  // Procedural animation transforms
  const animTransforms = [
    { yOff: 0,     scaleY: 1.0,  rotZ: 0 },            // idle
    { yOff: 0.04,  scaleY: 0.97, rotZ: 0.05 },         // walk1 (bob up, lean fwd)
    { yOff: -0.04, scaleY: 1.03, rotZ: -0.05 },        // walk2 (bob down, lean back)
    { yOff: 0.02,  scaleY: 1.08, rotZ: 0.15 },         // attack (lunge forward)
  ];

  // Create spritesheet canvas
  const sheetCanvas = document.createElement("canvas");
  sheetCanvas.width = 128 * 8;
  sheetCanvas.height = 128 * 4;
  const sheetCtx = sheetCanvas.getContext("2d")!;

  for (let anim = 0; anim < 4; anim++) {
    for (let dir = 0; dir < 8; dir++) {
      model.rotation.y = dirRotations[dir];
      model.rotation.z = animTransforms[anim].rotZ;
      model.position.y = baseY + animTransforms[anim].yOff;
      model.scale.y = scale * animTransforms[anim].scaleY;

      renderer.render(scene, cam);
      sheetCtx.drawImage(renderer.domElement, dir * 128, anim * 128);
    }
  }

  return sheetCanvas.toDataURL("image/png");
};

async function renderCreature(
  page: import("playwright").Page,
  creatureKey: string,
): Promise<Buffer> {
  const glbPath = join(MODELS_DIR, `${creatureKey}.glb`);

  // Set up routes for this creature
  await page.route("**/three.module.js", (route) =>
    route.fulfill({ path: THREE_PATH, contentType: "application/javascript" }),
  );
  await page.route("**/GLTFLoader.js", (route) =>
    route.fulfill({ path: GLTF_LOADER_PATH, contentType: "application/javascript" }),
  );
  await page.route("**/utils/BufferGeometryUtils.js", (route) =>
    route.fulfill({ path: BUF_GEOM_UTILS_PATH, contentType: "application/javascript" }),
  );
  await page.route("**/utils/SkeletonUtils.js", (route) =>
    route.fulfill({ path: SKELETON_UTILS_PATH, contentType: "application/javascript" }),
  );
  await page.route("**/model.glb", (route) =>
    route.fulfill({ path: glbPath, contentType: "model/gltf-binary" }),
  );
  await page.route("http://localhost/render.html", (route) =>
    route.fulfill({ body: RENDER_HTML, contentType: "text/html" }),
  );

  await page.goto("http://localhost/render.html");
  await page.waitForFunction(() => (window as any).__ready, { timeout: 15000 });

  const dataUrl = await page.evaluate(RENDER_FN, "http://localhost/model.glb");

  // Clean up routes for next creature
  await page.unroute("**/*");

  // Convert data URL to buffer
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return Buffer.from(base64, "base64");
}

async function main() {
  const { filter, dryRun } = parseArgs();

  let creatures = CREATURE_KEYS;
  if (filter) {
    creatures = creatures.filter((k) => k.includes(filter));
  }

  console.log(`\nCreature Sprite Renderer (3D → 2D)`);
  console.log(`  ${creatures.length} creature(s) to render${filter ? ` (filter: "${filter}")` : ""}${dryRun ? " [DRY RUN]" : ""}\n`);

  if (dryRun) {
    for (const key of creatures) {
      const glbPath = join(MODELS_DIR, `${key}.glb`);
      const outPath = join(OUTPUT_DIR, `${key}.png`);
      const glbExists = existsSync(glbPath);
      const outExists = existsSync(outPath);
      console.log(`  ${glbExists ? "[GLB]" : "[NO GLB]"} ${key} → ${outExists ? "EXISTS" : "would render"} ${outPath}`);
    }
    return;
  }

  // Check all GLB files exist first
  const missing = creatures.filter((k) => !existsSync(join(MODELS_DIR, `${k}.glb`)));
  if (missing.length > 0) {
    console.error(`  [ERROR] Missing GLB files: ${missing.join(", ")}`);
    console.error(`  Run "pnpm tsx scripts/generate-creature-3d.ts" first.`);
    process.exit(1);
  }

  // Launch browser
  console.log("  Launching headless Chromium...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  let success = 0;
  let failed = 0;

  for (const key of creatures) {
    const outPath = join(OUTPUT_DIR, `${key}.png`);

    if (existsSync(outPath)) {
      console.log(`  [SKIP] ${key} — sprite sheet already exists`);
      success++;
      continue;
    }

    console.log(`  [RENDER] ${key}...`);

    try {
      const pngBuf = await renderCreature(page, key);
      mkdirSync(OUTPUT_DIR, { recursive: true });
      writeFileSync(outPath, pngBuf);
      console.log(`         saved: ${outPath} (${(pngBuf.length / 1024).toFixed(0)} KB)`);
      success++;
    } catch (err) {
      console.error(`  [FAIL] ${key}: ${err}`);
      failed++;
    }
  }

  await browser.close();

  console.log(`\nDone! ${success} succeeded, ${failed} failed.`);
  console.log(`Next: the game will auto-load 3D spritesheets from assets/ai/creatures3d/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
