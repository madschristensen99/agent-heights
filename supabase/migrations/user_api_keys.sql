-- Per-user Swarms API keys (encrypted at rest).
-- Allows each user to bring their own key instead of sharing a global one.

CREATE TABLE IF NOT EXISTS public.user_api_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- Users can read/write only their own API key
CREATE POLICY "Users read own API key"
  ON public.user_api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own API key"
  ON public.user_api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own API key"
  ON public.user_api_keys FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own API key"
  ON public.user_api_keys FOR DELETE
  USING (auth.uid() = user_id);
