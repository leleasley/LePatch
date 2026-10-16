import { NextRequest, NextResponse } from "next/server";
import { assertApiSession } from "@/lib/auth";
import { searchRepos } from "@/lib/github";
import { checkGithubRateLimit } from "@/lib/api-rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await assertApiSession();
    const limited = await checkGithubRateLimit(request, "github-search", true);
    if (limited) return limited;
    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [], totalCount: 0, page: 1 });
    }
    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") || "1", 10) || 1);
    const { items, totalCount } = await searchRepos(q, page);
    return NextResponse.json({ results: items, totalCount, page });
  } catch {
    return NextResponse.json({ results: [], totalCount: 0, page: 1 });
  }
}
