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
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HERMES_BASE_URL = process.env.HERMES_BASE_URL ?? "http://127.0.0.1:9119";
const POLL_INTERVAL_MS = 10_000; // 10 seconds

/**
 * Mapping from our platform credential field keys to Hermes env var names.
 * Hermes stores credentials in ~/.hermes/.env and reads them at gateway startup.
 */
const PLATFORM_ENV_VAR_MAP: Record<string, Record<string, string>> = {
  telegram: { bot_token: "TELEGRAM_BOT_TOKEN" },
  discord: { bot_token: "DISCORD_BOT_TOKEN" },
  slack: { bot_token: "SLACK_BOT_TOKEN", signing_secret: "SLACK_APP_TOKEN", allowed_users: "SLACK_ALLOWED_USERS" }, // signing_secret field actually receives the app-level token (xapp-)
  whatsapp: { account_sid: "TWILIO_ACCOUNT_SID", auth_token: "TWILIO_AUTH_TOKEN", phone_number: "TWILIO_PHONE_NUMBER" },
  signal: { phone_number: "SIGNAL_ACCOUNT" },
  email: {
    imap_host: "EMAIL_IMAP_HOST", imap_port: "EMAIL_IMAP_PORT",
    smtp_host: "EMAIL_SMTP_HOST", smtp_port: "EMAIL_SMTP_PORT",
    email: "EMAIL_ADDRESS", password: "EMAIL_PASSWORD",
  },
  sms: { account_sid: "TWILIO_ACCOUNT_SID", auth_token: "TWILIO_AUTH_TOKEN", phone_number: "TWILIO_PHONE_NUMBER" },
  "microsoft teams": { app_id: "TEAMS_APP_ID", tenant_id: "TEAMS_TENANT_ID", bot_password: "TEAMS_BOT_PASSWORD" },
  "google chat": { project_id: "GOOGLE_CHAT_PROJECT_ID", service_account: "GOOGLE_CHAT_SERVICE_ACCOUNT_JSON" },
  matrix: { homeserver_url: "MATRIX_HOMESERVER", access_token: "MATRIX_ACCESS_TOKEN", user_id: "MATRIX_USER_ID" },
  mattermost: { server_url: "MATTERMOST_URL", bot_token: "MATTERMOST_TOKEN" },
  line: { channel_access_token: "LINE_CHANNEL_ACCESS_TOKEN", channel_secret: "LINE_CHANNEL_SECRET" },
  irc: { server: "IRC_SERVER", port: "IRC_PORT", nickname: "IRC_NICKNAME", channels: "IRC_CHANNEL" },
  bluebubbles: { server_url: "BLUEBUBBLES_SERVER_URL", password: "BLUEBUBBLES_PASSWORD" },
  ntfy: { server_url: "NTFY_SERVER_URL", topic: "NTFY_TOPIC" },
};

/** Convert our platform name to the Hermes platform ID (lowercase). */
function hermesPlatformId(platform: string): string {
  return platform.toLowerCase().replace(/\s+/g, "_");
}

/** Map our credential keys to Hermes env var names for a given platform. */
function credentialsToEnvVars(platform: string, credentials: Record<string, string>): Record<string, string> {
  const map = PLATFORM_ENV_VAR_MAP[platform.toLowerCase()] ?? {};
  const envVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    const envName = map[key] ?? key.toUpperCase();
    envVars[envName] = value;
  }
  return envVars;
}

export interface HermesStatus {
  gateway_running: boolean;
  platforms: Record<string, Record<string, any>>;
}

export class HermesClient {
  private baseUrl: string;
  private sessionToken: string | null;
  private polling = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastSessionIds: Set<string> = new Set();
  private onPlatformUpdate: ((states: PlatformConnectionState[]) => void) | null = null;
  private onPlatformEvent: ((event: PlatformEvent) => void) | null = null;
  private mailboxPlatforms: (string | null)[] = [null, null, null, null, null, null];

  constructor(baseUrl?: string, sessionToken?: string | null) {
    this.baseUrl = baseUrl ?? HERMES_BASE_URL;
    this.sessionToken = sessionToken ?? null;
  }

  /** Auth headers for protected Hermes dashboard endpoints. */
  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.sessionToken) {
      headers["X-Hermes-Session-Token"] = this.sessionToken;
    }
    return headers;
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

  /** Fetch the current gateway + platform status.
   *  Hermes /api/status may report gateway_running=false in Docker (known bug #26181)
   *  because PID/lock files aren't reliable in containers. We fall back to reading
   *  gateway_state.json directly to check if the gateway is actually running. */
  async getStatus(): Promise<HermesStatus | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/status`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        console.warn(`[hermes-client] /api/status returned HTTP ${res.status}`);
        return null;
      }
      const data = await res.json() as any;

      // Hermes uses gateway_platforms (not platforms) and state field (not connected boolean)
      let platforms = data.platforms ?? data.gateway_platforms ?? data.platform_states ?? {};
      let gatewayRunning = data.gateway_running ?? data.gatewayRunning ?? false;

      // Docker fallback: if /api/status says gateway not running, check gateway_state.json
      if (!gatewayRunning) {
        const stateFile = this.readGatewayStateFile();
        if (stateFile?.gateway_state === "running") {
          gatewayRunning = true;
          console.log(`[hermes-client] /api/status said not running but gateway_state.json says running — using fallback`);
        }
      }

      // Always merge platform states from gateway_state.json (more reliable than /api/status in Docker)
      const stateFile = this.readGatewayStateFile();
      if (stateFile?.platforms) {
        platforms = { ...platforms, ...stateFile.platforms };
      }

      console.log(`[hermes-client] /api/status: gateway_running=${gatewayRunning}, platforms=${JSON.stringify(platforms)}`);
      return { gateway_running: gatewayRunning, platforms };
    } catch {
      return null;
    }
  }

  /** Read ~/.hermes/gateway_state.json as a fallback for Docker PID/lock file bug. */
  private readGatewayStateFile(): { gateway_state: string; platforms?: Record<string, any> } | null {
    try {
      const hermesHome = process.env.HERMES_HOME ?? join(homedir(), ".hermes");
      const statePath = join(hermesHome, "gateway_state.json");
      if (!existsSync(statePath)) return null;
      const raw = readFileSync(statePath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** Fetch recent sessions and detect new inbound messages. */
  async getNewMessages(): Promise<PlatformEvent[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/sessions?limit=20`, {
        headers: this.authHeaders(),
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

        // Capture chat_id for reply routing (Telegram needs numeric chat_id)
        const chatId = sess.chat_id ?? sess.chatId ?? sess.channel_id ?? null;
        const senderName = sess.username ?? sess.user_name ?? sess.sender ?? null;
        // Use chat_id as the reply target if available, otherwise fall back to sender name
        const replyTarget = chatId ?? senderName ?? "unknown";

        // Fetch messages for this session
        try {
          const msgRes = await fetch(`${this.baseUrl}/api/sessions/${sid}/messages`, {
            headers: this.authHeaders(),
            signal: AbortSignal.timeout(5000),
          });
          if (!msgRes.ok) continue;
          const messages = await msgRes.json() as any[];
          for (const msg of messages) {
            if (msg.role === "user") {
              const text = (msg.content ?? msg.text ?? "").slice(0, 500);
              // Skip system notifications — these are Hermes internal alerts, not user messages
              if (text.startsWith("⚠️") || text.includes("API Funding Alert") || text.startsWith("System ·")) {
                continue;
              }
              events.push({
                platform: this.normalizePlatform(platform),
                direction: "inbound",
                sender: replyTarget,
                text,
                timestamp: msg.timestamp ?? Date.now(),
                chatId: chatId ?? undefined,
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

  /** Fetch recent sessions (raw data) for proactive home channel capture. */
  async getRecentSessions(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/sessions?limit=20`, {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      return await res.json() as any[];
    } catch {
      return [];
    }
  }

  /** Send a message to a platform via `hermes send` CLI (no REST endpoint exists for this). */
  async sendMessage(platform: string, target: string, text: string): Promise<boolean> {
    try {
      const { execFile } = await import("node:child_process");
      const targetStr = target ? `${platform}:${target}` : platform;
      return await new Promise((resolve) => {
        execFile("hermes", ["send", "--to", targetStr, text], {
          timeout: 15000,
          env: { ...process.env },
        }, (err) => {
          if (err) {
            console.warn(`[hermes-client] hermes send failed: ${err.message}`);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    } catch {
      return false;
    }
  }

  /** Send a photo to a Telegram chat via the Telegram Bot API directly. */
  async sendTelegramPhoto(chatId: string, photoPath: string, caption?: string): Promise<boolean> {
    try {
      const { readFile } = await import("node:fs/promises");
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        // Try reading from Hermes .env
        const hermesHome = process.env.HERMES_HOME ?? join(homedir(), ".hermes");
        const envPath = join(hermesHome, ".env");
        if (existsSync(envPath)) {
          const envContent = readFileSync(envPath, "utf-8");
          const match = envContent.match(/^TELEGRAM_BOT_TOKEN=(.+)$/m);
          if (match) {
            (process.env.TELEGRAM_BOT_TOKEN as string) = match[1].trim();
          }
        }
      }
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        console.warn("[hermes-client] sendTelegramPhoto: no TELEGRAM_BOT_TOKEN found");
        return false;
      }

      const formData = new FormData();
      formData.append("chat_id", chatId);
      const photoBuf = await readFile(photoPath);
      formData.append("photo", new Blob([photoBuf]), photoPath.split("/").pop() ?? "office.png");
      if (caption) formData.append("caption", caption);

      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const data = await res.text();
        console.warn(`[hermes-client] Telegram sendPhoto failed: HTTP ${res.status} — ${data.slice(0, 200)}`);
        return false;
      }
      console.log(`[hermes-client] Telegram photo sent to ${chatId}`);
      return true;
    } catch (err) {
      console.warn(`[hermes-client] sendTelegramPhoto error: ${err}`);
      return false;
    }
  }

  /** Start the Hermes gateway (if not running). */
  async startGateway(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/gateway/start`, {
        method: "POST",
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.warn(`[hermes-client] startGateway failed: HTTP ${res.status} — ${body.slice(0, 300)}`);
      } else {
        console.log(`[hermes-client] startGateway OK`);
      }
      return res.ok;
    } catch (err) {
      console.warn(`[hermes-client] startGateway error: ${err}`);
      return false;
    }
  }

  /** Set the LLM model provider via Hermes REST API.
   *  This is the authoritative way to configure which model the gateway agent uses.
   *  POST /api/model/set with {scope, provider, model} */
  async configureModel(provider: string, model: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/model/set`, {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify({ scope: "main", provider, model }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        console.log(`[hermes-client] Model set to ${provider}/${model}`);
        return true;
      }
      const data = await res.json().catch(() => ({}));
      console.warn(`[hermes-client] /api/model/set returned HTTP ${res.status}: ${JSON.stringify(data)}`);
      return false;
    } catch (err) {
      console.warn(`[hermes-client] Failed to set model: ${err}`);
      return false;
    }
  }

  /** Get current model/config info from Hermes. */
  async getModelInfo(): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/model/info`, {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return await res.json() as Record<string, unknown>;
      return null;
    } catch {
      return null;
    }
  }

  /** Configure a platform's credentials via the Hermes dashboard API. */
  async configurePlatform(platform: string, credentials: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    // Check reachability first so we can give a clear error instead of "fetch failed"
    const reachable = await this.isReachable();
    if (!reachable) {
      return {
        success: false,
        error: `Hermes Agent gateway is not running at ${this.baseUrl}. It should auto-start with the server — check server logs for [hermes-process] errors.`,
      };
    }
    const platformId = hermesPlatformId(platform);
    const envVars = credentialsToEnvVars(platform, credentials);
    console.log(`[hermes-client] configurePlatform: platform=${platform}, platformId=${platformId}, envKeys=${Object.keys(envVars).join(",")}`);
    try {
      // PUT /api/messaging/platforms/{id} — writes credentials to .env and enabled flag to config.yaml
      const res = await fetch(`${this.baseUrl}/api/messaging/platforms/${encodeURIComponent(platformId)}`, {
        method: "PUT",
        headers: this.authHeaders(),
        body: JSON.stringify({ enabled: true, env: envVars }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn(`[hermes-client] PUT /api/messaging/platforms/${platformId} returned HTTP ${res.status}: ${JSON.stringify(data)}`);
        return { success: false, error: data.error ?? data.detail ?? data.message ?? `HTTP ${res.status}` };
      }
      console.log(`[hermes-client] PUT /api/messaging/platforms/${platformId} OK — credentials saved`);

      // Start (or restart) the gateway so it picks up the new credentials
      // Use start first (works if gateway was stopped), then fall back to restart
      let gatewayRes = await fetch(`${this.baseUrl}/api/gateway/start`, {
        method: "POST",
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(15000),
      });
      if (!gatewayRes.ok) {
        // Gateway may already be running — try restart instead
        gatewayRes = await fetch(`${this.baseUrl}/api/gateway/restart`, {
          method: "POST",
          headers: this.authHeaders(),
          signal: AbortSignal.timeout(15000),
        });
      }
      if (!gatewayRes.ok) {
        console.warn(`[hermes-client] Platform configured but gateway start/restart returned HTTP ${gatewayRes.status}`);
      } else {
        console.log(`[hermes-client] Gateway start/restart OK after platform config`);
      }

      // Wait 3s for gateway to connect to the platform, then dump status for debugging
      setTimeout(async () => {
        try {
          const statusRes = await fetch(`${this.baseUrl}/api/status`, { signal: AbortSignal.timeout(5000) });
          const statusData = await statusRes.json() as any;
          console.log(`[hermes-client] Post-config /api/status: ${JSON.stringify(statusData).slice(0, 500)}`);
        } catch (e) { console.warn(`[hermes-client] Post-config status fetch failed: ${e}`); }
        const sf = this.readGatewayStateFile();
        console.log(`[hermes-client] Post-config gateway_state.json: ${JSON.stringify(sf)}`);
      }, 3000);

      return { success: true };
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
      const platState = status.platforms[key] ?? status.platforms[p] ?? status.platforms[key.replace(/\s+/g, "_")] ?? {};
      // Hermes uses "state" field (e.g. "connected", "disconnected") not "connected" boolean
      const stateStr = platState.state ?? platState.status ?? "";
      const connected = platState.connected ?? (stateStr === "connected");
      if (p.toLowerCase() === "telegram") {
        console.log(`[hermes-client] Telegram state lookup: key=${key}, platState=${JSON.stringify(platState)}, connected=${connected}, allPlatformKeys=${Object.keys(status.platforms).join(",")}`);
      }
      return {
        platform: p,
        connected,
        status: stateStr || (connected ? "Connected" : "Not configured"),
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
