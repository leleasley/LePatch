import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";

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
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=30`,
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
      logger.error("Failed to fetch user repo releases", { status: response.status, message: errorData.message });
      return NextResponse.json(
        { error: errorData.message || "Failed to fetch releases" },
        { status: response.status }
      );
    }

    const releases = await response.json();

    await prisma.gitHubLink.update({
      where: { id: link.id },
      data: { lastUsedAt: new Date() },
    });

    return NextResponse.json({ releases });
  } catch (error) {
    return handleApiError(error);
  }
}
