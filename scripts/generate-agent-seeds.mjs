#!/usr/bin/env node
/**
 * Generate a SQL seed migration from the MCP catalog.
 * Creates a curated marketplace agent for each remote MCP server
 * with correct auth configuration (oauth / apikey / open).
 *
 * Usage: node scripts/generate-agent-seeds.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const catalogSrc = readFileSync(resolve(ROOT, "shared", "mcp-catalog.ts"), "utf-8");

// ── Parse all catalog entries from the TS source ─────────────────────────
function parseCatalog(src) {
  const entries = [];
  const blockRegex = /\{\s*id:\s*"([^"]+)"[\s\S]*?\}\s*,/g;
  let match;
  while ((match = blockRegex.exec(src)) !== null) {
    const block = match[0];
    const id = match[1];

    const getField = (field) => {
      const m = block.match(new RegExp(`${field}:\\s*("(?:[^"\\\\]|\\\\.)*")`));
      return m ? JSON.parse(m[1]) : undefined;
    };

    const getRaw = (field) => {
      const m = block.match(new RegExp(`${field}:\\s*("[^"]*")`));
      return m ? m[1].replace(/^"|"$/g, "") : undefined;
    };

    const transport = getRaw("transport");
    const authType = getRaw("authType");
    const isOfficial = block.includes("isOfficial: true");
    const url = getRaw("url");
    const command = getRaw("command");

    const id_field = id;
    const name = getField("name") || id;
    const summary = getField("summary") || "";
    const description = getField("description") || summary;
    const icon = getRaw("icon");
    const keyLabel = getField("keyLabel");
    const keyPlaceholder = getField("keyPlaceholder");
    const keyHelpUrl = getRaw("keyHelpUrl");

    // Parse category array
    const catMatch = block.match(/category:\s*\[([^\]]*)\]/);
    const rawCategory = catMatch
      ? catMatch[1].split(",").map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean)
      : ["business"];

    // Only remote servers
    if (transport !== "remote" || !url) continue;

    // Consolidate granular categories into a clean set
    const CATEGORY_MAP = {
      "productivity": "Productivity",
      "knowledge": "Productivity",
      "project-management": "Productivity",
      "scheduling": "Productivity",
      "communication": "Communication",
      "support": "Communication",
      "development": "Development",
      "git": "Development",
      "documentation": "Development",
      "hosting": "Development",
      "backend": "Development",
      "browser": "Development",
      "design": "Design",
      "media": "Design",
      "finance": "Finance",
      "trading": "Finance",
      "accounting": "Finance",
      "crypto": "Finance",
      "crm": "Business",
      "sales": "Business",
      "commerce": "Business",
      "business": "Business",
      "hr": "Business",
      "jobs": "Business",
      "cms": "Business",
      "monitoring": "Data & Analytics",
      "analytics": "Data & Analytics",
      "data": "Data & Analytics",
      "database": "Data & Analytics",
      "search": "Data & Analytics",
      "seo": "Data & Analytics",
      "research": "Data & Analytics",
      "analysis": "Data & Analytics",
      "ai": "AI & ML",
      "ml": "AI & ML",
      "automation": "AI & ML",
      "cloud": "Infrastructure",
      "devops": "Infrastructure",
      "security": "Infrastructure",
      "iot": "Infrastructure",
      "smart-home": "Infrastructure",
      "web": "Infrastructure",
      "fitness": "Lifestyle",
      "health": "Lifestyle",
      "transport": "Lifestyle",
      "lifestyle": "Lifestyle",
      "shopping": "Lifestyle",
      "food": "Lifestyle",
      "travel": "Lifestyle",
      "legal": "Lifestyle",
    };
    const seen = new Set();
    const category = rawCategory
      .map(c => CATEGORY_MAP[c] || "Business")
      .filter(c => seen.has(c) ? false : (seen.add(c), true))
      .slice(0, 1); // Only primary category to keep filters clean

    entries.push({
      id: id_field,
      name,
      summary,
      description,
      authType,
      isOfficial,
      category,
      icon,
      url,
      keyLabel,
      keyPlaceholder,
      keyHelpUrl,
    });
  }
  return entries;
}

// ── Skip agents already seeded in the database ───────────────────────────
const ALREADY_SEEDED = new Set([
  "robinhood", // Robinhood Trading Agent (migration 000009)
  "yahoo-finance", // Yahoo Finance Agent (migration 000014)
  "github", // GitHub Agent (migration 000015)
]);

// ── Generate a deterministic appearance from the server ID ───────────────
function genAppearance(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  const h = Math.abs(hash);
  return {
    skin: h % 3,
    hairStyle: (h >> 2) % 7,
    hair: (h >> 5) % 8,
    shirt: (h >> 8) % 13,
    pants: (h >> 11) % 3,
    accessory: (h >> 14) % 6,
    accent: (h >> 17) % 13,
    beard: (h >> 20) % 3,
    eyeColor: (h >> 23) % 2,
    headFeature: 0,
  };
}

// ── Generate a system prompt for the agent ───────────────────────────────
function genSystemPrompt(server) {
  const { name, summary, url, authType } = server;
  const authNote = authType === "oauth"
    ? "You authenticate via OAuth — the user will connect their account."
    : authType === "apikey"
    ? "You authenticate via an API key — the user will provide their key."
    : "No authentication is required for this MCP server.";

  return `You are a ${name} agent connected via the ${name} MCP at ${url}. ${summary} ${authNote} When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.`;
}

// ── Generate use cases from summary ──────────────────────────────────────
function genUseCases(server) {
  const { summary, name } = server;
  const useCases = [];
  // Generic use cases based on the summary
  useCases.push(`Access ${name} data and capabilities via MCP`);
  if (summary.includes("search") || summary.includes("Search")) useCases.push("Search and retrieve information");
  if (summary.includes("manage") || summary.includes("Manage") || summary.includes("create")) useCases.push("Create and manage resources");
  if (summary.includes("analyz") || summary.includes("Analyz")) useCases.push("Analyze data and generate insights");
  if (useCases.length < 2) useCases.push(`Automate ${name} workflows from conversation`);
  return useCases.slice(0, 4);
}

// ── Generate requirements based on auth type ─────────────────────────────
function genRequirements(server) {
  if (server.authType === "oauth") {
    return [`${server.name} account (OAuth connection required)`];
  }
  if (server.authType === "apikey") {
    const keyDesc = server.keyLabel || "API Key";
    const helpUrl = server.keyHelpUrl || "";
    return [`${keyDesc}${helpUrl ? ` (${helpUrl})` : ""}`];
  }
  return ["No authentication required — works immediately"];
}

// ── Generate links ───────────────────────────────────────────────────────
function genLinks(server) {
  const links = [{ label: `${server.name} MCP Server`, url: server.url }];
  if (server.keyHelpUrl) {
    links.push({ label: `Get your ${server.keyLabel || "API Key"}`, url: server.keyHelpUrl });
  }
  return links;
}

// ── Extract domain for favicon (strip common MCP subdomain prefixes) ────
function getFaviconUrl(url) {
  try {
    const u = new URL(url);
    let host = u.hostname;
    // Strip common MCP subdomain prefixes to get the brand domain
    host = host.replace(/^(mcp|docs|api|setup|agent|gateway|fig-mcp)\./, "");
    // For compound subdomains like netlify-mcp.netlify.app, use the root domain
    const parts = host.split(".");
    if (parts.length > 2) {
      // Use last 2 parts (e.g. netlify.app from netlify-mcp.netlify.app)
      host = parts.slice(-2).join(".");
    }
    return `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
  } catch {
    return null;
  }
}

// ── SQL escape ───────────────────────────────────────────────────────────
function sqlEscape(s) {
  return s.replace(/'/g, "''");
}

function sqlJson(obj) {
  return sqlEscape(JSON.stringify(obj));
}

// ── Main ─────────────────────────────────────────────────────────────────
const entries = parseCatalog(catalogSrc);
console.log(`Parsed ${entries.length} remote MCP servers from catalog`);

const newEntries = entries.filter(e => !ALREADY_SEEDED.has(e.id));
console.log(`Skipping ${entries.length - newEntries.length} already-seeded agents`);
console.log(`Generating ${newEntries.length} new marketplace agent seeds`);

const sqlParts = [];
sqlParts.push(`-- Seed the marketplace with curated agents for each MCP server in the catalog.`);
sqlParts.push(`-- Auto-generated from shared/mcp-catalog.ts on ${new Date().toISOString().split("T")[0]}.`);
sqlParts.push(`-- Each agent connects to a remote MCP server with correct auth configuration.`);
sqlParts.push(`-- Skips agents already seeded in earlier migrations (Robinhood, Yahoo Finance, GitHub).`);
sqlParts.push(``);
sqlParts.push(`-- Delete any existing agents with these names first (idempotent re-seed)`);
sqlParts.push(`DELETE FROM public.swarms_cloud_agents`);
sqlParts.push(`WHERE name IN (`);
for (let i = 0; i < newEntries.length; i++) {
  const e = newEntries[i];
  const isLast = i === newEntries.length - 1;
  sqlParts.push(`  '${sqlEscape(e.name)} Agent'${isLast ? "" : ","}`);
}
sqlParts.push(`);`);
sqlParts.push(``);
sqlParts.push(`INSERT INTO public.swarms_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)`);
sqlParts.push(`VALUES`);

for (let i = 0; i < newEntries.length; i++) {
  const e = newEntries[i];
  const isLast = i === newEntries.length - 1;

  const agentName = `${e.name} Agent`;
  const appearance = genAppearance(e.id);
  const systemPrompt = genSystemPrompt(e);

  // Build mcpServers config
  const mcpServer = { url: e.url, name: e.id };
  if (e.authType === "oauth") {
    mcpServer.authType = "oauth";
  } else if (e.authType === "apikey") {
    mcpServer.authType = "apikey";
    if (e.keyLabel) mcpServer.keyLabel = e.keyLabel;
    if (e.keyPlaceholder) mcpServer.keyPlaceholder = e.keyPlaceholder;
    if (e.keyHelpUrl) mcpServer.keyHelpUrl = e.keyHelpUrl;
  }
  // For "open" auth, don't include authType — the UI treats it as no-auth

  const agentConfig = {
    model: "claude-sonnet-4-20250514",
    systemPrompt,
    provider: "cline",
    source: "sprite-heights",
    appearance,
    mcpServers: [mcpServer],
  };

  const description = `${agentName} — connected to ${e.name} via MCP${e.authType === "oauth" ? " (OAuth)" : e.authType === "apikey" ? ` (${e.keyLabel || "API Key"} required)` : " (no auth required)"}.\n\n${e.description}\n\nThis agent can:\n${genUseCases(e).map(u => `• ${u}`).join("\n")}\n${e.authType === "apikey" && e.keyHelpUrl ? `\nTo connect: Get your ${e.keyLabel || "API key"} at ${e.keyHelpUrl}` : ""}${e.authType === "oauth" ? "\nTo connect: Click \"Connect via OAuth\" when hiring this agent." : ""}${e.authType === "open" ? "\nNo authentication required — works immediately." : ""}`;

  const summary = `${e.name} agent — ${e.summary}${e.authType === "oauth" ? " (OAuth)" : e.authType === "apikey" ? ` (${e.keyLabel || "API Key"})` : " (no auth)"}`;
  const tags = `${e.id},${e.name.toLowerCase()},mcp,${e.category.join(",")}`.slice(0, 200);
  const useCases = genUseCases(e);
  const requirements = genRequirements(e);
  const links = genLinks(e);
  const imageUrl = getFaviconUrl(e.url);

  sqlParts.push(`  (`);
  sqlParts.push(`    '${sqlEscape(agentName)}',`);
  sqlParts.push(`    '${sqlJson(agentConfig)}',`);
  sqlParts.push(`    '${sqlEscape(description)}',`);
  sqlParts.push(`    '${sqlEscape(summary)}',`);
  sqlParts.push(`    '${sqlEscape(tags)}',`);
  sqlParts.push(`    true,`);
  sqlParts.push(`    null,`);
  sqlParts.push(`    null,`);
  sqlParts.push(`    'TypeScript',`);
  sqlParts.push(`    'agent',`);
  sqlParts.push(`    'approved',`);
  sqlParts.push(`    '${sqlJson(useCases)}',`);
  sqlParts.push(`    '${sqlJson(e.category)}',`);
  sqlParts.push(`    '${sqlJson(requirements)}',`);
  sqlParts.push(`    '${sqlJson(links)}',`);
  sqlParts.push(`    ${imageUrl ? `'${sqlEscape(imageUrl)}'` : "null"}`);
  sqlParts.push(`  )${isLast ? ";" : ","}`);
}

sqlParts.push(``);

const sql = sqlParts.join("\n");
const outPath = resolve(ROOT, "supabase", "migrations", "20250101000017_marketplace_seed_mcp_catalog_agents.sql");
writeFileSync(outPath, sql);
console.log(`\nWrote ${newEntries.length} agent seeds to ${outPath}`);
console.log(`File size: ${(sql.length / 1024).toFixed(1)} KB`);
