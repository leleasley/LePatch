-- Release search, per-user feeds, security flags and per-repository filters.

-- Security-relevant releases are flagged when they are stored so the feed can
-- badge them and notifications can bypass quiet hours.
ALTER TABLE "Release" ADD COLUMN securityRelevant INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS Release_security_idx ON "Release"(securityRelevant);

-- A newline separated list of tag patterns this repository should not track,
-- for example "*-nightly" or "v3.*". Applied when a check stores releases.
ALTER TABLE "WatchedApp" ADD COLUMN excludeTags TEXT NOT NULL DEFAULT '';

-- Pausing notifications suppresses alerts until this time without dumping the
-- backlog when it ends.
ALTER TABLE "NotificationPreference" ADD COLUMN pausedUntil TEXT;

-- Revocable token so a user can read their releases from an RSS reader without
-- handing it a session cookie. Only the hash is stored.
CREATE TABLE IF NOT EXISTS "FeedToken" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  tokenHash TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastUsedAt TEXT
);
CREATE INDEX IF NOT EXISTS FeedToken_userId_idx ON "FeedToken"(userId);
