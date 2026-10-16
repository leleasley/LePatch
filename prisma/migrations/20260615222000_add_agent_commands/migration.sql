-- CreateEnum
CREATE TYPE "AgentCommandStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "AgentCommand" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT,
    "status" "AgentCommandStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentCommand_serverId_idx" ON "AgentCommand"("serverId");

-- CreateIndex
CREATE INDEX "AgentCommand_serverId_status_idx" ON "AgentCommand"("serverId", "status");

-- CreateIndex
CREATE INDEX "AgentCommand_type_status_idx" ON "AgentCommand"("type", "status");

-- AddForeignKey
ALTER TABLE "AgentCommand" ADD CONSTRAINT "AgentCommand_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
