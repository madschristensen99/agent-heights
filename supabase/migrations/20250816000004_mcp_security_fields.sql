-- Add security metadata to MCP catalog entries.
-- The agent JSON config blob already stores these fields, but we add
-- top-level columns for querying/filtering by risk level in the future.
-- The rowToServer function in mcp-store.ts reads from the JSON blob,
-- so these columns are optional and for future use only.

-- risk_level: 'low' | 'medium' | 'high' — low = read-only/no auth,
--   medium = API key with limited scope, high = financial/trading/write access
-- security_note: best-practice advice shown before hiring
-- data_access: short summary of what data/tools the agent can access

ALTER TABLE heights_cloud_agents
  ADD COLUMN IF NOT EXISTS risk_level text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS security_note text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS data_access text DEFAULT NULL;

-- Backfill known high-risk agents by name
UPDATE heights_cloud_agents SET risk_level = 'high',
  security_note = 'This agent can place real trades on your behalf. Always review the confirmation prompt before approving any trade. Consider restricting this agent with ACLs so only trusted users can interact with it.',
  data_access = 'Place buy/sell orders, view portfolio holdings, and execute trades on your Robinhood account.'
WHERE name = 'Robinhood Trading Agent' AND search_type = 'agent';

UPDATE heights_cloud_agents SET risk_level = 'high',
  security_note = 'API key has wallet and trading access. Use Coinbase''s API restrictions to limit withdrawal capability. Restrict this agent with ACLs in shared rooms.',
  data_access = 'Place orders, manage portfolios, convert USDC/USD, and access your Coinbase wallet.'
WHERE name = 'Coinbase DeFi Trader' AND search_type = 'agent';

UPDATE heights_cloud_agents SET risk_level = 'high',
  security_note = 'This agent can create wallets and transfer tokens on your behalf. Monitor all transactions carefully. Restrict with ACLs in shared rooms.',
  data_access = 'Create crypto wallets, send tokens, and make x402 payments on 9 EVM chains and Solana.'
WHERE name = 'AgentWallet Trader' AND search_type = 'agent';

UPDATE heights_cloud_agents SET risk_level = 'high',
  security_note = 'Auto-provisioned wallet with sponsored gas. The agent can transfer tokens. Restrict with ACLs in shared rooms.',
  data_access = 'Create wallets, check balances, transfer tokens, and review transaction history.'
WHERE name = 'Crossmint Wallet Agent' AND search_type = 'agent';

UPDATE heights_cloud_agents SET risk_level = 'medium',
  security_note = 'Use a fine-grained PAT scoped to specific repos with the minimum permissions needed. Avoid classic tokens with broad scopes. When sharing spaces, use read-only tokens or restrict the agent via ACLs.',
  data_access = 'Read and write to your GitHub repositories, issues, pull requests, and code search.'
WHERE name = 'GitHub Agent' AND search_type = 'agent';

UPDATE heights_cloud_agents SET risk_level = 'medium',
  security_note = 'API key grants access to launch GPU instances which incur costs. Monitor usage to prevent unexpected charges.',
  data_access = 'Launch GPU Pods, deploy serverless endpoints, and manage storage on Runpod.'
WHERE name = 'Runpod GPU Agent' AND search_type = 'agent';

-- Backfill MCP server entries by name
UPDATE heights_cloud_agents SET risk_level = 'medium',
  security_note = 'Use a fine-grained PAT scoped to specific repos with the minimum permissions needed. Avoid classic tokens with broad scopes. When sharing spaces, use read-only tokens or restrict the agent via ACLs.',
  data_access = 'Read and write to your GitHub repositories, issues, pull requests, and code search.'
WHERE name LIKE 'MCP:%GitHub%' AND search_type = 'mcp_server';

UPDATE heights_cloud_agents SET risk_level = 'high',
  security_note = 'This agent can place real trades on your behalf. Always review the confirmation prompt before approving any trade.',
  data_access = 'Place buy/sell orders, view portfolio holdings, and execute trades on your Robinhood account.'
WHERE name LIKE 'MCP:%Robinhood%' AND search_type = 'mcp_server';

UPDATE heights_cloud_agents SET risk_level = 'medium',
  security_note = 'The bot token grants access to channel messages where the bot is invited. Only invite the bot to channels where agents should read. Use the minimum required scopes.',
  data_access = 'Read and send messages in Slack channels and DMs where the bot is invited.'
WHERE name LIKE 'MCP:%Slack%' AND search_type = 'mcp_server';

UPDATE heights_cloud_agents SET risk_level = 'medium',
  security_note = 'The bot can read all server messages it has access to. Restrict bot roles to specific channels. Enable only the Message Content Intent if needed.',
  data_access = 'Read and send messages in Discord channels where the bot has access.'
WHERE name LIKE 'MCP:%Discord%' AND search_type = 'mcp_server';
