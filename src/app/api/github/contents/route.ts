import { NextRequest, NextResponse } from "next/server";
import { requirePageSession } from "@/lib/auth";
import { fetchRepoWithAccess, getRepoContentsAtPath } from "@/lib/github";
import { checkGithubRateLimit } from "@/lib/api-rate-limit";

export async function GET(request: NextRequest) {
  const session = await requirePageSession();
  const limited = await checkGithubRateLimit(request, "github-contents");
  if (limited) return limited;
  const { searchParams } = request.nextUrl;
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const path = searchParams.get("path") || "";

  if (!owner || !repo) {
    return NextResponse.json({ error: "owner and repo are required" }, { status: 400 });
  }

  try {
    const files = await fetchRepoWithAccess(session.userId, (token) =>
      getRepoContentsAtPath(owner, repo, path, token)
    );
    return NextResponse.json({ files });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch contents";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
