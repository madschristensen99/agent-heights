import type { ProviderRunner } from "./types.js";
import { truncate } from "./types.js";

// The Codex SDK ships its own event/item shapes; we read them defensively so
// a version bump degrades to generic log lines instead of crashing the run.
export const runCodex: ProviderRunner = async function* (task, ctx) {
  let Codex: any;
  try {
    ({ Codex } = await import("@openai/codex-sdk"));
  } catch {
    yield {
      kind: "error",
      text: "Codex SDK unavailable. Run `pnpm add @openai/codex-sdk` and `codex login`, then rehire this agent.",
    };
    return;
  }

  try {
    const codex = new Codex();
    const opts = {
      model: ctx.model,
      workingDirectory: ctx.cwd,
      skipGitRepoCheck: true,
      sandboxMode: ctx.settings.codex.sandboxMode,
    };
    // resume the agent's ongoing thread (its memory); fall back to fresh
    let thread: any = null;
    if (ctx.sessionId) {
      try {
        thread = codex.resumeThread(ctx.sessionId, opts);
      } catch {
        thread = null;
      }
    }
    if (!thread) thread = codex.startThread(opts);

    const prompt = ctx.sessionId
      ? `New task from the boss:\n${task}`
      : `${ctx.systemPrompt}\n\nYour task:\n${task}`;
    const { events } = await thread.runStreamed(prompt);
    if (thread.id) ctx.onSession(String(thread.id));

    for await (const e of events as AsyncIterable<any>) {
      if (ctx.abort.signal.aborted) return;

      if (e.type === "item.completed" && e.item) {
        const it = e.item;
        if (it.type === "agent_message" && it.text) {
          yield { kind: "text", text: String(it.text).trim() };
        } else if (it.type === "command_execution") {
          yield { kind: "tool", text: `$ ${truncate(String(it.command ?? ""), 120)}` };
        } else if (it.type === "file_change") {
          const paths = (it.changes ?? []).map((c: any) => c.path).join(", ");
          yield { kind: "tool", text: `edit ${truncate(paths, 120)}` };
        } else if (it.type === "mcp_tool_call" || it.type === "web_search") {
          yield { kind: "tool", text: truncate(JSON.stringify(it), 120) };
        }
      } else if (e.type === "turn.completed") {
        yield { kind: "result", text: "Task complete." };
      } else if (e.type === "turn.failed" || e.type === "error") {
        yield { kind: "error", text: truncate(String(e.error?.message ?? e.message ?? "Codex turn failed"), 300) };
      }
    }
    // the id may only be assigned once events start flowing
    if (thread.id) ctx.onSession(String(thread.id));
  } catch (err) {
    if (ctx.abort.signal.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    yield { kind: "error", text: `Codex error: ${truncate(msg, 300)}` };
  }
};
