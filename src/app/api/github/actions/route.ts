import { NextRequest, NextResponse } from "next/server";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { fetchRepoWithAccess, getWorkflowRuns } from "@/lib/github";
import { checkGithubRateLimit } from "@/lib/api-rate-limit";

export async function GET(request: NextRequest) {
  try {
    const session = await assertApiSession();
    const limited = await checkGithubRateLimit(request, "github-actions");
    if (limited) return limited;
    const owner = request.nextUrl.searchParams.get("owner")?.trim();
    const repo = request.nextUrl.searchParams.get("repo")?.trim();
    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") || "1", 10) || 1);

    if (!owner || !repo) {
      throw new Error("owner and repo are required");
    }

    const { runs, total } = await fetchRepoWithAccess(session.userId, (token) =>
      getWorkflowRuns(owner, repo, page, 20, token)
    );
    return NextResponse.json({ runs, total, page });
  } catch (error) {
    return handleApiError(error);
  }
}
