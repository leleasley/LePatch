import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { invalidateAllUserSessions, requireAdmin, revokeAllTrustedDevices, requestIp } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { checkPasswordChangeRateLimit } from "@/lib/api-rate-limit";

const schema = z.object({
  password: z.string().min(10),
  adminPassword: z.string().min(1, "Admin password is required"),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const admin = await requireAdmin();
    const { allowed } = await checkPasswordChangeRateLimit(request, admin.id);
    if (!allowed) {
      return NextResponse.json({ error: "Too many password changes. Try again shortly." }, { status: 429 });
    }

    const { id } = await params;
    const body = schema.parse(await request.json());

    const [adminUser, target] = await Promise.all([
      prisma.user.findUnique({ where: { id: admin.id }, select: { passwordHash: true } }),
      prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } }),
    ]);

    if (!adminUser || !(await bcrypt.compare(body.adminPassword, adminUser.passwordHash))) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
    }
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(body.password, 12) },
    });

    // A reset must actually evict the attacker: sessions and "remember this
    // device" tokens both mint a session without a password.
    await invalidateAllUserSessions(id);
    await revokeAllTrustedDevices(id);

    createAuditLog({
      userId: admin.id,
      action: "user.password_reset",
      target: target.name,
      targetId: target.id,
      metadata: { email: target.email },
      ipAddress: requestIp(request),
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}