package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"lepatch/internal/auth"
	"lepatch/internal/config"
	"lepatch/internal/events"
	"lepatch/internal/store"

	"io"
	"log/slog"
)

// featureTestServer builds a server with one administrator and one standard
// user plus a handle on the database, which the shared helper does not expose.
func featureTestServer(t *testing.T) (http.Handler, *store.Store, string, string, string) {
	t.Helper()
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	for _, statement := range []string{
		`INSERT INTO "User" (id,name,email,passwordHash,role) VALUES ('user-1','One','one@example.test','hash','user')`,
		`INSERT INTO "User" (id,name,email,passwordHash,role) VALUES ('user-2','Two','two@example.test','hash','user')`,
	} {
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
	otherToken, _, err := sessionAuth.CreateSession(ctx, "user-2", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	handler := New(config.Config{AppURL: appURL, SessionKey: key, Port: "3000"}, db, events.NewHub(16), nil, slog.New(slog.NewTextHandler(io.Discard, nil))).Handler()
	return handler, db, token, otherToken, "csrf-token"
}

func featureWrite(t *testing.T, handler http.Handler, method, path, token, csrf string, payload any) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(method, path, bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	if token != "" {
		request.AddCookie(&http.Cookie{Name: "lepatch_session", Value: token})
	}
	if csrf != "" {
		request.AddCookie(&http.Cookie{Name: "lepatch_csrf", Value: csrf})
		request.Header.Set("X-CSRF-Token", csrf)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func TestFeedTokenLifecycleAndPublicFeed(t *testing.T) {
	handler, db, token, _, csrf := featureTestServer(t)
	ctx := context.Background()

	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "WatchedApp" (id,name,slug,repoOwner,repoName,repoFullName,githubUrl,userId) VALUES ('app-1','Sonarr','sonarr','Sonarr','Sonarr','Sonarr/Sonarr','https://github.com/Sonarr/Sonarr','user-1')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "Release" (id,watchedAppId,githubReleaseId,tagName,name,body,htmlUrl,prerelease,draft,securityRelevant,detectedAt) VALUES ('rel-1','app-1','gh-1','v4.0.14','Sonarr v4.0.14','Fixes a CVE.','https://github.com/Sonarr/Sonarr/releases/tag/v4.0.14',0,0,1,'2026-10-22T10:00:00Z')`); err != nil {
		t.Fatal(err)
	}

	// Creating a feed needs a session and a CSRF token.
	if response := featureWrite(t, handler, http.MethodPost, "/api/feeds", "", "", map[string]any{"label": "FreshRSS"}); response.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous feed creation = %d, want 401", response.Code)
	}
	if response := featureWrite(t, handler, http.MethodPost, "/api/feeds", token, "", map[string]any{"label": "FreshRSS"}); response.Code != http.StatusForbidden {
		t.Fatalf("feed creation without CSRF = %d, want 403", response.Code)
	}

	created := featureWrite(t, handler, http.MethodPost, "/api/feeds", token, csrf, map[string]any{"label": "FreshRSS"})
	if created.Code != http.StatusCreated {
		t.Fatalf("create feed = %d: %s", created.Code, created.Body.String())
	}
	var result struct {
		Secret  string `json:"secret"`
		AtomURL string `json:"atomUrl"`
		JSONURL string `json:"jsonUrl"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(result.Secret, "lp_") || !strings.Contains(result.AtomURL, result.Secret) {
		t.Fatalf("unexpected create response: %s", created.Body.String())
	}

	// Only the hash is stored.
	var stored string
	if err := db.DB().QueryRowContext(ctx, `SELECT tokenHash FROM "FeedToken"`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored == result.Secret || stored != feedTokenHash(result.Secret) {
		t.Fatal("the feed token must be stored as a hash")
	}

	// The public feed reads without a session.
	atom := httptest.NewRecorder()
	handler.ServeHTTP(atom, httptest.NewRequest(http.MethodGet, "/feed/"+result.Secret, nil))
	if atom.Code != http.StatusOK {
		t.Fatalf("atom feed = %d: %s", atom.Code, atom.Body.String())
	}
	if !strings.Contains(atom.Header().Get("Content-Type"), "atom+xml") {
		t.Fatalf("unexpected atom content type: %s", atom.Header().Get("Content-Type"))
	}
	body := atom.Body.String()
	for _, expected := range []string{"Sonarr v4.0.14", "security", "Sonarr/Sonarr"} {
		if !strings.Contains(body, expected) {
			t.Fatalf("the atom feed is missing %q: %s", expected, body)
		}
	}

	jsonFeed := httptest.NewRecorder()
	handler.ServeHTTP(jsonFeed, httptest.NewRequest(http.MethodGet, "/feed/"+result.Secret+".json", nil))
	if jsonFeed.Code != http.StatusOK || !strings.Contains(jsonFeed.Body.String(), `"tagName":"v4.0.14"`) {
		t.Fatalf("json feed = %d: %s", jsonFeed.Code, jsonFeed.Body.String())
	}

	// An unknown token is a 404, not an empty feed.
	missing := httptest.NewRecorder()
	handler.ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/feed/lp_does-not-exist", nil))
	if missing.Code != http.StatusNotFound {
		t.Fatalf("unknown feed token = %d, want 404", missing.Code)
	}

	// The token is a credential, so it must not reach the access log.
	var listed struct {
		Tokens []struct {
			ID string `json:"id"`
		} `json:"tokens"`
	}
	list := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/feeds", nil)
	request.AddCookie(&http.Cookie{Name: "lepatch_session", Value: token})
	handler.ServeHTTP(list, request)
	if err := json.Unmarshal(list.Body.Bytes(), &listed); err != nil || len(listed.Tokens) != 1 {
		t.Fatalf("list feeds = %d: %s", list.Code, list.Body.String())
	}

	revoked := featureWrite(t, handler, http.MethodDelete, "/api/feeds/"+listed.Tokens[0].ID, token, csrf, nil)
	if revoked.Code != http.StatusOK {
		t.Fatalf("revoke feed = %d: %s", revoked.Code, revoked.Body.String())
	}
	after := httptest.NewRecorder()
	handler.ServeHTTP(after, httptest.NewRequest(http.MethodGet, "/feed/"+result.Secret, nil))
	if after.Code != http.StatusNotFound {
		t.Fatalf("a revoked token still served the feed: %d", after.Code)
	}
}

func TestDashboardSearchAndPagination(t *testing.T) {
	handler, db, token, _, _ := featureTestServer(t)
	ctx := context.Background()

	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "WatchedApp" (id,name,slug,repoOwner,repoName,repoFullName,githubUrl,userId,updateAvailable,latestSeenTag) VALUES ('app-1','Sonarr','sonarr','Sonarr','Sonarr','Sonarr/Sonarr','https://github.com/Sonarr/Sonarr','user-1',1,'v1.0.0')`); err != nil {
		t.Fatal(err)
	}
	for index, tag := range []string{"v1.0.1", "v1.0.2", "v1.0.3", "v1.0.4", "v1.0.5", "v1.0.6", "v1.0.7"} {
		statement := `INSERT INTO "Release" (id,watchedAppId,githubReleaseId,tagName,name,htmlUrl,prerelease,draft,detectedAt) VALUES (?,?,?,?,?,?,0,0,?)`
		detected := "2026-10-2" + string(rune('1'+index)) + "T10:00:00Z"
		if _, err := db.DB().ExecContext(ctx, statement, "rel-"+tag, "app-1", "gh-"+tag, tag, "Sonarr "+tag, "https://github.com/Sonarr/Sonarr/releases/tag/"+tag, detected); err != nil {
			t.Fatal(err)
		}
	}

	fetch := func(query string) struct {
		Recent []struct {
			ID      string `json:"id"`
			TagName string `json:"tagName"`
		} `json:"recent"`
		HasMore    bool    `json:"hasMore"`
		NextCursor *string `json:"nextCursor"`
		Unread     struct {
			Releases     int `json:"releases"`
			Repositories int `json:"repositories"`
		} `json:"unread"`
	} {
		request := httptest.NewRequest(http.MethodGet, "/api/dashboard?"+query, nil)
		request.AddCookie(&http.Cookie{Name: "lepatch_session", Value: token})
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("dashboard?%s = %d: %s", query, response.Code, response.Body.String())
		}
		var result struct {
			Recent []struct {
				ID      string `json:"id"`
				TagName string `json:"tagName"`
			} `json:"recent"`
			HasMore    bool    `json:"hasMore"`
			NextCursor *string `json:"nextCursor"`
			Unread     struct {
				Releases     int `json:"releases"`
				Repositories int `json:"repositories"`
			} `json:"unread"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result
	}

	first := fetch("perPage=5")
	if len(first.Recent) != 5 || !first.HasMore || first.NextCursor == nil {
		t.Fatalf("first page = %+v", first)
	}
	if first.Recent[0].TagName != "v1.0.7" || first.Recent[4].TagName != "v1.0.3" {
		t.Fatalf("the feed is not newest first: %+v", first.Recent)
	}

	second := fetch("perPage=5&cursor=" + url.QueryEscape(*first.NextCursor))
	if len(second.Recent) != 2 || second.Recent[0].TagName != "v1.0.2" || second.Recent[1].TagName != "v1.0.1" {
		t.Fatalf("second page = %+v", second.Recent)
	}
	if second.HasMore || second.NextCursor != nil {
		t.Fatalf("the second page should be the last: %+v", second)
	}

	if searched := fetch("perPage=10&q=1.0.3"); len(searched.Recent) != 1 || searched.Recent[0].TagName != "v1.0.3" {
		t.Fatalf("search returned %+v", searched.Recent)
	}
	if none := fetch("perPage=10&q=no-such-release"); len(none.Recent) != 0 {
		t.Fatalf("a search with no matches returned %+v", none.Recent)
	}
	if wildcard := fetch("perPage=10&q=%25"); len(wildcard.Recent) != 0 {
		t.Fatalf("a literal %% must not act as a wildcard: %+v", wildcard.Recent)
	}

	// The unread summary describes the whole account, not the current page.
	if first.Unread.Releases != 1 || first.Unread.Repositories != 1 {
		t.Fatalf("first page unread = %+v", first.Unread)
	}
	searched := fetch("perPage=10&q=1.0.3")
	if searched.Unread.Releases != 1 || searched.Unread.Repositories != 1 {
		t.Fatalf("a search must not change the unread summary: %+v", searched.Unread)
	}
	if older := fetch("perPage=5&cursor=" + url.QueryEscape(*first.NextCursor)); older.Unread.Releases != 1 {
		t.Fatalf("an older page must not change the unread summary: %+v", older.Unread)
	}
}

func TestBulkUpdateAppsOnlyTouchesTheCallersRepositories(t *testing.T) {
	handler, db, token, otherToken, csrf := featureTestServer(t)
	ctx := context.Background()

	for _, statement := range []string{
		`INSERT INTO "WatchedApp" (id,name,slug,repoOwner,repoName,repoFullName,githubUrl,userId,notificationsEnabled) VALUES ('app-1','One','one','o','one','o/one','https://github.com/o/one','user-1',1)`,
		`INSERT INTO "WatchedApp" (id,name,slug,repoOwner,repoName,repoFullName,githubUrl,userId,notificationsEnabled) VALUES ('app-2','Two','two','o','two','o/two','https://github.com/o/two','user-1',1)`,
		`INSERT INTO "WatchedApp" (id,name,slug,repoOwner,repoName,repoFullName,githubUrl,userId,notificationsEnabled) VALUES ('app-3','Other','other','o','other','o/other','https://github.com/o/other','user-2',1)`,
	} {
		if _, err := db.DB().ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}

	if response := featureWrite(t, handler, http.MethodPost, "/api/apps/bulk", token, "", map[string]any{"ids": []string{"app-1"}, "notificationsEnabled": false}); response.Code != http.StatusForbidden {
		t.Fatalf("bulk update without CSRF = %d, want 403", response.Code)
	}

	// app-3 belongs to another user and must be ignored even when named.
	response := featureWrite(t, handler, http.MethodPost, "/api/apps/bulk", token, csrf, map[string]any{
		"ids":                  []string{"app-1", "app-3"},
		"notificationsEnabled": false,
		"checkIntervalMinutes": 15,
	})
	if response.Code != http.StatusOK {
		t.Fatalf("bulk update = %d: %s", response.Code, response.Body.String())
	}
	var result struct {
		Updated int `json:"updated"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Updated != 1 {
		t.Fatalf("bulk update touched %d repositories, want 1", result.Updated)
	}

	read := func(id string) (enabled, interval int) {
		if err := db.DB().QueryRowContext(ctx, `SELECT notificationsEnabled,checkIntervalMinutes FROM "WatchedApp" WHERE id=?`, id).Scan(&enabled, &interval); err != nil {
			t.Fatal(err)
		}
		return
	}
	if enabled, interval := read("app-1"); enabled != 0 || interval != 15 {
		t.Fatalf("app-1 was not updated: enabled=%d interval=%d", enabled, interval)
	}
	if enabled, interval := read("app-2"); enabled != 1 || interval != 360 {
		t.Fatalf("app-2 was changed without being selected: enabled=%d interval=%d", enabled, interval)
	}
	if enabled, _ := read("app-3"); enabled != 1 {
		t.Fatal("another user's repository was changed")
	}

	// The other user's session cannot see or update app-1 either.
	other := featureWrite(t, handler, http.MethodPost, "/api/apps/bulk", otherToken, csrf, map[string]any{
		"ids":         []string{"app-1"},
		"excludeTags": "*-nightly",
	})
	if other.Code != http.StatusOK {
		t.Fatalf("other user bulk update = %d: %s", other.Code, other.Body.String())
	}
	var exclude string
	if err := db.DB().QueryRowContext(ctx, `SELECT excludeTags FROM "WatchedApp" WHERE id='app-1'`).Scan(&exclude); err != nil {
		t.Fatal(err)
	}
	if exclude != "" {
		t.Fatalf("the other user changed app-1's filters: %q", exclude)
	}
}
