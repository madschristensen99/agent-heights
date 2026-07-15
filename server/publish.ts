import type { IncomingMessage, ServerResponse } from "node:http";
import { supabaseAdmin, isSupabaseConfigured, verifyToken } from "./supabase.js";

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

interface PublishBody {
  agentId: string;
  name: string;
  summary: string;
  description: string;
  tags: string;
  price: number;
  model: string;
  systemPrompt: string;
}

export async function handlePublishRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = req.url?.split("?")[0] ?? "";
  if (url !== "/api/publish-agent") return false;

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return true;
  }

  if (!isSupabaseConfigured) {
    json(res, 503, { error: "Publishing requires Supabase to be configured" });
    return true;
  }

  // Verify auth token from Authorization header
  const authHeader = req.headers["authorization"];
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    json(res, 401, { error: "Authentication required" });
    return true;
  }

  const user = await verifyToken(token);
  if (!user) {
    json(res, 403, { error: "Invalid or expired token" });
    return true;
  }

  // Read body
  let body: string;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    body = Buffer.concat(chunks).toString();
  } catch {
    json(res, 400, { error: "Failed to read request body" });
    return true;
  }

  let parsed: PublishBody;
  try {
    parsed = JSON.parse(body);
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return true;
  }

  if (!parsed.name?.trim() || !parsed.summary?.trim()) {
    json(res, 400, { error: "Name and summary are required" });
    return true;
  }

  const isFree = parsed.price <= 0;
  const tags = parsed.tags.trim();

  // Build the agent config JSON that the marketplace stores
  const agentConfig = {
    model: parsed.model,
    systemPrompt: parsed.systemPrompt,
    provider: "cline",
    source: "sprite-heights",
    agentId: parsed.agentId,
  };

  try {
    const { data, error } = await supabaseAdmin
      .from("swarms_cloud_agents")
      .insert({
        name: parsed.name.trim().slice(0, 200),
        agent: JSON.stringify(agentConfig),
        description: parsed.description.trim().slice(0, 10000) || parsed.summary.trim(),
        summary: parsed.summary.trim().slice(0, 500),
        tags: tags || null,
        is_free: isFree,
        price: isFree ? null : parsed.price,
        price_usd: isFree ? null : parsed.price,
        language: "TypeScript",
        search_type: "agent",
        status: "pending",
        user_id: user.id,
        use_cases: [],
        category: [],
        requirements: [],
        links: [],
      })
      .select("id")
      .single();

    if (error) {
      console.error("[publish] Supabase insert error:", error.message);
      json(res, 500, { error: `Database error: ${error.message}` });
      return true;
    }

    json(res, 200, {
      id: data.id,
      status: "pending",
      message: "Agent published! It will appear on the marketplace after approval.",
    });
    return true;
  } catch (err) {
    console.error("[publish] Error:", err);
    json(res, 500, { error: err instanceof Error ? err.message : "Internal error" });
    return true;
  }
}
