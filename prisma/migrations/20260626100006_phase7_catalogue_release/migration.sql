-- Phase 7: Catalogue And Release Intelligence

-- Add verified flag to CatalogueEntry
ALTER TABLE "CatalogueEntry" ADD COLUMN IF NOT EXISTS "verified" BOOLEAN NOT NULL DEFAULT false;

-- Add verified flag to ToolGitHubMapping
ALTER TABLE "ToolGitHubMapping" ADD COLUMN IF NOT EXISTS "verified" BOOLEAN NOT NULL DEFAULT false;

-- Add release classification fields to Release
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "releaseType" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "changelogSummary" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "changelogSections" JSONB;
