import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";

const postSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  issueNumber: z.number().int().positive(),
  issueTitle: z.string().min(1),
});

const deleteSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  issueNumber: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  try {
    if (!validateCsrf(request)) return rejectedCsrfResponse();
    const session = await assertApiSession();
    const body = postSchema.parse(await request.json());

    const tracked = await prisma.trackedIssue.create({
      data: {
        userId: session.userId,
        owner: body.owner,
        repo: body.repo,
        issueNumber: body.issueNumber,
        issueTitle: body.issueTitle,
      },
    });

    createAuditLog({
      userId: session.userId,
      action: "github.issue_tracked",
      target: `${body.owner}/${body.repo}`,
      targetId: String(body.issueNumber),
      metadata: { title: body.issueTitle },
    }).catch(() => {});return NextResponse.json({ success: true, tracked });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!validateCsrf(request)) return rejectedCsrfResponse();
    const session = await assertApiSession();
    const body = deleteSchema.parse(await request.json());

    const deleted = await prisma.trackedIssue.deleteMany({
      where: {
        userId: session.userId,
        owner: body.owner,
        repo: body.repo,
        issueNumber: body.issueNumber,
      },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Tracked issue not found" }, { status: 404 });
    }

    createAuditLog({
      userId: session.userId,
      action: "github.issue_untracked",
      target: `${body.owner}/${body.repo}`,
      targetId: String(body.issueNumber),
    }).catch(() => {});return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
