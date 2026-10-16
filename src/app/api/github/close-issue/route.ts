import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { decrypt } from "@/lib/encryption";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";

const schema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  issueNumber: z.number().int().positive(),
  action: z.enum(["close", "reopen"]),
});

export async function POST(request: NextRequest) {
  try {
    if (!validateCsrf(request)) return rejectedCsrfResponse();
    const session = await assertApiSession();
    const body = schema.parse(await request.json());

    const link = await prisma.gitHubLink.findUnique({
      where: { userId: session.userId },
    });

    if (!link) {
      return NextResponse.json(
        { error: "GitHub account not connected. Connect your GitHub account in Profile > Security first." },
        { status: 403 }
      );
    }

    const accessToken = decrypt(link.accessToken);

    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(body.owner)}/${encodeURIComponent(body.repo)}/issues/${body.issueNumber}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "LePatch",
        },
        body: JSON.stringify({ state: body.action === "close" ? "closed" : "open" }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.message || `GitHub API error (${response.status})`;
      logger.error("Failed to close/reopen GitHub issue", { status: response.status, message, owner: body.owner, repo: body.repo, issueNumber: body.issueNumber });
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const issue = await response.json();

    await prisma.gitHubLink.update({
      where: { id: link.id },
      data: { lastUsedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      issue: {
        number: issue.number,
        title: issue.title,
        state: issue.state,
        html_url: issue.html_url,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
