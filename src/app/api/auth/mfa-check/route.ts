import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/http";
import { verifyMfaToken, createSessionForUser, requestIp, requestUserAgent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  tempToken: z.string().min(1),
});

// Intentionally CSRF-exempt: pre-authentication endpoint (no session/CSRF cookie yet).
export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const payload = await verifyMfaToken(body.tempToken);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { totpEnabled: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.totpEnabled) {
      return NextResponse.json({
        mfaRequired: true,
        mfaToken: body.tempToken,
      });
    }

    const response = NextResponse.json({
      mfaRequired: false,
      session: true,
    });

    await createSessionForUser(
      payload.userId,
      response,
      requestUserAgent(request),
      requestIp(request)
    );

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
