DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Server")
     AND NOT EXISTS (SELECT 1 FROM "User") THEN
    RAISE EXCEPTION 'Cannot backfill Server.userId because no users exist';
  END IF;
END $$;

ALTER TABLE "Server" ADD COLUMN "userId" TEXT;

UPDATE "Server"
SET "userId" = COALESCE(
  (
    SELECT "id"
    FROM "User"
    WHERE "role" = 'admin'
    ORDER BY "createdAt" ASC
    LIMIT 1
  ),
  (
    SELECT "id"
    FROM "User"
    ORDER BY "createdAt" ASC
    LIMIT 1
  )
)
WHERE "userId" IS NULL;

ALTER TABLE "Server" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "Server" ADD CONSTRAINT "Server_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "Server_name_key";
CREATE UNIQUE INDEX "Server_userId_name_key" ON "Server"("userId", "name");
CREATE INDEX "Server_userId_idx" ON "Server"("userId");

