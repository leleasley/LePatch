-- AlterTable
ALTER TABLE "ToolGitHubMapping" ADD COLUMN "lastCheckedTag" TEXT;
ALTER TABLE "ToolGitHubMapping" ADD COLUMN "lastCheckedAt" TIMESTAMPTZ;
