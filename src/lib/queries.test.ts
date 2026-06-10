import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Redis + Prisma so we can force failures and avoid real infra.
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
  subscriptionsKey: (userId: string) => `user:${userId}:subscriptions`,
  // Deterministic value inside the expected jitter range; the range assertion
  // below is the contract the test enforces.
  ttlWithJitter: () => 3700,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { subscription: { findMany: vi.fn() } },
}));

import { getCachedSubscriptions, getCachedMonthlyTotal } from "@/lib/queries";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

const get = vi.mocked(redis.get);
const set = vi.mocked(redis.set);
const del = vi.mocked(redis.del);
const findMany = vi.mocked(prisma.subscription.findMany);

const CACHE_KEY = "user:u1:subscriptions";
const LOCK_KEY = `lock:${CACHE_KEY}`;

// A Prisma row (Decimal amount, Date fields) as returned by findMany.
const DB_ROW = {
  id: "s1",
  name: "Netflix",
  amount: 10,
  currency: "USD",
  billingCycle: "MONTHLY",
  nextBillingDate: new Date("2099-01-01T00:00:00.000Z"),
  startDate: new Date("2020-01-01T00:00:00.000Z"),
  status: "ACTIVE",
  category: null,
};

// The same row after serialization (number amount, ISO strings) — cache shape.
const SERIALIZED = {
  id: "s1",
  name: "Netflix",
  amount: 10,
  currency: "USD",
  billingCycle: "MONTHLY",
  nextBillingDate: "2099-01-01T00:00:00.000Z",
  startDate: "2020-01-01T00:00:00.000Z",
  status: "ACTIVE",
  category: null,
};

beforeEach(() => {
  // Reset impls AND clear once-queues so state doesn't leak across tests.
  vi.resetAllMocks();
  // Defaults: lock NX succeeds, cache write succeeds, lock release succeeds.
  // Individual tests override these to exercise other paths.
  set.mockResolvedValue("OK" as never);
  del.mockResolvedValue(1 as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("getCachedSubscriptions", () => {
  it("cache HIT: returns cached list, never touches DB or lock", async () => {
    get.mockResolvedValue([SERIALIZED]);

    const result = await getCachedSubscriptions("u1");

    expect(result).toEqual([SERIALIZED]);
    expect(findMany).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("cache MISS: serializes DB rows and writes cache with 1h TTL", async () => {
    get.mockResolvedValue(null);
    findMany.mockResolvedValue([DB_ROW] as never);

    const result = await getCachedSubscriptions("u1");

    expect(result).toEqual([SERIALIZED]);
    expect(findMany).toHaveBeenCalledOnce();
    // Order-independent: `set` is also called for the lock acquire.
    // TTL is jittered into [3600, 4199] to prevent cache avalanche.
    expect(set.mock.calls).toContainEqual([
      CACHE_KEY,
      [SERIALIZED],
      { ex: expect.toSatisfy((n: number) => n >= 3600 && n < 4200) },
    ]);
  });

  it("redis.get THROWS: swallows error, falls back to DB (lock still acquired)", async () => {
    get.mockRejectedValue(new Error("redis down"));
    findMany.mockResolvedValue([DB_ROW] as never);

    const result = await getCachedSubscriptions("u1");

    expect(result).toEqual([SERIALIZED]);
    expect(findMany).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalled();
  });

  it("redis.set THROWS on cache write: swallows error, still returns the list", async () => {
    get.mockResolvedValue(null);
    findMany.mockResolvedValue([DB_ROW] as never);
    // Lock acquire resolves; cache write rejects.
    set.mockImplementation((async (key: unknown) => {
      if (typeof key === "string" && key.startsWith("lock:")) return "OK";
      throw new Error("redis down");
    }) as never);

    const result = await getCachedSubscriptions("u1");

    expect(result).toEqual([SERIALIZED]);
    expect(console.error).toHaveBeenCalled();
  });

  describe("stampede protection", () => {
    it("lock acquired (happy path): set(lock) + set(cache) + del(lock) all fire", async () => {
      get.mockResolvedValue(null);
      findMany.mockResolvedValue([DB_ROW] as never);

      const result = await getCachedSubscriptions("u1");

      expect(result).toEqual([SERIALIZED]);
      expect(set.mock.calls).toContainEqual([
        LOCK_KEY,
        "1",
        { nx: true, ex: 10 },
      ]);
      expect(set.mock.calls).toContainEqual([
        CACHE_KEY,
        [SERIALIZED],
        { ex: expect.toSatisfy((n: number) => n >= 3600 && n < 4200) },
      ]);
      expect(del).toHaveBeenCalledWith(LOCK_KEY);
    });

    it("lock contention, cache appears mid-retry: returns cached value, never queries DB", async () => {
      vi.useFakeTimers();
      // Initial check + first two retries miss; third retry finds the cache.
      get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce([SERIALIZED]);
      // Lock NX fails — someone else is populating the cache.
      set.mockResolvedValue(null as never);

      const promise = getCachedSubscriptions("u1");
      await vi.advanceTimersByTimeAsync(250);
      const result = await promise;

      expect(result).toEqual([SERIALIZED]);
      expect(findMany).not.toHaveBeenCalled();
    });

    it("lock contention, retries exhausted: falls back to DB and does NOT write cache", async () => {
      vi.useFakeTimers();
      get.mockResolvedValue(null);
      set.mockResolvedValue(null as never); // Lock NX always fails.
      findMany.mockResolvedValue([DB_ROW] as never);

      const promise = getCachedSubscriptions("u1");
      await vi.advanceTimersByTimeAsync(250);
      const result = await promise;

      expect(result).toEqual([SERIALIZED]);
      expect(findMany).toHaveBeenCalledOnce();
      // Only lock-acquire attempts on `set` — no cache-key write.
      expect(set.mock.calls).not.toContainEqual([
        CACHE_KEY,
        expect.anything(),
        expect.anything(),
      ]);
    });

    it("lock acquired but findMany throws: del(lock) still fires (finally), error propagates", async () => {
      get.mockResolvedValue(null);
      findMany.mockRejectedValue(new Error("db down"));

      await expect(getCachedSubscriptions("u1")).rejects.toThrow("db down");

      expect(del).toHaveBeenCalledWith(LOCK_KEY);
    });
  });
});

// getCachedMonthlyTotal is a thin wrapper that derives totals from the
// subscription list — no cache of its own. We pin the list by driving
// getCachedSubscriptions through a cache hit (intra-module calls can't be
// spied directly in ESM).
describe("getCachedMonthlyTotal", () => {
  it("derives per-currency monthly totals from the subscription list", async () => {
    get.mockResolvedValue([
      { ...SERIALIZED, id: "s1", amount: 10, currency: "USD", billingCycle: "MONTHLY" },
      { ...SERIALIZED, id: "s2", amount: 120, currency: "USD", billingCycle: "YEARLY" }, // /12 = 10
      { ...SERIALIZED, id: "s3", amount: 5, currency: "CAD", billingCycle: "MONTHLY" },
    ]);

    const result = await getCachedMonthlyTotal("u1");

    expect(result).toEqual({ USD: 20, CAD: 5 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns {} when there are no subscriptions", async () => {
    get.mockResolvedValue([]);

    const result = await getCachedMonthlyTotal("u1");

    expect(result).toEqual({});
  });
});
