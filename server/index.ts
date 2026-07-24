import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize, resolve, relative } from "node:path";
import { readFile, stat, readdir, writeFile, unlink, mkdir, lstat } from "node:fs/promises";
import type { ClientMsg, ServerMsg, SavedOutfit, CharAppearance } from "../shared/types.js";
import { SERVER_PORT, isValidAppearance } from "../shared/types.js";
import { isSupabaseConfigured, verifyToken, getTokenExpiry, type AuthUser, supabaseAdmin } from "./supabase.js";
import { handleMarketplaceRequest } from "./marketplace.js";
import { handleMcpCatalogRequest } from "./mcp-store.js";
import { searchPulseMCPStructured } from "./pulsemcp.js";
import { handleAgentResourcesRequest } from "./agent-resources.js";
import { handlePublishRequest } from "./publish.js";
import { stopRailwayMCP, checkRailwayStatus, queryRailway, deployWorldToRailway, listWorldDeployments, stopWorldDeployment } from "./providers/railway-mcp.js";
import { getAuthenticatedUser, forkSourceRepo, createBranch, listBranches, deleteBranch, getGithubToken, listRepoDir, readRepoFile, writeRepoFile, createRepoFile, deleteRepoFile } from "./github.js";
import { rateLimitAsync } from "./ratelimit.js";
import { setUserApiKey, deleteUserApiKey, setUserMcpKey, deleteUserMcpKey, getUserMcpKeys, getUserMcpKeyUrls } from "./apikeys.js";
import { startOAuthFlow, handleOAuthCallback, exchangeOAuthCode } from "./mcp-oauth.js";
import { TenantManager, HQ2_ROOM_ID, type UserSession } from "./tenant.js";
import { ScreenshotManager } from "./providers/screenshot.js";
import { browserLastFrame, closeAgentBrowser, destroyAllBrowsers, cleanupIdleBrowsers } from "./providers/browser.js";
import { startLogMaintenance } from "./log-retention.js";
import { isRedisConfigured, stopRedis, serverId } from "./redis.js";
import { handleStripeRequest, getUserPaymentStatus, isStripeConfigured, startFreeTrial } from "./stripe.js";
import { applySecurityHeaders, escapeHtml } from "./security.js";

/** Throttle map for rate-limit toasts — one per 5s per user. */
const rateLimitToastMap = new Map<string, number>();

// ── Saved outfits helpers ────────────────────────────────────────────────

type OutfitScope =
  | { type: "user"; userId: string }
  | { type: "org"; orgId: string };

async function loadOutfits(scope: OutfitScope): Promise<SavedOutfit[]> {
  if (!isSupabaseConfigured) return [];
  try {
    let query = supabaseAdmin
      .from("sprite_heights_saved_outfits")
      .select("id, name, appearance, created_at");
    if (scope.type === "user") {
      query = query.eq("user_id", scope.userId).is("org_id", null);
    } else {
      query = query.eq("org_id", scope.orgId);
    }
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error || !data) return [];
    return data
      .filter((r: any) => isValidAppearance(r.appearance))
      .map((r: any) => ({
        id: r.id,
        name: r.name,
        appearance: r.appearance as CharAppearance,
        createdAt: r.created_at,
      }));
  } catch {
    return [];
  }
}

/** Resolve which wardrobe scope applies to the user's current room. */
function resolveOutfitScope(sess: UserSession): { scope: OutfitScope; editable: boolean } | null {
  if (!sess.roomId) return null;
  const room = tenants.getRoom(sess.roomId);
  if (!room) return null;

  if (room.roomType === "organization" && room.orgId) {
    const editable = tenants.isOrgAdmin(room.orgId, sess.user.id);
    return { scope: { type: "org", orgId: room.orgId }, editable };
  }

  // Personal room — show the owner's outfits
  const isOwner = room.ownerId === sess.user.id;
  return { scope: { type: "user", userId: room.ownerId }, editable: isOwner };
}

async function sendOutfits(ws: WebSocket, sess: UserSession): Promise<void> {
  const resolved = resolveOutfitScope(sess);
  if (!resolved) {
    ws.send(JSON.stringify({ type: "outfits", outfits: [], editable: false } satisfies ServerMsg));
    return;
  }
  const outfits = await loadOutfits(resolved.scope);
  ws.send(JSON.stringify({ type: "outfits", outfits, editable: resolved.editable } satisfies ServerMsg));
}

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(rootDir, "dist");

// ── Global error handlers ────────────────────────────────────────────────
// Stray promise rejections from the Cline SDK or fetch calls should not
// crash the server. Log them and continue.
process.on("unhandledRejection", (err) => {
  console.error("[fatal] Unhandled promise rejection:", err);
});
process.on("uncaughtException", (err) => {
  console.error("[fatal] Uncaught exception:", err);
});

// ── static file serving ──────────────────────────────────────────────────

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".map": "application/json",
};

const CLIENT_ENV_ALLOWLIST = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_WS_HOST",
  "VITE_APP_URL",
  "VITE_TURN_SERVER",
  "VITE_TURN_USERNAME",
  "VITE_TURN_CREDENTIAL",
];

function getEnvScript(): string {
  const envVars: Record<string, string> = {};
  for (const key of CLIENT_ENV_ALLOWLIST) {
    const val = process.env[key];
    if (val) envVars[key] = val;
  }
  // Escape </script> to prevent XSS via env values breaking out of the script tag
  const json = JSON.stringify(envVars).replace(/</g, "\\u003c");
  return `<script>window.__ENV__=${json};</script>`;
}

function absoluteUrl(req: IncomingMessage, path: string): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "localhost";
  return `${proto}://${host}${path}`;
}

async function injectMeta(html: string, req: IncomingMessage): Promise<string> {
  let result = html.replace("<head>", `<head>\n    ${getEnvScript()}`);
  // Rewrite relative og:image / twitter:image to absolute URLs with cache-busting
  try {
    const ogStat = await stat(join(distDir, "og-image.png"));
    const v = Math.floor(ogStat.mtimeMs);
    const absUrl = absoluteUrl(req, `/og-image.png?v=${v}`);
    result = result.replace(/content="\/og-image\.png"/g, `content="${absUrl}"`);
  } catch {
    // og-image.png missing — leave relative URLs as-is
  }
  return result;
}

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let urlPath = req.url?.split("?")[0] ?? "/";
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = normalize(join(distDir, urlPath));
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403, applySecurityHeaders());
    res.end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) throw new Error("is directory");
    let data = await readFile(filePath);
    const mime = MIME[extname(filePath)] ?? "application/octet-stream";
    const headers: Record<string, string> = applySecurityHeaders({ "Content-Type": mime });
    // Force no-cache on everything during OAuth debugging
    headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    // Inject runtime env vars and absolute OG image URLs into index.html
    if (urlPath === "/index.html" || urlPath === "/") {
      const html = data.toString("utf-8");
      const injected = await injectMeta(html, req);
      data = Buffer.from(injected, "utf-8");
    }
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    try {
      const indexPath = join(distDir, "index.html");
      let data = await readFile(indexPath);
      const html = data.toString("utf-8");
      const injected = await injectMeta(html, req);
      data = Buffer.from(injected, "utf-8");
      res.writeHead(200, applySecurityHeaders({ "Content-Type": "text/html; charset=utf-8" }));
      res.end(data);
    } catch {
      res.writeHead(404, applySecurityHeaders());
      res.end("Not found");
    }
  }
}

// ── tenant management ─────────────────────────────────────────────────────

const tenants = new TenantManager(rootDir);
const screenshots = new ScreenshotManager();

// ── HTTP + WebSocket server ───────────────────────────────────────────────

const server = createServer((req, res) => {
  // Agent Resources chat proxy — needs HQ context from the session
  if (req.url?.split("?")[0] === "/api/agent-resources") {
    void handleAgentResourcesRequest(req, res, () => {
      // In dev mode, use the dev session; in auth mode, find by token
      if (isSupabaseConfigured) {
        // Extract token from the request to find the session
        // For now, use the first session (single-user for Agent Resources context)
        const sess = tenants.values().next().value;
        if (!sess) return null;
        const snap = sess.manager.snapshot();
        return { agents: snap.agents, board: snap.board, bossName: sess.manager.bossName };
      }
      // Dev mode — use dev session
      const sess = tenants.get("dev");
      if (!sess) return null;
      const snap = sess.manager.snapshot();
      return { agents: snap.agents, board: snap.board, bossName: sess.manager.bossName };
    }).then((handled) => {
      if (!handled) {
        serveStatic(req, res).catch(() => {
          res.writeHead(500, applySecurityHeaders());
          res.end("Internal server error");
        });
      }
    });
    return;
  }

  // Publish agent to marketplace
  if (req.url?.split("?")[0] === "/api/publish-agent") {
    void handlePublishRequest(req, res).then((handled) => {
      if (!handled) {
        serveStatic(req, res).catch(() => {
          res.writeHead(500, applySecurityHeaders());
          res.end("Internal server error");
        });
      }
    });
    return;
  }

  // Stripe payment routes (checkout, webhook, portal, status)
  if (req.url?.split("?")[0]?.startsWith("/api/stripe")) {
    void handleStripeRequest(req, res).then((handled) => {
      if (!handled) {
        serveStatic(req, res).catch(() => {
          res.writeHead(500, applySecurityHeaders());
          res.end("Internal server error");
        });
      }
    });
    return;
  }

  // OAuth callback for MCP servers (e.g. Robinhood)
  if (req.url?.split("?")[0] === "/oauth/callback") {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const code = urlObj.searchParams.get("code");
    const state = urlObj.searchParams.get("state");
    const errorParam = urlObj.searchParams.get("error");

    if (errorParam) {
      res.writeHead(200, applySecurityHeaders({ "Content-Type": "text/html" }));
      res.end(`<html><body><h2>Authentication failed</h2><p>${escapeHtml(errorParam)}</p><script>window.close();</script></body></html>`);
      return;
    }
    if (!code || !state) {
      res.writeHead(400, applySecurityHeaders({ "Content-Type": "text/html" }));
      res.end("<html><body><h2>Missing code or state</h2></body></html>");
      return;
    }

    void handleOAuthCallback(code, state).then(async (result) => {
      console.log(`[oauth-callback] result: success=${result.success}, serverUrl=${result.serverUrl}, userId=${result.userId ?? "none"}, error=${result.error ?? "none"}`);
      // Notify the user's WS session if they're online
      if (result.userId) {
        const sess = tenants.get(result.userId);
        if (sess) {
          if (result.success) {
            // Refresh manager keys
            const mcpKeys = await getUserMcpKeys(sess.user.id);
            sess.manager.setMcpKeys(mcpKeys);
            console.log(`[oauth-callback] Updated MCP keys for user ${result.userId} (${Object.keys(mcpKeys).length} keys)`);
          }
          sess.broadcast({
            type: "mcp_oauth_complete",
            serverUrl: result.serverUrl ?? "",
            success: result.success,
            error: result.error,
          });
        }
      }
      res.writeHead(200, applySecurityHeaders({ "Content-Type": "text/html" }));
      if (result.success) {
        res.end(`<html><body style="background:#111;color:#e0e0e0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><h2 style="color:#53b86b;">✓ Connected!</h2><p>You can close this window.</p></div><script>setTimeout(function(){try{window.close();}catch(e){}setTimeout(function(){window.location.href='/';},1000);},500);</script></body></html>`);
      } else {
        res.end(`<html><body style="background:#111;color:#e0e0e0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><h2 style="color:#e05d5d;">Authentication failed</h2><p>${escapeHtml(result.error ?? "Unknown error")}</p></div><script>setTimeout(function(){try{window.close();}catch(e){}setTimeout(function(){window.location.href='/';},2000);},1000);</script></body></html>`);
      }
    });
    return;
  }

  // Agent screenshot endpoint — serves the latest browser frame as JPEG for iframe src
  if (req.url?.split("?")[0]?.startsWith("/api/agent-screenshot/")) {
    const agentId = req.url.split("/api/agent-screenshot/")[1]?.split("?")[0];
    if (!agentId) {
      res.writeHead(400, applySecurityHeaders({ "Content-Type": "text/plain" }));
      res.end("Missing agent id");
      return;
    }
    // Require authentication (skip in dev mode where auth is disabled)
    if (isSupabaseConfigured) {
      const params = new URLSearchParams(req.url?.split("?")[1] ?? "");
      const token = params.get("token");
      if (!token) {
        res.writeHead(401, applySecurityHeaders({ "Content-Type": "text/plain" }));
        res.end("Unauthorized");
        return;
      }
      void verifyToken(token).then((verified) => {
        if (!verified) {
          res.writeHead(403, applySecurityHeaders({ "Content-Type": "text/plain" }));
          res.end("Invalid or expired token");
          return;
        }
        const frame = browserLastFrame(agentId);
        if (frame) {
          res.writeHead(200, applySecurityHeaders({
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          }));
          res.end(Buffer.from(frame, "base64"));
        } else {
          res.writeHead(404, applySecurityHeaders({ "Content-Type": "text/plain" }));
          res.end("No screenshot available");
        }
      });
      return;
    }
    const frame = browserLastFrame(agentId);
    if (frame) {
      res.writeHead(200, applySecurityHeaders({
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      }));
      res.end(Buffer.from(frame, "base64"));
    } else {
      res.writeHead(404, applySecurityHeaders({ "Content-Type": "text/plain" }));
      res.end("No screenshot available");
    }
    return;
  }

  // MCP catalog — curated server directory
  if (req.url?.split("?")[0]?.startsWith("/api/mcp-catalog")) {
    handleMcpCatalogRequest(req, res);
    return;
  }

  // PulseMCP community search — search 22k+ community MCP servers
  if (req.url?.split("?")[0] === "/api/pulsemcp-search") {
    const params = new URLSearchParams(req.url?.split("?")[1] ?? "");
    const search = params.get("search") ?? "";
    if (!search) {
      res.writeHead(400, applySecurityHeaders({ "Content-Type": "application/json" }));
      res.end(JSON.stringify({ error: "Missing search parameter" }));
      return;
    }
    searchPulseMCPStructured(search, 20).then((results) => {
      res.writeHead(200, applySecurityHeaders({ "Content-Type": "application/json" }));
      res.end(JSON.stringify({ results, count: results.length }));
    }).catch(() => {
      res.writeHead(500, applySecurityHeaders({ "Content-Type": "application/json" }));
      res.end(JSON.stringify({ error: "Search failed" }));
    });
    return;
  }

  handleMarketplaceRequest(req, res).then((handled) => {
    if (!handled) {
      serveStatic(req, res).catch(() => {
        res.writeHead(500, applySecurityHeaders());
        res.end("Internal server error");
      });
    }
  });
});

const wss = new WebSocketServer({ server });

// Allowed origins for WebSocket connections (same-origin + explicit overrides)
const WS_ALLOWED_ORIGINS = new Set<string>(
  (process.env.WS_ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean),
);

function isWsOriginAllowed(origin: string | undefined, req: IncomingMessage): boolean {
  // No origin header = non-browser client (e.g. curl) — allow in dev only
  if (!origin) return process.env.NODE_ENV !== "production";
  // Always allow localhost / 127.0.0.1 for dev
  try {
    const parsed = new URL(origin);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return true;
  } catch { /* invalid origin */ }
  // Check explicit allowlist
  if (WS_ALLOWED_ORIGINS.has(origin)) return true;
  // Check same-origin: origin matches the request's host
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "";
  if (host && origin.replace(/\/$/, "") === `${new URL(origin).protocol}//${host}`) return true;
  return false;
}

/** Wait for an auth message from the client with a timeout. Returns the token or null. */
function waitForAuthMessage(ws: WebSocket, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.removeAllListeners("message");
        resolve(null);
      }
    }, timeoutMs);

    ws.on("message", (raw: Buffer) => {
      if (settled) return;
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "auth" && typeof msg.token === "string") {
          settled = true;
          clearTimeout(timer);
          ws.removeAllListeners("message");
          resolve(msg.token as string);
        }
      } catch {
        // ignore non-JSON or malformed messages while waiting for auth
      }
    });
  });
}

wss.on("connection", async (ws, req) => {
  // Validate WebSocket origin to prevent cross-site WebSocket hijacking
  const origin = req.headers["origin"] as string | undefined;
  if (!isWsOriginAllowed(origin, req)) {
    console.warn(`[ws] Rejected connection from origin: ${origin ?? "(none)"}`);
    ws.close(4003, "Origin not allowed");
    return;
  }

  const url = new URL(req.url ?? "", "http://localhost");

  // ── Spectator connection (read-only, no auth) ───────────────────────
  if (url.searchParams.get("spectator") === "1") {
    const livestreamUserId = process.env.LIVESTREAM_USER_ID ?? "dev";

    // Ensure the observed session exists
    let sess: UserSession;
    try {
      sess = await tenants.getOrCreate({ id: livestreamUserId, email: null });
    } catch (err) {
      console.error("[spectator] failed to get livestream session:", err);
      ws.close(1011, "Livestream office not available");
      return;
    }

    // Register as spectator
    sess.spectators.add(ws);
    console.log(`[spectator] connected — observing office of ${livestreamUserId} (${sess.spectators.size} spectators total)`);

    // Send snapshot of the observed office
    const snap = sess.manager.snapshot();
    ws.send(JSON.stringify({
      type: "snapshot",
      agents: snap.agents,
      logs: snap.logs,
      player: null,
      settings: sess.manager.settings,
      board: snap.board,
      schedules: sess.manager.snapshotSchedules(),
      world: sess.manager.worldState(),
    } satisfies ServerMsg));

    // Send mailbox states
    for (const mb of sess.manager.getMailboxSnapshots()) {
      ws.send(JSON.stringify({ type: "mailbox_update", ...mb } satisfies ServerMsg));
    }

    ws.on("message", async (raw) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // Only spectator_chat is accepted — forward to Agent Resources
      if (msg.type === "spectator_chat") {
        const text = `[${msg.fromName}]: ${msg.text}`.slice(0, 500);
        console.log(`[spectator] chat from ${msg.fromName}: ${msg.text}`);
        sess.manager.chat("agent-resources", text);
        return;
      }

      // Ignore all other message types from spectators
      console.warn(`[spectator] rejected message type: ${msg.type}`);
    });

    ws.on("close", () => {
      sess.spectators.delete(ws);
      console.log(`[spectator] disconnected (${sess.spectators.size} spectators remaining)`);
    });

    return;
  }

  // ── Normal authenticated connection ─────────────────────────────────
  let user: AuthUser;

  if (isSupabaseConfigured) {
    // Backward-compatible fallback: token in URL query param
    // (preferred path is auth message, but old clients still use this)
    const urlToken = url.searchParams.get("token");
    if (urlToken) {
      const verified = await verifyToken(urlToken);
      if (!verified) {
        ws.close(4003, "Invalid or expired token");
        return;
      }
      user = verified;
    } else {
      // New pattern: send auth_required, wait for auth message
      ws.send(JSON.stringify({ type: "auth_required" } satisfies ServerMsg));

      // Wait for auth message with a 10s timeout
      const authResult = await waitForAuthMessage(ws, 10_000);
      if (!authResult) {
        ws.close(4001, "No token provided within timeout");
        return;
      }
      const verified = await verifyToken(authResult);
      if (!verified) {
        ws.close(4003, "Invalid or expired token");
        return;
      }
      user = verified;
    }
  } else {
    user = { id: "dev", email: null };
  }

  const existingBefore = tenants.get(user.id);
  const sess = await tenants.getOrCreate(user);
  // If this is a reconnect for an existing session, cancel any pending disconnect timer
  if (existingBefore) {
    tenants.handleClientReconnect(user.id);
  }
  sess.clients.add(ws);

  // Send snapshot based on which room the user is in
  const currentRoom = sess.roomId ? tenants.getRoom(sess.roomId) : null;
  const accessLevel = currentRoom ? tenants.computeAccessLevel(currentRoom, sess.user.id) : "no_access";
  if (currentRoom && accessLevel !== "no_access") {
    // Use the room's agent manager (personal for private, shared for org)
    const roomMgr = tenants.getRoomManager(currentRoom.id);
    if (roomMgr) {
      const snap = roomMgr.snapshot();
      ws.send(JSON.stringify({
        type: "snapshot",
        agents: snap.agents,
        logs: snap.logs,
        player: sess.player,
        settings: roomMgr.settings,
        board: snap.board,
        schedules: roomMgr.snapshotSchedules(),
        world: roomMgr.worldState(),
      } satisfies ServerMsg));
      // Send mailbox states so flags are correct on initial load
      for (const mb of roomMgr.getMailboxSnapshots()) {
        ws.send(JSON.stringify({ type: "mailbox_update", ...mb } satisfies ServerMsg));
      }
      // Send platform connection states so client knows which platforms are connected
      ws.send(JSON.stringify({ type: "platform_connection", states: roomMgr.getPlatformConnectionStates() } satisfies ServerMsg));
    } else {
      ws.send(JSON.stringify({ type: "snapshot", agents: [], logs: {}, board: [], schedules: [], player: sess.player, settings: sess.manager.settings, world: null } satisfies ServerMsg));
    }
  } else {
    // HQ2 or no room — empty snapshot
    ws.send(JSON.stringify({
      type: "snapshot",
      agents: [],
      logs: {},
      board: [],
      schedules: [],
      player: sess.player,
      settings: sess.manager.settings,
      world: null,
    } satisfies ServerMsg));
  }

  // Tell the client whether they have an API key set
  ws.send(JSON.stringify({ type: "api_key_status", hasKey: sess.apiKey != null } satisfies ServerMsg));

  // Send saved outfits
  void sendOutfits(ws, sess);

  // Send payment status so the client can gate UI (entrance fee + subscription)
  let freeTrialTimer: ReturnType<typeof setTimeout> | null = null;
  if (isSupabaseConfigured && isStripeConfigured) {
    try {
      const payStatus = await getUserPaymentStatus(user.id);

      // Start a free trial for authed users who haven't paid the entrance fee
      let freeTrialExpiresAt = payStatus.freeTrialExpiresAt;
      if (!payStatus.entrancePaid && !freeTrialExpiresAt) {
        freeTrialExpiresAt = startFreeTrial(user.id);
      }

      ws.send(JSON.stringify({
        type: "payment_status",
        entrancePaid: payStatus.entrancePaid,
        subscriptionActive: payStatus.subscriptionActive,
        subscriptionStatus: payStatus.subscriptionStatus,
        subscriptionTier: payStatus.subscriptionTier,
        agentLimit: payStatus.agentLimit,
        currentPeriodEnd: payStatus.currentPeriodEnd,
        freeTrialExpiresAt,
      } satisfies ServerMsg));

      // Set timer to notify when free trial expires
      if (freeTrialExpiresAt) {
        const msUntilExpiry = freeTrialExpiresAt - Date.now();
        if (msUntilExpiry > 0) {
          freeTrialTimer = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "payment_required",
                reason: "entrance",
                message: "Your 2-minute free trial has ended. Pay the $1 entrance fee to keep playing.",
              } satisfies ServerMsg));
            }
          }, msUntilExpiry);
        } else {
          // Already expired
          ws.send(JSON.stringify({
            type: "payment_required",
            reason: "entrance",
            message: "Your 2-minute free trial has ended. Pay the $1 entrance fee to keep playing.",
          } satisfies ServerMsg));
        }
      }
    } catch (err) {
      console.error("[server] failed to get payment status:", err);
    }
  }

  // Helper: send the user's list of rooms they own or have joined
  const sendRoomsList = () => {
    const rooms = tenants.getRoomsForUser(sess.user.id).map(r => ({ roomId: r.id, name: r.name, isPrivate: r.isPrivate, roomType: r.roomType, orgId: r.orgId }));
    ws.send(JSON.stringify({ type: "rooms_list", rooms } satisfies ServerMsg));
  };

  // Send initial room state for whatever room the user is in
  if (sess.roomId && currentRoom) {
    ws.send(JSON.stringify({
      type: "room_state",
      roomId: sess.roomId,
      name: currentRoom.name,
      players: tenants.getRoomPlayers(sess.roomId),
      privateOfficeId: sess.privateOfficeId ?? undefined,
      projectorChannel: currentRoom.projectorChannel,
      accessLevel,
    } satisfies ServerMsg));
  }
  sendRoomsList();

  // ── Token refresh timer ──────────────────────────────────────────────
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleTokenRefresh(token: string): void {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (expiryTimer) clearTimeout(expiryTimer);
    if (!isSupabaseConfigured) return;

    const exp = getTokenExpiry(token);
    if (!exp) return;

    const now = Math.floor(Date.now() / 1000);
    const ttl = exp - now; // seconds until expiry

    // Send refresh_token 5 min before expiry (or immediately if < 5 min left)
    const refreshIn = Math.max((ttl - 300) * 1000, 0);

    refreshTimer = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "refresh_token" } satisfies ServerMsg));
        // Close connection if not renewed within 60s
        expiryTimer = setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(4003, "Token expired — not renewed");
          }
        }, 60_000);
      }
    }, refreshIn);
  }

  if (isSupabaseConfigured) {
    const initialToken = url.searchParams.get("token");
    if (initialToken) scheduleTokenRefresh(initialToken);
  }

  ws.on("message", async (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    try {
      const { manager, session: sessLog, save } = sess;

      // Unified permission system: check access level for the current room
      const accessLevel = tenants.getRoomAccessLevel(sess.user.id);

      // Pre-check: if this is a chat message to a busy agent, reject before
      // consuming a rate-limit token (prevents "too many requests" spam).
      if (msg.type === "chat" && accessLevel !== "no_access") {
        const roomMgr = tenants.getRoomManager(sess.roomId!);
        const mgr0 = roomMgr ?? manager;
        const agent0 = mgr0.getAgentInfo(msg.agentId);
        if (agent0 && (agent0.status === "thinking" || agent0.status === "working")) {
          sess.broadcast({ type: "toast", text: `${agent0.name} is heads-down right now.` });
          return;
        }
      }

      if (!(await rateLimitAsync(sess.user.id, msg.type))) {
        console.warn(`[rate-limit] BLOCKED user=${sess.user.id} type=${msg.type}`);
        // Throttle the "too many requests" toast itself — only one per 5s
        const rlKey = `rltoast:${sess.user.id}`;
        const now = Date.now();
        if (!rateLimitToastMap.has(rlKey) || now - rateLimitToastMap.get(rlKey)! > 5000) {
          rateLimitToastMap.set(rlKey, now);
          const data = JSON.stringify({ type: "toast", text: "Too many requests — slow down." });
          if (ws.readyState === WebSocket.OPEN) ws.send(data);
        }
        return;
      }

      // Permission tiers: manage > talk > tour > no_access
      const MANAGE_ONLY = new Set(["hire", "assign", "assign_all", "stop", "stop_all", "fire", "vacation", "restore", "recruit", "create_card", "assign_card", "move_card", "delete_card", "create_schedule", "update_schedule", "delete_schedule", "set_settings", "set_api_key", "set_mcp_key", "check_mcp_keys", "start_mcp_oauth", "submit_mcp_oauth_code", "clear", "clear_all", "rename", "set_agent_acl", "set_mailbox_platform"]);
      const TALK_OR_ABOVE = new Set(["chat", "agent_view_start", "agent_view_stop", "agent_broadcast_start", "agent_broadcast_stop", "agent_fs_list", "agent_fs_read", "agent_fs_write", "agent_fs_delete", "agent_fs_upload", "agent_log_subscribe", "agent_log_unsubscribe", "agent_inject_task", "agent_memory_request"]);

      if (MANAGE_ONLY.has(msg.type) && accessLevel !== "manage") {
        sess.broadcast({ type: "toast", text: accessLevel === "tour" ? "Tour mode — you can look around but not manage agents. Ask an admin for talk access." : "Only room managers can do that." });
        return;
      }

      if (TALK_OR_ABOVE.has(msg.type) && accessLevel !== "talk" && accessLevel !== "manage") {
        sess.broadcast({ type: "toast", text: accessLevel === "tour" ? "Tour mode — you can see agents but not interact. Ask an admin for talk access." : "No agents here — visit an office to chat." });
        return;
      }

      // Use the room's agent manager (shared for org rooms, owner's for private rooms)
      const roomMgr = sess.roomId ? tenants.getRoomManager(sess.roomId) : null;
      const activeManager = roomMgr ?? manager;

      switch (msg.type) {
        case "setup": {
          const name = String(msg.player?.name ?? "").trim().slice(0, 24);
          const workspace = String(msg.player?.workspace ?? "").trim().slice(0, 32);
          if (!name || !workspace) break;
          const appearance = msg.player?.appearance ?? null;
          const changed =
            !sess.player || sess.player.name !== name || sess.player.workspace !== workspace;
          const appearanceChanged = appearance && (!sess.player || !sess.player.appearance || JSON.stringify(sess.player.appearance) !== JSON.stringify(appearance));
          if (changed) {
            sess.player = { name, workspace, appearance };
            manager.bossName = name;
            sessLog.setPlayer(sess.player);
            save.setPlayer(sess.player);
            sess.broadcast({ type: "player", player: sess.player });
          } else if (appearance && sess.player && !sess.player.appearance) {
            sess.player = { name: sess.player.name, workspace: sess.player.workspace, appearance };
            save.setPlayer(sess.player);
            sess.broadcast({ type: "player", player: sess.player });
          }
          // Broadcast appearance change to room peers
          if (appearanceChanged && sess.roomId) {
            const room = tenants.getRoom(sess.roomId);
            if (room) {
              const rp = room.players.get(sess.user.id);
              if (rp) rp.appearance = appearance;
              for (const [pid] of room.players) {
                if (pid === sess.user.id) continue;
                const otherSess = tenants.get(pid);
                if (otherSess) {
                  otherSess.broadcast({
                    type: "player_appearance",
                    roomId: sess.roomId,
                    userId: sess.user.id,
                    appearance,
                  });
                }
              }
            }
          }
          break;
        }
        case "set_settings":
          activeManager.setSettings(msg.settings);
          if (msg.settings.railway?.enabled) {
            checkRailwayStatus().then((status) => {
              sess.broadcast({ type: "railway_status", ok: status.ok, message: status.message });
            });
          }
          break;
        case "hire":
          await activeManager.hire(msg.name, msg.provider, msg.model, msg.systemPrompt ?? "", msg.role ?? "worker", msg.sprite, msg.appearance, msg.mcpServers, msg.personality);
          break;
        case "update_appearance": {
          if (!sess.player) break;
          sess.player = { ...sess.player, appearance: msg.appearance };
          save.setPlayer(sess.player);
          sess.broadcast({ type: "player", player: sess.player });
          // Update RoomPlayer appearance and notify others in the room
          if (sess.roomId) {
            const room = tenants.getRoom(sess.roomId);
            if (room) {
              const rp = room.players.get(sess.user.id);
              if (rp) rp.appearance = msg.appearance;
              for (const [pid] of room.players) {
                if (pid === sess.user.id) continue;
                const otherSess = tenants.get(pid);
                if (otherSess) {
                  otherSess.broadcast({
                    type: "player_appearance",
                    roomId: sess.roomId,
                    userId: sess.user.id,
                    appearance: msg.appearance,
                  });
                }
              }
            }
          }
          break;
        }
        case "assign":
          activeManager.assign(msg.agentId, msg.task, msg.handoffTo);
          break;
        case "chat": {
          // Per-agent ACL check
          const agentInfo = activeManager.getAgentInfo(msg.agentId);
          if (agentInfo?.acl) {
            const acl = agentInfo.acl;
            // Manage level bypasses all ACL checks
            if (accessLevel !== "manage") {
              let allowed = true;
              if (acl.allowedUserIds && acl.allowedUserIds.length > 0) {
                allowed = acl.allowedUserIds.includes(sess.user.id);
              }
              if (allowed && acl.allowedRoles && acl.allowedRoles.length > 0 && sess.roomId) {
                const room = tenants.getRoom(sess.roomId);
                if (room?.orgId) {
                  const org = tenants.getOrg(room.orgId);
                  const member = org?.members.get(sess.user.id);
                  if (member) {
                    allowed = acl.allowedRoles.includes(member.role);
                  } else {
                    allowed = false; // non-member can't chat with role-restricted agent
                  }
                }
              }
              if (!allowed) {
                sess.broadcast({ type: "toast", text: "You don't have permission to chat with this agent." });
                break;
              }
            }
          }
          activeManager.chat(msg.agentId, msg.text);
          break;
        }
        case "assign_all":
          activeManager.assignAll(msg.task);
          break;
        case "stop":
          activeManager.stop(msg.agentId);
          break;
        case "stop_all":
          activeManager.stopAll();
          break;
        case "fire":
          await activeManager.fire(msg.agentId);
          screenshots.stopAll(msg.agentId);
          await closeAgentBrowser(msg.agentId);
          break;
        case "vacation":
          await activeManager.vacation(msg.agentId);
          break;
        case "restore":
          await activeManager.restore(msg.agentId);
          break;
        case "clear":
          activeManager.clearChat(msg.agentId);
          break;
        case "clear_all":
          activeManager.clearAllChats();
          break;
        case "create_card":
          activeManager.createCard(msg.title, msg.description);
          break;
        case "assign_card":
          activeManager.assignCard(msg.cardId, msg.agentId);
          break;
        case "move_card":
          activeManager.moveCard(msg.cardId, msg.status);
          break;
        case "delete_card":
          activeManager.deleteCard(msg.cardId);
          break;
        case "create_schedule":
          activeManager.createSchedule(msg.agentId, msg.name, msg.task, msg.cronExpression, msg.handoffTo);
          break;
        case "update_schedule":
          activeManager.updateSchedule(msg.scheduleId, { enabled: msg.enabled, name: msg.name, task: msg.task, cronExpression: msg.cronExpression });
          break;
        case "delete_schedule":
          activeManager.deleteSchedule(msg.scheduleId);
          break;
        case "recruit":
          await activeManager.recruit(msg.firedAgentId);
          break;
        case "rename":
          activeManager.rename(msg.agentId, msg.name);
          break;
        case "set_agent_acl":
          activeManager.setAgentACL(msg.agentId, msg.acl);
          break;
        case "railway_query":
          queryRailway().then((result) => {
            sess.broadcast({ type: "railway_data", data: result.data, error: result.error });
          }).catch((err) => {
            console.error("[server] railway_query failed:", err);
            sess.broadcast({ type: "railway_data", data: null, error: err instanceof Error ? err.message : String(err) });
          });
          break;
        case "github_query": {
          const mcpKeys = await getUserMcpKeys(sess.user.id);
          const token = getGithubToken(sess.user.id, mcpKeys);
          if (!token) {
            sess.broadcast({ type: "github_status", connected: false, login: null, error: "No GitHub token found. Add a GitHub MCP key in Settings." });
            break;
          }
          try {
            const user = await getAuthenticatedUser(token);
            if (!user) {
              sess.broadcast({ type: "github_status", connected: false, login: null, error: "Invalid GitHub token." });
              break;
            }
            sess.broadcast({ type: "github_status", connected: true, login: user.login, error: null });
            // Also try to list branches from the user's fork
            try {
              const branches = await listBranches(token, user.login, "agent-hq");
              sess.broadcast({ type: "github_data", branches: branches.map(b => ({ name: b.name, sha: b.sha })), fork: { owner: user.login, name: "agent-hq", fullName: `${user.login}/agent-hq`, cloneUrl: `https://github.com/${user.login}/agent-hq.git`, branch: branches[0]?.name ?? "main" }, error: null });
            } catch {
              // Fork might not exist yet — that's OK
              sess.broadcast({ type: "github_data", branches: [], fork: null, error: null });
            }
          } catch (err) {
            sess.broadcast({ type: "github_status", connected: false, login: null, error: err instanceof Error ? err.message : String(err) });
          }
          break;
        }
        case "github_fork": {
          const mcpKeys = await getUserMcpKeys(sess.user.id);
          const token = getGithubToken(sess.user.id, mcpKeys);
          if (!token) {
            sess.broadcast({ type: "github_error", error: "No GitHub token found. Add a GitHub MCP key in Settings." });
            break;
          }
          try {
            const user = await getAuthenticatedUser(token);
            if (!user) {
              sess.broadcast({ type: "github_error", error: "Invalid GitHub token." });
              break;
            }
            // Fork the repo if it doesn't exist yet
            let forkOwner = user.login;
            let forkName = "agent-hq";
            try {
              await listBranches(token, forkOwner, forkName);
            } catch {
              // Fork doesn't exist — create it
              const fork = await forkSourceRepo(token);
              forkOwner = fork.owner;
              forkName = fork.name;
            }
            // Create the new branch
            const branch = await createBranch(token, forkOwner, forkName, msg.branchName);
            sess.broadcast({
              type: "github_fork_created",
              fork: { owner: forkOwner, name: forkName, fullName: `${forkOwner}/${forkName}`, cloneUrl: `https://github.com/${forkOwner}/${forkName}.git`, branch: branch.name },
              branchName: msg.branchName,
            });
          } catch (err) {
            sess.broadcast({ type: "github_error", error: err instanceof Error ? err.message : String(err) });
          }
          break;
        }
        case "github_list_branches": {
          const mcpKeys = await getUserMcpKeys(sess.user.id);
          const token = getGithubToken(sess.user.id, mcpKeys);
          if (!token) {
            sess.broadcast({ type: "github_error", error: "No GitHub token found." });
            break;
          }
          try {
            const user = await getAuthenticatedUser(token);
            if (!user) {
              sess.broadcast({ type: "github_error", error: "Invalid GitHub token." });
              break;
            }
            const branches = await listBranches(token, user.login, "agent-hq");
            sess.broadcast({ type: "github_data", branches: branches.map(b => ({ name: b.name, sha: b.sha })), fork: { owner: user.login, name: "agent-hq", fullName: `${user.login}/agent-hq`, cloneUrl: `https://github.com/${user.login}/agent-hq.git`, branch: branches[0]?.name ?? "main" }, error: null });
          } catch (err) {
            sess.broadcast({ type: "github_error", error: err instanceof Error ? err.message : String(err) });
          }
          break;
        }
        case "github_delete_branch": {
          const mcpKeys = await getUserMcpKeys(sess.user.id);
          const token = getGithubToken(sess.user.id, mcpKeys);
          if (!token) {
            sess.broadcast({ type: "github_error", error: "No GitHub token found." });
            break;
          }
          try {
            const user = await getAuthenticatedUser(token);
            if (!user) {
              sess.broadcast({ type: "github_error", error: "Invalid GitHub token." });
              break;
            }
            await deleteBranch(token, user.login, "agent-hq", msg.branchName);
            // Refresh branch list
            const branches = await listBranches(token, user.login, "agent-hq");
            sess.broadcast({ type: "github_data", branches: branches.map(b => ({ name: b.name, sha: b.sha })), fork: { owner: user.login, name: "agent-hq", fullName: `${user.login}/agent-hq`, cloneUrl: `https://github.com/${user.login}/agent-hq.git`, branch: branches[0]?.name ?? "main" }, error: null });
          } catch (err) {
            sess.broadcast({ type: "github_error", error: err instanceof Error ? err.message : String(err) });
          }
          break;
        }
        case "railway_deploy": {
          sess.broadcast({ type: "railway_deploy_started", branchName: msg.branchName, message: `Deploying ${msg.branchName} to Railway...` });
          const result = await deployWorldToRailway(msg.branchName, msg.repoFullName);
          if (result.error || !result.deployment) {
            sess.broadcast({ type: "railway_deploy_result", deployment: { branchName: msg.branchName, repoFullName: msg.repoFullName, railwayProjectId: "", railwayServiceId: "", railwayServiceUrl: null, status: "failed", createdAt: Date.now() }, error: result.error ?? "Unknown error" });
          } else {
            sess.broadcast({ type: "railway_deploy_result", deployment: result.deployment, error: null });
          }
          break;
        }
        case "railway_list_deployments": {
          const result = await listWorldDeployments();
          sess.broadcast({ type: "railway_deployments", deployments: result.deployments, error: result.error });
          break;
        }
        case "railway_stop_deployment": {
          const result = await stopWorldDeployment(msg.branchName, false);
          if (result.error) {
            sess.broadcast({ type: "railway_deployments", deployments: [], error: result.error });
          } else {
            // Refresh list after stopping
            const listResult = await listWorldDeployments();
            sess.broadcast({ type: "railway_deployments", deployments: listResult.deployments, error: null });
          }
          break;
        }
        case "railway_delete_deployment": {
          const result = await stopWorldDeployment(msg.branchName, true);
          if (result.error) {
            sess.broadcast({ type: "railway_deployments", deployments: [], error: result.error });
          } else {
            const listResult = await listWorldDeployments();
            sess.broadcast({ type: "railway_deployments", deployments: listResult.deployments, error: null });
          }
          break;
        }
        case "github_list_dir": {
          const mcpKeys = await getUserMcpKeys(sess.user.id);
          const token = getGithubToken(sess.user.id, mcpKeys);
          if (!token) { sess.broadcast({ type: "github_error", error: "No GitHub token found." }); break; }
          try {
            const user = await getAuthenticatedUser(token);
            if (!user) { sess.broadcast({ type: "github_error", error: "Invalid GitHub token." }); break; }
            const entries = await listRepoDir(token, user.login, "agent-hq", msg.branchName, msg.path);
            sess.broadcast({ type: "github_dir", branchName: msg.branchName, path: msg.path, entries, error: null });
          } catch (err) {
            sess.broadcast({ type: "github_dir", branchName: msg.branchName, path: msg.path, entries: [], error: err instanceof Error ? err.message : String(err) });
          }
          break;
        }
        case "github_read_file": {
          const mcpKeys = await getUserMcpKeys(sess.user.id);
          const token = getGithubToken(sess.user.id, mcpKeys);
          if (!token) { sess.broadcast({ type: "github_error", error: "No GitHub token found." }); break; }
          try {
            const user = await getAuthenticatedUser(token);
            if (!user) { sess.broadcast({ type: "github_error", error: "Invalid GitHub token." }); break; }
            const file = await readRepoFile(token, user.login, "agent-hq", msg.branchName, msg.path);
            if (!file) {
              sess.broadcast({ type: "github_file", branchName: msg.branchName, path: msg.path, content: "", sha: "", error: "File not found" });
            } else {
              sess.broadcast({ type: "github_file", branchName: msg.branchName, path: msg.path, content: file.content, sha: file.sha, error: null });
            }
          } catch (err) {
            sess.broadcast({ type: "github_file", branchName: msg.branchName, path: msg.path, content: "", sha: "", error: err instanceof Error ? err.message : String(err) });
          }
          break;
        }
        case "github_write_file": {
          const mcpKeys = await getUserMcpKeys(sess.user.id);
          const token = getGithubToken(sess.user.id, mcpKeys);
          if (!token) { sess.broadcast({ type: "github_error", error: "No GitHub token found." }); break; }
          try {
            const user = await getAuthenticatedUser(token);
            if (!user) { sess.broadcast({ type: "github_error", error: "Invalid GitHub token." }); break; }
            await writeRepoFile(token, user.login, "agent-hq", msg.branchName, msg.path, msg.content, msg.sha, msg.commitMessage);
            sess.broadcast({ type: "github_file_saved", branchName: msg.branchName, path: msg.path, message: msg.commitMessage });
          } catch (err) {
            sess.broadcast({ type: "github_error", error: err instanceof Error ? err.message : String(err) });
          }
          break;
        }
        case "github_create_file": {
          const mcpKeys = await getUserMcpKeys(sess.user.id);
          const token = getGithubToken(sess.user.id, mcpKeys);
          if (!token) { sess.broadcast({ type: "github_error", error: "No GitHub token found." }); break; }
          try {
            const user = await getAuthenticatedUser(token);
            if (!user) { sess.broadcast({ type: "github_error", error: "Invalid GitHub token." }); break; }
            await createRepoFile(token, user.login, "agent-hq", msg.branchName, msg.path, msg.content, msg.commitMessage);
            sess.broadcast({ type: "github_file_saved", branchName: msg.branchName, path: msg.path, message: msg.commitMessage });
          } catch (err) {
            sess.broadcast({ type: "github_error", error: err instanceof Error ? err.message : String(err) });
          }
          break;
        }
        case "github_delete_file": {
          const mcpKeys = await getUserMcpKeys(sess.user.id);
          const token = getGithubToken(sess.user.id, mcpKeys);
          if (!token) { sess.broadcast({ type: "github_error", error: "No GitHub token found." }); break; }
          try {
            const user = await getAuthenticatedUser(token);
            if (!user) { sess.broadcast({ type: "github_error", error: "Invalid GitHub token." }); break; }
            await deleteRepoFile(token, user.login, "agent-hq", msg.branchName, msg.path, msg.sha, msg.commitMessage);
            sess.broadcast({ type: "github_file_deleted", branchName: msg.branchName, path: msg.path });
          } catch (err) {
            sess.broadcast({ type: "github_error", error: err instanceof Error ? err.message : String(err) });
          }
          break;
        }
        case "set_api_key": {
          const trimmed = msg.apiKey.trim();
          if (trimmed) {
            const { error } = await setUserApiKey(sess.user.id, trimmed);
            if (error) {
              sess.broadcast({ type: "toast", text: `Failed to save API key: ${error}` });
            } else {
              sess.apiKey = trimmed;
              sess.manager.setApiKey(sess.apiKey);
              sess.broadcast({ type: "api_key_status", hasKey: true });
              sess.broadcast({ type: "toast", text: "API key saved — your agents will use it now." });
            }
          } else {
            const { error } = await deleteUserApiKey(sess.user.id);
            if (error) {
              sess.broadcast({ type: "toast", text: `Failed to clear API key: ${error}` });
            } else {
              sess.apiKey = null;
              sess.manager.setApiKey(null);
              sess.broadcast({ type: "api_key_status", hasKey: false });
              sess.broadcast({ type: "toast", text: "API key cleared — using the server's shared key." });
            }
          }
          break;
        }
        case "check_mcp_keys": {
          const keyUrls = await getUserMcpKeyUrls(sess.user.id);
          const results = msg.serverUrls.map((u) => ({ serverUrl: u, hasKey: keyUrls.has(u) }));
          sess.broadcast({ type: "mcp_keys_status", results });
          break;
        }
        case "start_mcp_oauth": {
          // Build base URL: prefer clientOrigin (browser's window.location.origin),
          // then PUBLIC_URL env, then origin/forwarded-host headers, then host
          const publicUrl = process.env.PUBLIC_URL || process.env.VITE_APP_URL;
          const forwardedHost = (req.headers["x-forwarded-host"] as string) || "";
          const originHeader = (req.headers["origin"] as string) || "";
          const proto = (req.headers["x-forwarded-proto"] as string) || "https";
          const host = (req.headers["host"] as string) || "localhost:8080";
          const baseUrl = msg.clientOrigin
            || publicUrl
            || (originHeader ? originHeader.replace(/\/$/, "") : "")
            || (forwardedHost ? `${proto}://${forwardedHost}` : "")
            || `${proto}://${host}`;
          console.log(`[mcp-oauth] startOAuthFlow baseUrl=${baseUrl} (clientOrigin=${msg.clientOrigin || "none"}, PUBLIC_URL=${publicUrl ?? "unset"}, origin=${originHeader || "none"}, forwardedHost=${forwardedHost || "none"}, host=${host})`);
          try {
            const { authUrl, redirectMode } = await startOAuthFlow(msg.serverUrl, sess.user.id, baseUrl);
            sess.broadcast({ type: "mcp_oauth_code_needed", serverUrl: msg.serverUrl, authUrl, redirectMode });
          } catch (err) {
            const msg2 = err instanceof Error ? err.message : String(err);
            sess.broadcast({ type: "mcp_oauth_complete", serverUrl: msg.serverUrl, success: false, error: msg2 });
          }
          break;
        }
        case "submit_mcp_oauth_code": {
          const result = await exchangeOAuthCode(msg.callbackUrl);
          if (result.userId) {
            const sess2 = tenants.get(result.userId);
            if (sess2) {
              if (result.success) {
                const mcpKeys = await getUserMcpKeys(sess2.user.id);
                sess2.manager.setMcpKeys(mcpKeys);
              }
              sess2.broadcast({
                type: "mcp_oauth_complete",
                serverUrl: result.serverUrl ?? msg.serverUrl,
                success: result.success,
                error: result.error,
              });
            }
          } else {
            // No userId means state wasn't found — broadcast error to current session
            sess.broadcast({
              type: "mcp_oauth_complete",
              serverUrl: msg.serverUrl,
              success: false,
              error: result.error ?? "OAuth state not found. Please try again.",
            });
          }
          break;
        }
        case "set_mcp_key": {
          const trimmed = msg.apiKey.trim();
          if (trimmed) {
            const { error } = await setUserMcpKey(sess.user.id, msg.serverUrl, trimmed);
            if (error) {
              sess.broadcast({ type: "toast", text: `Failed to save MCP key: ${error}` });
            } else {
              sess.broadcast({ type: "mcp_key_status", serverUrl: msg.serverUrl, hasKey: true });
              sess.broadcast({ type: "toast", text: "MCP key saved — this server's tools will use it now." });
            }
          } else {
            const { error } = await deleteUserMcpKey(sess.user.id, msg.serverUrl);
            if (error) {
              sess.broadcast({ type: "toast", text: `Failed to clear MCP key: ${error}` });
            } else {
              sess.broadcast({ type: "mcp_key_status", serverUrl: msg.serverUrl, hasKey: false });
              sess.broadcast({ type: "toast", text: "MCP key cleared." });
            }
          }
          // Refresh the manager's MCP key cache
          const mcpKeys = await getUserMcpKeys(sess.user.id);
          sess.manager.setMcpKeys(mcpKeys);
          break;
        }
        case "save_outfit": {
          if (!isValidAppearance(msg.appearance)) break;
          const resolved = resolveOutfitScope(sess);
          if (!resolved || !resolved.editable) {
            sess.broadcast({ type: "toast", text: "You can't save outfits to this wardrobe." });
            break;
          }
          const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const name = msg.name.trim().slice(0, 24) || "Outfit";
          const createdAt = Date.now();
          if (isSupabaseConfigured) {
            try {
              const row: Record<string, unknown> = { id, user_id: sess.user.id, name, appearance: msg.appearance, created_at: createdAt };
              if (resolved.scope.type === "org") row.org_id = resolved.scope.orgId;
              await supabaseAdmin.from("sprite_heights_saved_outfits").insert(row);
            } catch (err) {
              console.error("[outfits] save failed:", err);
            }
          }
          await sendOutfits(ws, sess);
          break;
        }
        case "delete_outfit": {
          const resolved = resolveOutfitScope(sess);
          if (!resolved || !resolved.editable) {
            sess.broadcast({ type: "toast", text: "You can't delete outfits from this wardrobe." });
            break;
          }
          if (isSupabaseConfigured) {
            try {
              const del = supabaseAdmin.from("sprite_heights_saved_outfits").delete().eq("id", msg.id);
              if (resolved.scope.type === "org") {
                del.eq("org_id", resolved.scope.orgId);
              } else {
                del.eq("user_id", resolved.scope.userId).is("org_id", null);
              }
              await del;
            } catch (err) {
              console.error("[outfits] delete failed:", err);
            }
          }
          await sendOutfits(ws, sess);
          break;
        }
        case "renew_token": {
          const verified = await verifyToken(msg.token);
          if (!verified) {
            ws.close(4003, "Invalid renewal token");
            break;
          }
          scheduleTokenRefresh(msg.token);
          break;
        }
        case "create_room": {
          const roomId = tenants.createRoom(sess.user.id, msg.name, msg.theme, true);
          // Notify old room that the player left
          const oldRoomId = sess.roomId;
          if (oldRoomId) {
            for (const p of tenants.getRoomPlayers(oldRoomId)) {
              if (p.userId === sess.user.id) continue;
              const otherSess = tenants.get(p.userId);
              if (otherSess) {
                otherSess.broadcast({ type: "player_left", roomId: oldRoomId, userId: sess.user.id });
              }
            }
          }
          // Switch the creator into the new room
          const room = tenants.switchRoom(sess.user.id, roomId);
          if (room) {
            sess.broadcast({
              type: "room_state",
              roomId,
              name: room.name,
              players: tenants.getRoomPlayers(roomId),
              privateOfficeId: sess.privateOfficeId ?? undefined,
              projectorChannel: room.projectorChannel,
              accessLevel: tenants.computeAccessLevel(room, sess.user.id),
            });
            sendRoomsList();
            void sendOutfits(ws, sess);
          }
          break;
        }
        case "join_room": {
          const room = tenants.getRoom(msg.roomId);
          if (!room) {
            sess.broadcast({ type: "toast", text: "Room not found." });
            break;
          }
          // Check join permission (private rooms need invite, org rooms need membership)
          if (!tenants.canJoinRoom(msg.roomId, sess.user.id)) {
            if (room.roomType === "organization") {
              sess.broadcast({ type: "toast", text: "You need to be a member of this organization to join." });
            } else {
              sess.broadcast({ type: "toast", text: "This is a private office. You need an invite." });
            }
            break;
          }
          // Notify old room that the player left
          const oldRoomId = sess.roomId;
          if (oldRoomId && oldRoomId !== msg.roomId) {
            for (const p of tenants.getRoomPlayers(oldRoomId)) {
              if (p.userId === sess.user.id) continue;
              const otherSess = tenants.get(p.userId);
              if (otherSess) {
                otherSess.broadcast({ type: "player_left", roomId: oldRoomId, userId: sess.user.id });
              }
            }
          }
          const joined = tenants.switchRoom(sess.user.id, msg.roomId);
          if (!joined) {
            sess.broadcast({ type: "toast", text: "Failed to join room." });
            break;
          }
          const players = tenants.getRoomPlayers(msg.roomId);
          // Send full room state to the joining player
          const joinAccessLevel = tenants.computeAccessLevel(room, sess.user.id);
          sess.broadcast({
            type: "room_state",
            roomId: msg.roomId,
            name: room.name,
            players,
            privateOfficeId: sess.privateOfficeId ?? undefined,
            accessLevel: joinAccessLevel,
          });
          sendRoomsList();
          // Send outfits for the joined room's wardrobe
          void sendOutfits(ws, sess);
          // Re-broadcast active screen share / webcam state to the joining player
          for (const p of players) {
            if (p.userId === sess.user.id) continue;
            const peerSess = tenants.get(p.userId);
            if (!peerSess) continue;
            if (peerSess.screenShareActive) {
              sess.broadcast({ type: "screen_share_peer", userId: p.userId, name: peerSess.player?.name ?? "Boss" });
            }
            if (peerSess.webcamActive) {
              sess.broadcast({ type: "webcam_state", presenterId: p.userId, presenterName: peerSess.player?.name ?? "Boss" });
              sess.broadcast({ type: "webcam_peer", userId: p.userId, name: peerSess.player?.name ?? "Boss" });
            }
          }
          // Notify all other players in the room
          const me = players.find((p) => p.userId === sess.user.id);
          for (const p of players) {
            if (p.userId === sess.user.id) continue;
            const otherSess = tenants.get(p.userId);
            if (otherSess && me) {
              otherSess.broadcast({
                type: "player_joined",
                roomId: msg.roomId,
                player: me,
              });
            }
          }
          break;
        }
        case "switch_room": {
          // Notify old room that the player left
          const oldRoomId = sess.roomId;
          if (oldRoomId && oldRoomId !== msg.roomId) {
            for (const p of tenants.getRoomPlayers(oldRoomId)) {
              if (p.userId === sess.user.id) continue;
              const otherSess = tenants.get(p.userId);
              if (otherSess) {
                otherSess.broadcast({ type: "player_left", roomId: oldRoomId, userId: sess.user.id });
              }
            }
          }
          const room = tenants.switchRoom(sess.user.id, msg.roomId);
          if (!room) {
            sess.broadcast({ type: "toast", text: "Room not found." });
            break;
          }
          // Send new room state to the switching player
          const newAccessLevel = tenants.computeAccessLevel(room, sess.user.id);
          sess.broadcast({
            type: "room_state",
            roomId: msg.roomId,
            name: room.name,
            players: tenants.getRoomPlayers(msg.roomId),
            privateOfficeId: sess.privateOfficeId ?? undefined,
            projectorChannel: room.projectorChannel,
            accessLevel: newAccessLevel,
          });
          sendRoomsList();
          // Send agent snapshot from the room's manager (personal, org shared, or empty)
          const roomMgr = tenants.getRoomManager(msg.roomId);
          if (roomMgr) {
            const snap = roomMgr.snapshot();
            sess.broadcast({
              type: "snapshot",
              agents: snap.agents,
              logs: snap.logs,
              player: sess.player,
              settings: roomMgr.settings,
              board: snap.board,
              schedules: roomMgr.snapshotSchedules(),
              world: roomMgr.worldState(),
            });
          } else {
            // No manager for this room (e.g. HQ2 with no org manager yet) — empty
            sess.broadcast({
              type: "snapshot",
              agents: [],
              logs: {},
              player: sess.player,
              settings: sess.manager.settings,
              board: [],
              schedules: [],
              world: null,
            });
          }
          // Send outfits for the new room's wardrobe
          void sendOutfits(ws, sess);
          // Re-broadcast active screen share / webcam state to the switching player
          const switchedPlayers = tenants.getRoomPlayers(msg.roomId);
          for (const p of switchedPlayers) {
            if (p.userId === sess.user.id) continue;
            const peerSess = tenants.get(p.userId);
            if (!peerSess) continue;
            if (peerSess.screenShareActive) {
              sess.broadcast({ type: "screen_share_peer", userId: p.userId, name: peerSess.player?.name ?? "Boss" });
            }
            if (peerSess.webcamActive) {
              sess.broadcast({ type: "webcam_state", presenterId: p.userId, presenterName: peerSess.player?.name ?? "Boss" });
              sess.broadcast({ type: "webcam_peer", userId: p.userId, name: peerSess.player?.name ?? "Boss" });
            }
          }
          // Notify players in the new room
          const switchedMe = switchedPlayers.find((p) => p.userId === sess.user.id);
          for (const p of switchedPlayers) {
            if (p.userId === sess.user.id) continue;
            const otherSess = tenants.get(p.userId);
            if (otherSess && switchedMe) {
              otherSess.broadcast({
                type: "player_joined",
                roomId: msg.roomId,
                player: switchedMe,
              });
            }
          }
          break;
        }
        case "leave_room": {
          const left = tenants.leaveRoom(msg.roomId, sess.user.id);
          if (left) {
            // Notify remaining players
            const remaining = tenants.getRoomPlayers(msg.roomId);
            for (const p of remaining) {
              const otherSess = tenants.get(p.userId);
              if (otherSess) {
                otherSess.broadcast({
                  type: "player_left",
                  roomId: msg.roomId,
                  userId: sess.user.id,
                });
              }
            }
          }
          break;
        }
        case "invite_to_room": {
          const room = tenants.getRoom(msg.roomId);
          if (!room || room.ownerId !== sess.user.id) {
            sess.broadcast({ type: "toast", text: "You can only invite to your own rooms." });
            break;
          }
          // Persist the invite with access level (default: talk)
          const inviteLevel = msg.accessLevel ?? "talk";
          tenants.inviteUser(msg.roomId, msg.userId, inviteLevel);
          const invitedSess = tenants.get(msg.userId);
          if (invitedSess) {
            invitedSess.broadcast({
              type: "room_invite",
              roomId: msg.roomId,
              roomName: room.name,
              fromUserId: sess.user.id,
              fromName: sess.player?.name ?? "Someone",
              role: msg.role,
              accessLevel: inviteLevel,
            });
          }
          break;
        }
        case "respond_invite": {
          // Find the room owner to notify
          const room = tenants.getRoom(msg.roomId);
          if (room) {
            const ownerSess = tenants.get(room.ownerId);
            if (ownerSess) {
              ownerSess.broadcast({
                type: "invite_response",
                roomId: msg.roomId,
                accepted: msg.accept,
                byUserId: sess.user.id,
                byName: sess.player?.name ?? "Someone",
              });
            }
            if (msg.accept) {
              // Notify old room that the player left
              const oldRoomId = sess.roomId;
              if (oldRoomId && oldRoomId !== msg.roomId) {
                for (const p of tenants.getRoomPlayers(oldRoomId)) {
                  if (p.userId === sess.user.id) continue;
                  const otherSess = tenants.get(p.userId);
                  if (otherSess) {
                    otherSess.broadcast({ type: "player_left", roomId: oldRoomId, userId: sess.user.id });
                  }
                }
              }
              // Switch the accepter into the room
              const joined = tenants.switchRoom(sess.user.id, msg.roomId);
              if (joined) {
                const inviteAccessLevel = tenants.computeAccessLevel(room, sess.user.id);
                sess.broadcast({
                  type: "room_state",
                  roomId: msg.roomId,
                  name: room.name,
                  players: tenants.getRoomPlayers(msg.roomId),
                  privateOfficeId: sess.privateOfficeId ?? undefined,
                  projectorChannel: room.projectorChannel,
                  accessLevel: inviteAccessLevel,
                });
                sendRoomsList();
                // Send the room's agent snapshot
                const roomMgr = tenants.getRoomManager(msg.roomId);
                if (roomMgr) {
                  const snap = roomMgr.snapshot();
                  sess.broadcast({
                    type: "snapshot",
                    agents: snap.agents,
                    logs: snap.logs,
                    player: sess.player,
                    settings: roomMgr.settings,
                    board: snap.board,
                    schedules: roomMgr.snapshotSchedules(),
                    world: roomMgr.worldState(),
                  });
                }
                // Notify others in the room
                const invitedPlayers = tenants.getRoomPlayers(msg.roomId);
                const invitedMe = invitedPlayers.find((p) => p.userId === sess.user.id);
                for (const p of invitedPlayers) {
                  if (p.userId === sess.user.id) continue;
                  const otherSess = tenants.get(p.userId);
                  if (otherSess && invitedMe) {
                    otherSess.broadcast({
                      type: "player_joined",
                      roomId: msg.roomId,
                      player: invitedMe,
                    });
                  }
                }
              }
            }
          }
          break;
        }
        case "player_move": {
          const room = tenants.updatePlayerPosition(sess.user.id, msg.x, msg.y, msg.dir);
          if (room) {
            // Broadcast to all other players in the room
            for (const [pid] of room.players) {
              if (pid === sess.user.id) continue;
              const otherSess = tenants.get(pid);
              if (otherSess) {
                otherSess.broadcast({
                  type: "player_moved",
                  roomId: room.id,
                  userId: sess.user.id,
                  x: msg.x,
                  y: msg.y,
                  dir: msg.dir,
                });
              }
            }
          }
          break;
        }
        case "npc_update": {
          // Relay NPC position/state to other players — only in private rooms (not HQ2)
          if (sess.roomId) {
            const room = tenants.getRoom(sess.roomId);
            if (room && room.isPrivate) {
              for (const [pid] of room.players) {
                if (pid === sess.user.id) continue;
                const otherSess = tenants.get(pid);
                if (otherSess) {
                  otherSess.broadcast({
                    type: "npc_state",
                    npcId: msg.npcId,
                    x: msg.x,
                    y: msg.y,
                    dir: msg.dir,
                    state: msg.state,
                  });
                }
              }
            }
          }
          break;
        }
        case "tile_update": {
          // Persist tile override and broadcast to other players in the room
          activeManager.applyTileOverride(msg.cx, msg.cy, msg.tileIndex, msg.tile);
          if (sess.roomId) {
            const room = tenants.getRoom(sess.roomId);
            if (room) {
              for (const [pid] of room.players) {
                if (pid === sess.user.id) continue;
                const otherSess = tenants.get(pid);
                if (otherSess) {
                  otherSess.broadcast({
                    type: "tile_updated",
                    cx: msg.cx,
                    cy: msg.cy,
                    tileIndex: msg.tileIndex,
                    tile: msg.tile,
                  });
                }
              }
            }
          }
          break;
        }
        case "voice_start": {
          sess.voiceActive = true;
          console.log(`[voice] voice_start from ${sess.user.id} in room ${sess.roomId}`);
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          const myName = sess.player?.name ?? "Boss";
          // Notify all voice-active peers in the room about the new user
          let peerCount = 0;
          for (const [pid] of room.players) {
            if (pid === sess.user.id) continue;
            const peerSess = tenants.get(pid);
            if (peerSess && peerSess.voiceActive) {
              peerCount++;
              console.log(`[voice] notifying peer ${pid} about ${sess.user.id}`);
              peerSess.broadcast({ type: "voice_peer", userId: sess.user.id, name: myName });
              // Also tell the joining user about the existing peer
              sess.broadcast({ type: "voice_peer", userId: pid, name: peerSess.player?.name ?? "Boss" });
            }
          }
          console.log(`[voice] voice_start: found ${peerCount} voice-active peers`);
          break;
        }
        case "voice_stop": {
          if (!sess.voiceActive) break;
          sess.voiceActive = false;
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          for (const [pid] of room.players) {
            if (pid === sess.user.id) continue;
            const peerSess = tenants.get(pid);
            if (peerSess && peerSess.voiceActive) {
              peerSess.broadcast({ type: "voice_peer_left", userId: sess.user.id });
            }
          }
          break;
        }
        case "voice_offer":
        case "voice_answer":
        case "voice_ice": {
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          // Verify target is in the same room
          if (!room.players.has(msg.targetUserId)) {
            console.warn(`[voice] ${msg.type}: target ${msg.targetUserId} not in room ${sess.roomId}`);
            break;
          }
          const targetSess = tenants.get(msg.targetUserId);
          if (!targetSess || !targetSess.voiceActive) {
            console.warn(`[voice] ${msg.type}: target ${msg.targetUserId} not found or not voice-active`);
            break;
          }
          console.log(`[voice] relaying ${msg.type} from ${sess.user.id} to ${msg.targetUserId}`);
          if (msg.type === "voice_offer") {
            targetSess.broadcast({ type: "voice_offer", fromUserId: sess.user.id, sdp: msg.sdp });
          } else if (msg.type === "voice_answer") {
            targetSess.broadcast({ type: "voice_answer", fromUserId: sess.user.id, sdp: msg.sdp });
          } else {
            targetSess.broadcast({ type: "voice_ice", fromUserId: sess.user.id, candidate: msg.candidate });
          }
          break;
        }
        case "projector_set_channel": {
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          const valid = ["off", "brainrot", "chill", "trading", "agent"];
          if (!valid.includes(msg.channel)) break;
          room.projectorChannel = msg.channel;
          // Broadcast to all players in the room
          for (const [pid] of room.players) {
            const otherSess = tenants.get(pid);
            if (otherSess) {
              otherSess.broadcast({ type: "projector_state", channel: msg.channel });
            }
          }
          break;
        }
        case "screen_share_start": {
          sess.screenShareActive = true;
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          const myName = sess.player?.name ?? "Boss";
          console.log(`[screen-share] ${sess.user.id} (${myName}) started sharing in room ${sess.roomId} (players: ${[...room.players.keys()].join(",")})`);
          for (const [pid] of room.players) {
            if (pid === sess.user.id) continue;
            const peerSess = tenants.get(pid);
            if (peerSess) {
              peerSess.broadcast({ type: "screen_share_peer", userId: sess.user.id, name: myName });
            }
          }
          break;
        }
        case "screen_share_stop": {
          if (!sess.screenShareActive) break;
          sess.screenShareActive = false;
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          for (const [pid] of room.players) {
            if (pid === sess.user.id) continue;
            const peerSess = tenants.get(pid);
            if (peerSess) {
              peerSess.broadcast({ type: "screen_share_peer_left", userId: sess.user.id });
            }
          }
          break;
        }
        case "screen_share_offer":
        case "screen_share_answer":
        case "screen_share_ice": {
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          if (!room.players.has(msg.targetUserId)) {
            console.warn(`[screen-share] ${msg.type}: target ${msg.targetUserId} not in room ${sess.roomId} (players: ${[...room.players.keys()].join(",")})`);
            break;
          }
          const targetSess = tenants.get(msg.targetUserId);
          if (!targetSess) {
            console.warn(`[screen-share] ${msg.type}: target session ${msg.targetUserId} not found`);
            break;
          }
          console.log(`[screen-share] relaying ${msg.type} from ${sess.user.id} to ${msg.targetUserId}`);
          if (msg.type === "screen_share_offer") {
            targetSess.broadcast({ type: "screen_share_offer", fromUserId: sess.user.id, sdp: msg.sdp });
          } else if (msg.type === "screen_share_answer") {
            targetSess.broadcast({ type: "screen_share_answer", fromUserId: sess.user.id, sdp: msg.sdp });
          } else {
            targetSess.broadcast({ type: "screen_share_ice", fromUserId: sess.user.id, candidate: msg.candidate });
          }
          break;
        }
        case "webcam_start": {
          if (sess.webcamActive) break;
          sess.webcamActive = true;
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          const myName = sess.player?.name ?? "Boss";
          for (const [pid] of room.players) {
            if (pid === sess.user.id) continue;
            const peerSess = tenants.get(pid);
            if (peerSess) {
              peerSess.broadcast({ type: "webcam_state", presenterId: sess.user.id, presenterName: myName });
              peerSess.broadcast({ type: "webcam_peer", userId: sess.user.id, name: myName });
            }
          }
          break;
        }
        case "webcam_stop": {
          if (!sess.webcamActive) break;
          sess.webcamActive = false;
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          for (const [pid] of room.players) {
            if (pid === sess.user.id) continue;
            const peerSess = tenants.get(pid);
            if (peerSess) {
              peerSess.broadcast({ type: "webcam_state", presenterId: null, presenterName: null });
              peerSess.broadcast({ type: "webcam_peer_left", userId: sess.user.id });
            }
          }
          break;
        }
        case "webcam_offer":
        case "webcam_answer":
        case "webcam_ice": {
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          if (!room.players.has(msg.targetUserId)) break;
          const targetSess = tenants.get(msg.targetUserId);
          if (!targetSess) break;
          if (msg.type === "webcam_offer") {
            targetSess.broadcast({ type: "webcam_offer", fromUserId: sess.user.id, sdp: msg.sdp });
          } else if (msg.type === "webcam_answer") {
            targetSess.broadcast({ type: "webcam_answer", fromUserId: sess.user.id, sdp: msg.sdp });
          } else {
            targetSess.broadcast({ type: "webcam_ice", fromUserId: sess.user.id, candidate: msg.candidate });
          }
          break;
        }
        case "agent_view_start": {
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          // Find the agent's MCP config
          const ownerSess = room.isPrivate
            ? tenants.get(room.ownerId)
            : sess;
          if (!ownerSess) break;
          const agent = [...ownerSess.manager["agents"].values()].find(a => a.info.id === msg.agentId);
          if (!agent) break;
          screenshots.startCapture(
            msg.agentId,
            agent.info.mcpServers,
            { id: sess.user.id, broadcast: sess.broadcast },
          );
          // Built-in Playwright browser is always available; MCP is optional.
          // The client shows a placeholder until the agent opens a browser session.
          break;
        }
        case "agent_view_stop": {
          screenshots.stopViewer(msg.agentId, sess.user.id);
          break;
        }
        case "agent_broadcast_start": {
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          const ownerSess = room.isPrivate
            ? tenants.get(room.ownerId)
            : sess;
          if (!ownerSess) break;
          const agent = [...ownerSess.manager["agents"].values()].find(a => a.info.id === msg.agentId);
          if (!agent) break;
          // Build a broadcast fn that sends to all players in the room
          const roomBroadcast = (msg2: ServerMsg) => {
            for (const [pid] of room.players) {
              const peerSess = tenants.get(pid);
              if (peerSess) peerSess.broadcast(msg2);
            }
          };
          const ok = screenshots.startCapture(
            msg.agentId,
            agent.info.mcpServers,
            undefined,
            roomBroadcast,
          );
          if (ok) {
            // Switch projector to agent channel and notify all players
            room.projectorChannel = "agent";
            for (const [pid] of room.players) {
              const peerSess = tenants.get(pid);
              if (peerSess) {
                peerSess.broadcast({ type: "projector_state", channel: "agent" });
                peerSess.broadcast({ type: "agent_broadcast_state", agentId: msg.agentId });
              }
            }
          } else {
            sess.broadcast({ type: "toast", text: "This agent doesn't have a browser MCP (Playwright/Chrome DevTools) configured." });
          }
          break;
        }
        case "agent_broadcast_stop": {
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          // Find and stop whichever agent is broadcasting
          const ownerSess = room.isPrivate ? tenants.get(room.ownerId) : sess;
          if (ownerSess) {
            for (const agent of ownerSess.manager["agents"].values()) {
              if (agent.info.status === "thinking" || agent.info.status === "working") {
                screenshots.stopBroadcast(agent.info.id);
              }
            }
          }
          room.projectorChannel = "off";
          for (const [pid] of room.players) {
            const peerSess = tenants.get(pid);
            if (peerSess) {
              peerSess.broadcast({ type: "projector_state", channel: "off" });
              peerSess.broadcast({ type: "agent_broadcast_state", agentId: null });
            }
          }
          break;
        }
        // ── Agent file system operations ────────────────────────────────
        case "agent_fs_list":
        case "agent_fs_read":
        case "agent_fs_write":
        case "agent_fs_delete":
        case "agent_fs_upload": {
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          const ownerSess = room.isPrivate ? tenants.get(room.ownerId) : sess;
          if (!ownerSess) break;
          const ws_path = (msg as any).path ?? ".";
          const isShared = ws_path.startsWith("shared/");
          const agentWs = isShared
            ? ownerSess.manager.getSharedWorkspace()
            : ownerSess.manager.getAgentWorkspace(msg.agentId);
          if (!agentWs) {
            sess.broadcast({ type: "agent_fs_listing", agentId: msg.agentId, path: ws_path, entries: [] });
            break;
          }
          const relPath = isShared ? ws_path.slice("shared/".length) : ws_path;

          // Filename sanitization — reject dangerous patterns
          if (/(^|\/)\.\.(\/|$)/.test(relPath) || /[\x00-\x1f]/.test(relPath)) {
            sess.broadcast({ type: "toast", text: "Invalid file path." });
            break;
          }

          const safePath = resolve(agentWs, relPath);
          const rel = relative(agentWs, safePath);
          if (rel.startsWith("..")) {
            sess.broadcast({ type: "toast", text: "Path outside workspace." });
            break;
          }

          // Symlink protection — reject if the resolved path is a symlink
          // or if any parent directory in the workspace is a symlink
          try {
            const linkInfo = await lstat(safePath).catch(() => null);
            if (linkInfo?.isSymbolicLink()) {
              sess.broadcast({ type: "toast", text: "Symlinks are not allowed." });
              break;
            }
          } catch { /* file doesn't exist yet — fine for write/upload */ }

          // File size limit for write/upload (10MB)
          const MAX_FILE_SIZE = 10 * 1024 * 1024;
          if (msg.type === "agent_fs_write" || msg.type === "agent_fs_upload") {
            const content = (msg as any).content ?? "";
            const sizeBytes = (msg as any).encoding === "base64"
              ? Buffer.from(content, "base64").length
              : typeof content === "string" ? Buffer.byteLength(content, "utf-8") : 0;
            if (sizeBytes > MAX_FILE_SIZE) {
              sess.broadcast({ type: "toast", text: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB).` });
              break;
            }
          }

          if (msg.type === "agent_fs_list") {
            try {
              const entries = await readdir(safePath, { withFileTypes: true });
              const listing = await Promise.all(entries.map(async (e) => {
                const fullPath = join(safePath, e.name);
                const s = await stat(fullPath).catch(() => null);
                return {
                  name: e.name,
                  isDir: e.isDirectory(),
                  size: s?.size ?? 0,
                  mtime: s?.mtimeMs ?? 0,
                };
              }));
              listing.sort((a, b) => (a.isDir === b.isDir) ? a.name.localeCompare(b.name) : (a.isDir ? -1 : 1));
              sess.broadcast({ type: "agent_fs_listing", agentId: msg.agentId, path: ws_path, entries: listing });
            } catch {
              sess.broadcast({ type: "agent_fs_listing", agentId: msg.agentId, path: ws_path, entries: [] });
            }
          } else if (msg.type === "agent_fs_read") {
            try {
              const content = await readFile(safePath, "utf-8");
              sess.broadcast({ type: "agent_fs_content", agentId: msg.agentId, path: ws_path, content });
            } catch (err) {
              sess.broadcast({ type: "agent_fs_content", agentId: msg.agentId, path: ws_path, content: "", error: err instanceof Error ? err.message : "Read failed" });
            }
          } else if (msg.type === "agent_fs_write") {
            try {
              await mkdir(dirname(safePath), { recursive: true });
              await writeFile(safePath, (msg as any).content, "utf-8");
              sess.broadcast({ type: "agent_fs_result", agentId: msg.agentId, path: ws_path, action: "write", success: true });
            } catch (err) {
              sess.broadcast({ type: "agent_fs_result", agentId: msg.agentId, path: ws_path, action: "write", success: false, error: err instanceof Error ? err.message : "Write failed" });
            }
          } else if (msg.type === "agent_fs_delete") {
            try {
              await unlink(safePath);
              sess.broadcast({ type: "agent_fs_result", agentId: msg.agentId, path: ws_path, action: "delete", success: true });
            } catch (err) {
              sess.broadcast({ type: "agent_fs_result", agentId: msg.agentId, path: ws_path, action: "delete", success: false, error: err instanceof Error ? err.message : "Delete failed" });
            }
          } else if (msg.type === "agent_fs_upload") {
            try {
              await mkdir(dirname(safePath), { recursive: true });
              const content = (msg as any).encoding === "base64"
                ? Buffer.from((msg as any).content, "base64")
                : (msg as any).content;
              await writeFile(safePath, content);
              sess.broadcast({ type: "agent_fs_result", agentId: msg.agentId, path: ws_path, action: "upload", success: true });
            } catch (err) {
              sess.broadcast({ type: "agent_fs_result", agentId: msg.agentId, path: ws_path, action: "upload", success: false, error: err instanceof Error ? err.message : "Upload failed" });
            }
          }
          break;
        }
        // ── Agent live log streaming ────────────────────────────────────
        case "agent_log_subscribe": {
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          const ownerSess = room.isPrivate ? tenants.get(room.ownerId) : sess;
          if (!ownerSess) break;
          // Send log history first
          const history = ownerSess.manager.getAgentLogs(msg.agentId);
          sess.broadcast({ type: "agent_log_history", agentId: msg.agentId, entries: history });
          // Subscribe to live logs
          const unsub = ownerSess.manager.subscribeAgentLogs(msg.agentId, (entry) => {
            sess.broadcast({ type: "agent_log", agentId: msg.agentId, entry });
          });
          // Store unsubscribe fn for cleanup
          if (!sess.agentLogSubscriptions) sess.agentLogSubscriptions = new Map();
          sess.agentLogSubscriptions.set(msg.agentId, unsub);
          break;
        }
        case "agent_log_unsubscribe": {
          if (sess.agentLogSubscriptions) {
            const unsub = sess.agentLogSubscriptions.get(msg.agentId);
            if (unsub) {
              unsub();
              sess.agentLogSubscriptions.delete(msg.agentId);
            }
          }
          break;
        }
        // ── Agent task injection + task info ──────────────────────────────
        case "agent_inject_task": {
          activeManager.assign(msg.agentId, msg.task, msg.handoffTo);
          // Send back updated task info
          const info = activeManager.getTaskInfo(msg.agentId);
          if (info) sess.broadcast({ type: "agent_task_info", agentId: msg.agentId, ...info });
          break;
        }
        // ── Agent memory viewer ───────────────────────────────────────────
        case "agent_memory_request": {
          const rawMessages = await activeManager.getAgentMemory(msg.agentId);
          // Normalize messages to { role, content } format
          const messages = rawMessages.map((m: any) => {
            const role = m.role ?? "unknown";
            let content = "";
            if (typeof m.content === "string") {
              content = m.content;
            } else if (Array.isArray(m.content)) {
              content = m.content.map((part: any) => {
                if (part.type === "text" && part.text) return part.text;
                if (part.type === "tool_use") return `[tool_use: ${part.name}(${JSON.stringify(part.input ?? {}).slice(0, 200)})]`;
                if (part.type === "tool_result") {
                  const resultText = typeof part.content === "string" ? part.content : JSON.stringify(part.content ?? "");
                  return `[tool_result: ${resultText.slice(0, 200)}]`;
                }
                return JSON.stringify(part).slice(0, 200);
              }).join("\n");
            } else {
              content = JSON.stringify(m.content ?? "").slice(0, 500);
            }
            return { role, content: content.slice(0, 2000) };
          });
          sess.broadcast({ type: "agent_memory", agentId: msg.agentId, messages });
          break;
        }
        // ── Platform mailbox ──────────────────────────────────────────────
        case "check_mailbox": {
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          const ownerSess = room.isPrivate ? tenants.get(room.ownerId) : sess;
          if (!ownerSess) break;
          const events = ownerSess.manager.checkMailbox(msg.platform);
          sess.broadcast({ type: "mailbox_messages", platform: msg.platform, events });
          break;
        }
        case "reply_mailbox": {
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          const ownerSess = room.isPrivate ? tenants.get(room.ownerId) : sess;
          if (!ownerSess) break;
          const success = await ownerSess.manager.replyToMailbox(msg.platform, msg.target, msg.text);
          sess.broadcast({ type: "toast", text: success ? `Reply sent via ${msg.platform}.` : `Failed to send reply via ${msg.platform}.` });
          break;
        }
        case "request_mail_digest": {
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          const ownerSess = room.isPrivate ? tenants.get(room.ownerId) : sess;
          if (!ownerSess) break;
          const digest = ownerSess.manager.getMailDigest();
          sess.broadcast({ type: "mail_digest", ...digest });
          break;
        }
        case "connect_platform": {
          // Return current platform connection states so the client can show
          // the appropriate auth modal. The actual connection happens via
          // `hermes gateway setup` on the server side — this just triggers
          // a fresh status poll and sends the result back.
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          const ownerSess = room.isPrivate ? tenants.get(room.ownerId) : sess;
          if (!ownerSess) break;
          ownerSess.manager.broadcastPlatformStates();
          break;
        }
        case "configure_platform": {
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          const ownerSess = room.isPrivate ? tenants.get(room.ownerId) : sess;
          if (!ownerSess) break;
          const result = await ownerSess.manager.configurePlatform(msg.platform, msg.credentials);
          sess.broadcast({ type: "platform_config_result", platform: msg.platform, success: result.success, error: result.error });
          break;
        }
        case "set_mailbox_platform": {
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          const ownerSess = room.isPrivate ? tenants.get(room.ownerId) : sess;
          if (!ownerSess) break;
          const mgr = ownerSess.manager;
          const slot = Math.max(0, Math.min(5, msg.slot));
          const newPlatforms = [...mgr.settings.mailboxPlatforms];
          while (newPlatforms.length < 6) newPlatforms.push(null);
          newPlatforms[slot] = msg.platform;
          mgr.setSettings({ ...mgr.settings, mailboxPlatforms: newPlatforms });
          break;
        }
        case "create_org": {
          const slug = msg.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
          if (!slug) {
            sess.broadcast({ type: "org_error", message: "Invalid organization slug." });
            break;
          }
          const org = tenants.createOrg(msg.name.trim(), slug, msg.githubOrg, sess.user.id, sess.user.email);
          if (!org) {
            sess.broadcast({ type: "org_error", message: "Organization slug already taken." });
            break;
          }
          sess.broadcast({
            type: "org_created",
            org: { id: org.id, name: org.name, slug: org.slug, githubOrg: org.githubOrg, createdAt: org.createdAt },
          });
          break;
        }
        case "list_orgs": {
          const orgs = tenants.getAllOrgs(sess.user.id);
          sess.broadcast({ type: "orgs_list", orgs });
          break;
        }
        case "list_org_members": {
          const members = tenants.getOrgMembers(msg.orgId);
          sess.broadcast({ type: "org_members", orgId: msg.orgId, members });
          break;
        }
        case "add_org_member": {
          if (!tenants.isOrgAdmin(msg.orgId, sess.user.id)) {
            sess.broadcast({ type: "org_error", message: "You must be an org admin to add members." });
            break;
          }
          const result = tenants.addOrgMemberByEmail(msg.orgId, msg.userEmail.trim(), msg.role ?? "member", sess.user.id);
          if (result.ok) {
            // Broadcast updated member list
            const members = tenants.getOrgMembers(msg.orgId);
            sess.broadcast({ type: "org_members", orgId: msg.orgId, members });
            sess.broadcast({ type: "toast", text: result.message });
          } else {
            sess.broadcast({ type: "org_error", message: result.message });
          }
          break;
        }
        case "remove_org_member": {
          if (!tenants.isOrgAdmin(msg.orgId, sess.user.id)) {
            sess.broadcast({ type: "org_error", message: "You must be an org admin to remove members." });
            break;
          }
          const ok = tenants.removeOrgMember(msg.orgId, msg.userId);
          if (ok) {
            const members = tenants.getOrgMembers(msg.orgId);
            sess.broadcast({ type: "org_members", orgId: msg.orgId, members });
            sess.broadcast({ type: "toast", text: "Member removed." });
          } else {
            sess.broadcast({ type: "org_error", message: "Failed to remove member." });
          }
          break;
        }
        case "join_org_room": {
          if (!tenants.isOrgMember(msg.orgId, sess.user.id)) {
            sess.broadcast({ type: "toast", text: "You are not a member of this organization." });
            break;
          }
          // Find or create the org room
          const org = tenants.getOrg(msg.orgId);
          if (!org) {
            sess.broadcast({ type: "toast", text: "Organization not found." });
            break;
          }
          // Look for an existing org room with this name
          let targetRoomId: string | null = null;
          for (const room of tenants.getRoomsForUser(sess.user.id)) {
            if (room.orgId === msg.orgId && room.name === msg.roomName) {
              targetRoomId = room.id;
              break;
            }
          }
          // Also check all rooms (the org room may exist but not yet be in the user's list)
          if (!targetRoomId) {
            for (const room of tenants.getRoomsForUser(sess.user.id)) {
              if (room.orgId === msg.orgId) {
                targetRoomId = room.id;
                break;
              }
            }
          }
          if (!targetRoomId) {
            // Create a new room in the org
            targetRoomId = tenants.createOrgRoom(msg.orgId, msg.roomName);
            if (!targetRoomId) {
              sess.broadcast({ type: "toast", text: "Failed to create org room." });
              break;
            }
          }
          // Switch to the room
          const oldRoomId = sess.roomId;
          if (oldRoomId && oldRoomId !== targetRoomId) {
            for (const p of tenants.getRoomPlayers(oldRoomId)) {
              if (p.userId === sess.user.id) continue;
              const otherSess = tenants.get(p.userId);
              if (otherSess) {
                otherSess.broadcast({ type: "player_left", roomId: oldRoomId, userId: sess.user.id });
              }
            }
          }
          const room = tenants.switchRoom(sess.user.id, targetRoomId);
          if (!room) {
            sess.broadcast({ type: "toast", text: "Failed to join org room." });
            break;
          }
          const orgAccessLevel = tenants.computeAccessLevel(room, sess.user.id);
          sess.broadcast({
            type: "room_state",
            roomId: targetRoomId,
            name: room.name,
            players: tenants.getRoomPlayers(targetRoomId),
            privateOfficeId: sess.privateOfficeId ?? undefined,
            projectorChannel: room.projectorChannel,
            accessLevel: orgAccessLevel,
          });
          sendRoomsList();
          // Send outfits for the org room's wardrobe
          void sendOutfits(ws, sess);
          // Send the org room's agent snapshot
          const orgRoomMgr = tenants.getRoomManager(targetRoomId);
          if (orgRoomMgr) {
            const snap = orgRoomMgr.snapshot();
            sess.broadcast({
              type: "snapshot",
              agents: snap.agents,
              logs: snap.logs,
              player: sess.player,
              settings: orgRoomMgr.settings,
              board: snap.board,
              schedules: orgRoomMgr.snapshotSchedules(),
              world: orgRoomMgr.worldState(),
            });
          }
          // Notify other players in the room
          const players = tenants.getRoomPlayers(targetRoomId);
          const me = players.find((p) => p.userId === sess.user.id);
          for (const p of players) {
            if (p.userId === sess.user.id) continue;
            const otherSess = tenants.get(p.userId);
            if (otherSess && me) {
              otherSess.broadcast({ type: "player_joined", roomId: targetRoomId, player: me });
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error("[server] error handling message:", err);
      const data = JSON.stringify({ type: "toast", text: "Server error — check the server logs." });
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  });

  ws.on("close", () => {
    sess.clients.delete(ws);
    if (refreshTimer) clearTimeout(refreshTimer);
    if (expiryTimer) clearTimeout(expiryTimer);
    if (freeTrialTimer) clearTimeout(freeTrialTimer);
    // Clean up agent log subscriptions
    if (sess.agentLogSubscriptions) {
      for (const unsub of sess.agentLogSubscriptions.values()) unsub();
      sess.agentLogSubscriptions.clear();
    }
    // Clean up voice state when the last client disconnects
    if (sess.clients.size === 0 && sess.voiceActive) {
      sess.voiceActive = false;
      if (sess.roomId) {
        const room = tenants.getRoom(sess.roomId);
        if (room) {
          for (const [pid] of room.players) {
            if (pid === sess.user.id) continue;
            const peerSess = tenants.get(pid);
            if (peerSess && peerSess.voiceActive) {
              peerSess.broadcast({ type: "voice_peer_left", userId: sess.user.id });
            }
          }
        }
      }
    }
    // Clean up screen share state when the last client disconnects
    if (sess.clients.size === 0 && sess.screenShareActive) {
      sess.screenShareActive = false;
      if (sess.roomId) {
        const room = tenants.getRoom(sess.roomId);
        if (room) {
          for (const [pid] of room.players) {
            if (pid === sess.user.id) continue;
            const peerSess = tenants.get(pid);
            if (peerSess) {
              peerSess.broadcast({ type: "screen_share_peer_left", userId: sess.user.id });
            }
          }
        }
      }
    }
    // Clean up webcam state when the last client disconnects
    if (sess.clients.size === 0 && sess.webcamActive) {
      sess.webcamActive = false;
      if (sess.roomId) {
        const room = tenants.getRoom(sess.roomId);
        if (room) {
          for (const [pid] of room.players) {
            if (pid === sess.user.id) continue;
            const peerSess = tenants.get(pid);
            if (peerSess) {
              peerSess.broadcast({ type: "webcam_state", presenterId: null, presenterName: null });
              peerSess.broadcast({ type: "webcam_peer_left", userId: sess.user.id });
            }
          }
        }
      }
    }
    tenants.handleClientDisconnect(sess.user.id);
  });
  ws.on("error", () => {
    sess.clients.delete(ws);
    if (refreshTimer) clearTimeout(refreshTimer);
    if (expiryTimer) clearTimeout(expiryTimer);
    tenants.handleClientDisconnect(sess.user.id);
  });
});

// ── start ─────────────────────────────────────────────────────────────────

// Production safety: refuse to start without auth in production
if (process.env.NODE_ENV === "production" && !isSupabaseConfigured) {
  console.error("[agent-heights] FATAL: NODE_ENV=production but SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set.");
  console.error("[agent-heights] Refusing to start in dev mode in production. Set the required env vars and restart.");
  process.exit(1);
}

const logMaintenanceInterval = startLogMaintenance();

// Periodically clean up idle agent browser contexts (every 5 minutes)
const browserCleanupInterval = setInterval(() => { void cleanupIdleBrowsers(); }, 5 * 60 * 1000);

server.listen(SERVER_PORT, () => {
  console.log(`[agent-heights] server listening on :${SERVER_PORT} (HTTP + WebSocket)`);
  if (isSupabaseConfigured) {
    console.log(`[agent-heights] Supabase auth enabled`);
  } else {
    console.log(`[agent-heights] Supabase not configured — running in dev mode (no auth)`);
    console.log(`[agent-heights]   Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to enable auth`);
  }
  console.log(`[agent-heights] game data in ${join(rootDir, "ag")} (users/<id>/, logs/, workspace/)`);
  if (isRedisConfigured) {
    console.log(`[agent-heights] Redis enabled — pub/sub + presence (server ${serverId})`);
  } else {
    console.log(`[agent-heights] Redis not configured — single-server mode`);
    console.log(`[agent-heights]   Set REDIS_URL to enable pub/sub + presence`);
  }
  console.log(`[agent-heights] global multiplayer room: ${HQ2_ROOM_ID}`);

  // Restore user sessions at boot so agents resume immediately after a
  // server restart, without waiting for each user to reconnect.
  void tenants.restoreSessionsAtBoot();
});

async function shutdown(): Promise<void> {
  console.log("[agent-heights] graceful shutdown initiated — notifying clients & saving agent tasks");

  // 1. Broadcast "server_restarting" to all connected clients so they show
  //    a friendly overlay instead of a scary disconnect.
  for (const sess of tenants.values()) {
    sess.broadcast({ type: "server_restarting", estimatedSeconds: 5 });
  }

  // 2. Prepare each agent manager for shutdown — saves active + queued tasks
  //    so agents can resume exactly where they left off after restart.
  const shutdownPrep: Promise<void>[] = [];
  for (const sess of tenants.values()) {
    shutdownPrep.push(sess.manager.prepareForShutdown());
  }
  await Promise.all(shutdownPrep);

  // 3. Flush all saves to disk/DB (pending tasks are included) — do this
  //    BEFORE browser cleanup so critical task data is persisted even if
  //    destroyAllBrowsers() is slow and Railway's grace period expires.
  const flushes: Promise<void>[] = [];
  for (const sess of tenants.values()) {
    const f = sess.save.flushNow();
    if (f && typeof (f as any).then === "function") flushes.push((f as Promise<void>).catch(() => {}));
  }
  await Promise.all(flushes);

  // 4. Stop background services and clean up browsers
  stopRailwayMCP();
  stopRedis();
  clearInterval(logMaintenanceInterval);
  clearInterval(browserCleanupInterval);
  screenshots.destroy();
  await destroyAllBrowsers();

  console.log("[agent-heights] graceful shutdown complete — exiting");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
