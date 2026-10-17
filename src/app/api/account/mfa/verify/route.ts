import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/http";
import { verifyMfaSetupToken, createSessionForUser } from "@/lib/auth";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode, generateBackupCodes, hashBackupCode } from "@/lib/totp";
import { createAuditLog } from "@/lib/audit";

const schema = z.object({
  code: z.string().length(6),
  setupToken: z.string().min(1),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();

  try {
    const body = schema.parse(await request.json());
    const payload = await verifyMfaSetupToken(body.setupToken);
    if (!payload) throw new Error("Invalid or expired setup token");

    const pending = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { totpSecret: true, totpEnabled: true },
    });
    if (!pending?.totpSecret) {
      return NextResponse.json({ error: "Start MFA setup again" }, { status: 400 });
    }
    if (pending.totpEnabled) {
      return NextResponse.json({ error: "MFA is already enabled" }, { status: 400 });
    }

    const valid = verifyTotpCode(pending.totpSecret, body.code);
    if (!valid) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
    }

    const plainCodes = generateBackupCodes();
    const hashedCodes = plainCodes.map(hashBackupCode);

    await prisma.user.update({
      where: { id: payload.userId },
      data: {
        totpEnabled: true,
        totpBackupCodes: hashedCodes,
      },
    });

    createAuditLog({
      userId: payload.userId,
      action: "mfa.setup",
      target: "totp",
    }).catch(() => {});

    const response = NextResponse.json({ success: true, backupCodes: plainCodes });
    await createSessionForUser(payload.userId, response);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
