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
	id, userID, eventID, channelID, channelType, configJSON   string
	appName, repoFullName, tag, releaseURL, body, releaseType string
	summary                                                   string
	attempts                                                  int
	prerelease                                                bool
	createdAt                                                 string
}

// Older LePatch releases derive channel enablement from IntegrationSetting.
// Synchronize that state on startup so imported enabled integrations continue
// receiving events even when their legacy NotificationChannel row is disabled.
func (w *Runner) syncEnabledIntegrationChannels(ctx context.Context) {
	for _, integration := range []struct{ provider, name string }{{"discord", "Discord"}, {"telegram", "Telegram"}} {
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
		}
	}
}

var semverTag = regexp.MustCompile(`(?i)^v?(\d+)\.(\d+)\.(\d+)`)

const telegramMessageLimit = 4096

func (w *Runner) enqueueNotificationEvents(ctx context.Context, releaseID, userID string) error {
	var enabled bool
	err := w.db.QueryRowContext(ctx, `SELECT enabled FROM "NotificationPreference" WHERE userId=?`, userID).Scan(&enabled)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if err == nil && !enabled {
		return nil
	}
	rows, err := w.db.QueryContext(ctx, `SELECT id FROM "NotificationChannel" WHERE enabled=1 AND type IN ('discord','telegram')`)
	if err != nil {
		return err
	}
	defer rows.Close()
	channelIDs := make([]string, 0, 2)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return err
		}
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

func (w *Runner) dispatchNotifications(ctx context.Context) {
	rows, err := w.db.QueryContext(ctx, `SELECT e.id,e.attemptCount,e.createdAt,e.releaseId,c.id,c.type,c.configJson,a.userId,a.name,a.repoFullName,r.tagName,r.htmlUrl,COALESCE(r.body,''),COALESCE(r.releaseType,''),r.prerelease,COALESCE(r.changelogSummary,'')
		FROM "NotificationEvent" e JOIN "Release" r ON r.id=e.releaseId JOIN "WatchedApp" a ON a.id=r.watchedAppId JOIN "NotificationChannel" c ON c.id=e.channelId
		WHERE e.status='pending' AND c.enabled=1 AND (e.nextAttemptAt IS NULL OR e.nextAttemptAt<=?) ORDER BY e.createdAt LIMIT 40`, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		w.logger.Error("load queued notification events", "error", err.Error())
		return
	}
	jobs := make([]notificationJob, 0, 40)
	for rows.Next() {
		var job notificationJob
		if err := rows.Scan(&job.id, &job.attempts, &job.createdAt, &job.eventID, &job.channelID, &job.channelType, &job.configJSON, &job.userID, &job.appName, &job.repoFullName, &job.tag, &job.releaseURL, &job.body, &job.releaseType, &job.prerelease, &job.summary); err != nil {
			w.logger.Warn("read queued notification event", "error", err.Error())
			continue
		}
		jobs = append(jobs, job)
	}
	_ = rows.Close()
	if err := rows.Err(); err != nil {
		w.logger.Error("iterate queued notification events", "error", err.Error())
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
	var quietStart, quietEnd, timezone sql.NullString
	var severity sql.NullString
	err := w.db.QueryRowContext(ctx, `SELECT enabled,digestInterval,quietHoursStart,quietHoursEnd,timezone,severityFilters FROM "NotificationPreference" WHERE userId=?`, job.userID).Scan(&enabled, &digest, &quietStart, &quietEnd, &timezone, &severity)
	if err == nil && !enabled {
		return 0, "notifications disabled", false
	}
	if err != nil && err != sql.ErrNoRows {
		return 0, "preference lookup failed", false
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
	now := time.Now()
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

func releaseSummary(body *string) any {
	if body == nil {
		return nil
	}
	text := strings.TrimSpace(strings.ReplaceAll(*body, "\r\n", "\n"))
	if text == "" {
		return nil
	}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(strings.TrimLeft(line, "#*- "))
		if line != "" {
			return truncateText(line, 280)
		}
	}
	return nil
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
		return postJSON(ctx, webhook, discordReleasePayload(job))
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
		text, replyMarkup := telegramReleaseMessage(job)
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
// A pre-release is deliberately loud so it never reads like a stable build.
//
// Only the stable/pre-release distinction is shown: the stored release type
// describes the version tier (which component of the tag is non-zero), not the
// size of the change, so surfacing it as "major" for v1.2.3 would mislead.
func releaseKind(job notificationJob) (label, icon string, prerelease bool) {
	if job.prerelease || job.releaseType == "prerelease" || classifyRelease(job.tag) == "prerelease" {
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

var (
	fencedCodePattern    = regexp.MustCompile("(?s)```.*?```")
	markdownImagePattern = regexp.MustCompile(`!\[[^\]]*\]\([^)]*\)`)
	markdownLinkPattern  = regexp.MustCompile(`\[([^\]]+)\]\([^)]*\)`)
	htmlTagPattern       = regexp.MustCompile(`<[^>]+>`)
	bareURLPattern       = regexp.MustCompile(`https?://\S+`)
	markdownNoisePattern = regexp.MustCompile("[*_`~|]+")
)

// notificationSummary picks the most useful line for a notification. Release
// notes are often a long generated list, so the stored summary is preferred
// and the raw body is only mined for its first real sentence.
func notificationSummary(job notificationJob) string {
	text := strings.TrimSpace(job.summary)
	if text == "" {
		text = strings.TrimSpace(job.body)
	}
	if text == "" {
		return ""
	}
	text = fencedCodePattern.ReplaceAllString(text, "\n")

	for _, raw := range strings.Split(text, "\n") {
		// A generated changelog line usually ends in a bare URL. Remember that
		// so a dangling preposition can be dropped once the URL is gone.
		hadURL := bareURLPattern.MatchString(raw)

		line := markdownImagePattern.ReplaceAllString(raw, " ")
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

		if len([]rune(line)) < 12 {
			continue
		}
		lower := strings.ToLower(line)
		skip := false
		for _, prefix := range []string{
			"what's changed", "whats changed", "full changelog", "changelog",
			"contributors", "new contributors", "release notes", "assets",
			"checksums", "compare changes", "all changes", "changes since",
			"this release", "commits", "merged", "update by @",
		} {
			if strings.HasPrefix(lower, prefix) {
				skip = true
				break
			}
		}
		if skip {
			continue
		}
		return truncateText(line, 240)
	}
	return ""
}

// telegramReleaseMessage renders a compact card: a clear title that names the
// release kind, the project and version, an optional summary block and one
// button that opens the notes.
func telegramReleaseMessage(job notificationJob) (string, map[string]any) {
	label, icon, prerelease := releaseKind(job)
	kind := releaseTypeLabel(job)

	var b strings.Builder
	b.WriteString(icon + " <b>" + label + "</b>\n\n")
	b.WriteString("<b>" + html.EscapeString(job.appName) + "</b> · <code>" + html.EscapeString(job.tag) + "</code>\n")
	b.WriteString(html.EscapeString(job.repoFullName))
	if kind != "" {
		b.WriteString(" · <i>" + html.EscapeString(kind) + "</i>")
	}

	if prerelease {
		b.WriteString("\n\n⚠️ <i>This is a pre-release build, not a final release.</i>")
	}

	if summary := notificationSummary(job); summary != "" {
		b.WriteString("\n\n<blockquote>" + html.EscapeString(summary) + "</blockquote>")
	}

	markup := telegramReleaseButton(job.releaseURL)
	if markup == nil {
		// Without a usable link the reader needs the URL in the text.
		b.WriteString("\n\n" + html.EscapeString(job.releaseURL))
	}

	message := b.String()
	if len([]rune(html.UnescapeString(message))) > telegramMessageLimit {
		message = truncateText(message, telegramMessageLimit)
	}
	return message, markup
}

func telegramReleaseButton(releaseURL string) map[string]any {
	parsed, err := url.Parse(releaseURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
		return nil
	}
	return map[string]any{"inline_keyboard": [][]map[string]string{{{"text": "Open release notes", "url": releaseURL}}}}
}

// PreviewTelegramMessage renders a sample release alert so the administrator
// console can show exactly what a real notification looks like.
func PreviewTelegramMessage() (string, map[string]any) {
	return telegramReleaseMessage(notificationJob{
		appName:      "LePatch",
		repoFullName: "leleasley/LePatch",
		tag:          "v0.2.0",
		releaseURL:   "https://github.com/leleasley/LePatch/releases/tag/v0.2.0",
		summary:      "This is a preview of a release alert. Nothing was actually published.",
	})
}

// PreviewDiscordPayload renders the matching Discord card.
func PreviewDiscordPayload() map[string]any {
	return discordReleasePayload(notificationJob{
		appName:      "LePatch",
		repoFullName: "leleasley/LePatch",
		tag:          "v0.2.0",
		releaseURL:   "https://github.com/leleasley/LePatch/releases/tag/v0.2.0",
		summary:      "This is a preview of a release alert. Nothing was actually published.",
	})
}

// discordReleasePayload builds an embed so the message reads like a card
// rather than a wall of text. Green marks a stable release, amber a
// pre-release.
func discordReleasePayload(job notificationJob) map[string]any {
	label, icon, prerelease := releaseKind(job)
	kind := releaseTypeLabel(job)
	colour := 0x22c55e
	if prerelease {
		colour = 0xf59e0b
	}

	fields := []map[string]any{{"name": "Version", "value": "`" + job.tag + "`", "inline": true}}
	if kind != "" {
		fields = append(fields, map[string]any{"name": "Type", "value": kind, "inline": true})
	}
	fields = append(fields, map[string]any{"name": "Repository", "value": job.repoFullName, "inline": true})

	embed := map[string]any{
		"title":  icon + " " + label,
		"url":    job.releaseURL,
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
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", "LePatch")
	client := &http.Client{Timeout: 8 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	responseBody, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("notification provider returned HTTP %d", response.StatusCode)
	}
	var telegramResult struct {
		OK bool `json:"ok"`
	}
	if strings.Contains(endpoint, "api.telegram.org") && (json.Unmarshal(responseBody, &telegramResult) != nil || !telegramResult.OK) {
		return fmt.Errorf("Telegram rejected the notification")
	}
	return nil
}

func (w *Runner) retryNotification(ctx context.Context, job notificationJob, sendErr error) {
	attempt := job.attempts + 1
	status := "pending"
	var next any
	if attempt >= 5 {
		status = "failed"
	} else {
		delay := time.Duration(5*(1<<(attempt-1))) * time.Second
		next = time.Now().Add(delay).UTC().Format(time.RFC3339Nano)
	}
	_, err := w.db.ExecContext(ctx, `UPDATE "NotificationEvent" SET attemptCount=?,status=?,error=?,nextAttemptAt=? WHERE id=?`, attempt, status, truncateText(sendErr.Error(), 500), next, job.id)
	if err != nil {
		w.logger.Error("save notification retry", "event_id", job.id, "error", err.Error())
	}
	w.logger.Warn("notification delivery failed", "event_id", job.id, "attempt", attempt, "status", status, "error", sendErr.Error())
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
	_, _ = w.db.ExecContext(ctx, `UPDATE "Release" SET notificationSent=1 WHERE id=?`, job.eventID)
	_, _ = w.db.ExecContext(ctx, `UPDATE "WatchedApp" SET lastNotifiedReleaseId=(SELECT githubReleaseId FROM "Release" WHERE id=?),lastNotifiedTag=(SELECT tagName FROM "Release" WHERE id=?),updatedAt=? WHERE id=(SELECT watchedAppId FROM "Release" WHERE id=?)`, job.eventID, job.eventID, time.Now().UTC().Format(time.RFC3339Nano), job.eventID)
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
