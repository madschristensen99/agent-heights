import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";
import { readFile, stat } from "node:fs/promises";
import type { ClientMsg, ServerMsg } from "../shared/types.js";
import { SERVER_PORT } from "../shared/types.js";
import { isSupabaseConfigured, verifyToken, getTokenExpiry, type AuthUser } from "./supabase.js";
import { handleMarketplaceRequest } from "./marketplace.js";
import { handleYukiRequest } from "./yuki.js";
import { handlePublishRequest } from "./publish.js";
import { stopRailwayMCP, checkRailwayStatus, queryRailway } from "./providers/railway-mcp.js";
import { rateLimit } from "./ratelimit.js";
import { setUserApiKey, deleteUserApiKey } from "./apikeys.js";
import { TenantManager, HQ2_ROOM_ID } from "./tenant.js";
import { startLogMaintenance } from "./log-retention.js";
import { isRedisConfigured, stopRedis, serverId } from "./redis.js";
import { handleStripeRequest, getUserPaymentStatus, isStripeConfigured } from "./stripe.js";

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
    // Don't cache map/tileset assets, og-image, or index.html — they change when regenerated
    if (urlPath.startsWith("/assets/maps/") || urlPath.startsWith("/assets/tilesets/") || urlPath === "/og-image.png" || urlPath === "/index.html" || urlPath === "/") {
      headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    }
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
    const payStatus = await getUserPaymentStatus(user.id);
    ws.send(JSON.stringify({
      type: "payment_status",
      entrancePaid: payStatus.entrancePaid,
      subscriptionActive: payStatus.subscriptionActive,
      subscriptionStatus: payStatus.subscriptionStatus,
      currentPeriodEnd: payStatus.currentPeriodEnd,
    } satisfies ServerMsg));
  }

  // Helper: send the user's list of rooms they own or have joined
  const sendRoomsList = () => {
    const rooms = tenants.getRoomsForUser(sess.user.id).map(r => ({ roomId: r.id, name: r.name, isPrivate: r.isPrivate }));
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
        const data = JSON.stringify({ type: "toast", text: "Too many requests — slow down." });
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
        return;
      }

      const OWNER_ONLY = new Set(["hire", "assign", "assign_all", "stop", "stop_all", "fire", "recruit", "create_card", "assign_card", "move_card", "delete_card", "set_settings", "set_api_key", "clear", "clear_all"]);
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
          manager.hire(msg.name, msg.provider, msg.model, msg.systemPrompt ?? "", msg.role ?? "worker", msg.sprite, msg.appearance);
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
          manager.fire(msg.agentId);
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
          manager.recruit(msg.firedAgentId);
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
          // Can't join private rooms directly — need an invite
          if (room.isPrivate && room.ownerId !== sess.user.id) {
            sess.broadcast({ type: "toast", text: "This is a private office. You need an invite." });
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
