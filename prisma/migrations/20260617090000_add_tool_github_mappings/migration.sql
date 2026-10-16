-- CreateTable
CREATE TABLE "ToolGitHubMapping" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolGitHubMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ToolGitHubMapping_name_key" ON "ToolGitHubMapping"("name");
