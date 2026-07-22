/**
 * The Singularity Will Be Livestreamed — Twitch chat → Yuki bridge.
 *
 * Connects to Twitch IRC, receives chat messages, and forwards them
 * to the Agent Heights server as spectator_chat messages. Yuki's
 * existing isYukiQuestion() logic determines whether to answer
 * directly or delegate as a task.
 *
 * Usage:
 *   npx tsx scripts/chat-bot.ts
 *
 * Required env vars:
 *   LIVESTREAM_SERVER_URL  WebSocket URL of the server (e.g. ws://localhost:3001)
 *   TWITCH_OAUTH_TOKEN     OAuth token from https://twitchapps.com/tmi/
 *   TWITCH_BOT_NICK        Bot account nickname
 *   TWITCH_CHANNEL         Channel to join (e.g. agentheights)
 *
 * Optional env vars:
 *   CHAT_COOLDOWN_MS       Per-user cooldown in ms (default 30000)
 *   CHAT_MAX_LENGTH        Max message length (default 500)
 */

import { WebSocket } from "ws";
import * as net from "node:net";

const SERVER_URL = process.env.LIVESTREAM_SERVER_URL ?? "ws://localhost:3001";
const TWITCH_OAUTH = process.env.TWITCH_OAUTH_TOKEN ?? "";
const TWITCH_NICK = (process.env.TWITCH_BOT_NICK ?? "agentheights").toLowerCase();
const TWITCH_CHANNEL = process.env.TWITCH_CHANNEL ?? "agentheights";
const COOLDOWN_MS = parseInt(process.env.CHAT_COOLDOWN_MS ?? "30000", 10);
const MAX_LENGTH = parseInt(process.env.CHAT_MAX_LENGTH ?? "500", 10);

if (!TWITCH_OAUTH) {
  console.error("[chat-bot] Missing TWITCH_OAUTH_TOKEN — get one at https://twitchapps.com/tmi/");
  process.exit(1);
}

// ── Rate limiting ────────────────────────────────────────────────────────
const userLastMessage = new Map<string, number>();

function isRateLimited(username: string): boolean {
  const now = Date.now();
  const last = userLastMessage.get(username);
  if (last && now - last < COOLDOWN_MS) return true;
  userLastMessage.set(username, now);
  return false;
}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [user, ts] of userLastMessage) {
    if (now - ts > COOLDOWN_MS * 10) userLastMessage.delete(user);
  }
}, 300_000);

// ── Simple profanity filter ──────────────────────────────────────────────
const PROFANITY = ["fuck", "shit", "bitch", "asshole", "cunt", "nigger", "faggot"];
function isClean(text: string): boolean {
  const lower = text.toLowerCase();
  return !PROFANITY.some((w) => lower.includes(w));
}

// ── Twitch IRC client ────────────────────────────────────────────────────
const irc = net.createConnection(6667, "irc.chat.twitch.tv");

irc.on("connect", () => {
  console.log(`[chat-bot] connected to Twitch IRC — joining #${TWITCH_CHANNEL}`);
  irc.write(`CAP REQ :twitch.tv/tags\r\n`);
  irc.write(`PASS ${TWITCH_OAUTH}\r\n`);
  irc.write(`NICK ${TWITCH_NICK}\r\n`);
  irc.write(`JOIN #${TWITCH_CHANNEL}\r\n`);
});

// PING/PONG keepalive
irc.on("data", (data: Buffer) => {
  const lines = data.toString().split("\r\n");
  for (const line of lines) {
    if (!line) continue;

    if (line.startsWith("PING")) {
      irc.write(`PONG ${line.slice(5)}\r\n`);
      continue;
    }

    // Parse PRIVMSG: @tags :nick!user@host.tmi.twitch.tv PRIVMSG #channel :message
    const match = line.match(/:(\w+)!\w+@\S+ PRIVMSG #(\w+) :(.+)/);
    if (!match) continue;

    const [, nick, channel, message] = match;
    if (channel !== TWITCH_CHANNEL) continue;

    // Skip bot's own messages
    if (nick.toLowerCase() === TWITCH_NICK) continue;

    handleChatMessage(nick, message);
  }
});

irc.on("error", (err: Error) => {
  console.error("[chat-bot] IRC error:", err.message);
});

irc.on("close", () => {
  console.log("[chat-bot] IRC connection closed — reconnecting in 5s");
  setTimeout(() => process.exit(1), 5000);
});

function sendTwitchMessage(text: string): void {
  const truncated = text.slice(0, 480);
  irc.write(`PRIVMSG #${TWITCH_CHANNEL} :${truncated}\r\n`);
}

// ── WebSocket connection to Agent Heights server ─────────────────────────
let ws: WebSocket | null = null;
let wsConnected = false;

function connectWS(): void {
  const url = `${SERVER_URL}/?spectator=1`;
  console.log(`[chat-bot] connecting to ${url}`);
  ws = new WebSocket(url);

  ws.on("open", () => {
    wsConnected = true;
    console.log("[chat-bot] WebSocket connected — bridge active");
  });

  ws.on("message", (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      // Relay Yuki's log messages back to Twitch chat
      if (msg.type === "log" && msg.agentId === "yuki") {
        const text = msg.entry?.text;
        if (text && typeof text === "string") {
          sendTwitchMessage(`Yuki: ${text.slice(0, 450)}`);
        }
      }
      // Relay toasts (hire confirmations, etc.)
      if (msg.type === "toast" && msg.text) {
        // Only relay relevant toasts, not generic UI ones
        if (msg.text.includes("hired") || msg.text.includes("Schedule") || msg.text.includes("agent")) {
          sendTwitchMessage(`📢 ${msg.text.slice(0, 450)}`);
        }
      }
    } catch { /* ignore malformed */ }
  });

  ws.on("close", () => {
    wsConnected = false;
    console.log("[chat-bot] WebSocket closed — reconnecting in 3s");
    setTimeout(connectWS, 3000);
  });

  ws.on("error", (err: Error) => {
    console.error("[chat-bot] WebSocket error:", err.message);
  });
}

connectWS();

// ── Chat message handler ─────────────────────────────────────────────────
function handleChatMessage(nick: string, message: string): void {
  // Handle bot commands
  if (message.startsWith("!")) {
    const [cmd, ...args] = message.slice(1).split(" ");
    switch (cmd.toLowerCase()) {
      case "status":
        sendTwitchMessage("The office is live! Agents are working 24/7. Type a message to talk to Yuki.");
        return;
      case "help":
        sendTwitchMessage("Just type naturally! Yuki can answer questions, hire agents, and create tasks. Try: 'hire a React agent' or 'what is everyone working on?'");
        return;
      case "agents":
        if (wsConnected && ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "spectator_chat", fromName: nick, text: "list all agents and what they're doing" }));
        }
        return;
    }
  }

  // Rate limit
  if (isRateLimited(nick)) {
    return;
  }

  // Profanity filter
  if (!isClean(message)) {
    return;
  }

  // Truncate
  const text = message.slice(0, MAX_LENGTH);
  if (!text.trim()) return;

  // Forward to Yuki via spectator_chat
  if (wsConnected && ws?.readyState === WebSocket.OPEN) {
    console.log(`[chat-bot] ${nick}: ${text}`);
    ws.send(JSON.stringify({ type: "spectator_chat", fromName: nick, text }));
  } else {
    console.log(`[chat-bot] (disconnected, dropping) ${nick}: ${text}`);
  }
}

console.log("[chat-bot] starting — press Ctrl+C to stop");

process.on("SIGINT", () => {
  console.log("[chat-bot] shutting down...");
  irc.destroy();
  ws?.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  irc.destroy();
  ws?.close();
  process.exit(0);
});
