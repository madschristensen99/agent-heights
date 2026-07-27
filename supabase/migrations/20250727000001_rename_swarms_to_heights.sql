-- Migration: Rename swarms_cloud_* tables to heights_cloud_*
-- This renames the marketplace tables to remove the "swarms" branding.

-- ── swarms_cloud_agents → heights_cloud_agents ────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'swarms_cloud_agents' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'heights_cloud_agents' AND table_schema = 'public') THEN
    ALTER TABLE public.swarms_cloud_agents RENAME TO heights_cloud_agents;
    -- Rename indexes
    ALTER INDEX IF EXISTS idx_swarms_cloud_agents_status RENAME TO idx_heights_cloud_agents_status;
    ALTER INDEX IF EXISTS idx_swarms_cloud_agents_created_at RENAME TO idx_heights_cloud_agents_created_at;
  END IF;
END $$;

-- ── swarms_cloud_prompts → heights_cloud_prompts ──────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'swarms_cloud_prompts' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'heights_cloud_prompts' AND table_schema = 'public') THEN
    ALTER TABLE public.swarms_cloud_prompts RENAME TO heights_cloud_prompts;
    ALTER INDEX IF EXISTS idx_swarms_cloud_prompts_status RENAME TO idx_heights_cloud_prompts_status;
    ALTER INDEX IF EXISTS idx_swarms_cloud_prompts_created_at RENAME TO idx_heights_cloud_prompts_created_at;
  END IF;
END $$;

-- ── swarms_cloud_tools → heights_cloud_tools ──────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'swarms_cloud_tools' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'heights_cloud_tools' AND table_schema = 'public') THEN
    ALTER TABLE public.swarms_cloud_tools RENAME TO heights_cloud_tools;
    ALTER INDEX IF EXISTS idx_swarms_cloud_tools_status RENAME TO idx_heights_cloud_tools_status;
    ALTER INDEX IF EXISTS idx_swarms_cloud_tools_created_at RENAME TO idx_heights_cloud_tools_created_at;
  END IF;
END $$;
