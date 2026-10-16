import { NextRequest, NextResponse } from "next/server";
import { requirePageSession } from "@/lib/auth";
import { checkCommitsRateLimit } from "@/lib/api-rate-limit";
import { getCommitSnapshot, refreshCommitSnapshot } from "@/lib/commit-snapshot";
import { fetchRepoWithAccess } from "@/lib/github";

export async function GET(request: NextRequest) {
  const session = await requirePageSession();
  const limited = await checkCommitsRateLimit(request, "github-commits");
  if (limited) return limited;
  const { searchParams } = request.nextUrl;
  const owner = searchParams.get("owner")?.trim();
  const repo = searchParams.get("repo")?.trim();
  if (!owner || !repo) {
    return NextResponse.json({ error: "owner and repo are required" }, { status: 400 });
  }
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const perPage = Math.min(100, Math.max(5, parseInt(searchParams.get("perPage") || "10", 10) || 10));
  const refresh = searchParams.get("refresh") === "1";

  try {
    const snapshot = await fetchRepoWithAccess(session.userId, (token) =>
      refresh
        ? refreshCommitSnapshot(owner, repo, page, perPage, token, session.userId)
        : getCommitSnapshot(owner, repo, page, perPage, token, session.userId)
    );
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch commits";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
