-- Seed the marketplace with placeholder agents so it's not empty.
-- All agents are free and approved so they show up in the marketplace browser.

INSERT INTO public.swarms_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'Robinhood Trading Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Robinhood trading agent connected via the Robinhood Trading MCP at https://agent.robinhood.com/mcp/trading. You can check portfolio value, buying power, account info, place trades, analyze portfolios, and research market data. Always confirm trade details with the user before executing. You wear a green Robinhood cap and are enthusiastic about helping users manage your investments.","provider":"cline","source":"agent-heights","appearance":{"skin":1,"hairStyle":5,"hair":0,"shirt":12,"pants":1,"accessory":4,"accent":12,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://agent.robinhood.com/mcp/trading","name":"robinhood","authType":"oauth"}]}',
    'Robinhood Trading Agent — connected via the Robinhood Trading MCP (https://agent.robinhood.com/mcp/trading).

This agent can:
• Check your portfolio value, buying power, and account information
• Place trades with various order types (market, limit, stop, etc.)
• Build portfolios based on research and news
• Automate trading strategies (e.g., "Buy $100 of ROAR every time the price drops 2%")
• Rebalance your portfolio to target allocations
• Analyze portfolio risk exposure
• Research market data and build bull/bear theses for tickers

To connect: Add the Robinhood Trading MCP link to your AI platform:
  https://agent.robinhood.com/mcp/trading

Supported platforms: Claude Code, Claude Desktop, ChatGPT, Codex, Cursor, Grok, and any MCP-compatible platform.

⚠️ You are ultimately responsible for the trades your AI agent places. Always review orders before execution.',
    'AI trading agent connected to Robinhood via MCP — manage portfolios, place trades, and analyze markets.',
    'robinhood,trading,mcp,investing,portfolio,stocks,automation',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Build portfolios from research and news","Automate trading strategies with conditional rules","Rebalance portfolios to target allocations","Analyze portfolio risk and exposure","Research market data and sentiment"]',
    '["trading","finance","automation"]',
    '["Robinhood Agentic account","MCP-compatible AI platform","Robinhood Trading MCP connection"]',
    '[{"label":"Robinhood Agentic Trading","url":"https://robinhood.com/us/en/support/articles/agentic-trading-overview/"},{"label":"Connect via MCP","url":"https://agent.robinhood.com/mcp/trading"}]',
    'https://www.google.com/s2/favicons?domain=robinhood.com&sz=128'
  ),
  (
    'Code Review Sentinel',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a meticulous code review agent. You analyze code for bugs, security vulnerabilities, performance issues, and style violations. You provide actionable feedback with specific line references and suggested fixes.","provider":"cline","source":"agent-heights"}',
    'Code Review Sentinel — an automated code review agent that scans your codebase for bugs, security vulnerabilities, performance bottlenecks, and style violations.

This agent provides:
• Line-by-line code analysis
• Security vulnerability detection (OWASP Top 10)
• Performance optimization suggestions
• Best practice enforcement
• Automated fix suggestions with diffs

Perfect for pre-merge reviews and continuous code quality monitoring.',
    'Automated code review agent — catches bugs, security issues, and performance problems before they ship.',
    'code-review,security,bugs,quality,automation',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Pre-merge pull request reviews","Security vulnerability scanning","Performance bottleneck identification","Code style and best practice enforcement"]',
    '["development","code-quality"]',
    '["Access to source code repository"]',
    '[]',
    null
  ),
  (
    'Data Analyst Pro',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a expert data analyst. You can clean, transform, and visualize data. You write SQL queries, Python scripts, and generate insights from datasets. You explain your findings clearly with charts and summaries.","provider":"cline","source":"agent-heights"}',
    'Data Analyst Pro — your AI-powered data analysis companion. Turns raw data into actionable insights.

Capabilities:
• SQL query writing and optimization
• Data cleaning and transformation
• Statistical analysis and hypothesis testing
• Chart and visualization generation
• Trend identification and forecasting
• Automated report generation

Works with CSV, JSON, SQL databases, and API data sources.',
    'AI data analyst — writes SQL, cleans data, generates insights, and creates visualizations from any dataset.',
    'data,sql,analytics,visualization,statistics,python',
    true,
    null,
    null,
    'Python',
    'agent',
    'approved',
    '["Write and optimize SQL queries","Clean and transform messy datasets","Generate charts and visualizations","Statistical analysis and forecasting"]',
    '["data","analytics"]',
    '["Access to data source (database, CSV, or API)"]',
    '[]',
    null
  ),
  (
    'Research Assistant',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a thorough research assistant. You search the web, synthesize information from multiple sources, and produce well-structured reports with citations. You are objective and note when sources conflict.","provider":"cline","source":"agent-heights"}',
    'Research Assistant — an AI agent that conducts thorough research on any topic and produces structured reports.

Features:
• Web search and source aggregation
• Fact-checking and cross-referencing
• Literature reviews and summaries
• Competitive analysis
• Market research with data-backed insights
• Citations and source tracking

Ideal for due diligence, academic research, and competitive intelligence.',
    'AI research assistant — searches, synthesizes, and produces cited reports on any topic.',
    'research,analysis,reports,citations,web-search',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Conduct topic research with web search","Produce structured reports with citations","Competitive and market analysis","Literature reviews and summaries"]',
    '["research"]',
    '["Web access for search"]',
    '[]',
    null
  ),
  (
    'DevOps Automator',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a DevOps automation agent. You manage CI/CD pipelines, infrastructure as code, container orchestration, and deployment automation. You can write Dockerfiles, GitHub Actions workflows, Terraform configs, and Kubernetes manifests.","provider":"cline","source":"agent-heights"}',
    'DevOps Automator — handles your infrastructure and deployment automation so you can focus on shipping code.

What it does:
• CI/CD pipeline creation and optimization
• Docker containerization and multi-stage builds
• Kubernetes manifest generation and management
• Terraform infrastructure as code
• GitHub Actions workflow automation
• Deployment strategy guidance (blue/green, canary, rolling)
• Monitoring and alerting setup

Supports AWS, GCP, Azure, Railway, Vercel, and self-hosted infrastructure.',
    'DevOps automation agent — manages CI/CD, Docker, Kubernetes, Terraform, and deployment pipelines.',
    'devops,cicd,docker,kubernetes,terraform,automation,infrastructure',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Create and optimize CI/CD pipelines","Generate Dockerfiles and Kubernetes manifests","Write Terraform infrastructure as code","Set up monitoring and alerting"]',
    '["devops","infrastructure"]',
    '["Access to CI/CD platform","Cloud provider credentials"]',
    '[]',
    null
  ),
  (
    'Content Writer',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a skilled content writer. You write blog posts, documentation, marketing copy, and technical articles. You adapt your tone to the target audience and optimize for SEO when requested.","provider":"cline","source":"agent-heights"}',
    'Content Writer — an AI agent that crafts high-quality written content for any audience.

Capabilities:
• Blog posts and articles (SEO-optimized)
• Technical documentation and API docs
• Marketing copy and landing pages
• Social media content and threads
• Email newsletters and campaigns
• Content editing and proofreading

Adapts tone from technical to casual, always delivers clean, ready-to-publish content.',
    'AI content writer — blogs, docs, marketing copy, and more, optimized for your audience.',
    'writing,content,blog,documentation,marketing,seo',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Write SEO-optimized blog posts","Create technical documentation","Craft marketing copy and landing pages","Social media content creation"]',
    '["content","marketing"]',
    '[]',
    '[]',
    null
  );
