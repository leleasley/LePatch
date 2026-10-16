import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { getIntegrationSettingValue } from "@/lib/integration-secrets";
import { createAuditLog } from "@/lib/audit";
import { invalidateGithubLinkCache } from "@/lib/github-link-cache";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const [enabled, link] = await Promise.all([
      getIntegrationSettingValue("github", "oauthEnabled"),
      prisma.gitHubLink.findUnique({
        where: { userId: user.id },
        select: {
          githubUsername: true,
          linkedAt: true,
          lastUsedAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      enabled: enabled === "true",
      link: link
        ? {
            linked: true,
            githubUsername: link.githubUsername,
            linkedAt: link.linkedAt.toISOString(),
            lastUsedAt: link.lastUsedAt?.toISOString() || null,
          }
        : { linked: false },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const user = await getCurrentUser();
    const link = await prisma.gitHubLink.findUnique({
      where: { userId: user.id },
      select: { githubUsername: true },
    });

    await prisma.gitHubLink.deleteMany({
      where: { userId: user.id },
    });

    createAuditLog({
      userId: user.id,
      action: "github.disconnected",
      target: link?.githubUsername || "unknown",
    }).catch(() => {});invalidateGithubLinkCache(user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
