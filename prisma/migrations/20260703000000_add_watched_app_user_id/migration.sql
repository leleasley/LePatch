-- Add userId to WatchedApp for per-user app ownership

-- 1. Add column as nullable first
ALTER TABLE "WatchedApp" ADD COLUMN "userId" TEXT;

-- 2. Backfill existing rows — find creator from audit logs, fallback to first admin
UPDATE "WatchedApp" SET "userId" = (
  SELECT "userId" FROM "AuditLog"
  WHERE "AuditLog"."action" = 'app.created'
    AND "AuditLog"."targetId" = "WatchedApp"."id"
  ORDER BY "AuditLog"."createdAt" ASC
  LIMIT 1
);

UPDATE "WatchedApp" SET "userId" = (
  SELECT "id" FROM "User" WHERE "role" = 'administrator' ORDER BY "createdAt" ASC LIMIT 1
) WHERE "userId" IS NULL;

-- 3. Make it required
ALTER TABLE "WatchedApp" ALTER COLUMN "userId" SET NOT NULL;

-- 4. Add foreign key
ALTER TABLE "WatchedApp" ADD CONSTRAINT "WatchedApp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Drop global unique constraints (they conflict with per-user scoping)
DROP INDEX IF EXISTS "WatchedApp_slug_key";
DROP INDEX IF EXISTS "WatchedApp_repoFullName_key";

-- 6. Drop old index that we're replacing
DROP INDEX IF EXISTS "WatchedApp_repoOwner_repoName_idx";

-- 7. Create new per-user unique constraints
CREATE UNIQUE INDEX "WatchedApp_userId_slug_key" ON "WatchedApp"("userId", "slug");
CREATE UNIQUE INDEX "WatchedApp_userId_repoFullName_key" ON "WatchedApp"("userId", "repoFullName");

-- 8. Create new compound index for repo lookups scoped to user
CREATE INDEX "WatchedApp_userId_repoOwner_repoName_idx" ON "WatchedApp"("userId", "repoOwner", "repoName");

-- 9. Create index for userId lookups (used by the new relation)
CREATE INDEX "WatchedApp_userId_idx" ON "WatchedApp"("userId");
