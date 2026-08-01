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
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "playwright";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_DIR = join(ROOT, "client", "public", "assets", "ai", "models");
const OUTPUT_DIR = join(ROOT, "client", "public", "assets", "ai", "creatures3d");

const THREE_PATH = join(ROOT, "node_modules", "three", "build", "three.module.js");
const THREE_CORE_PATH = join(ROOT, "node_modules", "three", "build", "three.core.js");
const OBJ_LOADER_PATH = join(ROOT, "node_modules", "three", "examples", "jsm", "loaders", "OBJLoader.js");
const MTL_LOADER_PATH = join(ROOT, "node_modules", "three", "examples", "jsm", "loaders", "MTLLoader.js");

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

function renderHtml(port: number): string {
  const base = `http://localhost:${port}`;
  return `<!DOCTYPE html>
<html>
<head>
<script type="importmap">
{"imports":{"three":"${base}/three.module.js"}}
</script>
</head>
<body>
<script type="module">
import * as THREE from 'three';
import { OBJLoader } from '${base}/OBJLoader.js';
import { MTLLoader } from '${base}/MTLLoader.js';
window.THREE = THREE;
window.OBJLoader = OBJLoader;
window.MTLLoader = MTLLoader;
window.__ready = true;
</script>
</body>
</html>`;
}

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
 * Render a single creature's OBJ into a sprite sheet data URL.
 * Runs inside the Playwright browser context.
 */
const RENDER_FN = async (objUrl: string, mtlUrl: string | null, textureUrl: string | null) => {
  const THREE = (window as any).THREE;
  const OBJLoader = (window as any).OBJLoader;
  const MTLLoader = (window as any).MTLLoader;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(128, 128);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();

  // Orthographic camera — 45° elevation for a 2.5D top-down look
  const cam = new THREE.OrthographicCamera(-0.7, 0.7, 0.7, -0.7, 0.01, 100);
  const elev = (45 * Math.PI) / 180;
  cam.position.set(0, Math.sin(elev) * 2, Math.cos(elev) * 2);
  cam.lookAt(0, 0, 0);

  // Lighting — bright, even illumination so colors pop
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.copy(cam.position);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
  fillLight.position.set(-1, 0.5, -1);
  scene.add(fillLight);
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
  rimLight.position.set(0, -0.3, 1);
  scene.add(rimLight);

  // Load MTL materials first (if available), then OBJ
  const objLoader = new OBJLoader();
  if (mtlUrl) {
    const mtlLoader = new MTLLoader();
    const materials = await new Promise<any>((res, rej) => {
      mtlLoader.load(mtlUrl, res, undefined, rej);
    });
    materials.preload();
    objLoader.setMaterials(materials);
  }

  // If texture URL is available, load it and apply to all meshes
  let texture: any = null;
  if (textureUrl) {
    texture = await new Promise<any>((res, rej) => {
      new THREE.TextureLoader().load(textureUrl, res, undefined, rej);
    });
    texture.colorSpace = THREE.SRGBColorSpace;
  }

  const model = await new Promise<any>((res, rej) => {
    objLoader.load(objUrl, res, undefined, rej);
  });
  scene.add(model);

  // Apply texture to all meshes — override MTL materials to ensure texture is used
  if (texture) {
    model.traverse((child: any) => {
      if (child.isMesh) {
        const mat = child.material;
        if (mat && mat.map !== texture) {
          mat.map = texture;
          mat.color = new THREE.Color(0xffffff);
          mat.needsUpdate = true;
        }
        if (!mat) {
          child.material = new THREE.MeshStandardMaterial({ map: texture });
        }
      }
    });
  }

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
  port: number,
): Promise<Buffer> {
  const objPath = join(MODELS_DIR, `${creatureKey}.obj`);
  const mtlPath = join(MODELS_DIR, `${creatureKey}.mtl`);
  const texPath = join(MODELS_DIR, `${creatureKey}_texture.png`);
  const hasMtl = existsSync(mtlPath);
  const hasTex = existsSync(texPath);

  const base = `http://localhost:${port}`;

  page.on("pageerror", (err) => console.error(`  [browser error]`, err.message));
  await page.goto(`${base}/render.html`);
  await page.waitForFunction(() => (window as any).__ready, { timeout: 15000 });

  const dataUrl = await page.evaluate(
    (args: { fn: string; objUrl: string; mtlUrl: string | null; textureUrl: string | null }) => {
      // eslint-disable-next-line no-eval
      const renderFn = eval(`(${args.fn})`);
      return renderFn(args.objUrl, args.mtlUrl, args.textureUrl);
    },
    {
      fn: RENDER_FN.toString(),
      objUrl: `${base}/model.obj`,
      mtlUrl: hasMtl ? `${base}/model.mtl` : null,
      textureUrl: hasTex ? `${base}/texture.png` : null,
    },
  );

  // Convert data URL to buffer
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return Buffer.from(base64, "base64");
}

/**
 * Create a local HTTP server that serves the files needed for rendering.
 * The MTL file is rewritten to point texture paths to the server's texture URL.
 */
function createRenderServer(port: number, creatureKey: string): Promise<import("node:http").Server> {
  const objPath = join(MODELS_DIR, `${creatureKey}.obj`);
  const mtlPath = join(MODELS_DIR, `${creatureKey}.mtl`);
  const texPath = join(MODELS_DIR, `${creatureKey}_texture.png`);
  const hasMtl = existsSync(mtlPath);
  const hasTex = existsSync(texPath);

  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    try {
      if (url === "/render.html") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderHtml(port));
      } else if (url === "/three.module.js") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(readFileSync(THREE_PATH));
      } else if (url === "/three.core.js") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(readFileSync(THREE_CORE_PATH));
      } else if (url === "/OBJLoader.js") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(readFileSync(OBJ_LOADER_PATH));
      } else if (url === "/MTLLoader.js") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(readFileSync(MTL_LOADER_PATH));
      } else if (url === "/model.obj") {
        res.writeHead(200, { "Content-Type": "model/obj" });
        res.end(readFileSync(objPath));
      } else if (url === "/model.mtl" && hasMtl) {
        const mtlContent = readFileSync(mtlPath, "utf-8");
        const rewritten = mtlContent.replace(
          /map_Kd\s+\S+/g,
          hasTex ? `map_Kd http://localhost:${port}/texture.png` : "map_Kd",
        );
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(rewritten);
      } else if (url === "/texture.png" && hasTex) {
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(readFileSync(texPath));
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    } catch (err) {
      console.error(`  [server] error serving ${url}:`, err);
      res.writeHead(500);
      res.end("Internal error");
    }
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
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
      const objPath = join(MODELS_DIR, `${key}.obj`);
      const outPath = join(OUTPUT_DIR, `${key}.png`);
      const objExists = existsSync(objPath);
      const outExists = existsSync(outPath);
      console.log(`  ${objExists ? "[OBJ]" : "[NO OBJ]"} ${key} → ${outExists ? "EXISTS" : "would render"} ${outPath}`);
    }
    return;
  }

  // Check all OBJ files exist first
  const missing = creatures.filter((k) => !existsSync(join(MODELS_DIR, `${k}.obj`)));
  if (missing.length > 0) {
    console.error(`  [ERROR] Missing OBJ files: ${missing.join(", ")}`);
    console.error(`  Run "pnpm tsx scripts/generate-creature-3d.ts" first.`);
    process.exit(1);
  }

  // Launch browser with WebGL software rendering (SwiftShader) — headless Chromium
  // loses WebGL context without these flags, producing blank/transparent output.
  console.log("  Launching headless Chromium (SwiftShader WebGL)...");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
    ],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  let success = 0;
  let failed = 0;
  let port = 18080;

  for (const key of creatures) {
    const outPath = join(OUTPUT_DIR, `${key}.png`);

    if (existsSync(outPath)) {
      console.log(`  [SKIP] ${key} — sprite sheet already exists`);
      success++;
      continue;
    }

    console.log(`  [RENDER] ${key}...`);

    // Create a dedicated HTTP server for this creature
    const server = await createRenderServer(port, key);

    try {
      const pngBuf = await renderCreature(page, key, port);
      mkdirSync(OUTPUT_DIR, { recursive: true });
      writeFileSync(outPath, pngBuf);
      console.log(`         saved: ${outPath} (${(pngBuf.length / 1024).toFixed(0)} KB)`);
      success++;
    } catch (err) {
      console.error(`  [FAIL] ${key}: ${err}`);
      failed++;
    } finally {
      server.close();
      port++;
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
