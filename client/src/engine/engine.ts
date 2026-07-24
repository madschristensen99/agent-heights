const GL = WebGL2RenderingContext;

import { createContext } from "./gl";
import { Camera } from "./camera";
import { InputManager } from "./input";
import { SceneManager } from "./scene-manager";
import { TweenManager } from "./tween";
import { TextureAtlas } from "./texture-atlas";
import { TileBatcher } from "./tile-batcher";
import { SpriteBatcher } from "./sprite-batcher";
import { ShadowBatcher } from "./shadow-batcher";
import { LightSystem } from "./light-system";
import { ParticleSystem } from "./particle-system";
import { PostFX } from "./postfx";
import type { EngineOptions } from "./types";
import { DEFAULT_ENGINE_OPTS } from "./types";

export class Engine {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private opts: EngineOptions;

  camera: Camera;
  input: InputManager;
  scenes: SceneManager;
  tweens: TweenManager;
  atlas: TextureAtlas;
  tiles: TileBatcher;
  sprites: SpriteBatcher;
  shadows: ShadowBatcher;
  lights: LightSystem;
  particles: ParticleSystem;
  postfx: PostFX | null;

  private registry: Map<string, unknown> = new Map();
  private rafId: number | null = null;
  private lastTime = 0;
  private running = false;

  onUpdate: ((dt: number) => void) | null = null;
  onRender: ((time: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, opts: Partial<EngineOptions> = {}) {
    this.canvas = canvas;
    this.opts = { ...DEFAULT_ENGINE_OPTS, ...opts };

    const dpr = this.opts.dpr ?? 1;
    const w = this.opts.width * dpr;
    const h = this.opts.height * dpr;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${this.opts.width}px`;
    canvas.style.height = `${this.opts.height}px`;

    this.gl = createContext(canvas);
    this.gl.enable(GL.DEPTH_TEST);
    this.gl.depthFunc(GL.LEQUAL);
    this.gl.enable(GL.BLEND);
    this.gl.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);

    this.camera = new Camera(this.opts.width, this.opts.height, dpr);
    this.input = new InputManager(canvas, dpr);
    this.scenes = new SceneManager();
    this.tweens = new TweenManager();
    this.atlas = new TextureAtlas(this.gl, 2048);
    this.tiles = new TileBatcher(this.gl);
    this.sprites = new SpriteBatcher(this.gl);
    this.shadows = new ShadowBatcher(this.gl);
    this.lights = new LightSystem(this.gl, this.opts.maxLights);
    this.particles = new ParticleSystem(this.opts.maxParticles);
    this.postfx = this.opts.postfx ? new PostFX(this.gl, w, h) : null;
  }

  get<T>(key: string): T | undefined {
    return this.registry.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.registry.set(key, value);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private loop = (time: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    this.tweens.update(time, dt * 1000);
    this.particles.update(dt);
    this.camera.update(dt);
    this.scenes.update(time, dt * 1000);
    this.onUpdate?.(dt);

    this.render(time);

    this.input.endFrame();
  };

  private render(time: number): void {
    if (this.onRender) {
      this.onRender(time);
      return;
    }

    const gl = this.gl;
    const dpr = this.opts.dpr ?? 1;
    const w = this.opts.width * dpr;
    const h = this.opts.height * dpr;

    gl.viewport(0, 0, w, h);

    if (this.postfx) {
      this.postfx.bindSceneFBO();
    } else {
      gl.bindFramebuffer(GL.FRAMEBUFFER, null);
      gl.clearColor(0.05, 0.06, 0.1, 1.0);
      gl.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
    }

    gl.enable(GL.DEPTH_TEST);
    gl.depthFunc(GL.LEQUAL);

    const viewProj = this.camera.getViewProjMatrix();

    // Upload lighting uniforms to tile shader
    const ambient = this.lights.getAmbient();
    const lightCount = this.lights.getLightCount();
    const lights = this.lights.getLights();
    if (lightCount > 0) {
      const posData = new Float32Array(lightCount * 3);
      const colorData = new Float32Array(lightCount * 3);
      const radiusData = new Float32Array(lightCount);
      const intensityData = new Float32Array(lightCount);
      for (let i = 0; i < lightCount; i++) {
        const l = lights[i];
        posData[i * 3] = l.x;
        posData[i * 3 + 1] = l.y;
        posData[i * 3 + 2] = l.z;
        colorData[i * 3] = l.r;
        colorData[i * 3 + 1] = l.g;
        colorData[i * 3 + 2] = l.b;
        radiusData[i] = l.radius;
        intensityData[i] = l.intensity;
      }
      this.tiles.setLightUniforms(
        [ambient.r, ambient.g, ambient.b],
        lightCount, posData, colorData, radiusData, intensityData,
      );
    } else {
      this.tiles.setLightUniforms(
        [ambient.r, ambient.g, ambient.b], 0,
        new Float32Array(0), new Float32Array(0),
        new Float32Array(0), new Float32Array(0),
      );
    }

    // Bind atlas for all renderers
    this.atlas.bind(0);

    // Render passes
    this.shadows.render(viewProj as Float32Array);
    this.tiles.render([], viewProj as Float32Array, time, 0);
    this.sprites.render(viewProj as Float32Array, 0);

    // Post-processing
    if (this.postfx) {
      this.postfx.render(time);
    }
  }

  resize(width: number, height: number): void {
    const dpr = this.opts.dpr ?? 1;
    this.opts.width = width;
    this.opts.height = height;
    const w = width * dpr;
    const h = height * dpr;
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.camera.resize(width, height, dpr);
    this.postfx?.resize(w, h);
  }

  destroy(): void {
    this.stop();
    this.input.destroy();
    this.scenes.destroy();
    this.tweens.killAll();
    this.particles.clear();
    this.sprites.clear();
    this.shadows.clear();
    this.lights.clearLights();
    const ext = this.gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }
}
