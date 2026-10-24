package server

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"lepatch/internal/secrets"
	"lepatch/internal/worker"
)

type integrationStatus struct {
	Provider                   string `json:"provider"`
	Enabled                    bool   `json:"enabled"`
	Configured                 bool   `json:"configured"`
	DefaultRecipientConfigured bool   `json:"defaultRecipientConfigured,omitempty"`
	BotUsername                string `json:"botUsername,omitempty"`
	BotName                    string `json:"botName,omitempty"`
	Mode                       string `json:"mode,omitempty"`
}

func (s *Server) integrationInfo(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.adminOnly(w, r); !ok {
		return
	}
	provider := chi.URLParam(r, "provider")
	if provider == "" {
		provider = r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
	}
	if !knownIntegration(provider) {
		writeError(w, http.StatusNotFound, "Integration not found")
		return
	}
	status, err := s.readIntegrationStatus(r.Context(), provider)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not read integration status")
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) integrationsSummary(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.adminOnly(w, r); !ok {
		return
	}
	discord, err := s.readIntegrationStatus(r.Context(), "discord")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not read integration status")
		return
	}
	telegram, err := s.readIntegrationStatus(r.Context(), "telegram")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not read integration status")
		return
	}
	webhook, err := s.readIntegrationStatus(r.Context(), "webhook")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not read integration status")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"discord": discord, "telegram": telegram, "webhook": webhook})
}

func (s *Server) readIntegrationStatus(ctx context.Context, provider string) (integrationStatus, error) {
	status := integrationStatus{Provider: provider}
	settings, err := s.integrationValues(ctx, provider)
	if err != nil {
		return status, err
	}
	status.Enabled = settings["enabled"] == "true"
	switch provider {
	case "discord":
		status.Configured = settings["webhookUrl"] != ""
	case "webhook":
		status.Configured = settings["url"] != ""
		status.Mode = settings["mode"]
	default:
		status.Configured = settings["botToken"] != ""
		status.DefaultRecipientConfigured = settings["chatId"] != ""
		status.BotUsername = settings["botUsername"]
		status.BotName = settings["botName"]
	}
	return status, nil
}

func (s *Server) integrationValues(ctx context.Context, provider string) (map[string]string, error) {
	rows, err := s.store.DB().QueryContext(ctx, `SELECT key,value,encrypted FROM "IntegrationSetting" WHERE provider=?`, provider)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := map[string]string{}
	for rows.Next() {
		var key, value string
		var encrypted bool
		if err := rows.Scan(&key, &value, &encrypted); err != nil {
			return nil, err
		}
		if encrypted {
			value, err = secrets.DecryptIntegrationValue(s.config.EncryptionKey, value)
			if err != nil {
				return nil, fmt.Errorf("could not decrypt integration configuration")
			}
		}
		values[key] = value
	}
	return values, rows.Err()
}

func (s *Server) updateIntegration(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.adminOnly(w, r)
	if !ok {
		return
	}
	provider := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/integrations/"), "/")
	if !knownIntegration(provider) {
		writeError(w, http.StatusNotFound, "Integration not found")
		return
	}
	var input struct {
		Action        string  `json:"action"`
		WebhookURL    *string `json:"webhookUrl"`
		BotToken      *string `json:"botToken"`
		ChatID        *string `json:"chatId"`
		WebhookSecret *string `json:"webhookSecret"`
		BotUsername   *string `json:"botUsername"`
		BotName       *string `json:"botName"`
		URL           *string `json:"url"`
		Mode          *string `json:"mode"`
		Token         *string `json:"token"`
		Secret        *string `json:"secret"`
		Enabled       *bool   `json:"enabled"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Action == "" {
		input.Action = "update"
	}
	if input.Action != "update" && input.Action != "sendTest" {
		writeError(w, http.StatusBadRequest, "Invalid integration action")
		return
	}
	values, err := s.integrationValues(r.Context(), provider)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load integration settings")
		return
	}
	if input.Action == "sendTest" {
		if err := s.sendIntegrationTest(r.Context(), provider, values); err != nil {
			writeError(w, http.StatusBadGateway, "The test message could not be delivered. Check the integration settings.")
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
		return
	}
	if provider == "discord" && input.WebhookURL != nil {
		url := strings.TrimSpace(*input.WebhookURL)
		if url != "" && !validDiscordWebhook(url) {
			writeError(w, http.StatusBadRequest, "Discord webhook URL is invalid")
			return
		}
		values["webhookUrl"] = url
	}
	if provider == "telegram" {
		if input.BotToken != nil {
			values["botToken"] = strings.TrimSpace(*input.BotToken)
		}
		if input.ChatID != nil {
			values["chatId"] = strings.TrimSpace(*input.ChatID)
		}
		if input.WebhookSecret != nil {
			values["webhookSecret"] = strings.TrimSpace(*input.WebhookSecret)
		}
		if input.BotUsername != nil {
			values["botUsername"] = strings.TrimPrefix(strings.TrimSpace(*input.BotUsername), "@")
		}
		if input.BotName != nil {
			values["botName"] = strings.TrimSpace(*input.BotName)
		}
	}
	if provider == "webhook" {
		if input.URL != nil {
			raw := strings.TrimSpace(*input.URL)
			if raw != "" && !worker.ValidIntegrationURL(raw) {
				writeError(w, http.StatusBadRequest, "Webhook URL must be an http or https address")
				return
			}
			values["url"] = raw
		}
		if input.Mode != nil {
			mode := strings.ToLower(strings.TrimSpace(*input.Mode))
			if mode != "generic" && mode != "ntfy" {
				writeError(w, http.StatusBadRequest, "Webhook mode must be generic or ntfy")
				return
			}
			values["mode"] = mode
		}
		if input.Token != nil {
			values["token"] = strings.TrimSpace(*input.Token)
		}
		if input.Secret != nil {
			values["secret"] = strings.TrimSpace(*input.Secret)
		}
	}
	if input.Enabled != nil {
		values["enabled"] = fmt.Sprintf("%t", *input.Enabled)
	}
	if err := s.saveIntegrationValues(r.Context(), provider, values); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not save integration settings")
		return
	}
	s.writeAudit(r.Context(), actor.UserID, "settings.updated", provider, map[string]bool{"enabled": values["enabled"] == "true"}, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) testIntegration(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.adminOnly(w, r); !ok {
		return
	}
	var input struct {
		Provider string `json:"provider"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if !knownIntegration(input.Provider) {
		writeError(w, http.StatusBadRequest, "Choose Discord, Telegram or a webhook")
		return
	}
	values, err := s.integrationValues(r.Context(), input.Provider)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not read integration settings")
		return
	}
	if err := s.sendIntegrationTest(r.Context(), input.Provider, values); err != nil {
		writeError(w, http.StatusBadGateway, "The test message could not be delivered. Check the integration settings.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) registerTelegramWebhook(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.adminOnly(w, r); !ok {
		return
	}
	if chi.URLParam(r, "provider") != "telegram" {
		writeError(w, http.StatusNotFound, "Integration not found")
		return
	}
	values, err := s.integrationValues(r.Context(), "telegram")
	if err != nil || values["botToken"] == "" || values["webhookSecret"] == "" {
		writeError(w, http.StatusBadRequest, "Save a Telegram bot token and webhook secret first")
		return
	}
	if s.config.AppURL == nil || s.config.AppURL.Scheme != "https" {
		writeError(w, http.StatusBadRequest, "Telegram webhooks require APP_URL to use a publicly reachable HTTPS address")
		return
	}
	endpoint := "https://api.telegram.org/bot" + values["botToken"] + "/setWebhook"
	err = postTelegramAPI(r.Context(), endpoint, map[string]any{
		"url":             strings.TrimRight(s.config.AppURL.String(), "/") + "/api/webhook/telegram",
		"secret_token":    values["webhookSecret"],
		"allowed_updates": []string{"message"},
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, "Telegram could not register the webhook. Check that APP_URL is public and reachable.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func postTelegramAPI(ctx context.Context, endpoint string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	requestCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(requestCtx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	var result struct {
		OK bool `json:"ok"`
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&result) != nil || !result.OK {
		return fmt.Errorf("Telegram rejected the webhook registration")
	}
	return nil
}

func (s *Server) deleteIntegration(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.adminOnly(w, r)
	if !ok {
		return
	}
	provider := chi.URLParam(r, "provider")
	if !knownIntegration(provider) {
		writeError(w, http.StatusNotFound, "Integration not found")
		return
	}
	tx, err := s.store.DB().BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not remove integration")
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `DELETE FROM "IntegrationSetting" WHERE provider=?`, provider); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not remove integration")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `UPDATE "NotificationChannel" SET enabled=0,configJson='{}',updatedAt=? WHERE type=?`, time.Now().UTC().Format(time.RFC3339Nano), provider); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not disable integration channel")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `UPDATE "NotificationEvent" SET status='failed',error='Integration removed',nextAttemptAt=NULL WHERE status='pending' AND channelId IN (SELECT id FROM "NotificationChannel" WHERE type=?)`, provider); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not cancel queued integration messages")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not remove integration")
		return
	}
	s.writeAudit(r.Context(), actor.UserID, "settings.updated", provider, map[string]bool{"enabled": false}, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) saveIntegrationValues(ctx context.Context, provider string, values map[string]string) error {
	tx, err := s.store.DB().BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	keys := []string{"enabled", "webhookUrl"}
	switch provider {
	case "telegram":
		keys = []string{"enabled", "botToken", "chatId", "webhookSecret", "botUsername", "botName"}
	case "webhook":
		keys = []string{"enabled", "url", "mode", "token", "secret"}
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, key := range keys {
		value := values[key]
		encrypted := false
		if (provider == "discord" && key == "webhookUrl") ||
			(provider == "telegram" && (key == "botToken" || key == "chatId" || key == "webhookSecret")) ||
			(provider == "webhook" && (key == "url" || key == "token" || key == "secret")) {
			if value != "" {
				value, err = secrets.EncryptIntegrationValue(s.config.EncryptionKey, value)
				if err != nil {
					return err
				}
				encrypted = true
			}
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO "IntegrationSetting" (id,provider,key,value,encrypted,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?) ON CONFLICT(provider,key) DO UPDATE SET value=excluded.value,encrypted=excluded.encrypted,updatedAt=excluded.updatedAt`, newID(), provider, key, value, encrypted, now, now)
		if err != nil {
			return err
		}
	}
	name := strings.ToUpper(provider[:1]) + provider[1:]
	_, err = tx.ExecContext(ctx, `INSERT INTO "NotificationChannel" (id,type,name,enabled,configJson,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?) ON CONFLICT(type,name) DO UPDATE SET enabled=excluded.enabled,updatedAt=excluded.updatedAt`, newID(), provider, name, values["enabled"] == "true", "{}", now, now)
	if err != nil {
		return err
	}
	if values["enabled"] != "true" {
		if _, err := tx.ExecContext(ctx, `UPDATE "NotificationEvent" SET status='failed',error='Integration disabled',nextAttemptAt=NULL WHERE status='pending' AND channelId=(SELECT id FROM "NotificationChannel" WHERE type=? AND name=?)`, provider, name); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Server) sendIntegrationTest(ctx context.Context, provider string, values map[string]string) error {
	if provider == "webhook" {
		if !worker.ValidIntegrationURL(values["url"]) {
			return fmt.Errorf("missing or invalid webhook URL")
		}
		if strings.EqualFold(values["mode"], "ntfy") {
			headers := map[string]string{
				"Title":      "LePatch test notification",
				"Priority":   "default",
				"Tags":       "rocket",
				"User-Agent": "LePatch",
			}
			if token := strings.TrimSpace(values["token"]); token != "" {
				headers["Authorization"] = "Bearer " + token
			}
			return postExternalBody(ctx, values["url"], "text/plain; charset=utf-8", []byte("This is a test notification from LePatch. Nothing was published."), headers)
		}
		return postExternalJSONWithSecret(ctx, values["url"], worker.PreviewWebhookPayload(s.config.AppURL.String()), values["secret"])
	}
	if provider == "discord" {
		webhook := values["webhookUrl"]
		if !validDiscordWebhook(webhook) {
			return fmt.Errorf("missing or invalid webhook")
		}
		// Send a preview of the real release card so the reader knows what to
		// expect rather than a plain "test" line.
		return postExternalJSON(ctx, webhook, worker.PreviewDiscordPayload(s.config.AppURL.String()))
	}
	token := values["botToken"]
	if token == "" {
		return fmt.Errorf("missing bot token")
	}
	recipients, err := s.telegramRecipients(ctx, values["chatId"])
	if err != nil {
		return err
	}
	if len(recipients) == 0 {
		return fmt.Errorf("no Telegram recipients")
	}
	text, markup := worker.PreviewTelegramMessage(s.config.AppURL.String())
	for _, chatID := range recipients {
		endpoint := "https://api.telegram.org/bot" + token + "/sendMessage"
		payload := map[string]any{"chat_id": chatID, "text": text, "parse_mode": "HTML", "disable_web_page_preview": true}
		if markup != nil {
			payload["reply_markup"] = markup
		}
		if err := postExternalJSON(ctx, endpoint, payload); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) telegramRecipients(ctx context.Context, defaultChat string) ([]string, error) {
	rows, err := s.store.DB().QueryContext(ctx, `SELECT chatId FROM "TelegramLink" ORDER BY linkedAt`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	recipients := []string{}
	for rows.Next() {
		var chatID string
		if err := rows.Scan(&chatID); err != nil {
			return nil, err
		}
		recipients = append(recipients, chatID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(recipients) == 0 && strings.TrimSpace(defaultChat) != "" {
		recipients = append(recipients, strings.TrimSpace(defaultChat))
	}
	return recipients, nil
}

func knownIntegration(provider string) bool {
	return provider == "discord" || provider == "telegram" || provider == "webhook"
}

func validDiscordWebhook(raw string) bool {
	parsed, err := url.Parse(raw)
	return err == nil && parsed.Scheme == "https" && (parsed.Host == "discord.com" || parsed.Host == "discordapp.com") && strings.HasPrefix(parsed.Path, "/api/webhooks/")
}

func postExternalJSON(ctx context.Context, endpoint string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	requestCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(requestCtx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("integration returned HTTP %d", resp.StatusCode)
	}
	return nil
}

// postExternalJSONWithSecret mirrors the worker's signed webhook so the test
// button delivers exactly what a release would.
func postExternalJSONWithSecret(ctx context.Context, endpoint string, payload any, secret string) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	headers := map[string]string{"User-Agent": "LePatch"}
	if strings.TrimSpace(secret) != "" {
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write(body)
		headers["X-LePatch-Signature"] = "sha256=" + hex.EncodeToString(mac.Sum(nil))
	}
	return postExternalBody(ctx, endpoint, "application/json", body, headers)
}

func postExternalBody(ctx context.Context, endpoint, contentType string, body []byte, headers map[string]string) error {
	requestCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(requestCtx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", contentType)
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("integration returned HTTP %d", resp.StatusCode)
	}
	return nil
}
