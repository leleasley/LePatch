import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertApiSession, assertCanManageApps } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";

const schema = z.object({ releaseId: z.string().min(1) });

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const session = await assertApiSession();
    await assertCanManageApps(session.userId);
    const { releaseId } = schema.parse(await request.json());
    const release = await prisma.release.findUnique({ where: { id: releaseId }, select: { watchedAppId: true } });
    if (!release) throw new Error("Release not found");
    const app = await prisma.watchedApp.findUnique({ where: { id: release.watchedAppId, userId: session.userId }, select: { id: true } });
    if (!app) throw new Error("Watched app not found");
    const updated = await prisma.release.update({ where: { id: releaseId }, data: { ignored: true } });
    await prisma.watchedApp.update({ where: { id: release.watchedAppId }, data: { updateAvailable: false } });
    return NextResponse.json({ release: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
