-- AlterTable: Add autoRestartDaemons to Server
ALTER TABLE "Server" ADD COLUMN "autoRestartDaemons" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add agentCommandId to PendingRestart
ALTER TABLE "PendingRestart" ADD COLUMN "agentCommandId" TEXT;

-- CreateIndex
CREATE INDEX "PendingRestart_agentCommandId_idx" ON "PendingRestart"("agentCommandId");

-- CreateTable
CREATE TABLE "PackageDaemonMapping" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "packageManager" TEXT NOT NULL,
    "daemonName" TEXT NOT NULL,
    "daemonPid" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageDaemonMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackageDaemonMapping_serverId_packageName_packageManager_key" ON "PackageDaemonMapping"("serverId", "packageName", "packageManager");

-- CreateIndex
CREATE INDEX "PackageDaemonMapping_serverId_idx" ON "PackageDaemonMapping"("serverId");

-- AddForeignKey
ALTER TABLE "PackageDaemonMapping" ADD CONSTRAINT "PackageDaemonMapping_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
