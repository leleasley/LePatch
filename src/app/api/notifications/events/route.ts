import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const take = Math.min(100, Math.max(1, parseInt(searchParams.get("take") || "50", 10)));

    const [events, total, pending, failed, sent] = await Promise.all([
      prisma.notificationEvent.findMany({
        take,
        orderBy: { createdAt: "desc" },
        include: {
          release: {
            include: {
              watchedApp: { select: { id: true, name: true, repoFullName: true, slug: true } },
            },
          },
          channel: { select: { id: true, type: true, name: true } },
        },
      }),
      prisma.notificationEvent.count(),
      prisma.notificationEvent.count({ where: { status: "pending" } }),
      prisma.notificationEvent.count({ where: { status: "failed" } }),
      prisma.notificationEvent.count({ where: { status: "sent" } }),
    ]);

    return NextResponse.json({ events, total, pending, failed, sent });
  } catch (error) {
    return handleApiError(error);
  }
}
