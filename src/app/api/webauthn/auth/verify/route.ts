import { NextRequest, NextResponse } from "next/server";
import {
  createMfaToken,
  createMfaSetupToken,
  createSessionForUser,
  verifyTrustedDevice,
  requestIp,
  requestUserAgent,
} from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { verifyPasskeyAuth } from "@/lib/webauthn";
import { prisma } from "@/lib/prisma";

function rpId(req: NextRequest): string {
  return (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(":")[0];
}

function origin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  return `${proto}://${host}`;
}

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const body = await request.json();
    const { flowId, ...response } = body;
    const userId = await verifyPasskeyAuth(flowId, response, rpId(request), origin(request));

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totpEnabled: true },
    });

    if (user?.totpEnabled) {
      // Check for a valid trusted device before requiring MFA
      const trustedRaw =
        request.cookies.get("__Host-lepatch_trusted_mfa")?.value ||
        request.cookies.get("lepatch_trusted_mfa")?.value;
      if (trustedRaw) {
        const { valid } = await verifyTrustedDevice(trustedRaw, userId);
        if (valid) {
          const res = NextResponse.json({ ok: true });
          await createSessionForUser(
            userId,
            res,
            requestUserAgent(request),
            requestIp(request)
          );
          return res;
        }
      }

      const mfaToken = await createMfaToken(userId);
      return NextResponse.json({ mfaRequired: true, mfaToken });
    }

    const mfaSetupToken = await createMfaSetupToken(userId);
    return NextResponse.json({ ok: true, mfaSetupRequired: true, mfaSetupToken });
  } catch (error) {
    return handleApiError(error);
  }
}
