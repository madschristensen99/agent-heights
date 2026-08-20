#!/usr/bin/env node
import { BridgeClient } from "./ws-client.js";
import { runHook } from "./hook.js";

const host = process.env.AH_HOST || "ws://localhost:3001";
const token = process.env.AH_TOKEN;

if (!token) {
  console.error("[ah-hook] AH_TOKEN environment variable is required.");
  process.exit(0); // Don't fail the hook chain
}

const bridge = new BridgeClient({ host, token, tool: "claude-code" });
bridge.connect();

// Wait briefly for connection, then run hook
setTimeout(() => runHook(bridge, process.argv.slice(2)), 500);
