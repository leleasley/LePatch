package github

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const maxResponseBytes = 8 << 20

type Client struct {
	DB      *sql.DB
	HTTP    *http.Client
	BaseURL string
	Token   string
	UserID  string
	Now     func() time.Time
}

type Result struct {
	Body               []byte
	ETag               string
	LastModified       string
	Stale              bool
	RateLimitRemaining int
	RateLimitReset     *time.Time
	Scopes             string
}

type RateLimitError struct {
	Remaining int
	ResetAt   *time.Time
}

func (e *RateLimitError) Error() string {
	if e.ResetAt != nil {
		return fmt.Sprintf("GitHub API rate limit reached; reset at %s", e.ResetAt.UTC().Format(time.RFC3339))
	}
	return "GitHub API rate limit reached"
}

// AccessError reports that GitHub refused to serve a resource. It is almost
// always a repository that is private, renamed, or not shared with the
// linked GitHub account, which is common for sponsored repositories.
type AccessError struct {
	Status int
	Scopes string
}

func (e *AccessError) Error() string {
	switch e.Status {
	case http.StatusNotFound:
		if e.Scopes != "" && !scopeAllowsPrivate(e.Scopes) {
			return "GitHub returned 404. The connected GitHub account cannot read private repositories, so reconnect GitHub and grant repository access"
		}
		return "GitHub returned 404. The repository is private, renamed, or not shared with the connected GitHub account"
	case http.StatusForbidden:
		return "GitHub denied access to this repository. Share it with the connected GitHub account and reconnect GitHub"
	case http.StatusUnauthorized:
		return "GitHub rejected the connected token. Reconnect GitHub to restore access"
	}
	return fmt.Sprintf("GitHub API returned HTTP %d", e.Status)
}

// scopeAllowsPrivate reports whether the granted OAuth scopes include the
// private repository scope.
func scopeAllowsPrivate(scopes string) bool {
	for _, scope := range strings.Split(scopes, ",") {
		if strings.EqualFold(strings.TrimSpace(scope), "repo") {
			return true
		}
	}
	return false
}

// HasPrivateRepoScope reports whether the token used for a request carries
// the scope needed to read private repositories.
func (r Result) HasPrivateRepoScope() bool {
	return scopeAllowsPrivate(r.Scopes)
}

func NewClient(db *sql.DB, token, userID string) *Client {
	return &Client{
		DB:      db,
		HTTP:    &http.Client{Timeout: 25 * time.Second},
		BaseURL: "https://api.github.com",
		Token:   token,
		UserID:  userID,
		Now:     time.Now,
	}
}

func (c *Client) Get(ctx context.Context, endpoint string) (Result, error) {
	base, err := url.Parse(c.BaseURL)
	if err != nil || base.Scheme == "" || base.Host == "" {
		return Result{}, fmt.Errorf("GitHub API base URL is invalid")
	}
	path, err := url.Parse(endpoint)
	if err != nil || path.IsAbs() || strings.HasPrefix(path.Path, "//") {
		return Result{}, fmt.Errorf("GitHub API endpoint must be relative")
	}
	base.Path = strings.TrimRight(base.Path, "/") + "/" + strings.TrimLeft(path.Path, "/")
	base.RawQuery = path.RawQuery
	cacheKey := c.cacheKey(endpoint)
	cached, _ := c.loadCache(ctx, cacheKey)

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, base.String(), nil)
	if err != nil {
		return Result{}, fmt.Errorf("build GitHub API request: %w", err)
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "LePatch")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if c.Token != "" {
		request.Header.Set("Authorization", "Bearer "+c.Token)
	}
	if cached.etag != "" {
		request.Header.Set("If-None-Match", cached.etag)
	}
	if cached.lastModified != "" {
		request.Header.Set("If-Modified-Since", cached.lastModified)
	}

	client := c.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	response, err := client.Do(request)
	if err != nil {
		if cached.body != nil {
			return Result{Body: cached.body, ETag: cached.etag, LastModified: cached.lastModified, Stale: true}, nil
		}
		return Result{}, fmt.Errorf("GitHub API request failed")
	}
	defer response.Body.Close()
	resetAt := parseResetAt(response.Header.Get("X-RateLimit-Reset"))
	remainingHeader := response.Header.Get("X-RateLimit-Remaining")
	remaining, _ := strconv.Atoi(remainingHeader)
	scopes := response.Header.Get("X-OAuth-Scopes")

	if response.StatusCode == http.StatusNotModified {
		if cached.body == nil {
			return Result{}, fmt.Errorf("GitHub returned 304 without a cached response")
		}
		etag := firstNonEmpty(response.Header.Get("ETag"), cached.etag)
		lastModified := firstNonEmpty(response.Header.Get("Last-Modified"), cached.lastModified)
		c.saveCache(ctx, cacheKey, etag, lastModified, cached.body)
		return Result{Body: cached.body, ETag: etag, LastModified: lastModified, RateLimitRemaining: remaining, RateLimitReset: resetAt, Scopes: scopes}, nil
	}

	if response.StatusCode == http.StatusOK {
		body, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
		if err != nil {
			if cached.body != nil {
				return Result{Body: cached.body, ETag: cached.etag, LastModified: cached.lastModified, Stale: true, Scopes: scopes}, nil
			}
			return Result{}, fmt.Errorf("read GitHub API response")
		}
		if len(body) > maxResponseBytes {
			return Result{}, fmt.Errorf("GitHub API response exceeded the size limit")
		}
		etag := response.Header.Get("ETag")
		lastModified := response.Header.Get("Last-Modified")
		c.saveCache(ctx, cacheKey, etag, lastModified, body)
		return Result{Body: body, ETag: etag, LastModified: lastModified, RateLimitRemaining: remaining, RateLimitReset: resetAt, Scopes: scopes}, nil
	}

	if isRateLimited(response, remainingHeader) {
		if cached.body != nil {
			return Result{Body: cached.body, ETag: cached.etag, LastModified: cached.lastModified, Stale: true, RateLimitRemaining: remaining, RateLimitReset: resetAt, Scopes: scopes}, nil
		}
		return Result{}, &RateLimitError{Remaining: remaining, ResetAt: resetAt}
	}
	if response.StatusCode >= 500 && cached.body != nil {
		return Result{Body: cached.body, ETag: cached.etag, LastModified: cached.lastModified, Stale: true, RateLimitRemaining: remaining, RateLimitReset: resetAt, Scopes: scopes}, nil
	}
	if response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusForbidden || response.StatusCode == http.StatusUnauthorized {
		return Result{}, &AccessError{Status: response.StatusCode, Scopes: scopes}
	}
	return Result{}, fmt.Errorf("GitHub API returned HTTP %d", response.StatusCode)
}

type cachedResponse struct {
	etag         string
	lastModified string
	body         []byte
}

func (c *Client) loadCache(ctx context.Context, key string) (cachedResponse, error) {
	var result cachedResponse
	var etag, lastModified sql.NullString
	err := c.DB.QueryRowContext(ctx, `SELECT etag, lastModified, body FROM "GitHubETagCache" WHERE cacheKey = ?`, key).Scan(&etag, &lastModified, &result.body)
	if err != nil {
		return cachedResponse{}, err
	}
	result.etag = etag.String
	result.lastModified = lastModified.String
	return result, nil
}

func (c *Client) saveCache(ctx context.Context, key, etag, lastModified string, body []byte) {
	now := time.Now()
	if c.Now != nil {
		now = c.Now()
	}
	_, _ = c.DB.ExecContext(ctx, `INSERT INTO "GitHubETagCache" (cacheKey, etag, lastModified, body, fetchedAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT(cacheKey) DO UPDATE SET etag=excluded.etag, lastModified=excluded.lastModified, body=excluded.body, fetchedAt=excluded.fetchedAt`, key, nullable(etag), nullable(lastModified), body, now.UTC().Format(time.RFC3339Nano))
}

func (c *Client) cacheKey(endpoint string) string {
	if c.Token == "" {
		return "public:" + endpoint
	}
	digest := sha256.Sum256([]byte(c.Token))
	return "user:" + c.UserID + ":token:" + hex.EncodeToString(digest[:8]) + ":" + endpoint
}

func isRateLimited(response *http.Response, remainingHeader string) bool {
	if response.StatusCode == http.StatusTooManyRequests {
		return true
	}
	if response.StatusCode != http.StatusForbidden {
		return false
	}
	if remainingHeader == "0" || response.Header.Get("Retry-After") != "" {
		return true
	}
	return strings.Contains(strings.ToLower(response.Header.Get("X-RateLimit-Resource")), "core") && response.Header.Get("X-RateLimit-Reset") != ""
}

func parseResetAt(value string) *time.Time {
	seconds, err := strconv.ParseInt(value, 10, 64)
	if err != nil || seconds <= 0 {
		return nil
	}
	reset := time.Unix(seconds, 0).UTC()
	return &reset
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}
