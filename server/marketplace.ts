import type { IncomingMessage, ServerResponse } from "node:http";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";
import type {
  MarketplaceAgent,
  MarketplacePrompt,
  MarketplaceTool,
  MarketplaceItemType,
} from "../shared/marketplace.js";

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  return [];
}

function parseLinks(val: unknown): { label: string; url: string }[] {
  if (!Array.isArray(val)) return [];
  return val
    .filter((v) => v && typeof v === "object" && "url" in v)
    .map((v) => ({ label: String((v as Record<string, unknown>).label ?? ""), url: String((v as Record<string, unknown>).url) }));
}

export async function handleMarketplaceRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = req.url?.split("?")[0] ?? "";

  // Only handle /api/marketplace/* routes
  if (!url.startsWith("/api/marketplace")) return false;

  if (!isSupabaseConfigured) {
    json(res, 503, { error: "Marketplace not configured — Supabase not set up" });
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
      let q = supabaseAdmin
        .from("swarms_cloud_agents")
        .select("*")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) {
        q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%,summary.ilike.%${search}%,tags.ilike.%${search}%`);
      }

      const { data, error } = await q;
      if (error) { json(res, 500, { error: error.message }); return true; }

      const agents: MarketplaceAgent[] = (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        name: String(r.name ?? ""),
        description: String(r.description ?? ""),
        summary: String(r.summary ?? ""),
        agent: String(r.agent ?? ""),
        language: String(r.language ?? ""),
        use_cases: parseArray(r.use_cases),
        tags: String(r.tags ?? ""),
        image_url: r.image_url ? String(r.image_url) : null,
        is_free: Boolean(r.is_free),
        price: r.price != null ? Number(r.price) : null,
        price_usd: r.price_usd != null ? Number(r.price_usd) : null,
        category: parseArray(r.category),
        requirements: parseArray(r.requirements),
        links: parseLinks(r.links),
        user_id: r.user_id ? String(r.user_id) : null,
        created_at: String(r.created_at ?? ""),
      }));

      json(res, 200, { agents, count: agents.length });
      return true;
    }

    if (url === "/api/marketplace/prompts" || (url === "/api/marketplace" && type === "prompt")) {
      let q = supabaseAdmin
        .from("swarms_cloud_prompts")
        .select("*")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) {
        q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%,summary.ilike.%${search}%,tags.ilike.%${search}%`);
      }

      const { data, error } = await q;
      if (error) { json(res, 500, { error: error.message }); return true; }

      const prompts: MarketplacePrompt[] = (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        name: String(r.name ?? ""),
        description: String(r.description ?? ""),
        summary: String(r.summary ?? ""),
        prompt: String(r.prompt ?? ""),
        tags: String(r.tags ?? ""),
        image_url: r.image_url ? String(r.image_url) : null,
        is_free: Boolean(r.is_free),
        price: r.price != null ? Number(r.price) : null,
        price_usd: r.price_usd != null ? Number(r.price_usd) : null,
        category: parseArray(r.category),
        use_cases: parseArray(r.use_cases),
        user_id: r.user_id ? String(r.user_id) : null,
        created_at: String(r.created_at ?? ""),
      }));

      json(res, 200, { prompts, count: prompts.length });
      return true;
    }

    if (url === "/api/marketplace/tools" || (url === "/api/marketplace" && type === "tool")) {
      let q = supabaseAdmin
        .from("swarms_cloud_tools")
        .select("*")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) {
        q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%,summary.ilike.%${search}%,tags.ilike.%${search}%`);
      }

      const { data, error } = await q;
      if (error) { json(res, 500, { error: error.message }); return true; }

      const tools: MarketplaceTool[] = (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        name: String(r.name ?? ""),
        description: String(r.description ?? ""),
        summary: String(r.summary ?? ""),
        tags: String(r.tags ?? ""),
        image_url: r.image_url ? String(r.image_url) : null,
        is_free: Boolean(r.is_free),
        price: r.price != null ? Number(r.price) : null,
        price_usd: r.price_usd != null ? Number(r.price_usd) : null,
        category: parseArray(r.category),
        use_cases: parseArray(r.use_cases),
        user_id: r.user_id ? String(r.user_id) : null,
        created_at: String(r.created_at ?? ""),
      }));

      json(res, 200, { tools, count: tools.length });
      return true;
    }

    if (url === "/api/marketplace/agent") {
      const id = params.get("id");
      if (!id) { json(res, 400, { error: "Missing id parameter" }); return true; }

      const { data, error } = await supabaseAdmin
        .from("swarms_cloud_agents")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) { json(res, 404, { error: "Agent not found" }); return true; }

      const r = data as Record<string, unknown>;
      const agent: MarketplaceAgent = {
        id: String(r.id),
        name: String(r.name ?? ""),
        description: String(r.description ?? ""),
        summary: String(r.summary ?? ""),
        agent: String(r.agent ?? ""),
        language: String(r.language ?? ""),
        use_cases: parseArray(r.use_cases),
        tags: String(r.tags ?? ""),
        image_url: r.image_url ? String(r.image_url) : null,
        is_free: Boolean(r.is_free),
        price: r.price != null ? Number(r.price) : null,
        price_usd: r.price_usd != null ? Number(r.price_usd) : null,
        category: parseArray(r.category),
        requirements: parseArray(r.requirements),
        links: parseLinks(r.links),
        user_id: r.user_id ? String(r.user_id) : null,
        created_at: String(r.created_at ?? ""),
      };

      json(res, 200, agent);
      return true;
    }

    json(res, 404, { error: "Unknown marketplace endpoint" });
    return true;
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : "Internal error" });
    return true;
  }
}
