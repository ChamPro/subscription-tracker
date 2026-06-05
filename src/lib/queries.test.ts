import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Redis + Prisma so we can force failures and avoid real infra.
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn() },
  subscriptionsKey: (userId: string) => `user:${userId}:subscriptions`,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { subscription: { findMany: vi.fn() } },
}));

import { getCachedSubscriptions, getCachedMonthlyTotal } from "@/lib/queries";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

const get = vi.mocked(redis.get);
const set = vi.mocked(redis.set);
const findMany = vi.mocked(prisma.subscription.findMany);

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
  vi.clearAllMocks();
  // Silence the intentional console.error in the catch branches.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// The caching now lives in getCachedSubscriptions, so the cache-aside behavior
// is exercised here.
describe("getCachedSubscriptions", () => {
  it("cache HIT: returns cached list, never touches DB", async () => {
    get.mockResolvedValue([SERIALIZED]);

    const result = await getCachedSubscriptions("u1");

    expect(result).toEqual([SERIALIZED]);
    expect(findMany).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("cache MISS: serializes DB rows and writes cache with 1h TTL", async () => {
    get.mockResolvedValue(null);
    findMany.mockResolvedValue([DB_ROW] as never);

    const result = await getCachedSubscriptions("u1");

    expect(result).toEqual([SERIALIZED]);
    expect(findMany).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith(
      "user:u1:subscriptions",
      [SERIALIZED],
      { ex: 3600 },
    );
  });

  it("redis.get THROWS: swallows error, falls back to DB", async () => {
    get.mockRejectedValue(new Error("redis down"));
    findMany.mockResolvedValue([DB_ROW] as never);

    const result = await getCachedSubscriptions("u1");

    expect(result).toEqual([SERIALIZED]);
    expect(findMany).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalled();
  });

  it("redis.set THROWS: swallows error, still returns the list", async () => {
    get.mockResolvedValue(null);
    findMany.mockResolvedValue([DB_ROW] as never);
    set.mockRejectedValue(new Error("redis down"));

    const result = await getCachedSubscriptions("u1");

    expect(result).toEqual([SERIALIZED]);
    expect(console.error).toHaveBeenCalled();
  });
});

// getCachedMonthlyTotal is now a thin wrapper that derives totals from the
// subscription list — it has no cache of its own. We pin the list it gets by
// driving getCachedSubscriptions through a cache hit (redis.get), since an
// intra-module call can't be spied directly in ESM.
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
