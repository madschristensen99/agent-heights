import type { Hex } from "./types";
import { pixelToHex } from "./hexgrid";
import type { Camera } from "./camera";

export interface Pointer {
  id: number;
  x: number;
  y: number;
  down: boolean;
  justDown: boolean;
  justUp: boolean;
}

export class InputManager {
  private keys = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private pointers: Map<number, Pointer> = new Map();
  private wheelDelta = 0;
  private canvas: HTMLCanvasElement;
  private dpr: number;

  private pinchDist = 0;
  private pinchActive = false;

  constructor(canvas: HTMLCanvasElement, dpr: number = 1) {
    this.canvas = canvas;
    this.dpr = dpr;

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContext);
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContext);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.keys.has(e.key)) this.pressedThisFrame.add(e.key);
    this.keys.add(e.key);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key);
  };

  private getCanvasPos(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * this.dpr,
      y: (e.clientY - rect.top) * this.dpr,
    };
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    const pos = this.getCanvasPos(e);
    this.pointers.set(e.pointerId, {
      id: e.pointerId,
      x: pos.x,
      y: pos.y,
      down: true,
      justDown: true,
      justUp: false,
    });
  };

  private onPointerMove = (e: PointerEvent): void => {
    const pos = this.getCanvasPos(e);
    const existing = this.pointers.get(e.pointerId);
    if (existing) {
      existing.x = pos.x;
      existing.y = pos.y;
    } else {
      this.pointers.set(e.pointerId, {
        id: e.pointerId,
        x: pos.x,
        y: pos.y,
        down: false,
        justDown: false,
        justUp: false,
      });
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const existing = this.pointers.get(e.pointerId);
    if (existing) {
      existing.down = false;
      existing.justUp = true;
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.wheelDelta += e.deltaY;
  };

  private onContext = (e: Event): void => {
    e.preventDefault();
  };

  isDown(key: string): boolean {
    return this.keys.has(key);
  }

  wasPressed(key: string): boolean {
    return this.pressedThisFrame.has(key);
  }

  getPointers(): Pointer[] {
    return Array.from(this.pointers.values());
  }

  getPrimaryPointer(): Pointer | null {
    for (const p of this.pointers.values()) {
      return p;
    }
    return null;
  }

  getWheel(): number {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }

  getPinchDelta(): number {
    const pointers = this.getPointers().filter((p) => p.down);
    if (pointers.length < 2) {
      this.pinchActive = false;
      return 0;
    }
    const dx = pointers[0].x - pointers[1].x;
    const dy = pointers[0].y - pointers[1].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (!this.pinchActive) {
      this.pinchActive = true;
      this.pinchDist = dist;
      return 0;
    }
    const delta = dist - this.pinchDist;
    this.pinchDist = dist;
    return delta;
  }

  pickHex(sx: number, sy: number, camera: Camera): Hex | null {
    const world = camera.screenToWorld(sx, sy);
    return pixelToHex(world.x, world.y);
  }

  endFrame(): void {
    this.pressedThisFrame.clear();
    for (const p of this.pointers.values()) {
      p.justDown = false;
      p.justUp = false;
      if (!p.down && p.justUp) {
        this.pointers.delete(p.id);
      }
    }
  }
}
