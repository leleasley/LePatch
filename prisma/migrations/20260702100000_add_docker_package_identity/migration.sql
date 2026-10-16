ALTER TABLE "ServerPackage"
  ADD COLUMN "dockerRepo" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "dockerTag" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "dockerDigest" TEXT,
  ADD COLUMN "dockerRemoteDigest" TEXT,
  ADD COLUMN "dockerCheckedAt" TIMESTAMP(3),
  ADD COLUMN "dockerEnrichmentError" TEXT;

ALTER TABLE "ServerPackage"
  DROP CONSTRAINT IF EXISTS "ServerPackage_serverId_name_manager_key";

ALTER TABLE "ServerPackage"
  ADD CONSTRAINT "ServerPackage_serverId_name_manager_dockerRepo_dockerTag_key"
  UNIQUE ("serverId", "name", "manager", "dockerRepo", "dockerTag");

CREATE INDEX "ServerPackage_serverId_manager_dockerRepo_dockerTag_idx"
  ON "ServerPackage"("serverId", "manager", "dockerRepo", "dockerTag");
