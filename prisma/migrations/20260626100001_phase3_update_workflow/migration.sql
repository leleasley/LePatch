-- Phase 3: Update Workflow
-- Adds maintenance windows, staged rollouts, update proposals, risk scoring, rollback info, and package dependency mapping

-- New enums
CREATE TYPE "ProposalStatus" AS ENUM ('pending', 'approved', 'rejected', 'applied', 'cancelled');
CREATE TYPE "DayOfWeek" AS ENUM ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday');

-- New fields on ServerPackage
ALTER TABLE "ServerPackage" ADD COLUMN IF NOT EXISTS "riskScore" INTEGER;
ALTER TABLE "ServerPackage" ADD COLUMN IF NOT EXISTS "riskFactors" TEXT;
ALTER TABLE "ServerPackage" ADD COLUMN IF NOT EXISTS "previousVersion" TEXT;
ALTER TABLE "ServerPackage" ADD COLUMN IF NOT EXISTS "rollbackCommand" TEXT;
ALTER TABLE "ServerPackage" ADD COLUMN IF NOT EXISTS "changelogUrl" TEXT;

-- RolloutGroup model
CREATE TABLE "RolloutGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolloutGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RolloutGroup_name_key" ON "RolloutGroup"("name");

-- Add rolloutGroupId to Server
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "rolloutGroupId" TEXT;
CREATE INDEX IF NOT EXISTS "Server_rolloutGroupId_idx" ON "Server"("rolloutGroupId");
ALTER TABLE "Server" ADD CONSTRAINT "Server_rolloutGroupId_fkey" FOREIGN KEY ("rolloutGroupId") REFERENCES "RolloutGroup"("id") ON DELETE SET NULL;

-- MaintenanceWindow model
CREATE TABLE "MaintenanceWindow" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek",
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceWindow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MaintenanceWindow_serverId_idx" ON "MaintenanceWindow"("serverId");
ALTER TABLE "MaintenanceWindow" ADD CONSTRAINT "MaintenanceWindow_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE;

-- UpdateProposal model
CREATE TABLE "UpdateProposal" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "packageManager" "PackageManager" NOT NULL,
    "currentVersion" TEXT,
    "proposedVersion" TEXT,
    "riskScore" INTEGER,
    "riskFactors" TEXT,
    "status" "ProposalStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "appliedAt" TIMESTAMP(3),
    "appliedJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UpdateProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UpdateProposal_serverId_status_idx" ON "UpdateProposal"("serverId", "status");
CREATE INDEX IF NOT EXISTS "UpdateProposal_serverId_idx" ON "UpdateProposal"("serverId");
ALTER TABLE "UpdateProposal" ADD CONSTRAINT "UpdateProposal_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE;

-- PackageDependency model
CREATE TABLE "PackageDependency" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "manager" "PackageManager" NOT NULL,
    "dependsOnName" TEXT NOT NULL,
    "dependsOnManager" "PackageManager",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageDependency_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PackageDependency_serverId_packageName_idx" ON "PackageDependency"("serverId", "packageName");
CREATE UNIQUE INDEX IF NOT EXISTS "PackageDependency_serverId_packageName_dependsOnName_key" ON "PackageDependency"("serverId", "packageName", "dependsOnName");
ALTER TABLE "PackageDependency" ADD CONSTRAINT "PackageDependency_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE;
