import type { BillingCycle } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { redis, subscriptionsKey } from "@/lib/redis";
import { calculateMonthlyTotal } from "@/lib/subscription-utils";

export type SerializedSubscription = {
  id: string;
  name: string;
  amount: number;          // Decimal → number
  currency: string;
  billingCycle: BillingCycle;
  nextBillingDate: string; // Date → ISO string
  startDate: string;
  status: string;
  category: string | null;
};

function serializeSubscription(sub: {
  id: string;
  name: string;
  amount: unknown;  // Prisma Decimal
  currency: string;
  billingCycle: BillingCycle;
  nextBillingDate: Date;
  startDate: Date;
  status: string;
  category: string | null;
}): SerializedSubscription {
  return {
    id: sub.id,
    name: sub.name,
    amount: Number(sub.amount),                    // Decimal → number
    currency: sub.currency,
    billingCycle: sub.billingCycle,
    nextBillingDate: sub.nextBillingDate.toISOString(), // Date → string
    startDate: sub.startDate.toISOString(),
    status: sub.status,
    category: sub.category,
  };
}

export async function getCachedSubscriptions(userId: string): Promise<SerializedSubscription[]> {
  const cacheKey = subscriptionsKey(userId);
  let cached = null;
  try {
    cached = await redis.get<SerializedSubscription[]>(cacheKey);
  } catch (e) {
    console.error('Redis get failed:', e);
  }
  if (cached != null) return cached;

  const subscriptions = await prisma.subscription.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: { nextBillingDate: "asc" },
  });

  const serializedSubscriptions = subscriptions.map(serializeSubscription);
  try {
    await redis.set(cacheKey, serializedSubscriptions, { ex: 3600 });
  } catch (e) {
    console.error('Redis set failed:', e);
  }
  return serializedSubscriptions;
}

export async function getCachedMonthlyTotal(
  userId: string,
): Promise<Record<string, number>> {
  const subscriptions = await getCachedSubscriptions(userId);
  return calculateMonthlyTotal(subscriptions);
}

