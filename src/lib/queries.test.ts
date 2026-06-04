import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Redis + Prisma so we can force failures and avoid real infra.
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn() },
  monthlyTotalKey: (userId: string) => `user:${userId}:monthly-total`,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { subscription: { findMany: vi.fn() } },
}));

import { getCachedMonthlyTotal } from "@/lib/queries";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

const get = vi.mocked(redis.get);
const set = vi.mocked(redis.set);
const findMany = vi.mocked(prisma.subscription.findMany);

// One active MONTHLY $10 USD subscription -> { USD: 10 }
const SAMPLE = [{ amount: 10, currency: "USD", billingCycle: "MONTHLY" }];

beforeEach(() => {
  vi.clearAllMocks();
  // Silence the intentional console.error in the catch branches.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getCachedMonthlyTotal", () => {
  it("cache HIT: returns cached value, never touches DB", async () => {
    get.mockResolvedValue({ USD: 42 });

    const result = await getCachedMonthlyTotal("u1");

    expect(result).toEqual({ USD: 42 });
    expect(findMany).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("cache MISS: computes from DB and writes cache with 1h TTL", async () => {
    get.mockResolvedValue(null);
    findMany.mockResolvedValue(SAMPLE as never);

    const result = await getCachedMonthlyTotal("u1");

    expect(result).toEqual({ USD: 10 });
    expect(findMany).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith(
      "user:u1:monthly-total",
      { USD: 10 },
      { ex: 3600 },
    );
  });

  it("redis.get THROWS: swallows error, falls back to DB", async () => {
    get.mockRejectedValue(new Error("redis down"));
    findMany.mockResolvedValue(SAMPLE as never);

    const result = await getCachedMonthlyTotal("u1");

    expect(result).toEqual({ USD: 10 });
    expect(findMany).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalled();
  });

  it("redis.set THROWS: swallows error, still returns the total", async () => {
    get.mockResolvedValue(null);
    findMany.mockResolvedValue(SAMPLE as never);
    set.mockRejectedValue(new Error("redis down"));

    const result = await getCachedMonthlyTotal("u1");

    expect(result).toEqual({ USD: 10 });
    expect(console.error).toHaveBeenCalled();
  });
});
