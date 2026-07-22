-- Add mailbox_platforms column to game_settings
-- Stores which platform each of the 6 mailbox slots is assigned to (null = unassigned)
-- Default: the original 6 platforms for backward compatibility

ALTER TABLE public.sprite_heights_game_settings
  ADD COLUMN IF NOT EXISTS mailbox_platforms TEXT[] NOT NULL DEFAULT
    ARRAY['Slack', 'Discord', 'Telegram', 'WhatsApp', 'Signal', 'Email'];
