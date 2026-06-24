import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ClientMsg, PlayerInfo, ServerMsg } from "../shared/types.js";
import { SERVER_PORT } from "../shared/types.js";
import { AgentManager } from "./manager.js";
import { SessionLogger } from "./logger.js";
import { SaveFile } from "./persistence.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const wss = new WebSocketServer({ port: SERVER_PORT });
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
          const changed =
            !player || player.name !== name || player.workspace !== workspace;
          if (changed) {
            player = { name, workspace };
            manager.bossName = player.name;
            session.setPlayer(player);
            save.setPlayer(player);
            broadcast({ type: "player", player });
          }
          break;
        }
        case "set_settings":
          manager.setSettings(msg.settings);
          break;
        case "hire":
          manager.hire(msg.name, msg.provider, msg.model, msg.systemPrompt ?? "", msg.role ?? "worker", msg.sprite);
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

console.log(`[agent-hq] server listening on ws://localhost:${SERVER_PORT}`);
console.log(`[agent-hq] game data in ${join(rootDir, "ag")} (save.json, logs/, workspace/)`);
console.log(`[agent-hq] session log: ${session.file}`);
