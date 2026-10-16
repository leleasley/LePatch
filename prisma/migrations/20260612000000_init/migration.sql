CREATE TYPE "CheckStatus" AS ENUM ('never', 'success', 'failed', 'no_releases');
CREATE TYPE "NotificationType" AS ENUM ('discord', 'telegram');
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WatchedApp" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "repoOwner" TEXT NOT NULL,
  "repoName" TEXT NOT NULL,
  "repoFullName" TEXT NOT NULL,
  "githubUrl" TEXT NOT NULL,
  "description" TEXT,
  "homepageUrl" TEXT,
  "latestSeenReleaseId" TEXT,
  "latestSeenTag" TEXT,
  "lastNotifiedReleaseId" TEXT,
  "lastNotifiedTag" TEXT,
  "includePrereleases" BOOLEAN NOT NULL DEFAULT false,
  "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "updateAvailable" BOOLEAN NOT NULL DEFAULT false,
  "checkIntervalMinutes" INTEGER NOT NULL DEFAULT 360,
  "lastCheckedAt" TIMESTAMP(3),
  "checkStatus" "CheckStatus" NOT NULL DEFAULT 'never',
  "checkError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WatchedApp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Release" (
  "id" TEXT NOT NULL,
  "watchedAppId" TEXT NOT NULL,
  "githubReleaseId" TEXT NOT NULL,
  "tagName" TEXT NOT NULL,
  "name" TEXT,
  "body" TEXT,
  "htmlUrl" TEXT NOT NULL,
  "prerelease" BOOLEAN NOT NULL,
  "draft" BOOLEAN NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ignored" BOOLEAN NOT NULL DEFAULT false,
  "notificationSent" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationChannel" (
  "id" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "configJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationEvent" (
  "id" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "WatchedApp_slug_key" ON "WatchedApp"("slug");
CREATE UNIQUE INDEX "WatchedApp_repoFullName_key" ON "WatchedApp"("repoFullName");
CREATE INDEX "WatchedApp_repoOwner_repoName_idx" ON "WatchedApp"("repoOwner", "repoName");
CREATE INDEX "WatchedApp_updateAvailable_idx" ON "WatchedApp"("updateAvailable");
CREATE UNIQUE INDEX "Release_watchedAppId_githubReleaseId_key" ON "Release"("watchedAppId", "githubReleaseId");
CREATE INDEX "Release_watchedAppId_publishedAt_idx" ON "Release"("watchedAppId", "publishedAt");
CREATE UNIQUE INDEX "NotificationChannel_type_name_key" ON "NotificationChannel"("type", "name");
CREATE INDEX "NotificationEvent_status_idx" ON "NotificationEvent"("status");

ALTER TABLE "Release" ADD CONSTRAINT "Release_watchedAppId_fkey" FOREIGN KEY ("watchedAppId") REFERENCES "WatchedApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
