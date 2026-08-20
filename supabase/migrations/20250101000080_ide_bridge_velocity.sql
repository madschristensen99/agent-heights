-- IDE Bridge velocity tracking — daily snapshots of coding activity per user
-- Used for velocity trends, anomaly detection, and daily standup generation

create table if not exists heights_cloud_ide_velocity (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  day date not null,                -- the calendar day (YYYY-MM-DD)
  tool text not null,               -- which IDE/CLI tool
  files_changed int default 0,
  lines_added int default 0,
  lines_removed int default 0,
  active_minutes int default 0,     -- estimated active coding time
  error_count int default 0,
  session_count int default 0,
  git_branches text[] default '{}', -- branches touched that day
  languages text[] default '{}',    -- languages used that day
  created_at timestamptz default now(),
  unique (user_id, day, tool)
);

-- Index for querying a user's velocity over time
create index if not exists idx_ide_velocity_user_day
  on heights_cloud_ide_velocity (user_id, day desc);

-- Enable RLS
alter table heights_cloud_ide_velocity enable row level security;

-- Users can read their own velocity data
create policy "Users read own velocity"
  on heights_cloud_ide_velocity for select
  using (auth.uid()::text = user_id);

-- Users can insert their own velocity data
create policy "Users insert own velocity"
  on heights_cloud_ide_velocity for insert
  with check (auth.uid()::text = user_id);

-- Service role (admin) has full access — used by the server
create policy "Service role full access velocity"
  on heights_cloud_ide_velocity for all
  using (auth.role() = 'service_role');
