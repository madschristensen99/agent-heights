import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import type { ClientMsg, PlayerInfo, ServerMsg } from "../shared/types.js";
import { SERVER_PORT } from "../shared/types.js";
import { AgentManager } from "./manager.js";
import { SessionLogger } from "./logger.js";
import { SaveFile, type SaveState, type Persistence } from "./persistence.js";
import { DbPersistence } from "./db.js";
import { isSupabaseConfigured, verifyToken, type AuthUser } from "./supabase.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(rootDir, "dist");

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
    const data = await readFile(filePath);
    const mime = MIME[extname(filePath)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  } catch {
    try {
      const indexPath = join(distDir, "index.html");
      const data = await readFile(indexPath);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  }
}

// ── per-user session management ───────────────────────────────────────────

interface UserSession {
  user: AuthUser;
  manager: AgentManager;
  save: Persistence;
  session: SessionLogger;
  player: PlayerInfo | null;
  clients: Set<WebSocket>;
  broadcast: (msg: ServerMsg) => void;
}

const sessions = new Map<string, UserSession>();

async function getOrCreateSession(user: AuthUser): Promise<UserSession> {
  const existing = sessions.get(user.id);
  if (existing) return existing;

  const userDir = join(rootDir, "ag", "users", user.id);
  mkdirSync(userDir, { recursive: true });

  let save: Persistence;
  let saved: SaveState | null;

  if (isSupabaseConfigured) {
    const db = new DbPersistence(user.id);
    save = db;
    saved = await db.load();
  } else {
    const file = new SaveFile(userDir);
    save = file;
    saved = file.load();
  }

  const session = new SessionLogger(userDir);
  const clients = new Set<WebSocket>();
  const player = saved?.player ?? null;

  const sess: UserSession = {
    user,
    save,
    session,
    player,
    clients,
    manager: null as unknown as AgentManager,
    broadcast: () => {},
  };

  sess.broadcast = (msg: ServerMsg): void => {
    const data = JSON.stringify(msg);
    for (const ws of sess.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  };

  sess.manager = new AgentManager(userDir, sess.broadcast, session, save, saved);
  if (player) sess.manager.bossName = player.name;

  sessions.set(user.id, sess);
  console.log(`[agent-hq] created session for user ${user.id} (${user.email ?? "no email"})`);
  return sess;
}

// ── HTTP + WebSocket server ───────────────────────────────────────────────

const server = createServer((req, res) => {
  serveStatic(req, res).catch(() => {
    res.writeHead(500);
    res.end("Internal server error");
  });
});

const wss = new WebSocketServer({ server });

wss.on("connection", async (ws, req) => {
  let user: AuthUser;

  if (isSupabaseConfigured) {
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token");
    if (!token) {
      ws.close(4001, "No auth token provided");
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

  const sess = await getOrCreateSession(user);
  sess.clients.add(ws);

  const snap = sess.manager.snapshot();
  ws.send(
    JSON.stringify({
      type: "snapshot",
      ...snap,
      player: sess.player,
      settings: sess.manager.settings,
      world: sess.manager.worldState(),
    } satisfies ServerMsg),
  );

  ws.on("message", (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    try {
      const { manager, session: sessLog, save } = sess;
      switch (msg.type) {
        case "setup": {
          const name = String(msg.player?.name ?? "").trim().slice(0, 24);
          const workspace = String(msg.player?.workspace ?? "").trim().slice(0, 32);
          if (!name || !workspace) break;
          const appearance = msg.player?.appearance ?? null;
          const changed =
            !sess.player || sess.player.name !== name || sess.player.workspace !== workspace;
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
          break;
        }
        case "set_settings":
          manager.setSettings(msg.settings);
          break;
        case "hire":
          manager.hire(msg.name, msg.provider, msg.model, msg.systemPrompt ?? "", msg.role ?? "worker", msg.sprite, msg.appearance);
          break;
        case "assign":
          manager.assign(msg.agentId, msg.task, msg.handoffTo);
          break;
        case "chat":
          manager.chat(msg.agentId, msg.text);
          break;
        case "assign_all":
          manager.assignAll(msg.task);
          break;
        case "stop":
          manager.stop(msg.agentId);
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
      }
    } catch (err) {
      console.error("[server] error handling message:", err);
      const data = JSON.stringify({ type: "toast", text: "Server error — check the server logs." });
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  });

  ws.on("close", () => sess.clients.delete(ws));
  ws.on("error", () => sess.clients.delete(ws));
});

// ── start ─────────────────────────────────────────────────────────────────

server.listen(SERVER_PORT, () => {
  console.log(`[agent-hq] server listening on :${SERVER_PORT} (HTTP + WebSocket)`);
  if (isSupabaseConfigured) {
    console.log(`[agent-hq] Supabase auth enabled`);
  } else {
    console.log(`[agent-hq] Supabase not configured — running in dev mode (no auth)`);
    console.log(`[agent-hq]   Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to enable auth`);
  }
  console.log(`[agent-hq] game data in ${join(rootDir, "ag")} (users/<id>/, logs/, workspace/)`);
});
