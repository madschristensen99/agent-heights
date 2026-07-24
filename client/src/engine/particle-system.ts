import type { ParticleData } from "./types";

interface EmitterOptions {
  count: number;
  x: number;
  y: number;
  z?: number;
  speed: number;
  speedVar?: number;
  spread?: number;
  color: [number, number, number];
  colorVar?: number;
  size: number;
  sizeVar?: number;
  life: number;
  lifeVar?: number;
  texIndex?: number;
  gravity?: number;
  drag?: number;
}

export class ParticleSystem {
  private particles: ParticleData[] = [];
  private maxParticles: number;

  constructor(maxParticles: number = 500) {
    this.maxParticles = maxParticles;
  }

  emit(opts: EmitterOptions): void {
    const count = Math.min(opts.count, this.maxParticles - this.particles.length);
    for (let i = 0; i < count; i++) {
      const angle = opts.spread !== undefined
        ? Math.random() * opts.spread - opts.spread / 2
        : Math.random() * Math.PI * 2;
      const speed = opts.speed + (opts.speedVar ?? 0) * (Math.random() - 0.5);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const cv = opts.colorVar ?? 0;
      this.particles.push({
        x: opts.x,
        y: opts.y,
        z: opts.z ?? 0,
        vx,
        vy,
        vz: 0,
        r: clamp(opts.color[0] + cv * (Math.random() - 0.5), 0, 1),
        g: clamp(opts.color[1] + cv * (Math.random() - 0.5), 0, 1),
        b: clamp(opts.color[2] + cv * (Math.random() - 0.5), 0, 1),
        a: 1,
        size: opts.size + (opts.sizeVar ?? 0) * (Math.random() - 0.5),
        age: 0,
        life: opts.life + (opts.lifeVar ?? 0) * (Math.random() - 0.5),
        texIndex: opts.texIndex ?? 0,
      });
    }
  }

  sparkBurst(x: number, y: number, color: [number, number, number], count = 12, speed = 100): void {
    this.emit({
      count, x, y, speed, speedVar: 60, spread: Math.PI * 2,
      color, colorVar: 0.15, size: 4, sizeVar: 2, life: 0.6, lifeVar: 0.3, texIndex: 0,
    });
  }

  dustCloud(x: number, y: number, count = 6, scale = 1): void {
    this.emit({
      count, x, y, speed: 30 * scale, speedVar: 20, spread: Math.PI * 2,
      color: [0.7, 0.65, 0.5], colorVar: 0.1, size: 8 * scale, sizeVar: 4, life: 0.8, lifeVar: 0.3, texIndex: 1, gravity: -20, drag: 2,
    });
  }

  shockwave(x: number, y: number, color: [number, number, number] = [1, 1, 1]): void {
    this.emit({
      count: 24, x, y, speed: 150, speedVar: 30, spread: Math.PI * 2,
      color, size: 6, sizeVar: 2, life: 0.5, lifeVar: 0.2, texIndex: 2, drag: 3,
    });
  }

  embers(x: number, y: number, count = 8): void {
    this.emit({
      count, x, y, speed: 20, speedVar: 15, spread: Math.PI,
      color: [1, 0.5, 0.2], colorVar: 0.2, size: 3, sizeVar: 1, life: 1.5, lifeVar: 0.5, texIndex: 0, gravity: -30,
    });
  }

  confetti(x: number, y: number, colors: [number, number, number][], count = 30): void {
    for (let i = 0; i < count; i++) {
      const color = colors[i % colors.length];
      this.emit({
        count: 1, x, y, speed: 120, speedVar: 80, spread: Math.PI * 2,
        color, size: 5, sizeVar: 2, life: 1.2, lifeVar: 0.5, texIndex: 3, gravity: 80, drag: 0.5,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const drag = 0.98;
      p.vx *= drag;
      p.vy *= drag;
      p.vz *= drag;
      const lifeT = p.age / p.life;
      p.a = 1 - lifeT * lifeT;
    }
  }

  getParticles(): readonly ParticleData[] {
    return this.particles;
  }

  getParticleCount(): number {
    return this.particles.length;
  }

  clear(): void {
    this.particles = [];
  }

  getParticleData(): Float32Array {
    const data = new Float32Array(this.particles.length * 14);
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const o = i * 14;
      data[o] = p.x;
      data[o + 1] = p.y;
      data[o + 2] = p.z;
      data[o + 3] = p.r;
      data[o + 4] = p.g;
      data[o + 5] = p.b;
      data[o + 6] = p.a;
      data[o + 7] = p.size;
      data[o + 8] = p.age;
      data[o + 9] = p.life;
      data[o + 10] = p.texIndex;
      data[o + 11] = p.vx;
      data[o + 12] = p.vy;
      data[o + 13] = p.vz;
    }
    return data;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
