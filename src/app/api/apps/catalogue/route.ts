import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { checkGithubRateLimit } from "@/lib/api-rate-limit";

export async function GET(request: NextRequest) {
  try {
    await assertApiSession();
    const limited = await checkGithubRateLimit(request, "apps-catalogue");
    if (limited) return limited;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const sort = searchParams.get("sort") || "name";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get("perPage") || "20")));

    const where: Record<string, unknown> = { isActive: true };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { repoFullName: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }
    if (category) where.category = category;

    const orderBy: Record<string, string>[] = [];
    switch (sort) {
      case "stars":
        orderBy.push({ githubStars: "desc" });
        break;
      case "popular":
        orderBy.push({ installCount: "desc" });
        break;
      case "recent":
        orderBy.push({ createdAt: "desc" });
        break;
      case "updated":
        orderBy.push({ latestReleaseAt: "desc" });
        break;
      default:
        orderBy.push({ name: "asc" });
    }
    orderBy.push({ name: "asc" });

    const [entries, total] = await Promise.all([
      prisma.catalogueEntry.findMany({
        where,
        orderBy,
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      prisma.catalogueEntry.count({ where }),
    ]);

    return NextResponse.json({ apps: entries, total, page, perPage });
  } catch (error) {
    return handleApiError(error);
  }
}
