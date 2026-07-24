export type EaseFn = (t: number) => number;

export const Ease = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  easeInCubic: (t: number) => t ** 3,
  easeOutCubic: (t: number) => 1 - (1 - t) ** 3,
  easeInOutCubic: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  easeOutBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  easeOutElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  easeOutBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
} as const;

interface TweenInternal {
  target: object;
  props: Record<string, { from: number; to: number }>;
  duration: number;
  ease: EaseFn;
  yoyo: boolean;
  delay: number;
  elapsed: number;
  state: "pending" | "running" | "yoyoing" | "done";
  onComplete?: () => void;
  onUpdate?: () => void;
}

export interface TweenOptions {
  target: object;
  props: Record<string, [from: number, to: number]>;
  duration: number;
  ease?: EaseFn;
  yoyo?: boolean;
  delay?: number;
  onComplete?: () => void;
  onUpdate?: () => void;
}

export class TweenManager {
  private tweens: TweenInternal[] = [];
  private timers: { delay: number; elapsed: number; fn: () => void; done: boolean }[] = [];

  add(opts: TweenOptions): TweenInternal {
    const tween: TweenInternal = {
      target: opts.target,
      props: {},
      duration: opts.duration,
      ease: opts.ease ?? Ease.easeInOutQuad,
      yoyo: opts.yoyo ?? false,
      delay: opts.delay ?? 0,
      elapsed: 0,
      state: "pending",
      onComplete: opts.onComplete,
      onUpdate: opts.onUpdate,
    };
    for (const [key, [from, to]] of Object.entries(opts.props)) {
      tween.props[key] = { from, to };
    }
    this.tweens.push(tween);
    return tween;
  }

  delay(ms: number, fn: () => void): void {
    this.timers.push({ delay: ms, elapsed: 0, fn, done: false });
  }

  update(time: number, dt: number): void {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const timer = this.timers[i];
      if (timer.done) continue;
      timer.elapsed += dt;
      if (timer.elapsed >= timer.delay) {
        timer.done = true;
        timer.fn();
        this.timers.splice(i, 1);
      }
    }

    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tween = this.tweens[i];

      if (tween.state === "pending") {
        tween.elapsed += dt;
        if (tween.elapsed >= tween.delay) {
          tween.elapsed -= tween.delay;
          tween.state = "running";
        } else continue;
      }

      if (tween.state === "running" || tween.state === "yoyoing") {
        tween.elapsed += dt;
        const rawT = Math.min(tween.elapsed / tween.duration, 1);
        const t = tween.ease(rawT);
        const reversing = tween.state === "yoyoing";

        for (const [key, { from, to }] of Object.entries(tween.props)) {
          const a = reversing ? to : from;
          const b = reversing ? from : to;
          (tween.target as Record<string, number>)[key] = a + (b - a) * t;
        }

        tween.onUpdate?.();

        if (rawT >= 1) {
          if (tween.yoyo && tween.state === "running") {
            tween.state = "yoyoing";
            tween.elapsed = 0;
          } else {
            tween.state = "done";
            tween.onComplete?.();
            this.tweens.splice(i, 1);
          }
        }
      }
    }
  }

  killAll(): void {
    this.tweens = [];
    this.timers = [];
  }

  killTarget(target: object): void {
    this.tweens = this.tweens.filter((t) => t.target !== target);
  }

  get activeCount(): number {
    return this.tweens.length;
  }
}
