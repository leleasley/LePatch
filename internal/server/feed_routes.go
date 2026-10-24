package server

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"lepatch/internal/auth"
)

const maxFeedTokens = 10

type feedToken struct {
	ID         string  `json:"id"`
	Label      string  `json:"label"`
	CreatedAt  string  `json:"createdAt"`
	LastUsedAt *string `json:"lastUsedAt"`
}

type feedRelease struct {
	ID               string  `json:"id"`
	AppID            string  `json:"appId"`
	AppName          string  `json:"appName"`
	RepoFullName     string  `json:"repoFullName"`
	TagName          string  `json:"tagName"`
	Name             *string `json:"name"`
	HTMLURL          string  `json:"htmlUrl"`
	Summary          *string `json:"summary"`
	Prerelease       bool    `json:"prerelease"`
	SecurityRelevant bool    `json:"securityRelevant"`
	PublishedAt      *string `json:"publishedAt"`
	DetectedAt       string  `json:"detectedAt"`
	InAppURL         string  `json:"inAppUrl"`
}

// feedTokenHash is what gets stored. The plaintext token is only ever returned
// once, when it is created.
func feedTokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func newFeedToken() (string, error) {
	buffer := make([]byte, 32)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return "lp_" + base64.RawURLEncoding.EncodeToString(buffer), nil
}

func (s *Server) listFeedTokens(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT id,label,createdAt,lastUsedAt FROM "FeedToken" WHERE userId=? ORDER BY createdAt DESC`, principal.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load feed tokens")
		return
	}
	defer rows.Close()
	tokens := make([]feedToken, 0, maxFeedTokens)
	for rows.Next() {
		var item feedToken
		if err := rows.Scan(&item.ID, &item.Label, &item.CreatedAt, &item.LastUsedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read feed tokens")
			return
		}
		tokens = append(tokens, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"tokens": tokens, "baseUrl": s.feedBaseURL()})
}

func (s *Server) createFeedToken(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	var input struct {
		Label string `json:"label"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Label = strings.TrimSpace(input.Label)
	if len(input.Label) > 60 {
		writeError(w, http.StatusBadRequest, "Feed label must be 60 characters or fewer")
		return
	}

	var count int
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT count(*) FROM "FeedToken" WHERE userId=?`, principal.UserID).Scan(&count); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create feed token")
		return
	}
	if count >= maxFeedTokens {
		writeError(w, http.StatusBadRequest, "Revoke an existing feed before creating another")
		return
	}

	token, err := newFeedToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create feed token")
		return
	}
	id := newID()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := s.store.DB().ExecContext(r.Context(), `INSERT INTO "FeedToken" (id,userId,label,tokenHash,createdAt) VALUES (?,?,?,?,?)`, id, principal.UserID, input.Label, feedTokenHash(token), now); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create feed token")
		return
	}
	s.writeAudit(r.Context(), principal.UserID, "feed.created", id, nil, s.clientIP(r))

	base := s.feedBaseURL()
	writeJSON(w, http.StatusCreated, map[string]any{
		"token":   feedToken{ID: id, Label: input.Label, CreatedAt: now},
		"secret":  token,
		"atomUrl": base + "/feed/" + token,
		"jsonUrl": base + "/feed/" + token + ".json",
	})
}

func (s *Server) revokeFeedToken(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	id := chi.URLParam(r, "id")
	result, err := s.store.DB().ExecContext(r.Context(), `DELETE FROM "FeedToken" WHERE id=? AND userId=?`, id, principal.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not revoke feed token")
		return
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		writeError(w, http.StatusNotFound, "Feed not found")
		return
	}
	s.writeAudit(r.Context(), principal.UserID, "feed.revoked", id, nil, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) feedBaseURL() string {
	if s.config.AppURL == nil {
		return ""
	}
	return strings.TrimRight(s.config.AppURL.String(), "/")
}

// resolveFeedToken turns the public token into a user id. The plaintext token
// is never stored, so a database copy cannot be used to read someone's feed.
func (s *Server) resolveFeedToken(r *http.Request) (string, string, bool) {
	raw := chi.URLParam(r, "token")
	raw = strings.TrimSuffix(raw, ".json")
	raw = strings.TrimSuffix(raw, ".xml")
	if raw == "" || len(raw) > 128 {
		return "", "", false
	}
	hash := feedTokenHash(raw)
	var userID, tokenID string
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT userId,id FROM "FeedToken" WHERE tokenHash=?`, hash).Scan(&userID, &tokenID); err != nil {
		return "", "", false
	}
	_, _ = s.store.DB().ExecContext(r.Context(), `UPDATE "FeedToken" SET lastUsedAt=? WHERE id=?`, time.Now().UTC().Format(time.RFC3339Nano), tokenID)
	return userID, tokenID, true
}

func (s *Server) loadFeedReleases(r *http.Request, userID string) ([]feedRelease, error) {
	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT r.id, r.tagName, r.name, r.htmlUrl, r.changelogSummary, r.prerelease, r.securityRelevant, r.publishedAt, r.detectedAt, a.id, a.name, a.repoFullName
		FROM "Release" r JOIN "WatchedApp" a ON a.id = r.watchedAppId
		WHERE a.userId = ? AND r.ignored = 0
		ORDER BY r.detectedAt DESC LIMIT 50`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]feedRelease, 0, 50)
	for rows.Next() {
		var item feedRelease
		if err := rows.Scan(&item.ID, &item.TagName, &item.Name, &item.HTMLURL, &item.Summary, &item.Prerelease, &item.SecurityRelevant, &item.PublishedAt, &item.DetectedAt, &item.AppID, &item.AppName, &item.RepoFullName); err != nil {
			return nil, err
		}
		item.InAppURL = s.feedBaseURL() + "/apps/" + item.AppID + "/releases/" + item.ID
		items = append(items, item)
	}
	return items, rows.Err()
}

// serveFeed is public: the unguessable token in the path is the credential.
func (s *Server) serveFeed(w http.ResponseWriter, r *http.Request) {
	userID, _, ok := s.resolveFeedToken(r)
	if !ok {
		writeError(w, http.StatusNotFound, "Feed not found")
		return
	}
	releases, err := s.loadFeedReleases(r, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load feed")
		return
	}
	w.Header().Set("Cache-Control", "private, max-age=300")
	if strings.HasSuffix(r.URL.Path, ".json") {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"version":       "https://jsonfeed.org/version/1.1",
			"title":         "LePatch releases",
			"home_page_url": s.feedBaseURL() + "/",
			"items":         releases,
		})
		return
	}
	w.Header().Set("Content-Type", "application/atom+xml; charset=utf-8")
	_ = xml.NewEncoder(w).Encode(atomFeedFor(s.feedBaseURL(), releases))
}

type atomLink struct {
	Href string `xml:"href,attr"`
	Rel  string `xml:"rel,attr,omitempty"`
	Type string `xml:"type,attr,omitempty"`
}

type atomCategory struct {
	Term string `xml:"term,attr"`
}

type atomEntry struct {
	Title    string         `xml:"title"`
	ID       string         `xml:"id"`
	Link     atomLink       `xml:"link"`
	Updated  string         `xml:"updated"`
	Summary  string         `xml:"summary"`
	Category []atomCategory `xml:"category"`
}

type atomAuthor struct {
	Name string `xml:"name"`
}

type atomFeed struct {
	XMLName xml.Name    `xml:"feed"`
	XMLNS   string      `xml:"xmlns,attr"`
	Title   string      `xml:"title"`
	ID      string      `xml:"id"`
	Updated string      `xml:"updated"`
	Link    []atomLink  `xml:"link"`
	Author  atomAuthor  `xml:"author"`
	Entry   []atomEntry `xml:"entry"`
}

func atomFeedFor(baseURL string, releases []feedRelease) atomFeed {
	updated := time.Now().UTC().Format(time.RFC3339)
	if len(releases) > 0 {
		updated = releases[0].DetectedAt
	}
	feed := atomFeed{
		XMLNS:   "http://www.w3.org/2005/Atom",
		Title:   "LePatch releases",
		ID:      baseURL + "/feed",
		Updated: updated,
		Link: []atomLink{
			{Href: baseURL + "/feed", Rel: "self", Type: "application/atom+xml"},
			{Href: baseURL + "/", Rel: "alternate", Type: "text/html"},
		},
		Author: atomAuthor{Name: "LePatch"},
		Entry:  make([]atomEntry, 0, len(releases)),
	}
	for _, release := range releases {
		title := release.AppName + " " + release.TagName
		if name := strings.TrimSpace(textValueOf(release.Name)); name != "" {
			title = name
			if !strings.Contains(strings.ToLower(name), strings.ToLower(release.AppName)) {
				title += " · " + release.AppName
			}
		}
		summary := release.RepoFullName
		if release.Summary != nil && strings.TrimSpace(*release.Summary) != "" {
			summary = *release.Summary
		}
		categories := []atomCategory{{Term: release.RepoFullName}}
		if release.Prerelease {
			categories = append(categories, atomCategory{Term: "pre-release"})
		}
		if release.SecurityRelevant {
			categories = append(categories, atomCategory{Term: "security"})
		}
		feed.Entry = append(feed.Entry, atomEntry{
			Title:    title,
			ID:       "tag:lepatch," + release.ID,
			Link:     atomLink{Href: release.InAppURL, Rel: "alternate", Type: "text/html"},
			Updated:  release.DetectedAt,
			Summary:  summary,
			Category: categories,
		})
	}
	return feed
}

func textValueOf(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
