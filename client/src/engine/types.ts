export interface Hex {
  q: number;
  r: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CameraMode = "topdown" | "diorama" | "cinematic";

export interface CameraState {
  mode: CameraMode;
  centerX: number;
  centerY: number;
  zoom: number;
  pitch: number;
  distance: number;
  fov: number;
}

export interface SpriteData {
  id: number;
  x: number;
  y: number;
  z: number;
  u: number;
  v: number;
  w: number;
  h: number;
  displayW: number;
  displayH: number;
  tintR: number;
  tintG: number;
  tintB: number;
  alpha: number;
  flip: number;
  visible: boolean;
  fixedToScreen: boolean;
}

export interface TileData {
  q: number;
  r: number;
  elevation: number;
  texIndex: number;
  tintR: number;
  tintG: number;
  tintB: number;
  animFrame: number;
}

export interface LightData {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  radius: number;
  intensity: number;
}

export interface ParticleData {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  a: number;
  size: number;
  age: number;
  life: number;
  texIndex: number;
}

export interface ShadowData {
  x: number;
  y: number;
  size: number;
  alpha: number;
}

export interface Scene {
  preload?(loader: Loader): void | Promise<void>;
  create?(): void;
  update?(time: number, dt: number): void;
  shutdown?(): void;
}

export interface Loader {
  loadJSON(key: string, url: string): Promise<unknown>;
  loadImage(key: string, url: string): Promise<HTMLImageElement>;
}

export interface EngineOptions {
  width: number;
  height: number;
  dpr?: number;
  postfx?: boolean;
  maxLights?: number;
  maxParticles?: number;
}

export const DEFAULT_ENGINE_OPTS: EngineOptions = {
  width: 800,
  height: 600,
  dpr: Math.min(window.devicePixelRatio || 1, 2),
  postfx: true,
  maxLights: 32,
  maxParticles: 500,
};
