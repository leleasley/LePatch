package worker

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"lepatch/internal/events"
	gh "lepatch/internal/github"
	"lepatch/internal/secrets"
)

type Runner struct {
	db            *sql.DB
	hub           *events.Hub
	token         string
	logger        *slog.Logger
	encryptionKey string
	queue         chan string
	once          sync.Once
	pendingMu     sync.Mutex
	pending       map[string]bool
	issueMu       sync.Mutex
	lastIssueSync map[string]time.Time
	dataDir       string
	backupMu      sync.Mutex
	statusMu      sync.Mutex
	status        Status
	appURL        string
}

// Status describes the live state of the background release poller so the
// administrator console can show whether checks are still moving.
type Status struct {
	Running       bool   `json:"running"`
	QueueDepth    int    `json:"queueDepth"`
	QueueCapacity int    `json:"queueCapacity"`
	PendingChecks int    `json:"pendingChecks"`
	LastSchedule  string `json:"lastScheduleAt"`
	LastCheck     string `json:"lastCheckAt"`
	LastError     string `json:"lastError"`
}

// Status returns a snapshot of the worker without exposing internals.
func (w *Runner) Status() Status {
	w.statusMu.Lock()
	defer w.statusMu.Unlock()
	snapshot := w.status
	snapshot.QueueCapacity = cap(w.queue)
	w.pendingMu.Lock()
	snapshot.PendingChecks = len(w.pending)
	w.pendingMu.Unlock()
	return snapshot
}

func (w *Runner) recordSchedule() {
	w.statusMu.Lock()
	w.status.LastSchedule = time.Now().UTC().Format(time.RFC3339Nano)
	w.statusMu.Unlock()
}

func (w *Runner) recordCheck(err error) {
	w.statusMu.Lock()
	w.status.LastCheck = time.Now().UTC().Format(time.RFC3339Nano)
	if err != nil {
		w.status.LastError = err.Error()
	} else {
		w.status.LastError = ""
	}
	w.statusMu.Unlock()
}

type appRow struct {
	id, userID, owner, repo string
	interval                int
	prereleases             bool
	notificationsEnabled    bool
	lastChecked             sql.NullString
	iconURL, defaultBranch  sql.NullString
}
type release struct {
	ID         int64   `json:"id"`
	Tag        string  `json:"tag_name"`
	Name       *string `json:"name"`
	Body       *string `json:"body"`
	URL        string  `json:"html_url"`
	Prerelease bool    `json:"prerelease"`
	Draft      bool    `json:"draft"`
	Published  *string `json:"published_at"`
}

func New(db *sql.DB, hub *events.Hub, token, encryptionKey string, logger *slog.Logger) *Runner {
	return &Runner{db: db, hub: hub, token: token, encryptionKey: encryptionKey, logger: logger, queue: make(chan string, 256), pending: make(map[string]bool), lastIssueSync: make(map[string]time.Time)}
}

func (w *Runner) Start(ctx context.Context) {
	w.once.Do(func() {
		go func() {
			ticker := time.NewTicker(time.Minute)
			defer ticker.Stop()
			w.statusMu.Lock()
			w.status.Running = true
			w.statusMu.Unlock()
			w.syncEnabledIntegrationChannels(ctx)
			w.schedule(ctx)
			w.dispatchNotifications(ctx)
			w.syncIssueCommentNotifications(ctx)
			w.maybeRunScheduledBackup(ctx)
			for {
				select {
				case <-ctx.Done():
					w.statusMu.Lock()
					w.status.Running = false
					w.statusMu.Unlock()
					return
				case id := <-w.queue:
					w.checkByID(ctx, id)
					w.pendingMu.Lock()
					delete(w.pending, id)
					w.pendingMu.Unlock()
				case <-ticker.C:
					w.schedule(ctx)
					w.dispatchNotifications(ctx)
					w.syncIssueCommentNotifications(ctx)
					w.maybeRunScheduledBackup(ctx)
				}
			}
		}()
		go func() {
			ticker := time.NewTicker(time.Minute)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					w.syncRaisedIssues(ctx)
				}
			}
		}()
	})
}

func (w *Runner) SetDataDir(path string) { w.dataDir = path }

// SetAppURL records the public address so notifications can link back to the
// release inside LePatch.
func (w *Runner) SetAppURL(value string) { w.appURL = strings.TrimRight(value, "/") }

func (w *Runner) Enqueue(ctx context.Context, id string) error {
	w.pendingMu.Lock()
	if w.pending[id] {
		w.pendingMu.Unlock()
		return nil
	}
	w.pending[id] = true
	w.pendingMu.Unlock()
	select {
	case w.queue <- id:
		return nil
	case <-ctx.Done():
		w.pendingMu.Lock()
		delete(w.pending, id)
		w.pendingMu.Unlock()
		return ctx.Err()
	default:
		w.pendingMu.Lock()
		delete(w.pending, id)
		w.pendingMu.Unlock()
		return fmt.Errorf("release check queue is full")
	}
}

func (w *Runner) schedule(ctx context.Context) {
	w.recordSchedule()
	rows, err := w.db.QueryContext(ctx, `SELECT id, userId, repoOwner, repoName, checkIntervalMinutes, includePrereleases, notificationsEnabled, lastCheckedAt, iconUrl, defaultBranch FROM "WatchedApp"`)
	if err != nil {
		w.logger.Error("load scheduled release checks", "error", err.Error())
		return
	}
	defer rows.Close()
	now := time.Now().UTC()
	for rows.Next() {
		var a appRow
		if err := rows.Scan(&a.id, &a.userID, &a.owner, &a.repo, &a.interval, &a.prereleases, &a.notificationsEnabled, &a.lastChecked, &a.iconURL, &a.defaultBranch); err != nil {
			w.logger.Error("read scheduled release check", "error", err.Error())
			continue
		}
		if a.interval < 1 {
			a.interval = 360
		}
		// Stable per-app jitter spreads checks over the complete interval without
		// repeatedly moving the due time on each scheduler tick.
		digest := sha256.Sum256([]byte(a.id))
		bucket, _ := strconv.ParseInt(hex.EncodeToString(digest[:2]), 16, 64)
		offset := time.Duration(bucket%60000) * time.Millisecond
		last := time.Time{}
		if a.lastChecked.Valid {
			last, _ = parseTime(a.lastChecked.String)
		}
		due := last.Add(time.Duration(a.interval) * time.Minute).Add(offset)
		if !a.lastChecked.Valid || now.After(due) {
			if err := w.Enqueue(ctx, a.id); err != nil {
				w.logger.Warn("release check not queued", "app_id", a.id, "error", err.Error())
			}
		}
	}
	if err := rows.Err(); err != nil {
		w.logger.Error("iterate scheduled release checks", "error", err.Error())
	}
}

func (w *Runner) checkByID(ctx context.Context, id string) {
	var a appRow
	err := w.db.QueryRowContext(ctx, `SELECT id,userId,repoOwner,repoName,checkIntervalMinutes,includePrereleases,notificationsEnabled,lastCheckedAt,iconUrl,defaultBranch FROM "WatchedApp" WHERE id = ?`, id).Scan(&a.id, &a.userID, &a.owner, &a.repo, &a.interval, &a.prereleases, &a.notificationsEnabled, &a.lastChecked, &a.iconURL, &a.defaultBranch)
	if err == sql.ErrNoRows {
		return
	}
	if err != nil {
		w.logger.Error("load watched app for release check", "app_id", id, "error", err.Error())
		return
	}
	if err = w.check(ctx, a); err != nil {
		w.logger.Warn("release check failed", "app_id", a.id, "error", err.Error())
		w.recordCheck(err)
		return
	}
	w.recordCheck(nil)
}

// repositoryToken returns the GitHub token to use for a watched repository.
// The account's own linked token is preferred because it can reach private and
// sponsored repositories, which the shared installation token cannot. The
// installation token stays as the fallback for repositories nobody has
// connected a GitHub account for.
func (w *Runner) repositoryToken(ctx context.Context, userID string) string {
	if userID == "" {
		return w.token
	}
	var encrypted string
	if err := w.db.QueryRowContext(ctx, `SELECT accessToken FROM "GitHubLink" WHERE userId=?`, userID).Scan(&encrypted); err != nil || encrypted == "" {
		return w.token
	}
	token, err := secrets.DecryptIntegrationValue(w.encryptionKey, encrypted)
	if err != nil || token == "" {
		return w.token
	}
	return token
}

func (w *Runner) check(ctx context.Context, a appRow) error {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, _ = w.db.ExecContext(ctx, `UPDATE "WatchedApp" SET checkStatus='checking',checkError=NULL,updatedAt=? WHERE id=?`, now, a.id)
	_, _ = w.hub.Publish(a.userID, "check.started", map[string]string{"appId": a.id, "startedAt": now})
	client := gh.NewClient(w.db, w.repositoryToken(ctx, a.userID), a.userID)
	if !a.iconURL.Valid || a.iconURL.String == "" || !a.defaultBranch.Valid || a.defaultBranch.String == "" {
		w.hydrateRepository(ctx, a, client)
	}
	endpoint := fmt.Sprintf("repos/%s/%s/releases?per_page=30", url.PathEscape(a.owner), url.PathEscape(a.repo))
	result, err := client.Get(ctx, endpoint)
	if err != nil {
		return w.fail(ctx, a, err.Error())
	}
	var releases []release
	if err = json.Unmarshal(result.Body, &releases); err != nil {
		return w.fail(ctx, a, "GitHub returned an invalid release response")
	}
	eligible := make([]release, 0, len(releases))
	for _, r := range releases {
		if r.Draft || (r.Prerelease && !a.prereleases) || r.ID == 0 || r.Tag == "" {
			continue
		}
		eligible = append(eligible, r)
	}
	if len(eligible) > 0 {
		tx, txErr := w.db.BeginTx(ctx, nil)
		if txErr != nil {
			return w.fail(ctx, a, "Could not store release results")
		}
		var previousID, previousTag sql.NullString
		if txErr = tx.QueryRowContext(ctx, `SELECT latestSeenReleaseId,latestSeenTag FROM "WatchedApp" WHERE id=?`, a.id).Scan(&previousID, &previousTag); txErr != nil {
			_ = tx.Rollback()
			return w.fail(ctx, a, "Could not load watched repository state")
		}
		newCount := 0
		latestReleaseRowID := ""
		for _, r := range eligible {
			published := any(nil)
			if r.Published != nil {
				if t, e := parseTime(*r.Published); e == nil {
					published = t.UTC().Format(time.RFC3339Nano)
				}
			}
			releaseRowID := newID()
			res, insertErr := tx.ExecContext(ctx, `INSERT OR IGNORE INTO "Release" (id,watchedAppId,githubReleaseId,tagName,name,body,htmlUrl,prerelease,draft,releaseType,changelogSummary,publishedAt,detectedAt,ignored,notificationSent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)`, releaseRowID, a.id, strconv.FormatInt(r.ID, 10), r.Tag, r.Name, r.Body, r.URL, r.Prerelease, r.Draft, classifyRelease(r.Tag), releaseSummary(r.Body), published, now)
			if insertErr != nil {
				_ = tx.Rollback()
				return w.fail(ctx, a, "Could not store release results")
			}
			if n, _ := res.RowsAffected(); n > 0 {
				newCount++
				if r.ID == eligible[0].ID {
					latestReleaseRowID = releaseRowID
				}
			}
		}
		latest := eligible[0]
		latestID := strconv.FormatInt(latest.ID, 10)
		isNew := !previousID.Valid || previousID.String != latestID || previousTag.String != latest.Tag
		updateAvailable := previousID.Valid && isNew
		_, txErr = tx.ExecContext(ctx, `UPDATE "WatchedApp" SET latestSeenReleaseId=?,latestSeenTag=?,updateAvailable=?,lastCheckedAt=?,checkStatus=?,checkError=NULL,updatedAt=? WHERE id=?`, latestID, latest.Tag, updateAvailable, now, checkStatus(result.Stale), now, a.id)
		if txErr != nil {
			_ = tx.Rollback()
			return w.fail(ctx, a, "Could not update watched repository")
		}
		if txErr = tx.Commit(); txErr != nil {
			return w.fail(ctx, a, "Could not save release results")
		}
		if a.notificationsEnabled && previousID.Valid && isNew && latestReleaseRowID != "" {
			if err := w.enqueueNotificationEvents(ctx, latestReleaseRowID, a.userID); err != nil {
				w.logger.Warn("could not queue release notifications", "app_id", a.id, "error", err.Error())
			}
		}
		if newCount > 0 {
			_, _ = w.hub.Publish(a.userID, "release.discovered", map[string]string{"appId": a.id, "latestTag": latest.Tag})
		}
	} else {
		_, err = w.db.ExecContext(ctx, `UPDATE "WatchedApp" SET lastCheckedAt=?,checkStatus=?,checkError=?,updatedAt=? WHERE id=?`, now, checkStatus(result.Stale), staleError(result.Stale), now, a.id)
		if err != nil {
			return err
		}
	}
	_, _ = w.hub.Publish(a.userID, "watched-app.updated", map[string]string{"id": a.id})
	_, _ = w.hub.Publish(a.userID, "check.finished", map[string]string{"appId": a.id, "stale": strconv.FormatBool(result.Stale)})
	return nil
}

func (w *Runner) fail(ctx context.Context, a appRow, message string) error {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if strings.Contains(strings.ToLower(message), "token ") {
		message = "GitHub release check failed"
	}
	_, err := w.db.ExecContext(ctx, `UPDATE "WatchedApp" SET lastCheckedAt=?,checkStatus='failed',checkError=?,updatedAt=? WHERE id=?`, now, message, now, a.id)
	_, _ = w.hub.Publish(a.userID, "check.finished", map[string]any{"appId": a.id, "failed": true})
	if err != nil {
		return err
	}
	return fmt.Errorf("%s", message)
}

func checkStatus(stale bool) string {
	if stale {
		return "failed"
	}
	return "success"
}
func staleError(stale bool) any {
	if stale {
		return "GitHub is unavailable; showing the last known release data"
	}
	return nil
}
func parseTime(raw string) (time.Time, error) { return time.Parse(time.RFC3339Nano, raw) }
func newID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err == nil {
		return hex.EncodeToString(bytes[:])
	}
	return strconv.FormatInt(time.Now().UnixNano(), 36)
}
