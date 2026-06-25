import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";
import { readFile, stat } from "node:fs/promises";
import type { ClientMsg, PlayerInfo, ServerMsg } from "../shared/types.js";
import { SERVER_PORT } from "../shared/types.js";
import { AgentManager } from "./manager.js";
import { SessionLogger } from "./logger.js";
import { SaveFile } from "./persistence.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(rootDir, "dist");

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

  // Prevent path traversal
  const filePath = normalize(join(distDir, urlPath));
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      // Directory requests fall through to index.html (SPA fallback)
      throw new Error("is directory");
    }
    const data = await readFile(filePath);
    const mime = MIME[extname(filePath)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  } catch {
    // SPA fallback: serve index.html for any non-file route
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

const server = createServer((req, res) => {
  serveStatic(req, res).catch(() => {
    res.writeHead(500);
    res.end("Internal server error");
  });
});

const wss = new WebSocketServer({ server });
const clients = new Set<WebSocket>();

const save = new SaveFile(rootDir);
const saved = save.load();
let player: PlayerInfo | null = saved?.player ?? null;

function broadcast(msg: ServerMsg): void {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

const session = new SessionLogger(rootDir);
const manager = new AgentManager(rootDir, broadcast, session, save, saved);
if (player) manager.bossName = player.name;

wss.on("connection", (ws) => {
  clients.add(ws);
  const snap = manager.snapshot();
  ws.send(
    JSON.stringify({
      type: "snapshot",
      ...snap,
      player,
      settings: manager.settings,
      world: manager.worldState(),
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
      switch (msg.type) {
        case "setup": {
          const name = String(msg.player?.name ?? "").trim().slice(0, 24);
          const workspace = String(msg.player?.workspace ?? "").trim().slice(0, 32);
          if (!name || !workspace) break;
          const appearance = msg.player?.appearance ?? null;
          const changed =
            !player || player.name !== name || player.workspace !== workspace;
          if (changed) {
            player = { name, workspace, appearance };
            manager.bossName = player.name;
            session.setPlayer(player);
            save.setPlayer(player);
            broadcast({ type: "player", player });
          } else if (appearance && player && !player.appearance) {
            player = { name: player.name, workspace: player.workspace, appearance };
            save.setPlayer(player);
            broadcast({ type: "player", player });
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
      broadcast({ type: "toast", text: "Server error — check the server logs." });
    }
  });

  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
});

server.listen(SERVER_PORT, () => {
  console.log(`[agent-hq] server listening on :${SERVER_PORT} (HTTP + WebSocket)`);
  console.log(`[agent-hq] game data in ${join(rootDir, "ag")} (save.json, logs/, workspace/)`);
  console.log(`[agent-hq] session log: ${session.file}`);
});
