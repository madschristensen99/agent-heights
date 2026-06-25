import { Agent } from "@cline/sdk";
import type { AgentTool } from "@cline/sdk";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProviderRunner, TaskEvent } from "./types.js";
import { truncate } from "./types.js";
import { wrapRailwayTools } from "./railway-mcp.js";

const execFileAsync = promisify(execFile);

const SWARMS_BASE_URL = "https://api.swarms.world/v1";
const SWARMS_API_KEY = process.env.SWARMS_API_KEY ?? process.env.MASTER_SWARMS_API_KEY ?? "";

/** Active Cline Agent instances keyed by agentId, for conversation continuity. */
const agents = new Map<string, Agent>();

/** Persisted message snapshots keyed by agentId, for restore after restart. */
const messageStore = new Map<string, unknown[]>();

async function makeTools(cwd: string, opts?: { railway?: boolean }): Promise<AgentTool<any, any>[]> {
  const safe = (p: string) => {
    const resolved = resolve(cwd, p);
    const rel = relative(cwd, resolved);
    if (rel.startsWith("..")) throw new Error(`Path outside workspace: ${p}`);
    return resolved;
  };

  const readFilesTool: AgentTool<any, any> = {
    name: "read_files",
    description:
      "Read the contents of one or more files. Returns each file's path and content.",
    inputSchema: {
      type: "object",
      properties: {
        paths: {
          type: "array",
          items: { type: "string" },
          description: "List of file paths relative to workspace root",
        },
      },
      required: ["paths"],
    },
    async execute(input: any) {
      const results: string[] = [];
      for (const p of input.paths as string[]) {
        try {
          const content = await readFile(safe(p), "utf-8");
          results.push(`--- ${p} ---\n${content}`);
        } catch (err) {
          results.push(`--- ${p} ---\nERROR: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return results.join("\n\n");
    },
  };

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

  const runCommandsTool: AgentTool<any, any> = {
    name: "run_commands",
    description:
      "Execute one or more shell commands in the workspace. Commands run with cwd set to the workspace root. Returns stdout+stderr for each.",
    inputSchema: {
      type: "object",
      properties: {
        commands: {
          type: "array",
          items: { type: "string" },
          description: "Shell commands to execute sequentially",
        },
      },
      required: ["commands"],
    },
    async execute(input: any, ctx: any) {
      const results: string[] = [];
      for (const cmd of input.commands as string[]) {
        if (ctx.signal?.aborted) break;
        try {
          const { stdout, stderr } = await execFileAsync(
            "bash",
            ["-c", cmd],
            { cwd, maxBuffer: 1024 * 1024 * 10, signal: ctx.signal },
          );
          const out = (stdout + (stderr ? `\n[stderr]\n${stderr}` : "")).trim();
          results.push(`$ ${cmd}\n${out || "(no output)"}`);
        } catch (err: any) {
          const msg = err.stdout
            ? `$ ${cmd}\n${err.stdout}\n[exit ${err.code ?? "?"}] ${err.stderr ?? err.message}`
            : `$ ${cmd}\n[exit ${err.code ?? "?"}] ${err.message}`;
          results.push(msg);
        }
      }
      return results.join("\n\n");
    },
  };

  const submitTool: AgentTool<any, any> = {
    name: "submit_and_exit",
    description: "Call this when the task is complete. Provide a brief summary of what was done.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Brief summary of what was accomplished" },
      },
      required: ["summary"],
    },
    lifecycle: { completesRun: true },
    async execute(input: any) {
      return input.summary;
    },
  };

  const base = [readFilesTool, writeFilesTool, listFilesTool, runCommandsTool, submitTool];

  if (opts?.railway) {
    const railwayTools = await wrapRailwayTools();
    if (railwayTools.length > 0) {
      return [...base, ...railwayTools];
    }
  }

  return base;
}

export const runCline: ProviderRunner = async function* (task, ctx) {
  if (!SWARMS_API_KEY) {
    yield {
      kind: "error",
      text: "SWARMS_API_KEY not set. Get a key at https://swarms.world/platform/api-keys and set it in your environment.",
    };
    return;
  }

  const { agentId } = ctx;

  try {
    let agent = agents.get(agentId);
    if (!agent) {
      agent = new Agent({
        providerId: "openai-compatible",
        modelId: ctx.model,
        apiKey: SWARMS_API_KEY,
        baseUrl: SWARMS_BASE_URL,
        headers: { "x-api-key": SWARMS_API_KEY },
        systemPrompt: ctx.systemPrompt,
        tools: await makeTools(ctx.cwd, { railway: ctx.railway }),
        maxIterations: ctx.settings.cline.maxIterations,
      });

      const stored = messageStore.get(agentId);
      if (stored && stored.length > 0) {
        agent.restore(stored as any);
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
      switch (event.type) {
        case "assistant-text-delta":
          // Accumulate text deltas — we yield the full message when it completes
          break;
        case "assistant-message":
          for (const part of event.message.content) {
            if (part.type === "text" && part.text.trim()) {
              lastText = part.text.trim();
              enqueue({ kind: "text", text: lastText });
            }
          }
          break;
        case "tool-started": {
          const tc = event.toolCall;
          const inputStr = truncate(JSON.stringify(tc.input ?? ""), 120);
          enqueue({ kind: "tool", text: `${tc.toolName} ${inputStr}` });
          break;
        }
        case "run-failed":
          enqueue({ kind: "error", text: truncate(event.error?.message ?? "Run failed", 300) });
          break;
      }
    });

    // Start the run (continue if session exists, otherwise fresh run)
    const runPromise = ctx.sessionId
      ? agentInstance.continue(task)
      : agentInstance.run(task);

    // Yield events as they arrive while the run is in progress
    runPromise.finally(() => {
      done = true;
      resolveQueue?.();
      resolveQueue = null;
    });

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

    unsub();

    // Get the final result
    let result;
    try {
      result = await runPromise;
    } catch {
      // Error was already yielded via run-failed event
      return;
    }

    if (result.messages.length > 0) {
      messageStore.set(agentId, [...result.messages] as any);
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
