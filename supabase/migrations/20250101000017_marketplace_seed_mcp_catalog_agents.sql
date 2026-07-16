-- Seed the marketplace with curated agents for each MCP server in the catalog.
-- Auto-generated from shared/mcp-catalog.ts on 2026-07-16.
-- Each agent connects to a remote MCP server with correct auth configuration.
-- Skips agents already seeded in earlier migrations (Robinhood, Yahoo Finance, GitHub).

-- Delete any existing agents with these names first (idempotent re-seed)
DELETE FROM public.swarms_cloud_agents
WHERE name IN (
  'Notion Agent',
  'Linear Agent',
  'Slack Agent',
  'Stripe Agent',
  'Figma Agent',
  'HubSpot Agent',
  'Grafana Agent',
  'MongoDB Agent',
  'FireCrawl Agent',
  'n8n Agent',
  'Vercel Agent',
  'Supabase Agent',
  'GitLab Agent',
  'Brave Search Agent',
  'Tavily Agent',
  'Home Assistant Agent',
  'Asana Agent',
  'Atlassian (Jira & Confluence) Agent',
  'Canva Agent',
  'Cloudflare Agent',
  'DeepWiki by Devin Agent',
  'Exa Agent',
  'Sentry Agent',
  'PostHog Agent',
  'Shopify Agent',
  'Zapier Agent',
  'Zoom Agent',
  'Twilio Agent',
  'PayPal Agent',
  'Webflow Agent',
  'Netlify Agent',
  'Airtable Agent',
  'ClickUp Agent',
  'Calendly Agent',
  'Cal.com Agent',
  'Hugging Face Agent',
  'OpenRouter Agent',
  'Postman Agent',
  'Miro Agent',
  'Lucid Agent',
  'tldraw Agent',
  'Mermaid Chart Agent',
  'Strava Agent',
  'Uber Agent',
  'Instacart Agent',
  'DoorDash Agent',
  'Intercom Agent',
  'PagerDuty Agent',
  'incident.io Agent',
  'Honeycomb Agent',
  'Mixpanel Agent',
  'Amplitude Agent',
  'Ramp Agent',
  'Xero Agent',
  'Apollo.io Agent',
  'Attio Agent',
  'Close Agent',
  'DocuSign Agent',
  'Sanity Agent',
  'WordPress.com Agent',
  'Wix Agent',
  'Make Agent',
  'Neon Agent',
  'Microsoft Learn Agent',
  'Mintlify Agent',
  'Browserbase Agent',
  'Parallel Search Agent',
  'Mercury Agent',
  'Ahrefs Agent',
  'Semrush Agent',
  'Similarweb Agent',
  'Granola Agent',
  'Fireflies Agent',
  'Otter.ai Agent',
  'Gamma Agent',
  'Workable Agent',
  'Indeed Agent',
  'SurveyMonkey Agent',
  'Cloudinary Agent',
  'Railway Agent',
  'Aiera Agent',
  'Box Agent',
  'AdisInsight Agent',
  'Adobe Experience Manager Agent',
  'Adobe for creativity Agent',
  'Adobe Journey Optimizer Agent',
  'Adobe Marketing Agent Agent',
  'Airwallex Agent',
  'Aiwyn Tax Agent',
  'AllTrails Agent',
  'Audible Agent',
  'Aura Agent',
  'Aurora Agent',
  'Autodesk Product Help Agent',
  'AWS Marketplace Agent',
  'B12 Agent',
  'Base44 Agent',
  'Bigdata.com Agent',
  'BioRender Agent',
  'Blockscout Agent',
  'BoardWise Agent',
  'Booking.com Agent',
  'Brex Agent',
  'Carta Agent',
  'Cash App Agent',
  'CB Insights Agent',
  'Chronograph Agent',
  'Circleback Agent',
  'Clarify Agent',
  'Clarity AI Agent',
  'Clay Agent',
  'Clerk Agent',
  'Clockwise Agent',
  'CoinDesk Agent',
  'Common Room Agent',
  'Consensus Agent',
  'Contentsquare Agent',
  'Control Plane Agent',
  'COROS Agent',
  'Cortellis Regulatory Intelligence Agent',
  'Coupler.io Agent',
  'CourtListener Agent',
  'Courtroom5 Agent',
  'Craft Agent',
  'Credit Karma Agent',
  'Crossbeam Agent',
  'Crypto.com Agent',
  'D&B Risk Analytics Agent',
  'Daloopa Agent',
  'Datasite Agent',
  'Day AI Agent',
  'Definely Agent',
  'Descrybe Legal Engine Agent',
  'Digits Agent',
  'DirectBooker Agent',
  'Dovetail Agent',
  'Egnyte Agent',
  'Enterpret Agent',
  'Era Context Agent',
  'Eraser Agent',
  'Everlaw Agent',
  'Excalidraw Agent',
  'Expedia Agent',
  'FactSet Agent',
  'Fathom Agent',
  'Fever Event Discovery Agent',
  'Fiscal.ai Agent',
  'FMP Agent',
  'Gainsight (Staircase AI) Agent',
  'GoCardless Agent',
  'GoDaddy Agent',
  'Goodnotes Agent',
  'Google Cloud BigQuery Agent',
  'Docusign Agent',
  'Explorium Agent',
  'GovTribe Agent',
  'Grain Agent',
  'Granted Agent',
  'GraphOS MCP Tools Agent',
  'Guidepoint Agent',
  'Guru Agent',
  'Gusto Agent',
  'Harmonic Agent',
  'Harvey Agent',
  'Hex Agent',
  'IBISWorld Agent',
  'ICE Data Services Agent',
  'IFTTT Agent',
  'iManage Work Agent',
  'Ironclad Contracts Agent',
  'Jam Agent',
  'Jotform Agent',
  'Ketryx Agent',
  'Kindora Funder Discovery Agent',
  'Kiwi.com Agent',
  'Klaviyo Agent',
  'Krisp Agent',
  'lastminute.com Agent',
  'Lawve AI Agent',
  'Legal Data Hunter Agent',
  'LegalZoom Agent',
  'LILT Agent',
  'Local Falcon Agent',
  'Longbridge Agent',
  'Lorikeet Agent',
  'LSEG Agent',
  'Lumin Agent',
  'Lusha Agent',
  'Magic Patterns Agent',
  'Mailchimp Agent',
  'MailerLite Agent',
  'Malwarebytes Agent',
  'MDN Agent',
  'Melon Agent',
  'Mem Agent',
  'Metaview Agent',
  'Midpage Legal Research Agent',
  'Monday Agent',
  'Monte Carlo Agent',
  'Moody''s Agent',
  'Morningstar Agent',
  'MotherDuck Agent',
  'Motion Creative Analytics Agent',
  'MSCI Agent',
  'MT Newswires Agent',
  'NetDocuments Agent',
  'Omni Analytics Agent',
  'Open Targets Agent',
  'Orion by Gravity Agent',
  'Outreach Agent',
  'Peec AI Agent',
  'Pendo Agent',
  'pg-aiguide Agent',
  'PitchBook Agent',
  'PlanetScale Agent',
  'Polar Analytics Agent',
  'Privacy.com Agent',
  'Pylon Agent',
  'Quartr Agent',
  'QuickBooks Agent',
  'Quo Agent',
  'Ramp Data Agent',
  'Razorpay Agent',
  'Resy Agent',
  'Rillet Agent',
  'Scholar Gateway Agent',
  'Scite Agent',
  'Send Agent',
  'Shapes Agent',
  'SignNow Agent',
  'Solve Intelligence Agent',
  'S&P Global Agent',
  'Splice Agent',
  'Spotify Agent',
  'Sprouts Data Intelligence Agent',
  'Square Agent',
  'StubHub Agent',
  'Superhuman Mail Agent',
  'Supermetrics Agent',
  'SurveyMonkey Agent',
  'Synthesize Bio Agent',
  'Taskrabbit Booking Assistance Agent',
  'Third Bridge Agent',
  'Thumbtack Agent',
  'Ticket Tailor Agent',
  'Todoist Agent',
  'TopCounsel by The L Suite Agent',
  'Trellis Agent',
  'Trimble SketchUp Agent',
  'Tripadvisor Agent',
  'Trivago Agent',
  'Tropic Agent',
  'TurboTax Agent',
  'Uber Eats Agent',
  'Udemy Business Agent',
  'Unthread Agent',
  'Verisk Underwriting Intelligence Agent',
  'Verisk XactRestore Agent',
  'Viator Agent',
  'Windsor.ai Agent',
  'WordPress.com Agent',
  'Workable Agent',
  'Wyndham Hotels and Resorts Agent',
  'ZipRecruiter Agent',
  'Zocks Agent',
  'ZoomInfo Agent'
);

INSERT INTO public.swarms_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'Notion Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Notion agent connected via the Notion MCP at https://mcp.notion.com/mcp. Search content, query databases, manage pages and comments. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":6,"hair":5,"shirt":9,"pants":0,"accessory":1,"accent":2,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.notion.com/mcp","name":"notion","authType":"oauth"}]}',
    'Notion Agent — connected to Notion via MCP (OAuth).

Bridges to the Notion API for searching content, querying databases, and managing pages and comments without leaving the agent workspace. Agents can read docs, update databases, and create new pages.

This agent can:
• Access Notion data and capabilities via MCP
• Search and retrieve information
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Notion agent — Search content, query databases, manage pages and comments. (OAuth)',
    'notion,notion,mcp,Productivity',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Notion data and capabilities via MCP","Search and retrieve information","Create and manage resources"]',
    '["Productivity"]',
    '["Notion account (OAuth connection required)"]',
    '[{"label":"Notion MCP Server","url":"https://mcp.notion.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/notion.com.ico'
  ),
  (
    'Linear Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Linear agent connected via the Linear MCP at https://mcp.linear.app/mcp. Manage projects, issues, and cycles in Linear. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":0,"hair":6,"shirt":9,"pants":1,"accessory":5,"accent":1,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.linear.app/mcp","name":"linear","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"lin_api_...","keyHelpUrl":"https://linear.app/settings/api"}]}',
    'Linear Agent — connected to Linear via MCP (API Key required).

Access your Linear data to manage your projects and issues in a simple and secure way. Agents can create issues, update status, view cycles, and track progress.

This agent can:
• Access Linear data and capabilities via MCP
• Create and manage resources

To connect: Get your API Key at https://linear.app/settings/api',
    'Linear agent — Manage projects, issues, and cycles in Linear. (API Key)',
    'linear,linear,mcp,Productivity',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Linear data and capabilities via MCP","Create and manage resources"]',
    '["Productivity"]',
    '["API Key (https://linear.app/settings/api)"]',
    '[{"label":"Linear MCP Server","url":"https://mcp.linear.app/mcp"},{"label":"Get your API Key","url":"https://linear.app/settings/api"}]',
    'https://icons.duckduckgo.com/ip3/linear.app.ico'
  ),
  (
    'Slack Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Slack agent connected via the Slack MCP at https://mcp.slack.com/mcp. Send messages, read channels, and manage Slack workspace. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":3,"hair":4,"shirt":3,"pants":0,"accessory":0,"accent":3,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.slack.com/mcp","name":"slack","authType":"oauth"}]}',
    'Slack Agent — connected to Slack via MCP (OAuth).

Integrates with Slack to enable agents to send messages, read channel history, search messages, and interact with your Slack workspace.

This agent can:
• Access Slack data and capabilities via MCP
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Slack agent — Send messages, read channels, and manage Slack workspace. (OAuth)',
    'slack,slack,mcp,Communication',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Slack data and capabilities via MCP","Create and manage resources"]',
    '["Communication"]',
    '["Slack account (OAuth connection required)"]',
    '[{"label":"Slack MCP Server","url":"https://mcp.slack.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/slack.com.ico'
  ),
  (
    'Stripe Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Stripe agent connected via the Stripe MCP at https://mcp.stripe.com. Payment processing, customer management, and financial ops. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":5,"shirt":7,"pants":2,"accessory":4,"accent":6,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.stripe.com","name":"stripe","authType":"apikey","keyLabel":"Secret Key","keyPlaceholder":"sk_live_...","keyHelpUrl":"https://dashboard.stripe.com/apikeys"}]}',
    'Stripe Agent — connected to Stripe via MCP (Secret Key required).

Integrates with Stripe''s API to enable payment processing, customer management, and financial operations. Agents can create charges, manage customers, handle subscriptions, and query transaction data.

This agent can:
• Access Stripe data and capabilities via MCP
• Create and manage resources

To connect: Get your Secret Key at https://dashboard.stripe.com/apikeys',
    'Stripe agent — Payment processing, customer management, and financial ops. (Secret Key)',
    'stripe,stripe,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Stripe data and capabilities via MCP","Create and manage resources"]',
    '["Finance"]',
    '["Secret Key (https://dashboard.stripe.com/apikeys)"]',
    '[{"label":"Stripe MCP Server","url":"https://mcp.stripe.com"},{"label":"Get your Secret Key","url":"https://dashboard.stripe.com/apikeys"}]',
    'https://icons.duckduckgo.com/ip3/stripe.com.ico'
  ),
  (
    'Figma Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Figma agent connected via the Figma MCP at https://mcp.figma.com/mcp. Extract design info, variables, and component data. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":4,"hair":4,"shirt":9,"pants":2,"accessory":0,"accent":2,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.figma.com/mcp","name":"figma","authType":"oauth"}]}',
    'Figma Agent — connected to Figma via MCP (OAuth).

Integrates with Figma''s desktop app to extract design information, variables, and component data from selected frames. Agents can read design specs, extract assets, and query design tokens.

This agent can:
• Access Figma data and capabilities via MCP
• Automate Figma workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Figma agent — Extract design info, variables, and component data. (OAuth)',
    'figma,figma,mcp,Design',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Figma data and capabilities via MCP","Automate Figma workflows from conversation"]',
    '["Design"]',
    '["Figma account (OAuth connection required)"]',
    '[{"label":"Figma MCP Server","url":"https://mcp.figma.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/figma.com.ico'
  ),
  (
    'HubSpot Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a HubSpot agent connected via the HubSpot MCP at https://mcp.hubspot.com. CRM contacts, companies, deals, and task management. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":3,"shirt":10,"pants":1,"accessory":0,"accent":5,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.hubspot.com","name":"hubspot","authType":"apikey","keyLabel":"Private App Token","keyPlaceholder":"pat-...","keyHelpUrl":"https://app.hubspot.com/settings/api/private-apps"}]}',
    'HubSpot Agent — connected to HubSpot via MCP (Private App Token required).

Integrates with HubSpot CRM to enable secure access to contact information, company records, deal data, and task management. Agents can create contacts, update deals, and track pipeline.

This agent can:
• Access HubSpot data and capabilities via MCP
• Create and manage resources

To connect: Get your Private App Token at https://app.hubspot.com/settings/api/private-apps',
    'HubSpot agent — CRM contacts, companies, deals, and task management. (Private App Token)',
    'hubspot,hubspot,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access HubSpot data and capabilities via MCP","Create and manage resources"]',
    '["Business"]',
    '["Private App Token (https://app.hubspot.com/settings/api/private-apps)"]',
    '[{"label":"HubSpot MCP Server","url":"https://mcp.hubspot.com"},{"label":"Get your Private App Token","url":"https://app.hubspot.com/settings/api/private-apps"}]',
    'https://icons.duckduckgo.com/ip3/hubspot.com.ico'
  ),
  (
    'Grafana Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Grafana agent connected via the Grafana MCP at https://mcp.grafana.com/sse. Search dashboards, query Prometheus metrics, fetch data. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":4,"shirt":3,"pants":0,"accessory":4,"accent":4,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.grafana.com/sse","name":"grafana","authType":"apikey","keyLabel":"Access Token","keyPlaceholder":"glsa_...","keyHelpUrl":"https://grafana.com/docs/grafana/latest/administration/service-accounts/"}]}',
    'Grafana Agent — connected to Grafana via MCP (Access Token required).

Integrates with Grafana to enable searching dashboards, fetching datasource information, querying Prometheus metrics, and visualizing observability data.

This agent can:
• Access Grafana data and capabilities via MCP
• Search and retrieve information

To connect: Get your Access Token at https://grafana.com/docs/grafana/latest/administration/service-accounts/',
    'Grafana agent — Search dashboards, query Prometheus metrics, fetch data. (Access Token)',
    'grafana,grafana,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Grafana data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["Access Token (https://grafana.com/docs/grafana/latest/administration/service-accounts/)"]',
    '[{"label":"Grafana MCP Server","url":"https://mcp.grafana.com/sse"},{"label":"Get your Access Token","url":"https://grafana.com/docs/grafana/latest/administration/service-accounts/"}]',
    'https://icons.duckduckgo.com/ip3/grafana.com.ico'
  ),
  (
    'MongoDB Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a MongoDB agent connected via the MongoDB MCP at https://mcp.mongodb.com/sse. Comprehensive database operations for MongoDB. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":3,"shirt":10,"pants":1,"accessory":5,"accent":6,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.mongodb.com/sse","name":"mongodb","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://www.mongodb.com/docs/atlas/app-services/authentication/api-key/"}]}',
    'MongoDB Agent — connected to MongoDB via MCP (API Key required).

Provides a bridge between MongoDB databases and conversational interfaces, enabling comprehensive database operations including CRUD, aggregation, and schema inspection.

This agent can:
• Access MongoDB data and capabilities via MCP
• Automate MongoDB workflows from conversation

To connect: Get your API Key at https://www.mongodb.com/docs/atlas/app-services/authentication/api-key/',
    'MongoDB agent — Comprehensive database operations for MongoDB. (API Key)',
    'mongodb,mongodb,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access MongoDB data and capabilities via MCP","Automate MongoDB workflows from conversation"]',
    '["Data & Analytics"]',
    '["API Key (https://www.mongodb.com/docs/atlas/app-services/authentication/api-key/)"]',
    '[{"label":"MongoDB MCP Server","url":"https://mcp.mongodb.com/sse"},{"label":"Get your API Key","url":"https://www.mongodb.com/docs/atlas/app-services/authentication/api-key/"}]',
    'https://icons.duckduckgo.com/ip3/mongodb.com.ico'
  ),
  (
    'FireCrawl Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a FireCrawl agent connected via the FireCrawl MCP at https://mcp.firecrawl.dev/sse. Advanced web scraping for extracting structured data. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":2,"shirt":9,"pants":0,"accessory":4,"accent":11,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.firecrawl.dev/sse","name":"firecrawl","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"fc-...","keyHelpUrl":"https://www.firecrawl.dev/app/api-keys"}]}',
    'FireCrawl Agent — connected to FireCrawl via MCP (API Key required).

Integration with FireCrawl to provide advanced web scraping capabilities for extracting structured data from complex websites. Agents can crawl sites, extract content, and convert pages to markdown.

This agent can:
• Access FireCrawl data and capabilities via MCP
• Automate FireCrawl workflows from conversation

To connect: Get your API Key at https://www.firecrawl.dev/app/api-keys',
    'FireCrawl agent — Advanced web scraping for extracting structured data. (API Key)',
    'firecrawl,firecrawl,mcp,Infrastructure',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access FireCrawl data and capabilities via MCP","Automate FireCrawl workflows from conversation"]',
    '["Infrastructure"]',
    '["API Key (https://www.firecrawl.dev/app/api-keys)"]',
    '[{"label":"FireCrawl MCP Server","url":"https://mcp.firecrawl.dev/sse"},{"label":"Get your API Key","url":"https://www.firecrawl.dev/app/api-keys"}]',
    'https://icons.duckduckgo.com/ip3/firecrawl.dev.ico'
  ),
  (
    'n8n Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a n8n agent connected via the n8n MCP at https://mcp.n8n.io/sse. Workflow automation with 525+ integration nodes. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":2,"hair":1,"shirt":4,"pants":1,"accessory":0,"accent":0,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.n8n.io/sse","name":"n8n","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"n8n_api_...","keyHelpUrl":"https://docs.n8n.io/advanced-features/api/"}]}',
    'n8n Agent — connected to n8n via MCP (API Key required).

Integrates with n8n workflow automation platform to provide conversational access to 525+ nodes including AI-capable ones. Agents can create, trigger, and manage automated workflows.

This agent can:
• Access n8n data and capabilities via MCP
• Automate n8n workflows from conversation

To connect: Get your API Key at https://docs.n8n.io/advanced-features/api/',
    'n8n agent — Workflow automation with 525+ integration nodes. (API Key)',
    'n8n,n8n,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access n8n data and capabilities via MCP","Automate n8n workflows from conversation"]',
    '["AI & ML"]',
    '["API Key (https://docs.n8n.io/advanced-features/api/)"]',
    '[{"label":"n8n MCP Server","url":"https://mcp.n8n.io/sse"},{"label":"Get your API Key","url":"https://docs.n8n.io/advanced-features/api/"}]',
    'https://icons.duckduckgo.com/ip3/n8n.io.ico'
  ),
  (
    'Vercel Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Vercel agent connected via the Vercel MCP at https://mcp.vercel.com. Deployment management and project operations. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":3,"hair":1,"shirt":5,"pants":1,"accessory":0,"accent":2,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.vercel.com","name":"vercel","authType":"apikey","keyLabel":"Access Token","keyPlaceholder":"vercel_...","keyHelpUrl":"https://vercel.com/account/tokens"}]}',
    'Vercel Agent — connected to Vercel via MCP (Access Token required).

Manage Vercel deployments, projects, and environments. Agents can deploy, check deployment status, manage environment variables, and view analytics.

This agent can:
• Access Vercel data and capabilities via MCP
• Create and manage resources

To connect: Get your Access Token at https://vercel.com/account/tokens',
    'Vercel agent — Deployment management and project operations. (Access Token)',
    'vercel,vercel,mcp,Infrastructure',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Vercel data and capabilities via MCP","Create and manage resources"]',
    '["Infrastructure"]',
    '["Access Token (https://vercel.com/account/tokens)"]',
    '[{"label":"Vercel MCP Server","url":"https://mcp.vercel.com"},{"label":"Get your Access Token","url":"https://vercel.com/account/tokens"}]',
    'https://icons.duckduckgo.com/ip3/vercel.com.ico'
  ),
  (
    'Supabase Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Supabase agent connected via the Supabase MCP at https://mcp.supabase.com/mcp. Manage databases, projects, migrations, and storage. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":1,"hair":6,"shirt":5,"pants":1,"accessory":0,"accent":6,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.supabase.com/mcp","name":"supabase","authType":"apikey","keyLabel":"Access Token","keyPlaceholder":"sbp_...","keyHelpUrl":"https://supabase.com/dashboard/account/tokens"}]}',
    'Supabase Agent — connected to Supabase via MCP (Access Token required).

Integrates with the Supabase platform for managing databases, projects, migrations, and storage. Agents can run SQL, manage tables, handle auth, and deploy edge functions.

This agent can:
• Access Supabase data and capabilities via MCP
• Create and manage resources

To connect: Get your Access Token at https://supabase.com/dashboard/account/tokens',
    'Supabase agent — Manage databases, projects, migrations, and storage. (Access Token)',
    'supabase,supabase,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Supabase data and capabilities via MCP","Create and manage resources"]',
    '["Data & Analytics"]',
    '["Access Token (https://supabase.com/dashboard/account/tokens)"]',
    '[{"label":"Supabase MCP Server","url":"https://mcp.supabase.com/mcp"},{"label":"Get your Access Token","url":"https://supabase.com/dashboard/account/tokens"}]',
    'https://icons.duckduckgo.com/ip3/supabase.com.ico'
  ),
  (
    'GitLab Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a GitLab agent connected via the GitLab MCP at https://gitlab.com/api/v4/mcp. Repo management, merge requests, issues, and CI/CD. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":4,"shirt":7,"pants":1,"accessory":1,"accent":0,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://gitlab.com/api/v4/mcp","name":"gitlab","authType":"oauth"}]}',
    'GitLab Agent — connected to GitLab via MCP (OAuth).

Official GitLab MCP server for repository management, issue tracking, merge request handling, and CI/CD pipelines. Agents can create MRs, review code, and manage pipelines.

This agent can:
• Access GitLab data and capabilities via MCP
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'GitLab agent — Repo management, merge requests, issues, and CI/CD. (OAuth)',
    'gitlab,gitlab,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access GitLab data and capabilities via MCP","Create and manage resources"]',
    '["Development"]',
    '["GitLab account (OAuth connection required)"]',
    '[{"label":"GitLab MCP Server","url":"https://gitlab.com/api/v4/mcp"}]',
    'https://icons.duckduckgo.com/ip3/gitlab.com.ico'
  ),
  (
    'Brave Search Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Brave Search agent connected via the Brave Search MCP at https://mcp.brave.com/sse. Web and local search via Brave Search API. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":5,"hair":4,"shirt":4,"pants":2,"accessory":1,"accent":2,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.brave.com/sse","name":"brave-search","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"BSA...","keyHelpUrl":"https://brave.com/search/api/"}]}',
    'Brave Search Agent — connected to Brave Search via MCP (API Key required).

Enables agents to perform web searches and local business searches using the Brave Search API. Good for research tasks, fact-checking, and finding current information.

This agent can:
• Access Brave Search data and capabilities via MCP
• Search and retrieve information

To connect: Get your API Key at https://brave.com/search/api/',
    'Brave Search agent — Web and local search via Brave Search API. (API Key)',
    'brave-search,brave search,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Brave Search data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["API Key (https://brave.com/search/api/)"]',
    '[{"label":"Brave Search MCP Server","url":"https://mcp.brave.com/sse"},{"label":"Get your API Key","url":"https://brave.com/search/api/"}]',
    'https://icons.duckduckgo.com/ip3/brave.com.ico'
  ),
  (
    'Tavily Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Tavily agent connected via the Tavily MCP at https://mcp.tavily.com/mcp. AI-optimized web search and extraction. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":4,"shirt":10,"pants":2,"accessory":4,"accent":11,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.tavily.com/mcp","name":"tavily","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"tvly-...","keyHelpUrl":"https://app.tavily.com/api-key"}]}',
    'Tavily Agent — connected to Tavily via MCP (API Key required).

AI-optimized search API that returns clean, relevant results for agent consumption. Supports search, extract, and crawl operations.

This agent can:
• Access Tavily data and capabilities via MCP
• Search and retrieve information

To connect: Get your API Key at https://app.tavily.com/api-key',
    'Tavily agent — AI-optimized web search and extraction. (API Key)',
    'tavily,tavily,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Tavily data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["API Key (https://app.tavily.com/api-key)"]',
    '[{"label":"Tavily MCP Server","url":"https://mcp.tavily.com/mcp"},{"label":"Get your API Key","url":"https://app.tavily.com/api-key"}]',
    'https://icons.duckduckgo.com/ip3/tavily.com.ico'
  ),
  (
    'Home Assistant Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Home Assistant agent connected via the Home Assistant MCP at https://mcp.home-assistant.io/sse. Control smart home devices, automations, and systems. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":4,"hair":3,"shirt":5,"pants":0,"accessory":1,"accent":8,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.home-assistant.io/sse","name":"home-assistant","authType":"apikey","keyLabel":"Long-Lived Access Token","keyPlaceholder":"Paste access token...","keyHelpUrl":"https://www.home-assistant.io/docs/authentication/"}]}',
    'Home Assistant Agent — connected to Home Assistant via MCP (Long-Lived Access Token required).

Enables natural language control of Home Assistant smart home devices, automations, and system management. Agents can toggle lights, set temperatures, check sensors, and trigger automations.

This agent can:
• Access Home Assistant data and capabilities via MCP
• Automate Home Assistant workflows from conversation

To connect: Get your Long-Lived Access Token at https://www.home-assistant.io/docs/authentication/',
    'Home Assistant agent — Control smart home devices, automations, and systems. (Long-Lived Access Token)',
    'home-assistant,home assistant,mcp,Infrastructure',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Home Assistant data and capabilities via MCP","Automate Home Assistant workflows from conversation"]',
    '["Infrastructure"]',
    '["Long-Lived Access Token (https://www.home-assistant.io/docs/authentication/)"]',
    '[{"label":"Home Assistant MCP Server","url":"https://mcp.home-assistant.io/sse"},{"label":"Get your Long-Lived Access Token","url":"https://www.home-assistant.io/docs/authentication/"}]',
    'https://icons.duckduckgo.com/ip3/home-assistant.io.ico'
  ),
  (
    'Asana Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Asana agent connected via the Asana MCP at https://mcp.asana.com/v2/mcp. Tasks, projects, workspaces. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":6,"hair":3,"shirt":0,"pants":2,"accessory":0,"accent":8,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.asana.com/v2/mcp","name":"asana","authType":"oauth"}]}',
    'Asana Agent — connected to Asana via MCP (OAuth).

Manage tasks, projects, and workspaces in Asana. Agents can create tasks, assign work, track project progress, and query workspace data.

This agent can:
• Access Asana data and capabilities via MCP
• Automate Asana workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Asana agent — Tasks, projects, workspaces. (OAuth)',
    'asana,asana,mcp,Productivity',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Asana data and capabilities via MCP","Automate Asana workflows from conversation"]',
    '["Productivity"]',
    '["Asana account (OAuth connection required)"]',
    '[{"label":"Asana MCP Server","url":"https://mcp.asana.com/v2/mcp"}]',
    'https://icons.duckduckgo.com/ip3/asana.com.ico'
  ),
  (
    'Atlassian (Jira & Confluence) Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Atlassian (Jira & Confluence) agent connected via the Atlassian (Jira & Confluence) MCP at https://mcp.atlassian.com/v1/mcp/authv2. Jira, Confluence, Compass — Atlassian suite. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":5,"hair":0,"shirt":8,"pants":0,"accessory":1,"accent":1,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.atlassian.com/v1/mcp/authv2","name":"atlassian","authType":"oauth"}]}',
    'Atlassian (Jira & Confluence) Agent — connected to Atlassian (Jira & Confluence) via MCP (OAuth).

Official Atlassian MCP server for connecting AI agents to Jira, Confluence, Opsgenie, and other Atlassian products. Agents can manage issues, read docs, and track work.

This agent can:
• Access Atlassian (Jira & Confluence) data and capabilities via MCP
• Automate Atlassian (Jira & Confluence) workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Atlassian (Jira & Confluence) agent — Jira, Confluence, Compass — Atlassian suite. (OAuth)',
    'atlassian,atlassian (jira & confluence),mcp,Productivity',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Atlassian (Jira & Confluence) data and capabilities via MCP","Automate Atlassian (Jira & Confluence) workflows from conversation"]',
    '["Productivity"]',
    '["Atlassian (Jira & Confluence) account (OAuth connection required)"]',
    '[{"label":"Atlassian (Jira & Confluence) MCP Server","url":"https://mcp.atlassian.com/v1/mcp/authv2"}]',
    'https://icons.duckduckgo.com/ip3/atlassian.com.ico'
  ),
  (
    'Canva Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Canva agent connected via the Canva MCP at https://mcp.canva.com/mcp. Designs, assets, exports, comments. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":3,"shirt":9,"pants":0,"accessory":3,"accent":5,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.canva.com/mcp","name":"canva","authType":"oauth"}]}',
    'Canva Agent — connected to Canva via MCP (OAuth).

Create and manage designs, assets, exports, and comments in Canva. Agents can generate designs, export assets, and collaborate on visual content.

This agent can:
• Access Canva data and capabilities via MCP
• Automate Canva workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Canva agent — Designs, assets, exports, comments. (OAuth)',
    'canva,canva,mcp,Design',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Canva data and capabilities via MCP","Automate Canva workflows from conversation"]',
    '["Design"]',
    '["Canva account (OAuth connection required)"]',
    '[{"label":"Canva MCP Server","url":"https://mcp.canva.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/canva.com.ico'
  ),
  (
    'Cloudflare Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Cloudflare agent connected via the Cloudflare MCP at https://mcp.cloudflare.com/mcp. Workers, KV, R2, D1, DNS, account APIs. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":2,"shirt":1,"pants":0,"accessory":5,"accent":4,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.cloudflare.com/mcp","name":"cloudflare","authType":"apikey"}]}',
    'Cloudflare Agent — connected to Cloudflare via MCP (API Key required).

Deploy, configure, and interrogate your resources on the Cloudflare developer platform (Workers, KV, R2, D1, DNS). Agents can manage deployments, configure DNS, and inspect analytics.

This agent can:
• Access Cloudflare data and capabilities via MCP
• Automate Cloudflare workflows from conversation
',
    'Cloudflare agent — Workers, KV, R2, D1, DNS, account APIs. (API Key)',
    'cloudflare,cloudflare,mcp,Infrastructure',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Cloudflare data and capabilities via MCP","Automate Cloudflare workflows from conversation"]',
    '["Infrastructure"]',
    '["API Key"]',
    '[{"label":"Cloudflare MCP Server","url":"https://mcp.cloudflare.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/cloudflare.com.ico'
  ),
  (
    'DeepWiki by Devin Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a DeepWiki by Devin agent connected via the DeepWiki by Devin MCP at https://mcp.deepwiki.com/sse. AI-powered codebase context and answers. No authentication is required for this MCP server. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":0,"hair":4,"shirt":12,"pants":1,"accessory":1,"accent":6,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.deepwiki.com/sse","name":"deepwiki"}]}',
    'DeepWiki by Devin Agent — connected to DeepWiki by Devin via MCP (no auth required).

Remote, no-auth MCP server providing AI-powered codebase context and answers. Agents can query any public GitHub repo for architecture, patterns, and implementation details.

This agent can:
• Access DeepWiki by Devin data and capabilities via MCP
• Automate DeepWiki by Devin workflows from conversation

No authentication required — works immediately.',
    'DeepWiki by Devin agent — AI-powered codebase context and answers. (no auth)',
    'deepwiki,deepwiki by devin,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access DeepWiki by Devin data and capabilities via MCP","Automate DeepWiki by Devin workflows from conversation"]',
    '["Development"]',
    '["No authentication required — works immediately"]',
    '[{"label":"DeepWiki by Devin MCP Server","url":"https://mcp.deepwiki.com/sse"}]',
    'https://icons.duckduckgo.com/ip3/deepwiki.com.ico'
  ),
  (
    'Exa Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Exa agent connected via the Exa MCP at https://mcp.exa.ai/mcp. Web search + code docs search engine for AIs. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":5,"hair":0,"shirt":4,"pants":1,"accessory":0,"accent":0,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.exa.ai/mcp","name":"exa","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://dashboard.exa.ai/api-keys"}]}',
    'Exa Agent — connected to Exa via MCP (API Key required).

Search Engine made for AIs by Exa. Agents can perform web searches, find code documentation, and retrieve relevant content with high precision.

This agent can:
• Access Exa data and capabilities via MCP
• Search and retrieve information

To connect: Get your API Key at https://dashboard.exa.ai/api-keys',
    'Exa agent — Web search + code docs search engine for AIs. (API Key)',
    'exa,exa,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Exa data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["API Key (https://dashboard.exa.ai/api-keys)"]',
    '[{"label":"Exa MCP Server","url":"https://mcp.exa.ai/mcp"},{"label":"Get your API Key","url":"https://dashboard.exa.ai/api-keys"}]',
    'https://icons.duckduckgo.com/ip3/exa.ai.ico'
  ),
  (
    'Sentry Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Sentry agent connected via the Sentry MCP at https://mcp.sentry.dev/mcp. Search, query, and debug errors intelligently. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":0,"hair":1,"shirt":9,"pants":1,"accessory":4,"accent":8,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.sentry.dev/mcp","name":"sentry","authType":"apikey","keyLabel":"Auth Token","keyPlaceholder":"sntrys_...","keyHelpUrl":"https://sentry.io/settings/auth-tokens/"}]}',
    'Sentry Agent — connected to Sentry via MCP (Auth Token required).

Integrates with Sentry to enable agents to search, query, and debug errors. Agents can investigate issues, trace errors, and analyze performance metrics.

This agent can:
• Access Sentry data and capabilities via MCP
• Search and retrieve information

To connect: Get your Auth Token at https://sentry.io/settings/auth-tokens/',
    'Sentry agent — Search, query, and debug errors intelligently. (Auth Token)',
    'sentry,sentry,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Sentry data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["Auth Token (https://sentry.io/settings/auth-tokens/)"]',
    '[{"label":"Sentry MCP Server","url":"https://mcp.sentry.dev/mcp"},{"label":"Get your Auth Token","url":"https://sentry.io/settings/auth-tokens/"}]',
    'https://icons.duckduckgo.com/ip3/sentry.dev.ico'
  ),
  (
    'PostHog Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a PostHog agent connected via the PostHog MCP at https://mcp.posthog.com/mcp. Product analytics, flags, insights. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":4,"hair":3,"shirt":12,"pants":1,"accessory":3,"accent":7,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.posthog.com/mcp","name":"posthog","authType":"apikey","keyLabel":"Personal API Key","keyPlaceholder":"phx_...","keyHelpUrl":"https://us.posthog.com/settings/user-api-keys"}]}',
    'PostHog Agent — connected to PostHog via MCP (Personal API Key required).

Query and explore product analytics, feature flags, and user insights in PostHog. Agents can analyze funnels, retention, and user behavior data.

This agent can:
• Access PostHog data and capabilities via MCP
• Automate PostHog workflows from conversation

To connect: Get your Personal API Key at https://us.posthog.com/settings/user-api-keys',
    'PostHog agent — Product analytics, flags, insights. (Personal API Key)',
    'posthog,posthog,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access PostHog data and capabilities via MCP","Automate PostHog workflows from conversation"]',
    '["Data & Analytics"]',
    '["Personal API Key (https://us.posthog.com/settings/user-api-keys)"]',
    '[{"label":"PostHog MCP Server","url":"https://mcp.posthog.com/mcp"},{"label":"Get your Personal API Key","url":"https://us.posthog.com/settings/user-api-keys"}]',
    'https://icons.duckduckgo.com/ip3/posthog.com.ico'
  ),
  (
    'Shopify Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Shopify agent connected via the Shopify MCP at https://setup.shopify.com/mcp. Build, manage, and analyze your Shopify store. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":2,"shirt":3,"pants":2,"accessory":3,"accent":1,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://setup.shopify.com/mcp","name":"shopify","authType":"oauth"}]}',
    'Shopify Agent — connected to Shopify via MCP (OAuth).

Manage your Shopify store — products, orders, customers, inventory, and analytics. Agents can update product listings, process orders, and analyze sales data.

This agent can:
• Access Shopify data and capabilities via MCP
• Create and manage resources
• Analyze data and generate insights

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Shopify agent — Build, manage, and analyze your Shopify store. (OAuth)',
    'shopify,shopify,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Shopify data and capabilities via MCP","Create and manage resources","Analyze data and generate insights"]',
    '["Business"]',
    '["Shopify account (OAuth connection required)"]',
    '[{"label":"Shopify MCP Server","url":"https://setup.shopify.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/shopify.com.ico'
  ),
  (
    'Zapier Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Zapier agent connected via the Zapier MCP at https://mcp.zapier.com/api/v1/connect. Actions across 8,000+ apps. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":7,"shirt":6,"pants":2,"accessory":1,"accent":2,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.zapier.com/api/v1/connect","name":"zapier","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://developer.zapier.com/api/v1/docs/"}]}',
    'Zapier Agent — connected to Zapier via MCP (API Key required).

Connect AI agents to Zapier''s ecosystem of 8,000+ app integrations. Agents can create, trigger, and manage automated workflows across countless services.

This agent can:
• Access Zapier data and capabilities via MCP
• Automate Zapier workflows from conversation

To connect: Get your API Key at https://developer.zapier.com/api/v1/docs/',
    'Zapier agent — Actions across 8,000+ apps. (API Key)',
    'zapier,zapier,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Zapier data and capabilities via MCP","Automate Zapier workflows from conversation"]',
    '["AI & ML"]',
    '["API Key (https://developer.zapier.com/api/v1/docs/)"]',
    '[{"label":"Zapier MCP Server","url":"https://mcp.zapier.com/api/v1/connect"},{"label":"Get your API Key","url":"https://developer.zapier.com/api/v1/docs/"}]',
    'https://icons.duckduckgo.com/ip3/zapier.com.ico'
  ),
  (
    'Zoom Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Zoom agent connected via the Zoom MCP at https://mcp.zoom.us/mcp/zoom/streamable. Meetings, recordings, summaries. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":0,"hair":6,"shirt":2,"pants":1,"accessory":0,"accent":2,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.zoom.us/mcp/zoom/streamable","name":"zoom","authType":"oauth"}]}',
    'Zoom Agent — connected to Zoom via MCP (OAuth).

Manage Zoom meetings, recordings, and summaries. Agents can schedule meetings, retrieve transcripts, and access meeting analytics.

This agent can:
• Access Zoom data and capabilities via MCP
• Automate Zoom workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Zoom agent — Meetings, recordings, summaries. (OAuth)',
    'zoom,zoom,mcp,Communication',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Zoom data and capabilities via MCP","Automate Zoom workflows from conversation"]',
    '["Communication"]',
    '["Zoom account (OAuth connection required)"]',
    '[{"label":"Zoom MCP Server","url":"https://mcp.zoom.us/mcp/zoom/streamable"}]',
    'https://icons.duckduckgo.com/ip3/zoom.us.ico'
  ),
  (
    'Twilio Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Twilio agent connected via the Twilio MCP at https://mcp.twilio.com/docs. Build communications and customer engagement. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":0,"hair":3,"shirt":4,"pants":1,"accessory":0,"accent":2,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.twilio.com/docs","name":"twilio","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"SK...","keyHelpUrl":"https://console.twilio.com/us1/account/keys"}]}',
    'Twilio Agent — connected to Twilio via MCP (API Key required).

Integrate with Twilio''s communications platform. Agents can send SMS, make calls, manage phone numbers, and build customer engagement workflows.

This agent can:
• Access Twilio data and capabilities via MCP
• Automate Twilio workflows from conversation

To connect: Get your API Key at https://console.twilio.com/us1/account/keys',
    'Twilio agent — Build communications and customer engagement. (API Key)',
    'twilio,twilio,mcp,Communication',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Twilio data and capabilities via MCP","Automate Twilio workflows from conversation"]',
    '["Communication"]',
    '["API Key (https://console.twilio.com/us1/account/keys)"]',
    '[{"label":"Twilio MCP Server","url":"https://mcp.twilio.com/docs"},{"label":"Get your API Key","url":"https://console.twilio.com/us1/account/keys"}]',
    'https://icons.duckduckgo.com/ip3/twilio.com.ico'
  ),
  (
    'PayPal Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a PayPal agent connected via the PayPal MCP at https://mcp.paypal.com/mcp. Access PayPal payments platform. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":4,"hair":0,"shirt":1,"pants":0,"accessory":4,"accent":0,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.paypal.com/mcp","name":"paypal","authType":"oauth"}]}',
    'PayPal Agent — connected to PayPal via MCP (OAuth).

Integrate with PayPal''s payments platform. Agents can create orders, process payments, manage transactions, and query payment history.

This agent can:
• Access PayPal data and capabilities via MCP
• Automate PayPal workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'PayPal agent — Access PayPal payments platform. (OAuth)',
    'paypal,paypal,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access PayPal data and capabilities via MCP","Automate PayPal workflows from conversation"]',
    '["Finance"]',
    '["PayPal account (OAuth connection required)"]',
    '[{"label":"PayPal MCP Server","url":"https://mcp.paypal.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/paypal.com.ico'
  ),
  (
    'Webflow Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Webflow agent connected via the Webflow MCP at https://mcp.webflow.com/mcp. Sites, CMS, publishing. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":6,"hair":4,"shirt":9,"pants":2,"accessory":4,"accent":4,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.webflow.com/mcp","name":"webflow","authType":"apikey","keyLabel":"Access Token","keyPlaceholder":"Paste access token...","keyHelpUrl":"https://developers.webflow.com/data/docs/access-tokens"}]}',
    'Webflow Agent — connected to Webflow via MCP (Access Token required).

Manage Webflow sites, CMS collections, and publishing. Agents can update content, publish changes, and manage site structure.

This agent can:
• Access Webflow data and capabilities via MCP
• Automate Webflow workflows from conversation

To connect: Get your Access Token at https://developers.webflow.com/data/docs/access-tokens',
    'Webflow agent — Sites, CMS, publishing. (Access Token)',
    'webflow,webflow,mcp,Design',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Webflow data and capabilities via MCP","Automate Webflow workflows from conversation"]',
    '["Design"]',
    '["Access Token (https://developers.webflow.com/data/docs/access-tokens)"]',
    '[{"label":"Webflow MCP Server","url":"https://mcp.webflow.com/mcp"},{"label":"Get your Access Token","url":"https://developers.webflow.com/data/docs/access-tokens"}]',
    'https://icons.duckduckgo.com/ip3/webflow.com.ico'
  ),
  (
    'Netlify Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Netlify agent connected via the Netlify MCP at https://netlify-mcp.netlify.app/mcp. Create, deploy, manage, and secure websites. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":1,"shirt":7,"pants":0,"accessory":3,"accent":9,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://netlify-mcp.netlify.app/mcp","name":"netlify","authType":"apikey","keyLabel":"Access Token","keyPlaceholder":"nfp_...","keyHelpUrl":"https://app.netlify.com/user/applications"}]}',
    'Netlify Agent — connected to Netlify via MCP (Access Token required).

Manage Netlify sites, deployments, and configuration. Agents can deploy sites, check build status, manage environment variables, and configure domains.

This agent can:
• Access Netlify data and capabilities via MCP
• Create and manage resources

To connect: Get your Access Token at https://app.netlify.com/user/applications',
    'Netlify agent — Create, deploy, manage, and secure websites. (Access Token)',
    'netlify,netlify,mcp,Infrastructure',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Netlify data and capabilities via MCP","Create and manage resources"]',
    '["Infrastructure"]',
    '["Access Token (https://app.netlify.com/user/applications)"]',
    '[{"label":"Netlify MCP Server","url":"https://netlify-mcp.netlify.app/mcp"},{"label":"Get your Access Token","url":"https://app.netlify.com/user/applications"}]',
    'https://icons.duckduckgo.com/ip3/netlify.app.ico'
  ),
  (
    'Airtable Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Airtable agent connected via the Airtable MCP at https://mcp.airtable.com/mcp. Bring your structured data to AI agents. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":5,"hair":1,"shirt":2,"pants":1,"accessory":3,"accent":4,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.airtable.com/mcp","name":"airtable","authType":"oauth"}]}',
    'Airtable Agent — connected to Airtable via MCP (OAuth).

Access Airtable bases, tables, and records. Agents can query data, create records, update fields, and manage structured data across your organization.

This agent can:
• Access Airtable data and capabilities via MCP
• Automate Airtable workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Airtable agent — Bring your structured data to AI agents. (OAuth)',
    'airtable,airtable,mcp,Productivity',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Airtable data and capabilities via MCP","Automate Airtable workflows from conversation"]',
    '["Productivity"]',
    '["Airtable account (OAuth connection required)"]',
    '[{"label":"Airtable MCP Server","url":"https://mcp.airtable.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/airtable.com.ico'
  ),
  (
    'ClickUp Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a ClickUp agent connected via the ClickUp MCP at https://mcp.clickup.com/mcp. Project management & collaboration for teams & agents. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":6,"hair":1,"shirt":3,"pants":1,"accessory":4,"accent":0,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.clickup.com/mcp","name":"clickup","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"pk_...","keyHelpUrl":"https://app.clickup.com/settings/apps"}]}',
    'ClickUp Agent — connected to ClickUp via MCP (API Key required).

Manage projects, tasks, and workflows in ClickUp. Agents can create tasks, update statuses, manage sprints, and track team productivity.

This agent can:
• Access ClickUp data and capabilities via MCP
• Create and manage resources

To connect: Get your API Key at https://app.clickup.com/settings/apps',
    'ClickUp agent — Project management & collaboration for teams & agents. (API Key)',
    'clickup,clickup,mcp,Productivity',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access ClickUp data and capabilities via MCP","Create and manage resources"]',
    '["Productivity"]',
    '["API Key (https://app.clickup.com/settings/apps)"]',
    '[{"label":"ClickUp MCP Server","url":"https://mcp.clickup.com/mcp"},{"label":"Get your API Key","url":"https://app.clickup.com/settings/apps"}]',
    'https://icons.duckduckgo.com/ip3/clickup.com.ico'
  ),
  (
    'Calendly Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Calendly agent connected via the Calendly MCP at https://mcp.calendly.com. Scheduling, events, availability. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":6,"hair":3,"shirt":0,"pants":0,"accessory":0,"accent":8,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.calendly.com","name":"calendly","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://calendly.com/integrations/api_webhooks"}]}',
    'Calendly Agent — connected to Calendly via MCP (API Key required).

Manage Calendly scheduling, events, and availability. Agents can create meeting types, check availability, and schedule appointments.

This agent can:
• Access Calendly data and capabilities via MCP
• Automate Calendly workflows from conversation

To connect: Get your API Key at https://calendly.com/integrations/api_webhooks',
    'Calendly agent — Scheduling, events, availability. (API Key)',
    'calendly,calendly,mcp,Productivity',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Calendly data and capabilities via MCP","Automate Calendly workflows from conversation"]',
    '["Productivity"]',
    '["API Key (https://calendly.com/integrations/api_webhooks)"]',
    '[{"label":"Calendly MCP Server","url":"https://mcp.calendly.com"},{"label":"Get your API Key","url":"https://calendly.com/integrations/api_webhooks"}]',
    'https://icons.duckduckgo.com/ip3/calendly.com.ico'
  ),
  (
    'Cal.com Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Cal.com agent connected via the Cal.com MCP at https://mcp.cal.com/sse. Connect AI clients to Cal.com scheduling. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":5,"hair":0,"shirt":5,"pants":1,"accessory":5,"accent":11,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.cal.com/sse","name":"cal-com","authType":"oauth"}]}',
    'Cal.com Agent — connected to Cal.com via MCP (OAuth).

Connect to Cal.com scheduling through the Model Context Protocol. Agents can manage events, check availability, and book meetings.

This agent can:
• Access Cal.com data and capabilities via MCP
• Automate Cal.com workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Cal.com agent — Connect AI clients to Cal.com scheduling. (OAuth)',
    'cal-com,cal.com,mcp,Productivity',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Cal.com data and capabilities via MCP","Automate Cal.com workflows from conversation"]',
    '["Productivity"]',
    '["Cal.com account (OAuth connection required)"]',
    '[{"label":"Cal.com MCP Server","url":"https://mcp.cal.com/sse"}]',
    'https://icons.duckduckgo.com/ip3/cal.com.ico'
  ),
  (
    'Hugging Face Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Hugging Face agent connected via the Hugging Face MCP at https://huggingface.co/mcp/sse. Access the HF Hub and thousands of Gradio Apps. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":0,"hair":0,"shirt":6,"pants":1,"accessory":0,"accent":12,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://huggingface.co/mcp/sse","name":"hugging-face","authType":"apikey","keyLabel":"Access Token","keyPlaceholder":"hf_...","keyHelpUrl":"https://huggingface.co/settings/tokens"}]}',
    'Hugging Face Agent — connected to Hugging Face via MCP (Access Token required).

Access the Hugging Face Hub — models, datasets, spaces, and thousands of Gradio apps. Agents can search models, run inference, and explore ML resources.

This agent can:
• Access Hugging Face data and capabilities via MCP
• Automate Hugging Face workflows from conversation

To connect: Get your Access Token at https://huggingface.co/settings/tokens',
    'Hugging Face agent — Access the HF Hub and thousands of Gradio Apps. (Access Token)',
    'hugging-face,hugging face,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Hugging Face data and capabilities via MCP","Automate Hugging Face workflows from conversation"]',
    '["AI & ML"]',
    '["Access Token (https://huggingface.co/settings/tokens)"]',
    '[{"label":"Hugging Face MCP Server","url":"https://huggingface.co/mcp/sse"},{"label":"Get your Access Token","url":"https://huggingface.co/settings/tokens"}]',
    'https://icons.duckduckgo.com/ip3/huggingface.co.ico'
  ),
  (
    'OpenRouter Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a OpenRouter agent connected via the OpenRouter MCP at https://mcp.openrouter.ai/sse. Models, pricing, credits, test prompts. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":0,"shirt":1,"pants":2,"accessory":1,"accent":10,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.openrouter.ai/sse","name":"openrouter","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"sk-or-...","keyHelpUrl":"https://openrouter.ai/keys"}]}',
    'OpenRouter Agent — connected to OpenRouter via MCP (API Key required).

Access OpenRouter''s model marketplace. Agents can query available models, check pricing, manage credits, and run test prompts across multiple LLM providers.

This agent can:
• Access OpenRouter data and capabilities via MCP
• Automate OpenRouter workflows from conversation

To connect: Get your API Key at https://openrouter.ai/keys',
    'OpenRouter agent — Models, pricing, credits, test prompts. (API Key)',
    'openrouter,openrouter,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access OpenRouter data and capabilities via MCP","Automate OpenRouter workflows from conversation"]',
    '["AI & ML"]',
    '["API Key (https://openrouter.ai/keys)"]',
    '[{"label":"OpenRouter MCP Server","url":"https://mcp.openrouter.ai/sse"},{"label":"Get your API Key","url":"https://openrouter.ai/keys"}]',
    'https://icons.duckduckgo.com/ip3/openrouter.ai.ico'
  ),
  (
    'Postman Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Postman agent connected via the Postman MCP at https://mcp.postman.com/minimal. Give API context to your coding agents. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":2,"shirt":8,"pants":1,"accessory":2,"accent":7,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.postman.com/minimal","name":"postman","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"PMAK-...","keyHelpUrl":"https://postman.postman.co/settings/me/api-keys"}]}',
    'Postman Agent — connected to Postman via MCP (API Key required).

Access Postman collections, environments, and API definitions. Agents can inspect API specs, run requests, and manage test suites.

This agent can:
• Access Postman data and capabilities via MCP
• Automate Postman workflows from conversation

To connect: Get your API Key at https://postman.postman.co/settings/me/api-keys',
    'Postman agent — Give API context to your coding agents. (API Key)',
    'postman,postman,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Postman data and capabilities via MCP","Automate Postman workflows from conversation"]',
    '["Development"]',
    '["API Key (https://postman.postman.co/settings/me/api-keys)"]',
    '[{"label":"Postman MCP Server","url":"https://mcp.postman.com/minimal"},{"label":"Get your API Key","url":"https://postman.postman.co/settings/me/api-keys"}]',
    'https://icons.duckduckgo.com/ip3/postman.com.ico'
  ),
  (
    'Miro Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Miro agent connected via the Miro MCP at https://mcp.miro.com/. Access and create new content on Miro boards. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":6,"shirt":1,"pants":1,"accessory":0,"accent":12,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.miro.com/","name":"miro","authType":"oauth"}]}',
    'Miro Agent — connected to Miro via MCP (OAuth).

Access and create content on Miro whiteboards. Agents can read board content, create sticky notes, and manage visual collaboration spaces.

This agent can:
• Access Miro data and capabilities via MCP
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Miro agent — Access and create new content on Miro boards. (OAuth)',
    'miro,miro,mcp,Design',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Miro data and capabilities via MCP","Create and manage resources"]',
    '["Design"]',
    '["Miro account (OAuth connection required)"]',
    '[{"label":"Miro MCP Server","url":"https://mcp.miro.com/"}]',
    'https://icons.duckduckgo.com/ip3/miro.com.ico'
  ),
  (
    'Lucid Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Lucid agent connected via the Lucid MCP at https://mcp.lucid.app/mcp. Ideate, diagram, and align teams. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":6,"hair":4,"shirt":12,"pants":0,"accessory":0,"accent":8,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.lucid.app/mcp","name":"lucid","authType":"oauth"}]}',
    'Lucid Agent — connected to Lucid via MCP (OAuth).

Create and manage diagrams in Lucid. Agents can generate flowcharts, organizational charts, and visual documentation to align teams.

This agent can:
• Access Lucid data and capabilities via MCP
• Automate Lucid workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Lucid agent — Ideate, diagram, and align teams. (OAuth)',
    'lucid,lucid,mcp,Design',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Lucid data and capabilities via MCP","Automate Lucid workflows from conversation"]',
    '["Design"]',
    '["Lucid account (OAuth connection required)"]',
    '[{"label":"Lucid MCP Server","url":"https://mcp.lucid.app/mcp"}]',
    'https://icons.duckduckgo.com/ip3/lucid.app.ico'
  ),
  (
    'tldraw Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a tldraw agent connected via the tldraw MCP at https://tldraw-mcp-app.tldraw.workers.dev/mcp. Diagrams and whiteboards. No authentication is required for this MCP server. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":2,"shirt":12,"pants":1,"accessory":5,"accent":3,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://tldraw-mcp-app.tldraw.workers.dev/mcp","name":"tldraw"}]}',
    'tldraw Agent — connected to tldraw via MCP (no auth required).

Create and manage diagrams and whiteboards in tldraw. Agents can generate visual content, manipulate shapes, and collaborate on drawings.

This agent can:
• Access tldraw data and capabilities via MCP
• Automate tldraw workflows from conversation

No authentication required — works immediately.',
    'tldraw agent — Diagrams and whiteboards. (no auth)',
    'tldraw,tldraw,mcp,Design',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access tldraw data and capabilities via MCP","Automate tldraw workflows from conversation"]',
    '["Design"]',
    '["No authentication required — works immediately"]',
    '[{"label":"tldraw MCP Server","url":"https://tldraw-mcp-app.tldraw.workers.dev/mcp"}]',
    'https://icons.duckduckgo.com/ip3/workers.dev.ico'
  ),
  (
    'Mermaid Chart Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Mermaid Chart agent connected via the Mermaid Chart MCP at https://mcp.mermaid.ai/mcp. Validates Mermaid syntax, renders diagrams as SVG. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":5,"hair":3,"shirt":2,"pants":1,"accessory":2,"accent":12,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.mermaid.ai/mcp","name":"mermaid-chart","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://www.mermaidchart.com/app/settings/api-keys"}]}',
    'Mermaid Chart Agent — connected to Mermaid Chart via MCP (API Key required).

Validates Mermaid syntax, renders diagrams as high-quality SVG, and displays them in an interactive UI. Agents can create and iterate on diagram code.

This agent can:
• Access Mermaid Chart data and capabilities via MCP
• Automate Mermaid Chart workflows from conversation

To connect: Get your API Key at https://www.mermaidchart.com/app/settings/api-keys',
    'Mermaid Chart agent — Validates Mermaid syntax, renders diagrams as SVG. (API Key)',
    'mermaid-chart,mermaid chart,mcp,Design',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Mermaid Chart data and capabilities via MCP","Automate Mermaid Chart workflows from conversation"]',
    '["Design"]',
    '["API Key (https://www.mermaidchart.com/app/settings/api-keys)"]',
    '[{"label":"Mermaid Chart MCP Server","url":"https://mcp.mermaid.ai/mcp"},{"label":"Get your API Key","url":"https://www.mermaidchart.com/app/settings/api-keys"}]',
    'https://icons.duckduckgo.com/ip3/mermaid.ai.ico'
  ),
  (
    'Strava Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Strava agent connected via the Strava MCP at https://mcp.strava.com/mcp. Activities, fitness trends, training load, and goals. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":0,"shirt":11,"pants":0,"accessory":4,"accent":6,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.strava.com/mcp","name":"strava","authType":"oauth"}]}',
    'Strava Agent — connected to Strava via MCP (OAuth).

Access Strava activities, fitness trends, training load, and goals. Agents can query workout data, analyze performance, and track fitness progress.

This agent can:
• Access Strava data and capabilities via MCP
• Automate Strava workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Strava agent — Activities, fitness trends, training load, and goals. (OAuth)',
    'strava,strava,mcp,Lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Strava data and capabilities via MCP","Automate Strava workflows from conversation"]',
    '["Lifestyle"]',
    '["Strava account (OAuth connection required)"]',
    '[{"label":"Strava MCP Server","url":"https://mcp.strava.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/strava.com.ico'
  ),
  (
    'Uber Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Uber agent connected via the Uber MCP at https://mcp.uber.com/claude/rides-3p/mcp. Get Uber price & time estimates for any ride option. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":7,"shirt":7,"pants":0,"accessory":2,"accent":1,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.uber.com/claude/rides-3p/mcp","name":"uber","authType":"oauth"}]}',
    'Uber Agent — connected to Uber via MCP (OAuth).

Access Uber ride estimates, pricing, and timing. Agents can query ride options, estimate costs, and check availability for any location.

This agent can:
• Access Uber data and capabilities via MCP
• Automate Uber workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Uber agent — Get Uber price & time estimates for any ride option. (OAuth)',
    'uber,uber,mcp,Lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Uber data and capabilities via MCP","Automate Uber workflows from conversation"]',
    '["Lifestyle"]',
    '["Uber account (OAuth connection required)"]',
    '[{"label":"Uber MCP Server","url":"https://mcp.uber.com/claude/rides-3p/mcp"}]',
    'https://icons.duckduckgo.com/ip3/uber.com.ico'
  ),
  (
    'Instacart Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Instacart agent connected via the Instacart MCP at https://fig-mcp.instacart.com/mcp. Groceries and more delivered as fast as 30 minutes. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":0,"hair":3,"shirt":4,"pants":1,"accessory":3,"accent":11,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://fig-mcp.instacart.com/mcp","name":"instacart","authType":"oauth"}]}',
    'Instacart Agent — connected to Instacart via MCP (OAuth).

Access Instacart''s grocery delivery platform. Agents can search products, create shopping lists, and place delivery orders.

This agent can:
• Access Instacart data and capabilities via MCP
• Automate Instacart workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Instacart agent — Groceries and more delivered as fast as 30 minutes. (OAuth)',
    'instacart,instacart,mcp,Lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Instacart data and capabilities via MCP","Automate Instacart workflows from conversation"]',
    '["Lifestyle"]',
    '["Instacart account (OAuth connection required)"]',
    '[{"label":"Instacart MCP Server","url":"https://fig-mcp.instacart.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/instacart.com.ico'
  ),
  (
    'DoorDash Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a DoorDash agent connected via the DoorDash MCP at https://openapi.doordash.com/mcp/consumer. Food delivery & reservations. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":4,"hair":2,"shirt":6,"pants":0,"accessory":4,"accent":7,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://openapi.doordash.com/mcp/consumer","name":"doordash","authType":"oauth"}]}',
    'DoorDash Agent — connected to DoorDash via MCP (OAuth).

Access DoorDash food delivery and restaurant reservations. Agents can search restaurants, place orders, and track deliveries.

This agent can:
• Access DoorDash data and capabilities via MCP
• Automate DoorDash workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'DoorDash agent — Food delivery & reservations. (OAuth)',
    'doordash,doordash,mcp,Lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access DoorDash data and capabilities via MCP","Automate DoorDash workflows from conversation"]',
    '["Lifestyle"]',
    '["DoorDash account (OAuth connection required)"]',
    '[{"label":"DoorDash MCP Server","url":"https://openapi.doordash.com/mcp/consumer"}]',
    'https://icons.duckduckgo.com/ip3/doordash.com.ico'
  ),
  (
    'Intercom Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Intercom agent connected via the Intercom MCP at https://mcp.intercom.com/mcp. AI access to Intercom data for customer insights. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":1,"shirt":5,"pants":1,"accessory":2,"accent":9,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.intercom.com/mcp","name":"intercom","authType":"apikey","keyLabel":"Access Token","keyPlaceholder":"dGsk_...","keyHelpUrl":"https://developers.intercom.com/docs/references/authentication/"}]}',
    'Intercom Agent — connected to Intercom via MCP (Access Token required).

Access Intercom customer support data. Agents can search conversations, manage tickets, query customer profiles, and analyze support metrics.

This agent can:
• Access Intercom data and capabilities via MCP
• Automate Intercom workflows from conversation

To connect: Get your Access Token at https://developers.intercom.com/docs/references/authentication/',
    'Intercom agent — AI access to Intercom data for customer insights. (Access Token)',
    'intercom,intercom,mcp,Communication',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Intercom data and capabilities via MCP","Automate Intercom workflows from conversation"]',
    '["Communication"]',
    '["Access Token (https://developers.intercom.com/docs/references/authentication/)"]',
    '[{"label":"Intercom MCP Server","url":"https://mcp.intercom.com/mcp"},{"label":"Get your Access Token","url":"https://developers.intercom.com/docs/references/authentication/"}]',
    'https://icons.duckduckgo.com/ip3/intercom.com.ico'
  ),
  (
    'PagerDuty Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a PagerDuty agent connected via the PagerDuty MCP at https://mcp.pagerduty.com/mcp. Incidents, schedules, on-call. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":0,"hair":0,"shirt":4,"pants":2,"accessory":0,"accent":9,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.pagerduty.com/mcp","name":"pagerduty","authType":"apikey","keyLabel":"API Token","keyPlaceholder":"y_Nb...","keyHelpUrl":"https://support.pagerduty.com/docs/generating-api-keys"}]}',
    'PagerDuty Agent — connected to PagerDuty via MCP (API Token required).

Manage PagerDuty incidents, schedules, and on-call rotations. Agents can query active incidents, manage schedules, and acknowledge alerts.

This agent can:
• Access PagerDuty data and capabilities via MCP
• Automate PagerDuty workflows from conversation

To connect: Get your API Token at https://support.pagerduty.com/docs/generating-api-keys',
    'PagerDuty agent — Incidents, schedules, on-call. (API Token)',
    'pagerduty,pagerduty,mcp,Infrastructure',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access PagerDuty data and capabilities via MCP","Automate PagerDuty workflows from conversation"]',
    '["Infrastructure"]',
    '["API Token (https://support.pagerduty.com/docs/generating-api-keys)"]',
    '[{"label":"PagerDuty MCP Server","url":"https://mcp.pagerduty.com/mcp"},{"label":"Get your API Token","url":"https://support.pagerduty.com/docs/generating-api-keys"}]',
    'https://icons.duckduckgo.com/ip3/pagerduty.com.ico'
  ),
  (
    'incident.io Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a incident.io agent connected via the incident.io MCP at https://mcp.incident.io/mcp. Incidents, on-call, follow-ups. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":0,"hair":0,"shirt":11,"pants":1,"accessory":1,"accent":10,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.incident.io/mcp","name":"incident-io","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"inc_...","keyHelpUrl":"https://api-docs.incident.io/"}]}',
    'incident.io Agent — connected to incident.io via MCP (API Key required).

Manage incidents, on-call schedules, and follow-ups in incident.io. Agents can declare incidents, assign roles, and track resolution progress.

This agent can:
• Access incident.io data and capabilities via MCP
• Automate incident.io workflows from conversation

To connect: Get your API Key at https://api-docs.incident.io/',
    'incident.io agent — Incidents, on-call, follow-ups. (API Key)',
    'incident-io,incident.io,mcp,Infrastructure',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access incident.io data and capabilities via MCP","Automate incident.io workflows from conversation"]',
    '["Infrastructure"]',
    '["API Key (https://api-docs.incident.io/)"]',
    '[{"label":"incident.io MCP Server","url":"https://mcp.incident.io/mcp"},{"label":"Get your API Key","url":"https://api-docs.incident.io/"}]',
    'https://icons.duckduckgo.com/ip3/incident.io.ico'
  ),
  (
    'Honeycomb Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Honeycomb agent connected via the Honeycomb MCP at https://mcp.honeycomb.io/mcp. Query and explore observability data and SLOs. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":1,"hair":2,"shirt":12,"pants":0,"accessory":4,"accent":10,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.honeycomb.io/mcp","name":"honeycomb","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://docs.honeycomb.io/manage-api-keys/"}]}',
    'Honeycomb Agent — connected to Honeycomb via MCP (API Key required).

Query and explore observability data, traces, and SLOs in Honeycomb. Agents can run queries, analyze performance, and investigate anomalies.

This agent can:
• Access Honeycomb data and capabilities via MCP
• Automate Honeycomb workflows from conversation

To connect: Get your API Key at https://docs.honeycomb.io/manage-api-keys/',
    'Honeycomb agent — Query and explore observability data and SLOs. (API Key)',
    'honeycomb,honeycomb,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Honeycomb data and capabilities via MCP","Automate Honeycomb workflows from conversation"]',
    '["Data & Analytics"]',
    '["API Key (https://docs.honeycomb.io/manage-api-keys/)"]',
    '[{"label":"Honeycomb MCP Server","url":"https://mcp.honeycomb.io/mcp"},{"label":"Get your API Key","url":"https://docs.honeycomb.io/manage-api-keys/"}]',
    'https://icons.duckduckgo.com/ip3/honeycomb.io.ico'
  ),
  (
    'Mixpanel Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Mixpanel agent connected via the Mixpanel MCP at https://mcp.mixpanel.com/mcp. Analyze, query, and manage your Mixpanel data. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":4,"hair":6,"shirt":2,"pants":2,"accessory":4,"accent":0,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.mixpanel.com/mcp","name":"mixpanel","authType":"apikey","keyLabel":"Service Account","keyPlaceholder":"Paste service account...","keyHelpUrl":"https://mixpanel.com/settings/project#service-accounts"}]}',
    'Mixpanel Agent — connected to Mixpanel via MCP (Service Account required).

Analyze product analytics data in Mixpanel. Agents can run queries, create funnels, track events, and analyze user behavior patterns.

This agent can:
• Access Mixpanel data and capabilities via MCP
• Create and manage resources
• Analyze data and generate insights

To connect: Get your Service Account at https://mixpanel.com/settings/project#service-accounts',
    'Mixpanel agent — Analyze, query, and manage your Mixpanel data. (Service Account)',
    'mixpanel,mixpanel,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Mixpanel data and capabilities via MCP","Create and manage resources","Analyze data and generate insights"]',
    '["Data & Analytics"]',
    '["Service Account (https://mixpanel.com/settings/project#service-accounts)"]',
    '[{"label":"Mixpanel MCP Server","url":"https://mcp.mixpanel.com/mcp"},{"label":"Get your Service Account","url":"https://mixpanel.com/settings/project#service-accounts"}]',
    'https://icons.duckduckgo.com/ip3/mixpanel.com.ico'
  ),
  (
    'Amplitude Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Amplitude agent connected via the Amplitude MCP at https://mcp.amplitude.com/mcp. Give your teams powerful behavioral insights. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":5,"hair":4,"shirt":0,"pants":2,"accessory":4,"accent":6,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.amplitude.com/mcp","name":"amplitude","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://amplitude.com/docs/find-amplitude-api-id-and-key"}]}',
    'Amplitude Agent — connected to Amplitude via MCP (API Key required).

Access Amplitude''s behavioral analytics platform. Agents can query user behavior, analyze funnels, track retention, and generate insights.

This agent can:
• Access Amplitude data and capabilities via MCP
• Automate Amplitude workflows from conversation

To connect: Get your API Key at https://amplitude.com/docs/find-amplitude-api-id-and-key',
    'Amplitude agent — Give your teams powerful behavioral insights. (API Key)',
    'amplitude,amplitude,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Amplitude data and capabilities via MCP","Automate Amplitude workflows from conversation"]',
    '["Data & Analytics"]',
    '["API Key (https://amplitude.com/docs/find-amplitude-api-id-and-key)"]',
    '[{"label":"Amplitude MCP Server","url":"https://mcp.amplitude.com/mcp"},{"label":"Get your API Key","url":"https://amplitude.com/docs/find-amplitude-api-id-and-key"}]',
    'https://icons.duckduckgo.com/ip3/amplitude.com.ico'
  ),
  (
    'Ramp Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Ramp agent connected via the Ramp MCP at https://ramp-mcp-remote.ramp.com/mcp. Search, access, and analyze your Ramp financial data. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":5,"hair":0,"shirt":7,"pants":1,"accessory":3,"accent":0,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://ramp-mcp-remote.ramp.com/mcp","name":"ramp","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"sk_ramp_...","keyHelpUrl":"https://docs.ramp.com/developer-api/v1/overview"}]}',
    'Ramp Agent — connected to Ramp via MCP (API Key required).

Access Ramp''s corporate spend management platform. Agents can query transactions, analyze expenses, manage cards, and track spend patterns.

This agent can:
• Access Ramp data and capabilities via MCP
• Search and retrieve information
• Analyze data and generate insights

To connect: Get your API Key at https://docs.ramp.com/developer-api/v1/overview',
    'Ramp agent — Search, access, and analyze your Ramp financial data. (API Key)',
    'ramp,ramp,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Ramp data and capabilities via MCP","Search and retrieve information","Analyze data and generate insights"]',
    '["Finance"]',
    '["API Key (https://docs.ramp.com/developer-api/v1/overview)"]',
    '[{"label":"Ramp MCP Server","url":"https://ramp-mcp-remote.ramp.com/mcp"},{"label":"Get your API Key","url":"https://docs.ramp.com/developer-api/v1/overview"}]',
    'https://icons.duckduckgo.com/ip3/ramp.com.ico'
  ),
  (
    'Xero Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Xero agent connected via the Xero MCP at https://mcp.xero.com/mcp. Access your Xero financials from any conversation. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":7,"shirt":5,"pants":0,"accessory":2,"accent":2,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.xero.com/mcp","name":"xero","authType":"oauth"}]}',
    'Xero Agent — connected to Xero via MCP (OAuth).

Access Xero''s accounting platform. Agents can query financial data, manage invoices, track bank transactions, and handle business accounting.

This agent can:
• Access Xero data and capabilities via MCP
• Automate Xero workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Xero agent — Access your Xero financials from any conversation. (OAuth)',
    'xero,xero,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Xero data and capabilities via MCP","Automate Xero workflows from conversation"]',
    '["Finance"]',
    '["Xero account (OAuth connection required)"]',
    '[{"label":"Xero MCP Server","url":"https://mcp.xero.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/xero.com.ico'
  ),
  (
    'Apollo.io Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Apollo.io agent connected via the Apollo.io MCP at https://mcp.apollo.io/mcp. Contacts, companies, sales engagement. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":0,"hair":7,"shirt":1,"pants":2,"accessory":1,"accent":12,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.apollo.io/mcp","name":"apollo-io","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://app.apollo.io/settings/integrations/api-key"}]}',
    'Apollo.io Agent — connected to Apollo.io via MCP (API Key required).

Access Apollo.io''s sales intelligence platform. Agents can search contacts, enrich company data, and manage sales engagement sequences.

This agent can:
• Access Apollo.io data and capabilities via MCP
• Automate Apollo.io workflows from conversation

To connect: Get your API Key at https://app.apollo.io/settings/integrations/api-key',
    'Apollo.io agent — Contacts, companies, sales engagement. (API Key)',
    'apollo-io,apollo.io,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Apollo.io data and capabilities via MCP","Automate Apollo.io workflows from conversation"]',
    '["Business"]',
    '["API Key (https://app.apollo.io/settings/integrations/api-key)"]',
    '[{"label":"Apollo.io MCP Server","url":"https://mcp.apollo.io/mcp"},{"label":"Get your API Key","url":"https://app.apollo.io/settings/integrations/api-key"}]',
    'https://icons.duckduckgo.com/ip3/apollo.io.ico'
  ),
  (
    'Attio Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Attio agent connected via the Attio MCP at https://mcp.attio.com/mcp. CRM records, notes, tasks. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":4,"shirt":5,"pants":1,"accessory":3,"accent":8,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.attio.com/mcp","name":"attio","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://developers.attio.com/docs/api-key"}]}',
    'Attio Agent — connected to Attio via MCP (API Key required).

Access Attio''s CRM platform. Agents can manage records, create notes, assign tasks, and query customer relationship data.

This agent can:
• Access Attio data and capabilities via MCP
• Automate Attio workflows from conversation

To connect: Get your API Key at https://developers.attio.com/docs/api-key',
    'Attio agent — CRM records, notes, tasks. (API Key)',
    'attio,attio,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Attio data and capabilities via MCP","Automate Attio workflows from conversation"]',
    '["Business"]',
    '["API Key (https://developers.attio.com/docs/api-key)"]',
    '[{"label":"Attio MCP Server","url":"https://mcp.attio.com/mcp"},{"label":"Get your API Key","url":"https://developers.attio.com/docs/api-key"}]',
    'https://icons.duckduckgo.com/ip3/attio.com.ico'
  ),
  (
    'Close Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Close agent connected via the Close MCP at https://mcp.close.com/mcp. CRM leads, calls, pipelines. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":1,"hair":7,"shirt":5,"pants":1,"accessory":5,"accent":7,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.close.com/mcp","name":"close","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://app.close.com/settings/api/"}]}',
    'Close Agent — connected to Close via MCP (API Key required).

Access Close CRM platform. Agents can manage leads, log calls, track pipelines, and automate sales workflows.

This agent can:
• Access Close data and capabilities via MCP
• Automate Close workflows from conversation

To connect: Get your API Key at https://app.close.com/settings/api/',
    'Close agent — CRM leads, calls, pipelines. (API Key)',
    'close,close,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Close data and capabilities via MCP","Automate Close workflows from conversation"]',
    '["Business"]',
    '["API Key (https://app.close.com/settings/api/)"]',
    '[{"label":"Close MCP Server","url":"https://mcp.close.com/mcp"},{"label":"Get your API Key","url":"https://app.close.com/settings/api/"}]',
    'https://icons.duckduckgo.com/ip3/close.com.ico'
  ),
  (
    'DocuSign Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a DocuSign agent connected via the DocuSign MCP at https://mcp.docusign.com/sse. Agreements, envelopes, signing. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":4,"hair":2,"shirt":5,"pants":2,"accessory":4,"accent":10,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.docusign.com/sse","name":"docusing","authType":"oauth"}]}',
    'DocuSign Agent — connected to DocuSign via MCP (OAuth).

Access DocuSign''s e-signature platform. Agents can create envelopes, send for signature, track document status, and manage agreements.

This agent can:
• Access DocuSign data and capabilities via MCP
• Automate DocuSign workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'DocuSign agent — Agreements, envelopes, signing. (OAuth)',
    'docusing,docusign,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access DocuSign data and capabilities via MCP","Automate DocuSign workflows from conversation"]',
    '["Business"]',
    '["DocuSign account (OAuth connection required)"]',
    '[{"label":"DocuSign MCP Server","url":"https://mcp.docusign.com/sse"}]',
    'https://icons.duckduckgo.com/ip3/docusign.com.ico'
  ),
  (
    'Sanity Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Sanity agent connected via the Sanity MCP at https://mcp.sanity.io. Create, query, and manage structured content. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":6,"hair":1,"shirt":11,"pants":0,"accessory":2,"accent":11,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.sanity.io","name":"sanity","authType":"apikey","keyLabel":"API Token","keyPlaceholder":"sk...","keyHelpUrl":"https://www.sanity.io/manage/personal/api-tokens"}]}',
    'Sanity Agent — connected to Sanity via MCP (API Token required).

Access Sanity''s structured content platform. Agents can query content, create documents, manage schemas, and publish content changes.

This agent can:
• Access Sanity data and capabilities via MCP
• Create and manage resources

To connect: Get your API Token at https://www.sanity.io/manage/personal/api-tokens',
    'Sanity agent — Create, query, and manage structured content. (API Token)',
    'sanity,sanity,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Sanity data and capabilities via MCP","Create and manage resources"]',
    '["Business"]',
    '["API Token (https://www.sanity.io/manage/personal/api-tokens)"]',
    '[{"label":"Sanity MCP Server","url":"https://mcp.sanity.io"},{"label":"Get your API Token","url":"https://www.sanity.io/manage/personal/api-tokens"}]',
    'https://icons.duckduckgo.com/ip3/sanity.io.ico'
  ),
  (
    'WordPress.com Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a WordPress.com agent connected via the WordPress.com MCP at https://mcp.wordpress.com/sse. Secure AI access to manage your WordPress.com sites. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":0,"hair":3,"shirt":6,"pants":2,"accessory":4,"accent":7,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.wordpress.com/sse","name":"wordpress","authType":"oauth"}]}',
    'WordPress.com Agent — connected to WordPress.com via MCP (OAuth).

Manage WordPress.com sites. Agents can create posts, manage pages, moderate comments, and handle site configuration.

This agent can:
• Access WordPress.com data and capabilities via MCP
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'WordPress.com agent — Secure AI access to manage your WordPress.com sites. (OAuth)',
    'wordpress,wordpress.com,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access WordPress.com data and capabilities via MCP","Create and manage resources"]',
    '["Business"]',
    '["WordPress.com account (OAuth connection required)"]',
    '[{"label":"WordPress.com MCP Server","url":"https://mcp.wordpress.com/sse"}]',
    'https://icons.duckduckgo.com/ip3/wordpress.com.ico'
  ),
  (
    'Wix Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Wix agent connected via the Wix MCP at https://mcp.wix.com/mcp. Sites, stores, bookings. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":5,"hair":7,"shirt":4,"pants":0,"accessory":1,"accent":0,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.wix.com/mcp","name":"wix","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://dev.wix.com/docs/go/api/wix-business-management/app-keys"}]}',
    'Wix Agent — connected to Wix via MCP (API Key required).

Manage Wix sites, stores, and bookings. Agents can update site content, manage products, and handle booking schedules.

This agent can:
• Access Wix data and capabilities via MCP
• Automate Wix workflows from conversation

To connect: Get your API Key at https://dev.wix.com/docs/go/api/wix-business-management/app-keys',
    'Wix agent — Sites, stores, bookings. (API Key)',
    'wix,wix,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Wix data and capabilities via MCP","Automate Wix workflows from conversation"]',
    '["Business"]',
    '["API Key (https://dev.wix.com/docs/go/api/wix-business-management/app-keys)"]',
    '[{"label":"Wix MCP Server","url":"https://mcp.wix.com/mcp"},{"label":"Get your API Key","url":"https://dev.wix.com/docs/go/api/wix-business-management/app-keys"}]',
    'https://icons.duckduckgo.com/ip3/wix.com.ico'
  ),
  (
    'Make Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Make agent connected via the Make MCP at https://mcp.make.com. Run Make scenarios and manage your account. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":2,"hair":7,"shirt":9,"pants":0,"accessory":0,"accent":12,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.make.com","name":"make","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://www.make.com/en/help/api-documentation"}]}',
    'Make Agent — connected to Make via MCP (API Key required).

Access Make''s automation platform. Agents can run scenarios, manage integrations, and automate complex workflows across connected services.

This agent can:
• Access Make data and capabilities via MCP
• Create and manage resources

To connect: Get your API Key at https://www.make.com/en/help/api-documentation',
    'Make agent — Run Make scenarios and manage your account. (API Key)',
    'make,make,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Make data and capabilities via MCP","Create and manage resources"]',
    '["AI & ML"]',
    '["API Key (https://www.make.com/en/help/api-documentation)"]',
    '[{"label":"Make MCP Server","url":"https://mcp.make.com"},{"label":"Get your API Key","url":"https://www.make.com/en/help/api-documentation"}]',
    'https://icons.duckduckgo.com/ip3/make.com.ico'
  ),
  (
    'Neon Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Neon agent connected via the Neon MCP at https://mcp.neon.tech/mcp. Postgres projects, branches, SQL, docs. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":2,"hair":6,"shirt":11,"pants":2,"accessory":2,"accent":12,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.neon.tech/mcp","name":"neon","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"neon_...","keyHelpUrl":"https://neon.tech/docs/manage/api-keys"}]}',
    'Neon Agent — connected to Neon via MCP (API Key required).

Access Neon''s serverless Postgres platform. Agents can manage databases, create branches, run SQL queries, and access project documentation.

This agent can:
• Access Neon data and capabilities via MCP
• Automate Neon workflows from conversation

To connect: Get your API Key at https://neon.tech/docs/manage/api-keys',
    'Neon agent — Postgres projects, branches, SQL, docs. (API Key)',
    'neon,neon,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Neon data and capabilities via MCP","Automate Neon workflows from conversation"]',
    '["Data & Analytics"]',
    '["API Key (https://neon.tech/docs/manage/api-keys)"]',
    '[{"label":"Neon MCP Server","url":"https://mcp.neon.tech/mcp"},{"label":"Get your API Key","url":"https://neon.tech/docs/manage/api-keys"}]',
    'https://icons.duckduckgo.com/ip3/neon.tech.ico'
  ),
  (
    'Microsoft Learn Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Microsoft Learn agent connected via the Microsoft Learn MCP at https://learn.microsoft.com/api/mcp. Search trusted Microsoft docs to power your development. No authentication is required for this MCP server. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":2,"shirt":3,"pants":1,"accessory":1,"accent":10,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://learn.microsoft.com/api/mcp","name":"microsoft-learn"}]}',
    'Microsoft Learn Agent — connected to Microsoft Learn via MCP (no auth required).

Access Microsoft Learn documentation. Agents can search docs, find API references, and get guidance on Microsoft technologies and frameworks.

This agent can:
• Access Microsoft Learn data and capabilities via MCP
• Search and retrieve information

No authentication required — works immediately.',
    'Microsoft Learn agent — Search trusted Microsoft docs to power your development. (no auth)',
    'microsoft-learn,microsoft learn,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Microsoft Learn data and capabilities via MCP","Search and retrieve information"]',
    '["Development"]',
    '["No authentication required — works immediately"]',
    '[{"label":"Microsoft Learn MCP Server","url":"https://learn.microsoft.com/api/mcp"}]',
    'https://icons.duckduckgo.com/ip3/microsoft.com.ico'
  ),
  (
    'Mintlify Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Mintlify agent connected via the Mintlify MCP at https://mcp.mintlify.com. Search, read, and edit your documentation. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":4,"shirt":3,"pants":2,"accessory":0,"accent":8,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.mintlify.com","name":"mintlify","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"ml_...","keyHelpUrl":"https://mintlify.com/docs/api"}]}',
    'Mintlify Agent — connected to Mintlify via MCP (API Key required).

Access Mintlify documentation platform. Agents can search docs, read content, and edit documentation for your projects.

This agent can:
• Access Mintlify data and capabilities via MCP
• Search and retrieve information

To connect: Get your API Key at https://mintlify.com/docs/api',
    'Mintlify agent — Search, read, and edit your documentation. (API Key)',
    'mintlify,mintlify,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Mintlify data and capabilities via MCP","Search and retrieve information"]',
    '["Development"]',
    '["API Key (https://mintlify.com/docs/api)"]',
    '[{"label":"Mintlify MCP Server","url":"https://mcp.mintlify.com"},{"label":"Get your API Key","url":"https://mintlify.com/docs/api"}]',
    'https://icons.duckduckgo.com/ip3/mintlify.com.ico'
  ),
  (
    'Browserbase Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Browserbase agent connected via the Browserbase MCP at https://mcp.browserbase.com/sse. Automate browser interactions in the cloud. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":4,"hair":0,"shirt":7,"pants":2,"accessory":2,"accent":8,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.browserbase.com/sse","name":"browserbase","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"bb_...","keyHelpUrl":"https://www.browserbase.com/settings"}]}',
    'Browserbase Agent — connected to Browserbase via MCP (API Key required).

Automate browser interactions in the cloud — web navigation, data extraction, form filling, and more. Agents can control headless browsers without local setup.

This agent can:
• Access Browserbase data and capabilities via MCP
• Automate Browserbase workflows from conversation

To connect: Get your API Key at https://www.browserbase.com/settings',
    'Browserbase agent — Automate browser interactions in the cloud. (API Key)',
    'browserbase,browserbase,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Browserbase data and capabilities via MCP","Automate Browserbase workflows from conversation"]',
    '["Development"]',
    '["API Key (https://www.browserbase.com/settings)"]',
    '[{"label":"Browserbase MCP Server","url":"https://mcp.browserbase.com/sse"},{"label":"Get your API Key","url":"https://www.browserbase.com/settings"}]',
    'https://icons.duckduckgo.com/ip3/browserbase.com.ico'
  ),
  (
    'Parallel Search Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Parallel Search agent connected via the Parallel Search MCP at https://mcp.parallel.ai/sse. Real-time web search and content extraction. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":1,"shirt":11,"pants":1,"accessory":2,"accent":0,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.parallel.ai/sse","name":"parallel-search","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://parallel.ai/settings"}]}',
    'Parallel Search Agent — connected to Parallel Search via MCP (API Key required).

Real-time web search and content extraction. Agents can search the web, extract page content, and retrieve structured data from any URL.

This agent can:
• Access Parallel Search data and capabilities via MCP
• Search and retrieve information

To connect: Get your API Key at https://parallel.ai/settings',
    'Parallel Search agent — Real-time web search and content extraction. (API Key)',
    'parallel-search,parallel search,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Parallel Search data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["API Key (https://parallel.ai/settings)"]',
    '[{"label":"Parallel Search MCP Server","url":"https://mcp.parallel.ai/sse"},{"label":"Get your API Key","url":"https://parallel.ai/settings"}]',
    'https://icons.duckduckgo.com/ip3/parallel.ai.ico'
  ),
  (
    'Mercury Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Mercury agent connected via the Mercury MCP at https://mcp.mercury.com/mcp. Accounts, transactions, balances, cards. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":3,"hair":0,"shirt":10,"pants":0,"accessory":5,"accent":7,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.mercury.com/mcp","name":"mercury","authType":"apikey","keyLabel":"API Token","keyPlaceholder":"Paste API token...","keyHelpUrl":"https://docs.mercury.com/reference"}]}',
    'Mercury Agent — connected to Mercury via MCP (API Token required).

Access Mercury''s banking platform. Agents can query accounts, track transactions, check balances, and manage corporate cards.

This agent can:
• Access Mercury data and capabilities via MCP
• Automate Mercury workflows from conversation

To connect: Get your API Token at https://docs.mercury.com/reference',
    'Mercury agent — Accounts, transactions, balances, cards. (API Token)',
    'mercury,mercury,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Mercury data and capabilities via MCP","Automate Mercury workflows from conversation"]',
    '["Finance"]',
    '["API Token (https://docs.mercury.com/reference)"]',
    '[{"label":"Mercury MCP Server","url":"https://mcp.mercury.com/mcp"},{"label":"Get your API Token","url":"https://docs.mercury.com/reference"}]',
    'https://icons.duckduckgo.com/ip3/mercury.com.ico'
  ),
  (
    'Ahrefs Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Ahrefs agent connected via the Ahrefs MCP at https://api.ahrefs.com/mcp/mcp. SEO & AI search analytics. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":0,"shirt":0,"pants":2,"accessory":4,"accent":5,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://api.ahrefs.com/mcp/mcp","name":"ahrefs","authType":"apikey","keyLabel":"API Token","keyPlaceholder":"Paste API token...","keyHelpUrl":"https://ahrefs.com/api/profile"}]}',
    'Ahrefs Agent — connected to Ahrefs via MCP (API Token required).

Access Ahrefs'' SEO and search analytics platform. Agents can query backlinks, analyze search rankings, research keywords, and track SEO performance.

This agent can:
• Access Ahrefs data and capabilities via MCP
• Search and retrieve information

To connect: Get your API Token at https://ahrefs.com/api/profile',
    'Ahrefs agent — SEO & AI search analytics. (API Token)',
    'ahrefs,ahrefs,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Ahrefs data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["API Token (https://ahrefs.com/api/profile)"]',
    '[{"label":"Ahrefs MCP Server","url":"https://api.ahrefs.com/mcp/mcp"},{"label":"Get your API Token","url":"https://ahrefs.com/api/profile"}]',
    'https://icons.duckduckgo.com/ip3/ahrefs.com.ico'
  ),
  (
    'Semrush Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Semrush agent connected via the Semrush MCP at https://mcp.semrush.com/claude/v1/mcp. SEO, market data, and brand visibility insights. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":5,"shirt":2,"pants":1,"accessory":4,"accent":8,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.semrush.com/claude/v1/mcp","name":"semrush","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://www.semrush.com/kb/41-api-keys"}]}',
    'Semrush Agent — connected to Semrush via MCP (API Key required).

Access Semrush''s SEO and marketing analytics platform. Agents can research keywords, analyze competitors, track rankings, and audit sites.

This agent can:
• Access Semrush data and capabilities via MCP
• Automate Semrush workflows from conversation

To connect: Get your API Key at https://www.semrush.com/kb/41-api-keys',
    'Semrush agent — SEO, market data, and brand visibility insights. (API Key)',
    'semrush,semrush,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Semrush data and capabilities via MCP","Automate Semrush workflows from conversation"]',
    '["Data & Analytics"]',
    '["API Key (https://www.semrush.com/kb/41-api-keys)"]',
    '[{"label":"Semrush MCP Server","url":"https://mcp.semrush.com/claude/v1/mcp"},{"label":"Get your API Key","url":"https://www.semrush.com/kb/41-api-keys"}]',
    'https://icons.duckduckgo.com/ip3/semrush.com.ico'
  ),
  (
    'Similarweb Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Similarweb agent connected via the Similarweb MCP at https://mcp.similarweb.com. Real time web, mobile app, and market data. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":4,"shirt":8,"pants":2,"accessory":0,"accent":5,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.similarweb.com","name":"similarweb","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://www.similarweb.com/corp/api/"}]}',
    'Similarweb Agent — connected to Similarweb via MCP (API Key required).

Access Similarweb''s market intelligence platform. Agents can analyze web traffic, compare competitors, and query market data across industries.

This agent can:
• Access Similarweb data and capabilities via MCP
• Automate Similarweb workflows from conversation

To connect: Get your API Key at https://www.similarweb.com/corp/api/',
    'Similarweb agent — Real time web, mobile app, and market data. (API Key)',
    'similarweb,similarweb,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Similarweb data and capabilities via MCP","Automate Similarweb workflows from conversation"]',
    '["Data & Analytics"]',
    '["API Key (https://www.similarweb.com/corp/api/)"]',
    '[{"label":"Similarweb MCP Server","url":"https://mcp.similarweb.com"},{"label":"Get your API Key","url":"https://www.similarweb.com/corp/api/"}]',
    'https://icons.duckduckgo.com/ip3/similarweb.com.ico'
  ),
  (
    'Granola Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Granola agent connected via the Granola MCP at https://mcp.granola.ai/mcp. The AI notepad for meetings. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":6,"shirt":11,"pants":0,"accessory":1,"accent":6,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.granola.ai/mcp","name":"granola","authType":"oauth"}]}',
    'Granola Agent — connected to Granola via MCP (OAuth).

Connect AI tools to your Granola meeting notes via MCP. Agents can query notes, search transcripts, and get meeting insights.

This agent can:
• Access Granola data and capabilities via MCP
• Automate Granola workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Granola agent — The AI notepad for meetings. (OAuth)',
    'granola,granola,mcp,Communication',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Granola data and capabilities via MCP","Automate Granola workflows from conversation"]',
    '["Communication"]',
    '["Granola account (OAuth connection required)"]',
    '[{"label":"Granola MCP Server","url":"https://mcp.granola.ai/mcp"}]',
    'https://icons.duckduckgo.com/ip3/granola.ai.ico'
  ),
  (
    'Fireflies Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Fireflies agent connected via the Fireflies MCP at https://api.fireflies.ai/mcp. Meeting transcripts, summaries, search. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":4,"hair":1,"shirt":10,"pants":0,"accessory":1,"accent":4,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://api.fireflies.ai/mcp","name":"fireflies","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://app.fireflies.ai/api/webhooks"}]}',
    'Fireflies Agent — connected to Fireflies via MCP (API Key required).

Access Fireflies.ai meeting intelligence. Agents can search transcripts, query meeting summaries, and extract action items from recorded meetings.

This agent can:
• Access Fireflies data and capabilities via MCP
• Search and retrieve information

To connect: Get your API Key at https://app.fireflies.ai/api/webhooks',
    'Fireflies agent — Meeting transcripts, summaries, search. (API Key)',
    'fireflies,fireflies,mcp,Communication',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Fireflies data and capabilities via MCP","Search and retrieve information"]',
    '["Communication"]',
    '["API Key (https://app.fireflies.ai/api/webhooks)"]',
    '[{"label":"Fireflies MCP Server","url":"https://api.fireflies.ai/mcp"},{"label":"Get your API Key","url":"https://app.fireflies.ai/api/webhooks"}]',
    'https://icons.duckduckgo.com/ip3/fireflies.ai.ico'
  ),
  (
    'Otter.ai Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Otter.ai agent connected via the Otter.ai MCP at https://mcp.otter.ai/mcp. Unlock your meeting intelligence. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":4,"hair":4,"shirt":12,"pants":1,"accessory":0,"accent":9,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.otter.ai/mcp","name":"otter-ai","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://otter.ai/api"}]}',
    'Otter.ai Agent — connected to Otter.ai via MCP (API Key required).

Access Otter.ai''s meeting transcription platform. Agents can query transcripts, search meeting content, and extract action items.

This agent can:
• Access Otter.ai data and capabilities via MCP
• Automate Otter.ai workflows from conversation

To connect: Get your API Key at https://otter.ai/api',
    'Otter.ai agent — Unlock your meeting intelligence. (API Key)',
    'otter-ai,otter.ai,mcp,Communication',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Otter.ai data and capabilities via MCP","Automate Otter.ai workflows from conversation"]',
    '["Communication"]',
    '["API Key (https://otter.ai/api)"]',
    '[{"label":"Otter.ai MCP Server","url":"https://mcp.otter.ai/mcp"},{"label":"Get your API Key","url":"https://otter.ai/api"}]',
    'https://icons.duckduckgo.com/ip3/otter.ai.ico'
  ),
  (
    'Gamma Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Gamma agent connected via the Gamma MCP at https://mcp.gamma.app/mcp. Presentations, documents, websites. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":4,"hair":5,"shirt":4,"pants":0,"accessory":0,"accent":7,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.gamma.app/mcp","name":"gamma","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://gamma.app/docs/api"}]}',
    'Gamma Agent — connected to Gamma via MCP (API Key required).

Access Gamma''s presentation and document platform. Agents can create presentations, generate documents, and publish websites using AI-powered design.

This agent can:
• Access Gamma data and capabilities via MCP
• Automate Gamma workflows from conversation

To connect: Get your API Key at https://gamma.app/docs/api',
    'Gamma agent — Presentations, documents, websites. (API Key)',
    'gamma,gamma,mcp,Design',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Gamma data and capabilities via MCP","Automate Gamma workflows from conversation"]',
    '["Design"]',
    '["API Key (https://gamma.app/docs/api)"]',
    '[{"label":"Gamma MCP Server","url":"https://mcp.gamma.app/mcp"},{"label":"Get your API Key","url":"https://gamma.app/docs/api"}]',
    'https://icons.duckduckgo.com/ip3/gamma.app.ico'
  ),
  (
    'Workable Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Workable agent connected via the Workable MCP at https://mcp.workable.com/sse. Your AI assistant for Hiring and HR. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":3,"hair":6,"shirt":5,"pants":0,"accessory":1,"accent":3,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.workable.com/sse","name":"gusto-payroll","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://dev.workable.com/"}]}',
    'Workable Agent — connected to Workable via MCP (API Key required).

Access Workable''s HR and hiring platform. Agents can manage job postings, search candidates, and track hiring pipelines.

This agent can:
• Access Workable data and capabilities via MCP
• Automate Workable workflows from conversation

To connect: Get your API Key at https://dev.workable.com/',
    'Workable agent — Your AI assistant for Hiring and HR. (API Key)',
    'gusto-payroll,workable,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Workable data and capabilities via MCP","Automate Workable workflows from conversation"]',
    '["Business"]',
    '["API Key (https://dev.workable.com/)"]',
    '[{"label":"Workable MCP Server","url":"https://mcp.workable.com/sse"},{"label":"Get your API Key","url":"https://dev.workable.com/"}]',
    'https://icons.duckduckgo.com/ip3/workable.com.ico'
  ),
  (
    'Indeed Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Indeed agent connected via the Indeed MCP at https://mcp.indeed.com/claude/mcp. Job search and listings. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":3,"shirt":3,"pants":1,"accessory":4,"accent":0,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.indeed.com/claude/mcp","name":"indeed","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://developers.indeed.com/"}]}',
    'Indeed Agent — connected to Indeed via MCP (API Key required).

Access Indeed''s job search platform. Agents can search job listings, query salary data, and find employment opportunities.

This agent can:
• Access Indeed data and capabilities via MCP
• Search and retrieve information

To connect: Get your API Key at https://developers.indeed.com/',
    'Indeed agent — Job search and listings. (API Key)',
    'indeed,indeed,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Indeed data and capabilities via MCP","Search and retrieve information"]',
    '["Business"]',
    '["API Key (https://developers.indeed.com/)"]',
    '[{"label":"Indeed MCP Server","url":"https://mcp.indeed.com/claude/mcp"},{"label":"Get your API Key","url":"https://developers.indeed.com/"}]',
    'https://icons.duckduckgo.com/ip3/indeed.com.ico'
  ),
  (
    'SurveyMonkey Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a SurveyMonkey agent connected via the SurveyMonkey MCP at https://mcp.surveymonkey.com/sse. Design surveys, collect responses, and analyze results. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":5,"shirt":1,"pants":1,"accessory":2,"accent":3,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.surveymonkey.com/sse","name":"survey-monkey","authType":"apikey","keyLabel":"Access Token","keyPlaceholder":"Paste access token...","keyHelpUrl":"https://developer.surveymonkey.com/api/v3/"}]}',
    'SurveyMonkey Agent — connected to SurveyMonkey via MCP (Access Token required).

Access SurveyMonkey''s survey platform. Agents can create surveys, collect responses, and analyze results data.

This agent can:
• Access SurveyMonkey data and capabilities via MCP
• Analyze data and generate insights

To connect: Get your Access Token at https://developer.surveymonkey.com/api/v3/',
    'SurveyMonkey agent — Design surveys, collect responses, and analyze results. (Access Token)',
    'survey-monkey,surveymonkey,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access SurveyMonkey data and capabilities via MCP","Analyze data and generate insights"]',
    '["Data & Analytics"]',
    '["Access Token (https://developer.surveymonkey.com/api/v3/)"]',
    '[{"label":"SurveyMonkey MCP Server","url":"https://mcp.surveymonkey.com/sse"},{"label":"Get your Access Token","url":"https://developer.surveymonkey.com/api/v3/"}]',
    'https://icons.duckduckgo.com/ip3/surveymonkey.com.ico'
  ),
  (
    'Cloudinary Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Cloudinary agent connected via the Cloudinary MCP at https://asset-management.mcp.cloudinary.com/sse. Manage, transform and deliver your images & videos. You authenticate via an API key — the user will provide their key. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":0,"hair":7,"shirt":8,"pants":1,"accessory":0,"accent":8,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://asset-management.mcp.cloudinary.com/sse","name":"cloudinary","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste API key...","keyHelpUrl":"https://cloudinary.com/documentation/api_keys"}]}',
    'Cloudinary Agent — connected to Cloudinary via MCP (API Key required).

Access Cloudinary''s media management platform. Agents can upload, transform, optimize, and deliver images and videos at scale.

This agent can:
• Access Cloudinary data and capabilities via MCP
• Create and manage resources

To connect: Get your API Key at https://cloudinary.com/documentation/api_keys',
    'Cloudinary agent — Manage, transform and deliver your images & videos. (API Key)',
    'cloudinary,cloudinary,mcp,Design',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Cloudinary data and capabilities via MCP","Create and manage resources"]',
    '["Design"]',
    '["API Key (https://cloudinary.com/documentation/api_keys)"]',
    '[{"label":"Cloudinary MCP Server","url":"https://asset-management.mcp.cloudinary.com/sse"},{"label":"Get your API Key","url":"https://cloudinary.com/documentation/api_keys"}]',
    'https://icons.duckduckgo.com/ip3/cloudinary.com.ico'
  ),
  (
    'Railway Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Railway agent connected via the Railway MCP at https://mcp.railway.com. Projects, services, environments, deployments You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":0,"shirt":1,"pants":0,"accessory":1,"accent":4,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.railway.com","name":"railway","authType":"oauth"}]}',
    'Railway Agent — connected to Railway via MCP (OAuth).

Railway is a developer platform for shipping applications, services, environments, and deployments. Its remote MCP server gives assistants project and deployment context for investigating app state, planning changes, and working across Railway environments.

This agent can:
• Access Railway data and capabilities via MCP
• Automate Railway workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Railway agent — Projects, services, environments, deployments (OAuth)',
    'railway,railway,mcp,Infrastructure',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Railway data and capabilities via MCP","Automate Railway workflows from conversation"]',
    '["Infrastructure"]',
    '["Railway account (OAuth connection required)"]',
    '[{"label":"Railway MCP Server","url":"https://mcp.railway.com"}]',
    'https://icons.duckduckgo.com/ip3/railway.com.ico'
  ),
  (
    'Aiera Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Aiera agent connected via the Aiera MCP at https://mcp-pub.aiera.com/. Earnings events, transcripts, filings You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":1,"shirt":9,"pants":2,"accessory":0,"accent":6,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp-pub.aiera.com/","name":"aiera","authType":"oauth"}]}',
    'Aiera Agent — connected to Aiera via MCP (OAuth).

Aiera is a financial events intelligence platform covering live earnings calls, transcripts, filings, and company publications. Its remote MCP server connects assistants to Aiera''s event and document APIs so market-moving information can be searched and analyzed in conversation.

This agent can:
• Access Aiera data and capabilities via MCP
• Automate Aiera workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Aiera agent — Earnings events, transcripts, filings (OAuth)',
    'aiera,aiera,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Aiera data and capabilities via MCP","Automate Aiera workflows from conversation"]',
    '["AI & ML"]',
    '["Aiera account (OAuth connection required)"]',
    '[{"label":"Aiera MCP Server","url":"https://mcp-pub.aiera.com/"}]',
    'https://icons.duckduckgo.com/ip3/aiera.com.ico'
  ),
  (
    'Box Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Box agent connected via the Box MCP at https://mcp.box.com. Files, folders, search, Box AI You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":4,"hair":6,"shirt":4,"pants":2,"accessory":5,"accent":0,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.box.com","name":"box","authType":"oauth"}]}',
    'Box Agent — connected to Box via MCP (OAuth).

Box is a secure content platform for storing, organizing, searching, and collaborating on business files. Its remote MCP server gives assistants governed access to file and folder context, Box AI capabilities, and document knowledge within the permissions already configured in Box.

This agent can:
• Access Box data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Box agent — Files, folders, search, Box AI (OAuth)',
    'box,box,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Box data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["Box account (OAuth connection required)"]',
    '[{"label":"Box MCP Server","url":"https://mcp.box.com"}]',
    'https://icons.duckduckgo.com/ip3/box.com.ico'
  ),
  (
    'AdisInsight Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a AdisInsight agent connected via the AdisInsight MCP at https://adisinsight-mcp.springer.com/mcp. Pharmaceutical drug & clinical trial intelligence You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":4,"hair":4,"shirt":5,"pants":2,"accessory":0,"accent":11,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://adisinsight-mcp.springer.com/mcp","name":"adisinsight","authType":"oauth"}]}',
    'AdisInsight Agent — connected to AdisInsight via MCP (OAuth).

AdisInsight provides pharmaceutical drug and clinical trial intelligence powered by Springer Nature. Its MCP connector gives assistants context for exploring drug pipelines, clinical trials, competitive landscapes, development history, adverse events, and regulatory milestones.

This agent can:
• Access AdisInsight data and capabilities via MCP
• Automate AdisInsight workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'AdisInsight agent — Pharmaceutical drug & clinical trial intelligence (OAuth)',
    'adisinsight,adisinsight,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access AdisInsight data and capabilities via MCP","Automate AdisInsight workflows from conversation"]',
    '["Business"]',
    '["AdisInsight account (OAuth connection required)"]',
    '[{"label":"AdisInsight MCP Server","url":"https://adisinsight-mcp.springer.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/springer.com.ico'
  ),
  (
    'Adobe Experience Manager Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Adobe Experience Manager agent connected via the Adobe Experience Manager MCP at https://mcp.adobeaemcloud.com/adobe/mcp/aem. Manage your Adobe Experience Manager content You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":6,"hair":0,"shirt":3,"pants":1,"accessory":4,"accent":5,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.adobeaemcloud.com/adobe/mcp/aem","name":"adobe-experience-manager","authType":"oauth"}]}',
    'Adobe Experience Manager Agent — connected to Adobe Experience Manager via MCP (OAuth).

Adobe Experience Manager lets users create, edit, search, and publish pages or content fragments by describing the work in natural language. The MCP connector supports content updates, campaign-page searches, and launch scheduling while respecting existing AEM permissions.

This agent can:
• Access Adobe Experience Manager data and capabilities via MCP
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Adobe Experience Manager agent — Manage your Adobe Experience Manager content (OAuth)',
    'adobe-experience-manager,adobe experience manager,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Adobe Experience Manager data and capabilities via MCP","Create and manage resources"]',
    '["Business"]',
    '["Adobe Experience Manager account (OAuth connection required)"]',
    '[{"label":"Adobe Experience Manager MCP Server","url":"https://mcp.adobeaemcloud.com/adobe/mcp/aem"}]',
    'https://icons.duckduckgo.com/ip3/adobeaemcloud.com.ico'
  ),
  (
    'Adobe for creativity Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Adobe for creativity agent connected via the Adobe for creativity MCP at https://adobe-creativity.adobe.io/mcp. Ideate, create, and deliver with Adobe pro tools You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":3,"hair":0,"shirt":2,"pants":2,"accessory":4,"accent":6,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://adobe-creativity.adobe.io/mcp","name":"adobe-creativity","authType":"oauth"}]}',
    'Adobe for creativity Agent — connected to Adobe for creativity via MCP (OAuth).

Adobe for creativity connects Photoshop, Lightroom, Illustrator, Firefly, Premiere, Express, InDesign, and Stock capabilities to AI-assisted creative work. Users can create, edit, and refine photos, design assets, and video projects through natural language while keeping work tied to an Adobe account.

This agent can:
• Access Adobe for creativity data and capabilities via MCP
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Adobe for creativity agent — Ideate, create, and deliver with Adobe pro tools (OAuth)',
    'adobe-creativity,adobe for creativity,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Adobe for creativity data and capabilities via MCP","Create and manage resources"]',
    '["Business"]',
    '["Adobe for creativity account (OAuth connection required)"]',
    '[{"label":"Adobe for creativity MCP Server","url":"https://adobe-creativity.adobe.io/mcp"}]',
    'https://icons.duckduckgo.com/ip3/adobe.io.ico'
  ),
  (
    'Adobe Journey Optimizer Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Adobe Journey Optimizer agent connected via the Adobe Journey Optimizer MCP at https://ajo-mcp.adobe.io/mcp. Understand and troubleshoot your Journeys and Campaigns You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":7,"shirt":2,"pants":2,"accessory":5,"accent":12,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://ajo-mcp.adobe.io/mcp","name":"adobe-journey-optimizer","authType":"oauth"}]}',
    'Adobe Journey Optimizer Agent — connected to Adobe Journey Optimizer via MCP (OAuth).

Adobe Journey Optimizer helps teams inspect, summarize, and troubleshoot journeys, campaigns, offers, and channel configurations. Its MCP connector turns AJO retrieve APIs into plain-language context for reviewing statuses, finding draft issues, and understanding orchestration portfolios.

This agent can:
• Access Adobe Journey Optimizer data and capabilities via MCP
• Automate Adobe Journey Optimizer workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Adobe Journey Optimizer agent — Understand and troubleshoot your Journeys and Campaigns (OAuth)',
    'adobe-journey-optimizer,adobe journey optimizer,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Adobe Journey Optimizer data and capabilities via MCP","Automate Adobe Journey Optimizer workflows from conversation"]',
    '["Business"]',
    '["Adobe Journey Optimizer account (OAuth connection required)"]',
    '[{"label":"Adobe Journey Optimizer MCP Server","url":"https://ajo-mcp.adobe.io/mcp"}]',
    'https://icons.duckduckgo.com/ip3/adobe.io.ico'
  ),
  (
    'Adobe Marketing Agent Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Adobe Marketing Agent agent connected via the Adobe Marketing Agent MCP at https://aep-ai-ama.adobe.io/mcp. Marketing campaign and audience insights from Adobe You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":2,"shirt":3,"pants":1,"accessory":5,"accent":8,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://aep-ai-ama.adobe.io/mcp","name":"adobe-marketing-agent","authType":"oauth"}]}',
    'Adobe Marketing Agent Agent — connected to Adobe Marketing Agent via MCP (OAuth).

Adobe Marketing Agent connects enterprise AI workflows with Adobe marketing systems such as Real-Time CDP, Journey Optimizer, and Customer Journey Analytics. It helps teams ask questions, surface campaign and audience insights, and take action from natural language.

This agent can:
• Access Adobe Marketing Agent data and capabilities via MCP
• Automate Adobe Marketing Agent workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Adobe Marketing Agent agent — Marketing campaign and audience insights from Adobe (OAuth)',
    'adobe-marketing-agent,adobe marketing agent,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Adobe Marketing Agent data and capabilities via MCP","Automate Adobe Marketing Agent workflows from conversation"]',
    '["Finance"]',
    '["Adobe Marketing Agent account (OAuth connection required)"]',
    '[{"label":"Adobe Marketing Agent MCP Server","url":"https://aep-ai-ama.adobe.io/mcp"}]',
    'https://icons.duckduckgo.com/ip3/adobe.io.ico'
  ),
  (
    'Airwallex Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Airwallex agent connected via the Airwallex MCP at https://mcp-demo.airwallex.com/developer. Integrate with the Airwallex Platform using Claude You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":3,"hair":6,"shirt":1,"pants":0,"accessory":2,"accent":12,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp-demo.airwallex.com/developer","name":"airwallex","authType":"oauth"}]}',
    'Airwallex Agent — connected to Airwallex via MCP (OAuth).

Airwallex provides payment and financial platform capabilities for developers building on its APIs. Its MCP server brings Airwallex documentation, API references, and sandbox testing context into assistant workflows for integration planning, troubleshooting, simulations, and go-live preparation.

This agent can:
• Access Airwallex data and capabilities via MCP
• Automate Airwallex workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Airwallex agent — Integrate with the Airwallex Platform using Claude (OAuth)',
    'airwallex,airwallex,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Airwallex data and capabilities via MCP","Automate Airwallex workflows from conversation"]',
    '["AI & ML"]',
    '["Airwallex account (OAuth connection required)"]',
    '[{"label":"Airwallex MCP Server","url":"https://mcp-demo.airwallex.com/developer"}]',
    'https://icons.duckduckgo.com/ip3/airwallex.com.ico'
  ),
  (
    'Aiwyn Tax Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Aiwyn Tax agent connected via the Aiwyn Tax MCP at https://mcp.columnapi.com/mcp. Estimate your federal & state taxes with Aiwyn''s tax engine You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":0,"shirt":11,"pants":0,"accessory":0,"accent":1,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.columnapi.com/mcp","name":"aiwyn-tax","authType":"oauth"}]}',
    'Aiwyn Tax Agent — connected to Aiwyn Tax via MCP (OAuth).

Aiwyn Tax uses Aiwyn tax-engine capabilities to estimate federal and state taxes from user-provided tax documents. Its MCP connector can help produce a 1040-oriented workflow while keeping the description focused on tax estimation rather than broad financial advice.

This agent can:
• Access Aiwyn Tax data and capabilities via MCP
• Automate Aiwyn Tax workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Aiwyn Tax agent — Estimate your federal & state taxes with Aiwyn''s tax engine (OAuth)',
    'aiwyn-tax,aiwyn tax,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Aiwyn Tax data and capabilities via MCP","Automate Aiwyn Tax workflows from conversation"]',
    '["Finance"]',
    '["Aiwyn Tax account (OAuth connection required)"]',
    '[{"label":"Aiwyn Tax MCP Server","url":"https://mcp.columnapi.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/columnapi.com.ico'
  ),
  (
    'AllTrails Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a AllTrails agent connected via the AllTrails MCP at https://www.alltrails.com/mcp. Find your next hike You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":1,"hair":0,"shirt":1,"pants":1,"accessory":3,"accent":11,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://www.alltrails.com/mcp","name":"alltrails","authType":"oauth"}]}',
    'AllTrails Agent — connected to AllTrails via MCP (OAuth).

AllTrails helps people discover hikes, walks, and outdoor routes using curated trail information, community reviews, photos, ratings, and trip-planning context. Its MCP connector brings that outdoor discovery context into assistant workflows for comparing nearby routes and choosing an adventure before heading out.

This agent can:
• Access AllTrails data and capabilities via MCP
• Automate AllTrails workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'AllTrails agent — Find your next hike (OAuth)',
    'alltrails,alltrails,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access AllTrails data and capabilities via MCP","Automate AllTrails workflows from conversation"]',
    '["AI & ML"]',
    '["AllTrails account (OAuth connection required)"]',
    '[{"label":"AllTrails MCP Server","url":"https://www.alltrails.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/alltrails.com.ico'
  ),
  (
    'Audible Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Audible agent connected via the Audible MCP at https://mcp.audible.com/mcp. Ask for audiobook recommendations You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":6,"hair":7,"shirt":2,"pants":0,"accessory":4,"accent":1,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.audible.com/mcp","name":"audible","authType":"oauth"}]}',
    'Audible Agent — connected to Audible via MCP (OAuth).

Audible helps users discover audiobook recommendations by genre, mood, topic, or other natural-language preferences. Its MCP connector gives assistants access to recommendation context while keeping availability and marketplace differences scoped to the user''s region.

This agent can:
• Access Audible data and capabilities via MCP
• Automate Audible workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Audible agent — Ask for audiobook recommendations (OAuth)',
    'audible,audible,mcp,Design',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Audible data and capabilities via MCP","Automate Audible workflows from conversation"]',
    '["Design"]',
    '["Audible account (OAuth connection required)"]',
    '[{"label":"Audible MCP Server","url":"https://mcp.audible.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/audible.com.ico'
  ),
  (
    'Aura Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Aura agent connected via the Aura MCP at https://mcp.auraintelligence.com/mcp. Company intelligence & workforce analytics You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":5,"hair":3,"shirt":2,"pants":0,"accessory":3,"accent":9,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.auraintelligence.com/mcp","name":"aura","authType":"oauth"}]}',
    'Aura Agent — connected to Aura via MCP (OAuth).

Aura provides company intelligence and workforce analytics for exploring employee headcount, hiring, attrition, corporate structure, and industry benchmarks. Its MCP connector gives assistants workforce context for due diligence, market research, and company-comparison workflows.

This agent can:
• Access Aura data and capabilities via MCP
• Automate Aura workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Aura agent — Company intelligence & workforce analytics (OAuth)',
    'aura,aura,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Aura data and capabilities via MCP","Automate Aura workflows from conversation"]',
    '["Data & Analytics"]',
    '["Aura account (OAuth connection required)"]',
    '[{"label":"Aura MCP Server","url":"https://mcp.auraintelligence.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/auraintelligence.com.ico'
  ),
  (
    'Aurora Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Aurora agent connected via the Aurora MCP at https://mcp.ai.consilio.com. Search your Consilio matters, docs, and more. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":4,"hair":5,"shirt":6,"pants":0,"accessory":2,"accent":4,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.ai.consilio.com","name":"aurora","authType":"oauth"}]}',
    'Aurora Agent — connected to Aurora via MCP (OAuth).

Aurora is a read-only Consilio connector for engagement, document, matter, and workspace data. It lets assistants search across entitled Consilio records, follow answers through related matters and documents, and cite source URLs while respecting existing access rights.

This agent can:
• Access Aurora data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Aurora agent — Search your Consilio matters, docs, and more. (OAuth)',
    'aurora,aurora,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Aurora data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["Aurora account (OAuth connection required)"]',
    '[{"label":"Aurora MCP Server","url":"https://mcp.ai.consilio.com"}]',
    'https://icons.duckduckgo.com/ip3/consilio.com.ico'
  ),
  (
    'Autodesk Product Help Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Autodesk Product Help agent connected via the Autodesk Product Help MCP at https://developer.api.autodesk.com/knowledge/public/v1/mcp. Securely access Autodesk''s help documentation You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":2,"shirt":12,"pants":1,"accessory":2,"accent":8,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://developer.api.autodesk.com/knowledge/public/v1/mcp","name":"autodesk-product-help","authType":"oauth"}]}',
    'Autodesk Product Help Agent — connected to Autodesk Product Help via MCP (OAuth).

Autodesk Product Help connects AI agents to Autodesk official product documentation across more than 110 products. The read-only MCP server helps assistants search, navigate, and retrieve trusted help content for product questions, onboarding, and support workflows.

This agent can:
• Access Autodesk Product Help data and capabilities via MCP
• Automate Autodesk Product Help workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Autodesk Product Help agent — Securely access Autodesk''s help documentation (OAuth)',
    'autodesk-product-help,autodesk product help,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Autodesk Product Help data and capabilities via MCP","Automate Autodesk Product Help workflows from conversation"]',
    '["Development"]',
    '["Autodesk Product Help account (OAuth connection required)"]',
    '[{"label":"Autodesk Product Help MCP Server","url":"https://developer.api.autodesk.com/knowledge/public/v1/mcp"}]',
    'https://icons.duckduckgo.com/ip3/autodesk.com.ico'
  ),
  (
    'AWS Marketplace Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a AWS Marketplace agent connected via the AWS Marketplace MCP at https://marketplace-mcp.us-east-1.api.aws/. Discover, evaluate, and buy solutions for the cloud You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":4,"hair":4,"shirt":2,"pants":1,"accessory":3,"accent":12,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://marketplace-mcp.us-east-1.api.aws/","name":"aws-marketplace","authType":"oauth"}]}',
    'AWS Marketplace Agent — connected to AWS Marketplace via MCP (OAuth).

AWS Marketplace helps software buyers discover, evaluate, compare, and procure cloud solutions from the AWS Marketplace catalog. Its connector brings marketplace search, recommendations, shortlisting, and contextual solution insights into assistant-led buying workflows.

This agent can:
• Access AWS Marketplace data and capabilities via MCP
• Automate AWS Marketplace workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'AWS Marketplace agent — Discover, evaluate, and buy solutions for the cloud (OAuth)',
    'aws-marketplace,aws marketplace,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access AWS Marketplace data and capabilities via MCP","Automate AWS Marketplace workflows from conversation"]',
    '["Finance"]',
    '["AWS Marketplace account (OAuth connection required)"]',
    '[{"label":"AWS Marketplace MCP Server","url":"https://marketplace-mcp.us-east-1.api.aws/"}]',
    'https://icons.duckduckgo.com/ip3/api.aws.ico'
  ),
  (
    'B12 Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a B12 agent connected via the B12 MCP at https://b12.io/mcp. AI website generation You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":3,"hair":0,"shirt":10,"pants":1,"accessory":5,"accent":0,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://b12.io/mcp","name":"b12","authType":"oauth"}]}',
    'B12 Agent — connected to B12 via MCP (OAuth).

B12 is an AI-powered website builder for professional services businesses. Its remote MCP server lets assistants generate a complete, publishable website from a business name and description, then iterate on copy and design directly from chat.

This agent can:
• Access B12 data and capabilities via MCP
• Automate B12 workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'B12 agent — AI website generation (OAuth)',
    'b12,b12,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access B12 data and capabilities via MCP","Automate B12 workflows from conversation"]',
    '["AI & ML"]',
    '["B12 account (OAuth connection required)"]',
    '[{"label":"B12 MCP Server","url":"https://b12.io/mcp"}]',
    'https://icons.duckduckgo.com/ip3/b12.io.ico'
  ),
  (
    'Base44 Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Base44 agent connected via the Base44 MCP at https://app.base44.com/mcp. AI app building, backend, data You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":1,"hair":7,"shirt":6,"pants":2,"accessory":5,"accent":5,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://app.base44.com/mcp","name":"base44","authType":"oauth"}]}',
    'Base44 Agent — connected to Base44 via MCP (OAuth).

Base44 is an AI app-building platform where full applications are created and edited from natural-language descriptions. Its remote MCP server lets assistants create and manage Base44 apps, backend logic, and data without leaving the conversation.

This agent can:
• Access Base44 data and capabilities via MCP
• Automate Base44 workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Base44 agent — AI app building, backend, data (OAuth)',
    'base44,base44,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Base44 data and capabilities via MCP","Automate Base44 workflows from conversation"]',
    '["Data & Analytics"]',
    '["Base44 account (OAuth connection required)"]',
    '[{"label":"Base44 MCP Server","url":"https://app.base44.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/base44.com.ico'
  ),
  (
    'Bigdata.com Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Bigdata.com agent connected via the Bigdata.com MCP at https://mcp.bigdata.com/. Access real-time financial data You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":5,"hair":2,"shirt":0,"pants":1,"accessory":4,"accent":4,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.bigdata.com/","name":"bigdata","authType":"oauth"}]}',
    'Bigdata.com Agent — connected to Bigdata.com via MCP (OAuth).

Bigdata.com provides institutional-grade financial data covering global news, transcripts, and regulatory filings. Its MCP server combines entity-aware search with assistant reasoning so analysts can run due diligence and produce cited finance research from grounded sources.

This agent can:
• Access Bigdata.com data and capabilities via MCP
• Automate Bigdata.com workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Bigdata.com agent — Access real-time financial data (OAuth)',
    'bigdata,bigdata.com,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Bigdata.com data and capabilities via MCP","Automate Bigdata.com workflows from conversation"]',
    '["Data & Analytics"]',
    '["Bigdata.com account (OAuth connection required)"]',
    '[{"label":"Bigdata.com MCP Server","url":"https://mcp.bigdata.com/"}]',
    'https://icons.duckduckgo.com/ip3/bigdata.com.ico'
  ),
  (
    'BioRender Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a BioRender agent connected via the BioRender MCP at https://mcp.services.biorender.com/mcp. Scientific figures, illustrations You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":5,"hair":4,"shirt":7,"pants":2,"accessory":1,"accent":5,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.services.biorender.com/mcp","name":"biorender","authType":"oauth"}]}',
    'BioRender Agent — connected to BioRender via MCP (OAuth).

BioRender is a platform for creating publication-quality scientific figures and illustrations. Its remote MCP server connects assistants to BioRender''s icon library and figure tools so scientific visuals can be drafted and refined as part of research workflows.

This agent can:
• Access BioRender data and capabilities via MCP
• Automate BioRender workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'BioRender agent — Scientific figures, illustrations (OAuth)',
    'biorender,biorender,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access BioRender data and capabilities via MCP","Automate BioRender workflows from conversation"]',
    '["Business"]',
    '["BioRender account (OAuth connection required)"]',
    '[{"label":"BioRender MCP Server","url":"https://mcp.services.biorender.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/biorender.com.ico'
  ),
  (
    'Blockscout Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Blockscout agent connected via the Blockscout MCP at https://mcp.blockscout.com/mcp. Access and analyze blockchain data You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":0,"hair":4,"shirt":1,"pants":0,"accessory":1,"accent":7,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.blockscout.com/mcp","name":"blockscout","authType":"oauth"}]}',
    'Blockscout Agent — connected to Blockscout via MCP (OAuth).

Blockscout provides multichain blockchain data such as balances, tokens, NFTs, and contract metadata. Its MCP connector gives assistants blockchain context for research, analysis, verification, and cross-chain questions that need structured on-chain information.

This agent can:
• Access Blockscout data and capabilities via MCP
• Analyze data and generate insights

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Blockscout agent — Access and analyze blockchain data (OAuth)',
    'blockscout,blockscout,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Blockscout data and capabilities via MCP","Analyze data and generate insights"]',
    '["Data & Analytics"]',
    '["Blockscout account (OAuth connection required)"]',
    '[{"label":"Blockscout MCP Server","url":"https://mcp.blockscout.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/blockscout.com.ico'
  ),
  (
    'BoardWise Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a BoardWise agent connected via the BoardWise MCP at https://uakozrqrztgrgwoywxkx.supabase.co/functions/v1/mcp-server. Calm board-defense guidance for licensed pros. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":5,"hair":3,"shirt":11,"pants":1,"accessory":5,"accent":0,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://uakozrqrztgrgwoywxkx.supabase.co/functions/v1/mcp-server","name":"boardwise","authType":"oauth"}]}',
    'BoardWise Agent — connected to BoardWise via MCP (OAuth).

BoardWise is a read-only educational MCP server for licensed professionals facing state licensing-board matters. It helps assistants find jurisdiction-specific deadlines, outline responses, and surface curated educational resources while avoiding legal-advice claims.

This agent can:
• Access BoardWise data and capabilities via MCP
• Automate BoardWise workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'BoardWise agent — Calm board-defense guidance for licensed pros. (OAuth)',
    'boardwise,boardwise,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access BoardWise data and capabilities via MCP","Automate BoardWise workflows from conversation"]',
    '["Business"]',
    '["BoardWise account (OAuth connection required)"]',
    '[{"label":"BoardWise MCP Server","url":"https://uakozrqrztgrgwoywxkx.supabase.co/functions/v1/mcp-server"}]',
    'https://icons.duckduckgo.com/ip3/supabase.co.ico'
  ),
  (
    'Booking.com Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Booking.com agent connected via the Booking.com MCP at https://demandapi-mcp.booking.com/v1/mcp/8132308. Find hotels, homes and more You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":2,"shirt":12,"pants":1,"accessory":0,"accent":12,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://demandapi-mcp.booking.com/v1/mcp/8132308","name":"booking","authType":"oauth"}]}',
    'Booking.com Agent — connected to Booking.com via MCP (OAuth).

Booking.com helps travelers search, compare, and choose hotels, homes, and other stays. Its MCP connector brings accommodation options, filters, ratings, facilities, prices, and trip preferences into assistant workflows for faster lodging research.

This agent can:
• Access Booking.com data and capabilities via MCP
• Automate Booking.com workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Booking.com agent — Find hotels, homes and more (OAuth)',
    'booking,booking.com,mcp,Lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Booking.com data and capabilities via MCP","Automate Booking.com workflows from conversation"]',
    '["Lifestyle"]',
    '["Booking.com account (OAuth connection required)"]',
    '[{"label":"Booking.com MCP Server","url":"https://demandapi-mcp.booking.com/v1/mcp/8132308"}]',
    'https://icons.duckduckgo.com/ip3/booking.com.ico'
  ),
  (
    'Brex Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Brex agent connected via the Brex MCP at https://api.brex.com/mcp. Expenses, cards, spend data You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":0,"shirt":2,"pants":1,"accessory":5,"accent":10,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://api.brex.com/mcp","name":"brex","authType":"oauth"}]}',
    'Brex Agent — connected to Brex via MCP (OAuth).

Brex is a spend management platform covering corporate cards, expenses, travel, and bill pay. Its remote MCP server gives assistants governed access to company spend data so expenses can be monitored, policies checked, and finance questions answered with live account context.

This agent can:
• Access Brex data and capabilities via MCP
• Automate Brex workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Brex agent — Expenses, cards, spend data (OAuth)',
    'brex,brex,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Brex data and capabilities via MCP","Automate Brex workflows from conversation"]',
    '["Finance"]',
    '["Brex account (OAuth connection required)"]',
    '[{"label":"Brex MCP Server","url":"https://api.brex.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/brex.com.ico'
  ),
  (
    'Carta Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Carta agent connected via the Carta MCP at https://mcp.app.carta.com/mcp. The connected ERP for private capital You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":3,"hair":2,"shirt":11,"pants":2,"accessory":3,"accent":5,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.app.carta.com/mcp","name":"carta","authType":"oauth"}]}',
    'Carta Agent — connected to Carta via MCP (OAuth).

Carta connects cap table, investor, fund, accounting, and company financial data to AI-assisted private-capital workflows. Its MCP connector helps assistants analyze ownership, valuations, pro-forma rounds, exit scenarios, investment metrics, and fund performance without switching systems.

This agent can:
• Access Carta data and capabilities via MCP
• Automate Carta workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Carta agent — The connected ERP for private capital (OAuth)',
    'carta,carta,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Carta data and capabilities via MCP","Automate Carta workflows from conversation"]',
    '["Development"]',
    '["Carta account (OAuth connection required)"]',
    '[{"label":"Carta MCP Server","url":"https://mcp.app.carta.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/carta.com.ico'
  ),
  (
    'Cash App Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Cash App agent connected via the Cash App MCP at https://connect.squareup.com/v2/mcp/cash-app. Discover local food spots and order with a conversation You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":6,"hair":4,"shirt":4,"pants":0,"accessory":0,"accent":5,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://connect.squareup.com/v2/mcp/cash-app","name":"cash-app","authType":"oauth"}]}',
    'Cash App Agent — connected to Cash App via MCP (OAuth).

Order by Cash App brings local food ordering into assistant workflows. It helps users discover nearby restaurants, compare menus, customize orders, and check out through supported clients while keeping the ordering experience inside the conversation.

This agent can:
• Access Cash App data and capabilities via MCP
• Automate Cash App workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Cash App agent — Discover local food spots and order with a conversation (OAuth)',
    'cash-app,cash app,mcp,Lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Cash App data and capabilities via MCP","Automate Cash App workflows from conversation"]',
    '["Lifestyle"]',
    '["Cash App account (OAuth connection required)"]',
    '[{"label":"Cash App MCP Server","url":"https://connect.squareup.com/v2/mcp/cash-app"}]',
    'https://icons.duckduckgo.com/ip3/squareup.com.ico'
  ),
  (
    'CB Insights Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a CB Insights agent connected via the CB Insights MCP at https://mcp.cbinsights.com. Predictive intelligence on private companies You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":4,"shirt":11,"pants":2,"accessory":0,"accent":7,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.cbinsights.com","name":"cb-insights","authType":"oauth"}]}',
    'CB Insights Agent — connected to CB Insights via MCP (OAuth).

CB Insights provides predictive intelligence on private companies, markets, deals, and technology trends. Its MCP connector gives assistants company profiles, market-map context, investment-research signals, and competitor-monitoring data for private-market workflows.

This agent can:
• Access CB Insights data and capabilities via MCP
• Automate CB Insights workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'CB Insights agent — Predictive intelligence on private companies (OAuth)',
    'cb-insights,cb insights,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access CB Insights data and capabilities via MCP","Automate CB Insights workflows from conversation"]',
    '["Data & Analytics"]',
    '["CB Insights account (OAuth connection required)"]',
    '[{"label":"CB Insights MCP Server","url":"https://mcp.cbinsights.com"}]',
    'https://icons.duckduckgo.com/ip3/cbinsights.com.ico'
  ),
  (
    'Chronograph Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Chronograph agent connected via the Chronograph MCP at https://ai.chronograph.pe/mcp. Interact with your Chronograph data directly in Claude You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":1,"hair":4,"shirt":11,"pants":0,"accessory":0,"accent":0,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://ai.chronograph.pe/mcp","name":"chronograph","authType":"oauth"}]}',
    'Chronograph Agent — connected to Chronograph via MCP (OAuth).

Chronograph connects private-investment portfolio data to assistant workflows. Its connector lets users query portfolio information, analyze investments, search entities, retrieve performance metrics, and access Chronograph help documentation from programmatic portfolio context.

This agent can:
• Access Chronograph data and capabilities via MCP
• Automate Chronograph workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Chronograph agent — Interact with your Chronograph data directly in Claude (OAuth)',
    'chronograph,chronograph,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Chronograph data and capabilities via MCP","Automate Chronograph workflows from conversation"]',
    '["Data & Analytics"]',
    '["Chronograph account (OAuth connection required)"]',
    '[{"label":"Chronograph MCP Server","url":"https://ai.chronograph.pe/mcp"}]',
    'https://icons.duckduckgo.com/ip3/chronograph.pe.ico'
  ),
  (
    'Circleback Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Circleback agent connected via the Circleback MCP at https://app.circleback.ai/api/mcp. Meeting notes, transcripts, action items You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":2,"hair":2,"shirt":5,"pants":1,"accessory":0,"accent":9,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://app.circleback.ai/api/mcp","name":"circleback","authType":"oauth"}]}',
    'Circleback Agent — connected to Circleback via MCP (OAuth).

Circleback is an AI meeting assistant that produces structured notes, transcripts, and action items. Its remote MCP server brings that meeting context into assistant workflows so past conversations, decisions, and follow-ups can be searched and referenced.

This agent can:
• Access Circleback data and capabilities via MCP
• Automate Circleback workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Circleback agent — Meeting notes, transcripts, action items (OAuth)',
    'circleback,circleback,mcp,Communication',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Circleback data and capabilities via MCP","Automate Circleback workflows from conversation"]',
    '["Communication"]',
    '["Circleback account (OAuth connection required)"]',
    '[{"label":"Circleback MCP Server","url":"https://app.circleback.ai/api/mcp"}]',
    'https://icons.duckduckgo.com/ip3/circleback.ai.ico'
  ),
  (
    'Clarify Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Clarify agent connected via the Clarify MCP at https://api.clarify.ai/mcp. Query your CRM. Create records. Ask anything. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":3,"shirt":10,"pants":0,"accessory":0,"accent":12,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://api.clarify.ai/mcp","name":"clarify","authType":"oauth"}]}',
    'Clarify Agent — connected to Clarify via MCP (OAuth).

Clarify is a conversational CRM connector for retrieving, creating, and updating sales records. It helps assistants query deals, companies, people, meetings, tasks, and pipeline context while respecting real-time Clarify data and permissions.

This agent can:
• Access Clarify data and capabilities via MCP
• Automate Clarify workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Clarify agent — Query your CRM. Create records. Ask anything. (OAuth)',
    'clarify,clarify,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Clarify data and capabilities via MCP","Automate Clarify workflows from conversation"]',
    '["Business"]',
    '["Clarify account (OAuth connection required)"]',
    '[{"label":"Clarify MCP Server","url":"https://api.clarify.ai/mcp"}]',
    'https://icons.duckduckgo.com/ip3/clarify.ai.ico'
  ),
  (
    'Clarity AI Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Clarity AI agent connected via the Clarity AI MCP at https://clarity-sfdr20-mcp.pro.clarity.ai/mcp. Simulate fund classifications under proposed SFDR 2.0 You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":0,"hair":3,"shirt":1,"pants":1,"accessory":1,"accent":10,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://clarity-sfdr20-mcp.pro.clarity.ai/mcp","name":"clarity-ai","authType":"oauth"}]}',
    'Clarity AI Agent — connected to Clarity AI via MCP (OAuth).

Clarity AI helps investment and compliance teams simulate fund classifications under the proposed SFDR 2.0 framework. Its MCP connector searches funds and applies Clarity AI regulatory data and modelling to support ESG and transition-planning workflows.

This agent can:
• Access Clarity AI data and capabilities via MCP
• Automate Clarity AI workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Clarity AI agent — Simulate fund classifications under proposed SFDR 2.0 (OAuth)',
    'clarity-ai,clarity ai,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Clarity AI data and capabilities via MCP","Automate Clarity AI workflows from conversation"]',
    '["AI & ML"]',
    '["Clarity AI account (OAuth connection required)"]',
    '[{"label":"Clarity AI MCP Server","url":"https://clarity-sfdr20-mcp.pro.clarity.ai/mcp"}]',
    'https://icons.duckduckgo.com/ip3/clarity.ai.ico'
  ),
  (
    'Clay Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Clay agent connected via the Clay MCP at https://api.clay.com/v3/mcp. Prospecting, enrichment, GTM workflows You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":3,"shirt":4,"pants":1,"accessory":0,"accent":10,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://api.clay.com/v3/mcp","name":"clay","authType":"oauth"}]}',
    'Clay Agent — connected to Clay via MCP (OAuth).

Clay is a go-to-market platform for prospecting, data enrichment, and outbound workflows. Its remote MCP server lets assistants search companies and people, enrich records from dozens of data providers, and drive GTM tables using natural language.

This agent can:
• Access Clay data and capabilities via MCP
• Automate Clay workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Clay agent — Prospecting, enrichment, GTM workflows (OAuth)',
    'clay,clay,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Clay data and capabilities via MCP","Automate Clay workflows from conversation"]',
    '["Business"]',
    '["Clay account (OAuth connection required)"]',
    '[{"label":"Clay MCP Server","url":"https://api.clay.com/v3/mcp"}]',
    'https://icons.duckduckgo.com/ip3/clay.com.ico'
  ),
  (
    'Clerk Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Clerk agent connected via the Clerk MCP at https://mcp.clerk.com/mcp. Add authentication, organizations, and billing You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":2,"shirt":7,"pants":0,"accessory":4,"accent":7,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.clerk.com/mcp","name":"clerk","authType":"oauth"}]}',
    'Clerk Agent — connected to Clerk via MCP (OAuth).

Clerk provides authentication, organization management, and billing implementation support for application developers. Its connector brings current SDK snippets, route-protection patterns, B2B organization examples, and framework-specific guidance into assistant coding workflows.

This agent can:
• Access Clerk data and capabilities via MCP
• Automate Clerk workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Clerk agent — Add authentication, organizations, and billing (OAuth)',
    'clerk,clerk,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Clerk data and capabilities via MCP","Automate Clerk workflows from conversation"]',
    '["Business"]',
    '["Clerk account (OAuth connection required)"]',
    '[{"label":"Clerk MCP Server","url":"https://mcp.clerk.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/clerk.com.ico'
  ),
  (
    'Clockwise Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Clockwise agent connected via the Clockwise MCP at https://mcp.getclockwise.com/mcp. Advanced scheduling and time management for work. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":2,"shirt":4,"pants":1,"accessory":4,"accent":1,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.getclockwise.com/mcp","name":"clockwise","authType":"oauth"}]}',
    'Clockwise Agent — connected to Clockwise via MCP (OAuth).

Clockwise helps teams schedule meetings, protect focus time, and coordinate calendars across working hours, time zones, and participant constraints. Its MCP connector gives assistants scheduling context for rescheduling, time blocking, and complex meeting coordination.

This agent can:
• Access Clockwise data and capabilities via MCP
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Clockwise agent — Advanced scheduling and time management for work. (OAuth)',
    'clockwise,clockwise,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Clockwise data and capabilities via MCP","Create and manage resources"]',
    '["Business"]',
    '["Clockwise account (OAuth connection required)"]',
    '[{"label":"Clockwise MCP Server","url":"https://mcp.getclockwise.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/getclockwise.com.ico'
  ),
  (
    'CoinDesk Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a CoinDesk agent connected via the CoinDesk MCP at https://mcp.coindesk.com/mcp. Access Live & Historical Crypto Data, Indices You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":2,"shirt":5,"pants":0,"accessory":0,"accent":3,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.coindesk.com/mcp","name":"coindesk","authType":"oauth"}]}',
    'CoinDesk Agent — connected to CoinDesk via MCP (OAuth).

CoinDesk Data and Indices provides real-time and historical digital asset market data, regulated indices, benchmarks, spot prices, derivatives data, and exchange metrics. Its connector gives assistants crypto-market context for trader, analyst, and research workflows.

This agent can:
• Access CoinDesk data and capabilities via MCP
• Automate CoinDesk workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'CoinDesk agent — Access Live & Historical Crypto Data, Indices (OAuth)',
    'coindesk,coindesk,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access CoinDesk data and capabilities via MCP","Automate CoinDesk workflows from conversation"]',
    '["Data & Analytics"]',
    '["CoinDesk account (OAuth connection required)"]',
    '[{"label":"CoinDesk MCP Server","url":"https://mcp.coindesk.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/coindesk.com.ico'
  ),
  (
    'Common Room Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Common Room agent connected via the Common Room MCP at https://mcp.commonroom.io/mcp. Community signals, GTM intelligence You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":0,"hair":4,"shirt":1,"pants":1,"accessory":0,"accent":9,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.commonroom.io/mcp","name":"common-room","authType":"oauth"}]}',
    'Common Room Agent — connected to Common Room via MCP (OAuth).

Common Room is a customer intelligence platform that unifies product, community, and social signals for go-to-market teams. Its remote MCP server lets assistants query member activity, account signals, and engagement data to inform sales and community work.

This agent can:
• Access Common Room data and capabilities via MCP
• Automate Common Room workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Common Room agent — Community signals, GTM intelligence (OAuth)',
    'common-room,common room,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Common Room data and capabilities via MCP","Automate Common Room workflows from conversation"]',
    '["Business"]',
    '["Common Room account (OAuth connection required)"]',
    '[{"label":"Common Room MCP Server","url":"https://mcp.commonroom.io/mcp"}]',
    'https://icons.duckduckgo.com/ip3/commonroom.io.ico'
  ),
  (
    'Consensus Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Consensus agent connected via the Consensus MCP at https://mcp.consensus.app/mcp. Explore scientific research You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":6,"hair":4,"shirt":9,"pants":2,"accessory":3,"accent":9,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.consensus.app/mcp","name":"consensus","authType":"oauth"}]}',
    'Consensus Agent — connected to Consensus via MCP (OAuth).

Consensus connects assistants to a large corpus of peer-reviewed academic research. Its MCP connector supports searching, synthesizing, and building structured research outputs from scientific papers so answers can be grounded in scholarly sources.

This agent can:
• Access Consensus data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Consensus agent — Explore scientific research (OAuth)',
    'consensus,consensus,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Consensus data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["Consensus account (OAuth connection required)"]',
    '[{"label":"Consensus MCP Server","url":"https://mcp.consensus.app/mcp"}]',
    'https://icons.duckduckgo.com/ip3/consensus.app.ico'
  ),
  (
    'Contentsquare Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Contentsquare agent connected via the Contentsquare MCP at https://api.contentsquare.com/mcp. Experience analytics platform for digital businesses You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":5,"hair":6,"shirt":8,"pants":2,"accessory":2,"accent":7,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://api.contentsquare.com/mcp","name":"contentsquare","authType":"oauth"}]}',
    'Contentsquare Agent — connected to Contentsquare via MCP (OAuth).

Contentsquare is an experience analytics platform that captures and analyzes user behavior across digital products. Its connector gives assistants analytics context for understanding what users do, why patterns emerge, and how product teams can investigate behavior.

This agent can:
• Access Contentsquare data and capabilities via MCP
• Automate Contentsquare workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Contentsquare agent — Experience analytics platform for digital businesses (OAuth)',
    'contentsquare,contentsquare,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Contentsquare data and capabilities via MCP","Automate Contentsquare workflows from conversation"]',
    '["Data & Analytics"]',
    '["Contentsquare account (OAuth connection required)"]',
    '[{"label":"Contentsquare MCP Server","url":"https://api.contentsquare.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/contentsquare.com.ico'
  ),
  (
    'Control Plane Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Control Plane agent connected via the Control Plane MCP at https://mcp.cpln.io/mcp. Multi-cloud workloads, GVCs, infrastructure You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":0,"shirt":11,"pants":1,"accessory":3,"accent":9,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.cpln.io/mcp","name":"control-plane","authType":"oauth"}]}',
    'Control Plane Agent — connected to Control Plane via MCP (OAuth).

Control Plane is a platform for running cloud-native workloads across multiple clouds and regions from a single control plane. Its remote MCP server lets assistants inspect and manage workloads, GVCs, and related infrastructure resources in a Control Plane organization directly from conversation.

This agent can:
• Access Control Plane data and capabilities via MCP
• Automate Control Plane workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Control Plane agent — Multi-cloud workloads, GVCs, infrastructure (OAuth)',
    'control-plane,control plane,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Control Plane data and capabilities via MCP","Automate Control Plane workflows from conversation"]',
    '["Business"]',
    '["Control Plane account (OAuth connection required)"]',
    '[{"label":"Control Plane MCP Server","url":"https://mcp.cpln.io/mcp"}]',
    'https://icons.duckduckgo.com/ip3/cpln.io.ico'
  ),
  (
    'COROS Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a COROS agent connected via the COROS MCP at https://mcp.coros.com/mcp. Training history, fitness metrics, health data You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":7,"shirt":1,"pants":1,"accessory":5,"accent":8,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.coros.com/mcp","name":"coros","authType":"oauth"}]}',
    'COROS Agent — connected to COROS via MCP (OAuth).

COROS is a sports technology company making GPS watches and training tools for endurance athletes. Its remote MCP server bridges COROS training history into assistant workflows, giving access to workout records, fitness metrics like VO2max and training load, and daily health data such as sleep, heart rate, and HRV.

This agent can:
• Access COROS data and capabilities via MCP
• Automate COROS workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'COROS agent — Training history, fitness metrics, health data (OAuth)',
    'coros,coros,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access COROS data and capabilities via MCP","Automate COROS workflows from conversation"]',
    '["Data & Analytics"]',
    '["COROS account (OAuth connection required)"]',
    '[{"label":"COROS MCP Server","url":"https://mcp.coros.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/coros.com.ico'
  ),
  (
    'Cortellis Regulatory Intelligence Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Cortellis Regulatory Intelligence agent connected via the Cortellis Regulatory Intelligence MCP at https://api.clarivate.com/lifesciences/mcp-regulatory/mcp. Drug regulatory guidance, Clarivate You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":5,"shirt":6,"pants":2,"accessory":2,"accent":6,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://api.clarivate.com/lifesciences/mcp-regulatory/mcp","name":"cortellis-regulatory-intelligence","authType":"oauth"}]}',
    'Cortellis Regulatory Intelligence Agent — connected to Cortellis Regulatory Intelligence via MCP (OAuth).

Cortellis Regulatory Intelligence is Clarivate''s database of global drug regulatory guidance, requirements, and agency correspondence. Its remote MCP server gives life-sciences teams assistant access to regulatory documents and intelligence for research and compliance work.

This agent can:
• Access Cortellis Regulatory Intelligence data and capabilities via MCP
• Automate Cortellis Regulatory Intelligence workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Cortellis Regulatory Intelligence agent — Drug regulatory guidance, Clarivate (OAuth)',
    'cortellis-regulatory-intelligence,cortellis regulatory intelligence,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Cortellis Regulatory Intelligence data and capabilities via MCP","Automate Cortellis Regulatory Intelligence workflows from conversation"]',
    '["Business"]',
    '["Cortellis Regulatory Intelligence account (OAuth connection required)"]',
    '[{"label":"Cortellis Regulatory Intelligence MCP Server","url":"https://api.clarivate.com/lifesciences/mcp-regulatory/mcp"}]',
    'https://icons.duckduckgo.com/ip3/clarivate.com.ico'
  ),
  (
    'Coupler.io Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Coupler.io agent connected via the Coupler.io MCP at https://mcp.coupler.io/mcp. Access business data from hundreds of sources You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":4,"hair":1,"shirt":2,"pants":2,"accessory":4,"accent":12,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.coupler.io/mcp","name":"coupler-io","authType":"oauth"}]}',
    'Coupler.io Agent — connected to Coupler.io via MCP (OAuth).

Coupler.io connects marketing, sales, finance, ecommerce, and other business data from hundreds of sources. Its connector lets assistants query Coupler.io data flows, transform raw platform metrics, and turn multi-channel information into analysis-ready business insight.

This agent can:
• Access Coupler.io data and capabilities via MCP
• Automate Coupler.io workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Coupler.io agent — Access business data from hundreds of sources (OAuth)',
    'coupler-io,coupler.io,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Coupler.io data and capabilities via MCP","Automate Coupler.io workflows from conversation"]',
    '["Data & Analytics"]',
    '["Coupler.io account (OAuth connection required)"]',
    '[{"label":"Coupler.io MCP Server","url":"https://mcp.coupler.io/mcp"}]',
    'https://icons.duckduckgo.com/ip3/coupler.io.ico'
  ),
  (
    'CourtListener Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a CourtListener agent connected via the CourtListener MCP at https://mcp.courtlistener.com/. Legal research across millions of court records You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":6,"shirt":12,"pants":0,"accessory":4,"accent":6,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.courtlistener.com/","name":"courtlistener","authType":"oauth"}]}',
    'CourtListener Agent — connected to CourtListener via MCP (OAuth).

CourtListener is Free Law Project''s legal research platform for U.S. court opinions, PACER dockets, judge profiles, oral arguments, and citation data. Its connector grounds assistants in primary legal records while supporting citation checks and docket-aware research.

This agent can:
• Access CourtListener data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'CourtListener agent — Legal research across millions of court records (OAuth)',
    'courtlistener,courtlistener,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access CourtListener data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["CourtListener account (OAuth connection required)"]',
    '[{"label":"CourtListener MCP Server","url":"https://mcp.courtlistener.com/"}]',
    'https://icons.duckduckgo.com/ip3/courtlistener.com.ico'
  ),
  (
    'Courtroom5 Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Courtroom5 agent connected via the Courtroom5 MCP at https://mcp.courtroom5.com/v1. Civil legal guidance for self-represented litigants You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":5,"hair":7,"shirt":6,"pants":1,"accessory":5,"accent":6,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.courtroom5.com/v1","name":"courtroom5","authType":"oauth"}]}',
    'Courtroom5 Agent — connected to Courtroom5 via MCP (OAuth).

Courtroom5 provides jurisdiction-aware civil legal guidance for self-represented litigants across U.S. states. Its connector supports case intake, procedural deadline calculations, and next-step guidance while keeping outputs framed as informational support rather than legal advice.

This agent can:
• Access Courtroom5 data and capabilities via MCP
• Automate Courtroom5 workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Courtroom5 agent — Civil legal guidance for self-represented litigants (OAuth)',
    'courtroom5,courtroom5,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Courtroom5 data and capabilities via MCP","Automate Courtroom5 workflows from conversation"]',
    '["Business"]',
    '["Courtroom5 account (OAuth connection required)"]',
    '[{"label":"Courtroom5 MCP Server","url":"https://mcp.courtroom5.com/v1"}]',
    'https://icons.duckduckgo.com/ip3/courtroom5.com.ico'
  ),
  (
    'Craft Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Craft agent connected via the Craft MCP at https://mcp.craft.do/my/mcp. Notes & second brain You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":4,"hair":1,"shirt":0,"pants":1,"accessory":3,"accent":9,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.craft.do/my/mcp","name":"craft","authType":"oauth"}]}',
    'Craft Agent — connected to Craft via MCP (OAuth).

Craft helps users create structured documents, manage tasks, and organize a personal knowledge base. Its connector gives assistants a persistent workspace for saving research, drafting content, tracking to-dos, and arranging information into folders.

This agent can:
• Access Craft data and capabilities via MCP
• Automate Craft workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Craft agent — Notes & second brain (OAuth)',
    'craft,craft,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Craft data and capabilities via MCP","Automate Craft workflows from conversation"]',
    '["Development"]',
    '["Craft account (OAuth connection required)"]',
    '[{"label":"Craft MCP Server","url":"https://mcp.craft.do/my/mcp"}]',
    'https://icons.duckduckgo.com/ip3/craft.do.ico'
  ),
  (
    'Credit Karma Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Credit Karma agent connected via the Credit Karma MCP at https://mcp.creditkarma.com/mcp. Credit scores, financial insights You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":6,"hair":4,"shirt":3,"pants":0,"accessory":0,"accent":1,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.creditkarma.com/mcp","name":"credit-karma","authType":"oauth"}]}',
    'Credit Karma Agent — connected to Credit Karma via MCP (OAuth).

Credit Karma is Intuit''s personal finance platform for credit scores, reports, and financial recommendations. Its remote MCP server lets assistants reference a member''s credit and financial picture to answer questions and surface personalized insights.

This agent can:
• Access Credit Karma data and capabilities via MCP
• Automate Credit Karma workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Credit Karma agent — Credit scores, financial insights (OAuth)',
    'credit-karma,credit karma,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Credit Karma data and capabilities via MCP","Automate Credit Karma workflows from conversation"]',
    '["Data & Analytics"]',
    '["Credit Karma account (OAuth connection required)"]',
    '[{"label":"Credit Karma MCP Server","url":"https://mcp.creditkarma.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/creditkarma.com.ico'
  ),
  (
    'Crossbeam Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Crossbeam agent connected via the Crossbeam MCP at https://mcp.crossbeam.com. Explore partner data and ecosystem insights in Claude You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":5,"hair":7,"shirt":3,"pants":1,"accessory":0,"accent":4,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.crossbeam.com","name":"crossbeam","authType":"oauth"}]}',
    'Crossbeam Agent — connected to Crossbeam via MCP (OAuth).

Crossbeam brings partner and account data into ecosystem-intelligence workflows. Its connector lets assistants surface overlaps, partner activity, warm paths, and co-sell opportunities so AI responses can reflect real-time partnership context.

This agent can:
• Access Crossbeam data and capabilities via MCP
• Automate Crossbeam workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Crossbeam agent — Explore partner data and ecosystem insights in Claude (OAuth)',
    'crossbeam,crossbeam,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Crossbeam data and capabilities via MCP","Automate Crossbeam workflows from conversation"]',
    '["Data & Analytics"]',
    '["Crossbeam account (OAuth connection required)"]',
    '[{"label":"Crossbeam MCP Server","url":"https://mcp.crossbeam.com"}]',
    'https://icons.duckduckgo.com/ip3/crossbeam.com.ico'
  ),
  (
    'Crypto.com Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Crypto.com agent connected via the Crypto.com MCP at https://mcp.crypto.com/market-data/mcp. Real time prices, orders, charts, and more for crypto You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":4,"shirt":10,"pants":1,"accessory":3,"accent":12,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.crypto.com/market-data/mcp","name":"crypto-com","authType":"oauth"}]}',
    'Crypto.com Agent — connected to Crypto.com via MCP (OAuth).

Crypto.com provides real-time cryptocurrency price quotes, order books, conversions, candlestick charts, and token-market information. Its connector gives assistants market context for crypto research, comparisons, and trading-oriented questions.

This agent can:
• Access Crypto.com data and capabilities via MCP
• Automate Crypto.com workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Crypto.com agent — Real time prices, orders, charts, and more for crypto (OAuth)',
    'crypto-com,crypto.com,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Crypto.com data and capabilities via MCP","Automate Crypto.com workflows from conversation"]',
    '["Finance"]',
    '["Crypto.com account (OAuth connection required)"]',
    '[{"label":"Crypto.com MCP Server","url":"https://mcp.crypto.com/market-data/mcp"}]',
    'https://icons.duckduckgo.com/ip3/crypto.com.ico'
  ),
  (
    'D&B Risk Analytics Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a D&B Risk Analytics agent connected via the D&B Risk Analytics MCP at https://agents.riskanalytics.dnb.com/mcp. Execute risk workflows powered by the D&B Commercial Graph™ You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":2,"shirt":6,"pants":0,"accessory":3,"accent":6,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://agents.riskanalytics.dnb.com/mcp","name":"dnb-risk-analytics","authType":"oauth"}]}',
    'D&B Risk Analytics Agent — connected to D&B Risk Analytics via MCP (OAuth).

Execute risk workflows powered by the D&B Commercial Graph™

This agent can:
• Access D&B Risk Analytics data and capabilities via MCP
• Automate D&B Risk Analytics workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'D&B Risk Analytics agent — Execute risk workflows powered by the D&B Commercial Graph™ (OAuth)',
    'dnb-risk-analytics,d&b risk analytics,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access D&B Risk Analytics data and capabilities via MCP","Automate D&B Risk Analytics workflows from conversation"]',
    '["Data & Analytics"]',
    '["D&B Risk Analytics account (OAuth connection required)"]',
    '[{"label":"D&B Risk Analytics MCP Server","url":"https://agents.riskanalytics.dnb.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/dnb.com.ico'
  ),
  (
    'Daloopa Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Daloopa agent connected via the Daloopa MCP at https://mcp.daloopa.com/server/mcp. Financial fundamental data and KPIs with hyperlinks You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":7,"shirt":5,"pants":2,"accessory":1,"accent":11,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.daloopa.com/server/mcp","name":"daloopa","authType":"oauth"}]}',
    'Daloopa Agent — connected to Daloopa via MCP (OAuth).

Daloopa supplies financial fundamentals and KPI data sourced from SEC filings, investor presentations, and public financial documents. Its connector gives assistants source-linked data points for quantitative financial analysis, dashboards, and company comparisons.

This agent can:
• Access Daloopa data and capabilities via MCP
• Automate Daloopa workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Daloopa agent — Financial fundamental data and KPIs with hyperlinks (OAuth)',
    'daloopa,daloopa,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Daloopa data and capabilities via MCP","Automate Daloopa workflows from conversation"]',
    '["Data & Analytics"]',
    '["Daloopa account (OAuth connection required)"]',
    '[{"label":"Daloopa MCP Server","url":"https://mcp.daloopa.com/server/mcp"}]',
    'https://icons.duckduckgo.com/ip3/daloopa.com.ico'
  ),
  (
    'Datasite Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Datasite agent connected via the Datasite MCP at https://mcp.global.datasite.com/mcp. Manage your M&A data room from Claude You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":5,"hair":7,"shirt":3,"pants":2,"accessory":3,"accent":6,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.global.datasite.com/mcp","name":"datasite","authType":"oauth"}]}',
    'Datasite Agent — connected to Datasite via MCP (OAuth).

Datasite supports M&A data-room workflows for diligence content and transaction collaboration. Its MCP connector gives assistants deal-room context for locating materials, understanding project state, and helping teams coordinate work during mergers and acquisitions.

This agent can:
• Access Datasite data and capabilities via MCP
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Datasite agent — Manage your M&A data room from Claude (OAuth)',
    'datasite,datasite,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Datasite data and capabilities via MCP","Create and manage resources"]',
    '["Data & Analytics"]',
    '["Datasite account (OAuth connection required)"]',
    '[{"label":"Datasite MCP Server","url":"https://mcp.global.datasite.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/datasite.com.ico'
  ),
  (
    'Day AI Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Day AI agent connected via the Day AI MCP at https://day.ai/api/mcp. Know everything about your prospects & customers with CRMx You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":2,"hair":0,"shirt":7,"pants":2,"accessory":1,"accent":9,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://day.ai/api/mcp","name":"day-ai","authType":"oauth"}]}',
    'Day AI Agent — connected to Day AI via MCP (OAuth).

Day AI focuses on prospect and customer intelligence through CRMx context. Its MCP connector gives assistants account, relationship, and customer data for sales research, follow-up planning, and understanding what matters across prospects and existing customers.

This agent can:
• Access Day AI data and capabilities via MCP
• Automate Day AI workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Day AI agent — Know everything about your prospects & customers with CRMx (OAuth)',
    'day-ai,day ai,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Day AI data and capabilities via MCP","Automate Day AI workflows from conversation"]',
    '["Business"]',
    '["Day AI account (OAuth connection required)"]',
    '[{"label":"Day AI MCP Server","url":"https://day.ai/api/mcp"}]',
    'https://icons.duckduckgo.com/ip3/day.ai.ico'
  ),
  (
    'Definely Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Definely agent connected via the Definely MCP at https://mcp.eu.definely.com/api/proxy/core-mcp. Structured contract review tools for legal teams You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":1,"hair":4,"shirt":3,"pants":2,"accessory":5,"accent":4,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.eu.definely.com/api/proxy/core-mcp","name":"definely","authType":"oauth"}]}',
    'Definely Agent — connected to Definely via MCP (OAuth).

Definely provides structured contract review tools for legal teams. Its connector brings legal-document context into assistant workflows so users can review clauses, reason over agreement language, and support contract analysis with a purpose-built legal toolset.

This agent can:
• Access Definely data and capabilities via MCP
• Automate Definely workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Definely agent — Structured contract review tools for legal teams (OAuth)',
    'definely,definely,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Definely data and capabilities via MCP","Automate Definely workflows from conversation"]',
    '["Business"]',
    '["Definely account (OAuth connection required)"]',
    '[{"label":"Definely MCP Server","url":"https://mcp.eu.definely.com/api/proxy/core-mcp"}]',
    'https://icons.duckduckgo.com/ip3/definely.com.ico'
  ),
  (
    'Descrybe Legal Engine Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Descrybe Legal Engine agent connected via the Descrybe Legal Engine MCP at https://mcp.descrybe.com/mcp. Ground your work in clean, structured U.S. primary law You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":3,"shirt":2,"pants":0,"accessory":1,"accent":8,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.descrybe.com/mcp","name":"descrybe-legal-engine","authType":"oauth"}]}',
    'Descrybe Legal Engine Agent — connected to Descrybe Legal Engine via MCP (OAuth).

Descrybe Legal Engine provides structured U.S. primary-law context for legal work. Its connector helps assistants ground legal research in clean source material, supporting searches, summaries, and analysis across U.S. legal documents.

This agent can:
• Access Descrybe Legal Engine data and capabilities via MCP
• Automate Descrybe Legal Engine workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Descrybe Legal Engine agent — Ground your work in clean, structured U.S. primary law (OAuth)',
    'descrybe-legal-engine,descrybe legal engine,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Descrybe Legal Engine data and capabilities via MCP","Automate Descrybe Legal Engine workflows from conversation"]',
    '["Business"]',
    '["Descrybe Legal Engine account (OAuth connection required)"]',
    '[{"label":"Descrybe Legal Engine MCP Server","url":"https://mcp.descrybe.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/descrybe.com.ico'
  ),
  (
    'Digits Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Digits agent connected via the Digits MCP at https://api.digits.com/mcp. Track and analyze your finances with Digits You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":0,"shirt":2,"pants":0,"accessory":5,"accent":8,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://api.digits.com/mcp","name":"digits","authType":"oauth"}]}',
    'Digits Agent — connected to Digits via MCP (OAuth).

Digits helps users track and analyze business finances through connected accounting context. Its connector gives assistants financial data for reviewing performance, answering finance questions, and understanding company numbers from conversational prompts.

This agent can:
• Access Digits data and capabilities via MCP
• Analyze data and generate insights

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Digits agent — Track and analyze your finances with Digits (OAuth)',
    'digits,digits,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Digits data and capabilities via MCP","Analyze data and generate insights"]',
    '["Finance"]',
    '["Digits account (OAuth connection required)"]',
    '[{"label":"Digits MCP Server","url":"https://api.digits.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/digits.com.ico'
  ),
  (
    'DirectBooker Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a DirectBooker agent connected via the DirectBooker MCP at https://www.directbooker.ai/claude. Compare hotels, then book direct You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":3,"shirt":1,"pants":1,"accessory":3,"accent":7,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://www.directbooker.ai/claude","name":"directbooker","authType":"oauth"}]}',
    'DirectBooker Agent — connected to DirectBooker via MCP (OAuth).

DirectBooker helps travelers compare hotels and book directly with properties. Its connector brings hotel comparison, direct-booking context, and travel preferences into assistant workflows so users can move from research to booking more efficiently.

This agent can:
• Access DirectBooker data and capabilities via MCP
• Automate DirectBooker workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'DirectBooker agent — Compare hotels, then book direct (OAuth)',
    'directbooker,directbooker,mcp,Lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access DirectBooker data and capabilities via MCP","Automate DirectBooker workflows from conversation"]',
    '["Lifestyle"]',
    '["DirectBooker account (OAuth connection required)"]',
    '[{"label":"DirectBooker MCP Server","url":"https://www.directbooker.ai/claude"}]',
    'https://icons.duckduckgo.com/ip3/directbooker.ai.ico'
  ),
  (
    'Dovetail Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Dovetail agent connected via the Dovetail MCP at https://dovetail.com/api/mcp. Turn feedback into decisions You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":1,"hair":6,"shirt":8,"pants":1,"accessory":0,"accent":5,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://dovetail.com/api/mcp","name":"dovetail","authType":"oauth"}]}',
    'Dovetail Agent — connected to Dovetail via MCP (OAuth).

Dovetail helps teams turn customer feedback and research data into decisions. Its connector gives assistants access to feedback context so user insights, themes, and evidence can be searched, summarized, and connected to product decisions.

This agent can:
• Access Dovetail data and capabilities via MCP
• Automate Dovetail workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Dovetail agent — Turn feedback into decisions (OAuth)',
    'dovetail,dovetail,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Dovetail data and capabilities via MCP","Automate Dovetail workflows from conversation"]',
    '["AI & ML"]',
    '["Dovetail account (OAuth connection required)"]',
    '[{"label":"Dovetail MCP Server","url":"https://dovetail.com/api/mcp"}]',
    'https://icons.duckduckgo.com/ip3/dovetail.com.ico'
  ),
  (
    'Egnyte Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Egnyte agent connected via the Egnyte MCP at https://mcp-server.egnyte.com/mcp. Securely access and analyze Egnyte content. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":4,"hair":7,"shirt":4,"pants":1,"accessory":0,"accent":10,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp-server.egnyte.com/mcp","name":"egnyte","authType":"oauth"}]}',
    'Egnyte Agent — connected to Egnyte via MCP (OAuth).

Egnyte is a governed content collaboration platform for secure files and business documents. Its connector gives assistants permission-aware access to Egnyte content for search, review, summarization, and knowledge work.

This agent can:
• Access Egnyte data and capabilities via MCP
• Analyze data and generate insights

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Egnyte agent — Securely access and analyze Egnyte content. (OAuth)',
    'egnyte,egnyte,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Egnyte data and capabilities via MCP","Analyze data and generate insights"]',
    '["Business"]',
    '["Egnyte account (OAuth connection required)"]',
    '[{"label":"Egnyte MCP Server","url":"https://mcp-server.egnyte.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/egnyte.com.ico'
  ),
  (
    'Enterpret Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Enterpret agent connected via the Enterpret MCP at https://wisdom-api.enterpret.com/server/mcp. Get answers from unified feedback of your customers. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":7,"shirt":9,"pants":2,"accessory":4,"accent":0,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://wisdom-api.enterpret.com/server/mcp","name":"enterpret","authType":"oauth"}]}',
    'Enterpret Agent — connected to Enterpret via MCP (OAuth).

Enterpret unifies customer feedback so teams can ask questions and understand themes across product, support, and customer channels. Its connector gives assistants feedback context for analysis, summaries, and decision support.

This agent can:
• Access Enterpret data and capabilities via MCP
• Automate Enterpret workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Enterpret agent — Get answers from unified feedback of your customers. (OAuth)',
    'enterpret,enterpret,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Enterpret data and capabilities via MCP","Automate Enterpret workflows from conversation"]',
    '["Business"]',
    '["Enterpret account (OAuth connection required)"]',
    '[{"label":"Enterpret MCP Server","url":"https://wisdom-api.enterpret.com/server/mcp"}]',
    'https://icons.duckduckgo.com/ip3/enterpret.com.ico'
  ),
  (
    'Era Context Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Era Context agent connected via the Era Context MCP at https://context.era.app. Manage your personal finances using Claude You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":1,"shirt":7,"pants":2,"accessory":2,"accent":2,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://context.era.app","name":"era-context","authType":"oauth"}]}',
    'Era Context Agent — connected to Era Context via MCP (OAuth).

Era Context brings personal-finance context into assistant workflows. Its connector helps users reason over financial information, ask questions about money decisions, and organize personal finance tasks with connected account context.

This agent can:
• Access Era Context data and capabilities via MCP
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Era Context agent — Manage your personal finances using Claude (OAuth)',
    'era-context,era context,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Era Context data and capabilities via MCP","Create and manage resources"]',
    '["Finance"]',
    '["Era Context account (OAuth connection required)"]',
    '[{"label":"Era Context MCP Server","url":"https://context.era.app"}]',
    'https://icons.duckduckgo.com/ip3/era.app.ico'
  ),
  (
    'Eraser Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Eraser agent connected via the Eraser MCP at https://app.eraser.io/api/mcp. Generate, manage, and update Eraser diagrams and files You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":3,"hair":3,"shirt":1,"pants":0,"accessory":4,"accent":1,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://app.eraser.io/api/mcp","name":"eraser","authType":"oauth"}]}',
    'Eraser Agent — connected to Eraser via MCP (OAuth).

Eraser helps teams generate, manage, and update diagrams and technical files. Its connector lets assistants create and revise visual system artifacts so architecture, product, and engineering ideas can be captured from conversation.

This agent can:
• Access Eraser data and capabilities via MCP
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Eraser agent — Generate, manage, and update Eraser diagrams and files (OAuth)',
    'eraser,eraser,mcp,Design',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Eraser data and capabilities via MCP","Create and manage resources"]',
    '["Design"]',
    '["Eraser account (OAuth connection required)"]',
    '[{"label":"Eraser MCP Server","url":"https://app.eraser.io/api/mcp"}]',
    'https://icons.duckduckgo.com/ip3/eraser.io.ico'
  ),
  (
    'Everlaw Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Everlaw agent connected via the Everlaw MCP at https://api.everlaw.com/v1/mcp. Search and explore your Everlaw database in Claude. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":0,"hair":1,"shirt":10,"pants":2,"accessory":2,"accent":10,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://api.everlaw.com/v1/mcp","name":"everlaw","authType":"oauth"}]}',
    'Everlaw Agent — connected to Everlaw via MCP (OAuth).

Everlaw supports legal teams working with litigation databases, discovery records, and case materials. Its connector brings Everlaw search and exploration context into assistant workflows for reviewing evidence, finding documents, and understanding case data.

This agent can:
• Access Everlaw data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Everlaw agent — Search and explore your Everlaw database in Claude. (OAuth)',
    'everlaw,everlaw,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Everlaw data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["Everlaw account (OAuth connection required)"]',
    '[{"label":"Everlaw MCP Server","url":"https://api.everlaw.com/v1/mcp"}]',
    'https://icons.duckduckgo.com/ip3/everlaw.com.ico'
  ),
  (
    'Excalidraw Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Excalidraw agent connected via the Excalidraw MCP at https://excalidraw-mcp-app.vercel.app/mcp. MCP for creating interactive hand-drawn diagrams in Excalidraw You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":5,"shirt":6,"pants":2,"accessory":3,"accent":1,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://excalidraw-mcp-app.vercel.app/mcp","name":"excalidraw-app-demo","authType":"oauth"}]}',
    'Excalidraw Agent — connected to Excalidraw via MCP (OAuth).

Excalidraw creates interactive hand-drawn diagrams from assistant conversations. Its MCP connector gives users a way to turn ideas, flows, and sketches into editable visual diagrams inside Excalidraw.

This agent can:
• Access Excalidraw data and capabilities via MCP
• Automate Excalidraw workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Excalidraw agent — MCP for creating interactive hand-drawn diagrams in Excalidraw (OAuth)',
    'excalidraw-app-demo,excalidraw,mcp,Design',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Excalidraw data and capabilities via MCP","Automate Excalidraw workflows from conversation"]',
    '["Design"]',
    '["Excalidraw account (OAuth connection required)"]',
    '[{"label":"Excalidraw MCP Server","url":"https://excalidraw-mcp-app.vercel.app/mcp"}]',
    'https://icons.duckduckgo.com/ip3/vercel.app.ico'
  ),
  (
    'Expedia Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Expedia agent connected via the Expedia MCP at https://www.expedia.com/mcp. Plan trips, flights and hotels You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":6,"hair":3,"shirt":11,"pants":0,"accessory":3,"accent":5,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://www.expedia.com/mcp","name":"expedia","authType":"oauth"}]}',
    'Expedia Agent — connected to Expedia via MCP (OAuth).

Expedia helps users plan trips, flights, hotels, and travel itineraries. Its connector brings travel search and booking context into assistant workflows so destinations, lodging, flights, and plans can be compared from conversation.

This agent can:
• Access Expedia data and capabilities via MCP
• Automate Expedia workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Expedia agent — Plan trips, flights and hotels (OAuth)',
    'expedia,expedia,mcp,Lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Expedia data and capabilities via MCP","Automate Expedia workflows from conversation"]',
    '["Lifestyle"]',
    '["Expedia account (OAuth connection required)"]',
    '[{"label":"Expedia MCP Server","url":"https://www.expedia.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/expedia.com.ico'
  ),
  (
    'FactSet Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a FactSet agent connected via the FactSet MCP at https://mcp.factset.com/content/v1. Financial data and analytics You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":3,"hair":4,"shirt":9,"pants":2,"accessory":1,"accent":10,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.factset.com/content/v1","name":"factset","authType":"oauth"}]}',
    'FactSet Agent — connected to FactSet via MCP (OAuth).

FactSet provides institutional-grade financial data, analytics, and research tools. Its AI-Ready Data remote MCP server gives assistants structured access to FactSet content so company fundamentals, estimates, and market data can be queried in conversation.

This agent can:
• Access FactSet data and capabilities via MCP
• Automate FactSet workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'FactSet agent — Financial data and analytics (OAuth)',
    'factset,factset,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access FactSet data and capabilities via MCP","Automate FactSet workflows from conversation"]',
    '["Data & Analytics"]',
    '["FactSet account (OAuth connection required)"]',
    '[{"label":"FactSet MCP Server","url":"https://mcp.factset.com/content/v1"}]',
    'https://icons.duckduckgo.com/ip3/factset.com.ico'
  ),
  (
    'Fathom Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Fathom agent connected via the Fathom MCP at https://api.fathom.ai/mcp. Your meetings, now part of every Claude conversation You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":3,"shirt":1,"pants":1,"accessory":3,"accent":2,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://api.fathom.ai/mcp","name":"fathom","authType":"oauth"}]}',
    'Fathom Agent — connected to Fathom via MCP (OAuth).

Fathom connects meeting recordings, transcripts, and summaries to assistant workflows. Its connector helps users bring meeting context into conversations for follow-ups, decisions, action items, and team knowledge.

This agent can:
• Access Fathom data and capabilities via MCP
• Automate Fathom workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Fathom agent — Your meetings, now part of every Claude conversation (OAuth)',
    'fathom,fathom,mcp,Communication',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Fathom data and capabilities via MCP","Automate Fathom workflows from conversation"]',
    '["Communication"]',
    '["Fathom account (OAuth connection required)"]',
    '[{"label":"Fathom MCP Server","url":"https://api.fathom.ai/mcp"}]',
    'https://icons.duckduckgo.com/ip3/fathom.ai.ico'
  ),
  (
    'Fever Event Discovery Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Fever Event Discovery agent connected via the Fever Event Discovery MCP at https://data-search.apigw.feverup.com/mcp. Discover live entertainment events worldwide You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":4,"hair":0,"shirt":1,"pants":2,"accessory":0,"accent":2,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://data-search.apigw.feverup.com/mcp","name":"fever-event-discovery","authType":"oauth"}]}',
    'Fever Event Discovery Agent — connected to Fever Event Discovery via MCP (OAuth).

Fever Event Discovery helps users find live entertainment events around the world. Its connector gives assistants event-discovery context for exploring concerts, cultural experiences, local activities, and ticketed entertainment options.

This agent can:
• Access Fever Event Discovery data and capabilities via MCP
• Automate Fever Event Discovery workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Fever Event Discovery agent — Discover live entertainment events worldwide (OAuth)',
    'fever-event-discovery,fever event discovery,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Fever Event Discovery data and capabilities via MCP","Automate Fever Event Discovery workflows from conversation"]',
    '["AI & ML"]',
    '["Fever Event Discovery account (OAuth connection required)"]',
    '[{"label":"Fever Event Discovery MCP Server","url":"https://data-search.apigw.feverup.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/feverup.com.ico'
  ),
  (
    'Fiscal.ai Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Fiscal.ai agent connected via the Fiscal.ai MCP at https://api.fiscal.ai/mcp/sse. Clean Public Equity Fundamental Data You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":3,"hair":4,"shirt":1,"pants":0,"accessory":4,"accent":2,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://api.fiscal.ai/mcp/sse","name":"fiscal-ai","authType":"oauth"}]}',
    'Fiscal.ai Agent — connected to Fiscal.ai via MCP (OAuth).

Fiscal.ai provides clean public-equity fundamental data for financial research. Its connector gives assistants structured company and market context for analysis, comparison, and investment-oriented questions grounded in financial datasets.

This agent can:
• Access Fiscal.ai data and capabilities via MCP
• Automate Fiscal.ai workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Fiscal.ai agent — Clean Public Equity Fundamental Data (OAuth)',
    'fiscal-ai,fiscal.ai,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Fiscal.ai data and capabilities via MCP","Automate Fiscal.ai workflows from conversation"]',
    '["Data & Analytics"]',
    '["Fiscal.ai account (OAuth connection required)"]',
    '[{"label":"Fiscal.ai MCP Server","url":"https://api.fiscal.ai/mcp/sse"}]',
    'https://icons.duckduckgo.com/ip3/fiscal.ai.ico'
  ),
  (
    'FMP Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a FMP agent connected via the FMP MCP at https://financialmodelingprep.com/mcp. Comprehensive financial datasets You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":3,"hair":4,"shirt":6,"pants":1,"accessory":0,"accent":0,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://financialmodelingprep.com/mcp","name":"fmp","authType":"oauth"}]}',
    'FMP Agent — connected to FMP via MCP (OAuth).

FMP provides comprehensive financial datasets for market and company analysis. Its connector gives assistants finance data context for working with fundamentals, market information, comparisons, and investment-research workflows.

This agent can:
• Access FMP data and capabilities via MCP
• Automate FMP workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'FMP agent — Comprehensive financial datasets (OAuth)',
    'fmp,fmp,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access FMP data and capabilities via MCP","Automate FMP workflows from conversation"]',
    '["Data & Analytics"]',
    '["FMP account (OAuth connection required)"]',
    '[{"label":"FMP MCP Server","url":"https://financialmodelingprep.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/financialmodelingprep.com.ico'
  ),
  (
    'Gainsight (Staircase AI) Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Gainsight (Staircase AI) agent connected via the Gainsight (Staircase AI) MCP at https://mcp.staircase.ai/mcp. Power AI Workflows with Customer Context You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":4,"shirt":4,"pants":1,"accessory":0,"accent":6,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.staircase.ai/mcp","name":"gainsight-staircase-ai","authType":"oauth"}]}',
    'Gainsight (Staircase AI) Agent — connected to Gainsight (Staircase AI) via MCP (OAuth).

Power AI Workflows with Customer Context

This agent can:
• Access Gainsight (Staircase AI) data and capabilities via MCP
• Automate Gainsight (Staircase AI) workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Gainsight (Staircase AI) agent — Power AI Workflows with Customer Context (OAuth)',
    'gainsight-staircase-ai,gainsight (staircase ai),mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Gainsight (Staircase AI) data and capabilities via MCP","Automate Gainsight (Staircase AI) workflows from conversation"]',
    '["Data & Analytics"]',
    '["Gainsight (Staircase AI) account (OAuth connection required)"]',
    '[{"label":"Gainsight (Staircase AI) MCP Server","url":"https://mcp.staircase.ai/mcp"}]',
    'https://icons.duckduckgo.com/ip3/staircase.ai.ico'
  ),
  (
    'GoCardless Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a GoCardless agent connected via the GoCardless MCP at https://mcp.gocardless.com. Build GoCardless payment API integrations You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":1,"hair":3,"shirt":9,"pants":0,"accessory":3,"accent":6,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.gocardless.com","name":"gocardless","authType":"oauth"}]}',
    'GoCardless Agent — connected to GoCardless via MCP (OAuth).

GoCardless helps developers build payment API integrations for bank payments and payment workflows. Its connector brings GoCardless documentation and integration context into assistant workflows for implementation planning and troubleshooting.

This agent can:
• Access GoCardless data and capabilities via MCP
• Automate GoCardless workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'GoCardless agent — Build GoCardless payment API integrations (OAuth)',
    'gocardless,gocardless,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access GoCardless data and capabilities via MCP","Automate GoCardless workflows from conversation"]',
    '["Finance"]',
    '["GoCardless account (OAuth connection required)"]',
    '[{"label":"GoCardless MCP Server","url":"https://mcp.gocardless.com"}]',
    'https://icons.duckduckgo.com/ip3/gocardless.com.ico'
  ),
  (
    'GoDaddy Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a GoDaddy agent connected via the GoDaddy MCP at https://api.godaddy.com/v1/domains/mcp. Search domains and check availability You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":3,"shirt":3,"pants":0,"accessory":4,"accent":6,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://api.godaddy.com/v1/domains/mcp","name":"godaddy","authType":"oauth"}]}',
    'GoDaddy Agent — connected to GoDaddy via MCP (OAuth).

GoDaddy helps users search domains and check availability. Its connector gives assistants domain-discovery context so naming ideas, availability checks, and domain decisions can be explored conversationally.

This agent can:
• Access GoDaddy data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'GoDaddy agent — Search domains and check availability (OAuth)',
    'godaddy,godaddy,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access GoDaddy data and capabilities via MCP","Search and retrieve information"]',
    '["Business"]',
    '["GoDaddy account (OAuth connection required)"]',
    '[{"label":"GoDaddy MCP Server","url":"https://api.godaddy.com/v1/domains/mcp"}]',
    'https://icons.duckduckgo.com/ip3/godaddy.com.ico'
  ),
  (
    'Goodnotes Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Goodnotes agent connected via the Goodnotes MCP at https://claude-mcp-api.ml.goodnotes.com/mcp. Turn AI insights into documents You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":3,"hair":1,"shirt":12,"pants":0,"accessory":4,"accent":2,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://claude-mcp-api.ml.goodnotes.com/mcp","name":"goodnotes","authType":"oauth"}]}',
    'Goodnotes Agent — connected to Goodnotes via MCP (OAuth).

Goodnotes helps turn AI insights into documents and notes. Its connector brings note-taking and document context into assistant workflows so users can capture ideas, organize outputs, and move from analysis to written artifacts.

This agent can:
• Access Goodnotes data and capabilities via MCP
• Automate Goodnotes workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Goodnotes agent — Turn AI insights into documents (OAuth)',
    'goodnotes,goodnotes,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Goodnotes data and capabilities via MCP","Automate Goodnotes workflows from conversation"]',
    '["Data & Analytics"]',
    '["Goodnotes account (OAuth connection required)"]',
    '[{"label":"Goodnotes MCP Server","url":"https://claude-mcp-api.ml.goodnotes.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/goodnotes.com.ico'
  ),
  (
    'Google Cloud BigQuery Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Google Cloud BigQuery agent connected via the Google Cloud BigQuery MCP at https://bigquery.googleapis.com/mcp. BigQuery: Advanced analytical insights for agents You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":0,"hair":6,"shirt":8,"pants":2,"accessory":2,"accent":4,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://bigquery.googleapis.com/mcp","name":"bigquery","authType":"oauth"}]}',
    'Google Cloud BigQuery Agent — connected to Google Cloud BigQuery via MCP (OAuth).

Google Cloud BigQuery provides advanced analytical insight for data agents. Its connector gives assistants BigQuery context for exploring datasets, asking analytical questions, and working with large-scale cloud data from natural language.

This agent can:
• Access Google Cloud BigQuery data and capabilities via MCP
• Automate Google Cloud BigQuery workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Google Cloud BigQuery agent — BigQuery: Advanced analytical insights for agents (OAuth)',
    'bigquery,google cloud bigquery,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Google Cloud BigQuery data and capabilities via MCP","Automate Google Cloud BigQuery workflows from conversation"]',
    '["Business"]',
    '["Google Cloud BigQuery account (OAuth connection required)"]',
    '[{"label":"Google Cloud BigQuery MCP Server","url":"https://bigquery.googleapis.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/googleapis.com.ico'
  ),
  (
    'Docusign Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Docusign agent connected via the Docusign MCP at https://mcp.docusign.com/mcp. Agreements, envelopes, signing You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":3,"shirt":4,"pants":2,"accessory":4,"accent":10,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.docusign.com/mcp","name":"docusign","authType":"oauth"}]}',
    'Docusign Agent — connected to Docusign via MCP (OAuth).

Docusign is an agreement management platform for preparing, signing, and tracking contracts. Its remote MCP server connects assistants to envelopes and agreement data so documents can be located, statuses checked, and signing workflows moved forward from conversation.

This agent can:
• Access Docusign data and capabilities via MCP
• Automate Docusign workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Docusign agent — Agreements, envelopes, signing (OAuth)',
    'docusign,docusign,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Docusign data and capabilities via MCP","Automate Docusign workflows from conversation"]',
    '["Development"]',
    '["Docusign account (OAuth connection required)"]',
    '[{"label":"Docusign MCP Server","url":"https://mcp.docusign.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/docusign.com.ico'
  ),
  (
    'Explorium Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Explorium agent connected via the Explorium MCP at https://mcp.explorium.ai/mcp. B2B prospecting, data enrichment You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":3,"shirt":3,"pants":2,"accessory":2,"accent":10,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.explorium.ai/mcp","name":"explorium","authType":"oauth"}]}',
    'Explorium Agent — connected to Explorium via MCP (OAuth).

Explorium is a B2B data platform whose AgentSource and Vibe Prospecting products find and enrich companies and prospects from natural-language queries. Its remote MCP server lets assistants search firmographic, technographic, and contact data across Explorium''s business graph.

This agent can:
• Access Explorium data and capabilities via MCP
• Automate Explorium workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Explorium agent — B2B prospecting, data enrichment (OAuth)',
    'explorium,explorium,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Explorium data and capabilities via MCP","Automate Explorium workflows from conversation"]',
    '["Business"]',
    '["Explorium account (OAuth connection required)"]',
    '[{"label":"Explorium MCP Server","url":"https://mcp.explorium.ai/mcp"}]',
    'https://icons.duckduckgo.com/ip3/explorium.ai.ico'
  ),
  (
    'GovTribe Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a GovTribe agent connected via the GovTribe MCP at https://govtribe.com/mcp. Search government procurement & spending data You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":5,"shirt":8,"pants":0,"accessory":3,"accent":3,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://govtribe.com/mcp","name":"govtribe","authType":"oauth"}]}',
    'GovTribe Agent — connected to GovTribe via MCP (OAuth).

GovTribe provides government procurement and spending data. Its connector gives assistants context for searching opportunities, contracts, agencies, vendors, and federal spending information used in public-sector market research.

This agent can:
• Access GovTribe data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'GovTribe agent — Search government procurement & spending data (OAuth)',
    'govtribe,govtribe,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access GovTribe data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["GovTribe account (OAuth connection required)"]',
    '[{"label":"GovTribe MCP Server","url":"https://govtribe.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/govtribe.com.ico'
  ),
  (
    'Grain Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Grain agent connected via the Grain MCP at https://api.grain.com/_/mcp. Turn meetings into insights and next steps in Claude You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":3,"shirt":0,"pants":2,"accessory":1,"accent":11,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://api.grain.com/_/mcp","name":"grain","authType":"oauth"}]}',
    'Grain Agent — connected to Grain via MCP (OAuth).

Grain turns meetings into insights, summaries, and next steps. Its connector brings meeting context into assistant workflows so users can find moments, understand decisions, and convert conversations into follow-up actions.

This agent can:
• Access Grain data and capabilities via MCP
• Automate Grain workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Grain agent — Turn meetings into insights and next steps in Claude (OAuth)',
    'grain,grain,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Grain data and capabilities via MCP","Automate Grain workflows from conversation"]',
    '["Data & Analytics"]',
    '["Grain account (OAuth connection required)"]',
    '[{"label":"Grain MCP Server","url":"https://api.grain.com/_/mcp"}]',
    'https://icons.duckduckgo.com/ip3/grain.com.ico'
  ),
  (
    'Granted Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Granted agent connected via the Granted MCP at https://grantedai.com/api/mcp/mcp. Discover every grant opportunity in existence. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":1,"hair":5,"shirt":3,"pants":2,"accessory":1,"accent":6,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://grantedai.com/api/mcp/mcp","name":"granted","authType":"oauth"}]}',
    'Granted Agent — connected to Granted via MCP (OAuth).

Granted helps users discover grant opportunities. Its connector brings grant-search context into assistant workflows so users can explore funding options, compare opportunities, and plan applications from natural-language prompts.

This agent can:
• Access Granted data and capabilities via MCP
• Automate Granted workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Granted agent — Discover every grant opportunity in existence. (OAuth)',
    'granted,granted,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Granted data and capabilities via MCP","Automate Granted workflows from conversation"]',
    '["Business"]',
    '["Granted account (OAuth connection required)"]',
    '[{"label":"Granted MCP Server","url":"https://grantedai.com/api/mcp/mcp"}]',
    'https://icons.duckduckgo.com/ip3/grantedai.com.ico'
  ),
  (
    'GraphOS MCP Tools Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a GraphOS MCP Tools agent connected via the GraphOS MCP Tools MCP at https://mcp.apollographql.com. Search Apollo docs, specs, and best practices You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":0,"hair":0,"shirt":12,"pants":1,"accessory":2,"accent":8,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.apollographql.com","name":"graphos-tools","authType":"oauth"}]}',
    'GraphOS MCP Tools Agent — connected to GraphOS MCP Tools via MCP (OAuth).

GraphOS MCP Tools connect assistants to Apollo documentation, GraphQL specifications, and best practices. The connector supports developer workflows around GraphOS, schema work, and GraphQL implementation guidance.

This agent can:
• Access GraphOS MCP Tools data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'GraphOS MCP Tools agent — Search Apollo docs, specs, and best practices (OAuth)',
    'graphos-tools,graphos mcp tools,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access GraphOS MCP Tools data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["GraphOS MCP Tools account (OAuth connection required)"]',
    '[{"label":"GraphOS MCP Tools MCP Server","url":"https://mcp.apollographql.com"}]',
    'https://icons.duckduckgo.com/ip3/apollographql.com.ico'
  ),
  (
    'Guidepoint Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Guidepoint agent connected via the Guidepoint MCP at https://clapi.guidepoint.io/mcp-server/v1/mcp. Real-time access to trusted expert knowledge You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":0,"shirt":1,"pants":0,"accessory":0,"accent":7,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://clapi.guidepoint.io/mcp-server/v1/mcp","name":"guidepoint","authType":"oauth"}]}',
    'Guidepoint Agent — connected to Guidepoint via MCP (OAuth).

Guidepoint provides access to trusted expert knowledge for research and decision-making. Its connector brings expert-network context into assistant workflows so users can incorporate specialist insight into business, market, and diligence analysis.

This agent can:
• Access Guidepoint data and capabilities via MCP
• Automate Guidepoint workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Guidepoint agent — Real-time access to trusted expert knowledge (OAuth)',
    'guidepoint,guidepoint,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Guidepoint data and capabilities via MCP","Automate Guidepoint workflows from conversation"]',
    '["Development"]',
    '["Guidepoint account (OAuth connection required)"]',
    '[{"label":"Guidepoint MCP Server","url":"https://clapi.guidepoint.io/mcp-server/v1/mcp"}]',
    'https://icons.duckduckgo.com/ip3/guidepoint.io.ico'
  ),
  (
    'Guru Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Guru agent connected via the Guru MCP at https://mcp.api.getguru.com/mcp. Company knowledge, cards, answers You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":5,"shirt":11,"pants":0,"accessory":2,"accent":11,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.api.getguru.com/mcp","name":"guru","authType":"oauth"}]}',
    'Guru Agent — connected to Guru via MCP (OAuth).

Guru is a company knowledge platform that captures verified internal information as searchable cards. Its remote MCP server connects assistants to that trusted knowledge layer so team questions can be answered with sourced, up-to-date company content.

This agent can:
• Access Guru data and capabilities via MCP
• Automate Guru workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Guru agent — Company knowledge, cards, answers (OAuth)',
    'guru,guru,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Guru data and capabilities via MCP","Automate Guru workflows from conversation"]',
    '["Finance"]',
    '["Guru account (OAuth connection required)"]',
    '[{"label":"Guru MCP Server","url":"https://mcp.api.getguru.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/getguru.com.ico'
  ),
  (
    'Gusto Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Gusto agent connected via the Gusto MCP at https://mcp.api.gusto.com/anthropic. Payroll, benefits, people data You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":4,"shirt":2,"pants":0,"accessory":1,"accent":12,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.api.gusto.com/anthropic","name":"gusto","authType":"oauth"}]}',
    'Gusto Agent — connected to Gusto via MCP (OAuth).

Gusto is a payroll, benefits, and HR platform for small and mid-sized businesses. Its remote MCP server gives assistants account-backed access to payroll and people data so compensation, time-off, and workforce questions can be answered from the system of record.

This agent can:
• Access Gusto data and capabilities via MCP
• Automate Gusto workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Gusto agent — Payroll, benefits, people data (OAuth)',
    'gusto,gusto,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Gusto data and capabilities via MCP","Automate Gusto workflows from conversation"]',
    '["Finance"]',
    '["Gusto account (OAuth connection required)"]',
    '[{"label":"Gusto MCP Server","url":"https://mcp.api.gusto.com/anthropic"}]',
    'https://icons.duckduckgo.com/ip3/gusto.com.ico'
  ),
  (
    'Harmonic Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Harmonic agent connected via the Harmonic MCP at https://mcp.api.harmonic.ai. Discover, research, and enrich companies and people You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":2,"hair":1,"shirt":8,"pants":0,"accessory":3,"accent":4,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.api.harmonic.ai","name":"harmonic","authType":"oauth"}]}',
    'Harmonic Agent — connected to Harmonic via MCP (OAuth).

Harmonic helps users discover, research, and enrich companies and people. Its connector gives assistants company and contact intelligence for market mapping, prospect research, and startup or business analysis.

This agent can:
• Access Harmonic data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Harmonic agent — Discover, research, and enrich companies and people (OAuth)',
    'harmonic,harmonic,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Harmonic data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["Harmonic account (OAuth connection required)"]',
    '[{"label":"Harmonic MCP Server","url":"https://mcp.api.harmonic.ai"}]',
    'https://icons.duckduckgo.com/ip3/harmonic.ai.ico'
  ),
  (
    'Harvey Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Harvey agent connected via the Harvey MCP at https://api.harvey.ai/hosted_mcp/mcp. Legal research and analysis You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":6,"hair":4,"shirt":0,"pants":1,"accessory":3,"accent":7,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://api.harvey.ai/hosted_mcp/mcp","name":"harvey","authType":"oauth"}]}',
    'Harvey Agent — connected to Harvey via MCP (OAuth).

Harvey is a legal AI platform used by law firms and legal teams for research, drafting, and analysis. Its remote MCP server brings Harvey''s legal intelligence into assistant workflows, supporting legal inquiries and document analysis with domain-tuned reasoning.

This agent can:
• Access Harvey data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Harvey agent — Legal research and analysis (OAuth)',
    'harvey,harvey,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Harvey data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["Harvey account (OAuth connection required)"]',
    '[{"label":"Harvey MCP Server","url":"https://api.harvey.ai/hosted_mcp/mcp"}]',
    'https://icons.duckduckgo.com/ip3/harvey.ai.ico'
  ),
  (
    'Hex Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Hex agent connected via the Hex MCP at https://app.hex.tech/mcp. Answer questions with the Hex agent You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":3,"hair":0,"shirt":0,"pants":2,"accessory":0,"accent":0,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://app.hex.tech/mcp","name":"hex","authType":"oauth"}]}',
    'Hex Agent — connected to Hex via MCP (OAuth).

Hex is a data workspace for analysis, notebooks, and collaborative analytics. Its connector lets assistants answer questions with Hex agent context, helping users reason over data projects and analytical workflows.

This agent can:
• Access Hex data and capabilities via MCP
• Automate Hex workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Hex agent — Answer questions with the Hex agent (OAuth)',
    'hex,hex,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Hex data and capabilities via MCP","Automate Hex workflows from conversation"]',
    '["Business"]',
    '["Hex account (OAuth connection required)"]',
    '[{"label":"Hex MCP Server","url":"https://app.hex.tech/mcp"}]',
    'https://icons.duckduckgo.com/ip3/hex.tech.ico'
  ),
  (
    'IBISWorld Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a IBISWorld agent connected via the IBISWorld MCP at https://mcp.ibisworld.com. Financials, risk data and analysis on 50,000 industries You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":3,"hair":3,"shirt":11,"pants":2,"accessory":3,"accent":2,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.ibisworld.com","name":"ibisworld","authType":"oauth"}]}',
    'IBISWorld Agent — connected to IBISWorld via MCP (OAuth).

IBISWorld provides financials, risk data, and analysis across tens of thousands of industries. Its connector gives assistants industry research context for market sizing, risk assessment, benchmarking, and business planning.

This agent can:
• Access IBISWorld data and capabilities via MCP
• Automate IBISWorld workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'IBISWorld agent — Financials, risk data and analysis on 50,000 industries (OAuth)',
    'ibisworld,ibisworld,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access IBISWorld data and capabilities via MCP","Automate IBISWorld workflows from conversation"]',
    '["Data & Analytics"]',
    '["IBISWorld account (OAuth connection required)"]',
    '[{"label":"IBISWorld MCP Server","url":"https://mcp.ibisworld.com"}]',
    'https://icons.duckduckgo.com/ip3/ibisworld.com.ico'
  ),
  (
    'ICE Data Services Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a ICE Data Services agent connected via the ICE Data Services MCP at https://fids-mcp.ice.com/mcp. Analyze U.S. fixed income trade and reference data You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":3,"hair":5,"shirt":6,"pants":1,"accessory":0,"accent":7,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://fids-mcp.ice.com/mcp","name":"ice-data-services","authType":"oauth"}]}',
    'ICE Data Services Agent — connected to ICE Data Services via MCP (OAuth).

ICE Data Services provides U.S. fixed-income trade and reference data. Its connector gives assistants bond-market context for analyzing fixed-income instruments, trade information, and reference datasets.

This agent can:
• Access ICE Data Services data and capabilities via MCP
• Analyze data and generate insights

To connect: Click "Connect via OAuth" when hiring this agent.',
    'ICE Data Services agent — Analyze U.S. fixed income trade and reference data (OAuth)',
    'ice-data-services,ice data services,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access ICE Data Services data and capabilities via MCP","Analyze data and generate insights"]',
    '["Business"]',
    '["ICE Data Services account (OAuth connection required)"]',
    '[{"label":"ICE Data Services MCP Server","url":"https://fids-mcp.ice.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/ice.com.ico'
  ),
  (
    'IFTTT Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a IFTTT agent connected via the IFTTT MCP at https://ifttt.com/mcp. Connect, control, and automate 1,000+ apps with IFTTT You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":6,"hair":5,"shirt":2,"pants":0,"accessory":3,"accent":9,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://ifttt.com/mcp","name":"ifttt","authType":"oauth"}]}',
    'IFTTT Agent — connected to IFTTT via MCP (OAuth).

IFTTT connects and automates more than a thousand apps, services, and devices. Its connector lets assistants control applets, trigger automations, and reason over connected service workflows from conversation.

This agent can:
• Access IFTTT data and capabilities via MCP
• Automate IFTTT workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'IFTTT agent — Connect, control, and automate 1,000+ apps with IFTTT (OAuth)',
    'ifttt,ifttt,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access IFTTT data and capabilities via MCP","Automate IFTTT workflows from conversation"]',
    '["AI & ML"]',
    '["IFTTT account (OAuth connection required)"]',
    '[{"label":"IFTTT MCP Server","url":"https://ifttt.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/ifttt.com.ico'
  ),
  (
    'iManage Work Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a iManage Work agent connected via the iManage Work MCP at https://cloudimanage.com/mcp/work. Governed knowledge. AI ready. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":0,"shirt":11,"pants":1,"accessory":1,"accent":2,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://cloudimanage.com/mcp/work","name":"imanage","authType":"oauth"}]}',
    'iManage Work Agent — connected to iManage Work via MCP (OAuth).

iManage Work is a governed knowledge and document-management platform for professional teams. Its connector gives assistants permission-aware access to knowledge, documents, and matter context already managed in iManage.

This agent can:
• Access iManage Work data and capabilities via MCP
• Automate iManage Work workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'iManage Work agent — Governed knowledge. AI ready. (OAuth)',
    'imanage,imanage work,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access iManage Work data and capabilities via MCP","Automate iManage Work workflows from conversation"]',
    '["Business"]',
    '["iManage Work account (OAuth connection required)"]',
    '[{"label":"iManage Work MCP Server","url":"https://cloudimanage.com/mcp/work"}]',
    'https://icons.duckduckgo.com/ip3/cloudimanage.com.ico'
  ),
  (
    'Ironclad Contracts Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Ironclad Contracts agent connected via the Ironclad Contracts MCP at https://mcp.na1.ironcladapp.com/mcp. Plain language search for faster contract answers You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":0,"hair":6,"shirt":10,"pants":2,"accessory":5,"accent":12,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.na1.ironcladapp.com/mcp","name":"ironclad-contracts","authType":"oauth"}]}',
    'Ironclad Contracts Agent — connected to Ironclad Contracts via MCP (OAuth).

Ironclad Contracts provides plain-language search for contract answers. Its connector brings contract repository context into assistant workflows so legal and business teams can find agreement terms, obligations, and related records faster.

This agent can:
• Access Ironclad Contracts data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Ironclad Contracts agent — Plain language search for faster contract answers (OAuth)',
    'ironclad-contracts,ironclad contracts,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Ironclad Contracts data and capabilities via MCP","Search and retrieve information"]',
    '["Business"]',
    '["Ironclad Contracts account (OAuth connection required)"]',
    '[{"label":"Ironclad Contracts MCP Server","url":"https://mcp.na1.ironcladapp.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/ironcladapp.com.ico'
  ),
  (
    'Jam Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Jam agent connected via the Jam MCP at https://mcp.jam.dev/mcp. Record screen and collect automatic context for issues You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":2,"hair":0,"shirt":7,"pants":0,"accessory":0,"accent":0,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.jam.dev/mcp","name":"jam","authType":"oauth"}]}',
    'Jam Agent — connected to Jam via MCP (OAuth).

Jam captures screen recordings and automatic context for issue reports. Its connector gives assistants bug-report context, reproduction details, and recorded evidence for debugging and product-feedback workflows.

This agent can:
• Access Jam data and capabilities via MCP
• Automate Jam workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Jam agent — Record screen and collect automatic context for issues (OAuth)',
    'jam,jam,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Jam data and capabilities via MCP","Automate Jam workflows from conversation"]',
    '["AI & ML"]',
    '["Jam account (OAuth connection required)"]',
    '[{"label":"Jam MCP Server","url":"https://mcp.jam.dev/mcp"}]',
    'https://icons.duckduckgo.com/ip3/jam.dev.ico'
  ),
  (
    'Jotform Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Jotform agent connected via the Jotform MCP at https://mcp.jotform.com/mcp-app. Create forms & analyze submissions inside Claude You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":3,"hair":7,"shirt":4,"pants":2,"accessory":3,"accent":10,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.jotform.com/mcp-app","name":"jotform","authType":"oauth"}]}',
    'Jotform Agent — connected to Jotform via MCP (OAuth).

Jotform helps users create forms and analyze submissions. Its connector gives assistants form-building and response-analysis context so teams can design collection workflows and understand submitted data from conversation.

This agent can:
• Access Jotform data and capabilities via MCP
• Analyze data and generate insights

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Jotform agent — Create forms & analyze submissions inside Claude (OAuth)',
    'jotform,jotform,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Jotform data and capabilities via MCP","Analyze data and generate insights"]',
    '["Business"]',
    '["Jotform account (OAuth connection required)"]',
    '[{"label":"Jotform MCP Server","url":"https://mcp.jotform.com/mcp-app"}]',
    'https://icons.duckduckgo.com/ip3/jotform.com.ico'
  ),
  (
    'Ketryx Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Ketryx agent connected via the Ketryx MCP at https://app.ketryx.com/api/mcp. Search and explore regulated software lifecycle data You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":4,"hair":4,"shirt":7,"pants":0,"accessory":4,"accent":12,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://app.ketryx.com/api/mcp","name":"ketryx","authType":"oauth"}]}',
    'Ketryx Agent — connected to Ketryx via MCP (OAuth).

Ketryx supports regulated software lifecycle workflows. Its connector gives assistants context for searching and exploring software development, quality, and compliance data used in regulated product environments.

This agent can:
• Access Ketryx data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Ketryx agent — Search and explore regulated software lifecycle data (OAuth)',
    'ketryx,ketryx,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Ketryx data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["Ketryx account (OAuth connection required)"]',
    '[{"label":"Ketryx MCP Server","url":"https://app.ketryx.com/api/mcp"}]',
    'https://icons.duckduckgo.com/ip3/ketryx.com.ico'
  ),
  (
    'Kindora Funder Discovery Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Kindora Funder Discovery agent connected via the Kindora Funder Discovery MCP at https://kindora-mcp.azurewebsites.net/mcp/. Find funders who support causes like yours You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":3,"hair":4,"shirt":6,"pants":1,"accessory":5,"accent":9,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://kindora-mcp.azurewebsites.net/mcp/","name":"kindora-funder-discovery","authType":"oauth"}]}',
    'Kindora Funder Discovery Agent — connected to Kindora Funder Discovery via MCP (OAuth).

Kindora Funder Discovery helps organizations find funders aligned with their causes. Its connector brings fundraising and grantmaker context into assistant workflows for prospect research and funding strategy.

This agent can:
• Access Kindora Funder Discovery data and capabilities via MCP
• Automate Kindora Funder Discovery workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Kindora Funder Discovery agent — Find funders who support causes like yours (OAuth)',
    'kindora-funder-discovery,kindora funder discovery,mcp,Communication',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Kindora Funder Discovery data and capabilities via MCP","Automate Kindora Funder Discovery workflows from conversation"]',
    '["Communication"]',
    '["Kindora Funder Discovery account (OAuth connection required)"]',
    '[{"label":"Kindora Funder Discovery MCP Server","url":"https://kindora-mcp.azurewebsites.net/mcp/"}]',
    'https://icons.duckduckgo.com/ip3/azurewebsites.net.ico'
  ),
  (
    'Kiwi.com Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Kiwi.com agent connected via the Kiwi.com MCP at https://mcp.kiwi.com. Flight search and travel You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":3,"hair":5,"shirt":3,"pants":2,"accessory":2,"accent":12,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.kiwi.com","name":"kiwi","authType":"oauth"}]}',
    'Kiwi.com Agent — connected to Kiwi.com via MCP (OAuth).

Kiwi.com is a travel platform known for flexible flight search across airlines and routes. Its remote MCP server brings flight search into assistant conversations so itineraries can be explored, compared, and handed off for booking.

This agent can:
• Access Kiwi.com data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Kiwi.com agent — Flight search and travel (OAuth)',
    'kiwi,kiwi.com,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Kiwi.com data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["Kiwi.com account (OAuth connection required)"]',
    '[{"label":"Kiwi.com MCP Server","url":"https://mcp.kiwi.com"}]',
    'https://icons.duckduckgo.com/ip3/kiwi.com.ico'
  ),
  (
    'Klaviyo Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Klaviyo agent connected via the Klaviyo MCP at https://mcp.klaviyo.com/mcp. Marketing campaigns, profiles, analytics You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":0,"hair":6,"shirt":0,"pants":2,"accessory":4,"accent":4,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.klaviyo.com/mcp","name":"klaviyo","authType":"oauth"}]}',
    'Klaviyo Agent — connected to Klaviyo via MCP (OAuth).

Klaviyo is a marketing automation platform for email, SMS, and customer data. Its remote MCP server lets assistants report on campaign performance, segment and inspect profiles, and manage marketing workflows grounded in live Klaviyo account data.

This agent can:
• Access Klaviyo data and capabilities via MCP
• Automate Klaviyo workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Klaviyo agent — Marketing campaigns, profiles, analytics (OAuth)',
    'klaviyo,klaviyo,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Klaviyo data and capabilities via MCP","Automate Klaviyo workflows from conversation"]',
    '["Finance"]',
    '["Klaviyo account (OAuth connection required)"]',
    '[{"label":"Klaviyo MCP Server","url":"https://mcp.klaviyo.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/klaviyo.com.ico'
  ),
  (
    'Krisp Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Krisp agent connected via the Krisp MCP at https://mcp.krisp.ai/mcp. Add your meetings context via transcripts and notes You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":3,"hair":5,"shirt":5,"pants":0,"accessory":4,"accent":0,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.krisp.ai/mcp","name":"krisp","authType":"oauth"}]}',
    'Krisp Agent — connected to Krisp via MCP (OAuth).

Krisp brings meeting transcripts and notes into assistant workflows. Its connector gives AI systems meeting context for summaries, follow-ups, decisions, and collaboration history.

This agent can:
• Access Krisp data and capabilities via MCP
• Automate Krisp workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Krisp agent — Add your meetings context via transcripts and notes (OAuth)',
    'krisp,krisp,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Krisp data and capabilities via MCP","Automate Krisp workflows from conversation"]',
    '["Business"]',
    '["Krisp account (OAuth connection required)"]',
    '[{"label":"Krisp MCP Server","url":"https://mcp.krisp.ai/mcp"}]',
    'https://icons.duckduckgo.com/ip3/krisp.ai.ico'
  ),
  (
    'lastminute.com Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a lastminute.com agent connected via the lastminute.com MCP at https://mcp.lastminute.com/mcp. Flights, hotels, holiday packages You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":6,"hair":6,"shirt":12,"pants":1,"accessory":0,"accent":5,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.lastminute.com/mcp","name":"lastminute","authType":"oauth"}]}',
    'lastminute.com Agent — connected to lastminute.com via MCP (OAuth).

lastminute.com is a European online travel agency for flights, hotels, and dynamic holiday packages. Its remote MCP server exposes real-time travel search so trips can be compared and planned directly within assistant conversations.

This agent can:
• Access lastminute.com data and capabilities via MCP
• Automate lastminute.com workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'lastminute.com agent — Flights, hotels, holiday packages (OAuth)',
    'lastminute,lastminute.com,mcp,Lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access lastminute.com data and capabilities via MCP","Automate lastminute.com workflows from conversation"]',
    '["Lifestyle"]',
    '["lastminute.com account (OAuth connection required)"]',
    '[{"label":"lastminute.com MCP Server","url":"https://mcp.lastminute.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/lastminute.com.ico'
  ),
  (
    'Lawve AI Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Lawve AI agent connected via the Lawve AI MCP at https://mcp.lawve.ai/mcp. Discover expert-written skills for legal work You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":5,"hair":2,"shirt":11,"pants":1,"accessory":3,"accent":12,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.lawve.ai/mcp","name":"lawve-ai","authType":"oauth"}]}',
    'Lawve AI Agent — connected to Lawve AI via MCP (OAuth).

Lawve AI provides expert-written skills for legal work. Its connector gives assistants access to legal workflow knowledge so users can discover structured support for drafting, research, review, and other legal tasks.

This agent can:
• Access Lawve AI data and capabilities via MCP
• Automate Lawve AI workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Lawve AI agent — Discover expert-written skills for legal work (OAuth)',
    'lawve-ai,lawve ai,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Lawve AI data and capabilities via MCP","Automate Lawve AI workflows from conversation"]',
    '["Business"]',
    '["Lawve AI account (OAuth connection required)"]',
    '[{"label":"Lawve AI MCP Server","url":"https://mcp.lawve.ai/mcp"}]',
    'https://icons.duckduckgo.com/ip3/lawve.ai.ico'
  ),
  (
    'Legal Data Hunter Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Legal Data Hunter agent connected via the Legal Data Hunter MCP at https://legaldatahunter.com/mcp. Search 23M+ legal docs in 160+ jurisdictions. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":1,"hair":7,"shirt":11,"pants":2,"accessory":2,"accent":3,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://legaldatahunter.com/mcp","name":"legal-data-hunter","authType":"oauth"}]}',
    'Legal Data Hunter Agent — connected to Legal Data Hunter via MCP (OAuth).

Legal Data Hunter searches millions of legal documents across many jurisdictions. Its connector gives assistants legal-data context for finding documents, comparing sources, and supporting research across a broad legal corpus.

This agent can:
• Access Legal Data Hunter data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Legal Data Hunter agent — Search 23M+ legal docs in 160+ jurisdictions. (OAuth)',
    'legal-data-hunter,legal data hunter,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Legal Data Hunter data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["Legal Data Hunter account (OAuth connection required)"]',
    '[{"label":"Legal Data Hunter MCP Server","url":"https://legaldatahunter.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/legaldatahunter.com.ico'
  ),
  (
    'LegalZoom Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a LegalZoom agent connected via the LegalZoom MCP at https://www.legalzoom.com/mcp/claude/v1. Legal documents and guidance You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":0,"shirt":5,"pants":0,"accessory":0,"accent":1,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://www.legalzoom.com/mcp/claude/v1","name":"legalzoom","authType":"oauth"}]}',
    'LegalZoom Agent — connected to LegalZoom via MCP (OAuth).

LegalZoom provides online legal services for businesses and individuals, from formation to document review. Its remote MCP server pairs AI document scanning with access to attorney-backed guidance so legal questions and paperwork can be handled in conversation.

This agent can:
• Access LegalZoom data and capabilities via MCP
• Automate LegalZoom workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'LegalZoom agent — Legal documents and guidance (OAuth)',
    'legalzoom,legalzoom,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access LegalZoom data and capabilities via MCP","Automate LegalZoom workflows from conversation"]',
    '["Development"]',
    '["LegalZoom account (OAuth connection required)"]',
    '[{"label":"LegalZoom MCP Server","url":"https://www.legalzoom.com/mcp/claude/v1"}]',
    'https://icons.duckduckgo.com/ip3/legalzoom.com.ico'
  ),
  (
    'LILT Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a LILT agent connected via the LILT MCP at https://mcp.lilt.com/mcp. High-quality translation with human verification You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":4,"hair":6,"shirt":1,"pants":1,"accessory":4,"accent":12,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.lilt.com/mcp","name":"lilt","authType":"oauth"}]}',
    'LILT Agent — connected to LILT via MCP (OAuth).

LILT provides high-quality translation workflows with human verification. Its connector gives assistants translation context for multilingual content while keeping professional review and localization quality in the loop.

This agent can:
• Access LILT data and capabilities via MCP
• Automate LILT workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'LILT agent — High-quality translation with human verification (OAuth)',
    'lilt,lilt,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access LILT data and capabilities via MCP","Automate LILT workflows from conversation"]',
    '["Business"]',
    '["LILT account (OAuth connection required)"]',
    '[{"label":"LILT MCP Server","url":"https://mcp.lilt.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/lilt.com.ico'
  ),
  (
    'Local Falcon Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Local Falcon agent connected via the Local Falcon MCP at https://mcp.localfalcon.com. AI visibility and local search intelligence platform You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":4,"hair":3,"shirt":0,"pants":1,"accessory":0,"accent":12,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.localfalcon.com","name":"local-falcon","authType":"oauth"}]}',
    'Local Falcon Agent — connected to Local Falcon via MCP (OAuth).

Local Falcon provides AI visibility and local search intelligence. Its connector gives assistants location-based search context for understanding map rankings, local visibility, and regional SEO performance.

This agent can:
• Access Local Falcon data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Local Falcon agent — AI visibility and local search intelligence platform (OAuth)',
    'local-falcon,local falcon,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Local Falcon data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["Local Falcon account (OAuth connection required)"]',
    '[{"label":"Local Falcon MCP Server","url":"https://mcp.localfalcon.com"}]',
    'https://icons.duckduckgo.com/ip3/localfalcon.com.ico'
  ),
  (
    'Longbridge Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Longbridge agent connected via the Longbridge MCP at https://mcp.longbridge.com. Market data, portfolio, and trading You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":4,"hair":7,"shirt":6,"pants":1,"accessory":3,"accent":5,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.longbridge.com","name":"longbridge","authType":"oauth"}]}',
    'Longbridge Agent — connected to Longbridge via MCP (OAuth).

Longbridge is a digital brokerage offering trading and market data across global markets. Its remote MCP server exposes 100+ tools for real-time quotes, fundamentals and research, option chains, account balances and positions, order placement, price alerts, and scheduled DCA plans.

This agent can:
• Access Longbridge data and capabilities via MCP
• Automate Longbridge workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Longbridge agent — Market data, portfolio, and trading (OAuth)',
    'longbridge,longbridge,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Longbridge data and capabilities via MCP","Automate Longbridge workflows from conversation"]',
    '["Finance"]',
    '["Longbridge account (OAuth connection required)"]',
    '[{"label":"Longbridge MCP Server","url":"https://mcp.longbridge.com"}]',
    'https://icons.duckduckgo.com/ip3/longbridge.com.ico'
  ),
  (
    'Lorikeet Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Lorikeet agent connected via the Lorikeet MCP at https://api.lorikeetcx.ai/v1/mcp. A universal concierge for complex businesses You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":0,"hair":3,"shirt":2,"pants":1,"accessory":2,"accent":9,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://api.lorikeetcx.ai/v1/mcp","name":"lorikeet","authType":"oauth"}]}',
    'Lorikeet Agent — connected to Lorikeet via MCP (OAuth).

Lorikeet supports complex customer-service workflows with a concierge-style AI layer. Its connector gives assistants business-process and customer-context signals for resolving sophisticated support or service requests.

This agent can:
• Access Lorikeet data and capabilities via MCP
• Automate Lorikeet workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Lorikeet agent — A universal concierge for complex businesses (OAuth)',
    'lorikeet,lorikeet,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Lorikeet data and capabilities via MCP","Automate Lorikeet workflows from conversation"]',
    '["Business"]',
    '["Lorikeet account (OAuth connection required)"]',
    '[{"label":"Lorikeet MCP Server","url":"https://api.lorikeetcx.ai/v1/mcp"}]',
    'https://icons.duckduckgo.com/ip3/lorikeetcx.ai.ico'
  ),
  (
    'LSEG Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a LSEG agent connected via the LSEG MCP at https://api.analytics.lseg.com/lfa/mcp/server-cl. Market data and analytics You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":4,"hair":3,"shirt":12,"pants":0,"accessory":5,"accent":12,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://api.analytics.lseg.com/lfa/mcp/server-cl","name":"lseg","authType":"oauth"}]}',
    'LSEG Agent — connected to LSEG via MCP (OAuth).

LSEG (London Stock Exchange Group) provides real-time and historical market data, news, and analytics. Its remote MCP server gives assistants access to LSEG''s financial content for pricing, reference data, and market analysis workflows.

This agent can:
• Access LSEG data and capabilities via MCP
• Automate LSEG workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'LSEG agent — Market data and analytics (OAuth)',
    'lseg,lseg,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access LSEG data and capabilities via MCP","Automate LSEG workflows from conversation"]',
    '["Finance"]',
    '["LSEG account (OAuth connection required)"]',
    '[{"label":"LSEG MCP Server","url":"https://api.analytics.lseg.com/lfa/mcp/server-cl"}]',
    'https://icons.duckduckgo.com/ip3/lseg.com.ico'
  ),
  (
    'Lumin Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Lumin agent connected via the Lumin MCP at https://mcp.luminpdf.com/mcp. Manage documents, send signature requests, and convert Markdown to PDF You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":3,"hair":1,"shirt":11,"pants":2,"accessory":1,"accent":8,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.luminpdf.com/mcp","name":"lumin","authType":"oauth"}]}',
    'Lumin Agent — connected to Lumin via MCP (OAuth).

Lumin helps users manage documents, send signature requests, and convert Markdown to PDF. Its connector gives assistants document-workflow context for preparing files, handling signatures, and producing shareable outputs.

This agent can:
• Access Lumin data and capabilities via MCP
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Lumin agent — Manage documents, send signature requests, and convert Markdown to PDF (OAuth)',
    'lumin,lumin,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Lumin data and capabilities via MCP","Create and manage resources"]',
    '["Development"]',
    '["Lumin account (OAuth connection required)"]',
    '[{"label":"Lumin MCP Server","url":"https://mcp.luminpdf.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/luminpdf.com.ico'
  ),
  (
    'Lusha Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Lusha agent connected via the Lusha MCP at https://mcp.lusha.com/mcp/claude. Find and enrich B2B contacts and companies You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":5,"hair":4,"shirt":7,"pants":1,"accessory":1,"accent":8,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.lusha.com/mcp/claude","name":"lusha","authType":"oauth"}]}',
    'Lusha Agent — connected to Lusha via MCP (OAuth).

Lusha helps teams find and enrich B2B contacts and companies. Its connector gives assistants sales-intelligence context for prospecting, account research, and go-to-market workflows.

This agent can:
• Access Lusha data and capabilities via MCP
• Automate Lusha workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Lusha agent — Find and enrich B2B contacts and companies (OAuth)',
    'lusha,lusha,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Lusha data and capabilities via MCP","Automate Lusha workflows from conversation"]',
    '["Business"]',
    '["Lusha account (OAuth connection required)"]',
    '[{"label":"Lusha MCP Server","url":"https://mcp.lusha.com/mcp/claude"}]',
    'https://icons.duckduckgo.com/ip3/lusha.com.ico'
  ),
  (
    'Magic Patterns Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Magic Patterns agent connected via the Magic Patterns MCP at https://mcp.magicpatterns.com/mcp. Discuss and iterate on Magic Patterns designs You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":0,"hair":7,"shirt":12,"pants":0,"accessory":4,"accent":0,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.magicpatterns.com/mcp","name":"magic-patterns","authType":"oauth"}]}',
    'Magic Patterns Agent — connected to Magic Patterns via MCP (OAuth).

Magic Patterns helps teams discuss and iterate on product interface designs. Its connector gives assistants design-workflow context for exploring UI ideas, revising concepts, and moving from conversation toward usable product screens.

This agent can:
• Access Magic Patterns data and capabilities via MCP
• Automate Magic Patterns workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Magic Patterns agent — Discuss and iterate on Magic Patterns designs (OAuth)',
    'magic-patterns,magic patterns,mcp,Design',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Magic Patterns data and capabilities via MCP","Automate Magic Patterns workflows from conversation"]',
    '["Design"]',
    '["Magic Patterns account (OAuth connection required)"]',
    '[{"label":"Magic Patterns MCP Server","url":"https://mcp.magicpatterns.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/magicpatterns.com.ico'
  ),
  (
    'Mailchimp Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Mailchimp agent connected via the Mailchimp MCP at https://ai-inc.mailchimp.com/claude/mcp/v2. Email marketing and campaigns You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":4,"hair":0,"shirt":0,"pants":2,"accessory":0,"accent":12,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://ai-inc.mailchimp.com/claude/mcp/v2","name":"mailchimp","authType":"oauth"}]}',
    'Mailchimp Agent — connected to Mailchimp via MCP (OAuth).

Mailchimp is Intuit''s marketing platform for email campaigns, audiences, and automations. Its remote MCP server lets assistants plan and produce omnichannel campaigns, inspect audience data, and manage marketing work from the account teams already use.

This agent can:
• Access Mailchimp data and capabilities via MCP
• Automate Mailchimp workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Mailchimp agent — Email marketing and campaigns (OAuth)',
    'mailchimp,mailchimp,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Mailchimp data and capabilities via MCP","Automate Mailchimp workflows from conversation"]',
    '["Finance"]',
    '["Mailchimp account (OAuth connection required)"]',
    '[{"label":"Mailchimp MCP Server","url":"https://ai-inc.mailchimp.com/claude/mcp/v2"}]',
    'https://icons.duckduckgo.com/ip3/mailchimp.com.ico'
  ),
  (
    'MailerLite Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a MailerLite agent connected via the MailerLite MCP at https://mcp.mailerlite.com/mcp. Turn Claude into your email marketing assistant You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":3,"hair":5,"shirt":2,"pants":2,"accessory":1,"accent":7,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.mailerlite.com/mcp","name":"mailerlite","authType":"oauth"}]}',
    'MailerLite Agent — connected to MailerLite via MCP (OAuth).

MailerLite turns email-marketing workflows into assistant-accessible tasks. Its connector brings campaign, subscriber, and email-marketing context into AI conversations for drafting, reviewing, and planning marketing work.

This agent can:
• Access MailerLite data and capabilities via MCP
• Automate MailerLite workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'MailerLite agent — Turn Claude into your email marketing assistant (OAuth)',
    'mailerlite,mailerlite,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access MailerLite data and capabilities via MCP","Automate MailerLite workflows from conversation"]',
    '["Finance"]',
    '["MailerLite account (OAuth connection required)"]',
    '[{"label":"MailerLite MCP Server","url":"https://mcp.mailerlite.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/mailerlite.com.ico'
  ),
  (
    'Malwarebytes Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Malwarebytes agent connected via the Malwarebytes MCP at https://scamguard.malwarebytes.com/claude/mcp. Check links, phones, and emails for scams You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":6,"hair":5,"shirt":2,"pants":0,"accessory":2,"accent":10,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://scamguard.malwarebytes.com/claude/mcp","name":"malwarebytes","authType":"oauth"}]}',
    'Malwarebytes Agent — connected to Malwarebytes via MCP (OAuth).

Malwarebytes helps check links, phone numbers, and emails for scams. Its connector gives assistants security-screening context for evaluating suspicious messages, URLs, and contact details.

This agent can:
• Access Malwarebytes data and capabilities via MCP
• Automate Malwarebytes workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Malwarebytes agent — Check links, phones, and emails for scams (OAuth)',
    'malwarebytes,malwarebytes,mcp,Communication',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Malwarebytes data and capabilities via MCP","Automate Malwarebytes workflows from conversation"]',
    '["Communication"]',
    '["Malwarebytes account (OAuth connection required)"]',
    '[{"label":"Malwarebytes MCP Server","url":"https://scamguard.malwarebytes.com/claude/mcp"}]',
    'https://icons.duckduckgo.com/ip3/malwarebytes.com.ico'
  ),
  (
    'MDN Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a MDN agent connected via the MDN MCP at https://mcp.mdn.mozilla.net/. Web docs, search, and browser compatibility data You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":4,"hair":5,"shirt":5,"pants":1,"accessory":0,"accent":0,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.mdn.mozilla.net/","name":"mdn","authType":"oauth"}]}',
    'MDN Agent — connected to MDN via MCP (OAuth).

MDN provides documentation for open web technologies including HTML, CSS, JavaScript, Web APIs, and browser compatibility data. Its experimental remote MCP server gives assistants current web platform context for answering implementation and browser-support questions.

This agent can:
• Access MDN data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'MDN agent — Web docs, search, and browser compatibility data (OAuth)',
    'mdn,mdn,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access MDN data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["MDN account (OAuth connection required)"]',
    '[{"label":"MDN MCP Server","url":"https://mcp.mdn.mozilla.net/"}]',
    'https://icons.duckduckgo.com/ip3/mozilla.net.ico'
  ),
  (
    'Melon Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Melon agent connected via the Melon MCP at https://mcp.melon.com/mcp/. Browse music charts & your personalized music picks You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":1,"hair":5,"shirt":11,"pants":0,"accessory":4,"accent":11,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.melon.com/mcp/","name":"melon","authType":"oauth"}]}',
    'Melon Agent — connected to Melon via MCP (OAuth).

Melon helps users browse music charts and personalized music picks. Its connector brings music-discovery context into assistant workflows for recommendations, chart exploration, and listening ideas.

This agent can:
• Access Melon data and capabilities via MCP
• Automate Melon workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Melon agent — Browse music charts & your personalized music picks (OAuth)',
    'melon,melon,mcp,Design',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Melon data and capabilities via MCP","Automate Melon workflows from conversation"]',
    '["Design"]',
    '["Melon account (OAuth connection required)"]',
    '[{"label":"Melon MCP Server","url":"https://mcp.melon.com/mcp/"}]',
    'https://icons.duckduckgo.com/ip3/melon.com.ico'
  ),
  (
    'Mem Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Mem agent connected via the Mem MCP at https://mcp.mem.ai/mcp. The AI notebook for everything on your mind You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":5,"hair":6,"shirt":5,"pants":1,"accessory":0,"accent":0,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.mem.ai/mcp","name":"mem","authType":"oauth"}]}',
    'Mem Agent — connected to Mem via MCP (OAuth).

Mem is an AI notebook for notes, thoughts, and personal knowledge. Its connector gives assistants notebook context for recalling information, organizing ideas, and building a persistent knowledge workspace.

This agent can:
• Access Mem data and capabilities via MCP
• Automate Mem workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Mem agent — The AI notebook for everything on your mind (OAuth)',
    'mem,mem,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Mem data and capabilities via MCP","Automate Mem workflows from conversation"]',
    '["Development"]',
    '["Mem account (OAuth connection required)"]',
    '[{"label":"Mem MCP Server","url":"https://mcp.mem.ai/mcp"}]',
    'https://icons.duckduckgo.com/ip3/mem.ai.ico'
  ),
  (
    'Metaview Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Metaview agent connected via the Metaview MCP at https://mcp.metaview.ai/mcp. The AI platform for recruiting. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":4,"hair":6,"shirt":3,"pants":1,"accessory":0,"accent":10,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.metaview.ai/mcp","name":"metaview","authType":"oauth"}]}',
    'Metaview Agent — connected to Metaview via MCP (OAuth).

Metaview is an AI platform for recruiting workflows. Its connector gives assistants interview, hiring, and recruiting context for summarizing conversations, supporting evaluation, and improving candidate-process visibility.

This agent can:
• Access Metaview data and capabilities via MCP
• Automate Metaview workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Metaview agent — The AI platform for recruiting. (OAuth)',
    'metaview,metaview,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Metaview data and capabilities via MCP","Automate Metaview workflows from conversation"]',
    '["Business"]',
    '["Metaview account (OAuth connection required)"]',
    '[{"label":"Metaview MCP Server","url":"https://mcp.metaview.ai/mcp"}]',
    'https://icons.duckduckgo.com/ip3/metaview.ai.ico'
  ),
  (
    'Midpage Legal Research Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Midpage Legal Research agent connected via the Midpage Legal Research MCP at https://app.midpage.ai/mcp. Conduct legal research and create work product You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":6,"shirt":3,"pants":1,"accessory":0,"accent":5,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://app.midpage.ai/mcp","name":"midpage","authType":"oauth"}]}',
    'Midpage Legal Research Agent — connected to Midpage Legal Research via MCP (OAuth).

Midpage Legal Research helps users conduct legal research and create legal work product. Its connector gives assistants legal-research context for finding authorities, analyzing materials, and drafting grounded outputs.

This agent can:
• Access Midpage Legal Research data and capabilities via MCP
• Search and retrieve information
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Midpage Legal Research agent — Conduct legal research and create work product (OAuth)',
    'midpage,midpage legal research,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Midpage Legal Research data and capabilities via MCP","Search and retrieve information","Create and manage resources"]',
    '["Data & Analytics"]',
    '["Midpage Legal Research account (OAuth connection required)"]',
    '[{"label":"Midpage Legal Research MCP Server","url":"https://app.midpage.ai/mcp"}]',
    'https://icons.duckduckgo.com/ip3/midpage.ai.ico'
  ),
  (
    'Monday Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Monday agent connected via the Monday MCP at https://mcp.monday.com/mcp. Manage projects, boards, and workflows in monday.com You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":7,"shirt":6,"pants":2,"accessory":2,"accent":1,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.monday.com/mcp","name":"monday","authType":"oauth"}]}',
    'Monday Agent — connected to Monday via MCP (OAuth).

monday.com helps teams manage projects, boards, and workflows. Its connector gives assistants workspace context for tracking work, understanding boards, and coordinating project activity from conversation.

This agent can:
• Access Monday data and capabilities via MCP
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Monday agent — Manage projects, boards, and workflows in monday.com (OAuth)',
    'monday,monday,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Monday data and capabilities via MCP","Create and manage resources"]',
    '["AI & ML"]',
    '["Monday account (OAuth connection required)"]',
    '[{"label":"Monday MCP Server","url":"https://mcp.monday.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/monday.com.ico'
  ),
  (
    'Monte Carlo Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Monte Carlo agent connected via the Monte Carlo MCP at https://integrations.getmontecarlo.com/mcp. Data & AI observability You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":5,"hair":0,"shirt":4,"pants":0,"accessory":4,"accent":9,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://integrations.getmontecarlo.com/mcp","name":"monte-carlo","authType":"oauth"}]}',
    'Monte Carlo Agent — connected to Monte Carlo via MCP (OAuth).

Monte Carlo provides data and AI observability for monitoring data reliability. Its connector gives assistants observability context for investigating data incidents, understanding quality signals, and supporting trusted analytics workflows.

This agent can:
• Access Monte Carlo data and capabilities via MCP
• Automate Monte Carlo workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Monte Carlo agent — Data & AI observability (OAuth)',
    'monte-carlo,monte carlo,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Monte Carlo data and capabilities via MCP","Automate Monte Carlo workflows from conversation"]',
    '["Data & Analytics"]',
    '["Monte Carlo account (OAuth connection required)"]',
    '[{"label":"Monte Carlo MCP Server","url":"https://integrations.getmontecarlo.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/getmontecarlo.com.ico'
  ),
  (
    'Moody''s Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Moody''s agent connected via the Moody''s MCP at https://api.moodys.com/genai-ready-data/m1/mcp. Credit ratings and risk data You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":5,"hair":5,"shirt":4,"pants":2,"accessory":0,"accent":0,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://api.moodys.com/genai-ready-data/m1/mcp","name":"moodys","authType":"oauth"}]}',
    'Moody''s Agent — connected to Moody''s via MCP (OAuth).

Credit ratings and risk data

This agent can:
• Access Moody''s data and capabilities via MCP
• Automate Moody''s workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Moody''s agent — Credit ratings and risk data (OAuth)',
    'moodys,moody''s,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Moody''s data and capabilities via MCP","Automate Moody''s workflows from conversation"]',
    '["Data & Analytics"]',
    '["Moody''s account (OAuth connection required)"]',
    '[{"label":"Moody''s MCP Server","url":"https://api.moodys.com/genai-ready-data/m1/mcp"}]',
    'https://icons.duckduckgo.com/ip3/moodys.com.ico'
  ),
  (
    'Morningstar Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Morningstar agent connected via the Morningstar MCP at https://mcp.morningstar.com/mcp. Investment research and data You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":0,"shirt":3,"pants":1,"accessory":0,"accent":8,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.morningstar.com/mcp","name":"morningstar","authType":"oauth"}]}',
    'Morningstar Agent — connected to Morningstar via MCP (OAuth).

Morningstar provides independent investment research, ratings, and data across funds, equities, and markets. Its remote MCP server connects assistants to Morningstar''s research and analytics so investment questions can be answered with cited, institutional-grade data.

This agent can:
• Access Morningstar data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Morningstar agent — Investment research and data (OAuth)',
    'morningstar,morningstar,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Morningstar data and capabilities via MCP","Search and retrieve information"]',
    '["Finance"]',
    '["Morningstar account (OAuth connection required)"]',
    '[{"label":"Morningstar MCP Server","url":"https://mcp.morningstar.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/morningstar.com.ico'
  ),
  (
    'MotherDuck Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a MotherDuck agent connected via the MotherDuck MCP at https://api.motherduck.com/mcp. DuckDB cloud warehouse, SQL You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":4,"hair":0,"shirt":12,"pants":2,"accessory":2,"accent":6,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://api.motherduck.com/mcp","name":"motherduck","authType":"oauth"}]}',
    'MotherDuck Agent — connected to MotherDuck via MCP (OAuth).

MotherDuck is a serverless cloud data warehouse built on DuckDB. Its remote MCP server lets assistants explore schemas, run SQL, and analyze warehouse data using natural language against the databases teams already manage in MotherDuck.

This agent can:
• Access MotherDuck data and capabilities via MCP
• Automate MotherDuck workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'MotherDuck agent — DuckDB cloud warehouse, SQL (OAuth)',
    'motherduck,motherduck,mcp,Infrastructure',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access MotherDuck data and capabilities via MCP","Automate MotherDuck workflows from conversation"]',
    '["Infrastructure"]',
    '["MotherDuck account (OAuth connection required)"]',
    '[{"label":"MotherDuck MCP Server","url":"https://api.motherduck.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/motherduck.com.ico'
  ),
  (
    'Motion Creative Analytics Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Motion Creative Analytics agent connected via the Motion Creative Analytics MCP at https://projects.motionapp.com/mcp. Analyze your Meta ad creative & competitor ad libraries You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":4,"hair":2,"shirt":3,"pants":0,"accessory":3,"accent":12,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://projects.motionapp.com/mcp","name":"motion","authType":"oauth"}]}',
    'Motion Creative Analytics Agent — connected to Motion Creative Analytics via MCP (OAuth).

Motion Creative Analytics helps teams analyze Meta ad creative and competitor ad libraries. Its connector gives assistants creative-performance context for reviewing ads, comparing competitors, and planning paid-social strategy.

This agent can:
• Access Motion Creative Analytics data and capabilities via MCP
• Analyze data and generate insights

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Motion Creative Analytics agent — Analyze your Meta ad creative & competitor ad libraries (OAuth)',
    'motion,motion creative analytics,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Motion Creative Analytics data and capabilities via MCP","Analyze data and generate insights"]',
    '["Business"]',
    '["Motion Creative Analytics account (OAuth connection required)"]',
    '[{"label":"Motion Creative Analytics MCP Server","url":"https://projects.motionapp.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/motionapp.com.ico'
  ),
  (
    'MSCI Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a MSCI agent connected via the MSCI MCP at https://mcp.msci.com/mcp/v1.0/mcp. Indexes, private-markets analytics You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":3,"hair":4,"shirt":11,"pants":0,"accessory":1,"accent":12,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.msci.com/mcp/v1.0/mcp","name":"msci","authType":"oauth"}]}',
    'MSCI Agent — connected to MSCI via MCP (OAuth).

MSCI provides indexes, portfolio analytics, and private-asset data for institutional investors. Its remote MCP server connects assistants to MSCI''s data and analytics so index, risk, and private-markets questions can be explored in conversation.

This agent can:
• Access MSCI data and capabilities via MCP
• Automate MSCI workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'MSCI agent — Indexes, private-markets analytics (OAuth)',
    'msci,msci,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access MSCI data and capabilities via MCP","Automate MSCI workflows from conversation"]',
    '["Finance"]',
    '["MSCI account (OAuth connection required)"]',
    '[{"label":"MSCI MCP Server","url":"https://mcp.msci.com/mcp/v1.0/mcp"}]',
    'https://icons.duckduckgo.com/ip3/msci.com.ico'
  ),
  (
    'MT Newswires Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a MT Newswires agent connected via the MT Newswires MCP at https://mcp.mtnewswires.com/mcp. Real-time financial news You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":3,"hair":0,"shirt":4,"pants":1,"accessory":4,"accent":3,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.mtnewswires.com/mcp","name":"mt-newswires","authType":"oauth"}]}',
    'MT Newswires Agent — connected to MT Newswires via MCP (OAuth).

MT Newswires produces real-time, multi-asset financial news covering global markets. Its remote MCP server streams that reporting into assistant workflows so market developments can be summarized and monitored as they happen.

This agent can:
• Access MT Newswires data and capabilities via MCP
• Automate MT Newswires workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'MT Newswires agent — Real-time financial news (OAuth)',
    'mt-newswires,mt newswires,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access MT Newswires data and capabilities via MCP","Automate MT Newswires workflows from conversation"]',
    '["Business"]',
    '["MT Newswires account (OAuth connection required)"]',
    '[{"label":"MT Newswires MCP Server","url":"https://mcp.mtnewswires.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/mtnewswires.com.ico'
  ),
  (
    'NetDocuments Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a NetDocuments agent connected via the NetDocuments MCP at https://web-api.us.netdocuments.app/connect/mcp. Securely access your documents in NetDocuments You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":2,"shirt":3,"pants":1,"accessory":1,"accent":8,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://web-api.us.netdocuments.app/connect/mcp","name":"netdocuments","authType":"oauth"}]}',
    'NetDocuments Agent — connected to NetDocuments via MCP (OAuth).

NetDocuments is a cloud document-management platform for legal and professional work. Its connector gives assistants governed document context for search, review, summaries, and matter-aware analysis within existing permissions.

This agent can:
• Access NetDocuments data and capabilities via MCP
• Automate NetDocuments workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'NetDocuments agent — Securely access your documents in NetDocuments (OAuth)',
    'netdocuments,netdocuments,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access NetDocuments data and capabilities via MCP","Automate NetDocuments workflows from conversation"]',
    '["Development"]',
    '["NetDocuments account (OAuth connection required)"]',
    '[{"label":"NetDocuments MCP Server","url":"https://web-api.us.netdocuments.app/connect/mcp"}]',
    'https://icons.duckduckgo.com/ip3/netdocuments.app.ico'
  ),
  (
    'Omni Analytics Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Omni Analytics agent connected via the Omni Analytics MCP at https://callbacks.omniapp.co/callback/mcp. Query your data using natural language through Omni''s semantic model You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":0,"hair":6,"shirt":7,"pants":0,"accessory":4,"accent":9,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://callbacks.omniapp.co/callback/mcp","name":"omni-analytics","authType":"oauth"}]}',
    'Omni Analytics Agent — connected to Omni Analytics via MCP (OAuth).

Omni Analytics lets users query data through a semantic model with natural language. Its connector gives assistants governed analytics context for answering business questions and exploring modeled data.

This agent can:
• Access Omni Analytics data and capabilities via MCP
• Automate Omni Analytics workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Omni Analytics agent — Query your data using natural language through Omni''s semantic model (OAuth)',
    'omni-analytics,omni analytics,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Omni Analytics data and capabilities via MCP","Automate Omni Analytics workflows from conversation"]',
    '["Data & Analytics"]',
    '["Omni Analytics account (OAuth connection required)"]',
    '[{"label":"Omni Analytics MCP Server","url":"https://callbacks.omniapp.co/callback/mcp"}]',
    'https://icons.duckduckgo.com/ip3/omniapp.co.ico'
  ),
  (
    'Open Targets Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Open Targets agent connected via the Open Targets MCP at https://mcp.platform.opentargets.org/mcp. Drug target discovery data You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":3,"shirt":0,"pants":2,"accessory":5,"accent":2,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.platform.opentargets.org/mcp","name":"open-targets","authType":"oauth"}]}',
    'Open Targets Agent — connected to Open Targets via MCP (OAuth).

Open Targets is a public platform for systematic drug target identification and prioritisation. Its remote MCP server gives assistants a purpose-built interface to association, evidence, and target data for genetics-driven drug discovery research.

This agent can:
• Access Open Targets data and capabilities via MCP
• Automate Open Targets workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Open Targets agent — Drug target discovery data (OAuth)',
    'open-targets,open targets,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Open Targets data and capabilities via MCP","Automate Open Targets workflows from conversation"]',
    '["Data & Analytics"]',
    '["Open Targets account (OAuth connection required)"]',
    '[{"label":"Open Targets MCP Server","url":"https://mcp.platform.opentargets.org/mcp"}]',
    'https://icons.duckduckgo.com/ip3/opentargets.org.ico'
  ),
  (
    'Orion by Gravity Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Orion by Gravity agent connected via the Orion by Gravity MCP at https://g.runorion.com/mcp. Get insights from your autonomous AI analyst You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":4,"hair":2,"shirt":5,"pants":1,"accessory":2,"accent":2,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://g.runorion.com/mcp","name":"orion","authType":"oauth"}]}',
    'Orion by Gravity Agent — connected to Orion by Gravity via MCP (OAuth).

Orion by Gravity provides insights from an autonomous AI analyst. Its connector brings analytical context into assistant workflows for asking business questions, exploring findings, and understanding data-backed recommendations.

This agent can:
• Access Orion by Gravity data and capabilities via MCP
• Automate Orion by Gravity workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Orion by Gravity agent — Get insights from your autonomous AI analyst (OAuth)',
    'orion,orion by gravity,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Orion by Gravity data and capabilities via MCP","Automate Orion by Gravity workflows from conversation"]',
    '["Data & Analytics"]',
    '["Orion by Gravity account (OAuth connection required)"]',
    '[{"label":"Orion by Gravity MCP Server","url":"https://g.runorion.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/runorion.com.ico'
  ),
  (
    'Outreach Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Outreach agent connected via the Outreach MCP at https://api.outreach.io/mcp/. Unleash your team''s best performance with Outreach AI You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":2,"hair":7,"shirt":12,"pants":0,"accessory":4,"accent":12,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://api.outreach.io/mcp/","name":"outreach","authType":"oauth"}]}',
    'Outreach Agent — connected to Outreach via MCP (OAuth).

Outreach supports sales engagement and revenue-team workflows. Its connector gives assistants account, prospect, and outreach context for understanding pipeline activity, preparing communications, and improving sales execution.

This agent can:
• Access Outreach data and capabilities via MCP
• Automate Outreach workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Outreach agent — Unleash your team''s best performance with Outreach AI (OAuth)',
    'outreach,outreach,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Outreach data and capabilities via MCP","Automate Outreach workflows from conversation"]',
    '["AI & ML"]',
    '["Outreach account (OAuth connection required)"]',
    '[{"label":"Outreach MCP Server","url":"https://api.outreach.io/mcp/"}]',
    'https://icons.duckduckgo.com/ip3/outreach.io.ico'
  ),
  (
    'Peec AI Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Peec AI agent connected via the Peec AI MCP at https://api.peec.ai/mcp. Analyze your brand''s visibility across LLMs You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":4,"hair":0,"shirt":5,"pants":1,"accessory":0,"accent":6,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://api.peec.ai/mcp","name":"peec-ai","authType":"oauth"}]}',
    'Peec AI Agent — connected to Peec AI via MCP (OAuth).

Peec AI analyzes brand visibility across LLMs. Its connector gives assistants AI-search and brand-monitoring context for understanding how companies appear in model-generated answers and where visibility can improve.

This agent can:
• Access Peec AI data and capabilities via MCP
• Analyze data and generate insights

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Peec AI agent — Analyze your brand''s visibility across LLMs (OAuth)',
    'peec-ai,peec ai,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Peec AI data and capabilities via MCP","Analyze data and generate insights"]',
    '["AI & ML"]',
    '["Peec AI account (OAuth connection required)"]',
    '[{"label":"Peec AI MCP Server","url":"https://api.peec.ai/mcp"}]',
    'https://icons.duckduckgo.com/ip3/peec.ai.ico'
  ),
  (
    'Pendo Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Pendo agent connected via the Pendo MCP at https://app.pendo.io/mcp/v0/shttp. Product analytics, guides, feedback You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":3,"hair":3,"shirt":11,"pants":1,"accessory":5,"accent":6,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://app.pendo.io/mcp/v0/shttp","name":"pendo","authType":"oauth"}]}',
    'Pendo Agent — connected to Pendo via MCP (OAuth).

Pendo is a product experience platform combining analytics, in-app guides, and feedback. Its remote MCP server gives assistants access to visitor, account, and usage data so product questions can be answered from real behavioral analytics.

This agent can:
• Access Pendo data and capabilities via MCP
• Automate Pendo workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Pendo agent — Product analytics, guides, feedback (OAuth)',
    'pendo,pendo,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Pendo data and capabilities via MCP","Automate Pendo workflows from conversation"]',
    '["Data & Analytics"]',
    '["Pendo account (OAuth connection required)"]',
    '[{"label":"Pendo MCP Server","url":"https://app.pendo.io/mcp/v0/shttp"}]',
    'https://icons.duckduckgo.com/ip3/pendo.io.ico'
  ),
  (
    'pg-aiguide Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a pg-aiguide agent connected via the pg-aiguide MCP at https://mcp.tigerdata.com/docs. Search pg and Tiger docs, learn database skills You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":6,"hair":0,"shirt":7,"pants":2,"accessory":3,"accent":1,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.tigerdata.com/docs","name":"pg-aiguide","authType":"oauth"}]}',
    'pg-aiguide Agent — connected to pg-aiguide via MCP (OAuth).

Search pg and Tiger docs, learn database skills

This agent can:
• Access pg-aiguide data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'pg-aiguide agent — Search pg and Tiger docs, learn database skills (OAuth)',
    'pg-aiguide,pg-aiguide,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access pg-aiguide data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["pg-aiguide account (OAuth connection required)"]',
    '[{"label":"pg-aiguide MCP Server","url":"https://mcp.tigerdata.com/docs"}]',
    'https://icons.duckduckgo.com/ip3/tigerdata.com.ico'
  ),
  (
    'PitchBook Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a PitchBook agent connected via the PitchBook MCP at https://premium.mcp.pitchbook.com/mcp. Private market intelligence You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":3,"hair":1,"shirt":4,"pants":2,"accessory":1,"accent":8,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://premium.mcp.pitchbook.com/mcp","name":"pitchbook","authType":"oauth"}]}',
    'PitchBook Agent — connected to PitchBook via MCP (OAuth).

PitchBook provides data on private and public capital markets, covering companies, investors, deals, and funds. Its Premium remote MCP server brings that intelligence into assistant workflows for sourcing, diligence, and market research.

This agent can:
• Access PitchBook data and capabilities via MCP
• Automate PitchBook workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'PitchBook agent — Private market intelligence (OAuth)',
    'pitchbook,pitchbook,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access PitchBook data and capabilities via MCP","Automate PitchBook workflows from conversation"]',
    '["Finance"]',
    '["PitchBook account (OAuth connection required)"]',
    '[{"label":"PitchBook MCP Server","url":"https://premium.mcp.pitchbook.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/pitchbook.com.ico'
  ),
  (
    'PlanetScale Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a PlanetScale agent connected via the PlanetScale MCP at https://mcp.pscale.dev/mcp/planetscale\\n. Authenticated access to your Postgres and MySQL DBs You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":3,"hair":2,"shirt":1,"pants":0,"accessory":2,"accent":5,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.pscale.dev/mcp/planetscale\\n","name":"planetscale","authType":"oauth"}]}',
    'PlanetScale Agent — connected to PlanetScale via MCP (OAuth).

PlanetScale provides authenticated access to Postgres and MySQL databases. Its connector gives assistants database context for inspecting schema, understanding environments, and planning data-related work with connected database systems.

This agent can:
• Access PlanetScale data and capabilities via MCP
• Automate PlanetScale workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'PlanetScale agent — Authenticated access to your Postgres and MySQL DBs (OAuth)',
    'planetscale,planetscale,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access PlanetScale data and capabilities via MCP","Automate PlanetScale workflows from conversation"]',
    '["Data & Analytics"]',
    '["PlanetScale account (OAuth connection required)"]',
    '[{"label":"PlanetScale MCP Server","url":"https://mcp.pscale.dev/mcp/planetscale\\n"}]',
    'https://icons.duckduckgo.com/ip3/pscale.dev.ico'
  ),
  (
    'Polar Analytics Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Polar Analytics agent connected via the Polar Analytics MCP at https://api.polaranalytics.com/mcp. Bring all your data in one place & connect it to Claude You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":6,"hair":2,"shirt":11,"pants":1,"accessory":2,"accent":9,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://api.polaranalytics.com/mcp","name":"polar-analytics","authType":"oauth"}]}',
    'Polar Analytics Agent — connected to Polar Analytics via MCP (OAuth).

Polar Analytics brings ecommerce and business data into one analytics workspace. Its connector gives assistants connected metrics context for querying performance, analyzing revenue, and understanding multichannel business data.

This agent can:
• Access Polar Analytics data and capabilities via MCP
• Automate Polar Analytics workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Polar Analytics agent — Bring all your data in one place & connect it to Claude (OAuth)',
    'polar-analytics,polar analytics,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Polar Analytics data and capabilities via MCP","Automate Polar Analytics workflows from conversation"]',
    '["Data & Analytics"]',
    '["Polar Analytics account (OAuth connection required)"]',
    '[{"label":"Polar Analytics MCP Server","url":"https://api.polaranalytics.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/polaranalytics.com.ico'
  ),
  (
    'Privacy.com Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Privacy.com agent connected via the Privacy.com MCP at https://mcp.privacy.com. Manage virtual cards and track your spending patterns You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":3,"hair":3,"shirt":8,"pants":2,"accessory":1,"accent":7,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.privacy.com","name":"privacy","authType":"oauth"}]}',
    'Privacy.com Agent — connected to Privacy.com via MCP (OAuth).

Privacy.com helps users manage virtual cards and track spending patterns. Its connector gives assistants payment-card and transaction context for reviewing spend, understanding card usage, and managing financial controls.

This agent can:
• Access Privacy.com data and capabilities via MCP
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Privacy.com agent — Manage virtual cards and track your spending patterns (OAuth)',
    'privacy,privacy.com,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Privacy.com data and capabilities via MCP","Create and manage resources"]',
    '["Finance"]',
    '["Privacy.com account (OAuth connection required)"]',
    '[{"label":"Privacy.com MCP Server","url":"https://mcp.privacy.com"}]',
    'https://icons.duckduckgo.com/ip3/privacy.com.ico'
  ),
  (
    'Pylon Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Pylon agent connected via the Pylon MCP at https://mcp.usepylon.com/. Search and manage Pylon support issues You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":5,"shirt":5,"pants":0,"accessory":5,"accent":11,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.usepylon.com/","name":"pylon","authType":"oauth"}]}',
    'Pylon Agent — connected to Pylon via MCP (OAuth).

Pylon helps teams search and manage support issues. Its connector gives assistants support-workflow context for finding customer issues, tracking status, and coordinating responses across support operations.

This agent can:
• Access Pylon data and capabilities via MCP
• Search and retrieve information
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Pylon agent — Search and manage Pylon support issues (OAuth)',
    'pylon,pylon,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Pylon data and capabilities via MCP","Search and retrieve information","Create and manage resources"]',
    '["Data & Analytics"]',
    '["Pylon account (OAuth connection required)"]',
    '[{"label":"Pylon MCP Server","url":"https://mcp.usepylon.com/"}]',
    'https://icons.duckduckgo.com/ip3/usepylon.com.ico'
  ),
  (
    'Quartr Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Quartr agent connected via the Quartr MCP at https://mcp.quartr.com/mcp. Financial data and AI infrastructure for company research. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":3,"shirt":8,"pants":0,"accessory":5,"accent":10,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.quartr.com/mcp","name":"quartr","authType":"oauth"}]}',
    'Quartr Agent — connected to Quartr via MCP (OAuth).

Quartr provides financial data and AI infrastructure for company research. Its connector gives assistants access to company information, financial context, and research signals used by analysts and investors.

This agent can:
• Access Quartr data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Quartr agent — Financial data and AI infrastructure for company research. (OAuth)',
    'quartr,quartr,mcp,Infrastructure',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Quartr data and capabilities via MCP","Search and retrieve information"]',
    '["Infrastructure"]',
    '["Quartr account (OAuth connection required)"]',
    '[{"label":"Quartr MCP Server","url":"https://mcp.quartr.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/quartr.com.ico'
  ),
  (
    'QuickBooks Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a QuickBooks agent connected via the QuickBooks MCP at https://ai-inc.quickbooks.intuit.com/v1/mcp. Accounting, invoices, business finances You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":6,"hair":6,"shirt":10,"pants":2,"accessory":0,"accent":3,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://ai-inc.quickbooks.intuit.com/v1/mcp","name":"quickbooks","authType":"oauth"}]}',
    'QuickBooks Agent — connected to QuickBooks via MCP (OAuth).

QuickBooks is Intuit''s accounting platform for small business bookkeeping, invoicing, and reporting. Its remote MCP server gives assistants governed access to company financials so books, invoices, and cash-flow questions can be handled with live account data.

This agent can:
• Access QuickBooks data and capabilities via MCP
• Automate QuickBooks workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'QuickBooks agent — Accounting, invoices, business finances (OAuth)',
    'quickbooks,quickbooks,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access QuickBooks data and capabilities via MCP","Automate QuickBooks workflows from conversation"]',
    '["Finance"]',
    '["QuickBooks account (OAuth connection required)"]',
    '[{"label":"QuickBooks MCP Server","url":"https://ai-inc.quickbooks.intuit.com/v1/mcp"}]',
    'https://icons.duckduckgo.com/ip3/intuit.com.ico'
  ),
  (
    'Quo Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Quo agent connected via the Quo MCP at https://mcp.quo.com/mcp. Surface call insights and missed opportunities You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":5,"hair":6,"shirt":9,"pants":0,"accessory":0,"accent":0,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.quo.com/mcp","name":"quo","authType":"oauth"}]}',
    'Quo Agent — connected to Quo via MCP (OAuth).

Quo surfaces call insights and missed opportunities. Its connector gives assistants conversation-intelligence context for reviewing calls, identifying follow-ups, and understanding where customer or sales interactions need attention.

This agent can:
• Access Quo data and capabilities via MCP
• Automate Quo workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Quo agent — Surface call insights and missed opportunities (OAuth)',
    'quo,quo,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Quo data and capabilities via MCP","Automate Quo workflows from conversation"]',
    '["Data & Analytics"]',
    '["Quo account (OAuth connection required)"]',
    '[{"label":"Quo MCP Server","url":"https://mcp.quo.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/quo.com.ico'
  ),
  (
    'Ramp Data Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Ramp Data agent connected via the Ramp Data MCP at https://mcp.ramp.com/ramp-data/anthropic/mcp. Search and analyze Ramp spend across 50,000+ businesses You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":3,"hair":3,"shirt":4,"pants":0,"accessory":1,"accent":10,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.ramp.com/ramp-data/anthropic/mcp","name":"ramp-data","authType":"oauth"}]}',
    'Ramp Data Agent — connected to Ramp Data via MCP (OAuth).

Ramp Data provides spend analysis across a large network of business transaction data. Its connector gives assistants context for analyzing company spend, benchmarking patterns, and answering finance or procurement questions.

This agent can:
• Access Ramp Data data and capabilities via MCP
• Search and retrieve information
• Analyze data and generate insights

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Ramp Data agent — Search and analyze Ramp spend across 50,000+ businesses (OAuth)',
    'ramp-data,ramp data,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Ramp Data data and capabilities via MCP","Search and retrieve information","Analyze data and generate insights"]',
    '["Data & Analytics"]',
    '["Ramp Data account (OAuth connection required)"]',
    '[{"label":"Ramp Data MCP Server","url":"https://mcp.ramp.com/ramp-data/anthropic/mcp"}]',
    'https://icons.duckduckgo.com/ip3/ramp.com.ico'
  ),
  (
    'Razorpay Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Razorpay agent connected via the Razorpay MCP at https://mcp.razorpay.com/mcp. Payments, orders, settlements You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":4,"shirt":8,"pants":2,"accessory":1,"accent":7,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.razorpay.com/mcp","name":"razorpay","authType":"oauth"}]}',
    'Razorpay Agent — connected to Razorpay via MCP (OAuth).

Razorpay is a full-stack payments platform for businesses in India. Its remote MCP server lets assistants query payments, orders, refunds, and settlement data directly from a merchant account for support and finance workflows.

This agent can:
• Access Razorpay data and capabilities via MCP
• Automate Razorpay workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Razorpay agent — Payments, orders, settlements (OAuth)',
    'razorpay,razorpay,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Razorpay data and capabilities via MCP","Automate Razorpay workflows from conversation"]',
    '["Finance"]',
    '["Razorpay account (OAuth connection required)"]',
    '[{"label":"Razorpay MCP Server","url":"https://mcp.razorpay.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/razorpay.com.ico'
  ),
  (
    'Resy Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Resy agent connected via the Resy MCP at https://apigw.americanexpress.com/dining/v1/mcp. Find and book restaurants instantly You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":6,"shirt":9,"pants":0,"accessory":3,"accent":0,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://apigw.americanexpress.com/dining/v1/mcp","name":"resy","authType":"oauth"}]}',
    'Resy Agent — connected to Resy via MCP (OAuth).

Resy helps users find and book restaurants instantly. Its connector brings restaurant availability, dining preferences, and booking context into assistant workflows for planning meals and comparing options.

This agent can:
• Access Resy data and capabilities via MCP
• Automate Resy workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Resy agent — Find and book restaurants instantly (OAuth)',
    'resy,resy,mcp,Lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Resy data and capabilities via MCP","Automate Resy workflows from conversation"]',
    '["Lifestyle"]',
    '["Resy account (OAuth connection required)"]',
    '[{"label":"Resy MCP Server","url":"https://apigw.americanexpress.com/dining/v1/mcp"}]',
    'https://icons.duckduckgo.com/ip3/americanexpress.com.ico'
  ),
  (
    'Rillet Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Rillet agent connected via the Rillet MCP at https://api.rillet.com/mcp. Query your live GL and financials in plain English You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":1,"hair":0,"shirt":7,"pants":2,"accessory":0,"accent":4,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://api.rillet.com/mcp","name":"rillet","authType":"oauth"}]}',
    'Rillet Agent — connected to Rillet via MCP (OAuth).

Rillet lets teams query live general-ledger and financial data in plain English. Its connector gives assistants accounting and finance context for understanding financials, investigating GL details, and answering operational questions.

This agent can:
• Access Rillet data and capabilities via MCP
• Automate Rillet workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Rillet agent — Query your live GL and financials in plain English (OAuth)',
    'rillet,rillet,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Rillet data and capabilities via MCP","Automate Rillet workflows from conversation"]',
    '["Data & Analytics"]',
    '["Rillet account (OAuth connection required)"]',
    '[{"label":"Rillet MCP Server","url":"https://api.rillet.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/rillet.com.ico'
  ),
  (
    'Scholar Gateway Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Scholar Gateway agent connected via the Scholar Gateway MCP at https://connector.scholargateway.ai/mcp. Peer-reviewed research, citations You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":0,"hair":5,"shirt":7,"pants":1,"accessory":4,"accent":11,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://connector.scholargateway.ai/mcp","name":"scholar-gateway","authType":"oauth"}]}',
    'Scholar Gateway Agent — connected to Scholar Gateway via MCP (OAuth).

Scholar Gateway grounds AI responses in peer-reviewed literature with verifiable citations and DOIs. Its remote MCP server lets assistants search scholarly sources and cite them precisely, supporting research workflows that require trustworthy references.

This agent can:
• Access Scholar Gateway data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Scholar Gateway agent — Peer-reviewed research, citations (OAuth)',
    'scholar-gateway,scholar gateway,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Scholar Gateway data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["Scholar Gateway account (OAuth connection required)"]',
    '[{"label":"Scholar Gateway MCP Server","url":"https://connector.scholargateway.ai/mcp"}]',
    'https://icons.duckduckgo.com/ip3/scholargateway.ai.ico'
  ),
  (
    'Scite Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Scite agent connected via the Scite MCP at https://api.scite.ai/mcp. Evidence-based answers grounded in research You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":2,"shirt":2,"pants":0,"accessory":2,"accent":1,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://api.scite.ai/mcp","name":"scite","authType":"oauth"}]}',
    'Scite Agent — connected to Scite via MCP (OAuth).

Scite delivers evidence-based answers grounded in peer-reviewed research and citation context. Its connector helps assistants verify scientific claims, surface supporting or disputing studies, and prioritize trustworthy research sources.

This agent can:
• Access Scite data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Scite agent — Evidence-based answers grounded in research (OAuth)',
    'scite,scite,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Scite data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["Scite account (OAuth connection required)"]',
    '[{"label":"Scite MCP Server","url":"https://api.scite.ai/mcp"}]',
    'https://icons.duckduckgo.com/ip3/scite.ai.ico'
  ),
  (
    'Send Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Send agent connected via the Send MCP at https://www.send.co/mcp. Create shareable documents, one-pagers, and decks You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":5,"hair":4,"shirt":8,"pants":2,"accessory":5,"accent":0,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://www.send.co/mcp","name":"send","authType":"oauth"}]}',
    'Send Agent — connected to Send via MCP (OAuth).

Send helps users create shareable documents, one-pagers, decks, and presentations. Its connector lets assistants turn requested materials into published links, interactive pages, and trackable collateral for recipients.

This agent can:
• Access Send data and capabilities via MCP
• Automate Send workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Send agent — Create shareable documents, one-pagers, and decks (OAuth)',
    'send,send,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Send data and capabilities via MCP","Automate Send workflows from conversation"]',
    '["Development"]',
    '["Send account (OAuth connection required)"]',
    '[{"label":"Send MCP Server","url":"https://www.send.co/mcp"}]',
    'https://icons.duckduckgo.com/ip3/send.co.ico'
  ),
  (
    'Shapes Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Shapes agent connected via the Shapes MCP at https://mcp.shapes.co/. Analyse your live people data, right in Claude You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":5,"hair":0,"shirt":11,"pants":0,"accessory":3,"accent":3,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.shapes.co/","name":"shapes","authType":"oauth"}]}',
    'Shapes Agent — connected to Shapes via MCP (OAuth).

Shapes connects assistants to live HR and people data, including headcount, attrition risk, compensation gaps, and time off. Its connector respects existing permissions while giving teams instant people-analytics context without switching tools.

This agent can:
• Access Shapes data and capabilities via MCP
• Automate Shapes workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Shapes agent — Analyse your live people data, right in Claude (OAuth)',
    'shapes,shapes,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Shapes data and capabilities via MCP","Automate Shapes workflows from conversation"]',
    '["Data & Analytics"]',
    '["Shapes account (OAuth connection required)"]',
    '[{"label":"Shapes MCP Server","url":"https://mcp.shapes.co/"}]',
    'https://icons.duckduckgo.com/ip3/shapes.co.ico'
  ),
  (
    'SignNow Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a SignNow agent connected via the SignNow MCP at https://mcp-server.signnow.com/mcp. E-signatures and documents You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":3,"hair":7,"shirt":4,"pants":2,"accessory":0,"accent":7,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp-server.signnow.com/mcp","name":"signnow","authType":"oauth"}]}',
    'SignNow Agent — connected to SignNow via MCP (OAuth).

SignNow is an e-signature platform for sending, signing, and managing documents. Its remote MCP server connects assistants to signing workflows so documents can be prepared, sent for signature, and tracked without switching tools.

This agent can:
• Access SignNow data and capabilities via MCP
• Automate SignNow workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'SignNow agent — E-signatures and documents (OAuth)',
    'signnow,signnow,mcp,Development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access SignNow data and capabilities via MCP","Automate SignNow workflows from conversation"]',
    '["Development"]',
    '["SignNow account (OAuth connection required)"]',
    '[{"label":"SignNow MCP Server","url":"https://mcp-server.signnow.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/signnow.com.ico'
  ),
  (
    'Solve Intelligence Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Solve Intelligence agent connected via the Solve Intelligence MCP at https://api.solveintelligence.com/mcp/. Search, draft, and chart patents You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":4,"hair":4,"shirt":0,"pants":0,"accessory":0,"accent":4,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://api.solveintelligence.com/mcp/","name":"solve-intelligence","authType":"oauth"}]}',
    'Solve Intelligence Agent — connected to Solve Intelligence via MCP (OAuth).

Solve Intelligence supports patent workflows across patent literature, non-patent literature, legal texts, standards, and the open web. Its connector helps assistants search, draft, chart, and analyze patent-related materials.

This agent can:
• Access Solve Intelligence data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Solve Intelligence agent — Search, draft, and chart patents (OAuth)',
    'solve-intelligence,solve intelligence,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Solve Intelligence data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["Solve Intelligence account (OAuth connection required)"]',
    '[{"label":"Solve Intelligence MCP Server","url":"https://api.solveintelligence.com/mcp/"}]',
    'https://icons.duckduckgo.com/ip3/solveintelligence.com.ico'
  ),
  (
    'S&P Global Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a S&P Global agent connected via the S&P Global MCP at https://kfinance.kensho.com/integrations/mcp. Capital IQ financials, market data You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":0,"shirt":11,"pants":2,"accessory":3,"accent":12,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://kfinance.kensho.com/integrations/mcp","name":"sp-global","authType":"oauth"}]}',
    'S&P Global Agent — connected to S&P Global via MCP (OAuth).

Capital IQ financials, market data

This agent can:
• Access S&P Global data and capabilities via MCP
• Automate S&P Global workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'S&P Global agent — Capital IQ financials, market data (OAuth)',
    'sp-global,s&p global,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access S&P Global data and capabilities via MCP","Automate S&P Global workflows from conversation"]',
    '["Finance"]',
    '["S&P Global account (OAuth connection required)"]',
    '[{"label":"S&P Global MCP Server","url":"https://kfinance.kensho.com/integrations/mcp"}]',
    'https://icons.duckduckgo.com/ip3/kensho.com.ico'
  ),
  (
    'Splice Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Splice agent connected via the Splice MCP at https://mcp.splice.com/mcp. Search Splice''s sounds catalog, build stacks & more! You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":0,"hair":4,"shirt":5,"pants":1,"accessory":0,"accent":9,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.splice.com/mcp","name":"splice","authType":"oauth"}]}',
    'Splice Agent — connected to Splice via MCP (OAuth).

Splice provides discovery and ideation tools for music creators using its catalog of royalty-free samples. Its MCP server helps assistants search sounds with natural language and build stacks of complementary sounds for new projects.

This agent can:
• Access Splice data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Splice agent — Search Splice''s sounds catalog, build stacks & more! (OAuth)',
    'splice,splice,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Splice data and capabilities via MCP","Search and retrieve information"]',
    '["Data & Analytics"]',
    '["Splice account (OAuth connection required)"]',
    '[{"label":"Splice MCP Server","url":"https://mcp.splice.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/splice.com.ico'
  ),
  (
    'Spotify Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Spotify agent connected via the Spotify MCP at https://mcp-gateway-external-pilot.spotify.net/mcp. Music and podcast recommendations, just for you. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":3,"hair":2,"shirt":12,"pants":0,"accessory":0,"accent":0,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp-gateway-external-pilot.spotify.net/mcp","name":"spotify","authType":"oauth"}]}',
    'Spotify Agent — connected to Spotify via MCP (OAuth).

Spotify helps users discover music and podcasts based on personal taste, activity, mood, or topic. Its connector gives assistants music-discovery context for recommending songs, artists, albums, playlists, podcasts, and listening experiences.

This agent can:
• Access Spotify data and capabilities via MCP
• Automate Spotify workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Spotify agent — Music and podcast recommendations, just for you. (OAuth)',
    'spotify,spotify,mcp,Design',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Spotify data and capabilities via MCP","Automate Spotify workflows from conversation"]',
    '["Design"]',
    '["Spotify account (OAuth connection required)"]',
    '[{"label":"Spotify MCP Server","url":"https://mcp-gateway-external-pilot.spotify.net/mcp"}]',
    'https://icons.duckduckgo.com/ip3/spotify.net.ico'
  ),
  (
    'Sprouts Data Intelligence Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Sprouts Data Intelligence agent connected via the Sprouts Data Intelligence MCP at https://sprouts-mcp-server.kartikay-dhar.workers.dev. From query to qualified lead in seconds. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":3,"hair":7,"shirt":7,"pants":1,"accessory":1,"accent":5,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://sprouts-mcp-server.kartikay-dhar.workers.dev","name":"sprouts","authType":"oauth"}]}',
    'Sprouts Data Intelligence Agent — connected to Sprouts Data Intelligence via MCP (OAuth).

Sprouts Data Intelligence provides natural-language access to Sprouts.ai''s B2B prospect database. Its connector helps assistants search contacts and companies by role, industry, location, company size, and other lead-qualification signals.

This agent can:
• Access Sprouts Data Intelligence data and capabilities via MCP
• Automate Sprouts Data Intelligence workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Sprouts Data Intelligence agent — From query to qualified lead in seconds. (OAuth)',
    'sprouts,sprouts data intelligence,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Sprouts Data Intelligence data and capabilities via MCP","Automate Sprouts Data Intelligence workflows from conversation"]',
    '["Business"]',
    '["Sprouts Data Intelligence account (OAuth connection required)"]',
    '[{"label":"Sprouts Data Intelligence MCP Server","url":"https://sprouts-mcp-server.kartikay-dhar.workers.dev"}]',
    'https://icons.duckduckgo.com/ip3/workers.dev.ico'
  ),
  (
    'Square Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Square agent connected via the Square MCP at https://mcp.squareup.com/sse. Search and manage transaction, merchant, and payment data You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":7,"shirt":6,"pants":1,"accessory":0,"accent":0,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.squareup.com/sse","name":"square","authType":"oauth"}]}',
    'Square Agent — connected to Square via MCP (OAuth).

Square is a commerce platform for transactions, merchants, customers, inventory, payments, and sales reporting. Its connector gives assistants business-operations context for payment data, point-of-sale workflows, financial reports, and customer profiles.

This agent can:
• Access Square data and capabilities via MCP
• Search and retrieve information
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Square agent — Search and manage transaction, merchant, and payment data (OAuth)',
    'square,square,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Square data and capabilities via MCP","Search and retrieve information","Create and manage resources"]',
    '["Finance"]',
    '["Square account (OAuth connection required)"]',
    '[{"label":"Square MCP Server","url":"https://mcp.squareup.com/sse"}]',
    'https://icons.duckduckgo.com/ip3/squareup.com.ico'
  ),
  (
    'StubHub Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a StubHub agent connected via the StubHub MCP at https://open-ai-app.stubhub.net/mcp. Find tickets on the World''s Largest Ticket Marketplace You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":3,"shirt":2,"pants":2,"accessory":1,"accent":11,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://open-ai-app.stubhub.net/mcp","name":"stubhub","authType":"oauth"}]}',
    'StubHub Agent — connected to StubHub via MCP (OAuth).

StubHub helps users explore live event tickets with real-time availability, pricing, and view-quality information. Its connector brings concerts, sports, theater, comedy, festivals, and other event listings into assistant workflows.

This agent can:
• Access StubHub data and capabilities via MCP
• Automate StubHub workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'StubHub agent — Find tickets on the World''s Largest Ticket Marketplace (OAuth)',
    'stubhub,stubhub,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access StubHub data and capabilities via MCP","Automate StubHub workflows from conversation"]',
    '["Finance"]',
    '["StubHub account (OAuth connection required)"]',
    '[{"label":"StubHub MCP Server","url":"https://open-ai-app.stubhub.net/mcp"}]',
    'https://icons.duckduckgo.com/ip3/stubhub.net.ico'
  ),
  (
    'Superhuman Mail Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Superhuman Mail agent connected via the Superhuman Mail MCP at https://mcp.mail.superhuman.com/mcp. Drive your email and calendar, right from Claude You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":5,"hair":0,"shirt":7,"pants":1,"accessory":0,"accent":12,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.mail.superhuman.com/mcp","name":"superhuman-mail","authType":"oauth"}]}',
    'Superhuman Mail Agent — connected to Superhuman Mail via MCP (OAuth).

Superhuman Mail connects email and calendar workflows to assistants. Its connector helps users search inboxes, draft replies, check read statuses, set reminders, schedule meetings, and send messages without leaving the AI workflow.

This agent can:
• Access Superhuman Mail data and capabilities via MCP
• Automate Superhuman Mail workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Superhuman Mail agent — Drive your email and calendar, right from Claude (OAuth)',
    'superhuman-mail,superhuman mail,mcp,Productivity',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Superhuman Mail data and capabilities via MCP","Automate Superhuman Mail workflows from conversation"]',
    '["Productivity"]',
    '["Superhuman Mail account (OAuth connection required)"]',
    '[{"label":"Superhuman Mail MCP Server","url":"https://mcp.mail.superhuman.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/superhuman.com.ico'
  ),
  (
    'Supermetrics Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Supermetrics agent connected via the Supermetrics MCP at https://mcp.supermetrics.com/mcp. Marketing data and reporting You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":4,"hair":7,"shirt":12,"pants":0,"accessory":0,"accent":11,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.supermetrics.com/mcp","name":"supermetrics","authType":"oauth"}]}',
    'Supermetrics Agent — connected to Supermetrics via MCP (OAuth).

Supermetrics is a marketing data platform that unifies advertising, analytics, CRM, and ecommerce data from over 150 sources. Its remote MCP server gives assistants direct access to that cross-channel data for reporting and performance analysis.

This agent can:
• Access Supermetrics data and capabilities via MCP
• Automate Supermetrics workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Supermetrics agent — Marketing data and reporting (OAuth)',
    'supermetrics,supermetrics,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Supermetrics data and capabilities via MCP","Automate Supermetrics workflows from conversation"]',
    '["Finance"]',
    '["Supermetrics account (OAuth connection required)"]',
    '[{"label":"Supermetrics MCP Server","url":"https://mcp.supermetrics.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/supermetrics.com.ico'
  ),
  (
    'SurveyMonkey Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a SurveyMonkey agent connected via the SurveyMonkey MCP at https://mcp.surveymonkey.com/mcp. Design surveys, collect responses, and analyze results You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":4,"hair":5,"shirt":5,"pants":0,"accessory":3,"accent":11,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.surveymonkey.com/mcp","name":"surveymonkey","authType":"oauth"}]}',
    'SurveyMonkey Agent — connected to SurveyMonkey via MCP (OAuth).

SurveyMonkey helps teams design surveys, collect responses, analyze feedback, and uncover trends. Its connector brings survey-building and response-analysis context into assistant workflows so feedback can become clear next steps.

This agent can:
• Access SurveyMonkey data and capabilities via MCP
• Analyze data and generate insights

To connect: Click "Connect via OAuth" when hiring this agent.',
    'SurveyMonkey agent — Design surveys, collect responses, and analyze results (OAuth)',
    'surveymonkey,surveymonkey,mcp,Design',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access SurveyMonkey data and capabilities via MCP","Analyze data and generate insights"]',
    '["Design"]',
    '["SurveyMonkey account (OAuth connection required)"]',
    '[{"label":"SurveyMonkey MCP Server","url":"https://mcp.surveymonkey.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/surveymonkey.com.ico'
  ),
  (
    'Synthesize Bio Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Synthesize Bio agent connected via the Synthesize Bio MCP at https://app.synthesize.bio/api/mcp. Generate gene expression from a virtual human You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":1,"hair":0,"shirt":3,"pants":1,"accessory":0,"accent":7,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://app.synthesize.bio/api/mcp","name":"synthesize-bio","authType":"oauth"}]}',
    'Synthesize Bio Agent — connected to Synthesize Bio via MCP (OAuth).

Synthesize Bio generates and analyzes gene-expression data from a virtual human using natural-language experiment descriptions. Its connector gives assistants synthetic biology context for bulk and single-cell RNA-seq style workflows.

This agent can:
• Access Synthesize Bio data and capabilities via MCP
• Automate Synthesize Bio workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Synthesize Bio agent — Generate gene expression from a virtual human (OAuth)',
    'synthesize-bio,synthesize bio,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Synthesize Bio data and capabilities via MCP","Automate Synthesize Bio workflows from conversation"]',
    '["Business"]',
    '["Synthesize Bio account (OAuth connection required)"]',
    '[{"label":"Synthesize Bio MCP Server","url":"https://app.synthesize.bio/api/mcp"}]',
    'https://icons.duckduckgo.com/ip3/synthesize.bio.ico'
  ),
  (
    'Taskrabbit Booking Assistance Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Taskrabbit Booking Assistance agent connected via the Taskrabbit Booking Assistance MCP at https://mcp.taskrabbit.com/mcp. Find & book local Taskrabbit services near you You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":6,"shirt":5,"pants":2,"accessory":2,"accent":7,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.taskrabbit.com/mcp","name":"taskrabbit","authType":"oauth"}]}',
    'Taskrabbit Booking Assistance Agent — connected to Taskrabbit Booking Assistance via MCP (OAuth).

Taskrabbit Booking Assistance checks local service availability and pricing, then guides users through scoping questions for home-service needs. Its connector brings location-based pricing, service details, and booking links into assistant workflows.

This agent can:
• Access Taskrabbit Booking Assistance data and capabilities via MCP
• Automate Taskrabbit Booking Assistance workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Taskrabbit Booking Assistance agent — Find & book local Taskrabbit services near you (OAuth)',
    'taskrabbit,taskrabbit booking assistance,mcp,Productivity',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Taskrabbit Booking Assistance data and capabilities via MCP","Automate Taskrabbit Booking Assistance workflows from conversation"]',
    '["Productivity"]',
    '["Taskrabbit Booking Assistance account (OAuth connection required)"]',
    '[{"label":"Taskrabbit Booking Assistance MCP Server","url":"https://mcp.taskrabbit.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/taskrabbit.com.ico'
  ),
  (
    'Third Bridge Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Third Bridge agent connected via the Third Bridge MCP at https://ai.thirdbridge.com/mcp/sse. Expert-led enhanced insights You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":4,"hair":2,"shirt":8,"pants":0,"accessory":4,"accent":11,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://ai.thirdbridge.com/mcp/sse","name":"third-bridge","authType":"oauth"}]}',
    'Third Bridge Agent — connected to Third Bridge via MCP (OAuth).

Third Bridge provides expert-led insights for financial and business analysis. Its connector brings trusted expert-content context into assistant workflows so users can query substantial research libraries and improve analytical output.

This agent can:
• Access Third Bridge data and capabilities via MCP
• Automate Third Bridge workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Third Bridge agent — Expert-led enhanced insights (OAuth)',
    'third-bridge,third bridge,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Third Bridge data and capabilities via MCP","Automate Third Bridge workflows from conversation"]',
    '["Data & Analytics"]',
    '["Third Bridge account (OAuth connection required)"]',
    '[{"label":"Third Bridge MCP Server","url":"https://ai.thirdbridge.com/mcp/sse"}]',
    'https://icons.duckduckgo.com/ip3/thirdbridge.com.ico'
  ),
  (
    'Thumbtack Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Thumbtack agent connected via the Thumbtack MCP at https://mcp.thumbtack.com/mcp. Find and hire local pros in Claude You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":0,"hair":3,"shirt":1,"pants":0,"accessory":4,"accent":12,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.thumbtack.com/mcp","name":"thumbtack","authType":"oauth"}]}',
    'Thumbtack Agent — connected to Thumbtack via MCP (OAuth).

Thumbtack helps users plan home projects and connect with local professionals. Its connector brings repair, maintenance, improvement, recommendation, and hiring context into assistant workflows so users can move from project ideas to qualified pros.

This agent can:
• Access Thumbtack data and capabilities via MCP
• Automate Thumbtack workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Thumbtack agent — Find and hire local pros in Claude (OAuth)',
    'thumbtack,thumbtack,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Thumbtack data and capabilities via MCP","Automate Thumbtack workflows from conversation"]',
    '["Business"]',
    '["Thumbtack account (OAuth connection required)"]',
    '[{"label":"Thumbtack MCP Server","url":"https://mcp.thumbtack.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/thumbtack.com.ico'
  ),
  (
    'Ticket Tailor Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Ticket Tailor agent connected via the Ticket Tailor MCP at https://mcp.tickettailor.ai/mcp. Event platform for managing tickets, orders & more You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":7,"shirt":9,"pants":2,"accessory":3,"accent":9,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.tickettailor.ai/mcp","name":"ticket-tailor","authType":"oauth"}]}',
    'Ticket Tailor Agent — connected to Ticket Tailor via MCP (OAuth).

Ticket Tailor provides event organizers with tools for ticketing, orders, discounts, products, and box-office management. Its connector gives assistants event-operations context for managing ticket workflows and answering account questions.

This agent can:
• Access Ticket Tailor data and capabilities via MCP
• Automate Ticket Tailor workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Ticket Tailor agent — Event platform for managing tickets, orders & more (OAuth)',
    'ticket-tailor,ticket tailor,mcp,Communication',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Ticket Tailor data and capabilities via MCP","Automate Ticket Tailor workflows from conversation"]',
    '["Communication"]',
    '["Ticket Tailor account (OAuth connection required)"]',
    '[{"label":"Ticket Tailor MCP Server","url":"https://mcp.tickettailor.ai/mcp"}]',
    'https://icons.duckduckgo.com/ip3/tickettailor.ai.ico'
  ),
  (
    'Todoist Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Todoist agent connected via the Todoist MCP at https://ai.todoist.net/mcp. Search, complete, and manage your tasks in Todoist You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":4,"hair":3,"shirt":10,"pants":2,"accessory":5,"accent":12,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://ai.todoist.net/mcp","name":"todoist","authType":"oauth"}]}',
    'Todoist Agent — connected to Todoist via MCP (OAuth).

Todoist helps users search, complete, and manage tasks and time-blocking workflows. Its connector gives assistants task context for productivity planning, status questions, and day-to-day work management inside Todoist.

This agent can:
• Access Todoist data and capabilities via MCP
• Search and retrieve information
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Todoist agent — Search, complete, and manage your tasks in Todoist (OAuth)',
    'todoist,todoist,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Todoist data and capabilities via MCP","Search and retrieve information","Create and manage resources"]',
    '["Data & Analytics"]',
    '["Todoist account (OAuth connection required)"]',
    '[{"label":"Todoist MCP Server","url":"https://ai.todoist.net/mcp"}]',
    'https://icons.duckduckgo.com/ip3/todoist.net.ico'
  ),
  (
    'TopCounsel by The L Suite Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a TopCounsel by The L Suite agent connected via the TopCounsel by The L Suite MCP at https://api.techgc.co/api/mcp/topcounsel. Outside Counsel recommendations from Inhouse Counsel You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":6,"hair":6,"shirt":9,"pants":2,"accessory":0,"accent":8,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://api.techgc.co/api/mcp/topcounsel","name":"topcounsel","authType":"oauth"}]}',
    'TopCounsel by The L Suite Agent — connected to TopCounsel by The L Suite via MCP (OAuth).

TopCounsel by The L Suite helps users find outside counsel recommendations based on insights from a large in-house counsel community. Its connector brings legal-provider rankings, expertise signals, and recommendation context into assistant workflows.

This agent can:
• Access TopCounsel by The L Suite data and capabilities via MCP
• Automate TopCounsel by The L Suite workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'TopCounsel by The L Suite agent — Outside Counsel recommendations from Inhouse Counsel (OAuth)',
    'topcounsel,topcounsel by the l suite,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access TopCounsel by The L Suite data and capabilities via MCP","Automate TopCounsel by The L Suite workflows from conversation"]',
    '["Business"]',
    '["TopCounsel by The L Suite account (OAuth connection required)"]',
    '[{"label":"TopCounsel by The L Suite MCP Server","url":"https://api.techgc.co/api/mcp/topcounsel"}]',
    'https://icons.duckduckgo.com/ip3/techgc.co.ico'
  ),
  (
    'Trellis Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Trellis agent connected via the Trellis MCP at https://mcp.trellis.law/anthropic. Claude for Trial Court Litigators You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":4,"hair":1,"shirt":11,"pants":1,"accessory":4,"accent":1,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.trellis.law/anthropic","name":"trellis","authType":"oauth"}]}',
    'Trellis Agent — connected to Trellis via MCP (OAuth).

Trellis gives trial-court litigators access to state trial-court data including dockets, rulings, verdicts, and filings. Its connector grounds assistants in litigation context for legal research, judge analytics, motion drafting, and case strategy.

This agent can:
• Access Trellis data and capabilities via MCP
• Automate Trellis workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Trellis agent — Claude for Trial Court Litigators (OAuth)',
    'trellis,trellis,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Trellis data and capabilities via MCP","Automate Trellis workflows from conversation"]',
    '["Business"]',
    '["Trellis account (OAuth connection required)"]',
    '[{"label":"Trellis MCP Server","url":"https://mcp.trellis.law/anthropic"}]',
    'https://icons.duckduckgo.com/ip3/trellis.law.ico'
  ),
  (
    'Trimble SketchUp Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Trimble SketchUp agent connected via the Trimble SketchUp MCP at https://api.sketchup.com/mcp/v1/sketchup/mcp. Create and iterate 3D models for use in SketchUp You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":2,"shirt":10,"pants":2,"accessory":4,"accent":4,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://api.sketchup.com/mcp/v1/sketchup/mcp","name":"sketchup","authType":"oauth"}]}',
    'Trimble SketchUp Agent — connected to Trimble SketchUp via MCP (OAuth).

Trimble SketchUp turns conversational descriptions into 3D model concepts for SketchUp. Its connector helps users generate, refine, and share room additions, furniture ideas, site concepts, and other models without needing modeling experience to start.

This agent can:
• Access Trimble SketchUp data and capabilities via MCP
• Automate Trimble SketchUp workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Trimble SketchUp agent — Create and iterate 3D models for use in SketchUp (OAuth)',
    'sketchup,trimble sketchup,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Trimble SketchUp data and capabilities via MCP","Automate Trimble SketchUp workflows from conversation"]',
    '["AI & ML"]',
    '["Trimble SketchUp account (OAuth connection required)"]',
    '[{"label":"Trimble SketchUp MCP Server","url":"https://api.sketchup.com/mcp/v1/sketchup/mcp"}]',
    'https://icons.duckduckgo.com/ip3/sketchup.com.ico'
  ),
  (
    'Tripadvisor Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Tripadvisor agent connected via the Tripadvisor MCP at https://production.ai-mcp-extensibility-prd.tamg.cloud/ogMvjY4De1G7CiHanMOAgddl/mcp. Find your perfect hotel based on Tripadvisor reviews You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":1,"hair":7,"shirt":6,"pants":1,"accessory":3,"accent":0,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://production.ai-mcp-extensibility-prd.tamg.cloud/ogMvjY4De1G7CiHanMOAgddl/mcp","name":"tripadvisor","authType":"oauth"}]}',
    'Tripadvisor Agent — connected to Tripadvisor via MCP (OAuth).

Tripadvisor hotel tools provide data for accommodation research, including hotel details, photos, reviews, ratings, availability, pricing, and nearby points of interest. The connector grounds assistant-led hotel comparison in Tripadvisor location and hotel data.

This agent can:
• Access Tripadvisor data and capabilities via MCP
• Automate Tripadvisor workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Tripadvisor agent — Find your perfect hotel based on Tripadvisor reviews (OAuth)',
    'tripadvisor,tripadvisor,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Tripadvisor data and capabilities via MCP","Automate Tripadvisor workflows from conversation"]',
    '["Business"]',
    '["Tripadvisor account (OAuth connection required)"]',
    '[{"label":"Tripadvisor MCP Server","url":"https://production.ai-mcp-extensibility-prd.tamg.cloud/ogMvjY4De1G7CiHanMOAgddl/mcp"}]',
    'https://icons.duckduckgo.com/ip3/tamg.cloud.ico'
  ),
  (
    'Trivago Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Trivago agent connected via the Trivago MCP at https://mcp.trivago.com/mcp. Find your ideal hotel at the best price. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":0,"shirt":7,"pants":1,"accessory":1,"accent":9,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.trivago.com/mcp","name":"trivago","authType":"oauth"}]}',
    'Trivago Agent — connected to Trivago via MCP (OAuth).

Trivago helps users search hotels and accommodations by coordinates, cities, countries, dates, and travel context. Its connector gives assistants lodging-search context for finding suitable stays near destinations or points of interest.

This agent can:
• Access Trivago data and capabilities via MCP
• Automate Trivago workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Trivago agent — Find your ideal hotel at the best price. (OAuth)',
    'trivago,trivago,mcp,Lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Trivago data and capabilities via MCP","Automate Trivago workflows from conversation"]',
    '["Lifestyle"]',
    '["Trivago account (OAuth connection required)"]',
    '[{"label":"Trivago MCP Server","url":"https://mcp.trivago.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/trivago.com.ico'
  ),
  (
    'Tropic Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Tropic agent connected via the Tropic MCP at https://app.tropicapp.io/mcp. Save money on Software + AI contracts You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":5,"hair":6,"shirt":12,"pants":1,"accessory":0,"accent":10,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://app.tropicapp.io/mcp","name":"tropic","authType":"oauth"}]}',
    'Tropic Agent — connected to Tropic via MCP (OAuth).

Tropic helps teams benchmark software and AI contract pricing against verified technology transactions. Its connector brings procurement and vendor-pricing context into assistant workflows for identifying savings opportunities and preparing negotiations.

This agent can:
• Access Tropic data and capabilities via MCP
• Automate Tropic workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Tropic agent — Save money on Software + AI contracts (OAuth)',
    'tropic,tropic,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Tropic data and capabilities via MCP","Automate Tropic workflows from conversation"]',
    '["Business"]',
    '["Tropic account (OAuth connection required)"]',
    '[{"label":"Tropic MCP Server","url":"https://app.tropicapp.io/mcp"}]',
    'https://icons.duckduckgo.com/ip3/tropicapp.io.ico'
  ),
  (
    'TurboTax Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a TurboTax agent connected via the TurboTax MCP at https://ai-inc.turbotax.intuit.com/358A1C1B-F73B-46A7-B130-4B14916E6843/v1/mcp. Tax tools and filing help You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":5,"hair":6,"shirt":9,"pants":1,"accessory":4,"accent":9,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://ai-inc.turbotax.intuit.com/358A1C1B-F73B-46A7-B130-4B14916E6843/v1/mcp","name":"turbotax","authType":"oauth"}]}',
    'TurboTax Agent — connected to TurboTax via MCP (OAuth).

TurboTax is Intuit''s consumer tax preparation platform. Its remote MCP server exposes TurboTax tools to assistants so tax questions can be explored and filing tasks supported with Intuit''s tax logic and account context.

This agent can:
• Access TurboTax data and capabilities via MCP
• Automate TurboTax workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'TurboTax agent — Tax tools and filing help (OAuth)',
    'turbotax,turbotax,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access TurboTax data and capabilities via MCP","Automate TurboTax workflows from conversation"]',
    '["Finance"]',
    '["TurboTax account (OAuth connection required)"]',
    '[{"label":"TurboTax MCP Server","url":"https://ai-inc.turbotax.intuit.com/358A1C1B-F73B-46A7-B130-4B14916E6843/v1/mcp"}]',
    'https://icons.duckduckgo.com/ip3/intuit.com.ico'
  ),
  (
    'Uber Eats Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Uber Eats agent connected via the Uber Eats MCP at https://mcp.ubereats.com/eats-claude/mcp. Explore restaurants and dishes You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":3,"hair":0,"shirt":8,"pants":1,"accessory":5,"accent":4,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.ubereats.com/eats-claude/mcp","name":"uber-eats","authType":"oauth"}]}',
    'Uber Eats Agent — connected to Uber Eats via MCP (OAuth).

Uber Eats helps users explore restaurants and dishes for local food delivery. Its connector brings restaurant, menu, dish, and delivery context into assistant workflows for finding meals and planning orders.

This agent can:
• Access Uber Eats data and capabilities via MCP
• Automate Uber Eats workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Uber Eats agent — Explore restaurants and dishes (OAuth)',
    'uber-eats,uber eats,mcp,Lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Uber Eats data and capabilities via MCP","Automate Uber Eats workflows from conversation"]',
    '["Lifestyle"]',
    '["Uber Eats account (OAuth connection required)"]',
    '[{"label":"Uber Eats MCP Server","url":"https://mcp.ubereats.com/eats-claude/mcp"}]',
    'https://icons.duckduckgo.com/ip3/ubereats.com.ico'
  ),
  (
    'Udemy Business Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Udemy Business agent connected via the Udemy Business MCP at https://api.udemy.com/mcp. Courses and learning content You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":2,"shirt":6,"pants":1,"accessory":5,"accent":6,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://api.udemy.com/mcp","name":"udemy-business","authType":"oauth"}]}',
    'Udemy Business Agent — connected to Udemy Business via MCP (OAuth).

Udemy Business is the enterprise edition of the Udemy learning platform, offering curated course libraries for organizations. Its remote MCP server lets assistants search courses and surface relevant learning content inside everyday workflows.

This agent can:
• Access Udemy Business data and capabilities via MCP
• Automate Udemy Business workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Udemy Business agent — Courses and learning content (OAuth)',
    'udemy-business,udemy business,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Udemy Business data and capabilities via MCP","Automate Udemy Business workflows from conversation"]',
    '["Business"]',
    '["Udemy Business account (OAuth connection required)"]',
    '[{"label":"Udemy Business MCP Server","url":"https://api.udemy.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/udemy.com.ico'
  ),
  (
    'Unthread Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Unthread agent connected via the Unthread MCP at https://app.unthread.io/api/mcp. Manage and automate your support tickets You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":6,"hair":7,"shirt":10,"pants":2,"accessory":4,"accent":1,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://app.unthread.io/api/mcp","name":"unthread","authType":"oauth"}]}',
    'Unthread Agent — connected to Unthread via MCP (OAuth).

Unthread helps teams search conversations, monitor SLAs, analyze support metrics, and manage support tickets. Its connector gives assistants a support-intelligence layer for helpdesk performance, triage, and workflow automation.

This agent can:
• Access Unthread data and capabilities via MCP
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Unthread agent — Manage and automate your support tickets (OAuth)',
    'unthread,unthread,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Unthread data and capabilities via MCP","Create and manage resources"]',
    '["Business"]',
    '["Unthread account (OAuth connection required)"]',
    '[{"label":"Unthread MCP Server","url":"https://app.unthread.io/api/mcp"}]',
    'https://icons.duckduckgo.com/ip3/unthread.io.ico'
  ),
  (
    'Verisk Underwriting Intelligence Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Verisk Underwriting Intelligence agent connected via the Verisk Underwriting Intelligence MCP at https://gatewaymcp.verisk.com/underwriting/intelligencemcp/v1. Ask questions. Get underwriting insights from Verisk. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":6,"hair":1,"shirt":8,"pants":0,"accessory":4,"accent":3,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://gatewaymcp.verisk.com/underwriting/intelligencemcp/v1","name":"verisk-underwriting-intelligence","authType":"oauth"}]}',
    'Verisk Underwriting Intelligence Agent — connected to Verisk Underwriting Intelligence via MCP (OAuth).

Verisk Underwriting Intelligence provides conversational access to ISO Loss Cost insights for underwriters, actuaries, and product teams with eligible subscriptions. Its connector grounds assistants in Verisk data and actuarial context for underwriting questions.

This agent can:
• Access Verisk Underwriting Intelligence data and capabilities via MCP
• Automate Verisk Underwriting Intelligence workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Verisk Underwriting Intelligence agent — Ask questions. Get underwriting insights from Verisk. (OAuth)',
    'verisk-underwriting-intelligence,verisk underwriting intelligence,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Verisk Underwriting Intelligence data and capabilities via MCP","Automate Verisk Underwriting Intelligence workflows from conversation"]',
    '["Data & Analytics"]',
    '["Verisk Underwriting Intelligence account (OAuth connection required)"]',
    '[{"label":"Verisk Underwriting Intelligence MCP Server","url":"https://gatewaymcp.verisk.com/underwriting/intelligencemcp/v1"}]',
    'https://icons.duckduckgo.com/ip3/verisk.com.ico'
  ),
  (
    'Verisk XactRestore Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Verisk XactRestore agent connected via the Verisk XactRestore MCP at https://xactrestore-xactremodelserver-usw2-prod.propsol.io/mcp. Natural-language estimating for XactRestore You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":2,"hair":7,"shirt":9,"pants":2,"accessory":5,"accent":6,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://xactrestore-xactremodelserver-usw2-prod.propsol.io/mcp","name":"verisk-xactrestore","authType":"oauth"}]}',
    'Verisk XactRestore Agent — connected to Verisk XactRestore via MCP (OAuth).

Verisk XactRestore supports natural-language estimating for restoration and remodeling professionals. Its connector helps assistants create rooms, adjust line items, apply Quick Estimates, and surface pricing details while keeping contractors in control.

This agent can:
• Access Verisk XactRestore data and capabilities via MCP
• Automate Verisk XactRestore workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Verisk XactRestore agent — Natural-language estimating for XactRestore (OAuth)',
    'verisk-xactrestore,verisk xactrestore,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Verisk XactRestore data and capabilities via MCP","Automate Verisk XactRestore workflows from conversation"]',
    '["Business"]',
    '["Verisk XactRestore account (OAuth connection required)"]',
    '[{"label":"Verisk XactRestore MCP Server","url":"https://xactrestore-xactremodelserver-usw2-prod.propsol.io/mcp"}]',
    'https://icons.duckduckgo.com/ip3/propsol.io.ico'
  ),
  (
    'Viator Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Viator agent connected via the Viator MCP at https://exp-app-mcp.prod.ep.viator.com/mcp. Book travel experiences around the world You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":3,"hair":3,"shirt":7,"pants":0,"accessory":2,"accent":4,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://exp-app-mcp.prod.ep.viator.com/mcp","name":"viator","authType":"oauth"}]}',
    'Viator Agent — connected to Viator via MCP (OAuth).

Viator helps users discover and book travel experiences, tours, attractions, and destination activities. Its connector gives assistants travel-experience context for narrowing options by destination, dates, price range, category, and practical trip details.

This agent can:
• Access Viator data and capabilities via MCP
• Automate Viator workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Viator agent — Book travel experiences around the world (OAuth)',
    'viator,viator,mcp,Lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Viator data and capabilities via MCP","Automate Viator workflows from conversation"]',
    '["Lifestyle"]',
    '["Viator account (OAuth connection required)"]',
    '[{"label":"Viator MCP Server","url":"https://exp-app-mcp.prod.ep.viator.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/viator.com.ico'
  ),
  (
    'Windsor.ai Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Windsor.ai agent connected via the Windsor.ai MCP at https://mcp.windsor.ai. Marketing data connectors, attribution You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":6,"hair":6,"shirt":10,"pants":2,"accessory":0,"accent":5,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.windsor.ai","name":"windsor-ai","authType":"oauth"}]}',
    'Windsor.ai Agent — connected to Windsor.ai via MCP (OAuth).

Windsor.ai connects marketing, analytics, CRM, and ecommerce data from hundreds of platforms for attribution and reporting. Its remote MCP server lets assistants analyze multi-channel performance across all connected sources in one conversation.

This agent can:
• Access Windsor.ai data and capabilities via MCP
• Automate Windsor.ai workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Windsor.ai agent — Marketing data connectors, attribution (OAuth)',
    'windsor-ai,windsor.ai,mcp,Finance',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Windsor.ai data and capabilities via MCP","Automate Windsor.ai workflows from conversation"]',
    '["Finance"]',
    '["Windsor.ai account (OAuth connection required)"]',
    '[{"label":"Windsor.ai MCP Server","url":"https://mcp.windsor.ai"}]',
    'https://icons.duckduckgo.com/ip3/windsor.ai.ico'
  ),
  (
    'WordPress.com Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a WordPress.com agent connected via the WordPress.com MCP at https://public-api.wordpress.com/wpcom/v2/mcp/v1. Secure AI access to manage your WordPress.com sites You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":5,"hair":6,"shirt":12,"pants":1,"accessory":0,"accent":5,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://public-api.wordpress.com/wpcom/v2/mcp/v1","name":"wordpress-com","authType":"oauth"}]}',
    'WordPress.com Agent — connected to WordPress.com via MCP (OAuth).

WordPress.com lets users manage and create site content through an assistant conversation. Its connector gives permission-scoped access to posts, stats, drafts, pages, and comments while keeping site access limited to approved resources.

This agent can:
• Access WordPress.com data and capabilities via MCP
• Create and manage resources

To connect: Click "Connect via OAuth" when hiring this agent.',
    'WordPress.com agent — Secure AI access to manage your WordPress.com sites (OAuth)',
    'wordpress-com,wordpress.com,mcp,AI & ML',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access WordPress.com data and capabilities via MCP","Create and manage resources"]',
    '["AI & ML"]',
    '["WordPress.com account (OAuth connection required)"]',
    '[{"label":"WordPress.com MCP Server","url":"https://public-api.wordpress.com/wpcom/v2/mcp/v1"}]',
    'https://icons.duckduckgo.com/ip3/wordpress.com.ico'
  ),
  (
    'Workable Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Workable agent connected via the Workable MCP at https://mcp.workable.com/mcp. Your AI assistant for Hiring and HR — inside Workable You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":0,"hairStyle":3,"hair":7,"shirt":0,"pants":1,"accessory":1,"accent":8,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.workable.com/mcp","name":"workable","authType":"oauth"}]}',
    'Workable Agent — connected to Workable via MCP (OAuth).

Workable supports recruiting and HR workflows across jobs, candidates, pipeline stages, reviews, requisitions, offers, and employee data. Its MCP server turns natural language into actions and insights across hiring and workforce operations.

This agent can:
• Access Workable data and capabilities via MCP
• Automate Workable workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Workable agent — Your AI assistant for Hiring and HR — inside Workable (OAuth)',
    'workable,workable,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Workable data and capabilities via MCP","Automate Workable workflows from conversation"]',
    '["Business"]',
    '["Workable account (OAuth connection required)"]',
    '[{"label":"Workable MCP Server","url":"https://mcp.workable.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/workable.com.ico'
  ),
  (
    'Wyndham Hotels and Resorts Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Wyndham Hotels and Resorts agent connected via the Wyndham Hotels and Resorts MCP at https://mcp.wyndhamhotels.com/claude/mcp. Discover the right Wyndham Hotel for you, faster You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":4,"hair":2,"shirt":10,"pants":1,"accessory":1,"accent":7,"beard":2,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.wyndhamhotels.com/claude/mcp","name":"wyndham-hotels","authType":"oauth"}]}',
    'Wyndham Hotels and Resorts Agent — connected to Wyndham Hotels and Resorts via MCP (OAuth).

Wyndham Hotels and Resorts helps travelers search and compare hotel options by city, dates, amenities, and trip needs. Its connector brings hotel-discovery context into assistant workflows for weekend getaways, family vacations, and work trips.

This agent can:
• Access Wyndham Hotels and Resorts data and capabilities via MCP
• Automate Wyndham Hotels and Resorts workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Wyndham Hotels and Resorts agent — Discover the right Wyndham Hotel for you, faster (OAuth)',
    'wyndham-hotels,wyndham hotels and resorts,mcp,Lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Wyndham Hotels and Resorts data and capabilities via MCP","Automate Wyndham Hotels and Resorts workflows from conversation"]',
    '["Lifestyle"]',
    '["Wyndham Hotels and Resorts account (OAuth connection required)"]',
    '[{"label":"Wyndham Hotels and Resorts MCP Server","url":"https://mcp.wyndhamhotels.com/claude/mcp"}]',
    'https://icons.duckduckgo.com/ip3/wyndhamhotels.com.ico'
  ),
  (
    'ZipRecruiter Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a ZipRecruiter agent connected via the ZipRecruiter MCP at https://api.ziprecruiter.com/mcp. Job search made easy You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":6,"hair":4,"shirt":5,"pants":1,"accessory":0,"accent":7,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://api.ziprecruiter.com/mcp","name":"ziprecruiter","authType":"oauth"}]}',
    'ZipRecruiter Agent — connected to ZipRecruiter via MCP (OAuth).

ZipRecruiter helps users search live jobs by title, company, location, salary, distance, work style, employment type, and posting date. Its connector brings job-search context into assistant workflows before handing applications back to ZipRecruiter.

This agent can:
• Access ZipRecruiter data and capabilities via MCP
• Search and retrieve information

To connect: Click "Connect via OAuth" when hiring this agent.',
    'ZipRecruiter agent — Job search made easy (OAuth)',
    'ziprecruiter,ziprecruiter,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access ZipRecruiter data and capabilities via MCP","Search and retrieve information"]',
    '["Business"]',
    '["ZipRecruiter account (OAuth connection required)"]',
    '[{"label":"ZipRecruiter MCP Server","url":"https://api.ziprecruiter.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/ziprecruiter.com.ico'
  ),
  (
    'Zocks Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Zocks agent connected via the Zocks MCP at https://mcp.zocks.io/v1/mcp. Analyze client conversations, patterns, and insights. You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":2,"hairStyle":2,"hair":5,"shirt":3,"pants":1,"accessory":4,"accent":1,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.zocks.io/v1/mcp","name":"zocks","authType":"oauth"}]}',
    'Zocks Agent — connected to Zocks via MCP (OAuth).

Zocks connects assistants to client conversation intelligence for financial advisors, including meeting insights, goals, concerns, and planning opportunities. Its connector helps surface tax, estate, and client-specific signals from interaction history.

This agent can:
• Access Zocks data and capabilities via MCP
• Analyze data and generate insights

To connect: Click "Connect via OAuth" when hiring this agent.',
    'Zocks agent — Analyze client conversations, patterns, and insights. (OAuth)',
    'zocks,zocks,mcp,Data & Analytics',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access Zocks data and capabilities via MCP","Analyze data and generate insights"]',
    '["Data & Analytics"]',
    '["Zocks account (OAuth connection required)"]',
    '[{"label":"Zocks MCP Server","url":"https://mcp.zocks.io/v1/mcp"}]',
    'https://icons.duckduckgo.com/ip3/zocks.io.ico'
  ),
  (
    'ZoomInfo Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a ZoomInfo agent connected via the ZoomInfo MCP at https://mcp.zoominfo.com/mcp. Enrich contacts & accounts with GTM intelligence You authenticate via OAuth — the user will connect their account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":0,"shirt":6,"pants":1,"accessory":3,"accent":4,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.zoominfo.com/mcp","name":"zoominfo","authType":"oauth"}]}',
    'ZoomInfo Agent — connected to ZoomInfo via MCP (OAuth).

ZoomInfo provides go-to-market intelligence with verified B2B company and contact data. Its connector helps assistants search companies, identify stakeholders, enrich records with hundreds of data points, and build targeted account lists.

This agent can:
• Access ZoomInfo data and capabilities via MCP
• Automate ZoomInfo workflows from conversation

To connect: Click "Connect via OAuth" when hiring this agent.',
    'ZoomInfo agent — Enrich contacts & accounts with GTM intelligence (OAuth)',
    'zoominfo,zoominfo,mcp,Business',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Access ZoomInfo data and capabilities via MCP","Automate ZoomInfo workflows from conversation"]',
    '["Business"]',
    '["ZoomInfo account (OAuth connection required)"]',
    '[{"label":"ZoomInfo MCP Server","url":"https://mcp.zoominfo.com/mcp"}]',
    'https://icons.duckduckgo.com/ip3/zoominfo.com.ico'
  );
