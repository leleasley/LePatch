import Redis from "ioredis";
import { env } from "@/lib/env";

const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local current = redis.call("INCR", key)
if current == 1 then
  redis.call("PEXPIRE", key, window)
end
return current
`;

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  try {
    redis = new Redis(env.redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on("error", () => {});
    return redis;
  } catch {
    return null;
  }
}

// In-memory fallback with TTL-based garbage collection
const memStore = new Map<string, { count: number; resetAt: number }>();
let gcTimer: ReturnType<typeof setInterval> | null = null;

function startMemGc() {
  if (gcTimer) return;
  gcTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memStore) {
      if (entry.resetAt <= now) memStore.delete(key);
    }
    if (memStore.size === 0 && gcTimer) {
      clearInterval(gcTimer);
      gcTimer = null;
    }
  }, 30_000);
}

function memCheck(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const entry = memStore.get(key);
  if (!entry || entry.resetAt <= now) {
    memStore.set(key, { count: 1, resetAt: now + windowMs });
    startMemGc();
    return { allowed: true, remaining: max - 1 };
  }
  if (entry.count >= max) {
    return { allowed: false, remaining: 0 };
  }
  entry.count += 1;
  return { allowed: true, remaining: max - entry.count };
}

export function createRateLimiter(options: { windowMs: number; max: number }) {
  const prefix = `rl:${options.windowMs}:${options.max}:`;
  let scriptSha: string | null = null;
  let redisAvailable = true;

  return async (key: string): Promise<{ allowed: boolean; remaining: number }> => {
    const r = redisAvailable ? getRedis() : null;
    if (r && r.status === "ready") {
      try {
        if (!scriptSha) {
          scriptSha = r.defineCommand("rlcheck", { lua: RATE_LIMIT_SCRIPT }) as unknown as string;
        }
        const result: number = await (r as any).rlcheck(`${prefix}${key}`, options.max, options.windowMs);
        const allowed = result <= options.max;
        return { allowed, remaining: allowed ? Math.max(0, options.max - result) : 0 };
      } catch {
        redisAvailable = false;
      }
    }

    return memCheck(key, options.max, options.windowMs);
  };
}
