package server

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"lepatch/internal/auth"
	"lepatch/internal/config"
	"lepatch/internal/events"
	"lepatch/internal/store"
	webassets "lepatch/internal/web"
	"lepatch/internal/worker"
)

type Server struct {
	config         config.Config
	store          *store.Store
	events         *events.Hub
	auth           *auth.SessionAuth
	logger         *slog.Logger
	worker         *worker.Runner
	ceremonyMu     sync.Mutex
	ceremonies     map[string]webauthnCeremony
	telegramSender func(context.Context, string, string, string) error
	startedAt      time.Time
}

func New(cfg config.Config, db *store.Store, hub *events.Hub, poller *worker.Runner, logger *slog.Logger) *Server {
	return &Server{
		config: cfg,
		store:  db,
		events: hub,
		auth: &auth.SessionAuth{
			DB: db.DB(), SigningKey: cfg.SessionKey, AppURL: cfg.AppURL.String(), TrustProxy: cfg.TrustProxy,
		},
		logger:     logger,
		ceremonies: make(map[string]webauthnCeremony),
		startedAt:  time.Now(),
		telegramSender: func(ctx context.Context, token, chatID, message string) error {
			return postExternalJSON(ctx, "https://api.telegram.org/bot"+token+"/sendMessage", map[string]string{"chat_id": chatID, "text": message})
		},
		worker: poller,
	}
}

func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)
	r.Use(s.accessLog)
	r.Use(securityHeaders)

	r.Get("/api/health", s.health)
	r.Get("/api/about", s.about)
	r.Post("/api/webhook/telegram", s.telegramWebhook)
	r.Post("/api/auth/login", s.login)
	r.Post("/api/auth/mfa-verify", s.verifyMFA)
	r.Get("/api/webauthn/auth/options", s.passkeyAuthOptions)
	r.Post("/api/webauthn/auth/verify", s.passkeyAuthVerify)
	r.Get("/api/auth/github", s.githubOAuthStart)
	r.Get("/api/auth/github/callback", s.githubOAuthCallback)
	r.Post("/api/account/mfa/setup", s.startMFASetup)
	r.Post("/api/account/mfa/verify", s.finishMFASetup)
	r.Get("/api/setup/status", s.setupStatus)
	r.Post("/api/setup/complete", s.completeSetup)
	r.Get("/api/github/search", s.githubRead)
	r.Get("/api/github/sponsored", s.githubRead)
	r.Get("/api/github/sponsored/{login}/repos", s.sponsoredMaintainerRepos)
	r.Get("/api/github/user-repos", s.githubRead)
	r.Get("/api/github/user-repo", s.githubRead)
	r.Get("/api/github/user-repo/releases", s.githubRead)
	r.Get("/api/github/user-repo/file-content", s.githubRead)
	r.Get("/api/github/contents", s.githubRead)
	r.Post("/api/github/commit-file", s.auth.Middleware(s.csrf(http.HandlerFunc(s.commitGitHubFile))).ServeHTTP)
	r.Get("/api/github/readme", s.githubRead)
	r.Get("/api/github/file-content", s.githubRead)
	r.Get("/api/github/branches", s.githubRead)
	r.Get("/api/github/commits", s.githubRead)
	r.Get("/api/github/commits/{sha}/status", s.githubRead)
	r.Get("/api/github/issues", s.githubRead)
	r.Get("/api/github/issue-detail", s.githubRead)
	r.Get("/api/github/issue-comments", s.githubRead)
	r.Get("/api/github/pulls", s.githubRead)
	r.Get("/api/github/actions", s.githubRead)
	r.Get("/api/github/issue-templates", s.githubRead)
	r.Get("/api/github/tracked-issues", s.trackedIssues)
	r.Post("/api/github/track-issue", s.auth.Middleware(s.csrf(http.HandlerFunc(s.trackIssue))).ServeHTTP)
	r.Delete("/api/github/track-issue", s.auth.Middleware(s.csrf(http.HandlerFunc(s.untrackIssue))).ServeHTTP)
	r.Get("/api/github/notification-setting", s.auth.Middleware(http.HandlerFunc(s.issueNotificationSettings)).ServeHTTP)
	r.Post("/api/github/notification-setting", s.auth.Middleware(s.csrf(http.HandlerFunc(s.saveIssueNotificationSetting))).ServeHTTP)
	r.Delete("/api/github/notification-setting", s.auth.Middleware(s.csrf(http.HandlerFunc(s.deleteIssueNotificationSetting))).ServeHTTP)
	r.Post("/api/github/create-issue", s.auth.Middleware(s.csrf(http.HandlerFunc(s.createGitHubIssue))).ServeHTTP)
	r.Post("/api/github/comment-issue", s.auth.Middleware(s.csrf(http.HandlerFunc(s.commentGitHubIssue))).ServeHTTP)
	r.Post("/api/github/close-issue", s.auth.Middleware(s.csrf(http.HandlerFunc(s.changeGitHubIssueState))).ServeHTTP)
	r.Get("/api/events", s.auth.Middleware(http.HandlerFunc(s.eventsStream)).ServeHTTP)
	r.Get("/api/auth/session", s.auth.Middleware(http.HandlerFunc(s.sessionInfo)).ServeHTTP)
	r.Post("/api/auth/logout", s.auth.Middleware(s.csrf(http.HandlerFunc(s.logout))).ServeHTTP)
	r.Get("/api/account", s.auth.Middleware(http.HandlerFunc(s.accountInfo)).ServeHTTP)
	r.Patch("/api/account", s.auth.Middleware(s.csrf(http.HandlerFunc(s.updateAccount))).ServeHTTP)
	r.Post("/api/account/password", s.auth.Middleware(s.csrf(http.HandlerFunc(s.changePassword))).ServeHTTP)
	r.Get("/api/account/mfa", s.auth.Middleware(http.HandlerFunc(s.mfaInfo)).ServeHTTP)
	r.Post("/api/account/mfa/disable", s.auth.Middleware(s.csrf(http.HandlerFunc(s.disableMFA))).ServeHTTP)
	r.Get("/api/account/github", s.auth.Middleware(http.HandlerFunc(s.githubAccountInfo)).ServeHTTP)
	r.Delete("/api/account/github", s.auth.Middleware(s.csrf(http.HandlerFunc(s.unlinkGitHub))).ServeHTTP)
	r.Get("/api/account/notification-preferences", s.auth.Middleware(http.HandlerFunc(s.notificationPreferences)).ServeHTTP)
	r.Put("/api/account/notification-preferences", s.auth.Middleware(s.csrf(http.HandlerFunc(s.updateNotificationPreferences))).ServeHTTP)
	r.Get("/api/account/trusted-devices", s.auth.Middleware(http.HandlerFunc(s.trustedDevices)).ServeHTTP)
	r.Delete("/api/account/trusted-devices", s.auth.Middleware(s.csrf(http.HandlerFunc(s.revokeTrustedDevice))).ServeHTTP)
	r.Get("/api/account/webauthn", s.auth.Middleware(http.HandlerFunc(s.passkeys)).ServeHTTP)
	r.Delete("/api/account/webauthn", s.auth.Middleware(s.csrf(http.HandlerFunc(s.deletePasskey))).ServeHTTP)
	r.Get("/api/account/telegram", s.auth.Middleware(http.HandlerFunc(s.telegramLinkInfo)).ServeHTTP)
	r.Post("/api/account/telegram", s.auth.Middleware(s.csrf(http.HandlerFunc(s.createTelegramLinkToken))).ServeHTTP)
	r.Delete("/api/account/telegram", s.auth.Middleware(s.csrf(http.HandlerFunc(s.unlinkTelegramAccount))).ServeHTTP)
	r.Post("/api/webauthn/register/options", s.auth.Middleware(s.csrf(http.HandlerFunc(s.passkeyRegistrationOptions))).ServeHTTP)
	r.Post("/api/webauthn/register/verify", s.auth.Middleware(s.csrf(http.HandlerFunc(s.passkeyRegistrationVerify))).ServeHTTP)
	r.Get("/api/sessions", s.auth.Middleware(http.HandlerFunc(s.sessions)).ServeHTTP)
	r.Delete("/api/sessions", s.auth.Middleware(s.csrf(http.HandlerFunc(s.revokeOtherSessions))).ServeHTTP)
	r.Get("/api/users", s.auth.Middleware(http.HandlerFunc(s.listUsers)).ServeHTTP)
	r.Get("/api/admin/users-cached", s.auth.Middleware(http.HandlerFunc(s.listUsers)).ServeHTTP)
	r.Post("/api/users", s.auth.Middleware(s.csrf(http.HandlerFunc(s.createUser))).ServeHTTP)
	r.Route("/api/users/{id}", func(r chi.Router) {
		r.Use(s.auth.Middleware)
		r.Patch("/", s.csrf(http.HandlerFunc(s.updateUser)).ServeHTTP)
		r.Delete("/", s.csrf(http.HandlerFunc(s.deleteUser)).ServeHTTP)
		r.Post("/password", s.csrf(http.HandlerFunc(s.resetUserPassword)).ServeHTTP)
	})
	r.Post("/api/apps", s.auth.Middleware(s.csrf(http.HandlerFunc(s.createApp))).ServeHTTP)
	r.Get("/api/apps", s.auth.Middleware(http.HandlerFunc(s.listApps)).ServeHTTP)
	r.Route("/api/apps/{id}", func(r chi.Router) {
		r.Use(s.auth.Middleware)
		r.Get("/", s.getApp)
		r.Patch("/", s.csrf(http.HandlerFunc(s.updateApp)).ServeHTTP)
		r.Delete("/", s.csrf(http.HandlerFunc(s.removeApp)).ServeHTTP)
		r.Post("/check", s.csrf(http.HandlerFunc(s.checkApp)).ServeHTTP)
		r.Get("/releases", s.listReleases)
		r.Get("/commits", s.appCommits)
		r.Get("/commits/{sha}/status", s.appCommitStatus)
	})
	r.Get("/api/dashboard", s.auth.Middleware(http.HandlerFunc(s.dashboard)).ServeHTTP)
	r.Get("/api/notifications/history", s.auth.Middleware(http.HandlerFunc(s.notificationHistory)).ServeHTTP)
	r.Get("/api/notifications/events", s.auth.Middleware(http.HandlerFunc(s.notificationEventSummary)).ServeHTTP)
	r.Get("/api/integrations", s.auth.Middleware(http.HandlerFunc(s.integrationsSummary)).ServeHTTP)
	r.Route("/api/integrations/{provider}", func(r chi.Router) {
		r.Use(s.auth.Middleware)
		r.Get("/", s.integrationInfo)
		r.Post("/", s.csrf(http.HandlerFunc(s.updateIntegration)).ServeHTTP)
		r.Put("/", s.csrf(http.HandlerFunc(s.updateIntegration)).ServeHTTP)
		r.Delete("/", s.csrf(http.HandlerFunc(s.deleteIntegration)).ServeHTTP)
		r.Post("/webhook", s.csrf(http.HandlerFunc(s.registerTelegramWebhook)).ServeHTTP)
	})
	r.Post("/api/notifications/test", s.auth.Middleware(s.csrf(http.HandlerFunc(s.testIntegration))).ServeHTTP)
	r.Get("/api/admin/audit", s.auth.Middleware(http.HandlerFunc(s.listAudit)).ServeHTTP)
	r.Delete("/api/admin/audit", s.auth.Middleware(s.csrf(http.HandlerFunc(s.clearAudit))).ServeHTTP)
	r.Get("/api/admin/overview", s.auth.Middleware(http.HandlerFunc(s.adminOverview)).ServeHTTP)
	r.Get("/api/admin/settings", s.auth.Middleware(http.HandlerFunc(s.adminSettings)).ServeHTTP)
	r.Put("/api/admin/settings", s.auth.Middleware(s.csrf(http.HandlerFunc(s.updateAdminSettings))).ServeHTTP)
	r.Get("/api/admin/queues", s.auth.Middleware(http.HandlerFunc(s.adminQueues)).ServeHTTP)
	r.Post("/api/admin/queues/retry", s.auth.Middleware(s.csrf(http.HandlerFunc(s.retryFailedNotifications))).ServeHTTP)
	r.Get("/api/workspace", s.auth.Middleware(http.HandlerFunc(s.workspaceNotice)).ServeHTTP)
	r.Get("/api/admin/backups", s.auth.Middleware(http.HandlerFunc(s.listBackups)).ServeHTTP)
	r.Get("/api/admin/backup-schedule", s.auth.Middleware(http.HandlerFunc(s.backupSchedule)).ServeHTTP)
	r.Put("/api/admin/backup-schedule", s.auth.Middleware(s.csrf(http.HandlerFunc(s.updateBackupSchedule))).ServeHTTP)
	r.Post("/api/admin/backups", s.auth.Middleware(s.csrf(http.HandlerFunc(s.createBackup))).ServeHTTP)
	r.Route("/api/admin/backups/{id}", func(r chi.Router) {
		r.Use(s.auth.Middleware)
		r.Get("/", s.downloadBackup)
		r.Delete("/", s.csrf(http.HandlerFunc(s.deleteBackup)).ServeHTTP)
	})
	r.Post("/api/releases/seen", s.auth.Middleware(s.csrf(http.HandlerFunc(s.markReleaseSeen))).ServeHTTP)
	r.Post("/api/releases/ignore", s.auth.Middleware(s.csrf(http.HandlerFunc(s.ignoreRelease))).ServeHTTP)
	r.Get("/api/issues/raised", s.auth.Middleware(http.HandlerFunc(s.raisedIssues)).ServeHTTP)
	r.Post("/api/issues/raised/{id}/seen", s.auth.Middleware(s.csrf(http.HandlerFunc(s.markRaisedIssueSeen))).ServeHTTP)
	r.Get("/", s.serveUI)
	r.Handle("/*", http.HandlerFunc(s.serveUI))
	return r
}

func (s *Server) accessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		wrapped := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(wrapped, r)
		s.logger.Info("http request", "method", r.Method, "path", r.URL.Path, "status", wrapped.Status(), "bytes", wrapped.BytesWritten(), "duration_ms", time.Since(started).Milliseconds(), "request_id", middleware.GetReqID(r.Context()))
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) csrf(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.auth.ValidateCSRF(r) {
			writeError(w, http.StatusForbidden, "Invalid CSRF token")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DB().PingContext(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "unhealthy", "database": "unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "healthy", "database": "ok", "version": Version})
}

func (s *Server) sessionInfo(w http.ResponseWriter, r *http.Request) {
	principal, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	var user struct {
		ID              string `json:"id"`
		Name            string `json:"name"`
		Email           string `json:"email"`
		Role            string `json:"role"`
		Theme           string `json:"theme"`
		PasswordEnabled bool   `json:"passwordEnabled"`
		MFAEnabled      bool   `json:"mfaEnabled"`
	}
	err := s.store.DB().QueryRowContext(r.Context(), `SELECT id, name, email, role, theme, passwordEnabled, totpEnabled FROM "User" WHERE id = ?`, principal.UserID).
		Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.Theme, &user.PasswordEnabled, &user.MFAEnabled)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	principal, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	_, err := s.store.DB().ExecContext(r.Context(), `DELETE FROM "Session" WHERE userId = ? AND id = ?`, principal.UserID, principal.SessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not end session")
		return
	}
	s.auth.ClearSessionCookies(w)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type watchedApp struct {
	ID                   string          `json:"id"`
	Name                 string          `json:"name"`
	Slug                 string          `json:"slug"`
	RepoOwner            string          `json:"repoOwner"`
	RepoName             string          `json:"repoName"`
	RepoFullName         string          `json:"repoFullName"`
	GitHubURL            string          `json:"githubUrl"`
	IconURL              *string         `json:"iconUrl"`
	OwnerAvatarURL       *string         `json:"ownerAvatarUrl"`
	Description          *string         `json:"description"`
	HomepageURL          *string         `json:"homepageUrl"`
	Language             *string         `json:"language"`
	License              *string         `json:"license"`
	DefaultBranch        *string         `json:"defaultBranch"`
	Stars                int             `json:"stars"`
	Topics               json.RawMessage `json:"topics"`
	LatestSeenTag        *string         `json:"latestSeenTag"`
	LastCheckedAt        *string         `json:"lastCheckedAt"`
	CheckStatus          string          `json:"checkStatus"`
	CheckError           *string         `json:"checkError"`
	UpdateAvailable      bool            `json:"updateAvailable"`
	NotificationsEnabled bool            `json:"notificationsEnabled"`
	IncludePrereleases   bool            `json:"includePrereleases"`
	CheckIntervalMinutes int             `json:"checkIntervalMinutes"`
	CreatedAt            string          `json:"createdAt"`
	UpdatedAt            string          `json:"updatedAt"`
}

func (s *Server) listApps(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	if principal.Role == "restricted" {
		writeError(w, http.StatusForbidden, "Forbidden")
		return
	}
	page := queryInt(r, "page", 1, 1, 1_000_000)
	perPage := queryInt(r, "perPage", 50, 1, 200)
	var total int
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT count(*) FROM "WatchedApp" WHERE userId = ?`, principal.UserID).Scan(&total); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load watched repositories")
		return
	}
	rows, err := s.store.DB().QueryContext(r.Context(), `
		SELECT id, name, slug, repoOwner, repoName, repoFullName, githubUrl, iconUrl, ownerAvatarUrl, description, homepageUrl, language, license, defaultBranch, stars, topics,
		latestSeenTag, lastCheckedAt, checkStatus, checkError, updateAvailable, notificationsEnabled,
		includePrereleases, checkIntervalMinutes, createdAt, updatedAt
		FROM "WatchedApp" WHERE userId = ? ORDER BY name COLLATE NOCASE ASC LIMIT ? OFFSET ?`,
		principal.UserID, perPage, (page-1)*perPage)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load watched repositories")
		return
	}
	defer rows.Close()
	apps := make([]watchedApp, 0, perPage)
	for rows.Next() {
		var app watchedApp
		var topics []byte
		if err := rows.Scan(&app.ID, &app.Name, &app.Slug, &app.RepoOwner, &app.RepoName, &app.RepoFullName,
			&app.GitHubURL, &app.IconURL, &app.OwnerAvatarURL, &app.Description, &app.HomepageURL, &app.Language, &app.License, &app.DefaultBranch, &app.Stars, &topics, &app.LatestSeenTag, &app.LastCheckedAt,
			&app.CheckStatus, &app.CheckError, &app.UpdateAvailable, &app.NotificationsEnabled,
			&app.IncludePrereleases, &app.CheckIntervalMinutes, &app.CreatedAt, &app.UpdatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read watched repositories")
			return
		}
		app.Topics = json.RawMessage(topics)
		apps = append(apps, app)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not read watched repositories")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"apps": apps, "total": total, "page": page, "perPage": perPage})
}

func (s *Server) createApp(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	if principal.Role == "restricted" {
		writeError(w, http.StatusForbidden, "Forbidden")
		return
	}
	var input struct {
		Name                 string `json:"name"`
		RepoFullName         string `json:"repoFullName"`
		IncludePrereleases   bool   `json:"includePrereleases"`
		CheckIntervalMinutes int    `json:"checkIntervalMinutes"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	settings := s.workspaceSettings(r.Context())
	owner, repo, ok := splitRepository(input.RepoFullName)
	if !ok {
		writeError(w, http.StatusBadRequest, "Repository must use owner/repository format")
		return
	}
	if input.Name == "" {
		input.Name = repo
	}
	if input.CheckIntervalMinutes < 1 {
		input.CheckIntervalMinutes = settings.DefaultCheckIntervalMinutes
	}
	if input.CheckIntervalMinutes > 43_200 {
		input.CheckIntervalMinutes = 43_200
	}
	if settings.MaxWatchedApps > 0 {
		var watched int
		if err := s.store.DB().QueryRowContext(r.Context(), `SELECT count(*) FROM "WatchedApp" WHERE userId = ?`, principal.UserID).Scan(&watched); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not add repository")
			return
		}
		if watched >= settings.MaxWatchedApps {
			writeError(w, http.StatusForbidden, "You have reached the maximum number of watched repositories allowed by an administrator")
			return
		}
	}
	includePrereleases := input.IncludePrereleases || settings.AllowPrereleaseByDefault
	id := newID()
	slug := strings.ToLower(owner + "-" + repo)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err := s.store.DB().ExecContext(r.Context(), `INSERT INTO "WatchedApp" (
		id, name, slug, repoOwner, repoName, repoFullName, githubUrl, includePrereleases,
		checkIntervalMinutes, checkStatus, notificationsEnabled, updateAvailable, userId, createdAt, updatedAt
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'never', 1, 0, ?, ?, ?)`,
		id, input.Name, slug, owner, repo, owner+"/"+repo, "https://github.com/"+owner+"/"+repo,
		includePrereleases, input.CheckIntervalMinutes, principal.UserID, now, now)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeError(w, http.StatusConflict, "Repository is already watched")
			return
		}
		writeError(w, http.StatusInternalServerError, "Could not add repository")
		return
	}
	app, err := s.loadApp(r.Context(), principal.UserID, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Repository was added but could not be loaded")
		return
	}
	_, _ = s.events.Publish(principal.UserID, "watched-app.added", app)
	writeJSON(w, http.StatusCreated, map[string]any{"app": app})
}

func (s *Server) getApp(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	app, err := s.loadApp(r.Context(), principal.UserID, chi.URLParam(r, "id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Repository not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load repository")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"app": app})
}

func (s *Server) updateApp(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	id := chi.URLParam(r, "id")
	var input map[string]json.RawMessage
	if !decodeJSON(w, r, &input) {
		return
	}
	allowed := map[string]string{
		"name": "name", "includePrereleases": "includePrereleases", "notificationsEnabled": "notificationsEnabled", "checkIntervalMinutes": "checkIntervalMinutes",
	}
	sets, args := make([]string, 0, len(input)), make([]any, 0, len(input)+2)
	for key, raw := range input {
		column, ok := allowed[key]
		if !ok {
			writeError(w, http.StatusBadRequest, "Unsupported repository field")
			return
		}
		var value any
		switch key {
		case "name":
			var text string
			if err := json.Unmarshal(raw, &text); err != nil || strings.TrimSpace(text) == "" {
				writeError(w, http.StatusBadRequest, "Name must be a non-empty string")
				return
			}
			value = text
		case "checkIntervalMinutes":
			var number int
			if err := json.Unmarshal(raw, &number); err != nil || number < 1 || number > 43_200 {
				writeError(w, http.StatusBadRequest, "Check interval is out of range")
				return
			}
			value = number
		default:
			var boolean bool
			if err := json.Unmarshal(raw, &boolean); err != nil {
				writeError(w, http.StatusBadRequest, "Repository setting must be boolean")
				return
			}
			value = boolean
		}
		sets = append(sets, `"`+column+`" = ?`)
		args = append(args, value)
	}
	if len(sets) == 0 {
		writeError(w, http.StatusBadRequest, "No repository settings were provided")
		return
	}
	sets = append(sets, `"updatedAt" = ?`)
	args = append(args, time.Now().UTC().Format(time.RFC3339Nano), id, principal.UserID)
	result, err := s.store.DB().ExecContext(r.Context(), `UPDATE "WatchedApp" SET `+strings.Join(sets, ", ")+` WHERE id = ? AND userId = ?`, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not update repository")
		return
	}
	changed, _ := result.RowsAffected()
	if changed == 0 {
		writeError(w, http.StatusNotFound, "Repository not found")
		return
	}
	app, err := s.loadApp(r.Context(), principal.UserID, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Repository updated but could not be loaded")
		return
	}
	_, _ = s.events.Publish(principal.UserID, "watched-app.updated", app)
	writeJSON(w, http.StatusOK, map[string]any{"app": app})
}

func (s *Server) removeApp(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	id := chi.URLParam(r, "id")
	var repoFullName string
	err := s.store.DB().QueryRowContext(r.Context(), `SELECT repoFullName FROM "WatchedApp" WHERE id = ? AND userId = ?`, id, principal.UserID).Scan(&repoFullName)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Repository not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load repository")
		return
	}
	if _, err := s.store.DB().ExecContext(r.Context(), `DELETE FROM "WatchedApp" WHERE id = ? AND userId = ?`, id, principal.UserID); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not remove repository")
		return
	}
	_, _ = s.events.Publish(principal.UserID, "watched-app.removed", map[string]string{"id": id, "repoFullName": repoFullName})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) checkApp(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	app, err := s.loadApp(r.Context(), principal.UserID, chi.URLParam(r, "id"))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Repository not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load repository")
		return
	}
	if s.worker == nil || s.worker.Enqueue(r.Context(), app.ID) != nil {
		writeError(w, http.StatusServiceUnavailable, "Release check queue is full")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"ok": true, "queued": true})
}

func (s *Server) listReleases(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	appID := chi.URLParam(r, "id")
	var exists int
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT 1 FROM "WatchedApp" WHERE id = ? AND userId = ?`, appID, principal.UserID).Scan(&exists); errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Repository not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load repository")
		return
	}
	page := queryInt(r, "page", 1, 1, 1_000_000)
	perPage := queryInt(r, "perPage", 50, 1, 100)
	var total int
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT count(*) FROM "Release" WHERE watchedAppId = ?`, appID).Scan(&total); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load releases")
		return
	}
	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT id, tagName, name, body, htmlUrl, prerelease, draft, releaseType, changelogSummary, changelogSections, publishedAt, detectedAt, ignored FROM "Release" WHERE watchedAppId = ? ORDER BY publishedAt DESC, detectedAt DESC LIMIT ? OFFSET ?`, appID, perPage, (page-1)*perPage)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load releases")
		return
	}
	defer rows.Close()
	type release struct {
		ID                string          `json:"id"`
		TagName           string          `json:"tagName"`
		Name              *string         `json:"name"`
		Body              *string         `json:"body"`
		HTMLURL           string          `json:"htmlUrl"`
		Prerelease        bool            `json:"prerelease"`
		Draft             bool            `json:"draft"`
		ReleaseType       *string         `json:"releaseType"`
		ChangelogSummary  *string         `json:"changelogSummary"`
		ChangelogSections json.RawMessage `json:"changelogSections"`
		PublishedAt       *string         `json:"publishedAt"`
		DetectedAt        string          `json:"detectedAt"`
		Ignored           bool            `json:"ignored"`
	}
	items := make([]release, 0, perPage)
	for rows.Next() {
		var item release
		var changelogSections []byte
		if err := rows.Scan(&item.ID, &item.TagName, &item.Name, &item.Body, &item.HTMLURL, &item.Prerelease, &item.Draft, &item.ReleaseType, &item.ChangelogSummary, &changelogSections, &item.PublishedAt, &item.DetectedAt, &item.Ignored); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read releases")
			return
		}
		item.ChangelogSections = json.RawMessage(changelogSections)
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"releases": items, "total": total, "page": page, "perPage": perPage})
}

func (s *Server) dashboard(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	if principal.Role == "restricted" {
		writeError(w, http.StatusForbidden, "Forbidden")
		return
	}
	settings := s.workspaceSettings(r.Context())
	feedSize := queryInt(r, "perPage", settings.ReleaseFeedSize, 5, 200)
	includePrereleases := r.URL.Query().Get("includePrereleases") == "true"
	includeIgnored := r.URL.Query().Get("includeIgnored") == "true"
	var total, updates, failed, stale int
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT count(*), COALESCE(sum(CASE WHEN updateAvailable = 1 THEN 1 ELSE 0 END), 0), COALESCE(sum(CASE WHEN checkStatus = 'failed' THEN 1 ELSE 0 END), 0), COALESCE(sum(CASE WHEN lastCheckedAt IS NULL OR lastCheckedAt < datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) FROM "WatchedApp" WHERE userId = ?`, principal.UserID).Scan(&total, &updates, &failed, &stale); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load release feed")
		return
	}
	feedQuery := `SELECT r.id, r.tagName, r.name, r.htmlUrl, r.prerelease, r.publishedAt, r.detectedAt, r.changelogSummary, a.id, a.name, a.repoFullName, a.iconUrl, a.updateAvailable
		FROM "Release" r JOIN "WatchedApp" a ON a.id = r.watchedAppId WHERE a.userId = ?`
	feedArgs := []any{principal.UserID}
	if !includePrereleases {
		feedQuery += ` AND r.prerelease = 0`
	}
	if !includeIgnored {
		feedQuery += ` AND r.ignored = 0`
	}
	feedQuery += ` ORDER BY r.detectedAt DESC LIMIT ?`
	feedArgs = append(feedArgs, feedSize)
	rows, err := s.store.DB().QueryContext(r.Context(), feedQuery, feedArgs...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load release feed")
		return
	}
	defer rows.Close()
	type feedItem struct {
		ID               string  `json:"id"`
		TagName          string  `json:"tagName"`
		Name             *string `json:"name"`
		HTMLURL          string  `json:"htmlUrl"`
		Prerelease       bool    `json:"prerelease"`
		PublishedAt      *string `json:"publishedAt"`
		DetectedAt       string  `json:"detectedAt"`
		ChangelogSummary *string `json:"changelogSummary"`
		WatchedApp       struct {
			ID              string  `json:"id"`
			Name            string  `json:"name"`
			RepoFullName    string  `json:"repoFullName"`
			IconURL         *string `json:"iconUrl"`
			UpdateAvailable bool    `json:"updateAvailable"`
		} `json:"watchedApp"`
	}
	recent := make([]feedItem, 0, feedSize)
	for rows.Next() {
		var item feedItem
		if err := rows.Scan(&item.ID, &item.TagName, &item.Name, &item.HTMLURL, &item.Prerelease, &item.PublishedAt, &item.DetectedAt, &item.ChangelogSummary, &item.WatchedApp.ID, &item.WatchedApp.Name, &item.WatchedApp.RepoFullName, &item.WatchedApp.IconURL, &item.WatchedApp.UpdateAvailable); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read release feed")
			return
		}
		recent = append(recent, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"total": total, "updates": updates, "failed": failed, "stale": stale, "recent": recent})
}

func (s *Server) raisedIssues(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	state := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("state")))
	if state == "" {
		state = "open"
	}
	if state != "open" && state != "closed" && state != "all" {
		writeError(w, http.StatusBadRequest, "State must be open, closed, or all")
		return
	}
	page := queryInt(r, "page", 1, 1, 1_000_000)
	perPage := queryInt(r, "perPage", 50, 1, 100)
	where := `userId = ?`
	args := []any{principal.UserID}
	if state != "all" {
		where += ` AND state = ?`
		args = append(args, state)
	}
	var total int
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT count(*) FROM "RaisedIssue" WHERE `+where, args...).Scan(&total); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load raised issues")
		return
	}
	queryArgs := append(append([]any{}, args...), perPage, (page-1)*perPage)
	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT id,githubIssueId,owner,repo,issueNumber,title,body,state,stateReason,htmlUrl,authorLogin,createdAtGitHub,updatedAtGitHub,closedAtGitHub,commentCount,unreadCommentCount,lastCheckedAt FROM "RaisedIssue" WHERE `+where+` ORDER BY updatedAtGitHub DESC LIMIT ? OFFSET ?`, queryArgs...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load raised issues")
		return
	}
	defer rows.Close()
	type issue struct {
		ID                 string  `json:"id"`
		GitHubIssueID      string  `json:"githubIssueId"`
		Owner              string  `json:"owner"`
		Repo               string  `json:"repo"`
		IssueNumber        int     `json:"issueNumber"`
		Title              string  `json:"title"`
		Body               *string `json:"body"`
		State              string  `json:"state"`
		StateReason        *string `json:"stateReason"`
		HTMLURL            string  `json:"htmlUrl"`
		AuthorLogin        string  `json:"authorLogin"`
		CreatedAt          string  `json:"createdAt"`
		UpdatedAt          string  `json:"updatedAt"`
		ClosedAt           *string `json:"closedAt"`
		CommentCount       int     `json:"commentCount"`
		UnreadCommentCount int     `json:"unreadCommentCount"`
		LastCheckedAt      *string `json:"lastCheckedAt"`
	}
	items := make([]issue, 0, perPage)
	for rows.Next() {
		var item issue
		if err := rows.Scan(&item.ID, &item.GitHubIssueID, &item.Owner, &item.Repo, &item.IssueNumber, &item.Title, &item.Body, &item.State, &item.StateReason, &item.HTMLURL, &item.AuthorLogin, &item.CreatedAt, &item.UpdatedAt, &item.ClosedAt, &item.CommentCount, &item.UnreadCommentCount, &item.LastCheckedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read raised issues")
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not read raised issues")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"issues": items, "total": total, "page": page, "perPage": perPage, "state": state})
}

func (s *Server) markRaisedIssueSeen(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	id := chi.URLParam(r, "id")
	result, err := s.store.DB().ExecContext(r.Context(), `UPDATE "RaisedIssue" SET unreadCommentCount=0,updatedAt=? WHERE id=? AND userId=?`, time.Now().UTC().Format(time.RFC3339Nano), id, principal.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not update raised issue")
		return
	}
	updated, _ := result.RowsAffected()
	if updated == 0 {
		writeError(w, http.StatusNotFound, "Raised issue not found")
		return
	}
	_, _ = s.events.Publish(principal.UserID, "raised-issue.updated", map[string]string{"id": id, "reason": "seen"})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) eventsStream(w http.ResponseWriter, r *http.Request) {
	principal, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "Streaming is unavailable")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	stream, cancel := s.events.Subscribe(principal.UserID, r.Header.Get("Last-Event-ID"))
	defer cancel()
	_, _ = fmt.Fprint(w, ": connected\n\n")
	flusher.Flush()
	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case event, open := <-stream:
			if !open {
				return
			}
			if err := writeSSE(w, event); err != nil {
				return
			}
			flusher.Flush()
		case <-heartbeat.C:
			if _, err := fmt.Fprint(w, ": heartbeat\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func writeSSE(w http.ResponseWriter, event events.Event) error {
	if _, err := fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", event.ID, event.Name, event.Data); err != nil {
		return err
	}
	return nil
}

func (s *Server) loadApp(ctx context.Context, userID, id string) (watchedApp, error) {
	var app watchedApp
	var topics []byte
	err := s.store.DB().QueryRowContext(ctx, `SELECT id, name, slug, repoOwner, repoName, repoFullName, githubUrl, iconUrl, ownerAvatarUrl, description, homepageUrl, language, license, defaultBranch, stars, topics, latestSeenTag, lastCheckedAt, checkStatus, checkError, updateAvailable, notificationsEnabled, includePrereleases, checkIntervalMinutes, createdAt, updatedAt FROM "WatchedApp" WHERE id = ? AND userId = ?`, id, userID).
		Scan(&app.ID, &app.Name, &app.Slug, &app.RepoOwner, &app.RepoName, &app.RepoFullName, &app.GitHubURL, &app.IconURL, &app.OwnerAvatarURL, &app.Description, &app.HomepageURL, &app.Language, &app.License, &app.DefaultBranch, &app.Stars, &topics, &app.LatestSeenTag, &app.LastCheckedAt, &app.CheckStatus, &app.CheckError, &app.UpdateAvailable, &app.NotificationsEnabled, &app.IncludePrereleases, &app.CheckIntervalMinutes, &app.CreatedAt, &app.UpdatedAt)
	app.Topics = json.RawMessage(topics)
	return app, err
}

func splitRepository(fullName string) (string, string, bool) {
	parts := strings.Split(strings.TrimSpace(fullName), "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	for _, part := range parts {
		for _, r := range part {
			if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || strings.ContainsRune("-_.", r)) {
				return "", "", false
			}
		}
	}
	return parts[0], parts[1], true
}

func validRepository(fullName string) bool {
	_, _, ok := splitRepository(fullName)
	return ok
}

func queryInt(r *http.Request, key string, fallback, min, max int) int {
	value, err := strconv.Atoi(r.URL.Query().Get(key))
	if err != nil {
		return fallback
	}
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func newID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err == nil {
		return fmt.Sprintf("%x", bytes)
	}
	return strconv.FormatInt(time.Now().UnixNano(), 36)
}

func (s *Server) serveUI(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		writeError(w, http.StatusNotFound, "Not found")
		return
	}
	assets := webassets.Files()
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path != "" {
		if file, err := assets.Open(path); err == nil {
			defer file.Close()
			info, err := file.Stat()
			if err == nil && !info.IsDir() {
				http.FileServer(http.FS(assets)).ServeHTTP(w, r)
				return
			}
		}
	}
	index, err := fs.ReadFile(assets, "index.html")
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Frontend is not built")
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(index)
}
