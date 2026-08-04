/**
 * Token bucket rate limiter.
 * Uses Redis when available (shared across instances), falls back to in-memory.
 */

import { client as redisClient, isRedisConfigured } from "./redis.js";

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
  npc_update: { max: 300, refillPerSec: 5 },
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

const RATE_LIMIT_PREFIX = "ratelimit:";

// Lua script for atomic token bucket check in Redis
const RATE_LIMIT_LUA = `
local key = KEYS[1]
local max_tokens = tonumber(ARGV[1])
local refill_per_sec = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(data[1]) or max_tokens
local last_refill = tonumber(data[2]) or now

local elapsed = (now - last_refill) / 1000
tokens = math.min(max_tokens, tokens + elapsed * refill_per_sec)

if tokens >= 1 then
  tokens = tokens - 1
  redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
  redis.call('EXPIRE', key, 120)
  return 1
else
  redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
  redis.call('EXPIRE', key, 120)
  return 0
end
`;

let luaSha: string | null = null;

async function initLuaScript(): Promise<void> {
  if (!redisClient || luaSha) return;
  try {
    luaSha = (await redisClient.script("LOAD", RATE_LIMIT_LUA)) as string;
  } catch (err) {
    console.error("[ratelimit] Failed to load Lua script:", err);
  }
}

let luaInitPromise: Promise<void> | null = null;
function ensureLuaScript(): Promise<void> {
  if (!luaInitPromise) luaInitPromise = initLuaScript();
  return luaInitPromise;
}

/**
 * Check if a message from the given user is allowed under rate limits.
 * Returns true if allowed, false if rate-limited.
 */
export function rateLimit(userId: string, msgType: string): boolean {
  const limit = LIMITS[msgType] ?? DEFAULT_LIMIT;
  const key = `${userId}:${msgType}`;

  if (isRedisConfigured && redisClient && luaSha) {
    // Redis path — fire and forget, but we need the result synchronously
    // Since we can't await in a sync function, we use the in-memory fallback
    // for the first call and let Redis catch up via background sync
    // Actually, for correctness we must use in-memory when we can't await
    return inMemoryRateLimit(key, limit);
  }

  return inMemoryRateLimit(key, limit);
}

function inMemoryRateLimit(key: string, limit: { max: number; refillPerSec: number }): boolean {
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

/**
 * Async rate limit check using Redis when available.
 * Falls back to in-memory when Redis is not configured.
 */
export async function rateLimitAsync(userId: string, msgType: string): Promise<boolean> {
  const limit = LIMITS[msgType] ?? DEFAULT_LIMIT;
  const key = `${userId}:${msgType}`;

  if (isRedisConfigured && redisClient) {
    await ensureLuaScript();
    if (luaSha) {
      try {
        const result = await redisClient.evalsha(
          luaSha, 1,
          `${RATE_LIMIT_PREFIX}${key}`,
          String(limit.max), String(limit.refillPerSec), String(Date.now()),
        );
        return result === 1;
      } catch (err) {
        // Fall back to in-memory if Redis fails
        console.error("[ratelimit] Redis eval failed, using in-memory:", err);
      }
    }
  }

  return inMemoryRateLimit(key, limit);
}
