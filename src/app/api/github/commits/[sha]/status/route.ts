import { NextRequest, NextResponse } from "next/server";
import { requirePageSession } from "@/lib/auth";
import { checkCommitsRateLimit } from "@/lib/api-rate-limit";
import { fetchRepoWithAccess, getCheckRunsForRef, getCombinedStatus, summarizeCheckRuns, summarizeCombinedStatus } from "@/lib/github";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sha: string }> }
) {
  const session = await requirePageSession();
  const limited = await checkCommitsRateLimit(request, "github-commit-status");
  if (limited) return limited;
  const { searchParams } = request.nextUrl;
  const owner = searchParams.get("owner")?.trim();
  const repo = searchParams.get("repo")?.trim();
  const { sha } = await params;
  if (!owner || !repo || !sha) {
    return NextResponse.json({ error: "owner, repo, and sha are required" }, { status: 400 });
  }

  try {
    const summary = await fetchRepoWithAccess(session.userId, async (token) => {
      const checkRuns = await getCheckRunsForRef(owner, repo, sha, token);
      if (checkRuns.total_count > 0) {
        return summarizeCheckRuns(checkRuns.check_runs);
      }
      const combined = await getCombinedStatus(owner, repo, sha, token);
      return summarizeCombinedStatus(combined);
    });
    return NextResponse.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
