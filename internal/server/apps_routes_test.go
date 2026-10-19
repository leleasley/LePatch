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

func TestListAppsReturnsImportedTopicsAsJSON(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "User" (id,name,email,passwordHash,role) VALUES ('user-1','Test','test@example.test','hash','administrator')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "WatchedApp" (id,name,slug,repoOwner,repoName,repoFullName,githubUrl,userId,topics) VALUES ('app-1','Example','example','owner','repo','owner/repo','https://github.com/owner/repo','user-1','["release","test"]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "Release" (id,watchedAppId,githubReleaseId,tagName,htmlUrl,prerelease,draft,changelogSections) VALUES ('release-1','app-1','gh-1','v1.0.0','https://github.com/owner/repo/releases/tag/v1.0.0',0,0,'[{"title":"Added","items":["A feature"]}]')`); err != nil {
		t.Fatal(err)
	}
	appURL, _ := url.Parse("http://localhost:3000")
	key := []byte("unit-test-session-signing-key-long-enough")
	sessionAuth := &auth.SessionAuth{DB: db.DB(), SigningKey: key, AppURL: appURL.String()}
	token, _, err := sessionAuth.CreateSession(ctx, "user-1", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	handler := New(config.Config{AppURL: appURL, SessionKey: key, Port: "3000"}, db, events.NewHub(16), nil, slog.New(slog.NewTextHandler(io.Discard, nil))).Handler()
	request := httptest.NewRequest(http.MethodGet, "/api/apps", nil)
	request.AddCookie(&http.Cookie{Name: "lepatch_session", Value: token})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("GET /api/apps = %d: %s", response.Code, response.Body.String())
	}
	var result struct {
		Apps []struct {
			ID     string          `json:"id"`
			Topics json.RawMessage `json:"topics"`
		} `json:"apps"`
		Total int `json:"total"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Total != 1 || len(result.Apps) != 1 || result.Apps[0].ID != "app-1" {
		t.Fatalf("unexpected watched-app response: %s", response.Body.String())
	}
	if string(result.Apps[0].Topics) != `["release","test"]` {
		t.Fatalf("topics were not preserved as JSON: %s", result.Apps[0].Topics)
	}
	appRequest := httptest.NewRequest(http.MethodGet, "/api/apps/app-1", nil)
	appRequest.AddCookie(&http.Cookie{Name: "lepatch_session", Value: token})
	appResponse := httptest.NewRecorder()
	handler.ServeHTTP(appResponse, appRequest)
	if appResponse.Code != http.StatusOK {
		t.Fatalf("GET /api/apps/app-1 = %d: %s", appResponse.Code, appResponse.Body.String())
	}
	var appResult struct {
		App struct {
			ID     string          `json:"id"`
			Topics json.RawMessage `json:"topics"`
		} `json:"app"`
	}
	if err := json.Unmarshal(appResponse.Body.Bytes(), &appResult); err != nil {
		t.Fatal(err)
	}
	if appResult.App.ID != "app-1" || string(appResult.App.Topics) != `["release","test"]` {
		t.Fatalf("unexpected app detail response: %s", appResponse.Body.String())
	}
	releasesRequest := httptest.NewRequest(http.MethodGet, "/api/apps/app-1/releases", nil)
	releasesRequest.AddCookie(&http.Cookie{Name: "lepatch_session", Value: token})
	releasesResponse := httptest.NewRecorder()
	handler.ServeHTTP(releasesResponse, releasesRequest)
	if releasesResponse.Code != http.StatusOK {
		t.Fatalf("GET /api/apps/app-1/releases = %d: %s", releasesResponse.Code, releasesResponse.Body.String())
	}
	var releaseResult struct {
		Releases []struct {
			ID                string          `json:"id"`
			ChangelogSections json.RawMessage `json:"changelogSections"`
		} `json:"releases"`
	}
	if err := json.Unmarshal(releasesResponse.Body.Bytes(), &releaseResult); err != nil {
		t.Fatal(err)
	}
	if len(releaseResult.Releases) != 1 || releaseResult.Releases[0].ID != "release-1" || string(releaseResult.Releases[0].ChangelogSections) != `[{"title":"Added","items":["A feature"]}]` {
		t.Fatalf("release sections were not preserved as JSON: %s", releasesResponse.Body.String())
	}
}
