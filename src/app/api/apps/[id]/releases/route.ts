import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertApiSession, assertCanManageApps } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { parsePagination } from "@/lib/pagination";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await assertApiSession();
    await assertCanManageApps(session.userId);
    const { id } = await params;

    const app = await prisma.watchedApp.findUnique({
      where: { id, userId: session.userId },
      select: { id: true },
    });
    if (!app) throw new Error("Watched app not found");

    // Release bodies are large; the list view only needs metadata. `includeBody`
    // is opt-in for the single-release detail view.
    const { page, perPage, skip, take } = parsePagination(request.nextUrl.searchParams, 25, 50);
    const includeBody = request.nextUrl.searchParams.get("includeBody") === "1";

    const [releases, total] = await Promise.all([
      prisma.release.findMany({
        where: { watchedAppId: id },
        orderBy: [{ publishedAt: "desc" }, { detectedAt: "desc" }],
        skip,
        take,
        ...(includeBody ? {} : { select: RELEASE_LIST_SELECT }),
      }),
      prisma.release.count({ where: { watchedAppId: id } }),
    ]);

    return NextResponse.json({ releases, total, page, perPage });
  } catch (error) {
    return handleApiError(error);
  }
}

const RELEASE_LIST_SELECT = {
  id: true,
  githubReleaseId: true,
  tagName: true,
  name: true,
  htmlUrl: true,
  prerelease: true,
  draft: true,
  releaseType: true,
  changelogSummary: true,
  publishedAt: true,
  detectedAt: true,
  ignored: true,
  notificationSent: true,
} as const;