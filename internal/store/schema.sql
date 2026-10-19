CREATE TABLE IF NOT EXISTS "User" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  passwordEnabled INTEGER NOT NULL DEFAULT 1,
  role TEXT NOT NULL DEFAULT 'user',
  theme TEXT NOT NULL DEFAULT 'dark',
  totpSecret TEXT,
  totpEnabled INTEGER NOT NULL DEFAULT 0,
  totpBackupCodes TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Session" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  tokenHash TEXT NOT NULL UNIQUE,
  expiresAt TEXT NOT NULL,
  lastUsedAt TEXT,
  userAgent TEXT,
  ipAddress TEXT,
  deviceName TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS Session_userId_idx ON "Session"(userId);
CREATE INDEX IF NOT EXISTS Session_expiresAt_idx ON "Session"(expiresAt);

CREATE TABLE IF NOT EXISTS "TrustedDevice" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  tokenHash TEXT NOT NULL UNIQUE,
  name TEXT,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS TrustedDevice_userId_idx ON "TrustedDevice"(userId);
CREATE INDEX IF NOT EXISTS TrustedDevice_expiresAt_idx ON "TrustedDevice"(expiresAt);

CREATE TABLE IF NOT EXISTS "PasskeyCredential" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  credentialId TEXT NOT NULL UNIQUE,
  publicKey BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]',
  deviceName TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastUsedAt TEXT
);
CREATE INDEX IF NOT EXISTS PasskeyCredential_userId_idx ON "PasskeyCredential"(userId);

CREATE TABLE IF NOT EXISTS "WatchedApp" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  repoOwner TEXT NOT NULL,
  repoName TEXT NOT NULL,
  repoFullName TEXT NOT NULL,
  githubUrl TEXT NOT NULL,
  description TEXT,
  homepageUrl TEXT,
  latestSeenReleaseId TEXT,
  latestSeenTag TEXT,
  lastNotifiedReleaseId TEXT,
  lastNotifiedTag TEXT,
  includePrereleases INTEGER NOT NULL DEFAULT 0,
  notificationsEnabled INTEGER NOT NULL DEFAULT 1,
  updateAvailable INTEGER NOT NULL DEFAULT 0,
  checkIntervalMinutes INTEGER NOT NULL DEFAULT 360,
  lastCheckedAt TEXT,
  checkStatus TEXT NOT NULL DEFAULT 'never',
  checkError TEXT,
  userId TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(userId, slug),
  UNIQUE(userId, repoFullName)
);
CREATE INDEX IF NOT EXISTS WatchedApp_user_repo_idx ON "WatchedApp"(userId, repoOwner, repoName);
CREATE INDEX IF NOT EXISTS WatchedApp_updateAvailable_idx ON "WatchedApp"(updateAvailable);
CREATE INDEX IF NOT EXISTS WatchedApp_lastCheckedAt_idx ON "WatchedApp"(lastCheckedAt);

CREATE TABLE IF NOT EXISTS "Release" (
  id TEXT PRIMARY KEY,
  watchedAppId TEXT NOT NULL REFERENCES "WatchedApp"(id) ON DELETE CASCADE,
  githubReleaseId TEXT NOT NULL,
  tagName TEXT NOT NULL,
  name TEXT,
  body TEXT,
  htmlUrl TEXT NOT NULL,
  prerelease INTEGER NOT NULL,
  draft INTEGER NOT NULL,
  releaseType TEXT,
  changelogSummary TEXT,
  changelogSections TEXT,
  publishedAt TEXT,
  detectedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ignored INTEGER NOT NULL DEFAULT 0,
  notificationSent INTEGER NOT NULL DEFAULT 0,
  UNIQUE(watchedAppId, githubReleaseId)
);
CREATE INDEX IF NOT EXISTS Release_app_published_idx ON "Release"(watchedAppId, publishedAt);
CREATE INDEX IF NOT EXISTS Release_detectedAt_idx ON "Release"(detectedAt);

CREATE TABLE IF NOT EXISTS "NotificationChannel" (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  configJson TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(type, name)
);

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  digestInterval INTEGER,
  quietHoursStart TEXT,
  quietHoursEnd TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  severityFilters TEXT,
  issueComments INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "NotificationEvent" (
  id TEXT PRIMARY KEY,
  releaseId TEXT NOT NULL REFERENCES "Release"(id) ON DELETE CASCADE,
  channelId TEXT NOT NULL REFERENCES "NotificationChannel"(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  sentAt TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(releaseId, channelId)
);
CREATE INDEX IF NOT EXISTS NotificationEvent_status_idx ON "NotificationEvent"(status);
CREATE INDEX IF NOT EXISTS NotificationEvent_createdAt_idx ON "NotificationEvent"(createdAt);

CREATE TABLE IF NOT EXISTS "SystemSetting" (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  encrypted INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "IntegrationSetting" (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  encrypted INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, key)
);
CREATE INDEX IF NOT EXISTS IntegrationSetting_provider_idx ON "IntegrationSetting"(provider);

CREATE TABLE IF NOT EXISTS "TelegramLink" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE CASCADE,
  telegramUserId TEXT NOT NULL UNIQUE,
  chatId TEXT NOT NULL UNIQUE,
  username TEXT,
  firstName TEXT,
  lastName TEXT,
  linkedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastSeenAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS TelegramLink_chatId_idx ON "TelegramLink"(chatId);

CREATE TABLE IF NOT EXISTS "TelegramLinkToken" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  tokenHash TEXT NOT NULL UNIQUE,
  expiresAt TEXT NOT NULL,
  usedAt TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS TelegramLinkToken_user_expiry_idx ON "TelegramLinkToken"(userId, expiresAt);

CREATE TABLE IF NOT EXISTS "GitHubLink" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE CASCADE,
  githubUserId INTEGER NOT NULL UNIQUE,
  githubUsername TEXT NOT NULL,
  accessToken TEXT NOT NULL,
  linkedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastUsedAt TEXT
);

CREATE TABLE IF NOT EXISTS "TrackedIssue" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  issueNumber INTEGER NOT NULL,
  issueTitle TEXT NOT NULL,
  lastCommentCount INTEGER NOT NULL DEFAULT 0,
  lastCheckedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner, repo, issueNumber)
);
CREATE INDEX IF NOT EXISTS TrackedIssue_userId_idx ON "TrackedIssue"(userId);
CREATE INDEX IF NOT EXISTS TrackedIssue_lastCheckedAt_idx ON "TrackedIssue"(lastCheckedAt);

CREATE TABLE IF NOT EXISTS "IssueNotificationSetting" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  issueNumber INTEGER NOT NULL,
  issueTitle TEXT NOT NULL,
  level TEXT NOT NULL,
  lastCommentCount INTEGER NOT NULL DEFAULT 0,
  lastCheckedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(userId, owner, repo, issueNumber)
);
CREATE INDEX IF NOT EXISTS IssueNotificationSetting_userId_idx ON "IssueNotificationSetting"(userId);
CREATE INDEX IF NOT EXISTS IssueNotificationSetting_issue_idx ON "IssueNotificationSetting"(owner, repo, issueNumber);
CREATE INDEX IF NOT EXISTS IssueNotificationSetting_lastCheckedAt_idx ON "IssueNotificationSetting"(lastCheckedAt);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  id TEXT PRIMARY KEY,
  userId TEXT REFERENCES "User"(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target TEXT,
  targetId TEXT,
  metadata TEXT,
  ipAddress TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS AuditLog_userId_idx ON "AuditLog"(userId);
CREATE INDEX IF NOT EXISTS AuditLog_action_idx ON "AuditLog"(action);
CREATE INDEX IF NOT EXISTS AuditLog_createdAt_idx ON "AuditLog"(createdAt);
CREATE INDEX IF NOT EXISTS AuditLog_createdAt_action_idx ON "AuditLog"(createdAt, action);

CREATE TABLE IF NOT EXISTS "Backup" (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  type TEXT NOT NULL DEFAULT 'manual',
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  sizeBytes INTEGER,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completedAt TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS Backup_createdAt_idx ON "Backup"(createdAt);

-- Request cache belongs to the replacement runtime and is intentionally empty
-- after the PostgreSQL import.
CREATE TABLE IF NOT EXISTS "GitHubETagCache" (
  cacheKey TEXT PRIMARY KEY,
  etag TEXT,
  lastModified TEXT,
  body BLOB NOT NULL,
  fetchedAt TEXT NOT NULL
);
