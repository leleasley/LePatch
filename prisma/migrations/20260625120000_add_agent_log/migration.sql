-- CreateTable
CREATE TABLE "AgentLog" (
    "id" BIGSERIAL NOT NULL,
    "serverId" TEXT,
    "isHostHelper" BOOLEAN NOT NULL DEFAULT false,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'agent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentLog_serverId_createdAt_idx" ON "AgentLog"("serverId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentLog_createdAt_idx" ON "AgentLog"("createdAt");

-- CreateIndex
CREATE INDEX "AgentLog_level_idx" ON "AgentLog"("level");

-- AddForeignKey
ALTER TABLE "AgentLog" ADD CONSTRAINT "AgentLog_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;
