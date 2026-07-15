/**
 * PulseMCP search helper — connects to the PulseMCP MCP server (stdio)
 * and exposes search functionality for Yuki's context injection.
 *
 * The PulseMCP server indexes 22,000+ MCP servers from pulsemcp.com.
 * Tools: list_servers (with query filtering), list_integrations.
 */
import { callMCPTool, type MCPServerConfig } from "./providers/mcp-client.js";

const PULSEMCP_CONFIG: MCPServerConfig = {
  name: "pulsemcp",
  command: "npx",
  args: ["-y", "pulsemcp-server"],
};

interface PulseMCPServer {
  name: string;
  url?: string;
  external_url?: string;
  short_description?: string;
  source_code_url?: string;
  github_stars?: number;
  package_registry?: string;
  package_name?: string;
  package_download_count?: number;
  integrations?: { name: string; slug: string; url?: string }[];
}

interface PulseMCPListResponse {
  servers: PulseMCPServer[];
  total_count: number;
  next: string | null;
}

/**
 * Search PulseMCP for MCP servers matching the query.
 * Returns a formatted string suitable for injecting into Yuki's context.
 * Returns null if the search fails or finds no results.
 */
export async function searchPulseMCP(query: string, limit = 10): Promise<string | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  try {
    const raw = await callMCPTool(PULSEMCP_CONFIG, "list_servers", {
      query: trimmed,
      count_per_page: limit,
      offset: 0,
    });

    if (!raw) return null;

    let parsed: PulseMCPListResponse;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // The MCP tool might return text that's not pure JSON — try to extract
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      parsed = JSON.parse(jsonMatch[0]);
    }

    if (!parsed.servers || parsed.servers.length === 0) return null;

    const lines = parsed.servers.map((s) => {
      const stars = s.github_stars ? ` (${s.github_stars}★)` : "";
      const integrations = s.integrations?.length
        ? ` — integrations: ${s.integrations.map((i) => i.name).join(", ")}`
        : "";
      return `- ${s.name}${stars}: ${s.short_description ?? "No description"}${integrations}`;
    });

    return `### PulseMCP Community Search Results (${parsed.total_count} total matches for "${trimmed}")\n${lines.join("\n")}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[pulsemcp] search failed for "${trimmed}": ${msg}`);
    return null;
  }
}

/**
 * Determine if a user's message to Yuki seems like it's asking about
 * finding tools, agents, or capabilities — in which case we should
 * pre-search PulseMCP for relevant results.
 */
export function shouldSearchPulseMCP(message: string): boolean {
  const lower = message.toLowerCase();
  const triggerWords = [
    "find", "search", "tool", "agent", "hire", "mcp", "server",
    "integration", "connect", "api", "service", "plugin", "extension",
    "automate", "workflow", "can i", "is there", "do you have",
    "looking for", "need help with", "recommend",
  ];
  return triggerWords.some((w) => lower.includes(w));
}

/**
 * Extract search keywords from a user's message for PulseMCP search.
 * Strips common question words and keeps meaningful terms.
 */
export function extractSearchQuery(message: string): string {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "can", "i", "you", "me", "my",
    "do", "have", "has", "find", "search", "tool", "agent", "hire",
    "mcp", "server", "help", "need", "want", "looking", "for", "with",
    "about", "how", "what", "which", "any", "some", "please", "recommend",
    "connect", "integrate", "integration", "service", "plugin", "extension",
    "to", "and", "or", "if", "there", "available", "use", "using",
  ]);
  const words = message
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
  return words.slice(0, 5).join(" ");
}
