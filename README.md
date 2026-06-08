# subscription-tracker

A subscription tracking app with authentication, CRUD, and Redis caching.

**Live demo:** https://subscription-tracker-umber.vercel.app

## Features

- Google OAuth sign-in (NextAuth v5)
- Subscription CRUD with per-user data isolation
- IDOR protection — every read and write is scoped by owner
- Redis caching: cache-aside reads, serialized payloads, and cache-granularity optimization (monthly total derived from the cached list)
- Zod input validation

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
