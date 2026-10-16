-- Add NotificationPreference model
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "digestInterval" INTEGER,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "severityFilters" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
