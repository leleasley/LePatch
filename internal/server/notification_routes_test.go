package server

import (
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

// Notification history has to carry the release and repository identity so the
// interface can open the release inside LePatch instead of sending the reader
// to GitHub.
func TestNotificationHistoryCarriesTheReleaseIdentity(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	statements := []string{
		`INSERT INTO "User" (id,name,email,passwordHash,role) VALUES ('user-1','Test','test@example.test','hash','user')`,
		`INSERT INTO "WatchedApp" (id,name,slug,repoOwner,repoName,repoFullName,githubUrl,userId) VALUES ('app-1','Example','example','owner','repo','owner/repo','https://github.com/owner/repo','user-1')`,
		`INSERT INTO "Release" (id,watchedAppId,githubReleaseId,tagName,htmlUrl,prerelease,draft) VALUES ('release-1','app-1','gh-1','v1.2.3','https://github.com/owner/repo/releases/tag/v1.2.3',0,0)`,
		`INSERT INTO "NotificationChannel" (id,type,name,enabled,configJson) VALUES ('channel-1','discord','Default',1,'{}')`,
		`INSERT INTO "NotificationEvent" (id,releaseId,channelId,status) VALUES ('event-1','release-1','channel-1','sent')`,
	}
	for _, statement := range statements {
		if _, err := db.DB().ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}

	appURL, _ := url.Parse("http://localhost:3000")
	key := []byte("unit-test-session-signing-key-long-enough")
	sessionAuth := &auth.SessionAuth{DB: db.DB(), SigningKey: key, AppURL: appURL.String()}
	token, _, err := sessionAuth.CreateSession(ctx, "user-1", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	handler := New(config.Config{AppURL: appURL, SessionKey: key, Port: "3000"}, db, events.NewHub(16), nil, slog.New(slog.NewTextHandler(io.Discard, nil))).Handler()

	request := httptest.NewRequest(http.MethodGet, "/api/notifications/history", nil)
	request.AddCookie(&http.Cookie{Name: "lepatch_session", Value: token})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("notification history = %d: %s", response.Code, response.Body.String())
	}

	var result struct {
		Events []struct {
			ID        string `json:"id"`
			AppID     string `json:"appId"`
			ReleaseID string `json:"releaseId"`
			TagName   string `json:"tagName"`
		} `json:"events"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Events) != 1 {
		t.Fatalf("expected one notification event: %s", response.Body.String())
	}
	event := result.Events[0]
	if event.AppID != "app-1" || event.ReleaseID != "release-1" {
		t.Fatalf("the event should carry the repository and release ids: %+v", event)
	}
	if event.TagName != "v1.2.3" {
		t.Fatalf("unexpected tag: %+v", event)
	}
}
