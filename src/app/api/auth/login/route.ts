import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  login,
  requestIp,
  requestUserAgent,
  verifyMfaToken,
  verifyTrustedDevice,
  createSessionForUser,
} from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const dynamic = "force-dynamic";

const loginRateLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

function copyCookie(
  res: NextResponse,
  cookieJar: NextResponse,
  name: string
) {
  const c = cookieJar.cookies.get(name);
  if (c) {
    res.cookies.set(c.name, c.value, {
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite as "lax" | "strict" | "none" | undefined,
      path: c.path,
      maxAge: c.maxAge,
    });
  }
}

// Intentionally CSRF-exempt: this is a pre-authentication endpoint (no session/CSRF cookie yet).
export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());

    const { allowed } = await loginRateLimiter(requestIp(request));
    if (!allowed) {
      return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
    }

    const cookieJar = NextResponse.json({ _placeholder: true });
    const result = await login(
      body.email,
      body.password,
      cookieJar,
      requestUserAgent(request),
      requestIp(request)
    );

    if (result.mfaRequired && result.mfaToken) {
      // Check if this user has a valid trusted device cookie
      const mfaPayload = await verifyMfaToken(result.mfaToken);
      if (mfaPayload) {
        const trustedRaw =
          request.cookies.get("__Host-lepatch_trusted_mfa")?.value ||
          request.cookies.get("lepatch_trusted_mfa")?.value;
        if (trustedRaw) {
          const { valid } = await verifyTrustedDevice(
            trustedRaw,
            mfaPayload.userId
          );
          if (valid) {
            // Trusted device found — skip MFA, create session directly
            const res = NextResponse.json({ ok: true });
            await createSessionForUser(
              mfaPayload.userId,
              res,
              requestUserAgent(request),
              requestIp(request)
            );
            copyCookie(res, cookieJar, "__Host-lepatch_csrf");
            copyCookie(res, cookieJar, "lepatch_csrf");
    if (!result.mfaSetupRequired) {
      const user = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } });
      if (user) {
        createAuditLog({ userId: user.id, action: "user.login", ipAddress: requestIp(request) }).catch(() => {});}
    }

    return res;
          }
        }
      }

      // No trusted device — require MFA
      const res = NextResponse.json({
        mfaRequired: true,
        mfaToken: result.mfaToken,
      });
      copyCookie(res, cookieJar, "__Host-lepatch_csrf");
      copyCookie(res, cookieJar, "lepatch_csrf");
      return res;
    }

    // Build the real response, copying all cookies that login() set
    const payload = result.mfaSetupRequired
      ? { mfaSetupRequired: true, mfaSetupToken: result.mfaSetupToken }
      : { ok: true };

    const res = NextResponse.json(payload);

    for (const name of [
      "__Host-lepatch_session",
      "lepatch_session",
      "__Host-lepatch_csrf",
      "lepatch_csrf",
    ]) {
      copyCookie(res, cookieJar, name);
    }

    return res;
  } catch (error) {
    return handleApiError(error);
  }
}
