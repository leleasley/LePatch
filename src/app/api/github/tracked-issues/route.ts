import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await assertApiSession();
    const owner = request.nextUrl.searchParams.get("owner")?.trim();
    const repo = request.nextUrl.searchParams.get("repo")?.trim();

    const where: Record<string, unknown> = { userId: session.userId };
    if (owner) where.owner = owner;
    if (repo) where.repo = repo;

    const tracked = await prisma.trackedIssue.findMany({
      where,
      select: { issueNumber: true, issueTitle: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ tracked });
  } catch (error) {
    return handleApiError(error);
  }
}
