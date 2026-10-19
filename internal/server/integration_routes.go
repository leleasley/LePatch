package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"lepatch/internal/secrets"
)

type integrationStatus struct {
	Provider                   string `json:"provider"`
	Enabled                    bool   `json:"enabled"`
	Configured                 bool   `json:"configured"`
	DefaultRecipientConfigured bool   `json:"defaultRecipientConfigured,omitempty"`
	BotUsername                string `json:"botUsername,omitempty"`
	BotName                    string `json:"botName,omitempty"`
}

func (s *Server) integrationInfo(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.adminOnly(w, r); !ok {
		return
	}
	provider := chi.URLParam(r, "provider")
	if provider == "" {
		provider = r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
	}
	if provider != "discord" && provider != "telegram" {
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
	writeJSON(w, http.StatusOK, map[string]any{"discord": discord, "telegram": telegram})
}

func (s *Server) readIntegrationStatus(ctx context.Context, provider string) (integrationStatus, error) {
	status := integrationStatus{Provider: provider}
	settings, err := s.integrationValues(ctx, provider)
	if err != nil {
		return status, err
	}
	status.Enabled = settings["enabled"] == "true"
	if provider == "discord" {
		status.Configured = settings["webhookUrl"] != ""
	} else {
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
	if provider != "discord" && provider != "telegram" {
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
	if input.Provider != "discord" && input.Provider != "telegram" {
		writeError(w, http.StatusBadRequest, "Choose Discord or Telegram")
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
	if provider != "discord" && provider != "telegram" {
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
	if provider == "telegram" {
		keys = []string{"enabled", "botToken", "chatId", "webhookSecret", "botUsername", "botName"}
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, key := range keys {
		value := values[key]
		encrypted := false
		if (provider == "discord" && key == "webhookUrl") || (provider == "telegram" && (key == "botToken" || key == "chatId" || key == "webhookSecret")) {
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
	if provider == "discord" {
		webhook := values["webhookUrl"]
		if !validDiscordWebhook(webhook) {
			return fmt.Errorf("missing or invalid webhook")
		}
		return postExternalJSON(ctx, webhook, map[string]string{"content": "Test message from LePatch"})
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
	for _, chatID := range recipients {
		endpoint := "https://api.telegram.org/bot" + token + "/sendMessage"
		if err := postExternalJSON(ctx, endpoint, map[string]string{"chat_id": chatID, "text": "Test message from LePatch"}); err != nil {
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
