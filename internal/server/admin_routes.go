package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"lepatch/internal/auth"
)

// workspaceSettingKey holds the single JSON document that stores the
// administrator owned workspace configuration.
const workspaceSettingKey = "workspace"

// WorkspaceSettings are the administrator owned defaults that the service
// enforces when new repositories are watched and when the release feed is
// assembled.
type WorkspaceSettings struct {
	DefaultCheckIntervalMinutes int    `json:"defaultCheckIntervalMinutes"`
	MaxWatchedApps              int    `json:"maxWatchedApps"`
	ReleaseFeedSize             int    `json:"releaseFeedSize"`
	AllowPrereleaseByDefault    bool   `json:"allowPrereleaseByDefault"`
	MaintenanceNotice           string `json:"maintenanceNotice"`
}

func defaultWorkspaceSettings() WorkspaceSettings {
	return WorkspaceSettings{
		DefaultCheckIntervalMinutes: 360,
		MaxWatchedApps:              0,
		ReleaseFeedSize:             50,
		AllowPrereleaseByDefault:    false,
		MaintenanceNotice:           "",
	}
}

// clamp keeps every workspace value inside a range the rest of the service
// can safely work with.
func (s WorkspaceSettings) clamp() WorkspaceSettings {
	if s.DefaultCheckIntervalMinutes < 5 {
		s.DefaultCheckIntervalMinutes = 5
	}
	if s.DefaultCheckIntervalMinutes > 43_200 {
		s.DefaultCheckIntervalMinutes = 43_200
	}
	if s.MaxWatchedApps < 0 {
		s.MaxWatchedApps = 0
	}
	if s.MaxWatchedApps > 10_000 {
		s.MaxWatchedApps = 10_000
	}
	if s.ReleaseFeedSize < 5 {
		s.ReleaseFeedSize = 5
	}
	if s.ReleaseFeedSize > 200 {
		s.ReleaseFeedSize = 200
	}
	s.MaintenanceNotice = strings.TrimSpace(s.MaintenanceNotice)
	if len(s.MaintenanceNotice) > 280 {
		s.MaintenanceNotice = s.MaintenanceNotice[:280]
	}
	return s
}

func (s *Server) workspaceSettings(ctx context.Context) WorkspaceSettings {
	settings := defaultWorkspaceSettings()
	var raw string
	err := s.store.DB().QueryRowContext(ctx, `SELECT value FROM "SystemSetting" WHERE key = ?`, workspaceSettingKey).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) || err != nil {
		return settings
	}
	var stored WorkspaceSettings
	if json.Unmarshal([]byte(raw), &stored) != nil {
		return settings
	}
	return stored.clamp()
}

func (s *Server) saveWorkspaceSettings(ctx context.Context, settings WorkspaceSettings) error {
	payload, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = s.store.DB().ExecContext(ctx, `INSERT INTO "SystemSetting" (id,key,value,encrypted,createdAt,updatedAt) VALUES (?,?,?,0,?,?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt`, newID(), workspaceSettingKey, string(payload), now, now)
	return err
}

// adminSettings returns the workspace configuration to administrators.
func (s *Server) adminSettings(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.adminOnly(w, r); !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"settings": s.workspaceSettings(r.Context())})
}

// updateAdminSettings validates and stores the workspace configuration.
func (s *Server) updateAdminSettings(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.adminOnly(w, r)
	if !ok {
		return
	}
	var input WorkspaceSettings
	if !decodeJSON(w, r, &input) {
		return
	}
	settings := input.clamp()
	if err := s.saveWorkspaceSettings(r.Context(), settings); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not save workspace settings")
		return
	}
	s.writeAudit(r.Context(), actor.UserID, "admin.settings_updated", "workspace", map[string]any{
		"defaultCheckIntervalMinutes": settings.DefaultCheckIntervalMinutes,
		"maxWatchedApps":              settings.MaxWatchedApps,
		"releaseFeedSize":             settings.ReleaseFeedSize,
	}, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]any{"settings": settings})
}

// adminOverview collects the health and usage figures shown at the top of the
// administrator console.
func (s *Server) adminOverview(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.adminOnly(w, r); !ok {
		return
	}
	ctx := r.Context()
	var users, administrators, watchedApps, prereleaseApps, releases, ignored, sessions, auditEvents int
	row := s.store.DB().QueryRowContext(ctx, `SELECT
		(SELECT count(*) FROM "User"),
		(SELECT count(*) FROM "User" WHERE role='administrator'),
		(SELECT count(*) FROM "WatchedApp"),
		(SELECT count(*) FROM "WatchedApp" WHERE includePrereleases=1),
		(SELECT count(*) FROM "Release"),
		(SELECT count(*) FROM "Release" WHERE ignored=1),
		(SELECT count(*) FROM "Session" WHERE expiresAt > ?),
		(SELECT count(*) FROM "AuditLog")`, time.Now().UTC().Format(time.RFC3339Nano))
	if err := row.Scan(&users, &administrators, &watchedApps, &prereleaseApps, &releases, &ignored, &sessions, &auditEvents); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load workspace statistics")
		return
	}

	var sent, failed, pending int
	if err := s.store.DB().QueryRowContext(ctx, `SELECT
		COALESCE(sum(CASE WHEN status='sent' THEN 1 ELSE 0 END),0),
		COALESCE(sum(CASE WHEN status='failed' THEN 1 ELSE 0 END),0),
		COALESCE(sum(CASE WHEN status='pending' THEN 1 ELSE 0 END),0) FROM "NotificationEvent"`).Scan(&sent, &failed, &pending); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load notification statistics")
		return
	}

	var releasesToday, releasesWeek int
	if err := s.store.DB().QueryRowContext(ctx, `SELECT
		COALESCE(sum(CASE WHEN detectedAt >= datetime('now','-1 day') THEN 1 ELSE 0 END),0),
		COALESCE(sum(CASE WHEN detectedAt >= datetime('now','-7 days') THEN 1 ELSE 0 END),0) FROM "Release"`).Scan(&releasesToday, &releasesWeek); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load release statistics")
		return
	}

	activity, err := s.releaseActivity(ctx, 14)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load release activity")
		return
	}

	backups := s.backupSummary(ctx)

	discord, err := s.readIntegrationStatus(ctx, "discord")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load integration status")
		return
	}
	telegram, err := s.readIntegrationStatus(ctx, "telegram")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load integration status")
		return
	}
	webhook, err := s.readIntegrationStatus(ctx, "webhook")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load integration status")
		return
	}

	queue := map[string]any{"running": false, "queueDepth": 0, "queueCapacity": 0, "pendingChecks": 0, "lastScheduleAt": "", "lastCheckAt": "", "lastError": ""}
	if s.worker != nil {
		status := s.worker.Status()
		queue = map[string]any{
			"running":       status.Running,
			"queueDepth":    status.QueueDepth,
			"queueCapacity": status.QueueCapacity,
			"pendingChecks": status.PendingChecks,
			"lastSchedule":  status.LastSchedule,
			"lastCheckAt":   status.LastCheck,
			"lastError":     status.LastError,
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"version":   Version,
		"uptime":    int(time.Since(s.startedAt).Seconds()),
		"startedAt": s.startedAt.UTC().Format(time.RFC3339Nano),
		"users": map[string]any{
			"total":         users,
			"administrator": administrators,
			"activeSession": sessions,
		},
		"repositories": map[string]any{"watched": watchedApps, "prereleases": prereleaseApps},
		"releases": map[string]any{
			"total":    releases,
			"ignored":  ignored,
			"lastDay":  releasesToday,
			"lastWeek": releasesWeek,
			"activity": activity,
		},
		"notifications": map[string]any{"sent": sent, "failed": failed, "pending": pending},
		"auditEvents":   auditEvents,
		"backups":       backups,
		"integrations":  map[string]any{"discord": discord, "telegram": telegram, "webhook": webhook},
		"queue":         queue,
		"storage":       s.storageSummary(),
		"settings":      s.workspaceSettings(ctx),
	})
}

// releaseActivity returns the number of releases detected per day for the
// requested number of days so the console can draw a simple bar chart.
func (s *Server) releaseActivity(ctx context.Context, days int) ([]map[string]any, error) {
	rows, err := s.store.DB().QueryContext(ctx, `SELECT substr(detectedAt,1,10) AS day, count(*) FROM "Release" WHERE detectedAt >= date('now', ?) GROUP BY day ORDER BY day ASC`, "-"+strconv.Itoa(days)+" days")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	counts := map[string]int{}
	for rows.Next() {
		var day string
		var total int
		if err := rows.Scan(&day, &total); err != nil {
			return nil, err
		}
		counts[day] = total
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	activity := make([]map[string]any, 0, days)
	for offset := days - 1; offset >= 0; offset-- {
		day := time.Now().UTC().AddDate(0, 0, -offset).Format("2006-01-02")
		activity = append(activity, map[string]any{"date": day, "count": counts[day]})
	}
	return activity, nil
}

func (s *Server) backupSummary(ctx context.Context) map[string]any {
	summary := map[string]any{"total": 0, "completed": 0, "failed": 0, "latest": nil, "latestSizeBytes": 0}
	var total, completed, failed int
	if err := s.store.DB().QueryRowContext(ctx, `SELECT count(*), COALESCE(sum(CASE WHEN status='completed' THEN 1 ELSE 0 END),0), COALESCE(sum(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) FROM "Backup"`).Scan(&total, &completed, &failed); err != nil {
		return summary
	}
	summary["total"] = total
	summary["completed"] = completed
	summary["failed"] = failed
	var id, filename string
	var size sql.NullInt64
	var createdAt string
	if err := s.store.DB().QueryRowContext(ctx, `SELECT id,filename,sizeBytes,createdAt FROM "Backup" WHERE status='completed' ORDER BY createdAt DESC LIMIT 1`).Scan(&id, &filename, &size, &createdAt); err == nil {
		summary["latest"] = map[string]any{"id": id, "filename": filename, "createdAt": createdAt, "sizeBytes": size.Int64}
		summary["latestSizeBytes"] = size.Int64
	}
	return summary
}

// storageSummary reports the size of the SQLite database and the backup
// directory that LePatch owns.
func (s *Server) storageSummary() map[string]any {
	summary := map[string]any{"databaseBytes": 0, "backupsBytes": 0}
	if info, err := os.Stat(s.config.DatabasePath); err == nil {
		summary["databaseBytes"] = info.Size()
	}
	summary["backupsBytes"] = directorySize(s.backupDirectory())
	return summary
}

// directorySize totals the regular files in a directory. A missing directory
// reports zero so a fresh install does not look like a failure.
func directorySize(path string) int64 {
	entries, err := os.ReadDir(path)
	if err != nil {
		return 0
	}
	var total int64
	for _, entry := range entries {
		if entry.IsDir() {
			total += directorySize(filepath.Join(path, entry.Name()))
			continue
		}
		if info, err := entry.Info(); err == nil {
			total += info.Size()
		}
	}
	return total
}

// adminQueues describes notification delivery and release check health.
func (s *Server) adminQueues(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.adminOnly(w, r); !ok {
		return
	}
	ctx := r.Context()
	var pending, sent, failed int
	if err := s.store.DB().QueryRowContext(ctx, `SELECT
		COALESCE(sum(CASE WHEN status='pending' THEN 1 ELSE 0 END),0),
		COALESCE(sum(CASE WHEN status='sent' THEN 1 ELSE 0 END),0),
		COALESCE(sum(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) FROM "NotificationEvent"`).Scan(&pending, &sent, &failed); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load queue statistics")
		return
	}
	rows, err := s.store.DB().QueryContext(ctx, `SELECT e.id,e.error,e.createdAt,a.repoFullName,r.tagName FROM "NotificationEvent" e
		JOIN "Release" r ON r.id=e.releaseId JOIN "WatchedApp" a ON a.id=r.watchedAppId
		WHERE e.status='failed' ORDER BY e.createdAt DESC LIMIT 20`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load failed deliveries")
		return
	}
	defer rows.Close()
	type failure struct {
		ID           string  `json:"id"`
		Error        *string `json:"error"`
		CreatedAt    string  `json:"createdAt"`
		RepoFullName string  `json:"repoFullName"`
		TagName      string  `json:"tagName"`
	}
	failures := []failure{}
	for rows.Next() {
		var item failure
		if err := rows.Scan(&item.ID, &item.Error, &item.CreatedAt, &item.RepoFullName, &item.TagName); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read failed deliveries")
			return
		}
		failures = append(failures, item)
	}
	queue := map[string]any{"running": false, "queueDepth": 0, "queueCapacity": 0, "pendingChecks": 0, "lastScheduleAt": "", "lastCheckAt": "", "lastError": ""}
	if s.worker != nil {
		status := s.worker.Status()
		queue = map[string]any{
			"running":       status.Running,
			"queueDepth":    status.QueueDepth,
			"queueCapacity": status.QueueCapacity,
			"pendingChecks": status.PendingChecks,
			"lastSchedule":  status.LastSchedule,
			"lastCheckAt":   status.LastCheck,
			"lastError":     status.LastError,
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"pending":   pending,
		"sent":      sent,
		"failed":    failed,
		"failures":  failures,
		"worker":    queue,
		"updatedAt": time.Now().UTC().Format(time.RFC3339Nano),
	})
}

// retryFailedNotifications returns failed deliveries to the pending queue so
// the worker attempts them again.
func (s *Server) retryFailedNotifications(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.adminOnly(w, r)
	if !ok {
		return
	}
	result, err := s.store.DB().ExecContext(r.Context(), `UPDATE "NotificationEvent" SET status='pending',error=NULL WHERE status='failed'`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not requeue failed deliveries")
		return
	}
	requeued, _ := result.RowsAffected()
	s.writeAudit(r.Context(), actor.UserID, "admin.queues_retried", "notification-queue", map[string]any{"requeued": requeued}, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "requeued": requeued})
}

// workspaceNotice is available to every signed-in user so a maintenance
// message configured by an administrator can be shown in the interface.
func (s *Server) workspaceNotice(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.PrincipalFromContext(r.Context()); !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	settings := s.workspaceSettings(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{"notice": settings.MaintenanceNotice})
}

// backupDirectory is the directory LePatch writes database snapshots into.
func (s *Server) backupDirectory() string {
	return filepath.Join(s.config.DataDir, "backups")
}

// setPreReleasesForAllRepositories switches pre-release tracking on or off for
// every watched repository in one step. It is a workspace-wide correction for
// installations where the default was enabled and then applied to every add.
func (s *Server) setPreReleasesForAllRepositories(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.adminOnly(w, r)
	if !ok {
		return
	}
	var input struct {
		Enabled bool `json:"enabled"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	result, err := s.store.DB().ExecContext(r.Context(),
		`UPDATE "WatchedApp" SET includePrereleases=?, updatedAt=?`,
		input.Enabled, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not update pre-release tracking")
		return
	}
	updated, _ := result.RowsAffected()
	s.writeAudit(r.Context(), actor.UserID, "admin.prereleases_updated", "repositories", map[string]any{"enabled": input.Enabled, "repositories": updated}, s.clientIP(r))
	_, _ = s.events.Publish(actor.UserID, "state.refresh", map[string]string{"reason": "prereleases"})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "updated": updated})
}
