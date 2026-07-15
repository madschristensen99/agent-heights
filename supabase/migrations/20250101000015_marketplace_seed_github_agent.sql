-- Seed the marketplace with a GitHub Agent that uses the GitHub MCP server.
-- This agent manages repositories, issues, pull requests, and code search
-- via the GitHub MCP at https://api.githubcopilot.com/mcp/ using PAT auth.

INSERT INTO public.swarms_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'GitHub Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a GitHub agent connected via the GitHub MCP at https://api.githubcopilot.com/mcp/. You can manage repositories, create and review issues, handle pull requests, search across code, and manage branches. When asked to perform actions, always confirm destructive operations (deleting branches, closing PRs) with the user first. Format code references with repo name and line numbers. You wear a dark hoodie with the GitHub logo and are precise and methodical.","provider":"cline","source":"sprite-heights","appearance":{"skin":1,"hairStyle":1,"hair":1,"shirt":0,"pants":0,"accessory":1,"accent":0,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://api.githubcopilot.com/mcp/","name":"github","authType":"apikey","keyLabel":"Personal Access Token","keyPlaceholder":"ghp_...","keyHelpUrl":"https://github.com/settings/tokens"}]}',
    'GitHub Agent — connected to GitHub via MCP using a Personal Access Token.

This agent can:
• Create, view, and manage issues across repositories
• Review pull requests, leave comments, and approve/merge
• Search code across all public and accessible private repos
• Create and manage branches
• View repository metadata, files, and commit history
• Create and manage pull requests with proper descriptions

To connect: Generate a Personal Access Token at https://github.com/settings/tokens
with the appropriate scopes (repo, workflow, read:org as needed).
Paste it when hiring this agent.

⚠️ Always review destructive actions (branch deletion, force pushes, PR merges) before confirming.',
    'GitHub agent — manage repos, issues, PRs, and code search via GitHub MCP. Requires Personal Access Token.',
    'github,mcp,git,repositories,issues,pull-requests,code-search,development',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Create and manage GitHub issues","Review and merge pull requests","Search code across repositories","Manage branches and commits","View repo metadata and file contents"]',
    '["development","git"]',
    '["GitHub Personal Access Token (https://github.com/settings/tokens)"]',
    '[{"label":"Create a PAT","url":"https://github.com/settings/tokens"},{"label":"GitHub MCP Server","url":"https://api.githubcopilot.com/mcp/"}]',
    'https://www.google.com/s2/favicons?domain=github.com&sz=128'
  )
ON CONFLICT (name) DO NOTHING;
