import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/auth";
import { checkCommitsRateLimit } from "@/lib/api-rate-limit";
import { fetchRepoWithAccess, getCheckRunsForRef, getCombinedStatus, summarizeCheckRuns, summarizeCombinedStatus } from "@/lib/github";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sha: string }> }
) {
  const session = await requirePageSession();
  const limited = await checkCommitsRateLimit(request, "apps-commit-status");
  if (limited) return limited;
  const { id, sha } = await params;
  const app = await prisma.watchedApp.findUnique({
    where: { id },
    select: { id: true, repoOwner: true, repoName: true },
  });
  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  try {
    const summary = await fetchRepoWithAccess(session.userId, async (token) => {
      const checkRuns = await getCheckRunsForRef(app.repoOwner, app.repoName, sha, token);
      if (checkRuns.total_count > 0) {
        return summarizeCheckRuns(checkRuns.check_runs);
      }
      const combined = await getCombinedStatus(app.repoOwner, app.repoName, sha, token);
      return summarizeCombinedStatus(combined);
    });
    return NextResponse.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch status";
    const status = message.toLowerCase().includes("unauthorized") ? 401
      : message.toLowerCase().includes("not found") ? 404
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
