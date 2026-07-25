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

// ---- Build the world: rectangular office building in center, grass field around ----
// Hex axial coords are sheared (60°), so we define the office as a rectangle in
// pixel space and classify each hex by its pixel center position.
// texIndex: 0=wood floor, 1=grass, 2=sand, 3=stone, 4=wall
const RADIUS = 22;
const hexes = hexInRange({ q: 0, r: 0 }, RADIUS);

// Office rectangle in pixel space (centered at origin)
const OFFICE_HALF_W = 320;
const OFFICE_HALF_H = 240;
const WALL_THICKNESS = 32; // hexes within this distance of the border are walls

function classifyOffice(q: number, r: number): "wall" | "floor" | "outside" {
  const pos = hexToPixel(q, r);
  const insideX = Math.abs(pos.x) < OFFICE_HALF_W;
  const insideY = Math.abs(pos.y) < OFFICE_HALF_H;
  if (!insideX || !insideY) return "outside";

  const distToEdgeX = OFFICE_HALF_W - Math.abs(pos.x);
  const distToEdgeY = OFFICE_HALF_H - Math.abs(pos.y);
  const minDistToEdge = Math.min(distToEdgeX, distToEdgeY);

  if (minDistToEdge < WALL_THICKNESS) {
    // Door gap at bottom center (y near +OFFICE_HALF_H, x near 0)
    if (pos.y > OFFICE_HALF_H - WALL_THICKNESS && Math.abs(pos.x) < 60) return "floor";
    return "wall";
  }
  return "floor";
}

const GRASS_RADIUS = 15;

const tiles: TileData[] = hexes.map((hex) => {
  const dist = Math.max(Math.abs(hex.q), Math.abs(hex.r), Math.abs(-hex.q - hex.r));
  const noise = Math.sin(hex.q * 2.1) * Math.cos(hex.r * 1.7);
  let texIndex: number;
  let tintR: number, tintG: number, tintB: number;
  let elevation = 0;

  const zone = classifyOffice(hex.q, hex.r);

  if (zone === "wall") {
    texIndex = 4; // wall
    tintR = 0.75; tintG = 0.72; tintB = 0.68;
    elevation = 2;
  } else if (zone === "floor") {
    texIndex = 0; // wood floor
    tintR = 0.85 + noise * 0.05;
    tintG = 0.80 + noise * 0.05;
    tintB = 0.72 + noise * 0.04;
  } else if (dist <= GRASS_RADIUS) {
    texIndex = 1; // grass
    tintR = 0.55 + noise * 0.15;
    tintG = 0.70 + noise * 0.12;
    tintB = 0.40 + noise * 0.10;
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

// 0: Wood floor (office) — warm, cozy
let tx = 0;
let grad = tctx.createLinearGradient(tx, 0, tx + TILE_SIZE, TILE_SIZE);
grad.addColorStop(0, "rgb(190, 170, 140)");
grad.addColorStop(0.5, "rgb(175, 155, 125)");
grad.addColorStop(1, "rgb(160, 140, 110)");
tctx.fillStyle = grad;
tctx.fillRect(tx, 0, TILE_SIZE, TILE_SIZE);
tctx.strokeStyle = "rgba(120, 100, 75, 0.3)";
tctx.lineWidth = 1;
for (let i = 0; i < TILE_SIZE; i += 48) {
  tctx.beginPath(); tctx.moveTo(tx, i); tctx.lineTo(tx + TILE_SIZE, i); tctx.stroke();
}
for (let i = 0; i < 300; i++) {
  const v = Math.random() * 25 - 12;
  tctx.fillStyle = `rgba(${Math.max(0,175+v)},${Math.max(0,155+v)},${Math.max(0,125+v)},0.3)`;
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

// 4: Wall (office exterior wall) — warm, soft
tx = 1024;
grad = tctx.createLinearGradient(tx, 0, tx, TILE_SIZE);
grad.addColorStop(0, "rgb(210, 200, 185)");
grad.addColorStop(0.5, "rgb(190, 180, 165)");
grad.addColorStop(1, "rgb(170, 160, 145)");
tctx.fillStyle = grad;
tctx.fillRect(tx, 0, TILE_SIZE, TILE_SIZE);
// Subtle brick pattern
tctx.strokeStyle = "rgba(140, 125, 110, 0.35)";
tctx.lineWidth = 1.5;
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

// Place a player character and a few NPCs inside the office
const playerPos = hexToPixel(0, 0);
const npcPositions = [
  { q: 2, r: -1, name: "Agent 1" },
  { q: -2, r: 1, name: "Agent 2" },
  { q: 3, r: 2, name: "Agent 3" },
  { q: -3, r: -2, name: "Agent 4" },
];

const agentSprites: number[] = [];
let playerSpriteId = -1;

if (charSprite) {
  // Player sprite (bigger)
  const frame = charSprite.frames[0][6]; // dir=down, pose=idle
  playerSpriteId = engine.sprites.add({
    x: playerPos.x,
    y: playerPos.y,
    z: 0,
    u: frame.u, v: frame.v, w: frame.w, h: frame.h,
    displayW: 32,
    displayH: 48,
    tintR: 1, tintG: 1, tintB: 1,
    alpha: 1, flip: 0, visible: true, fixedToScreen: false,
  } as Omit<SpriteData, "id">);

  // NPC sprites (smaller)
  for (const ap of npcPositions) {
    const pos = hexToPixel(ap.q, ap.r);
    const id = engine.sprites.add({
      x: pos.x,
      y: pos.y,
      z: 0,
      u: frame.u, v: frame.v, w: frame.w, h: frame.h,
      displayW: 24,
      displayH: 36,
      tintR: 0.9, tintG: 0.9, tintB: 1.0,
      alpha: 1, flip: 0, visible: true, fixedToScreen: false,
    } as Omit<SpriteData, "id">);
    agentSprites.push(id);
  }
}

// Animate agents: cycle through walk poses
let animTime = 0;
const ANIM_FPS = 8;

// ---- Camera setup: follow player, zoomed in ----
engine.camera.setCenter(playerPos.x, playerPos.y);
engine.camera.setModeInstant("topdown", 1.2);
engine.camera.follow(playerPos.x, playerPos.y);

// ---- Input handling ----
const keys: Record<string, boolean> = {};
let isDragging = false;
let lastX = 0;
let lastY = 0;

window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  // Camera mode shortcuts
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
      if (engine.postfx) {
        engine.postfx.setEnabled(!(
          engine.get("postfxEnabled") ?? true
        ));
        engine.set("postfxEnabled", engine.get("postfxEnabled") === false);
      }
      break;
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

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
  if (e.deltaY > 0) engine.camera.zoomBy(0.9);
  else engine.camera.zoomBy(1.1);
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

// ---- Player state ----
const PLAYER_SPEED = 120;
let playerX = playerPos.x;
let playerY = playerPos.y;
let playerDir = 0; // 0=down, 1=left, 2=right, 3=up
let playerMoving = false;
let playerAnimTime = 0;

// ---- Scene update + render hooks ----
engine.onUpdate = (dt) => {
  updateTour(dt * 1000);

  // ---- Player movement (WASD + arrow keys) ----
  let dx = 0, dy = 0;
  if (keys["w"] || keys["arrowup"]) { dy -= 1; playerDir = 3; }
  if (keys["s"] || keys["arrowdown"]) { dy += 1; playerDir = 0; }
  if (keys["a"] || keys["arrowleft"]) { dx -= 1; playerDir = 1; }
  if (keys["d"] || keys["arrowright"]) { dx += 1; playerDir = 2; }

  playerMoving = (dx !== 0 || dy !== 0);
  if (playerMoving) {
    const len = Math.hypot(dx, dy);
    playerX += (dx / len) * PLAYER_SPEED * dt;
    playerY += (dy / len) * PLAYER_SPEED * dt;
    // Clamp to office bounds (with a little wiggle room for the door)
    playerX = Math.max(-OFFICE_HALF_W + 16, Math.min(OFFICE_HALF_W - 16, playerX));
    if (playerY < -OFFICE_HALF_H + 16) playerY = -OFFICE_HALF_H + 16;
    // Allow walking out through the door (bottom center)
    if (Math.abs(playerX) < 60) {
      playerY = Math.min(OFFICE_HALF_H + 200, playerY);
    } else {
      playerY = Math.min(OFFICE_HALF_H - 16, playerY);
    }

    // Update player sprite position
    if (playerSpriteId >= 0) {
      const ps = engine.sprites.get(playerSpriteId);
      if (ps) {
        ps.x = playerX;
        ps.y = playerY;
        ps.flip = playerDir === 1 ? 1 : 0; // flip for left
      }
    }

    // Walk animation (poses 0-5)
    playerAnimTime += dt;
    const pose = Math.floor(playerAnimTime * ANIM_FPS) % 6;
    if (charSprite && playerSpriteId >= 0) {
      const dirIdx = playerDir === 1 ? 2 : playerDir; // left uses right frames flipped
      const frame = charSprite.frames[dirIdx]?.[pose];
      const ps = engine.sprites.get(playerSpriteId);
      if (frame && ps) {
        ps.u = frame.u; ps.v = frame.v; ps.w = frame.w; ps.h = frame.h;
      }
    }

    // Camera follows player
    engine.camera.follow(playerX, playerY);
  } else {
    // Idle pose
    if (charSprite && playerSpriteId >= 0) {
      const dirIdx = playerDir === 1 ? 2 : playerDir;
      const frame = charSprite.frames[dirIdx]?.[6];
      const ps = engine.sprites.get(playerSpriteId);
      if (frame && ps) {
        ps.u = frame.u; ps.v = frame.v; ps.w = frame.w; ps.h = frame.h;
      }
    }
  }

  // ---- NPC idle animation (gentle breathing) ----
  animTime += dt;
  if (charSprite && agentSprites.length > 0) {
    const npcPose = Math.floor(animTime * 2) % 2 === 0 ? 6 : 7; // idle/work toggle
    for (const id of agentSprites) {
      const sprite = engine.sprites.get(id);
      if (sprite) {
        const frame = charSprite.frames[0]?.[npcPose];
        if (frame) {
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


console.log("HexStage engine running. Controls: drag=pan, scroll=zoom, 1/2/3=camera modes, space=toggle postfx");

engine.start();
