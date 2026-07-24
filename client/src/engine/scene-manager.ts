import type { Scene, Loader } from "./types";

class SimpleLoader implements Loader {
  async loadJSON(key: string, url: string): Promise<unknown> {
    const res = await fetch(url);
    return res.json();
  }

  async loadImage(key: string, url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }
}

export class SceneManager {
  private scenes: Map<string, Scene> = new Map();
  private active: Scene | null = null;
  private activeKey: string | null = null;
  private loader: SimpleLoader = new SimpleLoader();
  private pendingStart: string | null = null;

  add(key: string, scene: Scene): void {
    this.scenes.set(key, scene);
  }

  start(key: string): void {
    if (this.active) {
      this.active.shutdown?.();
    }
    const scene = this.scenes.get(key);
    if (!scene) throw new Error(`Scene not found: ${key}`);
    this.active = scene;
    this.activeKey = key;
    this.pendingStart = key;
  }

  restart(): void {
    if (!this.activeKey) return;
    this.start(this.activeKey);
  }

  getActive(): Scene | null {
    return this.active;
  }

  getLoader(): Loader {
    return this.loader;
  }

  async update(time: number, dt: number): Promise<void> {
    if (this.pendingStart) {
      const scene = this.scenes.get(this.pendingStart);
      if (scene) {
        if (scene.preload) {
          await scene.preload(this.loader);
        }
        scene.create?.();
      }
      this.pendingStart = null;
    }

    this.active?.update?.(time, dt);
  }

  destroy(): void {
    this.active?.shutdown?.();
    this.active = null;
    this.activeKey = null;
  }
}
