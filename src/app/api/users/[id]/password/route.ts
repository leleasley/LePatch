import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  password: z.string().min(10),
  adminPassword: z.string().min(1, "Admin password is required"),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = schema.parse(await request.json());

    const adminUser = await prisma.user.findUnique({
      where: { id: admin.id },
      select: { passwordHash: true },
    });
    if (!adminUser || !(await bcrypt.compare(body.adminPassword, adminUser.passwordHash))) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
    }

    await prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(body.password, 12) },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
