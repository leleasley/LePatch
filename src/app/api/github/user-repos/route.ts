import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";

export type GitHubUserRepo = {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  private: boolean;
  fork: boolean;
  updated_at: string;
  default_branch: string;
};

export async function GET() {
  try {
    const user = await getCurrentUser();

    const link = await prisma.gitHubLink.findUnique({
      where: { userId: user.id },
    });

    if (!link) {
      return NextResponse.json(
        { error: "GitHub account not connected. Connect your GitHub account in Profile > Security first." },
        { status: 403 }
      );
    }

    const accessToken = decrypt(link.accessToken);

    const response = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated&type=owner",
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
      logger.error("Failed to fetch user repos", { status: response.status, message: errorData.message });
      return NextResponse.json(
        { error: "Failed to fetch repositories from GitHub" },
        { status: response.status }
      );
    }

    const repos: GitHubUserRepo[] = await response.json();

    await prisma.gitHubLink.update({
      where: { id: link.id },
      data: { lastUsedAt: new Date() },
    });

    return NextResponse.json({ repos });
  } catch (error) {
    return handleApiError(error);
  }
}
