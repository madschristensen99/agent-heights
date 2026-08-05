-- Tracks one-time AI asset upgrade purchases for deployed worlds.
-- Each row represents a $19.99 upgrade job that generates AI assets
-- (tiles, objects, furniture, creatures, vehicle, portal) via fal.ai
-- and deploys them to the world's Railway deployment.

create table if not exists heights_cloud_asset_upgrades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deployment_id text not null,
  branch_name text not null,
  repo_full_name text not null,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  status text not null default 'none'
    check (status in ('none', 'generating', 'ready', 'failed')),
  current_stage text,
  stages_json jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Index for looking up upgrade status by deployment
create index if not exists idx_asset_upgrades_deployment
  on heights_cloud_asset_upgrades(deployment_id);

-- Index for looking up user's upgrade history
create index if not exists idx_asset_upgrades_user
  on heights_cloud_asset_upgrades(user_id);

-- Unique constraint: one upgrade per deployment
create unique index if not exists idx_asset_upgrades_deployment_unique
  on heights_cloud_asset_upgrades(deployment_id)
  where status in ('generating', 'ready');
