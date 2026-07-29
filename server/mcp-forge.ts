/**
 * MCP Forge — manages self-built MCP servers created by agents.
 *
 * When an agent writes an MCP server in its workspace and calls the
 * `register_mcp_server` tool, this module:
 *   1. Validates the entry file exists
 *   2. Spawns it as a stdio MCP process (via StdioMCPClient)
 *   3. Calls tools/list to discover its tools
 *   4. Registers it in an office-wide map
 *   5. Makes its tools available to all agents in the office
 *
 * The forge also streams build logs (stdout/stderr) to connected clients
 * so the user can watch an agent's server being built in real time.
 */
import { existsSync, statSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { OfficeMCPServer, ServerMsg, MCPServerConfig } from "../shared/types.js";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

/** A registered forge server with its live process + log subscribers. */
interface ForgeEntry {
  server: OfficeMCPServer;
  proc: ChildProcessWithoutNullStreams | null;
  /** Subscribers notified on stdout/stderr lines. */
  logSubs: Set<(line: string, stream: "stdout" | "stderr") => void>;
  /** The absolute path to the entry file. */
  absEntryPath: string;
  /** The workspace dir of the building agent (cwd for the process). */
  workspaceDir: string;
}

/** Per-office forge map: roomId → Map<serverId, ForgeEntry> */
const offices = new Map<string, Map<string, ForgeEntry>>();

/** Get or create the forge map for an office. */
function getOffice(roomId: string): Map<string, ForgeEntry> {
  let office = offices.get(roomId);
  if (!office) {
    office = new Map();
    offices.set(roomId, office);
  }
  return office;
}

/** Get all registered servers for an office as OfficeMCPServer[]. */
export function listServers(roomId: string): OfficeMCPServer[] {
  const office = offices.get(roomId);
  if (!office) return [];
  return [...office.values()].map((e) => ({ ...e.server }));
}

/** Get MCPServerConfig[] for all running forge servers — for injection into agent tool loading. */
export function getServerConfigs(roomId: string): MCPServerConfig[] {
  const office = offices.get(roomId);
  if (!office) return [];
  const configs: MCPServerConfig[] = [];
  for (const entry of office.values()) {
    if (entry.server.status !== "running") continue;
    const runtime = entry.server.runtime;
    if (runtime === "node") {
      configs.push({
        command: "node",
        args: [entry.absEntryPath],
        name: entry.server.name,
        env: { MCP_SERVER: "1" },
      });
    } else {
      configs.push({
        command: "python3",
        args: [entry.absEntryPath],
        name: entry.server.name,
        env: { MCP_SERVER: "1" },
      });
    }
  }
  return configs;
}

/** Broadcast callback type — used by the forge to push updates to clients. */
export type ForgeBroadcast = (msg: ServerMsg) => void;

/** Subscribe to build logs for a specific server. Returns an unsubscribe function. */
export function subscribeBuildLogs(
  roomId: string,
  serverId: string,
  cb: (line: string, stream: "stdout" | "stderr") => void,
): () => void {
  const office = offices.get(roomId);
  const entry = office?.get(serverId);
  if (!entry) return () => {};
  entry.logSubs.add(cb);
  return () => entry.logSubs.delete(cb);
}

/**
 * Register a new MCP server built by an agent.
 * Validates the entry file, spawns the process, discovers tools, and persists.
 */
export async function registerServer(
  roomId: string,
  opts: {
    name: string;
    description: string;
    runtime: "node" | "python";
    entryFile: string;
    builtBy: string;
    builtByName: string;
    workspaceDir: string;
  },
  broadcast?: ForgeBroadcast,
): Promise<OfficeMCPServer> {
  const { name, description, runtime, entryFile, builtBy, builtByName, workspaceDir } = opts;

  // Resolve and validate the entry file path
  const absPath = isAbsolute(entryFile)
    ? resolve(entryFile)
    : resolve(workspaceDir, entryFile);

  // Security: ensure the entry file is inside the workspace dir
  const rel = relative(workspaceDir, absPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Entry file must be inside the agent workspace: ${entryFile}`);
  }

  if (!existsSync(absPath)) {
    throw new Error(`Entry file not found: ${entryFile}`);
  }
  const stat = statSync(absPath);
  if (!stat.isFile()) {
    throw new Error(`Entry path is not a file: ${entryFile}`);
  }

  const id = randomUUID();
  const server: OfficeMCPServer = {
    id,
    name: name.slice(0, 64),
    description: description.slice(0, 500),
    runtime,
    entryFile: rel,
    builtBy,
    builtByName,
    createdAt: Date.now(),
    status: "running",
    tools: [],
  };

  const entry: ForgeEntry = {
    server,
    proc: null,
    logSubs: new Set(),
    absEntryPath: absPath,
    workspaceDir,
  };

  const office = getOffice(roomId);
  office.set(id, entry);

  // Spawn the process and discover tools
  await spawnAndDiscover(roomId, entry, broadcast);

  // Persist to DB
  await persistServer(roomId, server);

  // Broadcast update
  broadcast?.({ type: "office_mcp_update", server: { ...server } });

  return { ...server };
}

/** Spawn the MCP process, initialize, and discover tools. */
async function spawnAndDiscover(roomId: string, entry: ForgeEntry, broadcast?: ForgeBroadcast): Promise<void> {
  const { server, absEntryPath, workspaceDir } = entry;
  const cmd = server.runtime === "node" ? "node" : "python3";
  const args = [absEntryPath];

  try {
    const proc = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: workspaceDir,
      env: { ...process.env, MCP_SERVER: "1" },
    });
    entry.proc = proc;

    // Stream stdout
    proc.stdout.setEncoding("utf-8");
    proc.stdout.on("data", (chunk: string) => {
      const lines = chunk.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        for (const sub of entry.logSubs) sub(trimmed, "stdout");
      }
    });

    // Stream stderr
    proc.stderr.setEncoding("utf-8");
    proc.stderr.on("data", (chunk: string) => {
      const lines = chunk.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        for (const sub of entry.logSubs) sub(trimmed, "stderr");
        if (broadcast) {
          broadcast({ type: "mcp_build_log", serverId: server.id, line: trimmed, stream: "stderr" });
        }
      }
    });

    proc.on("exit", (code) => {
      console.log(`[forge:${server.name}] process exited (code ${code})`);
      entry.proc = null;
      if (entry.server.status === "running") {
        entry.server.status = "stopped";
        broadcast?.({ type: "office_mcp_update", server: { ...entry.server } });
      }
    });

    proc.on("error", (err) => {
      console.error(`[forge:${server.name}] spawn error: ${err.message}`);
      entry.server.status = "error";
      entry.server.error = err.message;
      broadcast?.({ type: "office_mcp_update", server: { ...entry.server } });
    });

    // Initialize MCP handshake + tools/list
    const tools = await discoverTools(proc, server.name);
    entry.server.tools = tools;
    entry.server.status = "running";
    entry.server.error = undefined;

    console.log(`[forge:${server.name}] registered with ${tools.length} tools: [${tools.map((t) => t.name).join(", ")}]`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    entry.server.status = "error";
    entry.server.error = msg;
    console.error(`[forge:${server.name}] failed to start: ${msg}`);
    throw err;
  }
}

/** Perform MCP initialize + tools/list over stdio. */
async function discoverTools(
  proc: ChildProcessWithoutNullStreams,
  label: string,
): Promise<{ name: string; description: string }[]> {
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let buffer = "";

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`MCP server ${label} did not respond to tools/list within 15s`));
    }, 15_000);

    const cleanup = () => {
      clearTimeout(timeout);
      proc.stdout.removeAllListeners("data");
    };

    proc.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let msg: { id?: number; result?: unknown; error?: { message: string } };
        try {
          msg = JSON.parse(trimmed);
        } catch {
          continue;
        }
        if (msg.id != null) {
          const p = pending.get(msg.id);
          if (p) {
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error.message));
            else p.resolve(msg.result);
          }
        }
      }
    });

    const rpc = (method: string, params: unknown): Promise<unknown> => {
      const id = nextId++;
      return new Promise((res, rej) => {
        pending.set(id, { resolve: res, reject: rej });
        proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    };

    (async () => {
      try {
        // Initialize
        await rpc("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "agent-heights-forge", version: "0.1.0" },
        });
        proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");

        // List tools
        const result = (await rpc("tools/list", {})) as { tools?: { name: string; description: string }[] };
        const tools = (result.tools ?? []).map((t) => ({
          name: t.name,
          description: (t.description ?? "").slice(0, 200),
        }));

        cleanup();
        resolve(tools);
      } catch (err) {
        cleanup();
        reject(err);
      }
    })();
  });
}

/** Unregister and stop a forge server. */
export async function unregisterServer(
  roomId: string,
  serverId: string,
  broadcast?: ForgeBroadcast,
): Promise<boolean> {
  const office = offices.get(roomId);
  const entry = office?.get(serverId);
  if (!entry) return false;

  // Stop the process
  if (entry.proc) {
    entry.proc.kill("SIGTERM");
    entry.proc = null;
  }

  office!.delete(serverId);

  // Remove from DB
  await deleteServer(roomId, serverId);

  broadcast?.({ type: "office_mcp_removed", serverId });
  return true;
}

/** Stop all forge servers for an office (called on disconnect/shutdown). */
export function stopAllForOffice(roomId: string): void {
  const office = offices.get(roomId);
  if (!office) return;
  for (const entry of office.values()) {
    if (entry.proc) {
      entry.proc.kill("SIGTERM");
      entry.proc = null;
    }
  }
  office.clear();
}

/** Stop all forge servers globally (called on server shutdown). */
export function stopAllForgeServers(): void {
  for (const office of offices.values()) {
    for (const entry of office.values()) {
      if (entry.proc) {
        entry.proc.kill("SIGTERM");
        entry.proc = null;
      }
    }
    office.clear();
  }
  offices.clear();
}

// ── Persistence ──────────────────────────────────────────────────────────

async function persistServer(roomId: string, server: OfficeMCPServer): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await supabaseAdmin.from("agent_heights_office_mcp_servers").upsert({
      id: server.id,
      room_id: roomId,
      name: server.name,
      description: server.description,
      runtime: server.runtime,
      entry_file: server.entryFile,
      built_by: server.builtBy,
      built_by_name: server.builtByName,
      created_at: new Date(server.createdAt).toISOString(),
      status: server.status,
      tools: server.tools,
      error: server.error ?? null,
    });
  } catch (err) {
    console.error("[forge] failed to persist server:", err);
  }
}

async function deleteServer(roomId: string, serverId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await supabaseAdmin
      .from("agent_heights_office_mcp_servers")
      .delete()
      .eq("id", serverId)
      .eq("room_id", roomId);
  } catch (err) {
    console.error("[forge] failed to delete server:", err);
  }
}

/** Load persisted servers for an office on startup/reconnect. */
export async function loadServers(roomId: string, broadcast?: ForgeBroadcast): Promise<OfficeMCPServer[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("agent_heights_office_mcp_servers")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (error || !data) return [];

    const office = getOffice(roomId);
    const servers: OfficeMCPServer[] = [];

    for (const row of data) {
      const server: OfficeMCPServer = {
        id: row.id,
        name: row.name,
        description: row.description ?? "",
        runtime: row.runtime,
        entryFile: row.entry_file,
        builtBy: row.built_by,
        builtByName: row.built_by_name ?? "",
        createdAt: new Date(row.created_at).getTime(),
        status: "stopped", // Start as stopped — will be restarted if workspace exists
        tools: row.tools ?? [],
        error: row.error ?? undefined,
      };

      // Try to restart the server if the workspace still exists
      // We need the workspace dir — reconstruct from builtBy agent
      // For now, just register as stopped. The manager can restart on next task.
      office.set(server.id, {
        server,
        proc: null,
        logSubs: new Set(),
        absEntryPath: "", // Will be set when restarted
        workspaceDir: "",
      });

      servers.push({ ...server });
    }

    return servers;
  } catch (err) {
    console.error("[forge] failed to load servers:", err);
    return [];
  }
}

/**
 * Restart a stopped forge server given the agent's workspace dir.
 * Called by the manager when an agent starts a task and the server's builder is still in the office.
 */
export async function restartServer(
  roomId: string,
  serverId: string,
  workspaceDir: string,
  broadcast?: ForgeBroadcast,
): Promise<boolean> {
  const office = offices.get(roomId);
  const entry = office?.get(serverId);
  if (!entry) return false;

  // Reconstruct the absolute path
  entry.absEntryPath = resolve(workspaceDir, entry.server.entryFile);
  entry.workspaceDir = workspaceDir;

  if (!existsSync(entry.absEntryPath)) {
    entry.server.status = "error";
    entry.server.error = "Entry file no longer exists";
    broadcast?.({ type: "office_mcp_update", server: { ...entry.server } });
    return false;
  }

  try {
    await spawnAndDiscover(roomId, entry, broadcast);
    await persistServer(roomId, entry.server);
    broadcast?.({ type: "office_mcp_update", server: { ...entry.server } });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    entry.server.status = "error";
    entry.server.error = msg;
    broadcast?.({ type: "office_mcp_update", server: { ...entry.server } });
    return false;
  }
}
