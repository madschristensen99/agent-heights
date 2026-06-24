import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ProviderRunner } from "./types.js";
import { truncate } from "./types.js";

export const runClaude: ProviderRunner = async function* (task, ctx) {
  const q = query({
    prompt: task,
    options: {
      model: ctx.model,
      cwd: ctx.cwd,
      systemPrompt: { type: "preset", preset: "claude_code", append: ctx.systemPrompt },
      permissionMode: ctx.settings.claude.permissionMode,
      allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch", "TodoWrite"],
      abortController: ctx.abort,
      maxTurns: ctx.settings.claude.maxTurns,
      // resume this agent's one ongoing conversation — its memory of every
      // order and everything it has done so far
      resume: ctx.sessionId ?? undefined,
    },
  });

  try {
    let lastText = "";
    for await (const m of q) {
      if (m.type === "system" && m.subtype === "init") {
        ctx.onSession(m.session_id);
      } else if (m.type === "assistant") {
        for (const block of m.message.content) {
          if (block.type === "text" && block.text.trim()) {
            lastText = block.text.trim();
            yield { kind: "text", text: lastText };
          } else if (block.type === "tool_use") {
            yield { kind: "tool", text: `${block.name} ${truncate(JSON.stringify(block.input), 120)}` };
          }
        }
      } else if (m.type === "result") {
        if (m.subtype === "success") {
          // the SDK's result repeats the final assistant message — don't log it twice
          const result = (m.result || "").trim();
          yield {
            kind: "result",
            text: result && result !== lastText ? result : "✓ Task complete.",
          };
        } else {
          yield { kind: "error", text: `Run ended early (${m.subtype}).` };
        }
      }
    }
  } catch (err) {
    if (ctx.abort.signal.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    yield { kind: "error", text: `Claude SDK error: ${truncate(msg, 300)}` };
  }
};
