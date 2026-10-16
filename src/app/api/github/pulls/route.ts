import { NextRequest, NextResponse } from "next/server";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { fetchRepoWithAccess, getPullRequests } from "@/lib/github";
import { checkGithubRateLimit } from "@/lib/api-rate-limit";

export async function GET(request: NextRequest) {
  try {
    const session = await assertApiSession();
    const limited = await checkGithubRateLimit(request, "github-pulls");
    if (limited) return limited;
    const owner = request.nextUrl.searchParams.get("owner")?.trim();
    const repo = request.nextUrl.searchParams.get("repo")?.trim();
    const state = (request.nextUrl.searchParams.get("state")?.trim() || "open") as "open" | "closed" | "all";
    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") || "1", 10) || 1);

    if (!owner || !repo) {
      throw new Error("owner and repo are required");
    }

    if (!["open", "closed", "all"].includes(state)) {
      throw new Error("state must be 'open', 'closed', or 'all'");
    }

    const { items, totalCount } = await fetchRepoWithAccess(session.userId, (token) =>
      getPullRequests(owner, repo, state, page, 20, token)
    );
    return NextResponse.json({ pulls: items, totalCount, page });
  } catch (error) {
    return handleApiError(error);
  }
}
