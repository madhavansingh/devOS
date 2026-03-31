import { getRedis } from "./redis";
import crypto from "crypto";

/**
 * Redis-backed caching layer for DevOS.
 *
 * Used to cache:
 *  - File explanations (key: explain:{repoId}:{filePath}:{commitHash})
 *  - Query embeddings (key: embed:{queryHash})
 *  - User lookups (key: user:{githubLogin})
 */

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function hashKey(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

// ─────────────────────────────────────────────────────────────
// Generic Cache Operations
// ─────────────────────────────────────────────────────────────

/**
 * Get a cached value. Returns null on miss or Redis unavailability.
 * Cache failures are silent — the system degrades gracefully.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    // Cache miss is not an error — degrade gracefully
    return null;
  }
}

/**
 * Set a cached value with TTL (in seconds).
 * Failures are silent.
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Cache write failure is not critical
  }
}

/**
 * Delete a cached value.
 */
export async function cacheDel(key: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(key);
  } catch {
    // Ignore
  }
}

// ─────────────────────────────────────────────────────────────
// Domain-Specific Caches
// ─────────────────────────────────────────────────────────────

const TTL = {
  EXPLAIN: 24 * 60 * 60,     // 24 hours
  EMBEDDING: 60 * 60,         // 1 hour
  USER: 10 * 60,              // 10 minutes
} as const;

/** Cache key for file explanations */
export function explainCacheKey(repoId: string, filePath: string, commitHash: string): string {
  return `explain:${repoId}:${hashKey(filePath)}:${commitHash.slice(0, 8)}`;
}

/** Cache key for query embeddings */
export function embeddingCacheKey(queryText: string): string {
  return `embed:${hashKey(queryText)}`;
}

/** Cache key for user lookups */
export function userCacheKey(githubLogin: string): string {
  return `user:${githubLogin}`;
}

// ─── Explain Cache ───────────────────────────────────────────

export async function getCachedExplanation(
  repoId: string,
  filePath: string,
  commitHash: string
): Promise<string | null> {
  return cacheGet<string>(explainCacheKey(repoId, filePath, commitHash));
}

export async function setCachedExplanation(
  repoId: string,
  filePath: string,
  commitHash: string,
  explanation: string
): Promise<void> {
  await cacheSet(explainCacheKey(repoId, filePath, commitHash), explanation, TTL.EXPLAIN);
}

// ─── Embedding Cache ─────────────────────────────────────────

export async function getCachedEmbedding(queryText: string): Promise<number[] | null> {
  return cacheGet<number[]>(embeddingCacheKey(queryText));
}

export async function setCachedEmbedding(queryText: string, embedding: number[]): Promise<void> {
  await cacheSet(embeddingCacheKey(queryText), embedding, TTL.EMBEDDING);
}

// ─── User Cache ──────────────────────────────────────────────

export async function getCachedUser(githubLogin: string): Promise<{ id: string } | null> {
  return cacheGet<{ id: string }>(userCacheKey(githubLogin));
}

export async function setCachedUser(githubLogin: string, user: { id: string }): Promise<void> {
  await cacheSet(userCacheKey(githubLogin), user, TTL.USER);
}

// ─── Invalidation ────────────────────────────────────────────

/** Invalidate all explain caches for a repo (e.g., after re-indexing) */
export async function invalidateRepoCache(repoId: string): Promise<void> {
  try {
    const redis = getRedis();
    const keys = await redis.keys(`explain:${repoId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Ignore
  }
}
