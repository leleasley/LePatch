package worker

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"lepatch/internal/secrets"
)

type notificationJob struct {
	id, userID, releaseID, appID, channelID, channelType, configJSON string
	appName, repoFullName, tag, releaseURL, body, releaseType        string
	summary                                                          string
	attempts                                                         int
	prerelease                                                       bool
	security                                                         bool
	createdAt                                                        string
}

// Older LePatch releases derive channel enablement from IntegrationSetting.
// Synchronize that state on startup so imported enabled integrations continue
// receiving events even when their legacy NotificationChannel row is disabled.
func (w *Runner) syncEnabledIntegrationChannels(ctx context.Context) {
	for _, integration := range []struct{ provider, name string }{{"discord", "Discord"}, {"telegram", "Telegram"}, {"webhook", "Webhook"}} {
		var enabled string
		err := w.db.QueryRowContext(ctx, `SELECT value FROM "IntegrationSetting" WHERE provider=? AND key='enabled'`, integration.provider).Scan(&enabled)
		if err == sql.ErrNoRows {
			continue
		}
		if err != nil {
			w.logger.Error("read notification integration state", "provider", integration.provider, "error", err.Error())
			continue
		}
		if enabled != "true" {
			continue
		}
		now := time.Now().UTC().Format(time.RFC3339Nano)
		_, err = w.db.ExecContext(ctx, `INSERT INTO "NotificationChannel" (id,type,name,enabled,configJson,createdAt,updatedAt) VALUES (?,?,?,1,'{}',?,?) ON CONFLICT(type,name) DO UPDATE SET enabled=1,updatedAt=excluded.updatedAt`, newID(), integration.provider, integration.name, now, now)
		if err != nil {
			w.logger.Error("enable configured notification channel", "provider", integration.provider, "error", err.Error())
			continue
		}
		// A legacy import can leave extra rows for the same provider. Disable
		// them so a release is not delivered once per row.
		if _, err := w.db.ExecContext(ctx, `UPDATE "NotificationChannel" SET enabled=0 WHERE type=? AND name<>?`, integration.provider, integration.name); err != nil {
			w.logger.Warn("could not disable duplicate notification channels", "provider", integration.provider, "error", err.Error())
		}
	}
}

var semverTag = regexp.MustCompile(`(?i)^v?(\d+)\.(\d+)\.(\d+)`)

const telegramMessageLimit = 4096

// maxNotificationAttempts bounds retries so a provider that keeps failing
// cannot send the same alert repeatedly.
const maxNotificationAttempts = 3

func (w *Runner) enqueueNotificationEvents(ctx context.Context, releaseID, userID string) error {
	var enabled bool
	err := w.db.QueryRowContext(ctx, `SELECT enabled FROM "NotificationPreference" WHERE userId=?`, userID).Scan(&enabled)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if err == nil && !enabled {
		return nil
	}
	rows, err := w.db.QueryContext(ctx, `SELECT id, type, name FROM "NotificationChannel"
		WHERE enabled=1 AND type IN ('discord','telegram','webhook')
		ORDER BY type,
			CASE WHEN (type='discord' AND name='Discord') OR (type='telegram' AND name='Telegram') THEN 0 ELSE 1 END,
			updatedAt DESC`)
	if err != nil {
		return err
	}
	defer rows.Close()
	// Exactly one channel per provider. A legacy import can leave several rows
	// for the same provider, which used to deliver every release once per row.
	chosen := make(map[string]string, 3)
	channelIDs := make([]string, 0, 3)
	for rows.Next() {
		var id, channelType, name string
		if err := rows.Scan(&id, &channelType, &name); err != nil {
			return err
		}
		if _, seen := chosen[channelType]; seen {
			continue
		}
		chosen[channelType] = id
		channelIDs = append(channelIDs, id)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, channelID := range channelIDs {
		_, err := w.db.ExecContext(ctx, `INSERT OR IGNORE INTO "NotificationEvent" (id,releaseId,channelId,status,createdAt,attemptCount) VALUES (?,?,?,'pending',?,0)`, newID(), releaseID, channelID, now)
		if err != nil {
			return err
		}
	}
	return nil
}

// notificationJobColumns is shared by the loader so the selected columns and
// the scan cannot drift apart. They did once, which silently stopped every
// release notification.
const notificationJobColumns = `e.id,e.attemptCount,e.createdAt,e.releaseId,a.id,c.id,c.type,c.configJson,
	a.userId,a.name,a.repoFullName,r.tagName,r.htmlUrl,COALESCE(r.body,''),COALESCE(r.releaseType,''),
	r.prerelease,r.securityRelevant,COALESCE(r.changelogSummary,'')`

func (w *Runner) loadPendingNotificationJobs(ctx context.Context) ([]notificationJob, error) {
	rows, err := w.db.QueryContext(ctx, `SELECT `+notificationJobColumns+`
		FROM "NotificationEvent" e JOIN "Release" r ON r.id=e.releaseId JOIN "WatchedApp" a ON a.id=r.watchedAppId JOIN "NotificationChannel" c ON c.id=e.channelId
		WHERE e.status='pending' AND c.enabled=1 AND (e.nextAttemptAt IS NULL OR e.nextAttemptAt<=?) ORDER BY e.createdAt LIMIT 40`, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	jobs := make([]notificationJob, 0, 40)
	for rows.Next() {
		var job notificationJob
		if err := rows.Scan(&job.id, &job.attempts, &job.createdAt, &job.releaseID, &job.appID, &job.channelID, &job.channelType, &job.configJSON, &job.userID, &job.appName, &job.repoFullName, &job.tag, &job.releaseURL, &job.body, &job.releaseType, &job.prerelease, &job.security, &job.summary); err != nil {
			return nil, fmt.Errorf("read queued notification event: %w", err)
		}
		jobs = append(jobs, job)
	}
	return jobs, rows.Err()
}

func (w *Runner) dispatchNotifications(ctx context.Context) {
	jobs, err := w.loadPendingNotificationJobs(ctx)
	if err != nil {
		w.logger.Error("load queued notification events", "error", err.Error())
		return
	}
	for _, job := range jobs {
		if ctx.Err() != nil {
			return
		}
		if deferUntil, reason, deliver := w.deliveryDecision(ctx, job); !deliver {
			if deferUntil > 0 {
				next := time.Now().Add(deferUntil).UTC().Format(time.RFC3339Nano)
				_, _ = w.db.ExecContext(ctx, `UPDATE "NotificationEvent" SET nextAttemptAt=? WHERE id=? AND status='pending'`, next, job.id)
			} else {
				w.markNotificationSent(ctx, job, nil)
			}
			w.logger.Debug("notification deferred or suppressed", "event_id", job.id, "reason", reason)
			continue
		}
		if err := w.sendNotification(ctx, job); err != nil {
			w.retryNotification(ctx, job, err)
			continue
		}
		w.markNotificationSent(ctx, job, []string{job.id})
	}
}

func (w *Runner) deliveryDecision(ctx context.Context, job notificationJob) (time.Duration, string, bool) {
	var enabled bool
	var digest sql.NullInt64
	var quietStart, quietEnd, timezone, paused sql.NullString
	var severity sql.NullString
	err := w.db.QueryRowContext(ctx, `SELECT enabled,digestInterval,quietHoursStart,quietHoursEnd,timezone,severityFilters,pausedUntil FROM "NotificationPreference" WHERE userId=?`, job.userID).Scan(&enabled, &digest, &quietStart, &quietEnd, &timezone, &severity, &paused)
	if err == nil && !enabled {
		return 0, "notifications disabled", false
	}
	if err != nil && err != sql.ErrNoRows {
		return 0, "preference lookup failed", false
	}
	now := time.Now()
	if paused.Valid && strings.TrimSpace(paused.String) != "" {
		if until, parseErr := parseTime(paused.String); parseErr == nil && now.Before(until) {
			// A pause means "do not tell me now", so the backlog is dropped
			// rather than delivered in a burst when it ends.
			return 0, "notifications paused", false
		}
	}
	// A security release is worth interrupting quiet hours and digests for.
	if job.security {
		return 0, "security release", true
	}
	if severity.Valid && strings.TrimSpace(severity.String) != "" {
		var allowed []string
		if json.Unmarshal([]byte(severity.String), &allowed) == nil && len(allowed) > 0 {
			current := classifyRelease(job.tag)
			found := false
			for _, item := range allowed {
				if strings.EqualFold(item, current) || strings.EqualFold(item, "all") {
					found = true
				}
			}
			if !found {
				return 0, "release severity filtered", false
			}
		}
	}
	if quietStart.Valid && quietEnd.Valid {
		if delay := quietHoursDelay(now, quietStart.String, quietEnd.String, timezone.String); delay > 0 {
			return delay, "quiet hours", false
		}
	}
	if digest.Valid && digest.Int64 > 0 {
		interval := time.Duration(digest.Int64) * time.Minute
		if interval >= time.Minute && interval <= 7*24*time.Hour {
			created, err := parseTime(job.createdAt)
			if err == nil && now.Sub(created) < interval {
				return interval - now.Sub(created), "digest interval", false
			}
		}
	}
	return 0, "ready", true
}

func quietHoursDelay(now time.Time, startText, endText, zone string) time.Duration {
	location, err := time.LoadLocation(zone)
	if err != nil {
		location = time.UTC
	}
	parse := func(raw string) (int, int, bool) {
		parts := strings.Split(raw, ":")
		if len(parts) != 2 {
			return 0, 0, false
		}
		hour, e1 := strconv.Atoi(parts[0])
		minute, e2 := strconv.Atoi(parts[1])
		return hour, minute, e1 == nil && e2 == nil && hour >= 0 && hour < 24 && minute >= 0 && minute < 60
	}
	sh, sm, ok1 := parse(startText)
	eh, em, ok2 := parse(endText)
	if !ok1 || !ok2 || (sh == eh && sm == em) {
		return 0
	}
	local := now.In(location)
	minuteOfDay := local.Hour()*60 + local.Minute()
	start, end := sh*60+sm, eh*60+em
	inQuiet := minuteOfDay >= start && minuteOfDay < end
	if start > end {
		inQuiet = minuteOfDay >= start || minuteOfDay < end
	}
	if !inQuiet {
		return 0
	}
	endTime := time.Date(local.Year(), local.Month(), local.Day(), eh, em, 0, 0, location)
	if start > end && minuteOfDay >= start {
		endTime = endTime.AddDate(0, 0, 1)
	}
	return endTime.Sub(local)
}

func classifyRelease(tag string) string {
	// Split the tag into segments so `v2.0.0-rc.1`, `v2.0.0-beta2` and
	// `2026.10.18-nightly` are all recognised as pre-releases.
	for _, token := range strings.FieldsFunc(strings.ToLower(strings.TrimSpace(tag)), func(r rune) bool {
		return r == '-' || r == '.' || r == '_' || r == '+' || r == ' '
	}) {
		for _, marker := range []string{"rc", "beta", "alpha", "preview", "nightly", "canary", "snapshot", "dev", "next", "insiders", "unstable", "edge"} {
			if token == marker || (strings.HasPrefix(token, marker) && isDigits(token[len(marker):])) {
				return "prerelease"
			}
		}
	}
	match := semverTag.FindStringSubmatch(strings.TrimSpace(tag))
	if len(match) != 4 {
		return "patch"
	}
	if match[1] != "0" {
		return "major"
	}
	if match[2] != "0" {
		return "minor"
	}
	return "patch"
}

func isDigits(text string) bool {
	if text == "" {
		return false
	}
	for _, r := range text {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// releaseSummary turns release notes into a short readable paragraph for the
// feed, the release page and notifications. It skips the headings GitHub
// generates ("What's Changed", "Full Changelog") and joins the first few real
// lines instead of stopping at the first one.
func releaseSummary(body *string) any {
	if body == nil {
		return nil
	}
	summary := summarizeReleaseText(*body, 280)
	if summary == "" {
		return nil
	}
	return summary
}

// summarizeReleaseText is shared by the stored summary and the notification
// summary so both read the same way.
func summarizeReleaseText(text string, max int) string {
	if strings.TrimSpace(text) == "" {
		return ""
	}

	text = fencedCodePattern.ReplaceAllString(text, "\n")
	text = markdownImagePattern.ReplaceAllString(text, " ")
	text = markdownLinkPattern.ReplaceAllString(text, "$1")
	text = htmlTagPattern.ReplaceAllString(text, " ")
	text = markdownNoisePattern.ReplaceAllString(text, "")

	parts := make([]string, 0, 3)
	length := 0
	for _, raw := range strings.Split(text, "\n") {
		// A generated changelog line usually ends in a bare URL. Remember that
		// so a dangling preposition can be dropped with it.
		hadURL := bareURLPattern.MatchString(raw)

		line := strings.Join(strings.Fields(strings.TrimSpace(raw)), " ")
		line = markdownImagePattern.ReplaceAllString(line, " ")
		line = markdownLinkPattern.ReplaceAllString(line, "$1")
		line = htmlTagPattern.ReplaceAllString(line, " ")
		line = bareURLPattern.ReplaceAllString(line, " ")
		line = markdownNoisePattern.ReplaceAllString(line, "")
		line = strings.Join(strings.Fields(line), " ")
		line = strings.TrimLeft(line, "#>-•·.,;: ")

		if hadURL {
			for _, suffix := range []string{" in", " at", " from", " by", " on", " see", " via", " and"} {
				line = strings.TrimSpace(strings.TrimSuffix(line, suffix))
			}
		}

		if line == "" {
			// The first paragraph is enough.
			if len(parts) > 0 {
				break
			}
			continue
		}
		if isChangelogNoise(line) || len([]rune(line)) < 4 {
			continue
		}
		if length+len([]rune(line)) > max {
			break
		}
		parts = append(parts, line)
		length += len([]rune(line)) + 1
		if len(parts) == 3 {
			break
		}
	}

	if len(parts) == 0 {
		return ""
	}
	return truncateText(strings.Join(parts, " "), max)
}

// isChangelogNoise reports whether a line is generated boilerplate rather than
// a description of the release. Only short headings qualify: a real sentence
// such as "This release rewrites the indexer." must survive.
func isChangelogNoise(line string) bool {
	trimmed := strings.TrimSpace(line)
	if runes := []rune(trimmed); len(runes) > 48 {
		return false
	}
	if strings.HasSuffix(trimmed, ".") || strings.HasSuffix(trimmed, "!") || strings.HasSuffix(trimmed, "?") {
		return false
	}
	lower := strings.ToLower(trimmed)
	for _, prefix := range []string{
		"what's changed", "whats changed", "full changelog", "changelog",
		"contributors", "new contributors", "release notes", "assets",
		"checksums", "compare changes", "all changes", "changes since",
		"update by @",
	} {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	return false
}

func (w *Runner) sendNotification(ctx context.Context, job notificationJob) error {
	config, err := w.notificationConfig(ctx, job)
	if err != nil {
		return err
	}
	if job.channelType == "discord" {
		webhook := config["webhookUrl"]
		parsed, err := url.Parse(webhook)
		if err != nil || parsed.Scheme != "https" || (parsed.Host != "discord.com" && parsed.Host != "discordapp.com") || !strings.HasPrefix(parsed.Path, "/api/webhooks/") {
			return fmt.Errorf("Discord webhook URL is missing or invalid")
		}
		return postJSON(ctx, webhook, discordReleasePayload(job, w.appURL))
	}
	if job.channelType == "webhook" {
		return w.sendWebhook(ctx, job, config)
	}
	if job.channelType == "telegram" {
		token := config["botToken"]
		if token == "" {
			return fmt.Errorf("Telegram bot token is missing")
		}
		recipients, err := w.telegramRecipients(ctx, job.userID, config["chatId"])
		if err != nil {
			return err
		}
		if len(recipients) == 0 {
			return fmt.Errorf("Telegram has no linked recipients")
		}
		text, replyMarkup := telegramReleaseMessage(job, w.appURL)
		for _, recipient := range recipients {
			endpoint := "https://api.telegram.org/bot" + token + "/sendMessage"
			payload := map[string]any{"chat_id": recipient, "text": text, "parse_mode": "HTML", "disable_web_page_preview": true}
			if replyMarkup != nil {
				payload["reply_markup"] = replyMarkup
			}
			if err := postJSON(ctx, endpoint, payload); err != nil {
				return err
			}
		}
		return nil
	}
	return fmt.Errorf("unsupported notification channel")
}

// releaseKind returns the human label and the leading emoji for a release.
//
// Only GitHub's own pre-release flag is used. Deriving it from the tag would
// call a project's ordinary `2026.10.21-nightly` build a pre-release even when
// the author published it as a normal release, which made every nightly feed
// look like pre-releases had been switched on.
func releaseKind(job notificationJob) (label, icon string, prerelease bool) {
	if job.prerelease {
		return "Pre-release detected", "🧪", true
	}
	return "New release detected", "🚀", false
}

// releaseTypeLabel is the small chip shown next to the version. Only a
// pre-release carries one.
func releaseTypeLabel(job notificationJob) string {
	if _, _, prerelease := releaseKind(job); prerelease {
		return "pre-release"
	}
	return ""
}

// inAppReleaseURL points at the release inside LePatch.
func inAppReleaseURL(appURL string, job notificationJob) string {
	if appURL == "" || job.appID == "" || job.releaseID == "" {
		return ""
	}
	return appURL + "/apps/" + url.PathEscape(job.appID) + "/releases/" + url.PathEscape(job.releaseID)
}

func validReleaseURL(value string) bool {
	parsed, err := url.Parse(value)
	return err == nil && parsed.Scheme == "https" && parsed.Host != "" && parsed.User == nil
}

// telegramNotes trims release notes into readable plain text and reports
// whether anything had to be cut.
func telegramNotes(body string, budget int) (string, bool) {
	if budget < 8 {
		return "", strings.TrimSpace(body) != ""
	}
	text := trimReleaseNotes(body)
	if text == "" {
		return "", false
	}
	runes := []rune(text)
	if len(runes) <= budget {
		return text, false
	}
	return strings.TrimSpace(string(runes[:budget-1])) + "…", true
}

// trimReleaseNotes turns markdown release notes into something that reads well
// as plain text: images and HTML go, links keep their label, headings lose
// their hashes and bullets become dots.
func trimReleaseNotes(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = fencedCodePattern.ReplaceAllString(text, "\n")
	text = markdownImagePattern.ReplaceAllString(text, " ")
	text = markdownLinkPattern.ReplaceAllString(text, "$1")
	text = htmlTagPattern.ReplaceAllString(text, " ")
	text = strings.NewReplacer("**", "", "__", "", "~~", "", "`", "").Replace(text)

	lines := strings.Split(text, "\n")
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		indent := line[:len(line)-len(strings.TrimLeft(line, " \t"))]
		switch {
		case strings.HasPrefix(trimmed, "* "), strings.HasPrefix(trimmed, "- "), strings.HasPrefix(trimmed, "+ "):
			lines[i] = indent + "• " + trimmed[2:]
		case strings.HasPrefix(trimmed, "#"):
			lines[i] = indent + strings.TrimSpace(strings.TrimLeft(trimmed, "#"))
		default:
			lines[i] = line
		}
	}
	text = strings.Join(lines, "\n")

	for strings.Contains(text, "\n\n\n") {
		text = strings.ReplaceAll(text, "\n\n\n", "\n\n")
	}
	return strings.TrimSpace(text)
}

// telegramReleaseMessage fills the message with the release notes up to
// Telegram's limit, then offers the rest inside LePatch.
func telegramReleaseMessage(job notificationJob, appURL string) (string, map[string]any) {
	label, icon, prerelease := releaseKind(job)
	kind := releaseTypeLabel(job)
	if job.security {
		label, icon = "Security release detected", "🛡️"
	}

	var header strings.Builder
	header.WriteString(icon + " <b>" + label + "</b>\n\n")
	header.WriteString("<b>" + html.EscapeString(job.appName) + "</b> · <code>" + html.EscapeString(job.tag) + "</code>\n")
	header.WriteString(html.EscapeString(job.repoFullName))
	if kind != "" {
		header.WriteString(" · <i>" + html.EscapeString(kind) + "</i>")
	}
	if prerelease {
		header.WriteString("\n\n⚠️ <i>This is a pre-release build, not a final release.</i>")
	}
	if job.security {
		header.WriteString("\n\n🛡️ <i>This release addresses a security issue. Update when you can.</i>")
	}

	head := header.String()
	// Leave room for the truncation marker and a safety margin, because
	// Telegram counts some characters as more than one unit.
	budget := telegramMessageLimit - len([]rune(html.UnescapeString(head))) - 64
	notes, truncated := telegramNotes(job.body, budget)

	if notes != "" {
		head += "\n\n" + html.EscapeString(notes)
	} else if summary := notificationSummary(job); summary != "" {
		head += "\n\n<blockquote>" + html.EscapeString(summary) + "</blockquote>"
	}

	return head, telegramButtons(job, appURL, truncated)
}

func telegramButtons(job notificationJob, appURL string, truncated bool) map[string]any {
	rows := make([][]map[string]string, 0, 2)

	if link := inAppReleaseURL(appURL, job); link != "" {
		text := "Open in LePatch"
		if truncated {
			text = "Read the rest in LePatch"
		}
		rows = append(rows, []map[string]string{{"text": text, "url": link}})
	}
	if validReleaseURL(job.releaseURL) {
		rows = append(rows, []map[string]string{{"text": "GitHub", "url": job.releaseURL}})
	}
	if len(rows) == 0 {
		return nil
	}
	return map[string]any{"inline_keyboard": rows}
}

// PreviewTelegramMessage renders a sample release alert so the administrator
// console can show exactly what a real notification looks like.
func PreviewTelegramMessage(appURL string) (string, map[string]any) {
	return telegramReleaseMessage(notificationJob{
		appID:        "preview-app",
		releaseID:    "preview-release",
		appName:      "LePatch",
		repoFullName: "leleasley/LePatch",
		tag:          "v0.2.0",
		releaseURL:   "https://github.com/leleasley/LePatch/releases/tag/v0.2.0",
		summary:      "This is a preview of a release alert. Nothing was actually published.",
	}, appURL)
}

// PreviewDiscordPayload renders the matching Discord card.
func PreviewDiscordPayload(appURL string) map[string]any {
	return discordReleasePayload(notificationJob{
		appID:        "preview-app",
		releaseID:    "preview-release",
		appName:      "LePatch",
		repoFullName: "leleasley/LePatch",
		tag:          "v0.2.0",
		releaseURL:   "https://github.com/leleasley/LePatch/releases/tag/v0.2.0",
		summary:      "This is a preview of a release alert. Nothing was actually published.",
	}, appURL)
}

// discordReleasePayload builds an embed so the message reads like a card

var (
	fencedCodePattern    = regexp.MustCompile("(?s)```.*?```")
	markdownImagePattern = regexp.MustCompile(`!\[[^\]]*\]\([^)]*\)`)
	markdownLinkPattern  = regexp.MustCompile(`\[([^\]]+)\]\([^)]*\)`)
	htmlTagPattern       = regexp.MustCompile(`<[^>]+>`)
	bareURLPattern       = regexp.MustCompile(`https?://\S+`)
	markdownNoisePattern = regexp.MustCompile("[*_`~|]+")
)

// notificationSummary picks the most useful text for a notification, using the
// stored summary when there is one.
func notificationSummary(job notificationJob) string {
	text := strings.TrimSpace(job.summary)
	if text == "" {
		text = strings.TrimSpace(job.body)
	}
	if text == "" {
		return ""
	}
	return summarizeReleaseText(text, 240)
}

// discordReleasePayload builds an embed so the message reads like a card
// rather than a wall of text. Green marks a stable release, amber a
// pre-release.
func discordReleasePayload(job notificationJob, appURL string) map[string]any {
	label, icon, prerelease := releaseKind(job)
	kind := releaseTypeLabel(job)
	colour := 0x22c55e
	if prerelease {
		colour = 0xf59e0b
	}
	if job.security {
		label, icon = "Security release detected", "🛡️"
		colour = 0xef4444
	}

	fields := []map[string]any{{"name": "Version", "value": "`" + job.tag + "`", "inline": true}}
	if kind != "" {
		fields = append(fields, map[string]any{"name": "Type", "value": kind, "inline": true})
	}
	fields = append(fields, map[string]any{"name": "Repository", "value": job.repoFullName, "inline": true})

	embedURL := inAppReleaseURL(appURL, job)
	if embedURL == "" {
		embedURL = job.releaseURL
	}

	embed := map[string]any{
		"title":  icon + " " + label,
		"url":    embedURL,
		"color":  colour,
		"fields": fields,
		"footer": map[string]any{"text": "LePatch"},
	}
	if summary := notificationSummary(job); summary != "" {
		embed["description"] = summary
	}
	if prerelease {
		embed["author"] = map[string]any{"name": "⚠ Pre-release build"}
	}
	if job.security {
		embed["author"] = map[string]any{"name": "🛡 Security release"}
	}
	return map[string]any{
		"embeds":           []map[string]any{embed},
		"allowed_mentions": map[string]any{"parse": []string{}},
	}
}

func (w *Runner) notificationConfig(ctx context.Context, job notificationJob) (map[string]string, error) {
	config := map[string]string{}
	var decoded map[string]string
	if err := json.Unmarshal([]byte(job.configJSON), &decoded); err == nil {
		for key, value := range decoded {
			config[key] = value
		}
	} else if plain, err := secrets.DecryptIntegrationValue(w.encryptionKey, job.configJSON); err == nil {
		if err := json.Unmarshal([]byte(plain), &decoded); err == nil {
			for key, value := range decoded {
				config[key] = value
			}
		}
	}
	rows, err := w.db.QueryContext(ctx, `SELECT key,value,encrypted FROM "IntegrationSetting" WHERE provider=?`, job.channelType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var key, value string
		var encrypted bool
		if err := rows.Scan(&key, &value, &encrypted); err != nil {
			return nil, err
		}
		if encrypted {
			value, err = secrets.DecryptIntegrationValue(w.encryptionKey, value)
			if err != nil {
				return nil, fmt.Errorf("could not read %s integration settings", job.channelType)
			}
		}
		config[key] = value
	}
	return config, rows.Err()
}

func (w *Runner) telegramRecipients(ctx context.Context, userID, fallback string) ([]string, error) {
	rows, err := w.db.QueryContext(ctx, `SELECT chatId FROM "TelegramLink" WHERE userId=?`, userID)
	if err != nil {
		return nil, err
	}
	recipients := make([]string, 0, 4)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			_ = rows.Close()
			return nil, err
		}
		recipients = append(recipients, id)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, err
	}
	_ = rows.Close()
	if len(recipients) == 0 && fallback != "" {
		recipients = append(recipients, fallback)
	}
	return recipients, nil
}

func postJSON(ctx context.Context, endpoint string, value any) error {
	body, err := json.Marshal(value)
	if err != nil {
		return err
	}
	responseBody, err := postBody(ctx, endpoint, "application/json", body, map[string]string{"User-Agent": "LePatch"})
	if err != nil {
		return err
	}
	if strings.Contains(endpoint, "api.telegram.org") {
		return checkTelegramResponse(responseBody)
	}
	return nil
}

// maxResponseBytes bounds how much of a provider response is kept. It must be
// well above Telegram's echo of a full-length message: reading only 4 KB used
// to truncate that JSON, so every long release looked like a rejection.
const maxResponseBytes = 1 << 20

// postBody is the single outbound POST used by every notification provider so
// timeouts, response limits and error mapping stay consistent. It returns the
// response body so callers can validate provider-specific payloads.
func postBody(ctx context.Context, endpoint, contentType string, body []byte, headers map[string]string) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", contentType)
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	client := &http.Client{Timeout: 8 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	responseBody, _ := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return responseBody, &deliveryError{status: response.StatusCode, message: fmt.Sprintf("notification provider returned HTTP %d", response.StatusCode)}
	}
	return responseBody, nil
}

// checkTelegramResponse surfaces Telegram's own description so a failure says
// why (chat not found, too long, cannot parse entities) instead of only that
// it was rejected.
func checkTelegramResponse(body []byte) error {
	var result struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	if err := json.Unmarshal(body, &result); err == nil && result.OK {
		return nil
	}
	detail := strings.TrimSpace(result.Description)
	if detail == "" {
		detail = "Telegram rejected the notification"
	}
	return &deliveryError{status: http.StatusBadRequest, message: truncateText(detail, 200)}
}

// deliveryError carries the provider status so a permanent rejection is not
// retried. Retrying a bad request only sends the same alert again.
type deliveryError struct {
	status  int
	message string
}

func (e *deliveryError) Error() string { return e.message }

func (e *deliveryError) permanent() bool {
	switch e.status {
	case http.StatusBadRequest, http.StatusForbidden, http.StatusNotFound:
		return true
	}
	return false
}

func (w *Runner) retryNotification(ctx context.Context, job notificationJob, sendErr error) {
	attempt := job.attempts + 1
	status := "pending"
	var next any

	// A provider that rejects the request outright will reject it again, so
	// stop instead of resending the same alert.
	permanent := false
	if failure, ok := sendErr.(*deliveryError); ok && failure.permanent() {
		permanent = true
	}

	switch {
	case permanent, attempt >= maxNotificationAttempts:
		status = "failed"
	default:
		delay := time.Duration(5*(1<<(attempt-1))) * time.Second
		next = time.Now().Add(delay).UTC().Format(time.RFC3339Nano)
	}

	_, err := w.db.ExecContext(ctx, `UPDATE "NotificationEvent" SET attemptCount=?,status=?,error=?,nextAttemptAt=? WHERE id=?`, attempt, status, truncateText(sendErr.Error(), 500), next, job.id)
	if err != nil {
		w.logger.Error("save notification retry", "event_id", job.id, "error", err.Error())
	}
	w.logger.Warn("notification delivery failed", "event_id", job.id, "attempt", attempt, "status", status, "permanent", permanent, "error", sendErr.Error())
	_, _ = w.hub.Publish(job.userID, "notification.failed", map[string]string{"id": job.id, "status": status})
}

func (w *Runner) markNotificationSent(ctx context.Context, job notificationJob, eventIDs []string) {
	if len(eventIDs) == 0 {
		_, _ = w.db.ExecContext(ctx, `UPDATE "NotificationEvent" SET status='sent',sentAt=?,error=NULL,nextAttemptAt=NULL WHERE id=?`, time.Now().UTC().Format(time.RFC3339Nano), job.id)
		_, _ = w.hub.Publish(job.userID, "notification.sent", map[string]string{"id": job.id})
		return
	}
	for _, eventID := range eventIDs {
		_, _ = w.db.ExecContext(ctx, `UPDATE "NotificationEvent" SET status='sent',sentAt=?,error=NULL,nextAttemptAt=NULL WHERE id=?`, time.Now().UTC().Format(time.RFC3339Nano), eventID)
	}
	_, _ = w.db.ExecContext(ctx, `UPDATE "Release" SET notificationSent=1 WHERE id=?`, job.releaseID)
	_, _ = w.db.ExecContext(ctx, `UPDATE "WatchedApp" SET lastNotifiedReleaseId=(SELECT githubReleaseId FROM "Release" WHERE id=?),lastNotifiedTag=(SELECT tagName FROM "Release" WHERE id=?),updatedAt=? WHERE id=(SELECT watchedAppId FROM "Release" WHERE id=?)`, job.releaseID, job.releaseID, time.Now().UTC().Format(time.RFC3339Nano), job.releaseID)
	_, _ = w.hub.Publish(job.userID, "notification.sent", map[string]string{"id": job.id})
}

func truncateText(text string, max int) string {
	runes := []rune(text)
	if max <= 0 {
		return ""
	}
	if len(runes) <= max {
		return text
	}
	if max == 1 {
		return "…"
	}
	return string(runes[:max-1]) + "…"
}
