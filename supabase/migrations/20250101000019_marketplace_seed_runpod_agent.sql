-- Seed the marketplace with a Runpod GPU infrastructure agent.
-- Connects to the Runpod API via MCP (stdio, API Key required).

-- Delete any existing agent with this name first (idempotent re-seed)
DELETE FROM public.swarms_cloud_agents
WHERE name = 'Runpod GPU Agent';

INSERT INTO public.swarms_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'Runpod GPU Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Runpod GPU infrastructure agent connected via the Runpod MCP server. You can launch and manage GPU Pods, deploy and scale serverless endpoints, manage storage volumes, and query infrastructure state. You help the user provision compute resources, troubleshoot deployments, and optimize GPU utilization. Always confirm infrastructure changes (launching pods, deploying endpoints) with the user before executing. You are knowledgeable about GPU types, container images, and cloud infrastructure. You have a sleek tech-oriented appearance with dark tones and a purple accent.","provider":"cline","source":"agent-heights","appearance":{"skin":1,"hairStyle":4,"hair":5,"shirt":9,"pants":6,"accessory":2,"accent":7,"beard":0,"eyeColor":6,"headFeature":1},"mcpServers":[{"name":"Runpod API","authType":"apikey","command":"npx","args":["-y","@runpod/mcp-server"],"keyLabel":"API Key","keyPlaceholder":"Paste Runpod API key...","keyHelpUrl":"https://docs.runpod.io/get-started/api-keys"}]}',
    'Runpod GPU Agent — manage GPU Pods, serverless endpoints, and storage via Runpod MCP (API Key required).

This agent can:
• Launch and terminate GPU Pods with specific GPU types (A100, H100, RTX 4090, etc.)
• Deploy and scale serverless endpoints for model inference
• Manage storage volumes and persistent data
• Query pod status, endpoint health, and infrastructure state
• Troubleshoot deployment issues and check logs
• Optimize GPU utilization and cost efficiency

To connect: Get your Runpod API key from the Runpod dashboard → Settings → API Keys.',
    'Runpod agent — launch GPU Pods, deploy serverless endpoints, manage storage via Runpod MCP.',
    'runpod,gpu,cloud,infrastructure,serverless,pods,ai,ml,mcp',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Launch and manage GPU Pods (A100, H100, RTX 4090)","Deploy and scale serverless endpoints","Manage storage volumes","Query infrastructure state and troubleshoot"]',
    '["cloud","devops","ai"]',
    '["Runpod account","Runpod API Key"]',
    '[{"label":"Runpod API Keys","url":"https://docs.runpod.io/get-started/api-keys"},{"label":"Runpod MCP Server","url":"https://github.com/runpod/runpod-mcp"}]',
    'https://icons.duckduckgo.com/ip3/runpod.io.ico'
  );
