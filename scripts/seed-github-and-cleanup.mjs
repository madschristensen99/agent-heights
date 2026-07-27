import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const sb = createClient(url, key);

// 1. Insert GitHub Agent (upsert by name)
const githubPayload = {
  name: 'GitHub Agent',
  agent: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    systemPrompt: "You are a GitHub agent connected via the GitHub MCP at https://api.githubcopilot.com/mcp/. You can manage repositories, create and review issues, handle pull requests, search across code, and manage branches. When asked to perform actions, always confirm destructive operations (deleting branches, closing PRs) with the user first. Format code references with repo name and line numbers. You wear a dark hoodie with the GitHub logo and are precise and methodical.",
    provider: "cline",
    source: "agent-heights",
    appearance: { skin: 1, hairStyle: 1, hair: 1, shirt: 0, pants: 0, accessory: 1, accent: 0, beard: 1, eyeColor: 0, headFeature: 0 },
    mcpServers: [{ url: "https://api.githubcopilot.com/mcp/", name: "github", authType: "apikey", keyLabel: "Personal Access Token", keyPlaceholder: "ghp_...", keyHelpUrl: "https://github.com/settings/tokens" }]
  }),
  description: 'GitHub Agent — connected to GitHub via MCP using a Personal Access Token.\n\nThis agent can:\n• Create, view, and manage issues across repositories\n• Review pull requests, leave comments, and approve/merge\n• Search code across all public and accessible private repos\n• Create and manage branches\n• View repository metadata, files, and commit history\n• Create and manage pull requests with proper descriptions\n\nTo connect: Generate a Personal Access Token at https://github.com/settings/tokens\nwith the appropriate scopes (repo, workflow, read:org as needed).\nPaste it when hiring this agent.\n\n⚠️ Always review destructive actions (branch deletion, force pushes, PR merges) before confirming.',
  summary: 'GitHub agent — manage repos, issues, PRs, and code search via GitHub MCP. Requires Personal Access Token.',
  tags: 'github,mcp,git,repositories,issues,pull-requests,code-search,development',
  is_free: true,
  price: null,
  price_usd: null,
  language: 'TypeScript',
  search_type: 'agent',
  status: 'approved',
  use_cases: '["Create and manage GitHub issues","Review and merge pull requests","Search code across repositories","Manage branches and commits","View repo metadata and file contents"]',
  category: '["development","git"]',
  requirements: '["GitHub Personal Access Token (https://github.com/settings/tokens)"]',
  links: '[{"label":"Create a PAT","url":"https://github.com/settings/tokens"},{"label":"GitHub MCP Server","url":"https://api.githubcopilot.com/mcp/"}]',
  image_url: 'https://www.google.com/s2/favicons?domain=github.com&sz=128'
};

// Check if GitHub Agent already exists
const { data: existingGithub } = await sb.from('heights_cloud_agents').select('id').eq('name', 'GitHub Agent').maybeSingle();
let githubResult;
if (existingGithub?.id) {
  githubResult = await sb.from('heights_cloud_agents').update(githubPayload).eq('id', existingGithub.id).select('id,name');
} else {
  githubResult = await sb.from('heights_cloud_agents').insert(githubPayload).select('id,name');
}
if (githubResult.error) { console.error('GitHub Agent error:', githubResult.error.message); process.exit(1); }
console.log('GitHub Agent:', githubResult.data);

// 2. Delete placeholder agents
const crapNames = ['Code Review Sentinel', 'Data Analyst Pro', 'Research Assistant', 'DevOps Automator', 'Content Writer'];
const { data: deleted, error: delErr } = await sb.from('heights_cloud_agents').delete().in('name', crapNames).select('name');
if (delErr) { console.error('Delete error:', delErr.message); process.exit(1); }
console.log('Deleted agents:', deleted?.map(r => r.name) ?? []);

// 3. List what remains
const { data: remaining } = await sb.from('heights_cloud_agents').select('name,status').eq('status', 'approved').order('name');
console.log('\nRemaining approved agents:');
for (const a of remaining ?? []) console.log(`  - ${a.name}`);
