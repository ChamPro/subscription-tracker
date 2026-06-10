# ADR-002: Caching Strategy

## Status

Accepted

## Context

The dashboard displays a user's monthly total and their full subscription 
list. This data changes infrequently — users don't edit their subscriptions 
often — yet every page refresh or new login triggers a database read to fetch 
and recompute it. The read demand far exceeds the write demand, so repeatedly 
hitting the database for data that rarely changes is wasteful. A cache is 
needed to reduce the cost of retrieving this data on every request.

## Decision

Use **Upstash Redis** with the **cache-aside pattern** to cache each user's 
subscription list. The monthly total is **derived from the cached list** 
rather than cached independently.

On read: verify the user's identity via their session, then query Redis using 
a key composed of the user ID and a fixed suffix (e.g. `user:{id}:subscriptions`). 
On a cache hit, return the cached value. On a cache miss — or if the Redis call 
throws — fall back to a database query, serialize the result, write it to the 
cache, and return it.

On write (create / update / delete): **delete** the cache entry rather than 
updating it, so the next read repopulates it from the database.

Cache entries carry a **TTL of 1 hour** as a safety net: if invalidation is 
ever missed due to a bug, stale data self-corrects within an hour rather than 
persisting indefinitely.

## Alternatives Considered

### Delete cache vs. update cache on writes

Updating the cache in place on every write was considered. **Deleting** was 
chosen instead because:

- Under concurrent writes, "update cache" risks writing a stale value into the 
  cache due to timing races; deleting guarantees the next read pulls fresh data 
  from the database.
- It is lazy — if the data is never read again, no effort is spent recomputing 
  a cache value that no one needs.

### Derived total vs. independent cache for the monthly total

Caching the monthly total under its own key was considered. **Deriving it from 
the cached subscription list** was chosen because every time the total is 
needed, the full list is also needed — so computing the total from the 
already-cached list avoids a second, redundant database query and an extra key 
to invalidate.

The trade-off: if a read-only "total-only" view existed (e.g. a nav-bar badge 
showing just the monthly total without the list), caching the total 
independently would be better, to avoid loading the entire list just to compute 
a single number. Given the current access pattern (the dashboard always needs 
both), derivation is the better fit.

### Upstash REST vs. traditional Redis (TCP)

Traditional Redis clients rely on persistent TCP connections, which don't suit 
a serverless environment (Vercel), where functions start and stop frequently — 
connections get exhausted under concurrency. Upstash's REST API works over 
stateless HTTP, avoiding connection-pool exhaustion. (This mirrors the 
rationale for using Supabase's connection pooler over a direct connection.)

## Consequences

**Benefits**

- Reduced database load: repeated dashboard reads are served from Redis instead 
  of the database.
- Faster reads on cache hits.
- Cache-granularity optimization: one cached entity (the list) serves both the 
  list and the derived total.

**Costs / Risks**

- An additional layer to maintain: every write path must remember to invalidate 
  the cache. A missed invalidation produces stale data — mitigated by the 
  1-hour TTL.
- Cache and database can be briefly inconsistent: stale data may be served for 
  up to the TTL window if an invalidation is missed.
- Redis failures must not break the app: all cache reads/writes are wrapped in 
  try-catch so that a Redis outage degrades performance (falls back to the 
  database) rather than availability.
- Complex objects must be serialized before caching: Prisma `Decimal` and 
  `Date` types don't survive a JSON round-trip unchanged, so the data is 
  converted to a JSON-friendly shape (numbers and ISO strings) before being 
  stored, keeping the cache path and database path type-consistent.

## Future Considerations

Additional caching patterns (e.g. cache stampede protection) may be introduced 
as separate ADRs building on this foundation.
