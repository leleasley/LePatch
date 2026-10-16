-- CreateEnum
CREATE TYPE "PendingRestartStatus" AS ENUM ('pending', 'approved', 'dismissed', 'expired', 'completed', 'failed');

-- CreateTable
CREATE TABLE "PendingRestart" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "updateJobId" TEXT NOT NULL,
    "processName" TEXT NOT NULL,
    "processPid" INTEGER NOT NULL,
    "processCmdline" TEXT,
    "status" "PendingRestartStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingRestart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingRestart_serverId_idx" ON "PendingRestart"("serverId");

-- CreateIndex
CREATE INDEX "PendingRestart_serverId_status_idx" ON "PendingRestart"("serverId", "status");

-- CreateIndex
CREATE INDEX "PendingRestart_updateJobId_idx" ON "PendingRestart"("updateJobId");

-- AddForeignKey
ALTER TABLE "PendingRestart" ADD CONSTRAINT "PendingRestart_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingRestart" ADD CONSTRAINT "PendingRestart_updateJobId_fkey" FOREIGN KEY ("updateJobId") REFERENCES "UpdateJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
