import { ensureRedisConnected } from "@/lib/redis";
import { logger } from "@/lib/logger";

const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local current = redis.call("INCR", key)
if current == 1 then
  redis.call("PEXPIRE", key, limit)
end
return current
`;

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
  if (typeof gcTimer.unref === "function") gcTimer.unref();
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
  return { allowed: true, remaining: Math.max(0, max - entry.count) };
}

export type RateLimitResult = { allowed: boolean; remaining: number };

export function createRateLimiter(options: { windowMs: number; max: number }) {
  const prefix = `rl:${options.windowMs}:${options.max}:`;
  let commandDefined = false;
  // Backoff window after a Redis failure so a cold Redis does not cost one
  // connection attempt per request.
  let disabledUntil = 0;
  const FAILURE_BACKOFF_MS = 30_000;

  return async function rateLimit(key: string): Promise<RateLimitResult> {
    const memKey = `${prefix}${key}`;

    if (Date.now() >= disabledUntil) {
      try {
        const redis = await ensureRedisConnected();
        const client = redis as unknown as {
          lepatchRlCheck?: (key: string, ttlMs: number) => Promise<number>;
        };
        if (!commandDefined) {
          redis.defineCommand("lepatchRlCheck", { numberOfKeys: 1, lua: RATE_LIMIT_SCRIPT });
          commandDefined = true;
        }
        if (!client.lepatchRlCheck) throw new Error("rate limit command unavailable");
        const result = await client.lepatchRlCheck(memKey, options.windowMs);
        const allowed = result <= options.max;
        return { allowed, remaining: allowed ? Math.max(0, options.max - result) : 0 };
      } catch (error) {
        disabledUntil = Date.now() + FAILURE_BACKOFF_MS;
        logger.warn("Rate limiter falling back to in-memory store", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return memCheck(memKey, options.max, options.windowMs);
  };
}