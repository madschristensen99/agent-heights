import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentTool } from "@cline/sdk";
import type { RailwayData, RailwayProject } from "../../shared/types.js";

/** Resolve the railway CLI binary — checks local node_modules/.bin first, then PATH. */
function resolveRailwayBin(): string {
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const localBin = join(rootDir, "node_modules", ".bin", "railway");
  if (existsSync(localBin)) return localBin;
  return "railway"; // fall back to PATH (global install)
}

/** Minimal JSON-RPC types for MCP stdio communication. */
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

/**
 * Spawns `railway mcp` as a stdio child process and communicates via JSON-RPC.
 * One shared instance serves all agents — tools are stateless RPC calls.
 */
export class RailwayMCPClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  private buffer = "";
  private toolsCache: MCPToolDef[] | null = null;
  private starting: Promise<void> | null = null;

  /** Lazily start the MCP server and perform the initialize handshake. */
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
    return new Promise<void>((resolve, reject) => {
      const proc = spawn(resolveRailwayBin(), ["mcp"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, MCP_SERVER: "1" },
      });
      this.proc = proc;

      let settled = false;

      proc.on("error", (err: NodeJS.ErrnoException) => {
        console.error(`[railway-mcp] spawn error: ${err.message}`);
        this.proc = null;
        this.starting = null;
        for (const [, call] of this.pending) {
          call.reject(new Error(`Railway CLI not available: ${err.message}. Install it with: npm i -g @railway/cli`));
        }
        this.pending.clear();
        if (!settled) { settled = true; reject(err); }
      });

      proc.stdin.on("error", (err: NodeJS.ErrnoException) => {
        console.error(`[railway-mcp] stdin error: ${err.message}`);
      });
      proc.stdout.setEncoding("utf-8");
      proc.stdout.on("data", (chunk: string) => this.onStdout(chunk));
      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) console.error(`[railway-mcp] stderr: ${text}`);
      });
      proc.on("exit", (code) => {
        console.log(`[railway-mcp] process exited (code ${code})`);
        this.proc = null;
        this.toolsCache = null;
        for (const p of this.pending.values()) {
          p.reject(new Error("Railway MCP process exited"));
        }
        this.pending.clear();
        if (!settled) { settled = true; reject(new Error(`Railway MCP process exited with code ${code}`)); }
      });

      // MCP initialize handshake
      this.rpc("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "agent-heights", version: "0.1.0" },
      }).then((result) => {
        this.notify("notifications/initialized", {});
        console.log("[railway-mcp] connected:", JSON.stringify((result as { capabilities?: unknown })?.capabilities ?? {}));
        if (!settled) { settled = true; resolve(); }
      }).catch((err) => {
        if (!settled) { settled = true; reject(err); }
      });
    });
  }

  /** Stop the MCP server process. */
  stop(): void {
    if (!this.proc) return;
    this.proc.kill("SIGTERM");
    this.proc = null;
    this.toolsCache = null;
  }

  /** Whether the MCP process is running. */
  get running(): boolean {
    return this.proc !== null;
  }

  /** Discover available tools from the MCP server. */
  async listTools(): Promise<MCPToolDef[]> {
    if (this.toolsCache) return this.toolsCache;
    await this.start();
    const result = await this.rpc("tools/list", {}) as { tools?: MCPToolDef[] };
    this.toolsCache = result.tools ?? [];
    return this.toolsCache;
  }

  /** Call a tool by name with the given arguments. */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.start();
    const result = await this.rpc("tools/call", { name, arguments: args }) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };

    if (result.isError) {
      const text = this.extractText(result);
      throw new Error(text || `Railway tool ${name} returned an error`);
    }

    return this.extractText(result);
  }

  private extractText(result: { content?: Array<{ type: string; text?: string }> }): string {
    if (!result.content) return "";
    return result.content
      .map((c) => (c.type === "text" ? c.text ?? "" : ""))
      .join("\n")
      .trim();
  }

  private async rpc(method: string, params: unknown): Promise<unknown> {
    if (!this.proc) throw new Error("Railway MCP not started");
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc!.stdin.write(JSON.stringify(req) + "\n");

      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Railway MCP call timed out: ${method}`));
        }
      }, 30_000);
    });
  }

  private notify(method: string, params: unknown): void {
    if (!this.proc) return;
    const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
    this.proc.stdin.write(msg + "\n");
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg: JsonRpcResponse;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const pending = this.pending.get(msg.id);
      if (!pending) continue;
      this.pending.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error.message));
      } else {
        pending.resolve(msg.result);
      }
    }
  }
}

/** Singleton MCP client shared across all agents. */
let mcpClient: RailwayMCPClient | null = null;

/** Get or create the shared Railway MCP client. */
export function getRailwayMCP(): RailwayMCPClient {
  if (!mcpClient) mcpClient = new RailwayMCPClient();
  return mcpClient;
}

/** Shutdown the shared MCP client (called on server stop). */
export function stopRailwayMCP(): void {
  if (mcpClient) {
    mcpClient.stop();
    mcpClient = null;
  }
}

/** Check whether the Railway CLI is available and authenticated. */
export async function checkRailwayStatus(): Promise<{ ok: boolean; message: string }> {
  try {
    const client = getRailwayMCP();
    await client.start();
    const tools = await client.listTools();
    return {
      ok: true,
      message: `Railway MCP connected — ${tools.length} tools available.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: `Railway MCP unavailable: ${err instanceof Error ? err.message : String(err)}. Make sure the Railway CLI is installed and authenticated (railway login).`,
    };
  }
}

/**
 * Query Railway for project + deployment data via MCP.
 * Returns structured data for the client dashboard.
 */
export async function queryRailway(): Promise<{ data: RailwayData | null; error: string | null }> {
  try {
    const client = getRailwayMCP();
    await client.start();
    const tools = await client.listTools();

    // Find a list-projects or similar tool
    const listTool = tools.find(t => t.name.toLowerCase().includes("list") && t.name.toLowerCase().includes("project"));
    if (!listTool) {
      return { data: null, error: "No list-projects tool found in Railway MCP." };
    }

    const raw = await client.callTool(listTool.name, {});
    const projects = parseProjects(raw);

    return { data: { projects, raw }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Best-effort parse of Railway MCP list-projects output into structured data. */
function parseProjects(raw: string): RailwayProject[] {
  const projects: RailwayProject[] = [];
  try {
    // Try JSON first
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const p of parsed) {
        projects.push({
          id: String(p.id ?? p.projectId ?? ""),
          name: String(p.name ?? p.projectName ?? "unnamed"),
          environment: String(p.environment ?? p.env ?? "production"),
          services: Array.isArray(p.services) ? p.services.map((s: any) => ({
            id: String(s.id ?? s.serviceId ?? ""),
            name: String(s.name ?? s.serviceName ?? "service"),
            status: String(s.status ?? "unknown"),
            url: s.url ? String(s.url) : undefined,
            deployments: Array.isArray(s.deployments) ? s.deployments.map((d: any) => ({
              id: String(d.id ?? ""),
              status: String(d.status ?? "unknown"),
              createdAt: d.createdAt ? String(d.createdAt) : undefined,
            })) : undefined,
          })) : [],
        });
      }
      return projects;
    }
  } catch {
    // Not JSON — fall through to text parsing
  }

  // Fallback: split by lines and look for project names
  const lines = raw.split("\n").filter(l => l.trim());
  let current: RailwayProject | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    // Look for project headers (usually have a name + id pattern)
    if (trimmed && !trimmed.startsWith("-") && !trimmed.startsWith("•")) {
      if (current) projects.push(current);
      current = {
        id: "",
        name: trimmed.replace(/[│|┃]/g, "").trim(),
        environment: "production",
        services: [],
      };
    } else if (current && (trimmed.startsWith("-") || trimmed.startsWith("•"))) {
      const svcName = trimmed.replace(/^[-•]\s*/, "").trim();
      current.services.push({
        id: "",
        name: svcName,
        status: "unknown",
      });
    }
  }
  if (current) projects.push(current);
  return projects;
}

/**
 * Wrap Railway MCP tools as Cline AgentTool objects.
 * Returns an empty array if the MCP server can't start.
 */
export async function wrapRailwayTools(): Promise<AgentTool<any, any>[]> {
  let tools: MCPToolDef[];
  try {
    const client = getRailwayMCP();
    tools = await client.listTools();
  } catch (err) {
    console.warn("[railway-mcp] failed to discover tools:", err instanceof Error ? err.message : err);
    return [];
  }

  const client = getRailwayMCP();

  return tools.map((def): AgentTool<any, any> => ({
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema ?? { type: "object", properties: {} },
    async execute(input: any) {
      try {
        const result = await client.callTool(def.name, input ?? {});
        return result || `(tool ${def.name} returned no output)`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `[ERROR] Railway tool ${def.name} failed: ${msg}`;
      }
    },
  }));
}
