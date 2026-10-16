import { Queue } from "bullmq";
import { env } from "@/lib/env";

export function redisConnection() {
  const url = new URL(env.redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : undefined,
    maxRetriesPerRequest: null
  };
}

let releaseCheckQueue: Queue<ReleaseCheckJob> | undefined;
let notificationSendQueue: Queue<NotificationSendJob> | undefined;
let catalogueStatsQueue: Queue<CatalogueStatsJob> | undefined;
let issueCommentCheckQueue: Queue<IssueCommentCheckJob> | undefined;
let backupQueue: Queue<BackupJob> | undefined;

export function getReleaseCheckQueue() {
  releaseCheckQueue ||= new Queue<ReleaseCheckJob>("release-check", { connection: redisConnection() });
  return releaseCheckQueue;
}

export function getNotificationSendQueue() {
  notificationSendQueue ||= new Queue<NotificationSendJob>("notification-send", { connection: redisConnection() });
  return notificationSendQueue;
}

export function getCatalogueStatsQueue() {
  catalogueStatsQueue ||= new Queue<CatalogueStatsJob>("catalogue-stats", { connection: redisConnection() });
  return catalogueStatsQueue;
}

export function getIssueCommentCheckQueue() {
  issueCommentCheckQueue ||= new Queue<IssueCommentCheckJob>("issue-comment-check", { connection: redisConnection() });
  return issueCommentCheckQueue;
}

export type ReleaseCheckJob = { watchedAppId: string; manual?: boolean };
export type NotificationSendJob = { eventId: string };
export type CatalogueStatsJob = { entryId: string; repoFullName: string };

export type IssueCommentCheckJob = { trackedIssueId: string };

export type BackupJob = { type: "scheduled" };

export function getBackupQueue() {
  backupQueue ||= new Queue<BackupJob>("backup", { connection: redisConnection() });
  return backupQueue;
}
