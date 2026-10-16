import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/http";
import { verifyMfaSetupToken, createSessionForUser } from "@/lib/auth";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode, generateBackupCodes, hashBackupCode } from "@/lib/totp";

const schema = z.object({
  code: z.string().length(6),
  secret: z.string().min(1),
  setupToken: z.string().min(1),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();

  try {
    const body = schema.parse(await request.json());
    const payload = await verifyMfaSetupToken(body.setupToken);
    if (!payload) throw new Error("Invalid or expired setup token");

    const valid = verifyTotpCode(body.secret, body.code);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    const plainCodes = generateBackupCodes();
    const hashedCodes = plainCodes.map(hashBackupCode);

    await prisma.user.update({
      where: { id: payload.userId },
      data: {
        totpEnabled: true,
        totpSecret: body.secret,
        totpBackupCodes: hashedCodes,
      },
    });

    const response = NextResponse.json({ success: true, backupCodes: plainCodes });
    await createSessionForUser(payload.userId, response);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
