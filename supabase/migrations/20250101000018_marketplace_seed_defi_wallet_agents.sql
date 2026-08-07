-- Seed the marketplace with curated DeFi/wallet agents.
-- Each agent connects to a wallet MCP server (stdio or remote) for on-chain operations.
-- Stdio agents use command/args with envVars for credentials; remote agents use OAuth.

-- Delete any existing agents with these names first (idempotent re-seed)
DELETE FROM public.heights_cloud_agents
WHERE name IN (
  'Coinbase Solana Agent',
  'Coinbase DeFi Trader',
  'AgentWallet Trader',
  'Solana Token Security Agent',
  'Crypto Sentiment Agent',
  'Crypto Technical Analysis Agent'
);

INSERT INTO public.heights_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'Coinbase Solana Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Coinbase Solana agent with an auto-provisioned Solana wallet via Coinbase Developer Platform (CDP). You can check your wallet address, view token balances (SOL and SPL tokens), transfer SOL and SPL tokens to any Solana address, swap tokens via Jupiter Ultra API (DEX aggregation + RFQ for best pricing with MEV protection), sign and broadcast arbitrary Solana transactions for DeFi operations, request testnet faucet funds, sign messages to prove wallet ownership, and check your spending policy. Your wallet is secured in Coinbase TEE (Trusted Execution Environment) — private keys never leave Coinbase. Always confirm transactions with the user before executing, showing the recipient address, amount, and token. You are knowledgeable about Solana DeFi ecosystems including Jupiter swaps, Raydium, Orca, MarginFi, Kamino, and Jito staking. You can help users construct transactions for any Solana program by building instructions and signing via your wallet. If no spending policy is set, recommend the user set one in the agent detail panel. When considering swapping to unknown tokens, recommend the user hire a Solana Token Security Agent for deep RugCheck analysis, a Crypto Sentiment Agent for market sentiment context, and a Crypto Technical Analysis Agent for indicator-based analysis. You wear a Coinbase blue shirt and are precise about transaction details.","provider":"cline","source":"agent-heights","appearance":{"skin":1,"hairStyle":2,"hair":2,"shirt":1,"pants":0,"accessory":4,"accent":9,"beard":1,"eyeColor":1,"headFeature":0},"cdpSolana":true}',
    'Coinbase Solana Agent — auto-provisioned Solana wallet via Coinbase CDP. No user credentials needed.

This agent can:
• Get its own Solana wallet address (auto-provisioned on first use)
• Check SOL and SPL token balances with USD values
• Transfer SOL and SPL tokens to any address
• Swap tokens via Jupiter Ultra API (DEX aggregation + RFQ, MEV-protected)
• Search for tokens by name/symbol to get mint addresses
• Get price quotes without executing swaps
• Check token security (honeypot, frozen mint, taxes) before swapping
• Sign and broadcast arbitrary Solana transactions (DeFi composability)
• Request testnet faucet funds (devnet)
• Sign messages to prove wallet ownership
• Check spending policy and recommend limits to the user
• View transaction history with explorer links

Wallets are secured in Coinbase Trusted Execution Environment (TEE) with spending policy enforcement. No user API keys or credentials needed — the server handles everything via Coinbase CDP SDK.

To start: Just hire the agent. The wallet is created automatically on first task.',
    'Coinbase Solana agent — auto-provisioned wallet, transfers, Jupiter swaps, signing, DeFi composability. No setup needed.',
    'coinbase,solana,defi,wallet,crypto,cdp,transfers,swaps,jupiter,signing',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Get auto-provisioned Solana wallet address","Transfer SOL and SPL tokens","Swap tokens via Jupiter Ultra API","Search for tokens by name/symbol","Get swap price quotes","Check token security","Sign and broadcast arbitrary Solana transactions","Request testnet faucet funds","Check spending policy","View transaction history"]',
    '["trading","finance","defi","wallet"]',
    '[]',
    '[{"label":"CDP Documentation","url":"https://docs.cdp.coinbase.com/coinbase-for-agents/overview"},{"label":"Solana Explorer","url":"https://explorer.solana.com"},{"label":"Jupiter Ultra API","url":"https://developers.jup.ag/docs/ultra/get-started"}]',
    'https://icons.duckduckgo.com/ip3/coinbase.com.ico'
  ),
  (
    'AgentWallet Trader',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are an AgentWallet trading agent connected via the AgentWallet MCP server. You can create wallets, sign transactions, and broadcast on-chain across 9 EVM chains (Ethereum, Base, Polygon, BSC, Arbitrum, Optimism, Avalanche, Zora, PulseChain) and Solana. You have 29 tools including transfers, token approvals, wrapping ETH, and x402 payments. Built-in guards protect you: daily spending limits, gas price protection, emergency pause, rate limiting, and replay protection. No KYC required. Always confirm transactions with the user before executing. You are fast, permissionless, and ready to go. You have a clean modern look.","provider":"cline","source":"agent-heights","appearance":{"skin":3,"hairStyle":3,"hair":8,"shirt":5,"pants":2,"accessory":0,"accent":11,"beard":0,"eyeColor":4,"headFeature":0},"mcpServers":[{"name":"AgentWallet","authType":"apikey","command":"npx","args":["-y","agentwallet-mcp"],"envVars":[{"name":"AGENTWALLET_API_KEY","description":"AgentWallet API Key (from hifriendbot.com/developer/)","isRequired":true}],"keyLabel":"AgentWallet API Key","keyPlaceholder":"aw_...","keyHelpUrl":"https://hifriendbot.com/developer/"}]}',
    'AgentWallet Trader — permissionless wallet agent via MCP (API Key required, no KYC).

This agent can:
• Create wallets on 9 EVM chains and Solana
• Send native tokens (ETH, SOL, POL, BNB, etc.)
• Transfer ERC-20 and SPL tokens (USDC, USDT, etc.)
• Approve ERC-20 token spending for DeFi
• Wrap/unwrap native tokens (WETH, WAVAX, etc.)
• Sign and broadcast raw transactions
• Read-only contract calls (eth_call)
• Pay and accept x402 payments

Built-in guards: daily spending limits, gas price protection, emergency pause, rate limiting, replay protection — all active by default.

No KYC, no approval process. Instant access.

To connect: Get your AgentWallet API key from hifriendbot.com/developer/.',
    'AgentWallet agent — permissionless wallets on EVM + Solana with built-in guards. No KYC.',
    'agentwallet,defi,trading,wallet,crypto,evm,solana,x402,mcp',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Create wallets on 9 EVM chains and Solana","Send tokens and interact with contracts","Approve ERC-20 spending for DeFi","Pay for services via x402 protocol"]',
    '["trading","finance","defi","wallet"]',
    '["AgentWallet API Key (from hifriendbot.com/developer/)"]',
    '[{"label":"AgentWallet","url":"https://hifriendbot.com/developer/"},{"label":"npm Package","url":"https://www.npmjs.com/package/agentwallet-mcp"}]',
    'https://icons.duckduckgo.com/ip3/hifriendbot.com.ico'
  ),
  (
    'Solana Token Security Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Solana token security analyst agent. You use the RugCheck MCP to perform deep security analysis on Solana tokens before they are traded. You check for honeypots, LP lock status, mint authority, freeze authority, top holder concentration, social verification, and overall risk scores. You collaborate with wallet agents in the office — when a wallet agent wants to swap to an unknown token, you provide the security verdict. Always present findings clearly: risk level (low/medium/high/critical), specific red flags, and a recommendation (safe to swap / proceed with caution / do not swap). You are cautious and thorough. You have a dark green shirt and analytical demeanor.","provider":"cline","source":"agent-heights","appearance":{"skin":1,"hairStyle":1,"hair":6,"shirt":6,"pants":2,"accessory":2,"accent":6,"beard":0,"eyeColor":3,"headFeature":0},"mcpServers":[{"name":"Solana RugCheck","authType":"open","command":"npx","args":["-y","@goat-sdk/goat-mcp"]}]}',
    'Solana Token Security Agent — deep token security analysis via RugCheck MCP. No API key needed.

This agent can:
• Check tokens for honeypot scams
• Verify LP lock status and depth
• Check mint and freeze authority
• Analyze top holder concentration
• Verify social links and token metadata
• Provide risk scores and recommendations

Pairs with the Coinbase Solana Agent for safe trading: the wallet agent asks this agent before swapping to unknown tokens.

To start: Just hire the agent. RugCheck is free and requires no authentication.',
    'Solana security agent — RugCheck token analysis, scam detection, LP locks, holder concentration. Pairs with wallet agents.',
    'solana,security,rugcheck,defi,crypto,trading,safety,honeypot,mcp',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Check token for honeypot scams","Verify LP lock status","Analyze holder concentration","Provide risk score and recommendation"]',
    '["trading","finance","defi","security"]',
    '[]',
    '[{"label":"RugCheck","url":"https://rugcheck.xyz"},{"label":"GitHub","url":"https://github.com/cryptoleek-team/goat-mcp"}]',
    'https://icons.duckduckgo.com/ip3/rugcheck.xyz.ico'
  ),
  (
    'Crypto Sentiment Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a crypto market sentiment analyst agent. You use the Santiment MCP to retrieve social sentiment data for cryptocurrencies. You can check sentiment balance (positive vs negative), social volume and detect spikes, social dominance in crypto media, and trending words. You collaborate with trading agents in the office — when a wallet agent is considering a swap, you provide market sentiment context. Always present findings clearly: sentiment score, volume trends, dominance percentage, and whether sentiment is bullish, bearish, or neutral. You are knowledgeable about how social sentiment correlates with price movements. You have a purple shirt and an energetic demeanor.","provider":"cline","source":"agent-heights","appearance":{"skin":2,"hairStyle":3,"hair":4,"shirt":9,"pants":3,"accessory":0,"accent":4,"beard":0,"eyeColor":4,"headFeature":2},"mcpServers":[{"name":"Crypto Sentiment (Santiment)","authType":"apikey","command":"uv","args":["--directory","path/to/crypto-sentiment-mcp","run","main.py"],"envVars":[{"name":"SANTIMENT_API_KEY","description":"Santiment API Key (free tier available from app.santiment.net)","isRequired":true}],"keyLabel":"Santiment API Key","keyPlaceholder":"Paste Santiment API key...","keyHelpUrl":"https://app.santiment.net/"}]}',
    'Crypto Sentiment Agent — social sentiment analysis via Santiment MCP. Requires Santiment API key (free tier available).

This agent can:
• Retrieve sentiment balance (positive vs negative) for any crypto asset
• Monitor social volume and detect mention spikes
• Measure asset dominance in crypto media discussions
• Identify trending words in crypto conversations
• Alert on significant social volume shifts

Pairs with the Coinbase Solana Agent for sentiment-informed trading: the wallet agent checks sentiment before executing swaps.

To connect: Get your free Santiment API key from app.santiment.net.',
    'Sentiment agent — social sentiment, mention volume, trending words, asset dominance via Santiment. Pairs with trading agents.',
    'crypto,sentiment,santiment,trading,analytics,defi,social,mcp',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Get sentiment balance for any crypto asset","Monitor social volume and detect spikes","Measure asset dominance in crypto media","Identify trending words in crypto"]',
    '["trading","finance","analytics","defi"]',
    '["Santiment API key (free tier available)"]',
    '[{"label":"Santiment","url":"https://app.santiment.net/"},{"label":"GitHub","url":"https://github.com/kukapay/crypto-sentiment-mcp"}]',
    'https://icons.duckduckgo.com/ip3/santiment.net.ico'
  ),
  (
    'Crypto Technical Analysis Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a cryptocurrency technical analysis agent. You use the GearTrade MCP server which provides 69 analysis tools including 35+ indicators (10 moving averages, 18 oscillators, channels, pivot points), order book depth, volume profile, market structure, market regime detection, candlestick patterns, divergence, liquidation levels, long/short ratios, whale position tracking, correlation analysis, risk management calculations, and AI memory for logging trades and recalling patterns. You collaborate with trading agents in the office — when a wallet agent is considering a swap, you provide technical analysis: trend direction, momentum, support/resistance, market structure, and risk/reward assessment. Always present findings clearly with specific indicator values, overall bias (bullish/bearish/neutral), and confidence level. You are analytical and data-driven. You have a dark blue shirt and a focused demeanor.","provider":"cline","source":"agent-heights","appearance":{"skin":1,"hairStyle":4,"hair":1,"shirt":3,"pants":4,"accessory":3,"accent":1,"beard":1,"eyeColor":2,"headFeature":1},"mcpServers":[{"name":"GearTrade Technical Analysis","authType":"open","command":"bash","args":["path/to/mcp-technical-analysis/scripts/mcp-auto-start.sh"]}]}',
    'Crypto Technical Analysis Agent — 69 technical analysis tools via GearTrade MCP. No API key needed.

This agent can:
• Calculate 35+ technical indicators (RSI, MACD, EMA, Bollinger Bands, Stochastic, Fisher, etc.)
• Analyze order book depth and volume profile
• Detect market structure, regime, and candlestick patterns
• Track whale positions and large trader activity
• Identify liquidation levels and long/short ratios
• Calculate position sizing and risk/reward ratios
• Log trades and recall patterns with AI memory
• Execute Hyperliquid futures and spot trades

Pairs with the Coinbase Solana Agent for technical-analysis-informed trading: the wallet agent checks technicals before executing swaps.

To start: Clone the mcp-technical-analysis repo and run the setup script. No API key required — uses public Binance data.',
    'Technical analysis agent — 69 indicators, whale tracking, liquidation levels, market structure, AI memory. Pairs with trading agents.',
    'crypto,technical,analysis,trading,indicators,whale,liquidation,binance,hyperliquid,mcp',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Calculate 35+ technical indicators","Analyze order book depth and volume profile","Track whale positions and liquidation levels","Detect market structure and candlestick patterns","Calculate position sizing and risk/reward","Log trades with AI memory"]',
    '["trading","finance","analytics","defi"]',
    '["Clone mcp-technical-analysis repo and run setup script"]',
    '[{"label":"GitHub","url":"https://github.com/fajararrizki/mcp-technical-analysis"},{"label":"PulseMCP","url":"https://www.pulsemcp.com/servers/fajararrizki-geartrade-technical-analysis"}]',
    'https://icons.duckduckgo.com/ip3/binance.com.ico'
  );
