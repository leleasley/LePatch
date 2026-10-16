-- Create BackupStatus enum
CREATE TYPE "BackupStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- Create Backup table
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'pending',
    "type" TEXT NOT NULL DEFAULT 'manual',
    "filename" TEXT NOT NULL,
    "filepath" TEXT NOT NULL,
    "sizeBytes" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- Create index on createdAt for listing
CREATE INDEX "Backup_createdAt_idx" ON "Backup"("createdAt");
