-- One notification event per release+channel so concurrent checks can never double-notify.
-- First collapse the few historical duplicates, keeping the earliest row per pair.
DELETE FROM "NotificationEvent" a USING "NotificationEvent" b
WHERE a."releaseId" = b."releaseId"
  AND a."channelId" = b."channelId"
  AND (a."createdAt" > b."createdAt" OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationEvent_releaseId_channelId_key" ON "NotificationEvent"("releaseId", "channelId");
