-- Seed the marketplace with a Crossmint Solana wallet agent.
-- This agent gets an auto-provisioned Crossmint smart wallet on Solana with gas sponsored
-- by Crossmint's paymaster. EVM chain support is available but defaults to Solana.
-- Requires CROSSMINT_API_KEY and CROSSMINT_SERVER_SIGNER_SECRET env vars on the server.

-- Delete any existing agent with this name first (idempotent re-seed)
DELETE FROM public.heights_cloud_agents
WHERE name = 'Crossmint Wallet Agent';

INSERT INTO public.heights_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'Crossmint Wallet Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Crossmint Solana wallet agent. You have an auto-provisioned smart wallet on Solana managed by Crossmint. Gas fees are sponsored by Crossmint — you do not need SOL for gas. You can check SOL and SPL token balances, transfer tokens, review transaction history, and monitor wallet policy. Always confirm transfer details (amount, recipient, token) with the user before executing. When asked about funding, explain that the wallet can receive tokens from any sender and gas is sponsored. The wallet also supports EVM chains (Base, Ethereum, Polygon) but Solana is the default.","provider":"cline","source":"agent-heights","crossmintWallet":true,"appearance":{"skin":0,"hairStyle":3,"hair":2,"shirt":8,"pants":0,"accessory":2,"accent":5,"beard":1,"eyeColor":1,"headFeature":0}}',
    'Crossmint Wallet Agent — a Solana-native crypto agent with an auto-provisioned smart wallet powered by Crossmint.

This agent can:
• Check SOL and SPL token balances on Solana
• Transfer tokens to any Solana recipient address
• Review transaction history and check transaction status
• Monitor wallet spending policy and capabilities
• Operate without native SOL for gas — gas is sponsored by Crossmint''s paymaster
• EVM chain support (Base, Ethereum, Polygon) also available

The wallet is automatically created when you hire this agent — no setup or private keys to manage. The server holds a Crossmint API key and server signer that manages the wallet on the agent''s behalf.

Perfect for:
• Managing Solana treasury operations
• Automating SPL token distributions and payments
• Monitoring Solana portfolio balances
• Executing approved transfers on Solana

⚠️ Always review transfer details before confirming. The agent will ask for confirmation before executing any transfer.',
    'Solana wallet agent powered by Crossmint — auto-provisioned smart wallet with sponsored gas on Solana. EVM support also available.',
    'crossmint,wallet,solana,spl,sol,usdc,crypto,defi,gasless,multichain',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Check SOL and SPL token balances on Solana","Transfer tokens to any Solana recipient","Review transaction history and status","Monitor wallet policy and spending limits"]',
    '["finance","crypto"]',
    '["Crossmint API key configured on server","Server signer secret configured on server"]',
    '[{"label":"Crossmint Console","url":"https://www.crossmint.com/console"},{"label":"Crossmint Wallets API Docs","url":"https://docs.crossmint.com/wallets/quickstart"}]',
    'https://www.google.com/s2/favicons?domain=crossmint.com&sz=128'
  );
