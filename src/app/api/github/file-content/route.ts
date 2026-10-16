import { NextRequest, NextResponse } from "next/server";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { checkGithubRateLimit } from "@/lib/api-rate-limit";
import { getIntegrationSettingValue } from "@/lib/integration-secrets";
import { getUserGithubToken } from "@/lib/github";

async function getGithubToken(): Promise<string | null> {
  try {
    return await getIntegrationSettingValue("github", "token");
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await assertApiSession();
    const limited = await checkGithubRateLimit(request, "github-file-content");
    if (limited) return limited;
    const owner = request.nextUrl.searchParams.get("owner")?.trim();
    const repo = request.nextUrl.searchParams.get("repo")?.trim();
    const path = request.nextUrl.searchParams.get("path")?.trim();

    if (!owner || !repo || !path) {
      throw new Error("owner, repo, and path are required");
    }

    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const fetchRaw = async (bearer?: string | null) =>
      fetch(
        `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/HEAD/${encodedPath}`,
        {
          headers: {
            Accept: "text/plain",
            "User-Agent": "LePatch",
            ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          },
          next: { revalidate: 0 },
        }
      );
    let response = await fetchRaw(await getGithubToken());
    if (response.status === 404) {
      // Private/sponsor-gated repos need the viewer's own token for raw files.
      const userToken = await getUserGithubToken(session.userId);
      if (userToken) response = await fetchRaw(userToken);
    }

    if (response.status === 404) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      return NextResponse.json({ error: "GitHub rate limit exceeded" }, { status: 429 });
    }
    if (!response.ok) {
      return NextResponse.json({ error: `GitHub request failed (${response.status})` }, { status: response.status });
    }

    const content = await response.text();
    return NextResponse.json({ content });
  } catch (error) {
    return handleApiError(error);
  }
}
