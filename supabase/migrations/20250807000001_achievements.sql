-- Achievements: move from client localStorage to server-side DB storage.
-- Single row per user containing unlocked IDs, cumulative stats, and dedup sets.

CREATE TABLE IF NOT EXISTS public.heights_cloud_achievements (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  unlocked   JSONB NOT NULL DEFAULT '[]'::jsonb,
  stats      JSONB NOT NULL DEFAULT '{}'::jsonb,
  sets       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.heights_cloud_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own achievements"
  ON public.heights_cloud_achievements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own achievements"
  ON public.heights_cloud_achievements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own achievements"
  ON public.heights_cloud_achievements FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own achievements"
  ON public.heights_cloud_achievements FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to achievements"
  ON public.heights_cloud_achievements FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
