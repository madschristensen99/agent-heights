/**
 * HTTP handler for the MCP server catalog — queries the DB for curated
 * MCP servers stored in heights_cloud_agents with search_type='mcp_server'.
 * Serves /api/mcp-catalog/* endpoints.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MCPCatalogServer } from "../shared/mcp-catalog.js";
import { json } from "./security.js";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

/** In-memory cache of the full catalog, refreshed every 5 minutes. */
let cachedCatalog: MCPCatalogServer[] | null = null;
let cachedCategories: string[] = [];
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Parse a DB row into an MCPCatalogServer. */
function rowToServer(row: any): MCPCatalogServer {
  const cfg = typeof row.agent === "string" ? JSON.parse(row.agent) : row.agent;
  return {
    id: cfg.id,
    name: row.name?.replace(/^MCP:\s*/, "") || cfg.id,
    summary: row.summary || "",
    description: row.description || "",
    transport: cfg.transport || "remote",
    authType: cfg.authType || "open",
    isOfficial: cfg.isOfficial ?? false,
    category: cfg.category || [],
    icon: cfg.icon || row.image_url || undefined,
    visitorsPerWeek: cfg.visitorsPerWeek,
    url: cfg.url,
    command: cfg.command,
    args: cfg.args,
    envVars: cfg.envVars,
    nativeIntegration: cfg.nativeIntegration,
    nativeIntegrationNote: cfg.nativeIntegrationNote,
    keyLabel: cfg.keyLabel,
    keyPlaceholder: cfg.keyPlaceholder,
    keyHelpUrl: cfg.keyHelpUrl,
    urlPlaceholder: cfg.urlPlaceholder,
    riskLevel: cfg.riskLevel,
    securityNote: cfg.securityNote,
    dataAccess: cfg.dataAccess,
  };
}

/** Fetch all MCP servers from DB (with caching). */
export async function fetchCatalog(): Promise<MCPCatalogServer[]> {
  if (cachedCatalog && Date.now() - cacheTime < CACHE_TTL) {
    return cachedCatalog;
  }

  if (!isSupabaseConfigured) {
    return [];
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("heights_cloud_agents")
      .select("name, summary, description, agent, image_url")
      .eq("search_type", "mcp_server")
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .range(0, 499);

    if (error || !data) {
      console.error("[mcp-store] Failed to fetch catalog:", error);
      return cachedCatalog ?? [];
    }

    const servers = data.map(rowToServer);
    const categories = [...new Set(servers.flatMap((s) => s.category))].sort();

    cachedCatalog = servers;
    cachedCategories = categories;
    cacheTime = Date.now();

    return servers;
  } catch (e) {
    console.error("[mcp-store] Error fetching catalog:", e);
    return cachedCatalog ?? [];
  }
}

/** Search the catalog by text query. */
export async function searchCatalog(query: string): Promise<MCPCatalogServer[]> {
  const catalog = await fetchCatalog();
  if (!query.trim()) return catalog;
  const q = query.toLowerCase();
  return catalog.filter((s) =>
    s.name.toLowerCase().includes(q) ||
    s.summary.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.id.toLowerCase().includes(q) ||
    s.category.some((c) => c.toLowerCase().includes(q)),
  );
}

/** Get a server by ID. */
export async function getServerById(id: string): Promise<MCPCatalogServer | undefined> {
  const catalog = await fetchCatalog();
  return catalog.find((s) => s.id === id);
}

/** Get a server by its remote URL. Used to look up icon/branding. */
export async function getServerByUrl(url: string): Promise<MCPCatalogServer | undefined> {
  const catalog = await fetchCatalog();
  return catalog.find((s) => s.url === url);
}

/** Get all unique categories. */
export async function getCategories(): Promise<string[]> {
  await fetchCatalog();
  return cachedCategories;
}

/** Strip internal fields that shouldn't be sent to the client. */
function sanitize(s: MCPCatalogServer): MCPCatalogServer {
  return s;
}

export async function handleMcpCatalogRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = req.url?.split("?")[0] ?? "";
  if (!url.startsWith("/api/mcp-catalog")) return false;

  const queryStr = req.url?.split("?")[1] ?? "";
  const params = new URLSearchParams(queryStr);

  // GET /api/mcp-catalog — list all servers (with optional search)
  if (url === "/api/mcp-catalog") {
    const search = params.get("search") ?? "";
    const category = params.get("category") ?? "";
    const transport = params.get("transport") ?? "";

    let results = await searchCatalog(search);
    if (category) {
      results = results.filter((s) => s.category.includes(category));
    }
    if (transport === "remote" || transport === "stdio") {
      results = results.filter((s) => s.transport === transport);
    }

    json(res, 200, {
      servers: results.map(sanitize),
      count: results.length,
      categories: cachedCategories,
    });
    return true;
  }

  // GET /api/mcp-catalog/categories — list all categories
  if (url === "/api/mcp-catalog/categories") {
    const categories = await getCategories();
    json(res, 200, { categories });
    return true;
  }

  // GET /api/mcp-catalog/server?id=xxx — get a single server by ID
  if (url === "/api/mcp-catalog/server") {
    const id = params.get("id");
    if (!id) {
      json(res, 400, { error: "Missing id parameter" });
      return true;
    }
    const server = await getServerById(id);
    if (!server) {
      json(res, 404, { error: "Server not found" });
      return true;
    }
    json(res, 200, sanitize(server));
    return true;
  }

  json(res, 404, { error: "Unknown MCP catalog endpoint" });
  return true;
}
