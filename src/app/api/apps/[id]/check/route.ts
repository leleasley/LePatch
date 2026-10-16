import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { assertApiSession, assertCanManageApps } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { getReleaseCheckQueue } from "@/lib/queues";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const session = await assertApiSession();
    await assertCanManageApps(session.userId);
    const { id } = await params;
    const app = await prisma.watchedApp.findUnique({ where: { id, userId: session.userId }, select: { id: true } });
    if (!app) throw new Error("Watched app not found");
    await getReleaseCheckQueue().add("manual-check", { watchedAppId: id, manual: true });
    createAuditLog({ userId: session.userId, action: "app.check_triggered", targetId: id }).catch(() => {});return NextResponse.json({ queued: true });
  } catch (error) {
    return handleApiError(error);
  }
}
