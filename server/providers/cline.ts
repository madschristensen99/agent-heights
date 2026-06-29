import {
  Agent,
  createDefaultTools,
  createDefaultExecutors,
} from "@cline/sdk";
import type { AgentTool } from "@cline/sdk";
import { writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProviderRunner, TaskEvent } from "./types.js";
import { truncate } from "./types.js";
import { wrapRailwayTools } from "./railway-mcp.js";

const execFileAsync = promisify(execFile);

const SWARMS_BASE_URL = "https://api.swarms.world/v1";
const SWARMS_API_KEY = process.env.SWARMS_API_KEY ?? process.env.MASTER_SWARMS_API_KEY ?? "";

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
function bwrapCommand(cmd: string, workspace: string, allowNetwork: boolean): { executable: string; args: string[] } {
  const args = [
    "--ro-bind", "/usr", "/usr",
    "--ro-bind", "/lib", "/lib",
    "--ro-bind", "/lib64", "/lib64",
    "--ro-bind", "/bin", "/bin",
    "--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf",
    "--bind", workspace, workspace,
    "--dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    "--unshare-all",
  ];
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

async function makeTools(cwd: string, opts?: { railway?: boolean }): Promise<AgentTool<any, any>[]> {
  const safe = (p: string) => {
    const resolved = resolve(cwd, p);
    const rel = relative(cwd, resolved);
    if (rel.startsWith("..")) throw new Error(`Path outside workspace: ${p}`);
    return resolved;
  };

  // ── SDK built-in tools with default executors ──────────────────────
  const executors = createDefaultExecutors();

  // Custom submit executor — the SDK doesn't ship one in createDefaultExecutors
  executors.submit = async (summary: string) => summary;

  // Override bash executor with bubblewrap sandboxing
  const allowNetwork = opts?.railway ?? false;
  const useBwrap = await checkBwrap();
  const originalBash = executors.bash;
  (executors as any).bash = async (input: any, ctxCwd: string, context: any) => {
    const cmd = typeof input === "string" ? input : input.command;
    const abortSignal: AbortSignal | undefined = context?.signal ?? context?.abortSignal;
    if (useBwrap) {
      const { executable, args } = bwrapCommand(cmd, cwd, allowNetwork);
      try {
        const { stdout, stderr } = await execFileAsync(executable, args, {
          cwd,
          maxBuffer: 10 * 1024 * 1024,
          signal: abortSignal,
        });
        return stderr ? `${stdout}\n[stderr]\n${stderr}` : stdout;
      } catch (err: any) {
        if (err.killed || abortSignal?.aborted) return "[Command aborted]";
        return `[Command failed: ${err.message}]\n${err.stdout ?? ""}\n${err.stderr ?? ""}`;
      }
    }
    // Fallback: use the original executor when bwrap is not available
    return originalBash?.(input, ctxCwd, context) ?? "[No bash executor available]";
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
    enableSkills: false,
    enableAskQuestion: false,
    enableSubmitAndExit: false,
  });

  // Custom submit_and_exit with a general-purpose description (not coding-challenge oriented)
  const submitTool: AgentTool<any, any> = {
    name: "submit_and_exit",
    description:
      "Submit your final answer and end the task. Call this when you have completed the requested work. Provide a brief summary of what you did and what you found.",
    inputSchema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          minLength: 10,
          description: "A brief summary of what you did, what you found, and the outcome of the task.",
        },
      },
      required: ["summary"],
      additionalProperties: false,
    },
    lifecycle: { completesRun: true },
    async execute(input: any) {
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
  const apiKey = ctx.apiKey ?? SWARMS_API_KEY;

  try {
    let agent = agents.get(agentId);
    if (!agent) {
      agent = new Agent({
        providerId: "openai-compatible",
        modelId: ctx.model,
        apiKey,
        baseUrl: SWARMS_BASE_URL,
        headers: { "x-api-key": apiKey },
        systemPrompt: ctx.systemPrompt,
        tools: await makeTools(ctx.cwd, { railway: ctx.railway }),
        maxIterations: ctx.settings.cline.maxIterations,
        completionPolicy: {
          completionGuard: () => "You haven't called submit_and_exit yet. If you have completed the task, call submit_and_exit with a summary of what you did. If you still need to do work, use your tools to do it.",
        },
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
      console.log(`[cline:${agentId}] event:`, event.type, JSON.stringify(event).slice(0, 300));
      const ev: any = event;
      switch (ev.type) {
        case "assistant-text-delta":
          // Accumulate text deltas — we yield the full message when it completes
          break;
        case "assistant-message":
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

    // Start the run (continue if session exists, otherwise fresh run)
    const runPromise = ctx.sessionId
      ? agentInstance.continue(task)
      : agentInstance.run(task);

    // Yield events as they arrive while the run is in progress
    runPromise.finally(() => {
      console.log(`[cline:${agentId}] runPromise settled, done=true, queue=${queue.length}`);
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
    } catch (err) {
      console.log(`[cline:${agentId}] runPromise rejected:`, err instanceof Error ? err.message : String(err));
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
