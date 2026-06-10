# ADR-003: Cache Resilience — Stampede, Avalanche, and Penetration

## Status

Accepted

## Context

Introducing a cache (ADR-002) exposes the system to three classic cache
failure modes, each evaluated for this project:

1. **Cache stampede (breakdown)** — when a key expires, multiple concurrent
   requests miss simultaneously and all hit the database for the same data.
2. **Cache avalanche** — many keys written around the same time share the same
   TTL and expire together, causing a burst of database load.
3. **Cache penetration** — requests for data that doesn't exist always miss
   the cache (nothing gets cached) and always reach the database.

## Decision

**Stampede → distributed lock.** On a cache miss, the request attempts to
acquire a lock via Redis `SET NX` (atomic — only one concurrent request
succeeds) with a 10-second expiry. The lock holder queries the database,
writes the cache, and releases the lock in a `finally` block — active release
is the primary mechanism; the 10s expiry is a failsafe against deadlock if the
holder crashes before releasing. Requests that fail to acquire the lock wait
and re-check the cache (5 retries × 50 ms). If retries are exhausted, they
fall back to querying the database directly — but do **not** write the cache,
to avoid interfering with the lock holder's write.

Verified under real concurrency: 10 simultaneous requests on a cold cache
resulted in exactly 1 database query; the other 9 picked up the cached result
during retry.

**Avalanche → TTL jitter.** Cache TTL is randomized (3600 + random(0–600)
seconds) so entries written together don't expire together. Jitter is applied
to cache entries only — **not** to lock keys, because locks don't rely on
expiry as their lifecycle (they are actively released; the expiry is purely a
deadlock failsafe) and only a handful of short-lived locks exist at any
moment, so mass simultaneous expiry cannot occur for them.

**Penetration → deliberately not implemented.** All queries are scoped by a
`userId` taken from the server-side session, so the attack surface for
mass-querying nonexistent keys is small. Countermeasures (caching null
results, or a bloom filter) were considered and deferred — the added
complexity isn't justified by the current risk.

## Alternatives Considered

### Lock-miss strategy: wait-and-retry vs. query the database anyway

Letting lock-losers immediately query the database was considered — it's
simpler, but it defeats the purpose: under N concurrent misses the database
still receives N queries. Wait-and-retry was chosen so that N concurrent
misses produce 1 database query, at the cost of up to 250 ms of added latency
for the waiting requests. The database fallback after retry exhaustion keeps
worst-case availability intact.

### Lock timeout duration

Too short, and a slow lock holder loses the lock mid-query, letting another
request duplicate the work; too long, and a crashed holder blocks everyone
for the full window. 10 seconds comfortably exceeds a normal query (tens of
milliseconds) while bounding the damage of a crash.

## Consequences

**Benefits**

- On expiry of a key, the database receives one query regardless of
  concurrency (verified: 10 concurrent → 1 query).
- Staggered expirations prevent load bursts from synchronized TTLs.

**Costs / Risks**

- Requests that lose the lock incur up to ~250 ms extra latency.
- The lock adds code paths (acquire / retry / fallback / release) that must be
  tested — covered by dedicated unit tests plus a concurrency verification
  script (`scripts/test-stampede.ts`).
- The post-retry fallback can still produce a small number of duplicate
  database queries if the lock holder is unusually slow.

**Honest scoping note:** at this project's current scale (single-user keys),
stampede risk is low. The protection was implemented for correctness, for
headroom as usage grows, and to demonstrate understanding of cache failure
modes — not because the current load demands it.
