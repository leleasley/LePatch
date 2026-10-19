package worker

import (
	"context"
	"testing"

	"lepatch/internal/events"
	"lepatch/internal/store"
)

func TestRaisedIssueUpsertTracksNewCommentsOnly(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "User" (id,name,email,passwordHash) VALUES ('user-1','Test','test@example.test','hash')`); err != nil {
		t.Fatal(err)
	}
	runner := &Runner{db: db.DB(), hub: events.NewHub(16)}
	issue := raisedIssue{ID: 1001, Number: 7, Title: "First title", State: "open", URL: "https://api.github.com/repos/owner/repo/issues/7", CreatedAt: "2026-01-01T00:00:00Z", UpdatedAt: "2026-01-01T00:00:00Z", Comments: 2}
	issue.User.Login = "test-user"
	if err := runner.upsertRaisedIssue(ctx, "user-1", issue); err != nil {
		t.Fatal(err)
	}
	var unread, comments int
	if err := db.DB().QueryRowContext(ctx, `SELECT unreadCommentCount,commentCount FROM "RaisedIssue" WHERE userId='user-1' AND githubIssueId='1001'`).Scan(&unread, &comments); err != nil {
		t.Fatal(err)
	}
	if unread != 0 || comments != 2 {
		t.Fatalf("initial issue should start read, got unread=%d comments=%d", unread, comments)
	}

	issue.Title = "Updated title"
	issue.UpdatedAt = "2026-01-01T01:00:00Z"
	issue.Comments = 5
	if err := runner.upsertRaisedIssue(ctx, "user-1", issue); err != nil {
		t.Fatal(err)
	}
	if err := db.DB().QueryRowContext(ctx, `SELECT unreadCommentCount,commentCount FROM "RaisedIssue" WHERE userId='user-1' AND githubIssueId='1001'`).Scan(&unread, &comments); err != nil {
		t.Fatal(err)
	}
	if unread != 3 || comments != 5 {
		t.Fatalf("new comments should be unread, got unread=%d comments=%d", unread, comments)
	}

	if _, err := db.DB().ExecContext(ctx, `UPDATE "RaisedIssue" SET unreadCommentCount=0 WHERE userId='user-1' AND githubIssueId='1001'`); err != nil {
		t.Fatal(err)
	}
	issue.UpdatedAt = "2026-01-01T02:00:00Z"
	if err := runner.upsertRaisedIssue(ctx, "user-1", issue); err != nil {
		t.Fatal(err)
	}
	if err := db.DB().QueryRowContext(ctx, `SELECT unreadCommentCount FROM "RaisedIssue" WHERE userId='user-1' AND githubIssueId='1001'`).Scan(&unread); err != nil {
		t.Fatal(err)
	}
	if unread != 0 {
		t.Fatalf("unchanged comment count should remain read, got unread=%d", unread)
	}
}
