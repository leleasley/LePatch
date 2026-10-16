import Redis from "ioredis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

let redisClient: Redis | null = null;
let loggedConnectionError = false;

export function getRedis() {
  if (redisClient) return redisClient;

  redisClient = new Redis(env.redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  redisClient.on("error", (error) => {
    if (loggedConnectionError) return;
    loggedConnectionError = true;
    logger.warn("Redis client error", { error: error.message });
  });

  redisClient.on("ready", () => {
    loggedConnectionError = false;
  });

  return redisClient;
}

export async function ensureRedisConnected() {
  const redis = getRedis();
  if (redis.status === "ready" || redis.status === "connecting" || redis.status === "connect") {
    return redis;
  }
  await redis.connect();
  return redis;
}
