import { NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/rate-limit";
import { resolveClientIp } from "@/lib/request-ip";

const githubLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const githubHeavyLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const githubCommitsLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const passkeyOptionsLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 20 });
const webhookLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const backupLimiter = createRateLimiter({ windowMs: 60_000, max: 5 });
const passwordChangeLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 10 });

export async function checkGithubRateLimit(request: Request, key: string, heavy = false): Promise<NextResponse | null> {
  const limiter = heavy ? githubHeavyLimiter : githubLimiter;
  return checkRateLimit(request, limiter, key, "Too many GitHub-backed requests. Try again shortly.");
}

export async function checkCommitsRateLimit(request: Request, key: string): Promise<NextResponse | null> {
  return checkRateLimit(request, githubCommitsLimiter, key, "Too many commit requests. Try again shortly.");
}

async function checkRateLimit(
  request: Request,
  limiter: ReturnType<typeof createRateLimiter>,
  key: string,
  message: string
) {
  const ip = resolveClientIp(request);
  const { allowed } = await limiter(`${ip}:${key}`);
  if (allowed) return null;
  return NextResponse.json({ error: message }, { status: 429 });
}

export async function checkPasskeyOptionsRateLimit(request: Request, key: string) {
  return checkRateLimit(request, passkeyOptionsLimiter, key, "Too many passkey setup requests. Try again shortly.");
}

export async function checkWebhookRateLimit(request: Request, key: string) {
  return checkRateLimit(request, webhookLimiter, key, "Too many webhook requests. Try again shortly.");
}

export async function checkBackupRateLimit(request: Request, key: string) {
  return checkRateLimit(request, backupLimiter, key, "Too many backup requests. Try again shortly.");
}

/**
 * Password changes are rate limited per acting user rather than per IP so a
 * shared NAT does not lock everyone out, and an attacker with a stolen admin
 * session cannot brute-force the confirmation password.
 */
export async function checkPasswordChangeRateLimit(request: Request, userId: string) {
  const { allowed, remaining } = await passwordChangeLimiter(`password-change:${userId}`);
  return { allowed, remaining };
}
