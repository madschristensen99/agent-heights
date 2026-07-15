-- Phase 2: Relational Database
-- Decompose the JSONB blob in sprite_heights_saves into relational tables.
-- Each agent log entry is one row. Each agent status change is one UPDATE.
-- The old sprite_heights_saves table is kept for backward compatibility during migration.

-- ── rooms ──────────────────────────────────────────────────────────────────
-- A room is a tenant's office. In Phase 0-3 each user has exactly one room
-- (their Private HQ). In Phase 4, users can create shared rooms.

CREATE TABLE IF NOT EXISTS public.sprite_heights_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Office',
  seed INTEGER NOT NULL DEFAULT 0,
  theme TEXT NOT NULL DEFAULT 'classic',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sprite_heights_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own rooms"
  ON public.sprite_heights_rooms FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users insert own rooms"
  ON public.sprite_heights_rooms FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users update own rooms"
  ON public.sprite_heights_rooms FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users delete own rooms"
  ON public.sprite_heights_rooms FOR DELETE
  USING (auth.uid() = owner_id);

-- Service role full access
CREATE POLICY "Service role full access to rooms"
  ON public.sprite_heights_rooms FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── room_players ───────────────────────────────────────────────────────────
-- Tracks which users are in which rooms (for Phase 4 multiplayer).
-- In Phase 0-3, each user is the sole player in their own room.

CREATE TABLE IF NOT EXISTS public.sprite_heights_room_players (
  room_id UUID REFERENCES public.sprite_heights_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner', -- owner | member | guest
  appearance JSONB,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

ALTER TABLE public.sprite_heights_room_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read rooms they're in"
  ON public.sprite_heights_room_players FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users join rooms"
  ON public.sprite_heights_room_players FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own room membership"
  ON public.sprite_heights_room_players FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users leave rooms"
  ON public.sprite_heights_room_players FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to room players"
  ON public.sprite_heights_room_players FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── agents ─────────────────────────────────────────────────────────────────
-- One row per agent. Status changes are UPDATEs, not full blob rewrites.

CREATE TABLE IF NOT EXISTS public.sprite_heights_agents (
  id TEXT PRIMARY KEY,
  room_id UUID REFERENCES public.sprite_heights_rooms(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'cline',
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  task TEXT,
  desk_index INTEGER NOT NULL DEFAULT 0,
  sprite INTEGER NOT NULL DEFAULT 0,
  appearance JSONB,
  accent TEXT NOT NULL DEFAULT '#4f9dde',
  system_prompt TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'worker',
  session_id TEXT,
  tasks_done INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sprite_heights_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own agents"
  ON public.sprite_heights_agents FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users insert own agents"
  ON public.sprite_heights_agents FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users update own agents"
  ON public.sprite_heights_agents FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users delete own agents"
  ON public.sprite_heights_agents FOR DELETE
  USING (auth.uid() = owner_id);

CREATE POLICY "Service role full access to agents"
  ON public.sprite_heights_agents FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sprite_heights_agents_owner ON public.sprite_heights_agents (owner_id);
CREATE INDEX IF NOT EXISTS idx_sprite_heights_agents_room ON public.sprite_heights_agents (room_id);

-- ── agent_logs ─────────────────────────────────────────────────────────────
-- One row per log entry. Solves write amplification — a single log line
-- is one INSERT, not a megabyte blob rewrite.

CREATE TABLE IF NOT EXISTS public.sprite_heights_agent_logs (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT REFERENCES public.sprite_heights_agents(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ts BIGINT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL
);

ALTER TABLE public.sprite_heights_agent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own agent logs"
  ON public.sprite_heights_agent_logs FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users insert own agent logs"
  ON public.sprite_heights_agent_logs FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users delete own agent logs"
  ON public.sprite_heights_agent_logs FOR DELETE
  USING (auth.uid() = owner_id);

CREATE POLICY "Service role full access to agent logs"
  ON public.sprite_heights_agent_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sprite_heights_agent_logs_agent ON public.sprite_heights_agent_logs (agent_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_sprite_heights_agent_logs_owner ON public.sprite_heights_agent_logs (owner_id, ts DESC);

-- ── task_cards ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sprite_heights_task_cards (
  id TEXT PRIMARY KEY,
  room_id UUID REFERENCES public.sprite_heights_rooms(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'backlog',
  assigned_agent_id TEXT REFERENCES public.sprite_heights_agents(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL
);

ALTER TABLE public.sprite_heights_task_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own task cards"
  ON public.sprite_heights_task_cards FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users insert own task cards"
  ON public.sprite_heights_task_cards FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users update own task cards"
  ON public.sprite_heights_task_cards FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users delete own task cards"
  ON public.sprite_heights_task_cards FOR DELETE
  USING (auth.uid() = owner_id);

CREATE POLICY "Service role full access to task cards"
  ON public.sprite_heights_task_cards FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sprite_heights_task_cards_owner ON public.sprite_heights_task_cards (owner_id);
CREATE INDEX IF NOT EXISTS idx_sprite_heights_task_cards_room ON public.sprite_heights_task_cards (room_id);

-- ── world_state ────────────────────────────────────────────────────────────
-- Per-room world state. fired_agents stays as JSONB since it's an array
-- of complex objects that's read/written as a whole.

CREATE TABLE IF NOT EXISTS public.sprite_heights_world_state (
  room_id UUID PRIMARY KEY REFERENCES public.sprite_heights_rooms(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  seed INTEGER NOT NULL DEFAULT 0,
  fired_agents JSONB NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.sprite_heights_world_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own world state"
  ON public.sprite_heights_world_state FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users insert own world state"
  ON public.sprite_heights_world_state FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users update own world state"
  ON public.sprite_heights_world_state FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users delete own world state"
  ON public.sprite_heights_world_state FOR DELETE
  USING (auth.uid() = owner_id);

CREATE POLICY "Service role full access to world state"
  ON public.sprite_heights_world_state FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── player_info ────────────────────────────────────────────────────────────
-- Per-user player info (name, workspace, appearance).

CREATE TABLE IF NOT EXISTS public.sprite_heights_player_info (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Boss',
  workspace TEXT NOT NULL DEFAULT '',
  appearance JSONB
);

ALTER TABLE public.sprite_heights_player_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own player info"
  ON public.sprite_heights_player_info FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own player info"
  ON public.sprite_heights_player_info FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own player info"
  ON public.sprite_heights_player_info FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own player info"
  ON public.sprite_heights_player_info FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to player info"
  ON public.sprite_heights_player_info FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── game_settings ──────────────────────────────────────────────────────────
-- Per-user game settings.

CREATE TABLE IF NOT EXISTS public.sprite_heights_game_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cline_max_iterations INTEGER NOT NULL DEFAULT 60,
  cline_auto_approve BOOLEAN NOT NULL DEFAULT false,
  game_idle_wander BOOLEAN NOT NULL DEFAULT true,
  game_theme TEXT NOT NULL DEFAULT 'classic',
  railway_enabled BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.sprite_heights_game_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own settings"
  ON public.sprite_heights_game_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own settings"
  ON public.sprite_heights_game_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own settings"
  ON public.sprite_heights_game_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own settings"
  ON public.sprite_heights_game_settings FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to game settings"
  ON public.sprite_heights_game_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
