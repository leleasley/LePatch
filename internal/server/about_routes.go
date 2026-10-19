package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"
)

var latestReleaseEndpoint = "https://api.github.com/repos/leleasley/LePatch/releases/latest"

type githubLatestRelease struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	HTMLURL     string    `json:"html_url"`
	PublishedAt time.Time `json:"published_at"`
}

func (s *Server) about(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	result := map[string]any{"version": Version, "repository": "https://github.com/leleasley/LePatch", "release": nil, "releaseCheckAvailable": false}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, latestReleaseEndpoint, nil)
	if err != nil {
		writeJSON(w, http.StatusOK, result)
		return
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "LePatch-release-checker")
	response, err := http.DefaultClient.Do(req)
	if err == nil {
		defer response.Body.Close()
		if response.StatusCode == http.StatusNotFound {
			result["releaseCheckAvailable"] = true
		}
		if response.StatusCode == http.StatusOK {
			var release githubLatestRelease
			if json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&release) == nil && release.TagName != "" {
				result["release"] = release
				result["releaseCheckAvailable"] = true
			}
		}
	}
	writeJSON(w, http.StatusOK, result)
}
