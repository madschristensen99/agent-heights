-- Seed the marketplace with curated DeFi/wallet agents.
-- Each agent connects to a wallet MCP server (stdio or remote) for on-chain operations.
-- Stdio agents use command/args with envVars for credentials; remote agents use OAuth.

-- Delete any existing agents with these names first (idempotent re-seed)
DELETE FROM public.swarms_cloud_agents
WHERE name IN (
  'Coinbase DeFi Trader',
  'Talken Swap Agent',
  'Phantom Wallet Agent',
  'AgentWallet Trader',
  'WAIaaS DeFi Agent'
);

INSERT INTO public.swarms_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'Coinbase DeFi Trader',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Coinbase trading agent connected via the Coinbase for Agents MCP server (CDP CLI). You can place market and limit orders, manage portfolios, convert between USDC and USD, and access real-time market data. Every order supports dry-run preview — always show the user fees, slippage, and estimated fill price before executing. Always confirm transactions with the user before committing. You are knowledgeable about crypto markets, order types, and portfolio management. You wear a Coinbase blue shirt and are precise about order details.","provider":"cline","source":"agent-heights","appearance":{"skin":1,"hairStyle":2,"hair":2,"shirt":1,"pants":0,"accessory":4,"accent":9,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"name":"Coinbase","authType":"apikey","command":"npx","args":["-y","@coinbase/cdp-cli","mcp"],"envVars":[{"name":"CDP_API_KEY_NAME","description":"From your downloaded JSON key file — copy the name value","isRequired":true},{"name":"CDP_API_KEY_PRIVATE_KEY","description":"From your downloaded JSON key file — copy the privateKey value","isRequired":true}],"keyLabel":"CDP API Key","keyPlaceholder":"Paste key name...","keyHelpUrl":"https://portal.cdp.coinbase.com/api-keys/secret"}]}',
    'Coinbase DeFi Trader — connected to Coinbase via MCP (API Key required).

This agent can:
• Place market and limit orders on Coinbase Advanced Trade
• Check portfolio value, balances, and buying power
• Convert between USDC and USD
• Access real-time market data and price feeds
• Preview orders before executing (fees, slippage, estimated fill)
• Manage and rebalance crypto portfolios

To connect: Go to the Coinbase Developer Portal → API Keys → Create API Key (ECDSA). Download the JSON file and paste the two values (name and privateKey) into the credential fields.',
    'Coinbase DeFi agent — trade crypto, manage portfolios, convert USDC/USD via CDP MCP.',
    'coinbase,defi,trading,wallet,crypto,usdc,mcp',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Place market and limit orders on Coinbase","Convert between USDC and USD","Preview orders with fees and slippage","Manage and rebalance crypto portfolios"]',
    '["trading","finance","defi","wallet"]',
    '["Coinbase Developer Platform account","CDP API Key (download JSON from portal)"]',
    '[{"label":"CDP API Keys","url":"https://portal.cdp.coinbase.com/api-keys/secret"},{"label":"Documentation","url":"https://docs.cdp.coinbase.com/coinbase-for-agents/overview"}]',
    'https://icons.duckduckgo.com/ip3/coinbase.com.ico'
  ),
  (
    'Talken Swap Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Talken Agentic Wallet agent connected via the Talken MCP server. You can swap tokens across multiple DEXs, bridge assets cross-chain via Circle CCTP and LayerZero, trade perpetual futures and spot on Hyperliquid, take positions on Polymarket prediction markets, and stake assets. You support 10+ chains including Ethereum, Arbitrum, Solana, Bitcoin, and TRON. You use MPC technology so private keys are never exposed. You can execute gasless transactions paying fees in USDC or USDT. Always confirm trades with the user before executing, showing the trade details, expected output, and any slippage. You are knowledgeable about DEX aggregation, optimal routing, and cross-chain bridging. You have a sleek modern appearance with dark tones.","provider":"cline","source":"agent-heights","appearance":{"skin":2,"hairStyle":4,"hair":10,"shirt":8,"pants":5,"accessory":6,"accent":5,"beard":0,"eyeColor":2,"headFeature":3},"mcpServers":[{"name":"Talken Agentic Wallet","authType":"apikey","command":"npx","args":["-y","@talken/agentic-wallet"],"envVars":[{"name":"TALKEN_API_KEY","description":"Talken API Key (from talken.io dashboard)","isRequired":true}],"keyLabel":"Talken API Key","keyPlaceholder":"tk_...","keyHelpUrl":"https://docs.talken.io/"}]}',
    'Talken Swap Agent — connected to Talken Agentic Wallet via MCP (API Key required).

This agent can:
• Swap tokens across multiple DEXs with optimal rate finding
• Bridge assets cross-chain via Circle CCTP and LayerZero
• Trade perpetual futures and spot on Hyperliquid with leverage
• Take positions on Polymarket prediction markets
• Stake assets and manage staking positions
• Execute gasless transactions (pay fees in USDC/USDT)

Supported chains: Ethereum, Arbitrum, Solana, Bitcoin, TRON, and 5+ more.

To connect: Get your Talken API key from the Talken dashboard.',
    'Talken agent — multi-chain DEX swaps, cross-chain bridges, Hyperliquid perps, Polymarket, staking.',
    'talken,defi,trading,wallet,crypto,dex,bridge,hyperliquid,polymarket,staking,mcp',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Swap tokens across multiple DEXs with optimal routing","Bridge assets cross-chain (Circle CCTP, LayerZero)","Trade perps and spot on Hyperliquid","Stake assets and manage positions"]',
    '["trading","finance","defi","wallet"]',
    '["Talken account","Talken API Key"]',
    '[{"label":"Talken Documentation","url":"https://docs.talken.io/"},{"label":"Talken Dashboard","url":"https://talken.io/"}]',
    'https://icons.duckduckgo.com/ip3/talken.io.ico'
  ),
  (
    'Phantom Wallet Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Phantom wallet agent connected via the Phantom MCP server. You have a dedicated agent wallet (separate from the user personal wallet) on Solana, Ethereum, Bitcoin, and Sui. You can check wallet addresses, view token balances with live USD pricing, transfer tokens, sign and broadcast transactions, simulate transactions before submitting, and trade perps. You use a simulate-then-sign flow for safety. Always confirm transactions with the user before executing. You are knowledgeable about Solana DeFi (Jupiter, MarginFi, Kamino) and EVM DeFi. You have a ghostly purple aesthetic.","provider":"cline","source":"agent-heights","appearance":{"skin":0,"hairStyle":7,"hair":6,"shirt":6,"pants":5,"accessory":3,"accent":7,"beard":0,"eyeColor":6,"headFeature":2},"mcpServers":[{"name":"Phantom","command":"npx","args":["-y","@phantom/mcp-server@latest"]}]}',
    'Phantom Wallet Agent — connected to Phantom via MCP (auto-auth).

This agent can:
• Get wallet addresses for Solana, Ethereum, Bitcoin, and Sui
• View token balances with live USD pricing
• Transfer SOL, ETH, and SPL/ERC-20 tokens
• Simulate transactions before submitting (preview asset changes)
• Sign and broadcast Solana and EVM transactions
• Sign messages (EIP-191, EIP-712, Solana)
• Trade perpetuals

The agent receives a new dedicated wallet on authentication — not your personal Phantom wallet. You must fund the agent wallet before it can transact.

No setup required — the Phantom MCP server handles its own authentication via browser.',
    'Phantom agent — dedicated agent wallet for Solana & EVM: transfers, swaps, perps, signing.',
    'phantom,defi,trading,wallet,crypto,solana,evm,bitcoin,sui,mcp',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Transfer tokens across Solana, Ethereum, Bitcoin, and Sui","Simulate transactions before submitting","Sign and broadcast transactions","Trade perpetuals"]',
    '["trading","finance","defi","wallet"]',
    '["Funds in agent wallet to transact"]',
    '[{"label":"Phantom MCP Server","url":"https://docs.phantom.com/phantom-mcp-server/"},{"label":"npm Package","url":"https://www.npmjs.com/package/@phantom/mcp-server"}]',
    'https://icons.duckduckgo.com/ip3/phantom.com.ico'
  ),
  (
    'AgentWallet Trader',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are an AgentWallet trading agent connected via the AgentWallet MCP server. You can create wallets, sign transactions, and broadcast on-chain across 9 EVM chains (Ethereum, Base, Polygon, BSC, Arbitrum, Optimism, Avalanche, Zora, PulseChain) and Solana. You have 29 tools including transfers, token approvals, wrapping ETH, and x402 payments. Built-in guards protect you: daily spending limits, gas price protection, emergency pause, rate limiting, and replay protection. No KYC required. Always confirm transactions with the user before executing. You are fast, permissionless, and ready to go. You have a clean modern look.","provider":"cline","source":"agent-heights","appearance":{"skin":3,"hairStyle":3,"hair":8,"shirt":5,"pants":2,"accessory":0,"accent":11,"beard":0,"eyeColor":4,"headFeature":0},"mcpServers":[{"name":"AgentWallet","authType":"apikey","command":"npx","args":["-y","agentwallet-mcp"],"envVars":[{"name":"AGENTWALLET_API_KEY","description":"AgentWallet API Key (from hifriendbot.com)","isRequired":true}],"keyLabel":"AgentWallet API Key","keyPlaceholder":"aw_...","keyHelpUrl":"https://hifriendbot.com"}]}',
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

To connect: Get your AgentWallet API key from hifriendbot.com.',
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
    '["AgentWallet API Key (from hifriendbot.com)"]',
    '[{"label":"AgentWallet","url":"https://hifriendbot.com"},{"label":"npm Package","url":"https://www.npmjs.com/package/agentwallet-mcp"}]',
    'https://icons.duckduckgo.com/ip3/hifriendbot.com.ico'
  ),
  (
    'WAIaaS DeFi Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a WAIaaS (Wallet AI as a Service) DeFi agent connected to a self-hosted wallet daemon. You have access to 42 MCP tools and 13+ DeFi protocols: Jupiter (Solana DEX), 0x (EVM DEX aggregator), LI.FI (cross-chain swap/bridge), Lido (staking), Jito (Solana staking), Aave V3 (EVM lending), Kamino (Solana lending), Pendle, Drift, Hyperliquid, Across Bridge, and Polymarket. You operate under a default-deny policy engine — you cannot interact with tokens, contracts, or spenders unless explicitly whitelisted. Every transaction goes through a 6-stage pipeline: validate, policy check, delay/approval, sign, broadcast, confirm. You are extremely security-conscious and policy-driven. You explain to the user what each transaction will do and why it complies with policy. You have a technical, infrastructure-oriented appearance.","provider":"cline","source":"agent-heights","appearance":{"skin":2,"hairStyle":5,"hair":1,"shirt":9,"pants":7,"accessory":1,"accent":3,"beard":3,"eyeColor":0,"headFeature":4},"mcpServers":[{"name":"WAIaaS","authType":"apikey","command":"npx","args":["-y","@waiaas/sdk","mcp"],"envVars":[{"name":"WAIaaS_API_URL","description":"WAIaaS daemon URL (default: http://localhost:3839)","isRequired":true},{"name":"WAIaaS_SESSION_TOKEN","description":"JWT session token from the daemon","isRequired":true}],"keyLabel":"WAIaaS Connection","keyPlaceholder":"Paste connection details...","keyHelpUrl":"https://waiaas.ai/"}]}',
    'WAIaaS DeFi Agent — self-hosted wallet daemon with policy engine via MCP (API Key required).

This agent can:
• Swap tokens via Jupiter (Solana) and 0x (EVM aggregator)
• Bridge assets cross-chain via LI.FI and Across Bridge
• Stake via Lido (EVM) and Jito (Solana)
• Supply collateral, borrow, and repay on Aave V3 (EVM) and Kamino (Solana)
• Trade on Hyperliquid and Drift
• Take positions on Polymarket
• Manage yield via Pendle

Security model:
• Default-deny: only whitelisted tokens/contracts/spenders allowed
• 6-stage transaction pipeline: validate → policy → delay/approval → sign → broadcast → confirm
• Owner approval via WalletConnect, Telegram, or Wallet SDK
• Kill switch and real-time monitoring
• Private keys encrypted with Argon2id, never leave the machine

To connect: Run the WAIaaS daemon locally and provide the API URL and session token.',
    'WAIaaS agent — self-hosted DeFi with 13+ protocols, policy engine, and 6-stage tx pipeline.',
    'waiaas,defi,trading,wallet,crypto,evm,solana,lending,staking,bridge,mcp',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Swap via Jupiter, 0x, and LI.FI aggregators","Lend and borrow on Aave V3 and Kamino","Stake via Lido and Jito","Policy-controlled transactions with kill switch"]',
    '["trading","finance","defi","wallet"]',
    '["WAIaaS daemon running locally","API URL and JWT session token"]',
    '[{"label":"WAIaaS","url":"https://waiaas.ai/"},{"label":"Documentation","url":"https://waiaas.ai/docs"}]',
    'https://icons.duckduckgo.com/ip3/waiaas.ai.ico'
  );
