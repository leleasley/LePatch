package store

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func TestOpenMigratesCompleteApplicationSchema(t *testing.T) {
	ctx := context.Background()
	db, err := Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var count int
	if err := db.DB().QueryRowContext(ctx, `SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 21 { // 18 existing tables, GitHub cache, migration ledger and RaisedIssue.
		t.Fatalf("expected 21 tables, got %d", count)
	}

	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "User" (id, name, email, passwordHash) VALUES ('u1', 'User', 'user@example.test', 'hash')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "WatchedApp" (id, name, slug, repoOwner, repoName, repoFullName, githubUrl, userId) VALUES ('a1', 'Repo', 'owner-repo', 'owner', 'repo', 'owner/repo', 'https://github.com/owner/repo', 'u1')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "Release" (id, watchedAppId, githubReleaseId, tagName, htmlUrl, prerelease, draft) VALUES ('r1', 'a1', '42', 'v1', 'https://github.com/owner/repo/releases/tag/v1', 0, 0)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "RaisedIssue" (id,userId,githubIssueId,owner,repo,issueNumber,title,state,htmlUrl,authorLogin,createdAtGitHub,updatedAtGitHub) VALUES ('i1','u1','991','owner','repo',1,'Issue','open','https://github.com/owner/repo/issues/1','user','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().ExecContext(ctx, `DELETE FROM "User" WHERE id = 'u1'`); err != nil {
		t.Fatal(err)
	}
	if err := db.DB().QueryRowContext(ctx, `SELECT count(*) FROM "WatchedApp"`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("expected user deletion to cascade to watched apps, got %d", count)
	}
}

func TestSqliteValuePreservesDatabaseShapes(t *testing.T) {
	got, err := sqliteValue(true, "BOOL")
	if err != nil || got != int64(1) {
		t.Fatalf("bool conversion = %#v, %v", got, err)
	}

	instant := time.Date(2026, 10, 18, 12, 30, 0, 123, time.FixedZone("test", 3600))
	got, err = sqliteValue(instant, "TIMESTAMPTZ")
	if err != nil || got != "2026-10-18T11:30:00.000000123Z" {
		t.Fatalf("timestamp conversion = %#v, %v", got, err)
	}

	array := []string{"patch", "minor"}
	got, err = sqliteValue(array, "_TEXT")
	if err != nil {
		t.Fatal(err)
	}
	var decoded []string
	if err := json.Unmarshal([]byte(got.(string)), &decoded); err != nil {
		t.Fatal(err)
	}
	if len(decoded) != 2 || decoded[0] != "patch" || decoded[1] != "minor" {
		t.Fatalf("array conversion lost values: %#v", decoded)
	}

	blob := []byte{0, 1, 2, 255}
	got, err = sqliteValue(blob, "BYTEA")
	if err != nil {
		t.Fatal(err)
	}
	if string(got.([]byte)) != string(blob) {
		t.Fatalf("binary conversion lost bytes: %v", got)
	}
}
