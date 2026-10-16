import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

const csrfHeaderName = "X-CSRF-Token";

function secure(): boolean {
  return env.trustProxy || env.appUrl.startsWith("https://");
}

function csrfCookieName(): string {
  return secure() ? "__Host-lepatch_csrf" : "lepatch_csrf";
}

function altCsrfCookieName(): string {
  return secure() ? "lepatch_csrf" : "__Host-lepatch_csrf";
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function setCsrfCookie(response: NextResponse, token: string) {
  const maxAge = 60 * 60 * 24 * 7;
  const base = { httpOnly: false, sameSite: "strict" as const, path: "/", maxAge };
  response.cookies.set("__Host-lepatch_csrf", token, { ...base, secure: true });
  response.cookies.set("lepatch_csrf", token, { ...base, secure: false });
}

export function clearCsrfCookie(response: NextResponse) {
  const base = { httpOnly: false, sameSite: "strict" as const, path: "/", maxAge: 0 };
  response.cookies.set("__Host-lepatch_csrf", "", { ...base, secure: true });
  response.cookies.set("lepatch_csrf", "", { ...base, secure: false });
}

export function validateCsrf(request: Request): boolean {
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(request.method)) return true;

  const headerToken = request.headers.get(csrfHeaderName) || "";
  const cookies = request.headers.get("cookie") || "";

  const csrfCookie = parseCookie(cookies, csrfCookieName()) || parseCookie(cookies, altCsrfCookieName());

  if (!headerToken || !csrfCookie) return false;

  const a = Buffer.from(headerToken);
  const b = Buffer.from(csrfCookie);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseCookie(cookies: string, name: string): string | null {
  for (const part of cookies.split("; ")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq);
    if (key === name) return part.slice(eq + 1);
  }
  return null;
}

export function rejectedCsrfResponse() {
  return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
}
