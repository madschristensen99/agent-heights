-- Stripe payment tracking for Sprite Heights.
-- Tracks the $1 entrance fee (one-time) and $20/month subscription for hiring agents.

CREATE TABLE IF NOT EXISTS public.user_payments (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  entrance_paid BOOLEAN NOT NULL DEFAULT FALSE,
  entrance_paid_at TIMESTAMPTZ,
  subscription_id TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'none', -- none | active | canceled | past_due | trialing | incomplete
  current_period_end BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own payments"
  ON public.user_payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to payments"
  ON public.user_payments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
