package server

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"lepatch/internal/auth"
	gh "lepatch/internal/github"
	"lepatch/internal/secrets"
)

func (s *Server) githubRead(w http.ResponseWriter, r *http.Request) {
	principal, err := s.auth.Session(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if r.URL.Path == "/api/github/sponsored" {
		s.sponsoredMaintainers(w, r, principal.UserID)
		return
	}
	owner, repo := r.URL.Query().Get("owner"), r.URL.Query().Get("repo")
	if owner != "" && repo != "" && !validRepository(owner+"/"+repo) {
		writeError(w, http.StatusBadRequest, "Invalid GitHub repository")
		return
	}
	endpoint, err := githubEndpoint(r, owner, repo)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	token, tokenErr := s.githubToken(r.Context(), principal.UserID)
	if r.URL.Path == "/api/github/user-repos" && tokenErr != nil {
		writeError(w, http.StatusBadRequest, "Connect a GitHub account to list your repositories")
		return
	}
	if tokenErr != nil {
		token = s.config.GitHubToken
	}
	client := gh.NewClient(s.store.DB(), token, principal.UserID)
	client.BaseURL = s.githubAPIBase
	result, err := client.Get(r.Context(), endpoint)
	if err != nil {
		if rateLimited, ok := err.(*gh.RateLimitError); ok {
			w.Header().Set("Retry-After", "60")
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": rateLimited.Error()})
			return
		}
		writeError(w, http.StatusBadGateway, "GitHub is unavailable")
		return
	}
	if result.Stale {
		w.Header().Set("X-LePatch-Stale", "true")
		w.Header().Set("Warning", `110 - "Showing cached GitHub data"`)
	}
	if strings.Contains(r.URL.Path, "file-content") || r.URL.Path == "/api/github/readme" {
		var file struct {
			Content     string `json:"content"`
			Encoding    string `json:"encoding"`
			Name        string `json:"name"`
			Path        string `json:"path"`
			HTMLURL     string `json:"html_url"`
			DownloadURL string `json:"download_url"`
			SHA         string `json:"sha"`
		}
		if json.Unmarshal(result.Body, &file) == nil && strings.EqualFold(file.Encoding, "base64") {
			decoded, decodeErr := base64.StdEncoding.DecodeString(strings.ReplaceAll(file.Content, "\n", ""))
			if decodeErr == nil {
				writeJSON(w, http.StatusOK, map[string]string{"content": string(decoded), "name": file.Name, "path": file.Path, "htmlUrl": file.HTMLURL, "downloadUrl": file.DownloadURL, "sha": file.SHA})
				return
			}
		}
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(result.Body)
}

type sponsoredMaintainer struct {
	ID        string `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
	HTMLURL   string `json:"html_url"`
	Bio       string `json:"bio"`
}

var errNotActivelySponsored = errors.New("maintainer is not actively sponsored by this account")

func (s *Server) sponsoredMaintainerRepos(w http.ResponseWriter, r *http.Request) {
	principal, err := s.auth.Session(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	login := chi.URLParam(r, "login")
	if !validRepository(login + "/repository") {
		writeError(w, http.StatusBadRequest, "Invalid GitHub account")
		return
	}
	token, err := s.githubToken(r.Context(), principal.UserID)
	if err != nil || token == "" {
		writeError(w, http.StatusBadRequest, "Connect your GitHub account to view sponsored repositories")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	repositories, err := fetchActivelySponsoredRepos(ctx, http.DefaultClient, "https://api.github.com/graphql", "https://api.github.com", token, login)
	if errors.Is(err, errNotActivelySponsored) {
		writeError(w, http.StatusForbidden, "This maintainer is not in your active sponsorships")
		return
	}
	if err != nil {
		s.logger.Warn("Could not load sponsored maintainer repositories", "login", login, "error", err.Error())
		writeError(w, http.StatusBadGateway, "Could not verify this sponsorship or load repositories")
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, map[string]any{"items": repositories, "total": len(repositories)})
}

// fetchActivelySponsoredRepos re-checks the viewer's current GitHub sponsorship
// before listing only public repositories whose owner is the sponsored account.
func fetchActivelySponsoredRepos(ctx context.Context, client *http.Client, graphqlEndpoint, apiBase, token, login string) ([]map[string]any, error) {
	maintainers, err := fetchSponsoredMaintainers(ctx, client, graphqlEndpoint, token)
	if err != nil {
		return nil, err
	}
	activeLogin := ""
	for _, maintainer := range maintainers {
		if strings.EqualFold(maintainer.Login, login) {
			activeLogin = maintainer.Login
			break
		}
	}
	if activeLogin == "" {
		return nil, errNotActivelySponsored
	}
	endpoint := strings.TrimRight(apiBase, "/") + "/users/" + url.PathEscape(activeLogin) + "/repos?type=owner&sort=updated&direction=desc&per_page=100"
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "LePatch")
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("GitHub repository lookup returned status %d", response.StatusCode)
	}
	var repositories []struct {
		ID            int64   `json:"id"`
		Name          string  `json:"name"`
		FullName      string  `json:"full_name"`
		Description   *string `json:"description"`
		HTMLURL       string  `json:"html_url"`
		Stars         int     `json:"stargazers_count"`
		Language      *string `json:"language"`
		Homepage      *string `json:"homepage"`
		DefaultBranch string  `json:"default_branch"`
		Private       bool    `json:"private"`
		Owner         struct {
			Login     string `json:"login"`
			AvatarURL string `json:"avatar_url"`
		} `json:"owner"`
		License *struct {
			SPDXID string `json:"spdx_id"`
		} `json:"license"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 4<<20)).Decode(&repositories); err != nil {
		return nil, err
	}
	items := make([]map[string]any, 0, len(repositories))
	seen := make(map[string]bool)
	for _, repository := range repositories {
		if repository.Private || !strings.EqualFold(repository.Owner.Login, activeLogin) || repository.FullName == "" {
			continue
		}
		item := map[string]any{"id": repository.ID, "name": repository.Name, "full_name": repository.FullName, "description": repository.Description, "html_url": repository.HTMLURL, "stargazers_count": repository.Stars, "language": repository.Language, "homepage": repository.Homepage, "default_branch": repository.DefaultBranch, "owner": repository.Owner}
		if repository.License != nil {
			item["license"] = repository.License
		}
		items = append(items, item)
		seen[strings.ToLower(repository.FullName)] = true
	}
	// /users/{login}/repos omits private repositories. Add private repositories
	// only when GitHub's authenticated viewer endpoint says this token can access
	// them and the repository owner is the actively sponsored maintainer.
	for page := 1; page <= 10; page++ {
		privateEndpoint := strings.TrimRight(apiBase, "/") + "/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&direction=desc&per_page=100&page=" + strconv.Itoa(page)
		privateRequest, requestErr := http.NewRequestWithContext(ctx, http.MethodGet, privateEndpoint, nil)
		if requestErr != nil {
			return nil, requestErr
		}
		privateRequest.Header.Set("Authorization", "Bearer "+token)
		privateRequest.Header.Set("Accept", "application/vnd.github+json")
		privateRequest.Header.Set("User-Agent", "LePatch")
		privateResponse, requestErr := client.Do(privateRequest)
		if requestErr != nil {
			break
		}
		if privateResponse.StatusCode < 200 || privateResponse.StatusCode >= 300 {
			privateResponse.Body.Close()
			break // a missing repo scope should not hide public repositories
		}
		var accessible []struct {
			ID            int64   `json:"id"`
			Name          string  `json:"name"`
			FullName      string  `json:"full_name"`
			Description   *string `json:"description"`
			HTMLURL       string  `json:"html_url"`
			Stars         int     `json:"stargazers_count"`
			Language      *string `json:"language"`
			Homepage      *string `json:"homepage"`
			DefaultBranch string  `json:"default_branch"`
			Private       bool    `json:"private"`
			Owner         struct {
				Login     string `json:"login"`
				AvatarURL string `json:"avatar_url"`
			} `json:"owner"`
			License *struct {
				SPDXID string `json:"spdx_id"`
			} `json:"license"`
		}
		decodeErr := json.NewDecoder(io.LimitReader(privateResponse.Body, 4<<20)).Decode(&accessible)
		privateResponse.Body.Close()
		if decodeErr != nil {
			break
		}
		for _, repository := range accessible {
			key := strings.ToLower(repository.FullName)
			if !repository.Private || !strings.EqualFold(repository.Owner.Login, activeLogin) || repository.FullName == "" || seen[key] {
				continue
			}
			item := map[string]any{"id": repository.ID, "name": repository.Name, "full_name": repository.FullName, "description": repository.Description, "html_url": repository.HTMLURL, "stargazers_count": repository.Stars, "language": repository.Language, "homepage": repository.Homepage, "default_branch": repository.DefaultBranch, "private": true, "owner": repository.Owner}
			if repository.License != nil {
				item["license"] = repository.License
			}
			items = append(items, item)
			seen[key] = true
		}
		if len(accessible) < 100 {
			break
		}
	}
	return items, nil
}

type githubFileCommit struct {
	Owner   string `json:"owner"`
	Repo    string `json:"repo"`
	Path    string `json:"path"`
	Content string `json:"content"`
	Message string `json:"message"`
	SHA     string `json:"sha"`
	Branch  string `json:"branch"`
}

func (s *Server) commitGitHubFile(w http.ResponseWriter, r *http.Request) {
	principal, err := s.auth.Session(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	var input githubFileCommit
	if !decodeJSON(w, r, &input) {
		return
	}
	if !validRepository(input.Owner+"/"+input.Repo) || strings.TrimSpace(input.Path) == "" || strings.Contains(input.Path, "..") || strings.HasPrefix(input.Path, "/") || strings.TrimSpace(input.SHA) == "" || strings.TrimSpace(input.Message) == "" || len(input.Content) > 900000 {
		writeError(w, http.StatusBadRequest, "Provide a valid file, current SHA, commit message, and content under 900 KB")
		return
	}
	var linkedLogin string
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT githubUsername FROM "GitHubLink" WHERE userId=?`, principal.UserID).Scan(&linkedLogin); err != nil {
		writeError(w, http.StatusForbidden, "Connect the GitHub account that owns this repository")
		return
	}
	token, err := s.githubToken(r.Context(), principal.UserID)
	if err != nil {
		writeError(w, http.StatusForbidden, "Connect your GitHub account to commit changes")
		return
	}
	result, err := commitGitHubFile(r.Context(), http.DefaultClient, s.githubAPIBase, token, linkedLogin, input)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, result)
}

func commitGitHubFile(ctx context.Context, client *http.Client, apiBase, token, linkedLogin string, input githubFileCommit) (map[string]any, error) {
	if !strings.EqualFold(strings.TrimSpace(input.Owner), strings.TrimSpace(linkedLogin)) {
		return nil, errors.New("You can only commit to repositories owned by your linked GitHub account")
	}
	base := strings.TrimRight(apiBase, "/") + "/repos/" + url.PathEscape(input.Owner) + "/" + url.PathEscape(input.Repo)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, base, nil)
	if err != nil {
		return nil, err
	}
	setGitHubHeaders(request, token)
	response, err := client.Do(request)
	if err != nil {
		return nil, errors.New("Could not verify repository write access")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, errors.New("Could not verify repository write access")
	}
	var repo struct {
		Permissions struct {
			Push bool `json:"push"`
		} `json:"permissions"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&repo); err != nil || !repo.Permissions.Push {
		return nil, errors.New("Your GitHub account does not have write access to this repository")
	}
	payload := map[string]string{"message": input.Message, "content": base64.StdEncoding.EncodeToString([]byte(input.Content)), "sha": input.SHA}
	if input.Branch != "" {
		payload["branch"] = input.Branch
	}
	body, _ := json.Marshal(payload)
	request, err = http.NewRequestWithContext(ctx, http.MethodPut, base+"/contents/"+escapeRepoFilePath(input.Path), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	setGitHubHeaders(request, token)
	request.Header.Set("Content-Type", "application/json")
	response, err = client.Do(request)
	if err != nil {
		return nil, errors.New("GitHub could not save this commit")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, errors.New("GitHub rejected the commit. Reload the file and try again.")
	}
	var result map[string]any
	if err := json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(&result); err != nil {
		return nil, errors.New("GitHub saved the commit but returned an unreadable response")
	}
	return result, nil
}

func setGitHubHeaders(request *http.Request, token string) {
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "LePatch")
}
func escapeRepoFilePath(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	return strings.Join(parts, "/")
}

func (s *Server) sponsoredMaintainers(w http.ResponseWriter, r *http.Request, userID string) {
	token, err := s.githubToken(r.Context(), userID)
	if err != nil || token == "" {
		writeError(w, http.StatusBadRequest, "Connect your GitHub account in Account settings to load the maintainers you sponsor")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	items, err := fetchSponsoredMaintainers(ctx, http.DefaultClient, "https://api.github.com/graphql", token)
	if err != nil {
		message := "Could not load GitHub sponsorships. Reconnect your GitHub account and grant read:user access, then try again."
		s.logger.Warn("GitHub sponsorship lookup failed", "error", err.Error())
		writeError(w, http.StatusBadGateway, message)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
}

func fetchSponsoredMaintainers(ctx context.Context, client *http.Client, endpoint, token string) ([]sponsoredMaintainer, error) {
	const query = `query ($after: String) {
			viewer {
					sponsorshipsAsSponsor(first: 100, after: $after, activeOnly: true) {
				pageInfo { hasNextPage endCursor }
				nodes { sponsorable {
					__typename
					... on User { id login name avatarUrl url bio }
					... on Organization { id login name avatarUrl url description }
				} }
			}
		}
	}`
	type graphQLResponse struct {
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
		Data struct {
			Viewer struct {
				Sponsorships struct {
					PageInfo struct {
						HasNextPage bool    `json:"hasNextPage"`
						EndCursor   *string `json:"endCursor"`
					} `json:"pageInfo"`
					Nodes []struct {
						Sponsorable *struct {
							ID          string `json:"id"`
							Login       string `json:"login"`
							Name        string `json:"name"`
							AvatarURL   string `json:"avatarUrl"`
							URL         string `json:"url"`
							Bio         string `json:"bio"`
							Description string `json:"description"`
						} `json:"sponsorable"`
					} `json:"nodes"`
				} `json:"sponsorshipsAsSponsor"`
			} `json:"viewer"`
		} `json:"data"`
	}
	items := make([]sponsoredMaintainer, 0)
	seen := make(map[string]struct{})
	var after *string
	for page := 0; page < 10; page++ {
		payload := struct {
			Query     string `json:"query"`
			Variables struct {
				After *string `json:"after"`
			} `json:"variables"`
		}{Query: query}
		payload.Variables.After = after
		body, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		request.Header.Set("Authorization", "Bearer "+token)
		request.Header.Set("Accept", "application/vnd.github+json")
		request.Header.Set("User-Agent", "LePatch")
		request.Header.Set("Content-Type", "application/json")
		response, err := client.Do(request)
		if err != nil {
			return nil, err
		}
		var result graphQLResponse
		decodeErr := json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(&result)
		_ = response.Body.Close()
		if decodeErr != nil {
			return nil, decodeErr
		}
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return nil, fmt.Errorf("GitHub GraphQL returned status %d", response.StatusCode)
		}
		if len(result.Errors) > 0 {
			return nil, fmt.Errorf("GitHub GraphQL: %s", result.Errors[0].Message)
		}
		connection := result.Data.Viewer.Sponsorships
		for _, node := range connection.Nodes {
			person := node.Sponsorable
			if person == nil || person.Login == "" {
				continue
			}
			key := strings.ToLower(person.Login)
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			bio := person.Bio
			if bio == "" {
				bio = person.Description
			}
			items = append(items, sponsoredMaintainer{ID: person.ID, Login: person.Login, Name: person.Name, AvatarURL: person.AvatarURL, HTMLURL: person.URL, Bio: bio})
		}
		if !connection.PageInfo.HasNextPage || connection.PageInfo.EndCursor == nil {
			break
		}
		after = connection.PageInfo.EndCursor
	}
	return items, nil
}

func githubEndpoint(r *http.Request, owner, repo string) (string, error) {
	perPage := strconv.Itoa(queryInt(r, "perPage", queryInt(r, "per_page", 30, 1, 100), 1, 100))
	page := strconv.Itoa(queryInt(r, "page", 1, 1, 1_000_000))
	listQuery := url.Values{"per_page": {perPage}, "page": {page}}
	path := strings.TrimPrefix(r.URL.Path, "/api/github/")
	repoPath := "repos/" + url.PathEscape(owner) + "/" + url.PathEscape(repo)
	switch path {
	case "search":
		query := strings.TrimSpace(r.URL.Query().Get("q"))
		if query == "" {
			return "", fmt.Errorf("Search query is required")
		}
		search := url.Values{"q": {query}, "per_page": {perPage}, "page": {page}}
		copyQuery(search, r, "sort", "order")
		return "search/repositories?" + search.Encode(), nil
	case "sponsored":
		query := strings.TrimSpace(r.URL.Query().Get("q"))
		if query == "" {
			query = "sponsors"
		}
		search := url.Values{"q": {query + " topic:sponsor"}, "per_page": {perPage}, "page": {page}, "sort": {"stars"}, "order": {"desc"}}
		return "search/repositories?" + search.Encode(), nil
	case "user-repos":
		copyQuery(listQuery, r, "sort", "direction", "visibility", "affiliation")
		return "user/repos?" + listQuery.Encode(), nil
	case "user-repo":
		return repoPath, nil
	case "user-repo/releases":
		return repoPath + "/releases?" + listQuery.Encode(), nil
	case "contents":
		return repoContentsPath(repoPath, r.URL.Query().Get("path"), r.URL.Query().Get("ref")), nil
	case "readme":
		endpoint := repoPath + "/readme"
		if ref := strings.TrimSpace(r.URL.Query().Get("ref")); ref != "" {
			endpoint += "?ref=" + url.QueryEscape(ref)
		}
		return endpoint, nil
	case "file-content", "user-repo/file-content":
		return repoContentsPath(repoPath, r.URL.Query().Get("path"), r.URL.Query().Get("ref")), nil
	case "branches":
		return repoPath + "/branches?" + listQuery.Encode(), nil
	case "commits":
		commits := url.Values{"per_page": {perPage}, "page": {page}}
		copyQuery(commits, r, "sha", "path", "since", "until")
		return repoPath + "/commits?" + commits.Encode(), nil
	case "commits/{sha}/status":
		return repoPath + "/commits/" + url.PathEscape(chi.URLParam(r, "sha")) + "/status", nil
	case "issues":
		issues := url.Values{"per_page": {perPage}, "page": {page}}
		copyQuery(issues, r, "state", "sort", "direction", "labels", "since")
		return repoPath + "/issues?" + issues.Encode(), nil
	case "issue-detail":
		number := issueNumber(r)
		if number < 1 {
			return "", fmt.Errorf("Issue number is required")
		}
		return repoPath + "/issues/" + strconv.Itoa(number), nil
	case "issue-comments":
		number := issueNumber(r)
		if number < 1 {
			return "", fmt.Errorf("Issue number is required")
		}
		return repoPath + "/issues/" + strconv.Itoa(number) + "/comments?" + listQuery.Encode(), nil
	case "pulls":
		pulls := url.Values{"per_page": {perPage}, "page": {page}}
		copyQuery(pulls, r, "state", "sort", "direction", "base", "head")
		return repoPath + "/pulls?" + pulls.Encode(), nil
	case "actions":
		return repoPath + "/actions/runs?" + listQuery.Encode(), nil
	case "issue-templates":
		return repoPath + "/contents/.github/ISSUE_TEMPLATE", nil
	default:
		if strings.HasPrefix(path, "commits/") && strings.HasSuffix(path, "/status") {
			sha := strings.TrimSuffix(strings.TrimPrefix(path, "commits/"), "/status")
			if sha == "" || strings.Contains(sha, "/") {
				return "", fmt.Errorf("Commit SHA is required")
			}
			return repoPath + "/commits/" + url.PathEscape(sha) + "/status", nil
		}
		return "", fmt.Errorf("Unsupported GitHub request")
	}
}

func repoContentsPath(repoPath, path, ref string) string {
	endpoint := repoPath + "/contents"
	if path != "" {
		segments := strings.Split(strings.Trim(path, "/"), "/")
		encoded := make([]string, len(segments))
		for i, segment := range segments {
			encoded[i] = url.PathEscape(segment)
		}
		endpoint += "/" + strings.Join(encoded, "/")
	}
	if ref != "" {
		endpoint += "?ref=" + url.QueryEscape(ref)
	}
	return endpoint
}

func copyQuery(target url.Values, r *http.Request, names ...string) {
	for _, name := range names {
		if value := strings.TrimSpace(r.URL.Query().Get(name)); value != "" {
			target.Set(name, value)
		}
	}
}

func issueNumber(r *http.Request) int {
	return queryInt(r, "issueNumber", queryInt(r, "issue_number", 0, 0, 2_147_483_647), 0, 2_147_483_647)
}

func (s *Server) githubToken(ctx context.Context, userID string) (string, error) {
	var encrypted string
	err := s.store.DB().QueryRowContext(ctx, `SELECT accessToken FROM "GitHubLink" WHERE userId=?`, userID).Scan(&encrypted)
	if err != nil {
		return "", err
	}
	return secrets.DecryptIntegrationValue(s.config.EncryptionKey, encrypted)
}

func (s *Server) trackedIssues(w http.ResponseWriter, r *http.Request) {
	principal, err := s.auth.Session(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT id,owner,repo,issueNumber,issueTitle,lastCommentCount,lastCheckedAt,createdAt FROM "TrackedIssue" WHERE userId=? ORDER BY createdAt DESC LIMIT 200`, principal.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load tracked issues")
		return
	}
	defer rows.Close()
	type item struct {
		ID               string `json:"id"`
		Owner            string `json:"owner"`
		Repo             string `json:"repo"`
		IssueNumber      int    `json:"issueNumber"`
		IssueTitle       string `json:"issueTitle"`
		LastCommentCount int    `json:"lastCommentCount"`
		LastCheckedAt    string `json:"lastCheckedAt"`
		CreatedAt        string `json:"createdAt"`
	}
	items := make([]item, 0)
	for rows.Next() {
		var value item
		if err := rows.Scan(&value.ID, &value.Owner, &value.Repo, &value.IssueNumber, &value.IssueTitle, &value.LastCommentCount, &value.LastCheckedAt, &value.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read tracked issues")
			return
		}
		items = append(items, value)
	}
	writeJSON(w, http.StatusOK, map[string]any{"issues": items})
}

func (s *Server) trackIssue(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	var input struct {
		Owner  string `json:"owner"`
		Repo   string `json:"repo"`
		Number int    `json:"issueNumber"`
		Title  string `json:"issueTitle"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Owner = strings.TrimSpace(input.Owner)
	input.Repo = strings.TrimSpace(input.Repo)
	input.Title = strings.TrimSpace(input.Title)
	if !validRepository(input.Owner+"/"+input.Repo) || input.Number < 1 || input.Title == "" {
		writeError(w, http.StatusBadRequest, "Invalid issue details")
		return
	}
	var existingUser string
	err := s.store.DB().QueryRowContext(r.Context(), `SELECT userId FROM "TrackedIssue" WHERE owner=? AND repo=? AND issueNumber=?`, input.Owner, input.Repo, input.Number).Scan(&existingUser)
	if err == nil && existingUser != principal.UserID {
		writeError(w, http.StatusConflict, "This issue is already tracked by another user")
		return
	}
	if err != nil && err != sql.ErrNoRows {
		writeError(w, http.StatusInternalServerError, "Could not check tracked issue")
		return
	}
	_, err = s.store.DB().ExecContext(r.Context(), `INSERT INTO "TrackedIssue" (id,userId,owner,repo,issueNumber,issueTitle,lastCheckedAt,createdAt) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(owner,repo,issueNumber) DO UPDATE SET issueTitle=excluded.issueTitle`, newID(), principal.UserID, input.Owner, input.Repo, input.Number, input.Title, time.Now().UTC().Format(time.RFC3339Nano), time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not track issue")
		return
	}
	s.writeAudit(r.Context(), principal.UserID, "github.issue_tracked", input.Owner+"/"+input.Repo, map[string]any{"number": input.Number, "title": input.Title}, s.clientIP(r))
	_, _ = s.events.Publish(principal.UserID, "tracked-issue.updated", map[string]any{"owner": input.Owner, "repo": input.Repo, "issueNumber": input.Number})
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) untrackIssue(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	var input struct {
		Owner  string `json:"owner"`
		Repo   string `json:"repo"`
		Number int    `json:"issueNumber"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	result, err := s.store.DB().ExecContext(r.Context(), `DELETE FROM "TrackedIssue" WHERE userId=? AND owner=? AND repo=? AND issueNumber=?`, principal.UserID, input.Owner, input.Repo, input.Number)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not untrack issue")
		return
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		writeError(w, http.StatusNotFound, "Tracked issue not found")
		return
	}
	s.writeAudit(r.Context(), principal.UserID, "github.issue_untracked", input.Owner+"/"+input.Repo, map[string]any{"number": input.Number}, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) issueNotificationSettings(w http.ResponseWriter, r *http.Request) {
	principal, err := s.auth.Session(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	owner, repo := r.URL.Query().Get("owner"), r.URL.Query().Get("repo")
	if owner == "" || repo == "" {
		writeError(w, http.StatusBadRequest, "Repository is required")
		return
	}
	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT id,issueNumber,issueTitle,level,lastCommentCount,lastCheckedAt FROM "IssueNotificationSetting" WHERE userId=? AND owner=? AND repo=? ORDER BY issueNumber`, principal.UserID, owner, repo)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load issue notification settings")
		return
	}
	defer rows.Close()
	type setting struct {
		ID               string `json:"id"`
		IssueNumber      int    `json:"issueNumber"`
		IssueTitle       string `json:"issueTitle"`
		Level            string `json:"level"`
		LastCommentCount int    `json:"lastCommentCount"`
		LastCheckedAt    string `json:"lastCheckedAt"`
	}
	items := make([]setting, 0)
	for rows.Next() {
		var v setting
		if err := rows.Scan(&v.ID, &v.IssueNumber, &v.IssueTitle, &v.Level, &v.LastCommentCount, &v.LastCheckedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read issue notification settings")
			return
		}
		items = append(items, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"settings": items})
}

func (s *Server) saveIssueNotificationSetting(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	var input struct {
		Owner  string `json:"owner"`
		Repo   string `json:"repo"`
		Number int    `json:"issueNumber"`
		Title  string `json:"issueTitle"`
		Level  string `json:"level"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if !validRepository(input.Owner+"/"+input.Repo) || input.Number < 1 || input.Title == "" || (input.Level != "participating" && input.Level != "all_activity" && input.Level != "ignore") {
		writeError(w, http.StatusBadRequest, "Invalid issue notification setting")
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err := s.store.DB().ExecContext(r.Context(), `INSERT INTO "IssueNotificationSetting" (id,userId,owner,repo,issueNumber,issueTitle,level,lastCheckedAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(userId,owner,repo,issueNumber) DO UPDATE SET issueTitle=excluded.issueTitle,level=excluded.level,updatedAt=excluded.updatedAt`, newID(), principal.UserID, input.Owner, input.Repo, input.Number, input.Title, input.Level, now, now, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not save issue notification setting")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) deleteIssueNotificationSetting(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	var input struct {
		Owner  string `json:"owner"`
		Repo   string `json:"repo"`
		Number int    `json:"issueNumber"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	result, err := s.store.DB().ExecContext(r.Context(), `DELETE FROM "IssueNotificationSetting" WHERE userId=? AND owner=? AND repo=? AND issueNumber=?`, principal.UserID, input.Owner, input.Repo, input.Number)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not remove issue notification setting")
		return
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		writeError(w, http.StatusNotFound, "Issue notification setting not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) createGitHubIssue(w http.ResponseWriter, r *http.Request) {
	s.githubIssueMutation(w, r, "create")
}
func (s *Server) commentGitHubIssue(w http.ResponseWriter, r *http.Request) {
	s.githubIssueMutation(w, r, "comment")
}
func (s *Server) changeGitHubIssueState(w http.ResponseWriter, r *http.Request) {
	s.githubIssueMutation(w, r, "state")
}

func (s *Server) githubIssueMutation(w http.ResponseWriter, r *http.Request, operation string) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	var input struct {
		Owner  string `json:"owner"`
		Repo   string `json:"repo"`
		Number int    `json:"issueNumber"`
		Title  string `json:"title"`
		Body   string `json:"body"`
		State  string `json:"state"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if !validRepository(input.Owner + "/" + input.Repo) {
		writeError(w, http.StatusBadRequest, "Invalid GitHub repository")
		return
	}
	endpoint := "repos/" + url.PathEscape(input.Owner) + "/" + url.PathEscape(input.Repo) + "/issues"
	method := http.MethodPost
	var payload any
	switch operation {
	case "create":
		if strings.TrimSpace(input.Title) == "" {
			writeError(w, http.StatusBadRequest, "Issue title is required")
			return
		}
		payload = map[string]string{"title": strings.TrimSpace(input.Title), "body": input.Body}
	case "comment":
		if input.Number < 1 || strings.TrimSpace(input.Body) == "" {
			writeError(w, http.StatusBadRequest, "Issue number and comment are required")
			return
		}
		endpoint += "/" + strconv.Itoa(input.Number) + "/comments"
		payload = map[string]string{"body": input.Body}
	case "state":
		if input.Number < 1 || (input.State != "open" && input.State != "closed") {
			writeError(w, http.StatusBadRequest, "Issue number and state are required")
			return
		}
		method = http.MethodPatch
		endpoint += "/" + strconv.Itoa(input.Number)
		payload = map[string]string{"state": input.State}
	}
	token, err := s.githubToken(r.Context(), principal.UserID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Connect a GitHub account with repository access first")
		return
	}
	response, status, err := githubMutation(r.Context(), token, method, endpoint, payload)
	if err != nil {
		writeError(w, http.StatusBadGateway, "GitHub issue action failed")
		return
	}
	if status < 200 || status >= 300 {
		writeJSON(w, status, response)
		return
	}
	if operation == "create" {
		s.writeAudit(r.Context(), principal.UserID, "github.issue_created", input.Owner+"/"+input.Repo, map[string]any{"title": input.Title}, s.clientIP(r))
	}
	if operation == "comment" {
		s.writeAudit(r.Context(), principal.UserID, "github.issue_commented", input.Owner+"/"+input.Repo, map[string]any{"number": input.Number}, s.clientIP(r))
	}
	if operation == "state" {
		action := "github.issue_closed"
		if input.State == "open" {
			action = "github.issue_reopened"
		}
		s.writeAudit(r.Context(), principal.UserID, action, input.Owner+"/"+input.Repo, map[string]any{"number": input.Number}, s.clientIP(r))
	}
	writeJSON(w, status, response)
}

func githubMutation(ctx context.Context, token, method, endpoint string, payload any) (json.RawMessage, int, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, err
	}
	request, err := http.NewRequestWithContext(ctx, method, "https://api.github.com/"+strings.TrimLeft(endpoint, "/"), strings.NewReader(string(body)))
	if err != nil {
		return nil, 0, err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", "LePatch")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	client := &http.Client{Timeout: 15 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return nil, 0, err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 8<<20))
	if err != nil {
		return nil, response.StatusCode, err
	}
	if !json.Valid(data) {
		data, _ = json.Marshal(map[string]string{"error": "GitHub request failed"})
	}
	return json.RawMessage(data), response.StatusCode, nil
}

func (s *Server) appCommits(w http.ResponseWriter, r *http.Request) {
	principal, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	app, loadErr := s.loadApp(r.Context(), principal.UserID, chi.URLParam(r, "id"))
	if loadErr != nil {
		writeError(w, http.StatusNotFound, "Repository not found")
		return
	}
	token, _ := s.githubToken(r.Context(), principal.UserID)
	client := gh.NewClient(s.store.DB(), token, principal.UserID)
	client.BaseURL = s.githubAPIBase
	query := url.Values{"per_page": {strconv.Itoa(queryInt(r, "perPage", 30, 1, 100))}, "page": {strconv.Itoa(queryInt(r, "page", 1, 1, 1000000))}}
	result, err := client.Get(r.Context(), "repos/"+url.PathEscape(app.RepoOwner)+"/"+url.PathEscape(app.RepoName)+"/commits?"+query.Encode())
	if err != nil {
		writeError(w, http.StatusBadGateway, "GitHub commits are unavailable")
		return
	}
	if result.Stale {
		w.Header().Set("X-LePatch-Stale", "true")
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(result.Body)
}

func (s *Server) appCommitStatus(w http.ResponseWriter, r *http.Request) {
	principal, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	app, err := s.loadApp(r.Context(), principal.UserID, chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "Repository not found")
		return
	}
	sha := chi.URLParam(r, "sha")
	if sha == "" || strings.Contains(sha, "/") {
		writeError(w, http.StatusBadRequest, "Invalid commit SHA")
		return
	}
	token, _ := s.githubToken(r.Context(), principal.UserID)
	client := gh.NewClient(s.store.DB(), token, principal.UserID)
	client.BaseURL = s.githubAPIBase
	result, err := client.Get(r.Context(), "repos/"+url.PathEscape(app.RepoOwner)+"/"+url.PathEscape(app.RepoName)+"/commits/"+url.PathEscape(sha)+"/status")
	if err != nil {
		writeError(w, http.StatusBadGateway, "GitHub commit status is unavailable")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(result.Body)
}

func (s *Server) markReleaseSeen(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	var input struct {
		WatchedAppID string `json:"watchedAppId"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	result, err := s.store.DB().ExecContext(r.Context(), `UPDATE "WatchedApp" SET updateAvailable=0,lastNotifiedReleaseId=latestSeenReleaseId,lastNotifiedTag=latestSeenTag,updatedAt=? WHERE id=? AND userId=?`, time.Now().UTC().Format(time.RFC3339Nano), input.WatchedAppID, principal.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not mark releases seen")
		return
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		writeError(w, http.StatusNotFound, "Watched repository not found")
		return
	}
	app, err := s.loadApp(r.Context(), principal.UserID, input.WatchedAppID)
	if err == nil {
		_, _ = s.events.Publish(principal.UserID, "watched-app.updated", app)
	}
	writeJSON(w, http.StatusOK, map[string]any{"app": app})
}

func (s *Server) ignoreRelease(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	var input struct {
		ReleaseID string `json:"releaseId"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	var appID string
	err := s.store.DB().QueryRowContext(r.Context(), `SELECT watchedAppId FROM "Release" WHERE id=?`, input.ReleaseID).Scan(&appID)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "Release not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load release")
		return
	}
	var owned int
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT count(*) FROM "WatchedApp" WHERE id=? AND userId=?`, appID, principal.UserID).Scan(&owned); err != nil || owned == 0 {
		writeError(w, http.StatusNotFound, "Release not found")
		return
	}
	_, err = s.store.DB().ExecContext(r.Context(), `UPDATE "Release" SET ignored=1 WHERE id=?`, input.ReleaseID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not ignore release")
		return
	}
	_, _ = s.store.DB().ExecContext(r.Context(), `UPDATE "WatchedApp" SET updateAvailable=0,updatedAt=? WHERE id=?`, time.Now().UTC().Format(time.RFC3339Nano), appID)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// markAllReleasesSeen acknowledges every release waiting in the feed for the
// signed in user.
func (s *Server) markAllReleasesSeen(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	result, err := s.store.DB().ExecContext(r.Context(), `UPDATE "WatchedApp"
		SET updateAvailable=0,lastNotifiedReleaseId=latestSeenReleaseId,lastNotifiedTag=latestSeenTag,updatedAt=?
		WHERE userId=? AND updateAvailable=1`, time.Now().UTC().Format(time.RFC3339Nano), principal.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not mark releases seen")
		return
	}
	updated, _ := result.RowsAffected()
	_, _ = s.events.Publish(principal.UserID, "state.refresh", map[string]string{"reason": "seen-all"})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "updated": updated})
}
