-- Migration: Rename sprite_heights_* tables to agent_heights_*
-- This renames all application tables to use the "agent_heights" prefix.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprite_heights_saves' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_heights_saves' AND table_schema = 'public') THEN
    ALTER TABLE public.sprite_heights_saves RENAME TO agent_heights_saves;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprite_heights_agents' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_heights_agents' AND table_schema = 'public') THEN
    ALTER TABLE public.sprite_heights_agents RENAME TO agent_heights_agents;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprite_heights_agent_logs' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_heights_agent_logs' AND table_schema = 'public') THEN
    ALTER TABLE public.sprite_heights_agent_logs RENAME TO agent_heights_agent_logs;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprite_heights_task_cards' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_heights_task_cards' AND table_schema = 'public') THEN
    ALTER TABLE public.sprite_heights_task_cards RENAME TO agent_heights_task_cards;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprite_heights_rooms' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_heights_rooms' AND table_schema = 'public') THEN
    ALTER TABLE public.sprite_heights_rooms RENAME TO agent_heights_rooms;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprite_heights_room_players' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_heights_room_players' AND table_schema = 'public') THEN
    ALTER TABLE public.sprite_heights_room_players RENAME TO agent_heights_room_players;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprite_heights_world_state' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_heights_world_state' AND table_schema = 'public') THEN
    ALTER TABLE public.sprite_heights_world_state RENAME TO agent_heights_world_state;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprite_heights_player_info' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_heights_player_info' AND table_schema = 'public') THEN
    ALTER TABLE public.sprite_heights_player_info RENAME TO agent_heights_player_info;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprite_heights_game_settings' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_heights_game_settings' AND table_schema = 'public') THEN
    ALTER TABLE public.sprite_heights_game_settings RENAME TO agent_heights_game_settings;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprite_heights_saved_outfits' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_heights_saved_outfits' AND table_schema = 'public') THEN
    ALTER TABLE public.sprite_heights_saved_outfits RENAME TO agent_heights_saved_outfits;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprite_heights_organizations' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_heights_organizations' AND table_schema = 'public') THEN
    ALTER TABLE public.sprite_heights_organizations RENAME TO agent_heights_organizations;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprite_heights_org_members' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_heights_org_members' AND table_schema = 'public') THEN
    ALTER TABLE public.sprite_heights_org_members RENAME TO agent_heights_org_members;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprite_heights_mail_events' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_heights_mail_events' AND table_schema = 'public') THEN
    ALTER TABLE public.sprite_heights_mail_events RENAME TO agent_heights_mail_events;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprite_heights_schedules' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_heights_schedules' AND table_schema = 'public') THEN
    ALTER TABLE public.sprite_heights_schedules RENAME TO agent_heights_schedules;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprite_heights_conversation_messages' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_heights_conversation_messages' AND table_schema = 'public') THEN
    ALTER TABLE public.sprite_heights_conversation_messages RENAME TO agent_heights_conversation_messages;
  END IF;
END $$;
