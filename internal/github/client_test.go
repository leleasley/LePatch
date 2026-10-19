package github

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"lepatch/internal/store"
)

func TestGetUsesETagAndServesCachedDataOnRateLimit(t *testing.T) {
	db, err := store.Open(context.Background(), ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if got := r.Header.Get("Authorization"); got != "Bearer private-test-token" {
			t.Errorf("authorization header = %q", got)
		}
		switch requests.Load() {
		case 1:
			w.Header().Set("ETag", `"release-1"`)
			w.Header().Set("Last-Modified", "Sun, 18 Oct 2026 12:00:00 GMT")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`[{"id":1,"tag_name":"v1"}]`))
		case 2:
			if got := r.Header.Get("If-None-Match"); got != `"release-1"` {
				t.Errorf("If-None-Match = %q", got)
			}
			w.WriteHeader(http.StatusNotModified)
		case 3:
			w.Header().Set("X-RateLimit-Remaining", "0")
			w.Header().Set("X-RateLimit-Reset", "1792320000")
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"message":"API rate limit exceeded"}`))
		}
	}))
	defer server.Close()

	client := NewClient(db.DB(), "private-test-token", "user-1")
	client.BaseURL = server.URL
	client.Now = func() time.Time { return time.Unix(1792310000, 0) }

	first, err := client.Get(context.Background(), "/repos/owner/repo/releases?per_page=100")
	if err != nil {
		t.Fatal(err)
	}
	if first.Stale || first.ETag != `"release-1"` {
		t.Fatalf("first response = %#v", first)
	}

	second, err := client.Get(context.Background(), "/repos/owner/repo/releases?per_page=100")
	if err != nil {
		t.Fatal(err)
	}
	if second.Stale || string(second.Body) != string(first.Body) {
		t.Fatalf("304 response did not reuse cached body: %#v", second)
	}

	third, err := client.Get(context.Background(), "/repos/owner/repo/releases?per_page=100")
	if err != nil {
		t.Fatal(err)
	}
	if !third.Stale || string(third.Body) != string(first.Body) || third.RateLimitReset == nil {
		t.Fatalf("rate-limited response did not degrade to cache: %#v", third)
	}
	if requests.Load() != 3 {
		t.Fatalf("request count = %d, want 3", requests.Load())
	}
}

func TestGetReturnsRateLimitWhenNoCacheExists(t *testing.T) {
	db, err := store.Open(context.Background(), ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-RateLimit-Remaining", "0")
		w.Header().Set("X-RateLimit-Reset", "1792320000")
		w.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()
	client := NewClient(db.DB(), "", "")
	client.BaseURL = server.URL
	_, err = client.Get(context.Background(), "/repos/owner/repo/releases")
	if _, ok := err.(*RateLimitError); !ok {
		t.Fatalf("error = %T (%v), want RateLimitError", err, err)
	}
}
