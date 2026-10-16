import { prisma } from "@/lib/prisma";

export type FeedRelease = {
  id: string;
  tagName: string;
  name: string | null;
  htmlUrl: string;
  prerelease: boolean;
  publishedAt: Date | null;
  detectedAt: Date;
  changelogSummary: string | null;
  watchedApp: {
    id: string;
    name: string;
    repoFullName: string;
  };
};

/**
 * Data for the home feed: the latest releases across everything the user
 * watches, plus three quiet health numbers for the ops line.
 */
export async function loadDashboardData(userId: string) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [apps, recent] = await Promise.all([
    prisma.watchedApp.findMany({
      where: { userId },
      select: { updateAvailable: true, checkStatus: true, lastCheckedAt: true },
    }),
    prisma.release.findMany({
      where: { watchedApp: { userId } },
      select: {
        id: true,
        tagName: true,
        name: true,
        htmlUrl: true,
        prerelease: true,
        publishedAt: true,
        detectedAt: true,
        changelogSummary: true,
        watchedApp: {
          select: { id: true, name: true, repoFullName: true },
        },
      },
      orderBy: { detectedAt: "desc" },
      take: 30,
    }),
  ]);

  return {
    total: apps.length,
    updates: apps.filter((app) => app.updateAvailable).length,
    failed: apps.filter((app) => app.checkStatus === "failed").length,
    stale: apps.filter((app) => !app.lastCheckedAt || app.lastCheckedAt < oneDayAgo).length,
    recent: recent as FeedRelease[],
  };
}
