#!/usr/bin/env node
/**
 * Scrape all remote MCP server detail pages from mcpservers.org
 * and output new MCPCatalogServer entries for servers not yet in our catalog.
 *
 * Usage: node scripts/scrape-mcpservers.mjs [--dry-run]
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Existing catalog IDs (from shared/mcp-catalog.ts) ────────────────────
const EXISTING_IDS = new Set([
  "ahrefs","airtable","amplitude","apollo-io","asana","atlassian","attio",
  "brave-search","browserbase","cal-com","calendly","canva","chrome-devtools",
  "clickup","close","cloudflare","cloudinary","context7","deepwiki","docusing",
  "doordash","duckdb","exa","fetch","figma","filesystem","firecrawl","fireflies",
  "gamma","git","github","gitlab","godot","grafana","granola","gusto-payroll",
  "home-assistant","honeycomb","hubspot","hugging-face","incident-io","indeed",
  "instacart","intercom","knowledge-graph-memory","linear","lucid","make",
  "memory-bank","mercury","mermaid-chart","microsoft-learn","mintlify","miro",
  "mixpanel","mongodb","n8n","neon","netlify","nextjs-devtools","notion",
  "openrouter","otter-ai","pagerduty","parallel-search","paypal","playwright",
  "posthog","postman","proxyman","pulsemcp","rag","ramp","sanity","semrush",
  "sentry","sequential-thinking","shopify","similarweb","slack","sqlite",
  "storybook","strava","stripe","supabase","survey-monkey","tavily","time",
  "tldraw","twilio","uber","vercel","webflow","wix","wordpress","xcode-build",
  "xero","yahoo-finance","zapier","zoom",
]);

// Also track existing URLs to detect URL changes
const EXISTING_URLS = new Map([
  ["https://mcp.notion.com/mcp", "notion"],
  ["https://api.githubcopilot.com/mcp/", "github"],
  ["https://mcp.linear.app/mcp", "linear"],
  ["https://mcp.slack.com/sse", "slack"],
  ["https://mcp.stripe.com", "stripe"],
  ["https://mcp.figma.com/mcp", "figma"],
  ["https://mcp.hubspot.com/mcp", "hubspot"],
  ["https://mcp.grafana.com/sse", "grafana"],
  ["https://mcp.mongodb.com/sse", "mongodb"],
  ["https://mcp.firecrawl.dev/sse", "firecrawl"],
  ["https://mcp.n8n.io/sse", "n8n"],
  ["https://mcp.vercel.com/sse", "vercel"],
  ["https://mcp.supabase.com/mcp", "supabase"],
  ["https://gitlab.com/api/v4/mcp", "gitlab"],
  ["https://mcp.brave.com/sse", "brave-search"],
  ["https://mcp.tavily.com/mcp", "tavily"],
  ["https://mcp.asana.com/sse", "asana"],
  ["https://mcp.atlassian.com/v1/sse", "atlassian"],
  ["https://mcp.canva.com/sse", "canva"],
  ["https://docs.mcp.cloudflare.com/sse", "cloudflare"],
  ["https://mcp.deepwiki.com/sse", "deepwiki"],
  ["https://mcp.exa.ai/sse", "exa"],
  ["https://mcp.sentry.dev/sse", "sentry"],
  ["https://mcp.posthog.com/sse", "posthog"],
  ["https://mcp.shopify.com/sse", "shopify"],
  ["https://mcp.zapier.com/sse", "zapier"],
  ["https://mcp.zoom.us/sse", "zoom"],
  ["https://mcp.twilio.com/sse", "twilio"],
  ["https://mcp.paypal.com/sse", "paypal"],
  ["https://mcp.webflow.com/sse", "webflow"],
  ["https://mcp.netlify.com/sse", "netlify"],
  ["https://mcp.airtable.com/sse", "airtable"],
  ["https://mcp.clickup.com/sse", "clickup"],
  ["https://mcp.calendly.com/sse", "calendly"],
  ["https://mcp.cal.com/sse", "cal-com"],
  ["https://mcp.huggingface.ai/sse", "hugging-face"],
  ["https://mcp.miro.com/sse", "miro"],
  ["https://mcp.lucid.co/sse", "lucid"],
  ["https://mcp.tldraw.com/sse", "tldraw"],
  ["https://mcp.mermaidchart.com/sse", "mermaid-chart"],
  ["https://mcp.strava.com/sse", "strava"],
  ["https://mcp.uber.com/sse", "uber"],
  ["https://mcp.instacart.com/sse", "instacart"],
  ["https://mcp.doordash.com/sse", "doordash"],
  ["https://mcp.intercom.com/sse", "intercom"],
  ["https://mcp.pagerduty.com/sse", "pagerduty"],
  ["https://mcp.incident.io/sse", "incident-io"],
  ["https://mcp.honeycomb.io/sse", "honeycomb"],
  ["https://mcp.mixpanel.com/sse", "mixpanel"],
  ["https://mcp.amplitude.com/sse", "amplitude"],
  ["https://mcp.ramp.com/sse", "ramp"],
  ["https://mcp.xero.com/sse", "xero"],
  ["https://mcp.apollo.io/sse", "apollo-io"],
  ["https://mcp.attio.com/sse", "attio"],
  ["https://mcp.close.com/sse", "close"],
  ["https://mcp.docusign.com/sse", "docusing"],
  ["https://mcp.sanity.io/sse", "sanity"],
  ["https://mcp.wordpress.com/sse", "wordpress"],
  ["https://mcp.wix.com/sse", "wix"],
  ["https://mcp.make.com/sse", "make"],
  ["https://mcp.neon.tech/sse", "neon"],
  ["https://mcp.microsoft.com/learn/sse", "microsoft-learn"],
  ["https://mcp.mintlify.com/sse", "mintlify"],
  ["https://mcp.browserbase.com/sse", "browserbase"],
  ["https://mcp.parallel.ai/sse", "parallel-search"],
  ["https://mcp.mercury.com/sse", "mercury"],
  ["https://mcp.ahrefs.com/sse", "ahrefs"],
  ["https://mcp.semrush.com/sse", "semrush"],
  ["https://mcp.similarweb.com/sse", "similarweb"],
  ["https://mcp.granola.ai/sse", "granola"],
  ["https://mcp.fireflies.ai/sse", "fireflies"],
  ["https://mcp.otter.ai/sse", "otter-ai"],
  ["https://mcp.gamma.app/sse", "gamma"],
  ["https://mcp.workable.com/sse", "gusto-payroll"],
  ["https://mcp.indeed.com/sse", "indeed"],
  ["https://mcp.surveymonkey.com/sse", "survey-monkey"],
  ["https://mcp.cloudinary.com/sse", "cloudinary"],
  ["https://gateway.mcpservers.org/yahoo-finance/mcp", "yahoo-finance"],
  ["https://mcp.home-assistant.io/sse", "home-assistant"],
  ["https://mcp.postman.com/sse", "postman"],
  ["https://mcp.openrouter.com/sse", "openrouter"],
]);

// ── All server slugs from the mcpservers.org remote listing ──────────────
// Extracted from the page content we already fetched
const ALL_SLUGS = [
  // Featured
  "ahrefs","asana","atlassian","canva","cloudflare","figma","github","hubspot",
  "linear","mercury","neon","notion","parallel","railway","slack","stripe",
  "supabase","yahoo-finance",
  // More remote MCP servers (A-Z)
  "aiera","apollo-io","attio","box","adisinsight","adobe-experience-manager",
  "adobe-creativity","adobe-journey-optimizer","adobe-marketing-agent","airtable",
  "airwallex","aiwyn-tax","alltrails","amplitude","audible","aura","aurora",
  "autodesk-product-help","aws-marketplace","b12","base44","bigdata","biorender",
  "blockscout","boardwise","booking","brex","calendly","carta","cash-app",
  "cb-insights","chronograph","circleback","clarify","clarity-ai","clay","clerk",
  "clickup","clockwise","close","cloudinary","coindesk",
  "common-room","consensus","contentsquare","context7","control-plane","coros",
  "cortellis-regulatory-intelligence","coupler-io","courtlistener","courtroom5",
  "craft","credit-karma","crossbeam","crypto-com","dnb-risk-analytics","daloopa",
  "datasite","day-ai","definely","descrybe-legal-engine","digits","directbooker",
  "doordash","dovetail","egnyte","enterpret","era-context","eraser","everlaw",
  "exa","excalidraw-app-demo","expedia","factset","fathom","fever-event-discovery",
  "fireflies","fiscal-ai","fmp","gainsight-staircase-ai","gamma","gitlab",
  "gocardless","godaddy","goodnotes","bigquery","docusign","explorium","govtribe",
  "grain","granola","granted","graphos-tools","guidepoint","guru","gusto",
  "harmonic","harvey","hex","honeycomb","hugging-face","ibisworld",
  "ice-data-services","ifttt","imanage","incident-io","indeed","instacart",
  "intercom","ironclad-contracts","jam","jotform","ketryx","kindora-funder-discovery",
  "kiwi","klaviyo","krisp","lastminute","lawve-ai","legal-data-hunter","legalzoom",
  "lilt","local-falcon","longbridge",
  "lorikeet","lseg","lucid","lumin","lusha","magic-patterns","mailchimp",
  "mailerlite","make","malwarebytes","mdn","melon","mem","mermaid-chart",
  "metaview","microsoft-learn","midpage","mintlify","miro","mixpanel","monday",
  "monte-carlo","moodys","morningstar","motherduck","motion","msci","mt-newswires",
  "netdocuments","netlify","omni-analytics","open-targets","openrouter","orion",
  "otter-ai","outreach","pagerduty","paypal","peec-ai","pendo","pg-aiguide",
  "pitchbook","planetscale","polar-analytics","posthog","postman","privacy",
  "pylon","quartr","quickbooks","quo","ramp","ramp-data","razorpay","resy",
  "rillet","sanity","scholar-gateway","scite","semrush","send","sentry","shapes",
  "shopify","signnow","similarweb","solve-intelligence","sp-global","splice",
  "spotify","sprouts","square","strava","stubhub","superhuman-mail","supermetrics",
  "surveymonkey","synthesize-bio","taskrabbit","tavily","third-bridge","thumbtack",
  "ticket-tailor","todoist","topcounsel","trellis","sketchup","tldraw","tripadvisor",
  "trivago","tropic","turbotax","twilio","uber","uber-eats","udemy-business",
  "unthread","vercel","verisk-underwriting-intelligence","verisk-xactrestore",
  "viator","webflow","windsor-ai","wix","wordpress-com","workable",
  "wyndham-hotels","xero","zapier","ziprecruiter","zocks","zoom","zoominfo",
  // Sponsor
  "alphavantage",
];

const BASE = "https://mcpservers.org/remote-mcp-servers";

function extractFromHtml(html, slug) {
  // Extract name from H1
  const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const name = nameMatch ? nameMatch[1].trim() : slug;

  // Extract summary - the text right after the H1, before "About"
  // Usually in a <p> tag after the H1
  const summaryMatch = html.match(/<\/h1>\s*<p[^>]*>([^<]+)<\/p>/i);
  const summary = summaryMatch ? summaryMatch[1].trim() : "";

  // Extract connection URL from the "Connection details" code block
  // Look for the URL pattern in code blocks
  const urlMatch = html.match(/Connection details[\s\S]*?<code[^>]*>([^<]+)<\/code>/i)
    || html.match(/<code[^>]*>(https?:\/\/[^<\s]+)<\/code>/i);
  const url = urlMatch ? urlMatch[1].trim() : "";

  // Extract auth type from FAQ
  const authSection = html.match(/Does the.*?MCP server require authentication\?[\s\S]*?<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
  let authType = "oauth"; // default to oauth
  if (authSection) {
    const authText = authSection[1].toLowerCase();
    if (authText.includes("no") && authText.includes("auth")) {
      authType = "open";
    } else if (authText.includes("oauth")) {
      authType = "oauth";
    } else if (authText.includes("api key") || authText.includes("apikey")) {
      authType = "apikey";
    }
  }

  // Extract description from "About" section
  const aboutMatch = html.match(/About [\w\s.]+<\/h\d>\s*<p[^>]*>([\s\S]*?)<\/p>/i)
    || html.match(/## About[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
  const description = aboutMatch ? aboutMatch[1].trim() : summary;

  // Extract official docs URL
  const docsMatch = html.match(/Official docs<\/a>\s*href="([^"]+)"/i)
    || html.match(/href="([^"]+)"[^>]*>Official docs/i);
  const docsUrl = docsMatch ? docsMatch[1].trim() : undefined;

  // Check if it's official
  const isOfficial = html.toLowerCase().includes("official") && !html.toLowerCase().includes("community");

  if (!url || !url.startsWith("http")) {
    console.warn(`  [warn] no URL found for ${slug}`);
    return null;
  }

  return {
    slug,
    name,
    summary,
    description,
    url,
    authType,
    docsUrl,
    isOfficial,
  };
}

function slugToId(slug) {
  return slug
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function guessIcon(name) {
  // Try simpleicons CDN with common slug patterns
  const slug = name.toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/\s+/g, "");
  return `https://cdn.simpleicons.org/${slug}/white`;
}

function guessCategories(name, summary) {
  const text = `${name} ${summary}`.toLowerCase();
  const cats = [];

  if (/finance|banking|payment|tax|accounting|payroll|invoice|expense|card/.test(text)) cats.push("finance");
  if (/trading|stock|invest|portfolio|market/.test(text)) cats.push("trading");
  if (/crm|sales|lead|prospect|contact/.test(text)) cats.push("sales");
  if (/marketing|seo|ad|campaign|email marketing/.test(text)) cats.push("marketing");
  if (/analytics|insight|metric|funnel|retention/.test(text)) cats.push("analytics");
  if (/monitor|observ|error|incident|on-call/.test(text)) cats.push("monitoring");
  if (/devops|deploy|hosting|infrastructure|cloud/.test(text)) cats.push("devops");
  if (/develop|code|api|sdk|program/.test(text)) cats.push("development");
  if (/git|repo|pull request|merge/.test(text)) cats.push("git");
  if (/database|sql|query|data/.test(text)) cats.push("database");
  if (/search|web search/.test(text)) cats.push("search");
  if (/automat|workflow|zapier|ifttt/.test(text)) cats.push("automation");
  if (/productiv|task|project|todo|schedul|calendar/.test(text)) cats.push("productivity");
  if (/communic|message|chat|email|meeting/.test(text)) cats.push("communication");
  if (/design|diagram|whiteboard|presentation|canvas/.test(text)) cats.push("design");
  if (/document|doc|knowledge|wiki|note/.test(text)) cats.push("documentation");
  if (/legal|contract|compliance/.test(text)) cats.push("legal");
  if (/hr|hiring|recruit|job/.test(text)) cats.push("hr");
  if (/commerce|shop|store|product/.test(text)) cats.push("commerce");
  if (/travel|hotel|flight|booking|trip/.test(text)) cats.push("travel");
  if (/food|restaurant|delivery|grocery/.test(text)) cats.push("lifestyle");
  if (/fitness|health|medical|pharma|clinical/.test(text)) cats.push("health");
  if (/music|audio|podcast/.test(text)) cats.push("media");
  if (/crypto|blockchain|web3/.test(text)) cats.push("crypto");
  if (/security|scam|malware/.test(text)) cats.push("security");
  if (/iot|smart home/.test(text)) cats.push("iot");
  if (/support|ticket|helpdesk/.test(text)) cats.push("support");
  if (/cms|content|publish/.test(text)) cats.push("cms");
  if (/mobile|ios|android/.test(text)) cats.push("mobile");
  if (/ai|llm|model/.test(text)) cats.push("ai");
  if (/research|science|academic|scholar/.test(text)) cats.push("research");
  if (cats.length === 0) cats.push("business");
  return [...new Set(cats)];
}

async function fetchWithRetry(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MCPCatalogUpdater/1.0)",
          "Accept": "text/html",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        console.warn(`  [warn] HTTP ${res.status} for ${url}`);
        if (res.status === 429) {
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        return null;
      }
      return await res.text();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < retries) {
        console.warn(`  [retry] ${attempt + 1}/${retries} for ${url}: ${msg}`);
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      console.warn(`  [error] failed for ${url}: ${msg}`);
      return null;
    }
  }
  return null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const uniqueSlugs = [...new Set(ALL_SLUGS)];
  console.log(`Scraping ${uniqueSlugs.length} server pages from mcpservers.org...`);

  const scraped = [];
  const urlUpdates = [];
  let fetched = 0;
  let failed = 0;

  // Process in batches of 10 to avoid rate limiting
  const BATCH = 10;
  for (let i = 0; i < uniqueSlugs.length; i += BATCH) {
    const batch = uniqueSlugs.slice(i, i + BATCH);
    console.log(`\nBatch ${Math.floor(i / BATCH) + 1}/${Math.ceil(uniqueSlugs.length / BATCH)} (${batch[0]}...${batch[batch.length - 1]})`);

    const results = await Promise.all(
      batch.map(async (slug) => {
        const url = `${BASE}/${slug}`;
        const html = await fetchWithRetry(url);
        if (!html) { failed++; return null; }
        fetched++;
        const server = extractFromHtml(html, slug);
        if (!server) return null;

        // Check if this URL already exists in our catalog with a different URL
        const existingId = EXISTING_IDS.has(slugToId(slug));
        const existingByUrl = EXISTING_URLS.get(server.url);

        // Check if an existing entry has a /sse URL but the new page shows /mcp
        for (const [oldUrl, id] of EXISTING_URLS) {
          if (id === slugToId(slug) && oldUrl !== server.url) {
            urlUpdates.push({ id, oldUrl, newUrl: server.url });
          }
        }

        return server;
      })
    );

    for (const r of results) {
      if (r) scraped.push(r);
    }

    // Small delay between batches
    if (i + BATCH < uniqueSlugs.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n\nFetched: ${fetched}, Failed: ${failed}`);
  console.log(`URL updates needed: ${urlUpdates.length}`);
  for (const u of urlUpdates) {
    console.log(`  ${u.id}: ${u.oldUrl} -> ${u.newUrl}`);
  }

  // Filter to only NEW servers (not in existing catalog)
  const newServers = scraped.filter(s => !EXISTING_IDS.has(slugToId(s.slug)));
  console.log(`\nNew servers to add: ${newServers.length}`);
  console.log(`Already in catalog: ${scraped.length - newServers.length}`);

  // Generate TypeScript entries
  const entries = newServers.map(s => {
    const id = slugToId(s.slug);
    const icon = guessIcon(s.name);
    const categories = guessCategories(s.name, s.summary);
    const authType = s.authType;
    const isOfficial = s.isOfficial;

    let entry = `  {\n`;
    entry += `    id: "${id}",\n`;
    entry += `    name: ${JSON.stringify(s.name)},\n`;
    entry += `    summary: ${JSON.stringify(s.summary)},\n`;
    entry += `    description: ${JSON.stringify(s.description)},\n`;
    entry += `    transport: "remote",\n`;
    entry += `    authType: "${authType}",\n`;
    entry += `    isOfficial: ${isOfficial},\n`;
    entry += `    category: ${JSON.stringify(categories)},\n`;
    entry += `    icon: "${icon}",\n`;
    entry += `    url: "${s.url}",\n`;
    if (authType === "apikey") {
      entry += `    keyLabel: "API Key",\n`;
      entry += `    keyPlaceholder: "Paste API key...",\n`;
    }
    entry += `  },`;
    return entry;
  });

  const output = [
    `// ── Auto-generated from mcpservers.org scrape (${new Date().toISOString().split("T")[0]}) ─────\n`,
    ...entries,
  ].join("\n");

  const outPath = resolve(ROOT, "scripts", "new-mcp-entries.ts");
  writeFileSync(outPath, output);
  console.log(`\nWrote ${newServers.length} new entries to ${outPath}`);

  // Also write URL updates
  if (urlUpdates.length > 0) {
    const updatesPath = resolve(ROOT, "scripts", "mcp-url-updates.json");
    writeFileSync(updatesPath, JSON.stringify(urlUpdates, null, 2));
    console.log(`Wrote ${urlUpdates.length} URL updates to ${updatesPath}`);
  }

  // Write a summary of all scraped servers for reference
  const summaryPath = resolve(ROOT, "scripts", "mcp-scrape-summary.json");
  writeFileSync(summaryPath, JSON.stringify({
    totalScraped: scraped.length,
    newServers: newServers.length,
    urlUpdates: urlUpdates.length,
    servers: scraped.map(s => ({
      slug: s.slug,
      name: s.name,
      url: s.url,
      authType: s.authType,
      isOfficial: s.isOfficial,
      alreadyInCatalog: EXISTING_IDS.has(slugToId(s.slug)),
    })),
  }, null, 2));
  console.log(`Wrote scrape summary to ${summaryPath}`);
}

main().catch(console.error);
