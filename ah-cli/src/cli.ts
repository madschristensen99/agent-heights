#!/usr/bin/env node
import { parseArgs } from "node:util";
import { BridgeClient, type ExternalTool } from "./ws-client.js";
import { startWatcher } from "./watch.js";
import { wrapCommand } from "./wrap.js";
import { runHook } from "./hook.js";

const HELP = `
Agent Heights CLI Bridge — stream external tool activity into your virtual office.

Usage:
  ah watch [--tool <tool>] [--dir <path>]     Watch a directory for file changes
  ah wrap <command> [args...]                 Wrap a CLI command and report activity
  ah-hook [--after-edit|--on-commit|--on-test]  Claude Code hook (reads JSON from stdin)

Options:
  --host <url>     WebSocket URL (default: $AH_HOST or ws://localhost:3001)
  --token <tok>    Auth token (default: $AH_TOKEN)
  --tool <tool>    Tool name: claude-code, codex, aider, vscode, cursor, windsurf
  --dir <path>     Directory to watch (default: current directory)

Environment:
  AH_HOST          WebSocket URL
  AH_TOKEN         Auth token (required)

Examples:
  ah watch --tool claude-code
  ah wrap "codex fix-bug.ts"
  echo '{"event":"file_edit","file":"src/index.ts"}' | ah-hook --after-edit
`;

function getConfig(): { host: string; token: string; tool: ExternalTool } {
  const host = process.env.AH_HOST || "ws://localhost:3001";
  const token = process.env.AH_TOKEN;
  if (!token) {
    console.error("[ah] AH_TOKEN environment variable is required.");
    console.error("[ah] Get your token from the Agent Heights app (Settings > API).");
    process.exit(1);
  }
  const tool: ExternalTool = "claude-code"; // overridden per-command
  return { host, token, tool };
}

function main(): void {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      host: { type: "string" },
      token: { type: "string" },
      tool: { type: "string" },
      dir: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  const command = positionals[0];
  const host = (values.host as string) || process.env.AH_HOST || "ws://localhost:3001";
  const token = (values.token as string) || process.env.AH_TOKEN;
  if (!token) {
    console.error("[ah] AH_TOKEN environment variable is required.");
    process.exit(1);
  }

  const tool = (values.tool as ExternalTool) || "unknown";

  if (command === "watch") {
    const dir = (values.dir as string) || process.cwd();
    const bridge = new BridgeClient({ host, token, tool });
    bridge.connect();
    const stop = startWatcher(bridge, dir);
    console.log(`[ah] Watching ${dir} as ${tool}...`);

    process.on("SIGINT", () => {
      console.log("\n[ah] Stopping...");
      stop();
      bridge.disconnect();
      process.exit(0);
    });
  } else if (command === "wrap") {
    if (positionals.length < 2) {
      console.error("[ah] wrap requires a command to run");
      process.exit(1);
    }
    const cmd = positionals[1];
    const cmdArgs = positionals.slice(2);
    const bridge = new BridgeClient({ host, token, tool });
    bridge.connect();

    // Wait briefly for connection before running command
    setTimeout(async () => {
      const code = await wrapCommand(bridge, cmd, cmdArgs);
      bridge.disconnect();
      process.exit(code);
    }, 500);
  } else if (command === "hook") {
    const bridge = new BridgeClient({ host, token, tool });
    bridge.connect();
    setTimeout(() => runHook(bridge, positionals.slice(1)), 500);
  } else {
    console.error(`[ah] Unknown command: ${command}`);
    console.log(HELP);
    process.exit(1);
  }
}

main();
