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
  /** Environment variables for the spawned command. */
  env?: Record<string, string>;
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
        clientInfo: { name: "agent-hq", version: "0.1.0" },
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

  private async rpc(method: string, params: unknown): Promise<unknown> {
    if (!this.proc) throw new Error(`MCP server ${this.label} not started`);
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc!.stdin.write(JSON.stringify(req) + "\n");
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
      clientInfo: { name: "agent-hq", version: "0.1.0" },
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

  private async rpc(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const body: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`MCP HTTP ${res.status}: ${await res.text().catch(() => res.statusText)}`);
      }

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
      await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params }),
      });
    } catch { /* notifications are fire-and-forget */ }
  }

  stop(): void {
    this.initialized = false;
    this.toolsCache = null;
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
const clientCache = new Map<string, MCPClient>();

function clientKey(config: MCPServerConfig): string {
  return config.url ?? `${config.command}:${(config.args ?? []).join(" ")}`;
}

/**
 * Load tools from one or more MCP servers.
 * Returns Cline AgentTool objects ready to be passed to an agent.
 * Failures are logged and skipped — one broken server doesn't break the agent.
 */
export async function loadMCPTools(servers: MCPServerConfig[]): Promise<AgentTool<any, any>[]> {
  const allTools: AgentTool<any, any>[] = [];

  for (const config of servers) {
    const key = clientKey(config);
    let client = clientCache.get(key);
    if (!client) {
      client = createClient(config);
      clientCache.set(key, client);
    }

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
              const result = await client!.callTool(def.name, input ?? {});
              return result || `(tool ${def.name} returned no output)`;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
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

/** Stop and clear all cached MCP clients (called on server shutdown). */
export function stopAllMCPClients(): void {
  for (const client of clientCache.values()) {
    client.stop();
  }
  clientCache.clear();
}
