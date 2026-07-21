/**
 * Agent Screenshot Manager
 *
 * Captures screenshots from agents' browsers. Two sources:
 *  1. Built-in Playwright browser (server/providers/browser.ts) — always available
 *  2. MCP browser servers (Playwright/Chrome DevTools MCP) — when configured
 *
 * Two modes:
 *  - Private view: a single client requested frames for an agent modal
 *  - Broadcast: frames are sent to all clients in the room (projector)
 */
import type { ServerMsg } from "../../shared/types.js";
import type { MCPServerConfig } from "./mcp-client.js";
import { clientCache } from "./mcp-client.js";
import { browserScreenshot, browserLastFrame, hasBrowser } from "./browser.js";

interface BroadcastFn {
  (msg: ServerMsg): void;
}

interface Viewer {
  broadcast: BroadcastFn;
}

type CaptureSource = "builtin" | "mcp";

interface AgentCapture {
  agentId: string;
  source: CaptureSource;
  /** For MCP captures: the server key + tool name. */
  serverKey?: string;
  toolName?: string;
  interval: ReturnType<typeof setInterval>;
  viewers: Map<string, Viewer>;
  broadcasting: boolean;
  roomBroadcast: BroadcastFn | null;
}

function detectBrowserMCP(servers: MCPServerConfig[] | undefined): { key: string; toolName: string } | null {
  if (!servers || servers.length === 0) return null;
  for (const s of servers) {
    const label = (s.name ?? s.command ?? s.url ?? "").toLowerCase();
    const isPlaywright = label.includes("playwright") || (s.args ?? []).some(a => a.includes("playwright"));
    const isChromeDevtools = label.includes("chrome-devtools") || label.includes("devtools") || (s.args ?? []).some(a => a.includes("chrome-devtools"));
    if (isPlaywright || isChromeDevtools) {
      const key = s.url ?? `${s.command}:${(s.args ?? []).join(" ")}`;
      return { key, toolName: "browser_take_screenshot" };
    }
  }
  return null;
}

async function callScreenshotTool(serverKey: string, toolName: string): Promise<string | null> {
  for (const [key, client] of clientCache) {
    if (key === serverKey || key.startsWith(serverKey)) {
      try {
        const result = await (client as any).callTool(toolName, {});
        return result;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export class ScreenshotManager {
  private captures = new Map<string, AgentCapture>();
  private frameIntervalMs = 800;

  startCapture(
    agentId: string,
    mcpServers: MCPServerConfig[] | undefined,
    viewer?: { id: string; broadcast: BroadcastFn },
    roomBroadcast?: BroadcastFn,
  ): boolean {
    // Determine capture source: prefer MCP if available, fall back to built-in
    const mcpDetected = detectBrowserMCP(mcpServers);
    const source: CaptureSource = mcpDetected ? "mcp" : "builtin";

    let capture = this.captures.get(agentId);
    if (capture) {
      if (viewer) capture.viewers.set(viewer.id, viewer);
      if (roomBroadcast) {
        capture.broadcasting = true;
        capture.roomBroadcast = roomBroadcast;
      }
      return true;
    }

    capture = {
      agentId,
      source,
      serverKey: mcpDetected?.key,
      toolName: mcpDetected?.toolName,
      interval: setInterval(() => this.captureFrame(agentId), this.frameIntervalMs),
      viewers: viewer ? new Map([[viewer.id, viewer]]) : new Map(),
      broadcasting: !!roomBroadcast,
      roomBroadcast: roomBroadcast ?? null,
    };
    this.captures.set(agentId, capture);
    console.log(`[screenshot] started capture for agent ${agentId} (source: ${source})`);
    return true;
  }

  stopViewer(agentId: string, viewerId: string): void {
    const capture = this.captures.get(agentId);
    if (!capture) return;
    capture.viewers.delete(viewerId);
    this.maybeStopCapture(agentId);
  }

  stopBroadcast(agentId: string): void {
    const capture = this.captures.get(agentId);
    if (!capture) return;
    capture.broadcasting = false;
    capture.roomBroadcast = null;
    this.maybeStopCapture(agentId);
  }

  stopAll(agentId: string): void {
    const capture = this.captures.get(agentId);
    if (!capture) return;
    clearInterval(capture.interval);
    this.captures.delete(agentId);
    console.log(`[screenshot] stopped capture for agent ${agentId}`);
  }

  private maybeStopCapture(agentId: string): void {
    const capture = this.captures.get(agentId);
    if (!capture) return;
    if (capture.viewers.size === 0 && !capture.broadcasting) {
      clearInterval(capture.interval);
      this.captures.delete(agentId);
      console.log(`[screenshot] stopped capture for agent ${agentId} (no viewers)`);
    }
  }

  private async captureFrame(agentId: string): Promise<void> {
    const capture = this.captures.get(agentId);
    if (!capture) return;

    try {
      let frame: string | null = null;

      if (capture.source === "mcp" && capture.serverKey && capture.toolName) {
        frame = await callScreenshotTool(capture.serverKey, capture.toolName);
        if (frame && frame.startsWith("data:image/")) {
          const commaIdx = frame.indexOf(",");
          if (commaIdx > 0) frame = frame.slice(commaIdx + 1);
        }
      } else {
        // Built-in Playwright browser
        if (hasBrowser(agentId)) {
          // Use cached frame if available (updated by browser_screenshot tool calls)
          frame = browserLastFrame(agentId);
          // If no cached frame, take one now
          if (!frame) {
            frame = await browserScreenshot(agentId);
          }
        } else {
          // No browser session yet — skip
          return;
        }
      }

      if (!frame) return;

      const msg: ServerMsg = { type: "agent_frame", agentId, frame };

      for (const viewer of capture.viewers.values()) {
        viewer.broadcast(msg);
      }

      if (capture.broadcasting && capture.roomBroadcast) {
        capture.roomBroadcast(msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("not available") && !msg.includes("timed out")) {
        console.warn(`[screenshot] capture failed for ${agentId}: ${msg}`);
      }
    }
  }

  destroy(): void {
    for (const capture of this.captures.values()) {
      clearInterval(capture.interval);
    }
    this.captures.clear();
  }
}
