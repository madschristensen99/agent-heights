-- Migration: Rename agent_hq_* tables to sprite_heights_*
-- This migrates all existing data from the old table names to the new ones.
-- Each RENAME only runs if the old table exists and the new one doesn't.

-- ── agent_hq_saves → sprite_heights_saves ──────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_hq_saves')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprite_heights_saves') THEN
    ALTER TABLE public.agent_hq_saves RENAME TO sprite_heights_saves;
    -- Rename indexes
    ALTER INDEX IF EXISTS idx_agent_hq_saves_tenant_id RENAME TO idx_sprite_heights_saves_tenant_id;
  END IF;
END $$;

-- ── agent_hq_rooms → sprite_heights_rooms ──────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_hq_rooms')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprite_heights_rooms') THEN
    ALTER TABLE public.agent_hq_rooms RENAME TO sprite_heights_rooms;
  END IF;
END $$;

-- ── agent_hq_room_players → sprite_heights_room_players ────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_hq_room_players')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprite_heights_room_players') THEN
    ALTER TABLE public.agent_hq_room_players RENAME TO sprite_heights_room_players;
  END IF;
END $$;

-- ── agent_hq_agents → sprite_heights_agents ────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_hq_agents')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprite_heights_agents') THEN
    ALTER TABLE public.agent_hq_agents RENAME TO sprite_heights_agents;
    ALTER INDEX IF EXISTS idx_agent_hq_agents_owner RENAME TO idx_sprite_heights_agents_owner;
    ALTER INDEX IF EXISTS idx_agent_hq_agents_room RENAME TO idx_sprite_heights_agents_room;
  END IF;
END $$;

-- ── agent_hq_agent_logs → sprite_heights_agent_logs ────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_hq_agent_logs')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprite_heights_agent_logs') THEN
    ALTER TABLE public.agent_hq_agent_logs RENAME TO sprite_heights_agent_logs;
    ALTER INDEX IF EXISTS idx_agent_hq_agent_logs_agent RENAME TO idx_sprite_heights_agent_logs_agent;
    ALTER INDEX IF EXISTS idx_agent_hq_agent_logs_owner RENAME TO idx_sprite_heights_agent_logs_owner;
  END IF;
END $$;

-- ── agent_hq_task_cards → sprite_heights_task_cards ────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_hq_task_cards')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprite_heights_task_cards') THEN
    ALTER TABLE public.agent_hq_task_cards RENAME TO sprite_heights_task_cards;
  END IF;
END $$;

-- ── agent_hq_world_state → sprite_heights_world_state ──────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_hq_world_state')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprite_heights_world_state') THEN
    ALTER TABLE public.agent_hq_world_state RENAME TO sprite_heights_world_state;
  END IF;
END $$;

-- ── agent_hq_player_info → sprite_heights_player_info ──────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_hq_player_info')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprite_heights_player_info') THEN
    ALTER TABLE public.agent_hq_player_info RENAME TO sprite_heights_player_info;
  END IF;
END $$;

-- ── agent_hq_game_settings → sprite_heights_game_settings ──────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_hq_game_settings')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprite_heights_game_settings') THEN
    ALTER TABLE public.agent_hq_game_settings RENAME TO sprite_heights_game_settings;
  END IF;
END $$;

-- ── agent_hq_schedules → sprite_heights_schedules ──────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_hq_schedules')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprite_heights_schedules') THEN
    ALTER TABLE public.agent_hq_schedules RENAME TO sprite_heights_schedules;
  END IF;
END $$;

-- ── agent_hq_conversation_messages → sprite_heights_conversation_messages ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_hq_conversation_messages')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprite_heights_conversation_messages') THEN
    ALTER TABLE public.agent_hq_conversation_messages RENAME TO sprite_heights_conversation_messages;
  END IF;
END $$;

-- ── agent_hq_saved_outfits → sprite_heights_saved_outfits ──────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_hq_saved_outfits')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprite_heights_saved_outfits') THEN
    ALTER TABLE public.agent_hq_saved_outfits RENAME TO sprite_heights_saved_outfits;
  END IF;
END $$;

-- ── agent_hq_organizations → sprite_heights_organizations ──────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_hq_organizations')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprite_heights_organizations') THEN
    ALTER TABLE public.agent_hq_organizations RENAME TO sprite_heights_organizations;
  END IF;
END $$;

-- ── agent_hq_org_members → sprite_heights_org_members ──────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_hq_org_members')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprite_heights_org_members') THEN
    ALTER TABLE public.agent_hq_org_members RENAME TO sprite_heights_org_members;
  END IF;
END $$;

-- ── agent_hq_agent_mcp_servers → sprite_heights_agent_mcp_servers ──────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_hq_agent_mcp_servers')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprite_heights_agent_mcp_servers') THEN
    ALTER TABLE public.agent_hq_agent_mcp_servers RENAME TO sprite_heights_agent_mcp_servers;
  END IF;
END $$;

-- ── Update org data: rename the seeded org ─────────────────────────────────
UPDATE public.sprite_heights_organizations
  SET name = 'Sprite Heights HQ', slug = 'sprite-heights-hq', github_org = 'sprite-heights'
  WHERE slug = 'agent-hq-hq';
