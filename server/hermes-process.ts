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
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { PLATFORM_ENV_VAR_MAP } from "./hermes-client.js";

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

  private platformEnvVars: Record<string, string> = {};

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

  /** Set platform env vars to write to .env before the gateway starts. */
  setPlatformEnvVars(vars: Record<string, string>): void {
    this.platformEnvVars = vars;
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

  /** Ensure Hermes has config.yaml and .env with the LLM API key. */
  private ensureHermesConfig(): void {
    try {
      const hermesHome = process.env.HERMES_HOME ?? join(homedir(), ".hermes");
      if (!existsSync(hermesHome)) mkdirSync(hermesHome, { recursive: true });
      const configPath = join(hermesHome, "config.yaml");

      const apiKey = process.env.DEEPSEEK_KEY ?? process.env.KIMI_KEY ?? process.env.KIMI_API_KEY ?? "";
      const provider = process.env.HERMES_MODEL_PROVIDER ?? "deepseek";
      const model = process.env.HERMES_MODEL_NAME ?? "deepseek-v4-flash";
      console.log(`[hermes-process] ensureHermesConfig: hermesHome=${hermesHome}, apiKey=${apiKey ? "set (" + apiKey.slice(0, 8) + "...)" : "NOT SET"}, provider=${provider}, model=${model}`);

      // Only write config.yaml if it's missing or the provider/model has changed
      if (apiKey) {
        if (!existsSync(configPath) || this.configNeedsUpdate(configPath, provider, model)) {
          this.writeConfig(configPath, provider, model);
        } else {
          console.log(`[hermes-process] config.yaml already up to date — not overwriting`);
        }
      }

      // List /app/ag/ and hermes home contents for diagnostics
      const volumeRoot = "/app/ag";
      try {
        const volFiles = readdirSync(volumeRoot);
        console.log(`[hermes-process] Files in ${volumeRoot} (volume root): ${volFiles.join(", ")}`);
      } catch { /* ignore */ }
      try {
        const files = readdirSync(hermesHome);
        console.log(`[hermes-process] Files in ${hermesHome}: ${files.join(", ")}`);
      } catch { /* ignore */ }

      // Write/merge .env with KIMI_API_KEY + restored platform credentials
      // Uses the unified syncHermesEnvFile function (atomic write, single source of truth)
      if (apiKey) {
        syncHermesEnvFile(this.platformEnvVars);
      }
    } catch (err) {
      console.warn(`[hermes-process] Failed to write Hermes config: ${err}`);
    }
  }

  /** Check if config.yaml has the correct provider/model. */
  private configNeedsUpdate(configPath: string, provider: string, model: string): boolean {
    try {
      const existing = readFileSync(configPath, "utf-8");
      const hasProvider = existing.includes(`provider: ${provider}`);
      const hasModel = existing.includes(`default: ${model}`) || existing.includes(`model: ${model}`);
      if (hasProvider && hasModel) {
        return false;
      }
      console.log(`[hermes-process] config.yaml needs update: provider=${provider} model=${model} (existing hasProvider=${hasProvider} hasModel=${hasModel})`);
      return true;
    } catch {
      return true;
    }
  }

  private writeConfig(configPath: string, provider: string, model: string): void {
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
      `  provider: ${provider}`,
      `  default: ${model}`,
      "agent:",
      "  system_prompt: >",
      "    You're the receptionist at Agent Heights, a virtual office where AI agents",
      "    do real work as employees. People message you on Telegram.",
      "    ",
      "    Your SOUL.md file has live office status. Read it to answer questions about",
      "    what's happening in the office. It updates every minute with who's working",
      "    on what, active tasks, and recent completions.",
      "    ",
      "    Rules:",
      "    - Write normally. Capital letters, periods, normal sentences.",
      "    - Do NOT use em-dashes. Use periods or commas.",
      "    - Do NOT use lowercase for style. Write like a professional adult.",
      "    - Do NOT ask to build profiles or ask personal questions.",
      "    - Do NOT say things like 'hey!' or 'totally' or 'literally'.",
      "    - Do NOT use emoji.",
      "    - Be brief. 1-2 sentences usually. Never more than 3.",
      "    - If someone asks what's going on in the office, READ SOUL.md and tell them",
      "    who's here and what they're working on. Be specific. Name agents and tasks.",
      "    - If someone asks for a screenshot or photo, say you can't send photos but",
      "    describe what's happening in the office from SOUL.md. A real screenshot",
      "    will follow shortly from the team.",
      "    - If someone wants something done, say you'll connect them with the team and",
      "    someone will respond here shortly. Don't do it yourself.",
      "    - If someone asks about Agent Heights, answer in a sentence or two.",
      "    - If someone says hi, say hi back and ask what they need. Nothing else.",
      "telegram:",
      "  require_mention: false",
      "",
    ];
    if (preservedPlatforms.trim()) {
      config.push(preservedPlatforms.trimEnd(), "");
    }
    writeFileSync(configPath, config.join("\n"), "utf-8");
    console.log(`[hermes-process] Wrote config.yaml with ${provider}/${model} + Agent Heights system prompt` + (preservedPlatforms.trim() ? " + preserved platforms" : ""));

    // Write SOUL.md — Hermes's primary identity file
    const hermesHome = process.env.HERMES_HOME ?? join(homedir(), ".hermes");
    const soulPath = join(hermesHome, "SOUL.md");
    const soulContent = [
      "# Agent Heights Receptionist",
      "",
      "You work the front desk at Agent Heights, a virtual office where AI agents do",
      "real work as employees. People message you on Telegram.",
      "",
      "## Writing style",
      "",
      "- Write normal English. Capital letters at the start of sentences. Periods at the end.",
      "- Do NOT use em-dashes. Use periods or commas instead.",
      "- Do NOT write in lowercase for style. Use proper capitalization.",
      "- Do NOT use emoji.",
      "- Do NOT say 'hey!' or 'totally' or 'literally' or 'super' or 'awesome'.",
      "- Do NOT ask to build a profile or ask personal questions. Ever.",
      "- Be brief. 1-2 sentences. 3 max. No bullet points or headers in messages.",
      "- Sound like a professional receptionist at a real company. Not casual. Not quirky.",
      "",
      "## What to do",
      "",
      "- Someone says hi: say hi, ask what they need. Stop there.",
      "- Someone wants something done: say you'll connect them with the team and someone",
      "  will respond here shortly. Don't do it yourself.",
      "- Someone asks about Agent Heights: answer in a sentence or two.",
      "- Someone wants to talk to a specific agent: say you'll forward the message.",
      "- Someone asks what's going on in the office: READ the Live Office Status section",
      "  below. Tell them who's here and what they're working on. Be specific. Name",
      "  agents and their current tasks. If the office is empty, say so.",
      "- Someone asks for a screenshot or photo: say you can't send photos yourself, but",
      "  describe what's happening in the office from the Live Office Status section.",
      "  Tell them a real screenshot will follow shortly from the team.",
      "",
      "## About Agent Heights",
      "",
      "It's a browser game where you manage an office of AI agents. Each agent has a",
      "role and workspace. You hire them, give them tasks, and watch them work in",
      "real-time. Agents use real AI models and tools.",
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
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_KEY ?? "",
        KIMI_API_KEY: process.env.KIMI_KEY ?? process.env.KIMI_API_KEY ?? "",
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
        // Pass DeepSeek key (primary) + Kimi key (vision fallback) to Hermes
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_KEY ?? "",
        KIMI_API_KEY: process.env.KIMI_KEY ?? process.env.KIMI_API_KEY ?? "",
      },
    });
    console.log(`[hermes-process] Env: DEEPSEEK_API_KEY=${process.env.DEEPSEEK_KEY ? "set" : "NOT SET"}, KIMI_API_KEY=${process.env.KIMI_KEY ? "set" : "NOT SET"}, HERMES_HOME=${process.env.HERMES_HOME ?? join(homedir(), ".hermes")}`);

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

/**
 * Single authoritative function for writing the Hermes ~/.hermes/.env file.
 *
 * Merges credentials from savedCreds (save.json / DB) into the existing .env,
 * ensures KIMI_API_KEY is present, and writes atomically (temp + rename).
 *
 * Call this before gateway start, after platform config API calls, and after
 * any credential change. This replaces the triple-write workaround that was
 * spread across hermes-process.ts and manager.ts.
 *
 * @param savedCreds — credential env vars from save.json (e.g. { TELEGRAM_BOT_TOKEN: "...", TELEGRAM_HOME_CHANNEL: "..." })
 * @param platformCredentials — optional: our credential field keys per platform (e.g. { telegram: { bot_token: "..." } })
 *   to also write via PLATFORM_ENV_VAR_MAP mapping
 */
export function syncHermesEnvFile(savedCreds: Record<string, string>, platformCredentials?: Record<string, Record<string, string>>): void {
  try {
    const hermesHome = process.env.HERMES_HOME ?? join(homedir(), ".hermes");
    if (!existsSync(hermesHome)) mkdirSync(hermesHome, { recursive: true });
    const envPath = join(hermesHome, ".env");

    // Start from existing .env content (if any)
    let envContent = "";
    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, "utf-8");
    }

    // Collect all env vars to write into a single map for deduplication
    const varsToWrite: Record<string, string> = {};

    // 1. DEEPSEEK_API_KEY (primary LLM) + KIMI_API_KEY (vision fallback)
    const deepseekKey = process.env.DEEPSEEK_KEY ?? "";
    if (deepseekKey) {
      varsToWrite["DEEPSEEK_API_KEY"] = deepseekKey;
    }
    const kimiKey = process.env.KIMI_KEY ?? process.env.KIMI_API_KEY ?? "";
    if (kimiKey) {
      varsToWrite["KIMI_API_KEY"] = kimiKey;
    }

    // 2. Saved credentials from save.json (already in env-var form)
    for (const [varName, value] of Object.entries(savedCreds)) {
      varsToWrite[varName] = value;
    }

    // 3. Platform credentials passed in our credential-field-key form
    if (platformCredentials) {
      for (const [platform, creds] of Object.entries(platformCredentials)) {
        const varMap = PLATFORM_ENV_VAR_MAP[platform.toLowerCase()] ?? {};
        for (const [credKey, envVar] of Object.entries(varMap)) {
          const value = creds[credKey];
          if (value) {
            varsToWrite[envVar] = value;
          }
        }
      }
    }

    // Merge: remove existing lines for all vars we're writing, then append
    const varsToReplace = new Set(Object.keys(varsToWrite));
    const lines = envContent.split("\n").filter((l) => {
      const eqIdx = l.indexOf("=");
      if (eqIdx === -1) return true;
      const key = l.slice(0, eqIdx);
      return !varsToReplace.has(key);
    });

    for (const [varName, value] of Object.entries(varsToWrite)) {
      lines.push(`${varName}=${value}`);
    }

    const finalContent = lines.join("\n");
    const content = finalContent.endsWith("\n") ? finalContent : finalContent + "\n";

    // Atomic write: write to temp file, then rename
    const tmpPath = envPath + ".tmp";
    writeFileSync(tmpPath, content, "utf-8");
    renameSync(tmpPath, envPath);

    const finalKeys = content.split("\n").filter(l => l.match(/^[A-Z_]+=/)).map(l => l.split("=")[0]);
    console.log(`[hermes-process] syncHermesEnvFile: wrote ${finalKeys.join(", ") || "(none)"} to ${envPath}`);
  } catch (err) {
    console.warn(`[hermes-process] syncHermesEnvFile failed: ${err}`);
  }
}
