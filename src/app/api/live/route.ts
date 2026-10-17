import Redis from "ioredis";
import { assertApiSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { handleApiError } from "@/lib/http";
import { logger } from "@/lib/logger";
import { ensureRedisConnected } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await assertApiSession();
    const redis = await ensureRedisConnected();
    const connectionKey = `lepatch:live:connections:${session.userId}`;
    const connectionCount = await redis.incr(connectionKey);
    await redis.expire(connectionKey, 120);
    if (connectionCount > 5) {
      await redis.decr(connectionKey);
      return new Response("Too many live connections", { status: 429, headers: { "Retry-After": "30", "Cache-Control": "no-store" } });
    }
    const subscriber = new Redis(env.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
    });
    let released = false;
    const releaseSlot = async () => {
      if (released) return;
      released = true;
      try { await redis.decr(connectionKey); } catch (error) { logger.warn("Could not release live connection slot", error); }
    };
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (value: string) => controller.enqueue(encoder.encode(value));
        try {
          await subscriber.connect();
          await subscriber.subscribe(`lepatch:live:${session.userId}`);
          subscriber.on("message", (_channel, message) => {
            try {
              const event = JSON.parse(message) as { type?: string; appId?: string; at?: string };
              if (!["release.discovered", "check.started", "check.finished"].includes(event.type || "")) return;
              send(`event: ${event.type}\ndata: ${JSON.stringify({ appId: event.appId, at: event.at })}\n\n`);
            } catch {
              // Ignore malformed pub/sub messages; they cannot affect account data.
            }
          });
          send(": connected\n\n");
        } catch (error) {
          logger.warn("Live update stream could not subscribe", error);
          send("retry: 10000\nevent: unavailable\ndata: {}\n\n");
          await releaseSlot();
          subscriber.disconnect();
          controller.close();
          return;
        }

        const heartbeat = setInterval(() => {
          try { send(": keepalive\n\n"); } catch { clearInterval(heartbeat); }
          void redis.expire(connectionKey, 120).catch((error) => logger.warn("Could not renew live connection slot", error));
        }, 25_000);
        const close = () => {
          clearInterval(heartbeat);
          void releaseSlot();
          void subscriber.unsubscribe().then(() => subscriber.quit()).catch((error) => {
            logger.warn("Could not close live update subscription cleanly", error);
            subscriber.disconnect();
          });
          try { controller.close(); } catch { /* already closed */ }
        };
        request.signal.addEventListener("abort", close, { once: true });
      },
      cancel() {
        void releaseSlot();
        void subscriber.quit().catch(() => undefined);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
