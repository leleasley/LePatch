import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";

export type GitHubUserRepoDetail = {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  description: string | null;
  html_url: string;
  homepage: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  default_branch: string;
  private: boolean;
  fork: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  topics?: string[];
  license: { name: string } | null;
  visibility: string;
};

export async function GET(request: NextRequest) {
  try {
    const session = await assertApiSession();
    const owner = request.nextUrl.searchParams.get("owner")?.trim();
    const repo = request.nextUrl.searchParams.get("repo")?.trim();

    if (!owner || !repo) {
      return NextResponse.json({ error: "owner and repo are required" }, { status: 400 });
    }

    const link = await prisma.gitHubLink.findUnique({
      where: { userId: session.userId },
    });

    if (!link) {
      return NextResponse.json(
        { error: "GitHub account not connected" },
        { status: 403 }
      );
    }

    const accessToken = decrypt(link.accessToken);

    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "LePatch",
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error("Failed to fetch user repo", { status: response.status, message: errorData.message });
      return NextResponse.json(
        { error: errorData.message || "Failed to fetch repository" },
        { status: response.status }
      );
    }

    const repoData: GitHubUserRepoDetail = await response.json();

    await prisma.gitHubLink.update({
      where: { id: link.id },
      data: { lastUsedAt: new Date() },
    });

    return NextResponse.json({ repo: repoData });
  } catch (error) {
    return handleApiError(error);
  }
}
