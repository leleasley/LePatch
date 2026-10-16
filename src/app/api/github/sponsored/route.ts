import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { decrypt } from "@/lib/encryption";
import { getSponsoredRepos } from "@/lib/github";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Repositories the signed-in user sponsors via GitHub Sponsors
 * (GraphQL viewer.sponsorshipsAsSponsor). Requires a connected GitHub
 * account whose token has the read:user scope.
 */
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

    try {
      const repos = await getSponsoredRepos(accessToken);
      await prisma.gitHubLink.update({
        where: { id: link.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => {});
      return NextResponse.json(
        { repos },
        { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=300" } }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch sponsored repositories from GitHub";
      logger.error("Failed to fetch sponsored repos", error as Error);
      // 401 = stored OAuth token expired/revoked (GitHub OAuth has no refresh
      // flow here) — the user must disconnect and reconnect GitHub.
      const status = /status 401/.test(message) ? 401 : 502;
      const hint = status === 401
        ? "Your GitHub token was rejected (expired or revoked). Disconnect GitHub under Profile > Security and connect it again."
        : message;
      return NextResponse.json({ error: hint }, { status });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
