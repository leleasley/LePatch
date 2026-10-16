import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().email(),
  role: z.enum(["administrator", "moderator", "user", "restricted"])
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    await requireAdmin();
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) throw new Error("User not found");
    if (target.role === "administrator" && body.role !== "administrator") {
      const admins = await prisma.user.count({ where: { role: "administrator" } });
      if (admins <= 1) throw new Error("At least one admin is required");
    }
    const user = await prisma.user.update({
      where: { id },
      data: { name: body.name, email: body.email.toLowerCase(), role: body.role },
      select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true }
    });
    const currentUser = await getCurrentUser();
    createAuditLog({ userId: currentUser.id, action: "user.updated", target: "User", targetId: id, metadata: { email: body.email } }).catch(() => {});return NextResponse.json({ user });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    await requireAdmin();
    const currentUser = await getCurrentUser();
    const { id } = await params;
    if (id === currentUser.id) throw new Error("You cannot delete your own account");
    const admins = await prisma.user.count({ where: { role: "administrator" } });
    const target = await prisma.user.findUnique({ where: { id } });
    if (target?.role === "administrator" && admins <= 1) throw new Error("At least one admin is required");
    const deletedUser = await prisma.user.delete({ where: { id }, select: { id: true, email: true } });
    createAuditLog({ userId: currentUser.id, action: "user.deleted", target: "User", targetId: id, metadata: { email: deletedUser.email } }).catch(() => {});return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
