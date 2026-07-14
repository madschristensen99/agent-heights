-- Per-user MCP server API keys (encrypted at rest).
-- Allows users to paste their own credentials for MCP servers that require auth
-- (e.g. Robinhood Trading MCP). Keyed by (user_id, server_url).

CREATE TABLE IF NOT EXISTS public.user_mcp_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  server_url TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, server_url)
);

-- Enable RLS
ALTER TABLE public.user_mcp_keys ENABLE ROW LEVEL SECURITY;

-- Users can manage only their own MCP keys
DROP POLICY IF EXISTS "Users read own MCP keys" ON public.user_mcp_keys;
CREATE POLICY "Users read own MCP keys"
  ON public.user_mcp_keys FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own MCP keys" ON public.user_mcp_keys;
CREATE POLICY "Users insert own MCP keys"
  ON public.user_mcp_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own MCP keys" ON public.user_mcp_keys;
CREATE POLICY "Users update own MCP keys"
  ON public.user_mcp_keys FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own MCP keys" ON public.user_mcp_keys;
CREATE POLICY "Users delete own MCP keys"
  ON public.user_mcp_keys FOR DELETE
  USING (auth.uid() = user_id);
