package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"lepatch/internal/auth"
	"lepatch/internal/config"
	"lepatch/internal/events"
	"lepatch/internal/store"
)

// TestMarkAllReleasesSeenClearsOnlyTheSignedInUsersUpdates covers the home page
// "Mark all as read" action: it must require a session and CSRF token, clear
// every waiting update for the caller and leave other accounts untouched.
func TestMarkAllReleasesSeenClearsOnlyTheSignedInUsersUpdates(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	statements := []string{
		`INSERT INTO "User" (id,name,email,passwordHash,role) VALUES ('user-1','One','one@example.test','hash','user')`,
		`INSERT INTO "User" (id,name,email,passwordHash,role) VALUES ('user-2','Two','two@example.test','hash','user')`,
		`INSERT INTO "WatchedApp" (id,name,slug,repoOwner,repoName,repoFullName,githubUrl,userId,updateAvailable,latestSeenTag,latestSeenReleaseId)
			VALUES ('app-1','First','first','owner','first','owner/first','https://github.com/owner/first','user-1',1,'v1.0.0','rel-1')`,
		`INSERT INTO "WatchedApp" (id,name,slug,repoOwner,repoName,repoFullName,githubUrl,userId,updateAvailable)
			VALUES ('app-2','Second','second','owner','second','owner/second','https://github.com/owner/second','user-1',0)`,
		`INSERT INTO "WatchedApp" (id,name,slug,repoOwner,repoName,repoFullName,githubUrl,userId,updateAvailable,latestSeenTag)
			VALUES ('app-3','Other','other','owner','other','owner/other','https://github.com/owner/other','user-2',1,'v9.9.9')`,
	}
	for _, statement := range statements {
		if _, err := db.DB().ExecContext(ctx, statement); err != nil {
			t.Fatalf("%v: %s", err, statement)
		}
	}

	sessionAuth := &auth.SessionAuth{DB: db.DB(), SigningKey: []byte("unit-test-session-signing-key-long-enough"), AppURL: "http://localhost:3000"}
	token, _, err := sessionAuth.CreateSession(ctx, "user-1", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	handler := New(config.Config{AppURL: mustURL(t), SessionKey: []byte("unit-test-session-signing-key-long-enough"), Port: "3000"}, db, events.NewHub(16), nil, slog.New(slog.NewTextHandler(io.Discard, nil))).Handler()

	call := func(session, csrfCookie, csrfHeader string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPost, "/api/releases/seen-all", bytes.NewReader([]byte(`{}`)))
		request.Header.Set("Content-Type", "application/json")
		if session != "" {
			request.AddCookie(&http.Cookie{Name: "lepatch_session", Value: session})
		}
		if csrfCookie != "" {
			request.AddCookie(&http.Cookie{Name: "lepatch_csrf", Value: csrfCookie})
		}
		if csrfHeader != "" {
			request.Header.Set("X-CSRF-Token", csrfHeader)
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	if response := call("", "", ""); response.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous bulk acknowledge = %d, want 401", response.Code)
	}
	if response := call(token, "cookie-token", "header-token"); response.Code != http.StatusForbidden {
		t.Fatalf("bulk acknowledge with a mismatched CSRF token = %d, want 403", response.Code)
	}

	response := call(token, "csrf-token", "csrf-token")
	if response.Code != http.StatusOK {
		t.Fatalf("bulk acknowledge = %d: %s", response.Code, response.Body.String())
	}
	var result struct {
		OK      bool `json:"ok"`
		Updated int  `json:"updated"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if !result.OK || result.Updated != 1 {
		t.Fatalf("expected one repository to be acknowledged: %s", response.Body.String())
	}

	type state struct {
		update   int
		notified *string
	}
	read := func(appID string) state {
		var current state
		var notified *string
		if err := db.DB().QueryRowContext(ctx, `SELECT updateAvailable,lastNotifiedTag FROM "WatchedApp" WHERE id=?`, appID).Scan(&current.update, &notified); err != nil {
			t.Fatal(err)
		}
		current.notified = notified
		return current
	}

	if app := read("app-1"); app.update != 0 {
		t.Fatal("the acknowledged repository still reports an available update")
	} else if app.notified == nil || *app.notified != "v1.0.0" {
		t.Fatal("acknowledging a release must record the last seen tag as notified")
	}
	if app := read("app-3"); app.update != 1 {
		t.Fatal("another account's repository was changed")
	}
}

func mustURL(t *testing.T) *url.URL {
	t.Helper()
	parsed, err := url.Parse("http://localhost:3000")
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}
