// Concurrent stampede regression: clears the cache and fires N parallel reads,
// then verifies all results match. Re-run after any change to the cache path.
// Run: npx tsx --env-file=.env scripts/test-stampede.ts

import { prisma } from "../src/lib/prisma";
import { redis, subscriptionsKey } from "../src/lib/redis";
import { getCachedSubscriptions } from "../src/lib/queries";

const EMAIL = "marooonfi@gmail.com";
const CONCURRENCY = 10;

async function main() {
  // 1. Find the real user.
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error(`User not found for email: ${EMAIL}`);
  console.log(`User: ${user.id}\n`);

  // 2. Force MISS state: clear the cache key and any leftover lock from a
  //    previous interrupted run.
  const cacheKey = subscriptionsKey(user.id);
  const lockKey = `lock:${cacheKey}`;
  await redis.del(cacheKey, lockKey);
  console.log("Cache cleared — entering MISS state.\n");

  // 3. Fire CONCURRENCY concurrent calls.
  console.log(`Firing ${CONCURRENCY} concurrent getCachedSubscriptions...\n`);
  const start = Date.now();
  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => getCachedSubscriptions(user.id)),
  );
  const elapsed = Date.now() - start;
  console.log(`\nAll ${CONCURRENCY} calls completed in ${elapsed}ms.\n`);

  // 4. Verify all results are identical.
  const json = results.map((r) => JSON.stringify(r));
  const unique = new Set(json);
  if (unique.size !== 1) {
    console.error(`❌ Results differ! Unique shapes: ${unique.size}`);
    process.exit(1);
  }
  console.log(`✅ All ${CONCURRENCY} calls returned identical data.`);
  console.log(`   Subscription count per call: ${results[0].length}`);
  console.log(
    `   Per [stampede-test] log lines above: count = real DB queries.`,
  );
  console.log(`   Expected: 1 (best); ≤2 if lock contention forced a fallback.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
