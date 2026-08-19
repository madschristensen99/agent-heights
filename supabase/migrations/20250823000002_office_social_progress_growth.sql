-- Office social interactions — sticky notes, likes, visitors
create table if not exists heights_cloud_office_social (
  office_owner_id text not null,
  likes jsonb not null default '[]'::jsonb,
  sticky_notes jsonb not null default '[]'::jsonb,
  visitors jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (office_owner_id)
);

alter table heights_cloud_office_social enable row level security;

create policy "Users can read office social"
  on heights_cloud_office_social for select
  using (true);

create policy "Users can write own office social"
  on heights_cloud_office_social for all
  using (auth.uid()::text = office_owner_id);

-- Office progression — XP, level, prestige
create table if not exists heights_cloud_office_progress (
  user_id text not null,
  xp integer not null default 0,
  prestige_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id)
);

alter table heights_cloud_office_progress enable row level security;

create policy "Users can read own progress"
  on heights_cloud_office_progress for select
  using (auth.uid()::text = user_id);

create policy "Users can write own progress"
  on heights_cloud_office_progress for all
  using (auth.uid()::text = user_id);

-- Agent growth history — per-agent task completion records
create table if not exists heights_cloud_agent_history (
  id uuid not null default gen_random_uuid() primary key,
  user_id text not null,
  agent_id text not null,
  task_id text,
  success boolean not null,
  duration_min double precision not null,
  task_type text not null default 'general',
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_history_agent on heights_cloud_agent_history(agent_id);
create index if not exists idx_agent_history_user on heights_cloud_agent_history(user_id);

alter table heights_cloud_agent_history enable row level security;

create policy "Users can read own agent history"
  on heights_cloud_agent_history for select
  using (auth.uid()::text = user_id);

create policy "Users can write own agent history"
  on heights_cloud_agent_history for insert
  with check (auth.uid()::text = user_id);
