import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAdmin, invalidateSettingsCache } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { syncBackupSchedule } from "@/lib/backup";
import { logger } from "@/lib/logger";

const patchSchema = z.object({
  appUrl: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  defaultCheckIntervalMinutes: z.number().int().min(1).max(10080).optional(),
  includePrereleases: z.boolean().optional(),
  timezone: z.string().optional(),
  sessionDurationHours: z.number().int().min(1).max(168).optional(),
  trustedDeviceDays: z.number().int().min(1).max(90).optional(),
  backupEnabled: z.string().optional(),
  backupScheduleTime: z.string().optional(),
  backupScheduleFrequency: z.string().optional(),
  backupScheduleDayOfWeek: z.string().optional(),
  backupScheduleDayOfMonth: z.string().optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    const systemSettings = await prisma.systemSetting.findMany();
    const settings: Record<string, string> = {};
    for (const s of systemSettings) {
      settings[s.key] = s.value;
    }
    return NextResponse.json({ settings });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    await requireAdmin();
    const body = patchSchema.parse(await request.json());
    const entries: { key: string; value: string }[] = [];
    if (body.appUrl !== undefined) entries.push({ key: "appUrl", value: body.appUrl });
    if (body.defaultCheckIntervalMinutes !== undefined) entries.push({ key: "defaultCheckIntervalMinutes", value: String(body.defaultCheckIntervalMinutes) });
    if (body.includePrereleases !== undefined) entries.push({ key: "includePrereleases", value: String(body.includePrereleases) });
    if (body.timezone !== undefined) entries.push({ key: "timezone", value: body.timezone });
    if (body.sessionDurationHours !== undefined) entries.push({ key: "sessionDurationHours", value: String(body.sessionDurationHours) });
    if (body.trustedDeviceDays !== undefined) entries.push({ key: "trustedDeviceDays", value: String(body.trustedDeviceDays) });
    if (body.backupEnabled !== undefined) entries.push({ key: "backupEnabled", value: body.backupEnabled });
    if (body.backupScheduleTime !== undefined) entries.push({ key: "backupScheduleTime", value: body.backupScheduleTime });
    if (body.backupScheduleFrequency !== undefined) entries.push({ key: "backupScheduleFrequency", value: body.backupScheduleFrequency });
    if (body.backupScheduleDayOfWeek !== undefined) entries.push({ key: "backupScheduleDayOfWeek", value: body.backupScheduleDayOfWeek });
    if (body.backupScheduleDayOfMonth !== undefined) entries.push({ key: "backupScheduleDayOfMonth", value: body.backupScheduleDayOfMonth });
    const hasBackupChanges = body.backupEnabled !== undefined || body.backupScheduleTime !== undefined || body.backupScheduleFrequency !== undefined || body.backupScheduleDayOfWeek !== undefined || body.backupScheduleDayOfMonth !== undefined;
    await Promise.all(
      entries.map(({ key, value }) =>
        prisma.systemSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      )
    );
    if (body.defaultCheckIntervalMinutes !== undefined) {
      await prisma.watchedApp.updateMany({
        data: { checkIntervalMinutes: body.defaultCheckIntervalMinutes },
      });
    }
    if (body.sessionDurationHours !== undefined) invalidateSettingsCache("sessionDurationHours");
    if (body.trustedDeviceDays !== undefined) invalidateSettingsCache("trustedDeviceDays");
    if (hasBackupChanges) {
      syncBackupSchedule().catch((err) => {
        logger.error("Failed to sync backup schedule", err);
      });
    }
    createAuditLog({ userId: (await getCurrentUser()).id, action: "settings.updated", metadata: { keys: entries.map(e => e.key) } }).catch(() => {});return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
