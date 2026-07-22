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
    const config = [
      "model:",
      "  provider: kimi-coding",
      "  default: kimi-k2.7-code-highspeed",
      "",
    ].join("\n");
    writeFileSync(configPath, config, "utf-8");
    console.log("[hermes-process] Wrote default config.yaml with kimi-coding/kimi-k2.7-code-highspeed");
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
