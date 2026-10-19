package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"lepatch/internal/auth"
	"lepatch/internal/config"
	"lepatch/internal/events"
	"lepatch/internal/secrets"
	"lepatch/internal/store"
)

// commitTestServer builds a server whose GitHub API base points at a stub, so
// the commit path can be exercised without leaving the process.
func commitTestServer(t *testing.T, apiBase string) (http.Handler, string, string) {
	t.Helper()
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	const encryptionKey = "unit-test-encryption-key"
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "User" (id,name,email,passwordHash,role) VALUES ('user-1','Test','test@example.test','hash','administrator')`); err != nil {
		t.Fatal(err)
	}
	encrypted, err := secrets.EncryptIntegrationValue(encryptionKey, "github-access-token")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "GitHubLink" (id,userId,githubUserId,githubUsername,accessToken) VALUES ('link-1','user-1',7,'alice',?)`, encrypted); err != nil {
		t.Fatal(err)
	}

	appURL, _ := url.Parse("http://localhost:3000")
	key := []byte("unit-test-session-signing-key-long-enough")
	sessionAuth := &auth.SessionAuth{DB: db.DB(), SigningKey: key, AppURL: appURL.String()}
	token, _, err := sessionAuth.CreateSession(ctx, "user-1", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	srv := New(config.Config{AppURL: appURL, SessionKey: key, Port: "3000", EncryptionKey: encryptionKey}, db, events.NewHub(16), nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if apiBase != "" {
		srv.githubAPIBase = apiBase
	}
	return srv.Handler(), token, "lepatch_csrf"
}

func TestCommitFileRejectsARepositoryTheAccountDoesNotOwn(t *testing.T) {
	handler, token, csrf := commitTestServer(t, "http://127.0.0.1:1")

	response := adminWrite(t, handler, http.MethodPost, "/api/github/commit-file", token, csrf, map[string]any{
		"owner":   "bob",
		"repo":    "repo",
		"path":    "README.md",
		"content": "hello",
		"sha":     "abc123",
		"message": "Update README",
	})
	if response.Code != http.StatusBadGateway {
		t.Fatalf("commit to another account's repository = %d, want 502: %s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "only commit to repositories owned by your linked GitHub account") {
		t.Fatalf("unexpected error: %s", response.Body.String())
	}
}

func TestCommitFileRequiresALinkedAccount(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "User" (id,name,email,passwordHash,role) VALUES ('user-2','Test','two@example.test','hash','user')`); err != nil {
		t.Fatal(err)
	}
	appURL, _ := url.Parse("http://localhost:3000")
	key := []byte("unit-test-session-signing-key-long-enough")
	sessionAuth := &auth.SessionAuth{DB: db.DB(), SigningKey: key, AppURL: appURL.String()}
	token, _, err := sessionAuth.CreateSession(ctx, "user-2", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	handler := New(config.Config{AppURL: appURL, SessionKey: key, Port: "3000"}, db, events.NewHub(16), nil, slog.New(slog.NewTextHandler(io.Discard, nil))).Handler()

	response := adminWrite(t, handler, http.MethodPost, "/api/github/commit-file", token, "lepatch_csrf", map[string]any{
		"owner": "user-2", "repo": "repo", "path": "a.txt", "content": "x", "sha": "s", "message": "m",
	})
	if response.Code != http.StatusForbidden {
		t.Fatalf("commit without a GitHub link = %d, want 403: %s", response.Code, response.Body.String())
	}
}

func TestCommitFileVerifiesPushPermissionAndSendsTheBlob(t *testing.T) {
	var permissionChecked, commitSent bool
	var committed map[string]string
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer github-access-token" {
			t.Errorf("authorization header = %q", got)
		}
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/repos/alice/project":
			permissionChecked = true
			_, _ = w.Write([]byte(`{"permissions":{"push":true,"admin":false}}`))
		case r.Method == http.MethodPut && r.URL.Path == "/repos/alice/project/contents/docs/guide.md":
			commitSent = true
			var payload map[string]string
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Errorf("commit payload: %v", err)
			}
			committed = payload
			_, _ = w.Write([]byte(`{"content":{"sha":"new-sha"},"commit":{"sha":"commit-sha"}}`))
		default:
			t.Errorf("unexpected GitHub request: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer api.Close()

	handler, token, csrf := commitTestServer(t, api.URL)
	response := adminWrite(t, handler, http.MethodPost, "/api/github/commit-file", token, csrf, map[string]any{
		"owner":   "alice",
		"repo":    "project",
		"path":    "docs/guide.md",
		"content": "# Guide\n\nUpdated.",
		"sha":     "old-sha",
		"message": "Update the guide",
		"branch":  "main",
	})
	if response.Code != http.StatusOK {
		t.Fatalf("commit = %d: %s", response.Code, response.Body.String())
	}
	if !permissionChecked {
		t.Fatal("the server did not verify push permission before writing")
	}
	if !commitSent {
		t.Fatal("the server did not send the commit")
	}
	if committed["message"] != "Update the guide" || committed["sha"] != "old-sha" || committed["branch"] != "main" {
		t.Fatalf("unexpected commit payload: %+v", committed)
	}
	if committed["content"] != base64.StdEncoding.EncodeToString([]byte("# Guide\n\nUpdated.")) {
		t.Fatalf("the content was not base64 encoded: %q", committed["content"])
	}
}

func TestCommitFileStopsWithoutPushPermission(t *testing.T) {
	var commitAttempted bool
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte(`{"permissions":{"push":false}}`))
			return
		}
		commitAttempted = true
		w.WriteHeader(http.StatusOK)
	}))
	defer api.Close()

	handler, token, csrf := commitTestServer(t, api.URL)
	response := adminWrite(t, handler, http.MethodPost, "/api/github/commit-file", token, csrf, map[string]any{
		"owner": "alice", "repo": "project", "path": "a.md", "content": "x", "sha": "s", "message": "m",
	})
	if response.Code != http.StatusBadGateway {
		t.Fatalf("commit without push permission = %d, want 502: %s", response.Code, response.Body.String())
	}
	if commitAttempted {
		t.Fatal("the server wrote a commit even though push permission was missing")
	}
}
