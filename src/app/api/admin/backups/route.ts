import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { createBackup, listBackups, getBackupStats, getBackupScheduleConfig, computeNextBackup } from "@/lib/backup";
import { requestIp } from "@/lib/auth";
import { checkBackupRateLimit } from "@/lib/api-rate-limit";

export async function GET() {
  try {
    await requireAdmin();
    const [backups, stats, schedule] = await Promise.all([listBackups(), getBackupStats(), getBackupScheduleConfig()]);
    const nextBackupAt = computeNextBackup(schedule);
    return NextResponse.json({ backups, stats, schedule, nextBackupAt: nextBackupAt?.toISOString() ?? null });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!validateCsrf(request)) return rejectedCsrfResponse();
    const limited = await checkBackupRateLimit(request, "backup-create");
    if (limited) return limited;
    const user = await requireAdmin();
    const result = await createBackup("manual");
    createAuditLog({
      userId: user.id,
      action: "backup.created",
      target: result.filename,
      targetId: result.id,
      metadata: { sizeBytes: result.sizeBytes },
      ipAddress: requestIp(request),
    }).catch(() => {});return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
