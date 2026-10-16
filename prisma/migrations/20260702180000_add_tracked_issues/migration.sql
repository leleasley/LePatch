-- CreateTable
CREATE TABLE "TrackedIssue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "issueNumber" INTEGER NOT NULL,
    "issueTitle" TEXT NOT NULL,
    "lastCommentCount" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackedIssue_owner_repo_issueNumber_key" ON "TrackedIssue"("owner", "repo", "issueNumber");

-- CreateIndex
CREATE INDEX "TrackedIssue_userId_idx" ON "TrackedIssue"("userId");

-- CreateIndex
CREATE INDEX "TrackedIssue_lastCheckedAt_idx" ON "TrackedIssue"("lastCheckedAt");

-- AddForeignKey
ALTER TABLE "TrackedIssue" ADD CONSTRAINT "TrackedIssue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN "issueComments" BOOLEAN NOT NULL DEFAULT true;
