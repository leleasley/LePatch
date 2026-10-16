import { execSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getBackupQueue } from "@/lib/queues";

const BACKUP_DIR = "/app/data/backups";

function ensureBackupDir() {
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function serializeBackup(backup: { sizeBytes: bigint | null | number; [key: string]: unknown }) {
  return { ...backup, sizeBytes: backup.sizeBytes == null ? null : Number(backup.sizeBytes) };
}

export async function createBackup(type: "manual" | "scheduled" = "manual") {
  ensureBackupDir();

  const record = await prisma.backup.create({
    data: { status: "running", type, filename: "", filepath: "" },
  });

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `lepatch-backup-${timestamp}.sql.gz`;
    const filepath = join(BACKUP_DIR, filename);

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("DATABASE_URL not set");

    execSync(`pg_dump "${dbUrl}" --no-owner --no-acl | gzip > "${filepath}"`, {
      timeout: 120_000,
      stdio: "pipe",
    });

    const stats = await stat(filepath);
    const sizeBytes = stats.size;

    await prisma.backup.update({
      where: { id: record.id },
      data: {
        status: "completed",
        filename,
        filepath,
        sizeBytes,
        completedAt: new Date(),
      },
    });

    await enforceMaxBackups();

    logger.info("Backup completed", { id: record.id, filename, sizeBytes });
    return { id: record.id, filename, sizeBytes: Number(sizeBytes) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backup failed";
    await prisma.backup.update({
      where: { id: record.id },
      data: { status: "failed", error: message, completedAt: new Date() },
    });
    logger.error("Backup failed", { id: record.id, error: message });
    throw new Error(message);
  }
}

async function enforceMaxBackups() {
  const maxCount = 5;
  const backups = await prisma.backup.findMany({
    where: { status: "completed" },
    orderBy: { createdAt: "desc" },
    select: { id: true, filepath: true },
  });

  if (backups.length <= maxCount) return;

  const toDelete = backups.slice(maxCount);
  for (const backup of toDelete) {
    try {
      if (backup.filepath && existsSync(backup.filepath)) {
        unlinkSync(backup.filepath);
      }
    } catch (err) {
      logger.warn("Failed to delete old backup file", { id: backup.id, error: String(err) });
    }
    await prisma.backup.delete({ where: { id: backup.id } }).catch(() => {});
  }
}

export async function deleteBackup(id: string) {
  const backup = await prisma.backup.findUnique({ where: { id } });
  if (!backup) throw new Error("Backup not found");

  try {
    if (backup.filepath && existsSync(backup.filepath)) {
      unlinkSync(backup.filepath);
    }
  } catch (err) {
    logger.warn("Failed to delete backup file", { id, error: String(err) });
  }

  await prisma.backup.delete({ where: { id } });
}

export async function listBackups() {
  const backups = await prisma.backup.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return backups.map(serializeBackup);
}

export async function getBackupStats() {
  const [total, completed, failed, running] = await Promise.all([
    prisma.backup.count(),
    prisma.backup.count({ where: { status: "completed" } }),
    prisma.backup.count({ where: { status: "failed" } }),
    prisma.backup.count({ where: { status: "running" } }),
  ]);

  const lastBackup = await prisma.backup.findFirst({
    where: { status: "completed" },
    orderBy: { createdAt: "desc" },
  });

  return { total, completed, failed, running, lastBackupAt: lastBackup?.createdAt ?? null };
}

function getEuropeLondonOffsetMinutes(date: Date): number {
  const utcMs = date.getTime();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const local = new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((local.getTime() - utcMs) / 60000);
}

export function computeNextBackup(config: {
  enabled: boolean;
  scheduleTime: string;
  frequency: string;
  dayOfWeek?: string | null;
  dayOfMonth?: string | null;
}): Date | null {
  if (!config.enabled) return null;
  const [hour, minute] = config.scheduleTime.split(":").map(Number);
  if (isNaN(hour) || isNaN(minute)) return null;

  const now = new Date();
  const offsetMin = getEuropeLondonOffsetMinutes(now);
  const utcHour = hour - Math.floor(offsetMin / 60);
  const utcMin = minute - (offsetMin % 60);

  const candidate = new Date(now);
  candidate.setUTCHours(utcHour, utcMin, 0, 0);

  const dayOfWeekLocal = config.dayOfWeek === "daily" ? null : config.dayOfWeek;
  const effectiveFreq = dayOfWeekLocal ? "weekly" : config.frequency;

  for (let attempt = 0; attempt < 366; attempt++) {
    if (candidate > now) {
      switch (effectiveFreq) {
        case "weekly": {
          const targetDow = parseInt(dayOfWeekLocal || "0", 10);
          if (candidate.getUTCDay() === targetDow) return candidate;
          break;
        }
        case "monthly": {
          const targetDom = parseInt(config.dayOfMonth || "1", 10);
          if (candidate.getUTCDate() === targetDom) return candidate;
          break;
        }
        default:
          return candidate;
      }
    }
    candidate.setUTCDate(candidate.getUTCDate() + 1);
    candidate.setUTCHours(utcHour, utcMin, 0, 0);
  }
  return null;
}

export async function getBackupScheduleConfig(): Promise<{
  enabled: boolean;
  scheduleTime: string;
  frequency: string;
  dayOfWeek: string | null;
  dayOfMonth: string | null;
}> {
  const [enabledSetting, timeSetting, freqSetting, dowSetting, domSetting] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: "backupEnabled" }, select: { value: true } }),
    prisma.systemSetting.findUnique({ where: { key: "backupScheduleTime" }, select: { value: true } }),
    prisma.systemSetting.findUnique({ where: { key: "backupScheduleFrequency" }, select: { value: true } }),
    prisma.systemSetting.findUnique({ where: { key: "backupScheduleDayOfWeek" }, select: { value: true } }),
    prisma.systemSetting.findUnique({ where: { key: "backupScheduleDayOfMonth" }, select: { value: true } }),
  ]);

  return {
    enabled: enabledSetting?.value === "true",
    scheduleTime: timeSetting?.value || "03:00",
    frequency: freqSetting?.value || "daily",
    dayOfWeek: dowSetting?.value ?? null,
    dayOfMonth: domSetting?.value ?? null,
  };
}

export async function downloadBackup(id: string) {
  const backup = await prisma.backup.findUnique({ where: { id } });
  if (!backup) throw new Error("Backup not found");
  if (!backup.filepath || !existsSync(backup.filepath)) throw new Error("Backup file not found on disk");
  return { filepath: backup.filepath, filename: backup.filename };
}

type BackupScheduleConfig = {
  backupScheduleTime: string;
  backupScheduleFrequency: string;
  backupScheduleDayOfWeek?: string | null;
  backupScheduleDayOfMonth?: string | null;
};

export function buildBackupCron(config: BackupScheduleConfig): string | null {
  const [hour, minute] = config.backupScheduleTime.split(":").map(Number);
  if (isNaN(hour) || isNaN(minute)) return null;

  if (config.backupScheduleDayOfWeek === "daily") {
    return `${minute} ${hour} * * *`;
  }

  switch (config.backupScheduleFrequency) {
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly":
      return `${minute} ${hour} * * ${config.backupScheduleDayOfWeek || "0"}`;
    case "monthly":
      return `${minute} ${hour} ${config.backupScheduleDayOfMonth || "1"} * *`;
    default:
      return null;
  }
}

export async function syncBackupSchedule() {
  try {
    const queue = getBackupQueue();
    const existing = await queue.getRepeatableJobs();
    for (const job of existing) {
      if (job.name === "backup") {
        await queue.removeRepeatableByKey(job.key);
      }
    }

    const enabledSetting = await prisma.systemSetting.findUnique({
      where: { key: "backupEnabled" },
      select: { value: true },
    });
    if (enabledSetting?.value !== "true") {
      logger.info("Backup schedule cleared (disabled)");
      return;
    }

    const [timeSetting, freqSetting, dowSetting, domSetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: "backupScheduleTime" }, select: { value: true } }),
      prisma.systemSetting.findUnique({ where: { key: "backupScheduleFrequency" }, select: { value: true } }),
      prisma.systemSetting.findUnique({ where: { key: "backupScheduleDayOfWeek" }, select: { value: true } }),
      prisma.systemSetting.findUnique({ where: { key: "backupScheduleDayOfMonth" }, select: { value: true } }),
    ]);

    const cron = buildBackupCron({
      backupScheduleTime: timeSetting?.value || "03:00",
      backupScheduleFrequency: freqSetting?.value || "daily",
      backupScheduleDayOfWeek: dowSetting?.value,
      backupScheduleDayOfMonth: domSetting?.value,
    });

    if (!cron) {
      logger.warn("Backup schedule: invalid cron pattern");
      return;
    }

    await queue.add("backup", { type: "scheduled" }, {
      repeat: { pattern: cron, tz: "Europe/London" },
      jobId: "backup-schedule",
      removeOnComplete: 1,
      removeOnFail: 1,
    });

    logger.info("Backup schedule registered", { cron });
  } catch (err) {
    logger.error("Failed to sync backup schedule", err instanceof Error ? err : new Error(String(err)));
  }
}
