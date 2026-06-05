import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Stable handle to the mocked client's del(), shared with the module mock below.
const { delMock } = vi.hoisted(() => ({ delMock: vi.fn() }));

// redis.ts calls Redis.fromEnv() at import time; mock the SDK so no env/network.
vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ del: delMock }) },
}));

import { invalidateUserCache, subscriptionsKey } from "@/lib/redis";

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
