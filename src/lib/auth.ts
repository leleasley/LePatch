import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { generateCsrfToken, setCsrfCookie, clearCsrfCookie } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { canBrowseApps, canManageApps, isAdministrator, isModerator } from "@/lib/rbac";

const DEFAULT_SESSION_DURATION_HOURS = 24;
const DEFAULT_TRUSTED_DEVICE_DAYS = 30;
const mfaTokenMaxAge = 5 * 60;
const hostSessionCookie = "__Host-lepatch_session";
const plainSessionCookie = "lepatch_session";
const hostCsrfCookie = "__Host-lepatch_csrf";
const plainCsrfCookie = "lepatch_csrf";
const hostTrustedDeviceCookie = "__Host-lepatch_trusted_mfa";
const plainTrustedDeviceCookie = "lepatch_trusted_mfa";

// --- Cached settings ---

const settingsCache = new Map<string, { value: string; expiresAt: number }>();
const SETTINGS_CACHE_TTL_MS = 60_000;

export function invalidateSettingsCache(key?: string) {
  if (key) {
    settingsCache.delete(key);
  } else {
    settingsCache.clear();
  }
}

async function getCachedSetting(key: string, defaultValue: string): Promise<string> {
  const now = Date.now();
  const cached = settingsCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    const value = row?.value ?? defaultValue;
    settingsCache.set(key, { value, expiresAt: now + SETTINGS_CACHE_TTL_MS });
    return value;
  } catch {
    return defaultValue;
  }
}

export async function getSessionDurationSeconds(): Promise<number> {
  const hours = parseInt(await getCachedSetting("sessionDurationHours", String(DEFAULT_SESSION_DURATION_HOURS)), 10);
  return Math.max(1, Math.min(hours, 168)) * 3600; // min 1h, max 7d (168h)
}

export async function getTrustedDeviceDurationMs(): Promise<number> {
  const days = parseInt(await getCachedSetting("trustedDeviceDays", String(DEFAULT_TRUSTED_DEVICE_DAYS)), 10);
  return Math.max(1, Math.min(days, 90)) * 24 * 60 * 60 * 1000; // min 1d, max 90d
}

function invalidSessionRedirectUrl() {
  return "/auth/invalid-session";
}

type JwtPayload = {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  mfaSetupPending?: boolean;
};

interface LegacyPayload {
  userId: string;
  email?: string;
  exp: number;
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret);
}

function parseDeviceName(ua: string | null | undefined): string | null {
  if (!ua) return null;

  let os = "Unknown";
  if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";
  else if (/CrOS/.test(ua)) os = "ChromeOS";

  let browser = "Unknown";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua) || /Opera/.test(ua)) browser = "Opera";
  else if (/Firefox/.test(ua)) browser = "Firefox";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let device = "";
  if (/iPhone/.test(ua)) device = "iPhone";
  else if (/iPad/.test(ua)) device = "iPad";
  else if (/Android/.test(ua)) device = /Mobile/.test(ua) ? "Phone" : "Tablet";

  const parts = [device, browser, os].filter(Boolean);
  return parts.join(" ") || null;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getSessionAbsoluteExpiry(createdAt: Date, durationSeconds: number): Date {
  return new Date(createdAt.getTime() + durationSeconds * 1000);
}

function needsSessionExpiryNormalization(storedExpiry: Date, absoluteExpiry: Date): boolean {
  return Math.abs(storedExpiry.getTime() - absoluteExpiry.getTime()) > 1000;
}

async function makeJwt(
  sessionId: string,
  userId: string,
  mfaSetupPending = false,
  durationSeconds?: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = durationSeconds ?? await getSessionDurationSeconds();
  return new SignJWT({ sub: userId, jti: sessionId, mfaSetupPending })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + exp)
    .sign(secretKey());
}

async function parseToken(token?: string): Promise<JwtPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      clockTolerance: 30,
    });
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

function parseLegacyToken(token: string): LegacyPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const hmac = crypto.createHmac("sha256", env.sessionSecret);
  hmac.update(body);
  if (signature !== hmac.digest("base64url")) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LegacyPayload;
    if (!payload.userId) return null;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function login(
  email: string,
  password: string,
  response: NextResponse,
  userAgent?: string,
  ip?: string
): Promise<{ mfaRequired?: boolean; mfaToken?: string; mfaSetupRequired?: boolean; mfaSetupToken?: string }> {
  const now = Date.now();
  const attempt = loginAttempts.get(ip || "local");
  if (attempt && attempt.resetAt > now && attempt.count >= 8) {
    throw new Error("Too many login attempts. Try again later.");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!valid || !user) {
    loginAttempts.set(ip || "local", {
      count: attempt && attempt.resetAt > now ? attempt.count + 1 : 1,
      resetAt: now + 15 * 60 * 1000,
    });
    throw new Error("Invalid email or password");
  }

  loginAttempts.delete(ip || "local");

  if (user.totpEnabled) {
    const mfaToken = await createMfaToken(user.id);
    setCsrfCookie(response, generateCsrfToken());
    logger.info("MFA required for login", { userId: user.id });
    return { mfaRequired: true, mfaToken };
  }

  if (!user.totpEnabled) {
    const mfaSetupToken = await createMfaSetupToken(user.id);
    setCsrfCookie(response, generateCsrfToken());
    logger.info("MFA setup required for login", { userId: user.id });
    return { mfaSetupRequired: true, mfaSetupToken };
  }

  const tokenHash = crypto.randomBytes(32).toString("hex");
  const sessionDurationSeconds = await getSessionDurationSeconds();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(now + sessionDurationSeconds * 1000),
      userAgent: userAgent || null,
      ipAddress: ip || null,
      deviceName: parseDeviceName(userAgent),
      lastUsedAt: new Date(),
    },
  });

  const jwt = await makeJwt(session.id, user.id, false, sessionDurationSeconds);
  setSessionCookie(response, jwt, sessionDurationSeconds);
  setCsrfCookie(response, generateCsrfToken());

  logger.info("User logged in", { userId: user.id, sessionId: session.id });

  return {};
}

export async function getSession() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(hostSessionCookie)?.value || cookieStore.get(plainSessionCookie)?.value;
  if (!raw) return null;

  const payload = await parseToken(raw);

  if (!payload) {
    const legacy = parseLegacyToken(raw);
    if (!legacy) return null;
    return legacyGetSession(raw, legacy);
  }

  const dbSession = await prisma.session.findUnique({
    where: { id: payload.jti },
  });

  if (!dbSession) {
    return null;
  }

  const sessionDurationSeconds = await getSessionDurationSeconds();
  const absoluteExpiry = getSessionAbsoluteExpiry(dbSession.createdAt, sessionDurationSeconds);

  if (absoluteExpiry < new Date()) {
    if (dbSession) {
      await prisma.session.deleteMany({ where: { id: dbSession.id } }).catch(() => {});
    }
    return null;
  }

  // Throttle lastUsedAt writes: session reads happen on every page + API poll,
  // so only touch the row when it is stale or expiry needs normalizing.
  const lastUsedStale =
    !dbSession.lastUsedAt || Date.now() - dbSession.lastUsedAt.getTime() > 5 * 60 * 1000;
  const needsExpiryFix = needsSessionExpiryNormalization(dbSession.expiresAt, absoluteExpiry);
  if (lastUsedStale || needsExpiryFix) {
    await prisma.session
      .update({
        where: { id: dbSession.id },
        data: {
          ...(lastUsedStale ? { lastUsedAt: new Date() } : {}),
          ...(needsExpiryFix ? { expiresAt: absoluteExpiry } : {}),
        },
      })
      .catch(() => {});
  }

  return {
    userId: payload.sub,
    sessionId: dbSession.id,
    mfaSetupPending: payload.mfaSetupPending === true,
  };
}

async function legacyGetSession(
  raw: string,
  payload: LegacyPayload
): Promise<{ userId: string; sessionId: string; mfaSetupPending?: boolean } | null> {
  const tokenHash = hashToken(raw);
  let dbSession = await prisma.session.findUnique({ where: { tokenHash } });

  if (!dbSession) {
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return null;
    if (payload.email && user.email !== payload.email) return null;
    dbSession = await prisma.session.create({
      data: {
        userId: payload.userId,
        tokenHash,
        expiresAt: new Date(payload.exp || Date.now() + (await getSessionDurationSeconds()) * 1000),
        lastUsedAt: new Date(),
      },
    });
  }

  const sessionDurationSeconds = await getSessionDurationSeconds();
  const absoluteExpiry = getSessionAbsoluteExpiry(dbSession.createdAt, sessionDurationSeconds);

  if (absoluteExpiry < new Date()) {
    await prisma.session.deleteMany({ where: { id: dbSession.id } }).catch(() => {});
    return null;
  }

  // Throttle lastUsedAt writes (see getSession above).
  const legacyLastUsedStale =
    !dbSession.lastUsedAt || Date.now() - dbSession.lastUsedAt.getTime() > 5 * 60 * 1000;
  const legacyNeedsExpiryFix = needsSessionExpiryNormalization(dbSession.expiresAt, absoluteExpiry);
  if (legacyLastUsedStale || legacyNeedsExpiryFix) {
    await prisma.session
      .update({
        where: { id: dbSession.id },
        data: {
          ...(legacyLastUsedStale ? { lastUsedAt: new Date() } : {}),
          ...(legacyNeedsExpiryFix ? { expiresAt: absoluteExpiry } : {}),
        },
      })
      .catch(() => {});
  }

  return { userId: payload.userId, sessionId: dbSession.id };
}

export async function createSessionForUser(
  userId: string,
  response: NextResponse,
  userAgent?: string,
  ip?: string,
  mfaSetupPending = false
): Promise<void> {
  const now = Date.now();
  const sessionDurationSeconds = await getSessionDurationSeconds();
  const tokenHash = crypto.randomBytes(32).toString("hex");

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(now + sessionDurationSeconds * 1000),
      userAgent: userAgent || null,
      ipAddress: ip || null,
      deviceName: parseDeviceName(userAgent),
      lastUsedAt: new Date(),
    },
  });

  const jwt = await makeJwt(session.id, userId, mfaSetupPending, sessionDurationSeconds);
  setSessionCookie(response, jwt, sessionDurationSeconds);
  setCsrfCookie(response, generateCsrfToken());

  logger.info("Passkey session created", { userId, sessionId: session.id });
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    logger.error("requireSession failed: no valid session found");
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requirePageSession() {
  const session = await getSession();
  if (!session) {
    logger.error("requirePageSession failed: no valid session found");
    redirect(invalidSessionRedirectUrl());
  }
  return session;
}

export function setSessionCookie(response: NextResponse, token: string, durationSeconds?: number) {
  const maxAge = durationSeconds ?? 86400;
  const base = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge };
  response.cookies.set(hostSessionCookie, token, { ...base, secure: true });
  response.cookies.set(plainSessionCookie, token, { ...base, secure: false });
}

export function clearSessionCookie(response: NextResponse) {
  const base = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 0 };
  response.cookies.set(hostSessionCookie, "", { ...base, secure: true });
  response.cookies.set(plainSessionCookie, "", { ...base, secure: false });
  clearCsrfCookie(response);
}

export async function assertApiSession() {
  try {
    return await requireSession();
  } catch {
    throw new Error("Unauthorized");
  }
}

export async function getCurrentUser() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      theme: true,
      passwordEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) throw new Error("Unauthorized");
  const { isGithubLinked } = await import("@/lib/github-link-cache");
  const githubLinked = await isGithubLinked(user.id);
  return { ...user, githubLinked };
}

export const getCurrentPageUser = cache(async () => {
  const session = await requirePageSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      theme: true,
      passwordEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) redirect(invalidSessionRedirectUrl());
  return user;
});

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!isAdministrator(user.role)) throw new Error("Forbidden");
  return user;
}

export async function requirePageAdmin() {
  const user = await getCurrentPageUser();
  if (!isAdministrator(user.role)) redirect("/forbidden");
  return user;
}

export async function requireModerator() {
  const user = await getCurrentUser();
  if (!isModerator(user.role)) throw new Error("Forbidden");
  return user;
}

export async function requirePageModerator() {
  const user = await getCurrentPageUser();
  if (!isModerator(user.role)) redirect("/forbidden");
  return user;
}

export async function assertCanManageApps(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || !canManageApps(user.role)) throw new Error("Forbidden");
}

export async function requirePageCanManageApps() {
  const user = await getCurrentPageUser();
  if (!canManageApps(user.role)) redirect("/apps/search");
  return user;
}

export async function assertCanBrowseApps(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || !canBrowseApps(user.role)) throw new Error("Forbidden");
}

export async function requirePageCanBrowseApps() {
  const user = await getCurrentPageUser();
  if (!canBrowseApps(user.role)) redirect("/forbidden");
  return user;
}

export function requestIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

export function requestUserAgent(request: NextRequest) {
  return request.headers.get("user-agent") || undefined;
}

export async function invalidateSession(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export async function invalidateAllUserSessions(userId: string, excludeSessionId?: string) {
  if (excludeSessionId) {
    await prisma.session.deleteMany({
      where: { userId, id: { not: excludeSessionId } },
    });
  } else {
    await prisma.session.deleteMany({ where: { userId } });
  }
}

export async function getActiveSessions(userId: string) {
  const sessionDurationSeconds = await getSessionDurationSeconds();
  const sessions = await prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      deviceName: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
  });

  await Promise.all(
    sessions.map((session) => {
      const absoluteExpiry = getSessionAbsoluteExpiry(session.createdAt, sessionDurationSeconds);
      if (!needsSessionExpiryNormalization(session.expiresAt, absoluteExpiry)) {
        return Promise.resolve();
      }
      return prisma.session
        .update({
          where: { id: session.id },
          data: { expiresAt: absoluteExpiry },
        })
        .catch(() => {});
    })
  );

  return sessions
    .map((session) => ({
      ...session,
      expiresAt: getSessionAbsoluteExpiry(session.createdAt, sessionDurationSeconds),
    }))
    .filter((session) => session.expiresAt > new Date());
}

export async function getCurrentSessionId() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(hostSessionCookie)?.value || cookieStore.get(plainSessionCookie)?.value;
  if (!raw) return null;
  const payload = await parseToken(raw);
  return payload?.jti || null;
}

export async function getCsrfTokenFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(hostCsrfCookie)?.value || cookieStore.get(plainCsrfCookie)?.value || null;
}

// --- MFA setup temp token ---

const mfaSetupTokenMaxAge = 10 * 60;

export async function createMfaSetupToken(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: userId, type: "mfa-setup-pending" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + mfaSetupTokenMaxAge)
    .sign(secretKey());
}

export async function verifyMfaSetupToken(
  token: string
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      clockTolerance: 30,
    });
    if (payload.type !== "mfa-setup-pending") return null;
    return { userId: payload.sub as string };
  } catch {
    return null;
  }
}

// --- MFA temp token ---

export async function createMfaToken(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: userId, type: "mfa-pending" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + mfaTokenMaxAge)
    .sign(secretKey());
}

export async function verifyMfaToken(
  token: string
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      clockTolerance: 30,
    });
    if (payload.type !== "mfa-pending") return null;
    return { userId: payload.sub as string };
  } catch {
    return null;
  }
}

// --- MFA rate limiting ---

const mfaAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkMfaRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = mfaAttempts.get(userId);
  if (entry && entry.resetAt > now && entry.count >= 5) {
    return false;
  }
  return true;
}

export function recordMfaAttempt(userId: string): void {
  const now = Date.now();
  const entry = mfaAttempts.get(userId);
  if (entry && entry.resetAt > now) {
    entry.count += 1;
  } else {
    mfaAttempts.set(userId, { count: 1, resetAt: now + 15 * 60 * 1000 });
  }
}

export function clearMfaAttempts(userId: string): void {
  mfaAttempts.delete(userId);
}

// --- Trusted device helpers ---

export function setTrustedDeviceCookie(response: NextResponse, token: string, durationMs: number) {
  const maxAge = Math.floor(durationMs / 1000);
  const base = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge };
  response.cookies.set(hostTrustedDeviceCookie, token, { ...base, secure: true });
  response.cookies.set(plainTrustedDeviceCookie, token, { ...base, secure: false });
}

export function clearTrustedDeviceCookie(response: NextResponse) {
  const base = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 0 };
  response.cookies.set(hostTrustedDeviceCookie, "", { ...base, secure: true });
  response.cookies.set(plainTrustedDeviceCookie, "", { ...base, secure: false });
}

export async function createTrustedDevice(
  userId: string,
  userAgent?: string
): Promise<{ token: string; expiresAt: Date }> {
  const durationMs = await getTrustedDeviceDurationMs();
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + durationMs);

  await prisma.trustedDevice.create({
    data: {
      userId,
      tokenHash,
      name: parseDeviceName(userAgent),
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function verifyTrustedDevice(
  token: string,
  expectedUserId: string
): Promise<{ valid: boolean; deviceId?: string }> {
  const tokenHash = hashToken(token);
  const device = await prisma.trustedDevice.findUnique({
    where: { tokenHash },
  });

  if (!device) return { valid: false };
  if (device.userId !== expectedUserId) return { valid: false };
  if (device.expiresAt < new Date()) {
    await prisma.trustedDevice.deleteMany({ where: { id: device.id } }).catch(() => {});
    return { valid: false };
  }

  return { valid: true, deviceId: device.id };
}

export async function getTrustedDeviceFromRequest(
  request: NextRequest,
  userId: string
): Promise<{ valid: boolean; deviceId?: string }> {
  const raw = request.cookies.get(hostTrustedDeviceCookie)?.value || request.cookies.get(plainTrustedDeviceCookie)?.value;
  if (!raw) return { valid: false };
  return verifyTrustedDevice(raw, userId);
}

export async function revokeTrustedDevice(deviceId: string) {
  await prisma.trustedDevice.deleteMany({ where: { id: deviceId } });
}

export async function revokeAllTrustedDevices(userId: string) {
  await prisma.trustedDevice.deleteMany({ where: { userId } });
}

export async function getActiveTrustedDevices(userId: string) {
  return prisma.trustedDevice.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      expiresAt: true,
    },
  });
}
