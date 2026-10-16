import { NextRequest, NextResponse } from "next/server";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { fetchRepoWithAccess, getIssueComments } from "@/lib/github";
import { checkGithubRateLimit } from "@/lib/api-rate-limit";

export async function GET(request: NextRequest) {
  try {
    const session = await assertApiSession();
    const limited = await checkGithubRateLimit(request, "github-issue-comments");
    if (limited) return limited;
    const owner = request.nextUrl.searchParams.get("owner")?.trim();
    const repo = request.nextUrl.searchParams.get("repo")?.trim();
    const issueNumber = parseInt(request.nextUrl.searchParams.get("issueNumber") || "0", 10);

    if (!owner || !repo || !issueNumber) {
      throw new Error("owner, repo, and issueNumber are required");
    }

    const comments = await fetchRepoWithAccess(session.userId, (token) =>
      getIssueComments(owner, repo, issueNumber, token)
    );
    return NextResponse.json({ comments });
  } catch (error) {
    return handleApiError(error);
  }
}
