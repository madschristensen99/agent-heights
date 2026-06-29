-- Phase 2: Migrate existing JSONB blobs into relational tables.
-- Run AFTER relational_tables.sql.
-- For each row in agent_hq_saves, decompose the JSONB data into:
--   - one room
--   - one room_player (owner)
--   - one player_info row
--   - one game_settings row
--   - one world_state row
--   - N agent rows
--   - N agent_log rows (from logs map)
--   - N task_card rows

DO $$
DECLARE
  save_row RECORD;
  room_id UUID;
  agent_data JSONB;
  log_entry JSONB;
  card_data JSONB;
  log_key TEXT;
BEGIN
  FOR save_row IN
    SELECT user_id, data, tenant_id FROM public.agent_hq_saves
  LOOP
    -- Skip if already migrated (room exists for this user)
    SELECT id INTO room_id FROM public.agent_hq_rooms WHERE owner_id = save_row.user_id LIMIT 1;
    IF room_id IS NOT NULL THEN CONTINUE; END IF;

    -- Create room
    INSERT INTO public.agent_hq_rooms (owner_id, name, seed, theme)
    VALUES (
      save_row.user_id,
      COALESCE(save_row.data->>'name', 'My Office'),
      COALESCE((save_row.data->'world'->>'seed')::INTEGER, 0),
      COALESCE(save_row.data->'settings'->'game'->>'theme', 'classic')
    )
    RETURNING id INTO room_id;

    -- Create room_player (owner)
    INSERT INTO public.agent_hq_room_players (room_id, user_id, role, appearance)
    VALUES (
      room_id,
      save_row.user_id,
      'owner',
      save_row.data->'player'->'appearance'
    )
    ON CONFLICT DO NOTHING;

    -- Create player_info
    INSERT INTO public.agent_hq_player_info (user_id, name, workspace, appearance)
    VALUES (
      save_row.user_id,
      COALESCE(save_row.data->'player'->>'name', 'Boss'),
      COALESCE(save_row.data->'player'->>'workspace', ''),
      save_row.data->'player'->'appearance'
    )
    ON CONFLICT (user_id) DO UPDATE SET
      name = EXCLUDED.name,
      workspace = EXCLUDED.workspace,
      appearance = EXCLUDED.appearance;

    -- Create game_settings
    INSERT INTO public.agent_hq_game_settings (
      user_id, cline_max_iterations, cline_auto_approve,
      game_idle_wander, game_theme, railway_enabled
    )
    VALUES (
      save_row.user_id,
      COALESCE((save_row.data->'settings'->'cline'->>'maxIterations')::INTEGER, 60),
      COALESCE((save_row.data->'settings'->'cline'->>'autoApproveCommands')::BOOLEAN, false),
      COALESCE((save_row.data->'settings'->'game'->>'idleWander')::BOOLEAN, true),
      COALESCE(save_row.data->'settings'->'game'->>'theme', 'classic'),
      COALESCE((save_row.data->'settings'->'railway'->>'enabled')::BOOLEAN, false)
    )
    ON CONFLICT (user_id) DO UPDATE SET
      cline_max_iterations = EXCLUDED.cline_max_iterations,
      cline_auto_approve = EXCLUDED.cline_auto_approve,
      game_idle_wander = EXCLUDED.game_idle_wander,
      game_theme = EXCLUDED.game_theme,
      railway_enabled = EXCLUDED.railway_enabled;

    -- Create world_state
    INSERT INTO public.agent_hq_world_state (room_id, owner_id, seed, fired_agents)
    VALUES (
      room_id,
      save_row.user_id,
      COALESCE((save_row.data->'world'->>'seed')::INTEGER, 0),
      COALESCE(save_row.data->'world'->'firedAgents', '[]'::jsonb)
    )
    ON CONFLICT (room_id) DO UPDATE SET
      seed = EXCLUDED.seed,
      fired_agents = EXCLUDED.fired_agents;

    -- Migrate agents
    IF save_row.data->'agents' IS NOT NULL THEN
      FOR agent_data IN SELECT * FROM jsonb_array_elements(save_row.data->'agents')
      LOOP
        INSERT INTO public.agent_hq_agents (
          id, room_id, owner_id, name, title, provider, model, status, task,
          desk_index, sprite, appearance, accent, system_prompt, role,
          session_id, tasks_done
        )
        VALUES (
          agent_data->>'id',
          room_id,
          save_row.user_id,
          agent_data->>'name',
          agent_data->>'title',
          COALESCE(agent_data->>'provider', 'cline'),
          agent_data->>'model',
          COALESCE(agent_data->>'status', 'idle'),
          agent_data->>'task',
          COALESCE((agent_data->>'deskIndex')::INTEGER, 0),
          COALESCE((agent_data->>'sprite')::INTEGER, 0),
          agent_data->'appearance',
          COALESCE(agent_data->>'accent', '#4f9dde'),
          COALESCE(agent_data->>'systemPrompt', ''),
          COALESCE(agent_data->>'role', 'worker'),
          agent_data->>'sessionId',
          COALESCE((agent_data->>'tasksDone')::INTEGER, 0)
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          title = EXCLUDED.title,
          status = EXCLUDED.status,
          task = EXCLUDED.task,
          desk_index = EXCLUDED.desk_index,
          session_id = EXCLUDED.session_id,
          tasks_done = EXCLUDED.tasks_done;
      END LOOP;
    END IF;

    -- Migrate agent logs
    IF save_row.data->'logs' IS NOT NULL THEN
      FOR log_key IN SELECT key FROM jsonb_object_keys(save_row.data->'logs') AS key
      LOOP
        FOR log_entry IN SELECT * FROM jsonb_array_elements(save_row.data->'logs'->log_key)
        LOOP
          INSERT INTO public.agent_hq_agent_logs (agent_id, owner_id, ts, kind, text)
          VALUES (
            log_key,
            save_row.user_id,
            (log_entry->>'ts')::BIGINT,
            log_entry->>'kind',
            log_entry->>'text'
          )
          ON CONFLICT DO NOTHING;
        END LOOP;
      END LOOP;
    END IF;

    -- Migrate task cards
    IF save_row.data->'board' IS NOT NULL THEN
      FOR card_data IN SELECT * FROM jsonb_array_elements(save_row.data->'board')
      LOOP
        INSERT INTO public.agent_hq_task_cards (
          id, room_id, owner_id, title, description, status,
          assigned_agent_id, created_at
        )
        VALUES (
          card_data->>'id',
          room_id,
          save_row.user_id,
          card_data->>'title',
          COALESCE(card_data->>'description', ''),
          COALESCE(card_data->>'status', 'backlog'),
          NULLIF(card_data->>'agentId', '')::TEXT,
          COALESCE((card_data->>'createdAt')::BIGINT, 0)
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          status = EXCLUDED.status;
      END LOOP;
    END IF;

    RAISE NOTICE 'Migrated user % into room %', save_row.user_id, room_id;
  END LOOP;
END $$;
