-- Security hardening migration — addresses Supabase advisor warnings.
-- 1. Fix SECURITY DEFINER functions (search_path + revoke public execute)
-- 2. Enable RLS on 6 tables missing it
-- 3. Tighten office_social SELECT policy (was USING(true))
-- 4. Fix aspiration_summary view (security_invoker + revoke public)
-- 5. Drop duplicate index on agent_heights_agent_logs
-- 6. Consolidate permissive policies on achievements, ide_velocity, office_progress

-- ════════════════════════════════════════════════════════════════════════════
-- 1. SECURITY DEFINER functions — add search_path, restrict execute to service_role
-- ════════════════════════════════════════════════════════════════════════════

-- trim_agent_logs: add search_path, revoke public/authenticated, grant service_role
CREATE OR REPLACE FUNCTION public.trim_agent_logs(cap int DEFAULT 500)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY agent_id ORDER BY ts DESC) AS rn
    FROM public.agent_heights_agent_logs
    WHERE archived = false
  ),
  deleted AS (
    DELETE FROM public.agent_heights_agent_logs
    WHERE id IN (SELECT id FROM ranked WHERE rn > cap)
    RETURNING 1
  )
  SELECT count(*)::int FROM deleted;
$$;

REVOKE EXECUTE ON FUNCTION public.trim_agent_logs(int) FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.trim_agent_logs(int) TO service_role;

-- bulk_insert_agent_logs: add search_path, revoke public/authenticated, grant service_role
CREATE OR REPLACE FUNCTION public.bulk_insert_agent_logs(payload json)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.agent_heights_agent_logs (agent_id, owner_id, ts, kind, text, archived)
  SELECT agent_id, owner_id, ts, kind, text, archived
  FROM json_populate_recordset(
    null::public.agent_heights_agent_logs,
    payload
  );
  SELECT count(*)::int FROM json_array_elements(payload);
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_insert_agent_logs(json) FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_insert_agent_logs(json) TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Enable RLS on 6 tables that were missing it
-- ════════════════════════════════════════════════════════════════════════════

-- agent_heights_deletion_requests — GDPR table, server-only access
ALTER TABLE public.agent_heights_deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access to deletion_requests"
  ON public.agent_heights_deletion_requests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- heights_cloud_premium_services — server-only catalog
ALTER TABLE public.heights_cloud_premium_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access to premium_services"
  ON public.heights_cloud_premium_services FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- heights_cloud_world_templates — read-only for authenticated, full for service_role
ALTER TABLE public.heights_cloud_world_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read world templates"
  ON public.heights_cloud_world_templates FOR SELECT
  TO authenticated
  USING (true);
CREATE POLICY "Service role full access to world_templates"
  ON public.heights_cloud_world_templates FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- agent_heights_office_mcp_servers — server-only
ALTER TABLE public.agent_heights_office_mcp_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access to office_mcp_servers"
  ON public.agent_heights_office_mcp_servers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- heights_cloud_asset_upgrades — server-only
ALTER TABLE public.heights_cloud_asset_upgrades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access to asset_upgrades"
  ON public.heights_cloud_asset_upgrades FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- heights_cloud_aspiration_profiles — owner read/write + service_role
ALTER TABLE public.heights_cloud_aspiration_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own aspiration profile"
  ON public.heights_cloud_aspiration_profiles FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own aspiration profile"
  ON public.heights_cloud_aspiration_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own aspiration profile"
  ON public.heights_cloud_aspiration_profiles FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Service role full access to aspiration_profiles"
  ON public.heights_cloud_aspiration_profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Tighten office_social SELECT policy (was USING(true) — data leak)
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can read office social" ON public.heights_cloud_office_social;
CREATE POLICY "Users read own office social"
  ON public.heights_cloud_office_social FOR SELECT
  USING (auth.uid()::text = office_owner_id);

-- Add service_role policy (was missing)
CREATE POLICY "Service role full access to office_social"
  ON public.heights_cloud_office_social FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Fix aspiration_summary view — security_invoker + restrict access
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.aspiration_summary
WITH (security_invoker = true) AS
SELECT
  dominant_aspiration,
  count(*) AS user_count,
  avg(warrior_score) AS avg_warrior,
  avg(builder_score) AS avg_builder,
  avg(explorer_score) AS avg_explorer,
  avg(puzzle_solver_score) AS avg_puzzle_solver,
  avg(creator_score) AS avg_creator,
  avg(strategist_score) AS avg_strategist
FROM heights_cloud_aspiration_profiles
WHERE dominant_aspiration IS NOT NULL
GROUP BY dominant_aspiration;

REVOKE SELECT ON public.aspiration_summary FROM public, anon, authenticated;
GRANT SELECT ON public.aspiration_summary TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Drop duplicate index on agent_heights_agent_logs
--    The partial index idx_agent_heights_agent_logs_agent_active (WHERE archived = false)
--    supersedes the old full index idx_sprite_heights_agent_logs_agent for the
--    common query path. The old index was not renamed during table rename.
-- ════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS public.idx_sprite_heights_agent_logs_agent;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Consolidate permissive policies — merge per-operation policies into FOR ALL
-- ════════════════════════════════════════════════════════════════════════════

-- heights_cloud_achievements: 4 per-user policies → 1 FOR ALL
DROP POLICY IF EXISTS "Users read own achievements" ON public.heights_cloud_achievements;
DROP POLICY IF EXISTS "Users insert own achievements" ON public.heights_cloud_achievements;
DROP POLICY IF EXISTS "Users update own achievements" ON public.heights_cloud_achievements;
DROP POLICY IF EXISTS "Users delete own achievements" ON public.heights_cloud_achievements;
DROP POLICY IF EXISTS "Service role full access to achievements" ON public.heights_cloud_achievements;
CREATE POLICY "Users manage own achievements"
  ON public.heights_cloud_achievements FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access to achievements"
  ON public.heights_cloud_achievements FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- heights_cloud_ide_velocity: 2 per-user policies → 1 FOR ALL
DROP POLICY IF EXISTS "Users read own velocity" ON public.heights_cloud_ide_velocity;
DROP POLICY IF EXISTS "Users insert own velocity" ON public.heights_cloud_ide_velocity;
DROP POLICY IF EXISTS "Service role full access velocity" ON public.heights_cloud_ide_velocity;
CREATE POLICY "Users manage own velocity"
  ON public.heights_cloud_ide_velocity FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Service role full access to velocity"
  ON public.heights_cloud_ide_velocity FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- heights_cloud_office_progress: 2 per-user policies → 1 FOR ALL + add service_role
DROP POLICY IF EXISTS "Users can read own progress" ON public.heights_cloud_office_progress;
DROP POLICY IF EXISTS "Users can write own progress" ON public.heights_cloud_office_progress;
CREATE POLICY "Users manage own progress"
  ON public.heights_cloud_office_progress FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Service role full access to office_progress"
  ON public.heights_cloud_office_progress FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- heights_cloud_office_social: consolidate write policy into FOR ALL
DROP POLICY IF EXISTS "Users can write own office social" ON public.heights_cloud_office_social;
CREATE POLICY "Users manage own office social"
  ON public.heights_cloud_office_social FOR ALL
  USING (auth.uid()::text = office_owner_id)
  WITH CHECK (auth.uid()::text = office_owner_id);
