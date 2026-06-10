import type { BillingCycle } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { redis, subscriptionsKey, ttlWithJitter } from "@/lib/redis";
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

export async function getCachedSubscriptions(
  userId: string,
): Promise<SerializedSubscription[]> {
  const cacheKey = subscriptionsKey(userId);
  const lockKey = `lock:${cacheKey}`;

  // 1. 先查 cache
  let cached = null;
  try {
    cached = await redis.get<SerializedSubscription[]>(cacheKey);
  } catch (e) {
    console.error("Redis get failed:", e);
  }
  if (cached != null) return cached;

  // 2. MISS：尝试抢锁（NX = 只在 key 不存在时设置成功，EX 10 = 锁超时兜底，防死锁）
  let acquired = null;
  try {
    acquired = await redis.set(lockKey, "1", { nx: true, ex: 10 });
  } catch (e) {
    console.error("Lock acquire failed:", e);
  }

  // 3. 抢到锁：负责查 DB + 写 cache，finally 保证释放锁
  if (acquired != null) {
    try {
      const subscriptions = await prisma.subscription.findMany({
        where: { userId, status: "ACTIVE" },
        orderBy: { nextBillingDate: "asc" },
      });
      const serialized = subscriptions.map(serializeSubscription);

      try {
        await redis.set(cacheKey, serialized, { ex: ttlWithJitter() });
      } catch (e) {
        console.error("Redis set failed:", e);
      }

      return serialized;
    } finally {
      // 不管查 DB 成功还是抛错，一定释放锁
      try {
        await redis.del(lockKey);
      } catch (e) {
        console.error("Lock release failed:", e);
      }
    }
  }

  // 4. 没抢到锁：别人正在查，等一会儿再看 cache（重试 5 次，每次 50ms）
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 50));
    try {
      cached = await redis.get<SerializedSubscription[]>(cacheKey);
    } catch (e) {
      console.error("Redis get failed:", e);
    }
    if (cached != null) return cached;
  }

  // 5. 重试后 cache 仍为空（持锁者太慢或失败）：降级，自己查 DB（不写 cache，避免与持锁者冲突）
  const subscriptions = await prisma.subscription.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: { nextBillingDate: "asc" },
  });
  return subscriptions.map(serializeSubscription);
}

export async function getCachedMonthlyTotal(
  userId: string,
): Promise<Record<string, number>> {
  const subscriptions = await getCachedSubscriptions(userId);
  return calculateMonthlyTotal(subscriptions);
}

