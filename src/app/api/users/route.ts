import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { getCurrentUser, requireAdmin, requestIp } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(10),
  role: z.enum(["administrator", "moderator", "user", "restricted"]).default("user")
});

export async function GET() {
  try {
    await requireAdmin();
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true }
    });
    return NextResponse.json({ users });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    await requireAdmin();
    const body = createSchema.parse(await request.json());
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash: await bcrypt.hash(body.password, 12),
        role: body.role
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true }
    });
    createAuditLog({ userId: (await getCurrentUser()).id, action: "user.created", target: "User", targetId: user.id, metadata: { email: body.email }, ipAddress: requestIp(request) }).catch(() => {});return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
