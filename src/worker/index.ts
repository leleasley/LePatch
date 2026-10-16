import { Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import {
  redisConnection,
  getReleaseCheckQueue,
  getCatalogueStatsQueue,
  getIssueCommentCheckQueue,
  type ReleaseCheckJob,
  type NotificationSendJob,
  type CatalogueStatsJob,
  type IssueCommentCheckJob,
  type BackupJob,
} from "@/lib/queues";
import { checkWatchedApp } from "@/lib/releases";
import { getRepo, getLatestRelease } from "@/lib/github";
import { sendNotificationEvent } from "@/lib/notifications";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { createBackup, syncBackupSchedule } from "@/lib/backup";

const releaseWorker = new Worker<ReleaseCheckJob>(
  "release-check",
  async (job) => {
    await checkWatchedApp(job.data.watchedAppId);
  },
  { connection: redisConnection(), concurrency: 3 }
);

const notificationWorker = new Worker<NotificationSendJob>(
  "notification-send",
  async (job) => {
    await sendNotificationEvent(job.data.eventId);
  },
  { connection: redisConnection(), concurrency: 5 }
);

async function enqueueDueChecks() {
  const now = new Date();
  // Add jitter so many apps do not all enqueue in the same minute
  const apps = await prisma.watchedApp.findMany({
    select: { id: true, lastCheckedAt: true, checkIntervalMinutes: true },
  });
  let enqueued = 0;

  // Deterministic per-app offset within the check interval
  for (const app of apps) {
    if (app.lastCheckedAt) {
      const dueAt = app.lastCheckedAt.getTime() + app.checkIntervalMinutes * 60 * 1000;
      if (dueAt > now.getTime()) continue;
    }
    await getReleaseCheckQueue().add(
      "scheduled-check",
      { watchedAppId: app.id },
      { jobId: `scheduled-${app.id}-${Math.floor(now.getTime() / 60000)}`, removeOnComplete: 100, removeOnFail: 250 }
    );
    enqueued++;
  }

  if (apps.length > 0) {
    logger.info(`Release check scheduler: ${apps.length} apps watched, ${enqueued} checks enqueued`);
  }
}

async function enqueueCatalogueStatsRefresh() {
  const staleThreshold = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const entries = await prisma.catalogueEntry.findMany({
    where: {
      isActive: true,
      OR: [
        { githubStatsAt: null },
        { githubStatsAt: { lt: staleThreshold } },
      ],
    },
    select: { id: true, repoFullName: true },
    take: 20,
  });

  for (const entry of entries) {
    await getCatalogueStatsQueue().add(
      "refresh-stats",
      { entryId: entry.id, repoFullName: entry.repoFullName },
      {
        jobId: `catalogue-stats-${entry.id}`,
        removeOnComplete: 100,
        removeOnFail: 250
      }
    );
  }

  if (entries.length > 0) {
    logger.info(`Catalogue stats refresh: enqueued ${entries.length} entries`);
  }
}

async function cleanupExpiredRecords() {
  const now = new Date();
  const expiredSessions = await prisma.session.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  const expiredDevices = await prisma.trustedDevice.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  const total = expiredSessions.count + expiredDevices.count;
  if (total > 0) {
    logger.info(`Cleanup: removed ${expiredSessions.count} expired sessions, ${expiredDevices.count} expired trusted devices`);
  }
}

releaseWorker.on("failed", (job, error) => {
  logger.error(`Release check job ${job?.id || "unknown"} failed`, { error: error.message });
});

notificationWorker.on("failed", (job, error) => {
  logger.error(`Notification job ${job?.id || "unknown"} failed`, { error: error.message });
});

const catalogueStatsWorker = new Worker<CatalogueStatsJob>(
  "catalogue-stats",
  async (job) => {
    const { entryId, repoFullName } = job.data;
    const [owner, repo] = repoFullName.split("/");

    const [repoData, release] = await Promise.all([
      getRepo(owner, repo).catch(() => null),
      getLatestRelease(owner, repo, false).catch(() => null),
    ]);

    await prisma.catalogueEntry.update({
      where: { id: entryId },
      data: {
        githubStars: repoData?.stargazers_count ?? undefined,
        latestReleaseTag: release?.tag_name?.replace(/^v/, "") ?? undefined,
        latestReleaseAt: release?.published_at ? new Date(release.published_at) : undefined,
        githubStatsAt: new Date(),
      },
    });

    logger.info("Catalogue stats refreshed", { entryId, repoFullName, stars: repoData?.stargazers_count });
  },
  { connection: redisConnection(), concurrency: 3 }
);

catalogueStatsWorker.on("failed", (job, error) => {
  logger.error(`Catalogue stats job ${job?.id || "unknown"} failed`, { error: error.message });
});

const issueCommentCheckWorker = new Worker<IssueCommentCheckJob>(
  "issue-comment-check",
  async (job) => {
    const { trackedIssueId } = job.data;

    const setting = await prisma.issueNotificationSetting.findUnique({
      where: { id: trackedIssueId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            githubLink: {
              select: {
                githubUsername: true,
                accessToken: true,
              },
            },
          },
        },
      },
    });
    if (!setting || setting.level === "ignore") return;

    const username = setting.user.githubLink?.githubUsername;
    const accessToken = setting.user.githubLink?.accessToken;

    let token = accessToken || null;
    if (token) {
      try {
        const { decrypt } = await import("@/lib/encryption");
        token = decrypt(token);
      } catch (err) {
        logger.warn("Failed to decrypt GitHub access token", { error: err });
        token = null;
      }
    }

    if (!token) {
      const { getIntegrationSettingValue } = await import("@/lib/integration-secrets");
      token = await getIntegrationSettingValue("github", "token");
    }
    if (!token) return;

    const issueUrl = `https://api.github.com/repos/${setting.owner}/${setting.repo}/issues/${setting.issueNumber}`;
    const issueRes = await fetch(issueUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "LePatch",
      },
      next: { revalidate: 0 },
    });
    if (!issueRes.ok) return;

    const issueData = (await issueRes.json()) as {
      comments: number;
      title: string;
      html_url: string;
      state: string;
    };

    const newCommentCount = issueData.comments;

    if (newCommentCount > setting.lastCommentCount && username) {
      const commentsUrl = `https://api.github.com/repos/${setting.owner}/${setting.repo}/issues/${setting.issueNumber}/comments`;
      const commentsRes = await fetch(commentsUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "LePatch",
        },
        next: { revalidate: 0 },
      });

      if (commentsRes.ok) {
        const comments = (await commentsRes.json()) as Array<{
          user: { login: string };
          body: string;
          html_url: string;
          created_at: string;
        }>;

        const mentionPattern = new RegExp(`@${username}\\b`, "i");

        for (const comment of comments) {
          const isMention = mentionPattern.test(comment.body);
          if (setting.level === "participating" && !isMention) continue;

          const preview = comment.body.length > 120
            ? comment.body.slice(0, 120) + "…"
            : comment.body;

          const { sendTelegramMessageToUser } = await import("@/lib/telegram-bot");

          const app = await prisma.watchedApp.findFirst({
            where: { repoOwner: setting.owner, repoName: setting.repo },
            select: { id: true },
          });
          const appLink = app
            ? `${env.appUrl}/apps/${app.id}/issues/${setting.issueNumber}`
            : comment.html_url;

          const msg = setting.level === "all_activity"
            ? `💬 New comment on #${setting.issueNumber} (${setting.issueTitle})\nby @${comment.user.login} — "${preview}"\n🔗 <a href="${appLink}">View in LePatch</a>`
            : `💬 New mention on #${setting.issueNumber} (${setting.issueTitle})\nby @${comment.user.login} — "${preview}"\n🔗 <a href="${appLink}">View in LePatch</a>`;

          await sendTelegramMessageToUser(setting.userId, msg, "HTML");
        }
      }
    }

    await prisma.issueNotificationSetting.update({
      where: { id: setting.id },
      data: { lastCommentCount: newCommentCount, lastCheckedAt: new Date() },
    });
  },
  { connection: redisConnection(), concurrency: 2 }
);

issueCommentCheckWorker.on("failed", (job, error) => {
  logger.error(`Issue comment check job ${job?.id || "unknown"} failed`, { error: error.message });
});

const backupWorker = new Worker<BackupJob>(
  "backup",
  async () => {
    logger.info("Scheduled backup triggered", { time: new Date().toISOString() });
    await createBackup("scheduled");
  },
  { connection: redisConnection(), concurrency: 1 }
);

backupWorker.on("failed", (job, error) => {
  logger.error(`Backup job ${job?.id || "unknown"} failed`, { error: error instanceof Error ? error.message : "Unknown error" });
});

async function enqueueDueIssueChecks() {
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const issues = await prisma.issueNotificationSetting.findMany({
    where: {
      level: { not: "ignore" },
      lastCheckedAt: { lt: tenMinutesAgo },
    },
    select: { id: true },
    take: 20,
  });

  for (const issue of issues) {
    await getIssueCommentCheckQueue().add(
      "check-comments",
      { trackedIssueId: issue.id },
      {
        jobId: `issue-comment-${issue.id}-${Math.floor(now.getTime() / 60000)}`,
        removeOnComplete: 100,
        removeOnFail: 250,
      }
    );
  }

  if (issues.length > 0) {
    logger.info(`Issue comment check scheduler: ${issues.length} issues enqueued`);
  }
}

setInterval(() => {
  enqueueDueChecks().catch((error) => {
    logger.error("Release check scheduler failed", { error: error instanceof Error ? error.message : "Unknown error" });
  });
  enqueueCatalogueStatsRefresh().catch((error) => {
    logger.error("Catalogue stats refresh failed", { error: error instanceof Error ? error.message : "Unknown error" });
  });
  enqueueDueIssueChecks().catch((error) => {
    logger.error("Issue comment check scheduler failed", { error: error instanceof Error ? error.message : "Unknown error" });
  });
}, 60 * 1000);

setInterval(() => {
  cleanupExpiredRecords().catch((error) => {
    logger.error("Cleanup scheduler failed", { error: error instanceof Error ? error.message : "Unknown error" });
  });
}, 6 * 60 * 60 * 1000);

enqueueDueChecks().catch((error) => {
  logger.error("Initial release check scheduler run failed", { error: error instanceof Error ? error.message : "Unknown error" });
});
cleanupExpiredRecords().catch((error) => {
  logger.error("Initial cleanup run failed", { error: error instanceof Error ? error.message : "Unknown error" });
});
enqueueCatalogueStatsRefresh().catch((error) => {
  logger.error("Initial catalogue stats refresh failed", { error: error instanceof Error ? error.message : "Unknown error" });
});
enqueueDueIssueChecks().catch((error) => {
  logger.error("Initial issue comment check scheduler run failed", { error: error instanceof Error ? error.message : "Unknown error" });
});
syncBackupSchedule().catch((error) => {
  logger.error("Initial backup schedule sync failed", { error: error instanceof Error ? error.message : "Unknown error" });
});

logger.info("LePatch worker started");
