import { NextRequest, NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import {
  getReleaseCheckQueue,
  getNotificationSendQueue,
  getCatalogueStatsQueue,
  getIssueCommentCheckQueue,
  getBackupQueue,
} from "@/lib/queues";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const QUEUES = [
  { name: "release-check", getter: getReleaseCheckQueue },
  { name: "notification-send", getter: getNotificationSendQueue },
  { name: "catalogue-stats", getter: getCatalogueStatsQueue },
  { name: "issue-comment-check", getter: getIssueCommentCheckQueue },
  { name: "backup", getter: getBackupQueue },
] as const;

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const user = await requireAdmin();

    const results = await Promise.allSettled(
      QUEUES.map(async ({ name, getter }) => {
        const queue = getter();
        const failed = await queue.getFailed(0, 10000);
        if (failed.length === 0) return { name, cleared: 0 };
        for (const job of failed) {
          await job.remove();
        }
        return { name, cleared: failed.length };
      })
    );

    const summary = results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { name: QUEUES[i].name, cleared: 0, error: r.reason?.message || "Unknown" }
    );

    const totalCleared = summary.reduce((sum, q) => sum + q.cleared, 0);
    logger.info("Cleared all failed queue jobs", { summary });
    createAuditLog({ userId: user.id, action: "admin.queues_cleared", metadata: { totalCleared, queues: summary } }).catch(() => {});return NextResponse.json({ ok: true, totalCleared, queues: summary });
  } catch (error) {
    return handleApiError(error);
  }
}
