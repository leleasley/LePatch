import { NextRequest, NextResponse } from "next/server";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { fetchRepoWithAccess, getBranches } from "@/lib/github";
import { checkGithubRateLimit } from "@/lib/api-rate-limit";

export async function GET(request: NextRequest) {
  try {
    const session = await assertApiSession();
    const limited = await checkGithubRateLimit(request, "github-branches");
    if (limited) return limited;
    const owner = request.nextUrl.searchParams.get("owner")?.trim();
    const repo = request.nextUrl.searchParams.get("repo")?.trim();

    if (!owner || !repo) {
      throw new Error("owner and repo are required");
    }

    const branches = await fetchRepoWithAccess(session.userId, (token) =>
      getBranches(owner, repo, token)
    );
    return NextResponse.json({ branches });
  } catch (error) {
    return handleApiError(error);
  }
}
