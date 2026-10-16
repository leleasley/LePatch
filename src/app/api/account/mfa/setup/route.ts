import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/http";
import { verifyMfaSetupToken } from "@/lib/auth";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { generateSecret, getOtpauthUrl } from "@/lib/totp";
import { logger } from "@/lib/logger";

const schema = z.object({
  setupToken: z.string().min(1),
});

export const dynamic = "force-dynamic";

function getIssuer(): string {
  try {
    const url = process.env.APP_URL;
    if (url) {
      return new URL(url).hostname;
    }
  } catch (err) {
    logger.warn("Failed to parse APP_URL for MFA issuer", { error: err });
  }
  return "LePatch";
}

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();

  try {
    const body = schema.parse(await request.json());
    const payload = await verifyMfaSetupToken(body.setupToken);
    if (!payload) throw new Error("Invalid or expired setup token");

    const issuer = getIssuer();
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { email: true, totpEnabled: true },
    });

    if (!user) throw new Error("Unauthorized");
    if (user.totpEnabled) {
      return NextResponse.json({ error: "MFA is already enabled" }, { status: 400 });
    }

    const secret = generateSecret();
    const otpauthUrl = getOtpauthUrl(user.email, secret, issuer);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(otpauthUrl)}&size=200x200&margin=10`;

    return NextResponse.json({ secret, otpauthUrl, qrCodeUrl, issuer });
  } catch (error) {
    return handleApiError(error);
  }
}
