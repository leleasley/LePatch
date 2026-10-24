package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"lepatch/internal/auth"
)

// bulkUpdateApps applies the same setting to several repositories at once so
// the watch list does not need one request per card.
func (s *Server) bulkUpdateApps(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	var input struct {
		IDs                  []string `json:"ids"`
		NotificationsEnabled *bool    `json:"notificationsEnabled"`
		IncludePrereleases   *bool    `json:"includePrereleases"`
		CheckIntervalMinutes *int     `json:"checkIntervalMinutes"`
		ExcludeTags          *string  `json:"excludeTags"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.IDs = uniqueStrings(input.IDs)
	if len(input.IDs) == 0 {
		writeError(w, http.StatusBadRequest, "Select at least one repository")
		return
	}
	if len(input.IDs) > 200 {
		writeError(w, http.StatusBadRequest, "Select 200 repositories or fewer")
		return
	}

	sets := make([]string, 0, 5)
	args := make([]any, 0, len(input.IDs)+6)
	if input.NotificationsEnabled != nil {
		sets = append(sets, `notificationsEnabled = ?`)
		args = append(args, *input.NotificationsEnabled)
	}
	if input.IncludePrereleases != nil {
		sets = append(sets, `includePrereleases = ?`)
		args = append(args, *input.IncludePrereleases)
	}
	if input.CheckIntervalMinutes != nil {
		if *input.CheckIntervalMinutes < 1 || *input.CheckIntervalMinutes > 43_200 {
			writeError(w, http.StatusBadRequest, "Check interval is out of range")
			return
		}
		sets = append(sets, `checkIntervalMinutes = ?`)
		args = append(args, *input.CheckIntervalMinutes)
	}
	if input.ExcludeTags != nil {
		normalised, ok := normaliseTagFilters(*input.ExcludeTags)
		if !ok {
			writeError(w, http.StatusBadRequest, "Excluded tags must be 20 patterns or fewer, each 64 characters or fewer")
			return
		}
		sets = append(sets, `excludeTags = ?`)
		args = append(args, normalised)
	}
	if len(sets) == 0 {
		writeError(w, http.StatusBadRequest, "No repository settings were provided")
		return
	}
	sets = append(sets, `updatedAt = ?`)
	args = append(args, time.Now().UTC().Format(time.RFC3339Nano), principal.UserID)
	for _, id := range input.IDs {
		args = append(args, id)
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(input.IDs)), ",")
	result, err := s.store.DB().ExecContext(r.Context(), `UPDATE "WatchedApp" SET `+strings.Join(sets, ", ")+` WHERE userId = ? AND id IN (`+placeholders+`)`, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not update the selected repositories")
		return
	}
	updated, _ := result.RowsAffected()
	apps, err := s.listAppsAfterBulk(r.Context(), principal.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Repositories updated but could not be loaded")
		return
	}
	_, _ = s.events.Publish(principal.UserID, "watched-app.updated", map[string]int{"updated": int(updated)})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "updated": updated, "apps": apps})
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]bool, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func (s *Server) listAppsAfterBulk(ctx context.Context, userID string) ([]watchedApp, error) {
	rows, err := s.store.DB().QueryContext(ctx, `
		SELECT id, name, slug, repoOwner, repoName, repoFullName, githubUrl, iconUrl, ownerAvatarUrl, description, homepageUrl, language, license, defaultBranch, stars, topics,
		latestSeenTag, lastCheckedAt, checkStatus, checkError, updateAvailable, notificationsEnabled,
		includePrereleases, excludeTags, checkIntervalMinutes, createdAt, updatedAt
		FROM "WatchedApp" WHERE userId = ? ORDER BY name COLLATE NOCASE ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	apps := make([]watchedApp, 0, 32)
	for rows.Next() {
		var app watchedApp
		var topics []byte
		if err := rows.Scan(&app.ID, &app.Name, &app.Slug, &app.RepoOwner, &app.RepoName, &app.RepoFullName,
			&app.GitHubURL, &app.IconURL, &app.OwnerAvatarURL, &app.Description, &app.HomepageURL, &app.Language, &app.License, &app.DefaultBranch, &app.Stars, &topics, &app.LatestSeenTag, &app.LastCheckedAt,
			&app.CheckStatus, &app.CheckError, &app.UpdateAvailable, &app.NotificationsEnabled,
			&app.IncludePrereleases, &app.ExcludeTags, &app.CheckIntervalMinutes, &app.CreatedAt, &app.UpdatedAt); err != nil {
			return nil, err
		}
		app.Topics = json.RawMessage(topics)
		apps = append(apps, app)
	}
	return apps, rows.Err()
}
