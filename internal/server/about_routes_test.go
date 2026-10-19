package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAboutReturnsCurrentVersionAndLatestRelease(t *testing.T) {
	releaseServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Accept"); got != "application/vnd.github+json" {
			t.Errorf("GitHub Accept header = %q", got)
		}
		_, _ = w.Write([]byte(`{"tag_name":"v1.2.3","name":"Release 1.2.3","html_url":"https://github.com/leleasley/LePatch/releases/tag/v1.2.3"}`))
	}))
	defer releaseServer.Close()
	originalEndpoint, originalVersion := latestReleaseEndpoint, Version
	latestReleaseEndpoint, Version = releaseServer.URL, "1.2.2"
	t.Cleanup(func() { latestReleaseEndpoint, Version = originalEndpoint, originalVersion })

	response := httptest.NewRecorder()
	(&Server{}).about(response, httptest.NewRequest(http.MethodGet, "/api/about", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("GET /api/about = %d: %s", response.Code, response.Body.String())
	}
	var result struct {
		Version               string              `json:"version"`
		ReleaseCheckAvailable bool                `json:"releaseCheckAvailable"`
		Release               githubLatestRelease `json:"release"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Version != "1.2.2" || !result.ReleaseCheckAvailable || result.Release.TagName != "v1.2.3" {
		t.Fatalf("unexpected about response: %#v", result)
	}
}
