-- Remove the catalogue subsystem.
--
-- The catalogue was a curated repo list with its own models, stats queue and
-- admin review workflow. It duplicated GitHub search, never showed release
-- data the app did not already have, and required unbounded SSR reads plus two
-- live GitHub calls per page view. The app is release-tracking only now.
--
-- WatchedApp.catalogueEntryId is dropped along with the tables. Existing
-- watched apps are unaffected: they only ever referenced entries for counters.

DROP TABLE IF EXISTS "CatalogueSuggestion";
DROP TABLE IF EXISTS "CatalogueEntry";

-- Retention/supporting indexes added in the same change set:
--   * WatchedApp.lastCheckedAt  — the worker scheduler's ordering column
--   * Release.detectedAt        — release pruning job
--   * NotificationEvent.createdAt — every delivery-history query orders by it
CREATE INDEX IF NOT EXISTS "WatchedApp_lastCheckedAt_idx" ON "WatchedApp"("lastCheckedAt");
CREATE INDEX IF NOT EXISTS "Release_detectedAt_idx" ON "Release"("detectedAt");
CREATE INDEX IF NOT EXISTS "NotificationEvent_createdAt_idx" ON "NotificationEvent"("createdAt");