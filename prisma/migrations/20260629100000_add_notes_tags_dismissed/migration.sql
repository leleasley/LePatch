-- AlterTable: Add notes field to Server
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- CreateTable: Tag
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateTable: ServerTag
CREATE TABLE "ServerTag" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServerTag_serverId_tagId_key" ON "ServerTag"("serverId", "tagId");
CREATE INDEX "ServerTag_serverId_idx" ON "ServerTag"("serverId");
CREATE INDEX "ServerTag_tagId_idx" ON "ServerTag"("tagId");
ALTER TABLE "ServerTag" ADD CONSTRAINT "ServerTag_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE;
ALTER TABLE "ServerTag" ADD CONSTRAINT "ServerTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE;

-- CreateTable: DismissedFailedPackage
CREATE TABLE "DismissedFailedPackage" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DismissedFailedPackage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DismissedFailedPackage_serverId_packageName_key" ON "DismissedFailedPackage"("serverId", "packageName");
CREATE INDEX "DismissedFailedPackage_serverId_idx" ON "DismissedFailedPackage"("serverId");
ALTER TABLE "DismissedFailedPackage" ADD CONSTRAINT "DismissedFailedPackage_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE;
