import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/http";
import { requireSession } from "@/lib/auth";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  password: z.string().min(1),
});

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();

  try {
    const { userId } = await requireSession();
    const body = schema.parse(await request.json());

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, totpEnabled: true },
    });

    if (!user) throw new Error("Unauthorized");
    if (!user.totpEnabled) {
      return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid password" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabled: false,
        totpSecret: null,
        totpBackupCodes: [],
      },
    });

    createAuditLog({ userId, action: "mfa.disabled" }).catch(() => {});return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
