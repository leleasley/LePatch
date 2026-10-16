import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import {
  getReleaseCheckQueue,
  getNotificationSendQueue,
  getCatalogueStatsQueue,
  getIssueCommentCheckQueue,
  getBackupQueue,
} from "@/lib/queues";

export const dynamic = "force-dynamic";

const QUEUES = [
  { name: "release-check", getter: getReleaseCheckQueue },
  { name: "notification-send", getter: getNotificationSendQueue },
  { name: "catalogue-stats", getter: getCatalogueStatsQueue },
  { name: "issue-comment-check", getter: getIssueCommentCheckQueue },
  { name: "backup", getter: getBackupQueue },
] as const;

export async function GET() {
  try {
    await requireAdmin();

    const results = await Promise.allSettled(
      QUEUES.map(async ({ name, getter }) => {
        const queue = getter();
        const [counts, waiting, active, failed, completed] = await Promise.all([
          queue.getJobCounts(),
          queue.getWaiting().then((jobs) =>
            jobs.slice(0, 10).map((j) => ({
              id: j.id,
              name: j.name,
              data: j.data,
              timestamp: j.timestamp,
              attemptsMade: j.attemptsMade,
            }))
          ),
          queue.getActive().then((jobs) =>
            jobs.slice(0, 10).map((j) => ({
              id: j.id,
              name: j.name,
              data: j.data,
              timestamp: j.timestamp,
              attemptsMade: j.attemptsMade,
            }))
          ),
          queue.getFailed().then((jobs) =>
            jobs.slice(0, 10).map((j) => ({
              id: j.id,
              name: j.name,
              data: j.data,
              timestamp: j.timestamp,
              attemptsMade: j.attemptsMade,
              failedReason: j.failedReason,
            }))
          ),
          queue.getCompleted(0, 10),
        ]);

        return {
          name,
          counts: {
            waiting: counts.waiting || 0,
            active: counts.active || 0,
            completed: counts.completed || 0,
            failed: counts.failed || 0,
            delayed: counts.delayed || 0,
            paused: counts.paused || 0,
          },
          recentJobs: {
            waiting,
            active,
            failed,
            completedCount: completed.length,
          },
          isPaused: await queue.isPaused(),
        };
      })
    );

    const queues = results.map((r, i) =>
      r.status === "fulfilled" ? r.value : { name: QUEUES[i].name, error: r.reason?.message || "Unknown error" }
    );

    return NextResponse.json({ queues });
  } catch (error) {
    return handleApiError(error);
  }
}
