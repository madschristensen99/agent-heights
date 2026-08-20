import { readFileSync } from "node:fs";
import type { BridgeClient, ExternalEvent } from "./ws-client.js";

/**
 * Claude Code hook entry point.
 * Reads hook event JSON from stdin (or --input file) and sends activity to the bridge.
 *
 * Usage in Claude Code settings.json hooks:
 *   "hooks": {
 *     "after_edit": "ah-hook --after-edit",
 *     "on_commit": "ah-hook --on-commit"
 *   }
 *
 * Or pipe JSON directly:
 *   echo '{"event":"file_edit","file":"src/index.ts"}' | ah-hook
 */
export function runHook(bridge: BridgeClient, args: string[]): void {
  let input = "";

  // Read from stdin if available
  try {
    input = readFileSync("/dev/stdin", "utf-8").trim();
  } catch { /* no stdin */ }

  // Parse --input flag
  const inputIdx = args.indexOf("--input");
  if (inputIdx >= 0 && args[inputIdx + 1]) {
    try {
      input = readFileSync(args[inputIdx + 1], "utf-8").trim();
    } catch { /* ignore */ }
  }

  if (!input) {
    // No input — just send a heartbeat
    bridge.activity("active");
    bridge.flushEvents();
    setTimeout(() => bridge.disconnect(), 500);
    return;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(input);
  } catch {
    console.error("[ah-hook] Failed to parse JSON input");
    bridge.disconnect();
    return;
  }

  const eventType = args.includes("--after-edit") ? "file_edit"
    : args.includes("--on-commit") ? "git_commit"
    : args.includes("--on-test") ? "test_run"
    : (data.event as string) || "command";

  const ev: ExternalEvent = {
    type: eventType as ExternalEvent["type"],
    timestamp: Date.now(),
    file: data.file as string | undefined,
    message: data.message as string | undefined,
    success: data.success as boolean | undefined,
  };

  bridge.pushEvent(ev);
  bridge.activity("active", {
    currentFile: ev.file,
    events: [ev],
  });
  bridge.flushEvents();

  // Brief delay to ensure message is sent before disconnecting
  setTimeout(() => bridge.disconnect(), 500);
}
