/**
 * VoxelPreview — a reusable Three.js renderer that mounts a 3D voxel character
 * into a DOM element. Used by the CharBuilder for live 3D previews in the
 * hire modal and wardrobe.
 */
import * as THREE from "three";
import { type CharAppearance, ACCENT_COLOR_OPTIONS } from "../../../shared/types";
import { type CharPalette, mix } from "../../../shared/char-draw";
import { buildVoxelModel, type VoxelModel } from "../../../shared/voxel-model";
import {
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, SHIRT_COLORS,
  PANTS_COLORS, ACCESSORIES, BEARD_STYLES, EYE_COLORS, HEAD_FEATURES,
} from "../../../shared/types";

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

export class VoxelPreview {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private group: THREE.Group | null = null;
  private rafId = 0;
  private mount: HTMLElement;
  private azimuth = 0.6;
  private elevation = 0.35;
  private distance = 32;
  private autoRotate = true;
  private isDragging = false;
  private lastX = 0;
  private lastY = 0;
  private disposed = false;

  // Shared lighting objects
  private keyLight: THREE.DirectionalLight;
  private ground: THREE.Mesh;

  constructor(mount: HTMLElement) {
    this.mount = mount;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#1a1a2e");

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
    this.updateCamera();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.cursor = "grab";

    // Lighting
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    this.keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    this.keyLight.position.set(15, 25, 10);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 512;
    this.keyLight.shadow.mapSize.height = 512;
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 60;
    this.keyLight.shadow.camera.left = -15;
    this.keyLight.shadow.camera.right = 15;
    this.keyLight.shadow.camera.top = 15;
    this.keyLight.shadow.camera.bottom = -15;
    this.keyLight.shadow.bias = -0.001;
    this.scene.add(this.keyLight);

    const fillLight = new THREE.DirectionalLight(0x8090ff, 0.25);
    fillLight.position.set(-10, 15, -5);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xff80a0, 0.15);
    rimLight.position.set(0, 10, -20);
    this.scene.add(rimLight);

    // Ground shadow
    const groundGeo = new THREE.PlaneGeometry(60, 60);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.01;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // Interaction
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.addEventListener("wheel", this.onWheel, { passive: false });

    // Resize observer
    this.resize();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(mount);

    this.animate();
  }

  private onPointerDown = (e: PointerEvent) => {
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.autoRotate = false;
    this.renderer.domElement.style.cursor = "grabbing";
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.azimuth -= dx * 0.01;
    this.elevation = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, this.elevation + dy * 0.01));
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.updateCamera();
  };

  private onPointerUp = () => {
    this.isDragging = false;
    this.renderer.domElement.style.cursor = "grab";
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.distance = Math.max(15, Math.min(80, this.distance + e.deltaY * 0.05));
    this.updateCamera();
  };

  private updateCamera() {
    const x = this.distance * Math.cos(this.elevation) * Math.sin(this.azimuth);
    const y = this.distance * Math.sin(this.elevation) + 8;
    const z = this.distance * Math.cos(this.elevation) * Math.cos(this.azimuth);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 8, 0);
  }

  private resize() {
    const w = this.mount.clientWidth;
    const h = this.mount.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Update the character model shown in the preview. */
  update(appearance: CharAppearance): void {
    const pal = appearanceToPalette(appearance);
    const model = buildVoxelModel(pal);
    this.renderModel(model);
  }

  private renderModel(model: VoxelModel): void {
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }

    this.group = new THREE.Group();

    for (const block of model.blocks) {
      const geo = new THREE.BoxGeometry(block.w, block.h, block.d);
      const mat = new THREE.MeshLambertMaterial({
        color: new THREE.Color(block.color),
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        block.x + block.w / 2,
        block.y + block.h / 2,
        block.z + block.d / 2,
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    this.scene.add(this.group);
  }

  private animate = () => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.animate);

    if (this.autoRotate && this.group) {
      this.azimuth += 0.008;
      this.updateCamera();
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.removeEventListener("wheel", this.onWheel);

    if (this.group) {
      this.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }

    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.mount) {
      this.mount.removeChild(this.renderer.domElement);
    }
  }
}
