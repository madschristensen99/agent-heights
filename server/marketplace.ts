import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  MarketplaceAgent,
  MarketplacePrompt,
  MarketplaceTool,
  MarketplaceItemType,
} from "../shared/marketplace.js";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";
import { json } from "./security.js";

function parseUseCases(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.map((u) => {
    if (typeof u === "string") return u;
    if (u && typeof u === "object") {
      const title = String((u as Record<string, unknown>).title ?? "");
      const desc = String((u as Record<string, unknown>).description ?? "");
      return desc ? `${title}: ${desc}` : title;
    }
    return String(u);
  });
}

function parseRequirements(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.map((r) => {
    if (typeof r === "string") return r;
    if (r && typeof r === "object") {
      const pkg = String((r as Record<string, unknown>).package ?? "");
      const install = String((r as Record<string, unknown>).installation ?? "");
      return install ? `${pkg} (${install})` : pkg;
    }
    return String(r);
  });
}

function parseCategory(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === "string" && val) return [val];
  return [];
}

function parseLinks(val: unknown): { label: string; url: string }[] {
  if (!Array.isArray(val)) return [];
  return val
    .filter((v) => v && typeof v === "object" && "url" in v)
    .map((v) => ({
      label: String((v as Record<string, unknown>).label ?? (v as Record<string, unknown>).name ?? ""),
      url: String((v as Record<string, unknown>).url),
    }));
}

function mapAgent(r: Record<string, unknown>): MarketplaceAgent {
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    description: String(r.description ?? ""),
    summary: String(r.summary ?? r.description ?? "").slice(0, 120),
    agent: String(r.agent ?? ""),
    language: String(r.language ?? ""),
    use_cases: parseUseCases(r.use_cases),
    tags: String(r.tags ?? ""),
    image_url: r.image_url ? String(r.image_url) : null,
    is_free: Boolean(r.is_free),
    price: r.price != null ? Number(r.price) : null,
    price_usd: r.price_usd != null ? Number(r.price_usd) : null,
    is_premium: Boolean(r.is_premium),
    category: parseCategory(r.category),
    requirements: parseRequirements(r.requirements),
    links: parseLinks(r.links),
    user_id: r.user_id ? String(r.user_id) : null,
    created_at: String(r.created_at ?? ""),
  };
}

function mapPrompt(r: Record<string, unknown>): MarketplacePrompt {
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    description: String(r.description ?? ""),
    summary: String(r.summary ?? r.description ?? "").slice(0, 120),
    prompt: String(r.prompt ?? ""),
    tags: String(r.tags ?? ""),
    image_url: r.image_url ? String(r.image_url) : null,
    is_free: Boolean(r.is_free),
    price: r.price != null ? Number(r.price) : null,
    price_usd: r.price_usd != null ? Number(r.price_usd) : null,
    category: parseCategory(r.category),
    use_cases: parseUseCases(r.use_cases),
    user_id: r.user_id ? String(r.user_id) : null,
    created_at: String(r.created_at ?? ""),
  };
}

function sanitizeSearch(s: string): string {
  return s.replace(/[,()]/g, " ").trim();
}

/** Agents we want to surface first — high-value, popular, or flagship.
 *  Matched case-insensitively against the agent name (with or without " Agent" suffix). */
const FEATURED_AGENTS = [
  // Google Workspace
  "Google Docs",
  "Google Calendar",
  // Finance & trading
  "Yahoo Finance",
  "Robinhood Trading",
  "Coinbase Solana",
  "Crossmint Wallet",
  "AgentWallet Trader",
  // Developer tools
  "GitHub",
  "Supabase",
  "Vercel",
  "GitLab",
  "Sentry",
  "PostHog",
  "Runpod GPU",
  // Productivity & business
  "Notion",
  "Linear",
  "Atlassian (Jira & Confluence)",
  "Airtable",
  "Calendly",
  "Cal.com",
  "HubSpot",
  "Stripe",
  "Twilio",
  "PayPal",
  // Data & scraping
  "Tavily",
  "FireCrawl",
  "Massive Web Scraper",
  "Google Maps Scraper",
  // AI
  "Hugging Face",
];

/** Premium agents to surface first in the premium tab. */
const FEATURED_PREMIUM_AGENTS = [
  "Kalshi",
  "Polymarket",
  "Perplexity",
  "Tavily",
  "Apollo",
  "Twitter (X)",
  "YouTube",
  "CoinGecko",
  "Messari",
  "AI Models",
  "StableSocial - Reddit",
];

/** Normalize a name for comparison — strips trailing " Agent" suffix case-insensitively. */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+agent$/i, "").trim();
}

function agentPriority(name: string, featured: string[] = FEATURED_AGENTS): number {
  const lower = normalizeName(name);
  for (let i = 0; i < featured.length; i++) {
    if (lower === normalizeName(featured[i])) return i;
  }
  return featured.length;
}

function sortAgents(agents: MarketplaceAgent[], usePremiumFeatured = false): MarketplaceAgent[] {
  const featured = usePremiumFeatured ? FEATURED_PREMIUM_AGENTS : FEATURED_AGENTS;
  return agents.sort((a, b) => {
    const pa = agentPriority(a.name, featured);
    const pb = agentPriority(b.name, featured);
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });
}

export async function handleMarketplaceRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = req.url?.split("?")[0] ?? "";

  if (!url.startsWith("/api/marketplace")) return false;

  if (!isSupabaseConfigured) {
    json(res, 503, { error: "Marketplace not configured — Supabase not set up" });
    return true;
  }

  const queryStr = req.url?.split("?")[1] ?? "";
  const params = new URLSearchParams(queryStr);
  const type = (params.get("type") ?? "agent") as MarketplaceItemType;
  const search = sanitizeSearch(params.get("search") ?? "");
  const limit = Math.min(parseInt(params.get("limit") ?? "500", 10) || 500, 1000);
  const offset = parseInt(params.get("offset") ?? "0", 10) || 0;

  try {
    if (url === "/api/marketplace/agents" || (url === "/api/marketplace" && type === "agent")) {
      let query = supabaseAdmin
        .from("heights_cloud_agents")
        .select("*")
        .eq("status", "approved")
        .eq("search_type", "agent")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      const premium = params.get("premium");
      if (premium === "true") {
        query = query.eq("is_premium", true);
      } else if (premium === "false") {
        query = query.eq("is_premium", false);
      }

      if (search) {
        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,tags.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) {
        console.error("[marketplace] Supabase agents query error:", error.message);
        json(res, 500, { error: error.message });
        return true;
      }

      const agents = sortAgents((data ?? []).map((r) => mapAgent(r as Record<string, unknown>)), premium === "true");
      json(res, 200, { agents, count: agents.length });
      return true;
    }

    if (url === "/api/marketplace/prompts" || (url === "/api/marketplace" && type === "prompt")) {
      let query = supabaseAdmin
        .from("heights_cloud_prompts")
        .select("*")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) {
        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,tags.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) {
        console.error("[marketplace] Supabase prompts query error:", error.message);
        json(res, 500, { error: error.message });
        return true;
      }

      const prompts = (data ?? []).map((r) => mapPrompt(r as Record<string, unknown>));
      json(res, 200, { prompts, count: prompts.length });
      return true;
    }

    if (url === "/api/marketplace/tools" || (url === "/api/marketplace" && type === "tool")) {
      let query = supabaseAdmin
        .from("heights_cloud_tools")
        .select("*")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) {
        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,tags.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) {
        console.error("[marketplace] Supabase tools query error:", error.message);
        json(res, 500, { error: error.message });
        return true;
      }

      const tools = (data ?? []).map((r) => mapAgent(r as Record<string, unknown>)) as MarketplaceTool[];
      json(res, 200, { tools, count: tools.length });
      return true;
    }

    if (url === "/api/marketplace/agent") {
      const id = params.get("id");
      if (!id) { json(res, 400, { error: "Missing id parameter" }); return true; }

      const { data, error } = await supabaseAdmin
        .from("heights_cloud_agents")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        json(res, 404, { error: "Agent not found" });
        return true;
      }

      json(res, 200, mapAgent(data as Record<string, unknown>));
      return true;
    }

    json(res, 404, { error: "Unknown marketplace endpoint" });
    return true;
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : "Internal error" });
    return true;
  }
}
