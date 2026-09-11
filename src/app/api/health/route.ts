import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

// Public, unauthenticated, and deliberately uncached: this endpoint exists to
// put real traffic on the two managed services this app depends on. Both idle
// out on their free tiers, on independent clocks — Supabase pauses a project
// that sees no database activity, Upstash archives a Redis database that sees
// no commands — so both are probed here. A scheduled ping hits this route (see
// .github/workflows/keep-alive.yml); nothing else in the app generates traffic
// on a quiet week, since /demo serves hardcoded data and touches neither.
//
// The response must never be served from a cache, and the probes must not read
// through the Redis cache layer: a cached response would keep the endpoint
// green while the services quietly went to sleep.
export const dynamic = "force-dynamic";

// Short TTL so the probe key cannot accumulate or outlive its usefulness.
const CACHE_PROBE_KEY = "health:probe";
const CACHE_PROBE_TTL_SECONDS = 300;

export async function GET() {
  // `status` reflects Postgres and nothing else. That is the original contract
  // of this endpoint and the keep-alive workflow still gates on it.
  let status: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    console.error("Health check failed:", e);
    status = "error";
  }

  // The cache probe is reported separately and deliberately does NOT feed into
  // `status`. Redis is a cache here: every call site already degrades to a
  // direct database read when it is unreachable (see getCachedSubscriptions),
  // so an unreachable cache is not an outage. Letting it turn the health check
  // red would contradict the resilience the rest of the app is built on.
  //
  // A write/read round-trip rather than PING, for two reasons: it is
  // unambiguously the kind of command that counts as database activity, and it
  // exercises the same store -> retrieve path the cache layer actually depends
  // on instead of just proving the host answers.
  //
  // The token is prefixed rather than a bare timestamp on purpose — the Upstash
  // client JSON-parses values on read, so an all-digit string would come back a
  // number and fail the comparison below for the wrong reason.
  let cache: "ok" | "unreachable" = "unreachable";
  try {
    const token = `probe-${Date.now()}`;
    await redis.set(CACHE_PROBE_KEY, token, { ex: CACHE_PROBE_TTL_SECONDS });
    const echoed = await redis.get<string>(CACHE_PROBE_KEY);
    // A mismatch means the round-trip did not actually work; report it as
    // unreachable rather than assuming the write landed.
    cache = echoed === token ? "ok" : "unreachable";
  } catch (e) {
    console.error("Cache probe failed:", e);
  }

  return Response.json(
    { status, cache },
    { status: status === "ok" ? 200 : 500 },
  );
}
