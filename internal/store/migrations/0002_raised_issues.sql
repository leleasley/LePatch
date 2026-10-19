ALTER TABLE "WatchedApp" ADD COLUMN iconUrl TEXT;
ALTER TABLE "WatchedApp" ADD COLUMN ownerAvatarUrl TEXT;
ALTER TABLE "WatchedApp" ADD COLUMN language TEXT;
ALTER TABLE "WatchedApp" ADD COLUMN license TEXT;
ALTER TABLE "WatchedApp" ADD COLUMN defaultBranch TEXT;
ALTER TABLE "WatchedApp" ADD COLUMN stars INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WatchedApp" ADD COLUMN topics TEXT NOT NULL DEFAULT '[]';

CREATE TABLE "RaisedIssue" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  githubIssueId TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  issueNumber INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  state TEXT NOT NULL,
  stateReason TEXT,
  htmlUrl TEXT NOT NULL,
  authorLogin TEXT NOT NULL,
  createdAtGitHub TEXT NOT NULL,
  updatedAtGitHub TEXT NOT NULL,
  closedAtGitHub TEXT,
  commentCount INTEGER NOT NULL DEFAULT 0,
  lastCommentCount INTEGER NOT NULL DEFAULT 0,
  unreadCommentCount INTEGER NOT NULL DEFAULT 0,
  lastCheckedAt TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(userId, githubIssueId),
  UNIQUE(userId, owner, repo, issueNumber)
);
CREATE INDEX RaisedIssue_user_state_updated_idx ON "RaisedIssue"(userId, state, updatedAtGitHub DESC);
CREATE INDEX RaisedIssue_user_repo_idx ON "RaisedIssue"(userId, owner, repo);
