import { Redis } from "@upstash/redis";

// Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from the environment.
export const redis = Redis.fromEnv();

export const monthlyTotalKey = (userId: string) =>
  `user:${userId}:monthly-total`;

export const subscriptionsKey = (userId: string) =>
  `user:${userId}:subscriptions`;

export async function invalidateUserCache(userId: string) {
  try {
    await redis.del(monthlyTotalKey(userId), subscriptionsKey(userId));
  } catch (e) {
    console.error("Cache invalidation failed:", e);
  }
}
