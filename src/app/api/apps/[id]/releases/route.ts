import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertApiSession, assertCanManageApps } from "@/lib/auth";
import { handleApiError } from "@/lib/http";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await assertApiSession();
    await assertCanManageApps(session.userId);
    const { id } = await params;
    const app = await prisma.watchedApp.findUnique({ where: { id, userId: session.userId }, select: { id: true } });
    if (!app) throw new Error("Watched app not found");
    const releases = await prisma.release.findMany({
      where: { watchedAppId: id },
      orderBy: [{ publishedAt: "desc" }, { detectedAt: "desc" }]
    });
    return NextResponse.json({ releases });
  } catch (error) {
    return handleApiError(error);
  }
}
