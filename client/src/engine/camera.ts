import { mat4, vec3 } from "gl-matrix";
import type { CameraMode, CameraState } from "./types";
import { Ease, type TweenManager } from "./tween";

const TMP_VEC = vec3.create();
const UP: vec3 = [0, 0, 1];

export class Camera {
  private state: CameraState = {
    mode: "diorama",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    pitch: 0.5236,
    distance: 600,
    fov: 0.7854,
  };

  private targetState: CameraState = { ...this.state };
  private transitionT = 1;
  private transitionEase = Ease.easeInOutCubic;
  private fromState: CameraState = { ...this.state };

  private viewportW: number;
  private viewportH: number;
  private dpr: number;

  private viewMatrix = mat4.create();
  private projMatrix = mat4.create();
  private viewProjMatrix = mat4.create();
  private invViewProjMatrix = mat4.create();

  private followX: number | null = null;
  private followY: number | null = null;

  constructor(width: number, height: number, dpr: number = 1) {
    this.viewportW = width;
    this.viewportH = height;
    this.dpr = dpr;
  }

  resize(width: number, height: number, dpr?: number): void {
    this.viewportW = width;
    this.viewportH = height;
    if (dpr !== undefined) this.dpr = dpr;
  }

  setMode(mode: CameraMode, tween: TweenManager, duration = 1000): void {
    const presets: Record<CameraMode, Partial<CameraState>> = {
      topdown: { mode, pitch: Math.PI / 2 - 0.01, distance: 1200, fov: 1.2, zoom: 1.0 },
      diorama: { mode, pitch: 0.5236, distance: 600, fov: 0.7854, zoom: 1.0 },
      cinematic: { mode, pitch: 0.4363, distance: 700, fov: 0.6981, zoom: 1.1 },
    };
    const preset = presets[mode];
    this.transitionTo({ ...this.state, ...preset }, tween, duration);
  }

  setModeInstant(mode: CameraMode, zoom?: number): void {
    const presets: Record<CameraMode, Partial<CameraState>> = {
      topdown: { mode, pitch: Math.PI / 2 - 0.01, distance: 1200, fov: 1.2, zoom: 1.0 },
      diorama: { mode, pitch: 0.5236, distance: 600, fov: 0.7854, zoom: 1.0 },
      cinematic: { mode, pitch: 0.4363, distance: 700, fov: 0.6981, zoom: 1.1 },
    };
    const preset = presets[mode];
    this.state = { ...this.state, ...preset };
    if (zoom !== undefined) this.state.zoom = zoom;
    this.targetState = { ...this.state };
    this.fromState = { ...this.state };
    this.transitionT = 1;
  }

  private transitionTo(target: CameraState, tween: TweenManager, duration: number): void {
    this.fromState = { ...this.state };
    this.targetState = target;
    this.transitionT = 0;

    tween.add({
      target: this,
      props: { transitionT: [0, 1] },
      duration,
      ease: Ease.easeInOutCubic,
      onUpdate: () => this.applyTransition(),
    });
  }

  private applyTransition(): void {
    const t = this.transitionT;
    const e = this.transitionEase(t);
    this.state.mode = this.targetState.mode;
    this.state.pitch = lerp(this.fromState.pitch, this.targetState.pitch, e);
    this.state.distance = lerp(this.fromState.distance, this.targetState.distance, e);
    this.state.fov = lerp(this.fromState.fov, this.targetState.fov, e);
    this.state.zoom = lerp(this.fromState.zoom, this.targetState.zoom, e);
  }

  follow(x: number, y: number): void {
    this.followX = x;
    this.followY = y;
  }

  stopFollow(): void {
    this.followX = null;
    this.followY = null;
  }

  setCenter(x: number, y: number): void {
    this.state.centerX = x;
    this.state.centerY = y;
    this.followX = null;
    this.followY = null;
  }

  pan(dx: number, dy: number): void {
    this.state.centerX += dx / this.state.zoom;
    this.state.centerY += dy / this.state.zoom;
    this.followX = null;
    this.followY = null;
  }

  setZoom(zoom: number): void {
    this.state.zoom = Math.max(0.25, Math.min(4, zoom));
  }

  zoomBy(factor: number): void {
    this.setZoom(this.state.zoom * factor);
  }

  update(dt: number): void {
    if (this.followX !== null && this.followY !== null) {
      const lerpSpeed = 0.08;
      this.state.centerX += (this.followX - this.state.centerX) * lerpSpeed;
      this.state.centerY += (this.followY - this.state.centerY) * lerpSpeed;
    }
    this.computeMatrices();
  }

  private computeMatrices(): void {
    const aspect = (this.viewportW * this.dpr) / (this.viewportH * this.dpr);
    const near = 1;
    const far = 5000;
    mat4.perspective(this.projMatrix, this.state.fov, aspect, near, far);

    const pitch = this.state.pitch;
    const dist = this.state.distance / this.state.zoom;
    const cx = this.state.centerX;
    const cy = this.state.centerY;

    vec3.set(TMP_VEC, cx, cy - dist * Math.cos(pitch), dist * Math.sin(pitch));
    const lookAt = vec3.fromValues(cx, cy, 0);
    mat4.lookAt(this.viewMatrix, TMP_VEC, lookAt, UP as vec3);

    mat4.multiply(this.viewProjMatrix, this.projMatrix, this.viewMatrix);
    mat4.invert(this.invViewProjMatrix, this.viewProjMatrix);
  }

  getViewProjMatrix(): mat4 {
    return this.viewProjMatrix;
  }

  getViewMatrix(): mat4 {
    return this.viewMatrix;
  }

  getProjMatrix(): mat4 {
    return this.projMatrix;
  }

  getInvViewProjMatrix(): mat4 {
    return this.invViewProjMatrix;
  }

  getMode(): CameraMode {
    return this.state.mode;
  }

  getZoom(): number {
    return this.state.zoom;
  }

  getCenter(): { x: number; y: number } {
    return { x: this.state.centerX, y: this.state.centerY };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const ndcX = (sx / (this.viewportW * this.dpr)) * 2 - 1;
    const ndcY = -((sy / (this.viewportH * this.dpr)) * 2 - 1);

    const nearPoint = vec3.fromValues(ndcX, ndcY, -1);
    const farPoint = vec3.fromValues(ndcX, ndcY, 1);

    vec3.transformMat4(nearPoint, nearPoint, this.invViewProjMatrix);
    vec3.transformMat4(farPoint, farPoint, this.invViewProjMatrix);

    const dir = vec3.sub(vec3.create(), farPoint, nearPoint);
    const t = -nearPoint[2] / dir[2];
    const worldX = nearPoint[0] + dir[0] * t;
    const worldY = nearPoint[1] + dir[1] * t;

    return { x: worldX, y: worldY };
  }

  getViewport(): { w: number; h: number } {
    return { w: this.viewportW, h: this.viewportH };
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
