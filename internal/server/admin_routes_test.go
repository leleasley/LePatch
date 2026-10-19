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

// adminTestServer builds a server backed by an in-memory database with an
// administrator and a standard user, and returns a handler plus the session
// token and CSRF token for each account.
func adminTestServer(t *testing.T) (http.Handler, string, string, string, string) {
	t.Helper()
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "User" (id,name,email,passwordHash,role) VALUES ('admin-1','Admin','admin@example.test','hash','administrator')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "User" (id,name,email,passwordHash,role) VALUES ('user-1','Viewer','user@example.test','hash','user')`); err != nil {
		t.Fatal(err)
	}
	appURL, _ := url.Parse("http://localhost:3000")
	key := []byte("unit-test-session-signing-key-long-enough")
	sessionAuth := &auth.SessionAuth{DB: db.DB(), SigningKey: key, AppURL: appURL.String()}
	handler := New(config.Config{AppURL: appURL, SessionKey: key, Port: "3000"}, db, events.NewHub(16), nil, slog.New(slog.NewTextHandler(io.Discard, nil))).Handler()

	adminToken, _, err := sessionAuth.CreateSession(ctx, "admin-1", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	userToken, _, err := sessionAuth.CreateSession(ctx, "user-1", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	return handler, adminToken, userToken, "lepatch_csrf", "lepatch_csrf"
}

func adminGet(t *testing.T, handler http.Handler, path, token string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	request.AddCookie(&http.Cookie{Name: "lepatch_session", Value: token})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func adminWrite(t *testing.T, handler http.Handler, method, path, token, csrf string, payload any) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(method, path, bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{Name: "lepatch_session", Value: token})
	request.AddCookie(&http.Cookie{Name: "lepatch_csrf", Value: csrf})
	request.Header.Set("X-CSRF-Token", csrf)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func TestAdminOverviewRequiresAdministrator(t *testing.T) {
	handler, adminToken, userToken, _, _ := adminTestServer(t)

	if response := adminGet(t, handler, "/api/admin/overview", adminToken); response.Code != http.StatusOK {
		t.Fatalf("administrator overview = %d: %s", response.Code, response.Body.String())
	}
	for _, path := range []string{"/api/admin/overview", "/api/admin/settings", "/api/admin/queues"} {
		if response := adminGet(t, handler, path, userToken); response.Code != http.StatusForbidden {
			t.Fatalf("GET %s as a standard user = %d, want 403", path, response.Code)
		}
	}
	if response := adminGet(t, handler, "/api/admin/overview", ""); response.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous overview = %d, want 401", response.Code)
	}
}

func TestAdminOverviewReportsWorkspaceFigures(t *testing.T) {
	handler, adminToken, _, _, _ := adminTestServer(t)
	response := adminGet(t, handler, "/api/admin/overview", adminToken)
	if response.Code != http.StatusOK {
		t.Fatalf("overview = %d: %s", response.Code, response.Body.String())
	}
	var result struct {
		Version string `json:"version"`
		Users   struct {
			Total         int `json:"total"`
			Administrator int `json:"administrator"`
		} `json:"users"`
		Releases struct {
			Total    int `json:"total"`
			Activity []struct {
				Date  string `json:"date"`
				Count int    `json:"count"`
			} `json:"activity"`
		} `json:"releases"`
		Settings WorkspaceSettings `json:"settings"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Users.Total != 2 || result.Users.Administrator != 1 {
		t.Fatalf("unexpected user figures: %s", response.Body.String())
	}
	if len(result.Releases.Activity) != 14 {
		t.Fatalf("expected 14 days of release activity, got %d", len(result.Releases.Activity))
	}
	if result.Settings.DefaultCheckIntervalMinutes != 360 || result.Settings.ReleaseFeedSize != 50 {
		t.Fatalf("unexpected default workspace settings: %+v", result.Settings)
	}
}

func TestAdminSettingsArePersistedAndEnforced(t *testing.T) {
	handler, adminToken, userToken, csrf, _ := adminTestServer(t)

	response := adminWrite(t, handler, http.MethodPut, "/api/admin/settings", adminToken, csrf, WorkspaceSettings{
		DefaultCheckIntervalMinutes: 15,
		MaxWatchedApps:              1,
		ReleaseFeedSize:             12,
		AllowPrereleaseByDefault:    true,
		MaintenanceNotice:           "Scheduled maintenance tonight.",
	})
	if response.Code != http.StatusOK {
		t.Fatalf("update settings = %d: %s", response.Code, response.Body.String())
	}
	read := adminGet(t, handler, "/api/admin/settings", adminToken)
	var stored struct {
		Settings WorkspaceSettings `json:"settings"`
	}
	if err := json.Unmarshal(read.Body.Bytes(), &stored); err != nil {
		t.Fatal(err)
	}
	if stored.Settings.DefaultCheckIntervalMinutes != 15 || stored.Settings.MaxWatchedApps != 1 || stored.Settings.ReleaseFeedSize != 12 {
		t.Fatalf("workspace settings were not stored: %s", read.Body.String())
	}
	if !stored.Settings.AllowPrereleaseByDefault || stored.Settings.MaintenanceNotice != "Scheduled maintenance tonight." {
		t.Fatalf("workspace settings were not stored: %s", read.Body.String())
	}

	// A standard user must not be able to change the workspace configuration.
	if response := adminWrite(t, handler, http.MethodPut, "/api/admin/settings", userToken, csrf, WorkspaceSettings{}); response.Code != http.StatusForbidden {
		t.Fatalf("settings update as a standard user = %d, want 403", response.Code)
	}

	// The saved maximum must be enforced when a repository is watched.
	create := adminWrite(t, handler, http.MethodPost, "/api/apps", adminToken, csrf, map[string]any{"repoFullName": "owner/first"})
	if create.Code != http.StatusCreated {
		t.Fatalf("first watch = %d: %s", create.Code, create.Body.String())
	}
	second := adminWrite(t, handler, http.MethodPost, "/api/apps", adminToken, csrf, map[string]any{"repoFullName": "owner/second"})
	if second.Code != http.StatusForbidden {
		t.Fatalf("second watch = %d, want 403 once the limit is reached: %s", second.Code, second.Body.String())
	}
}

func TestWorkspaceSettingsClampUnsafeValues(t *testing.T) {
	handler, adminToken, _, csrf, _ := adminTestServer(t)
	response := adminWrite(t, handler, http.MethodPut, "/api/admin/settings", adminToken, csrf, WorkspaceSettings{
		DefaultCheckIntervalMinutes: 1,
		MaxWatchedApps:              -5,
		ReleaseFeedSize:             100000,
		MaintenanceNotice:           string(make([]byte, 400)),
	})
	if response.Code != http.StatusOK {
		t.Fatalf("update settings = %d: %s", response.Code, response.Body.String())
	}
	var stored struct {
		Settings WorkspaceSettings `json:"settings"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &stored); err != nil {
		t.Fatal(err)
	}
	if stored.Settings.DefaultCheckIntervalMinutes != 5 {
		t.Fatalf("check interval was not clamped: %+v", stored.Settings)
	}
	if stored.Settings.MaxWatchedApps != 0 {
		t.Fatalf("max watched apps was not clamped: %+v", stored.Settings)
	}
	if stored.Settings.ReleaseFeedSize != 200 {
		t.Fatalf("feed size was not clamped: %+v", stored.Settings)
	}
	if len(stored.Settings.MaintenanceNotice) != 280 {
		t.Fatalf("maintenance notice was not truncated: %d", len(stored.Settings.MaintenanceNotice))
	}
}

func TestRetryFailedNotificationsRequeuesEvents(t *testing.T) {
	handler, adminToken, userToken, csrf, _ := adminTestServer(t)

	response := adminWrite(t, handler, http.MethodPost, "/api/admin/queues/retry", adminToken, csrf, map[string]any{})
	if response.Code != http.StatusOK {
		t.Fatalf("retry = %d: %s", response.Code, response.Body.String())
	}
	forbidden := adminWrite(t, handler, http.MethodPost, "/api/admin/queues/retry", userToken, csrf, map[string]any{})
	if forbidden.Code != http.StatusForbidden {
		t.Fatalf("retry as a standard user = %d, want 403", forbidden.Code)
	}
}
