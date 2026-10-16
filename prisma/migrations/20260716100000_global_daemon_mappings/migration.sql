-- AlterTable: Remove serverId and daemonPid from PackageDaemonMapping, make it global

-- Deduplicate: keep only one row per (packageName, packageManager)
DELETE FROM "PackageDaemonMapping" WHERE id NOT IN (
  SELECT MIN(id) FROM "PackageDaemonMapping" GROUP BY "packageName", "packageManager"
);

-- Drop foreign key constraint
ALTER TABLE "PackageDaemonMapping" DROP CONSTRAINT IF EXISTS "PackageDaemonMapping_serverId_fkey";

-- Drop columns
ALTER TABLE "PackageDaemonMapping" DROP COLUMN IF EXISTS "serverId";
ALTER TABLE "PackageDaemonMapping" DROP COLUMN IF EXISTS "daemonPid";

-- Drop old unique index and create new one
DROP INDEX IF EXISTS "PackageDaemonMapping_serverId_packageName_packageManager_key";
CREATE UNIQUE INDEX IF NOT EXISTS "PackageDaemonMapping_packageName_packageManager_key" ON "PackageDaemonMapping"("packageName", "packageManager");

-- Drop old serverId index
DROP INDEX IF EXISTS "PackageDaemonMapping_serverId_idx";
