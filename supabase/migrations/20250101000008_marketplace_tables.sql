-- Marketplace tables from the Swarms Marketplace project.
-- These tables (swarms_cloud_agents, swarms_cloud_prompts, swarms_cloud_tools)
-- are normally created by the marketplace's own Supabase project. When Agent HQ
-- shares the same Supabase project, these tables must exist here too so that
-- marketplace browsing and agent publishing work.
-- Only the columns used by Agent HQ are included; the marketplace may add more
-- columns via its own migrations.

-- ── Enums ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "public"."user_agents_status" AS ENUM ('approved', 'pending', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."user_prompts_status" AS ENUM ('approved', 'pending', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── swarms_cloud_agents ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.swarms_cloud_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent TEXT,
  name TEXT,
  use_cases JSONB,
  status public.user_agents_status,
  tags TEXT,
  description TEXT,
  -- extended columns (added by marketplace migrations / app code)
  summary TEXT,
  language TEXT,
  is_free BOOLEAN NOT NULL DEFAULT true,
  price NUMERIC,
  price_usd NUMERIC,
  category JSONB,
  requirements JSONB,
  links JSONB,
  image_url TEXT,
  file_path TEXT,
  search_type TEXT NOT NULL DEFAULT 'agent',
  seller_wallet_address TEXT,
  tokenized_on BOOLEAN,
  token_address TEXT,
  token_symbol TEXT,
  pool_address TEXT,
  vault_mode BOOLEAN
);

ALTER TABLE public.swarms_cloud_agents ENABLE ROW LEVEL SECURITY;

-- Service role full access (Agent HQ uses the service role key)
CREATE POLICY "Service role full access to marketplace agents"
  ON public.swarms_cloud_agents FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Public can read approved agents
CREATE POLICY "Public read approved agents"
  ON public.swarms_cloud_agents FOR SELECT
  USING (status = 'approved');

CREATE INDEX IF NOT EXISTS idx_swarms_cloud_agents_status ON public.swarms_cloud_agents (status);
CREATE INDEX IF NOT EXISTS idx_swarms_cloud_agents_created_at ON public.swarms_cloud_agents (created_at DESC);

-- ── swarms_cloud_prompts ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.swarms_cloud_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT,
  name TEXT,
  use_cases JSONB,
  status public.user_prompts_status,
  tags TEXT,
  description TEXT,
  -- extended columns
  summary TEXT,
  is_free BOOLEAN NOT NULL DEFAULT true,
  price NUMERIC,
  price_usd NUMERIC,
  category JSONB,
  links JSONB,
  image_url TEXT,
  file_path TEXT,
  search_type TEXT NOT NULL DEFAULT 'prompt',
  seller_wallet_address TEXT,
  tokenized_on BOOLEAN,
  token_address TEXT,
  token_symbol TEXT,
  pool_address TEXT,
  vault_mode BOOLEAN
);

ALTER TABLE public.swarms_cloud_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to marketplace prompts"
  ON public.swarms_cloud_prompts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public read approved prompts"
  ON public.swarms_cloud_prompts FOR SELECT
  USING (status = 'approved');

CREATE INDEX IF NOT EXISTS idx_swarms_cloud_prompts_status ON public.swarms_cloud_prompts (status);
CREATE INDEX IF NOT EXISTS idx_swarms_cloud_prompts_created_at ON public.swarms_cloud_prompts (created_at DESC);

-- ── swarms_cloud_tools ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.swarms_cloud_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tool TEXT NOT NULL,
  name TEXT,
  use_cases JSONB,
  status public.user_agents_status,
  tags TEXT,
  description TEXT,
  -- extended columns
  language TEXT,
  is_free BOOLEAN NOT NULL DEFAULT true,
  category JSONB,
  requirements JSONB,
  links JSONB,
  image_url TEXT,
  file_path TEXT,
  search_type TEXT NOT NULL DEFAULT 'tool',
  seller_wallet_address TEXT,
  tokenized_on BOOLEAN,
  token_address TEXT,
  token_symbol TEXT,
  pool_address TEXT
);

ALTER TABLE public.swarms_cloud_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to marketplace tools"
  ON public.swarms_cloud_tools FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public read approved tools"
  ON public.swarms_cloud_tools FOR SELECT
  USING (status = 'approved');

CREATE INDEX IF NOT EXISTS idx_swarms_cloud_tools_status ON public.swarms_cloud_tools (status);
CREATE INDEX IF NOT EXISTS idx_swarms_cloud_tools_created_at ON public.swarms_cloud_tools (created_at DESC);
