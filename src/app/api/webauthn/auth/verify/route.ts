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
import { webauthnRpId, webauthnAllowedOrigins } from "@/lib/webauthn-origin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const body = await request.json();
    const { flowId, ...response } = body;
    const userId = await verifyPasskeyAuth(flowId, response, webauthnRpId(request), webauthnAllowedOrigins);

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
