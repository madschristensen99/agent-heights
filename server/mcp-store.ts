/**
 * HTTP handler for the MCP server catalog — a curated static list of
 * high-value MCP servers. Serves /api/mcp-catalog/* endpoints.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { searchCatalog, getServerById, MCP_CATEGORIES, type MCPCatalogServer } from "../shared/mcp-catalog.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Strip internal fields that shouldn't be sent to the client. */
function sanitize(s: MCPCatalogServer): MCPCatalogServer {
  return s;
}

export function handleMcpCatalogRequest(
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  const url = req.url?.split("?")[0] ?? "";
  if (!url.startsWith("/api/mcp-catalog")) return false;

  const queryStr = req.url?.split("?")[1] ?? "";
  const params = new URLSearchParams(queryStr);

  // GET /api/mcp-catalog — list all servers (with optional search)
  if (url === "/api/mcp-catalog") {
    const search = params.get("search") ?? "";
    const category = params.get("category") ?? "";
    const transport = params.get("transport") ?? "";

    let results = searchCatalog(search);
    if (category) {
      results = results.filter((s) => s.category.includes(category));
    }
    if (transport === "remote" || transport === "stdio") {
      results = results.filter((s) => s.transport === transport);
    }

    json(res, 200, {
      servers: results.map(sanitize),
      count: results.length,
      categories: MCP_CATEGORIES,
    });
    return true;
  }

  // GET /api/mcp-catalog/categories — list all categories
  if (url === "/api/mcp-catalog/categories") {
    json(res, 200, { categories: MCP_CATEGORIES });
    return true;
  }

  // GET /api/mcp-catalog/server?id=xxx — get a single server by ID
  if (url === "/api/mcp-catalog/server") {
    const id = params.get("id");
    if (!id) {
      json(res, 400, { error: "Missing id parameter" });
      return true;
    }
    const server = getServerById(id);
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
