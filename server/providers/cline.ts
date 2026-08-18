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
import { loadMCPTools, type OnApiErrorFn } from "./mcp-client.js";
import { isGoogleWorkspaceMcp, loadGoogleWorkspaceTools } from "./google-workspace.js";
import { loadCdpSolanaTools } from "./cdp-solana.js";
import { loadCrossmintWalletTools } from "./crossmint-wallets.js";
import { loadPremiumTools, type CircleServiceConfig, type PremiumProxyContext } from "./premium-proxy.js";
import { recordUsage } from "../usage.js";
import { loadWizardTools } from "./wizard-tools.js";
import { getProviderConfig, getVisionProviderConfig, resolveModel, hasApiKey, hasVisionApiKey, isVisionCapable } from "./api-config.js";
import { browserNavigate, browserScreenshot, browserExtractText, browserClick, browserFill } from "./browser.js";

const execFileAsync = promisify(execFile);

const providerConfig = getProviderConfig();
const visionProviderConfig = getVisionProviderConfig();

/** Use Kimi to describe a browser screenshot as text (for non-vision primary models). */
async function describeScreenshotWithKimi(base64Frame: string, agentId: string): Promise<string> {
  const visionModel = "kimi-k2.5";
  const dataUrl = `data:image/jpeg;base64,${base64Frame}`;
  const res = await fetch(`${visionProviderConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...visionProviderConfig.headers,
    },
    body: JSON.stringify({
      model: visionModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe what you see in this browser screenshot. Focus on the page layout, visible text, buttons, forms, and any errors or dialogs. Be concise but thorough." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 1024,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Kimi vision API error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content ?? "(no description)";
}

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
const MAX_MESSAGES = 30;
/** Messages to keep verbatim after summarization. */
const KEEP_RECENT = 10;
/** Rough token estimate threshold for compaction (chars ÷ 4 ≈ tokens). */
const MAX_CONTEXT_CHARS = 200_000 * 4; // 200K tokens at ~4 chars/token

/** Rough token estimate for a set of messages (chars ÷ 4). */
function estimateTokens(messages: any[]): number {
  let chars = 0;
  for (const msg of messages) {
    const content = msg.content;
    if (typeof content === "string") {
      chars += content.length;
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "text" && part.text) chars += part.text.length;
        else if (part.type === "tool_use") chars += JSON.stringify(part.input ?? {}).length;
        else if (part.type === "tool_result") {
          chars += typeof part.content === "string" ? part.content.length : 200;
        } else {
          chars += JSON.stringify(part).length;
        }
      }
    } else {
      chars += JSON.stringify(content ?? "").length;
    }
  }
  return Math.ceil(chars / 4);
}

/** Strip orphaned tool-result blocks (no matching tool-call) from user messages and
 *  unmatched tool-call blocks (no matching tool-result) from assistant messages.
 *  Prevents "Messages with role 'tool' must be a response to a preceding message with
 *  'tool_calls'" and incomplete-tool-use API errors.
 *
 *  Handles TWO message formats:
 *  1. @cline Agent internal format: tool-call (toolCallId) / tool-result (toolCallId)
 *  2. Anthropic format: tool_use (id) / tool_result (tool_use_id or tool_call_id) */
function sanitizeMessages(messages: any[]): any[] {
  // Collect all tool-call IDs from assistant messages (both formats)
  const toolCallIds = new Set<string>();
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "tool-call" && part.toolCallId) toolCallIds.add(part.toolCallId);
        if (part.type === "tool_use" && part.id) toolCallIds.add(part.id);
      }
    }
  }

  // Helper: get the tool ID from a tool-result block in any format
  const getResultId = (p: any): string | undefined =>
    p.toolCallId ?? p.tool_use_id ?? p.tool_call_id;

  // Check if a part is a tool-result in any format
  const isToolResult = (p: any): boolean =>
    p.type === "tool-result" || p.type === "tool_result";

  // Check if a part is a tool-call in any format
  const isToolCall = (p: any): boolean =>
    p.type === "tool-call" || p.type === "tool_use";

  // Get the tool-call ID from a part in any format
  const getCallId = (p: any): string | undefined =>
    p.toolCallId ?? p.id;

  // Strip orphaned tool-result blocks (no matching tool-call) from ANY message.
  // The @cline SDK creates tool-result messages with role: "tool", while Anthropic
  // format puts tool_result blocks in role: "user" messages. Check both.
  let sanitized = messages.map((msg: any) => {
    if (!Array.isArray(msg.content)) return msg;
    const hasOrphan = msg.content.some((p: any) => isToolResult(p) && getResultId(p) && !toolCallIds.has(getResultId(p)!));
    if (!hasOrphan) return msg;
    const filtered = msg.content.filter((p: any) => !(isToolResult(p) && getResultId(p) && !toolCallIds.has(getResultId(p)!)));
    if (filtered.length === 0) return null;
    return { ...msg, content: filtered };
  }).filter((m: any) => m !== null);

  // Collect all tool-result IDs that have a matching tool-call
  const toolResultIds = new Set<string>();
  for (const msg of sanitized) {
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (isToolResult(part)) {
          const id = getResultId(part);
          if (id) toolResultIds.add(id);
        }
      }
    }
  }

  // Strip unmatched tool-call blocks from ALL assistant messages.
  // compactMessages may remove the matching tool-result from a middle assistant message's pair.
  sanitized = sanitized.map((msg: any) => {
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) return msg;
    const hasUnmatched = msg.content.some((p: any) => isToolCall(p) && getCallId(p) && !toolResultIds.has(getCallId(p)!));
    if (!hasUnmatched) return msg;
    const filtered = msg.content.filter((p: any) => !(isToolCall(p) && getCallId(p) && !toolResultIds.has(getCallId(p)!)));
    if (filtered.length === 0) return null;
    return { ...msg, content: filtered };
  }).filter((m: any) => m !== null);

  return sanitized;
}

/** Summarize older messages into a compact text block to save context window. */
function compactMessages(messages: any[]): any[] {
  if (messages.length <= MAX_MESSAGES && estimateTokens(messages) <= MAX_CONTEXT_CHARS) return sanitizeMessages(messages);
  const oldMessages = messages.slice(0, messages.length - KEEP_RECENT);
  const recentMessages = sanitizeMessages(messages.slice(messages.length - KEEP_RECENT));

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
        } else if (part.type === "tool-call" || part.type === "tool_use") {
          summaryParts.push(`[${role}] called ${part.toolName ?? part.name}(${JSON.stringify(part.input ?? {}).slice(0, 100)})`);
        } else if (part.type === "tool-result" || part.type === "tool_result") {
          const out = part.output ?? part.content;
          const resultText = typeof out === "string" ? out.slice(0, 100) : "[tool result]";
          summaryParts.push(`[${role}] tool result: ${resultText}`);
        }
      }
    }
  }

  const summaryMsg = {
    role: "user",
    content: [{ type: "text", text: `[Previous conversation summary — ${oldMessages.length} messages compacted]\n${summaryParts.join("\n")}` }],
  };

  return sanitizeMessages([summaryMsg, ...recentMessages]);
}

export async function makeTools(cwd: string, opts?: {
  railway?: boolean;
  sharedCwd?: string;
  workspaceRoot?: string;
  agentId?: string;
  getBoard?: () => { id: string; title: string; status: string; assignedAgentId: string | null; category?: string }[];
  claimCard?: (cardId: string, agentId: string) => boolean;
  eventFeedPath?: string;
  submitState?: { called: boolean; verified: boolean; callCount: number };
  mcpServers?: import("../../shared/types.js").MCPServerConfig[];
  cdpSolana?: boolean;
  crossmintWallet?: boolean;
  circleServices?: CircleServiceConfig[];
  premiumProxyCtx?: PremiumProxyContext;
  onPostMessage?: (recipientFolder: string, fromFolder: string, message: string) => void;
  abortRef?: { signal: AbortSignal };
  onApiError?: OnApiErrorFn;
  createSelfSchedule?: (name: string, task: string, cronExpression: string) => string;
  listSelfSchedules?: () => { id: string; name: string; task: string; cronExpression: string; enabled: boolean; nextRunAt: number; runCount: number; lastRunAt: number | null }[];
  updateSelfSchedule?: (scheduleId: string, updates: { enabled?: boolean; name?: string; task?: string; cronExpression?: string }) => string;
  deleteSelfSchedule?: (scheduleId: string) => string;
  hireAgent?: (name: string, model: string, systemPrompt: string, mcpServers?: import("../../shared/types.js").MCPServerConfig[]) => Promise<string>;
  delegateTask?: (agentName: string, task: string) => string;
  requestHire?: (skillArea: string, reason: string) => string;
  officeState?: import("../office-state.js").OfficeState;
  agentName?: string;
  registerMcpServer?: (opts: { name: string; description: string; runtime: "node" | "python"; entryFile: string }) => Promise<{ id: string; tools: { name: string; description: string }[] }>;
  listOfficeMcp?: () => { id: string; name: string; description: string; tools: { name: string; description: string }[]; builtByName: string; status: string }[];
  wizardGithubPat?: string;
  wizardBranch?: string;
  onBroadcastHtml?: (filePath: string) => void;
  model?: string;
  requestGate?: (question: string, options: string[]) => Promise<string>;
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

  // Build a minimal env for sandboxed agent shells — never leak server secrets.
  // Only include PATH, HOME, locale, and explicitly-allowed MCP tokens.
  const sandboxEnv: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: cwd,
    LANG: "C.UTF-8",
    TERM: "dumb",
  };
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
  const isProduction = process.env.NODE_ENV === "production";
  if (!useBwrap && isProduction) {
    console.error("[security] FATAL: bubblewrap (bwrap) is not available in production — refusing to run agent commands without sandboxing.");
  }
  const originalBash = executors.bash;
  (executors as any).bash = async (input: any, ctxCwd: string, context: any) => {
    const cmd = typeof input === "string" ? input : input.command;
    const abortSignal: AbortSignal | undefined = context?.signal ?? context?.abortSignal;
    if (useBwrap) {
      const roBinds: string[] = [];
      const { executable, args } = bwrapCommand(cmd, cwd, allowNetwork, roBinds);
      try {
        const { stdout, stderr } = await execFileAsync(executable, args, {
          cwd,
          maxBuffer: 10 * 1024 * 1024,
          signal: abortSignal,
          timeout: 120_000,
          env: sandboxEnv,
        });
        return stderr ? `${stdout}\n[stderr]\n${stderr}` : stdout;
      } catch (err: any) {
        if (err.killed || abortSignal?.aborted) return "[Command aborted]";
        return `[Command failed: ${err.message}]\n${err.stdout ?? ""}\n${err.stderr ?? ""}`;
      }
    }
    // In production, refuse to run without bwrap. In dev, fall back to the original executor.
    if (isProduction) {
      return "[Security: sandbox (bubblewrap) is not available — command execution is disabled in production.]";
    }
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

  // ── Built-in browser tools (Playwright, no MCP required) ──────────
  const browserTools: AgentTool<any, any>[] = [
    {
      name: "browse_url",
      description: "Navigate your browser to a URL. Use this to open a website you need to look at or interact with. Returns the page title and final URL.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to navigate to (e.g. 'https://example.com')" },
        },
        required: ["url"],
      },
      async execute(input: any) {
        try {
          return await browserNavigate(opts?.agentId ?? "unknown", input.url);
        } catch (err) {
          return `Failed to navigate to ${input.url}: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
    {
      name: "browser_screenshot",
      description: "Take a screenshot of the current page in your browser. The screenshot is sent to your vision context so you can visually inspect the page. Use this after browse_url to see what the website looks like.",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        try {
          const frame = await browserScreenshot(opts?.agentId ?? "unknown");
          const resolvedModel = resolveModel(opts?.model ?? "deepseek-v4-flash", providerConfig.name);
          // If the primary model supports vision, return image content directly.
          if (isVisionCapable(resolvedModel)) {
            return [
              { type: "text", text: `Screenshot captured from the browser. The image is shown below for visual inspection.` },
              { type: "image", image: `data:image/jpeg;base64,${frame}`, mediaType: "image/jpeg" },
            ];
          }
          // Primary model (e.g. DeepSeek V4 Flash) doesn't support vision.
          // Use Kimi to describe the screenshot, return the text description.
          if (hasVisionApiKey()) {
            const description = await describeScreenshotWithKimi(frame, opts?.agentId ?? "unknown");
            return `Screenshot captured from the browser. Kimi vision analysis:\n\n${description}`;
          }
          // No vision provider available — return a placeholder
          return `Screenshot captured but the primary model (${resolvedModel}) does not support vision and no vision provider (KIMI_KEY) is configured. Use browser_extract_text instead to read page content.`;
        } catch (err) {
          return `Screenshot failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
    {
      name: "browser_extract_text",
      description: "Extract all visible text content from the current page. Useful for reading page content without taking a screenshot. Returns up to 8000 chars of text.",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        try {
          return await browserExtractText(opts?.agentId ?? "unknown");
        } catch (err) {
          return `Text extraction failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
    {
      name: "browser_click",
      description: "Click an element on the current page. Provide a CSS selector (e.g. 'button#submit') or visible text (e.g. 'Sign Up').",
      inputSchema: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector or visible text of the element to click" },
        },
        required: ["selector"],
      },
      async execute(input: any) {
        try {
          return await browserClick(opts?.agentId ?? "unknown", input.selector);
        } catch (err) {
          return `Click failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
    {
      name: "browser_fill",
      description: "Fill an input field on the current page with a value. Provide a CSS selector for the input element and the value to type.",
      inputSchema: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector for the input element (e.g. 'input#email')" },
          value: { type: "string", description: "The value to fill into the field" },
        },
        required: ["selector", "value"],
      },
      async execute(input: any) {
        try {
          return await browserFill(opts?.agentId ?? "unknown", input.selector, input.value);
        } catch (err) {
          return `Fill failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
  ];

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

  const broadcastToScreenTool: AgentTool<any, any> = {
    name: "broadcast_to_screen",
    description:
      "Broadcast an HTML file from your workspace to the office TV screen (projector) as an interactive iframe. The file must be a .html file in your workspace. Use this to share dashboards, reports, visualizations, or any HTML content with everyone in the room.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the .html file relative to workspace root" },
      },
      required: ["path"],
    },
    async execute(input: any) {
      if (!opts?.onBroadcastHtml) {
        return "Broadcasting is not available in this context.";
      }
      const filePath = input.path as string;
      if (!filePath.endsWith(".html") && !filePath.endsWith(".htm")) {
        return "File must be a .html or .htm file.";
      }
      // Verify file exists
      const full = safe(filePath);
      try {
        await import("node:fs/promises").then((fs) => fs.access(full));
      } catch {
        return `File not found: ${filePath}. Create the file first using write_files, then broadcast it.`;
      }
      opts.onBroadcastHtml(filePath);
      return `Broadcasting ${filePath} to the office TV screen. Everyone in the room can now see it.`;
    },
  };

  const base = [...builtinTools, ...browserTools, submitTool, writeFilesTool, listFilesTool, broadcastToScreenTool];

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
      const recipient = String(input.to ?? "").trim();
      if (!recipient || /[/\\]/.test(recipient) || recipient.startsWith(".")) {
        return `Invalid recipient: "${recipient}" — must be a single workspace directory name.`;
      }
      const recipientInbox = resolve(workspaceRoot, recipient, "inbox.jsonl");
      const relCheck = relative(workspaceRoot, recipientInbox);
      if (relCheck.startsWith("..")) {
        return `Invalid recipient: path escapes workspace root.`;
      }
      const fromFolder = cwd.split("/").pop() ?? "";
      const entry = JSON.stringify({ ts: Date.now(), from: fromFolder, message: input.message }) + "\n";
      await mkdir(dirname(recipientInbox), { recursive: true });
      await appendFile(recipientInbox, entry, "utf-8");
      const deliveryStatus = opts?.onPostMessage?.(recipient, fromFolder, input.message);
      return deliveryStatus ?? `Message sent to ${recipient}`;
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

  const waitForReplyTool: AgentTool<any, any> = {
    name: "wait_for_reply",
    description: "Wait for a colleague's reply by sleeping for the specified seconds, then checking your inbox. Use this instead of calling read_messages repeatedly. Default wait is 30 seconds. If a message arrives during the wait, it will be returned immediately.",
    inputSchema: {
      type: "object",
      properties: {
        seconds: { type: "number", description: "Seconds to wait before checking inbox (default: 30, max: 120)" },
      },
    },
    async execute(input: any) {
      const waitSec = Math.min(Math.max(Number(input.seconds) ?? 30, 5), 120);
      const waitMs = waitSec * 1000;
      const pollIntervalMs = 3000;
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        try {
          const content = await readFile(inboxPath, "utf-8");
          if (content.trim()) {
            const lines = content.trim().split("\n").filter(Boolean);
            if (lines.length > 0) {
              const messages = lines.map((line) => {
                try { return JSON.parse(line); } catch { return null; }
              }).filter(Boolean);
              await unlink(inboxPath).catch(() => {});
              return messages.map((m: any) => `[${new Date(m.ts).toISOString()}] From ${m.from}: ${m.message}`).join("\n");
            }
          }
        } catch { /* inbox doesn't exist yet */ }
        await new Promise((r) => setTimeout(r, Math.min(pollIntervalMs, deadline - Date.now())));
      }
      return `No reply received after waiting ${waitSec}s. Your inbox is still empty. You can continue with other work or try messaging the colleague again.`;
    },
  };

  const askManagerTool: AgentTool<any, any> = {
    name: "ask_manager",
    description:
      "Ask the boss (your manager) a blocking question when you need a decision before proceeding. " +
      "Provide a clear question and a list of possible options. The boss will choose one. " +
      "Use this when you're stuck on an ambiguous requirement, need approval for an approach, " +
      "or must choose between alternatives that affect the task outcome.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The question to ask the boss" },
        options: {
          type: "array",
          items: { type: "string" },
          description: "List of possible answers for the boss to choose from (2-6 options)",
          minItems: 2,
          maxItems: 6,
        },
      },
      required: ["question", "options"],
    },
    async execute(input: any) {
      if (!opts?.requestGate) {
        return "Unable to reach the boss right now. Use your best judgment to proceed.";
      }
      const question = String(input.question ?? "").trim();
      const options = Array.isArray(input.options)
        ? input.options.map((o: any) => String(o)).filter(Boolean)
        : [];
      if (!question || options.length < 2) {
        return "Invalid question or options. Provide a clear question and at least 2 options.";
      }
      try {
        const answer = await opts.requestGate(question, options);
        return `The boss answered: "${answer}"`;
      } catch {
        return "The boss didn't respond in time. Use your best judgment to proceed.";
      }
    },
  };

  const baseWithMessaging = [...baseWithShared, postMessageTool, readMessagesTool, waitForReplyTool, askManagerTool];

  // ── Task board tools (world awareness) ─────────────────────────────
  const boardTools: AgentTool<any, any>[] = [];
  if (opts?.getBoard) {
    const readBoardTool: AgentTool<any, any> = {
      name: "read_board",
      description: "Read the office task board. Returns all task cards with their status and assignee. Cards in 'paused' status were stopped by the boss and are not available for pickup — do not attempt to claim them.",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        const cards = opts.getBoard!();
        if (cards.length === 0) return "The task board is empty.";
        return cards.map((c) => `[${c.status}] ${c.id}: ${c.title} (assigned: ${c.assignedAgentId ?? "unassigned"})${c.category ? ` [category: ${c.category}]` : ""}`).join("\n");
      },
    };
    boardTools.push(readBoardTool);
  }
  if (opts?.claimCard && opts?.agentId) {
    const claimCardTool: AgentTool<any, any> = {
      name: "claim_card",
      description: "Claim an unassigned task card from the board for yourself. The card must be in 'backlog' status and unassigned. You can only claim cards whose category matches your skills (or cards with no category / 'general').",
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

  // ── Office state tools (shared coordination graph) ──────────────────
  const stateTools: AgentTool<any, any>[] = [];
  if (opts?.officeState && opts?.agentId) {
    const state = opts.officeState;
    const aid = opts.agentId;
    const aname = opts.agentName ?? aid;

    stateTools.push({
      name: "post_decision",
      description:
        "Record an architectural or strategic decision in the shared office state graph. " +
        "All agents can see active decisions via query_office_state. " +
        "Use this when you make a choice that affects the whole project (e.g. tech selection, pattern choice, API design). " +
        "If this decision supersedes a previous one, set supersedesId to the old decision's ID.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "A concise summary of the decision (max 500 chars)" },
          rationale: { type: "string", description: "Why this decision was made" },
          supersedesId: { type: "string", description: "ID of a previous decision this one replaces (optional)" },
        },
        required: ["title"],
      },
      async execute(input: any) {
        const node = state.addNode("decision", String(input.title), aid, aname, "active", input.rationale ? { rationale: String(input.rationale).slice(0, 1000) } : undefined);
        if (input.supersedesId) {
          const oldId = String(input.supersedesId);
          state.addEdge(node.id, oldId, "contradicts");
          state.updateNode(oldId, { status: "superseded" });
        }
        return `Decision recorded: [${node.id}] "${node.title}". Visible to all agents via query_office_state.`;
      },
    });

    stateTools.push({
      name: "post_blocker",
      description:
        "Report a blocker impeding progress. This is visible to all agents and the manager. " +
        "If you know which task it blocks, provide its ID — otherwise just describe the blocker.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "What is blocking you? (max 500 chars)" },
          blocksTaskId: { type: "string", description: "ID of the task this blocker prevents (optional)" },
        },
        required: ["title"],
      },
      async execute(input: any) {
        const node = state.addNode("blocker", String(input.title), aid, aname, "active");
        if (input.blocksTaskId) {
          const ok = state.addEdge(node.id, String(input.blocksTaskId), "blocks");
          if (!ok) return `Blocker recorded as [${node.id}] but could not link to task ${input.blocksTaskId} — task not found.`;
        }
        return `Blocker posted: [${node.id}] "${node.title}". The manager and colleagues can see this.`;
      },
    });

    stateTools.push({
      name: "post_observation",
      description:
        "Share a finding, discovery, or note with the office. Observations are visible to all agents. " +
        "Use this for things like: API rate limits, codebase quirks, environment details, or research results.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "The observation (max 500 chars)" },
        },
        required: ["title"],
      },
      async execute(input: any) {
        const node = state.addNode("observation", String(input.title), aid, aname, "active");
        return `Observation posted: [${node.id}] "${node.title}". Visible to all agents.`;
      },
    });

    stateTools.push({
      name: "query_office_state",
      description:
        "Query the shared office state graph. Returns a structured summary of: " +
        "active tasks, pending tasks, blocked tasks, active blockers (and what they block), " +
        "active decisions, and recent observations. Use this before starting work to understand " +
        "the current office situation and avoid duplicating effort.",
      inputSchema: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "Optional filter: 'blockers', 'decisions', 'tasks', 'observations', or omit for full summary",
          },
        },
      },
      async execute(input: any) {
        const filter = String(input.filter ?? "");
        if (filter === "blockers") {
          const blockers = state.findBlockers();
          if (blockers.length === 0) return "No active blockers in the office.";
          return blockers.map(({ blocker, blocks }) => {
            const blockedTitles = blocks.map((b) => `[${b.id}] ${b.title}`).join(", ");
            return `[${blocker.id}] ${blocker.title} (${blocker.agentName})${blockedTitles ? ` → blocking: ${blockedTitles}` : ""}`;
          }).join("\n");
        }
        if (filter === "decisions") {
          const decisions = state.getRecentDecisions(20);
          if (decisions.length === 0) return "No decisions recorded yet.";
          return decisions.map((d) => `[${d.id}] [${d.status}] ${d.title} (${d.agentName})`).join("\n");
        }
        if (filter === "tasks") {
          const tasks = state.listNodes({ type: "task", limit: 30 });
          if (tasks.length === 0) return "No tasks in the state graph.";
          return tasks.map((t) => `[${t.id}] [${t.status}] ${t.title} (${t.agentName})`).join("\n");
        }
        if (filter === "observations") {
          const obs = state.listNodes({ type: "observation", status: "active", limit: 20 });
          if (obs.length === 0) return "No active observations.";
          return obs.map((o) => `[${o.id}] ${o.title} (${o.agentName})`).join("\n");
        }
        return state.getSummary();
      },
    });

    stateTools.push({
      name: "resolve_blocker",
      description:
        "Mark a blocker as resolved. Use this when you've overcome an obstacle that was previously posted.",
      inputSchema: {
        type: "object",
        properties: {
          blockerId: { type: "string", description: "The ID of the blocker to resolve" },
          resolution: { type: "string", description: "How it was resolved (optional)" },
        },
        required: ["blockerId"],
      },
      async execute(input: any) {
        const id = String(input.blockerId);
        const node = state.getNode(id);
        if (!node || node.type !== "blocker") return `No blocker found with ID ${id}.`;
        if (node.status === "resolved") return `Blocker [${id}] is already resolved.`;
        state.updateNode(id, {
          status: "resolved",
          metadata: input.resolution ? { resolution: String(input.resolution).slice(0, 500) } : {},
        });
        return `Blocker [${id}] "${node.title}" marked as resolved.`;
      },
    });

    stateTools.push({
      name: "get_decision_trail",
      description:
        "Trace the history of a decision — see what decisions it superseded and the chain of changes. " +
        "Use this to understand why a particular architectural choice was made.",
      inputSchema: {
        type: "object",
        properties: {
          decisionId: { type: "string", description: "The ID of the decision to trace" },
        },
        required: ["decisionId"],
      },
      async execute(input: any) {
        const id = String(input.decisionId);
        const trail = state.getDecisionTrail(id);
        if (trail.length === 0) return `No decision found with ID ${id}.`;
        return trail.map((d, i) => {
          const prefix = i === 0 ? "CURRENT" : "SUPERSEDED";
          const rationale = d.metadata?.rationale ? ` — ${d.metadata.rationale.slice(0, 200)}` : "";
          return `[${prefix}] [${d.id}] ${d.title} (${d.agentName}, ${new Date(d.ts).toLocaleDateString()})${rationale}`;
        }).join("\n");
      },
    });
  }

  const baseWithWorld = [...baseWithMessaging, ...boardTools, ...eventTools, ...stateTools];

  // ── Self-scheduling tools ──────────────────────────────────────────
  const scheduleTools: AgentTool<any, any>[] = [];
  if (opts?.createSelfSchedule && opts?.agentId) {
    const createScheduleTool: AgentTool<any, any> = {
      name: "create_schedule",
      description: "Create a recurring scheduled task for yourself. The minimum frequency is every 15 minutes. Use cron expressions (5 fields: minute hour day-of-month month day-of-week). Examples: '*/15 * * * *' (every 15 min), '0 * * * *' (hourly), '0 9 * * *' (daily at 9 AM).",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "A short name for the schedule (max 100 chars)" },
          task: { type: "string", description: "The task prompt to run on the schedule (max 4000 chars)" },
          cronExpression: { type: "string", description: "5-field cron expression. Minimum interval: 15 minutes. Example: '*/15 * * * *'" },
        },
        required: ["name", "task", "cronExpression"],
      },
      async execute(input: any) {
        return opts.createSelfSchedule!(String(input.name ?? ""), String(input.task ?? ""), String(input.cronExpression ?? ""));
      },
    };
    scheduleTools.push(createScheduleTool);
  }
  if (opts?.listSelfSchedules) {
    const listSchedulesTool: AgentTool<any, any> = {
      name: "list_schedules",
      description: "List all your scheduled tasks with their status, cron expression, run count, and next run time.",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        const schedules = opts.listSelfSchedules!();
        if (schedules.length === 0) return "You have no scheduled tasks.";
        return schedules.map((s) =>
          `[${s.enabled ? "ON" : "OFF"}] ${s.id}: ${s.name} (cron: ${s.cronExpression}, runs: ${s.runCount}, next: ${new Date(s.nextRunAt).toISOString()})`
        ).join("\n");
      },
    };
    scheduleTools.push(listSchedulesTool);
  }
  if (opts?.updateSelfSchedule) {
    const updateScheduleTool: AgentTool<any, any> = {
      name: "update_schedule",
      description: "Update one of your existing scheduled tasks. You can change the name, task prompt, cron expression, or enable/disable it. Only schedules belonging to you can be modified.",
      inputSchema: {
        type: "object",
        properties: {
          scheduleId: { type: "string", description: "The ID of the schedule to update" },
          name: { type: "string", description: "New name for the schedule (optional)" },
          task: { type: "string", description: "New task prompt (optional)" },
          cronExpression: { type: "string", description: "New cron expression (optional, min 15 min interval)" },
          enabled: { type: "boolean", description: "Enable or disable the schedule (optional)" },
        },
        required: ["scheduleId"],
      },
      async execute(input: any) {
        const updates: { enabled?: boolean; name?: string; task?: string; cronExpression?: string } = {};
        if (input.enabled !== undefined) updates.enabled = Boolean(input.enabled);
        if (input.name !== undefined) updates.name = String(input.name);
        if (input.task !== undefined) updates.task = String(input.task);
        if (input.cronExpression !== undefined) updates.cronExpression = String(input.cronExpression);
        return opts.updateSelfSchedule!(String(input.scheduleId), updates);
      },
    };
    scheduleTools.push(updateScheduleTool);
  }
  if (opts?.deleteSelfSchedule) {
    const deleteScheduleTool: AgentTool<any, any> = {
      name: "delete_schedule",
      description: "Delete one of your scheduled tasks. Only schedules belonging to you can be deleted.",
      inputSchema: {
        type: "object",
        properties: {
          scheduleId: { type: "string", description: "The ID of the schedule to delete" },
        },
        required: ["scheduleId"],
      },
      async execute(input: any) {
        return opts.deleteSelfSchedule!(String(input.scheduleId));
      },
    };
    scheduleTools.push(deleteScheduleTool);
  }
  const baseWithSchedules = [...baseWithWorld, ...scheduleTools];

  // ── Agent hiring tool (only for Office Manager) ───────────
  const hireTools: AgentTool<any, any>[] = [];
  if (opts?.hireAgent) {
    const hireAgentTool: AgentTool<any, any> = {
      name: "hire_agent",
      description: "Hire a new worker into the office. Use this when the office is understaffed — all current workers are busy and there are pending tasks. Pick a name, model, and brief system prompt for the new agent.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "A short name for the new agent (max 24 chars)" },
          model: { type: "string", description: "The model to use (e.g. 'deepseek-v4-flash', 'claude-sonnet-4-20250514', 'gpt-4o')" },
          systemPrompt: { type: "string", description: "A brief system prompt describing the agent's role and expertise (max 2000 chars)" },
        },
        required: ["name", "model", "systemPrompt"],
      },
      async execute(input: any) {
        try {
          const id = await opts.hireAgent!(String(input.name).slice(0, 24), String(input.model), String(input.systemPrompt).slice(0, 2000));
          return id ? `Hired ${input.name} (id: ${id}). They're now part of the office.` : `Failed to hire ${input.name} — may have reached the agent limit.`;
        } catch (err) {
          return `Failed to hire agent: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    };
    hireTools.push(hireAgentTool);
  }
  // ── MCP Forge tools (self-built MCP servers) ─────────────────────────
  const forgeTools: AgentTool<any, any>[] = [];
  if (opts?.registerMcpServer) {
    forgeTools.push({
      name: "register_mcp_server",
      description:
        "Register an MCP server you built in your workspace. The server must speak the Model Context Protocol over stdio (JSON-RPC). " +
        "Write the server file first using write_files, then call this tool to register it. Once registered, its tools become available " +
        "to ALL agents in the office. Use 'node' runtime for JavaScript/TypeScript files, 'python' for Python files. " +
        "The entry file must be inside your workspace directory.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short name for the server (e.g. 'weather-api', 'stock-fetcher')" },
          description: { type: "string", description: "What the server does and what tools it provides" },
          runtime: { type: "string", enum: ["node", "python"], description: "Runtime to execute the entry file" },
          entryFile: { type: "string", description: "Path to the entry file (relative to your workspace, e.g. 'mcp-servers/weather.js')" },
        },
        required: ["name", "description", "runtime", "entryFile"],
      },
      async execute(input: any) {
        try {
          const name = String(input.name ?? "").trim();
          const description = String(input.description ?? "").trim();
          const runtime = String(input.runtime ?? "node") as "node" | "python";
          const entryFile = String(input.entryFile ?? "").trim();
          if (!name || !entryFile) return "Missing required fields: name and entryFile are required.";
          const result = await opts!.registerMcpServer!({ name, description, runtime, entryFile });
          return `Successfully registered MCP server '${name}' (id: ${result.id}). ` +
            `Discovered ${result.tools.length} tool(s): ${result.tools.map((t) => t.name).join(", ")}. ` +
            `These tools are now available to all agents in the office.`;
        } catch (err) {
          return `Failed to register MCP server: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    });
  }
  if (opts?.listOfficeMcp) {
    forgeTools.push({
      name: "list_office_tools",
      description:
        "List all MCP servers built by agents in this office, including their tools and status. " +
        "Use this before building a new MCP server to avoid duplicating existing capabilities.",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        const servers = opts!.listOfficeMcp!();
        if (servers.length === 0) return "No MCP servers have been built in this office yet.";
        return servers.map((s) =>
          `[${s.status}] ${s.name} (built by ${s.builtByName}): ${s.description}\n  Tools: ${s.tools.map((t) => t.name).join(", ") || "(none)"}`
        ).join("\n\n");
      },
    });
  }
  const baseWithForge = [...baseWithSchedules, ...hireTools, ...forgeTools];

  // ── Mail clerk tools (Hermes/devops only) ───────────────────────
  const mailClerkTools: AgentTool<any, any>[] = [];
  if (opts?.delegateTask) {
    mailClerkTools.push({
      name: "delegate_task",
      description:
        "Assign a task to a specific colleague in the office. Use this when you've received a message from a platform user and need to route it to the right agent. " +
        "Specify the agent's name and the task description. The task will be assigned immediately if the agent is idle, or queued if they're busy.",
      inputSchema: {
        type: "object",
        properties: {
          agentName: { type: "string", description: "The name of the colleague to assign the task to" },
          task: { type: "string", description: "The task description to assign" },
        },
        required: ["agentName", "task"],
      },
      async execute(input: any) {
        return opts.delegateTask!(String(input.agentName ?? ""), String(input.task ?? ""));
      },
    });
  }
  if (opts?.requestHire) {
    mailClerkTools.push({
      name: "request_hire",
      description:
        "Request the Office Manager to hire a new agent with specific skills. Use this when no existing agent has the right expertise for a task. " +
        "The Office Manager will review the request and hire someone if appropriate.",
      inputSchema: {
        type: "object",
        properties: {
          skillArea: { type: "string", description: "The skill area needed (e.g. 'Python backend', 'React frontend', 'data analysis')" },
          reason: { type: "string", description: "Why this hire is needed" },
        },
        required: ["skillArea", "reason"],
      },
      async execute(input: any) {
        return opts.requestHire!(String(input.skillArea ?? ""), String(input.reason ?? ""));
      },
    });
  }
  const allTools = [...baseWithForge, ...mailClerkTools];

  // Load Railway tools
  if (opts?.railway) {
    try {
      const railwayTools = await wrapRailwayTools();
      if (railwayTools.length > 0) allTools.push(...railwayTools);
    } catch (e) { console.error("[cline] Railway tools failed:", e); }
  }

  // Load tools from any MCP servers declared in the agent config (e.g. Robinhood Trading MCP)
  if (opts?.mcpServers && opts.mcpServers.length > 0) {
    // Split Google Workspace MCP servers from regular ones.
    // Google Workspace MCP servers are in Developer Preview and return permission errors
    // even with valid tokens. We bypass them by calling the Google REST APIs directly.
    const googleServers = opts.mcpServers.filter(s => isGoogleWorkspaceMcp(s.url));
    const otherServers = opts.mcpServers.filter(s => !isGoogleWorkspaceMcp(s.url));

    // Load direct REST tools for Google Workspace services
    if (googleServers.length > 0) {
      try {
        const gwTools = await loadGoogleWorkspaceTools(googleServers, opts.onApiError);
        if (gwTools.length > 0) allTools.push(...gwTools);
      } catch (e) { console.error("[cline] Google Workspace direct tools failed:", e); }
    }

    // Load regular MCP tools for non-Google servers
    if (otherServers.length > 0) {
      try {
        const mcpTools = await loadMCPTools(otherServers, opts.abortRef, opts.onApiError);
        if (mcpTools.length > 0) allTools.push(...mcpTools);
      } catch (e) { console.error("[cline] MCP tools failed:", e); }
    }
  }

  // Load CDP Solana wallet tools (auto-provisioned, no user credentials needed)
  if (opts?.cdpSolana && opts?.agentId) {
    try {
      const cdpTools = await loadCdpSolanaTools(opts.agentId);
      if (cdpTools.length > 0) allTools.push(...cdpTools);
    } catch (e) { console.error("[cline] CDP Solana tools failed:", e); }
  }

  // Load Crossmint multi-chain wallet tools (auto-provisioned, gas sponsored)
  if (opts?.crossmintWallet && opts?.agentId) {
    try {
      const crossmintTools = await loadCrossmintWalletTools(opts.agentId);
      if (crossmintTools.length > 0) allTools.push(...crossmintTools);
    } catch (e) { console.error("[cline] Crossmint tools failed:", e); }
  }

  // Load premium Circle x402 API tools (paid via Gateway, costs flow into usage budget)
  if (opts?.circleServices && opts.circleServices.length > 0 && opts?.premiumProxyCtx) {
    try {
      const premiumTools = await loadPremiumTools(opts.circleServices, opts.premiumProxyCtx);
      if (premiumTools.length > 0) allTools.push(...premiumTools);
    } catch (e) { console.error("[cline] Premium tools failed:", e); }
  }

  // Load Wizard GitHub tools (server-side PAT, world branch file operations)
  if (opts?.wizardGithubPat && opts?.wizardBranch) {
    try {
      const wizardTools = await loadWizardTools({ pat: opts.wizardGithubPat, branch: opts.wizardBranch });
      if (wizardTools.length > 0) allTools.push(...wizardTools);
    } catch (e) { console.error("[cline] Wizard tools failed:", e); }
  }

  return allTools;
}

export const runCline: ProviderRunner = async function* (task, ctx) {
  if (!hasApiKey()) {
    yield {
      kind: "error",
      text: "No API key set. Set DEEPSEEK_KEY in your environment.",
    };
    return;
  }

  const { agentId: rawAgentId } = ctx;
  const model = resolveModel(ctx.model, providerConfig.name);
  const isChat = ctx.isChat ?? false;
  // Use a separate agent instance for chat so it doesn't inherit task tools/iterations
  const agentId = isChat ? `${rawAgentId}:chat` : rawAgentId;

  // Fresh start: wipe the existing Agent instance + message store so a new
  // conversation begins. The manager injects a memory summary via systemPrompt.
  if (ctx.freshStart) {
    agents.delete(agentId);
    messageStore.delete(agentId);
  }

  try {
    let agent = agents.get(agentId);
    const isExisting = !!agent && !ctx.freshStart;
    // Mutable abort ref — updated before each run so MCP tools can check abort status
    const abortRef = { signal: ctx.abort.signal };
    if (!agent) {
      const submitState = { called: false, verified: false, callCount: 0 };
      // Office Manager chat with hireAgent capability gets special tools
      const officeManagerHireTools: AgentTool<any, any>[] = [];
      if (isChat && ctx.hireAgent) {
        officeManagerHireTools.push({
          name: "hire_agent",
          description: "Hire a new AI agent into the office. The agent will arrive via helicopter. Use this when the boss asks you to hire someone, bring someone in, or add an agent to the office. You can specify MCP servers for community MCP agents.",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Display name for the agent (max 24 chars)" },
              model: { type: "string", description: "Model ID for the agent. Defaults to the standard model." },
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
              const model = String(input.model ?? "deepseek-v4-flash");
              const systemPrompt = String(input.systemPrompt ?? "");
              const mcpServers = Array.isArray(input.mcpServers) ? input.mcpServers : undefined;
              const id = await ctx.hireAgent!(name, model, systemPrompt, mcpServers);
              return `Successfully hired ${name} (id: ${id}). They are arriving via helicopter now!`;
            } catch (err) {
              return `Failed to hire agent: ${err instanceof Error ? err.message : String(err)}`;
            }
          },
        });
        officeManagerHireTools.push({
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
      // Wizard chat: load GitHub tools so the Wizard can modify the world branch during chat
      const wizardChatTools: AgentTool<any, any>[] = [];
      if (isChat && ctx.wizardGithubPat && ctx.wizardBranch) {
        const wt = await loadWizardTools({ pat: ctx.wizardGithubPat, branch: ctx.wizardBranch });
        wizardChatTools.push(...wt);
      }
      // Chat: load MCP tools (e.g. Google Calendar, Gmail) so agents can answer questions
      // using their connected services, not just role-play as office characters.
      const chatMcpTools: AgentTool<any, any>[] = [];
      if (isChat && ctx.mcpServers && ctx.mcpServers.length > 0) {
        try {
          const googleServers = ctx.mcpServers.filter(s => isGoogleWorkspaceMcp(s.url));
          const otherServers = ctx.mcpServers.filter(s => !isGoogleWorkspaceMcp(s.url));
          if (googleServers.length > 0) {
            const gwTools = await loadGoogleWorkspaceTools(googleServers, ctx.onApiError);
            chatMcpTools.push(...gwTools);
          }
          if (otherServers.length > 0) {
            const mcpTools = await loadMCPTools(otherServers, abortRef, ctx.onApiError);
            chatMcpTools.push(...mcpTools);
          }
        } catch (e) { console.error(`[cline:${agentId}] chat MCP tools failed:`, e); }
      }
      const tools = isChat
        ? [...wizardChatTools, ...officeManagerHireTools, ...chatMcpTools]
        : await makeTools(ctx.cwd, {
        railway: ctx.railway,
        sharedCwd: ctx.sharedCwd,
        workspaceRoot: resolve(ctx.cwd, ".."),
        agentId,
        model: ctx.model,
        getBoard: ctx.getBoard,
        claimCard: ctx.claimCard,
        eventFeedPath: ctx.eventFeedPath,
        submitState: isChat ? undefined : submitState,
        mcpServers: ctx.mcpServers,
        cdpSolana: ctx.cdpSolana,
        crossmintWallet: ctx.crossmintWallet,
        circleServices: ctx.circleServices,
        premiumProxyCtx: ctx.circleServices && ctx.circleServices.length > 0 ? {
          userId: ctx.userId ?? "",
          agentId,
          agentName: ctx.agentName ?? "",
          subscriptionTier: ctx.subscriptionTier ?? null,
          onPremiumUsage: (params) => {
            // Record premium API cost to api_usage_records — flows into monthly spend
            recordUsage({
              userId: params.userId,
              agentId: params.agentId,
              agentName: params.agentName,
              model: `circle:${params.serviceName}`,
              provider: "circle-gateway",
              inputTokens: 0,
              outputTokens: 0,
              totalCost: params.cost,
              task: params.task,
              isChat: false,
            });
          },
        } : undefined,
        onPostMessage: ctx.onPostMessage,
        abortRef,
        onApiError: ctx.onApiError,
        createSelfSchedule: ctx.createSelfSchedule,
        listSelfSchedules: ctx.listSelfSchedules,
        updateSelfSchedule: ctx.updateSelfSchedule,
        deleteSelfSchedule: ctx.deleteSelfSchedule,
        hireAgent: ctx.hireAgent,
        delegateTask: ctx.delegateTask,
        requestHire: ctx.requestHire,
        officeState: ctx.officeState,
        agentName: ctx.agentName,
        registerMcpServer: ctx.registerMcpServer,
        listOfficeMcp: ctx.listOfficeMcp,
        wizardGithubPat: ctx.wizardGithubPat,
        wizardBranch: ctx.wizardBranch,
        onBroadcastHtml: ctx.onBroadcastHtml,
        requestGate: ctx.requestGate,
      });
      const maxIter = isChat
        ? (wizardChatTools.length > 0 ? 10
           : chatMcpTools.length > 0 ? 10
           : officeManagerHireTools.length > 0 ? 5
           : 1)
        : ctx.settings.cline.maxIterations;
      console.log(`[cline:${agentId}] tools: [${tools.map(t => t.name).join(", ")}] model=${ctx.model} isChat=${isChat} maxIter=${maxIter}`);
      agent = new Agent({
        providerId: "deepseek",
        modelId: model,
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        headers: providerConfig.headers,
        options: { thinking: false },
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
      // Skip restore entirely on freshStart — the manager injects a summary via systemPrompt.
      let stored = ctx.freshStart ? undefined : messageStore.get(agentId);
      if (!ctx.freshStart && (!stored || stored.length === 0) && ctx.loadMessages) {
        try {
          const dbMessages = await ctx.loadMessages(agentId);
          if (dbMessages.length > 0) {
            stored = sanitizeMessages(dbMessages as any[]);
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
        // Final safety pass: strip any orphaned tool_result/tool_use that survived compaction
        const safe = sanitizeMessages(compacted);
        if (safe.length !== compacted.length) {
          console.log(`[cline:${agentId}] sanitized ${compacted.length} → ${safe.length} messages (stripped orphaned tool calls)`);
        }
        agent.restore(safe as any);
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
    let toolHeartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const enqueue = (ev: TaskEvent) => {
      queue.push(ev);
      resolveQueue?.();
      resolveQueue = null;
    };

    const unsub = agentInstance.subscribe((event) => {
      if (ctx.abort.signal.aborted) return;
      const ev: any = event;
      // Skip logging for high-frequency streaming events to avoid console spam
      const noisyEvents = new Set(["assistant-reasoning-delta", "assistant-text-delta", "usage-updated"]);
      if (!noisyEvents.has(ev.type)) {
        console.log(`[cline:${agentId}] event:`, ev.type, JSON.stringify(event).slice(0, 300));
      }
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
            if ((part as any).type === "tool-call" || (part as any).type === "tool_use") {
              console.log(`[cline:${agentId}] tool-call: ${(part as any).toolName ?? (part as any).name} input=${JSON.stringify((part as any).input).slice(0, 200)}`);
            }
          }
          break;
        case "tool-started": {
          const tc = ev.toolCall;
          const inputStr = truncate(JSON.stringify(tc.input ?? ""), 120);
          enqueue({ kind: "tool", text: `${tc.toolName} ${inputStr}` });
          // Emit heartbeats every 15s during long tool executions to prevent
          // the manager's 90s idle timer from false-aborting agents running
          // slow operations (npm install, git clone, long MCP API calls).
          if (toolHeartbeatTimer) clearInterval(toolHeartbeatTimer);
          const toolName = tc.toolName;
          toolHeartbeatTimer = setInterval(() => {
            if (ctx.abort.signal.aborted) return;
            enqueue({ kind: "heartbeat", text: `running ${toolName}` });
          }, 15_000);
          break;
        }
        case "tool-finished": {
          if (toolHeartbeatTimer) { clearInterval(toolHeartbeatTimer); toolHeartbeatTimer = null; }
          console.log(`[cline:${agentId}] tool-finished: ${ev.toolCall?.toolName} result=${JSON.stringify(ev.message?.content?.[0]?.output ?? "").slice(0, 200)}`);
          break;
        }
        case "run-failed":
          console.log(`[cline:${agentId}] run-failed:`, ev.error?.message);
          enqueue({ kind: "error", text: truncate(ev.error?.message ?? "Run failed", 300) });
          break;
        case "run-finished": {
          console.log(`[cline:${agentId}] run-finished: status=${ev.result?.status} output=${ev.result?.outputText?.slice(0, 200)}`);
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
    if (toolHeartbeatTimer) { clearInterval(toolHeartbeatTimer); toolHeartbeatTimer = null; }

    // If aborted, return immediately without waiting for runPromise.
    // runPromise may be blocked on an in-flight tool call (especially MCP tools)
    // that doesn't respect the abort signal — awaiting it would hang the generator,
    // preventing the caller's for-await loop from ever checking the abort flag.
    if (ctx.abort.signal.aborted) {
      // Clear the cached Agent instance — its underlying SDK run may still be
      // settling (MCP tools often don't respect abort).  Without this, the next
      // task reuses the same instance and the SDK throws "Agent runtime is
      // already running".  Messages are preserved in messageStore / DB and will
      // be restored when a fresh Agent is created for the next task.
      agents.delete(agentId);
      return;
    }

    // Get the final result
    let result;
    try {
      result = await runPromise;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`[cline:${agentId}] runPromise rejected:`, errMsg);
      // Clear the cached Agent instance — its internal conversation state may be
      // corrupted (incomplete tool_use, orphaned tool_result).  Without this, the
      // next task reuses the same instance and hits "tool_call_id is not found".
      agents.delete(agentId);
      // Yield the error if we haven't already via run-failed event
      if (!queue.some(e => e.kind === "error")) {
        yield { kind: "error", text: truncate(errMsg, 300) };
      }
      return;
    }

    if (result.messages.length > 0) {
      const rawMsgs = [...result.messages] as any;
      const msgs = sanitizeMessages(rawMsgs);
      if (msgs.length !== rawMsgs.length) {
        console.log(`[cline:${agentId}] sanitized ${rawMsgs.length} → ${msgs.length} messages after run — clearing cached agent to prevent orphaned tool messages on next continue()`);
        agents.delete(agentId);
      }
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

    // Report token usage for spend tracking
    if (ctx.onUsage && result.usage) {
      const u = result.usage as any;
      ctx.onUsage({
        inputTokens: u.inputTokens ?? 0,
        outputTokens: u.outputTokens ?? 0,
        cacheReadTokens: u.cacheReadTokens ?? 0,
        cacheWriteTokens: u.cacheWriteTokens ?? 0,
        totalCost: u.totalCost,
      });
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
    yield { kind: "error", text: `Agent error: ${truncate(msg, 300)}` };
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
