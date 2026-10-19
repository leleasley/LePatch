package worker

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"html"
	"net/url"
	"strings"
	"time"

	gh "lepatch/internal/github"
	"lepatch/internal/secrets"
)

type issueCommentSetting struct {
	id, userID, owner, repo, title, level, username string
	number, lastCount                               int
	lastChecked                                     sql.NullString
}

type githubIssueState struct {
	Comments int    `json:"comments"`
	Title    string `json:"title"`
	HTMLURL  string `json:"html_url"`
}
type githubIssueComment struct {
	Body      string `json:"body"`
	HTMLURL   string `json:"html_url"`
	CreatedAt string `json:"created_at"`
	User      struct {
		Login string `json:"login"`
	} `json:"user"`
}

func (w *Runner) syncIssueCommentNotifications(ctx context.Context) {
	cutoff := time.Now().Add(-10 * time.Minute).UTC().Format(time.RFC3339Nano)
	rows, err := w.db.QueryContext(ctx, `SELECT n.id,n.userId,n.owner,n.repo,n.issueNumber,n.issueTitle,n.level,n.lastCommentCount,n.lastCheckedAt,COALESCE(g.githubUsername,'')
		FROM "IssueNotificationSetting" n LEFT JOIN "GitHubLink" g ON g.userId=n.userId
		WHERE n.level<>'ignore' AND (n.lastCheckedAt IS NULL OR n.lastCheckedAt<=?) ORDER BY n.lastCheckedAt LIMIT 20`, cutoff)
	if err != nil {
		w.logger.Error("load due issue comment notifications", "error", err.Error())
		return
	}
	settings := make([]issueCommentSetting, 0)
	for rows.Next() {
		var v issueCommentSetting
		if err := rows.Scan(&v.id, &v.userID, &v.owner, &v.repo, &v.number, &v.title, &v.level, &v.lastCount, &v.lastChecked, &v.username); err != nil {
			w.logger.Warn("read issue notification setting", "error", err.Error())
			continue
		}
		settings = append(settings, v)
	}
	_ = rows.Close()
	if err := rows.Err(); err != nil {
		w.logger.Error("iterate issue notification settings", "error", err.Error())
		return
	}
	for _, setting := range settings {
		if ctx.Err() != nil {
			return
		}
		if err := w.checkIssueComments(ctx, setting); err != nil {
			w.logger.Warn("issue comment notification check failed", "setting_id", setting.id, "error", err.Error())
		}
	}
}

func (w *Runner) checkIssueComments(ctx context.Context, setting issueCommentSetting) error {
	var enabled, issueComments bool
	err := w.db.QueryRowContext(ctx, `SELECT enabled,issueComments FROM "NotificationPreference" WHERE userId=?`, setting.userID).Scan(&enabled, &issueComments)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if err == sql.ErrNoRows {
		enabled, issueComments = true, true
	}
	if !enabled || !issueComments {
		return w.markIssueNotificationChecked(ctx, setting, setting.lastCount)
	}
	token := w.token
	var encrypted string
	if err := w.db.QueryRowContext(ctx, `SELECT accessToken FROM "GitHubLink" WHERE userId=?`, setting.userID).Scan(&encrypted); err == nil && encrypted != "" {
		if decrypted, decryptErr := secrets.DecryptIntegrationValue(w.encryptionKey, encrypted); decryptErr == nil {
			token = decrypted
		} else {
			return fmt.Errorf("could not decrypt linked GitHub token")
		}
	}
	if token == "" {
		return w.markIssueNotificationChecked(ctx, setting, setting.lastCount)
	}
	client := gh.NewClient(w.db, token, setting.userID)
	base := "repos/" + url.PathEscape(setting.owner) + "/" + url.PathEscape(setting.repo) + "/issues/" + fmt.Sprint(setting.number)
	result, err := client.Get(ctx, base)
	if err != nil {
		return err
	}
	var issue githubIssueState
	if err := json.Unmarshal(result.Body, &issue); err != nil {
		return fmt.Errorf("invalid GitHub issue response")
	}
	if issue.Comments <= setting.lastCount || result.Stale {
		return w.markIssueNotificationChecked(ctx, setting, max(setting.lastCount, issue.Comments))
	}
	var integration rowsForTelegram
	if err := w.loadIssueTelegramConfig(ctx, &integration); err != nil {
		return err
	}
	if integration.botToken == "" {
		return w.markIssueNotificationChecked(ctx, setting, issue.Comments)
	}
	recipients, err := w.telegramRecipients(ctx, setting.userID, integration.chatID)
	if err != nil {
		return err
	}
	if len(recipients) == 0 {
		return w.markIssueNotificationChecked(ctx, setting, issue.Comments)
	}
	newComments := make([]githubIssueComment, 0)
	firstPage := setting.lastCount/100 + 1
	for page := firstPage; page <= (issue.Comments+99)/100 && page <= firstPage+2; page++ {
		endpoint := base + "/comments?per_page=100&page=" + fmt.Sprint(page)
		response, getErr := client.Get(ctx, endpoint)
		if getErr != nil {
			return getErr
		}
		var batch []githubIssueComment
		if err := json.Unmarshal(response.Body, &batch); err != nil {
			return fmt.Errorf("invalid GitHub issue comment response")
		}
		newComments = append(newComments, batch...)
		if len(batch) < 100 {
			break
		}
	}
	firstNewOffset := setting.lastCount % 100
	processedCount := setting.lastCount + max(0, len(newComments)-firstNewOffset)
	if processedCount > issue.Comments {
		processedCount = issue.Comments
	}
	for index, comment := range newComments {
		absoluteIndex := index
		if absoluteIndex >= issue.Comments {
			break
		}
		isMention := setting.username != "" && strings.Contains(strings.ToLower(comment.Body), "@"+strings.ToLower(setting.username))
		if setting.level == "participating" && !isMention {
			continue
		}
		heading := "New comment"
		if setting.level == "participating" {
			heading = "New mention"
		}
		body := comment.Body
		if len(body) > 180 {
			body = body[:180] + "…"
		}
		link := comment.HTMLURL
		if link == "" {
			link = issue.HTMLURL
		}
		message := fmt.Sprintf("<b>%s on #%d: %s</b>\nby @%s — %s\n<a href=\"%s\">View issue</a>", html.EscapeString(heading), setting.number, html.EscapeString(setting.title), html.EscapeString(comment.User.Login), html.EscapeString(body), html.EscapeString(link))
		for _, recipient := range recipients {
			endpoint := "https://api.telegram.org/bot" + integration.botToken + "/sendMessage"
			if err := postJSON(ctx, endpoint, map[string]any{"chat_id": recipient, "text": message, "parse_mode": "HTML", "disable_web_page_preview": true}); err != nil {
				return err
			}
		}
		_, _ = w.hub.Publish(setting.userID, "tracked-issue.comment", map[string]any{"owner": setting.owner, "repo": setting.repo, "issueNumber": setting.number, "commentUrl": link})
	}
	return w.markIssueNotificationChecked(ctx, setting, processedCount)
}

type rowsForTelegram struct {
	botToken, chatID string
	enabled          bool
}

func (w *Runner) loadIssueTelegramConfig(ctx context.Context, output *rowsForTelegram) error {
	rows, err := w.db.QueryContext(ctx, `SELECT key,value,encrypted FROM "IntegrationSetting" WHERE provider='telegram'`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var key, value string
		var encrypted bool
		if err := rows.Scan(&key, &value, &encrypted); err != nil {
			return err
		}
		if encrypted {
			decoded, decryptErr := secrets.DecryptIntegrationValue(w.encryptionKey, value)
			if decryptErr != nil {
				return fmt.Errorf("could not decrypt Telegram configuration")
			}
			value = decoded
		}
		switch key {
		case "botToken":
			output.botToken = value
		case "chatId":
			output.chatID = value
		case "enabled":
			output.enabled = value == "true"
		}
	}
	if !output.enabled {
		output.botToken = ""
	}
	return rows.Err()
}

func (w *Runner) markIssueNotificationChecked(ctx context.Context, setting issueCommentSetting, count int) error {
	if count < setting.lastCount {
		count = setting.lastCount
	}
	_, err := w.db.ExecContext(ctx, `UPDATE "IssueNotificationSetting" SET lastCommentCount=?,lastCheckedAt=?,updatedAt=? WHERE id=?`, count, time.Now().UTC().Format(time.RFC3339Nano), time.Now().UTC().Format(time.RFC3339Nano), setting.id)
	return err
}
