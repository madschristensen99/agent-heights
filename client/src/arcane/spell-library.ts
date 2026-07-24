import type { Draft } from "./threads";
import {
  THREAD_EFFECTS, REVERSE_THREAD, THREAD_STAGGER_MS,
  getAuraColor,
} from "./threads";
import type { Engine } from "../engine/engine";
import type { LightSystem } from "../engine/light-system";
import type { ParticleSystem } from "../engine/particle-system";
import type { TweenManager } from "../engine/tween";
import type { Hex } from "../engine/types";
import { hexToPixel } from "../engine/hexgrid";

export type SpellPhase = "initiation" | "execution" | "resolution";

export interface ActiveSpell {
  agentId: string;
  tool: string;
  draft: Draft;
  position: { x: number; y: number };
  phase: SpellPhase;
  threadIndex: number;
  startTime: number;
  lightIndex: number | null;
  auraColor: [number, number, number];
}

const TOOL_DRAFTS: Record<string, Draft> = {
  read_file: ["open"],
  write_file: ["weave"],
  execute_bash: ["spin"],
  search_web: ["open", "stretch"],
  npm_install: ["weave", "spin", "stretch"],
  npm_uninstall: ["unweave", "spin"],
  git_push: ["spin", "stretch", "open"],
  git_pull: ["open", "stretch", "spin"],
  git_commit: ["twist"],
  git_revert: ["twist"],
  git_checkout: ["twist", "dye"],
  delete_file: ["unweave"],
  list_directory: ["open"],
  grep_search: ["open", "stretch", "dye"],
  compile: ["dye", "spin"],
  refactor: ["twist"],
  create_directory: ["weave", "stretch"],
  move_file: ["stretch", "twist"],
  copy_file: ["weave", "weave"],
  run_tests: ["spin", "dye"],
  deploy: ["stretch", "spin", "open"],
  docker_up: ["stretch", "spin"],
  docker_down: ["spin", "close"],
  api_call: ["open", "stretch", "open"],
  browser_navigate: ["open", "stretch"],
  browser_click: ["spin"],
  browser_type: ["weave"],
  browser_screenshot: ["open"],
  mcp_tool: ["spin", "dye"],
};

const REVERSE_TOOLS = new Set([
  "git_revert", "npm_uninstall", "docker_down", "delete_file",
]);

export function getDraftForTool(tool: string): Draft {
  const normalized = tool.toLowerCase().replace(/[^a-z_]/g, "_");
  if (TOOL_DRAFTS[normalized]) return TOOL_DRAFTS[normalized];
  for (const [key, draft] of Object.entries(TOOL_DRAFTS)) {
    if (normalized.includes(key) || key.includes(normalized)) return draft;
  }
  return ["spin"];
}

export class SpellLibrary {
  private particles: ParticleSystem;
  private lights: LightSystem;
  private tweens: TweenManager;
  private activeSpells: Map<string, ActiveSpell> = new Map();

  constructor(engine: Engine) {
    this.particles = engine.particles;
    this.lights = engine.lights;
    this.tweens = engine.tweens;
  }

  castSpell(
    agentId: string,
    tool: string,
    hex: Hex,
    language: string = "default",
  ): ActiveSpell {
    const draft = getDraftForTool(tool);
    const isReverse = REVERSE_TOOLS.has(tool.toLowerCase().replace(/[^a-z_]/g, "_"));
    const effectiveDraft = isReverse ? draft.map((t) => REVERSE_THREAD[t]).reverse() : draft;

    const pos = hexToPixel(hex.q, hex.r);
    const auraColor = getAuraColor(language);

    const spell: ActiveSpell = {
      agentId,
      tool,
      draft: effectiveDraft,
      position: pos,
      phase: "initiation",
      threadIndex: 0,
      startTime: performance.now(),
      lightIndex: null,
      auraColor,
    };

    this.activeSpells.set(agentId, spell);
    this.playThread(spell, 0);
    return spell;
  }

  resolveSpell(agentId: string, success: boolean): void {
    const spell = this.activeSpells.get(agentId);
    if (!spell) return;

    spell.phase = "resolution";

    if (success) {
      this.particles.sparkBurst(
        spell.position.x, spell.position.y,
        spell.auraColor, 16, 80,
      );
      const lightIdx = this.lights.addLight({
        x: spell.position.x,
        y: spell.position.y,
        z: 20,
        r: spell.auraColor[0],
        g: spell.auraColor[1],
        b: spell.auraColor[2],
        radius: 150,
        intensity: 1.2,
      });

      this.tweens.delay(600, () => {
        this.lights.removeLight(lightIdx);
      });
    } else {
      this.particles.sparkBurst(
        spell.position.x, spell.position.y,
        [1, 0.2, 0.1], 20, 120,
      );
      const lightIdx = this.lights.addLight({
        x: spell.position.x,
        y: spell.position.y,
        z: 20,
        r: 1, g: 0.2, b: 0.1,
        radius: 120,
        intensity: 1.5,
      });

      this.tweens.delay(400, () => {
        this.lights.removeLight(lightIdx);
      });
    }

    if (spell.lightIndex !== null) {
      this.lights.removeLight(spell.lightIndex);
      spell.lightIndex = null;
    }

    this.tweens.delay(800, () => {
      this.activeSpells.delete(agentId);
    });
  }

  getActiveSpell(agentId: string): ActiveSpell | undefined {
    return this.activeSpells.get(agentId);
  }

  isCasting(agentId: string): boolean {
    return this.activeSpells.has(agentId);
  }

  private playThread(spell: ActiveSpell, index: number): void {
    if (index >= spell.draft.length) {
      spell.phase = "execution";
      return;
    }

    spell.threadIndex = index;
    const thread = spell.draft[index];
    const effect = THREAD_EFFECTS[thread];
    const color = spell.auraColor;
    const tintedColor: [number, number, number] = [
      color[0] * effect.particleColor[0] + 0.3,
      color[1] * effect.particleColor[1] + 0.3,
      color[2] * effect.particleColor[2] + 0.3,
    ];

    this.particles.emit({
      count: effect.particleCount,
      x: spell.position.x,
      y: spell.position.y,
      z: 10,
      speed: effect.particleSpeed,
      speedVar: 20,
      spread: effect.particleSpread,
      color: tintedColor,
      colorVar: 0.15,
      size: effect.particleSize,
      sizeVar: 1,
      life: effect.particleLife,
      lifeVar: 0.2,
      texIndex: effect.particleTexIndex,
    });

    if (spell.lightIndex !== null) {
      this.lights.removeLight(spell.lightIndex);
    }
    spell.lightIndex = this.lights.addLight({
      x: spell.position.x,
      y: spell.position.y,
      z: 15,
      r: color[0] * effect.lightColor[0] + 0.2,
      g: color[1] * effect.lightColor[1] + 0.2,
      b: color[2] * effect.lightColor[2] + 0.2,
      radius: effect.lightRadius,
      intensity: effect.lightIntensity,
    });

    this.tweens.delay(THREAD_STAGGER_MS, () => {
      this.playThread(spell, index + 1);
    });
  }

  update(dt: number): void {
    for (const spell of this.activeSpells.values()) {
      if (spell.phase === "execution" && spell.lightIndex !== null) {
        const pulse = 0.8 + Math.sin(performance.now() * 0.005) * 0.2;
        this.lights.updateLight(spell.lightIndex, { intensity: pulse });
      }
    }
  }
}
