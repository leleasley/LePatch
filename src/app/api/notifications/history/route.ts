import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const skip = Math.max(0, parseInt(searchParams.get("skip") || "0", 10));
    const take = Math.min(100, Math.max(1, parseInt(searchParams.get("take") || "50", 10)));

    const [events, total] = await Promise.all([
      prisma.notificationEvent.findMany({
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          release: {
            include: {
              watchedApp: { select: { name: true, repoFullName: true, slug: true } },
            },
          },
          channel: { select: { id: true, type: true, name: true } },
        },
      }),
      prisma.notificationEvent.count(),
    ]);

    return NextResponse.json({ events, total, skip, take });
  } catch (error) {
    return handleApiError(error);
  }
}
