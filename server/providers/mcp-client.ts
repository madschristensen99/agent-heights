/**
 * Generalized MCP client — connects to any MCP-compatible server via
 * stdio (spawned process) or HTTP/SSE (remote URL) and exposes its tools
 * as Cline AgentTool objects.
 *
 * Marketplace agents can declare MCP servers in their config JSON:
 *   "mcpServers": [
 *     { "url": "https://agent.robinhood.com/mcp/trading" },
 *     { "command": "npx", "args": ["-y", "@some/mcp-server"] }
 *   ]
 *
 * Tools from all servers are merged and passed to the agent alongside
 * the standard built-in tools.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { AgentTool } from "@cline/sdk";

// ── JSON-RPC types ──────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface MCPToolDef {
  name: string;
  description: string;
  inputSchema: { type: string; properties?: Record<string, unknown>; required?: string[] };
}

type PendingCall = {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
};

export interface MCPServerConfig {
  /** Remote HTTP/SSE URL (e.g. "https://agent.robinhood.com/mcp/trading"). */
  url?: string;
  /** Command to spawn for stdio transport (e.g. "npx"). */
  command?: string;
  /** Arguments for the spawned command. */
  args?: string[];
  /** Environment variables for the spawned command (e.g. API keys). */
  env?: Record<string, string>;
  /** HTTP headers to send with MCP requests (e.g. Authorization, X-API-Key). */
  headers?: Record<string, string>;
  /** Bearer token — if set, sent as "Authorization: Bearer <token>". */
  authToken?: string;
  /** Human-readable label for logging. */
  name?: string;
}

// ── Stdio MCP client (for spawned processes) ────────────────────────────

class StdioMCPClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  private buffer = "";
  private toolsCache: MCPToolDef[] | null = null;
  private starting: Promise<void> | null = null;
  private label: string;

  constructor(private config: MCPServerConfig) {
    this.label = config.name ?? config.command ?? "stdio-mcp";
  }

  async start(): Promise<void> {
    if (this.proc) return;
    if (this.starting) return this.starting;
    this.starting = this._start();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async _start(): Promise<void> {
    const cmd = this.config.command!;
    const args = this.config.args ?? [];
    return new Promise<void>((resolve, reject) => {
      const proc = spawn(cmd, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...this.config.env, MCP_SERVER: "1" },
      });
      this.proc = proc;
      let settled = false;

      proc.on("error", (err: NodeJS.ErrnoException) => {
        console.error(`[mcp:${this.label}] spawn error: ${err.message}`);
        this.proc = null;
        for (const [, call] of this.pending) call.reject(new Error(`MCP server ${this.label} not available: ${err.message}`));
        this.pending.clear();
        if (!settled) { settled = true; reject(err); }
      });

      proc.stdin.on("error", (err) => console.error(`[mcp:${this.label}] stdin error: ${err.message}`));
      proc.stdout.setEncoding("utf-8");
      proc.stdout.on("data", (chunk: string) => this.onStdout(chunk));
      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) console.error(`[mcp:${this.label}] stderr: ${text}`);
      });
      proc.on("exit", (code) => {
        console.log(`[mcp:${this.label}] process exited (code ${code})`);
        this.proc = null;
        this.toolsCache = null;
        for (const p of this.pending.values()) p.reject(new Error(`MCP server ${this.label} exited`));
        this.pending.clear();
        if (!settled) { settled = true; reject(new Error(`MCP server ${this.label} exited with code ${code}`)); }
      });

      this.rpc("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "agent-heights", version: "0.1.0" },
      }).then((result) => {
        this.notify("notifications/initialized", {});
        console.log(`[mcp:${this.label}] connected:`, JSON.stringify((result as { capabilities?: unknown })?.capabilities ?? {}));
        if (!settled) { settled = true; resolve(); }
      }).catch((err) => {
        if (!settled) { settled = true; reject(err); }
      });
    });
  }

  stop(): void {
    if (!this.proc) return;
    this.proc.kill("SIGTERM");
    this.proc = null;
    this.toolsCache = null;
  }

  async listTools(): Promise<MCPToolDef[]> {
    if (this.toolsCache) return this.toolsCache;
    await this.start();
    const result = await this.rpc("tools/list", {}) as { tools?: MCPToolDef[] };
    this.toolsCache = result.tools ?? [];
    return this.toolsCache;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.start();
    const result = await this.rpc("tools/call", { name, arguments: args }) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    if (result.isError) {
      throw new Error(this.extractText(result) || `MCP tool ${name} returned an error`);
    }
    return this.extractText(result);
  }

  private extractText(result: { content?: Array<{ type: string; text?: string }> }): string {
    if (!result.content) return "";
    return result.content.map((c) => (c.type === "text" ? c.text ?? "" : "")).join("\n").trim();
  }

  private async rpc(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    if (!this.proc) throw new Error(`MCP server ${this.label} not started`);
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc!.stdin.write(JSON.stringify(req) + "\n");

      const onAbort = () => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP call aborted: ${method} (${this.label})`));
        }
      };
      if (signal) {
        if (signal.aborted) { onAbort(); return; }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP call timed out: ${method} (${this.label})`));
        }
      }, 30_000);
    });
  }

  private notify(method: string, params: unknown): void {
    if (!this.proc) return;
    this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg: JsonRpcResponse;
      try { msg = JSON.parse(trimmed); } catch { continue; }
      const pending = this.pending.get(msg.id);
      if (!pending) continue;
      this.pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error.message));
      else pending.resolve(msg.result);
    }
  }
}

// ── HTTP/SSE MCP client (for remote URLs) ───────────────────────────────

class HttpMCPClient {
  private nextId = 1;
  private toolsCache: MCPToolDef[] | null = null;
  private initialized = false;
  private label: string;
  private sessionId: string | null = null;

  constructor(private config: MCPServerConfig) {
    this.label = config.name ?? config.url ?? "http-mcp";
  }

  private get baseUrl(): string {
    return this.config.url!;
  }

  async start(): Promise<void> {
    if (this.initialized) return;
    // MCP over HTTP: send initialize via POST, expect JSON response
    const initResult = await this.rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "agent-heights", version: "0.1.0" },
    });
    console.log(`[mcp:${this.label}] connected:`, JSON.stringify((initResult as { capabilities?: unknown })?.capabilities ?? {}));
    // Send initialized notification (fire-and-forget)
    this.notify("notifications/initialized", {}).catch(() => {});
    this.initialized = true;
  }

  async listTools(): Promise<MCPToolDef[]> {
    if (this.toolsCache) return this.toolsCache;
    await this.start();
    const result = await this.rpc("tools/list", {}) as { tools?: MCPToolDef[] };
    this.toolsCache = result.tools ?? [];
    return this.toolsCache;
  }

  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    await this.start();
    const result = await this.rpc("tools/call", { name, arguments: args }, signal) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    if (result.isError) {
      throw new Error(this.extractText(result) || `MCP tool ${name} returned an error`);
    }
    return this.extractText(result);
  }

  private extractText(result: { content?: Array<{ type: string; text?: string }> }): string {
    if (!result.content) return "";
    return result.content.map((c) => (c.type === "text" ? c.text ?? "" : "")).join("\n").trim();
  }

  private async rpc(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    const id = this.nextId++;
    const body: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    // Link external abort signal to our internal controller
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      };
      // Inject auth token as Bearer
      if (this.config.authToken) {
        headers["Authorization"] = `Bearer ${this.config.authToken}`;
      }
      // Merge any custom headers from config
      if (this.config.headers) {
        Object.assign(headers, this.config.headers);
      }
      // Include session ID for Streamable HTTP transport
      if (this.sessionId) {
        headers["Mcp-Session-Id"] = this.sessionId;
      }

      console.log(`[mcp:${this.label}] rpc ${method} → ${this.baseUrl} (auth=${!!this.config.authToken}, session=${!!this.sessionId})`);

      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => res.statusText);
        console.error(`[mcp:${this.label}] rpc ${method} failed: ${res.status} ${errBody.slice(0, 200)}`);
        throw new Error(`MCP HTTP ${res.status}: ${errBody}`);
      }

      // Capture session ID from initialize response (Streamable HTTP transport)
      const sid = res.headers.get("mcp-session-id");
      if (sid) this.sessionId = sid;

      const contentType = res.headers.get("content-type") ?? "";

      // Handle SSE stream — read until we get our response
      if (contentType.includes("text/event-stream")) {
        return await this.readSSE(res, id);
      }

      // Plain JSON response
      const json: JsonRpcResponse = await res.json();
      if (json.error) throw new Error(json.error.message);
      return json.result;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readSSE(res: Response, expectedId: number): Promise<unknown> {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body for SSE stream");
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        const dataLines = event.split("\n").filter((l) => l.startsWith("data:"));
        for (const line of dataLines) {
          const data = line.slice(5).trim();
          if (!data) continue;
          try {
            const msg: JsonRpcResponse = JSON.parse(data);
            if (msg.id === expectedId) {
              if (msg.error) throw new Error(msg.error.message);
              return msg.result;
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected token") throw e;
          }
        }
      }
    }
    throw new Error(`SSE stream ended without response for id ${expectedId}`);
  }

  private async notify(method: string, params: unknown): Promise<void> {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.config.authToken) headers["Authorization"] = `Bearer ${this.config.authToken}`;
      if (this.config.headers) Object.assign(headers, this.config.headers);
      if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
      await fetch(this.baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", method, params }),
      });
    } catch { /* notifications are fire-and-forget */ }
  }

  stop(): void {
    this.initialized = false;
    this.toolsCache = null;
    this.sessionId = null;
  }
}

// ── Unified client manager ──────────────────────────────────────────────

type MCPClient = StdioMCPClient | HttpMCPClient;

function createClient(config: MCPServerConfig): MCPClient {
  if (config.url) return new HttpMCPClient(config);
  if (config.command) return new StdioMCPClient(config);
  throw new Error(`MCP server config must have either "url" or "command"`);
}

/** Cache of clients keyed by URL or command string. */
export const clientCache = new Map<string, MCPClient>();

function clientKey(config: MCPServerConfig): string {
  // Include authToken in key so token refresh creates a fresh client
  const authPart = config.authToken ? `:${config.authToken.slice(0, 8)}` : "";
  return (config.url ?? `${config.command}:${(config.args ?? []).join(" ")}`) + authPart;
}

/**
 * Load tools from one or more MCP servers.
 * Returns Cline AgentTool objects ready to be passed to an agent.
 * Failures are logged and skipped — one broken server doesn't break the agent.
 */
/** Patterns that indicate a rate-limit error from the API. */
const RATE_LIMIT_PATTERNS = [
  /\b429\b/,
  /rate\s*limit/i,
  /secondary\s*rate\s*limit/i,
  /too\s*many\s*requests/i,
  /X-RateLimit-Remaining[:\s]*0/i,
  /API rate limit exceeded/i,
];

/** Patterns that indicate an API funding / billing / credits issue. */
const FUNDING_PATTERNS = [
  /\b402\b/,
  /payment\s*required/i,
  /insufficient\s*(credit|fund|balance)/i,
  /credit\s*balance.*(low|zero|insufficient|exhausted)/i,
  /quota\s*(exceeded|exhausted|depleted)/i,
  /billing\s*(issue|required|problem|failed)/i,
  /add\s*(payment|funding|billing)/i,
  /plan\s*(limit|upgrade|required)/i,
  /api\s*key.*(fund|credit|billing|payment)/i,
  /subscription.*(expired|inactive|required)/i,
  /out\s*of\s*credits/i,
  /no\s*credits/i,
];

/** Cooldown duration after a rate-limit hit (10 minutes). */
const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;

/** Check if an error/result string looks like a rate-limit response. */
function isRateLimitError(text: string): boolean {
  return RATE_LIMIT_PATTERNS.some((p) => p.test(text));
}

/** Check if an error/result string looks like an API funding/billing issue. */
function isFundingError(text: string): boolean {
  return FUNDING_PATTERNS.some((p) => p.test(text));
}

/** Callback type for notifying the manager of API errors. */
export type OnApiErrorFn = (type: "rate_limit" | "funding", details: { serverLabel: string; toolName: string; message: string }) => void;

export async function loadMCPTools(servers: MCPServerConfig[], abortRef?: { signal: AbortSignal }, onApiError?: OnApiErrorFn): Promise<AgentTool<any, any>[]> {
  const allTools: AgentTool<any, any>[] = [];
  const MIN_CALL_INTERVAL_MS = 500; // throttle to avoid API rate limits

  for (const config of servers) {
    const key = clientKey(config);
    let client = clientCache.get(key);
    if (!client) {
      client = createClient(config);
      clientCache.set(key, client);
    }

    // Per-server rate limiter: ensures at least MIN_CALL_INTERVAL_MS between calls
    let lastCallTime = 0;
    // Per-server rate-limit cooldown: timestamp when it's safe to call again
    let rateLimitedUntil = 0;

    try {
      const toolDefs = await client.listTools();
      const label = config.name ?? config.url ?? config.command ?? "mcp";
      console.log(`[mcp:${label}] discovered ${toolDefs.length} tools: [${toolDefs.map(t => t.name).join(", ")}]`);

      for (const def of toolDefs) {
        // Prefix tool name with server label to avoid collisions between servers
        const toolName = servers.length > 1 ? `${label}__${def.name}` : def.name;
        allTools.push({
          name: toolName,
          description: def.description,
          inputSchema: def.inputSchema ?? { type: "object", properties: {} },
          async execute(input: any) {
            try {
              // If this server is in rate-limit cooldown, throw immediately to abort the run.
              // Returning a string lets the LLM ignore it and keep calling tools, wasting iterations.
              const cooldownRemaining = rateLimitedUntil - Date.now();
              if (cooldownRemaining > 0) {
                const mins = Math.ceil(cooldownRemaining / 60_000);
                const msg = `This API is rate-limited. Please wait ${mins} minute(s) before retrying. The cooldown ends at ${new Date(rateLimitedUntil).toISOString()}. Do NOT retry until then.`;
                onApiError?.("rate_limit", { serverLabel: label, toolName: def.name, message: msg });
                throw new Error(`[RATE LIMITED] ${msg}`);
              }

              // Throttle: wait if we're calling too fast
              const now = Date.now();
              const elapsed = now - lastCallTime;
              if (elapsed < MIN_CALL_INTERVAL_MS) {
                await new Promise((r) => setTimeout(r, MIN_CALL_INTERVAL_MS - elapsed));
              }
              lastCallTime = Date.now();
              const result = await client!.callTool(def.name, input ?? {}, abortRef?.signal);

              // Check if the result text indicates a rate-limit error
              if (typeof result === "string" && isRateLimitError(result)) {
                rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
                console.warn(`[mcp:${label}] rate limit detected on tool ${def.name}, cooling down for ${RATE_LIMIT_COOLDOWN_MS / 60_000} minutes`);
                onApiError?.("rate_limit", { serverLabel: label, toolName: def.name, message: result.slice(0, 500) });
                return `[RATE LIMITED] ${result}\n\n⚠️ This API is now rate-limited. A 10-minute cooldown has been activated. Do NOT retry any API calls until the cooldown expires. Wait at least 10 minutes before making another request.`;
              }

              // Check if the result text indicates a funding/billing issue
              if (typeof result === "string" && isFundingError(result)) {
                console.warn(`[mcp:${label}] funding issue detected on tool ${def.name}`);
                onApiError?.("funding", { serverLabel: label, toolName: def.name, message: result.slice(0, 500) });
                return `[FUNDING ISSUE] ${result}\n\n⚠️ This API has a billing or funding problem. The office manager (Yuki) and devops engineer (Hermes) have been notified, and the user has been alerted via their configured mailboxes. Do NOT retry this API call until the funding issue is resolved.`;
              }

              return result || `(tool ${def.name} returned no output)`;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);

              // Re-throw cooldown-originated errors so they abort the run instead of
              // being caught and returned as a string the LLM can ignore.
              if (msg.startsWith("[RATE LIMITED]")) {
                throw err;
              }

              // Detect rate-limit errors from the API and activate cooldown
              if (isRateLimitError(msg)) {
                rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
                console.warn(`[mcp:${label}] rate limit detected on tool ${def.name} (error), cooling down for ${RATE_LIMIT_COOLDOWN_MS / 60_000} minutes`);
                onApiError?.("rate_limit", { serverLabel: label, toolName: def.name, message: msg.slice(0, 500) });
                return `[RATE LIMITED] MCP tool ${def.name} failed: ${msg}\n\n⚠️ This API is now rate-limited. A 10-minute cooldown has been activated. Do NOT retry any API calls until the cooldown expires. Wait at least 10 minutes before making another request.`;
              }

              // Detect funding/billing errors
              if (isFundingError(msg)) {
                console.warn(`[mcp:${label}] funding issue detected on tool ${def.name} (error)`);
                onApiError?.("funding", { serverLabel: label, toolName: def.name, message: msg.slice(0, 500) });
                return `[FUNDING ISSUE] MCP tool ${def.name} failed: ${msg}\n\n⚠️ This API has a billing or funding problem. The office manager (Yuki) and devops engineer (Hermes) have been notified, and the user has been alerted via their configured mailboxes. Do NOT retry this API call until the funding issue is resolved.`;
              }

              return `[ERROR] MCP tool ${def.name} failed: ${msg}`;
            }
          },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[mcp:${config.name ?? config.url ?? config.command}] failed to load tools: ${msg}`);
    }
  }

  return allTools;
}

/**
 * Call a specific tool on an MCP server by name.
 * Uses the client cache so repeated calls reuse the same connection.
 */
export async function callMCPTool(
  config: MCPServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const key = clientKey(config);
  let client = clientCache.get(key);
  if (!client) {
    client = createClient(config);
    clientCache.set(key, client);
  }
  return client.callTool(toolName, args);
}

/** Stop and clear all cached MCP clients (called on server shutdown). */
export function stopAllMCPClients(): void {
  for (const client of clientCache.values()) {
    client.stop();
  }
  clientCache.clear();
}
