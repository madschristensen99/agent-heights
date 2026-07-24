export type Thread = "open" | "close" | "weave" | "unweave" | "dye" | "spin" | "stretch" | "twist";

export type Draft = Thread[];

export type ThreadDirection = "forward" | "reverse";

export interface ThreadEffect {
  thread: Thread;
  direction: ThreadDirection;
  particleColor: [number, number, number];
  particleCount: number;
  particleSpeed: number;
  particleSpread: number;
  particleLife: number;
  particleSize: number;
  particleTexIndex: number;
  lightColor: [number, number, number];
  lightRadius: number;
  lightIntensity: number;
  lightDuration: number;
  duration: number;
}

export const THREAD_EFFECTS: Record<Thread, Omit<ThreadEffect, "thread" | "direction">> = {
  open: {
    particleColor: [0.4, 0.7, 1.0],
    particleCount: 8,
    particleSpeed: 40,
    particleSpread: Math.PI / 3,
    particleLife: 0.5,
    particleSize: 3,
    particleTexIndex: 0,
    lightColor: [0.4, 0.7, 1.0],
    lightRadius: 80,
    lightIntensity: 0.6,
    lightDuration: 600,
    duration: 600,
  },
  close: {
    particleColor: [0.6, 0.5, 0.9],
    particleCount: 8,
    particleSpeed: 40,
    particleSpread: Math.PI / 3,
    particleLife: 0.5,
    particleSize: 3,
    particleTexIndex: 0,
    lightColor: [0.6, 0.5, 0.9],
    lightRadius: 80,
    lightIntensity: 0.6,
    lightDuration: 600,
    duration: 600,
  },
  weave: {
    particleColor: [0.2, 0.9, 0.4],
    particleCount: 16,
    particleSpeed: 30,
    particleSpread: Math.PI * 2,
    particleLife: 0.8,
    particleSize: 4,
    particleTexIndex: 0,
    lightColor: [0.2, 0.9, 0.4],
    lightRadius: 100,
    lightIntensity: 0.8,
    lightDuration: 800,
    duration: 800,
  },
  unweave: {
    particleColor: [0.9, 0.3, 0.2],
    particleCount: 16,
    particleSpeed: 50,
    particleSpread: Math.PI * 2,
    particleLife: 0.8,
    particleSize: 4,
    particleTexIndex: 0,
    lightColor: [0.9, 0.3, 0.2],
    lightRadius: 100,
    lightIntensity: 0.8,
    lightDuration: 800,
    duration: 800,
  },
  dye: {
    particleColor: [0.9, 0.6, 0.1],
    particleCount: 12,
    particleSpeed: 20,
    particleSpread: Math.PI * 2,
    particleLife: 1.0,
    particleSize: 5,
    particleTexIndex: 1,
    lightColor: [0.9, 0.6, 0.1],
    lightRadius: 90,
    lightIntensity: 0.7,
    lightDuration: 700,
    duration: 700,
  },
  spin: {
    particleColor: [0.8, 0.8, 1.0],
    particleCount: 20,
    particleSpeed: 80,
    particleSpread: Math.PI * 2,
    particleLife: 0.6,
    particleSize: 3,
    particleTexIndex: 0,
    lightColor: [0.8, 0.8, 1.0],
    lightRadius: 120,
    lightIntensity: 1.0,
    lightDuration: 1000,
    duration: 1000,
  },
  stretch: {
    particleColor: [0.5, 0.8, 0.9],
    particleCount: 10,
    particleSpeed: 60,
    particleSpread: Math.PI / 6,
    particleLife: 0.7,
    particleSize: 4,
    particleTexIndex: 0,
    lightColor: [0.5, 0.8, 0.9],
    lightRadius: 110,
    lightIntensity: 0.7,
    lightDuration: 800,
    duration: 800,
  },
  twist: {
    particleColor: [0.7, 0.4, 0.9],
    particleCount: 14,
    particleSpeed: 50,
    particleSpread: Math.PI * 2,
    particleLife: 0.7,
    particleSize: 4,
    particleTexIndex: 0,
    lightColor: [0.7, 0.4, 0.9],
    lightRadius: 95,
    lightIntensity: 0.7,
    lightDuration: 700,
    duration: 700,
  },
};

export const REVERSE_THREAD: Record<Thread, Thread> = {
  open: "close",
  close: "open",
  weave: "unweave",
  unweave: "weave",
  dye: "dye",
  spin: "spin",
  stretch: "stretch",
  twist: "twist",
};

export function reverseDraft(draft: Draft): Draft {
  return draft.map((t) => REVERSE_THREAD[t]).reverse();
}

export const LANGUAGE_AURAS: Record<string, [number, number, number]> = {
  typescript: [0.3, 0.5, 0.9],
  javascript: [0.9, 0.8, 0.2],
  python: [0.2, 0.5, 0.9],
  rust: [0.9, 0.4, 0.1],
  go: [0.0, 0.8, 0.8],
  java: [0.8, 0.3, 0.1],
  c: [0.5, 0.5, 0.5],
  cpp: [0.6, 0.4, 0.8],
  ruby: [0.9, 0.1, 0.2],
  php: [0.7, 0.5, 0.9],
  shell: [0.3, 0.9, 0.3],
  html: [0.9, 0.5, 0.3],
  css: [0.5, 0.3, 0.9],
  sql: [0.4, 0.8, 0.5],
  default: [0.6, 0.6, 0.8],
};

export function getAuraColor(language: string): [number, number, number] {
  return LANGUAGE_AURAS[language.toLowerCase()] ?? LANGUAGE_AURAS.default;
}

export const THREAD_STAGGER_MS = 200;

export const ALL_THREADS: Thread[] = ["open", "close", "weave", "unweave", "dye", "spin", "stretch", "twist"];
