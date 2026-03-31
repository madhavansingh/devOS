import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the Redis caching layer.
 *
 * Mocks Redis to validate cache get/set/delete operations,
 * TTL behavior, and graceful degradation on Redis failures.
 */

const mockGet = vi.fn();
const mockSetex = vi.fn();
const mockDel = vi.fn();
const mockKeys = vi.fn();
const mockRedisInstance = {
  get: mockGet,
  setex: mockSetex,
  del: mockDel,
  keys: mockKeys,
};

vi.mock("@/lib/redis", () => ({
  getRedis: () => mockRedisInstance,
}));

const {
  cacheGet,
  cacheSet,
  cacheDel,
  getCachedEmbedding,
  setCachedEmbedding,
  invalidateRepoCache,
} = await import("@/lib/cache");

describe("cacheGet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns parsed JSON on cache hit", async () => {
    mockGet.mockResolvedValue(JSON.stringify({ foo: "bar" }));

    const result = await cacheGet("test-key");
    expect(result).toEqual({ foo: "bar" });
    expect(mockGet).toHaveBeenCalledWith("test-key");
  });

  it("returns null on cache miss", async () => {
    mockGet.mockResolvedValue(null);

    const result = await cacheGet("miss-key");
    expect(result).toBeNull();
  });

  it("returns null on Redis error (graceful degradation)", async () => {
    mockGet.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await cacheGet("error-key");
    expect(result).toBeNull();
  });
});

describe("cacheSet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores JSON with TTL", async () => {
    await cacheSet("key", { data: 123 }, 3600);
    expect(mockSetex).toHaveBeenCalledWith("key", 3600, JSON.stringify({ data: 123 }));
  });

  it("does not throw on Redis error", async () => {
    mockSetex.mockRejectedValue(new Error("Redis down"));
    // Should not throw
    await expect(cacheSet("key", "value", 60)).resolves.toBeUndefined();
  });
});

describe("cacheDel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes a key", async () => {
    await cacheDel("delete-me");
    expect(mockDel).toHaveBeenCalledWith("delete-me");
  });
});

describe("embedding cache", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores and retrieves embeddings", async () => {
    const embedding = [0.1, 0.2, 0.3];
    await setCachedEmbedding("what is auth", embedding);
    expect(mockSetex).toHaveBeenCalledWith(
      expect.stringContaining("embed:"),
      3600,
      JSON.stringify(embedding)
    );
  });

  it("returns null for uncached queries", async () => {
    mockGet.mockResolvedValue(null);
    const result = await getCachedEmbedding("new query");
    expect(result).toBeNull();
  });
});

describe("invalidateRepoCache", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes all explain keys for a repo", async () => {
    mockKeys.mockResolvedValue(["explain:repo1:a", "explain:repo1:b"]);

    await invalidateRepoCache("repo1");

    expect(mockKeys).toHaveBeenCalledWith("explain:repo1:*");
    expect(mockDel).toHaveBeenCalledWith("explain:repo1:a", "explain:repo1:b");
  });

  it("does nothing if no keys found", async () => {
    mockKeys.mockResolvedValue([]);

    await invalidateRepoCache("empty-repo");

    expect(mockDel).not.toHaveBeenCalled();
  });
});
