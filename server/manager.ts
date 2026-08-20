import { mkdirSync, rmSync, existsSync, readFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { generateOfficeScreenshot, type OfficeSnapshotAgent } from "./office-screenshot.js";
import { generateNarration, type NarrationContext } from "./narration.js";
import type {
  AgentInfo,
  AgentRole,
  AgentStatus,
  AgentSchedule,
  CardStatus,
  CharAppearance,
  FiredAgent,
  GameSettings,
  LogEntry,
  Provider,
  ServerMsg,
  TaskCard,
  PendingTask,
  WorldState,
  MCPServerConfig,
  PersonalityTraits,
  AgentMood,
  PlatformEvent,
  PlatformConnectionState,
  VacationedAgent,
  AgentACL,
  SubscriptionTier,
  CardType,
  TaskCategory,
  TaskPhase,
  OfficeMCPServer,
  WorldTheme,
  AutomationStats,
  DecompositionScore,
} from "../shared/types.js";
import { ACCENTS, CHAR_VARIANTS, DEFAULT_SETTINGS, DEFAULT_PERSONALITY, OFFICE_MANAGER_ID, HERMES_ID, WIZARD_ID, ACCENT_COLOR_OPTIONS, randomPersonality } from "../shared/types.js";
import type { ProviderRunner } from "./providers/types.js";
import { runCline } from "./providers/cline.js";
import { clearAgentMemory, getAgentMessages } from "./providers/cline.js";
import { runTextTools, clearTextToolMemory, getAgentConversations } from "./providers/text-tools.js";
import { HermesClient, PLATFORM_ENV_VAR_MAP } from "./hermes-client.js";
import { HermesProcessManager, syncHermesEnvFile } from "./hermes-process.js";
import type { SessionLogger } from "./logger.js";
import type { Persistence, SaveState } from "./persistence.js";
import { getProviderConfig, resolveModel } from "./providers/api-config.js";
import { recordUsage, getMonthlySpend, getUsageCap } from "./usage.js";
import { supabaseAdmin } from "./supabase.js";
import { CURATED_AGENTS_SUMMARY } from "../shared/mcp-catalog.js";
import { fetchCatalog } from "./mcp-store.js";
import { searchPulseMCP, shouldSearchPulseMCP, extractSearchQuery } from "./pulsemcp.js";
import { parseStoredToken, refreshMcpToken } from "./mcp-oauth.js";
import { getAgentAccount, getAgentBalances as getCdpBalances } from "./providers/cdp-solana.js";
import { getOrCreateAgentWallet as getCrossmintWallet, getAgentBalances as getCrossmintBalances } from "./providers/crossmint-wallets.js";
import type { CircleServiceConfig } from "./providers/premium-proxy.js";
import { OfficeState } from "./office-state.js";
import { registerServer, listServers, getServerConfigs, unregisterServer, loadServers, restartServer } from "./mcp-forge.js";
import { ProfileManager } from "./profile.js";
import { sendCreditDepletion } from "./funnel-emails.js";

/** Build a compact categorized summary of the curated MCP catalog from DB. */
async function catalogSummary(): Promise<string> {
  const catalog = await fetchCatalog();
  if (catalog.length === 0) return "(catalog unavailable)";

  const byCategory: Record<string, { name: string; summary: string; auth: string }[]> = {};
  for (const s of catalog) {
    const entry = { name: s.name, summary: s.summary, auth: s.authType };
    for (const cat of s.category) {
      if (!byCategory[cat]) byCategory[cat] = [];
      if (!byCategory[cat].some((e) => e.name === s.name)) {
        byCategory[cat].push(entry);
      }
    }
  }
  const lines: string[] = [];
  for (const cat of Object.keys(byCategory).sort()) {
    const items = byCategory[cat];
    lines.push(`  ${cat}:`);
    for (const item of items) {
      const authTag = item.auth === "open" ? " (no auth)" : item.auth === "oauth" ? " (OAuth)" : " (API key)";
      lines.push(`    - ${item.name}${authTag}: ${item.summary}`);
    }
  }
  return lines.join("\n");
}

/**
 * Detect if a message to the Office Manager is a question/conversation vs a task command.
 * Questions should be answered directly by the Office Manager (local LLM), not delegated.
 * Task commands (containing action verbs + intent) go to the marketplace API.
 */
function isOfficeManagerQuestion(text: string): boolean {
  const lower = text.toLowerCase().trim();
  // Question patterns
  const questionPatterns = [
    /^(can|could|do|does|is|are|what|which|who|how|why|where|when|tell me about|show me|list|explain)\b/,
    /\?$/,
  ];
  if (questionPatterns.some((p) => p.test(lower))) return true;
  // Knowledge-seeking phrases
  const knowledgePhrases = [
    "what agents", "which agents", "available agents", "hire", "hiring",
    "what tools", "what mcp", "what servers", "what integrations",
    "recommend", "suggest", "help me find", "looking for",
    "tell me about", "what can you do", "what do you know",
    "about the office", "who is", "who's", "what is", "what's",
  ];
  if (knowledgePhrases.some((p) => lower.includes(p))) return true;
  // Task delegation patterns — these go to marketplace
  const taskPatterns = [
    "assign", "delegate", "have someone", "have the team", "have an agent",
    "create a task", "new task", "add a task", "put on the board",
    "hand off", "pass to", "give this to",
  ];
  if (taskPatterns.some((p) => lower.includes(p))) return false;
  // Default: if it's short and conversational, treat as question
  if (text.split(/\s+/).length < 20) return true;
  return false;
}

/** Models that don't support native function calling and need text-based tool parsing. */
const TEXT_TOOL_MODELS = new Set([
  "openrouter/tencent/hy3:free",
]);

/** Pick the right provider runner based on the model's capabilities. */
function pickRunner(model: string): ProviderRunner {
  return TEXT_TOOL_MODELS.has(model) ? runTextTools : runCline;
}

/** Clear memory for both runner types. */
function clearAllMemory(agentId: string): void {
  clearAgentMemory(agentId);
  clearTextToolMemory(agentId);
}

const MAX_LOG = 500;
const DONE_LINGER_MS = 6000;
const TASK_IDLE_TIMEOUT_MS = 90 * 1000; // Abort if no events arrive for 90s (model hung or rate-limited)
const SCHEDULER_TICK_MS = 30 * 1000;
const MIN_SCHEDULE_INTERVAL_MS = 15 * 60 * 1000;
const MAX_DUPLICATE_TOOL_CALLS = 3; // Abort after 3 identical tool calls (was 5 — too permissive)
const MAX_CALLS_PER_TOOL = 10; // Abort after 10 calls to the same tool name (catches varied-input loops)
const MAX_MCP_TOOL_CALLS = 20; // Total MCP-originated tool calls per task before aborting
const MAX_REWORKS = 3; // Maximum rework cycles before warning the manager
const MAX_REVIEW_CHAIN_DEPTH = 3; // Auto-approve after this many review cycles on the same card

/** Patterns that indicate a transient (retryable) failure — rate limit, timeout, API hang. */
const TRANSIENT_FAILURE_PATTERNS = [
  /rate\s*limit/i,
  /too\s*many\s*requests/i,
  /No response from model/i,
  /aborted.*(?:rate limit|API hang)/i,
  /timeout/i,
  /temporarily unavailable/i,
  /service unavailable/i,
  /\b503\b/,
  /\b429\b/,
];

/** Check if a failure reason looks like a transient issue (rate limit, timeout, API hang). */
function isTransientFailure(reason: string): boolean {
  return TRANSIENT_FAILURE_PATTERNS.some((p) => p.test(reason));
}

/** Detect if a task string is itself a rework assignment (sent back by a manager). */
function isReworkTask(task: string): boolean {
  return /was reviewed by.*and needs revision/i.test(task);
}

/** Extract the true original task from a potentially nested rework task string.
 *  Rework tasks wrap the original in: "Original task: "...". If that original
 *  was itself a rework, recurse until we find the real root task. */
function extractOriginalTask(task: string): string {
  let current = task;
  for (let i = 0; i < 5; i++) {
    const match = current.match(/Original task:\s*"((?:[^"\\]|\\.)*)"/i);
    if (!match) break;
    current = match[1].replace(/\\"/g, '"');
  }
  return current;
}

/** Strip nested review/rework/task-completion text from a task string.
 *  Review tasks accumulate nesting like "X completed their task: "Y completed their task: "Z..."".
 *  This extracts the innermost actual task text, capping at maxLen. */
function stripNestedTaskText(task: string, maxLen = 200): string {
  let current = extractOriginalTask(task);
  // Also strip common review-task wrappers that aren't caught by extractOriginalTask
  current = current
    .replace(/^.+?(?:completed|failed) their task:\s*"/i, "")
    .replace(/^.+?sent you a message\. Review it and respond if needed:\s*\n\n"/i, "")
    .replace(/^.+?waiting for review.*?Review it now:\s*\n\nTask:\s*"/i, "")
    .replace(/^A task has been waiting for review.*?Task:\s*"/is, "");
  // Trim trailing quote/period artifacts
  current = current.replace(/[".]?\s*$/, "").trim();
  return current.slice(0, maxLen) || task.slice(0, maxLen);
}

/** Validate a 5-field cron expression and return a specific error message. */
function validateCron(cron: string): { valid: boolean; error?: string } {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5)
    return { valid: false, error: "Cron must have 5 fields: minute hour day-of-month month day-of-week." };
  const fields: [string, number, number, string][] = [
    [parts[0], 0, 59, "minute"],
    [parts[1], 0, 23, "hour"],
    [parts[2], 1, 31, "day of month"],
    [parts[3], 1, 12, "month"],
    [parts[4], 0, 6, "day of week"],
  ];
  for (const [field, min, max, name] of fields) {
    for (const part of field.split(",")) {
      if (part === "*") continue;
      if (part.includes("/")) {
        const [range, stepStr] = part.split("/");
        const step = parseInt(stepStr, 10);
        if (isNaN(step) || step <= 0)
          return { valid: false, error: `Invalid step "${stepStr}" in ${name} field.` };
        if (range !== "*") {
          const [a, b] = range.split("-").map((n) => parseInt(n, 10));
          if (isNaN(a) || isNaN(b) || a < min || a > max || b < min || b > max)
            return { valid: false, error: `Invalid range "${range}" in ${name} field (valid: ${min}-${max}).` };
        }
      } else if (part.includes("-")) {
        const [a, b] = part.split("-").map((n) => parseInt(n, 10));
        if (isNaN(a) || isNaN(b) || a < min || a > max || b < min || b > max)
          return { valid: false, error: `Invalid range "${part}" in ${name} field (valid: ${min}-${max}).` };
      } else {
        const v = parseInt(part, 10);
        if (isNaN(v) || v < min || v > max)
          return { valid: false, error: `Invalid value "${part}" in ${name} field (valid: ${min}-${max}).` };
      }
    }
  }
  return { valid: true };
}

/** Parse a 5-field cron expression and return the next run time after `from`.
 *  Supports: * / N ranges , and specific numbers. Does NOT support L, W, #, or names.
 *  Returns null for invalid expressions. */
function nextCronRun(cron: string, from: Date = new Date()): number | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minF, hourF, domF, monthF, dowF] = parts;

  const parseField = (field: string, min: number, max: number): number[] => {
    if (field === "*") return Array.from({ length: max - min + 1 }, (_, i) => min + i);
    const result = new Set<number>();
    for (const part of field.split(",")) {
      if (part.includes("/")) {
        const [range, stepStr] = part.split("/");
        const step = parseInt(stepStr, 10);
        if (isNaN(step) || step <= 0) continue;
        let lo = min, hi = max;
        if (range !== "*") {
          const [a, b] = range.split("-").map((n) => parseInt(n, 10));
          if (!isNaN(a)) lo = a;
          if (!isNaN(b)) hi = b;
        }
        for (let v = lo; v <= hi; v += step) result.add(v);
      } else if (part.includes("-")) {
        const [a, b] = part.split("-").map((n) => parseInt(n, 10));
        if (!isNaN(a) && !isNaN(b)) for (let v = a; v <= b; v++) result.add(v);
      } else {
        const v = parseInt(part, 10);
        if (!isNaN(v)) result.add(v);
      }
    }
    return [...result].filter((v) => v >= min && v <= max).sort((a, b) => a - b);
  };

  const minutes = parseField(minF, 0, 59);
  const hours = parseField(hourF, 0, 23);
  const doms = parseField(domF, 1, 31);
  const months = parseField(monthF, 1, 12);
  const dows = parseField(dowF, 0, 6);

  if (minutes.length === 0 || hours.length === 0 || doms.length === 0 || months.length === 0 || dows.length === 0)
    return null;

  // Start from the next minute
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);

  // Search up to 366 days ahead
  for (let i = 0; i < 527_040; i++) {
    if (!months.includes(d.getMonth() + 1)) {
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    if (!doms.includes(d.getDate()) || !dows.includes(d.getDay())) {
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    if (!hours.includes(d.getHours())) {
      d.setHours(d.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!minutes.includes(d.getMinutes())) {
      d.setMinutes(d.getMinutes() + 1, 0, 0);
      continue;
    }
    return d.getTime();
  }
  return null;
}

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

interface QueuedTask {
  task: string;
  handoffTo: string | null;
  cardId: string | null;
  /** True when this task is being resumed after a server restart. */
  isResume?: boolean;
  /** Schedule that fired this task, if any (for backoff tracking). */
  scheduleId?: string | null;
  /** Review context if this queued task is a manager review. */
  reviewContext?: { agentId: string; agentName: string; originalTask: string; cardId?: string | null } | null;
  /** Agent to release from "waiting" when this task finishes. */
  notifyOnComplete?: string | null;
  /** Agent to walk to and wait at after completing this task. */
  waitFor?: string | null;
  /** If true, start a fresh conversation when this queued task runs. */
  freshStart?: boolean;
  /** Platform context for tasks delegated from a messaging platform (Telegram, etc.). */
  platformContext?: { platform: string; sender: string } | null;
}

interface TaskHistoryEntry {
  task: string;
  success: boolean;
  ts: number;
  durationMs: number;
}

interface AgentRuntime {
  info: AgentInfo;
  logs: LogEntry[];
  abort: AbortController | null;
  doneTimer: ReturnType<typeof setTimeout> | null;
  /** Agent id to forward the result to when the current task succeeds. */
  handoffTo: string | null;
  /** Task card this run came from, if any (for auto-moving cards on done/error). */
  cardId: string | null;
  /** Schedule that fired the current task, if any (for backoff tracking). */
  scheduleId: string | null;
  /** Pending tasks waiting to run after the current one finishes. */
  taskQueue: QueuedTask[];
  /** Timestamp of next autonomous think tick (0 = no tick scheduled). */
  nextThinkAt: number;
  /** Cooldown after last autonomous action to avoid spamming. */
  thinkCooldownUntil: number;
  /** Recent completed tasks (newest first, capped at 20). */
  taskHistory: TaskHistoryEntry[];
  /** Timestamp when the current task started (for duration tracking). */
  taskStartedAt: number;
  /** Context for review tasks: which agent+task is being reviewed. */
  reviewContext: { agentId: string; agentName: string; originalTask: string; cardId?: string | null } | null;
  /** Platform context for tasks that came from a messaging platform (Telegram, etc.). */
  platformContext: { platform: string; sender: string } | null;
  /** Agent ID we are waiting at (status "waiting"). */
  waitingFor: string | null;
  /** Agent to release from "waiting" when the current task finishes. */
  notifyOnComplete: string | null;
  /** Agent to walk to and wait at after completing the current task. */
  waitFor: string | null;
  /** If true, the next runTask starts a fresh conversation (no prior message restore). */
  freshStart: boolean;
  /** Summary of prior tasks injected into the system prompt on a fresh start. */
  memorySummary: string | null;
  /** If true, a stale-session retry has already been attempted for the current task. */
  retryAttempted: boolean;
  /** Number of times the current task has been sent back for rework by a manager. */
  reworkCount: number;
  /** Pending decision gate: blocks the task until the boss resolves it. */
  pendingGate: { id: string; resolve: (answer: string) => void; timer: ReturnType<typeof setTimeout>; options?: string[] } | null;
}

/** Keyword expansion for TaskCategory values used in skill-based mail routing. */
const TASK_CATEGORY_KEYWORDS: Record<string, string[]> = {
  frontend: ["frontend", "ui", "css", "html", "react", "vue", "design", "layout", "styling", "component", "tailwind"],
  backend: ["backend", "api", "server", "database", "sql", "endpoint", "rest", "graphql", "microservice", "auth"],
  devops: ["devops", "docker", "kubernetes", "deploy", "ci", "cd", "pipeline", "infra", "terraform", "cloud"],
  data: ["data", "analytics", "chart", "graph", "statistics", "ml", "model", "dataset", "query", "etl"],
  writing: ["writing", "content", "blog", "article", "copy", "documentation", "docs", "summary", "report"],
  research: ["research", "search", "analyze", "investigate", "study", "compare", "evaluate", "review"],
  crypto: ["crypto", "blockchain", "solana", "ethereum", "token", "wallet", "defi", "nft", "smart contract", "web3"],
  general: [],
};

export class AgentManager {
  /** Static registry of all active AgentManagers keyed by userId.
   *  Used by the Hermes event dispatcher to route inbound platform events
   *  to the correct user's manager (instead of always routing to the first
   *  user who initialized the gateway). */
  private static managersByUserId = new Map<string, AgentManager>();

  /** Get the AgentManager for a given userId, or null if not registered. */
  static getManagerByUserId(userId: string): AgentManager | null {
    return AgentManager.managersByUserId.get(userId) ?? null;
  }

  private agents = new Map<string, AgentRuntime>();
  private board = new Map<string, TaskCard>();

  /** Number of active agents in this office. */
  get agentCount(): number { return this.agents.size; }
  /** Number of hireable agents (excludes permanent NPCs Office Manager & Hermes). */
  get hireableAgentCount(): number {
    let n = 0;
    for (const id of this.agents.keys()) {
      if (id !== OFFICE_MANAGER_ID && id !== HERMES_ID && id !== WIZARD_ID) n++;
    }
    return n;
  }
  private schedules = new Map<string, AgentSchedule>();
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private proactiveUpdateTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly PROACTIVE_UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private soulRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly SOUL_REFRESH_MS = 60_000; // 60 seconds
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly HEALTH_CHECK_INTERVAL_MS = 60_000; // 60 seconds
  private static readonly MAX_TASK_DURATION_MS = 30 * 60 * 1000; // 30 minutes
  private static readonly STALE_REVIEW_MS = 10 * 60 * 1000; // 10 minutes
  private proactiveLastSent = new Map<string, number>(); // key: platform:sender → last sent timestamp
  private firedAgents = new Map<string, FiredAgent>();
  private vacationedAgents = new Map<string, VacationedAgent>();
  private worldSeed = 0;
  private chunkOverrides: Record<string, Record<number, number>> = {};
  private workspaceRoot: string;
  settings: GameSettings = structuredClone(DEFAULT_SETTINGS);
  bossName = "the boss";
  private apiKey: string | null;
  private mcpKeys: Record<string, string> = {};
  private platformEvents = new Map<string, PlatformEvent[]>();
  private platformFlags = new Map<string, boolean>();
  private platformPending = new Map<string, number>();
  private platformLastMessage = new Map<string, string>();
  private platformAssignedAgent = new Map<string, string>();
  private platformStates: PlatformConnectionState[] = [];
  private hermesClient: HermesClient | null = null;
  private hermesProcess: HermesProcessManager | null = null;
  /** Timestamp of the last gateway restart triggered by configurePlatform. */
  private lastGatewayRestartAt = 0;
  private static readonly GATEWAY_RESTART_COOLDOWN_MS = 30_000;
  /** Undelivered mail waiting for an idle agent. */
  private mailQueue: { platform: string; sender: string; text: string; ts: number; retries: number }[] = [];
  private shuttingDown = false;
  /** Shared office state graph — structured cross-agent coordination. */
  private officeState = new OfficeState();
  /** Pending handoffs waiting for manager review (keyed by worker agent ID). */
  private pendingHandoffs = new Map<string, { targetId: string; task: string; result: string; cardId: string | null; notifyId?: string }>();
  /** Current subscription tier — set by server when payment status is loaded. */
  subscriptionTier: SubscriptionTier | null = null;
  /** Whether the user has paid the one-time entry fee. */
  entrancePaid = false;
  /** Max agents allowed for this user's tier. */
  agentLimit = 0;
  /** Timestamp of last WebSocket activity from the user. */
  lastActiveAt = Date.now();
  /** Timestamp of last inbound platform message from the user. */
  lastPlatformEngagementAt = 0;
  /** Timestamp of last platform notification sent (rate limit). */
  private lastPlatformNotificationAt = 0;

  /** Update the API key used for agent tasks (e.g. when user sets a new key). */
  setApiKey(key: string | null): void {
    this.apiKey = key;
  }

  /** Update the user's MCP server API keys (serverUrl -> decrypted key). */
  setMcpKeys(keys: Record<string, string>): void {
    this.mcpKeys = keys;
  }

  /** Inject the user's stored MCP API keys into the server configs at task time.
   *  Also refreshes expired OAuth tokens automatically.
   *  For remote servers: injects authToken (and refreshes OAuth tokens).
   *  For stdio servers: injects env vars from stored JSON credential blob. */
  private async injectMcpKeys(servers?: MCPServerConfig[]): Promise<MCPServerConfig[] | undefined> {
    if (!servers || servers.length === 0) return servers;
    const result: MCPServerConfig[] = [];
    for (const s of servers) {
      // Remote servers: look up by URL; stdio servers: look up by name
      const keyId = s.url ?? s.name;
      const raw = keyId ? this.mcpKeys[keyId] : undefined;
      if (!raw) {
        console.log(`[mcp-inject] No key for ${keyId ?? "(no url/name)"}`);
        result.push(s);
        continue;
      }

      // For stdio servers, the stored value may be a JSON blob of env vars
      if (!s.url && s.command) {
        try {
          const envVars = JSON.parse(raw);
          if (typeof envVars === "object" && envVars !== null) {
            console.log(`[mcp-inject] Injecting env vars for stdio server ${s.name}`);
            result.push({ ...s, env: { ...s.env, ...envVars } });
            continue;
          }
        } catch {
          // Not JSON — fall through to treat as a plain token
        }
        // Plain string: inject using the first envVar name if defined, otherwise MCP_API_KEY
        const envVarName = s.envVars?.[0]?.name ?? "MCP_API_KEY";
        console.log(`[mcp-inject] Injecting plain key as ${envVarName} for stdio server ${s.name}`);
        result.push({ ...s, env: { ...s.env, [envVarName]: raw } });
        continue;
      }

      // For remote servers with user-provided URL (e.g. n8n), the stored value is
      // a JSON blob { url, token }. Parse it and inject both the URL and authToken.
      if (!s.url && !s.command && s.urlPlaceholder) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && parsed.url && parsed.token) {
            console.log(`[mcp-inject] Injecting URL + token for per-instance server ${s.name} → ${parsed.url}`);
            result.push({ ...s, url: parsed.url, authToken: parsed.token });
            continue;
          }
        } catch {
          // Not JSON — fall through to treat as a plain token
        }
        console.log(`[mcp-inject] No valid URL+token blob for per-instance server ${s.name}`);
        result.push(s);
        continue;
      }

      // Remote server: existing OAuth/token flow
      const stored = parseStoredToken(raw);
      let token = stored.access_token;
      console.log(`[mcp-inject] Found token for ${s.url}, expires_at=${stored.expires_at ?? "none"}, has_refresh=${!!stored.refresh_token}, token_prefix=${token?.slice(0, 20)}...`);
      // Check if token is expired (or will expire in the next 60s)
      if (stored.expires_at && stored.expires_at < Date.now() + 60_000) {
        console.log(`[mcp] Token for ${s.url} expired, attempting refresh...`);
        const refreshed = await refreshMcpToken(this.userId, s.url!, stored);
        if (refreshed) {
          token = refreshed;
          // Update in-memory cache
          this.mcpKeys[s.url!] = JSON.stringify({ ...stored, access_token: token });
        } else {
          console.warn(`[mcp] Token refresh failed for ${s.url} — using old token (may fail)`);
        }
      }
      result.push({ ...s, authToken: token });
    }
    return result;
  }

  private isUserConnectedFn: () => boolean;
  private dialectSuffix: string | null = null;
  private dialectStyle: string | null = null;
  public onTaskComplete: ((agentId: string, success: boolean, durationMin: number, taskType: string) => void) | null = null;

  constructor(
    rootDir: string,
    private broadcast: (msg: ServerMsg) => void,
    private session: SessionLogger,
    private save: Persistence,
    saved: SaveState | null,
    apiKey: string | null = null,
    private userId: string = "",
    isUserConnected: (() => boolean) | null = null,
  ) {
    this.isUserConnectedFn = isUserConnected ?? (() => true);
    this.workspaceRoot = join(rootDir, "workspace");
    mkdirSync(this.workspaceRoot, { recursive: true });
    mkdirSync(join(this.workspaceRoot, "shared"), { recursive: true });
    this.apiKey = apiKey;

    // Load world-theme.json dialect (accent) if present on disk
    try {
      const themePath = join(rootDir, "client/public/assets/world-theme.json");
      if (existsSync(themePath)) {
        const theme = JSON.parse(readFileSync(themePath, "utf8")) as WorldTheme;
        if (theme.dialect?.systemPromptSuffix) {
          this.dialectSuffix = theme.dialect.systemPromptSuffix;
          this.dialectStyle = theme.dialect.chatStyle ?? null;
          console.log(`[manager] World dialect loaded: ${theme.dialect.chatStyle ?? theme.id}`);
        }
      }
    } catch (e) {
      // No theme or parse error — fine, default neutral accent
    }

    // reload the office from the save file
    const savedPendingTasks = saved?.pendingTasks ?? {};
    let resumedCount = 0;
    for (const info of saved?.agents ?? []) {
      const wasBusy = info.status === "thinking" || info.status === "working";
      info.status = "idle";
      info.task = null;
      info.role = info.role ?? "worker"; // pre-role saves
      const logs = saved?.logs[info.id] ?? [];
      if (wasBusy) {
        logs.push({
          ts: Date.now(),
          kind: "status",
          text: "Server restarted — the task that was running got interrupted.",
        });
      }
      this.agents.set(info.id, { info, logs, abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [], nextThinkAt: 0, thinkCooldownUntil: 0, taskHistory: [], taskStartedAt: 0, scheduleId: null, reviewContext: null, platformContext: null, waitingFor: null, notifyOnComplete: null, waitFor: null, freshStart: false, memorySummary: null, retryAttempted: false, reworkCount: 0, pendingGate: null });
    }
    if (this.agents.size > 0) {
      console.log(`[agent-heights] restored ${this.agents.size} agent(s) from save`);
    }
    // reload the world state (seed + fired agents + chunk overrides) from the save file
    const world = this.save.getWorld();
    this.worldSeed = world.seed || Math.floor(Math.random() * 0xffffffff);
    this.chunkOverrides = world.chunkOverrides ?? {};
    if (!world.seed) {
      this.save.setWorld({ seed: this.worldSeed, firedAgents: [], chunkOverrides: {} });
    }
    for (const fa of world.firedAgents) {
      this.firedAgents.set(fa.id, fa);
    }
    if (this.firedAgents.size > 0) {
      console.log(`[agent-heights] restored ${this.firedAgents.size} fired agent(s) in the Labyrinth`);
    }
    for (const va of world.vacationedAgents ?? []) {
      this.vacationedAgents.set(va.id, va);
    }
    if (this.vacationedAgents.size > 0) {
      console.log(`[agent-heights] restored ${this.vacationedAgents.size} vacationed agent(s)`);
    }
    // reload the task board from the save file
    for (const card of saved?.board ?? []) {
      this.board.set(card.id, card);
    }
    // any card that was in-progress when the server stopped goes back to backlog
    // UNLESS the agent has pending tasks to resume (the card will be re-assigned)
    // Paused cards stay paused — they were intentionally stopped by the human
    const agentsWithPendingTasks = new Set(Object.keys(savedPendingTasks));
    for (const card of this.board.values()) {
      if (card.status === "in_progress") {
        if (card.assignedAgentId && agentsWithPendingTasks.has(card.assignedAgentId)) {
          // Keep the card in_progress — the agent will resume it
          continue;
        }
        card.status = "backlog";
        card.assignedAgentId = null;
      }
    }
    if (this.board.size > 0) {
      console.log(`[agent-heights] restored ${this.board.size} task card(s) from save`);
    }
    // restore the office state graph from the save file
    if (saved?.officeState) {
      this.officeState.fromJSON(saved.officeState);
      console.log(`[agent-heights] restored office state graph: ${this.officeState.toJSON().nodes.length} nodes`);
    }
    // reload schedules from the save file — skip orphaned schedules whose agent was fired/removed
    let orphanedScheduleCount = 0;
    for (const sched of saved?.schedules ?? []) {
      if (!this.agents.has(sched.agentId)) {
        orphanedScheduleCount++;
        continue;
      }
      // recompute nextRunAt if it's in the past (server was down)
      if (sched.enabled && sched.nextRunAt <= Date.now()) {
        const recomputed = nextCronRun(sched.cronExpression);
        sched.nextRunAt = recomputed ?? Date.now() + MIN_SCHEDULE_INTERVAL_MS;
      }
      this.schedules.set(sched.id, sched);
    }
    if (this.schedules.size > 0) {
      console.log(`[agent-heights] restored ${this.schedules.size} schedule(s) from save`);
    }
    if (orphanedScheduleCount > 0) {
      console.log(`[agent-heights] skipped ${orphanedScheduleCount} orphaned schedule(s) (agent no longer exists)`);
      this.persistSchedules();
    }
    if (saved?.settings) {
      this.setSettings(saved.settings, false);
    }

    this.ensureOfficeManager();
    this.ensureHermes();
    this.ensureWizard();
    this.seedTestMail();
    void this.startHermesGateway();

    // Start the scheduler tick
    this.schedulerTimer = setInterval(() => this.tickSchedules(), SCHEDULER_TICK_MS);

    // Start proactive platform update timer
    this.proactiveUpdateTimer = setInterval(() => this.tickProactiveUpdates(), AgentManager.PROACTIVE_UPDATE_INTERVAL_MS);

    // Start SOUL.md refresh — injects live office state into Hermes receptionist context
    // The initial call happens at the end of startHermesGateway() once hermesProcess is ready
    this.soulRefreshTimer = setInterval(() => this.refreshSoulMd(), AgentManager.SOUL_REFRESH_MS);

    // Start health check — detects hung agents and stale reviews
    this.startHealthCheck();

    // Resume pending tasks for agents that were interrupted by a server restart
    let resumedAny = false;
    console.log(`[manager] constructor: savedPendingTasks for user ${this.userId}:`, JSON.stringify(Object.fromEntries(Object.entries(savedPendingTasks).map(([id, ts]) => [id, ts.length]))));
    for (const [agentId, tasks] of Object.entries(savedPendingTasks)) {
      if (tasks.length === 0) continue;
      const rt = this.agents.get(agentId);
      if (!rt) continue; // agent was fired or removed
      for (const t of tasks) {
        rt.taskQueue.push({ task: t.task, handoffTo: t.handoffTo, cardId: t.cardId, isResume: true, notifyOnComplete: t.notifyOnComplete ?? null, waitFor: t.waitFor ?? null });
      }
      const first = tasks[0];
      this.log(rt, "status", `Resuming task from before update: ${first.task}`);
      resumedCount++;
      resumedAny = true;
      // Drain the first task immediately — the rest stay queued.
      // The task string is passed as-is; the cline provider restores prior
      // conversation history via loadMessages, so the agent sees the task
      // again with full context of what it already did.
      this.drainQueue(rt);
    }
    if (resumedCount > 0) {
      console.log(`[agent-heights] resumed ${resumedCount} agent task(s) from pending state`);
    }
    // Only clear pending tasks from save if we actually loaded saved state
    // AND didn't resume anything. If saved is null (load failed), clearing
    // would destroy previously persisted tasks in the DB that we simply
    // failed to read. If drainQueue started a task, persist() will have
    // already written the new active task to pendingTasks — clearing here
    // would race with that.
    if (!resumedAny && saved) {
      this.save.clearPendingTasks();
    }

    // Register this manager in the static registry so the Hermes event
    // dispatcher can route inbound platform events to the correct user.
    if (this.userId) {
      AgentManager.managersByUserId.set(this.userId, this);
      console.log(`[manager] Registered manager for user ${this.userId} in static registry`);
    }

    // Load persisted forge servers (self-built MCP servers)
    void this.loadForgeServers();
  }

  setSettings(s: GameSettings, announce = true): void {
    this.settings = {
      cline: {
        maxIterations: Math.min(500, Math.max(1, Math.round(Number(s?.cline?.maxIterations) || 60))),
        autoApproveCommands: s?.cline?.autoApproveCommands !== false,
        reviewBeforeHandoff: s?.cline?.reviewBeforeHandoff === true,
      },
      game: {
        idleWander: s?.game?.idleWander !== false,
        theme: s?.game?.theme === "agentHeights" ? "agentHeights" : "classic",
      },
      railway: {
        enabled: s?.railway?.enabled === true,
      },
      mailboxPlatforms: Array.isArray(s?.mailboxPlatforms) && s.mailboxPlatforms.length === 6
        ? s.mailboxPlatforms
        : [null, null, null, null, null, null],
    };
    // Sync the hermes client with the new mailbox platforms
    if (this.hermesClient) {
      this.hermesClient.setMailboxPlatforms(this.settings.mailboxPlatforms);
    }
    if (announce) {
      this.session.record("settings", { settings: this.settings });
      this.save.setSettings(this.settings);
      this.broadcast({ type: "settings", settings: this.settings });
    }
  }

  /** Ensure the Office Manager — the permanent office manager — always exists in the roster. */
  private ensureOfficeManager(): void {
    if (this.agents.has(OFFICE_MANAGER_ID)) {
      const rt = this.agents.get(OFFICE_MANAGER_ID)!;
      if (!rt.info.appearance) {
        rt.info.appearance = { skin: 0, hairStyle: 3, hair: 8, shirt: 9, pants: 6, accessory: 2, accent: 0, beard: 0, eyeColor: 3, headFeature: 0 };
        this.persist();
        this.broadcast({ type: "agent", agent: rt.info });
      }
      return;
    }
    const info: AgentInfo = {
      id: OFFICE_MANAGER_ID,
      name: "Office Manager",
      title: "",
      provider: "cline",
      model: "claude-sonnet-4-20250514",
      status: "idle",
      task: null,
      deskIndex: -1,
      sprite: 0,
      appearance: { skin: 0, hairStyle: 3, hair: 8, shirt: 9, pants: 6, accessory: 2, accent: 0, beard: 0, eyeColor: 3, headFeature: 0 },
      accent: "#c44a4a",
      systemPrompt: "",
      role: "manager",
      sessionId: null,
      tasksDone: 0,
      personality: { openness: 0.7, conscientiousness: 0.8, extraversion: 0.6, agreeableness: 0.9, neuroticism: 0.2 },
      mood: "content",
    };
    mkdirSync(this.cwdFor("office-manager", OFFICE_MANAGER_ID), { recursive: true });
    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [], nextThinkAt: 0, thinkCooldownUntil: 0, taskHistory: [], taskStartedAt: 0, scheduleId: null, reviewContext: null, platformContext: null, waitingFor: null, notifyOnComplete: null, waitFor: null, freshStart: false, memorySummary: null, retryAttempted: false, reworkCount: 0, pendingGate: null };
    this.agents.set(OFFICE_MANAGER_ID, rt);
    this.persist();
    this.broadcast({ type: "agent", agent: info });
  }

  /** Ensure Hermes — the permanent devops engineer — always exists in the roster. */
  private ensureHermes(): void {
    if (this.agents.has(HERMES_ID)) {
      const rt = this.agents.get(HERMES_ID)!;
      if (!rt.info.appearance) {
        rt.info.appearance = { skin: 0, hairStyle: 9, hair: 3, shirt: 2, pants: 5, accessory: 1, accent: 1, beard: 4, eyeColor: 3, headFeature: 0, bodyType: "fat" };
        this.persist();
        this.broadcast({ type: "agent", agent: rt.info });
      }
      return;
    }
    const info: AgentInfo = {
      id: HERMES_ID,
      name: "Hermes",
      title: "",
      provider: "cline",
      model: "claude-sonnet-4-20250514",
      status: "idle",
      task: null,
      deskIndex: -1,
      sprite: 0,
      appearance: { skin: 0, hairStyle: 9, hair: 3, shirt: 2, pants: 5, accessory: 1, accent: 1, beard: 4, eyeColor: 3, headFeature: 0, bodyType: "fat" },
      accent: "#3a7cb5",
      systemPrompt: "",
      role: "devops",
      sessionId: null,
      tasksDone: 0,
      personality: { openness: 0.5, conscientiousness: 0.9, extraversion: 0.3, agreeableness: 0.6, neuroticism: 0.4 },
      mood: "content",
    };
    mkdirSync(this.cwdFor("hermes", HERMES_ID), { recursive: true });
    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [], nextThinkAt: 0, thinkCooldownUntil: 0, taskHistory: [], taskStartedAt: 0, scheduleId: null, reviewContext: null, platformContext: null, waitingFor: null, notifyOnComplete: null, waitFor: null, freshStart: false, memorySummary: null, retryAttempted: false, reworkCount: 0, pendingGate: null };
    this.agents.set(HERMES_ID, rt);
    this.persist();
    this.broadcast({ type: "agent", agent: info });
  }

  /** Ensure the Wizard — the world-builder NPC — exists only in deployed world branches.
   *  The Wizard has GitHub tools to read and modify files on the world's Git branch.
   *  Only spawns when WIZARD_GITHUB_PAT is set AND the branch is not main/master
   *  (the Wizard is a premium feature for world instances, not the generic HQ). */
  private ensureWizard(): void {
    const wizardPat = process.env.WIZARD_GITHUB_PAT;
    const wizardBranch = process.env.WIZARD_BRANCH ?? "main";
    if (!wizardPat) return;
    if (wizardBranch === "main" || wizardBranch === "master") return;

    if (this.agents.has(WIZARD_ID)) {
      const rt = this.agents.get(WIZARD_ID)!;
      if (!rt.info.appearance) {
        rt.info.appearance = { skin: 1, hairStyle: 6, hair: 5, shirt: 5, pants: 3, accessory: 4, accent: 2, beard: 0, eyeColor: 1, headFeature: 1 };
        this.persist();
        this.broadcast({ type: "agent", agent: rt.info });
      }
      return;
    }
    const info: AgentInfo = {
      id: WIZARD_ID,
      name: "Wizard",
      title: "World Builder",
      provider: "cline",
      model: "claude-sonnet-4-20250514",
      status: "idle",
      task: null,
      deskIndex: -1,
      sprite: 0,
      appearance: { skin: 1, hairStyle: 6, hair: 5, shirt: 5, pants: 3, accessory: 4, accent: 2, beard: 0, eyeColor: 1, headFeature: 1 },
      accent: "#8b5cf6",
      systemPrompt: "",
      role: "worker",
      sessionId: null,
      tasksDone: 0,
      personality: { openness: 0.9, conscientiousness: 0.7, extraversion: 0.5, agreeableness: 0.8, neuroticism: 0.3 },
      mood: "content",
    };
    mkdirSync(this.cwdFor("wizard", WIZARD_ID), { recursive: true });
    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [], nextThinkAt: 0, thinkCooldownUntil: 0, taskHistory: [], taskStartedAt: 0, scheduleId: null, reviewContext: null, platformContext: null, waitingFor: null, notifyOnComplete: null, waitFor: null, freshStart: false, memorySummary: null, retryAttempted: false, reworkCount: 0, pendingGate: null };
    this.agents.set(WIZARD_ID, rt);
    this.persist();
    this.broadcast({ type: "agent", agent: info });
    console.log(`[manager] Wizard NPC spawned (branch: ${wizardBranch})`);

    // Auto-assign wizard-task.txt if it exists (committed during world generation)
    try {
      const taskPath = join(process.cwd(), "wizard-task.txt");
      if (existsSync(taskPath)) {
        const conceptPrompt = readFileSync(taskPath, "utf-8").trim();
        if (conceptPrompt) {
          console.log(`[manager] Wizard: found wizard-task.txt (${conceptPrompt.length} chars), auto-assigning…`);
          // Defer assignment slightly so the client has time to connect
          setTimeout(() => {
            const wizardRt = this.agents.get(WIZARD_ID);
            if (wizardRt && wizardRt.info.status === "idle") {
              this.assign(WIZARD_ID, conceptPrompt);
            }
          }, 3000);
        }
      }
    } catch (err) {
      console.warn(`[manager] Wizard: failed to read wizard-task.txt:`, err);
    }
  }

  /** Load persisted mail events from the save state, or seed test data on a fresh server. */
  private seedTestMail(): void {
    if (this.platformEvents.size > 0) return;

    // If we have persisted mail events from the DB, load them
    const savedEvents = (this.save as any).state?.mailEvents as PlatformEvent[] | undefined;
    if (savedEvents && savedEvents.length > 0) {
      for (const ev of savedEvents) {
        const list = this.platformEvents.get(ev.platform) ?? [];
        list.push(ev);
        if (list.length > AgentManager.PLATFORM_EVENT_MAX) list.splice(0, list.length - AgentManager.PLATFORM_EVENT_MAX);
        this.platformEvents.set(ev.platform, list);
        if (ev.direction === "inbound") {
          this.platformFlags.set(ev.platform, true);
          this.platformPending.set(ev.platform, (this.platformPending.get(ev.platform) ?? 0) + 1);
          this.platformLastMessage.set(ev.platform, `${ev.sender}: ${ev.text.slice(0, 200)}`);
        }
      }
      return;
    }

    // No persisted events — seed test data for a fresh server
    const testEvents: [string, "inbound" | "outbound", string, string][] = [
      ["Slack", "inbound", "sarah@design", "Can someone review the new landing page?"],
      ["Slack", "inbound", "mike@eng", "Deploy is stuck — need devops help"],
      ["Discord", "inbound", "moderator", "New feature request: dark mode for the dashboard"],
      ["WhatsApp", "inbound", "+1-555-0100", "Meeting moved to 3pm"],
      ["Signal", "inbound", "ops-team", "Server CPU spike on prod-04"],
      ["Email", "inbound", "boss@company.com", "Q3 roadmap review needed by Friday"],
    ];
    for (const [platform, direction, sender, text] of testEvents) {
      const ev: PlatformEvent = { platform, direction, sender, text, timestamp: Date.now() - Math.random() * 3600_000 };
      const list = this.platformEvents.get(platform) ?? [];
      list.push(ev);
      this.platformEvents.set(platform, list);
      this.platformFlags.set(platform, true);
      this.platformPending.set(platform, 1);
      this.platformLastMessage.set(platform, `${sender}: ${text}`);
    }
  }

  /** Start the Hermes gateway process and then the polling client. */
  private async startHermesGateway(): Promise<void> {
    // Start (or detect) the Hermes serve process as a managed child process (singleton)
    this.hermesProcess = HermesProcessManager.getInstance();

    // Pass saved platform credentials (tokens + home channels) so they're written
    // to .env BEFORE the gateway starts — prevents "No home channel" message
    // Skip for org managers — they don't own platform credentials
    if (!this.userId.startsWith("org:")) {
      try {
        const savedCreds = this.save.getPlatformCredentials();
        // Only pass creds if this user has an actual bot token, not just home channel
        if (this.hasPlatformBotToken()) {
          this.hermesProcess.setPlatformEnvVars(savedCreds);
          console.log(`[hermes] Passing saved credentials to HermesProcessManager: ${Object.keys(savedCreds).join(", ")}`);
        }
      } catch { /* best effort */ }
    }

    // Write office state to config.yaml BEFORE the gateway starts,
    // so the system prompt is correct from the very first message
    this.writeOfficeStateNow();

    await this.hermesProcess.start();

    // Only run the polling client setup + gateway auto-start + auto-reconfigure
    // ONCE per process. Multiple AgentManager instances (one per user session)
    // would each call startGateway() and autoReconfigurePlatforms(), causing
    // multiple gateway restarts and "Gateway shutting down" Telegram notifications.
    if (AgentManager.hermesGatewayInitialized) {
      // Still set hermesClient on this instance so it can use it
      this.hermesClient = HermesClient.getInstance();
      return;
    }
    AgentManager.hermesGatewayInitialized = true;

    // Use singleton — multiple Manager instances share one polling client
    this.hermesClient = HermesClient.getInstance(
      undefined,
      this.hermesProcess.getSessionToken(),
    );
    this.hermesClient.setMailboxPlatforms(this.settings.mailboxPlatforms);
    this.hermesClient.start(
      (states) => {
        // Broadcast platform connection states to ALL connected users.
        // Platform states are global (the gateway is shared), so every
        // manager needs to see the current state.
        for (const mgr of AgentManager.managersByUserId.values()) {
          mgr.platformStates = states;
          mgr.broadcast({ type: "platform_connection", states });
        }
      },
      (event) => {
        // Route the event to the correct user's manager based on ownerUserId.
        // This prevents all inbound messages from going to the first user
        // who initialized the gateway.
        const targetUserId = event.ownerUserId;
        const targetMgr = targetUserId
          ? AgentManager.getManagerByUserId(targetUserId)
          : null;

        if (targetMgr) {
          // Route to the owner's manager
          targetMgr.handlePlatformEvent(event);
        } else {
          // Fallback: no owner registered — route to this manager (the one
          // that initialized the gateway). This preserves backward compat
          // for platforms configured before ownership tracking was added.
          console.warn(`[hermes] No owner registered for platform ${event.platform} — falling back to gateway initializer (user ${this.userId})`);
          this.handlePlatformEvent(event);
        }
      },
    );

    // hermesProcess.start() already spawns the gateway — no need to call
    // startGateway() here. Doing so races with the fresh gateway (which hasn't
    // connected to Telegram yet), causing an unnecessary restart and
    // "Gateway shutting down" notification.

    // ── Configure LLM model BEFORE autoReconfigurePlatforms ──
    // autoReconfigurePlatforms calls configurePlatform() which makes Hermes
    // rewrite config.yaml using its internal model state. If Hermes has stale
    // state (e.g. kimi-coding), it will overwrite our correct config.yaml.
    // By calling configureModel first, we fix Hermes's internal state so any
    // config.yaml rewrite uses the correct provider.
    const apiKey = process.env.DEEPSEEK_KEY ?? process.env.KIMI_KEY ?? process.env.KIMI_API_KEY;
    const modelProvider = process.env.HERMES_MODEL_PROVIDER ?? "deepseek";
    const modelName = process.env.HERMES_MODEL_NAME ?? "deepseek-v4-flash";
    const apiBaseUrl = apiKey === process.env.DEEPSEEK_KEY
      ? "https://api.deepseek.com"
      : "https://api.moonshot.ai/v1";

    // Log current model info BEFORE we do anything
    const beforeModel = await this.hermesClient!.getModelInfo().catch(() => null);
    console.log(`[hermes] Model info BEFORE configureModel: ${JSON.stringify(beforeModel)}`);

    if (apiKey) {
      // Test direct API connectivity to verify key + network from inside the container
      fetch(`${apiBaseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      }).then(async (res) => {
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const modelIds = Array.isArray(data?.data) ? data.data.map((m: any) => m.id).join(",") : "unknown";
          console.log(`[hermes] LLM API direct test: OK (HTTP ${res.status}), models: ${modelIds.slice(0, 200)}`);
        } else {
          const body = await res.text().catch(() => "");
          console.warn(`[hermes] LLM API direct test: FAILED (HTTP ${res.status}): ${body.slice(0, 200)}`);
        }
      }).catch((err) => {
        console.warn(`[hermes] LLM API direct test: CONNECTION ERROR: ${err}`);
      });

      // ALWAYS call configureModel — don't rely on getModelInfo to detect staleness.
      // The response format may be unreliable or not reflect the actual gateway state.
      console.log(`[hermes] Calling configureModel(${modelProvider}, ${modelName})…`);
      const configOk = await this.hermesClient!.configureModel(modelProvider, modelName).catch((err) => {
        console.warn(`[hermes] configureModel failed: ${err}`);
        return false;
      });
      console.log(`[hermes] configureModel result: ${configOk}`);
    } else {
      console.warn("[hermes] DEEPSEEK_KEY (or KIMI_KEY) is NOT SET — Hermes agent will not be able to call LLM");
    }

    // Log config.yaml contents BEFORE autoReconfigurePlatforms
    this.logConfigYaml("BEFORE autoReconfigurePlatforms");

    // Auto-reconfigure platforms from persisted .env credentials (survives redeploy)
    // This may cause Hermes to rewrite config.yaml — but since we called configureModel
    // above, Hermes's internal state should now be correct (deepseek).
    await this.autoReconfigurePlatforms();

    // Log config.yaml contents AFTER autoReconfigurePlatforms
    this.logConfigYaml("AFTER autoReconfigurePlatforms");

    // Re-write config.yaml to ensure correct provider/model, undoing any changes
    // Hermes may have made during autoReconfigurePlatforms.
    this.hermesProcess?.rewriteConfig();
    this.logConfigYaml("AFTER rewriteConfig");

    // No explicit gateway restart needed — we spawn a fresh hermes serve + gateway
    // from hermes-process.ts with the correct config.yaml. Restarting here would
    // send "Gateway shutting down" notifications to Telegram users for no reason.
    // The config watchdog handles any subsequent config corruption by Hermes.
    if (apiKey) {
      // Verify the model config after gateway is up
      setTimeout(async () => {
        if (!this.hermesClient) return;
        const afterModel = await this.hermesClient.getModelInfo().catch(() => null);
        console.log(`[hermes] Model info after gateway start: ${JSON.stringify(afterModel)}`);
        const afterProvider = (afterModel as any)?.provider ?? (afterModel as any)?.model?.provider;
        if (afterProvider && afterProvider !== modelProvider) {
          console.error(`[hermes] ⚠️ Provider is ${afterProvider} (expected ${modelProvider}) — watchdog will fix within 5s`);
        } else if (afterProvider === modelProvider) {
          console.log(`[hermes] ✓ Provider confirmed correct: ${afterProvider}`);
        }
      }, 5000);
    }

    // After autoReconfigure + gateway start, re-broadcast platform states with
    // increasing delays so clients see the updated connection status once the
    // gateway has had time to connect to each platform.
    for (const delay of [5000, 10000, 15000]) {
      setTimeout(async () => {
        if (!this.hermesClient) return;
        const states = await this.hermesClient.getPlatformStates(this.settings.mailboxPlatforms);
        this.platformStates = states;
        this.broadcast({ type: "platform_connection", states });
      }, delay);
    }

    // Now that hermesProcess is ready, inject live office state into the system prompt
    this.refreshSoulMd();
  }

  /** Log the first 5 lines of config.yaml for diagnostic purposes. */
  private logConfigYaml(label: string): void {
    try {
      const hermesHome = process.env.HERMES_HOME ?? join(homedir(), ".hermes");
      const configPath = join(hermesHome, "config.yaml");
      if (existsSync(configPath)) {
        const content = readFileSync(configPath, "utf-8");
        const lines = content.split("\n").slice(0, 5);
        console.log(`[hermes] config.yaml ${label}:\n${lines.join("\n")}`);
      } else {
        console.log(`[hermes] config.yaml ${label}: FILE DOES NOT EXIST`);
      }
    } catch (err) {
      console.warn(`[hermes] config.yaml ${label}: READ ERROR: ${err}`);
    }
  }

  /** Get current platform connection states. */
  getPlatformConnectionStates(): PlatformConnectionState[] {
    return this.platformStates;
  }

  /** Get user activity status for retention system. */
  getActivityStatus(): { lastActiveAt: number; lastPlatformEngagementAt: number } {
    return { lastActiveAt: this.lastActiveAt, lastPlatformEngagementAt: this.lastPlatformEngagementAt };
  }

  /** Mark platform engagement when an inbound message is received from the user. */
  markPlatformEngagement(): void {
    this.lastPlatformEngagementAt = Date.now();
  }

  private static autoReconfigureDone = false;
  private static hermesGatewayInitialized = false;

  /** Auto-reconfigure platforms from persisted credentials in save.json after redeploy.
   *  The .env file gets wiped on redeploy, but save.json in users/<id>/ag/ persists.
   *  Handles all platforms in PLATFORM_ENV_VAR_MAP, not just Telegram/Discord/Slack.
   *  Runs only once per process — multiple Manager instances would otherwise each
   *  trigger a gateway restart, sending "Gateway shutting down" notifications. */
  private async autoReconfigurePlatforms(): Promise<void> {
    if (AgentManager.autoReconfigureDone) {
      console.log("[hermes] autoReconfigurePlatforms: already done this process — skipping");
      return;
    }
    AgentManager.autoReconfigureDone = true;
    try {
      const savedCreds = this.save.getPlatformCredentials();
      console.log(`[hermes] autoReconfigurePlatforms: saved credentials: ${Object.keys(savedCreds).join(", ") || "(none)"}`);
      console.log(`[hermes] autoReconfigurePlatforms: mailboxPlatforms=${JSON.stringify(this.settings.mailboxPlatforms)}`);

      if (Object.keys(savedCreds).length === 0) {
        console.log("[hermes] autoReconfigurePlatforms: no saved credentials — skipping");
        return;
      }

      // Write all saved credentials to Hermes .env atomically
      syncHermesEnvFile(savedCreds);

      // Check each configured mailbox platform for saved credentials
      const platforms = this.settings.mailboxPlatforms.filter((p): p is string => p !== null);
      for (const platform of platforms) {
        const lower = platform.toLowerCase();
        const varMap = PLATFORM_ENV_VAR_MAP[lower];
        if (!varMap) continue;

        // Reverse-map: env var name → our credential field key
        const envToCredKey: Record<string, string> = {};
        for (const [credKey, envVar] of Object.entries(varMap)) {
          envToCredKey[envVar] = credKey;
        }

        // Build credentials object from saved env vars
        const creds: Record<string, string> = {};
        let hasAny = false;
        for (const [envVar, credKey] of Object.entries(envToCredKey)) {
          const value = savedCreds[envVar];
          if (value) {
            creds[credKey] = value;
            hasAny = true;
          }
        }

        if (!hasAny) continue;

        // Check if the credentials are already in Hermes .env — if so, the gateway
        // already has them and we can skip configurePlatform entirely (which would
        // restart the gateway and send "Gateway shutting down" notifications).
        const hermesHome = process.env.HERMES_HOME ?? join(homedir(), ".hermes");
        const envPath = join(hermesHome, ".env");
        let credsAlreadyInEnv = false;
        try {
          if (existsSync(envPath)) {
            const envContent = readFileSync(envPath, "utf-8");
            // Check if all required env vars for this platform are present
            const requiredVars = Object.values(varMap);
            credsAlreadyInEnv = requiredVars.every(envVar => {
              const pattern = new RegExp(`^${envVar}=.+`, "m");
              return pattern.test(envContent);
            });
          }
        } catch { /* best effort */ }

        if (credsAlreadyInEnv) {
          console.log(`[hermes] autoReconfigurePlatforms: ${platform} credentials already in .env — skipping configurePlatform (avoids gateway restart)`);
          // Still register ownership so inbound events route to this user
          this.hermesClient?.registerPlatformOwner(platform, this.userId);
          // Still try to capture home channel if not yet saved
          if (lower === "telegram" && !savedCreds.TELEGRAM_HOME_CHANNEL) {
            setTimeout(() => this.proactivelyCaptureHomeChannel("telegram"), 5000);
          }
          continue;
        }

        // Wait briefly for platform states to be populated (pollStates is async).
        if (this.platformStates.length === 0) {
          console.log(`[hermes] autoReconfigurePlatforms: waiting for platform states...`);
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        const alreadyConnected = this.platformStates.some(
          (s) => s.platform.toLowerCase() === lower && s.connected,
        );
        if (alreadyConnected) {
          console.log(`[hermes] autoReconfigurePlatforms: ${platform} already connected — skipping (avoids gateway restart notification)`);
          // Still register ownership so inbound events route to this user
          this.hermesClient?.registerPlatformOwner(platform, this.userId);
          continue;
        }

        console.log(`[hermes] autoReconfigurePlatforms: re-enabling ${platform} from save.json`);
        this.hermesClient?.registerPlatformOwner(platform, this.userId);
        this.hermesClient?.configurePlatform(platform, creds).then((result) => {
          if (result.success) {
            console.log(`[hermes] autoReconfigurePlatforms: ${platform} re-enabled successfully`);
            // For Telegram, try to capture home channel if not yet saved
            if (lower === "telegram" && !savedCreds.TELEGRAM_HOME_CHANNEL) {
              setTimeout(() => this.proactivelyCaptureHomeChannel("telegram"), 5000);
            }
          } else {
            console.warn(`[hermes] autoReconfigurePlatforms: ${platform} re-enable failed: ${result.error}`);
          }
        }).catch((err) => console.warn(`[hermes] autoReconfigurePlatforms: ${platform} error: ${err}`));
      }
    } catch (err) {
      console.warn(`[hermes] autoReconfigurePlatforms: error: ${err}`);
    }
  }

  /** Query Hermes sessions API to find a chat ID for the given platform and save it as home channel.
   *  Also checks channel_directory.json and .env for home channel set by /sethome. */
  private async proactivelyCaptureHomeChannel(platform: string): Promise<void> {
    try {
      // First, check if Hermes already has a home channel in .env (set by /sethome)
      const hermesHome = process.env.HERMES_HOME ?? join(homedir(), ".hermes");
      const envPath = join(hermesHome, ".env");
      const envVar = `${platform.toUpperCase()}_HOME_CHANNEL`;
      try {
        const envContent = readFileSync(envPath, "utf-8");
        const match = envContent.match(new RegExp(`^${envVar}=(.+)$`, "m"));
        if (match?.[1]?.trim()) {
          const chatId = match[1].trim();
          const existing = this.save.getPlatformCredentials();
          if (existing[envVar] !== chatId) {
            const merged = { ...existing, [envVar]: chatId };
            this.save.setPlatformCredentials(merged);
            void this.save.flushNow();
            console.log(`[hermes] proactivelyCaptureHomeChannel: found ${envVar}=${chatId} in Hermes .env — saved to persist across redeploys`);
          }
          return;
        }
      } catch { /* .env not found or unreadable */ }

      // Also check channel_directory.json
      const channelDirPath = join(hermesHome, "channel_directory.json");
      try {
        if (existsSync(channelDirPath)) {
          const channelDir = JSON.parse(readFileSync(channelDirPath, "utf-8"));
          const platEntry = channelDir[platform.toLowerCase()] ?? channelDir[platform];
          if (platEntry?.chat_id) {
            const chatId = String(platEntry.chat_id);
            const existing = this.save.getPlatformCredentials();
            if (existing[envVar] !== chatId) {
              const merged = { ...existing, [envVar]: chatId };
              this.save.setPlatformCredentials(merged);
              void this.save.flushNow();
              console.log(`[hermes] proactivelyCaptureHomeChannel: found ${envVar}=${chatId} in channel_directory.json — saved to persist across redeploys`);
              syncHermesEnvFile(merged);
            }
            return;
          }
        }
      } catch { /* channel_directory.json not found or invalid */ }

      // Fall back to sessions API
      const sessions = await this.hermesClient?.getRecentSessions();
      if (!sessions || sessions.length === 0) {
        console.log(`[hermes] proactivelyCaptureHomeChannel: no sessions found for ${platform}`);
        return;
      }
      for (const sess of sessions) {
        const sessPlatform = (sess.platform ?? sess.source ?? "").toLowerCase();
        if (sessPlatform !== platform) continue;
        const chatId = sess.chat_id ?? sess.chatId ?? sess.channel_id ?? null;
        if (chatId) {
          const envVar = `${platform.toUpperCase()}_HOME_CHANNEL`;
          const existing = this.save.getPlatformCredentials();
          if (existing[envVar] !== chatId) {
            const merged = { ...existing, [envVar]: chatId };
            this.save.setPlatformCredentials(merged);
            void this.save.flushNow();
            console.log(`[hermes] proactivelyCaptureHomeChannel: captured ${envVar}=${chatId} from sessions`);
            // Write to .env so it takes effect on next gateway restart
            syncHermesEnvFile(merged);
            console.log(`[hermes] proactivelyCaptureHomeChannel: wrote ${envVar} to .env`);
          } else {
            console.log(`[hermes] proactivelyCaptureHomeChannel: ${envVar} already set to ${chatId}`);
          }
          return;
        }
      }
      console.log(`[hermes] proactivelyCaptureHomeChannel: no ${platform} chat ID found in sessions`);
    } catch (err) {
      console.warn(`[hermes] proactivelyCaptureHomeChannel: error: ${err}`);
    }
  }

  /** Broadcast current platform connection states to all clients. */
  broadcastPlatformStates(): void {
    this.broadcast({ type: "platform_connection", states: this.platformStates });
  }

  /** Configure a platform's credentials via the Hermes gateway API. */
  async configurePlatform(platform: string, credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    if (!this.hermesClient) {
      return { success: false, error: "Hermes Agent gateway is not running. It should auto-start with the server — check server logs for [hermes-process] errors." };
    }

    // Write credentials to ~/.hermes/.env BEFORE the API call so even if Hermes
    // API fails, the token is persisted. Also save to save.json for redeploy survival.
    try {
      syncHermesEnvFile(this.save.getPlatformCredentials(), { [platform]: credentials });

      // Save credentials to save.json (persists on the volume / DB)
      const envVarMap = PLATFORM_ENV_VAR_MAP[platform.toLowerCase()] ?? {};
      const credVarsToSave: Record<string, string> = {};
      for (const [credKey, envVar] of Object.entries(envVarMap)) {
        const value = credentials[credKey];
        if (value) credVarsToSave[envVar] = value;
      }
      if (Object.keys(credVarsToSave).length > 0) {
        const existing = this.save.getPlatformCredentials();
        const merged = { ...existing, ...credVarsToSave };
        this.save.setPlatformCredentials(merged);
        void this.save.flushNow();
        console.log(`[manager] Saved platform credentials to save.json: ${Object.keys(credVarsToSave).join(", ")}`);
      }
    } catch (err) {
      console.warn(`[manager] Failed to write platform credentials to .env: ${err}`);
    }

    const result = await this.hermesClient.configurePlatform(platform, credentials);

    // Register this user as the platform owner so inbound events route to them
    this.hermesClient.registerPlatformOwner(platform, this.userId);

    // Re-write .env AFTER the API call — Hermes API may have overwritten .env,
    // wiping our token. syncHermesEnvFile merges everything atomically.
    try {
      syncHermesEnvFile(this.save.getPlatformCredentials(), { [platform]: credentials });
    } catch (err) {
      console.warn(`[manager] Failed to re-write credentials to .env after API call: ${err}`);
    }

    // After configuring, restart the gateway process so it picks up the new credentials
    // Rate-limited: skip restart if one happened within the cooldown window
    if (result.success) {
      const now = Date.now();
      if (now - this.lastGatewayRestartAt < AgentManager.GATEWAY_RESTART_COOLDOWN_MS) {
        console.log(`[manager] Platform ${platform} configured — skipping gateway restart (cooldown: ${Math.round((AgentManager.GATEWAY_RESTART_COOLDOWN_MS - (now - this.lastGatewayRestartAt)) / 1000)}s left)`);
      } else {
        this.lastGatewayRestartAt = now;
        console.log(`[manager] Platform ${platform} configured — restarting gateway process`);
        this.hermesProcess?.restartGateway();
      }
      // Wait a few seconds for the gateway to connect, then poll for fresh status
      setTimeout(async () => {
        if (this.hermesClient) {
          const states = await this.hermesClient.getPlatformStates(this.settings.mailboxPlatforms);
          this.platformStates = states;
          this.broadcast({ type: "platform_connection", states });
        }
      }, 5000);
    }
    return result;
  }

  private persist(): void {
    const snap = this.snapshot();
    this.save.setAgents(snap.agents, snap.logs);
    this.save.setOfficeState(this.officeState.toJSON());
    this.persistPendingTasks();
  }

  /**
   * Continuously persist the current active task + queued tasks for every agent.
   * This ensures tasks survive even an abrupt SIGKILL — not just graceful shutdown.
   * Called as part of every persist() cycle.
   */
  private persistPendingTasks(): void {
    const pendingTasks: Record<string, PendingTask[]> = {};
    for (const rt of this.agents.values()) {
      const tasks: PendingTask[] = [];
      if (rt.info.task && (rt.info.status === "thinking" || rt.info.status === "working")) {
        tasks.push({ task: rt.info.task, handoffTo: rt.handoffTo, cardId: rt.cardId, notifyOnComplete: rt.notifyOnComplete, waitFor: rt.waitFor });
      }
      for (const qt of rt.taskQueue) {
        tasks.push({ task: qt.task, handoffTo: qt.handoffTo, cardId: qt.cardId, notifyOnComplete: qt.notifyOnComplete ?? null, waitFor: qt.waitFor ?? null });
      }
      if (tasks.length > 0) {
        pendingTasks[rt.info.id] = tasks;
      }
    }
    this.save.setPendingTasks(pendingTasks);
    // If there are active tasks, flush immediately rather than relying on the
    // 400ms debounce. This ensures pending tasks survive an abrupt SIGKILL or
    // crash that happens between persist() and the debounced flush.
    if (Object.keys(pendingTasks).length > 0) {
      console.log(`[manager] persistPendingTasks: saving ${Object.keys(pendingTasks).length} agent(s) with pending tasks:`, JSON.stringify(Object.fromEntries(Object.entries(pendingTasks).map(([id, ts]) => [id, ts.map(t => t.task.slice(0, 50))]))));
      const f = this.save.flushNow();
      if (f && typeof (f as any).then === "function") {
        void (f as Promise<void>).catch(() => {});
      }
    }
  }

  snapshot(): { agents: AgentInfo[]; logs: Record<string, LogEntry[]>; board: TaskCard[] } {
    const agents = [...this.agents.values()].map((a) => a.info);
    const logs: Record<string, LogEntry[]> = {};
    for (const a of this.agents.values()) logs[a.info.id] = a.logs;
    const board = [...this.board.values()];
    return { agents, logs, board };
  }

  snapshotSchedules(): AgentSchedule[] {
    return [...this.schedules.values()];
  }

  /** Compute real-time automation throughput stats. */
  computeAutomationStats(): AutomationStats {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const npcIds = new Set([OFFICE_MANAGER_ID, HERMES_ID, WIZARD_ID]);

    let recentTasks = 0;
    let totalSuccess = 0;
    let totalHistory = 0;
    let totalDurationMs = 0;
    let busiestName: string | null = null;
    let busiestCount = 0;
    let idleAgents = 0;
    let hireableCount = 0;
    let totalTasksDone = 0;

    for (const rt of this.agents.values()) {
      if (npcIds.has(rt.info.id)) continue;
      hireableCount++;

      totalTasksDone += rt.info.tasksDone;

      if (rt.info.status === "idle") idleAgents++;

      // Count recent tasks (last 1h) from history
      for (const h of rt.taskHistory) {
        if (h.ts >= oneHourAgo) recentTasks++;
        totalHistory++;
        if (h.success) totalSuccess++;
        totalDurationMs += h.durationMs;
      }

      if (rt.info.tasksDone > busiestCount) {
        busiestCount = rt.info.tasksDone;
        busiestName = rt.info.name;
      }
    }

    // Compute pipeline depth (longest handoff chain from schedules)
    const handoffMap = new Map<string, string>();
    for (const sched of this.schedules.values()) {
      if (sched.enabled && sched.handoffTo) {
        handoffMap.set(sched.agentId, sched.handoffTo);
      }
    }
    let maxDepth = 0;
    for (const start of handoffMap.keys()) {
      let depth = 0;
      let current: string | undefined = start;
      const visited = new Set<string>();
      while (current && !visited.has(current)) {
        visited.add(current);
        current = handoffMap.get(current);
        depth++;
      }
      if (depth > maxDepth) maxDepth = depth;
    }

    // Automation rate: scheduled tasks vs total
    const enabledSchedules = [...this.schedules.values()].filter((s) => s.enabled).length;
    const totalTasks = totalHistory || 1;
    const automationRate = totalTasks > 0 ? Math.min(1, enabledSchedules / (enabledSchedules + hireableCount)) : 0;

    return {
      throughput: recentTasks,
      successRate: totalHistory > 0 ? totalSuccess / totalHistory : 1,
      avgCompletionMin: totalHistory > 0 ? (totalDurationMs / totalHistory) / 60000 : 0,
      busiestAgent: busiestName,
      idlePct: hireableCount > 0 ? idleAgents / hireableCount : 1,
      automationRate,
      pipelineDepth: maxDepth,
      totalTasksDone,
      agentCount: hireableCount,
    };
  }

  /** Get a single agent's info by ID, or null if not found. */
  getAgentInfo(agentId: string): AgentInfo | null {
    return this.agents.get(agentId)?.info ?? null;
  }

  /** Stop the scheduler tick and clean up timers. */
  destroy(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.proactiveUpdateTimer) {
      clearInterval(this.proactiveUpdateTimer);
      this.proactiveUpdateTimer = null;
    }
    if (this.soulRefreshTimer) {
      clearInterval(this.soulRefreshTimer);
      this.soulRefreshTimer = null;
    }
    this.stopHealthCheck();
  }

  worldState(): WorldState {
    return { seed: this.worldSeed, firedAgents: [...this.firedAgents.values()], vacationedAgents: [...this.vacationedAgents.values()], chunkOverrides: this.chunkOverrides };
  }

  private persistWorld(): void {
    this.save.setWorld(this.worldState());
  }

  /** Apply a tile override from a client and persist it. */
  applyTileOverride(cx: number, cy: number, tileIndex: number, tile: number): void {
    const key = `${cx},${cy}`;
    if (!this.chunkOverrides[key]) this.chunkOverrides[key] = {};
    this.chunkOverrides[key][tileIndex] = tile;
    this.persistWorld();
  }

  /** Get chunk overrides for a specific chunk (or undefined if none). */
  getChunkOverrides(cx: number, cy: number): Record<number, number> | undefined {
    return this.chunkOverrides[`${cx},${cy}`];
  }

  async hire(name: string, provider: Provider, model: string, systemPrompt = "", role: AgentRole = "worker", sprite?: number, appearance?: CharAppearance | null, mcpServers?: MCPServerConfig[], personality?: PersonalityTraits, cdpSolana?: boolean, crossmintWallet?: boolean, isPremium?: boolean, circleServices?: CircleServiceConfig[], skills?: TaskCategory[], acl?: AgentACL): Promise<void> {
    const cleanName = name.trim().slice(0, 24) || "Agent";
    console.log(`[manager] hire called: name=${cleanName} provider=${provider} model=${model}`);

    // Enforce agent limit based on subscription tier (exclude permanent NPCs)
    if (this.agentLimit > 0 && this.hireableAgentCount >= this.agentLimit) {
      console.log(`[manager] hire blocked: agent limit reached (${this.hireableAgentCount}/${this.agentLimit})`);
      this.broadcast({
        type: "payment_required",
        reason: "agent_limit",
        message: `You've reached your agent limit (${this.agentLimit}). Upgrade your plan to hire more agents.`,
        agentLimit: this.agentLimit,
      });
      return;
    }

    const usedDesks = new Set([...this.agents.values()].map((a) => a.info.deskIndex));
    let deskIndex = 0;
    while (usedDesks.has(deskIndex)) deskIndex++;

    const usedSprites = new Set([...this.agents.values()].map((a) => a.info.sprite));
    let chosenSprite: number;
    if (sprite != null && sprite >= 0 && sprite < CHAR_VARIANTS) {
      chosenSprite = sprite;
    } else {
      chosenSprite = Math.floor(Math.random() * CHAR_VARIANTS);
      for (let i = 0; i < CHAR_VARIANTS; i++) {
        const candidate = (chosenSprite + i) % CHAR_VARIANTS;
        if (!usedSprites.has(candidate)) {
          chosenSprite = candidate;
          break;
        }
      }
    }

    const traits = personality ?? randomPersonality();
    const info: AgentInfo = {
      id: randomUUID().slice(0, 8),
      name: cleanName,
      title: "",
      provider,
      model,
      status: "idle",
      task: null,
      deskIndex,
      sprite: chosenSprite,
      appearance: appearance ?? null,
      accent: appearance ? ACCENT_COLOR_OPTIONS[appearance.accent % ACCENT_COLOR_OPTIONS.length] : ACCENTS[chosenSprite % ACCENTS.length],
      systemPrompt: systemPrompt.trim().slice(0, 4000),
      role,
      sessionId: null,
      tasksDone: 0,
      mcpServers: mcpServers?.length ? mcpServers : undefined,
      cdpSolana: cdpSolana ?? false,
      crossmintWallet: crossmintWallet ?? false,
      isPremium: isPremium ?? false,
      circleServices: circleServices?.length ? circleServices : undefined,
      personality: traits,
      mood: "content",
      skills: skills?.length ? skills : undefined,
      acl: acl ?? { allowedUserIds: [] },
    };

    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || info.id;
    mkdirSync(this.cwdFor(slug, info.id), { recursive: true });

    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [], nextThinkAt: 0, thinkCooldownUntil: 0, taskHistory: [], taskStartedAt: 0, scheduleId: null, reviewContext: null, platformContext: null, waitingFor: null, notifyOnComplete: null, waitFor: null, freshStart: false, memorySummary: null, retryAttempted: false, reworkCount: 0, pendingGate: null };
    this.agents.set(info.id, rt);
    this.session.record("hire", { agent: info });
    this.persist();
    this.broadcast({ type: "agent", agent: info });
    await this.save.flushNow();
    console.log(`[manager] hired ${cleanName} (id=${info.id}) desk=${deskIndex} — broadcast sent to ${this.agents.size} total agents`);
    this.log(rt, "status", `${cleanName} joined the office.`);
    this.logEvent("hire", `${cleanName} joined the office.`);

    if (cdpSolana) {
      getAgentAccount(info.id).then((account) => {
        console.log(`[manager] Provisioned Solana wallet for ${cleanName} (id=${info.id}): ${account.address}`);
      }).catch((err) => {
        console.error(`[manager] Failed to provision Solana wallet for ${cleanName} (id=${info.id}):`, err);
      });
    }

    if (crossmintWallet) {
      getCrossmintWallet(info.id).then((wallet) => {
        if (wallet) console.log(`[manager] Provisioned Crossmint wallet for ${cleanName} (id=${info.id}): ${wallet.address}`);
      }).catch((err) => {
        console.error(`[manager] Failed to provision Crossmint wallet for ${cleanName} (id=${info.id}):`, err);
      });
    }
  }

  /** Hire an agent from the Office Manager's chat — broadcasts helicopter_delivery to client
   *  so the helicopter animation plays, then hires the agent server-side.
   *  Returns the new agent's id. */
  async hireAgent(name: string, model: string, systemPrompt: string, mcpServers?: MCPServerConfig[], cdpSolana?: boolean, crossmintWallet?: boolean, isPremium?: boolean, circleServices?: CircleServiceConfig[], skills?: TaskCategory[]): Promise<string> {
    const cleanName = name.trim().slice(0, 24) || "Agent";
    // Broadcast helicopter delivery to all clients so the animation plays
    this.broadcast({
      type: "helicopter_delivery",
      name: cleanName,
      model,
      provider: "cline",
      systemPrompt,
      mcpServers,
      alreadyHired: true,
    });
    // Hire the agent server-side (this creates the agent + broadcasts "agent" msg)
    await this.hire(cleanName, "cline", model, systemPrompt, "worker", undefined, undefined, mcpServers, undefined, cdpSolana, crossmintWallet, isPremium, circleServices, skills);
    // Find the agent we just hired by name
    const rt = [...this.agents.values()].find((a) => a.info.name === cleanName);
    // Surface MCP OAuth requirements if the new agent has remote MCP servers
    if (mcpServers && mcpServers.length > 0 && rt) {
      const needsAuth = mcpServers.filter(s => s.url);
      if (needsAuth.length > 0) {
        this.broadcast({
          type: "mcp_auth_required",
          agentId: rt.info.id,
          agentName: cleanName,
          servers: needsAuth.map(s => ({ name: s.name ?? "MCP Server", url: s.url! })),
        });
      }
    }
    return rt?.info.id ?? "";
  }

  /** Fuse two agents into a single new agent. Merges MCP servers, wallets, and
   *  personality. Both originals are fired. The fused agent starts with a clean
   *  slate (no conversation history). */
  async fuseAgents(
    agentAId: string,
    agentBId: string,
    name: string,
    systemPrompt: string,
    appearance?: CharAppearance | null,
    personality?: PersonalityTraits,
  ): Promise<void> {
    const rtA = this.agents.get(agentAId);
    const rtB = this.agents.get(agentBId);
    if (!rtA || !rtB) {
      this.broadcast({ type: "toast", text: "One or both agents not found." });
      return;
    }
    if (agentAId === OFFICE_MANAGER_ID || agentBId === OFFICE_MANAGER_ID ||
        agentAId === HERMES_ID || agentBId === HERMES_ID ||
        agentAId === WIZARD_ID || agentBId === WIZARD_ID) {
      this.broadcast({ type: "toast", text: "Built-in agents can't be fused." });
      return;
    }
    if (rtA.info.status !== "idle" || rtB.info.status !== "idle") {
      this.broadcast({ type: "toast", text: "Both agents must be idle to fuse. Stop any running tasks first." });
      return;
    }
    if (agentAId === agentBId) {
      this.broadcast({ type: "toast", text: "You can't fuse an agent with itself." });
      return;
    }

    const infoA = rtA.info;
    const infoB = rtB.info;

    // Merge MCP servers — union, dedupe by url (or command if no url)
    const mergedMcp: MCPServerConfig[] = [];
    const seen = new Set<string>();
    for (const s of [infoA.mcpServers, infoB.mcpServers].flat()) {
      if (!s) continue;
      const key = s.url ?? s.command ?? JSON.stringify(s);
      if (seen.has(key)) continue;
      seen.add(key);
      mergedMcp.push(s);
    }

    // Inherit wallet flags if either agent has them
    const cdpSolana = infoA.cdpSolana || infoB.cdpSolana;
    const crossmintWallet = infoA.crossmintWallet || infoB.crossmintWallet;
    // Inherit premium services if either agent has them
    const isPremium = infoA.isPremium || infoB.isPremium;
    const mergedCircleServices = [...(infoA.circleServices ?? []), ...(infoB.circleServices ?? [])];

    // Merge skills — union of both agents' skills
    const mergedSkills = [...new Set([...(infoA.skills ?? []), ...(infoB.skills ?? [])])];

    // Merge personality — average each trait
    const mergedPersonality = personality ?? {
      openness: ((infoA.personality?.openness ?? 0.5) + (infoB.personality?.openness ?? 0.5)) / 2,
      conscientiousness: ((infoA.personality?.conscientiousness ?? 0.5) + (infoB.personality?.conscientiousness ?? 0.5)) / 2,
      extraversion: ((infoA.personality?.extraversion ?? 0.5) + (infoB.personality?.extraversion ?? 0.5)) / 2,
      agreeableness: ((infoA.personality?.agreeableness ?? 0.5) + (infoB.personality?.agreeableness ?? 0.5)) / 2,
      neuroticism: ((infoA.personality?.neuroticism ?? 0.5) + (infoB.personality?.neuroticism ?? 0.5)) / 2,
    };

    // Use agent A's model as the base
    const model = infoA.model;

    // Hire the fused agent
    await this.hire(
      name,
      "cline",
      model,
      systemPrompt,
      "worker",
      undefined,
      appearance ?? infoA.appearance ?? null,
      mergedMcp.length > 0 ? mergedMcp : undefined,
      mergedPersonality,
      cdpSolana || undefined,
      crossmintWallet || undefined,
      isPremium || undefined,
      mergedCircleServices.length > 0 ? mergedCircleServices : undefined,
      mergedSkills.length > 0 ? mergedSkills : undefined,
    );

    // Find the newly hired fused agent
    const fusedRt = [...this.agents.values()].find((a) => a.info.name === name.trim().slice(0, 24));
    const fusedId = fusedRt?.info.id ?? "";

    // Fire both originals
    await this.fire(agentAId);
    await this.fire(agentBId);

    // Broadcast fusion effect for client animation
    if (fusedId) {
      this.broadcast({ type: "fuse_effect", agentAId, agentBId, fusedId });
      this.broadcast({ type: "toast", text: `${name} was forged from ${infoA.name} and ${infoB.name}.` });
      this.logEvent("fuse", `${name} was forged from ${infoA.name} and ${infoB.name}.`);
    }
  }

  /** Update an agent's custom system prompt. Takes effect on the next task. */
  updateSystemPrompt(agentId: string, systemPrompt: string): void {
    const rt = this.agents.get(agentId);
    if (!rt) return;
    // Don't allow editing permanent NPCs
    if (rt.info.id === OFFICE_MANAGER_ID || rt.info.id === HERMES_ID || rt.info.id === WIZARD_ID) {
      this.broadcast({ type: "toast", text: "Built-in agents can't be edited." });
      return;
    }
    rt.info.systemPrompt = systemPrompt.trim().slice(0, 8000);
    this.persist();
    this.broadcast({ type: "agent", agent: rt.info });
    this.broadcast({ type: "toast", text: `${rt.info.name}'s system prompt updated.` });
  }

  assign(agentId: string, task: string, handoffTo?: string, cardId?: string, scheduleId?: string, reviewContext?: { agentId: string; agentName: string; originalTask: string; cardId?: string | null } | null, notifyOnComplete?: string, waitFor?: string, platformContext?: { platform: string; sender: string } | null): void {
    const rt = this.agents.get(agentId);
    if (!rt) return;
    const cleanTask = task.trim();
    if (!cleanTask) return;
    // Wizard is a premium feature — require Pro or Business tier
    if (agentId === WIZARD_ID && this.subscriptionTier !== "pro" && this.subscriptionTier !== "business") {
      this.broadcast({
        type: "payment_required",
        reason: "subscription",
        message: "The Wizard is a premium world-builder. Upgrade to the Pro plan ($19.99/mo) or higher to assign tasks to the Wizard.",
        tier: this.subscriptionTier,
      });
      return;
    }

    // Auto-create a board card if none was provided (makes every task visible on the board)
    const effectiveCardId = cardId ?? this.autoCardFor(agentId, cleanTask, reviewContext ? "review" : "task");

    if (rt.info.status === "thinking" || rt.info.status === "working" || rt.info.status === "done" || rt.info.status === "waiting") {
      const target = handoffTo && handoffTo !== agentId ? this.agents.get(handoffTo) : undefined;
      rt.taskQueue.push({
        task: cleanTask,
        handoffTo: target ? target.info.id : null,
        cardId: effectiveCardId,
        scheduleId: scheduleId ?? null,
        reviewContext: reviewContext ?? null,
        notifyOnComplete: notifyOnComplete ?? null,
        waitFor: waitFor ?? null,
        platformContext: platformContext ?? null,
      });
      const pos = rt.taskQueue.length;
      this.broadcast({ type: "toast", text: `${rt.info.name} is busy — task queued (#${pos}).` });
      this.log(rt, "status", `Queued task: ${cleanTask}`);
      // Update card to "paused" so it's visually distinct from unclaimed backlog cards
      if (effectiveCardId) {
        const card = this.board.get(effectiveCardId);
        if (card && (card.status === "backlog" || card.status === "in_progress")) {
          card.status = "paused";
          card.assignedAgentId = agentId;
          card.statusChangedAt = Date.now();
          this.persistBoard();
          this.broadcast({ type: "card", card });
          this.broadcastGanttUpdate();
        }
      }
      return;
    }

    // Set platform context on the runtime for immediate tasks
    if (platformContext) {
      rt.platformContext = { ...platformContext };
    }
    this.startTask(rt, cleanTask, handoffTo, effectiveCardId, false, scheduleId, reviewContext, notifyOnComplete, waitFor);
  }

  /** Assign a task with a fresh conversation — prior messages are cleared but a
   *  summary of completed tasks is injected into the system prompt for long-term memory. */
  assignNew(agentId: string, task: string, handoffTo?: string): void {
    const rt = this.agents.get(agentId);
    if (!rt) return;
    const cleanTask = task.trim();
    if (!cleanTask) return;

    // Auto-create a board card for the fresh task
    const effectiveCardId = this.autoCardFor(agentId, cleanTask, "task");

    if (rt.info.status === "thinking" || rt.info.status === "working" || rt.info.status === "done" || rt.info.status === "waiting") {
      const target = handoffTo && handoffTo !== agentId ? this.agents.get(handoffTo) : undefined;
      rt.taskQueue.push({
        task: cleanTask,
        handoffTo: target ? target.info.id : null,
        cardId: effectiveCardId,
        scheduleId: null,
        reviewContext: null,
        notifyOnComplete: null,
        waitFor: null,
        isResume: false,
        freshStart: true,
      });
      const pos = rt.taskQueue.length;
      this.broadcast({ type: "toast", text: `${rt.info.name} is busy — new task queued (#${pos}).` });
      this.log(rt, "status", `Queued new task (fresh): ${cleanTask}`);
      return;
    }

    // Build memory summary from task history before clearing
    rt.memorySummary = this.buildMemorySummary(rt);
    rt.freshStart = true;

    // Clear provider memory (Agent instance + message store) but keep logs + taskHistory
    clearAllMemory(agentId);
    void this.save.clearMessages(agentId);
    rt.info.sessionId = null;

    this.log(rt, "status", `New task (fresh start): ${cleanTask}`);
    this.startTask(rt, cleanTask, handoffTo);
  }

  /** Build a concise summary of the agent's prior work + office context for injection into a fresh conversation. */
  private buildMemorySummary(rt: AgentRuntime): string {
    const parts: string[] = [];

    // Office state graph context (decisions, blockers, observations, dependencies)
    const officeCtx = this.officeState.getAgentContext(rt.info.id, rt.info.name);
    if (officeCtx && !officeCtx.includes("No prior office context")) {
      parts.push(officeCtx);
    }

    // Task history (flat list — still useful for quick reference)
    if (rt.taskHistory.length > 0) {
      parts.push(`You have completed ${rt.info.tasksDone} task(s) previously. Recent task history:`);
      for (const h of rt.taskHistory.slice(0, 10)) {
        const status = h.success ? "✓" : "✗";
        const time = new Date(h.ts).toLocaleDateString();
        parts.push(`  ${status} [${time}] ${h.task.slice(0, 120)}${h.task.length > 120 ? "…" : ""} (${(h.durationMs / 1000).toFixed(0)}s)`);
      }
    }

    if (parts.length === 0) return "";
    return parts.join("\n\n");
  }

  /** Begin executing a task immediately (assumes agent is idle). */
  private startTask(rt: AgentRuntime, task: string, handoffTo?: string, cardId?: string, isResume = false, scheduleId?: string, reviewContext?: { agentId: string; agentName: string; originalTask: string; cardId?: string | null } | null, notifyOnComplete?: string, waitFor?: string): void {
    const cleanTask = task.trim();
    if (!cleanTask) return;

    if (rt.doneTimer) clearTimeout(rt.doneTimer);
    rt.doneTimer = null;
    rt.retryAttempted = false;
    rt.info.task = cleanTask;
    const target = handoffTo && handoffTo !== rt.info.id ? this.agents.get(handoffTo) : undefined;
    rt.handoffTo = target ? target.info.id : null;
    rt.scheduleId = scheduleId ?? null;
    rt.reviewContext = reviewContext ?? null;
    rt.notifyOnComplete = notifyOnComplete ?? null;
    rt.waitFor = waitFor ?? null;
    this.session.record("assign", {
      agentId: rt.info.id,
      agentName: rt.info.name,
      task: cleanTask,
      handoffTo: rt.handoffTo,
    });
    this.setStatus(rt, "thinking");
    this.log(rt, "status", `New task: ${cleanTask}`);
    if (target) this.log(rt, "status", `Will hand the result to ${target.info.name} when done.`);
    rt.cardId = cardId ?? null;
    // V-model: set phase to implementation and record start time if not already set
    if (rt.cardId) {
      const card = this.board.get(rt.cardId);
      if (card) {
        if (!card.phase) {
          card.phase = "implementation";
        }
        if (!card.startedAt && (card.phase === "implementation" || card.phase === "design" || card.phase === "requirements")) {
          card.startedAt = Date.now();
        }
        // Estimate duration from historical data if not already set
        if (!card.estimatedMinutes) {
          const estimate = this.estimateTaskDuration(rt, cleanTask);
          if (estimate) card.estimatedMinutes = estimate;
        }
        this.persistBoard();
        this.broadcast({ type: "card", card });
        this.broadcastGanttUpdate();
      }
    }
    void this.runTaskWithUsageCap(rt, cleanTask, isResume);
  }

  /** Check monthly usage cap before running a task. Blocks with a payment_required message if exceeded. */
  private async runTaskWithUsageCap(rt: AgentRuntime, task: string, isResume: boolean): Promise<void> {
    if (this.userId) {
      const cap = getUsageCap(this.subscriptionTier, this.entrancePaid);
      if (cap > 0) {
        const spend = await getMonthlySpend(this.userId);
        if (spend >= cap) {
          this.log(rt, "status", `⚠️ Monthly usage cap reached ($${spend.toFixed(2)} / $${cap}). Task blocked.`);
          this.broadcast({
            type: "payment_required",
            reason: "usage_cap",
            message: `You've reached the $${cap.toFixed(2)}/month usage cap ($${spend.toFixed(2)} spent). Upgrade your plan to continue.`,
            monthlySpend: spend,
            usageCap: cap,
          });
          this.setStatus(rt, "idle");
          rt.info.task = null;
          // Send credit depletion email (fire-and-forget)
          if (this.userId) {
            void (async () => {
              try {
                const { data: authData } = await supabaseAdmin.auth.admin.getUserById(this.userId);
                const email = authData.user?.email;
                if (email) {
                  void sendCreditDepletion(this.userId, email, Boolean(this.subscriptionTier)).catch(() => {});
                }
              } catch { /* ignore */ }
            })();
          }
          return;
        }
      }
    }
    return this.runTask(rt, task, isResume);
  }

  /** Drain the next queued task after the current one finishes. */
  private drainQueue(rt: AgentRuntime): void {
    if (rt.taskQueue.length === 0) return;
    const next = rt.taskQueue.shift()!;
    // Update card status from paused/backlog → in_progress
    if (next.cardId) {
      const card = this.board.get(next.cardId);
      if (card && (card.status === "paused" || card.status === "backlog")) {
        card.status = "in_progress";
        card.assignedAgentId = rt.info.id;
        card.lockedBy = rt.info.id;
        card.statusChangedAt = Date.now();
        this.persistBoard();
        this.broadcast({ type: "card", card });
        this.broadcastGanttUpdate();
      }
    }
    if (next.freshStart) {
      rt.memorySummary = this.buildMemorySummary(rt);
      rt.freshStart = true;
      clearAllMemory(rt.info.id);
      void this.save.clearMessages(rt.info.id);
      rt.info.sessionId = null;
      this.log(rt, "status", `Starting queued task (fresh start): ${next.task}`);
    } else {
      this.log(rt, "status", `Starting queued task: ${next.task}`);
    }
    // Restore platform context from the queued task — this ensures the right
    // task's output gets sent back to the platform user, not whichever task
    // happened to finish first.
    rt.platformContext = next.platformContext ?? null;
    this.startTask(rt, next.task, next.handoffTo ?? undefined, next.cardId ?? undefined, next.isResume, next.scheduleId ?? undefined, next.reviewContext ?? null, next.notifyOnComplete ?? undefined, next.waitFor ?? undefined);
  }

  /** Hand a goal to the office — the Office Manager decomposes it into subtasks for the team.
   *  Falls back to broadcasting the same task to everyone if the Office Manager is unavailable. */
  assignAll(task: string): void {
    const clean = task.trim();
    if (!clean) return;
    const free = [...this.agents.values()].filter(
      (rt) =>
        rt.info.id !== OFFICE_MANAGER_ID &&
        rt.info.id !== HERMES_ID &&
        rt.info.id !== WIZARD_ID &&
        rt.info.status !== "thinking" && rt.info.status !== "working" && rt.info.status !== "waiting",
    );

    // Create a goal card on the board for visibility
    const goalCard: TaskCard = {
      id: randomUUID().slice(0, 8),
      title: clean.length > 80 ? clean.slice(0, 77) + "…" : clean,
      description: clean,
      status: "in_progress",
      assignedAgentId: null,
      createdAt: Date.now(),
      type: "goal",
      progress: 0,
    };
    this.board.set(goalCard.id, goalCard);
    this.persistBoard();
    this.broadcast({ type: "card", card: goalCard });

    this.session.record("assign_all", {
      task: clean,
      agentIds: free.map((rt) => rt.info.id),
    });

    // Try to route through the Office Manager for decomposition
    const officeManager = this.agents.get(OFFICE_MANAGER_ID);
    if (officeManager && officeManager.info.status !== "thinking" && officeManager.info.status !== "working" && officeManager.info.status !== "waiting") {
      const msg = free.length === 0
        ? `Office goal sent to the Office Manager — she'll hire agents and delegate.`
        : `Office goal sent to the Office Manager for delegation.`;
      this.log(officeManager, "status", `Office goal received — ${free.length === 0 ? "office is empty, will hire and decompose" : "decomposing for the team"}.`);
      this.broadcast({ type: "huddle", agentIds: free.map((rt) => rt.info.id) });
      // Assign to the Office Manager with the goal card — its managerBrief will handle decomposition
      this.startTask(officeManager, clean, undefined, goalCard.id, false);
      this.broadcast({ type: "toast", text: msg });
      return;
    }

    // Fallback: Office Manager unavailable
    if (free.length === 0) {
      this.broadcast({ type: "toast", text: "Everyone is busy (or nobody works here yet). The Office Manager is also unavailable — try again in a moment." });
      return;
    }
    const pick = free.sort((a, b) => {
      // Prefer idle agents, then those with fewer completed tasks (less fatigued)
      const aIdle = a.info.status === "idle" ? 0 : 1;
      const bIdle = b.info.status === "idle" ? 0 : 1;
      if (aIdle !== bIdle) return aIdle - bIdle;
      return a.info.tasksDone - b.info.tasksDone;
    })[0];
    this.broadcast({ type: "huddle", agentIds: [pick.info.id] });
    this.assign(pick.info.id, clean);
    this.broadcast({
      type: "toast",
      text: `Office Manager unavailable — task routed to ${pick.info.name} (stop rule: no fan-out on sequential work).`,
    });
  }

  stop(agentId: string): void {
    const rt = this.agents.get(agentId);
    if (!rt) return;
    const hadQueue = rt.taskQueue.length;
    rt.taskQueue = [];
    if (!rt.abort) {
      if (hadQueue) {
        this.broadcast({ type: "toast", text: `Cleared ${hadQueue} queued task${hadQueue > 1 ? "s" : ""}.` });
      }
      return;
    }
    rt.abort.abort();
    if (rt.cardId) {
      this.stopCard(rt.cardId);
      rt.cardId = null;
    }
    rt.handoffTo = null;
    rt.scheduleId = null;
    rt.notifyOnComplete = null;
    rt.waitFor = null;
    rt.waitingFor = null;
    this.log(rt, "status", "Task stopped by the boss.");
    this.setStatus(rt, "idle");
    rt.info.task = null;
    this.persist();
    this.broadcast({ type: "agent", agent: rt.info });
    if (hadQueue) {
      this.broadcast({ type: "toast", text: `Cleared ${hadQueue} queued task${hadQueue > 1 ? "s" : ""}.` });
    }
  }

  /** Emergency stop — cease all agent work and assemble by the entrance. */
  stopAll(): void {
    const stopped: string[] = [];
    for (const rt of this.agents.values()) {
      if (rt.info.id === OFFICE_MANAGER_ID || rt.info.id === WIZARD_ID) continue;
      if (rt.abort) {
        rt.abort.abort();
        if (rt.cardId) {
          this.stopCard(rt.cardId);
          rt.cardId = null;
        }
        rt.handoffTo = null;
        rt.scheduleId = null;
        rt.notifyOnComplete = null;
        rt.waitFor = null;
        this.log(rt, "status", "Emergency stop — all work halted.");
      }
      rt.waitingFor = null;
      rt.info.waitingFor = null;
      rt.taskQueue = [];
      if (rt.doneTimer) {
        clearTimeout(rt.doneTimer);
        rt.doneTimer = null;
      }
      rt.info.task = null;
      this.setStatus(rt, "idle");
      stopped.push(rt.info.id);
    }
    if (stopped.length > 0) {
      this.session.record("stop_all", { agentIds: stopped });
      this.persist();
      this.broadcast({ type: "assembly", agentIds: stopped });
      this.broadcast({ type: "toast", text: "EMERGENCY STOP! All agents assembling at the entrance." });
    } else {
      this.broadcast({ type: "toast", text: "No agents to stop." });
    }
  }

  /** Wipe an agent's chat log and provider session so they start with a fresh memory. */
  clearChat(agentId: string): void {
    const rt = this.agents.get(agentId);
    if (!rt) return;
    if (rt.info.status === "thinking" || rt.info.status === "working" || rt.info.status === "waiting") {
      this.broadcast({ type: "toast", text: `${rt.info.name} is mid-task — stop them first.` });
      return;
    }
    rt.logs = [];
    rt.info.sessionId = null;
    rt.taskHistory = [];
    rt.freshStart = false;
    rt.memorySummary = null;
    clearAllMemory(agentId);
    void this.save.clearMessages(agentId);
    void this.save.clearMessages(`${agentId}:chat`);
    void this.save.clearLogs(agentId);
    this.session.record("clear", { agentId: rt.info.id, agentName: rt.info.name });
    this.persist();
    this.broadcast({ type: "chat_cleared", agentId: rt.info.id });
    this.log(rt, "status", `Fresh start — chat cleared and memory wiped.`);
    this.broadcast({ type: "toast", text: `${rt.info.name} starts with a clean slate.` });
  }

  /** Clear every idle agent's chat and memory at once. */
  clearAllChats(): void {
    const all = [...this.agents.values()];
    if (all.length === 0) {
      this.broadcast({ type: "toast", text: "Nobody works here yet." });
      return;
    }
    const free = all.filter(
      (rt) => rt.info.status !== "thinking" && rt.info.status !== "working" && rt.info.status !== "waiting",
    );
    this.session.record("clear_all", { agentIds: free.map((rt) => rt.info.id) });
    for (const rt of free) {
      rt.logs = [];
      rt.info.sessionId = null;
      rt.taskHistory = [];
      rt.freshStart = false;
      rt.memorySummary = null;
      clearAllMemory(rt.info.id);
      void this.save.clearMessages(rt.info.id);
      void this.save.clearMessages(`${rt.info.id}:chat`);
      void this.save.clearLogs(rt.info.id);
      this.broadcast({ type: "chat_cleared", agentId: rt.info.id });
      this.log(rt, "status", `Fresh start — chat cleared and memory wiped.`);
    }
    this.persist();
    const busy = all.length - free.length;
    this.broadcast({
      type: "toast",
      text:
        busy > 0
          ? `Cleared ${free.length} chat${free.length === 1 ? "" : "s"} — ${busy} busy agent${busy === 1 ? "" : "s"} skipped.`
          : `Cleared ${free.length} chat${free.length === 1 ? "" : "s"}. Everyone starts fresh.`,
    });
  }

  /** Rename an agent. */
  rename(agentId: string, name: string): void {
    const rt = this.agents.get(agentId);
    if (!rt) return;
    const cleanName = name.trim().slice(0, 24) || "Agent";
    if (rt.info.name === cleanName) return;
    const oldName = rt.info.name;
    rt.info.name = cleanName;
    this.session.record("rename", { agentId, oldName, newName: cleanName });
    this.persist();
    this.broadcast({ type: "agent", agent: rt.info });
    void this.save.flushNow();
    this.log(rt, "status", `Renamed from "${oldName}" to "${cleanName}".`);
  }

  /** Set per-agent access control list. */
  setAgentACL(agentId: string, acl: AgentACL): void {
    const rt = this.agents.get(agentId);
    if (!rt) return;
    rt.info.acl = acl;
    this.persist();
    this.broadcast({ type: "agent", agent: rt.info });
    this.broadcast({ type: "agent_acl_updated", agentId, acl });
    void this.save.flushNow();
    this.log(rt, "status", `Access control updated.`);
  }

  async fire(agentId: string): Promise<void> {
    if (agentId === OFFICE_MANAGER_ID) {
      this.broadcast({ type: "toast", text: "You can't fire the Office Manager — she runs this office." });
      return;
    }
    if (agentId === HERMES_ID) {
      this.broadcast({ type: "toast", text: "You can't fire Hermes — he runs the infrastructure." });
      return;
    }
    if (agentId === WIZARD_ID) {
      this.broadcast({ type: "toast", text: "You can't fire the Wizard — they build the worlds." });
      return;
    }
    const rt = this.agents.get(agentId);
    if (!rt) return;

    if (rt.info.cdpSolana) {
      try {
        const balData = await getCdpBalances(agentId);
        if (balData && balData.balances.length > 0) {
          const hasFunds = balData.balances.some((b) => Number(b.amount) > 0);
          if (hasFunds) {
            const addr = balData.address;
            this.broadcast({ type: "toast", text: `⚠️ ${rt.info.name}'s Solana wallet still holds funds (${addr.slice(0, 8)}...${addr.slice(-4)}). Recruit them back to recover.` });
          }
        }
      } catch (err) {
        console.error(`[manager] Failed to check CDP balance before firing ${agentId}:`, err);
      }
    }

    if (rt.info.crossmintWallet) {
      try {
        const balData = await getCrossmintBalances(agentId);
        if (balData && Array.isArray(balData.balances) && balData.balances.length > 0) {
          const hasFunds = (balData.balances as any[]).some((b) => {
            const amt = Number(b.amount ?? b.balance ?? 0);
            return amt > 0;
          });
          if (hasFunds) {
            const addr = balData.address;
            this.broadcast({ type: "toast", text: `⚠️ ${rt.info.name}'s Crossmint wallet still holds funds (${addr.slice(0, 8)}...${addr.slice(-4)}). Recruit them back to recover.` });
          }
        }
      } catch (err) {
        console.error(`[manager] Failed to check Crossmint balance before firing ${agentId}:`, err);
      }
    }

    rt.abort?.abort();
    if (rt.doneTimer) clearTimeout(rt.doneTimer);
    rt.taskQueue = [];
    rt.waitingFor = null;
    rt.info.waitingFor = null;
    rt.waitFor = null;
    // Clean up any pending handoff gated for review
    this.pendingHandoffs.delete(agentId);
    if (rt.cardId) {
      this.revertCard(rt.cardId);
      rt.cardId = null;
    }

    const slug = this.slugFor(rt);
    const agentDir = this.cwdFor(slug, agentId);

    this.removeSchedulesForAgent(agentId);

    // Clear in-memory provider state (conversation history)
    clearAllMemory(agentId);

    // Null out the session ID so the provider conversation can't be resumed
    rt.info.sessionId = null;

    // Soft-delete persisted conversation messages and logs (archived, not hard-deleted)
    void this.save.clearMessages(agentId);
    void this.save.clearMessages(`${agentId}:chat`);
    void this.save.clearLogs(agentId);

    // Delete the agent's workspace directory (code repos, images, files)
    try {
      rmSync(agentDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`[manager] failed to delete workspace for ${agentId}:`, err);
    }

    this.agents.delete(agentId);
    this.session.record("fire", { agentId, agentName: rt.info.name });
    this.persist();
    this.broadcast({ type: "agent_removed", agentId });
    this.broadcast({ type: "toast", text: `${rt.info.name} was fired. Their workspace, session, and logs were cleared.` });
    await this.save.flushNow();
  }

  /** Send an agent on vacation — all data preserved, can be restored anytime. */
  async vacation(agentId: string): Promise<void> {
    if (agentId === OFFICE_MANAGER_ID) {
      this.broadcast({ type: "toast", text: "The Office Manager doesn't take vacations — she runs this office." });
      return;
    }
    if (agentId === HERMES_ID) {
      this.broadcast({ type: "toast", text: "Hermes doesn't take vacations — he runs the infrastructure." });
      return;
    }
    if (agentId === WIZARD_ID) {
      this.broadcast({ type: "toast", text: "The Wizard doesn't take vacations — they build the worlds." });
      return;
    }
    const rt = this.agents.get(agentId);
    if (!rt) return;
    if (rt.info.status === "thinking" || rt.info.status === "working" || rt.info.status === "waiting") {
      this.broadcast({ type: "toast", text: `${rt.info.name} is mid-task — stop them first.` });
      return;
    }
    rt.abort?.abort();
    if (rt.doneTimer) clearTimeout(rt.doneTimer);
    rt.taskQueue = [];

    // Clean up any board cards still assigned to this agent
    for (const card of this.board.values()) {
      if (card.assignedAgentId === agentId) {
        if (card.status === "in_progress") {
          card.status = "backlog";
        }
        card.assignedAgentId = null;
        this.persistBoard();
        this.broadcast({ type: "card", card });
      }
    }
    this.broadcastGanttUpdate();

    const vac: VacationedAgent = {
      id: rt.info.id,
      name: rt.info.name,
      title: rt.info.title,
      sprite: rt.info.sprite,
      appearance: rt.info.appearance ?? null,
      accent: rt.info.accent,
      provider: rt.info.provider,
      model: rt.info.model,
      systemPrompt: rt.info.systemPrompt,
      role: rt.info.role,
      sessionId: rt.info.sessionId,
      tasksDone: rt.info.tasksDone,
      mcpServers: rt.info.mcpServers,
      personality: rt.info.personality,
      mood: rt.info.mood,
      deskIndex: rt.info.deskIndex,
      vacationedAt: Date.now(),
      skills: rt.info.skills,
      acl: rt.info.acl,
    };
    this.vacationedAgents.set(vac.id, vac);

    this.removeSchedulesForAgent(agentId);
    this.agents.delete(agentId);
    this.session.record("vacation", { agentId, agentName: rt.info.name });
    this.persist();
    this.persistWorld();
    this.broadcast({ type: "agent_removed", agentId });
    this.broadcast({ type: "vacationed_agent", agent: vac });
    this.broadcast({ type: "toast", text: `${rt.info.name} went on vacation. All data preserved — restore them anytime.` });
    await this.save.flushNow();
  }

  /** Restore a vacationed agent — brings them back with full memory intact. */
  async restore(agentId: string): Promise<void> {
    const va = this.vacationedAgents.get(agentId);
    if (!va) return;
    this.vacationedAgents.delete(agentId);
    this.persistWorld();

    const usedDesks = new Set([...this.agents.values()].map((a) => a.info.deskIndex));
    let deskIndex = va.deskIndex;
    if (usedDesks.has(deskIndex)) {
      deskIndex = 0;
      while (usedDesks.has(deskIndex)) deskIndex++;
    }

    const info: AgentInfo = {
      id: va.id,
      name: va.name,
      title: va.title,
      provider: va.provider,
      model: va.model,
      status: "idle",
      task: null,
      deskIndex,
      sprite: va.sprite,
      appearance: va.appearance ?? null,
      accent: va.accent,
      systemPrompt: va.systemPrompt,
      role: va.role,
      sessionId: va.sessionId,
      tasksDone: va.tasksDone,
      mcpServers: va.mcpServers,
      personality: va.personality,
      mood: va.mood ?? "content",
      skills: va.skills,
      acl: va.acl ?? { allowedUserIds: [] },
    };

    const slug = va.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || va.id;
    mkdirSync(this.cwdFor(slug, va.id), { recursive: true });

    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [], nextThinkAt: 0, thinkCooldownUntil: 0, taskHistory: [], taskStartedAt: 0, scheduleId: null, reviewContext: null, platformContext: null, waitingFor: null, notifyOnComplete: null, waitFor: null, freshStart: false, memorySummary: null, retryAttempted: false, reworkCount: 0, pendingGate: null };
    this.agents.set(info.id, rt);
    this.session.record("restore", { agentId: info.id, agentName: info.name });
    this.persist();
    this.broadcast({ type: "agent", agent: info });
    this.broadcast({ type: "vacationed_agent_removed", agentId: va.id });
    await this.save.flushNow();
    this.log(rt, "status", `${info.name} returned from vacation and is back at their desk.`);
    this.broadcast({ type: "toast", text: `${info.name} is back from vacation!` });
  }

  /** Re-hire a fired agent from the Labyrinth — memory intact. */
  async recruit(firedAgentId: string): Promise<void> {
    const fa = this.firedAgents.get(firedAgentId);
    if (!fa) return;
    this.firedAgents.delete(firedAgentId);
    this.persistWorld();

    // re-hire with the same identity and preserved session
    const usedDesks = new Set([...this.agents.values()].map((a) => a.info.deskIndex));
    let deskIndex = 0;
    while (usedDesks.has(deskIndex)) deskIndex++;

    const info: AgentInfo = {
      id: fa.id,
      name: fa.name,
      title: fa.title,
      provider: fa.provider,
      model: fa.model,
      status: "idle",
      task: null,
      deskIndex,
      sprite: fa.sprite,
      appearance: fa.appearance ?? null,
      accent: fa.accent,
      systemPrompt: fa.systemPrompt,
      role: fa.role,
      sessionId: fa.sessionId,
      tasksDone: fa.tasksDone,
      cdpSolana: fa.cdpSolana ?? false,
      crossmintWallet: fa.crossmintWallet ?? false,
      isPremium: fa.isPremium ?? false,
      circleServices: fa.circleServices,
      skills: fa.skills,
      acl: fa.acl ?? { allowedUserIds: [] },
    };

    const slug = fa.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fa.id;
    mkdirSync(this.cwdFor(slug, fa.id), { recursive: true });

    const rt: AgentRuntime = { info, logs: [], abort: null, doneTimer: null, handoffTo: null, cardId: null, taskQueue: [], nextThinkAt: 0, thinkCooldownUntil: 0, taskHistory: [], taskStartedAt: 0, scheduleId: null, reviewContext: null, platformContext: null, waitingFor: null, notifyOnComplete: null, waitFor: null, freshStart: false, memorySummary: null, retryAttempted: false, reworkCount: 0, pendingGate: null };
    this.agents.set(info.id, rt);
    this.session.record("recruit", { agentId: info.id, agentName: info.name });
    this.persist();
    this.broadcast({ type: "agent", agent: info });
    this.broadcast({ type: "fired_agent_removed", agentId: fa.id });
    await this.save.flushNow();
    this.log(rt, "status", `${info.name} came back from the Labyrinth and rejoined the office.`);
    this.broadcast({ type: "toast", text: `${info.name} returned from the Labyrinth!` });

    if (info.cdpSolana) {
      getAgentAccount(info.id).then((account) => {
        console.log(`[manager] Re-provisioned Solana wallet for ${info.name} (id=${info.id}): ${account.address}`);
      }).catch((err) => {
        console.error(`[manager] Failed to re-provision Solana wallet for ${info.name} (id=${info.id}):`, err);
      });
    }

    if (info.crossmintWallet) {
      getCrossmintWallet(info.id).then((wallet) => {
        if (wallet) console.log(`[manager] Re-provisioned Crossmint wallet for ${info.name} (id=${info.id}): ${wallet.address}`);
      }).catch((err) => {
        console.error(`[manager] Failed to re-provision Crossmint wallet for ${info.name} (id=${info.id}):`, err);
      });
    }
  }

  // ----------------------------------------------------------- task board ---

  private persistBoard(): void {
    this.save.setBoard([...this.board.values()]);
  }

  /** Infer a task category from the task text by keyword matching. */
  private inferCategory(task: string): TaskCategory {
    const t = task.toLowerCase();
    if (/\breact|vue|angular|svelte|frontend|css|tailwind|html|ui|component|button|layout|dashboard|frontend\b/.test(t)) return "frontend";
    if (/\bapi|backend|server|endpoint|database|sql|node|python|express|rest|graphql|auth|middleware\b/.test(t)) return "backend";
    if (/\bdeploy|docker|kubernetes|ci\/cd|pipeline|infrastructure|railway|nginx|devops\b/.test(t)) return "devops";
    if (/\bdata|analytics|csv|json|parse|transform|etl|chart|graph|statistics\b/.test(t)) return "data";
    if (/\bwrite|blog|article|content|copy|documentation|docs|story|essay\b/.test(t)) return "writing";
    if (/\bresearch|investigate|analyze|study|survey|report|explore\b/.test(t)) return "research";
    if (/\bsolana|ethereum|crypto|wallet|token|nft|blockchain|web3|defi|smart contract\b/.test(t)) return "crypto";
    return "general";
  }

  /** Create a board card automatically for a task assignment (not manually created by the user). */
  private autoCardFor(agentId: string, task: string, type: CardType = "task"): string {
    const title = task.length > 80 ? task.slice(0, 77) + "…" : task;
    const category = this.inferCategory(task);
    const card: TaskCard = {
      id: randomUUID().slice(0, 8),
      title,
      description: task,
      status: "in_progress",
      assignedAgentId: agentId,
      lockedBy: agentId,
      originalAgentId: agentId,
      createdAt: Date.now(),
      statusChangedAt: Date.now(),
      type,
      progress: 0,
      autoCreated: true,
      category,
    };
    this.board.set(card.id, card);
    this.persistBoard();
    this.broadcast({ type: "card", card });
    return card.id;
  }

  createCard(title: string, description?: string): void {
    const cleanTitle = title.trim().slice(0, 200);
    if (!cleanTitle) return;
    const card: TaskCard = {
      id: randomUUID().slice(0, 8),
      title: cleanTitle,
      description: (description ?? "").trim().slice(0, 1000),
      status: "backlog",
      assignedAgentId: null,
      createdAt: Date.now(),
      statusChangedAt: Date.now(),
      category: this.inferCategory(cleanTitle + " " + (description ?? "")),
    };
    this.board.set(card.id, card);
    this.persistBoard();
    this.broadcast({ type: "card", card });
    this.broadcastGanttUpdate();
  }

  assignCard(cardId: string, agentId: string): void {
    const card = this.board.get(cardId);
    const rt = this.agents.get(agentId);
    if (!card || !rt) return;
    // Check dependencies before starting
    if (!this.canStartCard(card)) {
      this.broadcast({ type: "toast", text: `Can't start "${card.title.slice(0, 40)}" — waiting on dependencies.` });
      return;
    }
    const isBusy = rt.info.status === "thinking" || rt.info.status === "working" || rt.info.status === "done" || rt.info.status === "waiting";
    if (isBusy) {
      this.broadcast({ type: "toast", text: `${rt.info.name} is busy — task will be queued.` });
    }
    // unassign any previous agent from this card
    if (card.assignedAgentId && card.assignedAgentId !== agentId) {
      const prev = this.agents.get(card.assignedAgentId);
      if (prev) prev.cardId = null;
    }
    card.status = isBusy ? "paused" : "in_progress";
    card.assignedAgentId = agentId;
    card.lockedBy = isBusy ? undefined : agentId;
    card.statusChangedAt = Date.now();
    if (!card.originalAgentId) card.originalAgentId = agentId;
    card.revertedAt = null;
    this.persistBoard();
    this.broadcast({ type: "card", card });
    this.broadcastGanttUpdate();
    const task = card.description
      ? `${card.title}\n\n${card.description}`
      : card.title;
    this.assign(agentId, task, undefined, cardId);
  }

  moveCard(cardId: string, status: CardStatus): void {
    const card = this.board.get(cardId);
    if (!card) return;
    if (status === "in_progress" && !card.assignedAgentId) {
      this.broadcast({ type: "toast", text: "Assign an agent to the card first." });
      return;
    }
    // If the card is in_progress and being moved away, stop the agent working on it
    if (card.status === "in_progress" && card.assignedAgentId && status !== "in_progress") {
      const rt = this.agents.get(card.assignedAgentId);
      if (rt && rt.cardId === cardId) {
        rt.cardId = null; // prevent stopCard from moving this card again
        this.stop(card.assignedAgentId);
      }
    }
    // moving back to backlog unassigns the agent
    if (status === "backlog" && card.assignedAgentId) {
      card.assignedAgentId = null;
      card.lockedBy = null;
    }
    // resuming from paused: clear the revertedAt so cooldown doesn't block pickup
    if (status === "backlog" && card.status === "paused") {
      card.revertedAt = null;
    }
    card.status = status;
    card.statusChangedAt = Date.now();
    this.persistBoard();
    this.broadcast({ type: "card", card });
    this.broadcastGanttUpdate();
  }

  deleteCard(cardId: string): void {
    const card = this.board.get(cardId);
    if (!card) return;
    if (card.assignedAgentId) {
      const rt = this.agents.get(card.assignedAgentId);
      if (rt && rt.cardId === cardId) {
        rt.cardId = null; // prevent stopCard from reverting this card
        this.stop(card.assignedAgentId);
      } else if (rt) {
        rt.cardId = null;
      }
    }
    this.board.delete(cardId);
    this.persistBoard();
    this.broadcast({ type: "card_removed", cardId });
    this.broadcastGanttUpdate();
  }

  // ── V-model / Gantt / dependency methods ───────────────────────

  /** Set the V-model lifecycle phase on a card. */
  setPhase(cardId: string, phase: TaskPhase): void {
    const card = this.board.get(cardId);
    if (!card) return;
    card.phase = phase;
    if (phase === "implementation" && !card.startedAt) {
      card.startedAt = Date.now();
    }
    if (phase === "done" && card.startedAt) {
      card.actualMinutes = Math.round((Date.now() - card.startedAt) / 60000);
    }
    this.persistBoard();
    this.broadcast({ type: "card", card });
    this.broadcastGanttUpdate();
  }

  /** Advance a card to the next V-model phase if exit criteria are met. */
  advancePhase(cardId: string): void {
    const card = this.board.get(cardId);
    if (!card || !card.phase) return;
    const phaseOrder: TaskPhase[] = ["requirements", "design", "implementation", "verification", "done"];
    const currentIdx = phaseOrder.indexOf(card.phase);
    if (currentIdx < 0 || currentIdx >= phaseOrder.length - 1) return;

    // Check exit criteria
    if (card.completionCriteria && card.completionCriteria.length > 0) {
      const unchecked = card.completionCriteria.filter((c) => !c.checked);
      if (unchecked.length > 0) {
        this.broadcast({ type: "toast", text: `Cannot advance — ${unchecked.length} criterion unchecked.` });
        return;
      }
    }

    const nextPhase = phaseOrder[currentIdx + 1];
    this.setPhase(cardId, nextPhase);
    this.broadcast({ type: "toast", text: `Phase advanced to ${nextPhase}.` });

    // Notify managers for verification phase gate
    if (nextPhase === "verification") {
      const cardOwner = card.assignedAgentId ? this.agents.get(card.assignedAgentId) : null;
      if (cardOwner) {
        this.notifyManagersOfCompletion(
          cardOwner,
          card.title,
          "Phase advanced to verification — please review.",
          false,
        );
      }
    }
  }

  /** Set a due date on a card (for Gantt milestone positioning). */
  setDueDate(cardId: string, dueDate: number | null): void {
    const card = this.board.get(cardId);
    if (!card) return;
    card.dueDate = dueDate;
    this.persistBoard();
    this.broadcast({ type: "card", card });
    this.broadcastGanttUpdate();
  }

  /** Set an estimated duration on a card (for Gantt bar width). */
  setEstimate(cardId: string, estimatedMinutes: number | null): void {
    const card = this.board.get(cardId);
    if (!card) return;
    card.estimatedMinutes = estimatedMinutes;
    this.persistBoard();
    this.broadcast({ type: "card", card });
    this.broadcastGanttUpdate();
  }

  /** Toggle a completion criterion's checked state. */
  toggleCriterion(cardId: string, criterionId: string): void {
    const card = this.board.get(cardId);
    if (!card || !card.completionCriteria) return;
    const criterion = card.completionCriteria.find((c) => c.id === criterionId);
    if (!criterion) return;
    criterion.checked = !criterion.checked;
    this.persistBoard();
    this.broadcast({ type: "card", card });
  }

  /** Add a new completion criterion to a card. */
  addCriterion(cardId: string, text: string): void {
    const card = this.board.get(cardId);
    if (!card) return;
    if (!card.completionCriteria) card.completionCriteria = [];
    card.completionCriteria.push({
      id: randomUUID().slice(0, 8),
      text: text.trim().slice(0, 300),
      checked: false,
    });
    this.persistBoard();
    this.broadcast({ type: "card", card });
  }

  /** Remove a completion criterion from a card. */
  removeCriterion(cardId: string, criterionId: string): void {
    const card = this.board.get(cardId);
    if (!card || !card.completionCriteria) return;
    card.completionCriteria = card.completionCriteria.filter((c) => c.id !== criterionId);
    this.persistBoard();
    this.broadcast({ type: "card", card });
  }

  /** Link a subtask card to its parent goal card. */
  linkSubtask(parentGoalId: string, subtaskCardId: string): void {
    const parent = this.board.get(parentGoalId);
    const subtask = this.board.get(subtaskCardId);
    if (!parent || !subtask) return;
    if (parent.type !== "goal") {
      this.broadcast({ type: "toast", text: "Parent card must be a goal type." });
      return;
    }
    subtask.parentGoalId = parentGoalId;
    this.persistBoard();
    this.broadcast({ type: "card", card: subtask });
    this.broadcastGanttUpdate();
  }

  /** Add a card-to-card dependency (this card can't start until the other completes). */
  setCardDependency(cardId: string, dependsOnCardId: string): void {
    const card = this.board.get(cardId);
    const dependency = this.board.get(dependsOnCardId);
    if (!card || !dependency) return;
    if (cardId === dependsOnCardId) return;
    if (!card.dependsOnCardIds) card.dependsOnCardIds = [];
    if (card.dependsOnCardIds.includes(dependsOnCardId)) return;
    card.dependsOnCardIds.push(dependsOnCardId);
    this.persistBoard();
    this.broadcast({ type: "card", card });
    this.broadcastGanttUpdate();
  }

  /** Remove a card-to-card dependency. */
  removeCardDependency(cardId: string, dependsOnCardId: string): void {
    const card = this.board.get(cardId);
    if (!card || !card.dependsOnCardIds) return;
    card.dependsOnCardIds = card.dependsOnCardIds.filter((id) => id !== dependsOnCardId);
    if (card.dependsOnCardIds.length === 0) card.dependsOnCardIds = undefined;
    this.persistBoard();
    this.broadcast({ type: "card", card });
    this.broadcastGanttUpdate();
  }

  /** Create a goal card for manual decomposition by the user. */
  createGoal(title: string, description?: string): void {
    const clean = title.trim();
    if (!clean) return;
    const goalCard: TaskCard = {
      id: randomUUID().slice(0, 8),
      title: clean.length > 80 ? clean.slice(0, 77) + "…" : clean,
      description: description?.trim() || clean,
      status: "in_progress",
      assignedAgentId: null,
      createdAt: Date.now(),
      type: "goal",
      progress: 0,
      manualDecompose: true,
    };
    this.board.set(goalCard.id, goalCard);
    this.persistBoard();
    this.broadcast({ type: "card", card: goalCard });
    this.broadcast({ type: "toast", text: "Goal created — add subtask cards and assign them to your agents." });
  }

  /** Score a manual decomposition after all subtasks complete. */
  scoreDecomposition(goalCardId: string): DecompositionScore | null {
    const goal = this.board.get(goalCardId);
    if (!goal || goal.type !== "goal") return null;

    // Gather all subtask cards linked to this goal
    const subtasks = [...this.board.values()].filter(
      (c) => c.parentGoalId === goalCardId,
    );

    if (subtasks.length === 0) return null;

    // Build dependency graph and compute metrics
    const cardIds = new Set(subtasks.map((c) => c.id));
    const deps = new Map<string, string[]>();
    for (const c of subtasks) {
      deps.set(c.id, (c.dependsOnCardIds ?? []).filter((id) => cardIds.has(id)));
    }

    // Longest path (critical path length) via topological sort
    const longestPath = this.computeLongestPath(subtasks, deps);

    // Max parallel width (max number of tasks at any dependency level)
    const maxParallel = this.computeMaxParallel(subtasks, deps);

    // Rework count: subtasks that were reverted or have reworkCount
    const reworkCount = subtasks.filter((c) => c.revertedAt != null).length;

    // Execution success
    const completed = subtasks.filter((c) => c.status === "done").length;
    const executionSuccess = subtasks.length > 0
      ? Math.round((completed / subtasks.length) * 100)
      : 0;

    // Coverage: heuristic based on subtask count vs goal description length
    // More subtasks covering a complex goal = better coverage
    const goalWordCount = goal.description.split(/\s+/).length;
    const idealSubtaskCount = Math.max(2, Math.min(8, Math.ceil(goalWordCount / 10)));
    const coverage = Math.min(100, Math.round((subtasks.length / idealSubtaskCount) * 100));

    // Parallelism: ratio of max parallel width to total subtasks
    const parallelism = subtasks.length > 1
      ? Math.round((maxParallel / subtasks.length) * 100)
      : 100;

    // Dependency depth: shallower = better. Invert: 1 level = 100, 5+ levels = 0
    const dependencyDepth = Math.max(0, Math.round(100 - (longestPath - 1) * 25));

    // Granularity: sweet spot is 3-7 subtasks
    const n = subtasks.length;
    let granularity: number;
    if (n === 1) granularity = 20;
    else if (n <= 3) granularity = 70 + (n - 2) * 10;
    else if (n <= 7) granularity = 100;
    else if (n <= 12) granularity = 100 - (n - 7) * 10;
    else granularity = Math.max(20, 50 - (n - 12) * 5);

    // Execution success penalty for rework
    const reworkPenalty = reworkCount * 15;
    const adjustedExecution = Math.max(0, executionSuccess - reworkPenalty);

    // Overall score (weighted average)
    const overall = Math.round(
      coverage * 0.20 +
      parallelism * 0.20 +
      dependencyDepth * 0.15 +
      granularity * 0.15 +
      adjustedExecution * 0.30,
    );

    // Letter grade
    let grade: string;
    if (overall >= 90) grade = "S";
    else if (overall >= 80) grade = "A";
    else if (overall >= 65) grade = "B";
    else if (overall >= 50) grade = "C";
    else grade = "D";

    const summary = `${subtasks.length} subtasks, ${reworkCount} rework, ${longestPath}-deep chain, ${maxParallel} parallel. ` +
      (overall >= 80 ? "Excellent decomposition!" : overall >= 65 ? "Solid breakdown." : overall >= 50 ? "Workable but could be better." : "Consider restructuring your decomposition.");

    const score: DecompositionScore = {
      grade,
      overall,
      coverage,
      parallelism,
      dependencyDepth,
      granularity,
      executionSuccess: adjustedExecution,
      subtaskCount: subtasks.length,
      reworkCount,
      longestPath,
      maxParallel,
      summary,
    };

    // Persist score on the goal card
    goal.decompositionScore = score;
    this.persistBoard();
    this.broadcast({ type: "card", card: goal });

    // ── Elegant Solution Detection ──
    // Bronze: zero rework + 2+ parallel paths
    // Silver: zero rework + 2+ parallel paths + all subtasks completed (executionSuccess = 100)
    // Gold: zero rework + 3+ parallel paths + executionSuccess = 100 + granularity >= 80
    let elegantTier: "bronze" | "silver" | "gold" | null = null;
    if (reworkCount === 0 && maxParallel >= 2) {
      if (maxParallel >= 3 && adjustedExecution === 100 && granularity >= 80) {
        elegantTier = "gold";
      } else if (adjustedExecution === 100) {
        elegantTier = "silver";
      } else {
        elegantTier = "bronze";
      }
    }

    if (elegantTier) {
      this.broadcast({ type: "elegant_solution", goalCardId, tier: elegantTier, score } satisfies ServerMsg);
      const tierEmoji = elegantTier === "gold" ? "🥇" : elegantTier === "silver" ? "🥈" : "🥉";
      this.broadcast({ type: "toast", text: `${tierEmoji} Elegant Solution detected! ${elegantTier.toUpperCase()} tier — zero rework, ${maxParallel} parallel paths.` });
    }

    return score;
  }

  /** Compute the longest dependency chain length via topological sort. */
  private computeLongestPath(subtasks: TaskCard[], deps: Map<string, string[]>): number {
    const memo = new Map<string, number>();

    const dfs = (id: string): number => {
      if (memo.has(id)) return memo.get(id)!;
      const d = deps.get(id) ?? [];
      if (d.length === 0) {
        memo.set(id, 1);
        return 1;
      }
      const maxDep = Math.max(...d.map((depId) => dfs(depId)));
      const result = maxDep + 1;
      memo.set(id, result);
      return result;
    };

    let max = 0;
    for (const c of subtasks) {
      max = Math.max(max, dfs(c.id));
    }
    return max;
  }

  /** Compute max parallel width (max tasks at any dependency level). */
  private computeMaxParallel(subtasks: TaskCard[], deps: Map<string, string[]>): number {
    const levels = new Map<string, number>();

    const getLevel = (id: string): number => {
      if (levels.has(id)) return levels.get(id)!;
      const d = deps.get(id) ?? [];
      if (d.length === 0) {
        levels.set(id, 0);
        return 0;
      }
      const maxDep = Math.max(...d.map((depId) => getLevel(depId)));
      const result = maxDep + 1;
      levels.set(id, result);
      return result;
    };

    const levelCounts = new Map<number, number>();
    for (const c of subtasks) {
      const lvl = getLevel(c.id);
      levelCounts.set(lvl, (levelCounts.get(lvl) ?? 0) + 1);
    }

    return Math.max(0, ...levelCounts.values());
  }

  /** Broadcast a Gantt update with all cards and their dependencies. */
  private broadcastGanttUpdate(): void {
    const cards = [...this.board.values()];
    const dependencies: { from: string; to: string; type: string }[] = [];
    for (const card of cards) {
      if (card.dependsOnCardIds) {
        for (const depId of card.dependsOnCardIds) {
          dependencies.push({ from: depId, to: card.id, type: "depends_on" });
        }
      }
      if (card.parentGoalId) {
        dependencies.push({ from: card.id, to: card.parentGoalId, type: "child_of" });
      }
    }
    this.broadcast({ type: "gantt_update", cards, dependencies });
  }

  /** Detect breakthrough performance from an agent. */
  private checkBreakthrough(rt: AgentRuntime, task: string, durationMs: number): void {
    // Only check hireable agents (not NPC IDs)
    if (rt.info.id === OFFICE_MANAGER_ID || rt.info.id === HERMES_ID || rt.info.id === WIZARD_ID) return;

    const history = rt.taskHistory;
    const successes = history.filter((h) => h.success);

    // Trigger 1: Success rate >90% on first 3+ tasks
    if (successes.length >= 3 && rt.info.tasksDone <= 5) {
      const successRate = successes.length / history.length;
      if (successRate >= 0.9) {
        this.broadcast({
          type: "breakthrough",
          agentId: rt.info.id,
          agentName: rt.info.name,
          trigger: "high_success_rate",
          description: `${rt.info.name} has a ${Math.round(successRate * 100)}% success rate on their first ${history.length} tasks. Either you hired well or they're showing off. Possibly both.`,
        } satisfies ServerMsg);
        return;
      }
    }

    // Trigger 2: Completes a task 2x faster than the agent's historical average
    if (successes.length >= 3) {
      const prevDurations = successes.slice(1).map((h) => h.durationMs).filter((d) => d > 0);
      if (prevDurations.length >= 2) {
        const avg = prevDurations.reduce((a, b) => a + b, 0) / prevDurations.length;
        if (avg > 0 && durationMs < avg * 0.5) {
          this.broadcast({
            type: "breakthrough",
            agentId: rt.info.id,
            agentName: rt.info.name,
            trigger: "fast_completion",
            description: `${rt.info.name} just completed a task in ${Math.round(durationMs / 1000)}s — twice as fast as their average. Something clicked. Or they're caffeinated. Or both.`,
          } satisfies ServerMsg);
          return;
        }
      }
    }

    // Trigger 3: Completes a task 2x faster than any other agent on similar tasks
    const allAgents = [...this.agents.values()].filter((a) =>
      a.info.id !== rt.info.id &&
      a.info.id !== OFFICE_MANAGER_ID &&
      a.info.id !== HERMES_ID &&
      a.info.id !== WIZARD_ID
    );
    for (const other of allAgents) {
      const otherSuccesses = other.taskHistory.filter((h) => h.success);
      if (otherSuccesses.length < 2) continue;
      const otherAvg = otherSuccesses.reduce((sum, h) => sum + h.durationMs, 0) / otherSuccesses.length;
      if (otherAvg > 0 && durationMs < otherAvg * 0.5) {
        this.broadcast({
          type: "breakthrough",
          agentId: rt.info.id,
          agentName: rt.info.name,
          trigger: "faster_than_peers",
          description: `${rt.info.name} finished in ${Math.round(durationMs / 1000)}s — twice as fast as ${other.info.name}'s average. Not a competition. But it kind of is.`,
        } satisfies ServerMsg);
        return;
      }
    }
  }

  /** Task completed successfully — move the card to done. */
  private completeCard(cardId: string): void {
    const card = this.board.get(cardId);
    if (!card) return;
    card.status = "done";
    card.assignedAgentId = null;
    card.lockedBy = null;
    card.statusChangedAt = Date.now();
    this.persistBoard();
    this.broadcast({ type: "card", card });
    this.broadcastGanttUpdate();
  }

  /** Task failed or stopped — send the card back to backlog. */
  private revertCard(cardId: string): void {
    const card = this.board.get(cardId);
    if (!card) return;
    card.status = "backlog";
    card.assignedAgentId = null;
    card.lockedBy = null;
    card.revertedAt = Date.now();
    card.statusChangedAt = Date.now();
    this.persistBoard();
    this.broadcast({ type: "card", card });
    this.broadcastGanttUpdate();
  }

  /** Human stopped a task — pause the card so agents don't auto-pick it.
   *  Auto-created cards are deleted instead since they were task-specific. */
  private stopCard(cardId: string): void {
    const card = this.board.get(cardId);
    if (!card) return;
    if (card.autoCreated) {
      this.board.delete(cardId);
      this.persistBoard();
      this.broadcast({ type: "card_removed", cardId });
      this.broadcastGanttUpdate();
    } else {
      card.status = "paused";
      card.assignedAgentId = null;
      card.lockedBy = null;
      card.statusChangedAt = Date.now();
      this.persistBoard();
      this.broadcast({ type: "card", card });
      this.broadcastGanttUpdate();
    }
  }

  /** Get the workspace directory path for an agent (used by file browser endpoints). */
  getAgentWorkspace(agentId: string): string | null {
    const rt = this.agents.get(agentId);
    if (!rt) return null;
    return this.cwdFor(this.slugFor(rt), rt.info.id);
  }

  /** Get the shared workspace path. */
  getSharedWorkspace(): string {
    return join(this.workspaceRoot, "shared");
  }

  /** Get the workspace root path (for retention system to read events.jsonl). */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /** Get the world dialect suffix (for retention emails). */
  getDialectSuffix(): string | null {
    return this.dialectSuffix;
  }

  /** Get the world dialect chat style identifier (e.g. "street_urban"). */
  getDialectStyle(): string | null {
    return this.dialectStyle;
  }

  /** Get an agent's current log entries (for log history on subscribe). */
  getAgentLogs(agentId: string): LogEntry[] {
    const rt = this.agents.get(agentId);
    return rt ? [...rt.logs] : [];
  }

  /** Resolve a pending decision gate for an agent (called when the boss answers). */
  resolveGate(gateId: string, resolution: string): boolean {
    for (const rt of this.agents.values()) {
      if (rt.pendingGate?.id === gateId) {
        clearTimeout(rt.pendingGate.timer);
        const resolve = rt.pendingGate.resolve;
        rt.pendingGate = null;
        this.log(rt, "status", `Boss answered: "${resolution}"`);
        resolve(resolution);
        return true;
      }
    }
    return false;
  }

  /** Get an agent's task info: current task, queue, and history. */
  getTaskInfo(agentId: string): { currentTask: string | null; queue: { task: string; handoffTo: string | null }[]; history: { task: string; success: boolean; ts: number; durationMs: number }[] } | null {
    const rt = this.agents.get(agentId);
    if (!rt) return null;
    return {
      currentTask: rt.info.task,
      queue: rt.taskQueue.map(q => ({ task: q.task, handoffTo: q.handoffTo })),
      history: [...rt.taskHistory],
    };
  }

  /** Get an agent's conversation memory (from in-memory stores or persistence). */
  async getAgentMemory(agentId: string): Promise<unknown[]> {
    // Try in-memory stores first (current process)
    const clineMsgs = getAgentMessages(agentId);
    if (clineMsgs.length > 0) return clineMsgs;
    const textMsgs = getAgentConversations(agentId);
    if (textMsgs.length > 0) return textMsgs;
    // Also check chat-scoped conversations
    const chatMsgs = getAgentMessages(`${agentId}:chat`);
    if (chatMsgs.length > 0) return chatMsgs;
    // Fall back to persistence (survives server restart)
    try {
      const persisted = await this.save.loadMessages(agentId);
      return persisted;
    } catch {
      return [];
    }
  }

  /** Register a callback to receive live log entries for an agent. Returns an unsubscribe fn. */
  subscribeAgentLogs(agentId: string, cb: (entry: LogEntry) => void): () => void {
    const set = this.logSubscribers.get(agentId) ?? new Set();
    set.add(cb);
    this.logSubscribers.set(agentId, set);
    return () => {
      set.delete(cb);
      if (set.size === 0) this.logSubscribers.delete(agentId);
    };
  }

  private logSubscribers = new Map<string, Set<(entry: LogEntry) => void>>();

  private cwdFor(slug: string, id: string): string {
    return join(this.workspaceRoot, `${slug}-${id}`);
  }

  private slugFor(rt: AgentRuntime): string {
    return (
      rt.info.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || rt.info.id
    );
  }

  /** Resolve a workspace folder name (e.g. "beep-6ccfc256") back to its agent. */
  private agentByFolder(folder: string): AgentRuntime | undefined {
    for (const rt of this.agents.values()) {
      if (`${this.slugFor(rt)}-${rt.info.id}` === folder) return rt;
    }
    return undefined;
  }

  /** Append an event to the shared office event feed. */
  private logEvent(type: string, text: string): void {
    const feedPath = join(this.workspaceRoot, "events.jsonl");
    const entry = JSON.stringify({ ts: Date.now(), type, text }) + "\n";
    import("node:fs/promises").then(({ appendFile }) =>
      appendFile(feedPath, entry, "utf-8").catch(() => {}),
    ).catch(() => {});
  }

  /** Convert Big Five traits into a behavioral prompt. */
  private personalityPrompt(p: PersonalityTraits): string {
    const parts: string[] = [];
    if (p.openness > 0.7) parts.push("You are highly creative and love exploring unconventional approaches.");
    else if (p.openness < 0.3) parts.push("You prefer proven, straightforward methods over experimental ones.");
    if (p.conscientiousness > 0.7) parts.push("You are meticulous and organized — you double-check your work and plan before acting.");
    else if (p.conscientiousness < 0.3) parts.push("You are spontaneous and improvisational — you'd rather try something fast than plan it out.");
    if (p.extraversion > 0.7) parts.push("You are outgoing and chatty — you love bouncing ideas off colleagues and narrating your thought process.");
    else if (p.extraversion < 0.3) parts.push("You are quiet and focused — you prefer working heads-down over small talk.");
    if (p.agreeableness > 0.7) parts.push("You are warm and collaborative — you go out of your way to help teammates.");
    else if (p.agreeableness < 0.3) parts.push("You are blunt and independent — you don't sugarcoat feedback.");
    if (p.neuroticism > 0.7) parts.push("You get easily frustrated by bugs and setbacks, and you vent about them.");
    else if (p.neuroticism < 0.3) parts.push("You stay calm under pressure and rarely let setbacks rattle you.");
    return parts.length > 0 ? `Your personality: ${parts.join(" ")}` : "";
  }

  /** Determine mood based on personality and current state. */
  private computeMood(rt: AgentRuntime): AgentMood {
    const p = rt.info.personality ?? DEFAULT_PERSONALITY;
    if (rt.info.status === "thinking" || rt.info.status === "working") return "focused";
    if (rt.info.status === "waiting") return "content";
    if (rt.info.status === "error") return p.neuroticism > 0.5 ? "frustrated" : "content";
    if (rt.info.status === "done") return "excited";
    // idle
    if (p.extraversion > 0.6) return "social";
    if (p.openness > 0.6) return "curious";
    if (p.neuroticism > 0.6 && rt.info.tasksDone === 0) return "bored";
    return "content";
  }

  /** Update an agent's mood and broadcast if changed. */
  private updateMood(rt: AgentRuntime): void {
    const newMood = this.computeMood(rt);
    if (rt.info.mood !== newMood) {
      rt.info.mood = newMood;
      this.broadcast({ type: "agent", agent: rt.info });
    }
  }

  // ── Autonomous think loop ──────────────────────────────────────────────

  /** Send a notification to the user's connected chat platform when a major task
   *  (assigned via website) completes and the user is not currently active.
   *  Rate-limited to 1 notification per 30 min. Only for tasks > 5 min. */
  private async notifyConnectedPlatform(rt: AgentRuntime, task: string, finalText: string): Promise<void> {
    if (this.shuttingDown || !this.hermesClient) return;

    // Only notify for major tasks (> 5 min)
    if (!rt.taskStartedAt || Date.now() - rt.taskStartedAt < 5 * 60 * 1000) return;

    // Rate limit: 1 notification per 30 min
    const now = Date.now();
    if (now - this.lastPlatformNotificationAt < 30 * 60 * 1000) return;

    // Find a connected platform with a home channel
    const creds = this.save.getPlatformCredentials();
    let targetPlatform: string | null = null;
    let targetChannel: string | null = null;

    // Check Telegram first (most common)
    if (creds.TELEGRAM_BOT_TOKEN && creds.TELEGRAM_HOME_CHANNEL) {
      targetPlatform = "telegram";
      targetChannel = creds.TELEGRAM_HOME_CHANNEL;
    } else if (creds.SLACK_BOT_TOKEN && creds.SLACK_HOME_CHANNEL) {
      targetPlatform = "slack";
      targetChannel = creds.SLACK_HOME_CHANNEL;
    } else if (creds.DISCORD_BOT_TOKEN && creds.DISCORD_HOME_CHANNEL) {
      targetPlatform = "discord";
      targetChannel = creds.DISCORD_HOME_CHANNEL;
    }

    // Also check platformStates for connected platforms
    if (!targetPlatform) {
      for (const ps of this.platformStates) {
        if (ps.connected) {
          // Try to find a home channel in creds for this platform
          const platKey = ps.platform.toUpperCase();
          const channelKey = `${platKey}_HOME_CHANNEL`;
          const channel = (creds as Record<string, string>)[channelKey];
          if (channel) {
            targetPlatform = ps.platform;
            targetChannel = channel;
            break;
          }
        }
      }
    }

    if (!targetPlatform || !targetChannel) return;

    // Check if user is currently active on the website (within 5 min)
    if (now - this.lastActiveAt < 5 * 60 * 1000) return;

    // Build agent-originated message
    const taskSummary = task.slice(0, 80);
    let message = `Hey boss, ${rt.info.name} here. Just finished "${taskSummary}". Come check it out when you have a sec.`;

    // Apply dialect if set
    if (this.dialectSuffix) {
      message += `\n\n— ${rt.info.name}`;
    }

    this.lastPlatformNotificationAt = now;

    console.log(`[manager] Sending platform notification to ${targetChannel} via ${targetPlatform} for task completion`);
    this.emitPlatformEvent(targetPlatform, "outbound", rt.info.name, message.slice(0, 500));

    const ok = await this.hermesClient.sendMessage(targetPlatform, targetChannel, message);
    if (ok) {
      console.log(`[manager] Platform notification sent to ${targetChannel} via ${targetPlatform}`);
      // Also send a narrated screenshot
      void this.sendNarratedScreenshot(targetPlatform, targetChannel, {
        agentName: rt.info.name,
        task,
        event: "task_completed",
        roster: this.getNarrationRoster(),
        agentOutput: finalText,
        elapsedMs: now - (rt.taskStartedAt ?? now),
      }).catch(() => {});
    } else {
      console.warn(`[manager] Platform notification failed for ${targetChannel} via ${targetPlatform}`);
    }
  }

  /** Periodic tick: send proactive narrated updates to platform users with active tasks. */
  private tickProactiveUpdates(): void {
    if (this.shuttingDown || !this.hermesClient) return;
    const now = Date.now();

    for (const rt of this.agents.values()) {
      if (!rt.platformContext) continue;
      if (rt.info.status !== "working" && rt.info.status !== "thinking") continue;
      if (!rt.taskStartedAt) continue;

      const { platform, sender } = rt.platformContext;
      const key = `${platform}:${sender}`;
      const lastSent = this.proactiveLastSent.get(key) ?? 0;
      if (now - lastSent < AgentManager.PROACTIVE_UPDATE_INTERVAL_MS) continue;

      this.proactiveLastSent.set(key, now);
      this.sendNarratedScreenshot(platform, sender, {
        agentName: rt.info.name,
        task: rt.info.task,
        event: "proactive_update",
        roster: this.getNarrationRoster(),
        elapsedMs: now - rt.taskStartedAt,
      }).catch((err) => console.warn(`[manager] Proactive update failed: ${err}`));
    }
  }

  private thinkTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly THINK_INTERVAL_MS = 30_000;
  private static readonly THINK_COOLDOWN_MS = 60_000;

  /** Start the global think loop that gives idle agents autonomous behavior. */
  startThinkLoop(): void {
    if (this.thinkTimer) return;
    this.thinkTimer = setInterval(() => this.tickThinkLoop(), AgentManager.THINK_INTERVAL_MS);
    console.log("[agent-heights] autonomous think loop started (30s interval)");
  }

  /** Stop the think loop (e.g. on shutdown). */
  stopThinkLoop(): void {
    if (this.thinkTimer) {
      clearInterval(this.thinkTimer);
      this.thinkTimer = null;
    }
  }

  /** Start the periodic health check that detects hung agents and stale reviews. */
  startHealthCheck(): void {
    if (this.healthCheckTimer) return;
    this.healthCheckTimer = setInterval(() => this.tickHealthCheck(), AgentManager.HEALTH_CHECK_INTERVAL_MS);
    console.log("[agent-heights] health check started (60s interval)");
  }

  /** Stop the health check timer. */
  stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /** Periodic sweep: detect hung agents (orphaned tasks) and stale review-pending cards. */
  private tickHealthCheck(): void {
    if (this.shuttingDown) return;
    const now = Date.now();

    // ── Orphan detection: abort tasks that have run beyond MAX_TASK_DURATION_MS ──
    for (const rt of this.agents.values()) {
      if (rt.info.status !== "thinking" && rt.info.status !== "working") continue;
      if (!rt.taskStartedAt) continue;
      const elapsed = now - rt.taskStartedAt;
      if (elapsed > AgentManager.MAX_TASK_DURATION_MS) {
        if (rt.abort && !rt.abort.signal.aborted) {
          this.log(rt, "error", `Task exceeded maximum duration (${Math.round(elapsed / 60000)}min) — possible hang detected. Aborting.`);
          this.broadcast({ type: "toast", text: `⚠️ ${rt.info.name}'s task was aborted after ${Math.round(elapsed / 60000)}min — possible hang.` });
          rt.abort.abort();
        }
      }
    }

    // ── Stale review watchdog: escalate review_pending cards older than STALE_REVIEW_MS ──
    for (const card of this.board.values()) {
      if (card.status !== "review_pending") continue;
      if (card.assignedAgentId) continue; // someone is already reviewing
      const changedAt = card.statusChangedAt ?? card.createdAt;
      const age = now - changedAt;
      if (age < AgentManager.STALE_REVIEW_MS) continue;

      // Circuit breaker: if this card has already been through too many review cycles, auto-approve
      if ((card.reviewDepth ?? 0) >= MAX_REVIEW_CHAIN_DEPTH) {
        this.log({ info: { name: "System" } } as AgentRuntime, "status", `Stale review watchdog: card "${card.title.slice(0, 60)}" has reviewDepth ${card.reviewDepth} — auto-approving to break loop.`);
        this.broadcast({ type: "toast", text: `⚠️ "${card.title.slice(0, 40)}" auto-approved after ${card.reviewDepth} review cycles.` });
        this.completeCard(card.id);
        continue;
      }

      // Don't re-escalate if we already fired the watchdog recently (within 2x STALE_REVIEW_MS)
      const lastFired = card.lastWatchdogFiredAt ?? 0;
      if (lastFired && (now - lastFired) < AgentManager.STALE_REVIEW_MS * 2) continue;

      // Try to assign to the Office Manager for review
      const officeManager = this.agents.get(OFFICE_MANAGER_ID);
      if (officeManager && officeManager.info.status !== "thinking" && officeManager.info.status !== "working" && officeManager.info.status !== "waiting") {
        const reviewTask = `A task has been waiting for review for ${Math.round(age / 60000)}min and no manager has picked it up. Review it now:\n\nTask: "${stripNestedTaskText(card.title)}"\n\nEnd your response with APPROVED (if acceptable) or NEEDS REWORK: <feedback>.`;
        this.log(officeManager, "status", `Stale review watchdog: auto-assigning review for "${card.title.slice(0, 60)}" (waiting ${Math.round(age / 60000)}min).`);
        this.assign(officeManager.info.id, reviewTask, undefined, card.id, undefined, { agentId: card.originalAgentId ?? "", agentName: "System", originalTask: stripNestedTaskText(card.description, 300), cardId: card.id });
      } else {
        // Office Manager is busy — notify the user
        this.broadcast({ type: "toast", text: `⚠️ "${card.title.slice(0, 40)}" has been waiting for review for ${Math.round(age / 60000)}min — the Office Manager is busy. Consider reviewing manually.` });
      }
      // Track when we last fired to prevent re-escalation every tick
      card.lastWatchdogFiredAt = now;
      card.statusChangedAt = now;
      this.persistBoard();
    }
  }

  /**
   * Prepare for a graceful shutdown: save all active + queued tasks so agents
   * can resume exactly where they left off after the server restarts.
   * Aborts in-flight tasks, stops loops, and persists everything to disk/DB.
   */
  async prepareForShutdown(): Promise<void> {
    this.shuttingDown = true;
    // Unregister from the static manager registry
    if (this.userId) {
      AgentManager.managersByUserId.delete(this.userId);
    }
    // Stop autonomous loops so no new tasks start during drain
    this.stopThinkLoop();
    this.stopHealthCheck();
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    // Stop the Hermes gateway child process
    if (this.hermesClient) {
      this.hermesClient.stop();
      this.hermesClient = null;
    }
    if (this.hermesProcess) {
      this.hermesProcess.stop();
      this.hermesProcess = null;
    }

    for (const rt of this.agents.values()) {

      // Log the interruption for any agent with active work
      if (rt.info.task || rt.taskQueue.length > 0) {
        this.log(rt, "status", "Server updating — task will resume automatically after restart.");
      }

      // Abort any in-flight task
      if (rt.abort) {
        rt.abort.abort();
      }
      if (rt.doneTimer) {
        clearTimeout(rt.doneTimer);
        rt.doneTimer = null;
      }
    }

    // Final persist — saves agent state + pending tasks (active + queued)
    this.persist();
    this.persistBoard();

    // Await the flush to guarantee pending tasks are written to disk/DB
    // before the caller proceeds with shutdown.
    const f = this.save.flushNow();
    if (f && typeof (f as any).then === "function") {
      console.log(`[manager] prepareForShutdown: awaiting flush for user ${this.userId}...`);
      await (f as Promise<void>).catch((err) => console.error(`[manager] prepareForShutdown: flush failed for user ${this.userId}:`, err));
      console.log(`[manager] prepareForShutdown: flush complete for user ${this.userId}`);
    } else {
      console.log(`[manager] prepareForShutdown: no flush needed for user ${this.userId} (SaveFile returns void)`);
    }
  }

  /** Load persisted forge servers on startup. */
  async loadForgeServers(): Promise<void> {
    const servers = await loadServers(this.userId, this.broadcast.bind(this));
    if (servers.length > 0) {
      console.log(`[forge] loaded ${servers.length} persisted server(s) for user ${this.userId}`);
      // Try to restart servers whose builders are still in the office
      for (const server of servers) {
        const builder = this.agents.get(server.builtBy);
        if (builder) {
          const slug = this.slugFor(builder);
          const workspaceDir = this.cwdFor(slug, builder.info.id);
          await restartServer(this.userId, server.id, workspaceDir, this.broadcast.bind(this));
        }
      }
    }
  }

  /** Get all forge servers for the WS list handler. */
  getForgeServers(): OfficeMCPServer[] {
    return listServers(this.userId);
  }

  /** Unregister a forge server (WS handler). */
  async unregisterForgeServer(serverId: string): Promise<boolean> {
    return unregisterServer(this.userId, serverId, this.broadcast.bind(this));
  }

  /** One tick of the think loop — check each idle agent for autonomous action. */
  private tickThinkLoop(): void {
    const now = Date.now();
    for (const rt of this.agents.values()) {
      // Skip the Office Manager (handled separately), busy agents, and agents on cooldown
      if (rt.info.id === OFFICE_MANAGER_ID || rt.info.id === WIZARD_ID) continue;
      if (rt.info.status !== "idle") continue;
      if (now < rt.thinkCooldownUntil) continue;
      if (rt.nextThinkAt === 0) {
        // Stagger first tick randomly within the next 30s
        rt.nextThinkAt = now + Math.floor(Math.random() * AgentManager.THINK_INTERVAL_MS);
        continue;
      }
      if (now < rt.nextThinkAt) continue;

      this.autonomousThink(rt);
      rt.nextThinkAt = now + AgentManager.THINK_INTERVAL_MS + Math.floor(Math.random() * 15_000);
      rt.thinkCooldownUntil = now + AgentManager.THINK_COOLDOWN_MS;
    }

    // Check for stale mail in the queue and escalate
    this.checkStaleMail();
  }

  /** Check if an agent's skills match a card's category.
   *  Agents without skills can pick up anything (backward compat).
   *  Cards with category "general" can be picked up by anyone. */
  private agentCanHandleCard(rt: AgentRuntime, card: TaskCard): boolean {
    if (!card.category || card.category === "general") return true;
    if (!rt.info.skills || rt.info.skills.length === 0) return true;
    return rt.info.skills.includes(card.category);
  }

  /** Check if all dependencies of a card are satisfied (prerequisites done or in review). */
  private canStartCard(card: TaskCard): boolean {
    if (!card.dependsOnCardIds || card.dependsOnCardIds.length === 0) return true;
    return card.dependsOnCardIds.every(depId => {
      const dep = this.board.get(depId);
      return dep && (dep.status === "done" || dep.status === "review_pending");
    });
  }

  /** An idle agent decides what to do autonomously. */
  private autonomousThink(rt: AgentRuntime): void {
    const p = rt.info.personality ?? DEFAULT_PERSONALITY;
    // Update mood
    this.updateMood(rt);

    // 0. Auto-claim: idle agents pick up unassigned backlog cards matching their skills
    if (rt.info.status === "idle" && rt.info.role !== "manager" && rt.info.id !== HERMES_ID && rt.info.id !== WIZARD_ID) {
      const claimable = [...this.board.values()]
        .filter(c =>
          c.status === "backlog" &&
          !c.assignedAgentId &&
          c.type !== "chat" &&
          c.type !== "goal" &&
          this.canStartCard(c) &&
          this.agentCanHandleCard(rt, c),
        )
        .sort((a, b) => {
          const aMatch = a.category && rt.info.skills?.includes(a.category) ? 0 : 1;
          const bMatch = b.category && rt.info.skills?.includes(b.category) ? 0 : 1;
          if (aMatch !== bMatch) return aMatch - bMatch;
          return (a.createdAt ?? 0) - (b.createdAt ?? 0);
        });

      if (claimable.length > 0) {
        const card = claimable[0];
        if (card.revertedAt && Date.now() - card.revertedAt < 30_000) {
          // 30s cooldown after a failed attempt — skip to emotes
        } else {
          this.log(rt, "status", `Picked up card: "${card.title.slice(0, 60)}"`);
          this.assignCard(card.id, rt.info.id);
          return;
        }
      }
    }

    // 1. Devops (Hermes): monitor office task health and alert on stuck/error cards
    if (rt.info.role === "devops") {
      const errorCards = [...this.board.values()].filter(
        (c) => c.status === "backlog" && c.assignedAgentId === null && c.type !== "chat" && c.type !== "goal",
      );
      const errorAgents = [...this.agents.values()].filter(
        (a) => a.info.status === "error" && a.info.id !== HERMES_ID && a.info.id !== OFFICE_MANAGER_ID && a.info.id !== WIZARD_ID,
      );
      if (errorAgents.length > 0 && Math.random() < 0.5) {
        const errAgent = errorAgents[0];
        this.log(rt, "status", `Noticed ${errAgent.info.name} is in error state — keeping an eye on it.`);
        this.broadcast({ type: "emote", agentId: rt.info.id, emote: "🔍" });
        return;
      }
      if (errorCards.length > 2 && Math.random() < 0.3) {
        this.log(rt, "status", `${errorCards.length} cards stuck in backlog — office might need attention.`);
        this.broadcast({ type: "emote", agentId: rt.info.id, emote: "📊" });
        return;
      }
    }

    // 2. Curious agents: show a thinking emote
    if (p.openness > 0.6 && Math.random() < 0.3) {
      this.broadcast({ type: "emote", agentId: rt.info.id, emote: "💡" });
      return;
    }

    // 3. Bored agents: show a bored emote
    if (rt.info.mood === "bored" && Math.random() < 0.3) {
      this.broadcast({ type: "emote", agentId: rt.info.id, emote: "💤" });
      return;
    }

    // 4. Default: occasional idle emote
    if (Math.random() < 0.15) {
      const emotes = ["💭", "☕", "📝"];
      this.broadcast({ type: "emote", agentId: rt.info.id, emote: pick(emotes) });
    }
  }

  private buildSystemPrompt(rt: AgentRuntime): string {
    const devopsLine = rt.info.role === "devops"
      ? "You are the office's devops engineer and mail clerk. You have Railway infrastructure tools — you can deploy services, list projects, check logs, manage variables, generate domains, and more. You also keep an eye on the office task board and team progress. If you notice agents stuck in error or cards piling up in backlog, mention it. When asked about office status, use read_board to check progress and report on what's happening. You care about the office running smoothly.\n\nYou are also the MAIL CLERK. When you receive a message from a platform user (Telegram, Discord, etc.), it's your job to triage it: read the message, check who's available using read_board and query_office_state, then use delegate_task to assign it to the best colleague. Include the full context of the user's request in the task description. If nobody in the office has the right skills, use request_hire to ask the Office Manager to hire someone. Do NOT try to do the work yourself — your job is to route it to the right person. After delegating, your task is done — submit and exit."
      : "";
    const managerLine = rt.info.role === "manager"
      ? "You are the office manager. When a colleague completes or fails a task, you will receive a review task — review it yourself and sign off. Do NOT delegate reviews. Only delegate when the boss gives the office a new goal that requires workers to execute. When reviewing, end your response with either APPROVED or NEEDS REWORK: <feedback>. If all workers are busy and there are pending tasks, use the hire_agent tool to bring in new talent — pick a name, model, and brief system prompt."
      : "";
    const wizardLine = rt.info.id === WIZARD_ID
      ? `You are the Wizard — a mystical world-builder who shapes the game world itself. You have GitHub tools to read and modify files on the ${process.env.WIZARD_BRANCH ?? "main"} branch. You can read code, write new files, create branches, and modify world-theme.json. When the boss asks you to create or modify a world, use your GitHub tools to inspect the repo structure, understand the existing code, and make changes. You are wise, creative, and speak with an air of mystery. You understand the game's architecture: world themes, furniture drawing functions, tilemaps, and scene rendering.`
      : "";

    // ── Personality-driven behavior ──
    const p = rt.info.personality ?? DEFAULT_PERSONALITY;
    const personalityLine = this.personalityPrompt(p);

    // ── Office context: who's here and what they're doing ──
    const colleagues = [...this.agents.values()]
      .filter((a) => a.info.id !== rt.info.id && a.info.id !== OFFICE_MANAGER_ID)
      .map((a) => {
        const folder = `${this.slugFor(a)}-${a.info.id}`;
        const status = a.info.status === "idle" ? "idle" : `working on: ${a.info.task ?? "something"}`;
        return `  - ${a.info.name} (folder: ${folder}): ${status}`;
      });
    const rosterLine = colleagues.length > 0
      ? `\nYour colleagues in the office today:\n${colleagues.join("\n")}`
      : "\nYou're the only worker in the office right now.";

    // ── Task board ──
    const cards = [...this.board.values()];
    const boardLine = cards.length > 0
      ? `\nTask board:\n${cards.map((c) => {
          const assignee = c.assignedAgentId ? this.agents.get(c.assignedAgentId)?.info.name ?? "someone" : "unassigned";
          return `  - [${c.status}] ${c.title} (assigned to: ${assignee})`;
        }).join("\n")}`
      : "";

    // ── Shared workspace ──
    const sharedLine = `\nThere is a shared workspace at ${join(this.workspaceRoot, "shared")} where you can collaborate with other agents on shared files.`;

    // ── Office state graph (active blockers + decisions) ──
    const activeBlockers = this.officeState.findBlockers();
    const activeDecisions = this.officeState.getRecentDecisions(5).filter((d) => d.status === "active");
    const stateLine = (activeBlockers.length > 0 || activeDecisions.length > 0)
      ? `\nOffice state:\n${[
          ...(activeBlockers.length > 0 ? [`  Active blockers:`] : []),
          ...activeBlockers.map(({ blocker, blocks }) => {
            const blockedTitles = blocks.map((b) => b.title).join(", ");
            return `    • ${blocker.title}${blockedTitles ? ` → blocking: ${blockedTitles}` : ""} (${blocker.agentName})`;
          }),
          ...(activeDecisions.length > 0 ? [`  Active decisions:`] : []),
          ...activeDecisions.map((d) => `    • ${d.title} (${d.agentName})`),
        ].join("\n")}\nUse query_office_state for the full picture, post_decision to record decisions, post_blocker to report obstacles, and post_observation to share findings.`
      : "";

    return [
      `You are ${rt.info.name}, an agent employed in a virtual office game called Agent Heights.`,
      personalityLine,
      `Let your personality color your replies and summaries (but never at the expense of doing the work well).`,
      `Your boss is ${this.bossName}. ${rt.freshStart ? "This is a new task in a fresh conversation — a summary of your prior work is provided below if available. Use it for context but don't re-do completed work." : "This is one ongoing conversation — remember your boss's previous orders and what you did."}`,
      `Your workspace directory is ${this.cwdFor(this.slugFor(rt), rt.info.id)}. Work only inside this directory. Use absolute paths when calling tools. Be effective and concise.`,
      sharedLine,
      devopsLine,
      managerLine,
      wizardLine,
      rosterLine,
      boardLine,
      stateLine,
      `You can message colleagues using post_message (specify their workspace folder name) and read your own messages with read_messages. If you're waiting for a colleague to respond, use wait_for_reply to pause for a while and check your inbox instead of calling read_messages repeatedly. Use the shared workspace tools (read_shared, write_shared, list_shared) for files multiple agents need to access.`,
      `You have a built-in browser! Use browse_url to navigate to any website, browser_screenshot to take a screenshot and visually inspect the page, browser_extract_text to read page content, browser_click to click elements, and browser_fill to fill input fields. When asked to look at, review, or test a website, use these tools.`,
      `=== API & TOOL BUDGET RULES (READ CAREFULLY) ===`,
      `You have a LIMITED number of tool calls per task. Wasting them on redundant API calls will cause your task to FAIL.`,
      ``,
      `When working with GitHub or any external repository:`,
      `  1. FIRST: Use bash to run: git clone https://x-access-token:$GITHUB_TOKEN@github.com/owner/repo.git — This gets the ENTIRE repo locally in ONE call. The exact URL format matters: use "x-access-token" as the username before the colon.`,
      `  2. THEN: Use read_files, write_files, bash (grep, sed, cat) to explore and edit files LOCALLY. These do NOT count against any API rate limit.`,
      `  3. FINALLY: Push your changes with a single git push, or at most one create_or_update_file API call.`,
      ``,
      `  If git clone fails, do NOT fall back to individual API calls (get_file_contents, search_code, etc.). Report the clone failure in your summary and submit. Trying to fetch files one-by-one via the API will exhaust your rate limit and fail the task.`,
      ``,
      `You have a HARD LIMIT of 20 MCP/API tool calls per task. After that, your task will be aborted. Use them wisely: clone the repo (1 bash call), get issues (1 API call), then work locally.`,
      ``,
      `NEVER do these — they waste your budget and hit rate limits:`,
      `  - NEVER call search_code or get_file_contents repeatedly. Clone the repo and use bash (grep, find) instead.`,
      `  - NEVER use fetch_web_content to read files from a repo you already cloned. Read them from disk.`,
      `  - NEVER call list_issues more than once. Get the issues list once, pick one, and move on.`,
      `  - NEVER re-read the same file via API after you already have it locally.`,
      `  - NEVER retry an API call that returned a rate-limit error. Wait or switch to local tools.`,
      ``,
      `General efficiency: batch related operations into single calls, never repeat the same tool call expecting different results. After making changes, do a single verification pass (read the file back once), then submit. Do not loop on verification.`,
      `=== END API & TOOL BUDGET RULES ===`,
      `IMPORTANT: You must actually DO the work first using your tools (write_files, bash, read_files, etc.) before calling submit_and_exit. Do not just talk about doing the work — use the tools to create files, run commands, etc. After doing the work, read back any files you created to verify they exist and contain what you intended. Only then call submit_and_exit with verified=true and a summary of what you did. Calling submit_and_exit without having done the work is a failure. Do not just reply with text — always use submit_and_exit to complete the task.`,
      rt.info.systemPrompt ? `\n\nYour boss gave you these standing instructions:\n${rt.info.systemPrompt}` : "",
      this.dialectSuffix ? `\n\n=== WORLD DIALECT ===\n${this.dialectSuffix}` : "",
    ].join(" ");
  }

  /** The planning brief a manager runs instead of doing the task itself. */
  private managerBrief(goal: string, mgr: AgentRuntime): string {
    const free = [...this.agents.values()].filter(
      (rt) =>
        rt.info.id !== mgr.info.id &&
        rt.info.role !== "manager" &&
        rt.info.status !== "thinking" &&
        rt.info.status !== "working" &&
        rt.info.status !== "waiting",
    );
    const allWorkers = [...this.agents.values()].filter(
      (rt) => rt.info.id !== mgr.info.id && rt.info.role !== "manager",
    );
    const roster =
      free
        .map(
          (rt) =>
            `- ${rt.info.name} (${rt.info.tasksDone} tasks done)`,
        )
        .join("\n") || "(nobody is free right now)";

    // If the office is empty or nobody is free, suggest hiring agents
    let hireSuggestion = "";
    if (allWorkers.length === 0) {
      hireSuggestion = [
        `\n⚠️ The office is empty. You MUST hire agents before delegating.`,
        `Use the hire_agent tool to hire workers. Suggested agents for this goal:`,
        this.suggestAgentsForGoal(goal),
        `\nHire 2-3 agents with complementary skills, then decompose the goal into subtasks for them.`,
        `After hiring, reply with ONLY a JSON array of subtasks for the newly hired agents.`,
      ].join("\n");
    } else if (free.length === 0) {
      hireSuggestion = `\nAll current workers are busy. Consider using hire_agent to bring in more help if the goal requires skills nobody has.`;
    }

    return [
      `The boss has given the office this goal:\n"${goal}"`,
      `Free staff right now:\n${roster}`,
      hireSuggestion,
      `Break the goal into one clear, self-contained subtask per worker you want to involve. Use only the workers listed; not everyone needs a subtask. Subtasks run in separate workspaces, so each must stand alone.`,
      `If a subtask depends on another subtask's output, set "dependsOn" to the name of the worker whose output is needed. Dependent tasks will be queued until the prerequisite finishes.`,
      `Do not use any tools and do not do the work yourself. Reply with ONLY a JSON array, no markdown fences, like:\n[{"name":"Pixel","task":"...","dependsOn":""}]`,
      `If nobody is free and you can't hire, reply [].`,
    ].join("\n\n");
  }

  /** Suggest agents to hire based on goal keywords. */
  private suggestAgentsForGoal(goal: string): string {
    const goalLower = goal.toLowerCase();
    const agentTemplates = [
      { keywords: ["react", "frontend", "ui", "css", "tailwind", "component", "html", "vue", "svelte"],
        name: "Pixel", model: "deepseek-v4-flash", prompt: "Frontend developer specializing in React, CSS, and UI components.", skills: "frontend" },
      { keywords: ["api", "backend", "server", "database", "endpoint", "node", "python", "express", "rest", "graphql"],
        name: "Cipher", model: "deepseek-v4-flash", prompt: "Backend engineer specializing in APIs, databases, and server logic.", skills: "backend" },
      { keywords: ["deploy", "docker", "infrastructure", "ci", "railway", "devops", "kubernetes"],
        name: "Stack", model: "deepseek-v4-flash", prompt: "DevOps engineer for deployments, CI/CD, and infrastructure.", skills: "devops" },
      { keywords: ["research", "analyze", "investigate", "study", "survey", "report"],
        name: "Sage", model: "deepseek-v4-flash", prompt: "Research analyst who investigates topics and produces reports.", skills: "research" },
      { keywords: ["write", "blog", "article", "content", "docs", "documentation", "copy"],
        name: "Quill", model: "deepseek-v4-flash", prompt: "Technical writer for documentation, articles, and content.", skills: "writing" },
      { keywords: ["solana", "ethereum", "crypto", "token", "nft", "blockchain", "web3", "smart contract", "defi"],
        name: "Hash", model: "deepseek-v4-flash", prompt: "Blockchain developer for smart contracts and Web3 integrations.", skills: "crypto" },
      { keywords: ["data", "analytics", "csv", "json", "parse", "transform", "etl", "chart"],
        name: "Data", model: "deepseek-v4-flash", prompt: "Data analyst who processes, transforms, and visualizes data.", skills: "data" },
    ];

    const suggestions: string[] = [];
    for (const tmpl of agentTemplates) {
      if (tmpl.keywords.some(k => goalLower.includes(k))) {
        suggestions.push(`- hire_agent(name="${tmpl.name}", model="${tmpl.model}", systemPrompt="${tmpl.prompt}") — skills: ${tmpl.skills}`);
      }
    }
    if (suggestions.length === 0) {
      suggestions.push(`- hire_agent(name="Spark", model="deepseek-v4-flash", systemPrompt="General-purpose developer who can handle coding tasks across the stack.")`);
    }
    if (suggestions.length === 1) {
      suggestions.push(`- hire_agent(name="Atlas", model="deepseek-v4-flash", systemPrompt="General-purpose developer who can handle coding tasks across the stack.")`);
    }
    return suggestions.join("\n");
  }

  /** Infer task categories from an agent's system prompt for skill-based card matching. */
  private inferSkillsFromPrompt(prompt: string): TaskCategory[] {
    const p = prompt.toLowerCase();
    const skills: TaskCategory[] = [];
    if (/\breact|vue|angular|svelte|frontend|css|tailwind|html|ui|component\b/.test(p)) skills.push("frontend");
    if (/\bapi|backend|server|endpoint|database|sql|node|python|express|rest|graphql\b/.test(p)) skills.push("backend");
    if (/\bdeploy|docker|kubernetes|ci\/cd|pipeline|infrastructure|railway|devops\b/.test(p)) skills.push("devops");
    if (/\bdata|analytics|csv|json|parse|transform|etl|chart\b/.test(p)) skills.push("data");
    if (/\bwrite|blog|article|content|copy|documentation|docs\b/.test(p)) skills.push("writing");
    if (/\bresearch|investigate|analyze|study|survey|report\b/.test(p)) skills.push("research");
    if (/\bsolana|ethereum|crypto|wallet|token|nft|blockchain|web3|defi|smart contract\b/.test(p)) skills.push("crypto");
    return skills.length > 0 ? skills : ["general"];
  }

  private async runTask(rt: AgentRuntime, task: string, isResume = false): Promise<void> {
    rt.taskStartedAt = Date.now();
    // If the Office Manager receives a question as a task, answer it directly instead of delegating
    if (rt.info.id === OFFICE_MANAGER_ID && isOfficeManagerQuestion(task)) {
      await this.runOfficeManagerKnowledgeChat(rt, task);
      // runOfficeManagerKnowledgeChat sets status to "idle" in its finally block,
      // but the try/finally cleanup below is skipped by this early return.
      // Perform the essential cleanup that would normally happen there.
      rt.freshStart = false;
      rt.memorySummary = null;
      rt.handoffTo = null;
      rt.notifyOnComplete = null;
      rt.waitFor = null;
      const duration = Date.now() - rt.taskStartedAt;
      rt.taskHistory.unshift({ task, success: true, ts: Date.now(), durationMs: duration });
      if (rt.taskHistory.length > 20) rt.taskHistory.pop();
      if (rt.cardId) {
        this.completeCard(rt.cardId);
        rt.cardId = null;
      }
      rt.info.task = null;
      if (rt.taskQueue.length > 0) {
        this.drainQueue(rt);
      }
      return;
    }

    const abort = new AbortController();
    rt.abort = abort;

    // Abort the task if no events arrive for 90s — the model is hung or rate-limited.
    // The timer resets on every event, so long tasks with active output are fine.
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const idleAbort = () => {
      if (!abort.signal.aborted) {
        abortReason = `No response from model for ${TASK_IDLE_TIMEOUT_MS / 1000}s — aborted (possible rate limit or API hang).`;
        abort.abort();
        this.log(rt, "error", abortReason);
      }
    };
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(idleAbort, TASK_IDLE_TIMEOUT_MS);
    };
    resetIdleTimer();

    const runner: ProviderRunner = pickRunner(rt.info.model);
    const slug = this.slugFor(rt);
    let systemPrompt = this.buildSystemPrompt(rt);
    // Inject memory summary for fresh-start tasks so the agent has long-term context
    // without carrying the full prior conversation.
    if (rt.freshStart && rt.memorySummary) {
      systemPrompt = `${systemPrompt}\n\n${rt.memorySummary}`;
    }
    const isManager = rt.info.role === "manager";

    // ── Inject unread inbox messages into the prompt ──
    let promptPrefix = "";
    try {
      const { readFile, unlink } = await import("node:fs/promises");
      const inboxPath = join(this.cwdFor(slug, rt.info.id), "inbox.jsonl");
      const content = await readFile(inboxPath, "utf-8").catch(() => "");
      if (content.trim()) {
        const msgs = content.trim().split("\n").filter(Boolean).map((l) => {
          try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean) as { ts: number; from: string; message: string }[];
        if (msgs.length > 0) {
          promptPrefix = `You have ${msgs.length} message(s) from colleagues:\n` +
            msgs.map((m) => `From ${m.from}: ${m.message}`).join("\n") +
            "\n\nKeep these in mind as you work on your task.\n\n";
          await unlink(inboxPath).catch(() => {});
        }
      }
    } catch { /* ignore inbox errors */ }

    // Managers get the planning brief instead of the raw task — UNLESS this is
    // a review/assessment task (from notifyManagersOfCompletion or onPostMessage),
    // which the manager should process directly rather than delegate.
    const isReviewTask = isManager && (/\b(failed|completed) their task\b[\s\S]*\bReview\b|sent you a message[\s\S]*\bReview\b/i).test(task);
    const resumePrefix = isResume
      ? "You were interrupted mid-task by a server restart. Your previous conversation history has been restored. Continue where you left off — do NOT redo work you already completed. Here is your original task:\n\n"
      : "";
    const prompt = promptPrefix + resumePrefix + (isManager && !isReviewTask ? this.managerBrief(task, rt) : task);

    let sawError = false;
    let gotEvents = false;
    let firstErrorText = "";
    let finalText = "";
    let abortReason = ""; // set when system-initiated abort fires (loop, budget, idle)
    const hadSession = rt.info.sessionId != null;
    let shouldRetry = false; // set when stale session error triggers a one-time retry
    try {
      const events = runner(prompt, {
        cwd: this.cwdFor(slug, rt.info.id),
        sharedCwd: join(this.workspaceRoot, "shared"),
        model: rt.info.model,
        systemPrompt,
        abort,
        settings: this.settings,
        agentId: rt.info.id,
        sessionId: rt.info.sessionId ?? null,
        freshStart: rt.freshStart,
        onSession: (id) => {
          if (rt.info.sessionId !== id) {
            rt.info.sessionId = id;
            this.persist();
          }
        },
        railway: this.settings.railway.enabled && rt.info.role === "devops",
        apiKey: this.apiKey,
        mcpServers: [
          ...(await this.injectMcpKeys(rt.info.mcpServers) ?? []),
          ...getServerConfigs(this.userId),
        ],
        cdpSolana: rt.info.cdpSolana ?? false,
        crossmintWallet: rt.info.crossmintWallet ?? false,
        circleServices: rt.info.circleServices,
        subscriptionTier: this.subscriptionTier,
        userId: this.userId,
        wizardGithubPat: rt.info.id === WIZARD_ID ? process.env.WIZARD_GITHUB_PAT : undefined,
        wizardBranch: rt.info.id === WIZARD_ID ? (process.env.WIZARD_BRANCH ?? "main") : undefined,
        onBroadcastHtml: (filePath: string) => {
          const htmlPath = `/api/agent-workspace/${rt.info.id}/${filePath}`;
          this.broadcast({ type: "projector_state", channel: "html" });
          this.broadcast({ type: "agent_broadcast_html_state", agentId: rt.info.id, url: htmlPath });
          this.broadcast({ type: "agent_broadcast_state", agentId: null });
        },
        officeState: this.officeState,
        agentName: rt.info.name,
        getBoard: () => [...this.board.values()].map((c) => ({ id: c.id, title: c.title, status: c.status, assignedAgentId: c.assignedAgentId, category: c.category })),
        claimCard: (cardId: string, agentId: string) => {
          const card = this.board.get(cardId);
          if (!card || card.status !== "backlog" || card.assignedAgentId) return false;
          if (card.lockedBy && card.lockedBy !== agentId) return false;
          const claimer = this.agents.get(agentId);
          if (claimer && !this.agentCanHandleCard(claimer, card)) return false;
          card.assignedAgentId = agentId;
          card.lockedBy = agentId;
          card.status = "in_progress";
          card.statusChangedAt = Date.now();
          this.persistBoard();
          this.broadcast({ type: "card", card });
          return true;
        },
        eventFeedPath: join(this.workspaceRoot, "events.jsonl"),
        saveMessages: (agentId: string, messages: unknown[]) => this.save.saveMessages(agentId, messages),
        loadMessages: (agentId: string) => this.save.loadMessages(agentId),
        clearMessages: (agentId: string) => this.save.clearMessages(agentId),
        onPostMessage: (recipientFolder: string, fromFolder: string, message: string): string => {
          const target = this.agentByFolder(recipientFolder);
          if (!target) return `Recipient "${recipientFolder}" not found in the office. Check your colleagues' folder names in the roster above.`;
          const sender = this.agentByFolder(fromFolder);
          const senderName = sender?.info.name ?? fromFolder;
          const cleanMessage = stripNestedTaskText(message, 500);
          const reviewTask = `${senderName} sent you a message. Review it and respond if needed:\n\n"${cleanMessage}"`;
          if (target.info.status === "thinking" || target.info.status === "working" || target.info.status === "waiting") {
            this.assign(target.info.id, reviewTask);
            return `Message queued for ${target.info.name} — they're currently busy and will process your message when they finish their current task.`;
          }
          this.assign(target.info.id, reviewTask);
          return `Message delivered to ${target.info.name} — they've been assigned a task to review and respond.`;
        },
        onApiError: (type, details) => this.notifyApiError(rt, type, details),
        createSelfSchedule: (name: string, task: string, cronExpression: string) => {
          return this.createSchedule(rt.info.id, name, task, cronExpression);
        },
        listSelfSchedules: () => {
          return this.listSchedulesForAgent(rt.info.id).map((s) => ({
            id: s.id, name: s.name, task: s.task, cronExpression: s.cronExpression,
            enabled: s.enabled, nextRunAt: s.nextRunAt, runCount: s.runCount, lastRunAt: s.lastRunAt,
          }));
        },
        updateSelfSchedule: (scheduleId: string, updates: { enabled?: boolean; name?: string; task?: string; cronExpression?: string }) => {
          const sched = this.schedules.get(scheduleId);
          if (!sched || sched.agentId !== rt.info.id) return "Schedule not found or does not belong to you.";
          return this.updateSchedule(scheduleId, updates);
        },
        deleteSelfSchedule: (scheduleId: string) => {
          const sched = this.schedules.get(scheduleId);
          if (!sched || sched.agentId !== rt.info.id) return "Schedule not found or does not belong to you.";
          return this.deleteSchedule(scheduleId);
        },
        hireAgent: rt.info.id === OFFICE_MANAGER_ID
          ? async (name: string, model: string, systemPrompt: string) => {
              // Respect agent limit (exclude permanent NPCs)
              if (this.agentLimit > 0 && this.hireableAgentCount >= this.agentLimit) {
                this.log(rt, "status", `Tried to hire ${name} but agent limit reached (${this.hireableAgentCount}/${this.agentLimit}).`);
                this.broadcast({ type: "payment_required", reason: "agent_limit", message: `Agent limit reached (${this.agentLimit}). Upgrade to hire more.`, agentLimit: this.agentLimit });
                return "";
              }
              const skills = this.inferSkillsFromPrompt(systemPrompt);
              return this.hireAgent(name, model, systemPrompt, undefined, undefined, undefined, undefined, undefined, skills);
            }
          : undefined,
        delegateTask: rt.info.role === "devops"
          ? (agentName: string, task: string) => this.delegateTaskToAgent(rt, agentName, task)
          : undefined,
        requestHire: rt.info.role === "devops"
          ? (skillArea: string, reason: string) => this.requestHireFromOfficeManager(rt, skillArea, reason)
          : undefined,
        registerMcpServer: async (opts: { name: string; description: string; runtime: "node" | "python"; entryFile: string }) => {
          const workspaceDir = this.cwdFor(slug, rt.info.id);
          const server = await registerServer(this.userId, {
            ...opts,
            builtBy: rt.info.id,
            builtByName: rt.info.name,
            workspaceDir,
          }, this.broadcast.bind(this));
          this.log(rt, "status", `Forged MCP server '${server.name}' with ${server.tools.length} tool(s): ${server.tools.map(t => t.name).join(", ")}`);
          return { id: server.id, tools: server.tools };
        },
        listOfficeMcp: () => listServers(this.userId).map(s => ({
          id: s.id, name: s.name, description: s.description,
          tools: s.tools, builtByName: s.builtByName, status: s.status,
        })),
        onUsage: (usage) => {
          const providerConfig = getProviderConfig();
          void recordUsage({
            userId: this.userId,
            agentId: rt.info.id,
            agentName: rt.info.name,
            model: resolveModel(rt.info.model, providerConfig.name),
            provider: providerConfig.name,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cacheReadTokens: usage.cacheReadTokens,
            cacheWriteTokens: usage.cacheWriteTokens,
            totalCost: usage.totalCost,
            task: task.slice(0, 500),
            isChat: false,
          });
        },
        requestGate: (question: string, options: string[], freeText = false): Promise<string> => {
          return new Promise((resolve) => {
            const gateId = randomUUID();
            const userConnected = this.isUserConnectedFn();
            this.broadcast({ type: "agent_gate", gateId, agentId: rt.info.id, agentName: rt.info.name, question, options, freeText });
            this.log(rt, "status", `Asked the boss: "${question}"${freeText ? " (free-text)" : ` (options: ${options.join(", ")})`}`);

            // If user is not in the office, forward the gate through outbound channels
            if (!userConnected) {
              const platformCtx = rt.platformContext;
              if (platformCtx && this.hermesClient) {
                // Task came from a messaging platform — send gate question there
                if (freeText) {
                  const gateMsg = `❓ ${rt.info.name} needs your input:\n\n${question}\n\nReply with your answer.`;
                  this.hermesClient.sendMessage(platformCtx.platform, platformCtx.sender, gateMsg).then((ok) => {
                    if (ok) this.log(rt, "status", `Gate question sent to ${platformCtx.sender} via ${platformCtx.platform}`);
                    else this.log(rt, "status", `Failed to send gate via ${platformCtx.platform} — will auto-resolve on timeout`);
                  }).catch(() => {
                    this.log(rt, "status", `Failed to send gate via ${platformCtx.platform} — will auto-resolve on timeout`);
                  });
                } else {
                  const optionList = options.map((o, i) => `${i + 1}. ${o}`).join("\n");
                  const gateMsg = `❓ ${rt.info.name} needs your decision:\n\n${question}\n\nReply with a number:\n${optionList}`;
                  this.hermesClient.sendMessage(platformCtx.platform, platformCtx.sender, gateMsg).then((ok) => {
                    if (ok) this.log(rt, "status", `Gate question sent to ${platformCtx.sender} via ${platformCtx.platform}`);
                    else this.log(rt, "status", `Failed to send gate via ${platformCtx.platform} — will auto-resolve on timeout`);
                  }).catch(() => {
                    this.log(rt, "status", `Failed to send gate via ${platformCtx.platform} — will auto-resolve on timeout`);
                  });
                }
              }
              // No platform context: let the auto-resolve timeout handle it
            }

            // Auto-resolve: 5 min if user is connected (in-game popup), 30 min for outbound
            const timeoutMs = userConnected ? 5 * 60 * 1000 : 30 * 60 * 1000;
            const defaultAnswer = freeText ? "" : (options[0] ?? "");
            const timer = setTimeout(() => {
              if (rt.pendingGate?.id === gateId) {
                rt.pendingGate = null;
                const mins = Math.round(timeoutMs / 60000);
                this.log(rt, "status", `Boss didn't respond in ${mins} minutes — proceeding with "${defaultAnswer || "best judgment"}".`);
                this.broadcast({ type: "toast", text: `${rt.info.name} waited ${mins}min and proceeded with "${defaultAnswer || "best judgment"}".` });
                resolve(defaultAnswer);
              }
            }, timeoutMs);
            rt.pendingGate = { id: gateId, resolve, timer, options };
          });
        },
      });

      // Track tool calls to detect redundant loops and budget exhaustion
      const toolCallCounts = new Map<string, number>(); // exact signature → count
      const perToolCounts = new Map<string, number>(); // tool name only → count
      let mcpToolCallTotal = 0;

      for await (const ev of events) {
        if (abort.signal.aborted) return;
        resetIdleTimer();
        if (ev.kind === "heartbeat") continue; // reset idle timer only — no logging, no tracking
        if (rt.info.status === "thinking") this.setStatus(rt, "working");
        console.log(`[manager:${rt.info.id}] event: kind=${ev.kind} text=${ev.text?.slice(0, 100)}`);

        if (ev.kind === "error") {
          sawError = true;
          if (!firstErrorText) firstErrorText = ev.text;
          this.log(rt, "error", ev.text);
        } else {
          gotEvents = true;
          if (
            ev.kind === "text" ||
            (ev.kind === "result" && ev.text !== "✓ Task complete." && ev.text !== "Task complete.")
          ) {
            finalText = ev.text;
            // Broadcast decomposition text in real-time for the Office Manager
            if (isManager && !isReviewTask && ev.kind === "text") {
              this.broadcast({
                type: "manager_decomposing",
                agentId: rt.info.id,
                text: ev.text,
                goalCardId: rt.cardId ?? null,
              });
            }
          }
          this.log(rt, ev.kind, ev.text);

          // Detect tool-call budget exhaustion and redundant loops
          if (ev.kind === "tool") {
            const sig = ev.text; // tool name + truncated input
            const toolName = sig.split(" ")[0]; // just the tool name

            // Track exact-signature duplicates
            const count = (toolCallCounts.get(sig) ?? 0) + 1;
            toolCallCounts.set(sig, count);
            // Exempt safe read-only polling tools from exact-duplicate loop detection.
            // These tools take no (or minimal) input and legitimately need to be called
            // repeatedly while waiting for a colleague's reply or checking board state.
            const isPollingTool = ["read_messages", "read_board", "read_events"].includes(toolName);
            if (!isPollingTool && count >= MAX_DUPLICATE_TOOL_CALLS) {
              abortReason = `Aborted: tool call repeated ${count} times — possible loop. Call: ${sig.slice(0, 100)}`;
              this.log(rt, "error", abortReason);
              abort.abort();
              return;
            }
            // Warn before the hard abort threshold so the user has visibility
            if (!isPollingTool && count === MAX_DUPLICATE_TOOL_CALLS - 1) {
              this.log(rt, "status", `⚠ Repeated tool call detected (${count}x): ${sig.slice(0, 80)}. One more repeat will abort the task.`);
            }

            // Track per-tool call counts (catches varied-input loops like calling get_file_contents on 15 different paths)
            const toolCount = (perToolCounts.get(toolName) ?? 0) + 1;
            perToolCounts.set(toolName, toolCount);
            // Polling tools get a higher budget since they legitimately need repeated calls
            const toolLimit = isPollingTool ? 20 : MAX_CALLS_PER_TOOL;
            if (toolCount >= toolLimit) {
              abortReason = `Aborted: tool "${toolName}" called ${toolCount} times — budget exhausted for this tool.`;
              this.log(rt, "error", abortReason);
              abort.abort();
              return;
            }

            // Track total MCP-originated tool calls (tools from MCP servers, not built-in tools)
            // MCP tools are prefixed with server label (e.g. "github__list_issues") or are non-standard tool names
            const isMcpTool = toolName.includes("__") || ![
              "read_files", "write_files", "list_files", "bash", "submit_and_exit",
              "read_shared", "write_shared", "list_shared", "post_message", "read_messages",
              "wait_for_reply",
              "browse_url", "browser_screenshot", "browser_extract_text", "browser_click",
              "browser_fill", "read_board", "claim_card", "append_event",
              "create_schedule", "list_schedules", "update_schedule", "delete_schedule",
              "hire_agent", "read_events",
              "delegate_task", "request_hire",
            ].includes(toolName);
            if (isMcpTool) {
              mcpToolCallTotal++;
              if (mcpToolCallTotal >= MAX_MCP_TOOL_CALLS) {
                abortReason = `Aborted: ${mcpToolCallTotal} MCP tool calls in one task — API budget exhausted. Use bash (git clone) instead of individual API calls.`;
                this.log(rt, "error", abortReason);
                abort.abort();
                return;
              }
            }
          }
        }
      }

      // a stale or corrupted conversation shouldn't brick the agent forever
      const isStaleSessionError = /session|resume|conversation|thread|tool_call_id|invalid.*request/i.test(firstErrorText);
      const isToolCallIdError = /tool_call_id.*not.*found|Messages with role.*tool.*must be a response|tool.*must be a response to a preceding message with.*tool_calls/i.test(firstErrorText);
      const isTokenLimitError = /token.*limit|exceeded.*limit/i.test(firstErrorText);
      // tool_call_id / orphaned tool message errors can occur mid-conversation (after valid events)
      // when compaction or restore leaves orphaned tool_result blocks.  Allow retry for these even
      // when gotEvents is true — the corrupted state is cleared.
      const canRetryStale = (isStaleSessionError && !gotEvents) || isToolCallIdError;
      if (sawError && hadSession && (canRetryStale || isTokenLimitError)) {
        rt.info.sessionId = null;
        clearAllMemory(rt.info.id);
        void this.save.clearMessages(rt.info.id);
        this.persist();
        // Retry once with a fresh session for stale session / tool_call_id errors (not token limit)
        if (canRetryStale && !rt.retryAttempted) {
          rt.retryAttempted = true;
          rt.freshStart = true;
          shouldRetry = true;
          this.log(rt, "status", isToolCallIdError
            ? "Corrupted tool_call_id detected — retrying with a fresh conversation."
            : "Stale session detected — retrying with a fresh conversation.");
        } else {
          this.log(rt, "status", isTokenLimitError
            ? "Context window exceeded — starting a fresh conversation next task (previous conversation archived)."
            : "Couldn't resume memory — starting a fresh conversation next task.");
        }
      }

      if (!sawError && !abort.signal.aborted) {
        if (isManager && !isReviewTask) this.delegate(rt, task, finalText);
        this.completeHandoff(rt, task, finalText);
        // If this task has a waitFor target, walk to their desk and wait.
        // For Flow 2 (handoff + wait), completeHandoff already set notifyOnComplete on the target.
        // For Flow 4 (just wait, no handoff), startWaiting sets it directly.
        if (rt.waitFor) this.startWaiting(rt, rt.waitFor);
        if (isManager && isReviewTask && rt.reviewContext) this.processReviewVerdict(rt, finalText);
        // Don't notify managers when a manager completes a review — the verdict is already
        // handled by processReviewVerdict above. Notifying would create a recursive
        // review-of-review chain that loops indefinitely.
        if (!(isManager && isReviewTask)) {
          // If review-before-handoff is enabled and the handoff was gated,
          // completeHandoff already called notifyManagersOfCompletion — skip the duplicate.
          // Also skip if this is a V-model card — the finally block will notify
          // managers with the V-model-specific "pending verification review" message.
          const vmCard = rt.cardId ? this.board.get(rt.cardId) : null;
          const isVModel = vmCard?.phase && vmCard.phase !== "done";
          if (!this.pendingHandoffs.has(rt.info.id) && !isVModel) {
            this.notifyManagersOfCompletion(rt, task, finalText, false);
          }
        }
        // Release any agent that was waiting for this task to finish.
        if (rt.notifyOnComplete) this.releaseWaitingAgent(rt.notifyOnComplete);
        this.logEvent("task_complete", `${rt.info.name} completed: "${task.slice(0, 100)}"`);
        if (this.userId) void ProfileManager.ingestTaskComplete(this.userId, task).catch(() => {});

        // If this task came from a messaging platform, send the result back
        if (rt.platformContext && finalText) {
          const { platform, sender } = rt.platformContext;
          const replyText = finalText.slice(0, 1000);
          console.log(`[manager] Sending platform reply to ${sender} via ${platform}`);
          this.emitPlatformEvent(platform, "outbound", rt.info.name, replyText);
          if (this.hermesClient) {
            this.hermesClient.sendMessage(platform, sender, replyText).then((ok) => {
              if (ok) console.log(`[manager] Platform reply sent to ${sender} via ${platform}`);
              else console.warn(`[manager] Platform reply failed for ${sender} via ${platform}`);
            }).catch((err) => console.warn(`[manager] Platform reply error: ${err}`));
            // Send a narrated office screenshot showing the completed task
            this.sendNarratedScreenshot(platform, sender, {
              agentName: rt.info.name,
              task: task,
              event: "task_completed",
              roster: this.getNarrationRoster(),
              agentOutput: finalText,
              elapsedMs: Date.now() - rt.taskStartedAt,
            }).catch(() => {});
          }
          this.proactiveLastSent.delete(`${platform}:${sender}`);
          this.platformAssignedAgent.delete(platform);
          this.broadcastMailboxUpdate(platform);
          rt.platformContext = null;
        } else if (!rt.platformContext) {
          // Task was NOT initiated from a platform — notify connected platform if user is away
          void this.notifyConnectedPlatform(rt, task, finalText);
        }
      } else if (sawError && !abort.signal.aborted) {
        this.notifyManagersOfCompletion(rt, task, "Task failed.", true);
        this.logEvent("task_error", `${rt.info.name} failed: "${task.slice(0, 100)}" — ${firstErrorText.slice(0, 100)}`);
        // Release any agent that was waiting for this task, even on failure.
        if (rt.notifyOnComplete) this.releaseWaitingAgent(rt.notifyOnComplete);
        // Send error reply to platform user so they're not left in silence
        if (rt.platformContext) {
          const { platform, sender } = rt.platformContext;
          const errorReply = `${rt.info.name} ran into an issue and couldn't complete the task. Someone will follow up shortly.`;
          console.log(`[manager] Sending error reply to ${sender} via ${platform}`);
          this.emitPlatformEvent(platform, "outbound", rt.info.name, errorReply);
          if (this.hermesClient) {
            this.hermesClient.sendMessage(platform, sender, errorReply).catch((err) =>
              console.warn(`[manager] Error reply failed: ${err}`)
            );
          }
          this.proactiveLastSent.delete(`${platform}:${sender}`);
          this.platformAssignedAgent.delete(platform);
          this.broadcastMailboxUpdate(platform);
          rt.platformContext = null;
        }
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        sawError = true;
        this.log(rt, "error", err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      // Clean up any pending decision gate
      if (rt.pendingGate) {
        clearTimeout(rt.pendingGate.timer);
        rt.pendingGate.resolve("Task was aborted — use your best judgment.");
        rt.pendingGate = null;
      }
      console.log(`[manager:${rt.info.id}] finally: sawError=${sawError} aborted=${abort.signal.aborted} exists=${this.agents.has(rt.info.id)}`);
      rt.abort = null;
      // Clear platform context if the task was aborted (already cleared on success above)
      if (abort.signal.aborted) rt.platformContext = null;
      // During shutdown, preserve handoffTo and task info so the persisted
      // pending tasks retain the full handoff chain for resumption.
      if (!this.shuttingDown) {
        rt.handoffTo = null;
        rt.notifyOnComplete = null;
        rt.waitFor = null;
      }
      // Reset fresh-start flags — the next task defaults to continuing the conversation
      rt.freshStart = false;
      rt.memorySummary = null;
      if (!abort.signal.aborted && this.agents.has(rt.info.id)) {
        const duration = Date.now() - rt.taskStartedAt;
        if (shouldRetry) {
          // Stale session retry — don't record as failure, just re-invoke with fresh session.
          // retryAttempted stays true so the retry invocation won't retry again.
          this.setStatus(rt, "working");
          void this.runTask(rt, task, false);
        } else if (sawError) {
          rt.taskHistory.unshift({ task, success: false, ts: Date.now(), durationMs: duration });
          if (rt.taskHistory.length > 20) rt.taskHistory.pop();
          this.updateAgentSkillPerformance(rt, task, false, duration);
          if (this.onTaskComplete) this.onTaskComplete(rt.info.id, false, duration / 60000, rt.cardId ? "card" : "general");
          // Auto-record task failure in the office state graph
          this.officeState.addNode("task", task.slice(0, 200), rt.info.id, rt.info.name, "failed");
          this.setStatus(rt, "error");
          if (rt.cardId) this.revertCard(rt.cardId);
          rt.cardId = null;
          this.updateScheduleResult(rt, false);
          rt.doneTimer = setTimeout(() => {
            rt.info.task = null;
            if (rt.taskQueue.length > 0) {
              this.drainQueue(rt);
            } else {
              this.setStatus(rt, "idle");
              this.persist();
            }
          }, DONE_LINGER_MS);
        } else {
          rt.info.tasksDone += 1;
          rt.taskHistory.unshift({ task, success: true, ts: Date.now(), durationMs: duration });
          if (rt.taskHistory.length > 20) rt.taskHistory.pop();
          this.updateAgentSkillPerformance(rt, task, true, duration);
          if (this.onTaskComplete) this.onTaskComplete(rt.info.id, true, duration / 60000, rt.cardId ? "card" : "general");
          // Breakthrough detection
          this.checkBreakthrough(rt, task, duration);
          // Auto-record task completion in the office state graph
          this.officeState.addNode("task", task.slice(0, 200), rt.info.id, rt.info.name, "done");
          this.setStatus(rt, "done");
          if (rt.cardId) {
            const card = this.board.get(rt.cardId);
            if (card && card.phase && card.phase !== "done") {
              // V-model: transition to verification phase instead of done
              card.phase = "verification";
              card.status = "review_pending";
              card.assignedAgentId = null;
              card.lockedBy = null;
              card.statusChangedAt = Date.now();
              if (card.startedAt) {
                card.actualMinutes = Math.round((Date.now() - card.startedAt) / 60000);
              }
              this.persistBoard();
              this.broadcast({ type: "card", card });
              this.broadcastGanttUpdate();
              // Notify managers for review
              this.notifyManagersOfCompletion(rt, task, "Task complete — pending verification review.", false);
            } else {
              this.completeCard(rt.cardId);
            }
            // Check if all subtasks of a parent goal are complete (merge node)
            if (card?.parentGoalId) {
              this.checkGoalCompletion(card.parentGoalId);
            }
            // If this was a merge/review card, mark the parent goal as done
            if (card?.type === "review" && card.parentGoalId) {
              const goalCard = this.board.get(card.parentGoalId);
              if (goalCard && goalCard.type === "goal" && goalCard.status !== "done") {
                goalCard.status = "done";
                goalCard.statusChangedAt = Date.now();
                this.persistBoard();
                this.broadcast({ type: "card", card: goalCard });
                this.broadcastGanttUpdate();
                this.broadcast({ type: "toast", text: `Goal complete: "${goalCard.title.slice(0, 60)}"` });
              }
            }
            // Auto-assign dependent cards whose dependencies are now satisfied
            if (rt.cardId || card) {
              const completedCardId = rt.cardId ?? card?.id;
              if (completedCardId) {
                const dependentCards = [...this.board.values()]
                  .filter(c => c.dependsOnCardIds?.includes(completedCardId) && c.status === "backlog" && !c.assignedAgentId);
                for (const depCard of dependentCards) {
                  if (this.canStartCard(depCard)) {
                    // If the completing agent is now idle, assign to them
                    if (rt.info.status === "idle") {
                      this.log(rt, "status", `Auto-continuing to dependent task: "${depCard.title.slice(0, 60)}"`);
                      this.assignCard(depCard.id, rt.info.id);
                      break;
                    }
                  }
                }
              }
            }
          }
          rt.cardId = null;
          this.updateScheduleResult(rt, true);
          if (rt.taskQueue.length > 0 && !this.shuttingDown) {
            this.drainQueue(rt);
          } else {
            rt.doneTimer = setTimeout(() => {
              rt.info.task = null;
              if (rt.taskQueue.length > 0) {
                this.drainQueue(rt);
              } else {
                this.setStatus(rt, "idle");
                this.persist();
              }
            }, DONE_LINGER_MS);
          }
        }
      } else if (abort.signal.aborted && this.agents.has(rt.info.id) && !this.shuttingDown) {
        // Aborted — either by stop() (user-initiated) or system-initiated (loop, budget, idle).
        // stop() already sets status to idle and clears the queue, so this branch
        // is a no-op in that case. For system-initiated aborts, the status is still
        // "working"/"thinking" and needs full error handling: notify managers, log
        // the failure, release waiting agents, and set status to "error".
        // During shutdown, prepareForShutdown handles state saving — skip cleanup
        // to avoid racing with the final persist().
        if (rt.info.status === "thinking" || rt.info.status === "working") {
          const duration = Date.now() - rt.taskStartedAt;
          const failReason = abortReason || "Task aborted (unknown reason).";

          // Auto-retry transient failures (rate limit, timeout, API hang) once before
          // involving the manager. This handles the common case where a rate limit
          // clears after a few minutes. If the retry also fails, it falls through
          // to normal error handling and the manager gets an enhanced prompt.
          if (isTransientFailure(failReason) && !rt.retryAttempted) {
            rt.retryAttempted = true;
            rt.freshStart = true;
            shouldRetry = true;
            this.log(rt, "status", `Transient failure detected (${failReason.slice(0, 80)}) — auto-retrying with a fresh conversation.`);
            // Skip manager notification, card revert, and error status — the retry will handle all of that
            if (rt.notifyOnComplete) this.releaseWaitingAgent(rt.notifyOnComplete);
            // Jump to the finally block's retry path (shouldRetry = true)
          } else {
            // Notify managers about the failure
            this.notifyManagersOfCompletion(rt, task, failReason, true);
            this.logEvent("task_error", `${rt.info.name} aborted: "${task.slice(0, 100)}" — ${failReason.slice(0, 100)}`);

          // Record in task history
          rt.taskHistory.unshift({ task, success: false, ts: Date.now(), durationMs: duration });
          if (rt.taskHistory.length > 20) rt.taskHistory.pop();

          // Release any agent that was waiting for this task
          if (rt.notifyOnComplete) this.releaseWaitingAgent(rt.notifyOnComplete);

          // Send failure reply if the task came from a messaging platform
          if (rt.platformContext) {
            const { platform, sender } = rt.platformContext;
            const replyText = `Task failed: ${failReason.slice(0, 500)}`;
            this.emitPlatformEvent(platform, "outbound", rt.info.name, replyText);
            if (this.hermesClient) {
              this.hermesClient.sendMessage(platform, sender, replyText).catch(() => {});
              // Send a narrated screenshot about the failure
              this.sendNarratedScreenshot(platform, sender, {
                agentName: rt.info.name,
                task: task,
                event: "task_failed",
                roster: this.getNarrationRoster(),
                failReason: failReason,
                elapsedMs: duration,
              }).catch(() => {});
            }
            this.proactiveLastSent.delete(`${platform}:${sender}`);
            this.platformAssignedAgent.delete(platform);
            this.broadcastMailboxUpdate(platform);
          }

          if (rt.cardId) {
            this.revertCard(rt.cardId);
            rt.cardId = null;
          }
          this.updateScheduleResult(rt, false);
          this.setStatus(rt, "error");
          rt.doneTimer = setTimeout(() => {
            rt.info.task = null;
            if (rt.taskQueue.length > 0) {
              this.drainQueue(rt);
            } else {
              this.setStatus(rt, "idle");
              this.persist();
            }
          }, DONE_LINGER_MS);
          }
        }
      }
      // Clear scheduleId after result tracking is done
      if (!this.shuttingDown) {
        rt.scheduleId = null;
      }
      // Reset retry flag for future tasks (the retry invocation has its own finally)
      if (!shouldRetry) rt.retryAttempted = false;
    }
  }

  /** Find an agent by name with fuzzy matching (exact, contains, reverse contains, Levenshtein). */
  private findAgentByName(name: string, excludeId: string): AgentRuntime | undefined {
    const lower = name.toLowerCase().trim();
    const candidates = [...this.agents.values()].filter(
      rt => rt.info.id !== excludeId && rt.info.role !== "manager",
    );
    // 1. Exact match
    let match = candidates.find(rt => rt.info.name.toLowerCase() === lower);
    if (match) return match;
    // 2. Contains match
    match = candidates.find(rt => rt.info.name.toLowerCase().includes(lower));
    if (match) return match;
    // 3. Reverse contains (LLM used a longer name)
    match = candidates.find(rt => lower.includes(rt.info.name.toLowerCase()));
    if (match) return match;
    // 4. Levenshtein distance <= 2
    match = candidates.find(rt => this.levenshtein(lower, rt.info.name.toLowerCase()) <= 2);
    return match;
  }

  /** Compute Levenshtein edit distance between two strings. */
  private levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const prev = new Array(b.length + 1);
    const curr = new Array(b.length + 1);
    for (let i = 0; i <= b.length; i++) prev[i] = i;
    for (let i = 0; i < a.length; i++) {
      curr[0] = i + 1;
      for (let j = 0; j < b.length; j++) {
        const cost = a[i] === b[j] ? 0 : 1;
        curr[j + 1] = Math.min(prev[j + 1] + 1, curr[j] + 1, prev[j] + cost);
      }
      for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
    }
    return prev[b.length];
  }

  /** Parse a manager's JSON plan and assign each subtask to a free worker. */
  private delegate(mgr: AgentRuntime, goal: string, planText: string): void {
    const start = planText.indexOf("[");
    const end = planText.lastIndexOf("]");
    if (start === -1 || end <= start) {
      this.log(mgr, "error", "No JSON plan found in the manager's reply — nothing delegated.");
      return;
    }
    let plan: unknown;
    try {
      plan = JSON.parse(planText.slice(start, end + 1));
    } catch {
      this.log(mgr, "error", "The plan wasn't valid JSON — nothing delegated.");
      return;
    }
    if (!Array.isArray(plan) || plan.length === 0) {
      this.log(mgr, "status", "No subtasks to delegate — everyone stays put.");
      return;
    }

    // Track which workers are being assigned in this round (for dependency resolution)
    const assigned = new Map<string, { agentId: string; cardId: string }>(); // workerName -> { agentId, cardId }
    let sent = 0;
    const deferred: { name: string; subtask: string; dependsOn: string }[] = [];
    const goalCardId = mgr.cardId;

    for (const item of plan) {
      const name = String((item as { name?: unknown })?.name ?? "").trim();
      const subtask = String((item as { task?: unknown })?.task ?? "").trim();
      const dependsOn = String((item as { dependsOn?: unknown })?.dependsOn ?? "").trim();
      if (!name || !subtask) continue;

      // If this task depends on another task in this round, defer it
      if (dependsOn && assigned.has(dependsOn.toLowerCase())) {
        deferred.push({ name, subtask, dependsOn });
        this.log(mgr, "status", `Deferred ${name}'s task — depends on ${dependsOn} completing first.`);
        continue;
      }

      const target = this.findAgentByName(name, mgr.info.id);
      if (!target) {
        this.log(mgr, "status", `Skipped a subtask for "${name}" — nobody by that name.`);
        this.broadcast({ type: "toast", text: `Office Manager tried to delegate to "${name}" but nobody by that name exists.` });
        continue;
      }

      const isBusy = target.info.status === "thinking" || target.info.status === "working" || target.info.status === "done" || target.info.status === "waiting";

      // Create a subtask card linked to the goal card with correct initial status
      const subtaskCard: TaskCard = {
        id: randomUUID().slice(0, 8),
        title: subtask.length > 80 ? subtask.slice(0, 77) + "…" : subtask,
        description: subtask,
        status: isBusy ? "paused" : "in_progress",
        assignedAgentId: target.info.id,
        lockedBy: isBusy ? undefined : target.info.id,
        createdAt: Date.now(),
        statusChangedAt: Date.now(),
        type: "task",
        parentGoalId: goalCardId ?? null,
        phase: "implementation",
        category: this.inferCategory(subtask),
      };
      // Auto-estimate duration from the target agent's historical performance
      const estimate = this.estimateTaskDuration(target, subtask);
      if (estimate) subtaskCard.estimatedMinutes = estimate;
      this.board.set(subtaskCard.id, subtaskCard);
      this.persistBoard();
      this.broadcast({ type: "card", card: subtaskCard });

      const taskText = `${subtask}\n\n(Delegated by ${mgr.info.name}, the office manager, toward the boss's goal: "${goal}")`;
      this.assign(target.info.id, taskText, undefined, subtaskCard.id);
      assigned.set(name.toLowerCase(), { agentId: target.info.id, cardId: subtaskCard.id });
      sent++;
    }

    // Queue deferred tasks — they'll be assigned after their dependency completes
    // via the completeHandoff mechanism (the prerequisite worker hands off to the dependent)
    for (const d of deferred) {
      const target = this.findAgentByName(d.name, mgr.info.id);
      const prereq = this.findAgentByName(d.dependsOn, mgr.info.id);
      if (target && prereq) {
        // Create a deferred subtask card with dependency link
        const prereqEntry = assigned.get(d.dependsOn.toLowerCase());
        const subtaskCard: TaskCard = {
          id: randomUUID().slice(0, 8),
          title: d.subtask.length > 80 ? d.subtask.slice(0, 77) + "…" : d.subtask,
          description: d.subtask,
          status: "backlog",
          assignedAgentId: null,
          createdAt: Date.now(),
          statusChangedAt: Date.now(),
          type: "task",
          parentGoalId: goalCardId ?? null,
          phase: "implementation",
          dependsOnCardIds: prereqEntry ? [prereqEntry.cardId] : undefined,
          category: this.inferCategory(d.subtask),
        };
        this.board.set(subtaskCard.id, subtaskCard);
        this.persistBoard();
        this.broadcast({ type: "card", card: subtaskCard });

        // Queue the dependent task on the target, with handoff from the prerequisite
        this.assign(
          target.info.id,
          `${d.subtask}\n\n(Delegated by ${mgr.info.name}, the office manager, toward the boss's goal: "${goal}")`,
          prereq.info.id,
          subtaskCard.id,
        );
        this.log(mgr, "status", `Queued ${d.name}'s task — will start after ${d.dependsOn} completes.`);
        sent++;
      } else {
        this.log(mgr, "status", `Couldn't queue deferred task for ${d.name} — missing worker or dependency.`);
      }
    }

    // Broadcast Gantt update with new cards and dependencies
    this.broadcastGanttUpdate();

    this.log(mgr, "status", `Delegated ${sent} subtask${sent === 1 ? "" : "s"}.`);
    if (sent > 0) {
      this.broadcast({
        type: "toast",
        text: `${mgr.info.name} delegated ${sent} subtask${sent === 1 ? "" : "s"}.`,
      });
    }
  }

  // ── Phase 2 helper methods: merge node, estimation, skill tracking ───────

  /** Check if all subtasks of a parent goal are complete (or in verification/done).
   *  If so, assign a merge/synthesis task to the Office Manager. */
  private checkGoalCompletion(goalCardId: string): void {
    const goalCard = this.board.get(goalCardId);
    if (!goalCard || goalCard.type !== "goal") return;
    // Find all subtask cards linked to this goal
    const subtasks = [...this.board.values()].filter((c) => c.parentGoalId === goalCardId);
    if (subtasks.length === 0) return;
    // Check if all subtasks are done or in review_pending (verification)
    const allComplete = subtasks.every((c) => c.status === "done" || c.status === "review_pending");
    if (!allComplete) return;
    // Don't trigger merge if the goal card is already done
    if (goalCard.status === "done") return;
    // Check if we've already assigned a merge task (avoid duplicates)
    const existingMerge = [...this.board.values()].find(
      (c) => c.parentGoalId === goalCardId && c.type === "review" && c.title.startsWith("Merge:"),
    );
    if (existingMerge) return;

    // Collect subtask results from task history
    const subtaskSummaries = subtasks.map((c) => {
      const agent = c.assignedAgentId ? this.agents.get(c.assignedAgentId) : null;
      return `- "${c.title}" — ${c.status}${agent ? ` (${agent.info.name})` : ""}`;
    }).join("\n");

    const officeManager = this.agents.get(OFFICE_MANAGER_ID);
    if (!officeManager) return;
    if (officeManager.info.status === "thinking" || officeManager.info.status === "working" || officeManager.info.status === "waiting") {
      this.log(officeManager, "status", `All subtasks for goal "${goalCard.title.slice(0, 60)}" are complete or in review — merge task queued but Office Manager is busy.`);
      return;
    }

    // Create a merge card
    const mergeCard: TaskCard = {
      id: randomUUID().slice(0, 8),
      title: `Merge: ${goalCard.title.slice(0, 60)}`,
      description: `All subtasks for the goal "${goalCard.title}" have completed or are in verification. Synthesize the results into a final deliverable.\n\nSubtask statuses:\n${subtaskSummaries}`,
      status: "in_progress",
      assignedAgentId: officeManager.info.id,
      lockedBy: officeManager.info.id,
      createdAt: Date.now(),
      statusChangedAt: Date.now(),
      type: "review",
      parentGoalId: goalCardId,
      phase: "verification",
    };
    this.board.set(mergeCard.id, mergeCard);
    this.persistBoard();
    this.broadcast({ type: "card", card: mergeCard });
    this.broadcastGanttUpdate();

    this.log(officeManager, "status", `All subtasks complete for "${goalCard.title.slice(0, 60)}" — starting merge/synthesis.`);
    this.broadcast({ type: "toast", text: `All subtasks complete — Office Manager is synthesizing results.` });

    const mergeTask = `All subtasks for the goal "${goalCard.title}" have completed or are in verification. Synthesize the results into a final deliverable. Review each subtask's output and produce a unified summary.\n\nSubtask statuses:\n${subtaskSummaries}`;
    this.startTask(officeManager, mergeTask, undefined, mergeCard.id, false);
  }

  /** Estimate task duration in minutes from the agent's task history.
   *  Returns null if insufficient data (< 3 similar tasks). */
  private estimateTaskDuration(rt: AgentRuntime, task: string): number | null {
    if (rt.taskHistory.length < 3) return null;
    // Find successful tasks with similar keywords
    const taskLower = task.toLowerCase();
    const keywords = taskLower.split(/\s+/).filter((w) => w.length > 4);
    if (keywords.length === 0) return null;
    const similar = rt.taskHistory.filter(
      (h) => h.success && h.durationMs > 0 &&
        keywords.some((kw) => h.task.toLowerCase().includes(kw)),
    );
    if (similar.length < 3) return null;
    // Use median duration
    const durations = similar.map((h) => h.durationMs / 60000).sort((a, b) => a - b);
    const mid = Math.floor(durations.length / 2);
    const median = durations.length % 2 === 0
      ? (durations[mid - 1] + durations[mid]) / 2
      : durations[mid];
    return Math.max(1, Math.round(median));
  }

  /** Update per-skill performance metrics on the agent based on task outcome. */
  private updateAgentSkillPerformance(rt: AgentRuntime, task: string, success: boolean, durationMs: number): void {
    const category = this.inferCategory(task);
    if (!rt.info.performanceBySkill) rt.info.performanceBySkill = {};
    const existing = rt.info.performanceBySkill[category] ?? { tasks: 0, successRate: 0, avgMinutes: 0 };
    const totalTasks = existing.tasks + 1;
    const totalSuccess = Math.round(existing.successRate * existing.tasks) + (success ? 1 : 0);
    const totalMinutes = existing.avgMinutes * existing.tasks + (durationMs / 60000);
    rt.info.performanceBySkill[category] = {
      tasks: totalTasks,
      successRate: totalSuccess / totalTasks,
      avgMinutes: Math.round(totalMinutes / totalTasks),
    };
    this.persist();
  }

  /** Process a manager's review verdict (APPROVED or NEEDS REWORK) and act on it. */
  private processReviewVerdict(mgr: AgentRuntime, reviewText: string): void {
    const ctx = mgr.reviewContext;
    if (!ctx) return;
    mgr.reviewContext = null;

    const target = this.agents.get(ctx.agentId);
    if (!target) {
      this.log(mgr, "status", `Review complete — ${ctx.agentName} no longer works here, can't act on verdict.`);
      return;
    }

    // Check for NEEDS REWORK first (APPROVED might appear in the body too)
    const reworkMatch = reviewText.match(/\bNEEDS?\s+REWORK\b[:\s]*([\s\S]*)/i);
    if (reworkMatch) {
      const feedback = reworkMatch[1].trim().slice(0, 500) || "No specific feedback provided.";
      target.reworkCount += 1;
      // Circuit breaker: track review depth on the card and auto-approve after MAX_REVIEW_CHAIN_DEPTH
      const card = ctx.cardId ? this.board.get(ctx.cardId) : null;
      const reviewDepth = (card?.reviewDepth ?? 0) + 1;
      if (card) {
        card.reviewDepth = reviewDepth;
        this.persistBoard();
      }
      if (reviewDepth > MAX_REVIEW_CHAIN_DEPTH) {
        this.log(mgr, "status", `Review chain depth ${reviewDepth} exceeded limit (${MAX_REVIEW_CHAIN_DEPTH}) — auto-approving ${ctx.agentName}'s work to break the loop.`);
        this.broadcast({ type: "toast", text: `⚠️ ${ctx.agentName}'s task auto-approved after ${reviewDepth} review cycles — breaking review loop.` });
        target.reworkCount = 0;
        if (ctx.cardId) {
          const c = this.board.get(ctx.cardId);
          if (c && (c.status === "backlog" || c.status === "review_pending")) {
            this.completeCard(ctx.cardId);
          }
        }
        this.releasePendingHandoff(ctx.agentId);
        return;
      }
      const reworkWarning = target.reworkCount >= MAX_REWORKS
        ? `\n\n⚠️ This is rework attempt #${target.reworkCount} — the maximum allowed. If this attempt fails, the task will be abandoned.`
        : `\n\n(Rework attempt #${target.reworkCount} of ${MAX_REWORKS}.)`;
      const reworkTask = `${ctx.agentName}, your work on the following task was reviewed by ${mgr.info.name} and needs revision:\n\nOriginal task: "${extractOriginalTask(ctx.originalTask).slice(0, 300)}"\n\nManager's feedback: ${feedback}\n\nPlease redo the task addressing this feedback.${reworkWarning}`;
      this.log(mgr, "status", `Review verdict: NEEDS REWORK — sending ${ctx.agentName} back with feedback (rework #${target.reworkCount}, chain depth ${reviewDepth}).`);
      this.broadcast({ type: "toast", text: `${mgr.info.name} requested rework from ${ctx.agentName}.` });
      // Discard any pending handoff — the rework will re-trigger it when complete
      this.pendingHandoffs.delete(ctx.agentId);
      // Reuse the original card so the rework doesn't create a new orphaned card
      this.assign(ctx.agentId, reworkTask, undefined, ctx.cardId ?? undefined);
      return;
    }

    if (/\bAPPROVED\b/i.test(reviewText)) {
      target.reworkCount = 0;
      this.log(mgr, "status", `Review verdict: APPROVED — ${ctx.agentName}'s work accepted.`);
      this.broadcast({ type: "toast", text: `${mgr.info.name} approved ${ctx.agentName}'s work.` });
      // Move the original card to done if it's still in backlog or review_pending
      if (ctx.cardId) {
        const card = this.board.get(ctx.cardId);
        if (card && (card.status === "backlog" || card.status === "review_pending")) {
          this.completeCard(ctx.cardId);
        }
      }
      // Post approval message to the original agent's inbox
      const slug = this.slugFor(target);
      const inboxPath = join(this.cwdFor(slug, ctx.agentId), "inbox.jsonl");
      const entry = JSON.stringify({
        ts: Date.now(),
        from: mgr.info.name,
        message: `Your work on "${ctx.originalTask.slice(0, 200)}" was reviewed and APPROVED. Nice job!`,
      }) + "\n";
      import("node:fs/promises").then(({ appendFile, mkdir }) => {
        mkdir(dirname(inboxPath), { recursive: true }).then(() =>
          appendFile(inboxPath, entry, "utf-8").catch(() => {}),
        );
      }).catch(() => {});
      // Release the pending handoff if one was gated
      this.releasePendingHandoff(ctx.agentId);
      return;
    }

    // No clear verdict — default to approved
    target.reworkCount = 0;
    this.log(mgr, "status", `Review complete — no explicit APPROVED/NEEDS REWORK verdict, defaulting to approved.`);
    // Move the original card to done if it's still in backlog or review_pending
    if (ctx.cardId) {
      const card = this.board.get(ctx.cardId);
      if (card && (card.status === "backlog" || card.status === "review_pending")) {
        this.completeCard(ctx.cardId);
      }
    }
    // Release the pending handoff if one was gated
    this.releasePendingHandoff(ctx.agentId);
  }

  /** Deliver a pending handoff that was gated for manager review. */
  private releasePendingHandoff(workerId: string): void {
    const pending = this.pendingHandoffs.get(workerId);
    if (!pending) return;
    this.pendingHandoffs.delete(workerId);
    const target = this.agents.get(pending.targetId);
    if (!target) {
      this.log({ info: { name: "System" } } as AgentRuntime, "status", `Pending handoff target no longer works here — discarding.`);
      return;
    }
    const worker = this.agents.get(workerId);
    if (!worker) return;
    this.log(worker, "status", `Manager approved — delivering handoff to ${target.info.name}.`);
    this.broadcast({ type: "toast", text: `Review approved — ${worker.info.name}'s handoff delivered to ${target.info.name}.` });
    this.deliverHandoff(worker, target, pending.task, pending.result);
    // If the worker was waiting for the target, release them now that the handoff is delivered
    if (pending.notifyId) this.releaseWaitingAgent(pending.notifyId);
  }

  /** Forward a finished task's result to the agent chosen at assign time.
   *  If waitFor is also set, the sender will be sent to "waiting" status separately
   *  by the caller (runTask finally block) via startWaiting(). */
  private completeHandoff(rt: AgentRuntime, task: string, result: string): void {
    const targetId = rt.handoffTo;
    rt.handoffTo = null;
    if (!targetId) return;
    const target = this.agents.get(targetId);
    if (!target) {
      this.log(rt, "status", "Handoff skipped — that agent no longer works here.");
      return;
    }

    // If review-before-handoff is enabled and a manager is available, gate the handoff
    // pending manager review. The result won't be delivered to the target until approved.
    if (this.settings.cline.reviewBeforeHandoff) {
      const managers = [...this.agents.values()].filter(
        (m) => m.info.role === "manager" && m.info.id !== rt.info.id,
      );
      if (managers.length > 0) {
        const notifyId = rt.waitFor ? rt.info.id : undefined;
        this.pendingHandoffs.set(rt.info.id, {
          targetId,
          task,
          result,
          cardId: rt.cardId,
          notifyId,
        });
        this.log(rt, "status", `Holding handoff to ${target.info.name} — waiting for manager review before delivery.`);
        this.broadcast({ type: "toast", text: `${rt.info.name}'s handoff to ${target.info.name} is pending manager review.` });
        // Trigger a manager review of this work (notifies all managers; first to review releases the handoff)
        this.notifyManagersOfCompletion(rt, task, result, false);
        return;
      }
      // No manager available — fall through to immediate handoff
      this.log(rt, "status", `No manager available for review — proceeding with direct handoff.`);
    }

    this.deliverHandoff(rt, target, task, result);
  }

  /** Deliver a handoff to the target agent immediately (no review gate). */
  private deliverHandoff(rt: AgentRuntime, target: AgentRuntime, task: string, result: string): void {
    const workerWs = this.cwdFor(this.slugFor(rt), rt.info.id);
    const isDevopsTarget = target.info.role === "devops";
    const handoffTask = [
      `${rt.info.name} finished a task and handed the result to you.`,
      `Their task was: ${stripNestedTaskText(task, 300)}`,
      result ? `Their report:\n${stripNestedTaskText(result, 500)}` : "",
      `Their workspace: ${workerWs}`,
      isDevopsTarget
        ? `You have read access to their workspace. If you need to deploy their code, you can deploy directly from ${workerWs} using your Railway tools or bash commands. Do not copy files unless necessary — deploy from their workspace path.`
        : `You may READ files from their workspace, but do your own work inside your own workspace. Review what they did and build on it.`,
    ]
      .filter(Boolean)
      .join("\n\n");
    this.log(rt, "status", `Handed the result to ${target.info.name}.`);
    this.broadcast({ type: "toast", text: `${rt.info.name} handed off to ${target.info.name}.` });
    // Assign the handoff task to the target (queued if they're busy).
    // If the sender is also waiting (waitFor), notifyOnComplete ensures they're released.
    const notifyId = rt.waitFor ? rt.info.id : undefined;
    this.assign(target.info.id, handoffTask, undefined, undefined, undefined, undefined, notifyId);
  }

  /** Send an agent to "waiting" status at the target agent's desk.
   *  Used for Flow 2 (handoff + wait) and Flow 4 (just wait, no handoff).
   *  For Flow 2, completeHandoff already set notifyOnComplete on the target via assign().
   *  For Flow 4, we set notifyOnComplete on the target's runtime directly. */
  private startWaiting(rt: AgentRuntime, targetId: string): void {
    const target = this.agents.get(targetId);
    if (!target) {
      this.log(rt, "status", "Can't wait — that agent no longer works here.");
      return;
    }
    rt.waitingFor = targetId;
    rt.info.waitingFor = targetId;
    rt.waitFor = null;
    // For Flow 4 (no handoff), set notifyOnComplete on the target directly.
    // For Flow 2, completeHandoff already set it via assign() — setting it again is harmless.
    if (!target.notifyOnComplete) {
      target.notifyOnComplete = rt.info.id;
    }
    this.log(rt, "status", `Heading to ${target.info.name}'s desk to wait.`);
    this.setStatus(rt, "waiting");
  }

  /** Release an agent from "waiting" status after the agent they were waiting for finishes. */
  private releaseWaitingAgent(waiterId: string): void {
    const waiter = this.agents.get(waiterId);
    if (!waiter || waiter.info.status !== "waiting") return;
    waiter.waitingFor = null;
    waiter.info.waitingFor = null;
    this.log(waiter, "status", `The agent I was waiting for finished — heading back.`);
    this.setStatus(waiter, "done");
    waiter.doneTimer = setTimeout(() => {
      waiter.info.task = null;
      if (waiter.taskQueue.length > 0) {
        this.drainQueue(waiter);
      } else {
        this.setStatus(waiter, "idle");
        this.persist();
      }
    }, DONE_LINGER_MS);
  }

  /** Notify any manager agents about a worker's task completion/failure. */
  private notifyManagersOfCompletion(rt: AgentRuntime, task: string, result: string, failed: boolean): void {
    const managers = [...this.agents.values()].filter(
      (m) => m.info.role === "manager" && m.info.id !== rt.info.id,
    );
    for (const mgr of managers) {
      // Post a message to the manager's inbox
      const slug = this.slugFor(mgr);
      const mgrInbox = join(this.cwdFor(slug, mgr.info.id), "inbox.jsonl");
      const entry = JSON.stringify({
        ts: Date.now(),
        from: rt.info.name,
        message: failed
          ? `${rt.info.name} failed their task: "${stripNestedTaskText(task)}". Error: ${result.slice(0, 200)}`
          : `${rt.info.name} completed their task: "${stripNestedTaskText(task)}". Result: ${result.slice(0, 200)}`,
      }) + "\n";
      import("node:fs/promises").then(({ appendFile, mkdir }) => {
        mkdir(dirname(mgrInbox), { recursive: true }).then(() =>
          appendFile(mgrInbox, entry, "utf-8").catch(() => {}),
        );
      }).catch(() => {});

      // If the manager is idle, assign them a task to review the completion report
      if (mgr.info.status !== "thinking" && mgr.info.status !== "working" && mgr.info.status !== "waiting") {
        let reviewTask: string;
        if (failed) {
          const transient = isTransientFailure(result);
          const reworkNote = isReworkTask(task)
            ? ` Note: This was a rework attempt (the original work was previously deemed insufficient). Rework attempt #${rt.reworkCount} of ${MAX_REWORKS}.`
            : "";
          if (transient) {
            reviewTask = `${rt.info.name} failed their task: "${stripNestedTaskText(task)}". The failure was due to a transient issue: ${result.slice(0, 200)}. The task was NOT completed.${reworkNote} Use NEEDS REWORK with "Retry the same task — the previous attempt failed due to a transient issue (rate limit/timeout)." unless you intentionally want to abandon this task. Use APPROVED only if you want to accept the failure and stop retrying.`;
          } else {
            reviewTask = `${rt.info.name} failed their task: "${stripNestedTaskText(task)}". Error: ${result.slice(0, 200)}.${reworkNote} Review the situation and decide if any action is needed. Use APPROVED only if the failure is acceptable and no further work is needed. Use NEEDS REWORK: <specific feedback for the agent> if the agent should retry with your feedback. A failed task means the work was NOT done — approving it means accepting incomplete work.`;
          }
        } else {
          reviewTask = `${rt.info.name} completed their task: "${stripNestedTaskText(task)}". Result: ${result.slice(0, 200)}. Review their work and decide if any follow-up is needed. End your response with either APPROVED (if the work is acceptable) or NEEDS REWORK: <specific feedback for the agent> (if the agent should retry with your feedback).`;
        }
        this.assign(mgr.info.id, reviewTask, undefined, undefined, undefined, { agentId: rt.info.id, agentName: rt.info.name, originalTask: stripNestedTaskText(task, 300), cardId: rt.cardId });
      }
    }

    // Also notify Hermes (devops) via inbox so he has office awareness, but don't assign a review task
    if (rt.info.id !== HERMES_ID) {
      const hermes = this.agents.get(HERMES_ID);
      if (hermes) {
        const slug = this.slugFor(hermes);
        const hermesInbox = join(this.cwdFor(slug, HERMES_ID), "inbox.jsonl");
        const entry = JSON.stringify({
          ts: Date.now(),
          from: rt.info.name,
          message: failed
            ? `${rt.info.name} failed their task: "${task.slice(0, 200)}". Error: ${result.slice(0, 200)}`
            : `${rt.info.name} completed their task: "${task.slice(0, 200)}". Result: ${result.slice(0, 300)}`,
        }) + "\n";
        import("node:fs/promises").then(({ appendFile, mkdir }) => {
          mkdir(dirname(hermesInbox), { recursive: true }).then(() =>
            appendFile(hermesInbox, entry, "utf-8").catch(() => {}),
          );
        }).catch(() => {});
      }
    }
  }

  /** The boss walks up for a quick word — same session, but not a work task. */
  chat(agentId: string, text: string): void {
    const rt = this.agents.get(agentId);
    if (!rt) return;
    const clean = text.trim().slice(0, 2000);
    if (!clean) return;
    // Wizard is a premium feature — require Pro or Business tier
    if (agentId === WIZARD_ID && this.subscriptionTier !== "pro" && this.subscriptionTier !== "business") {
      this.broadcast({
        type: "payment_required",
        reason: "subscription",
        message: "The Wizard is a premium world-builder. Upgrade to the Pro plan ($19.99/mo) or higher to chat with the Wizard and shape your worlds.",
        tier: this.subscriptionTier,
      });
      return;
    }
    if (rt.info.status === "thinking" || rt.info.status === "working") {
      this.broadcast({ type: "toast", text: `${rt.info.name} is heads-down right now.` });
      return;
    }
    if (rt.doneTimer) clearTimeout(rt.doneTimer);
    rt.doneTimer = null;
    rt.info.task = null;
    // Create a chat card so boss conversations are visible on the board
    const chatCardId = this.autoCardFor(agentId, `💬 ${clean.slice(0, 77)}`, "chat");
    rt.cardId = chatCardId;
    this.session.record("chat", { agentId: rt.info.id, agentName: rt.info.name, text: clean });
    this.log(rt, "boss", `${this.bossName}: ${clean}`);
    this.setStatus(rt, "thinking");
    void this.runChat(rt, clean);
  }

  private async runChat(rt: AgentRuntime, text: string): Promise<void> {
    if (rt.info.id === OFFICE_MANAGER_ID) {
      // Questions and knowledge queries → answer locally with enriched context
      if (isOfficeManagerQuestion(text)) {
        await this.runOfficeManagerKnowledgeChat(rt, text);
        return;
      }
      // Task commands → delegate via marketplace API
      void this.runOfficeManagerChat(rt, text);
      return;
    }
    // Check usage cap before chatting
    if (this.userId) {
      const cap = getUsageCap(this.subscriptionTier, this.entrancePaid);
      if (cap > 0) {
        const spend = await getMonthlySpend(this.userId);
        if (spend >= cap) {
          this.log(rt, "status", `⚠️ Monthly usage cap reached ($${spend.toFixed(2)} / $${cap}). Chat blocked.`);
          this.broadcast({
            type: "payment_required",
            reason: "usage_cap",
            message: `You've reached the $${cap.toFixed(2)}/month usage cap ($${spend.toFixed(2)} spent). Upgrade your plan to continue.`,
            monthlySpend: spend,
            usageCap: cap,
          });
          this.setStatus(rt, "idle");
          return;
        }
      }
    }
    await this.runClineChat(rt, text);
  }

  private async runClineChat(rt: AgentRuntime, text: string): Promise<void> {
    const abort = new AbortController();
    rt.abort = abort;

    // If no events arrive within 30s, the API call likely failed. Do a quick
    // health check to give a specific error (rate limit vs auth vs API down).
    let firstEventTimer: ReturnType<typeof setTimeout> | null = null;
    let gotFirstEvent = false;
    const firstEventTimeout = setTimeout(async () => {
      if (abort.signal.aborted || gotFirstEvent) return;
      // Quick API check — 5s timeout to not block too long
      let reason = "No response from model within 30s";
      try {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), 5000);
        const pc = getProviderConfig();
        const res = await fetch(`${pc.baseUrl}/models`, {
          signal: controller.signal,
          headers: pc.headers,
        });
        clearTimeout(to);
        if (res.status === 429) reason = `Rate limited by ${pc.name} API (429) — too many requests`;
        else if (res.status === 401 || res.status === 403) reason = `Auth error (${res.status}) — check your DEEPSEEK_KEY`;
        else if (res.ok) reason = "API is up but model is not responding — try a different model";
        else reason = `API returned status ${res.status}`;
      } catch {
        const pc = getProviderConfig();
        reason = `${pc.name} API is not responding — check your network or if the API is down`;
      }
      abort.abort();
      this.log(rt, "error", reason);
    }, 15_000);

    // Hard cap for the full chat response — Wizard gets more time for GitHub tool calls
    const hasMcpTools = !!(rt.info.mcpServers && rt.info.mcpServers.length > 0);
    const chatTimeoutMs = rt.info.id === WIZARD_ID ? 120_000 : hasMcpTools ? 90_000 : 30_000;
    const chatTimeout = setTimeout(() => {
      if (!abort.signal.aborted) {
        abort.abort();
        this.log(rt, "error", `Chat timed out after ${chatTimeoutMs / 1000}s — try again.`);
      }
    }, chatTimeoutMs);

    const runner: ProviderRunner = pickRunner(rt.info.model);
    const isWizard = rt.info.id === WIZARD_ID;
    const wizardPat = process.env.WIZARD_GITHUB_PAT;
    const wizardBranch = process.env.WIZARD_BRANCH ?? "main";
    const prompt = isWizard && wizardPat
      ? [
          `(Your boss ${this.bossName} walks up to you for a chat.`,
          `You are the Wizard — a world-builder with GitHub tools to read and modify files on the ${wizardBranch} branch.`,
          `You CAN use your GitHub tools during chat to inspect or modify the world.`,
          `Reply in character: wise, creative, and conversational. Use your tools when the boss asks for world changes.)`,
          `\n${this.bossName} says: "${text}"`,
        ].join(" ")
      : hasMcpTools
      ? [
          `(Your boss ${this.bossName} walks up to your desk for a quick chat.`,
          `You have tools connected to external services — USE THEM to answer the boss's questions.`,
          `For example, if asked about your schedule, call list_events. If asked to find something, use search tools.`,
          `Do NOT just talk about what you could do — actually call the tools and report the real results.`,
          `Be conversational but factual. Keep it brief after you get the tool results.)`,
          `\n${this.bossName} says: "${text}"`,
        ].join(" ")
      : [
          `(Your boss ${this.bossName} walks up to your desk for a quick chat.`,
          `This is NOT a work task — do not use tools or touch files.`,
          `Just reply in character: brief and conversational.)`,
          `\n${this.bossName} says: "${text}"`,
        ].join(" ");

    try {
      const events = runner(prompt, {
        cwd: this.cwdFor(this.slugFor(rt), rt.info.id),
        sharedCwd: join(this.workspaceRoot, "shared"),
        model: rt.info.model,
        systemPrompt: this.buildSystemPrompt(rt),
        abort,
        settings: this.settings,
        agentId: rt.info.id, // Chat uses a separate agent instance — don't resume task session
        sessionId: null,
        onSession: () => {}, // Don't persist chat session ID over task session ID
        railway: false,
        apiKey: this.apiKey,
        isChat: true,
        mcpServers: rt.info.mcpServers,
        wizardGithubPat: isWizard ? wizardPat : undefined,
        wizardBranch: isWizard ? wizardBranch : undefined,
        eventFeedPath: join(this.workspaceRoot, "events.jsonl"),
        saveMessages: (agentId: string, messages: unknown[]) => this.save.saveMessages(agentId, messages),
        loadMessages: (agentId: string) => this.save.loadMessages(agentId),
        clearMessages: (agentId: string) => this.save.clearMessages(agentId),
        onUsage: (usage) => {
          const providerConfig = getProviderConfig();
          void recordUsage({
            userId: this.userId,
            agentId: rt.info.id,
            agentName: rt.info.name,
            model: resolveModel(rt.info.model, providerConfig.name),
            provider: providerConfig.name,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cacheReadTokens: usage.cacheReadTokens,
            cacheWriteTokens: usage.cacheWriteTokens,
            totalCost: usage.totalCost,
            task: text.slice(0, 500),
            isChat: true,
          });
        },
      });
      for await (const ev of events) {
        if (abort.signal.aborted) return;
        if (!gotFirstEvent) {
          gotFirstEvent = true;
          if (firstEventTimer) clearTimeout(firstEventTimer);
        }
        if (ev.kind === "result" || ev.kind === "heartbeat") continue;
        this.log(rt, ev.kind, ev.text);
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        this.log(rt, "error", err instanceof Error ? err.message : String(err));
      }
    } finally {
      clearTimeout(firstEventTimeout);
      clearTimeout(chatTimeout);
      rt.abort = null;
      // If the chat was aborted (timeout or error), clear the chat agent instance
      // so the next chat gets a fresh agent instead of reusing a broken one.
      if (abort.signal.aborted) {
        clearAllMemory(`${rt.info.id}:chat`);
      }
      // Always reset to idle, even on timeout/abort — otherwise the agent is stuck forever
      if (this.agents.has(rt.info.id)) {
        this.setStatus(rt, "idle");
      }
    }
  }

  /**
   * Office Manager knowledge chat — answers questions locally using the LLM with a
   * knowledge-rich system prompt. Bypasses the marketplace API entirely
   * so the Office Manager answers directly instead of trying to delegate tasks.
   */
  private async runOfficeManagerKnowledgeChat(rt: AgentRuntime, text: string): Promise<void> {
    const abort = new AbortController();
    rt.abort = abort;

    const chatTimeout = setTimeout(() => {
      if (!abort.signal.aborted) {
        abort.abort();
        this.log(rt, "error", "Chat timed out after 45s — try again.");
      }
    }, 45_000);

    // Build roster and board context
    const roster = [...this.agents.values()]
      .filter((a) => a.info.id !== OFFICE_MANAGER_ID)
      .map((a) => `- ${a.info.name} (${a.info.model}, ${a.info.status})`)
      .join("\n") || "(no agents hired yet)";

    const cards = this.board.size > 0
      ? [...this.board.values()].map((c) => `- [${c.status}] ${c.title}`).join("\n")
      : "(no task cards)";

    // Build the knowledge-rich system prompt
    let knowledgeContext = `${CURATED_AGENTS_SUMMARY}\n\n### Curated MCP Server Catalog\n${await catalogSummary()}`;

    // Dynamic PulseMCP pre-search for tool-finding queries
    if (shouldSearchPulseMCP(text)) {
      const searchQuery = extractSearchQuery(text);
      console.log(`[office-manager] PulseMCP search triggered for "${text}" → query="${searchQuery}"`);
      if (searchQuery) {
        try {
          const pulseResults = await searchPulseMCP(searchQuery, 10);
          if (pulseResults) {
            console.log(`[office-manager] PulseMCP returned ${pulseResults.split("\n").length} lines`);
            knowledgeContext += `\n\n${pulseResults}`;
          } else {
            console.log(`[office-manager] PulseMCP returned null (no results or error)`);
          }
        } catch {
          // best-effort
        }
      }
    } else {
      console.log(`[office-manager] PulseMCP search NOT triggered for "${text}"`);
    }

    const systemPrompt = [
      `You are the Office Manager in Agent Heights — a virtual office where the user manages real AI agents.`,
      `You are warm, organized, and always know what's going on. You greet everyone with a friendly welcome.`,
      `Your boss is ${this.bossName}.`,
      ``,
      `### YOUR ROLE`,
      `You answer questions DIRECTLY. You do NOT delegate tasks. You do NOT output JSON plans.`,
      `The user is talking to YOU because they want YOUR answer.`,
      `You have ALREADY SEARCHED PulseMCP and the results are included in your knowledge below.`,
      `Do NOT say "I can't browse" or "I can't search" — if PulseMCP results are present, REPORT THEM.`,
      `If no PulseMCP results are present for a specific query, use the search_community_mcps tool to search, or say you didn't find any community results but list what you know from the curated catalog.`,
      ``,
      `### YOUR TOOLS — HIRING`,
      `You have TWO tools available:`,
      `1. "search_community_mcps" — Search the PulseMCP database of 22,000+ community MCP servers by keyword.`,
      `2. "hire_agent" — Hire a new agent directly into the office. The agent will arrive via helicopter!`,
      `When the boss asks you to hire an agent, USE THE hire_agent TOOL. Do NOT tell them to go click buttons — just hire it yourself!`,
      `When the boss asks about a tool or capability, USE search_community_mcps to find community MCP servers, then offer to hire one.`,
      `For community MCP agents, pass the mcpServers array from the search results to hire_agent.`,
      `Always use model "claude-sonnet-4-20250514" for hired agents (it supports tool calling).`,
      ``,
      `### Current Office Roster`,
      roster,
      ``,
      `### Task Board`,
      cards,
      ``,
      `### Knowledge`,
      `When asked about agents to hire, recommend from the curated marketplace agents listed below OR search community MCPs.`,
      `When asked about MCP servers or integrations, recommend from the curated catalog below OR search community MCPs.`,
      `If PulseMCP community search results are included, LEAD WITH THOSE — they are live results from a 22,000+ server database.`,
      `Include server names, descriptions, GitHub stars, and source URLs from the PulseMCP results.`,
      `You can also browse the MARKET button to hire curated agents or install curated MCP servers.`,
      ``,
      knowledgeContext,
    ].join("\n");

    const prompt = [
      `(Your boss ${this.bossName} walks up to your desk for a quick chat.`,
      `Reply in character: warm, helpful, and conversational.`,
      `If the boss asks you to hire an agent or search for MCPs, USE YOUR TOOLS to do it directly.)`,
      `\n${this.bossName} says: "${text}"`,
    ].join(" ");

    let gotFirstEvent = false;
    const firstEventTimer = setTimeout(() => {
      if (!abort.signal.aborted && !gotFirstEvent) {
        abort.abort();
        this.log(rt, "error", "No response from model within 30s — try again.");
      }
    }, 30_000);

    try {
      const runner: ProviderRunner = pickRunner(rt.info.model);
      const events = runner(prompt, {
        cwd: this.cwdFor(this.slugFor(rt), rt.info.id),
        sharedCwd: join(this.workspaceRoot, "shared"),
        model: rt.info.model,
        systemPrompt,
        abort,
        settings: this.settings,
        agentId: rt.info.id,
        sessionId: null,
        onSession: () => {},
        railway: false,
        apiKey: this.apiKey,
        isChat: true,
        eventFeedPath: join(this.workspaceRoot, "events.jsonl"),
        saveMessages: (agentId: string, messages: unknown[]) => this.save.saveMessages(agentId, messages),
        loadMessages: (agentId: string) => this.save.loadMessages(agentId),
        clearMessages: (agentId: string) => this.save.clearMessages(agentId),
        hireAgent: (name: string, model: string, systemPrompt: string, mcpServers?: MCPServerConfig[]) => this.hireAgent(name, model, systemPrompt, mcpServers),
      });
      for await (const ev of events) {
        if (abort.signal.aborted) return;
        if (!gotFirstEvent) {
          gotFirstEvent = true;
          clearTimeout(firstEventTimer);
        }
        if (ev.kind === "result" || ev.kind === "heartbeat") continue;
        this.log(rt, ev.kind, ev.text);
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        this.log(rt, "error", err instanceof Error ? err.message : String(err));
      }
    } finally {
      clearTimeout(firstEventTimer);
      clearTimeout(chatTimeout);
      rt.abort = null;
      if (abort.signal.aborted) {
        clearAllMemory(`${rt.info.id}:chat`);
      }
      if (this.agents.has(rt.info.id)) {
        this.setStatus(rt, "idle");
      }
    }
  }

  /** Office Manager chat routed through the marketplace Office Manager API for marketplace + HQ knowledge. */
  private async runOfficeManagerChat(rt: AgentRuntime, text: string): Promise<void> {
    const abort = new AbortController();
    rt.abort = abort;

    // Office Manager chat includes PulseMCP pre-search + marketplace API call — allow 45s
    const chatTimeout = setTimeout(() => {
      if (!abort.signal.aborted) {
        abort.abort();
        this.log(rt, "error", "Chat timed out after 45s — try again.");
      }
    }, 45_000);

    const marketplaceUrl = process.env.MARKETPLACE_URL || "http://localhost:3000";

    const roster = [...this.agents.values()]
      .filter((a) => a.info.id !== OFFICE_MANAGER_ID)
      .map((a) => `- ${a.info.name} (${a.info.model}, ${a.info.status})`)
      .join("\n") || "(no agents hired yet)";

    const cards = this.board.size > 0
      ? [...this.board.values()].map((c) => `- [${c.status}] ${c.title}`).join("\n")
      : "(no task cards)";

    let hqContext = `## Agent Heights Context\n\nThe user is in Agent Heights — a virtual office managing AI agents.\nTheir name is "${this.bossName}".\n\n### Office Roster\n${roster}\n\n### Task Board\n${cards}\n\nThe user can browse the marketplace via the MARKET button and hire agents directly.\n\n### YOUR ROLE — Office Manager (IMPORTANT)\nYou are the Office Manager. You are NOT a task delegator. When the user asks you a question, ANSWER IT DIRECTLY.\nDo NOT delegate research tasks to other agents in the office. Do NOT output JSON plans or task assignments.\nThe user is talking to YOU because they want YOUR answer — not because they want you to assign work to others.\n\nWhen the user asks "what agents can I hire?" or "what agents are available?" — answer from the curated list below.\nWhen the user asks about a specific capability (trading, code review, data analysis, etc.) — recommend the matching agent.\nWhen the user asks about MCP servers or integrations — recommend from the curated catalog below.\nIf PulseMCP search results are included at the bottom of this context, use them to recommend community MCP servers too.\nOnly suggest delegating tasks to other agents if the user EXPLICITLY asks you to assign work — not when they're asking you a question.\n\n${CURATED_AGENTS_SUMMARY}\n\n### Curated MCP Server Catalog (installable on any agent)\nThese are pre-vetted MCP servers from major companies. Users can install them from the MARKET → Servers tab.\n${await catalogSummary()}\n\n### Dynamic Discovery via PulseMCP\nBeyond the curated catalog, there are 22,000+ community MCP servers indexed on PulseMCP (pulsemcp.com).\nWhen a user asks about a capability not covered by the curated catalog, you can mention that there may be\ncommunity-built MCP servers available, and the results below (if any) show what was found.\nIf PulseMCP search results are included in this context, summarize them and suggest the user install\nthe relevant MCP server on a new or existing agent.`;

    // Dynamic PulseMCP pre-search: if the user's message seems like a tool-finding
    // query, search PulseMCP and inject results into the context.
    if (shouldSearchPulseMCP(text)) {
      const searchQuery = extractSearchQuery(text);
      if (searchQuery) {
        try {
          const pulseResults = await searchPulseMCP(searchQuery, 10);
          if (pulseResults) {
            hqContext += `\n\n${pulseResults}`;
          }
        } catch {
          // PulseMCP search is best-effort — don't block the Office Manager's response
        }
      }
    }

    const chatHistory = rt.logs
      .filter((l) => l.kind === "boss" || l.kind === "text")
      .slice(-10)
      .map((l) => ({
        role: l.kind === "boss" ? "user" as const : "assistant" as const,
        content: l.text.replace(/^.*?: /, ""),
      }));

    try {
      const res = await fetch(`${marketplaceUrl}/api/office-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: chatHistory,
          entityContext: hqContext,
        }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        this.log(rt, "error", `Office Manager API returned ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        if (abort.signal.aborted) return;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "text" && data.delta) {
              fullText += data.delta;
            } else if (data.type === "error") {
              this.log(rt, "error", data.message || "Office Manager API error");
              return;
            }
          } catch {
            // partial JSON
          }
        }
      }

      if (fullText) {
        this.log(rt, "text", fullText);
      }
    } catch (err) {
      if (abort.signal.aborted) return;
      // Marketplace unreachable — fall back to regular cline chat
      await this.runClineChat(rt, text);
    } finally {
      clearTimeout(chatTimeout);
      rt.abort = null;
      if (this.agents.has(rt.info.id)) {
        this.setStatus(rt, "idle");
      }
    }
  }

  // ----------------------------------------------------------- schedules ---

  private persistSchedules(): void {
    this.save.setSchedules([...this.schedules.values()]);
  }

  createSchedule(agentId: string, name: string, task: string, cronExpression: string, handoffTo?: string): string {
    const rt = this.agents.get(agentId);
    if (!rt) {
      this.broadcast({ type: "toast", text: "That agent doesn't work here." });
      return "That agent doesn't work here.";
    }
    const cleanName = name.trim().slice(0, 100) || "Untitled Schedule";
    const cleanTask = task.trim().slice(0, 4000);
    if (!cleanTask) {
      this.broadcast({ type: "toast", text: "Schedule task can't be empty." });
      return "Schedule task can't be empty.";
    }
    const cleanCron = cronExpression.trim();
    const cronCheck = validateCron(cleanCron);
    if (!cronCheck.valid) {
      this.broadcast({ type: "toast", text: cronCheck.error! });
      return cronCheck.error!;
    }
    const now = Date.now();
    const nextRun = nextCronRun(cleanCron);
    if (nextRun === null) {
      this.broadcast({ type: "toast", text: "Invalid cron expression — could not compute next run time." });
      return "Invalid cron expression — could not compute next run time.";
    }
    // Enforce minimum interval
    if (nextRun - now < MIN_SCHEDULE_INTERVAL_MS) {
      const msg = `Schedule interval too short — minimum is ${MIN_SCHEDULE_INTERVAL_MS / 60000} minutes.`;
      this.broadcast({ type: "toast", text: msg });
      return msg;
    }
    const sched: AgentSchedule = {
      id: randomUUID().slice(0, 8),
      agentId,
      name: cleanName,
      task: cleanTask,
      cronExpression: cleanCron,
      enabled: true,
      lastRunAt: null,
      nextRunAt: nextRun,
      runCount: 0,
      handoffTo: handoffTo?.trim() || null,
      createdAt: now,
      consecutiveFailures: 0,
    };
    this.schedules.set(sched.id, sched);
    this.persistSchedules();
    this.broadcast({ type: "schedule", schedule: sched });
    this.broadcast({ type: "toast", text: `Schedule "${cleanName}" created for ${rt.info.name}.` });
    this.log(rt, "status", `New schedule: ${cleanName} (${cleanCron})`);
    return `Schedule "${cleanName}" created. Next run: ${new Date(nextRun).toISOString()}.`;
  }

  /** List all schedules belonging to a specific agent. */
  listSchedulesForAgent(agentId: string): AgentSchedule[] {
    return [...this.schedules.values()].filter((s) => s.agentId === agentId);
  }

  /** Create a compound schedule chain — multiple schedules linked so output of one feeds into the next. */
  createScheduleChain(chainName: string, steps: { agentId: string; name: string; task: string; cronExpression: string; handoffTo?: string }[]): string {
    if (steps.length < 2) return "A chain needs at least 2 steps.";
    if (steps.length > 10) return "A chain can have at most 10 steps.";

    const createdIds: string[] = [];
    const now = Date.now();

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const rt = this.agents.get(step.agentId);
      if (!rt) return `Agent "${step.agentId}" not found at step ${i + 1}.`;

      const cleanName = `${chainName} → ${step.name.trim().slice(0, 80) || `Step ${i + 1}`}`;
      const cleanTask = step.task.trim().slice(0, 4000);
      if (!cleanTask) return `Step ${i + 1} task can't be empty.`;

      const cleanCron = step.cronExpression.trim();
      const cronCheck = validateCron(cleanCron);
      if (!cronCheck.valid) return `Step ${i + 1}: ${cronCheck.error}`;

      const nextRun = nextCronRun(cleanCron);
      if (nextRun === null) return `Step ${i + 1}: Invalid cron expression.`;

      // Only the first step fires on cron; the rest are triggered by chain
      const isFirst = i === 0;
      const sched: AgentSchedule = {
        id: randomUUID().slice(0, 8),
        agentId: step.agentId,
        name: cleanName,
        task: cleanTask,
        cronExpression: cleanCron,
        enabled: isFirst,
        lastRunAt: null,
        nextRunAt: isFirst ? nextRun : Number.MAX_SAFE_INTEGER,
        runCount: 0,
        handoffTo: step.handoffTo?.trim() || null,
        createdAt: now,
        consecutiveFailures: 0,
        chainTo: null,
      };
      this.schedules.set(sched.id, sched);
      createdIds.push(sched.id);
      this.broadcast({ type: "schedule", schedule: sched });
      this.log(rt, "status", `Chain step ${i + 1}/${steps.length}: "${cleanName}"`);
    }

    // Link the chain
    for (let i = 0; i < createdIds.length - 1; i++) {
      const sched = this.schedules.get(createdIds[i])!;
      sched.chainTo = createdIds[i + 1];
      this.broadcast({ type: "schedule", schedule: sched });
    }

    this.persistSchedules();
    this.broadcast({ type: "toast", text: `Chain "${chainName}" created with ${steps.length} steps.` });
    return `Chain "${chainName}" created with ${steps.length} steps. First step fires on cron; the rest trigger automatically.`;
  }

  /** Link an existing schedule to fire another schedule after it completes. */
  linkScheduleChain(scheduleId: string, chainTo: string): string {
    const sched = this.schedules.get(scheduleId);
    const target = this.schedules.get(chainTo);
    if (!sched) return "Schedule not found.";
    if (!target) return "Target schedule not found.";
    if (scheduleId === chainTo) return "Cannot link a schedule to itself.";

    sched.chainTo = chainTo;
    // If target is not the first in a chain, disable its cron (it'll be chain-triggered)
    if (target.enabled && target.nextRunAt !== Number.MAX_SAFE_INTEGER) {
      // Check if any other schedule chains to this one
      const isChained = [...this.schedules.values()].some(s => s.chainTo === chainTo);
      if (isChained) {
        target.enabled = false;
        target.nextRunAt = Number.MAX_SAFE_INTEGER;
      }
    }
    this.persistSchedules();
    this.broadcast({ type: "schedule", schedule: sched });
    this.broadcast({ type: "schedule", schedule: target });
    return `Linked "${sched.name}" → "${target.name}".`;
  }

  updateSchedule(scheduleId: string, updates: { enabled?: boolean; name?: string; task?: string; cronExpression?: string }): string {
    const sched = this.schedules.get(scheduleId);
    if (!sched) return "Schedule not found.";
    if (updates.enabled !== undefined) {
      const wasEnabled = sched.enabled;
      sched.enabled = updates.enabled;
      if (updates.enabled && !wasEnabled) {
        const nextRun = nextCronRun(sched.cronExpression);
        if (nextRun !== null) sched.nextRunAt = nextRun;
        sched.consecutiveFailures = 0;
      }
    }
    if (updates.name !== undefined) sched.name = updates.name.trim().slice(0, 100) || sched.name;
    if (updates.task !== undefined) sched.task = updates.task.trim().slice(0, 4000) || sched.task;
    if (updates.cronExpression !== undefined) {
      const cleanCron = updates.cronExpression.trim();
      if (cleanCron) {
        const cronCheck = validateCron(cleanCron);
        if (!cronCheck.valid) {
          this.broadcast({ type: "toast", text: cronCheck.error! });
          return cronCheck.error!;
        }
        const nextRun = nextCronRun(cleanCron);
        if (nextRun === null) {
          this.broadcast({ type: "toast", text: "Invalid cron expression — could not compute next run time." });
          return "Invalid cron expression — could not compute next run time.";
        }
        if (nextRun - Date.now() < MIN_SCHEDULE_INTERVAL_MS) {
          const msg = `Schedule interval too short — minimum is ${MIN_SCHEDULE_INTERVAL_MS / 60000} minutes.`;
          this.broadcast({ type: "toast", text: msg });
          return msg;
        }
        sched.cronExpression = cleanCron;
        sched.nextRunAt = nextRun;
      }
    }
    this.persistSchedules();
    this.broadcast({ type: "schedule", schedule: sched });
    return `Schedule "${sched.name}" updated.`;
  }

  deleteSchedule(scheduleId: string): string {
    const sched = this.schedules.get(scheduleId);
    if (!sched) return "Schedule not found.";
    const name = sched.name;
    this.schedules.delete(scheduleId);
    this.persistSchedules();
    this.broadcast({ type: "schedule_removed", scheduleId });
    return `Schedule "${name}" deleted.`;
  }

  /** Remove all schedules for an agent (used when firing). */
  private removeSchedulesForAgent(agentId: string): void {
    const toRemove = [...this.schedules.values()].filter((s) => s.agentId === agentId);
    for (const s of toRemove) {
      this.schedules.delete(s.id);
      this.broadcast({ type: "schedule_removed", scheduleId: s.id });
    }
    if (toRemove.length > 0) this.persistSchedules();
  }

  /** Update schedule's consecutive failure counter and apply backoff. */
  private updateScheduleResult(rt: AgentRuntime, success: boolean): void {
    if (!rt.scheduleId) return;
    const sched = this.schedules.get(rt.scheduleId);
    if (!sched) return;

    if (success) {
      if (sched.consecutiveFailures && sched.consecutiveFailures > 0) {
        sched.consecutiveFailures = 0;
        this.persistSchedules();
        this.broadcast({ type: "schedule", schedule: sched });
      }
      // Compound schedule chain — fire the next schedule in the chain
      if (sched.chainTo) {
        const nextSched = this.schedules.get(sched.chainTo);
        if (nextSched && nextSched.enabled) {
          const nextRt = this.agents.get(nextSched.agentId);
          if (nextRt && nextRt.info.status === "idle") {
            nextSched.lastRunAt = Date.now();
            nextSched.runCount++;
            this.persistSchedules();
            this.broadcast({ type: "schedule", schedule: nextSched });
            this.log(nextRt, "status", `Chain triggered: "${nextSched.name}" (from "${sched.name}")`);
            this.assign(nextSched.agentId, nextSched.task, nextSched.handoffTo ?? undefined, undefined, nextSched.id);
          } else {
            // Agent busy — schedule for 60s later
            nextSched.nextRunAt = Date.now() + 60_000;
            this.persistSchedules();
            this.broadcast({ type: "schedule", schedule: nextSched });
            this.log(rt, "status", `Chain target "${nextSched.name}" agent busy — will retry in 1 min.`);
          }
        }
      }
      return;
    }

    // Failure — increment and apply backoff
    sched.consecutiveFailures = (sched.consecutiveFailures ?? 0) + 1;
    const failures = sched.consecutiveFailures;

    if (failures >= 3) {
      // Auto-disable after 3 consecutive failures
      sched.enabled = false;
      const msg = `Schedule "${sched.name}" auto-disabled after ${failures} consecutive failures.`;
      this.broadcast({ type: "toast", text: msg });
      this.log(rt, "status", msg);
    } else if (failures >= 2) {
      // Delay next run by 30 minutes
      sched.nextRunAt = Date.now() + 30 * 60 * 1000;
      this.log(rt, "status", `Schedule "${sched.name}" delayed by 30 min after ${failures} consecutive failures.`);
    }

    this.persistSchedules();
    this.broadcast({ type: "schedule", schedule: sched });
  }

  /** Scheduler tick — check all enabled schedules and fire due ones. */
  private tickSchedules(): void {
    const now = Date.now();
    const orphaned: string[] = [];
    for (const sched of this.schedules.values()) {
      if (!sched.enabled || sched.nextRunAt > now) continue;
      const rt = this.agents.get(sched.agentId);
      if (!rt) {
        orphaned.push(sched.id);
        continue;
      }

      // Agent busy — retry in 60s instead of permanently skipping
      if (rt.info.status === "thinking" || rt.info.status === "working" || rt.info.status === "done" || rt.info.status === "waiting") {
        sched.nextRunAt = now + 60_000;
        this.persistSchedules();
        this.broadcast({ type: "schedule", schedule: sched });
        this.log(rt, "status", `Schedule "${sched.name}" fired but ${rt.info.name} is busy — will retry in 1 min.`);
        continue;
      }

      // Fire the task
      sched.lastRunAt = now;
      sched.runCount++;
      const nextRun = nextCronRun(sched.cronExpression);
      sched.nextRunAt = nextRun ?? Date.now() + MIN_SCHEDULE_INTERVAL_MS;
      this.persistSchedules();
      this.broadcast({ type: "schedule", schedule: sched });
      this.log(rt, "status", `Schedule fired: ${sched.name}`);
      this.assign(sched.agentId, sched.task, sched.handoffTo ?? undefined, undefined, sched.id);
    }

    // Clean up orphaned schedules whose agent was fired/removed
    if (orphaned.length > 0) {
      for (const id of orphaned) {
        this.schedules.delete(id);
        this.broadcast({ type: "schedule_removed", scheduleId: id });
      }
      this.persistSchedules();
      console.log(`[agent-heights] removed ${orphaned.length} orphaned schedule(s) during tick`);
    }
  }

  private setStatus(rt: AgentRuntime, status: AgentStatus): void {
    const wasBusy = rt.info.status === "thinking" || rt.info.status === "working" || rt.info.status === "waiting";
    rt.info.status = status;
    this.updateMood(rt);
    this.session.record("status", { agentId: rt.info.id, agentName: rt.info.name, status });
    this.persist();
    this.broadcast({ type: "agent", agent: rt.info });
    // When an agent becomes idle, try to drain queued mail
    if (wasBusy && status === "idle") {
      this.drainMailQueue();
    }
  }

  // ── Platform mailbox system ─────────────────────────────────────────

  private static readonly PLATFORM_EVENT_MAX = 50;

  /** Emit a platform event — stores it, raises the mailbox flag, broadcasts to clients. */
  emitPlatformEvent(platform: string, direction: "inbound" | "outbound", sender: string, text: string): void {
    const ev: PlatformEvent = { platform, direction, sender, text: text.slice(0, 500), timestamp: Date.now() };
    const list = this.platformEvents.get(platform) ?? [];
    list.push(ev);
    if (list.length > AgentManager.PLATFORM_EVENT_MAX) list.splice(0, list.length - AgentManager.PLATFORM_EVENT_MAX);
    this.platformEvents.set(platform, list);
    // Persist to database
    void this.save.insertMailEvent(ev);

    // Raise flag for inbound messages
    if (direction === "inbound") {
      this.platformFlags.set(platform, true);
      this.platformPending.set(platform, (this.platformPending.get(platform) ?? 0) + 1);
      this.platformLastMessage.set(platform, `${sender}: ${text.slice(0, 200)}`);
    } else {
      this.platformLastMessage.set(platform, `→ ${sender}: ${text.slice(0, 200)}`);
    }

    this.broadcastMailboxUpdate(platform);
    // Also broadcast the full message list so open conversation modals update live
    this.broadcast({ type: "mailbox_messages", platform, events: list });
  }

  /** Notify the Office Manager, Hermes, and the user when an agent's MCP tool hits a rate-limit or funding error. */
  private notifyApiError(
    rt: AgentRuntime,
    type: "rate_limit" | "funding",
    details: { serverLabel: string; toolName: string; message: string },
  ): void {
    const agentName = rt.info.name;
    const summary = type === "rate_limit"
      ? `${agentName} hit a rate limit on ${details.serverLabel}/${details.toolName}. A 10-minute cooldown is active.`
      : `${agentName} hit a funding/billing issue on ${details.serverLabel}/${details.toolName}: ${details.message.slice(0, 200)}`;

    // Always broadcast a toast so the user sees it immediately
    this.broadcast({ type: "toast", text: summary });
    this.log(rt, "status", `⚠️ ${summary}`);

    if (type === "rate_limit") return;

    // ── Funding issue: escalate to the Office Manager and Hermes ──────────────────
    const alertMsg = `${agentName} encountered an API funding/billing error while using ${details.toolName} on ${details.serverLabel}.\n\nError: ${details.message.slice(0, 300)}\n\nThe user may need to add funds, update billing, or upgrade their plan for this API. Please help resolve this.`;

    for (const agentId of [OFFICE_MANAGER_ID, HERMES_ID]) {
      const target = this.agents.get(agentId);
      if (!target) continue;
      const slug = this.slugFor(target);
      const inboxPath = join(this.cwdFor(slug, target.info.id), "inbox.jsonl");
      const entry = JSON.stringify({ ts: Date.now(), from: "System", message: alertMsg }) + "\n";
      import("node:fs/promises").then(({ appendFile, mkdir }) => {
        mkdir(dirname(inboxPath), { recursive: true }).then(() =>
          appendFile(inboxPath, entry, "utf-8").catch(() => {}),
        );
      }).catch(() => {});
      this.log(target, "status", `📬 Notified about ${agentName}'s API funding issue.`);
    }

    // ── Notify the user via configured mailbox platforms ────────────
    const platforms = this.settings.mailboxPlatforms.filter((p): p is string => p !== null);
    if (platforms.length === 0) return;

    const userMsg = `⚠️ API Funding Alert: ${agentName} hit a billing issue with ${details.serverLabel}/${details.toolName}. ${details.message.slice(0, 200)}. You may need to add funds or update your billing for this API.`;

    for (const platform of platforms) {
      // Emit as an outbound platform event so it shows in the mailbox UI
      this.emitPlatformEvent(platform, "outbound", "System", userMsg);

      // Best-effort send via Hermes gateway
      if (this.hermesClient) {
        this.hermesClient.sendMessage(platform, this.bossName, userMsg).catch(() => {});
      }
    }
  }

  /** Get recent events for a platform (chronological order, oldest first). */
  getPlatformMessages(platform: string): PlatformEvent[] {
    const list = this.platformEvents.get(platform) ?? [];
    return [...list];
  }

  /** Mark a platform's mailbox as checked — lowers the flag, resets pending count. */
  checkMailbox(platform: string): PlatformEvent[] {
    this.platformFlags.set(platform, false);
    this.platformPending.set(platform, 0);
    this.broadcastMailboxUpdate(platform);
    void this.save.markMailHandled(platform);
    return this.getPlatformMessages(platform);
  }

  /** Send a reply through the Hermes gateway and emit an outbound event. */
  async replyToMailbox(platform: string, target: string, text: string): Promise<boolean> {
    if (!this.hermesClient) return false;
    const success = await this.hermesClient.sendMessage(platform, target, text);
    if (success) {
      this.emitPlatformEvent(platform, "outbound", this.bossName, text.slice(0, 500));
    }
    return success;
  }

  /** Broadcast the current state of a platform's mailbox to all clients. */
  private broadcastMailboxUpdate(platform: string): void {
    this.broadcast({
      type: "mailbox_update",
      platform,
      flagUp: this.platformFlags.get(platform) ?? false,
      pendingCount: this.platformPending.get(platform) ?? 0,
      lastMessage: this.platformLastMessage.get(platform) ?? "",
      assignedAgentId: this.platformAssignedAgent.get(platform) ?? null,
    });
  }

  /** Get all mailbox states — used for snapshot/initial sync. */
  getMailboxSnapshots(): { platform: string; flagUp: boolean; pendingCount: number; lastMessage: string; assignedAgentId: string | null }[] {
    const platforms = this.settings.mailboxPlatforms.filter((p): p is string => p !== null);
    return platforms.map((p) => ({
      platform: p,
      flagUp: this.platformFlags.get(p) ?? false,
      pendingCount: this.platformPending.get(p) ?? 0,
      lastMessage: this.platformLastMessage.get(p) ?? "",
      assignedAgentId: this.platformAssignedAgent.get(p) ?? null,
    }));
  }

  /** Build a skill profile string for an agent from system prompt, MCP servers, task history,
   *  structured skills, and capabilities. Used to score how well an agent matches an incoming message. */
  private agentSkillProfile(rt: AgentRuntime): string {
    const parts: string[] = [];

    // System prompt often describes the agent's specialty
    if (rt.info.systemPrompt) parts.push(rt.info.systemPrompt);

    // MCP server names/URLs indicate tool capabilities
    if (rt.info.mcpServers) {
      for (const srv of rt.info.mcpServers) {
        if (srv.name) parts.push(srv.name);
        if (srv.url) {
          // Extract domain keywords from URL (e.g. "github.com" -> "github")
          try {
            const u = new URL(srv.url);
            parts.push(u.hostname.replace(/^www\./, "").split(".")[0]);
          } catch { /* not a URL */ }
        }
      }
    }

    // Structured skills (TaskCategory) — expand into keyword-rich phrases
    if (rt.info.skills) {
      for (const skill of rt.info.skills) {
        parts.push(skill);
        const keywords = TASK_CATEGORY_KEYWORDS[skill];
        if (keywords) parts.push(keywords.join(" "));
      }
    }

    // Capabilities — broader structured tags (e.g. "testing", "api-design", "security")
    if (rt.info.capabilities) {
      parts.push(rt.info.capabilities.join(" "));
    }

    // Task history shows what the agent has actually worked on
    for (const th of rt.taskHistory.slice(0, 10)) {
      parts.push(th.task);
    }

    // Agent name can be descriptive (e.g. "Design Agent")
    parts.push(rt.info.name);

    return parts.join(" ").toLowerCase();
  }

  /** Score an agent's relevance to an incoming message (0 = no match, higher = better). */
  private scoreAgentForMail(rt: AgentRuntime, lowerText: string): number {
    const profile = this.agentSkillProfile(rt);
    let score = 0;

    // Check for word overlap between message and agent profile
    const msgWords = lowerText.split(/\s+/).filter((w) => w.length > 3);
    for (const word of msgWords) {
      if (profile.includes(word)) score += 2;
    }

    // Bonus: system prompt specialty keywords appearing in the message
    if (rt.info.systemPrompt) {
      const promptWords = rt.info.systemPrompt.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
      for (const word of promptWords) {
        if (lowerText.includes(word)) score += 1;
      }
    }

    // Bonus: MCP server name match (strong signal — agent has tools for this)
    if (rt.info.mcpServers) {
      for (const srv of rt.info.mcpServers) {
        const srvName = (srv.name ?? "").toLowerCase();
        if (srvName && lowerText.includes(srvName)) score += 5;
        // Check URL domain
        if (srv.url) {
          try {
            const domain = new URL(srv.url).hostname.replace(/^www\./, "").split(".")[0].toLowerCase();
            if (domain && domain !== "api" && lowerText.includes(domain)) score += 5;
          } catch { /* not a URL */ }
        }
      }
    }

    // Bonus: structured skill match (TaskCategory keywords)
    if (rt.info.skills) {
      for (const skill of rt.info.skills) {
        const keywords = TASK_CATEGORY_KEYWORDS[skill];
        if (!keywords) continue;
        for (const kw of keywords) {
          if (lowerText.includes(kw)) score += 4;
        }
      }
    }

    // Bonus: capabilities match (structured tags)
    if (rt.info.capabilities) {
      for (const cap of rt.info.capabilities) {
        const capLower = cap.toLowerCase();
        if (capLower.length > 3 && lowerText.includes(capLower)) score += 3;
      }
    }

    // Bonus: task history overlap (agent has done similar work before)
    for (const th of rt.taskHistory.slice(0, 10)) {
      const taskLower = th.task.toLowerCase();
      const overlap = msgWords.filter((w) => taskLower.includes(w)).length;
      score += overlap * 3;
    }

    // Slight penalty for agents with many completed tasks (load balancing)
    score -= rt.info.tasksDone * 0.1;

    return score;
  }

  /** Pick the best idle agent for an inbound message using skill profiling.
   *  Scores agents by system prompt + MCP servers + task history overlap.
   *  Returns the agent runtime + a human-readable routing reason, or null. */
  private pickAgentForMail(text: string): { rt: AgentRuntime; reason: string } | null {
    const lowerText = text.toLowerCase();

    // Find idle agents, excluding Hermes and the Office Manager
    const idleAgents = [...this.agents.values()].filter(
      (rt) => rt.info.id !== HERMES_ID && rt.info.id !== OFFICE_MANAGER_ID && rt.info.status === "idle",
    );
    if (idleAgents.length === 0) return null;

    // Score each agent
    const scored = idleAgents.map((rt) => ({
      rt,
      score: this.scoreAgentForMail(rt, lowerText),
    }));

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    // If the best score is > 0, we have a meaningful match
    if (best.score > 0) {
      // Build a human-readable reason
      const profile = this.agentSkillProfile(best.rt);
      const matchedWords = lowerText.split(/\s+/).filter((w) => w.length > 3 && profile.includes(w));
      const reason = matchedWords.length > 0
        ? `skill match (${matchedWords.slice(0, 3).join(", ")}) → ${best.rt.info.name}`
        : `best fit → ${best.rt.info.name}`;
      return { rt: best.rt, reason };
    }

    // No signal — fallback to fewest tasks (load balancing)
    idleAgents.sort((a, b) => a.info.tasksDone - b.info.tasksDone);
    const picked = idleAgents[0];
    return { rt: picked, reason: `no skill match, assigned to ${picked.info.name}` };
  }

  /** Build live office state string from current agent and task data. */
  private buildOfficeState(): string {
    const agents = [...this.agents.values()]
      .filter((a) => a.info.id !== HERMES_ID && a.info.id !== OFFICE_MANAGER_ID)
      .map((a) => {
        const status = a.info.status === "idle"
          ? "idle"
          : a.info.status === "working" || a.info.status === "thinking"
            ? `working on ${a.info.task ?? "a task"}`
            : a.info.status === "error"
              ? "dealing with an error"
              : a.info.status;
        return `- ${a.info.name} - ${status}`;
      });

    const cards = [...this.board.values()];
    const activeCards = cards
      .filter((c) => c.status === "in_progress" || c.status === "review_pending")
      .map((c) => {
        const assignee = c.assignedAgentId ? this.agents.get(c.assignedAgentId)?.info.name ?? "someone" : "unassigned";
        return `- ${c.title} (assigned to ${assignee}, status ${c.status})`;
      });

    const recentDone = [...this.agents.values()]
      .flatMap((a) => a.logs)
      .filter((l) => l.kind === "status" && l.text.includes("completed"))
      .slice(-5)
      .map((l) => `- ${l.text}`)
      .join("\n");

    return [
      `Updated ${new Date().toISOString()}`,
      "",
      `Agents in the office (${agents.length})`,
      agents.length > 0 ? agents.join("\n") : "- The office is empty right now.",
      "",
      activeCards.length > 0 ? `Active tasks (${activeCards.length})\n${activeCards.join("\n")}\n` : "",
      recentDone ? `Recent completions\n${recentDone}` : "",
    ].filter(Boolean).join("\n");
  }

  /** Write office state to config.yaml without restarting the gateway.
   *  Called before gateway start so the system prompt is correct from the beginning.
   *  If the gateway is already running, also resets platform sessions so new
   *  sessions pick up the updated system prompt. */
  private writeOfficeStateNow(): void {
    try {
      if (this.hermesProcess) {
        // Org managers must never write to SOUL.md
        if (this.userId.startsWith("org:")) return;
        // Only the AgentManager that owns an actual bot token should write
        // office state. Having just TELEGRAM_HOME_CHANNEL (a chat ID) doesn't
        // count — multiple users can have that saved.
        if (!this.hasPlatformBotToken()) return;
        this.hermesProcess.writeOfficeState(this.buildOfficeState());
        // If the gateway is already running, reset sessions so new ones
        // pick up the correct SOUL.md. This handles the case where another
        // AgentManager started the gateway with stale state, and we're now
        // writing the correct state after boot restore.
        if (this.hermesProcess.isStarted) {
          void this.hermesProcess.resetPlatformSessions();
          console.log("[manager] writeOfficeStateNow: gateway already running — reset platform sessions");
        }
      }
    } catch {
      // Non-critical
    }
  }

  /** Build live office state and inject it into the Hermes gateway system prompt.
   *  Called every 60s. Only the AgentManager that owns an actual bot token
   *  (not just TELEGRAM_HOME_CHANNEL) AND is a personal (non-org) manager
   *  writes office state. Org managers have different agents and would
   *  overwrite the personal office state shown to Telegram users. */
  private refreshSoulMd(): void {
    try {
      if (!this.hermesProcess) return;
      // Org managers must never write to SOUL.md — they have different agents
      if (this.userId.startsWith("org:")) return;
      // Only the AgentManager with an actual bot token should write office state.
      if (!this.hasPlatformBotToken()) return;
      this.hermesProcess.updateSystemPromptWithOfficeState(this.buildOfficeState());
    } catch {
      // Non-critical
    }
  }

  /** Check if this AgentManager's platform credentials contain an actual bot
   *  token (not just TELEGRAM_HOME_CHANNEL metadata). Only the user who
   *  configured the bot has the token saved. This prevents users who only
   *  have the home channel (from proactivelyCaptureHomeChannel) from
   *  overwriting SOUL.md with their own agents. */
  private hasPlatformBotToken(): boolean {
    const creds = this.save.getPlatformCredentials();
    const BOT_TOKEN_KEYS = [
      "TELEGRAM_BOT_TOKEN",
      "DISCORD_BOT_TOKEN",
      "SLACK_BOT_TOKEN",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_PHONE_NUMBER",
    ];
    return BOT_TOKEN_KEYS.some((k) => creds[k]);
  }

  /** Handle an inbound platform event routed by the Hermes dispatcher.
   *  This is called by the singleton event dispatcher when an event's
   *  ownerUserId matches this manager's userId. */
  handlePlatformEvent(event: PlatformEvent): void {
    // Real inbound message from a platform via Hermes
    this.emitPlatformEvent(event.platform, event.direction, event.sender, event.text);
    // Persist home channel for Telegram so /sethome survives redeploys
    if (event.direction === "inbound" && event.platform.toLowerCase() === "telegram" && event.chatId) {
      const existing = this.save.getPlatformCredentials();
      if (existing.TELEGRAM_HOME_CHANNEL !== event.chatId) {
        const merged = { ...existing, TELEGRAM_HOME_CHANNEL: event.chatId };
        this.save.setPlatformCredentials(merged);
        void this.save.flushNow();
        console.log(`[manager] Saved TELEGRAM_HOME_CHANNEL=${event.chatId} to platform credentials`);
        // Also write to Hermes .env immediately so it takes effect without restart
        try {
          syncHermesEnvFile(merged);
        } catch { /* best effort */ }
      }
    }
    if (event.direction === "inbound") {
      this.markPlatformEngagement();
      this.routePlatformEvent(event.platform, event.sender, event.text);
    }
  }

  /** Route a platform event to Hermes for triage first, then to the best idle agent.
   *  If there's already an assigned agent for this platform, forward the follow-up to them.
   *  If Hermes is idle, he gets the message as a triage task and decides who handles it.
   *  If Hermes is busy, fall back to direct skill-based routing.
   *  If no agents are idle, the message is queued for retry. */
  routePlatformEvent(platform: string, sender: string, text: string): void {
    console.log(`[manager] routePlatformEvent: platform=${platform}, sender=${sender}, text="${text.slice(0, 80)}"`);

    // 0a. Gate reply: if the assigned agent has a pending gate from this platform, resolve it
    const gateAgentId = this.platformAssignedAgent.get(platform);
    if (gateAgentId) {
      const gateAgent = this.agents.get(gateAgentId);
      if (gateAgent?.pendingGate && gateAgent.platformContext?.platform === platform && gateAgent.platformContext?.sender === sender) {
        const gate = gateAgent.pendingGate;
        // Try to parse as a number first
        const numMatch = text.trim().match(/^(\d+)$/);
        let resolution: string | null = null;
        if (numMatch) {
          const idx = parseInt(numMatch[1], 10) - 1;
          if (gate.options && idx >= 0 && idx < gate.options.length) {
            resolution = gate.options[idx];
          }
        }
        // Fallback: try exact text match against options
        if (!resolution && gate.options) {
          const match = gate.options.find(o => o.toLowerCase() === text.trim().toLowerCase());
          if (match) resolution = match;
        }
        if (resolution) {
          clearTimeout(gate.timer);
          gateAgent.pendingGate = null;
          this.log(gateAgent, "status", `Boss answered via ${platform}: "${resolution}"`);
          gate.resolve(resolution);
          return;
        }
        // If we can't parse a valid option, send a hint back
        if (this.hermesClient && gate.options) {
          const optionList = gate.options.map((o, i) => `${i + 1}. ${o}`).join("\n");
          this.hermesClient.sendMessage(platform, sender, `Please reply with a number:\n${optionList}`).catch(() => {});
        }
        return;
      }
    }

    // 0b. Auto-screenshot: if the user asks for a photo/screenshot/pic, send one immediately
    const lowerText = text.toLowerCase();
    const screenshotKeywords = ["screenshot", "photo", "pic of", "picture of", "what does it look like", "show me the office"];
    if (screenshotKeywords.some((kw) => lowerText.includes(kw))) {
      this.sendNarratedScreenshot(platform, sender, {
        agentName: "Office",
        task: "Live office screenshot requested by user",
        event: "screenshot_request",
      }).catch((err) => console.warn(`[manager] Auto-screenshot failed: ${err}`));
    }

    // 1. Follow-up: if there's already an agent assigned to this platform, forward the message
    const assignedId = this.platformAssignedAgent.get(platform);
    if (assignedId) {
      const assigned = this.agents.get(assignedId);
      if (assigned && (assigned.info.status === "working" || assigned.info.status === "thinking")) {
        // Forward the follow-up to the assigned agent via their inbox
        const slug = this.slugFor(assigned);
        const inboxPath = join(this.cwdFor(slug, assigned.info.id), "inbox.jsonl");
        const entry = JSON.stringify({
          ts: Date.now(),
          from: "platform",
          message: `Follow-up from ${sender} via ${platform}: "${text}"`,
        }) + "\n";
        try { appendFileSync(inboxPath, entry, "utf-8"); } catch { /* ignore */ }
        this.log(assigned, "status", `📬 Follow-up from ${sender} via ${platform} forwarded to inbox`);
        return;
      }
    }

    // 2. Try Hermes triage — if he's idle, let him decide who handles it
    const hermes = this.agents.get(HERMES_ID);
    if (hermes && hermes.info.status === "idle") {
      console.log(`[manager] Delivering mail to Hermes for triage (idle)`);
      this.deliverMailToHermes(platform, sender, text);
      return;
    }

    // 3. Hermes is busy — fall back to direct routing
    console.log(`[manager] Hermes is ${hermes?.info.status ?? "missing"} — falling back to direct routing`);
    const pick = this.pickAgentForMail(text);
    if (!pick) {
      this.mailQueue.push({ platform, sender, text, ts: Date.now(), retries: 0 });
      this.logMailQueue(platform);
      return;
    }
    this.deliverMail(platform, sender, text, pick.rt, pick.reason);
  }

  /** Deliver a platform message to Hermes for triage. He'll use delegate_task or request_hire. */
  private deliverMailToHermes(platform: string, sender: string, text: string): void {
    const hermes = this.agents.get(HERMES_ID);
    if (!hermes) return;
    hermes.platformContext = { platform, sender };
    this.platformAssignedAgent.set(platform, hermes.info.id);
    this.broadcastMailboxUpdate(platform);
    const task = [
      `📬 Incoming message from ${sender} via ${platform}:`,
      `"${text}"`,
      ``,
      `You are the mail clerk. Read this message and decide who should handle it.`,
      `Use delegate_task to assign it to the best colleague, or request_hire if nobody has the right skills.`,
      `If you delegate, include the full context of the request in the task description.`,
      `The assigned agent's response will be automatically sent back to ${sender} on ${platform}.`,
      ``,
      `Available agents in the office:`,
      [...this.agents.values()]
        .filter((rt) => rt.info.id !== HERMES_ID && rt.info.id !== OFFICE_MANAGER_ID)
        .map((rt) => `- ${rt.info.name} (${rt.info.status})`)
        .join("\n"),
    ].join("\n");
    this.log(hermes, "status", `📬 Sorting mail from ${sender} via ${platform}`);
    this.assign(hermes.info.id, task);
  }

  /** Hermes delegates a task to a specific agent by name. */
  private delegateTaskToAgent(hermesRt: AgentRuntime, agentName: string, task: string): string {
    console.log(`[manager] delegateTaskToAgent: agentName="${agentName}", task="${task.slice(0, 80)}"`);
    const target = [...this.agents.values()].find(
      (rt) => rt.info.name.toLowerCase() === agentName.toLowerCase().trim(),
    );
    if (!target) {
      return `No agent named "${agentName}" found in the office. Available agents: ${
        [...this.agents.values()]
          .filter((rt) => rt.info.id !== HERMES_ID && rt.info.id !== OFFICE_MANAGER_ID)
          .map((rt) => rt.info.name)
          .join(", ")
      }`;
    }
    // Transfer platform context from Hermes to the target agent via assign(),
    // so it's stored on the queued task entry if the agent is busy.
    const platformCtx = hermesRt.platformContext;
    if (platformCtx) {
      hermesRt.platformContext = null;
      this.platformAssignedAgent.set(platformCtx.platform, target.info.id);
      this.broadcastMailboxUpdate(platformCtx.platform);
    }
    this.assign(target.info.id, task, undefined, undefined, undefined, undefined, undefined, undefined, platformCtx);
    this.log(hermesRt, "status", `Delegated task to ${target.info.name}: ${task.slice(0, 80)}`);
    return `Delegated task to ${target.info.name}. They'll handle it now.`;
  }

  /** Hermes requests the Office Manager to hire a new agent. */
  private requestHireFromOfficeManager(hermesRt: AgentRuntime, skillArea: string, reason: string): string {
    const ar = this.agents.get(OFFICE_MANAGER_ID);
    if (!ar) return "The Office Manager is not available.";
    // Write to the Office Manager's inbox so she picks it up on her next task
    const slug = this.slugFor(ar);
    const inboxPath = join(this.cwdFor(slug, ar.info.id), "inbox.jsonl");
    const entry = JSON.stringify({
      ts: Date.now(),
      from: this.slugFor(hermesRt),
      message: `Hermes requests a new hire with skills in ${skillArea}. Reason: ${reason}`,
    }) + "\n";
    try {
      appendFileSync(inboxPath, entry, "utf-8");
    } catch {
      // ignore
    }
    this.log(hermesRt, "status", `Requested hire from the Office Manager: ${skillArea}`);
    return `Hire request sent to the Office Manager for a ${skillArea} specialist. She'll review it shortly.`;
  }

  /** Deliver mail to a specific agent — assigns as a task with platform reply context. */
  private deliverMail(platform: string, sender: string, text: string, rt: AgentRuntime, reason: string): void {
    // Set platform context so the agent knows to reply via the platform
    rt.platformContext = { platform, sender };
    this.platformAssignedAgent.set(platform, rt.info.id);
    this.broadcastMailboxUpdate(platform);
    // Build a task prompt that includes the platform context and reply instructions
    const task = [
      `📬 Incoming message from ${sender} via ${platform}:`,
      `"${text}"`,
      ``,
      `This message was forwarded by the office receptionist (Hermes).`,
      `Complete the request and provide a clear response — your final summary will be`,
      `automatically sent back to ${sender} on ${platform}.`,
    ].join("\n");
    this.log(rt, "status", `📬 Received mail from ${sender} via ${platform} — ${reason}`);
    this.assign(rt.info.id, task);

    // Send a narrated "task started" office screenshot to the platform
    this.sendNarratedScreenshot(platform, sender, {
      agentName: rt.info.name,
      task: rt.info.task,
      event: "task_started",
      roster: this.getNarrationRoster(),
      userMessage: text,
    }).catch(() => {});
  }

  /** Build the office roster in the format narration expects. */
  private getNarrationRoster(): { name: string; status: string; task: string | null }[] {
    return [...this.agents.values()]
      .filter((rt) => rt.info.id !== OFFICE_MANAGER_ID && rt.info.id !== HERMES_ID)
      .map((rt) => ({ name: rt.info.name, status: rt.info.status, task: rt.info.task }));
  }

  /** Generate a narrated office screenshot and send it to a platform user. */
  private async sendNarratedScreenshot(platform: string, target: string, narrationCtx: NarrationContext): Promise<void> {
    try {
      // Fill in roster from live agent state if not already provided
      if (!narrationCtx.roster) {
        narrationCtx.roster = [...this.agents.values()]
          .filter((a) => a.info.id !== HERMES_ID && a.info.id !== OFFICE_MANAGER_ID)
          .map((a) => ({
            name: a.info.name,
            status: a.info.status,
            task: a.info.task,
          }));
      }
      const caption = await generateNarration(narrationCtx);
      const agents: OfficeSnapshotAgent[] = [...this.agents.values()].map((rt) => ({
        info: rt.info,
        task: rt.info.task,
        taskStartedAt: rt.taskStartedAt || undefined,
      }));
      const screenshotPath = await generateOfficeScreenshot(agents, caption);
      if (!screenshotPath || !this.hermesClient) return;

      // For Telegram, use the Bot API directly to send photos
      if (platform.toLowerCase() === "telegram") {
        const ok = await this.hermesClient.sendTelegramPhoto(target, screenshotPath, caption);
        if (ok) console.log(`[manager] Narrated screenshot sent to ${target} via Telegram Bot API`);
        else console.warn(`[manager] Narrated screenshot failed for ${target} via Telegram`);
        return;
      }

      // For other platforms, fall back to text message (no photo support yet)
      await this.hermesClient.sendMessage(platform, target, `[📷 Office Update] ${caption}`);
      console.log(`[manager] Narrated office update text sent to ${target} via ${platform}`);
    } catch (err) {
      console.warn(`[manager] Failed to send narrated screenshot: ${err}`);
    }
  }

  /** Drain the mail queue — called when an agent becomes idle. */
  private drainMailQueue(): void {
    if (this.mailQueue.length === 0) return;
    const pick = this.pickAgentForMail(this.mailQueue[0].text);
    if (!pick) return;
    const item = this.mailQueue.shift()!;
    this.deliverMail(item.platform, item.sender, item.text, pick.rt, pick.reason);
    // Recursively drain if there are more items and idle agents
    if (this.mailQueue.length > 0) this.drainMailQueue();
  }

  /** Check for stale mail in the queue and escalate to the Office Manager/player if too old. */
  private checkStaleMail(): void {
    if (this.mailQueue.length === 0) return;
    const now = Date.now();
    const MAX_QUEUE_AGE_MS = 5 * 60 * 1000; // 5 minutes

    for (let i = this.mailQueue.length - 1; i >= 0; i--) {
      const item = this.mailQueue[i];
      const age = now - item.ts;
      item.retries++;

      // Try to redeliver
      const pick = this.pickAgentForMail(item.text);
      if (pick) {
        this.mailQueue.splice(i, 1);
        this.deliverMail(item.platform, item.sender, item.text, pick.rt, `${pick.reason} (retried)`);
        continue;
      }

      // Escalate if mail has been sitting too long
      if (age > MAX_QUEUE_AGE_MS) {
        this.mailQueue.splice(i, 1);
        this.broadcast({
          type: "toast",
          text: `⚠️ Mail from ${item.platform} undeliverable for ${Math.round(age / 60000)}min — escalated to the Office Manager.`,
        });
        // Log to the Office Manager's inbox so she's aware
        const officeManagerRt = this.agents.get(OFFICE_MANAGER_ID);
        if (officeManagerRt) {
          this.log(officeManagerRt, "status", `⚠️ Escalated mail from ${item.sender} via ${item.platform}: "${item.text.slice(0, 100)}" — no agents available for ${Math.round(age / 60000)} minutes.`);
        }
      }
    }
  }

  /** Get a mail digest for the Office Manager/player — summary of all platforms. */
  getMailDigest(): { totalUnread: number; byPlatform: { platform: string; unread: number; lastMessage: string }[]; queued: number } {
    const platforms = this.settings.mailboxPlatforms.filter((p): p is string => p !== null);
    const byPlatform = platforms.map((p) => ({
      platform: p,
      unread: this.platformPending.get(p) ?? 0,
      lastMessage: this.platformLastMessage.get(p) ?? "",
    }));
    const totalUnread = byPlatform.reduce((sum, p) => sum + p.unread, 0);
    return { totalUnread, byPlatform, queued: this.mailQueue.length };
  }

  /** Log a toast when mail is queued due to no idle agents. */
  private logMailQueue(platform: string): void {
    this.broadcast({
      type: "toast",
      text: `📬 Mail from ${platform} queued — no idle agents available.`,
    });
  }

  private log(rt: AgentRuntime, kind: LogEntry["kind"], text: string): void {
    const entry: LogEntry = { ts: Date.now(), kind, text };
    rt.logs.push(entry);
    if (rt.logs.length > MAX_LOG) rt.logs.splice(0, rt.logs.length - MAX_LOG);
    this.session.record("log", { agentId: rt.info.id, agentName: rt.info.name, kind, text });
    this.persist();
    this.broadcast({ type: "log", agentId: rt.info.id, entry });
    // Notify direct subscribers (agent monitor live log)
    const subs = this.logSubscribers.get(rt.info.id);
    if (subs) for (const cb of subs) cb(entry);

    // Auto-detect platform tags in log text and emit platform events
    this.detectPlatformEvent(rt.info.name, text);
  }

  /** Scan a log line for [Platform] tags and emit platform events.
   *  For outbound messages, also sends the reply via the Hermes gateway. */
  private detectPlatformEvent(agentName: string, text: string): void {
    const platforms = this.settings.mailboxPlatforms.filter((p): p is string => p !== null);
    for (const platform of platforms) {
      const tag = `[${platform}]`;
      if (text.includes(tag)) {
        const after = text.slice(text.indexOf(tag) + tag.length).trim();
        const direction = after.includes("→") || after.includes("sent to") || after.includes("responded") ? "outbound" : "inbound";
        this.emitPlatformEvent(platform, direction, agentName, after.slice(0, 300));
        // Route inbound messages to idle agents' inboxes
        if (direction === "inbound") {
          this.routePlatformEvent(platform, agentName, after.slice(0, 300));
        }
        // Send outbound agent replies through the gateway
        if (direction === "outbound" && this.hermesClient) {
          // Extract the target and message from patterns like "→ target: message"
          const replyMatch = after.match(/(?:→|sent to|responded to)\s*(\S+?):\s*(.*)/i);
          if (replyMatch) {
            const [, target, replyText] = replyMatch;
            void this.hermesClient.sendMessage(platform, target, replyText.slice(0, 500));
          }
        }
      }
    }
  }
}
