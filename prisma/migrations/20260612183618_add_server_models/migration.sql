-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('online', 'offline', 'unknown');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "UpdateJobStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "PackageManager" AS ENUM ('apt', 'yum', 'dnf', 'apk', 'brew', 'snap', 'flatpak', 'docker', 'npm', 'pip', 'cargo', 'binary');

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT,
    "os" TEXT,
    "osVersion" TEXT,
    "kernelVersion" TEXT,
    "agentVersion" TEXT,
    "status" "ServerStatus" NOT NULL DEFAULT 'unknown',
    "agentTokenHash" TEXT NOT NULL,
    "pairingCode" TEXT,
    "pairingCodeExpiresAt" TIMESTAMP(3),
    "pairedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "lastScanAt" TIMESTAMP(3),
    "scanIntervalMinutes" INTEGER NOT NULL DEFAULT 360,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isLePatchHost" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerPackage" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentVersion" TEXT,
    "latestVersion" TEXT,
    "manager" "PackageManager" NOT NULL,
    "updateAvailable" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerScan" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "packagesFound" INTEGER NOT NULL DEFAULT 0,
    "updatesFound" INTEGER NOT NULL DEFAULT 0,
    "status" "ScanStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "triggerSource" TEXT NOT NULL DEFAULT 'scheduled',

    CONSTRAINT "ServerScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpdateJob" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "packageManager" "PackageManager" NOT NULL,
    "previousVersion" TEXT,
    "targetVersion" TEXT,
    "status" "UpdateJobStatus" NOT NULL DEFAULT 'pending',
    "output" TEXT,
    "requestedBy" TEXT,
    "triggerSource" TEXT NOT NULL DEFAULT 'ui',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UpdateJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Server_agentTokenHash_key" ON "Server"("agentTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Server_pairingCode_key" ON "Server"("pairingCode");

-- CreateIndex
CREATE INDEX "Server_status_idx" ON "Server"("status");

-- CreateIndex
CREATE INDEX "Server_isLePatchHost_idx" ON "Server"("isLePatchHost");

-- CreateIndex
CREATE INDEX "Server_pairingCode_idx" ON "Server"("pairingCode");

-- CreateIndex
CREATE UNIQUE INDEX "ServerPackage_serverId_name_manager_key" ON "ServerPackage"("serverId", "name", "manager");

-- CreateIndex
CREATE INDEX "ServerPackage_serverId_idx" ON "ServerPackage"("serverId");

-- CreateIndex
CREATE INDEX "ServerPackage_updateAvailable_idx" ON "ServerPackage"("updateAvailable");

-- CreateIndex
CREATE INDEX "ServerScan_serverId_idx" ON "ServerScan"("serverId");

-- CreateIndex
CREATE INDEX "ServerScan_status_idx" ON "ServerScan"("status");

-- CreateIndex
CREATE INDEX "UpdateJob_serverId_idx" ON "UpdateJob"("serverId");

-- CreateIndex
CREATE INDEX "UpdateJob_status_idx" ON "UpdateJob"("status");

-- AddForeignKey
ALTER TABLE "ServerPackage" ADD CONSTRAINT "ServerPackage_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerScan" ADD CONSTRAINT "ServerScan_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpdateJob" ADD CONSTRAINT "UpdateJob_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
