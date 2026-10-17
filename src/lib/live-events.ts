import { ensureRedisConnected } from "@/lib/redis";
import { logger } from "@/lib/logger";

export type LiveEventType = "release.discovered" | "check.started" | "check.finished";

/** Publish an account-scoped hint after the worker has committed its changes. */
export async function publishLiveEvent(userId: string, type: LiveEventType, appId: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const redis = await Promise.race([
      ensureRedisConnected(),
      new Promise<null>((resolve) => { timeout = setTimeout(() => resolve(null), 250); }),
    ]);
    if (!redis) {
      logger.warn("Live update publish skipped after Redis timeout", { type, appId });
      return;
    }
    await redis.publish(`lepatch:live:${userId}`, JSON.stringify({ type, appId, at: new Date().toISOString() }));
  } catch (error) {
    // Push is an acceleration path. Polling/reconnect revalidation remains the fallback.
    logger.warn("Could not publish live update", error);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
