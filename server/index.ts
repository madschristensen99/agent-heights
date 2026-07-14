import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";
import { readFile, stat } from "node:fs/promises";
import type { ClientMsg, ServerMsg } from "../shared/types.js";
import { SERVER_PORT } from "../shared/types.js";
import { isSupabaseConfigured, verifyToken, getTokenExpiry, type AuthUser } from "./supabase.js";
import { handleMarketplaceRequest } from "./marketplace.js";
import { handleMcpCatalogRequest } from "./mcp-store.js";
import { handleYukiRequest } from "./yuki.js";
import { handlePublishRequest } from "./publish.js";
import { stopRailwayMCP, checkRailwayStatus, queryRailway } from "./providers/railway-mcp.js";
import { rateLimit } from "./ratelimit.js";
import { setUserApiKey, deleteUserApiKey, setUserMcpKey, deleteUserMcpKey, getUserMcpKeys, getUserMcpKeyUrls } from "./apikeys.js";
import { startOAuthFlow, handleOAuthCallback, exchangeOAuthCode } from "./mcp-oauth.js";
import { TenantManager, HQ2_ROOM_ID } from "./tenant.js";
import { startLogMaintenance } from "./log-retention.js";
import { isRedisConfigured, stopRedis, serverId } from "./redis.js";
import { handleStripeRequest, getUserPaymentStatus, isStripeConfigured } from "./stripe.js";

/** Throttle map for rate-limit toasts — one per 5s per user. */
const rateLimitToastMap = new Map<string, number>();

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

function getEnvScript(): string {
  const envVars: Record<string, string> = {};
  // Inject VITE_* vars from process.env so the client gets them at runtime
  // instead of requiring them at Vite build time.
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("VITE_")) {
      envVars[key] = process.env[key]!;
    }
  }
  return `<script>window.__ENV__=${JSON.stringify(envVars)};</script>`;
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
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) throw new Error("is directory");
    let data = await readFile(filePath);
    const mime = MIME[extname(filePath)] ?? "application/octet-stream";
    const headers: Record<string, string> = { "Content-Type": mime };
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
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  }
}

// ── tenant management ─────────────────────────────────────────────────────

const tenants = new TenantManager(rootDir);

// ── HTTP + WebSocket server ───────────────────────────────────────────────

const server = createServer((req, res) => {
  // Yuki chat proxy — needs HQ context from the session
  if (req.url?.split("?")[0] === "/api/yuki") {
    void handleYukiRequest(req, res, () => {
      // In dev mode, use the dev session; in auth mode, find by token
      if (isSupabaseConfigured) {
        // Extract token from the request to find the session
        // For now, use the first session (single-user for Yuki context)
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
          res.writeHead(500);
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
          res.writeHead(500);
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
          res.writeHead(500);
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
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><body><h2>Authentication failed</h2><p>${errorParam}</p><script>window.close();</script></body></html>`);
      return;
    }
    if (!code || !state) {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end("<html><body><h2>Missing code or state</h2></body></html>");
      return;
    }

    void handleOAuthCallback(code, state).then(async (result) => {
      // Notify the user's WS session if they're online
      if (result.userId) {
        const sess = tenants.get(result.userId);
        if (sess) {
          if (result.success) {
            // Refresh manager keys
            const mcpKeys = await getUserMcpKeys(sess.user.id);
            sess.manager.setMcpKeys(mcpKeys);
          }
          sess.broadcast({
            type: "mcp_oauth_complete",
            serverUrl: result.serverUrl ?? "",
            success: result.success,
            error: result.error,
          });
        }
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      if (result.success) {
        res.end(`<html><body><h2>✓ Connected!</h2><p>Redirecting back to AgentHQ...</p><script>setTimeout(function(){window.location.href='/';},1500);</script></body></html>`);
      } else {
        res.end(`<html><body><h2>Authentication failed</h2><p>${result.error ?? "Unknown error"}</p><script>setTimeout(function(){window.location.href='/';},3000);</script></body></html>`);
      }
    });
    return;
  }

  // MCP catalog — curated server directory
  if (req.url?.split("?")[0]?.startsWith("/api/mcp-catalog")) {
    handleMcpCatalogRequest(req, res);
    return;
  }

  handleMarketplaceRequest(req, res).then((handled) => {
    if (!handled) {
      serveStatic(req, res).catch(() => {
        res.writeHead(500);
        res.end("Internal server error");
      });
    }
  });
});

const wss = new WebSocketServer({ server });

wss.on("connection", async (ws, req) => {
  let user: AuthUser;

  if (isSupabaseConfigured) {
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token");
    if (!token) {
      ws.close(4001, "No token provided");
      return;
    }
    const verified = await verifyToken(token);
    if (!verified) {
      ws.close(4003, "Invalid or expired token");
      return;
    }
    user = verified;
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
  if (currentRoom && currentRoom.isPrivate && currentRoom.ownerId === sess.user.id) {
    // Own office — full agent snapshot
    const snap = sess.manager.snapshot();
    ws.send(JSON.stringify({
      type: "snapshot",
      agents: snap.agents,
      logs: snap.logs,
      player: sess.player,
      settings: sess.manager.settings,
      board: snap.board,
      world: sess.manager.worldState(),
    } satisfies ServerMsg));
  } else if (currentRoom && currentRoom.isPrivate && currentRoom.ownerId !== sess.user.id) {
    // Visitor in someone else's office — owner's snapshot
    const ownerSess = tenants.get(currentRoom.ownerId);
    if (ownerSess) {
      const snap = ownerSess.manager.snapshot();
      ws.send(JSON.stringify({
        type: "snapshot",
        agents: snap.agents,
        logs: snap.logs,
        player: ownerSess.player,
        settings: ownerSess.manager.settings,
        board: snap.board,
        world: ownerSess.manager.worldState(),
      } satisfies ServerMsg));
    } else {
      ws.send(JSON.stringify({ type: "snapshot", agents: [], logs: {}, board: [], player: sess.player, settings: sess.manager.settings, world: null } satisfies ServerMsg));
    }
  } else {
    // HQ2 or no room — empty snapshot
    ws.send(JSON.stringify({
      type: "snapshot",
      agents: [],
      logs: {},
      board: [],
      player: sess.player,
      settings: sess.manager.settings,
      world: null,
    } satisfies ServerMsg));
  }

  // Tell the client whether they have an API key set
  ws.send(JSON.stringify({ type: "api_key_status", hasKey: sess.apiKey != null } satisfies ServerMsg));

  // Send payment status so the client can gate UI (entrance fee + subscription)
  if (isSupabaseConfigured && isStripeConfigured) {
    try {
      const payStatus = await getUserPaymentStatus(user.id);
      ws.send(JSON.stringify({
        type: "payment_status",
        entrancePaid: payStatus.entrancePaid,
        subscriptionActive: payStatus.subscriptionActive,
        subscriptionStatus: payStatus.subscriptionStatus,
        currentPeriodEnd: payStatus.currentPeriodEnd,
      } satisfies ServerMsg));
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
    const url = new URL(req.url ?? "", "http://localhost");
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

      // Permission check: only private office owners can manage agents
      // HQ2 is a social lobby — no hiring, assigning, etc.
      const isVisitor = tenants.isRoomVisitor(sess.user.id);
      const isInHq2 = sess.roomId === "hq2";

      // Pre-check: if this is a chat message to a busy agent, reject before
      // consuming a rate-limit token (prevents "too many requests" spam).
      if (msg.type === "chat" && !isInHq2) {
        const ownerSess0 = isVisitor ? tenants.getRoomOwnerSession(sess.user.id) : null;
        const mgr0 = ownerSess0 ? ownerSess0.manager : manager;
        const agent0 = mgr0.getAgentInfo(msg.agentId);
        if (agent0 && (agent0.status === "thinking" || agent0.status === "working")) {
          sess.broadcast({ type: "toast", text: `${agent0.name} is heads-down right now.` });
          return;
        }
      }

      if (!rateLimit(sess.user.id, msg.type)) {
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

      const OWNER_ONLY = new Set(["hire", "assign", "assign_all", "stop", "stop_all", "fire", "recruit", "create_card", "assign_card", "move_card", "delete_card", "set_settings", "set_api_key", "set_mcp_key", "check_mcp_keys", "start_mcp_oauth", "submit_mcp_oauth_code", "clear", "clear_all"]);
      if ((isVisitor || isInHq2) && OWNER_ONLY.has(msg.type)) {
        sess.broadcast({ type: "toast", text: isInHq2 ? "Go to your office to manage agents." : "Only the room owner can do that." });
        return;
      }

      // Stripe gating: hiring agents requires an active $20/mo subscription
      if (msg.type === "hire" && isSupabaseConfigured && isStripeConfigured) {
        const payStatus = await getUserPaymentStatus(sess.user.id);
        if (!payStatus.subscriptionActive) {
          sess.broadcast({ type: "payment_required", reason: "subscription", message: "You need an active $20/month subscription to hire agents." });
          return;
        }
      }
      // Chat is allowed in HQ2 and as a visitor, but only works in private rooms
      if (isInHq2 && msg.type === "chat") {
        sess.broadcast({ type: "toast", text: "No agents in HQ² — visit an office to chat." });
        return;
      }

      // For visitors: use the owner's AgentManager instead of their own
      const ownerSess = isVisitor ? tenants.getRoomOwnerSession(sess.user.id) : null;
      const activeManager = ownerSess ? ownerSess.manager : manager;

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
          manager.setSettings(msg.settings);
          if (msg.settings.railway?.enabled) {
            checkRailwayStatus().then((status) => {
              sess.broadcast({ type: "railway_status", ok: status.ok, message: status.message });
            });
          }
          break;
        case "hire":
          await manager.hire(msg.name, msg.provider, msg.model, msg.systemPrompt ?? "", msg.role ?? "worker", msg.sprite, msg.appearance, msg.mcpServers, msg.personality);
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
          manager.assign(msg.agentId, msg.task, msg.handoffTo);
          break;
        case "chat":
          activeManager.chat(msg.agentId, msg.text);
          break;
        case "assign_all":
          manager.assignAll(msg.task);
          break;
        case "stop":
          manager.stop(msg.agentId);
          break;
        case "stop_all":
          manager.stopAll();
          break;
        case "fire":
          await manager.fire(msg.agentId);
          break;
        case "clear":
          manager.clearChat(msg.agentId);
          break;
        case "clear_all":
          manager.clearAllChats();
          break;
        case "create_card":
          manager.createCard(msg.title, msg.description);
          break;
        case "assign_card":
          manager.assignCard(msg.cardId, msg.agentId);
          break;
        case "move_card":
          manager.moveCard(msg.cardId, msg.status);
          break;
        case "delete_card":
          manager.deleteCard(msg.cardId);
          break;
        case "recruit":
          await manager.recruit(msg.firedAgentId);
          break;
        case "railway_query":
          queryRailway().then((result) => {
            sess.broadcast({ type: "railway_data", data: result.data, error: result.error });
          }).catch((err) => {
            console.error("[server] railway_query failed:", err);
            sess.broadcast({ type: "railway_data", data: null, error: err instanceof Error ? err.message : String(err) });
          });
          break;
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
          // Build base URL: prefer PUBLIC_URL/VITE_APP_URL env vars, then headers
          const publicUrl = process.env.PUBLIC_URL || process.env.VITE_APP_URL;
          const proto = (req.headers["x-forwarded-proto"] as string) || "http";
          const host = (req.headers["host"] as string) || "localhost:8080";
          const baseUrl = publicUrl || `${proto}://${host}`;
          console.log(`[mcp-oauth] startOAuthFlow baseUrl=${baseUrl} (PUBLIC_URL=${publicUrl ?? "unset"}, proto=${proto}, host=${host})`);
          try {
            const { authUrl } = await startOAuthFlow(msg.serverUrl, sess.user.id, baseUrl);
            sess.broadcast({ type: "mcp_oauth_code_needed", serverUrl: msg.serverUrl, authUrl });
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
            });
            sendRoomsList();
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
          sess.broadcast({
            type: "room_state",
            roomId: msg.roomId,
            name: room.name,
            players,
            privateOfficeId: sess.privateOfficeId ?? undefined,
          });
          sendRoomsList();
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
          sess.broadcast({
            type: "room_state",
            roomId: msg.roomId,
            name: room.name,
            players: tenants.getRoomPlayers(msg.roomId),
            privateOfficeId: sess.privateOfficeId ?? undefined,
            projectorChannel: room.projectorChannel,
          });
          sendRoomsList();
          // If switching to a private room they don't own, send the owner's agent snapshot
          if (room.isPrivate && room.ownerId !== sess.user.id) {
            const ownerSess = tenants.get(room.ownerId);
            if (ownerSess) {
              const snap = ownerSess.manager.snapshot();
              sess.broadcast({
                type: "snapshot",
                agents: snap.agents,
                logs: snap.logs,
                player: ownerSess.player,
                settings: ownerSess.manager.settings,
                board: snap.board,
                world: ownerSess.manager.worldState(),
              });
            }
          } else if (room.isPrivate && room.ownerId === sess.user.id) {
            // Back to own office — send own snapshot
            const snap = sess.manager.snapshot();
            sess.broadcast({
              type: "snapshot",
              agents: snap.agents,
              logs: snap.logs,
              player: sess.player,
              settings: sess.manager.settings,
              board: snap.board,
              world: sess.manager.worldState(),
            });
          } else {
            // HQ2 lobby — no agents, just players
            sess.broadcast({
              type: "snapshot",
              agents: [],
              logs: {},
              player: sess.player,
              settings: sess.manager.settings,
              board: [],
              world: null,
            });
          }
          // Notify players in the new room
          const switchedPlayers = tenants.getRoomPlayers(msg.roomId);
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
          const invitedSess = tenants.get(msg.userId);
          if (invitedSess) {
            invitedSess.broadcast({
              type: "room_invite",
              roomId: msg.roomId,
              roomName: room.name,
              fromUserId: sess.user.id,
              fromName: sess.player?.name ?? "Someone",
              role: msg.role,
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
                sess.broadcast({
                  type: "room_state",
                  roomId: msg.roomId,
                  name: room.name,
                  players: tenants.getRoomPlayers(msg.roomId),
                  privateOfficeId: sess.privateOfficeId ?? undefined,
                  projectorChannel: room.projectorChannel,
                });
                sendRoomsList();
                // Send the owner's agent snapshot to the visitor
                if (ownerSess) {
                  const snap = ownerSess.manager.snapshot();
                  sess.broadcast({
                    type: "snapshot",
                    agents: snap.agents,
                    logs: snap.logs,
                    player: ownerSess.player,
                    settings: ownerSess.manager.settings,
                    board: snap.board,
                    world: ownerSess.manager.worldState(),
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
          if (!sess.roomId) break;
          const room = tenants.getRoom(sess.roomId);
          if (!room) break;
          const myName = sess.player?.name ?? "Boss";
          // Notify all voice-active peers in the room about the new user
          for (const [pid] of room.players) {
            if (pid === sess.user.id) continue;
            const peerSess = tenants.get(pid);
            if (peerSess && peerSess.voiceActive) {
              peerSess.broadcast({ type: "voice_peer", userId: sess.user.id, name: myName });
              // Also tell the joining user about the existing peer
              sess.broadcast({ type: "voice_peer", userId: pid, name: peerSess.player?.name ?? "Boss" });
            }
          }
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
          if (!room.players.has(msg.targetUserId)) break;
          const targetSess = tenants.get(msg.targetUserId);
          if (!targetSess || !targetSess.voiceActive) break;
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
          const valid = ["off", "brainrot"];
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
        // ── Organization management ────────────────────────────────────
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
          sess.broadcast({
            type: "room_state",
            roomId: targetRoomId,
            name: room.name,
            players: tenants.getRoomPlayers(targetRoomId),
            privateOfficeId: sess.privateOfficeId ?? undefined,
            projectorChannel: room.projectorChannel,
          });
          sendRoomsList();
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

const logMaintenanceInterval = startLogMaintenance();

server.listen(SERVER_PORT, () => {
  console.log(`[agent-hq] server listening on :${SERVER_PORT} (HTTP + WebSocket)`);
  if (isSupabaseConfigured) {
    console.log(`[agent-hq] Supabase auth enabled`);
  } else {
    console.log(`[agent-hq] Supabase not configured — running in dev mode (no auth)`);
    console.log(`[agent-hq]   Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to enable auth`);
  }
  console.log(`[agent-hq] game data in ${join(rootDir, "ag")} (users/<id>/, logs/, workspace/)`);
  if (isRedisConfigured) {
    console.log(`[agent-hq] Redis enabled — pub/sub + presence (server ${serverId})`);
  } else {
    console.log(`[agent-hq] Redis not configured — single-server mode`);
    console.log(`[agent-hq]   Set REDIS_URL to enable pub/sub + presence`);
  }
  console.log(`[agent-hq] global multiplayer room: ${HQ2_ROOM_ID}`);
});

async function shutdown(): Promise<void> {
  stopRailwayMCP();
  stopRedis();
  clearInterval(logMaintenanceInterval);
  const flushes: Promise<void>[] = [];
  for (const sess of tenants.values()) {
    const f = sess.save.flushNow();
    if (f && typeof (f as any).then === "function") flushes.push((f as Promise<void>).catch(() => {}));
  }
  await Promise.all(flushes);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
