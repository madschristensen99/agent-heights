-- Add subscription_tier column to support tiered pricing ($0.99 / $4.99 / $20).
-- Values: NULL (no subscription) | 'starter' | 'pro' | 'unlimited'

ALTER TABLE public.user_payments
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT NULL;
