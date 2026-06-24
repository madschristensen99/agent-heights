export interface TaskEvent {
  kind: "text" | "tool" | "result" | "error";
  text: string;
}

import type { GameSettings } from "../../shared/types.js";

export interface RunContext {
  cwd: string;
  model: string;
  systemPrompt: string;
  abort: AbortController;
  settings: GameSettings;
  /** Conversation to resume (null on the agent's first task). */
  sessionId: string | null;
  /** Called with the provider's conversation id so it can be persisted. */
  onSession: (id: string) => void;
}

export type ProviderRunner = (
  task: string,
  ctx: RunContext,
) => AsyncGenerator<TaskEvent, void, void>;

export function truncate(s: string, max = 200): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}
