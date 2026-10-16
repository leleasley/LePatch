-- Add AlertHistory model
CREATE TABLE "AlertHistory" (
    "id" TEXT NOT NULL,
    "serverId" TEXT,
    "alertType" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AlertHistory_serverId_createdAt_idx" ON "AlertHistory"("serverId", "createdAt");
CREATE INDEX IF NOT EXISTS "AlertHistory_createdAt_idx" ON "AlertHistory"("createdAt");
CREATE INDEX IF NOT EXISTS "AlertHistory_alertType_idx" ON "AlertHistory"("alertType");
ALTER TABLE "AlertHistory" ADD CONSTRAINT "AlertHistory_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL;
