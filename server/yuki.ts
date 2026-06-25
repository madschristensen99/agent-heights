import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentInfo, TaskCard } from "../shared/types.js";

const MARKETPLACE_URL = process.env.MARKETPLACE_URL || "http://localhost:3000";

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/** Build HQ context string to inject into Yuki's system prompt. */
function buildHqContext(agents: AgentInfo[], board: TaskCard[], bossName: string): string {
  const roster = agents
    .filter((a) => a.id !== "yuki")
    .map((a) => `- ${a.name} (${a.title}, ${a.model}, ${a.status}${a.task ? `, working on: ${a.task.slice(0, 60)}` : ""})`)
    .join("\n") || "(no agents hired yet)";

  const cards = board.length > 0
    ? board.map((c) => `- [${c.status}] ${c.title}${c.assignedAgentId ? ` (assigned)` : ""}`).join("\n")
    : "(no task cards)";

  return `## Agent HQ Context

The user is currently in Agent HQ — a pixel-art office where they manage real AI agents.
Their name is "${bossName}".

### Current Office Roster
${roster}

### Task Board
${cards}

### About Agent HQ
Agent HQ is a visual workspace where users hire AI agents (powered by Claude, GPT, etc.) to work on real coding tasks.
Agents have individual workspaces, can be assigned tasks, collaborate via handoffs, and be organized with a task board.
Users can browse the Swarms Marketplace from inside Agent HQ and hire marketplace agents directly into their office.
When a user asks about hiring agents or finding the right agent for a task, mention that they can browse the marketplace
using the MARKET button in the top bar, or ask you for recommendations.`;
}

export async function handleYukiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  getHqContext: () => { agents: AgentInfo[]; board: TaskCard[]; bossName: string } | null,
): Promise<boolean> {
  const url = req.url?.split("?")[0] ?? "";
  if (url !== "/api/yuki") return false;

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return true;
  }

  // Read request body
  let body: string;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    body = Buffer.concat(chunks).toString();
  } catch {
    json(res, 400, { error: "Failed to read request body" });
    return true;
  }

  let parsed: { message?: string; history?: { role: string; content: string }[]; conversationId?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return true;
  }

  if (!parsed.message?.trim()) {
    json(res, 400, { error: "Message is required" });
    return true;
  }

  // Build HQ context
  const hqCtx = getHqContext();
  const hqContextStr = hqCtx ? buildHqContext(hqCtx.agents, hqCtx.board, hqCtx.bossName) : undefined;

  // Forward to marketplace Yuki API
  const forwardBody = {
    message: parsed.message,
    history: parsed.history ?? [],
    entityContext: hqContextStr,
    conversationId: parsed.conversationId,
  };

  try {
    const upstream = await fetch(`${MARKETPLACE_URL}/api/yuki`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forwardBody),
    });

    if (!upstream.ok || !upstream.body) {
      json(res, 502, { error: `Marketplace Yuki returned ${upstream.status}` });
      return true;
    }

    // Stream SSE response through
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const reader = upstream.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } catch {
      // client disconnected
    }
    res.end();
    return true;
  } catch (err) {
    json(res, 502, {
      error: `Failed to reach marketplace at ${MARKETPLACE_URL}: ${err instanceof Error ? err.message : "unknown error"}`,
    });
    return true;
  }
}
