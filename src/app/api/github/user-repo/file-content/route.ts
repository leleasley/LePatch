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
    const path = request.nextUrl.searchParams.get("path")?.trim();

    if (!owner || !repo || !path) {
      return NextResponse.json({ error: "owner, repo, and path are required" }, { status: 400 });
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
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");

    const response = await fetch(
      `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/HEAD/${encodedPath}`,
      {
        headers: {
          Accept: "text/plain",
          "User-Agent": "LePatch",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.status === 404) {
      return NextResponse.json({ content: null });
    }

    if (!response.ok) {
      logger.error("Failed to fetch file content", { status: response.status, owner, repo, path });
      return NextResponse.json({ content: null });
    }

    const content = await response.text();

    await prisma.gitHubLink.update({
      where: { id: link.id },
      data: { lastUsedAt: new Date() },
    });

    return NextResponse.json({ content });
  } catch (error) {
    return handleApiError(error);
  }
}
