import { NextRequest, NextResponse } from "next/server";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { fetchRepoWithAccess, githubFetch } from "@/lib/github";
import { checkGithubRateLimit } from "@/lib/api-rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await assertApiSession();
    const limited = await checkGithubRateLimit(request, "github-issue-detail");
    if (limited) return limited;

    const owner = request.nextUrl.searchParams.get("owner")?.trim();
    const repo = request.nextUrl.searchParams.get("repo")?.trim();
    const issueNumber = request.nextUrl.searchParams.get("issueNumber")?.trim();

    if (!owner || !repo || !issueNumber) {
      throw new Error("owner, repo, and issueNumber are required");
    }

    const num = parseInt(issueNumber, 10);
    if (isNaN(num)) throw new Error("issueNumber must be a number");

    const [issue, comments] = await fetchRepoWithAccess(session.userId, (token) =>
      Promise.all([
        githubFetch<{
        id: number;
        number: number;
        title: string;
        body: string | null;
        state: "open" | "closed";
        html_url: string;
        created_at: string;
        updated_at: string;
        closed_at: string | null;
        user: { login: string; avatar_url: string; html_url: string } | null;
        labels: Array<{ name: string; color: string }>;
        comments: number;
        assignees: Array<{ login: string; avatar_url: string }>;
        milestone: { title: string; number: number } | null;
        pull_request: unknown | null;
      }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${num}`, undefined, token),
      githubFetch<Array<{
        id: number;
        body: string;
        created_at: string;
        updated_at: string;
        user: { login: string; avatar_url: string; html_url: string } | null;
      }>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${num}/comments?per_page=100`, undefined, token),
      ])
    );

    return NextResponse.json({ issue, comments });
  } catch (error) {
    return handleApiError(error);
  }
}
