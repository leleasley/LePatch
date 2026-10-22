package server

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"testing"

	"lepatch/internal/auth"
	"lepatch/internal/config"
	"lepatch/internal/events"
	"lepatch/internal/store"
	"lepatch/internal/worker"
)

// A newly watched repository should be checked immediately so its releases
// are available when the repository is opened, not only after the next
// background schedule tick.
func TestCreateAppQueuesAFirstCheck(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "User" (id,name,email,passwordHash,role) VALUES ('user-1','Test','test@example.test','hash','user')`); err != nil {
		t.Fatal(err)
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	runner := worker.New(db.DB(), events.NewHub(8), "", "", logger)
	appURL, _ := url.Parse("http://localhost:3000")
	key := []byte("unit-test-session-signing-key-long-enough")
	sessionAuth := &auth.SessionAuth{DB: db.DB(), SigningKey: key, AppURL: appURL.String()}
	token, _, err := sessionAuth.CreateSession(ctx, "user-1", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	handler := New(config.Config{AppURL: appURL, SessionKey: key, Port: "3000"}, db, events.NewHub(16), runner, logger).Handler()

	if status := runner.Status(); status.PendingChecks != 0 {
		t.Fatalf("worker started with %d pending checks", status.PendingChecks)
	}

	response := adminWrite(t, handler, http.MethodPost, "/api/apps", token, "lepatch_csrf", map[string]any{"repoFullName": "owner/repo"})
	if response.Code != http.StatusCreated {
		t.Fatalf("watch = %d: %s", response.Code, response.Body.String())
	}
	if status := runner.Status(); status.PendingChecks != 1 {
		t.Fatalf("a new repository should queue one check, got %d pending", status.PendingChecks)
	}
}
