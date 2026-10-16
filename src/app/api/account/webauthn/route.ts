import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, getCurrentSessionId } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const sessionId = await getCurrentSessionId();

    const passkeys = await prisma.passkeyCredential.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        credentialId: true,
        transports: true,
        deviceName: true,
        counter: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    return NextResponse.json({ passkeys, sessionId });
  } catch (error) {
    return handleApiError(error);
  }
}

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function DELETE(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const user = await getCurrentUser();
    const body = deleteSchema.parse(await request.json());
    const passkey = await prisma.passkeyCredential.findUnique({
      where: { id: body.id },
    });
    if (!passkey || passkey.userId !== user.id) {
      throw new Error("Passkey not found");
    }
    await prisma.passkeyCredential.delete({ where: { id: body.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
