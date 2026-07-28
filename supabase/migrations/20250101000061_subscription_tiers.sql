-- Add subscription_tier column to support tiered pricing ($0.99 / $4.99 / $19.99).
-- Values: NULL (no subscription) | 'starter' | 'pro' | 'business'

ALTER TABLE public.user_payments
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT NULL;
