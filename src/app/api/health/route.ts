import { prisma } from "@/lib/prisma";

// Public, unauthenticated, and deliberately uncached: this endpoint exists to
// put real traffic on the database. Supabase's free tier pauses a project that
// sees no database activity, which has taken sign-in down more than once, so a
// scheduled ping (see .github/workflows/keep-alive.yml) hits this route to keep
// the project awake. It must therefore never be served from a cache, and must
// not go through the Redis cache layer either — a cached response would keep
// the endpoint green while the database quietly went to sleep.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch (e) {
    console.error("Health check failed:", e);
    return Response.json({ status: "error" }, { status: 500 });
  }
}
