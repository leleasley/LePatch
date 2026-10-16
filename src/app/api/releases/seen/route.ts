import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertApiSession, assertCanManageApps } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { markLatestSeen } from "@/lib/releases";

const schema = z.object({ watchedAppId: z.string().min(1) });

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const session = await assertApiSession();
    await assertCanManageApps(session.userId);
    const { watchedAppId } = schema.parse(await request.json());
    const ownership = await prisma.watchedApp.findUnique({ where: { id: watchedAppId, userId: session.userId }, select: { id: true } });
    if (!ownership) throw new Error("Watched app not found");
    const app = await markLatestSeen(watchedAppId);
    return NextResponse.json({ app });
  } catch (error) {
    return handleApiError(error);
  }
}
