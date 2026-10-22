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

func TestDashboardFeedFiltersPrereleasesAndReportsUpdateFlags(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "User" (id,name,email,passwordHash,role) VALUES ('user-1','Test','test@example.test','hash','user')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "WatchedApp" (id,name,slug,repoOwner,repoName,repoFullName,githubUrl,userId,updateAvailable,latestSeenTag) VALUES ('app-1','Example','example','owner','repo','owner/repo','https://github.com/owner/repo','user-1',1,'v1.0.0')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "Release" (id,watchedAppId,githubReleaseId,tagName,htmlUrl,prerelease,draft) VALUES ('stable-1','app-1','gh-1','v1.0.0','https://github.com/owner/repo/releases/tag/v1.0.0',0,0)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "Release" (id,watchedAppId,githubReleaseId,tagName,htmlUrl,prerelease,draft) VALUES ('pre-1','app-1','gh-2','v2.0.0-beta.1','https://github.com/owner/repo/releases/tag/v2.0.0-beta.1',1,0)`); err != nil {
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

	fetch := func(path string) struct {
		Total  int `json:"total"`
		Recent []struct {
			TagName    string `json:"tagName"`
			Prerelease bool   `json:"prerelease"`
			WatchedApp struct {
				UpdateAvailable bool    `json:"updateAvailable"`
				LatestSeenTag   *string `json:"latestSeenTag"`
			} `json:"watchedApp"`
		} `json:"recent"`
	} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		request.AddCookie(&http.Cookie{Name: "lepatch_session", Value: token})
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("GET %s = %d: %s", path, response.Code, response.Body.String())
		}
		var result struct {
			Total  int `json:"total"`
			Recent []struct {
				TagName    string `json:"tagName"`
				Prerelease bool   `json:"prerelease"`
				WatchedApp struct {
					UpdateAvailable bool    `json:"updateAvailable"`
					LatestSeenTag   *string `json:"latestSeenTag"`
				} `json:"watchedApp"`
			} `json:"recent"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result
	}

	stable := fetch("/api/dashboard")
	if len(stable.Recent) != 1 || stable.Recent[0].Prerelease {
		t.Fatalf("the default feed should only contain stable releases: %+v", stable.Recent)
	}
	if !stable.Recent[0].WatchedApp.UpdateAvailable {
		t.Fatal("the feed should report the watched repository update flag")
	}
	if stable.Recent[0].WatchedApp.LatestSeenTag == nil || *stable.Recent[0].WatchedApp.LatestSeenTag != "v1.0.0" {
		t.Fatal("the feed should report the last seen tag so the home page can flag unseen releases")
	}

	withPreReleases := fetch("/api/dashboard?includePrereleases=true")
	if len(withPreReleases.Recent) != 2 {
		t.Fatalf("the feed should include pre-releases when asked: %+v", withPreReleases.Recent)
	}
	prereleases := 0
	for _, item := range withPreReleases.Recent {
		if item.Prerelease {
			prereleases++
		}
	}
	if prereleases != 1 {
		t.Fatalf("expected exactly one pre-release in the feed, got %d", prereleases)
	}
}

func TestCreateAppAppliesWorkspaceDefaults(t *testing.T) {
	handler, adminToken, _, csrf, _ := adminTestServer(t)

	if response := adminWrite(t, handler, http.MethodPut, "/api/admin/settings", adminToken, csrf, WorkspaceSettings{
		DefaultCheckIntervalMinutes: 45,
		AllowPrereleaseByDefault:    true,
	}); response.Code != http.StatusOK {
		t.Fatalf("update settings = %d: %s", response.Code, response.Body.String())
	}

	response := adminWrite(t, handler, http.MethodPost, "/api/apps", adminToken, csrf, map[string]any{"repoFullName": "owner/example"})
	if response.Code != http.StatusCreated {
		t.Fatalf("watch repository = %d: %s", response.Code, response.Body.String())
	}
	var result struct {
		App struct {
			CheckIntervalMinutes int  `json:"checkIntervalMinutes"`
			IncludePrereleases   bool `json:"includePrereleases"`
		} `json:"app"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.App.CheckIntervalMinutes != 45 {
		t.Fatalf("the workspace check interval was not applied: %+v", result.App)
	}
	if !result.App.IncludePrereleases {
		t.Fatalf("the workspace pre-release default was not applied: %+v", result.App)
	}
}
