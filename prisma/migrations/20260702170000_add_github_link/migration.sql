-- CreateTable
CREATE TABLE "GitHubLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "githubUserId" INTEGER NOT NULL,
    "githubUsername" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "GitHubLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubLink_userId_key" ON "GitHubLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubLink_githubUserId_key" ON "GitHubLink"("githubUserId");

-- AddForeignKey
ALTER TABLE "GitHubLink" ADD CONSTRAINT "GitHubLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
