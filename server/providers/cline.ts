import {
  Agent,
  createDefaultTools,
  createDefaultExecutors,
} from "@cline/sdk";
import type { AgentTool } from "@cline/sdk";
import { writeFile, mkdir, readdir, readFile, appendFile, unlink } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProviderRunner, TaskEvent } from "./types.js";
import { truncate } from "./types.js";
import { wrapRailwayTools } from "./railway-mcp.js";
import { loadMCPTools } from "./mcp-client.js";
import { getProviderConfig, resolveModel, hasApiKey } from "./api-config.js";

const execFileAsync = promisify(execFile);

const providerConfig = getProviderConfig();

/** Whether bubblewrap sandboxing is available (checked at startup). */
let bwrapAvailable: boolean | null = null;

async function checkBwrap(): Promise<boolean> {
  if (bwrapAvailable !== null) return bwrapAvailable;
  try {
    await execFileAsync("bwrap", ["--version"]);
    bwrapAvailable = true;
  } catch {
    bwrapAvailable = false;
  }
  return bwrapAvailable;
}

/** Wrap a shell command with bubblewrap to restrict filesystem + network access. */
function bwrapCommand(cmd: string, workspace: string, allowNetwork: boolean, extraRoBinds: string[] = []): { executable: string; args: string[] } {
  const args = [
    "--ro-bind", "/usr", "/usr",
    "--ro-bind", "/lib", "/lib",
    "--ro-bind", "/lib64", "/lib64",
    "--ro-bind", "/bin", "/bin",
    "--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf",
    "--bind", workspace, workspace,
  ];
  for (const path of extraRoBinds) {
    args.push("--ro-bind", path, path);
  }
  args.push(
    "--dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    "--unshare-all",
  );
  if (allowNetwork) {
    // Re-share the network namespace instead of unsharing it
    args.splice(args.indexOf("--unshare-all"), 1);
    args.push("--unshare-pid", "--unshare-uts", "--unshare-ipc");
  }
  args.push("/bin/bash", "-c", cmd);
  return { executable: "bwrap", args };
}

/** Active Cline Agent instances keyed by agentId, for conversation continuity. */
const agents = new Map<string, Agent>();

/** Persisted message snapshots keyed by agentId, for restore after restart. */
const messageStore = new Map<string, unknown[]>();

/** Max messages before we summarize older ones to save context window. */
const MAX_MESSAGES = 50;
/** Messages to keep verbatim after summarization. */
const KEEP_RECENT = 15;

/** Summarize older messages into a compact text block to save context window. */
function compactMessages(messages: any[]): any[] {
  if (messages.length <= MAX_MESSAGES) return messages;
  const oldMessages = messages.slice(0, messages.length - KEEP_RECENT);
  const recentMessages = messages.slice(messages.length - KEEP_RECENT);

  const summaryParts: string[] = [];
  for (const msg of oldMessages) {
    const role = msg.role ?? "unknown";
    const content = msg.content;
    if (typeof content === "string") {
      summaryParts.push(`[${role}] ${content.slice(0, 200)}`);
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "text" && part.text) {
          summaryParts.push(`[${role}] ${part.text.slice(0, 200)}`);
        } else if (part.type === "tool_use") {
          summaryParts.push(`[${role}] called ${part.name}(${JSON.stringify(part.input ?? {}).slice(0, 100)})`);
        } else if (part.type === "tool_result") {
          const resultText = typeof part.content === "string" ? part.content.slice(0, 100) : "[tool result]";
          summaryParts.push(`[${role}] tool result: ${resultText}`);
        }
      }
    }
  }

  const summaryMsg = {
    role: "user",
    content: [{ type: "text", text: `[Previous conversation summary — ${oldMessages.length} messages compacted]\n${summaryParts.join("\n")}` }],
  };

  return [summaryMsg, ...recentMessages];
}

export async function makeTools(cwd: string, opts?: {
  railway?: boolean;
  sharedCwd?: string;
  workspaceRoot?: string;
  agentId?: string;
  getBoard?: () => { id: string; title: string; status: string; assignedAgentId: string | null }[];
  claimCard?: (cardId: string, agentId: string) => boolean;
  eventFeedPath?: string;
  submitState?: { called: boolean; verified: boolean; callCount: number };
  mcpServers?: import("../../shared/types.js").MCPServerConfig[];
  onPostMessage?: (recipientFolder: string, fromFolder: string, message: string) => void;
  abortRef?: { signal: AbortSignal };
}): Promise<AgentTool<any, any>[]> {
  const safe = (p: string) => {
    const resolved = resolve(cwd, p);
    const rel = relative(cwd, resolved);
    if (rel.startsWith("..")) throw new Error(`Path outside workspace: ${p}`);
    return resolved;
  };
  const sharedCwd = opts?.sharedCwd ?? resolve(cwd, "..", "shared");
  const safeShared = (p: string) => {
    const resolved = resolve(sharedCwd, p);
    const rel = relative(sharedCwd, resolved);
    if (rel.startsWith("..")) throw new Error(`Path outside shared workspace: ${p}`);
    return resolved;
  };
  const workspaceRoot = opts?.workspaceRoot ?? resolve(cwd, "..");
  const inboxPath = resolve(cwd, "inbox.jsonl");

  // ── SDK built-in tools with default executors ──────────────────────
  const executors = createDefaultExecutors();

  // Custom submit executor — the SDK doesn't ship one in createDefaultExecutors
  executors.submit = async (summary: string) => summary;

  // Override bash executor with bubblewrap sandboxing
  const allowNetwork = !!(opts?.railway) || !!(opts?.mcpServers && opts.mcpServers.length > 0);

  // Build env with MCP auth tokens so agents can use them in bash (e.g. git clone)
  const sandboxEnv = { ...process.env };
  if (opts?.mcpServers) {
    for (const s of opts.mcpServers) {
      if (s.authToken) {
        const label = (s.name ?? "").toLowerCase();
        const url = (s.url ?? "").toLowerCase();
        if (label.includes("github") || url.includes("github")) {
          sandboxEnv.GITHUB_TOKEN = s.authToken;
          sandboxEnv.GH_TOKEN = s.authToken;
        }
      }
    }
  }

  const useBwrap = await checkBwrap();
  const originalBash = executors.bash;
  (executors as any).bash = async (input: any, ctxCwd: string, context: any) => {
    const cmd = typeof input === "string" ? input : input.command;
    const abortSignal: AbortSignal | undefined = context?.signal ?? context?.abortSignal;
    if (useBwrap) {
      const roBinds = allowNetwork && workspaceRoot !== cwd ? [workspaceRoot] : [];
      const { executable, args } = bwrapCommand(cmd, cwd, allowNetwork, roBinds);
      try {
        const { stdout, stderr } = await execFileAsync(executable, args, {
          cwd,
          maxBuffer: 10 * 1024 * 1024,
          signal: abortSignal,
          env: sandboxEnv,
        });
        return stderr ? `${stdout}\n[stderr]\n${stderr}` : stdout;
      } catch (err: any) {
        if (err.killed || abortSignal?.aborted) return "[Command aborted]";
        return `[Command failed: ${err.message}]\n${err.stdout ?? ""}\n${err.stderr ?? ""}`;
      }
    }
    // Fallback: use the original executor when bwrap is not available
    return originalBash?.(input, ctxCwd, { ...context, env: sandboxEnv }) ?? "[No bash executor available]";
  };

  const builtinTools = createDefaultTools({
    executors,
    cwd,
    enableReadFiles: true,
    enableSearch: true,
    enableBash: true,
    enableWebFetch: true,
    enableEditor: true,
    enableApplyPatch: false,
    enableSkills: true,
    enableAskQuestion: false,
    enableSubmitAndExit: false,
  });

  // Custom submit_and_exit with a general-purpose description (not coding-challenge oriented)
  const submitTool: AgentTool<any, any> = {
    name: "submit_and_exit",
    description:
      "Submit your final answer and end the task. Call this when you have completed the requested work. Provide a brief summary of what you did and what you found. Before calling this, verify your work: read back any files you created or edited to confirm they exist and contain what you intended.",
    inputSchema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          minLength: 10,
          description: "A brief summary of what you did, what you found, and the outcome of the task.",
        },
        verified: {
          type: "boolean",
          description: "Whether you have verified your work by reading back files or running checks. Set to true if you have confirmed your work is correct.",
        },
      },
      required: ["summary"],
      additionalProperties: false,
    },
    lifecycle: { completesRun: true },
    async execute(input: any) {
      if (opts?.submitState) {
        opts.submitState.called = true;
        opts.submitState.callCount++;
        opts.submitState.verified = !!input.verified;
      }
      if (!input.verified) {
        return `Your submission was NOT verified. You must actually DO the work first using your tools (write_files, bash, etc.), then read back the files to confirm they exist, and THEN call submit_and_exit with verified=true. Do not call submit_and_exit again until you have completed and verified the work.`;
      }
      return input.summary;
    },
  };

  // ── Custom tools not provided by the SDK ───────────────────────────

  const writeFilesTool: AgentTool<any, any> = {
    name: "write_files",
    description:
      "Create or overwrite one or more files. Creates parent directories as needed.",
    inputSchema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "File path relative to workspace root" },
              content: { type: "string", description: "Full file content to write" },
            },
            required: ["path", "content"],
          },
        },
      },
      required: ["files"],
    },
    async execute(input: any) {
      const results: string[] = [];
      for (const f of input.files as { path: string; content: string }[]) {
        const full = safe(f.path);
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, f.content, "utf-8");
        results.push(`Wrote ${f.path} (${f.content.length} chars)`);
      }
      return results.join("\n");
    },
  };

  const listFilesTool: AgentTool<any, any> = {
    name: "list_files",
    description: "List files and directories at a given path (relative to workspace root).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path relative to workspace root", default: "." },
      },
    },
    async execute(input: any) {
      const dir = safe(input.path ?? ".");
      const entries = await readdir(dir, { withFileTypes: true });
      return entries
        .map((e) => `${e.isDirectory() ? "[DIR] " : "      "}${e.name}`)
        .join("\n");
    },
  };

  const base = [...builtinTools, submitTool, writeFilesTool, listFilesTool];

  // ── Shared workspace tools ─────────────────────────────────────────
  const sharedReadTool: AgentTool<any, any> = {
    name: "read_shared",
    description: "Read a file from the shared workspace (collaborative area). Use for files multiple agents contribute to.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to shared workspace root" },
      },
      required: ["path"],
    },
    async execute(input: any) {
      const { readFile } = await import("node:fs/promises");
      const full = safeShared(input.path);
      return readFile(full, "utf-8");
    },
  };

  const sharedWriteTool: AgentTool<any, any> = {
    name: "write_shared",
    description: "Write a file to the shared workspace (collaborative area). Creates parent directories as needed.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to shared workspace root" },
        content: { type: "string", description: "Full file content to write" },
      },
      required: ["path", "content"],
    },
    async execute(input: any) {
      const full = safeShared(input.path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, input.content, "utf-8");
      return `Wrote ${input.path} to shared workspace (${input.content.length} chars)`;
    },
  };

  const sharedListTool: AgentTool<any, any> = {
    name: "list_shared",
    description: "List files and directories in the shared workspace (collaborative area).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path relative to shared workspace root", default: "." },
      },
    },
    async execute(input: any) {
      const dir = safeShared(input.path ?? ".");
      const entries = await readdir(dir, { withFileTypes: true });
      return entries
        .map((e) => `${e.isDirectory() ? "[DIR] " : "      "}${e.name}`)
        .join("\n");
    },
  };

  const baseWithShared = [...base, sharedReadTool, sharedWriteTool, sharedListTool];

  // ── Inter-agent messaging tools ────────────────────────────────────
  const postMessageTool: AgentTool<any, any> = {
    name: "post_message",
    description: "Send a message to a colleague. Specify their workspace directory name (e.g. 'beep-6ccfc256'). The message will appear in their inbox for their next task.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient's workspace directory name (the folder name under workspace/)" },
        message: { type: "string", description: "The message text to send" },
      },
      required: ["to", "message"],
    },
    async execute(input: any) {
      const recipientInbox = resolve(workspaceRoot, input.to, "inbox.jsonl");
      const fromFolder = cwd.split("/").pop() ?? "";
      const entry = JSON.stringify({ ts: Date.now(), from: fromFolder, message: input.message }) + "\n";
      await mkdir(dirname(recipientInbox), { recursive: true });
      await appendFile(recipientInbox, entry, "utf-8");
      opts?.onPostMessage?.(input.to, fromFolder, input.message);
      return `Message sent to ${input.to}`;
    },
  };

  const readMessagesTool: AgentTool<any, any> = {
    name: "read_messages",
    description: "Read messages from your inbox (sent by colleagues). Returns all messages and marks them as read.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      try {
        const content = await readFile(inboxPath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);
        if (lines.length === 0) return "No messages in your inbox.";
        const messages = lines.map((line) => {
          try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean);
        // Clear inbox after reading
        await unlink(inboxPath).catch(() => {});
        return messages.map((m: any) => `[${new Date(m.ts).toISOString()}] From ${m.from}: ${m.message}`).join("\n");
      } catch {
        return "No messages in your inbox.";
      }
    },
  };

  const baseWithMessaging = [...baseWithShared, postMessageTool, readMessagesTool];

  // ── Task board tools (world awareness) ─────────────────────────────
  const boardTools: AgentTool<any, any>[] = [];
  if (opts?.getBoard) {
    const readBoardTool: AgentTool<any, any> = {
      name: "read_board",
      description: "Read the office task board. Returns all task cards with their status and assignee.",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        const cards = opts.getBoard!();
        if (cards.length === 0) return "The task board is empty.";
        return cards.map((c) => `[${c.status}] ${c.id}: ${c.title} (assigned: ${c.assignedAgentId ?? "unassigned"})`).join("\n");
      },
    };
    boardTools.push(readBoardTool);
  }
  if (opts?.claimCard && opts?.agentId) {
    const claimCardTool: AgentTool<any, any> = {
      name: "claim_card",
      description: "Claim an unassigned task card from the board for yourself. The card must be in 'backlog' status and unassigned.",
      inputSchema: {
        type: "object",
        properties: {
          cardId: { type: "string", description: "The ID of the card to claim" },
        },
        required: ["cardId"],
      },
      async execute(input: any) {
        const ok = opts.claimCard!(input.cardId, opts.agentId!);
        return ok ? `Claimed card ${input.cardId}.` : `Could not claim card ${input.cardId} — it may already be assigned or not in backlog.`;
      },
    };
    boardTools.push(claimCardTool);
  }

  // ── Event feed tool ────────────────────────────────────────────────
  const eventFeedPath = opts?.eventFeedPath;
  const eventTools: AgentTool<any, any>[] = [];
  if (eventFeedPath) {
    const readEventsTool: AgentTool<any, any> = {
      name: "read_events",
      description: "Read recent office events (task completions, errors, hires, etc.). Returns the last 10 events.",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        try {
          const content = await readFile(eventFeedPath, "utf-8");
          const lines = content.trim().split("\n").filter(Boolean).slice(-10);
          if (lines.length === 0) return "No recent office events.";
          return lines.map((l) => {
            try { const e = JSON.parse(l); return `[${new Date(e.ts).toISOString()}] ${e.type}: ${e.text}`; } catch { return l; }
          }).join("\n");
        } catch {
          return "No recent office events.";
        }
      },
    };
    eventTools.push(readEventsTool);
  }

  const baseWithWorld = [...baseWithMessaging, ...boardTools, ...eventTools];

  if (opts?.railway) {
    const railwayTools = await wrapRailwayTools();
    if (railwayTools.length > 0) {
      return [...baseWithWorld, ...railwayTools];
    }
  }

  // Load tools from any MCP servers declared in the agent config (e.g. Robinhood Trading MCP)
  if (opts?.mcpServers && opts.mcpServers.length > 0) {
    const mcpTools = await loadMCPTools(opts.mcpServers, opts.abortRef);
    if (mcpTools.length > 0) {
      return [...baseWithWorld, ...mcpTools];
    }
  }

  return baseWithWorld;
}

export const runCline: ProviderRunner = async function* (task, ctx) {
  if (!hasApiKey()) {
    yield {
      kind: "error",
      text: "No API key set. Set KIMI_BACKUP_KEY or SWARMS_API_KEY in your environment.",
    };
    return;
  }

  const { agentId: rawAgentId } = ctx;
  // When using Kimi, ignore per-user Swarms keys — they won't work with the Kimi API.
  if (ctx.apiKey && providerConfig.name === "swarms") {
    providerConfig.apiKey = ctx.apiKey;
    providerConfig.headers = { "x-api-key": ctx.apiKey };
  }
  const model = resolveModel(ctx.model, providerConfig.name);
  const isChat = ctx.isChat ?? false;
  // Use a separate agent instance for chat so it doesn't inherit task tools/iterations
  const agentId = isChat ? `${rawAgentId}:chat` : rawAgentId;

  try {
    let agent = agents.get(agentId);
    const isExisting = !!agent;
    // Mutable abort ref — updated before each run so MCP tools can check abort status
    const abortRef = { signal: ctx.abort.signal };
    if (!agent) {
      const submitState = { called: false, verified: false, callCount: 0 };
      // Yuki chat with hireAgent capability gets special tools
      const yukiHireTools: AgentTool<any, any>[] = [];
      if (isChat && ctx.hireAgent) {
        yukiHireTools.push({
          name: "hire_agent",
          description: "Hire a new AI agent into the office. The agent will arrive via helicopter. Use this when the boss asks you to hire someone, bring someone in, or add an agent to the office. You can specify MCP servers for community MCP agents.",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Display name for the agent (max 24 chars)" },
              model: { type: "string", description: "Model ID (e.g. 'claude-sonnet-4-20250514', 'gpt-4o'). Default: 'claude-sonnet-4-20250514'" },
              systemPrompt: { type: "string", description: "System prompt describing the agent's role and capabilities" },
              mcpServers: {
                type: "array",
                description: "MCP server configs for community MCP agents",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    url: { type: "string", description: "Remote MCP server URL" },
                    command: { type: "string", description: "Command to run (e.g. npx)" },
                    args: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
            required: ["name"],
          },
          async execute(input: any) {
            try {
              const name = String(input.name ?? "").slice(0, 24);
              const model = String(input.model ?? "claude-sonnet-4-20250514");
              const systemPrompt = String(input.systemPrompt ?? "");
              const mcpServers = Array.isArray(input.mcpServers) ? input.mcpServers : undefined;
              const id = await ctx.hireAgent!(name, model, systemPrompt, mcpServers);
              return `Successfully hired ${name} (id: ${id}). They are arriving via helicopter now!`;
            } catch (err) {
              return `Failed to hire agent: ${err instanceof Error ? err.message : String(err)}`;
            }
          },
        });
        yukiHireTools.push({
          name: "search_community_mcps",
          description: "Search the PulseMCP community database of 22,000+ MCP servers. Returns names, descriptions, and install configs. Use this when the boss asks about tools, integrations, or capabilities not in the curated catalog.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query (e.g. 'hyperliquid', 'trading', 'database')" },
            },
            required: ["query"],
          },
          async execute(input: any) {
            try {
              const query = String(input.query ?? "").trim();
              if (!query) return "Query is required";
              const res = await fetch(`http://localhost:${process.env.PORT ?? 3001}/api/pulsemcp-search?search=${encodeURIComponent(query)}`, {
                signal: AbortSignal.timeout(10_000),
              });
              if (!res.ok) return `Search failed: HTTP ${res.status}`;
              const results = await res.json() as Array<{ name: string; description: string; source_code_url?: string; github_stars?: number; mcpConfig: { url?: string; command?: string; args?: string[]; name?: string } }>;
              if (!results.length) return `No community MCP servers found for "${query}".`;
              return results.slice(0, 10).map((r) => {
                const stars = r.github_stars ? ` (${r.github_stars}★)` : "";
                const transport = r.mcpConfig.url ? `remote: ${r.mcpConfig.url}` : r.mcpConfig.command ? `stdio: ${r.mcpConfig.command} ${(r.mcpConfig.args ?? []).join(" ")}` : "no auto-install";
                return `- ${r.name}${stars}: ${r.description.slice(0, 100)} [${transport}]${r.source_code_url ? ` (source: ${r.source_code_url})` : ""}`;
              }).join("\n");
            } catch (err) {
              return `Search failed: ${err instanceof Error ? err.message : String(err)}`;
            }
          },
        });
      }
      const tools = isChat ? yukiHireTools : await makeTools(ctx.cwd, {
        railway: ctx.railway,
        sharedCwd: ctx.sharedCwd,
        workspaceRoot: resolve(ctx.cwd, ".."),
        agentId,
        getBoard: ctx.getBoard,
        claimCard: ctx.claimCard,
        eventFeedPath: ctx.eventFeedPath,
        submitState: isChat ? undefined : submitState,
        mcpServers: ctx.mcpServers,
        onPostMessage: ctx.onPostMessage,
        abortRef,
      });
      const maxIter = isChat ? (yukiHireTools.length > 0 ? 5 : 1) : ctx.settings.cline.maxIterations;
      console.log(`[cline:${agentId}] tools: [${tools.map(t => t.name).join(", ")}] model=${ctx.model} isChat=${isChat} maxIter=${maxIter}`);
      agent = new Agent({
        providerId: "openai-compatible",
        modelId: model,
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        headers: providerConfig.headers,
        systemPrompt: ctx.systemPrompt,
        tools,
        maxIterations: maxIter,
        completionPolicy: isChat ? undefined : {
          completionGuard: () => {
            // If submit_and_exit was already called, don't prompt for it again —
            // this prevents infinite loops where the model keeps calling submit_and_exit
            if (submitState.called) {
              if (!submitState.verified && submitState.callCount <= 2) {
                return `You called submit_and_exit but did not set verified=true. Use your tools (write_files, bash, read_files, etc.) to actually DO the work, then read back the files to confirm they exist, and call submit_and_exit again with verified=true.`;
              }
              // Either verified, or already called too many times — let the run end
              return undefined as any;
            }
            return "You haven't called submit_and_exit yet. If you have completed the task, call submit_and_exit with a summary of what you did. If you still need to do work, use your tools to do it.";
          },
        },
      });

      // Restore conversation history: try in-memory cache first (same process),
      // then fall back to DB persistence (after server restart).
      let stored = messageStore.get(agentId);
      if ((!stored || stored.length === 0) && ctx.loadMessages) {
        try {
          const dbMessages = await ctx.loadMessages(agentId);
          if (dbMessages.length > 0) {
            stored = dbMessages as any[];
            messageStore.set(agentId, stored);
            console.log(`[cline:${agentId}] restored ${stored.length} messages from DB`);
          }
        } catch (err) {
          console.error(`[cline:${agentId}] loadMessages failed:`, err);
        }
      }
      if (stored && stored.length > 0) {
        const compacted = compactMessages(stored);
        if (compacted.length !== stored.length) {
          console.log(`[cline:${agentId}] compacted ${stored.length} → ${compacted.length} messages`);
        }
        agent.restore(compacted as any);
      }

      agents.set(agentId, agent);
      ctx.onSession(agentId);
    }
    const agentInstance = agent;

    // Bridge Cline's event-callback model to our async-generator model.
    const queue: TaskEvent[] = [];
    let resolveQueue: (() => void) | null = null;
    let done = false;
    let lastText = "";

    const enqueue = (ev: TaskEvent) => {
      queue.push(ev);
      resolveQueue?.();
      resolveQueue = null;
    };

    const unsub = agentInstance.subscribe((event) => {
      if (ctx.abort.signal.aborted) return;
      console.log(`[cline:${agentId}] event:`, event.type, JSON.stringify(event).slice(0, 300));
      const ev: any = event;
      switch (ev.type) {
        case "assistant-text-delta":
          // Accumulate text deltas — we yield the full message when it completes
          break;
        case "assistant-message":
          console.log(`[cline:${agentId}] assistant-message: content types=[${ev.message.content.map((p: any) => p.type).join(",")}] content=${JSON.stringify(ev.message.content).slice(0, 500)}`);
          for (const part of ev.message.content) {
            if (part.type === "text" && part.text.trim()) {
              lastText = part.text.trim();
              enqueue({ kind: "text", text: lastText });
            }
            if ((part as any).type === "tool_use") {
              console.log(`[cline:${agentId}] tool_use: ${(part as any).name} input=${JSON.stringify((part as any).input).slice(0, 200)}`);
            }
          }
          break;
        case "tool-started": {
          const tc = ev.toolCall;
          const inputStr = truncate(JSON.stringify(tc.input ?? ""), 120);
          enqueue({ kind: "tool", text: `${tc.toolName} ${inputStr}` });
          break;
        }
        case "tool-completed": {
          console.log(`[cline:${agentId}] tool-completed: ${ev.toolCall?.toolName} result=${JSON.stringify(ev.result ?? "").slice(0, 200)}`);
          break;
        }
        case "run-failed":
          console.log(`[cline:${agentId}] run-failed:`, ev.error?.message);
          enqueue({ kind: "error", text: truncate(ev.error?.message ?? "Run failed", 300) });
          break;
        case "run-completed": {
          console.log(`[cline:${agentId}] run-completed: status=${ev.result?.status} output=${ev.result?.outputText?.slice(0, 200)}`);
          break;
        }
      }
    });

    // Update abortRef so MCP tools (bound at agent creation time) use the current run's abort signal
    abortRef.signal = ctx.abort.signal;

    // Start the run — use continue() if the agent already exists (has prior messages),
    // or if a sessionId was explicitly provided. Otherwise start fresh with run().
    const runPromise = (ctx.sessionId || isExisting)
      ? agentInstance.continue(task)
      : agentInstance.run(task);

    // Yield events as they arrive while the run is in progress
    runPromise.finally(() => {
      console.log(`[cline:${agentId}] runPromise settled, done=true, queue=${queue.length}`);
      done = true;
      resolveQueue?.();
      resolveQueue = null;
    });

    // If abort fires while we're blocked waiting for events, unblock the queue
    const onAbort = () => { resolveQueue?.(); resolveQueue = null; };
    ctx.abort.signal.addEventListener("abort", onAbort, { once: true });

    while (!done || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((r) => { resolveQueue = r; });
        if (ctx.abort.signal.aborted) {
          agentInstance.abort();
          break;
        }
      }
      while (queue.length > 0) {
        const ev = queue.shift()!;
        yield ev;
      }
    }

    ctx.abort.signal.removeEventListener("abort", onAbort);
    unsub();

    // If aborted, return immediately without waiting for runPromise.
    // runPromise may be blocked on an in-flight tool call (especially MCP tools)
    // that doesn't respect the abort signal — awaiting it would hang the generator,
    // preventing the caller's for-await loop from ever checking the abort flag.
    if (ctx.abort.signal.aborted) {
      return;
    }

    // Get the final result
    let result;
    try {
      result = await runPromise;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`[cline:${agentId}] runPromise rejected:`, errMsg);
      // Yield the error if we haven't already via run-failed event
      if (!queue.some(e => e.kind === "error")) {
        yield { kind: "error", text: truncate(errMsg, 300) };
      }
      return;
    }

    if (result.messages.length > 0) {
      const msgs = [...result.messages] as any;
      messageStore.set(agentId, msgs);
      // Persist to DB for context restoration across server restarts
      if (ctx.saveMessages) {
        try {
          await ctx.saveMessages(agentId, msgs);
        } catch (err) {
          console.error(`[cline:${agentId}] saveMessages failed:`, err);
        }
      }
    }

    if (result.status === "completed") {
      const out = result.outputText?.trim();
      yield {
        kind: "result",
        text: out && out !== lastText ? out : "✓ Task complete.",
      };
    } else if (result.status === "aborted") {
      return;
    } else if (result.status === "failed" && !queue.length) {
      // Only yield error if we haven't already via run-failed event
      yield { kind: "error", text: truncate(result.error?.message ?? "Run failed", 300) };
    }
  } catch (err) {
    if (ctx.abort.signal.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    yield { kind: "error", text: `Cline agent error: ${truncate(msg, 300)}` };
  }
};

/** Clear an agent's conversation memory (called when chat is cleared). */
export function clearAgentMemory(agentId: string): void {
  agents.delete(agentId);
  messageStore.delete(agentId);
}

/** Get an agent's in-memory conversation messages (for the memory viewer). */
export function getAgentMessages(agentId: string): unknown[] {
  return messageStore.get(agentId) ?? [];
}
