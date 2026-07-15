-- Phase 1: Tenant Isolation
-- The existing sprite_heights_saves table already uses user_id as PRIMARY KEY with RLS
-- policies that restrict access to auth.uid() = user_id. This migration adds
-- an explicit tenant_id column for forward compatibility (rooms, shared HQs)
-- and adds a service-role policy so the server can read/write all rows.

-- Add tenant_id column (defaults to user_id for existing rows)
ALTER TABLE public.sprite_heights_saves
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Backfill existing rows: tenant_id = user_id
UPDATE public.sprite_heights_saves
  SET tenant_id = user_id
  WHERE tenant_id IS NULL;

-- Set NOT NULL after backfill
ALTER TABLE public.sprite_heights_saves
  ALTER COLUMN tenant_id SET NOT NULL;

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_sprite_heights_saves_tenant_id
  ON public.sprite_heights_saves (tenant_id);

-- Add RLS policy for service role (server-side operations)
-- The service role bypasses RLS by default, but we add this for documentation
CREATE POLICY "Service role full access to HQ saves"
  ON public.sprite_heights_saves FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Ensure tenant_id matches user_id on insert/update (single-tenant constraint)
-- In Phase 4 (rooms), this constraint will be relaxed to allow shared tenants
ALTER TABLE public.sprite_heights_saves
  ADD CONSTRAINT tenant_matches_user CHECK (tenant_id = user_id);
