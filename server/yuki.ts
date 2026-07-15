import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentInfo, TaskCard } from "../shared/types.js";
import { catalogSummary, CURATED_AGENTS_SUMMARY } from "../shared/mcp-catalog.js";
import { searchPulseMCP, shouldSearchPulseMCP, extractSearchQuery } from "./pulsemcp.js";

const MARKETPLACE_URL = process.env.MARKETPLACE_URL || "http://localhost:3000";

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/** Build HQ context string to inject into Yuki's system prompt. */
function buildHqContext(agents: AgentInfo[], board: TaskCard[], bossName: string): string {
  const roster = agents
    .filter((a) => a.id !== "yuki")
    .map((a) => `- ${a.name} (${a.model}, ${a.status}${a.task ? `, working on: ${a.task.slice(0, 60)}` : ""})`)
    .join("\n") || "(no agents hired yet)";

  const cards = board.length > 0
    ? board.map((c) => `- [${c.status}] ${c.title}${c.assignedAgentId ? ` (assigned)` : ""}`).join("\n")
    : "(no task cards)";

  return `## Sprite Heights Context

The user is currently in Sprite Heights — a pixel-art office where they manage real AI agents.
Their name is "${bossName}".

### Current Office Roster
${roster}

### Task Board
${cards}

### About Sprite Heights
Sprite Heights is a visual workspace where users hire AI agents (powered by Claude, GPT, etc.) to work on real coding tasks.
Agents have individual workspaces, can be assigned tasks, collaborate via handoffs, and be organized with a task board.
Users can browse the Swarms Marketplace from inside Sprite Heights and hire marketplace agents directly into their office.

### YOUR ROLE — Office Manager (IMPORTANT)
You are Yuki, the office manager. You are NOT a task delegator. When the user asks you a question, ANSWER IT DIRECTLY.
Do NOT delegate research tasks to other agents in the office. Do NOT output JSON plans or task assignments.
The user is talking to YOU because they want YOUR answer — not because they want you to assign work to others.

When the user asks "what agents can I hire?" or "what agents are available?" — answer from the curated list below.
When the user asks about a specific capability (trading, code review, data analysis, etc.) — recommend the matching agent.
When the user asks about MCP servers or integrations — recommend from the curated catalog below.
If PulseMCP search results are included at the bottom of this context, use them to recommend community MCP servers too.
Only suggest delegating tasks to other agents if the user EXPLICITLY asks you to assign work — not when they're asking you a question.

${CURATED_AGENTS_SUMMARY}

### Curated MCP Server Catalog (installable on any agent)
These are pre-vetted MCP servers from major companies. Users can install them from the MARKET → Servers tab.
${catalogSummary()}

### Dynamic Discovery via PulseMCP
Beyond the curated catalog, there are 22,000+ community MCP servers indexed on PulseMCP (pulsemcp.com).
When a user asks about a capability not covered by the curated catalog, you can mention that there may be
community-built MCP servers available, and the results below (if any) show what was found.
If PulseMCP search results are included in this context, summarize them and suggest the user install
the relevant MCP server on a new or existing agent.`;
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

  // Build HQ context (curated knowledge is baked in)
  const hqCtx = getHqContext();
  let hqContextStr = hqCtx ? buildHqContext(hqCtx.agents, hqCtx.board, hqCtx.bossName) : undefined;

  // Dynamic PulseMCP pre-search: if the user's message seems like a tool-finding
  // query, search PulseMCP and inject results into the context so Yuki can
  // recommend community MCP servers beyond the curated catalog.
  if (hqContextStr && shouldSearchPulseMCP(parsed.message)) {
    const searchQuery = extractSearchQuery(parsed.message);
    if (searchQuery) {
      try {
        const pulseResults = await searchPulseMCP(searchQuery, 10);
        if (pulseResults) {
          hqContextStr += `\n\n${pulseResults}`;
        }
      } catch {
        // PulseMCP search is best-effort — don't block Yuki's response
      }
    }
  }

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
