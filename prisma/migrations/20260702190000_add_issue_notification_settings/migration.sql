-- CreateTable
CREATE TABLE "IssueNotificationSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "issueNumber" INTEGER NOT NULL,
    "issueTitle" TEXT NOT NULL DEFAULT '',
    "level" TEXT NOT NULL,
    "lastCommentCount" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueNotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IssueNotificationSetting_userId_owner_repo_issueNumber_key" ON "IssueNotificationSetting"("userId", "owner", "repo", "issueNumber");

-- CreateIndex
CREATE INDEX "IssueNotificationSetting_userId_idx" ON "IssueNotificationSetting"("userId");

-- CreateIndex
CREATE INDEX "IssueNotificationSetting_owner_repo_issueNumber_idx" ON "IssueNotificationSetting"("owner", "repo", "issueNumber");

-- CreateIndex
CREATE INDEX "IssueNotificationSetting_lastCheckedAt_idx" ON "IssueNotificationSetting"("lastCheckedAt");

-- AddForeignKey
ALTER TABLE "IssueNotificationSetting" ADD CONSTRAINT "IssueNotificationSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
