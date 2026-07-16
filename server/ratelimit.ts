/**
 * Simple in-memory token bucket rate limiter.
 * Each user gets their own bucket. No external dependencies.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

/** Rate limits per message type (tokens per minute). */
const LIMITS: Record<string, { max: number; refillPerSec: number }> = {
  hire: { max: 10, refillPerSec: 10 / 60 },
  assign: { max: 50, refillPerSec: 50 / 60 },
  assign_all: { max: 20, refillPerSec: 20 / 60 },
  chat: { max: 60, refillPerSec: 60 / 60 },
  player_move: { max: 600, refillPerSec: 10 },
  npc_update: { max: 600, refillPerSec: 10 },
  voice_ice: { max: 200, refillPerSec: 50 },
  voice_offer: { max: 20, refillPerSec: 2 },
  voice_answer: { max: 20, refillPerSec: 2 },
  voice_start: { max: 10, refillPerSec: 10 / 60 },
  voice_stop: { max: 10, refillPerSec: 10 / 60 },
  agent_fs_write: { max: 30, refillPerSec: 30 / 60 },
  agent_fs_delete: { max: 20, refillPerSec: 20 / 60 },
  agent_fs_upload: { max: 20, refillPerSec: 20 / 60 },
};

/** Default limit for any message type not explicitly listed. */
const DEFAULT_LIMIT = { max: 120, refillPerSec: 120 / 60 };

/**
 * Check if a message from the given user is allowed under rate limits.
 * Returns true if allowed, false if rate-limited.
 */
export function rateLimit(userId: string, msgType: string): boolean {
  const limit = LIMITS[msgType] ?? DEFAULT_LIMIT;
  const key = `${userId}:${msgType}`;
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: limit.max, lastRefill: Date.now() };
    buckets.set(key, bucket);
  }

  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(limit.max, bucket.tokens + elapsed * limit.refillPerSec);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }

  return false;
}
