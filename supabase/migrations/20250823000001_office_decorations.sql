-- Office decorations table — stores per-user decoration placements as JSON
create table if not exists heights_cloud_office_decorations (
  user_id text not null,
  decorations jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id)
);

-- Enable RLS
alter table heights_cloud_office_decorations enable row level security;

-- Users can read/write only their own decorations
create policy "Users can read own decorations"
  on heights_cloud_office_decorations for select
  using (auth.uid()::text = user_id);

create policy "Users can insert own decorations"
  on heights_cloud_office_decorations for insert
  with check (auth.uid()::text = user_id);

create policy "Users can update own decorations"
  on heights_cloud_office_decorations for update
  using (auth.uid()::text = user_id);

create policy "Users can delete own decorations"
  on heights_cloud_office_decorations for delete
  using (auth.uid()::text = user_id);
