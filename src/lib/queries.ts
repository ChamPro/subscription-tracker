import { prisma } from "@/lib/prisma";
import { redis, monthlyTotalKey } from "@/lib/redis";
import { calculateMonthlyTotal } from "@/lib/subscription-utils";

export async function getCachedMonthlyTotal(
  userId: string,
): Promise<Record<string, number>> {
  const cacheKey = monthlyTotalKey(userId);
  let cached = null;
  try {
    cached = await redis.get<Record<string, number>>(cacheKey);
  } catch (e) {
    console.error('Redis get failed:', e);
  }
  if (cached != null) return cached;


  const subscriptions = await prisma.subscription.findMany({
    where: { userId, status: "ACTIVE" },
  });

  const total = calculateMonthlyTotal(subscriptions);
  try {
    await redis.set(cacheKey, total, { ex: 3600 });
  } catch (e) {
    console.error('Redis set failed:', e);
  }
  return total;
}
