-- Track user activity for retention email backoff system
ALTER TABLE user_payments
  ADD COLUMN IF NOT EXISTS last_active_at BIGINT,
  ADD COLUMN IF NOT EXISTS last_platform_engagement_at BIGINT,
  ADD COLUMN IF NOT EXISTS last_retention_email_at BIGINT,
  ADD COLUMN IF NOT EXISTS retention_email_tier INT DEFAULT 0;
