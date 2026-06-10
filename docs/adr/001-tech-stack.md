# ADR-001: Technology Stack

## Status
Accepted

## Context

This project is a full-stack subscription tracking application: users sign in, 
manage their subscriptions (create / edit / delete), and see an at-a-glance 
dashboard with their monthly spend. Beyond basic CRUD, a core goal is to treat 
caching as a first-class concern — the read-heavy dashboard is a natural fit for 
demonstrating real caching patterns.

The stack was chosen around three principles:

1. **Single-developer maintainability** — favor tools that do several things 
   well over assembling many separate pieces, to minimize what has to be built 
   and maintained.
2. **Serverless compatibility** — the app is deployed to a serverless platform, 
   where functions start and stop frequently, so persistent connections are a 
   poor fit. Prefer stateless / HTTP-based or connection-pooled services.
3. **End-to-end type safety** — types should flow from the database schema all 
   the way to the UI, so that mismatches are caught at compile time rather than 
   at runtime.

## Decision

| Layer | Choice | Role |
|---|---|---|
| Framework | Next.js 16 (App Router) | Full-stack framework — frontend + backend in one |
| Language | TypeScript | Type safety across the whole stack |
| ORM | Prisma 7 | Type-safe database access + migrations |
| Database | Supabase (PostgreSQL) | Managed Postgres with a serverless-friendly connection pooler |
| Auth | NextAuth v5 | OAuth sign-in + session management |
| Cache | Upstash Redis | Serverless-friendly Redis over HTTP |
| Styling | Tailwind CSS | Utility-first styling |
| Testing | Vitest | Unit tests |
| Hosting | Vercel | Zero-config deployment for Next.js |

## Alternatives Considered

### Full-stack Next.js vs. separate frontend + backend
A split architecture (e.g. a React SPA with a standalone NestJS/Express backend) 
was considered. Next.js full-stack was chosen because Server Components can query 
the database directly and Server Actions handle mutations without a hand-written 
REST layer — eliminating a large amount of glue code. For a single-developer 
project, maintaining one codebase instead of two is a significant simplification. 
The trade-off is tighter coupling to the Next.js model, which is acceptable here.

### Prisma vs. raw SQL vs. another ORM
Raw SQL (maximum control, but no type safety and error-prone) and lighter ORMs 
were considered. Prisma was chosen for its type-safe query API — types are 
generated from the schema and flow into the editor — plus first-class migration 
tooling and a mature ecosystem. The trade-off surfaced in practice: Prisma 7's 
driver-adapter model adds deployment complexity (the generated client is 
gitignored and must be regenerated during the build). This was a known, 
manageable cost.

### Database session vs. JWT
For auth, stateless JWTs were considered. Database-backed sessions were chosen 
because they can be invalidated instantly (deleting the session row logs the 
user out immediately) and permission changes take effect right away. A JWT is 
self-contained and can't be revoked before it expires without extra machinery. 
The cost is a database lookup per request, which is acceptable for this app's 
scale and the security benefit.

### NextAuth vs. rolling our own auth
Building authentication from scratch was considered and rejected. Auth has many 
security-sensitive details — OAuth handshake, CSRF protection, secure cookie 
configuration, token handling — each easy to get wrong. NextAuth packages these 
as battle-tested defaults, including OAuth providers out of the box.

### Supabase vs. self-hosted Postgres vs. Vercel Postgres
A self-managed Postgres (requires provisioning and operations) and Vercel 
Postgres (smaller free tier) were considered. Supabase was chosen for its free 
tier, fully managed hosting, and — importantly for serverless — its connection 
pooler, which prevents connection exhaustion when many short-lived functions 
connect concurrently.

## Consequences

**Benefits**
- Rapid development: one framework spans frontend and backend, and managed 
  services remove operational overhead.
- End-to-end type safety: TypeScript + Prisma carry types from the schema to the 
  UI, catching mismatches at compile time.
- Zero-cost, low-friction deployment: pushing to the main branch triggers an 
  automatic redeploy on Vercel.
- Serverless-appropriate choices throughout (Upstash REST, Supabase pooler).

**Costs / Risks**
- Bleeding-edge versions: Next.js 16 and Prisma 7 are recent, and their newer 
  behaviors surfaced real friction (e.g. Prisma 7's driver adapter, and the need 
  to run `prisma generate` during the build for deployment to succeed).
- Vendor coupling: tied to the Vercel + Supabase + Upstash ecosystem. Acceptable 
  here, but migrating away would take effort.
- Per-request database lookup for session validation (a deliberate trade-off).

## Future Considerations
Decisions specific to caching are documented separately in ADR-002.
