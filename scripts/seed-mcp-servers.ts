/**
 * Seed MCP server catalog entries into heights_cloud_agents table
 * using search_type = 'mcp_server'. The MCP server config is stored
 * in the `agent` JSON field.
 *
 * Run: npx tsx scripts/seed-mcp-servers.ts
 */
import * as fs from "fs";
import * as path from "path";

const CATALOG_FILE = path.join(process.cwd(), "shared", "mcp-catalog.ts");
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const content = fs.readFileSync(CATALOG_FILE, "utf8");

const catalogStart = content.indexOf("export const MCP_CATALOG:");
const catalogEnd = content.indexOf("];", catalogStart);
const catalogBody = content.slice(catalogStart, catalogEnd);

const entryRegex = /\{\s*\n\s*id:\s*"([^"]+)"/g;
const ids: string[] = [];
let match;
while ((match = entryRegex.exec(catalogBody)) !== null) {
  ids.push(match[1]);
}

console.log(`Found ${ids.length} entries to seed`);

const entries: any[] = [];

for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  const idPattern = new RegExp(`\\{\\s*\\n\\s*id:\\s*"${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`);
  const startMatch = catalogBody.match(idPattern);
  if (!startMatch) continue;
  const startIdx = startMatch.index!;

  let depth = 0;
  let endIdx = startIdx;
  let inString = false;
  let escape = false;
  for (let j = startIdx; j < catalogBody.length; j++) {
    const ch = catalogBody[j];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) { endIdx = j; break; }
    }
  }

  const objText = catalogBody.slice(startIdx, endIdx + 1);

  try {
    // eslint-disable-next-line no-eval
    const obj = eval(`(${objText})`);
    entries.push(obj);
  } catch (e) {
    console.error(`Failed to parse entry "${id}":`, e);
  }
}

console.log(`Successfully parsed ${entries.length} entries`);

// Transform to heights_cloud_agents rows
const rows = entries.map((e) => {
  const agentConfig = {
    id: e.id,
    transport: e.transport || "remote",
    authType: e.authType || "open",
    isOfficial: e.isOfficial || false,
    category: e.category || [],
    icon: e.icon || null,
    visitorsPerWeek: e.visitorsPerWeek || null,
    url: e.url || null,
    command: e.command || null,
    args: e.args || null,
    envVars: e.envVars || null,
    nativeIntegration: e.nativeIntegration || false,
    nativeIntegrationNote: e.nativeIntegrationNote || null,
    keyLabel: e.keyLabel || null,
    keyPlaceholder: e.keyPlaceholder || null,
    keyHelpUrl: e.keyHelpUrl || null,
    urlPlaceholder: e.urlPlaceholder || null,
  };

  return {
    name: `MCP: ${e.name}`,
    agent: JSON.stringify(agentConfig),
    description: e.description,
    summary: e.summary,
    tags: e.id,
    is_free: true,
    price: null,
    price_usd: null,
    language: "TypeScript",
    search_type: "mcp_server",
    status: "approved",
    use_cases: JSON.stringify(e.category || []),
    category: JSON.stringify(e.category || []),
    requirements: JSON.stringify(e.envVars?.map((v: any) => v.name) || []),
    links: JSON.stringify(e.keyHelpUrl ? [{ label: "Get API Key", url: e.keyHelpUrl }] : []),
    image_url: e.icon || null,
  };
});

const BATCH_SIZE = 50;

async function main() {
  console.log("Clearing existing mcp_server entries...");
  // Delete in a loop — Supabase REST API has a default row limit on DELETE
  let deletedCount = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    const delRes = await fetch(
      `${SUPABASE_URL}/rest/v1/heights_cloud_agents?search_type=eq.mcp_server&limit=1000`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: "return=representation",
        },
      }
    );
    const delData = await delRes.json();
    const n = Array.isArray(delData) ? delData.length : 0;
    deletedCount += n;
    if (n === 0) break;
  }
  console.log(`Deleted ${deletedCount} existing entries`);

  // Wait for delete to propagate
  await new Promise(r => setTimeout(r, 2000));

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/heights_cloud_agents`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal,resolution=merge-duplicates",
        "Content-Profile": "public",
        "x-on-conflict": "name",
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`Insert failed (${res.status}): ${text.slice(0, 200)}`);
      break;
    }
    console.log(`Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)} (${batch.length} entries)`);
  }

  console.log(`\n✅ Seeded ${rows.length} MCP servers to DB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
