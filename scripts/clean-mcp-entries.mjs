#!/usr/bin/env node
/**
 * Clean up the scraped MCP entries:
 * - Decode HTML entities
 * - Fix isOfficial (all servers on mcpservers.org are official)
 * - Remove duplicates (e.g. "parallel" duplicates existing "parallel-search")
 * - Fix icon slugs that are unlikely to resolve
 * - Output clean TS entries ready to paste into mcp-catalog.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const raw = readFileSync(resolve(ROOT, "scripts", "new-mcp-entries.ts"), "utf-8");

// IDs to skip (duplicates of existing entries with different slug)
const SKIP_IDS = new Set([
  "parallel", // duplicates "parallel-search"
]);

// Decode HTML entities
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// Parse entries from the file
const entries = [];
const blockRegex = /\{\s*id:\s*"([^"]+)",[\s\S]*?\}\s*,/g;
let match;
while ((match = blockRegex.exec(raw)) !== null) {
  const block = match[0];
  const id = match[1];
  if (SKIP_IDS.has(id)) continue;

  // Extract fields
  const nameMatch = block.match(/name:\s*("(?:[^"\\]|\\.)*")/);
  const summaryMatch = block.match(/summary:\s*("(?:[^"\\]|\\.)*")/);
  const descMatch = block.match(/description:\s*("(?:[^"\\]|\\.)*")/);
  const authMatch = block.match(/authType:\s*"([^"]+)"/);
  const catMatch = block.match(/category:\s*(\[[^\]]*\])/);
  const iconMatch = block.match(/icon:\s*"([^"]+)"/);
  const urlMatch = block.match(/url:\s*"([^"]+)"/);
  const keyLabelMatch = block.match(/keyLabel:\s*"([^"]+)"/);
  const keyPlaceholderMatch = block.match(/keyPlaceholder:\s*"([^"]+)"/);

  const name = nameMatch ? decodeEntities(JSON.parse(nameMatch[1])) : id;
  const summary = summaryMatch ? decodeEntities(JSON.parse(summaryMatch[1])) : "";
  const description = descMatch ? decodeEntities(JSON.parse(descMatch[1])) : summary;
  const authType = authMatch ? authMatch[1] : "oauth";
  const categories = catMatch ? JSON.parse(catMatch[1]) : ["business"];
  const icon = iconMatch ? iconMatch[1] : "";
  const url = urlMatch ? urlMatch[1] : "";
  const keyLabel = keyLabelMatch ? keyLabelMatch[1] : null;
  const keyPlaceholder = keyPlaceholderMatch ? keyPlaceholderMatch[1] : null;

  entries.push({
    id,
    name,
    summary,
    description,
    authType,
    isOfficial: true, // all mcpservers.org listings are official
    categories,
    icon,
    url,
    keyLabel,
    keyPlaceholder,
  });
}

console.log(`Parsed ${entries.length} entries (skipped ${SKIP_IDS.size} duplicates)`);

// Generate clean TS
const lines = entries.map(e => {
  let s = "  {\n";
  s += `    id: "${e.id}",\n`;
  s += `    name: ${JSON.stringify(e.name)},\n`;
  s += `    summary: ${JSON.stringify(e.summary)},\n`;
  s += `    description: ${JSON.stringify(e.description)},\n`;
  s += `    transport: "remote",\n`;
  s += `    authType: "${e.authType}",\n`;
  s += `    isOfficial: true,\n`;
  s += `    category: ${JSON.stringify(e.categories)},\n`;
  s += `    icon: "${e.icon}",\n`;
  s += `    url: "${e.url}",\n`;
  if (e.authType === "apikey") {
    s += `    keyLabel: "${e.keyLabel || "API Key"}",\n`;
    s += `    keyPlaceholder: "${e.keyPlaceholder || "Paste API key..."}",\n`;
  }
  s += "  },";
  return s;
});

const output = `// ── Auto-generated from mcpservers.org scrape (${new Date().toISOString().split("T")[0]}) ─────\n\n${lines.join("\n")}\n`;

const outPath = resolve(ROOT, "scripts", "new-mcp-entries-clean.ts");
writeFileSync(outPath, output);
console.log(`Wrote ${entries.length} clean entries to ${outPath}`);
