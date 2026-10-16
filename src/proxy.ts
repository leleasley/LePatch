import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { setSecurityHeaders } from "@/lib/security-headers";
import { env } from "@/lib/env";

const protectedPrefixes = ["/dashboard", "/apps", "/notifications", "/profile", "/admin", "/users"];

type SessionState = {
  valid: boolean;
  mfaSetupPending: boolean;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret);
}

async function sessionState(request: NextRequest): Promise<SessionState> {
  const token =
    request.cookies.get("__Host-lepatch_session")?.value ||
    request.cookies.get("lepatch_session")?.value;

  if (!token) return { valid: false, mfaSetupPending: false };

  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      clockTolerance: 30,
    });

    return {
      valid: Boolean(payload.sub && payload.jti),
      mfaSetupPending: payload.mfaSetupPending === true,
    };
  } catch {
    return { valid: false, mfaSetupPending: false };
  }
}

function clearAuthCookies(response: NextResponse) {
  const base = { path: "/", maxAge: 0 };
  response.cookies.set("__Host-lepatch_session", "", { ...base, httpOnly: true, sameSite: "lax", secure: true });
  response.cookies.set("lepatch_session", "", { ...base, httpOnly: true, sameSite: "lax", secure: false });
  response.cookies.set("__Host-lepatch_csrf", "", { ...base, httpOnly: false, sameSite: "strict", secure: true });
  response.cookies.set("lepatch_csrf", "", { ...base, httpOnly: false, sameSite: "strict", secure: false });
}

function redirectFromRequest(request: NextRequest, pathname: string, params?: Record<string, string>) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hadSessionCookie = Boolean(
    request.cookies.get("__Host-lepatch_session")?.value ||
      request.cookies.get("lepatch_session")?.value
  );
  const session = await sessionState(request);
  const hasSession = session.valid;
  const isHttps = env.trustProxy || (request.headers.get("x-forwarded-proto") === "https");
  const nonce = crypto.randomUUID().replace(/-/g, "");

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/assets") ||
    pathname === "/favicon.ico" ||
    pathname === "/apple-touch-icon.png"
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    const apiResponse = NextResponse.next();
    const requestId = crypto.randomUUID().slice(0, 12);
    apiResponse.headers.set("X-Request-Id", requestId);
    setSecurityHeaders(apiResponse, { isHttps, includeNoStore: false });
    return apiResponse;
  }

  const isSessionResetRoute = pathname === "/session-reset";
  const isMfaRoute = pathname === "/mfa";
  const isSetupRoute = pathname === "/setup" || pathname.startsWith("/setup/");
  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (hadSessionCookie && !hasSession && !isSessionResetRoute && !isMfaRoute && pathname !== "/login" && !isSetupRoute) {
    if (isProtected || pathname === "/") {
      const url = redirectFromRequest(request, "/session-reset", { reason: "invalid-session" });

      const response = NextResponse.redirect(url);
      clearAuthCookies(response);
      setSecurityHeaders(response, { isHttps, nonce });
      return response;
    }
  }

  let response: NextResponse;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  if (session.mfaSetupPending && pathname !== "/setup/mfa") {
    response = NextResponse.redirect(redirectFromRequest(request, "/setup/mfa"));
  } else if (pathname === "/setup/mfa") {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else if (pathname === "/setup" && hasSession) {
    response = NextResponse.redirect(redirectFromRequest(request, "/dashboard"));
  } else if (pathname === "/setup") {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else if (pathname === "/login") {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else if (pathname === "/mfa") {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else if (pathname === "/") {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else {
    if (isProtected && !hasSession) {
      response = NextResponse.redirect(redirectFromRequest(request, "/login"));
    } else {
      response = NextResponse.next({ request: { headers: requestHeaders } });
    }
  }

  if (hadSessionCookie && !hasSession) {
    clearAuthCookies(response);
  }

  setSecurityHeaders(response, { isHttps, nonce });
  return response;
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/mfa",
    "/api/:path*",
    "/setup",
    "/setup/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/apps",
    "/apps/:path*",
    "/notifications",
    "/notifications/:path*",
    "/profile",
    "/profile/:path*",
    "/admin",
    "/admin/:path*",
    "/users",
    "/users/:path*",
  ],
};
