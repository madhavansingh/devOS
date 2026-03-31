import Redis from "ioredis";

/**
 * Singleton Redis client for DevOS.
 * Used by: rate limiter, cache, job queue.
 *
 * Connection is lazy-initialized on first access.
 * Handles reconnection automatically via ioredis defaults.
 */

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null; // stop retrying after 5 attempts
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    client.on("error", (err) => {
      console.error("[Redis] Connection error:", err.message);
    });

    client.on("connect", () => {
      console.log("[Redis] Connected");
    });
  }

  return client;
}

/**
 * Graceful shutdown — call from process signal handlers.
 */
export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
