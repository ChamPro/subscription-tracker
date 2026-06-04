import { Redis } from "@upstash/redis";

// Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from the environment.
export const redis = Redis.fromEnv();

export const monthlyTotalKey = (userId: string) =>
  `user:${userId}:monthly-total`;
