import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/auth";
import { checkCommitsRateLimit } from "@/lib/api-rate-limit";
import { getCommitSnapshot, refreshCommitSnapshot } from "@/lib/commit-snapshot";
import { fetchRepoWithAccess } from "@/lib/github";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requirePageSession();
  const limited = await checkCommitsRateLimit(request, "apps-commits");
  if (limited) return limited;

  const app = await prisma.watchedApp.findUnique({
    where: { id },
    select: { id: true, repoOwner: true, repoName: true, userId: true },
  });
  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const perPage = Math.min(100, Math.max(5, parseInt(searchParams.get("perPage") || "10", 10) || 10));
  const refresh = searchParams.get("refresh") === "1";

  try {
    const snapshot = await fetchRepoWithAccess(session.userId, (token) =>
      refresh
        ? refreshCommitSnapshot(app.repoOwner, app.repoName, page, perPage, token, app.userId)
        : getCommitSnapshot(app.repoOwner, app.repoName, page, perPage, token, app.userId)
    );
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch commits";
    const status = message.toLowerCase().includes("unauthorized") ? 401
      : message.toLowerCase().includes("not found") ? 404
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
