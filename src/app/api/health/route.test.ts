import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock both services so we can force either one to fail independently — the
// whole point of this route is that those two failures stay separable.
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn() },
}));
vi.mock("@/lib/redis", () => ({
  redis: { set: vi.fn(), get: vi.fn() },
}));

import { GET } from "./route";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const queryRaw = vi.mocked(prisma.$queryRaw);
const set = vi.mocked(redis.set);
const get = vi.mocked(redis.get);

/** Make the Redis probe succeed by echoing back whatever was written. */
function echoingCache() {
  let stored: unknown;
  set.mockImplementation(async (_key: string, value: unknown) => {
    stored = value;
    return "OK";
  });
  get.mockImplementation(async () => stored);
}

beforeEach(() => {
  vi.clearAllMocks();
  queryRaw.mockResolvedValue([{ "?column?": 1 }]);
  echoingCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("both services healthy: 200 with status ok and cache ok", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok", cache: "ok" });
  });

  it("actually touches both services — a green response is never a no-op", async () => {
    await GET();

    expect(queryRaw).toHaveBeenCalled();
    expect(set).toHaveBeenCalled();
    expect(get).toHaveBeenCalled();
  });

  it("writes the probe key with a TTL so it cannot accumulate", async () => {
    await GET();

    const [key, , options] = set.mock.calls[0];
    expect(key).toBe("health:probe");
    expect(options).toEqual({ ex: 300 });
  });

  it("probe token is not all digits — the client JSON-parses on read", async () => {
    await GET();

    const [, value] = set.mock.calls[0];
    expect(typeof value).toBe("string");
    expect(value as string).not.toMatch(/^\d+$/);
  });

  // The load-bearing case: Redis is a cache, so losing it must not be reported
  // as an outage, and must not stop the Postgres half from being kept alive.
  it("redis THROWS: still 200, status stays ok, only cache degrades", async () => {
    set.mockRejectedValue(new Error("upstash unreachable"));

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: "ok",
      cache: "unreachable",
    });
    expect(console.error).toHaveBeenCalled();
  });

  it("redis round-trip MISMATCHES: reports unreachable rather than assuming the write landed", async () => {
    get.mockResolvedValue("some other value");

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: "ok",
      cache: "unreachable",
    });
  });

  it("postgres THROWS: 500 with status error", async () => {
    queryRaw.mockRejectedValue(new Error("db paused"));

    const res = await GET();

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      status: "error",
      cache: "ok",
    });
    expect(console.error).toHaveBeenCalled();
  });

  // A paused database must not also silence the cache probe: the workflow needs
  // both signals to say which service actually went away.
  it("postgres THROWS: the cache is still probed", async () => {
    queryRaw.mockRejectedValue(new Error("db paused"));

    await GET();

    expect(set).toHaveBeenCalled();
  });

  it("both services down: 500 with both fields failing", async () => {
    queryRaw.mockRejectedValue(new Error("db paused"));
    set.mockRejectedValue(new Error("upstash unreachable"));

    const res = await GET();

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      status: "error",
      cache: "unreachable",
    });
  });
});
