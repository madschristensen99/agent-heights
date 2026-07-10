import type { AgentTool } from "@cline/sdk";
import { resolve } from "node:path";
import type { ProviderRunner } from "./types.js";
import { truncate } from "./types.js";
import { makeTools } from "./cline.js";

const SWARMS_BASE_URL = "https://api.swarms.world/v1";
const SWARMS_API_KEY = process.env.SWARMS_API_KEY ?? process.env.MASTER_SWARMS_API_KEY ?? "";

// ── Conversation store (keyed by agentId) ────────────────────────────────
interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
}

const conversations = new Map<string, ChatMessage[]>();

/** Clear an agent's conversation memory. */
export function clearTextToolMemory(agentId: string): void {
  conversations.delete(agentId);
}

// ── Tool description injection ────────────────────────────────────────────

const TOOL_OPEN = "<<tool_call";
const TOOL_CLOSE = ">>";

function buildToolPrompt(tools: AgentTool<any, any>[]): string {
  const lines: string[] = [
    "",
    "## Tools",
    "",
    "You have tools available. To call a tool, output a block in this exact format:",
    "",
    "```",
    TOOL_OPEN,
    "name: <tool_name>",
    "input: <json arguments matching the tool schema>",
    TOOL_CLOSE,
    "```",
    "",
    "You can call one tool per turn. After each tool call, you will receive the result and can continue.",
    "Available tools:",
    "",
  ];

  for (const tool of tools) {
    const schema = tool.inputSchema as any;
    const props = schema?.properties ?? {};
    const required = (schema?.required ?? []) as string[];
    const propList = Object.entries(props)
      .map(([key, val]: [string, any]) => {
        const req = required.includes(key) ? " (required)" : "";
        const desc = val.description ? ` — ${val.description}` : "";
        return `  - ${key} (${val.type ?? "any"})${req}${desc}`;
      })
      .join("\n");
    lines.push(`### ${tool.name}`);
    lines.push(`Description: ${tool.description ?? ""}`);
    if (propList) lines.push(`Parameters:\n${propList}`);
    lines.push("");
  }

  lines.push(
    "When you have completed the task, call the `submit_and_exit` tool with a summary of what you did.",
    "Always set verified=true if you have actually done the work.",
  );

  return lines.join("\n");
}

// ── Tool call parsing ─────────────────────────────────────────────────────

interface ParsedToolCall {
  name: string;
  input: Record<string, unknown>;
  raw: string;
}

function parseToolCalls(text: string): { calls: ParsedToolCall[]; cleanText: string } {
  const calls: ParsedToolCall[] = [];
  const pattern = new RegExp(
    escapeRegex(TOOL_OPEN) + "\\s*\\n([\\s\\S]*?)\\n\\s*" + escapeRegex(TOOL_CLOSE),
    "g",
  );

  let cleanText = text;
  let match: RegExpExecArray | null;
  const matched: string[] = [];

  while ((match = pattern.exec(text)) !== null) {
    const body = match[1].trim();
    const fullMatch = match[0];
    matched.push(fullMatch);

    const nameMatch = body.match(/^name:\s*(.+)$/m);
    const inputMatch = body.match(/^input:\s*([\s\S]+)$/m);

    if (nameMatch) {
      const name = nameMatch[1].trim();
      let input: Record<string, unknown> = {};
      if (inputMatch) {
        const inputStr = inputMatch[1].trim();
        try {
          input = JSON.parse(inputStr);
        } catch {
          input = { _raw: inputStr };
        }
      }
      calls.push({ name, input, raw: fullMatch });
    }
  }

  // Remove tool call blocks from the text shown to the user
  for (const m of matched) {
    cleanText = cleanText.replace(m, "");
  }
  cleanText = cleanText.replace(/\n{3,}/g, "\n\n").trim();

  return { calls, cleanText };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Swarms API call ───────────────────────────────────────────────────────

async function callSwarms(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  signal: AbortSignal,
): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number } }> {
  const response = await fetch(`${SWARMS_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content, name: m.name })),
      max_tokens: 4096,
      temperature: 0.7,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Swarms API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content ?? "";
  const usage = {
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
  return { content, usage };
}

// ── Provider runner ───────────────────────────────────────────────────────

export const runTextTools: ProviderRunner = async function* (task, ctx) {
  if (!SWARMS_API_KEY) {
    yield {
      kind: "error",
      text: "SWARMS_API_KEY not set. Get a key at https://swarms.world/platform/api-keys and set it in your environment.",
    };
    return;
  }

  const apiKey = ctx.apiKey ?? SWARMS_API_KEY;
  const isChat = ctx.isChat ?? false;
  const agentId = isChat ? `${ctx.agentId}:chat` : ctx.agentId;

  try {
    // Get or create conversation history
    let history = conversations.get(agentId);
    if (!history) {
      history = [];
      conversations.set(agentId, history);
    }

    // Build tools (reuse the same tool factory from cline.ts)
    const tools = isChat ? [] : await makeTools(ctx.cwd, {
      railway: ctx.railway,
      sharedCwd: ctx.sharedCwd,
      workspaceRoot: resolve(ctx.cwd, ".."),
      agentId,
      getBoard: ctx.getBoard,
      claimCard: ctx.claimCard,
      eventFeedPath: ctx.eventFeedPath,
    });

    // Build system prompt with tool descriptions
    const toolPrompt = tools.length > 0 ? buildToolPrompt(tools) : "";
    const systemPrompt = ctx.systemPrompt + (isChat ? "" : toolPrompt);

    // Initialize system message
    if (history.length === 0 || history[0].role !== "system") {
      history.unshift({ role: "system", content: systemPrompt });
    } else {
      history[0].content = systemPrompt;
    }

    // Add the user task
    history.push({ role: "user", content: task });

    // Notify session
    ctx.onSession(agentId);

    const maxIter = isChat ? 1 : ctx.settings.cline.maxIterations;
    let submitted = false;
    let lastText = "";

    for (let iter = 0; iter < maxIter; iter++) {
      if (ctx.abort.signal.aborted) return;

      console.log(`[text-tools:${agentId}] iteration ${iter + 1}/${maxIter}`);

      // Call the API
      let result: { content: string; usage: { inputTokens: number; outputTokens: number } };
      try {
        result = await callSwarms(ctx.model, history, apiKey, ctx.abort.signal);
      } catch (err) {
        if (ctx.abort.signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        yield { kind: "error", text: truncate(msg, 300) };
        return;
      }

      const assistantText = result.content.trim();
      if (!assistantText) {
        yield { kind: "error", text: "Model returned empty response." };
        return;
      }

      // Add assistant message to history
      history.push({ role: "assistant", content: assistantText });

      // Parse tool calls from the text
      const { calls, cleanText } = parseToolCalls(assistantText);

      // Yield visible text (without tool call blocks)
      if (cleanText) {
        lastText = cleanText;
        yield { kind: "text", text: cleanText };
      }

      // No tool calls — either chat mode, task complete, or need a nudge
      if (calls.length === 0) {
        if (isChat) {
          yield { kind: "result", text: lastText || "✓ Chat complete." };
          return;
        }

        if (submitted) {
          yield { kind: "result", text: lastText || "✓ Task complete." };
          return;
        }

        // Nudge the model to use tools or submit
        history.push({
          role: "user",
          content:
            "You haven't called any tools yet. If you have completed the task, call the submit_and_exit tool with a summary. If you still need to do work, use your tools to do it.",
        });
        continue;
      }

      // Execute tool calls
      for (const call of calls) {
        if (ctx.abort.signal.aborted) return;

        const inputStr = truncate(JSON.stringify(call.input), 120);
        yield { kind: "tool", text: `${call.name} ${inputStr}` };

        // Find the tool
        const tool = tools.find((t: AgentTool<any, any>) => t.name === call.name);
        if (!tool) {
          const errMsg = `Unknown tool: ${call.name}`;
          yield { kind: "error", text: errMsg };
          history.push({ role: "tool", name: call.name, content: `Error: ${errMsg}` });
          continue;
        }

        // Check for submit_and_exit
        if (call.name === "submit_and_exit") {
          submitted = true;
          const summary = (call.input.summary as string) ?? "Task complete.";
          const verified = call.input.verified as boolean;
          if (!verified) {
            const nudge =
              "Your submission was NOT verified. You must actually DO the work first using your tools (write_files, bash, read_files, etc.), then read back the files to confirm they exist, and THEN call submit_and_exit with verified=true.";
            history.push({ role: "tool", name: call.name, content: nudge });
            yield { kind: "text", text: nudge };
            continue;
          }
          history.push({ role: "tool", name: call.name, content: summary });
          lastText = summary;
          continue;
        }

        // Execute the tool
        try {
          const toolResult = await tool.execute(call.input, {
            agentId,
            iteration: iter,
            signal: ctx.abort.signal,
          });
          const resultStr = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
          const truncated = truncate(resultStr, 2000);
          history.push({ role: "tool", name: call.name, content: truncated });
          console.log(`[text-tools:${agentId}] tool ${call.name} result: ${truncated.slice(0, 100)}`);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          yield { kind: "error", text: truncate(errMsg, 300) };
          history.push({ role: "tool", name: call.name, content: `Error: ${errMsg}` });
        }
      }

      // If submit_and_exit was called and verified, we're done
      if (submitted) {
        yield { kind: "result", text: lastText || "✓ Task complete." };
        return;
      }
    }

    // Hit max iterations
    if (!submitted && !isChat) {
      yield {
        kind: "result",
        text: lastText || "Reached maximum iterations without completing.",
      };
    }
  } catch (err) {
    if (ctx.abort.signal.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    yield { kind: "error", text: `Text-tools agent error: ${truncate(msg, 300)}` };
  }
};
