-- AlterTable: Add monitoring columns to Server
ALTER TABLE "Server" ADD COLUMN "cpuUsagePercent" DOUBLE PRECISION,
ADD COLUMN "memoryUsagePercent" DOUBLE PRECISION,
ADD COLUMN "diskUsagePercent" DOUBLE PRECISION,
ADD COLUMN "uptimeSeconds" INTEGER,
ADD COLUMN "processCount" INTEGER,
ADD COLUMN "publicIp" TEXT,
ADD COLUMN "privateIp" TEXT,
ADD COLUMN "loadAvg1" DOUBLE PRECISION,
ADD COLUMN "loadAvg5" DOUBLE PRECISION,
ADD COLUMN "loadAvg15" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ServerMetric" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "cpuModel" TEXT,
    "cpuCores" INTEGER,
    "cpuUsagePercent" DOUBLE PRECISION,
    "totalMemoryGb" DOUBLE PRECISION,
    "usedMemoryGb" DOUBLE PRECISION,
    "memoryUsagePercent" DOUBLE PRECISION,
    "totalDiskGb" DOUBLE PRECISION,
    "usedDiskGb" DOUBLE PRECISION,
    "diskUsagePercent" DOUBLE PRECISION,
    "uptimeSeconds" INTEGER,
    "processCount" INTEGER,
    "publicIp" TEXT,
    "privateIp" TEXT,
    "loadAvg1" DOUBLE PRECISION,
    "loadAvg5" DOUBLE PRECISION,
    "loadAvg15" DOUBLE PRECISION,
    "agentMemoryMb" DOUBLE PRECISION,
    "agentCpuPercent" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerAlertConfig" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cpuThreshold" INTEGER NOT NULL DEFAULT 90,
    "memoryThreshold" INTEGER NOT NULL DEFAULT 90,
    "diskThreshold" INTEGER NOT NULL DEFAULT 90,
    "offlineMinutes" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerAlertConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerAlertCooldown" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "alertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerAlertCooldown_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerMetric_serverId_recordedAt_idx" ON "ServerMetric"("serverId", "recordedAt");

-- CreateIndex
CREATE INDEX "ServerMetric_recordedAt_idx" ON "ServerMetric"("recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServerAlertConfig_serverId_key" ON "ServerAlertConfig"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerAlertCooldown_serverId_alertType_key" ON "ServerAlertCooldown"("serverId", "alertType");

-- CreateIndex
CREATE INDEX "ServerAlertCooldown_serverId_idx" ON "ServerAlertCooldown"("serverId");

-- CreateIndex
CREATE INDEX "ServerAlertCooldown_expiresAt_idx" ON "ServerAlertCooldown"("expiresAt");
