/**
 * Character Component Sprite Renderer (3D → 2D Grayscale)
 *
 * Renders 3D OBJ models of character components (hair, beard, shirt, etc.)
 * into grayscale transparent PNG sprite frames using Playwright (headless
 * Chromium) + Three.js for WebGL rendering.
 *
 * Pipeline per component:
 *   1. Load OBJ file from scripts/assets/component-models/{type}_{style}/
 *   2. Set up Three.js scene with orthographic camera (angled top-down view
 *      matching the character sprite perspective)
 *   3. For each of 3 directions (down, right, up) × 8 poses (walk + idle + blink):
 *      a. Rotate model around Y axis for direction
 *      b. Apply procedural animation transform (bob, sway) matching char-draw.ts
 *      c. Render to 64×96 WebGL canvas
 *      d. Convert to grayscale with transparency
 *   4. Save individual frames as PNGs to client/public/assets/ai/char/{type}/{style}/
 *      Frame naming: {style}_{dir}_{pose}.png (e.g. spiky_down_0.png)
 *
 * The grayscale output is compatible with the existing CharComponentProvider
 * system — at runtime, stampComponent() tints the grayscale pixels to the
 * target color (hair color, shirt color, etc.).
 *
 * Component positioning: each component type has a Y-offset to position the
 * 3D model in the correct area of the 64×96 frame (hair at top, pants at bottom).
 *
 * Usage:
 *   pnpm tsx scripts/render-component-sprites.ts                    # render all
 *   pnpm tsx scripts/render-component-sprites.ts --component hair    # hair only
 *   pnpm tsx scripts/render-component-sprites.ts --filter spiky      # filter by style
 *   pnpm tsx scripts/render-component-sprites.ts --dry-run           # list without rendering
 *
 * Requires: npx playwright install chromium
 * Output: client/public/assets/ai/char/{type}/{style}/ (24 PNG frames per component)
 */
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "playwright";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_DIR = join(ROOT, "scripts", "assets", "component-models");
const OUTPUT_DIR = join(ROOT, "client", "public", "assets", "ai", "char");

const THREE_PATH = join(ROOT, "node_modules", "three", "build", "three.module.js");
const THREE_CORE_PATH = join(ROOT, "node_modules", "three", "build", "three.core.js");
const OBJ_LOADER_PATH = join(ROOT, "node_modules", "three", "examples", "jsm", "loaders", "OBJLoader.js");
const MTL_LOADER_PATH = join(ROOT, "node_modules", "three", "examples", "jsm", "loaders", "MTLLoader.js");

const FRAME_W = 64;
const FRAME_H = 96;
const SHEET_COLS = 8;
const SHEET_DIRS = ["down", "right", "up"] as const;

try {
  const envPath = resolve(ROOT, ".env");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {}

type ComponentType = "hair" | "beard" | "shirt" | "pants" | "accessory" | "headFeature";

const COMPONENT_Y_OFFSET: Record<ComponentType, number> = {
  hair: 0.25,
  beard: 0.0,
  shirt: -0.15,
  pants: -0.30,
  accessory: 0.25,
  headFeature: 0.30,
};

const COMPONENT_SCALE: Record<ComponentType, number> = {
  hair: 2.5,
  beard: 1.5,
  shirt: 2.0,
  pants: 2.0,
  accessory: 1.8,
  headFeature: 1.8,
};

interface ComponentDef {
  type: ComponentType;
  key: string;
}

function discoverComponents(): ComponentDef[] {
  const defs: ComponentDef[] = [];
  if (!existsSync(MODELS_DIR)) return defs;

  for (const entry of readdirSync(MODELS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const objFile = join(MODELS_DIR, entry.name, "model.obj");
    if (!existsSync(objFile)) continue;

    const knownTypes: ComponentType[] = ["hair", "beard", "shirt", "pants", "accessory", "headFeature"];
    for (const t of knownTypes) {
      const prefix = `${t}_`;
      if (entry.name.startsWith(prefix)) {
        const key = entry.name.slice(prefix.length);
        defs.push({ type: t, key });
        break;
      }
    }
  }
  return defs;
}

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

function parseArgs(): { component?: ComponentType; filter?: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let component: ComponentType | undefined;
  let filter: string | undefined;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--component" && args[i + 1]) component = args[i + 1] as ComponentType;
    if (args[i] === "--filter" && args[i + 1]) filter = args[i + 1];
    if (args[i] === "--dry-run") dryRun = true;
  }
  return { component, filter, dryRun };
}

const RENDER_FN = async (
  objUrl: string,
  mtlUrl: string | null,
  textureUrl: string | null,
  yOffset: number,
  scaleMul: number,
) => {
  const THREE = (window as any).THREE;
  const OBJLoader = (window as any).OBJLoader;
  const MTLLoader = (window as any).MTLLoader;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(64, 96);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();

  const cam = new THREE.OrthographicCamera(-0.5, 0.5, 0.75, -0.75, 0.01, 100);
  const elev = (15 * Math.PI) / 180;
  cam.position.set(0, Math.sin(elev) * 2, Math.cos(elev) * 2);
  cam.lookAt(0, 0, 0);

  const objLoader = new OBJLoader();
  if (mtlUrl) {
    const mtlLoader = new MTLLoader();
    const materials = await new Promise<any>((res, rej) => {
      mtlLoader.load(mtlUrl, res, undefined, rej);
    });
    materials.preload();
    objLoader.setMaterials(materials);
  }

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

  if (texture) {
    model.traverse((child: any) => {
      if (child.isMesh) {
        child.material = new THREE.MeshBasicMaterial({ map: texture });
      }
    });
  }

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const xzDiag = Math.sqrt(size.x * size.x + size.z * size.z);
  const maxDim = Math.max(size.y, xzDiag, 0.001);
  const scale = (1.1 / maxDim) * scaleMul;
  model.scale.setScalar(scale);
  model.position.x = -center.x * scale;
  model.position.z = -center.z * scale;
  const baseY = -center.y * scale + yOffset;
  model.position.y = baseY;

  const dirRotations: Record<string, number> = {
    down: 0,
    right: -Math.PI / 2,
    up: Math.PI,
  };

  const animTransforms = [
    { yOff: 0,      scaleY: 1.0,  rotZ: 0 },
    { yOff: 0.015,  scaleY: 0.98, rotZ: 0.02 },
    { yOff: -0.01,  scaleY: 1.02, rotZ: -0.01 },
    { yOff: 0.015,  scaleY: 0.98, rotZ: -0.02 },
    { yOff: -0.01,  scaleY: 1.02, rotZ: 0.01 },
    { yOff: 0.005,  scaleY: 0.99, rotZ: 0 },
    { yOff: -0.005, scaleY: 1.0,  rotZ: 0 },
    { yOff: -0.005, scaleY: 1.0,  rotZ: 0 },
  ];

  const dirs = ["down", "right", "up"];
  const frames: { dir: string; pose: number; dataUrl: string }[] = [];

  for (const dir of dirs) {
    for (let pose = 0; pose < 8; pose++) {
      model.rotation.y = dirRotations[dir];
      model.rotation.z = animTransforms[pose].rotZ;
      model.position.y = baseY + animTransforms[pose].yOff;
      model.scale.y = scale * animTransforms[pose].scaleY;

      renderer.render(scene, cam);

      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 96;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(renderer.domElement, 0, 0);

      frames.push({ dir, pose, dataUrl: canvas.toDataURL("image/png") });
    }
  }

  return frames;
};

async function renderComponent(
  page: import("playwright").Page,
  def: ComponentDef,
  port: number,
): Promise<{ dir: string; pose: number; buffer: Buffer }[]> {
  const safeKey = def.key.replace(/ /g, "_");
  const dir = join(MODELS_DIR, `${def.type}_${safeKey}`);
  const objPath = join(dir, "model.obj");
  const mtlPath = join(dir, "model.mtl");
  const texPath = join(dir, "texture.png");
  const hasMtl = existsSync(mtlPath);
  const hasTex = existsSync(texPath);

  const base = `http://localhost:${port}`;

  page.on("pageerror", (err) => console.error(`  [browser error]`, err.message));
  await page.goto(`${base}/render.html`);
  await page.waitForFunction(() => (window as any).__ready, { timeout: 15000 });

  const yOffset = COMPONENT_Y_OFFSET[def.type];
  const scaleMul = COMPONENT_SCALE[def.type];

  const frameData = await page.evaluate(
    (args: { fn: string; objUrl: string; mtlUrl: string | null; textureUrl: string | null; yOffset: number; scaleMul: number }) => {
      const renderFn = eval(`(${args.fn})`);
      return renderFn(args.objUrl, args.mtlUrl, args.textureUrl, args.yOffset, args.scaleMul);
    },
    {
      fn: RENDER_FN.toString(),
      objUrl: `${base}/model.obj`,
      mtlUrl: hasMtl ? `${base}/model.mtl` : null,
      textureUrl: hasTex ? `${base}/texture.png` : null,
      yOffset,
      scaleMul,
    },
  );

  const frames: { dir: string; pose: number; buffer: Buffer }[] = [];
  for (const f of frameData as { dir: string; pose: number; dataUrl: string }[]) {
    const base64 = f.dataUrl.replace(/^data:image\/png;base64,/, "");
    frames.push({ dir: f.dir, pose: f.pose, buffer: Buffer.from(base64, "base64") });
  }
  return frames;
}

async function toGrayscale(input: Buffer): Promise<Buffer> {
  const image = sharp(input);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = info.channels >= 4 ? data[i + 3] : 255;

    if (a < 10) {
      if (info.channels >= 4) data[i + 3] = 0;
      continue;
    }

    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    if (gray < 30) {
      if (info.channels >= 4) data[i + 3] = 0;
      continue;
    }

    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
    if (info.channels >= 4) data[i + 3] = a;
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  }).png().toBuffer();
}

function createRenderServer(port: number, def: ComponentDef): Promise<import("node:http").Server> {
  const safeKey = def.key.replace(/ /g, "_");
  const dir = join(MODELS_DIR, `${def.type}_${safeKey}`);
  const objPath = join(dir, "model.obj");
  const mtlPath = join(dir, "model.mtl");
  const texPath = join(dir, "texture.png");
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

function allFramesExist(def: ComponentDef): boolean {
  const safeKey = def.key.replace(/ /g, "_");
  const dir = join(OUTPUT_DIR, def.type, safeKey);
  for (const d of SHEET_DIRS) {
    for (let p = 0; p < SHEET_COLS; p++) {
      if (!existsSync(join(dir, `${safeKey}_${d}_${p}.png`))) return false;
    }
  }
  return true;
}

async function main() {
  const { component, filter, dryRun } = parseArgs();

  let defs = discoverComponents();
  if (component) {
    defs = defs.filter((d) => d.type === component);
  }
  if (filter) {
    defs = defs.filter((d) => d.key.includes(filter));
  }

  console.log(`\nCharacter Component Sprite Renderer (3D → 2D Grayscale)`);
  console.log(`  ${defs.length} component(s) to render${filter ? ` (filter: "${filter}")` : ""}${dryRun ? " [DRY RUN]" : ""}\n`);

  if (defs.length === 0) {
    console.log(`  No 3D models found in ${MODELS_DIR}`);
    console.log(`  Run "pnpm tsx scripts/generate-component-3d.ts" first.`);
    return;
  }

  if (dryRun) {
    for (const def of defs) {
      const safeKey = def.key.replace(/ /g, "_");
      const outDir = join(OUTPUT_DIR, def.type, safeKey);
      const exists = allFramesExist(def);
      console.log(`  ${exists ? "[DONE]" : "[TODO]"} ${def.type}/${def.key} → ${outDir}`);
    }
    return;
  }

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
  let port = 18090;

  for (const def of defs) {
    const safeKey = def.key.replace(/ /g, "_");
    const outDir = join(OUTPUT_DIR, def.type, safeKey);

    if (allFramesExist(def)) {
      console.log(`  [SKIP] ${def.type}/${def.key} — all 24 frames already exist`);
      success++;
      continue;
    }

    console.log(`  [RENDER] ${def.type}/${def.key}...`);

    const server = await createRenderServer(port, def);

    try {
      const frames = await renderComponent(page, def, port);
      mkdirSync(outDir, { recursive: true });

      for (const f of frames) {
        const grayBuf = await toGrayscale(f.buffer);
        const outPath = join(outDir, `${safeKey}_${f.dir}_${f.pose}.png`);
        writeFileSync(outPath, grayBuf);
      }
      console.log(`         saved 24 frames to ${outDir}`);
      success++;
    } catch (err) {
      console.error(`  [FAIL] ${def.type}/${def.key}: ${err}`);
      failed++;
    } finally {
      server.close();
      port++;
    }
  }

  await browser.close();

  console.log(`\nDone! ${success} succeeded, ${failed} failed.`);
  console.log(`Next: run "pnpm pack-atlas" to rebuild the sprite atlas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
