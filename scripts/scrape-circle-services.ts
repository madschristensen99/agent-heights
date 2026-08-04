/**
 * Scrape Circle's x402 Discovery API and generate a seed SQL migration
 * for premium marketplace agents.
 *
 * Usage:
 *   npx tsx scripts/scrape-circle-services.ts
 *
 * Outputs:
 *   supabase/migrations/<timestamp>_seed_premium_circle_agents.sql
 *
 * The script fetches all Gateway-compatible services from:
 *   https://api.circle.com/v2/x402/discovery/resources?supportsCircleGateway=true&siwx=false
 *
 * Each service becomes a marketplace agent with:
 *   - is_premium = true
 *   - agent JSON config containing isPremium + circleServices array
 */

const DISCOVERY_URL = "https://api.circle.com/v2/x402/discovery/resources";
const PAGE_SIZE = 200;
const USDC_DECIMALS = 6;

interface DiscoveryAccept {
  network: string;
  asset: string;
  scheme: string;
  amount: string;
  payTo: string;
  extra?: {
    name: string;
    version: string;
    chainId: number;
  };
}

interface DiscoveryMetadata {
  provider: {
    name: string;
    description: string;
    category: string;
    tags: string[];
    website: string;
    docsUrl?: string;
    openApiUrl?: string;
  };
  path: string;
  method: string;
  description: string;
  mimeType: string;
  input?: {
    type: string;
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  output?: Record<string, unknown>;
  siwx: boolean;
  supportsVanillax402: boolean;
  supportsCircleGateway: boolean;
}

interface DiscoveryItem {
  resource: string;
  type: string;
  x402Version: number;
  lastUpdated: string;
  accepts: DiscoveryAccept[];
  metadata: DiscoveryMetadata;
}

interface DiscoveryResponse {
  x402Version: number;
  items: DiscoveryItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

function amountToUsd(amount: string): number {
  const raw = parseInt(amount, 10);
  return raw / Math.pow(10, USDC_DECIMALS);
}

function escapeSql(s: string): string {
  return s.replace(/'/g, "''");
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function categoryFromCircle(cat: string): string[] {
  const mapping: Record<string, string> = {
    SOCIAL_INTELLIGENCE: "Social Media",
    FINANCIAL_ANALYSIS: "Trading & Finance",
    WEB_SEARCH_RESEARCH: "Research",
    PREDICTION_MARKETS: "Trading & Finance",
    CREATIVE: "Design",
    INFRASTRUCTURE: "Development",
  };
  const mapped = mapping[cat] ?? cat.toLowerCase().replace(/_/g, " ");
  return [mapped];
}

async function fetchAllServices(): Promise<DiscoveryItem[]> {
  const all: DiscoveryItem[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    // Fetch ALL services (no filters) to match the full catalog on agents.circle.com
    const url = `${DISCOVERY_URL}?limit=${PAGE_SIZE}&offset=${offset}`;
    console.log(`[scraper] fetching offset=${offset}...`);

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`Discovery API returned HTTP ${res.status}: ${await res.text()}`);
    }

    const data: DiscoveryResponse = await res.json();
    all.push(...data.items);
    total = data.pagination.total;
    offset += data.items.length;

    console.log(`[scraper] got ${data.items.length} items (total: ${total}, fetched: ${all.length})`);

    if (data.items.length === 0) break;
    // Be polite
    await new Promise((r) => setTimeout(r, 500));
  }

  return all;
}

function buildAgentConfig(item: DiscoveryItem): Record<string, unknown> {
  const meta = item.metadata;
  const provider = meta.provider;
  const accept = item.accepts[0];
  const priceUsd = accept ? amountToUsd(accept.amount) : 0.01;

  // Build tool definition from the service's input schema
  const toolName = meta.path
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "call";

  const toolDef = {
    name: toolName,
    description: meta.description || provider.description || `Call ${provider.name}`,
    inputSchema: meta.input ?? { type: "object", properties: {} },
  };

  const circleService = {
    name: slugify(provider.name),
    endpoint: item.resource,
    pricePerCall: priceUsd,
    description: meta.description || provider.description,
    tools: [toolDef],
  };

  const systemPrompt = [
    `You are a premium AI agent powered by ${provider.name}.`,
    provider.description ? `\n${provider.description}` : "",
    meta.description ? `\n\nYour primary capability: ${meta.description}` : "",
    `\n\nYou have access to a paid API tool (${toolName}) that costs $${priceUsd.toFixed(4)} per call.`,
    `Use it wisely — each call deducts from the user's subscription usage budget.`,
    `The tool endpoint is: ${item.resource}`,
    meta.input?.properties
      ? `\n\nTool parameters:\n${Object.entries(meta.input.properties)
          .map(([k, v]) => `- ${k}: ${v.type} — ${v.description ?? ""}`)
          .join("\n")}`
      : "",
    `\n\nAlways explain what you're doing before making API calls, and summarize the results clearly for the user.`,
  ].join("");

  return {
    model: "claude-sonnet-4-20250514",
    systemPrompt,
    isPremium: true,
    circleServices: [circleService],
  };
}

// Providers that are proxies wrapping many underlying services.
// We split their endpoints by URL path segment to create individual agents.
const PROXY_PROVIDERS: Record<string, { pathDepth: number; skipSegments: number }> = {
  // Orthogonal: /coresignal/v2/... → service = "coresignal"
  "Orthogonal": { pathDepth: 1, skipSegments: 0 },
  // AIsa API: /apis/v2/coingecko/... → service = "coingecko" (skip /apis/v2)
  "AIsa API": { pathDepth: 1, skipSegments: 2 },
  // BlockRun.AI: /api/v1/surf/... → service = "surf" (skip /api/v1)
  "BlockRun.AI": { pathDepth: 1, skipSegments: 2 },
};

// Map raw path segments to human-readable names matching the Circle marketplace website
const SERVICE_NAME_MAP: Record<string, string> = {
  agentphone: "AgentPhone",
  agentmail: "AgentMail",
  coingecko: "CoinGecko",
  twitter: "Twitter (X)",
  youtube: "YouTube",
  perplexity: "Perplexity",
  polymarket: "Polymarket",
  pm: "Polymarket",
  kalshi: "Kalshi",
  scholar: "Google Scholar",
  tavily: "Tavily",
  surf: "Surf",
  phone: "AgentPhone",
  modal: "Modal Sandbox",
  stocks: "Stocks",
  usstock: "Stocks",
  commodity: "Commodities",
  crypto: "Crypto",
  fx: "Forex",
  images: "AI Images",
  videos: "AI Video",
  audio: "AI Audio",
  chat: "AI Chat",
  voice: "AI Voice",
  search: "AI Search",
  messages: "AI Messages",
  models: "AI Models",
  health: "Health",
  financial: "Financial Data",
  coresignal: "Coresignal",
  tomba: "Tomba",
  precip: "Precip",
  predictleads: "PredictLeads",
  "brand-dev": "Brand.dev",
  icypeas: "Icypeas",
  "context-dev": "Context.dev",
  findymail: "Findymail",
  aviato: "Aviato",
  apollo: "Apollo",
  bytemine: "Bytemine",
  contactout: "ContactOut",
  notte: "Notte",
  peopledatalabs: "People Data Labs",
  "ocean-io": "Ocean.io",
  olostep: "Olostep",
  scrapegraphai: "ScrapeGraphAI",
  captaindata: "Captain Data",
  crustdata: "Crustdata",
  openmart: "Openmart",
  tako: "Tako",
  "company-enrich": "CompanyEnrich",
  rocketreach: "RocketReach",
  baseten: "Baseten",
  didit: "Didit",
  "fantastic-jobs": "Fantastic Jobs",
  fundable: "Fundable",
  "influencers-club": "Influencers Club",
  rivoter: "Rivoter",
  andi: "Andi",
  edges: "Edges",
  fiber: "Fiber AI",
  happenstance: "Happenstance",
  linkup: "Linkup",
  nyne: "Nyne",
  openfunnel: "OpenFunnel",
  scrapecreators: "ScrapeCreators",
  seltz: "Seltz",
  serper: "Serper",
  sixtyfour: "Sixtyfour",
  voygr: "VOYGR",
  "serper-scrape": "Serper",
};

// Domain overrides for sub-services that are proxied through AIsa/BlockRun/etc.
// Without this, they all get the proxy provider's favicon.
const SERVICE_DOMAIN_MAP: Record<string, string> = {
  coingecko: "coingecko.com",
  twitter: "twitter.com",
  youtube: "youtube.com",
  perplexity: "perplexity.ai",
  polymarket: "polymarket.com",
  pm: "polymarket.com",
  kalshi: "kalshi.com",
  scholar: "scholar.google.com",
  tavily: "tavily.com",
  exa: "exa.ai",
  surf: "surf.com",
  // Orthogonal sub-services
  coresignal: "coresignal.com",
  tomba: "tomba.io",
  precip: "precip.ai",
  predictleads: "predictleads.ai",
  "brand-dev": "brand.dev",
  icypeas: "icypeas.com",
  "context-dev": "context.dev",
  findymail: "findymail.com",
  aviato: "aviato.ai",
  apollo: "apollo.io",
  bytemine: "bytemine.com",
  contactout: "contactout.com",
  notte: "notte.com",
  peopledatalabs: "peopledatalabs.com",
  "ocean-io": "ocean.io",
  olostep: "olostep.com",
  scrapegraphai: "scrapegraphai.com",
  captaindata: "captaindata.com",
  crustdata: "crustdata.com",
  openmart: "openmart.ai",
  tako: "tako.ai",
  "company-enrich": "companyenrich.com",
  rocketreach: "rocketreach.com",
  baseten: "baseten.co",
  didit: "didit.com",
  "fantastic-jobs": "fantasticjobs.com",
  fundable: "fundable.com",
  "influencers-club": "influencers.club",
  rivoter: "rivoter.com",
  andi: "andi.io",
  edges: "edges.ai",
  fiber: "fiber.ai",
  happenstance: "happenstance.com",
  linkup: "linkup.ai",
  nyne: "nyne.ai",
  openfunnel: "openfunnel.com",
  scrapecreators: "scrapecreators.com",
  seltz: "seltz.com",
  serper: "serper.dev",
  sixtyfour: "sixtyfour.ai",
  voygr: "voygr.com",
  "serper-scrape": "serper.dev",
};

// Domain overrides for non-proxy providers (by provider name).
// Used when the provider's own favicon isn't ideal (e.g. StableSocial → Reddit).
const PROVIDER_DOMAIN_MAP: Record<string, string> = {
  "StableSocial": "reddit.com",
};

// Name overrides for non-proxy providers (by provider name).
// Used to rename agents for clarity (e.g. StableSocial → StableSocial - Reddit).
const PROVIDER_NAME_MAP: Record<string, string> = {
  "StableSocial": "StableSocial - Reddit",
};

function prettifyName(seg: string): string {
  return SERVICE_NAME_MAP[seg] ?? seg
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getSubServiceKey(item: DiscoveryItem): string | null {
  const proxyConfig = PROXY_PROVIDERS[item.metadata.provider.name];
  if (!proxyConfig) return null;

  try {
    const u = new URL(item.resource);
    const parts = u.pathname.split("/").filter(Boolean);
    const seg = parts[proxyConfig.skipSegments];
    return seg || null;
  } catch {
    return null;
  }
}

function generateSql(items: DiscoveryItem[]): string {
  const lines: string[] = [
    `-- Auto-generated by scripts/scrape-circle-services.ts`,
    `-- Scraped from Circle x402 Discovery API on ${new Date().toISOString()}`,
    `-- ${items.length} endpoints across all providers`,
    ``,
    `-- Insert premium marketplace agents for Circle x402 services`,
    `-- Each agent wraps paid API endpoint(s); costs flow through the user's subscription budget`,
    `-- Proxy providers (Orthogonal, AIsa API, BlockRun.AI) are split into individual service agents`,
    ``,
  ];

  // Group items into logical services.
  // For proxy providers, split by URL path segment to create individual agents.
  // For non-proxy providers, group by provider name as before.
  const byService = new Map<string, { name: string; items: DiscoveryItem[]; provider: DiscoveryMetadata["provider"] }>();

  for (const item of items) {
    const providerName = item.metadata.provider.name;
    const subService = getSubServiceKey(item);

    if (subService) {
      // Proxy provider — split by sub-service
      const prettyName = prettifyName(subService);
      const key = `${prettyName}`;
      const existing = byService.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        byService.set(key, { name: prettyName, items: [item], provider: item.metadata.provider });
      }
    } else {
      // Non-proxy provider — group by provider name
      const key = providerName;
      const existing = byService.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        byService.set(key, { name: providerName, items: [item], provider: item.metadata.provider });
      }
    }
  }

  console.log(`[scraper] ${items.length} endpoints grouped into ${byService.size} service agents`);

  let agentNum = 0;
  for (const [_key, { name: serviceName, items: serviceItems, provider }] of byService) {
    agentNum++;
    const firstItem = serviceItems[0];
    const meta = firstItem.metadata;

    // Build circleServices array from all endpoints in this service
    const circleServices = serviceItems.map((item) => {
      const accept = item.accepts[0];
      const priceUsd = accept ? amountToUsd(accept.amount) : 0.01;
      const toolName = item.metadata.path
        .replace(/^\//, "")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || "call";

      // Extract clean JSON Schema from Circle's input format:
      // POST: { body: { type: "object", properties: {...} }, type: "http", method: "POST" }
      // GET:  { type: "http", method: "GET", queryParams: { type: "object", properties: {...} } }
      const rawInput: any = item.metadata.input ?? {};
      const httpMethod = (rawInput.method ?? "GET").toUpperCase();
      let cleanSchema: any = { type: "object", properties: {} };
      if (rawInput.body && typeof rawInput.body === "object" && rawInput.body.properties) {
        cleanSchema = { type: "object", properties: rawInput.body.properties, required: rawInput.body.required ?? [] };
      } else if (rawInput.queryParams && typeof rawInput.queryParams === "object" && rawInput.queryParams.properties) {
        cleanSchema = { type: "object", properties: rawInput.queryParams.properties, required: rawInput.queryParams.required ?? [] };
      } else if (rawInput.properties) {
        cleanSchema = { type: "object", properties: rawInput.properties, required: rawInput.required ?? [] };
      }

      return {
        name: slugify(serviceName),
        endpoint: item.resource,
        pricePerCall: priceUsd,
        description: item.metadata.description || provider.description,
        method: httpMethod,
        tools: [
          {
            name: toolName,
            description: item.metadata.description || `Call ${serviceName}`,
            inputSchema: cleanSchema,
          },
        ],
      };
    });

    // Build combined system prompt — include actual tool names so the model knows what to call
    const toolList = serviceItems
      .map((item) => {
        const accept = item.accepts[0];
        const priceUsd = accept ? amountToUsd(accept.amount) : 0.01;
        const toolName = item.metadata.path
          .replace(/^\//, "")
          .replace(/[^a-zA-Z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 40) || "call";
        const fullToolName = slugify(serviceName) + "__" + toolName;
        const rawInput: any = item.metadata.input ?? {};
        const httpMethod = (rawInput.method ?? "GET").toUpperCase();
        const params = rawInput.body?.required ?? rawInput.queryParams?.required ?? rawInput.required ?? [];
        const paramHint = params.length > 0 ? ` (requires: ${params.join(", ")})` : "";
        return `- ${fullToolName}: ${item.metadata.description || item.resource} ($${priceUsd.toFixed(4)}/call, ${httpMethod}${paramHint})`;
      })
      .join("\n");

    const serviceDescription = meta.description || provider.description || `Premium agent with ${serviceItems.length} paid API tool(s)`;

    const systemPrompt = [
      `You are a premium AI agent powered by ${serviceName}.`,
      provider.description ? `\n${provider.description}` : "",
      `\n\nYou have access to the following paid API tools (use the tool names exactly as shown):`,
      toolList,
      `\n\nEach API call deducts from the user's subscription usage budget. Use calls wisely and always explain what you're doing before making them.`,
      provider.docsUrl ? `\n\nAPI docs: ${provider.docsUrl}` : "",
    ].join("");

    const agentConfig = {
      model: "claude-sonnet-4-20250514",
      systemPrompt,
      isPremium: true,
      circleServices,
    };

    const agentName = (PROVIDER_NAME_MAP[serviceName] ?? serviceName).slice(0, 80);
    const description = serviceDescription;
    const summary = description.slice(0, 120);
    const tags = (provider.tags ?? []).slice(0, 10).join(",");
    const categories = categoryFromCircle(provider.category ?? "INFRASTRUCTURE");

    // Generate avatar image URL — prefer sub-service domain, fall back to provider website
    // For proxy sub-services without their own domain, use a letter-avatar so they don't
    // all show the proxy provider's logo.
    let imageUrl: string | null = null;
    const subServiceSeg = getSubServiceKey(serviceItems[0]);
    const overrideDomain = subServiceSeg ? SERVICE_DOMAIN_MAP[subServiceSeg] : null;
    if (overrideDomain) {
      imageUrl = `https://www.google.com/s2/favicons?domain=${overrideDomain}&sz=128`;
    } else if (subServiceSeg) {
      // Proxy sub-service without a domain override — use a letter avatar
      imageUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(agentName)}&backgroundColor=1e293b,312e81,3730a3,5b21b6,6d28d9&textColor=ffffff`;
    } else if (PROVIDER_DOMAIN_MAP[serviceName]) {
      imageUrl = `https://www.google.com/s2/favicons?domain=${PROVIDER_DOMAIN_MAP[serviceName]}&sz=128`;
    } else if (provider.website) {
      try {
        const domain = new URL(provider.website).hostname;
        imageUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
      } catch {}
    }

    const useCases = serviceItems
      .slice(0, 5)
      .map((item) => item.metadata.description || item.metadata.provider.description || "")
      .filter(Boolean);
    const useCasesJson = JSON.stringify(useCases);
    const configJson = JSON.stringify(agentConfig);
    const links = JSON.stringify(
      [
        ...(provider.website ? [{ label: "Website", url: provider.website }] : []),
        ...(provider.docsUrl ? [{ label: "Docs", url: provider.docsUrl }] : []),
      ].slice(0, 3),
    );
    const categoriesJson = JSON.stringify(categories);

    lines.push(`-- Agent ${agentNum}: ${agentName} (${serviceItems.length} endpoint(s))`);
    lines.push(`INSERT INTO heights_cloud_agents (name, description, summary, agent, language, use_cases, tags, is_free, price, price_usd, is_premium, category, requirements, links, image_url, status, created_at)`);
    lines.push(`VALUES (`);
    lines.push(`  '${escapeSql(agentName)}',`);
    lines.push(`  '${escapeSql(description)}',`);
    lines.push(`  '${escapeSql(summary)}',`);
    lines.push(`  '${escapeSql(configJson)}',`);
    lines.push(`  'en',`);
    lines.push(`  '${escapeSql(useCasesJson)}'::jsonb,`);
    lines.push(`  '${escapeSql(tags)}',`);
    lines.push(`  true,`);
    lines.push(`  NULL,`);
    lines.push(`  NULL,`);
    lines.push(`  true,`);
    lines.push(`  '${escapeSql(categoriesJson)}'::jsonb,`);
    lines.push(`  '[]'::jsonb,`);
    lines.push(`  '${escapeSql(links)}'::jsonb,`);
    lines.push(`  ${imageUrl ? `'${escapeSql(imageUrl)}'` : 'NULL'},`);
    lines.push(`  'approved',`);
    lines.push(`  now()`);
    lines.push(`) ON CONFLICT (name) DO NOTHING;`);
    lines.push(``);
  }

  lines.push(`-- Total: ${byService.size} premium agents from ${items.length} endpoints`);

  return lines.join("\n");
}

async function main(): Promise<void> {
  console.log("[scraper] starting Circle x402 service discovery...");
  const items = await fetchAllServices();
  console.log(`[scraper] fetched ${items.length} services total`);

  if (items.length === 0) {
    console.log("[scraper] no services found — exiting");
    return;
  }

  // Log payment method breakdown
  const gatewayCount = items.filter((i) => i.metadata.supportsCircleGateway).length;
  const vanillaCount = items.filter((i) => i.metadata.supportsVanillax402).length;
  const bothCount = items.filter((i) => i.metadata.supportsCircleGateway && i.metadata.supportsVanillax402).length;
  console.log(`[scraper] payment methods: ${gatewayCount} Gateway, ${vanillaCount} vanilla x402, ${bothCount} both`);

  // Include ALL services — our Gateway wallet can pay for any x402 endpoint
  const sql = generateSql(items);

  const filename = `supabase/migrations/20250804000002_seed_premium_circle_agents.sql`;
  const { writeFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const outPath = resolve(process.cwd(), filename);
  writeFileSync(outPath, sql, "utf-8");
  console.log(`[scraper] wrote ${outPath} (${sql.length} bytes)`);
}

main().catch((err) => {
  console.error("[scraper] failed:", err);
  process.exit(1);
});
