import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertApiSession, assertCanManageApps } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { getRepo, getUserGithubToken, isNotFoundError } from "@/lib/github";
import { slugify } from "@/lib/slug";
import { parsePagination } from "@/lib/pagination";

const createSchema = z.object({
  repoFullName: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  name: z.string().min(1).max(120).optional(),
  includePrereleases: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await assertApiSession();
    await assertCanManageApps(session.userId);
    const { page, perPage, skip, take } = parsePagination(request.nextUrl.searchParams, 200, 200);

    const [apps, total] = await Promise.all([
      prisma.watchedApp.findMany({
        where: { userId: session.userId },
        orderBy: { name: "asc" },
        skip,
        take,
        include: { _count: { select: { releases: true } } },
      }),
      prisma.watchedApp.count({ where: { userId: session.userId } }),
    ]);

    return NextResponse.json({ apps, total, page, perPage });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const session = await assertApiSession();
    await assertCanManageApps(session.userId);
    const body = createSchema.parse(await request.json());
    const [owner, repoName] = body.repoFullName.split("/");

    // Private/sponsor-gated repos 404 for the shared token — retry with the
    // viewer's own OAuth token so their access applies when watching.
    let repo;
    try {
      repo = await getRepo(owner, repoName);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      const userToken = await getUserGithubToken(session.userId);
      if (!userToken) throw error;
      repo = await getRepo(owner, repoName, userToken);
    }

    const name = body.name || repo.name;
    const defaultSetting = await prisma.systemSetting.findUnique({
      where: { key: "defaultCheckIntervalMinutes" },
    });
    const checkIntervalMinutes = defaultSetting ? Number(defaultSetting.value) : 360;

    const app = await prisma.watchedApp.create({
      data: {
        name,
        slug: slugify(`${name}-${repo.full_name}`),
        repoOwner: repo.owner.login,
        repoName: repo.name,
        repoFullName: repo.full_name,
        githubUrl: repo.html_url,
        description: repo.description,
        homepageUrl: repo.homepage,
        includePrereleases: body.includePrereleases ?? false,
        checkIntervalMinutes,
        userId: session.userId,
      },
    });

    // Check immediately so a newly watched repo is not blank for an interval.
    const { getReleaseCheckQueue } = await import("@/lib/queues");
    await getReleaseCheckQueue().add(
      "manual-check",
      { watchedAppId: app.id, manual: true },
      {
        jobId: `add-${app.id}`,
        attempts: 2,
        backoff: { type: "exponential", delay: 15_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      }
    );

    createAuditLog({
      userId: session.userId,
      action: "app.created",
      target: app.name,
      targetId: app.id,
      metadata: { repoFullName: body.repoFullName },
    }).catch(() => {});

    return NextResponse.json({ app }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
