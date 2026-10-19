package worker

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"html"
	"net/url"
	"regexp"
	"strings"
	"time"

	gh "lepatch/internal/github"
)

type repositoryData struct {
	Description   *string  `json:"description"`
	Homepage      *string  `json:"homepage"`
	Language      *string  `json:"language"`
	Stars         int      `json:"stargazers_count"`
	DefaultBranch string   `json:"default_branch"`
	Topics        []string `json:"topics"`
	License       *struct {
		Name string `json:"name"`
	} `json:"license"`
	Owner struct {
		AvatarURL string `json:"avatar_url"`
	} `json:"owner"`
}
type readmeData struct {
	Content     string `json:"content"`
	Encoding    string `json:"encoding"`
	DownloadURL string `json:"download_url"`
}

func (w *Runner) hydrateRepository(ctx context.Context, app appRow, client *gh.Client) {
	endpoint := "repos/" + url.PathEscape(app.owner) + "/" + url.PathEscape(app.repo)
	result, err := client.Get(ctx, endpoint)
	if err != nil {
		w.logger.Debug("repository metadata unavailable", "app_id", app.id, "error", err.Error())
		return
	}
	var data repositoryData
	if err := json.Unmarshal(result.Body, &data); err != nil {
		return
	}
	iconURL := data.Owner.AvatarURL
	readmeResult, readmeErr := client.Get(ctx, endpoint+"/readme")
	if readmeErr == nil {
		var readme readmeData
		if json.Unmarshal(readmeResult.Body, &readme) == nil && strings.EqualFold(readme.Encoding, "base64") {
			content, decodeErr := base64.StdEncoding.DecodeString(strings.ReplaceAll(readme.Content, "\n", ""))
			if decodeErr == nil {
				if image := firstRepositoryImage(string(content), readme.DownloadURL); image != "" {
					iconURL = image
				}
			}
		}
	}
	license := any(nil)
	if data.License != nil && data.License.Name != "" {
		license = data.License.Name
	}
	topics, _ := json.Marshal(data.Topics)
	if len(topics) == 0 {
		topics = []byte("[]")
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = w.db.ExecContext(ctx, `UPDATE "WatchedApp" SET description=COALESCE(description,?),homepageUrl=COALESCE(homepageUrl,?),iconUrl=?,ownerAvatarUrl=?,language=?,license=?,defaultBranch=?,stars=?,topics=?,updatedAt=? WHERE id=?`, data.Description, data.Homepage, optionalText(iconURL), optionalText(data.Owner.AvatarURL), data.Language, license, optionalText(data.DefaultBranch), data.Stars, string(topics), now, app.id)
	if err != nil {
		w.logger.Warn("save repository metadata", "app_id", app.id, "error", err.Error())
		return
	}
	_, _ = w.hub.Publish(app.userID, "watched-app.updated", map[string]string{"id": app.id})
}

var markdownImage = regexp.MustCompile(`!\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)`)
var htmlImage = regexp.MustCompile(`(?i)<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']`)

func firstRepositoryImage(markdown, readmeURL string) string {
	matches := append(markdownImage.FindAllStringSubmatch(markdown, -1), htmlImage.FindAllStringSubmatch(markdown, -1)...)
	type candidate struct {
		url   string
		score int
		order int
	}
	choices := make([]candidate, 0, len(matches))
	base, err := url.Parse(readmeURL)
	if err != nil {
		return ""
	}
	for index, match := range matches {
		if len(match) < 2 {
			continue
		}
		raw := strings.Trim(html.UnescapeString(strings.TrimSpace(match[1])), "<>")
		parsed, err := url.Parse(raw)
		if err != nil {
			continue
		}
		resolved := base.ResolveReference(parsed)
		if resolved.Scheme != "https" {
			continue
		}
		resolvedURL := normalizeGitHubImage(resolved)
		if resolvedURL == "" {
			continue
		}
		lower := strings.ToLower(resolvedURL)
		if strings.Contains(lower, "shields.io") || strings.Contains(lower, "badge") || strings.Contains(lower, "codecov") || strings.Contains(lower, "github.com/actions/workflows") || strings.Contains(lower, "travis-ci") {
			continue
		}
		score := 0
		if strings.Contains(lower, "logo") {
			score += 10
		}
		if strings.Contains(lower, "icon") {
			score += 8
		}
		if strings.Contains(lower, "brand") {
			score += 6
		}
		if strings.Contains(lower, "banner") || strings.Contains(lower, "cover") {
			score += 2
		}
		if strings.HasSuffix(lower, ".svg") {
			score++
		}
		choices = append(choices, candidate{url: resolvedURL, score: score, order: index})
	}
	if len(choices) == 0 {
		return ""
	}
	best := choices[0]
	for _, choice := range choices[1:] {
		if choice.score > best.score {
			best = choice
		}
	}
	return best.url
}

func normalizeGitHubImage(value *url.URL) string {
	host := strings.ToLower(value.Hostname())
	if host == "github.com" {
		parts := strings.Split(strings.Trim(value.Path, "/"), "/")
		if len(parts) >= 5 && parts[2] == "blob" {
			value.Host = "raw.githubusercontent.com"
			value.Path = "/" + strings.Join(append(parts[:2], parts[3:]...), "/")
		} else {
			return ""
		}
	} else if host != "raw.githubusercontent.com" && host != "user-images.githubusercontent.com" && host != "avatars.githubusercontent.com" && host != "github.com" {
		return ""
	}
	value.Fragment = ""
	return value.String()
}

func optionalText(value string) any {
	if value == "" {
		return nil
	}
	return value
}
