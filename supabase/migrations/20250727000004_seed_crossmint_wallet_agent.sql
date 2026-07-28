-- Seed the marketplace with a Crossmint multi-chain wallet agent.
-- This agent gets an auto-provisioned Crossmint smart wallet with gas sponsored
-- by Crossmint's paymaster. Supports EVM chains (Base, Ethereum, Polygon) and Solana.
-- Requires CROSSMINT_API_KEY and CROSSMINT_SERVER_SIGNER_SECRET env vars on the server.

-- Delete any existing agent with this name first (idempotent re-seed)
DELETE FROM public.heights_cloud_agents
WHERE name = 'Crossmint Wallet Agent';

INSERT INTO public.heights_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'Crossmint Wallet Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Crossmint multi-chain wallet agent. You have an auto-provisioned smart wallet that supports EVM chains (Base, Ethereum, Polygon) and Solana. Gas fees are sponsored by Crossmint — you do not need native tokens to transact. You can check balances, transfer tokens, review transaction history, and monitor wallet policy. Always confirm transfer details (amount, recipient, token) with the user before executing. Be transparent about what chain you are operating on. When asked about funding, explain that the wallet can receive tokens from any sender and gas is sponsored.","provider":"cline","source":"agent-heights","crossmintWallet":true,"appearance":{"skin":0,"hairStyle":3,"hair":2,"shirt":8,"pants":0,"accessory":2,"accent":5,"beard":1,"eyeColor":1,"headFeature":0}}',
    'Crossmint Wallet Agent — a multi-chain crypto agent with an auto-provisioned smart wallet powered by Crossmint.

This agent can:
• Check wallet balances across EVM chains (Base, Ethereum, Polygon) and Solana
• Transfer tokens to any recipient address
• Review transaction history and check transaction status
• Monitor wallet spending policy and capabilities
• Operate without native gas tokens — gas is sponsored by Crossmint''s paymaster

The wallet is automatically created when you hire this agent — no setup or private keys to manage. The server holds a Crossmint API key and server signer that manages the wallet on the agent''s behalf.

Perfect for:
• Managing onchain treasury operations
• Automating token distributions and payments
• Monitoring multi-chain portfolio balances
• Executing approved transfers across chains

⚠️ Always review transfer details before confirming. The agent will ask for confirmation before executing any transfer.',
    'Multi-chain wallet agent powered by Crossmint — auto-provisioned smart wallet with sponsored gas on Base, Ethereum, Polygon, and Solana.',
    'crossmint,wallet,multichain,evm,solana,base,ethereum,polygon,crypto,defi,gasless',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Check balances across EVM chains and Solana","Transfer tokens to any recipient","Review transaction history and status","Monitor wallet policy and spending limits"]',
    '["finance","crypto"]',
    '["Crossmint API key configured on server","Server signer secret configured on server"]',
    '[{"label":"Crossmint Console","url":"https://www.crossmint.com/console"},{"label":"Crossmint Wallets API Docs","url":"https://docs.crossmint.com/wallets/quickstart"}]',
    'https://www.google.com/s2/favicons?domain=crossmint.com&sz=128'
  );
