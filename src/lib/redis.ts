import { Redis } from "@upstash/redis";

// Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from the environment.
export const redis = Redis.fromEnv();

export const subscriptionsKey = (userId: string) =>
  `user:${userId}:subscriptions`;

/** Base TTL with random jitter to prevent cache avalanche (mass simultaneous expiry). */
export function ttlWithJitter(baseSeconds = 3600, jitterSeconds = 600): number {
  return baseSeconds + Math.floor(Math.random() * jitterSeconds);
}

export async function invalidateUserCache(userId: string) {
  try {
    await redis.del(subscriptionsKey(userId));
  } catch (e) {
    console.error("Cache invalidation failed:", e);
  }
}
