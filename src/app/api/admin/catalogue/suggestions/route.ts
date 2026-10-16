import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModerator } from "@/lib/auth";
import { handleApiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    await requireModerator();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("perPage") || "50")));

    const where: Record<string, unknown> = {};
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { repoFullName: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const [suggestions, total] = await Promise.all([
      prisma.catalogueSuggestion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          submitter: { select: { id: true, name: true, email: true } },
          reviewer: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.catalogueSuggestion.count({ where }),
    ]);

    return NextResponse.json({ suggestions, total, page, perPage });
  } catch (error) {
    return handleApiError(error);
  }
}
