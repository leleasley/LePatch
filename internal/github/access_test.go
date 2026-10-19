package github

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"lepatch/internal/store"
)

// accessClient returns a client backed by an in-memory database so the
// response cache can be used.
func accessClient(t *testing.T, baseURL string) *Client {
	t.Helper()
	db, err := store.Open(context.Background(), ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	client := NewClient(db.DB(), "token", "user-1")
	client.BaseURL = baseURL
	return client
}

func TestNotFoundExplainsAPrivateRepository(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-OAuth-Scopes", "read:user")
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	client := accessClient(t, server.URL)
	_, err := client.Get(context.Background(), "repos/owner/private/releases")
	if err == nil {
		t.Fatal("expected an error for a missing repository")
	}
	access, ok := err.(*AccessError)
	if !ok {
		t.Fatalf("expected an AccessError, got %T: %v", err, err)
	}
	if access.Status != http.StatusNotFound {
		t.Fatalf("unexpected status %d", access.Status)
	}
	if !strings.Contains(err.Error(), "reconnect GitHub") {
		t.Fatalf("the message should point at the narrow token scope: %v", err)
	}
}

func TestNotFoundWithPrivateScopeExplainsTheRepository(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-OAuth-Scopes", "repo, read:user")
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	client := accessClient(t, server.URL)
	_, err := client.Get(context.Background(), "repos/owner/private/releases")
	if _, ok := err.(*AccessError); !ok {
		t.Fatalf("expected an AccessError, got %T: %v", err, err)
	}
	if strings.Contains(err.Error(), "reconnect GitHub") {
		t.Fatalf("the token already has the private repository scope: %v", err)
	}
	if !strings.Contains(err.Error(), "private") {
		t.Fatalf("the message should mention the private repository: %v", err)
	}
}

func TestForbiddenIsReportedAsAnAccessError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-OAuth-Scopes", "repo")
		w.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()

	client := accessClient(t, server.URL)
	_, err := client.Get(context.Background(), "repos/owner/repo/releases")
	access, ok := err.(*AccessError)
	if !ok {
		t.Fatalf("expected an AccessError, got %T: %v", err, err)
	}
	if access.Status != http.StatusForbidden {
		t.Fatalf("unexpected status %d", access.Status)
	}
}

func TestSuccessfulResponsesCarryTheGrantedScopes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-OAuth-Scopes", "repo, read:user")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`[]`))
	}))
	defer server.Close()

	client := accessClient(t, server.URL)
	result, err := client.Get(context.Background(), "repos/owner/repo/releases")
	if err != nil {
		t.Fatal(err)
	}
	if !result.HasPrivateRepoScope() {
		t.Fatalf("the private repository scope was not reported: %q", result.Scopes)
	}
}
