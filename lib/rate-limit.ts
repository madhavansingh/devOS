import { getRedis } from "./redis";

/**
 * Redis-backed distributed rate limiter for DevOS.
 * Uses a sliding window counter pattern via Redis.
 *
 * REPLACES the old in-memory Map-based limiter which:
 *  - Reset on server restart
 *  - Didn't sync across instances
 *  - Was trivially bypassed
 *
 * @see project-docs/API.md §8 — Rate Limiting Strategy
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface RateLimitConfig {
  /** Maximum number of requests allowed per window */
  maxRequests: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in the current window */
  remaining: number;
  /** Unix timestamp (ms) when the window resets */
  resetAt: number;
  /** Total requests allowed per window */
  limit: number;
}

// ─────────────────────────────────────────────────────────────
// Rate Limit Presets
// ─────────────────────────────────────────────────────────────

/** 30 requests per user per hour */
export const EXPLAIN_LIMIT: RateLimitConfig = {
  maxRequests: 30,
  windowSeconds: 3600,
};

/** 50 requests per user per hour */
export const CHAT_LIMIT: RateLimitConfig = {
  maxRequests: 50,
  windowSeconds: 3600,
};

/** 5 requests per user per hour */
export const INDEX_LIMIT: RateLimitConfig = {
  maxRequests: 5,
  windowSeconds: 3600,
};

/** Global per-IP limit: 200 requests per minute (DDoS protection) */
export const GLOBAL_LIMIT: RateLimitConfig = {
  maxRequests: 200,
  windowSeconds: 60,
};

// ─────────────────────────────────────────────────────────────
// Lua script for atomic sliding window counter
// ─────────────────────────────────────────────────────────────

/**
 * Atomic Redis Lua script:
 * 1. Increment the counter for the key
 * 2. Set TTL if this is the first request in the window
 * 3. Return [count, ttl_remaining]
 *
 * This is atomic — no race conditions even under high concurrency.
 */
const RATE_LIMIT_SCRIPT = `
  local key = KEYS[1]
  local window = tonumber(ARGV[1])
  local now = tonumber(ARGV[2])

  local count = redis.call('INCR', key)
  if count == 1 then
    redis.call('EXPIRE', key, window)
  end
  local ttl = redis.call('TTL', key)
  return {count, ttl}
`;

// ─────────────────────────────────────────────────────────────
// Core API
// ─────────────────────────────────────────────────────────────

/**
 * Check and consume a rate limit token for a user+endpoint combo.
 * Uses Redis for distributed state — works across all instances.
 *
 * Falls back to ALLOW if Redis is unavailable (fail-open).
 *
 * @example
 * ```ts
 * const result = await checkRateLimit("user-123", "explain", EXPLAIN_LIMIT);
 * if (!result.allowed) {
 *   return NextResponse.json(
 *     { error: `Rate limit exceeded` },
 *     { status: 429, headers: rateLimitHeaders(result) }
 *   );
 * }
 * ```
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const key = `rl:${endpoint}:${userId}`;
  const now = Math.floor(Date.now() / 1000);

  try {
    const redis = getRedis();
    const result = (await redis.eval(
      RATE_LIMIT_SCRIPT,
      1,
      key,
      config.windowSeconds,
      now
    )) as [number, number];

    const [count, ttl] = result;
    const allowed = count <= config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - count);
    const resetAt = (now + ttl) * 1000;

    return { allowed, remaining, resetAt, limit: config.maxRequests };
  } catch (err) {
    // Redis down — fail open (allow the request)
    // This prevents Redis outages from killing the entire app
    console.warn(
      `[RateLimit] Redis unavailable, failing open: ${err instanceof Error ? err.message : err}`
    );
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: (now + config.windowSeconds) * 1000,
      limit: config.maxRequests,
    };
  }
}

/**
 * Generate standard rate limit response headers.
 */
export function rateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.allowed
      ? {}
      : {
          "Retry-After": String(
            Math.ceil((result.resetAt - Date.now()) / 1000)
          ),
        }),
  };
}
