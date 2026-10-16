import { NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/rate-limit";

const githubLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const githubHeavyLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const githubCommitsLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const packageSearchLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });
const passkeyOptionsLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 20 });
const remoteOpsLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });
const webhookLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const backupLimiter = createRateLimiter({ windowMs: 60_000, max: 5 });

function requestIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

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
  const ip = requestIp(request);
  const { allowed } = await limiter(`${ip}:${key}`);
  if (allowed) return null;
  return NextResponse.json({ error: message }, { status: 429 });
}

export async function checkPackageSearchRateLimit(request: Request, key: string) {
  return checkRateLimit(request, packageSearchLimiter, key, "Too many package search requests. Try again shortly.");
}

export async function checkPasskeyOptionsRateLimit(request: Request, key: string) {
  return checkRateLimit(request, passkeyOptionsLimiter, key, "Too many passkey setup requests. Try again shortly.");
}

export async function checkRemoteOpsRateLimit(request: Request, key: string) {
  return checkRateLimit(request, remoteOpsLimiter, key, "Too many remote operation requests. Try again shortly.");
}

export async function checkWebhookRateLimit(request: Request, key: string) {
  return checkRateLimit(request, webhookLimiter, key, "Too many webhook requests. Try again shortly.");
}

export async function checkBackupRateLimit(request: Request, key: string) {
  return checkRateLimit(request, backupLimiter, key, "Too many backup requests. Try again shortly.");
}
