import { env } from "@/lib/env";

/**
 * Resolve the client IP for rate limiting and audit logging.
 *
 * `X-Forwarded-For` / `X-Real-IP` are attacker-controlled unless we know a
 * trusted proxy sits in front of us. When `TRUST_PROXY` is not enabled we ignore
 * both headers, which means every request behind the same proxy shares one
 * bucket — the safe failure mode for a self-hosted app.
 */
export function resolveClientIp(request: Request | { headers: Headers }): string {
  if (env.trustProxy) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  }
  return "local";
}