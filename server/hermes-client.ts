/**
 * Hermes Agent Gateway Client
 *
 * Connects to a running `hermes serve` instance (default port 9119) via its REST API.
 * Polls platform connection status and recent sessions for inbound messages.
 *
 * The Hermes Agent is a real AI agent by Nous Research that has a messaging gateway
 * supporting Telegram, Discord, Slack, WhatsApp, Signal, Email, and more.
 * See: https://github.com/nousresearch/hermes-agent
 */

import type { PlatformConnectionState, PlatformEvent } from "../shared/types.js";
import { getPlatformEntry } from "../shared/types.js";

const HERMES_BASE_URL = process.env.HERMES_BASE_URL ?? "http://127.0.0.1:9119";
const POLL_INTERVAL_MS = 10_000; // 10 seconds

export interface HermesStatus {
  gateway_running: boolean;
  platforms: Record<string, { connected: boolean; status: string }>;
}

export class HermesClient {
  private baseUrl: string;
  private polling = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastSessionIds: Set<string> = new Set();
  private onPlatformUpdate: ((states: PlatformConnectionState[]) => void) | null = null;
  private onPlatformEvent: ((event: PlatformEvent) => void) | null = null;
  private mailboxPlatforms: (string | null)[] = [null, null, null, null, null, null];

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? HERMES_BASE_URL;
  }

  /** Update which platforms to poll for connection status. */
  setMailboxPlatforms(platforms: (string | null)[]): void {
    this.mailboxPlatforms = platforms;
  }

  /** Start polling the Hermes serve API for status and new messages. */
  start(
    onPlatformUpdate: (states: PlatformConnectionState[]) => void,
    onPlatformEvent: (event: PlatformEvent) => void,
  ): void {
    this.onPlatformUpdate = onPlatformUpdate;
    this.onPlatformEvent = onPlatformEvent;
    this.polling = true;
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    console.log(`[hermes-client] Started polling ${this.baseUrl}`);
  }

  stop(): void {
    this.polling = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Check if the Hermes serve backend is reachable. */
  async isReachable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/status`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Fetch the current gateway + platform status. */
  async getStatus(): Promise<HermesStatus | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/status`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const data = await res.json() as any;
      return {
        gateway_running: data.gateway_running ?? data.gatewayRunning ?? false,
        platforms: data.platforms ?? data.platform_states ?? {},
      };
    } catch {
      return null;
    }
  }

  /** Fetch recent sessions and detect new inbound messages. */
  async getNewMessages(): Promise<PlatformEvent[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/sessions?limit=20`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const sessions = await res.json() as any[];
      const events: PlatformEvent[] = [];

      for (const sess of sessions) {
        const sid = sess.session_id ?? sess.id;
        if (!sid || this.lastSessionIds.has(sid)) continue;
        this.lastSessionIds.add(sid);

        // Only process sessions from messaging platforms (not CLI)
        const platform = sess.platform ?? sess.source;
        if (!platform || platform === "cli" || platform === "local") continue;

        // Fetch messages for this session
        try {
          const msgRes = await fetch(`${this.baseUrl}/api/sessions/${sid}/messages`, {
            signal: AbortSignal.timeout(5000),
          });
          if (!msgRes.ok) continue;
          const messages = await msgRes.json() as any[];
          for (const msg of messages) {
            if (msg.role === "user") {
              events.push({
                platform: this.normalizePlatform(platform),
                direction: "inbound",
                sender: msg.author ?? msg.username ?? "unknown",
                text: (msg.content ?? msg.text ?? "").slice(0, 500),
                timestamp: msg.timestamp ?? Date.now(),
              });
            }
          }
        } catch { /* skip session on error */ }
      }

      return events;
    } catch {
      return [];
    }
  }

  /** Send a message to a platform via Hermes. */
  async sendMessage(platform: string, target: string, text: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/gateway/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, target, text }),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Start the Hermes gateway (if not running). */
  async startGateway(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/gateway/start`, {
        method: "POST",
        signal: AbortSignal.timeout(10000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Configure a platform's credentials via the Hermes gateway API. */
  async configurePlatform(platform: string, credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    // Check reachability first so we can give a clear error instead of "fetch failed"
    const reachable = await this.isReachable();
    if (!reachable) {
      return {
        success: false,
        error: `Hermes Agent gateway is not running at ${this.baseUrl}. It should auto-start with the server — check server logs for [hermes-process] errors.`,
      };
    }
    try {
      const res = await fetch(`${this.baseUrl}/api/gateway/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platform.toLowerCase(), credentials }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return { success: true };
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error ?? data.message ?? `HTTP ${res.status}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reach Hermes gateway";
      if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED") || msg.includes("connect")) {
        return {
          success: false,
          error: `Hermes Agent gateway is not running at ${this.baseUrl}. It should auto-start with the server — check server logs for [hermes-process] errors.`,
        };
      }
      return { success: false, error: msg };
    }
  }

  /** Get platform connection states for the given mailbox platforms. */
  async getPlatformStates(mailboxPlatforms: (string | null)[]): Promise<PlatformConnectionState[]> {
    const platforms = mailboxPlatforms.filter((p): p is string => p !== null);
    const status = await this.getStatus();
    if (!status) {
      // Hermes serve not running — all platforms disconnected
      return platforms.map((p) => ({
        platform: p,
        connected: false,
        status: "Hermes Agent not running",
        gatewayRunning: false,
      }));
    }

    return platforms.map((p) => {
      const key = p.toLowerCase();
      const platState = status.platforms[key] ?? status.platforms[p] ?? {};
      return {
        platform: p,
        connected: platState.connected ?? false,
        status: platState.status ?? (platState.connected ? "Connected" : "Not configured"),
        gatewayRunning: status.gateway_running,
      };
    });
  }

  private normalizePlatform(raw: string): string {
    const entry = getPlatformEntry(raw);
    if (entry) return entry.name;
    // Map common variants
    const lower = raw.toLowerCase();
    if (lower === "wa") return "WhatsApp";
    if (lower === "mail") return "Email";
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  private async poll(): Promise<void> {
    if (!this.polling) return;

    // 1. Poll platform connection states
    const states = await this.getPlatformStates(this.mailboxPlatforms);
    this.onPlatformUpdate?.(states);

    // 2. Poll for new messages
    const newEvents = await this.getNewMessages();
    for (const ev of newEvents) {
      this.onPlatformEvent?.(ev);
    }
  }
}
