ALTER TABLE "NotificationEvent" ADD COLUMN attemptCount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NotificationEvent" ADD COLUMN nextAttemptAt TEXT;
CREATE INDEX NotificationEvent_due_idx ON "NotificationEvent"(status,nextAttemptAt,createdAt);
