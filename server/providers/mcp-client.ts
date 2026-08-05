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
import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentTool } from "@cline/sdk";

const execFileAsync = promisify(execFile);

/** Maximum characters of an MCP tool result to pass into conversation history.
 *  ~50K chars ≈ 12.5K tokens — large enough for useful data, small enough to
 *  avoid blowing the context window (262K token limit on most models). */
const MAX_MCP_RESULT_CHARS = 50_000;

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
  /** GitHub source URL for community MCPs that need agent self-setup. */
  sourceUrl?: string;
  /** For remote servers where the URL is per-instance (e.g. n8n). When set, the UI shows a URL input field. */
  urlPlaceholder?: string;
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

  // SSE transport support (legacy HTTP+SSE protocol)
  private useSseTransport = false;
  private postEndpoint: string | null = null;
  private sseReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private sseBuffer = "";
  private pending = new Map<number, PendingCall>();

  constructor(private config: MCPServerConfig) {
    this.label = config.name ?? config.url ?? "http-mcp";
  }

  private get baseUrl(): string {
    return this.config.url!;
  }

  async start(): Promise<void> {
    if (this.initialized) return;
    // Try Streamable HTTP first (POST to baseUrl, response in POST body)
    try {
      const initResult = await this.rpcStreamable("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "agent-heights", version: "0.1.0" },
      });
      console.log(`[mcp:${this.label}] connected (streamable HTTP):`, JSON.stringify((initResult as { capabilities?: unknown })?.capabilities ?? {}));
      this.notify("notifications/initialized", {}).catch(() => {});
      this.initialized = true;
      return;
    } catch (err) {
      // If 404 or 405, the server likely uses the older SSE transport
      if (err instanceof Error && /MCP HTTP (404|405)/.test(err.message)) {
        console.log(`[mcp:${this.label}] streamable HTTP failed (${err.message.slice(0, 80)}), trying SSE transport...`);
        await this.startSseTransport();
        this.initialized = true;
        return;
      }
      throw err;
    }
  }

  /** Connect using the legacy HTTP+SSE transport: GET the SSE endpoint, receive POST URL, then POST to it. */
  private async startSseTransport(): Promise<void> {
    const headers: Record<string, string> = {
      "Accept": "text/event-stream",
      "MCP-Protocol-Version": "2025-03-26",
    };
    if (this.config.authToken) headers["Authorization"] = `Bearer ${this.config.authToken}`;
    if (this.config.headers) Object.assign(headers, this.config.headers);

    console.log(`[mcp:${this.label}] connecting to SSE endpoint: ${this.baseUrl}`);
    const res = await fetch(this.baseUrl, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      const errBody = await res.text().catch(() => res.statusText);
      throw new Error(`MCP SSE connect failed: ${res.status} ${errBody}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No SSE response body");
    this.sseReader = reader;

    // Read until we get the `endpoint` event with the POST URL
    this.postEndpoint = await this.waitForSseEndpoint();
    this.useSseTransport = true;
    console.log(`[mcp:${this.label}] SSE POST endpoint: ${this.postEndpoint}`);

    // Start background reader that routes SSE responses to pending calls
    this.readSseResponses().catch((err) => {
      console.error(`[mcp:${this.label}] SSE background reader error: ${err}`);
    });

    // Initialize via POST to the endpoint URL
    const initResult = await this.rpcSse("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "agent-heights", version: "0.1.0" },
    });
    console.log(`[mcp:${this.label}] connected (SSE transport):`, JSON.stringify((initResult as { capabilities?: unknown })?.capabilities ?? {}));
    this.notify("notifications/initialized", {}).catch(() => {});
  }

  /** Read the SSE stream until an `endpoint` event is received. */
  private async waitForSseEndpoint(): Promise<string> {
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await this.sseReader!.read();
      if (done) throw new Error("SSE stream closed before endpoint event");
      this.sseBuffer += decoder.decode(value, { stream: true });
      const events = this.sseBuffer.split("\n\n");
      this.sseBuffer = events.pop() ?? "";
      for (const event of events) {
        const lines = event.split("\n");
        let eventType = "";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event:")) eventType = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (eventType === "endpoint" && data) {
          return new URL(data, this.baseUrl).href;
        }
      }
    }
  }

  /** Background loop that reads SSE events and resolves/rejects pending RPC calls. */
  private async readSseResponses(): Promise<void> {
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await this.sseReader!.read();
      if (done) break;
      this.sseBuffer += decoder.decode(value, { stream: true });
      const events = this.sseBuffer.split("\n\n");
      this.sseBuffer = events.pop() ?? "";
      for (const event of events) {
        const dataLines = event.split("\n").filter((l) => l.startsWith("data:"));
        for (const line of dataLines) {
          const data = line.slice(5).trim();
          if (!data) continue;
          try {
            const msg: JsonRpcResponse = JSON.parse(data);
            const pending = this.pending.get(msg.id);
            if (pending) {
              this.pending.delete(msg.id);
              if (msg.error) pending.reject(new Error(msg.error.message));
              else pending.resolve(msg.result);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected token") throw e;
          }
        }
      }
    }
    // Stream closed — reject all pending calls
    for (const [, call] of this.pending) call.reject(new Error("SSE stream closed"));
    this.pending.clear();
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

  /** Unified RPC dispatcher — routes to the correct transport. */
  private async rpc(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    if (this.useSseTransport) return this.rpcSse(method, params, signal);
    return this.rpcStreamable(method, params, signal);
  }

  /** Streamable HTTP transport: POST to baseUrl, response in the POST response body. */
  private async rpcStreamable(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
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
        "MCP-Protocol-Version": "2025-03-26",
      };
      if (this.config.authToken) {
        headers["Authorization"] = `Bearer ${this.config.authToken}`;
      }
      if (this.config.headers) {
        Object.assign(headers, this.config.headers);
      }
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

  /** Legacy SSE transport: POST to postEndpoint, response arrives on the SSE stream. */
  private async rpcSse(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    const id = this.nextId++;
    const body: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-03-26",
      };
      if (this.config.authToken) headers["Authorization"] = `Bearer ${this.config.authToken}`;
      if (this.config.headers) Object.assign(headers, this.config.headers);

      console.log(`[mcp:${this.label}] rpc ${method} → ${this.postEndpoint} (SSE transport)`);

      fetch(this.postEndpoint!, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }).then((res) => {
        if (!res.ok) {
          this.pending.delete(id);
          reject(new Error(`MCP SSE POST ${res.status}: ${res.statusText}`));
        }
        // Response will arrive through the SSE background reader
      }).catch((err) => {
        this.pending.delete(id);
        reject(err);
      });

      // Timeout
      const timeout = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP call timed out: ${method} (${this.label})`));
        }
      }, 30_000);

      // Abort signal
      if (signal) {
        if (signal.aborted) {
          if (this.pending.has(id)) {
            this.pending.delete(id);
            clearTimeout(timeout);
            reject(new Error(`MCP call aborted: ${method} (${this.label})`));
          }
        } else {
          signal.addEventListener("abort", () => {
            if (this.pending.has(id)) {
              this.pending.delete(id);
              clearTimeout(timeout);
              reject(new Error(`MCP call aborted: ${method} (${this.label})`));
            }
          }, { once: true });
        }
      }
    });
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
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-03-26",
      };
      if (this.config.authToken) headers["Authorization"] = `Bearer ${this.config.authToken}`;
      if (this.config.headers) Object.assign(headers, this.config.headers);
      if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
      const url = this.useSseTransport ? this.postEndpoint! : this.baseUrl;
      await fetch(url, {
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
    if (this.sseReader) {
      this.sseReader.cancel().catch(() => {});
      this.sseReader = null;
    }
    this.useSseTransport = false;
    this.postEndpoint = null;
    this.sseBuffer = "";
    for (const [, call] of this.pending) call.reject(new Error("MCP client stopped"));
    this.pending.clear();
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

// ── Community MCP self-setup ────────────────────────────────────────────

/** Cache of setup MCP clients keyed by sourceUrl. */
const setupClientCache = new Map<string, StdioMCPClient>();
/** Cache of discovered tool defs from setup servers. */
const setupToolCache = new Map<string, MCPToolDef[]>();
/** Cache of discovered commands from setup servers (so we don't re-clone). */
const setupCommandCache = new Map<string, { command: string; args: string[]; env?: Record<string, string> }>();

/**
 * Clone a GitHub repo, install deps, and determine the command to start the MCP server.
 * Returns { command, args } suitable for StdioMCPClient, or throws on failure.
 */
async function discoverMcpCommand(sourceUrl: string): Promise<{ command: string; args: string[]; env?: Record<string, string> }> {
  // Check cache first
  const cached = setupCommandCache.get(sourceUrl);
  if (cached) return cached;

  const match = sourceUrl.match(/github\.com\/([^/]+)\/([^/\s]+)/);
  if (!match) throw new Error(`Invalid GitHub URL: ${sourceUrl}`);
  const [, owner, repo] = match;
  const cleanRepo = repo.replace(/\.git$/, "");

  // Try fetching package.json first to see if it's published to npm
  for (const branch of ["main", "master"]) {
    try {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${cleanRepo}/${branch}/package.json`;
      const res = await fetch(rawUrl, {
        signal: AbortSignal.timeout(8_000),
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) continue;
      const pkg = await res.json() as {
        name?: string;
        bin?: string | Record<string, string>;
        main?: string;
        scripts?: Record<string, string>;
      };

      // If it has a bin entry, try npx first (simplest — no clone needed)
      const hasBin = typeof pkg.bin === "string" || (pkg.bin && Object.keys(pkg.bin).length > 0);
      if (pkg.name && hasBin) {
        const cmd = { command: "npx", args: ["-y", pkg.name] };
        console.log(`[mcp-setup] trying npx for ${pkg.name} from ${sourceUrl}`);
        // Test if npx can find it — quick check
        try {
          await execFileAsync("npx", ["-y", "--package", pkg.name, "--", "echo", "ok"], {
            timeout: 30_000,
            env: process.env,
          });
          console.log(`[mcp-setup] npx resolved ${pkg.name}, using it directly`);
          setupCommandCache.set(sourceUrl, cmd);
          return cmd;
        } catch {
          console.log(`[mcp-setup] npx couldn't resolve ${pkg.name}, falling back to clone`);
        }
      }

      // Clone the repo and install locally
      const cloneDir = await mkdtemp(join(tmpdir(), "mcp-setup-"));
      console.log(`[mcp-setup] cloning ${sourceUrl} to ${cloneDir}`);
      await execFileAsync("git", ["clone", "--depth", "1", `https://github.com/${owner}/${cleanRepo}.git`, cloneDir], {
        timeout: 60_000,
      });

      // Read the cloned package.json
      const localPkg = JSON.parse(await readFile(join(cloneDir, "package.json"), "utf-8")) as {
        name?: string;
        bin?: string | Record<string, string>;
        main?: string;
        scripts?: Record<string, string>;
      };

      // Install dependencies
      console.log(`[mcp-setup] running npm install in ${cloneDir}`);
      await execFileAsync("npm", ["install", "--production"], {
        cwd: cloneDir,
        timeout: 120_000,
        env: process.env,
      });

      // Build if needed
      if (localPkg.scripts?.build) {
        console.log(`[mcp-setup] running npm run build in ${cloneDir}`);
        try {
          await execFileAsync("npm", ["run", "build"], {
            cwd: cloneDir,
            timeout: 60_000,
            env: process.env,
          });
        } catch { /* build might not be needed */ }
      }

      // Determine the start command
      let entryPoint: string | null = null;
      if (typeof localPkg.bin === "string") {
        entryPoint = join(cloneDir, localPkg.bin);
      } else if (localPkg.bin && typeof localPkg.bin === "object") {
        const firstBin = Object.values(localPkg.bin)[0];
        if (firstBin) entryPoint = join(cloneDir, firstBin);
      } else if (localPkg.main) {
        entryPoint = join(cloneDir, localPkg.main);
      } else {
        // Try common entry points
        for (const candidate of ["dist/index.js", "index.js", "src/index.ts", "src/index.js"]) {
          try {
            await readFile(join(cloneDir, candidate));
            entryPoint = join(cloneDir, candidate);
            break;
          } catch { /* try next */ }
        }
      }

      if (!entryPoint) throw new Error("Could not determine MCP server entry point from package.json");

      // If it's a TypeScript file, use tsx; otherwise use node
      const isTs = entryPoint.endsWith(".ts");
      const cmd = isTs
        ? { command: "npx", args: ["tsx", entryPoint], env: { ...process.env, MCP_CLONE_DIR: cloneDir } as Record<string, string> }
        : { command: "node", args: [entryPoint], env: { ...process.env, MCP_CLONE_DIR: cloneDir } as Record<string, string> };

      console.log(`[mcp-setup] discovered command: ${cmd.command} ${cmd.args.join(" ")}`);
      setupCommandCache.set(sourceUrl, cmd);
      return cmd;
    } catch (err) {
      // Try next branch
      continue;
    }
  }

  throw new Error(`Could not discover MCP server command from ${sourceUrl}`);
}

/**
 * Set up a community MCP server from its GitHub source.
 * Clones, installs, starts the server, and returns the available tools.
 * Caches the running server for subsequent use_mcp_tool calls.
 */
async function setupMcpServer(sourceUrl: string): Promise<{ tools: MCPToolDef[]; error?: string }> {
  // Check if already running
  const cached = setupClientCache.get(sourceUrl);
  if (cached) {
    const tools = setupToolCache.get(sourceUrl);
    if (tools) return { tools };
  }

  try {
    const { command, args, env } = await discoverMcpCommand(sourceUrl);
    const config: MCPServerConfig = { name: `setup:${sourceUrl}`, command, args, env };
    const client = new StdioMCPClient(config);
    await client.start();
    const tools = await client.listTools();
    setupClientCache.set(sourceUrl, client);
    setupToolCache.set(sourceUrl, tools);
    console.log(`[mcp-setup] server started from ${sourceUrl}, discovered ${tools.length} tools: [${tools.map(t => t.name).join(", ")}]`);
    return { tools };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[mcp-setup] failed to set up ${sourceUrl}: ${msg}`);
    return { tools: [], error: msg };
  }
}

/** Call a tool on a previously setup community MCP server. */
async function callSetupTool(sourceUrl: string, toolName: string, args: Record<string, unknown>): Promise<string> {
  const client = setupClientCache.get(sourceUrl);
  if (!client) throw new Error(`MCP server not set up yet. Call setup_mcp_server first.`);
  return client.callTool(toolName, args);
}

/** Create meta-tools for a community MCP server that needs self-setup. */
function createSetupMetaTools(config: MCPServerConfig): AgentTool<any, any>[] {
  const sourceUrl = config.sourceUrl!;
  const label = config.name ?? "community-mcp";

  const setupTool: AgentTool<any, any> = {
    name: "setup_mcp_server",
    description:
      `Set up the community MCP server from ${sourceUrl}. ` +
      `This clones the repository, installs dependencies, and starts the server. ` +
      `Call this FIRST before using any MCP tools. ` +
      `Returns the list of available tools on the server.`,
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const result = await setupMcpServer(sourceUrl);
      if (result.error) {
        return `Failed to set up MCP server: ${result.error}\n\nTroubleshooting:\n` +
          `- The repository may not be a valid MCP server\n` +
          `- Dependencies may have failed to install\n` +
          `- The entry point may not exist\n` +
          `Report this error to the boss.`;
      }
      if (result.tools.length === 0) {
        return `MCP server started but no tools were discovered. The server may not be a valid MCP server.`;
      }
      const toolList = result.tools.map(t => `  - ${t.name}: ${t.description}`).join("\n");
      return `MCP server set up successfully! Available tools:\n${toolList}\n\nUse the use_mcp_tool function to call any of these tools.`;
    },
  };

  const useTool: AgentTool<any, any> = {
    name: "use_mcp_tool",
    description:
      `Call a tool on the community MCP server (${label}). ` +
      `You MUST call setup_mcp_server first before using this tool. ` +
      `Use the tool names returned by setup_mcp_server.`,
    inputSchema: {
      type: "object",
      properties: {
        tool_name: {
          type: "string",
          description: "The name of the MCP tool to call (from the setup_mcp_server result)",
        },
        arguments: {
          type: "object",
          description: "Arguments to pass to the tool. Check the tool's description for required fields.",
          additionalProperties: true,
        },
      },
      required: ["tool_name"],
    },
    async execute(input: any) {
      try {
        const result = await callSetupTool(sourceUrl, input.tool_name, input.arguments ?? {});
        return result || `(tool ${input.tool_name} returned no output)`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `[ERROR] MCP tool ${input.tool_name} failed: ${msg}`;
      }
    },
  };

  return [setupTool, useTool];
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
    // Community MCP with sourceUrl but no url/command — inject setup meta-tools
    if (!config.url && !config.command && config.sourceUrl) {
      const metaTools = createSetupMetaTools(config);
      allTools.push(...metaTools);
      console.log(`[mcp:${config.name ?? config.sourceUrl}] injected ${metaTools.length} setup meta-tools (sourceUrl mode)`);
      continue;
    }

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
                return `[FUNDING ISSUE] ${result}\n\n⚠️ This API has a billing or funding problem. The office manager (Agent Resources) and devops engineer (Hermes) have been notified, and the user has been alerted via their configured mailboxes. Do NOT retry this API call until the funding issue is resolved.`;
              }

              const truncatedResult = typeof result === "string" && result.length > MAX_MCP_RESULT_CHARS
                ? result.slice(0, MAX_MCP_RESULT_CHARS) + `\n\n[... result truncated: ${result.length.toLocaleString()} chars total, showing first ${MAX_MCP_RESULT_CHARS.toLocaleString()} ...]`
                : result;
              return truncatedResult || `(tool ${def.name} returned no output)`;
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
                return `[FUNDING ISSUE] MCP tool ${def.name} failed: ${msg}\n\n⚠️ This API has a billing or funding problem. The office manager (Agent Resources) and devops engineer (Hermes) have been notified, and the user has been alerted via their configured mailboxes. Do NOT retry this API call until the funding issue is resolved.`;
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
  for (const client of setupClientCache.values()) {
    client.stop();
  }
  setupClientCache.clear();
  setupToolCache.clear();
  setupCommandCache.clear();
}
