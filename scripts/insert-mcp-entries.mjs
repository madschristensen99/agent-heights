#!/usr/bin/env node
/**
 * Insert the cleaned scraped entries into shared/mcp-catalog.ts
 * before the closing `];` of the MCP_CATALOG array.
 * Also apply URL updates to existing entries.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const catalogPath = resolve(ROOT, "shared", "mcp-catalog.ts");
const entriesPath = resolve(ROOT, "scripts", "new-mcp-entries-clean.ts");
const updatesPath = resolve(ROOT, "scripts", "mcp-url-updates.json");

let catalog = readFileSync(catalogPath, "utf-8");
const newEntries = readFileSync(entriesPath, "utf-8");
const urlUpdates = JSON.parse(readFileSync(updatesPath, "utf-8"));

// 1. Apply URL updates to existing entries
for (const { id, oldUrl, newUrl } of urlUpdates) {
  if (catalog.includes(oldUrl)) {
    catalog = catalog.replace(oldUrl, newUrl);
    console.log(`Updated URL for ${id}: ${oldUrl} -> ${newUrl}`);
  } else {
    console.log(`[skip] URL not found for ${id}: ${oldUrl}`);
  }
}

// 2. Insert new entries before the closing `];` of MCP_CATALOG
// Find the last entry's closing brace + `];`
const closingIdx = catalog.indexOf("\n];\n\n// ── Helper functions");
if (closingIdx === -1) {
  console.error("Could not find insertion point in catalog");
  process.exit(1);
}

// Strip the comment header from new entries
const entriesBody = newEntries.replace(/^\/\/.*\n\n/, "");

const insertion = `
  // ── Tier 4: Additional Remote MCPs from mcpservers.org (${new Date().toISOString().split("T")[0]}) ─────

${entriesBody}`;

catalog = catalog.slice(0, closingIdx) + insertion + catalog.slice(closingIdx);

writeFileSync(catalogPath, catalog);
console.log(`\nInserted ${entriesBody.split("  },\n").length - 1} new entries into ${catalogPath}`);
