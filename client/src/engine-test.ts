import { Engine } from "./engine/engine";
import type { TileData, LightData, SpriteData } from "./engine/types";
import { hexToPixel, hexInRange } from "./engine/hexgrid";
import { Ease } from "./engine/tween";
import { generateCharSprite } from "./game/chargen-engine";

const canvas = document.getElementById("game") as HTMLCanvasElement;

const engine = new Engine(canvas, {
  width: window.innerWidth,
  height: window.innerHeight,
  postfx: true,
});

// ---- Build the world: office building in center, grass field around ----
// Hex grid covers a large area. Office is a rectangular region in the center.
// texIndex: 0=wood floor, 1=grass, 2=sand, 3=stone, 4=wall
const RADIUS = 40;
const hexes = hexInRange({ q: 0, r: 0 }, RADIUS);

// Office bounds in hex coords (roughly rectangular)
const OFFICE_Q_MIN = -5;
const OFFICE_Q_MAX = 5;
const OFFICE_R_MIN = -4;
const OFFICE_R_MAX = 4;

function isOfficeInterior(q: number, r: number): boolean {
  return q > OFFICE_Q_MIN && q < OFFICE_Q_MAX && r > OFFICE_R_MIN && r < OFFICE_R_MAX;
}

function isOfficeWall(q: number, r: number): boolean {
  // Wall on perimeter of office rectangle, with a door gap at the bottom
  const onPerimeter =
    (q === OFFICE_Q_MIN || q === OFFICE_Q_MAX) && r >= OFFICE_R_MIN && r <= OFFICE_R_MAX ||
    (r === OFFICE_R_MIN || r === OFFICE_R_MAX) && q >= OFFICE_Q_MIN && q <= OFFICE_Q_MAX;
  if (!onPerimeter) return false;
  // Door gap at bottom center (2 tiles wide)
  if (r === OFFICE_R_MAX && (q === 0 || q === 1)) return false;
  return true;
}

const GRASS_RADIUS = 15;
const SAND_RADIUS = 28;

const tiles: TileData[] = hexes.map((hex) => {
  const dist = Math.max(Math.abs(hex.q), Math.abs(hex.r), Math.abs(-hex.q - hex.r));
  const noise = Math.sin(hex.q * 2.1) * Math.cos(hex.r * 1.7);
  let texIndex: number;
  let tintR: number, tintG: number, tintB: number;
  let elevation = 0;

  if (isOfficeWall(hex.q, hex.r)) {
    texIndex = 4; // wall
    tintR = 0.75; tintG = 0.72; tintB = 0.68;
    elevation = 2; // raised walls
  } else if (isOfficeInterior(hex.q, hex.r)) {
    texIndex = 0; // wood floor
    tintR = 0.85 + noise * 0.05;
    tintG = 0.80 + noise * 0.05;
    tintB = 0.72 + noise * 0.04;
  } else if (dist <= GRASS_RADIUS) {
    texIndex = 1; // grass
    tintR = 0.55 + noise * 0.15;
    tintG = 0.70 + noise * 0.12;
    tintB = 0.40 + noise * 0.10;
  } else if (dist <= SAND_RADIUS) {
    texIndex = 2; // sand
    tintR = 0.80 + noise * 0.08;
    tintG = 0.72 + noise * 0.06;
    tintB = 0.55 + noise * 0.05;
  } else {
    texIndex = 3; // stone
    tintR = 0.50 + noise * 0.08;
    tintG = 0.50 + noise * 0.08;
    tintB = 0.52 + noise * 0.08;
  }

  return {
    q: hex.q,
    r: hex.r,
    elevation,
    texIndex,
    tintR, tintG, tintB,
    animFrame: 0,
  };
});

// ---- Generate 5 tile textures packed in a 1280x256 canvas ----
// texIndex 0=wood floor, 1=grass, 2=sand, 3=stone, 4=wall
const tileCanvas = document.createElement("canvas");
tileCanvas.width = 1280;
tileCanvas.height = 256;
const tctx = tileCanvas.getContext("2d")!;
const TILE_SIZE = 256;

// 0: Wood floor (office)
let tx = 0;
let grad = tctx.createLinearGradient(tx, 0, tx + TILE_SIZE, TILE_SIZE);
grad.addColorStop(0, "rgb(180, 160, 130)");
grad.addColorStop(0.5, "rgb(160, 140, 110)");
grad.addColorStop(1, "rgb(140, 120, 95)");
tctx.fillStyle = grad;
tctx.fillRect(tx, 0, TILE_SIZE, TILE_SIZE);
tctx.strokeStyle = "rgba(100, 80, 60, 0.4)";
tctx.lineWidth = 1;
for (let i = 0; i < TILE_SIZE; i += 32) {
  tctx.beginPath(); tctx.moveTo(tx, i); tctx.lineTo(tx + TILE_SIZE, i); tctx.stroke();
}
for (let i = 0; i < 400; i++) {
  const v = Math.random() * 30 - 15;
  tctx.fillStyle = `rgba(${Math.max(0,160+v)},${Math.max(0,140+v)},${Math.max(0,110+v)},0.4)`;
  tctx.fillRect(tx + Math.random()*TILE_SIZE, Math.random()*TILE_SIZE, 1, 1);
}

// 1: Grass
tx = 256;
grad = tctx.createRadialGradient(tx + 128, 128, 0, tx + 128, 128, 150);
grad.addColorStop(0, "rgb(90, 140, 70)");
grad.addColorStop(0.5, "rgb(70, 110, 55)");
grad.addColorStop(1, "rgb(50, 85, 40)");
tctx.fillStyle = grad;
tctx.fillRect(tx, 0, TILE_SIZE, TILE_SIZE);
for (let i = 0; i < 600; i++) {
  const v = Math.random() * 40 - 20;
  tctx.fillStyle = `rgba(${Math.max(0,70+v)},${Math.max(0,110+v)},${Math.max(0,55+v)},0.5)`;
  tctx.fillRect(tx + Math.random()*TILE_SIZE, Math.random()*TILE_SIZE, 2, 2);
}

// 2: Sand
tx = 512;
grad = tctx.createLinearGradient(tx, 0, tx + TILE_SIZE, TILE_SIZE);
grad.addColorStop(0, "rgb(210, 190, 140)");
grad.addColorStop(0.5, "rgb(195, 175, 130)");
grad.addColorStop(1, "rgb(180, 160, 115)");
tctx.fillStyle = grad;
tctx.fillRect(tx, 0, TILE_SIZE, TILE_SIZE);
for (let i = 0; i < 500; i++) {
  const v = Math.random() * 25 - 12;
  tctx.fillStyle = `rgba(${Math.max(0,195+v)},${Math.max(0,175+v)},${Math.max(0,130+v)},0.4)`;
  tctx.fillRect(tx + Math.random()*TILE_SIZE, Math.random()*TILE_SIZE, 1, 1);
}

// 3: Stone
tx = 768;
grad = tctx.createLinearGradient(tx, 0, tx + TILE_SIZE, TILE_SIZE);
grad.addColorStop(0, "rgb(130, 130, 135)");
grad.addColorStop(0.5, "rgb(115, 115, 120)");
grad.addColorStop(1, "rgb(100, 100, 105)");
tctx.fillStyle = grad;
tctx.fillRect(tx, 0, TILE_SIZE, TILE_SIZE);
for (let i = 0; i < 400; i++) {
  const v = Math.random() * 30 - 15;
  tctx.fillStyle = `rgba(${Math.max(0,115+v)},${Math.max(0,115+v)},${Math.max(0,120+v)},0.4)`;
  tctx.fillRect(tx + Math.random()*TILE_SIZE, Math.random()*TILE_SIZE, 2, 2);
}
tctx.strokeStyle = "rgba(70, 70, 75, 0.3)";
tctx.lineWidth = 1;
for (let i = 0; i < 8; i++) {
  tctx.beginPath();
  tctx.moveTo(tx + Math.random()*TILE_SIZE, Math.random()*TILE_SIZE);
  tctx.lineTo(tx + Math.random()*TILE_SIZE, Math.random()*TILE_SIZE);
  tctx.stroke();
}

// 4: Wall (office exterior wall)
tx = 1024;
grad = tctx.createLinearGradient(tx, 0, tx, TILE_SIZE);
grad.addColorStop(0, "rgb(200, 195, 185)");
grad.addColorStop(0.5, "rgb(180, 175, 165)");
grad.addColorStop(1, "rgb(160, 155, 145)");
tctx.fillStyle = grad;
tctx.fillRect(tx, 0, TILE_SIZE, TILE_SIZE);
// Brick pattern
tctx.strokeStyle = "rgba(120, 110, 100, 0.5)";
tctx.lineWidth = 2;
for (let row = 0; row < 8; row++) {
  const y = row * 32;
  tctx.beginPath(); tctx.moveTo(tx, y); tctx.lineTo(tx + TILE_SIZE, y); tctx.stroke();
  const offset = row % 2 === 0 ? 0 : 32;
  for (let bx = offset; bx < TILE_SIZE; bx += 64) {
    tctx.beginPath(); tctx.moveTo(tx + bx, y); tctx.lineTo(tx + bx, y + 32); tctx.stroke();
  }
}

const tileRegion = engine.atlas.addCanvas("tiles", tileCanvas);
if (tileRegion) {
  engine.tiles.tileUVOffset = [tileRegion.u, tileRegion.v, tileRegion.w, tileRegion.h];
}

// ---- Add warm overhead office lights (inside the building) ----
const lights: { data: LightData; hex: { q: number; r: number } }[] = [
  { hex: { q: 0, r: 0 }, data: { x: 0, y: 0, z: 40, r: 1.0, g: 0.92, b: 0.78, radius: 180, intensity: 1.5 } },
  { hex: { q: 3, r: -2 }, data: { x: 0, y: 0, z: 40, r: 1.0, g: 0.92, b: 0.78, radius: 160, intensity: 1.3 } },
  { hex: { q: -3, r: 2 }, data: { x: 0, y: 0, z: 40, r: 1.0, g: 0.92, b: 0.78, radius: 160, intensity: 1.3 } },
  { hex: { q: 0, r: 3 }, data: { x: 0, y: 0, z: 40, r: 1.0, g: 0.92, b: 0.78, radius: 160, intensity: 1.3 } },
  { hex: { q: -4, r: -2 }, data: { x: 0, y: 0, z: 40, r: 0.9, g: 0.85, b: 0.7, radius: 140, intensity: 1.0 } },
  { hex: { q: 4, r: 1 }, data: { x: 0, y: 0, z: 40, r: 0.9, g: 0.85, b: 0.7, radius: 140, intensity: 1.0 } },
];

for (const l of lights) {
  const pos = hexToPixel(l.hex.q, l.hex.r);
  l.data.x = pos.x;
  l.data.y = pos.y;
  engine.lights.addLight(l.data);
}

engine.lights.setAmbient(0.75, 0.73, 0.70);

// ---- Generate character sprites ----
const charSprite = generateCharSprite(engine.atlas, "boss", {
  skin: 0, hair: 0, shirt: 0, pants: 0,
  hairStyle: 0, accessory: 0, eyeColor: 0, headFeature: 0, beard: 0,
  accent: 0,
});

// Place character sprites inside the office
const agentPositions = [
  { q: 0, r: 0, name: "Boss" },
  { q: 2, r: -1, name: "Agent 1" },
  { q: -2, r: 1, name: "Agent 2" },
  { q: 3, r: 2, name: "Agent 3" },
  { q: -3, r: -2, name: "Agent 4" },
];

const agentSprites: number[] = [];
if (charSprite) {
  for (const ap of agentPositions) {
    const pos = hexToPixel(ap.q, ap.r);
    const frame = charSprite.frames[0][6]; // dir=down, pose=idle
    const id = engine.sprites.add({
      x: pos.x,
      y: pos.y,
      z: 0,
      u: frame.u,
      v: frame.v,
      w: frame.w,
      h: frame.h,
      displayW: 24,
      displayH: 36,
      tintR: 1, tintG: 1, tintB: 1,
      alpha: 1,
      flip: 0,
      visible: true,
      fixedToScreen: false,
    } as Omit<SpriteData, "id">);
    agentSprites.push(id);
  }
}

// Animate agents: cycle through walk poses
let animTime = 0;
const ANIM_FPS = 8;

// ---- Camera setup: top-down orthographic view ----
engine.camera.setCenter(0, 0);
engine.camera.setModeInstant("topdown", 0.6);

// ---- Input handling ----
let isDragging = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener("pointerdown", (e) => {
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});

canvas.addEventListener("pointermove", (e) => {
  if (!isDragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  engine.camera.pan(-dx, -dy);
});

canvas.addEventListener("pointerup", () => { isDragging = false; });
canvas.addEventListener("pointerleave", () => { isDragging = false; });

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const wheel = engine.input.getWheel();
  if (wheel < 0 || e.deltaY > 0) engine.camera.zoomBy(0.9);
  else engine.camera.zoomBy(1.1);
});

window.addEventListener("keydown", (e) => {
  switch (e.key) {
    case "1":
      engine.camera.setMode("topdown", engine.tweens, 800);
      engine.postfx?.setDOFStrength(0);
      break;
    case "2":
      engine.camera.setMode("diorama", engine.tweens, 800);
      engine.postfx?.setDOFStrength(0.5);
      engine.postfx?.setDOFMode(1);
      break;
    case "3":
      engine.camera.setMode("cinematic", engine.tweens, 800);
      engine.postfx?.setDOFStrength(0.7);
      engine.postfx?.setDOFMode(1);
      break;
    case " ":
      // Toggle post-processing
      if (engine.postfx) {
        engine.postfx.setEnabled(!(
          engine.get("postfxEnabled") ?? true
        ));
        engine.set("postfxEnabled", engine.get("postfxEnabled") === false);
      }
      break;
  }
});

// ---- Cinematic auto-tour (camera mode 3) ----
let tourAngle = 0;
let tourTimer = 0;
const tourPoints = [
  { q: 0, r: 0, label: "Center" },
  { q: 3, r: -2, label: "NE ridge" },
  { q: -2, r: 3, label: "SW valley" },
  { q: 0, r: 5, label: "South lights" },
];
let tourIdx = 0;

// ---- Scene update + render hooks ----
engine.onUpdate = (dt) => {
  updateTour(dt * 1000);

  // Animate character sprites — cycle through walk poses (0-5)
  animTime += dt;
  if (charSprite && agentSprites.length > 0) {
    const pose = Math.floor(animTime * ANIM_FPS) % 6;
    const frame = charSprite.frames[0]?.[pose];
    if (frame) {
      for (const id of agentSprites) {
        const sprite = engine.sprites.get(id);
        if (sprite) {
          sprite.u = frame.u;
          sprite.v = frame.v;
          sprite.w = frame.w;
          sprite.h = frame.h;
        }
      }
    }
  }
};

engine.onRender = (time) => {
  const gl = (engine as any).gl as WebGL2RenderingContext;
  const dpr = (engine as any).opts.dpr ?? 1;
  const w = (engine as any).opts.width * dpr;
  const h = (engine as any).opts.height * dpr;

  gl.viewport(0, 0, w, h);

  if (engine.postfx) {
    engine.postfx.bindSceneFBO();
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error("Scene FBO incomplete:", status);
      return;
    }
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0.53, 0.72, 0.88, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  const glErr = gl.getError();
  if (glErr !== gl.NO_ERROR) {
    console.error("GL error before render:", glErr);
  }

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);

  const viewProj = engine.camera.getViewProjMatrix() as Float32Array;

  // Upload lights
  const ambient = engine.lights.getAmbient();
  const lightCount = engine.lights.getLightCount();
  const lightArr = engine.lights.getLights();
  const posData = new Float32Array(Math.max(lightCount, 1) * 3);
  const colorData = new Float32Array(Math.max(lightCount, 1) * 3);
  const radiusData = new Float32Array(Math.max(lightCount, 1));
  const intensityData = new Float32Array(Math.max(lightCount, 1));
  for (let i = 0; i < lightCount; i++) {
    const l = lightArr[i];
    posData[i * 3] = l.x; posData[i * 3 + 1] = l.y; posData[i * 3 + 2] = l.z;
    colorData[i * 3] = l.r; colorData[i * 3 + 1] = l.g; colorData[i * 3 + 2] = l.b;
    radiusData[i] = l.radius; intensityData[i] = l.intensity;
  }
  engine.tiles.setLightUniforms(
    [ambient.r, ambient.g, ambient.b],
    lightCount, posData, colorData, radiusData, intensityData,
  );

  engine.atlas.bind(0);
  engine.shadows.render(viewProj);
  engine.tiles.render(tiles, viewProj, time, 0);
  engine.sprites.render(viewProj, 0);

  if (engine.postfx) {
    engine.postfx.render(time);
  }
};

// ---- Cinematic tour logic ----
function updateTour(dt: number) {
  if (engine.camera.getMode() !== "cinematic") return;
  tourTimer += dt;
  if (tourTimer > 4000) {
    tourTimer = 0;
    tourIdx = (tourIdx + 1) % tourPoints.length;
    const target = tourPoints[tourIdx];
    const pos = hexToPixel(target.q, target.r);
    engine.tweens.add({
      target: engine.camera,
      props: {},
      duration: 1500,
      ease: Ease.easeInOutCubic,
      onUpdate: () => {
        const center = engine.camera.getCenter();
        const lerp = 0.05;
        engine.camera.setCenter(
          center.x + (pos.x - center.x) * lerp,
          center.y + (pos.y - center.y) * lerp,
        );
      },
    });
  }
  tourAngle += dt * 0.0003;
  const center = engine.camera.getCenter();
  engine.camera.setCenter(
    center.x + Math.cos(tourAngle) * 0.3,
    center.y + Math.sin(tourAngle) * 0.3,
  );
}

// ---- Resize handling ----
window.addEventListener("resize", () => {
  engine.resize(window.innerWidth, window.innerHeight);
});

// ---- Emit some particles periodically for visual interest ----
setInterval(() => {
  const lightHex = lights[Math.floor(Math.random() * lights.length)];
  const pos = hexToPixel(lightHex.hex.q, lightHex.hex.r);
  engine.particles.embers(pos.x, pos.y, 4);
}, 2000);

console.log("HexStage engine running. Controls: drag=pan, scroll=zoom, 1/2/3=camera modes, space=toggle postfx");
console.log("Office:", OFFICE_Q_MIN, "to", OFFICE_Q_MAX, "q,", OFFICE_R_MIN, "to", OFFICE_R_MAX, "r");

engine.start();
