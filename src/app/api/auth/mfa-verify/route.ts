import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/http";
import {
  verifyMfaToken,
  createSessionForUser,
  createTrustedDevice,
  setTrustedDeviceCookie,
  getTrustedDeviceDurationMs,
  checkMfaRateLimit,
  recordMfaAttempt,
  clearMfaAttempts,
  requestIp,
  requestUserAgent,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode, verifyBackupCode } from "@/lib/totp";

const schema = z.union([
  z.object({
    mfaToken: z.string().min(1),
    code: z.string().length(6),
    rememberDevice: z.boolean().optional(),
  }),
  z.object({
    mfaToken: z.string().min(1),
    backupCode: z.string().min(1),
    rememberDevice: z.boolean().optional(),
  }),
]);

export const dynamic = "force-dynamic";

// Intentionally CSRF-exempt: pre-authentication endpoint (no session/CSRF cookie yet).
export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const payload = await verifyMfaToken(body.mfaToken);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired MFA token" },
        { status: 401 }
      );
    }

    if (!checkMfaRateLimit(payload.userId)) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        totpEnabled: true,
        totpSecret: true,
        totpBackupCodes: true,
        id: true,
      },
    });

    if (!user || !user.totpEnabled || !user.totpSecret) {
      return NextResponse.json(
        { error: "MFA is not enabled" },
        { status: 400 }
      );
    }

    let verified = false;

    if ("code" in body) {
      verified = verifyTotpCode(user.totpSecret, body.code);
    } else {
      const result = verifyBackupCode(body.backupCode, user.totpBackupCodes);
      if (result.valid) {
        verified = true;
        const newHashes = user.totpBackupCodes.filter((_, i) => i !== result.index);
        await prisma.user.update({
          where: { id: payload.userId },
          data: { totpBackupCodes: newHashes },
        });
      }
    }

    recordMfaAttempt(payload.userId);

    if (!verified) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    clearMfaAttempts(payload.userId);

    const response = NextResponse.json({ success: true });

    await createSessionForUser(
      payload.userId,
      response,
      requestUserAgent(request),
      requestIp(request)
    );

    // Handle "Remember this device"
    if (body.rememberDevice) {
      const { token } = await createTrustedDevice(
        payload.userId,
        requestUserAgent(request)
      );
      const durationMs = await getTrustedDeviceDurationMs();
      setTrustedDeviceCookie(response, token, durationMs);
    }

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
