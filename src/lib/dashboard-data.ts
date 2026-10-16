import { prisma } from "@/lib/prisma";

export type DashboardAttentionApp = {
  id: string;
  name: string;
  repoOwner: string;
  repoName: string;
  repoFullName: string;
  latestSeenTag: string | null;
  lastCheckedAt: Date | null;
  checkStatus: string;
  checkError: string | null;
  updateAvailable: boolean;
  notificationsEnabled: boolean;
  includePrereleases: boolean;
  updatedAt: Date;
};

export async function loadDashboardData(userId: string) {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [apps, recent, lastChecked, pendingEvents, weekReleases, prereleases, activeCounts] = await Promise.all([
    prisma.watchedApp.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        repoOwner: true,
        repoName: true,
        repoFullName: true,
        latestSeenTag: true,
        lastCheckedAt: true,
        checkStatus: true,
        checkError: true,
        updateAvailable: true,
        notificationsEnabled: true,
        includePrereleases: true,
        updatedAt: true,
      },
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
        watchedApp: {
          select: { id: true, name: true, repoFullName: true, updateAvailable: true },
        },
      },
      orderBy: { detectedAt: "desc" },
      take: 20,
    }),
    prisma.watchedApp.aggregate({
      where: { userId, lastCheckedAt: { not: null } },
      _max: { lastCheckedAt: true },
    }),
    prisma.notificationEvent.count({ where: { status: "pending" } }),
    // Release activity for the last 7 days (for the activity strip + weekly count)
    prisma.release.findMany({
      where: { watchedApp: { userId }, detectedAt: { gte: sevenDaysAgo } },
      select: { detectedAt: true, prerelease: true },
      orderBy: { detectedAt: "desc" },
      take: 500,
    }),
    // Pre-release spotlight
    prisma.release.findMany({
      where: { watchedApp: { userId }, prerelease: true },
      select: {
        id: true,
        tagName: true,
        name: true,
        htmlUrl: true,
        publishedAt: true,
        detectedAt: true,
        watchedApp: {
          select: { id: true, name: true, repoFullName: true },
        },
      },
      orderBy: { detectedAt: "desc" },
      take: 5,
    }),
    // Most active repos by release volume
    prisma.release.groupBy({
      by: ["watchedAppId"],
      where: { watchedApp: { userId } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    }),
  ]);

  const attentionApps: DashboardAttentionApp[] = apps
    .filter((app) => (
      app.updateAvailable ||
      app.checkStatus === "failed" ||
      !app.notificationsEnabled ||
      !app.lastCheckedAt ||
      app.lastCheckedAt < oneDayAgo
    ))
    .slice(0, 8);

  // 7-day activity buckets (oldest → newest), all computed in JS from one query
  const activity: Array<{ date: string; label: string; count: number; prereleases: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = day.toISOString().slice(0, 10);
    activity.push({
      date: key,
      label: day.toLocaleDateString(undefined, { weekday: "narrow" }),
      count: 0,
      prereleases: 0,
    });
  }
  const byDay = new Map(activity.map((d) => [d.date, d]));
  for (const r of weekReleases) {
    const bucket = byDay.get(r.detectedAt.toISOString().slice(0, 10));
    if (bucket) {
      bucket.count += 1;
      if (r.prerelease) bucket.prereleases += 1;
    }
  }

  const appNames = new Map(apps.map((a) => [a.id, { name: a.name, repoFullName: a.repoFullName }]));
  const mostActive = activeCounts
    .map((row) => ({
      watchedAppId: row.watchedAppId,
      name: appNames.get(row.watchedAppId)?.name ?? "Unknown app",
      repoFullName: appNames.get(row.watchedAppId)?.repoFullName ?? "",
      releaseCount: row._count.id,
    }))
    .filter((row) => row.releaseCount > 0);

  const total = apps.length;
  const updates = apps.filter((app) => app.updateAvailable).length;
  const failed = apps.filter((app) => app.checkStatus === "failed").length;
  const successCount = apps.filter((app) => app.checkStatus === "success").length;
  const noReleasesCount = apps.filter((app) => app.checkStatus === "no_releases").length;
  const recentlyCheckedCount = apps.filter((app) => app.lastCheckedAt && app.lastCheckedAt >= oneHourAgo).length;
  const notificationsDisabled = apps.filter((app) => !app.notificationsEnabled).length;
  const staleApps = apps.filter((app) => !app.lastCheckedAt || app.lastCheckedAt < oneDayAgo).length;
  const neverChecked = total - successCount - failed - noReleasesCount;
  const statusHealthy = failed === 0;
  const lastCheckContext = total === 0
    ? "No apps watched yet"
    : recentlyCheckedCount === total
      ? `All ${total} apps checked recently`
      : `${recentlyCheckedCount} of ${total} apps checked in last hour`;

  return {
    total,
    updates,
    failed,
    recent,
    lastCheckedAt: lastChecked._max.lastCheckedAt || null,
    pendingEvents,
    successCount,
    noReleasesCount,
    recentlyCheckedCount,
    releasesThisWeek: weekReleases.length,
    prereleasesThisWeek: weekReleases.filter((r) => r.prerelease).length,
    activity,
    prereleases,
    mostActive,
    notificationsDisabled,
    staleApps,
    attentionApps,
    neverChecked,
    statusHealthy,
    lastCheckContext,
  };
}
