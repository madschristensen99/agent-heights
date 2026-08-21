export interface TaskEvent {
  kind: "text" | "tool" | "result" | "error" | "heartbeat";
  text: string;
}

export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost?: number;
}

import type { GameSettings, MCPServerConfig, CircleServiceConfig, SubscriptionTier } from "../../shared/types.js";
import type { OfficeState } from "../office-state.js";

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
  /** Per-user API key. Falls back to global DEEPSEEK_KEY if null. */
  apiKey: string | null;
  /** Returns the current task board as JSON (for read_board tool). */
  getBoard?: () => { id: string; title: string; status: string; assignedAgentId: string | null }[];
  /** Claim a task card for this agent. Returns true if successful. */
  claimCard?: (cardId: string, agentId: string) => boolean;
  /** Path to the shared event feed (events.jsonl). */
  eventFeedPath?: string;
  /** If true, this is a casual chat — no tools, 1 iteration, short timeout. */
  isChat?: boolean;
  /** If true, start a fresh conversation (don't restore prior messages). A memory summary is injected via systemPrompt instead. */
  freshStart?: boolean;
  /** MCP servers this agent can connect to (e.g. Robinhood Trading MCP). */
  mcpServers?: MCPServerConfig[];
  /** If true, inject CDP Solana wallet tools (auto-provisioned via Coinbase CDP SDK). */
  cdpSolana?: boolean;
  /** If true, inject Crossmint multi-chain wallet tools (auto-provisioned, gas sponsored). */
  crossmintWallet?: boolean;
  /** Premium Circle x402 API services — paid via Circle Gateway, costs flow into usage budget. */
  circleServices?: CircleServiceConfig[];
  /** User's subscription tier — used for usage cap checks on premium API calls. */
  subscriptionTier?: SubscriptionTier | null;
  /** User ID — needed for per-user usage tracking on premium API calls. */
  userId?: string;
  /** Persist full conversation messages for an agent (for context restoration across restarts). */
  saveMessages?: (agentId: string, messages: unknown[]) => Promise<void>;
  /** Load persisted conversation messages for an agent (for context restoration across restarts). */
  loadMessages?: (agentId: string) => Promise<unknown[]>;
  /** Clear persisted conversation messages for an agent. */
  clearMessages?: (agentId: string) => Promise<void>;
  /** Hire an agent (Office Manager only). Triggers helicopter delivery + creates agent. */
  hireAgent?: (name: string, model: string, systemPrompt: string, mcpServers?: MCPServerConfig[]) => Promise<string>;
  /** Delegate a task to another agent (Hermes/devops only). Assigns the task immediately. */
  delegateTask?: (agentName: string, task: string) => string;
  /** Request the Office Manager to hire a new agent (Hermes/devops only). Sends a message to the Office Manager's inbox. */
  requestHire?: (skillArea: string, reason: string) => string;
  /** Called when an agent posts a message to a colleague's inbox. Lets the manager assign a review task to an idle recipient. Returns a delivery status string. */
  onPostMessage?: (recipientFolder: string, fromFolder: string, message: string) => string;
  /** Called when an MCP tool encounters a rate-limit or API funding error. Lets the manager notify the Office Manager, Hermes, and the user. */
  onApiError?: (type: "rate_limit" | "funding", details: { serverLabel: string; toolName: string; message: string }) => void;
  /** Let an agent create a schedule for itself. Returns a result message (success or error). */
  createSelfSchedule?: (name: string, task: string, cronExpression: string) => string;
  /** Let an agent list its own schedules. */
  listSelfSchedules?: () => { id: string; name: string; task: string; cronExpression: string; enabled: boolean; nextRunAt: number; runCount: number; lastRunAt: number | null }[];
  /** Let an agent update its own schedule. Returns a result message. */
  updateSelfSchedule?: (scheduleId: string, updates: { enabled?: boolean; name?: string; task?: string; cronExpression?: string }) => string;
  /** Let an agent delete its own schedule. Returns a result message. */
  deleteSelfSchedule?: (scheduleId: string) => string;
  /** Called after each LLM call with token usage data for spend tracking. */
  onUsage?: (usage: UsageData) => void;
  /** Shared office state graph — enables structured cross-agent coordination. */
  officeState?: OfficeState;
  /** Agent display name — used for attributing state graph nodes. */
  agentName?: string;
  /** Register a self-built MCP server in the office forge. Returns the server object or throws. */
  registerMcpServer?: (opts: {
    name: string;
    description: string;
    runtime: "node" | "python";
    entryFile: string;
  }) => Promise<{ id: string; tools: { name: string; description: string }[] }>;
  /** List all MCP servers registered in the office forge (self-built by any agent). */
  listOfficeMcp?: () => { id: string; name: string; description: string; tools: { name: string; description: string }[]; builtByName: string; status: string }[];
  /** If set, inject Wizard GitHub tools (read/write/create files on the world branch). */
  wizardGithubPat?: string;
  /** Git branch name for the Wizard to operate on (e.g. "worlds/erics-alley"). */
  wizardBranch?: string;
  /** Called when an agent wants to broadcast an HTML file to the office projector. */
  onBroadcastHtml?: (filePath: string) => void;
  /** Ask the boss (user) a blocking question. Returns the user's answer. Resolves with a default after timeout. */
  requestGate?: (question: string, options: string[], freeText?: boolean) => Promise<string>;
  /** Agent proposes an improvement — creates a task card on the board. Returns the card ID. */
  proposeAction?: (title: string, description: string, category: string, severity: "low" | "medium" | "high") => string;
}

export type ProviderRunner = (
  task: string,
  ctx: RunContext,
) => AsyncGenerator<TaskEvent, void, void>;

export function truncate(s: string, max = 200): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}
