import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the Redis-backed rate limiter.
 *
 * Mocks Redis to test the rate limiting logic in isolation
 * without requiring a running Redis instance.
 */

// Mock Redis before importing the module
const mockEval = vi.fn();
const mockRedisInstance = { eval: mockEval };

vi.mock("@/lib/redis", () => ({
  getRedis: () => mockRedisInstance,
}));

// Import AFTER mock setup
const { checkRateLimit, rateLimitHeaders } = await import("@/lib/rate-limit");

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows requests under the limit", async () => {
    mockEval.mockResolvedValue([1, 3600]); // count=1, ttl=3600

    const result = await checkRateLimit("user-1", "chat", {
      maxRequests: 50,
      windowSeconds: 3600,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(49);
    expect(result.limit).toBe(50);
  });

  it("blocks requests over the limit", async () => {
    mockEval.mockResolvedValue([51, 1800]); // count=51 (over 50), ttl=1800

    const result = await checkRateLimit("user-1", "chat", {
      maxRequests: 50,
      windowSeconds: 3600,
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("returns remaining=0 when at exact limit", async () => {
    mockEval.mockResolvedValue([50, 1000]); // exactly at limit

    const result = await checkRateLimit("user-1", "chat", {
      maxRequests: 50,
      windowSeconds: 3600,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("fails open when Redis is unavailable", async () => {
    mockEval.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await checkRateLimit("user-1", "chat", {
      maxRequests: 50,
      windowSeconds: 3600,
    });

    // Should ALLOW the request (fail-open)
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(50);
  });

  it("uses correct Redis key format", async () => {
    mockEval.mockResolvedValue([1, 3600]);

    await checkRateLimit("alice", "index", {
      maxRequests: 5,
      windowSeconds: 3600,
    });

    // Verify the key passed to Redis
    expect(mockEval).toHaveBeenCalledWith(
      expect.any(String), // Lua script
      1,
      "rl:index:alice", // key format: rl:{endpoint}:{userId}
      3600,
      expect.any(Number)
    );
  });
});

describe("rateLimitHeaders", () => {
  it("includes Retry-After when blocked", () => {
    const headers = rateLimitHeaders({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
      limit: 50,
    });

    expect(headers["X-RateLimit-Limit"]).toBe("50");
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
    expect(headers["Retry-After"]).toBeDefined();
  });

  it("does NOT include Retry-After when allowed", () => {
    const headers = rateLimitHeaders({
      allowed: true,
      remaining: 49,
      resetAt: Date.now() + 3600_000,
      limit: 50,
    });

    expect(headers["X-RateLimit-Limit"]).toBe("50");
    expect(headers["X-RateLimit-Remaining"]).toBe("49");
    expect(headers["Retry-After"]).toBeUndefined();
  });
});
