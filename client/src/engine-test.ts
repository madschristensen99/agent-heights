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

// ---- Cinematic auto-tour (camera mode 3) ----
const CENTER = { q: 0, r: 0 };
const RADIUS = 8;
const hexes = hexInRange(CENTER, RADIUS);

const tiles: TileData[] = hexes.map((hex) => {
  const dist = Math.abs(hex.q) + Math.abs(hex.r) + Math.abs(-hex.q - hex.r);
  const elevation = dist > 5 ? (dist - 5) * 0.5 : 0;
  const noise = Math.sin(hex.q * 2.1) * Math.cos(hex.r * 1.7);
  return {
    q: hex.q,
    r: hex.r,
    elevation,
    texIndex: Math.floor(Math.abs(noise) * 4),
    tintR: 0.4 + noise * 0.2,
    tintG: 0.5 + noise * 0.15,
    tintB: 0.3 + noise * 0.1,
    animFrame: 0,
  };
});

// ---- Generate a procedural atlas texture ----
// Atlas is 2048x2048, shader samples UV 0-1 across full atlas,
// so we fill the entire canvas with visible color
const atlasCanvas = document.createElement("canvas");
atlasCanvas.width = 2048;
atlasCanvas.height = 2048;
const actx = atlasCanvas.getContext("2d")!;

// Fill with a visible green gradient
const grad = actx.createRadialGradient(1024, 1024, 0, 1024, 1024, 1200);
grad.addColorStop(0, "rgb(80, 120, 70)");
grad.addColorStop(0.5, "rgb(50, 90, 55)");
grad.addColorStop(1, "rgb(30, 60, 40)");
actx.fillStyle = grad;
actx.fillRect(0, 0, 2048, 2048);

// Add noise pixels for texture
for (let i = 0; i < 2000; i++) {
  const px = Math.random() * 2048;
  const py = Math.random() * 2048;
  const v = Math.random() * 40 - 20;
  actx.fillStyle = `rgba(${Math.max(0, 50 + v)},${Math.max(0, 90 + v)},${Math.max(0, 55 + v)},0.6)`;
  actx.fillRect(px, py, 3, 3);
}

engine.atlas.addCanvas("tiles", atlasCanvas);

// ---- Add some lights ----
const lights: { data: LightData; hex: { q: number; r: number } }[] = [
  { hex: { q: 2, r: -1 }, data: { x: 0, y: 0, z: 20, r: 0.9, g: 0.6, b: 0.2, radius: 120, intensity: 1.2 } },
  { hex: { q: -3, r: 2 }, data: { x: 0, y: 0, z: 20, r: 0.2, g: 0.7, b: 0.9, radius: 100, intensity: 1.0 } },
  { hex: { q: 0, r: 4 }, data: { x: 0, y: 0, z: 20, r: 0.8, g: 0.2, b: 0.3, radius: 110, intensity: 0.9 } },
  { hex: { q: 5, r: 0 }, data: { x: 0, y: 0, z: 20, r: 0.5, g: 0.9, b: 0.3, radius: 90, intensity: 0.8 } },
];

for (const l of lights) {
  const pos = hexToPixel(l.hex.q, l.hex.r);
  l.data.x = pos.x;
  l.data.y = pos.y;
  engine.lights.addLight(l.data);
}

engine.lights.setAmbient(0.25, 0.28, 0.35);

// ---- Generate character sprites ----
const charSprite = generateCharSprite(engine.atlas, "boss", {
  skin: 0, hair: 0, shirt: 0, pants: 0,
  hairStyle: 0, accessory: 0, eyeColor: 0, headFeature: 0, beard: 0,
  accent: 0,
});

// Place a few character sprites on the grid
const agentPositions = [
  { q: 0, r: 0, name: "Boss" },
  { q: 1, r: -1, name: "Agent 1" },
  { q: -1, r: 1, name: "Agent 2" },
  { q: 2, r: 1, name: "Agent 3" },
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

// ---- Camera setup: start in diorama mode ----
engine.camera.setCenter(0, 0);
engine.camera.setMode("diorama", engine.tweens, 0);

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
    for (const id of agentSprites) {
      const sprite = engine.sprites.get(id);
      if (sprite) {
        const frame = charSprite.frames[0][pose];
        sprite.u = frame.u;
        sprite.v = frame.v;
        sprite.w = frame.w;
        sprite.h = frame.h;
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
    gl.clearColor(0.05, 0.06, 0.1, 1.0);
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

engine.start();
