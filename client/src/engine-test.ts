import { Engine } from "./engine/engine";
import type { TileData, SpriteData } from "./engine/types";
import { hexToPixel, hexInRange } from "./engine/hexgrid";
import { Ease } from "./engine/tween";
import { generateCharSprite } from "./game/chargen-engine";

const canvas = document.getElementById("game") as HTMLCanvasElement;

const engine = new Engine(canvas, {
  width: window.innerWidth,
  height: window.innerHeight,
  postfx: true,
});

// ---- Build the world: sky above, office on a ground line, grass field below ----
// Engine convention: +Y is UP on screen (standard GL)
//   y > HORIZON_Y          → sky (no tiles, clear color shows through)
//   HORIZON_Y down to OFFICE_BOTTOM → office building sitting on the ground
//   below OFFICE_BOTTOM     → grass field extending downward
// texIndex: 0=wood floor, 1=grass, 2=sand, 3=stone, 4=wall
const RADIUS = 26;
const allHexes = hexInRange({ q: 0, r: 0 }, RADIUS);

// Scene layout in pixel space (+Y is up)
const HORIZON_Y = 280;       // ground starts here (above this is sky)
const OFFICE_HALF_W = 280;   // office half-width
const OFFICE_TOP = 260;      // office top wall (near horizon)
const OFFICE_BOTTOM = -180;  // office bottom wall (door at bottom center)
const WALL_THICKNESS = 36;
const FIELD_BOTTOM = -900;   // how far down the grass field goes

// Only keep hexes that are below the horizon (on the ground)
const hexes = allHexes.filter((hex) => {
  const pos = hexToPixel(hex.q, hex.r);
  return pos.y <= HORIZON_Y + 20 && pos.y > FIELD_BOTTOM;
});

function classifyTile(q: number, r: number): "wall" | "floor" | "grass" | "sky" {
  const pos = hexToPixel(q, r);

  // Above horizon = sky (no tile)
  if (pos.y > HORIZON_Y) return "sky";

  // Office building region
  const inOfficeX = Math.abs(pos.x) < OFFICE_HALF_W;
  const inOfficeY = pos.y < OFFICE_TOP && pos.y > OFFICE_BOTTOM;

  if (inOfficeX && inOfficeY) {
    const distToEdgeX = OFFICE_HALF_W - Math.abs(pos.x);
    const distToEdgeY = Math.min(OFFICE_TOP - pos.y, pos.y - OFFICE_BOTTOM);
    const minDistToEdge = Math.min(distToEdgeX, distToEdgeY);

    if (minDistToEdge < WALL_THICKNESS) {
      // Door gap at bottom center (bottom = lower Y)
      if (pos.y < OFFICE_BOTTOM + WALL_THICKNESS && Math.abs(pos.x) < 55) return "floor";
      return "wall";
    }
    return "floor";
  }

  // Everything else below horizon is grass field
  return "grass";
}

const tiles: TileData[] = hexes.map((hex) => {
  let texIndex: number;
  let tintR: number, tintG: number, tintB: number;
  let elevation = 0;

  const zone = classifyTile(hex.q, hex.r);

  if (zone === "wall") {
    texIndex = 4; // wall
    tintR = 0.85; tintG = 0.82; tintB = 0.75;
    elevation = 2;
  } else if (zone === "floor") {
    texIndex = 0; // wood floor
    tintR = 0.95; tintG = 0.92; tintB = 0.85;
  } else {
    texIndex = 1; // grass
    tintR = 0.85; tintG = 0.95; tintB = 0.75;
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

// 0: Wood floor (office) — warm, seamless
let tx = 0;
tctx.fillStyle = "rgb(178, 158, 128)";
tctx.fillRect(tx, 0, TILE_SIZE, TILE_SIZE);
// Subtle plank lines
tctx.strokeStyle = "rgba(140, 118, 90, 0.2)";
tctx.lineWidth = 1;
for (let i = 0; i < TILE_SIZE; i += 64) {
  tctx.beginPath(); tctx.moveTo(tx, i); tctx.lineTo(tx + TILE_SIZE, i); tctx.stroke();
}
// Fine grain noise
for (let i = 0; i < 2000; i++) {
  const v = Math.random() * 20 - 10;
  tctx.fillStyle = `rgba(${Math.max(0,178+v)},${Math.max(0,158+v)},${Math.max(0,128+v)},0.15)`;
  tctx.fillRect(tx + Math.random()*TILE_SIZE, Math.random()*TILE_SIZE, 1, 1);
}

// 1: Grass — uniform, seamless
tx = 256;
tctx.fillStyle = "rgb(72, 112, 56)";
tctx.fillRect(tx, 0, TILE_SIZE, TILE_SIZE);
for (let i = 0; i < 3000; i++) {
  const v = Math.random() * 30 - 15;
  tctx.fillStyle = `rgba(${Math.max(0,72+v)},${Math.max(0,112+v)},${Math.max(0,56+v)},0.2)`;
  tctx.fillRect(tx + Math.random()*TILE_SIZE, Math.random()*TILE_SIZE, 1, 1);
}

// 2: Sand — uniform, seamless
tx = 512;
tctx.fillStyle = "rgb(196, 176, 132)";
tctx.fillRect(tx, 0, TILE_SIZE, TILE_SIZE);
for (let i = 0; i < 2000; i++) {
  const v = Math.random() * 20 - 10;
  tctx.fillStyle = `rgba(${Math.max(0,196+v)},${Math.max(0,176+v)},${Math.max(0,132+v)},0.15)`;
  tctx.fillRect(tx + Math.random()*TILE_SIZE, Math.random()*TILE_SIZE, 1, 1);
}

// 3: Stone — uniform, seamless
tx = 768;
tctx.fillStyle = "rgb(112, 112, 116)";
tctx.fillRect(tx, 0, TILE_SIZE, TILE_SIZE);
for (let i = 0; i < 2000; i++) {
  const v = Math.random() * 20 - 10;
  tctx.fillStyle = `rgba(${Math.max(0,112+v)},${Math.max(0,112+v)},${Math.max(0,116+v)},0.15)`;
  tctx.fillRect(tx + Math.random()*TILE_SIZE, Math.random()*TILE_SIZE, 1, 1);
}

// 4: Wall (office exterior wall) — warm, seamless
tx = 1024;
tctx.fillStyle = "rgb(192, 182, 168)";
tctx.fillRect(tx, 0, TILE_SIZE, TILE_SIZE);
// Very subtle brick pattern
tctx.strokeStyle = "rgba(160, 145, 128, 0.15)";
tctx.lineWidth = 1;
for (let row = 0; row < 8; row++) {
  const y = row * 32;
  tctx.beginPath(); tctx.moveTo(tx, y); tctx.lineTo(tx + TILE_SIZE, y); tctx.stroke();
  const offset = row % 2 === 0 ? 0 : 32;
  for (let bx = offset; bx < TILE_SIZE; bx += 64) {
    tctx.beginPath(); tctx.moveTo(tx + bx, y); tctx.lineTo(tx + bx, y + 32); tctx.stroke();
  }
}
// Fine noise
for (let i = 0; i < 1000; i++) {
  const v = Math.random() * 16 - 8;
  tctx.fillStyle = `rgba(${Math.max(0,192+v)},${Math.max(0,182+v)},${Math.max(0,168+v)},0.12)`;
  tctx.fillRect(tx + Math.random()*TILE_SIZE, Math.random()*TILE_SIZE, 1, 1);
}

const tileRegion = engine.atlas.addCanvas("tiles", tileCanvas);
if (tileRegion) {
  engine.tiles.tileUVOffset = [tileRegion.u, tileRegion.v, tileRegion.w, tileRegion.h];
}

// Set sky color and grid radius for edge fade
engine.tiles.skyColor = [0.53, 0.72, 0.88];
engine.tiles.gridRadius = 1200; // large since we have a wide horizontal band

// ---- Soft, even lighting inside the office ----
const lightPositions = [
  { x: 80, y: 80 },
  { x: -80, y: -40 },
];

for (const lp of lightPositions) {
  engine.lights.addLight({
    x: lp.x, y: lp.y, z: 40,
    r: 1.0, g: 0.95, b: 0.85,
    radius: 450, intensity: 0.3,
  });
}

engine.lights.setAmbient(0.92, 0.90, 0.86);

// ---- Generate character sprites ----
const charSprite = generateCharSprite(engine.atlas, "boss", {
  skin: 0, hair: 0, shirt: 0, pants: 0,
  hairStyle: 0, accessory: 0, eyeColor: 0, headFeature: 0, beard: 0,
  accent: 0,
});

// Place a player character and a few NPCs inside the office
const playerPos = { x: 0, y: 40 }; // inside the office, near center
const npcPositions = [
  { x: 120, y: 80, name: "Agent 1" },
  { x: -120, y: 0, name: "Agent 2" },
  { x: 80, y: -80, name: "Agent 3" },
  { x: -100, y: 120, name: "Agent 4" },
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
    const id = engine.sprites.add({
      x: ap.x,
      y: ap.y,
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
engine.camera.setCenter(0, 40);
engine.camera.setModeInstant("topdown", 1.0);
engine.camera.follow(0, 40);
engine.sprites.topDown = true;

// ---- Input handling ----
const keys: Record<string, boolean> = {};
let isDragging = false;
let lastX = 0;
let lastY = 0;

window.addEventListener("keydown", (e) => {
  // Prevent arrow keys from scrolling the page
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
    e.preventDefault();
  }
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
  // +Y is up on screen, so W/up = +Y, S/down = -Y
  let dx = 0, dy = 0;
  if (keys["w"] || keys["arrowup"]) { dy += 1; playerDir = 3; }
  if (keys["s"] || keys["arrowdown"]) { dy -= 1; playerDir = 0; }
  if (keys["a"] || keys["arrowleft"]) { dx -= 1; playerDir = 1; }
  if (keys["d"] || keys["arrowright"]) { dx += 1; playerDir = 2; }

  playerMoving = (dx !== 0 || dy !== 0);
  if (playerMoving) {
    const len = Math.hypot(dx, dy);
    playerX += (dx / len) * PLAYER_SPEED * dt;
    playerY += (dy / len) * PLAYER_SPEED * dt;
    // Clamp to office bounds (with wiggle room for the door)
    playerX = Math.max(-OFFICE_HALF_W + 16, Math.min(OFFICE_HALF_W - 16, playerX));
    if (playerY > OFFICE_TOP - 16) playerY = OFFICE_TOP - 16;
    // Allow walking out through the door (bottom center = lower Y) into the field
    if (Math.abs(playerX) < 55) {
      playerY = Math.max(FIELD_BOTTOM + 50, playerY);
    } else {
      playerY = Math.max(OFFICE_BOTTOM + 16, playerY);
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
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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
