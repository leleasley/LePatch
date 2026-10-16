import { prisma } from "@/lib/prisma";
import { fetchRepoWithAccess, getReleases, isTokenExpiredError } from "@/lib/github";
import { getNotificationSendQueue } from "@/lib/queues";
import { getEnabledNotificationChannels } from "@/lib/notifications";
import { refreshRepoSnapshot } from "@/lib/repo-snapshot";
import { classifyRelease, parseChangelog } from "@/lib/release-classifier";
import { GITHUB_TOKEN_EXPIRED_MESSAGE } from "@/lib/github";

export async function checkWatchedApp(watchedAppId: string) {
  const app = await prisma.watchedApp.findUnique({ where: { id: watchedAppId } });
  if (!app) throw new Error("Watched app not found");

  // Private/sponsor-gated repos 404 for the shared token — retry with the
  // watching user's OAuth token so their access applies to checks too.
  let usedUserToken: string | null = null;
  const loadReleases = (accessToken?: string) => {
    if (accessToken) usedUserToken = accessToken;
    return getReleases(app.repoOwner, app.repoName, accessToken);
  };

  try {
    const allReleases = await fetchRepoWithAccess(app.userId, loadReleases);
    const relevant = allReleases.filter(
      (r) => !r.draft && (app.includePrereleases || !r.prerelease)
    );

    if (relevant.length === 0) {
      return await prisma.watchedApp.update({
        where: { id: app.id },
        data: { lastCheckedAt: new Date(), checkStatus: "no_releases", checkError: null }
      });
    }

    const previousTag = app.latestSeenTag;
    const newTagNames: string[] = [];

    for (const release of relevant) {
      const githubReleaseId = String(release.id);
      const existing = await prisma.release.findUnique({
        where: { watchedAppId_githubReleaseId: { watchedAppId: app.id, githubReleaseId } }
      });

      if (!existing) {
        newTagNames.push(release.tag_name);
      }

      const releaseType = classifyRelease(release.tag_name, release.prerelease);
      const changelog = parseChangelog(release.body);

      await prisma.release.upsert({
        where: { watchedAppId_githubReleaseId: { watchedAppId: app.id, githubReleaseId } },
        update: {
          tagName: release.tag_name,
          name: release.name,
          body: release.body,
          htmlUrl: release.html_url,
          prerelease: release.prerelease,
          draft: release.draft,
          releaseType,
          changelogSummary: changelog.summary,
          changelogSections: changelog.sections.length > 0 ? changelog.sections as any : undefined,
          publishedAt: release.published_at ? new Date(release.published_at) : null
        },
        create: {
          watchedAppId: app.id,
          githubReleaseId,
          tagName: release.tag_name,
          name: release.name,
          body: release.body,
          htmlUrl: release.html_url,
          prerelease: release.prerelease,
          draft: release.draft,
          releaseType,
          changelogSummary: changelog.summary,
          changelogSections: changelog.sections.length > 0 ? changelog.sections as any : undefined,
          publishedAt: release.published_at ? new Date(release.published_at) : null
        }
      });
    }

    const latest = relevant[0];
    const githubReleaseId = String(latest.id);
    const isNew = app.latestSeenReleaseId !== githubReleaseId;

    await prisma.watchedApp.update({
      where: { id: app.id },
      data: {
        latestSeenReleaseId: githubReleaseId,
        latestSeenTag: latest.tag_name,
        updateAvailable: isNew && Boolean(app.latestSeenReleaseId),
        lastCheckedAt: new Date(),
        checkStatus: "success",
        checkError: null
      }
    });

    const shouldRefreshSnapshot = isNew || app.checkStatus === "never";
    if (shouldRefreshSnapshot) {
      await refreshRepoSnapshot(app.repoOwner, app.repoName, allReleases, {
        userId: app.userId,
        accessToken: usedUserToken ?? undefined,
      });
    }

    if (isNew && app.latestSeenReleaseId && app.notificationsEnabled) {
      const latestRelease = await prisma.release.findUnique({
        where: { watchedAppId_githubReleaseId: { watchedAppId: app.id, githubReleaseId } }
      });

      if (latestRelease && !latestRelease.ignored) {
        const channels = await getEnabledNotificationChannels();
        await Promise.all(
          channels.map(async (channel) => {
            // Concurrent checks (scheduled + manual) must not double-notify:
            // one event per release+channel, enforced by @@unique.
            let event = await prisma.notificationEvent.findFirst({
              where: { releaseId: latestRelease.id, channelId: channel.id },
              select: { id: true },
            });
            if (!event) {
              try {
                event = await prisma.notificationEvent.create({
                  data: { releaseId: latestRelease.id, channelId: channel.id, status: "pending" },
                  select: { id: true },
                });
              } catch (error) {
                // Lost a race with another check — that check owns the send.
                if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
                  return;
                }
                throw error;
              }
            } else {
              // Already queued or sent — never send twice for the same release.
              return;
            }
            // Idempotency key: a stable jobId means a retry (or a stalled-job
            // replay) cannot enqueue a second delivery for the same event.
            await getNotificationSendQueue().add(
              "send",
              { eventId: event.id },
              {
                jobId: `notify-${event.id}`,
                attempts: 5,
                backoff: { type: "exponential", delay: 5_000 },
                removeOnComplete: { count: 500 },
                removeOnFail: { count: 1_000 },
              }
            );
          })
        );
      }
    }

    return { release: { ...latest, id: String(latest.id) }, previousTag, newTagNames, updateAvailable: isNew && Boolean(app.latestSeenReleaseId) };
  } catch (error) {
    // Surface token expiry plainly so the user knows to reconnect GitHub
    // instead of staring at a generic failure.
    const checkError = isTokenExpiredError(error)
      ? GITHUB_TOKEN_EXPIRED_MESSAGE
      : error instanceof Error ? error.message : "Unknown release check error";
    await prisma.watchedApp.update({
      where: { id: app.id },
      data: {
        lastCheckedAt: new Date(),
        checkStatus: "failed",
        checkError,
      }
    });
    throw error;
  }
}

export async function markLatestSeen(watchedAppId: string) {
  const app = await prisma.watchedApp.findUnique({ where: { id: watchedAppId } });
  if (!app) throw new Error("Watched app not found");
  return prisma.watchedApp.update({
    where: { id: watchedAppId },
    data: {
      updateAvailable: false,
      lastNotifiedReleaseId: app.latestSeenReleaseId,
      lastNotifiedTag: app.latestSeenTag
    }
  });
}
