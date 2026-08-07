-- MCP Server Catalog table — DB as single source of truth for curated MCP servers
-- Replaces the static MCP_CATALOG array in shared/mcp-catalog.ts

CREATE TABLE IF NOT EXISTS public.heights_cloud_mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  transport TEXT NOT NULL DEFAULT 'remote',
  auth_type TEXT NOT NULL DEFAULT 'open',
  is_official BOOLEAN NOT NULL DEFAULT false,
  category TEXT[] NOT NULL DEFAULT '{}',
  icon TEXT,
  visitors_per_week TEXT,
  url TEXT,
  command TEXT,
  args TEXT[],
  env_vars JSONB,
  native_integration BOOLEAN DEFAULT false,
  native_integration_note TEXT,
  key_label TEXT,
  key_placeholder TEXT,
  key_help_url TEXT,
  url_placeholder TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.heights_cloud_mcp_servers ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access to mcp_servers"
  ON public.heights_cloud_mcp_servers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Public can read all servers (catalog is public)
CREATE POLICY "Public read mcp_servers"
  ON public.heights_cloud_mcp_servers FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS idx_heights_cloud_mcp_servers_category
  ON public.heights_cloud_mcp_servers USING GIN (category);
