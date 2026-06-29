export interface TaskEvent {
  kind: "text" | "tool" | "result" | "error";
  text: string;
}

import type { GameSettings } from "../../shared/types.js";

export interface RunContext {
  cwd: string;
  /** Path to the shared workspace for multi-agent collaboration. */
  sharedCwd: string;
  model: string;
  systemPrompt: string;
  abort: AbortController;
  settings: GameSettings;
  /** Agent id — used to key persistent agent instances. */
  agentId: string;
  /** Conversation to resume (null on the agent's first task). */
  sessionId: string | null;
  /** Called with the provider's conversation id so it can be persisted. */
  onSession: (id: string) => void;
  /** Whether to inject Railway MCP tools (devops agents when railway is enabled). */
  railway: boolean;
  /** Per-user API key. Falls back to global SWARMS_API_KEY if null. */
  apiKey: string | null;
  /** Returns the current task board as JSON (for read_board tool). */
  getBoard?: () => { id: string; title: string; status: string; assignedAgentId: string | null }[];
  /** Claim a task card for this agent. Returns true if successful. */
  claimCard?: (cardId: string, agentId: string) => boolean;
  /** Path to the shared event feed (events.jsonl). */
  eventFeedPath?: string;
}

export type ProviderRunner = (
  task: string,
  ctx: RunContext,
) => AsyncGenerator<TaskEvent, void, void>;

export function truncate(s: string, max = 200): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}
