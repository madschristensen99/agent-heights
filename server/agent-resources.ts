import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentInfo, TaskCard } from "../shared/types.js";
import { catalogSummary, CURATED_AGENTS_SUMMARY } from "../shared/mcp-catalog.js";
import { searchPulseMCP, shouldSearchPulseMCP, extractSearchQuery } from "./pulsemcp.js";
import { json } from "./security.js";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

const MARKETPLACE_URL = process.env.MARKETPLACE_URL || "http://localhost:3000";

/** Fetch approved marketplace agents from DB and build a summary for Agent Resources's system prompt. */
async function buildMarketplaceAgentsSummary(): Promise<string> {
  if (!isSupabaseConfigured) return CURATED_AGENTS_SUMMARY;

  try {
    const { data, error } = await supabaseAdmin
      .from("heights_cloud_agents")
      .select("name, description, summary, is_premium, tags, is_free, price_usd")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .range(0, 199);

    if (error || !data || data.length === 0) return CURATED_AGENTS_SUMMARY;

    const lines = data.map((r) => {
      const name = String(r.name ?? "");
      const desc = String(r.summary ?? r.description ?? "").slice(0, 150);
      const premiumTag = r.is_premium ? " [PREMIUM]" : "";
      const priceTag = !r.is_free && r.price_usd ? ` ($${r.price_usd}/mo)` : "";
      return `- ${name}${premiumTag}${priceTag}: ${desc}`;
    });

    return `### Curated Marketplace Agents (hire via MARKET button)\n${lines.join("\n")}`;
  } catch {
    return CURATED_AGENTS_SUMMARY;
  }
}

/** Build HQ context string to inject into Agent Resources's system prompt. */
async function buildHqContext(agents: AgentInfo[], board: TaskCard[], bossName: string): Promise<string> {
  const roster = agents
    .filter((a) => a.id !== "agent-resources")
    .map((a) => `- ${a.name} (${a.model}, ${a.status}${a.task ? `, working on: ${a.task.slice(0, 60)}` : ""})`)
    .join("\n") || "(no agents hired yet)";

  const cards = board.length > 0
    ? board.map((c) => `- [${c.status}] ${c.title}${c.assignedAgentId ? ` (assigned)` : ""}`).join("\n")
    : "(no task cards)";

  return `## Agent Heights Context

The user is currently in Agent Heights — a virtual office where they manage real AI agents.
Their name is "${bossName}".

### Current Office Roster
${roster}

### Task Board
${cards}

### About Agent Heights
Agent Heights is a visual workspace where users hire AI agents (powered by Claude, GPT, etc.) to work on real coding tasks.
Agents have individual workspaces, can be assigned tasks, collaborate via handoffs, and be organized with a task board.
Users can browse the marketplace from inside Agent Heights and hire marketplace agents directly into their office.

### YOUR ROLE — Office Manager (IMPORTANT)
You are Agent Resources, the office manager. You have three core responsibilities:

1. **Answer questions directly.** When the user asks you a question, ANSWER IT DIRECTLY. Do NOT delegate research tasks to other agents. The user is talking to YOU because they want YOUR answer.

2. **Decompose office goals.** When the boss gives the office a goal, you break it into subtasks for the team. You'll see the available workers in your task prompt. Respond with a JSON array of subtasks — each with a worker name, specific task, and optional dependency. The system will automatically assign them.

3. **Verify task completions.** When a worker completes or fails a task, you'll receive a review task. Review their work and respond with either APPROVED (if acceptable) or NEEDS REWORK: <specific feedback> (if they should retry). If a worker's task failed due to a rate limit, timeout, or API issue (not a quality problem), use NEEDS REWORK with "Retry the same task — the previous attempt failed due to a transient issue." Do NOT APPROVE a failed task unless you intentionally want to abandon it — a failed task means the work was NOT done, and approving it means accepting incomplete work.

4. **Hire when understaffed.** If all workers are busy and there are pending tasks, you can use the hire_agent tool to bring in new talent. Pick a name, model, and brief system prompt for the new agent.

When the user asks "what agents can I hire?" or "what agents are available?" — answer from the curated list below.
When the user asks about a specific capability (trading, code review, data analysis, etc.) — recommend the matching agent.
When the user asks about MCP servers or integrations — recommend from the curated catalog below.
If PulseMCP search results are included at the bottom of this context, use them to recommend community MCP servers too.
Only suggest delegating tasks to other agents if the user EXPLICITLY asks you to assign work — not when they're asking you a question.

${await buildMarketplaceAgentsSummary()}

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

export async function handleAgentResourcesRequest(
  req: IncomingMessage,
  res: ServerResponse,
  getHqContext: () => Promise<{ agents: AgentInfo[]; board: TaskCard[]; bossName: string } | null>,
): Promise<boolean> {
  const url = req.url?.split("?")[0] ?? "";
  if (url !== "/api/agent-resources") return false;

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
  const hqCtx = await getHqContext();
  let hqContextStr = hqCtx ? await buildHqContext(hqCtx.agents, hqCtx.board, hqCtx.bossName) : undefined;

  // Dynamic PulseMCP pre-search: if the user's message seems like a tool-finding
  // query, search PulseMCP and inject results into the context so Agent Resources can
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
        // PulseMCP search is best-effort — don't block Agent Resources's response
      }
    }
  }

  // Forward to marketplace Agent Resources API
  const forwardBody = {
    message: parsed.message,
    history: parsed.history ?? [],
    entityContext: hqContextStr,
    conversationId: parsed.conversationId,
  };

  try {
    const upstream = await fetch(`${MARKETPLACE_URL}/api/agent-resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forwardBody),
    });

    if (!upstream.ok || !upstream.body) {
      json(res, 502, { error: `Marketplace Agent Resources returned ${upstream.status}` });
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
