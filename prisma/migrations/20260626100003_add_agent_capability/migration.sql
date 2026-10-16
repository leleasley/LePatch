-- Add AgentCapability model
CREATE TABLE "AgentCapability" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCapability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentCapability_serverId_name_key" ON "AgentCapability"("serverId", "name");
CREATE INDEX IF NOT EXISTS "AgentCapability_serverId_idx" ON "AgentCapability"("serverId");
ALTER TABLE "AgentCapability" ADD CONSTRAINT "AgentCapability_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE;
