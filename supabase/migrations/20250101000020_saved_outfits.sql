-- ── saved outfits ──────────────────────────────────────────────────────────
-- Per-user saved character outfits (named CharAppearance snapshots).

CREATE TABLE IF NOT EXISTS public.sprite_heights_saved_outfits (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Outfit',
  appearance JSONB NOT NULL,
  created_at BIGINT NOT NULL DEFAULT 0
);

ALTER TABLE public.sprite_heights_saved_outfits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own outfits" ON public.sprite_heights_saved_outfits;
CREATE POLICY "Users read own outfits"
  ON public.sprite_heights_saved_outfits FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own outfits" ON public.sprite_heights_saved_outfits;
CREATE POLICY "Users insert own outfits"
  ON public.sprite_heights_saved_outfits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own outfits" ON public.sprite_heights_saved_outfits;
CREATE POLICY "Users update own outfits"
  ON public.sprite_heights_saved_outfits FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own outfits" ON public.sprite_heights_saved_outfits;
CREATE POLICY "Users delete own outfits"
  ON public.sprite_heights_saved_outfits FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to outfits" ON public.sprite_heights_saved_outfits;
CREATE POLICY "Service role full access to outfits"
  ON public.sprite_heights_saved_outfits FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_saved_outfits_user
  ON public.sprite_heights_saved_outfits(user_id);
