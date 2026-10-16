import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { decrypt } from "@/lib/encryption";
import { createAuditLog } from "@/lib/audit";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";

const schema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  title: z.string().min(1).max(256),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
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

    const payload: Record<string, unknown> = {
      title: body.title,
    };
    if (body.body) payload.body = body.body;
    if (body.labels && body.labels.length > 0) payload.labels = body.labels;

    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(body.owner)}/${encodeURIComponent(body.repo)}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "LePatch",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.message || `GitHub API error (${response.status})`;
      logger.error("Failed to create GitHub issue", { status: response.status, message, owner: body.owner, repo: body.repo });
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const issue = await response.json();

    await prisma.gitHubLink.update({
      where: { id: link.id },
      data: { lastUsedAt: new Date() },
    });

    createAuditLog({
      userId: session.userId,
      action: "github.issue_created",
      target: `${body.owner}/${body.repo}`,
      targetId: String(issue.number),
      metadata: { title: body.title, issueUrl: issue.html_url },
    }).catch(() => {});prisma.issueNotificationSetting.upsert({
      where: {
        userId_owner_repo_issueNumber: {
          userId: session.userId,
          owner: body.owner,
          repo: body.repo,
          issueNumber: issue.number,
        },
      },
      update: { level: "participating", issueTitle: body.title },
      create: {
        userId: session.userId,
        owner: body.owner,
        repo: body.repo,
        issueNumber: issue.number,
        issueTitle: body.title,
        level: "participating",
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      issue: {
        number: issue.number,
        title: issue.title,
        html_url: issue.html_url,
        state: issue.state,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
