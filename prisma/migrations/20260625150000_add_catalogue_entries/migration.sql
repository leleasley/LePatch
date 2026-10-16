-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "CatalogueEntry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "packageNames" TEXT[],
    "homepageUrl" TEXT,
    "logoUrl" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "featuredOrder" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "installCount" INTEGER NOT NULL DEFAULT 0,
    "addCount" INTEGER NOT NULL DEFAULT 0,
    "githubStars" INTEGER,
    "latestReleaseTag" TEXT,
    "latestReleaseAt" TIMESTAMP(3),
    "githubStatsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogueSuggestion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "packageNames" TEXT[],
    "submittedBy" TEXT,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogueSuggestion_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "WatchedApp" ADD COLUMN "catalogueEntryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueEntry_repoFullName_key" ON "CatalogueEntry"("repoFullName");

-- CreateIndex
CREATE INDEX "CatalogueEntry_category_idx" ON "CatalogueEntry"("category");

-- CreateIndex
CREATE INDEX "CatalogueEntry_featured_idx" ON "CatalogueEntry"("featured");

-- CreateIndex
CREATE INDEX "CatalogueEntry_isActive_idx" ON "CatalogueEntry"("isActive");

-- CreateIndex
CREATE INDEX "CatalogueSuggestion_status_idx" ON "CatalogueSuggestion"("status");

-- CreateIndex
CREATE INDEX "CatalogueSuggestion_submittedBy_idx" ON "CatalogueSuggestion"("submittedBy");

-- CreateIndex
CREATE INDEX "WatchedApp_catalogueEntryId_idx" ON "WatchedApp"("catalogueEntryId");

-- AddForeignKey
ALTER TABLE "CatalogueSuggestion" ADD CONSTRAINT "CatalogueSuggestion_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogueSuggestion" ADD CONSTRAINT "CatalogueSuggestion_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchedApp" ADD CONSTRAINT "WatchedApp_catalogueEntryId_fkey" FOREIGN KEY ("catalogueEntryId") REFERENCES "CatalogueEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
