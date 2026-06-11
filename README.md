# subscription-tracker

A subscription tracking app with authentication, CRUD, and Redis caching.

**Live demo:** https://subscription-tracker-umber.vercel.app

## Features

- Google OAuth sign-in (NextAuth v5)
- Subscription CRUD with per-user data isolation
- IDOR protection — every read and write is scoped by owner
- Redis caching: cache-aside reads, serialized payloads, and cache-granularity optimization (monthly total derived from the cached list)
- Zod input validation

## Architecture

System overview — the browser talks only to Next.js on Vercel, which fronts two
managed backends:

```mermaid
flowchart LR
    Browser["Browser"]

    subgraph Vercel["Vercel — Next.js 16"]
        RSC["Server Components<br/>(reads)"]
        SA["Server Actions<br/>(writes)"]
    end

    DB[("Supabase Postgres<br/>via connection pooler")]
    Redis[("Upstash Redis<br/>REST / HTTP")]

    Browser -->|page request| RSC
    Browser -->|form submit| SA
    RSC --> Redis
    RSC --> DB
    SA --> DB
    SA --> Redis
```

Cache-aside data flow — reads are served from Redis when warm; writes mutate
Postgres and drop the cache so the next read repopulates it:

```mermaid
flowchart TB
    subgraph Read["Read (cache-aside)"]
        direction TB
        R0["getCachedSubscriptions"] --> R1{"cache hit?"}
        R1 -->|hit| R2["return cached"]
        R1 -->|miss| R3["query Postgres"]
        R3 --> R4["write cache<br/>(TTL + jitter)"]
        R4 --> R5["return"]
    end

    subgraph Write["Write (mutation)"]
        direction TB
        W0["create / update / delete"] --> W1["mutate Postgres"]
        W1 --> W2["invalidate cache<br/>(DEL key)"]
    end
```

See [ADR-002](docs/adr/002-caching-strategy.md) and [ADR-003](docs/adr/003-cache-resilience.md) for the caching rationale.

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Prisma 7
- Supabase PostgreSQL
- NextAuth v5
- Upstash Redis
- Tailwind CSS
- Vitest
- Vercel

## Status

Deployed and live. Implements authentication, subscription CRUD, and three Redis
caching patterns (cache-aside, serialization, and cache-granularity optimization).

## Architecture Decisions

- [ADR-001: Technology Stack](docs/adr/001-tech-stack.md)
- [ADR-002: Caching Strategy](docs/adr/002-caching-strategy.md)
- [ADR-003: Cache Resilience — Stampede, Avalanche, and Penetration](docs/adr/003-cache-resilience.md)
