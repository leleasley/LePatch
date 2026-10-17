import { Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import {
  redisConnection,
  getReleaseCheckQueue,
  getIssueCommentCheckQueue,
  type ReleaseCheckJob,
  type NotificationSendJob,
  type IssueCommentCheckJob,
  type BackupJob,
} from "@/lib/queues";
import { checkWatchedApp } from "@/lib/releases";

import { sendNotificationEvent } from "@/lib/notifications";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { createBackup, syncBackupSchedule } from "@/lib/backup";

/**
 * Retention windows. Release and notification history are useful for a long
 * time but not forever; without pruning these tables grow without bound.
 */
const RELEASE_RETENTION_DAYS = 365;
const NOTIFICATION_EVENT_RETENTION_DAYS = 180;
const AUDIT_LOG_RETENTION_DAYS = 730;

/** Comments fetched per poll. Larger pages mean fewer round-trips per issue. */
const COMMENTS_PAGE_SIZE = 100;

/** Escape a string for safe use inside a RegExp built from user input. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await sendNotificationEvent(job.data.eventId, { finalAttempt });
  },
  { connection: redisConnection(), concurrency: 5 }
);

/** How many watched apps to consider per scheduler pass. */
const SCHEDULER_BATCH_SIZE = 500;
/** How many jobs to push to Redis concurrently. */
const ENQUEUE_CONCURRENCY = 25;

/**
 * Stable per-app offset inside its check interval.
 *
 * Without this, every app created in the same minute stays in lockstep forever
 * and the whole install checks in one burst. The offset is derived from the app
 * id so it is stable across runs but spread across the interval.
 */
function jitterOffsetMs(appId: string, intervalMinutes: number): number {
  const intervalMs = Math.max(1, intervalMinutes) * 60_000;
  let hash = 0;
  for (let i = 0; i < appId.length; i++) {
    hash = (hash * 31 + appId.charCodeAt(i)) >>> 0;
  }
  return hash % intervalMs;
}

async function enqueueDueChecks() {
  const now = Date.now();
  const apps = await prisma.watchedApp.findMany({
    select: { id: true, lastCheckedAt: true, checkIntervalMinutes: true },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: SCHEDULER_BATCH_SIZE,
  });

  const due = apps.filter((app) => {
    const base = app.lastCheckedAt
      ? app.lastCheckedAt.getTime() + app.checkIntervalMinutes * 60_000
      : 0;
    // Spread each app's due time across its own interval window.
    const dueAt = base === 0 ? now : base + jitterOffsetMs(app.id, app.checkIntervalMinutes) % 60_000;
    return dueAt <= now;
  });

  if (due.length === 0) return;

  const queue = getReleaseCheckQueue();
  let enqueued = 0;
  for (let i = 0; i < due.length; i += ENQUEUE_CONCURRENCY) {
    const batch = due.slice(i, i + ENQUEUE_CONCURRENCY);
    await Promise.all(
      batch.map((app) =>
        queue.add(
          "scheduled-check",
          { watchedAppId: app.id },
          {
            // Dedupe per minute: a manual check plus the scheduler must not
            // both run for the same app in the same minute.
            jobId: `scheduled-${app.id}-${Math.floor(now / 60000)}`,
            attempts: 3,
            backoff: { type: "exponential", delay: 30_000 },
            removeOnComplete: { count: 200 },
            removeOnFail: { count: 500 },
          }
        )
      )
    );
    enqueued += batch.length;
  }

  logger.info(`Release check scheduler: ${due.length} of ${apps.length} watched apps due, ${enqueued} enqueued`);
}

async function cleanupExpiredRecords() {
  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const [expiredSessions, expiredDevices, expiredTokens, oldEvents, oldAudit] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.trustedDevice.deleteMany({ where: { expiresAt: { lt: now } } }),
    // Burnt link codes should not linger in the database.
    prisma.telegramLinkToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
    }),
    prisma.notificationEvent.deleteMany({
      where: { createdAt: { lt: daysAgo(NOTIFICATION_EVENT_RETENTION_DAYS) } },
    }),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: daysAgo(AUDIT_LOG_RETENTION_DAYS) } } }),
  ]);

  const total =
    expiredSessions.count +
    expiredDevices.count +
    expiredTokens.count +
    oldEvents.count +
    oldAudit.count;
  if (total > 0) {
    logger.info("Cleanup removed records", {
      sessions: expiredSessions.count,
      trustedDevices: expiredDevices.count,
      telegramLinkTokens: expiredTokens.count,
      notificationEvents: oldEvents.count,
      auditLogs: oldAudit.count,
    });
  }
}

/** Keep release rows bounded: drop the oldest well past any useful window. */
async function pruneOldReleases() {
  const cutoff = new Date(Date.now() - RELEASE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.release.deleteMany({
    where: { detectedAt: { lt: cutoff }, notificationSent: true },
  });
  if (result.count > 0) {
    logger.info(`Pruned ${result.count} release records older than ${RELEASE_RETENTION_DAYS} days`);
  }
}

releaseWorker.on("failed", (job, error) => {
  logger.error(`Release check job ${job?.id || "unknown"} failed`, { error: error.message });
});

notificationWorker.on("failed", (job, error) => {
  logger.error(`Notification job ${job?.id || "unknown"} failed`, { error: error.message });
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
            notificationPreference: { select: { enabled: true, issueComments: true } },
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

    // Per-user preference: `issueComments` (and the master switch) were stored
    // but never consulted.
    const issuePrefs = setting.user.notificationPreference;
    if (issuePrefs && (!issuePrefs.enabled || !issuePrefs.issueComments)) {
      await prisma.issueNotificationSetting.update({
        where: { id: setting.id },
        data: { lastCheckedAt: new Date() },
      });
      return;
    }

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

    // The scheduler re-selects anything with a stale `lastCheckedAt`, so every
    // early return has to record the attempt. Returning without writing here
    // used to re-enqueue the job every 60s forever and burn the GitHub quota.
    const markChecked = async (lastCommentCount = setting.lastCommentCount) => {
      await prisma.issueNotificationSetting.update({
        where: { id: setting.id },
        data: { lastCommentCount, lastCheckedAt: new Date() },
      });
    };

    if (!token) {
      await markChecked();
      return;
    }

    const issueUrl = `https://api.github.com/repos/${encodeURIComponent(setting.owner)}/${encodeURIComponent(setting.repo)}/issues/${setting.issueNumber}`;
    const issueRes = await fetch(issueUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "LePatch",
      },
      next: { revalidate: 0 },
    });
    if (!issueRes.ok) {
      logger.warn("Issue comment check failed", {
        issueId: setting.id,
        status: issueRes.status,
      });
      await markChecked();
      return;
    }

    const issueData = (await issueRes.json()) as {
      comments: number;
      title: string;
      html_url: string;
      state: string;
    };

    const newCommentCount = issueData.comments;

    if (newCommentCount > setting.lastCommentCount && username) {
      const commentsUrl =
        `https://api.github.com/repos/${encodeURIComponent(setting.owner)}/${encodeURIComponent(setting.repo)}` +
        `/issues/${setting.issueNumber}/comments?per_page=${COMMENTS_PAGE_SIZE}`;
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

        // Resolve the deep link once instead of querying inside the loop.
        const app = await prisma.watchedApp.findFirst({
          where: { repoOwner: setting.owner, repoName: setting.repo },
          select: { id: true },
        });
        const appLink = app
          ? `${env.appUrl}/apps/${app.id}/issues/${setting.issueNumber}`
          : comments[0]?.html_url || "";

        // Escape the username: GitHub allows characters that are meaningful in
        // a RegExp, and an unescaped value could throw and fail the job.
        const mentionPattern = new RegExp(`@${escapeRegExp(username)}\\b`, "i");
        const { sendTelegramMessageToUser, escapeHtml } = await import("@/lib/telegram-bot");
        const safeTitle = escapeHtml(setting.issueTitle);

        for (const comment of comments) {
          const isMention = mentionPattern.test(comment.body);
          if (setting.level === "participating" && !isMention) continue;

          const preview = comment.body.length > 120 ? `${comment.body.slice(0, 120)}...` : comment.body;

          // Issue titles and comment bodies come straight from GitHub and
          // Telegram parses HTML, so every interpolated value must be escaped.
          const heading = setting.level === "all_activity" ? "New comment" : "New mention";
          const msg =
            `${heading} on #${setting.issueNumber} (${safeTitle})\n` +
            `by @${escapeHtml(comment.user.login)} - "${escapeHtml(preview)}"\n` +
            `<a href="${escapeHtml(appLink || comment.html_url)}">View in LePatch</a>`;

          try {
            await sendTelegramMessageToUser(setting.userId, msg, "HTML");
          } catch (err) {
            logger.warn("Failed to deliver Telegram mention notification", err);
          }
        }

        // Only advance the cursor when the whole backlog was visible. A full
        // page means older comments still exist and would otherwise be skipped.
        const pageWasFull = comments.length >= COMMENTS_PAGE_SIZE;
        const advanced = pageWasFull
          ? Math.min(newCommentCount, setting.lastCommentCount + COMMENTS_PAGE_SIZE - 1)
          : newCommentCount;
        await markChecked(Math.max(advanced, setting.lastCommentCount));
        return;
      }

      logger.warn("Issue comments fetch failed", { issueId: setting.id, status: commentsRes.status });
    }

    await markChecked(newCommentCount);
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
    // Without an explicit order, `take: 20` can return the same 20 rows every
    // run and starve everything after them.
    orderBy: { lastCheckedAt: "asc" },
    select: { id: true },
    take: 50,
  });

  const queue = getIssueCommentCheckQueue();
  await Promise.all(
    issues.map((issue) =>
      queue.add(
        "check-comments",
        { trackedIssueId: issue.id },
        {
          jobId: `issue-comment-${issue.id}-${Math.floor(now.getTime() / 60000)}`,
          attempts: 2,
          backoff: { type: "fixed", delay: 60_000 },
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 500 },
        }
      )
    )
  );

  if (issues.length > 0) {
    logger.info(`Issue comment check scheduler: ${issues.length} issues enqueued`);
  }
}

/**
 * The scheduler ticks once a minute. Ticks must never overlap: with a slow
 * database or a large install a tick can outlive the next interval, which used
 * to run two concurrent enqueue passes.
 */
let tickInFlight = false;

async function runSchedulerTick() {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    await Promise.allSettled([
      enqueueDueChecks(),
      enqueueDueIssueChecks(),
    ]);
  } finally {
    tickInFlight = false;
  }
}

const schedulerTimer = setInterval(() => {
  runSchedulerTick().catch((error) => {
    logger.error("Scheduler tick failed", { error: error instanceof Error ? error.message : "Unknown error" });
  });
}, 60 * 1000);

const cleanupTimer = setInterval(() => {
  Promise.allSettled([cleanupExpiredRecords(), pruneOldReleases()]).then((results) => {
    for (const result of results) {
      if (result.status === "rejected") {
        logger.error("Cleanup job failed", {
          error: result.reason instanceof Error ? result.reason.message : "Unknown error",
        });
      }
    }
  });
}, 6 * 60 * 60 * 1000);

enqueueDueChecks().catch((error) => {
  logger.error("Initial release check scheduler run failed", { error: error instanceof Error ? error.message : "Unknown error" });
});
cleanupExpiredRecords().catch((error) => {
  logger.error("Initial cleanup run failed", { error: error instanceof Error ? error.message : "Unknown error" });
});
enqueueDueIssueChecks().catch((error) => {
  logger.error("Initial issue comment check scheduler run failed", { error: error instanceof Error ? error.message : "Unknown error" });
});
pruneOldReleases().catch((error) => {
  logger.error("Initial release prune failed", { error: error instanceof Error ? error.message : "Unknown error" });
});
syncBackupSchedule().catch((error) => {
  logger.error("Initial backup schedule sync failed", { error: error instanceof Error ? error.message : "Unknown error" });
});

logger.info("LePatch worker started");

// --- Graceful shutdown ---
// Without this, `docker compose restart` kills in-flight jobs mid-send, which
// BullMQ then replays — the main source of duplicate notifications.
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Worker received ${signal}, shutting down`);

  clearInterval(schedulerTimer);
  clearInterval(cleanupTimer);

  await Promise.allSettled([
    releaseWorker.close(),
    notificationWorker.close(),
    issueCommentCheckWorker.close(),
    backupWorker.close(),
  ]);
  await prisma.$disconnect();
  logger.info("Worker shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
