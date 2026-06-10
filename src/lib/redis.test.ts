import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Stable handle to the mocked client's del(), shared with the module mock below.
const { delMock } = vi.hoisted(() => ({ delMock: vi.fn() }));

// redis.ts calls Redis.fromEnv() at import time; mock the SDK so no env/network.
vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ del: delMock }) },
}));

import {
  invalidateUserCache,
  subscriptionsKey,
  ttlWithJitter,
} from "@/lib/redis";

beforeEach(() => {
  vi.clearAllMocks();
  delMock.mockResolvedValue(2);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("invalidateUserCache", () => {
  it("deletes the subscriptions key", async () => {
    await invalidateUserCache("u1");

    expect(delMock).toHaveBeenCalledWith(subscriptionsKey("u1"));
  });

  it("redis.del THROWS: swallows the error and logs it (never rejects)", async () => {
    delMock.mockRejectedValue(new Error("redis down"));

    await expect(invalidateUserCache("u1")).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalled();
  });
});

describe("ttlWithJitter", () => {
  it("stays within [base, base + jitter) on every call", () => {
    for (let i = 0; i < 50; i++) {
      const ttl = ttlWithJitter();
      expect(ttl).toBeGreaterThanOrEqual(3600);
      expect(ttl).toBeLessThan(4200);
    }
  });

  it("actually jitters — not all calls return the same value", () => {
    const values = new Set<number>();
    for (let i = 0; i < 50; i++) {
      values.add(ttlWithJitter());
    }
    // 50 samples drawn from 600 buckets — odds of all-identical are ~(1/600)^49.
    expect(values.size).toBeGreaterThan(1);
  });

  it("honors custom base and jitter parameters", () => {
    for (let i = 0; i < 20; i++) {
      const ttl = ttlWithJitter(100, 10);
      expect(ttl).toBeGreaterThanOrEqual(100);
      expect(ttl).toBeLessThan(110);
    }
  });
});
