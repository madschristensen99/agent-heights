import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  MarketplaceAgent,
  MarketplacePrompt,
  MarketplaceTool,
  MarketplaceItemType,
} from "../shared/marketplace.js";

const SWARMS_MARKETPLACE_URL = "https://swarms.world";
const SWARMS_API_KEY = process.env.SWARMS_API_KEY ?? process.env.MASTER_SWARMS_API_KEY ?? "";

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

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

async function queryMarketplace(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (SWARMS_API_KEY) headers["Authorization"] = `Bearer ${SWARMS_API_KEY}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${SWARMS_MARKETPLACE_URL}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`[marketplace] ${endpoint} returned ${res.status}`);
      return [];
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      console.error(`[marketplace] ${endpoint} returned non-JSON content-type: ${contentType}`);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`[marketplace] ${endpoint} fetch failed:`, err instanceof Error ? err.message : err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleMarketplaceRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = req.url?.split("?")[0] ?? "";

  if (!url.startsWith("/api/marketplace")) return false;

  if (!SWARMS_API_KEY) {
    json(res, 503, { error: "Marketplace not configured — SWARMS_API_KEY not set" });
    return true;
  }

  const queryStr = req.url?.split("?")[1] ?? "";
  const params = new URLSearchParams(queryStr);
  const type = (params.get("type") ?? "agent") as MarketplaceItemType;
  const search = params.get("search") ?? "";
  const limit = Math.min(parseInt(params.get("limit") ?? "50", 10) || 50, 100);
  const offset = parseInt(params.get("offset") ?? "0", 10) || 0;

  try {
    if (url === "/api/marketplace/agents" || (url === "/api/marketplace" && type === "agent")) {
      const results = await queryMarketplace("/api/query-agents", {
        search,
        priceFilter: "all",
        sortBy: "newest",
        limit,
        offset,
      });

      const agents = results.map(mapAgent);
      json(res, 200, { agents, count: agents.length });
      return true;
    }

    if (url === "/api/marketplace/prompts" || (url === "/api/marketplace" && type === "prompt")) {
      const results = await queryMarketplace("/api/query-prompts", {
        search,
        priceFilter: "all",
        sortBy: "newest",
        limit,
        offset,
      });

      const prompts = results.map(mapPrompt);
      json(res, 200, { prompts, count: prompts.length });
      return true;
    }

    if (url === "/api/marketplace/tools" || (url === "/api/marketplace" && type === "tool")) {
      json(res, 200, { tools: [] as MarketplaceTool[], count: 0 });
      return true;
    }

    if (url === "/api/marketplace/agent") {
      const id = params.get("id");
      if (!id) { json(res, 400, { error: "Missing id parameter" }); return true; }

      const results = await queryMarketplace("/api/query-agents", {
        limit: 100,
        offset: 0,
        priceFilter: "all",
        sortBy: "newest",
      });

      const found = results.find((r) => String(r.id) === id);
      if (!found) { json(res, 404, { error: "Agent not found" }); return true; }

      json(res, 200, mapAgent(found));
      return true;
    }

    json(res, 404, { error: "Unknown marketplace endpoint" });
    return true;
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : "Internal error" });
    return true;
  }
}
