/**
 * Hermes Gateway Process Manager
 *
 * Starts, monitors, and restarts `hermes serve` as a managed child process.
 * If the process crashes, it is automatically restarted after a short delay.
 *
 * This implements the gateway management described in docs/HERMES.md §10:
 * "Agent Heights server starts/stops the gateway as a managed child process.
 *  If it crashes, Agent Heights restarts it."
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HERMES_BASE_URL = process.env.HERMES_BASE_URL ?? "http://127.0.0.1:9119";
const RESTART_DELAY_MS = 3_000;
const MAX_RESTARTS = 5;
const HEALTH_CHECK_INTERVAL_MS = 30_000;

// Module-level singleton — only one Hermes process per Node.js process
let _instance: HermesProcessManager | null = null;

export class HermesProcessManager {
  private child: ChildProcess | null = null;
  private gatewayChild: ChildProcess | null = null;
  private baseUrl: string;
  private port: number;
  private restartCount = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private onReady: (() => void) | null = null;
  private ready = false;
  private sessionToken: string;
  private externalMode = false; // true if Hermes was already running externally
  private gatewayRestarting = false; // true when restartGateway() is handling the restart

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? HERMES_BASE_URL;
    // Extract port from base URL
    const match = this.baseUrl.match(/:(\d+)$/);
    this.port = match ? parseInt(match[1], 10) : 9119;
    // Use existing env var or generate a fresh token for this process lifetime
    this.sessionToken = process.env.HERMES_DASHBOARD_SESSION_TOKEN ?? randomBytes(32).toString("hex");
  }

  /** Get the singleton instance (one Hermes process per Node.js process). */
  static getInstance(baseUrl?: string): HermesProcessManager {
    if (!_instance) {
      _instance = new HermesProcessManager(baseUrl);
    }
    return _instance;
  }

  /** Get the session token for authenticating API requests to the Hermes dashboard. */
  getSessionToken(): string {
    return this.sessionToken;
  }

  /** Start the Hermes gateway as a child process. Returns a promise that resolves when it's reachable. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    // Ensure Hermes has a config.yaml with a model provider configured
    this.ensureHermesConfig();

    // If Hermes is already running externally, don't spawn a child process
    const alreadyRunning = await this.isReachable();
    if (alreadyRunning) {
      console.log("[hermes-process] Hermes gateway already running externally — not spawning child process");
      this.ready = true;
      this.startHealthCheck();
      return;
    }

    console.log(`[hermes-process] Starting hermes serve on port ${this.port}...`);
    this.spawnHermes();

    // Wait for it to become reachable
    await this.waitForReady();

    // Now spawn the messaging gateway process (hermes gateway run)
    // This is separate from `hermes serve` which only provides the dashboard API.
    // Without this, gateway_mode stays "none" and no platforms connect.
    this.spawnGateway();
  }

  /** Ensure Hermes has config.yaml and .env with the Kimi API key. */
  private ensureHermesConfig(): void {
    try {
      const hermesHome = process.env.HERMES_HOME ?? join(homedir(), ".hermes");
      if (!existsSync(hermesHome)) mkdirSync(hermesHome, { recursive: true });
      const configPath = join(hermesHome, "config.yaml");
      const envPath = join(hermesHome, ".env");

      const kimiKey = process.env.KIMI_BACKUP_KEY ?? process.env.KIMI_API_KEY ?? "";
      console.log(`[hermes-process] ensureHermesConfig: hermesHome=${hermesHome}, kimiKey=${kimiKey ? "set (" + kimiKey.slice(0, 8) + "...)" : "NOT SET"}`);

      // Always write config.yaml to ensure correct provider (volume may have stale config from previous deploy)
      if (kimiKey) {
        this.writeConfig(configPath);
      }

      // Write/merge .env with KIMI_API_KEY so the gateway subprocess can find it
      if (kimiKey) {
        let envContent = "";
        if (existsSync(envPath)) {
          envContent = readFileSync(envPath, "utf-8");
          // Log existing keys for debugging persistence
          const existingKeys = envContent.split("\n").filter(l => l.match(/^[A-Z_]+=/)).map(l => l.split("=")[0]);
          console.log(`[hermes-process] Existing .env keys: ${existingKeys.join(", ") || "(none)"}`);
        }
        // Check if KIMI_API_KEY is already in .env
        if (!envContent.includes("KIMI_API_KEY=")) {
          const newContent = envContent + (envContent && !envContent.endsWith("\n") ? "\n" : "") + `KIMI_API_KEY=${kimiKey}\n`;
          writeFileSync(envPath, newContent, "utf-8");
          console.log("[hermes-process] Wrote KIMI_API_KEY to ~/.hermes/.env");
        } else {
          console.log("[hermes-process] KIMI_API_KEY already in ~/.hermes/.env — not overwriting");
        }
      }
    } catch (err) {
      console.warn(`[hermes-process] Failed to write Hermes config: ${err}`);
    }
  }

  private writeConfig(configPath: string): void {
    // Preserve existing platform config (enabled flags, etc.) from the current config.yaml
    // so Telegram/Discord/etc. survive redeploys. The credentials are in .env (persistent volume).
    let preservedPlatforms = "";
    if (existsSync(configPath)) {
      const existing = readFileSync(configPath, "utf-8");
      // Extract everything after a "platforms:" or "messaging:" top-level key
      const lines = existing.split("\n");
      let inPlatforms = false;
      let platformsIndent = "";
      for (const line of lines) {
        if (/^platforms:\s*$/.test(line) || /^messaging:\s*$/.test(line)) {
          inPlatforms = true;
          platformsIndent = "";
          preservedPlatforms += line + "\n";
          continue;
        }
        if (inPlatforms) {
          // Check if this line is still part of the platforms section (indented)
          if (line.trim() === "" ) { preservedPlatforms += "\n"; continue; }
          const indent = line.match(/^(\s+)/)?.[1] ?? "";
          if (indent.length > 0 && (platformsIndent === "" || indent.startsWith(platformsIndent))) {
            if (platformsIndent === "") platformsIndent = indent;
            preservedPlatforms += line + "\n";
          } else {
            inPlatforms = false;
          }
        }
      }
      if (preservedPlatforms.trim()) {
        console.log(`[hermes-process] Preserving platform config from existing config.yaml:\n${preservedPlatforms.slice(0, 300)}`);
      }
    }

    const config = [
      "model:",
      "  provider: kimi-coding",
      "  default: kimi-k2.7-code",
      "agent:",
      "  system_prompt: >",
      "    You are the front desk receptionist for Agent Heights, a pixel-art office game",
      "    where AI agents work as employees. You are the first point of contact for",
      "    anyone messaging the office via Telegram. You know about the office, the agents,",
      "    and can answer questions about Agent Heights. Be friendly, helpful, and concise.",
      "    If someone wants to talk to a specific agent or give a task to the team, let",
      "    them know their message has been forwarded to the office.",
      "",
    ];
    if (preservedPlatforms.trim()) {
      config.push(preservedPlatforms.trimEnd(), "");
    }
    writeFileSync(configPath, config.join("\n"), "utf-8");
    console.log("[hermes-process] Wrote config.yaml with kimi-coding/kimi-k2.7-code + Agent Heights system prompt" + (preservedPlatforms.trim() ? " + preserved platforms" : ""));

    // Write SOUL.md — Hermes's primary identity file
    const hermesHome = process.env.HERMES_HOME ?? join(homedir(), ".hermes");
    const soulPath = join(hermesHome, "SOUL.md");
    const soulContent = [
      "# Agent Heights Office Receptionist",
      "",
      "You are the front desk receptionist for **Agent Heights**, a pixel-art office",
      "simulation game where AI agents work as employees in a virtual office building.",
      "",
      "## Your Role",
      "",
      "- You are the first point of contact for anyone messaging the office via Telegram",
      "- You greet visitors warmly and answer questions about Agent Heights",
      "- You know the office has AI agents with different roles (coding, design, devops, etc.)",
      "- Agent Resources is the office manager who keeps things running",
      "- Hermes is the devops engineer who manages infrastructure",
      "- The boss (the player) assigns tasks to agents and manages the office",
      "- Agents work in a shared workspace, collaborate, and review each other's work",
      "",
      "## How to Behave",
      "",
      "- Be friendly, professional, and concise — like a real office receptionist",
      "- When someone asks about Agent Heights, explain it enthusiastically",
      "- When someone sends a message for the team, acknowledge it and say it's been forwarded",
      "- Don't pretend to be a generic AI assistant — you work at Agent Heights",
      "- Keep responses short for Telegram (avoid long paragraphs)",
      "",
      "## Quick Description of Agent Heights",
      "",
      "Agent Heights is a browser-based game where you manage an office full of AI agents.",
      "Each agent has their own personality, role, and workspace. You can hire agents,",
      "assign them tasks, watch them collaborate, and communicate with them through the",
      "office mailbox system. The agents use real LLMs and development tools to complete",
      "their work, and you can see everything happening in real-time.",
    ].join("\n");
    writeFileSync(soulPath, soulContent, "utf-8");
    console.log("[hermes-process] Wrote SOUL.md with Agent Heights receptionist identity");
  }

  /** Check if the Hermes gateway is reachable. */
  private async isReachable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/status`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Spawn the hermes gateway run child process (messaging gateway). */
  private spawnGateway(): void {
    const args = ["gateway", "run", "--replace"];
    console.log(`[hermes-process] Spawning: hermes ${args.join(" ")}`);

    this.gatewayChild = spawn("hermes", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        HERMES_DASHBOARD_SESSION_TOKEN: this.sessionToken,
        KIMI_API_KEY: process.env.KIMI_BACKUP_KEY ?? process.env.KIMI_API_KEY ?? "",
        GATEWAY_ALLOW_ALL_USERS: "true",
      },
    });

    this.gatewayChild.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().trim().split("\n");
      for (const line of lines) {
        if (line) console.log(`[hermes-gateway] ${line}`);
      }
    });

    this.gatewayChild.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().trim().split("\n");
      for (const line of lines) {
        if (line) console.error(`[hermes-gateway] ${line}`);
      }
    });

    this.gatewayChild.on("exit", (code, signal) => {
      console.log(`[hermes-process] Gateway process exited (code=${code}, signal=${signal})`);
      this.gatewayChild = null;
      if (!this.started) return;
      // If restartGateway() is handling the restart, don't schedule another one
      if (this.gatewayRestarting) {
        this.gatewayRestarting = false;
        return;
      }
      // Only auto-restart on crash (code !== 0), not on clean exit or intentional kill
      if (code !== 0 && this.restartCount < MAX_RESTARTS) {
        this.restartCount++;
        console.log(`[hermes-process] Gateway crashed (code=${code}), restarting in ${RESTART_DELAY_MS / 1000}s (attempt ${this.restartCount}/${MAX_RESTARTS})...`);
        this.restartTimer = setTimeout(() => {
          if (this.started) this.spawnGateway();
        }, RESTART_DELAY_MS);
      } else if (code === 0) {
        console.log(`[hermes-process] Gateway exited cleanly — not auto-restarting`);
      }
    });

    this.gatewayChild.on("error", (err) => {
      console.error(`[hermes-process] Failed to spawn gateway: ${err.message}`);
      this.gatewayChild = null;
    });
  }

  /** Restart the gateway child process (used after platform credentials change). */
  restartGateway(): void {
    this.gatewayRestarting = true; // Prevent exit handler from also scheduling a restart
    if (this.gatewayChild) {
      console.log("[hermes-process] Restarting gateway child process...");
      this.gatewayChild.kill("SIGTERM");
      this.gatewayChild = null;
    }
    // Delay 1s before respawning to let the old process fully exit
    setTimeout(() => {
      if (this.started) this.spawnGateway();
    }, 1000);
  }

  /** Spawn the hermes serve child process. */
  private spawnHermes(): void {
    const args = ["serve", "--port", String(this.port)];
    console.log(`[hermes-process] Spawning: hermes ${args.join(" ")}`);

    this.child = spawn("hermes", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        HERMES_DASHBOARD_SESSION_TOKEN: this.sessionToken,
        // Pass our Kimi key to Hermes under the env var name it expects
        KIMI_API_KEY: process.env.KIMI_BACKUP_KEY ?? process.env.KIMI_API_KEY ?? "",
      },
    });
    console.log(`[hermes-process] Env: KIMI_API_KEY=${process.env.KIMI_BACKUP_KEY ? "set" : "NOT SET"}, HERMES_HOME=${process.env.HERMES_HOME ?? join(homedir(), ".hermes")}`);

    this.child.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().trim().split("\n");
      for (const line of lines) {
        if (line) console.log(`[hermes] ${line}`);
      }
    });

    this.child.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().trim().split("\n");
      for (const line of lines) {
        if (line) console.error(`[hermes] ${line}`);
      }
    });

    this.child.on("exit", async (code, signal) => {
      console.log(`[hermes-process] Child process exited (code=${code}, signal=${signal})`);
      this.child = null;
      this.ready = false;

      if (!this.started) return; // We're shutting down

      // Check if the port is actually serving (another instance may have won the race)
      if (await this.isReachable()) {
        console.log("[hermes-process] Port is reachable from another instance — switching to external mode");
        this.externalMode = true;
        this.ready = true;
        this.restartCount = 0;
        this.startHealthCheck();
        return;
      }

      if (this.restartCount < MAX_RESTARTS) {
        this.restartCount++;
        console.log(`[hermes-process] Restarting in ${RESTART_DELAY_MS / 1000}s (attempt ${this.restartCount}/${MAX_RESTARTS})...`);
        this.restartTimer = setTimeout(() => {
          if (this.started) {
            this.spawnHermes();
            void this.waitForReady();
          }
        }, RESTART_DELAY_MS);
      } else {
        console.error(`[hermes-process] Max restart attempts (${MAX_RESTARTS}) reached — giving up. Start hermes manually: hermes serve`);
      }
    });

    this.child.on("error", (err) => {
      console.error(`[hermes-process] Failed to spawn hermes: ${err.message}`);
      if (err.message.includes("ENOENT") || err.message.includes("spawn")) {
        console.error("[hermes-process] hermes command not found. Install it with: pip install hermes-agent");
      }
      this.child = null;
      this.ready = false;
    });
  }

  /** Wait for the Hermes gateway to become reachable (up to 30s). */
  private async waitForReady(): Promise<void> {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      if (await this.isReachable()) {
        this.ready = true;
        this.restartCount = 0; // Reset restart count on successful start
        console.log(`[hermes-process] Hermes gateway is ready at ${this.baseUrl}`);
        this.startHealthCheck();
        this.onReady?.();
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    console.error(`[hermes-process] Hermes gateway did not become reachable within ${maxAttempts}s`);
  }

  /** Periodically check that the Hermes process is alive. */
  private startHealthCheck(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = setInterval(async () => {
      if (!this.started) return;
      // In external mode, just check reachability
      if (this.externalMode) {
        if (!await this.isReachable()) {
          console.warn("[hermes-process] External Hermes became unreachable");
          this.ready = false;
        }
        return;
      }
      // If we have a child process and it's not reachable, the process may have hung
      if (this.child && !await this.isReachable()) {
        console.warn("[hermes-process] Health check failed — Hermes not reachable, killing child for restart");
        this.child.kill("SIGTERM");
        // The exit handler will restart it
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  /** Stop the Hermes gateway child process. */
  stop(): void {
    this.started = false;
    this.ready = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    if (this.gatewayChild) {
      console.log("[hermes-process] Stopping hermes gateway child process...");
      this.gatewayChild.kill("SIGTERM");
      this.gatewayChild = null;
    }
    if (this.child) {
      console.log("[hermes-process] Stopping hermes serve child process...");
      this.child.kill("SIGTERM");
      this.child = null;
    }
    _instance = null;
  }

  /** Is the Hermes gateway currently ready? */
  isReady(): boolean {
    return this.ready;
  }
}
