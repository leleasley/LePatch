import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";

const LEVELS = ["participating", "all_activity", "ignore"] as const;

const postSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  issueNumber: z.number().int().positive(),
  issueTitle: z.string().optional().default(""),
  level: z.enum(LEVELS),
});

const deleteSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  issueNumber: z.number().int().positive(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await assertApiSession();
    const owner = request.nextUrl.searchParams.get("owner")?.trim();
    const repo = request.nextUrl.searchParams.get("repo")?.trim();

    const where: { userId: string; owner?: string; repo?: string } = { userId: session.userId };
    if (owner) where.owner = owner;
    if (repo) where.repo = repo;

    const rows = await prisma.issueNotificationSetting.findMany({ where });
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[`${row.owner}/${row.repo}/${row.issueNumber}`] = row.level;
    }
    return NextResponse.json({ settings });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const session = await assertApiSession();
    const body = postSchema.parse(await request.json());

    await prisma.issueNotificationSetting.upsert({
      where: {
        userId_owner_repo_issueNumber: {
          userId: session.userId,
          owner: body.owner,
          repo: body.repo,
          issueNumber: body.issueNumber,
        },
      },
      update: { level: body.level, issueTitle: body.issueTitle || undefined, updatedAt: new Date() },
      create: {
        userId: session.userId,
        owner: body.owner,
        repo: body.repo,
        issueNumber: body.issueNumber,
        issueTitle: body.issueTitle || `Issue #${body.issueNumber}`,
        level: body.level,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const session = await assertApiSession();
    const body = deleteSchema.parse(await request.json());

    await prisma.issueNotificationSetting.deleteMany({
      where: {
        userId: session.userId,
        owner: body.owner,
        repo: body.repo,
        issueNumber: body.issueNumber,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
