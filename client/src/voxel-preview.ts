/**
 * Standalone Three.js voxel character preview.
 *
 * Renders the VoxelModel output from shared/voxel-model.ts in a 3D scene
 * with toon shading, ground shadow, and orbit controls.
 */
import * as THREE from "three";
import {
  type CharAppearance,
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, SHIRT_COLORS,
  PANTS_COLORS, ACCESSORIES, BEARD_STYLES, EYE_COLORS, HEAD_FEATURES,
  ACCENT_COLOR_OPTIONS, randomAppearance,
} from "../../shared/types";
import { type CharPalette, mix } from "../../shared/char-draw";
import { buildVoxelModel, type VoxelModel } from "../../shared/voxel-model";

// ── Appearance → Palette (same logic as chargen.ts) ────────────────────────

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

// ── Three.js setup ─────────────────────────────────────────────────────────

const canvasWrap = document.getElementById("canvas-wrap")!;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#1a1a2e");

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
camera.position.set(20, 18, 28);
camera.lookAt(0, 8, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasWrap.appendChild(renderer.domElement);

function resize() {
  const w = canvasWrap.clientWidth;
  const h = canvasWrap.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ── Lighting ───────────────────────────────────────────────────────────────

const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
keyLight.position.set(15, 25, 10);
keyLight.castShadow = true;
keyLight.shadow.mapSize.width = 1024;
keyLight.shadow.mapSize.height = 1024;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 60;
keyLight.shadow.camera.left = -15;
keyLight.shadow.camera.right = 15;
keyLight.shadow.camera.top = 15;
keyLight.shadow.camera.bottom = -15;
keyLight.shadow.bias = -0.001;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x8090ff, 0.25);
fillLight.position.set(-10, 15, -5);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xff80a0, 0.15);
rimLight.position.set(0, 10, -20);
scene.add(rimLight);

// ── Ground shadow plane ────────────────────────────────────────────────────

const groundGeo = new THREE.PlaneGeometry(60, 60);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);

// ── Voxel model rendering ──────────────────────────────────────────────────

let characterGroup: THREE.Group | null = null;

function hexToColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

function renderVoxelModel(model: VoxelModel): void {
  if (characterGroup) {
    scene.remove(characterGroup);
    characterGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }

  characterGroup = new THREE.Group();

  for (const block of model.blocks) {
    const geo = new THREE.BoxGeometry(block.w, block.h, block.d);
    const mat = new THREE.MeshLambertMaterial({
      color: hexToColor(block.color),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      block.x + block.w / 2,
      block.y + block.h / 2,
      block.z + block.d / 2,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    characterGroup.add(mesh);
  }

  scene.add(characterGroup);
}

// ── Camera controls (simple orbit) ─────────────────────────────────────────

let autoRotate = true;
let isDragging = false;
let lastX = 0;
let lastY = 0;
let azimuth = 0.6;
let elevation = 0.5;
let distance = 35;

const targetPoint = new THREE.Vector3(0, 8, 0);

function updateCamera() {
  const x = distance * Math.cos(elevation) * Math.sin(azimuth);
  const y = distance * Math.sin(elevation) + 8;
  const z = distance * Math.cos(elevation) * Math.cos(azimuth);
  camera.position.set(x, y, z);
  camera.lookAt(targetPoint);
}

renderer.domElement.addEventListener("pointerdown", (e) => {
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  autoRotate = false;
  updateRotateButton();
});

window.addEventListener("pointermove", (e) => {
  if (!isDragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  azimuth -= dx * 0.01;
  elevation = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, elevation + dy * 0.01));
  lastX = e.clientX;
  lastY = e.clientY;
  updateCamera();
});

window.addEventListener("pointerup", () => {
  isDragging = false;
});

renderer.domElement.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    distance = Math.max(15, Math.min(80, distance + e.deltaY * 0.05));
    updateCamera();
  },
  { passive: false },
);

// ── UI controls ────────────────────────────────────────────────────────────

let currentAppearance: CharAppearance = randomAppearance();

const controlDefs: { key: keyof CharAppearance; label: string; options: string[] }[] = [
  { key: "skin", label: "Skin", options: SKIN_TONES },
  { key: "hairStyle", label: "Hair Style", options: HAIR_STYLES },
  { key: "hair", label: "Hair Color", options: HAIR_COLORS },
  { key: "shirt", label: "Shirt", options: SHIRT_COLORS },
  { key: "pants", label: "Pants", options: PANTS_COLORS },
  { key: "accessory", label: "Accessory", options: ACCESSORIES },
  { key: "accent", label: "Accent (Tie)", options: ACCENT_COLOR_OPTIONS },
  { key: "beard", label: "Beard", options: BEARD_STYLES },
  { key: "eyeColor", label: "Eye Color", options: EYE_COLORS },
  { key: "headFeature", label: "Head Feature", options: HEAD_FEATURES },
];

function buildControls() {
  const body = document.getElementById("controls-body")!;
  body.innerHTML = "";

  for (const def of controlDefs) {
    const group = document.createElement("div");
    group.className = "control-group";

    const label = document.createElement("label");
    label.textContent = def.label;
    group.appendChild(label);

    const row = document.createElement("div");
    row.className = "control-row";

    const prev = document.createElement("button");
    prev.textContent = "\u25C0";
    const value = document.createElement("div");
    value.className = "value";
    const next = document.createElement("button");
    next.textContent = "\u25B6";

    const idx = currentAppearance[def.key] as number;
    value.textContent = def.options[idx % def.options.length] || "\u2014";

    prev.onclick = () => {
      const cur = currentAppearance[def.key] as number;
      currentAppearance[def.key] = (cur - 1 + def.options.length) % def.options.length;
      value.textContent = def.options[currentAppearance[def.key] as number] || "\u2014";
      refreshModel();
    };

    next.onclick = () => {
      const cur = currentAppearance[def.key] as number;
      currentAppearance[def.key] = (cur + 1) % def.options.length;
      value.textContent = def.options[currentAppearance[def.key] as number] || "\u2014";
      refreshModel();
    };

    row.appendChild(prev);
    row.appendChild(value);
    row.appendChild(next);
    group.appendChild(row);
    body.appendChild(group);
  }
}

function refreshModel() {
  const pal = appearanceToPalette(currentAppearance);
  const model = buildVoxelModel(pal);
  renderVoxelModel(model);
}

// ── Buttons ────────────────────────────────────────────────────────────────

const rotateBtn = document.getElementById("toggle-rotate")!;
function updateRotateButton() {
  rotateBtn.textContent = `Auto-Rotate: ${autoRotate ? "ON" : "OFF"}`;
  rotateBtn.classList.toggle("active", autoRotate);
}
rotateBtn.addEventListener("click", () => {
  autoRotate = !autoRotate;
  updateRotateButton();
});

document.getElementById("randomize")!.addEventListener("click", () => {
  currentAppearance = randomAppearance();
  buildControls();
  refreshModel();
});

// ── Animation loop ─────────────────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate);

  if (autoRotate && characterGroup) {
    azimuth += 0.008;
    updateCamera();
  }

  renderer.render(scene, camera);
}

// ── Init ───────────────────────────────────────────────────────────────────

buildControls();
refreshModel();
updateCamera();
animate();
