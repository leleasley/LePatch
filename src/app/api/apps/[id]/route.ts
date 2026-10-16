import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertApiSession, assertCanManageApps } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";

const patchSchema = z.object({
  includePrereleases: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  checkIntervalMinutes: z.number().int().min(1).max(10080).optional()
});

const userOwnedWhere = (userId: string, id: string) => ({ id, userId });

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await assertApiSession();
    await assertCanManageApps(session.userId);
    const { id } = await params;
    const { searchParams } = new URL(_.url);
    const take = Math.min(100, Math.max(1, parseInt(searchParams.get("take") || "20", 10)));
    const app = await prisma.watchedApp.findUnique({
      where: userOwnedWhere(session.userId, id),
      include: { releases: { orderBy: [{ publishedAt: "desc" }, { detectedAt: "desc" }], take } }
    });
    if (!app) throw new Error("Watched app not found");
    return NextResponse.json({ app });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const session = await assertApiSession();
    await assertCanManageApps(session.userId);
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const app = await prisma.watchedApp.findUnique({ where: userOwnedWhere(session.userId, id) });
    if (!app) throw new Error("Watched app not found");
    const updated = await prisma.watchedApp.update({ where: { id }, data: body });
    return NextResponse.json({ app: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const session = await assertApiSession();
    await assertCanManageApps(session.userId);
    const { id } = await params;
    const app = await prisma.watchedApp.findUnique({ where: userOwnedWhere(session.userId, id), select: { name: true } });
    if (!app) throw new Error("Watched app not found");
    await prisma.watchedApp.delete({ where: { id } });
    createAuditLog({ userId: session.userId, action: "app.deleted", target: app.name, targetId: id }).catch(() => {});return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
