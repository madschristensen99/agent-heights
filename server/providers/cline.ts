import {
  Agent,
  createDefaultTools,
  createDefaultExecutors,
} from "@cline/sdk";
import type { AgentTool } from "@cline/sdk";
import { writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import type { ProviderRunner, TaskEvent } from "./types.js";
import { truncate } from "./types.js";
import { wrapRailwayTools } from "./railway-mcp.js";

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

  // ── SDK built-in tools with default executors ──────────────────────
  const executors = createDefaultExecutors();

  // Custom submit executor — the SDK doesn't ship one in createDefaultExecutors
  executors.submit = async (summary: string) => summary;

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
    enableSubmitAndExit: true,
  });

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

  const base = [...builtinTools, writeFilesTool, listFilesTool];

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
