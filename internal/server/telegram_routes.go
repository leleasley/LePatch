package server

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"lepatch/internal/auth"
)

func (s *Server) telegramLinkInfo(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	settings, err := s.integrationValues(r.Context(), "telegram")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load Telegram status")
		return
	}
	var link struct {
		ChatID    string  `json:"chatId"`
		Username  *string `json:"username"`
		FirstName *string `json:"firstName"`
		LinkedAt  string  `json:"linkedAt"`
	}
	err = s.store.DB().QueryRowContext(r.Context(), `SELECT chatId,username,firstName,linkedAt FROM "TelegramLink" WHERE userId=?`, p.UserID).Scan(&link.ChatID, &link.Username, &link.FirstName, &link.LinkedAt)
	linked := err == nil
	if err != nil && err != sql.ErrNoRows {
		writeError(w, http.StatusInternalServerError, "Could not load Telegram link")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"enabled": settings["enabled"] == "true" && settings["botToken"] != "", "botUsername": settings["botUsername"], "botName": settings["botName"], "linked": linked, "link": func() any {
		if linked {
			return link
		}
		return nil
	}()})
}

func (s *Server) createTelegramLinkToken(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	settings, err := s.integrationValues(r.Context(), "telegram")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load Telegram bot settings")
		return
	}
	if settings["enabled"] != "true" || settings["botToken"] == "" || settings["botUsername"] == "" {
		writeError(w, http.StatusBadRequest, "Telegram bot linking is not configured by an administrator")
		return
	}
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not generate link token")
		return
	}
	token := base64.RawURLEncoding.EncodeToString(raw[:])
	hash := sha256.Sum256([]byte(token))
	now := time.Now().UTC()
	if _, err := s.store.DB().ExecContext(r.Context(), `DELETE FROM "TelegramLinkToken" WHERE userId=? AND usedAt IS NULL`, p.UserID); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not replace old link token")
		return
	}
	_, err = s.store.DB().ExecContext(r.Context(), `INSERT INTO "TelegramLinkToken" (id,userId,tokenHash,expiresAt,createdAt) VALUES (?,?,?,?,?)`, newID(), p.UserID, hex.EncodeToString(hash[:]), now.Add(15*time.Minute).Format(time.RFC3339Nano), now.Format(time.RFC3339Nano))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create Telegram link token")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"token": token, "expiresAt": now.Add(15 * time.Minute).Format(time.RFC3339Nano), "botUsername": settings["botUsername"], "botName": settings["botName"]})
}

func (s *Server) unlinkTelegramAccount(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	if _, err := s.store.DB().ExecContext(r.Context(), `DELETE FROM "TelegramLink" WHERE userId=?`, p.UserID); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not disconnect Telegram")
		return
	}
	s.writeAudit(r.Context(), p.UserID, "settings.updated", "telegram-link", map[string]bool{"linked": false}, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

type telegramWebhookUpdate struct {
	UpdateID int64 `json:"update_id"`
	Message  *struct {
		Text string `json:"text"`
		Chat struct {
			ID   int64  `json:"id"`
			Type string `json:"type"`
		} `json:"chat"`
		From *struct {
			ID        int64  `json:"id"`
			Username  string `json:"username"`
			FirstName string `json:"first_name"`
			LastName  string `json:"last_name"`
		} `json:"from"`
	} `json:"message"`
}

func (s *Server) telegramWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	settings, err := s.integrationValues(r.Context(), "telegram")
	if err != nil || settings["enabled"] != "true" || settings["botToken"] == "" || settings["webhookSecret"] == "" {
		writeError(w, http.StatusUnauthorized, "Telegram webhook is not configured")
		return
	}
	provided := r.Header.Get("X-Telegram-Bot-Api-Secret-Token")
	providedHash := sha256.Sum256([]byte(provided))
	expectedHash := sha256.Sum256([]byte(settings["webhookSecret"]))
	if subtle.ConstantTimeCompare(providedHash[:], expectedHash[:]) != 1 {
		writeError(w, http.StatusUnauthorized, "Invalid Telegram webhook secret")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var update telegramWebhookUpdate
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid Telegram update")
		return
	}
	if update.Message == nil || update.Message.From == nil || update.Message.Chat.Type != "private" {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	parts := strings.Fields(update.Message.Text)
	if len(parts) < 1 {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	command := strings.ToLower(strings.Split(strings.TrimPrefix(parts[0], "/"), "@")[0])
	chatID := fmt.Sprint(update.Message.Chat.ID)
	telegramUserID := fmt.Sprint(update.Message.From.ID)
	switch command {
	case "link":
		if len(parts) < 2 || len(parts[1]) > 128 {
			s.telegramReply(r, settings["botToken"], chatID, "Send /link followed by the one-time code from your LePatch account.")
			break
		}
		hash := sha256.Sum256([]byte(parts[1]))
		tx, err := s.store.DB().BeginTx(r.Context(), nil)
		if err != nil {
			s.logger.Error("begin Telegram account link", "error", err)
			break
		}
		var userID string
		err = tx.QueryRowContext(r.Context(), `SELECT userId FROM "TelegramLinkToken" WHERE tokenHash=? AND usedAt IS NULL AND expiresAt>?`, hex.EncodeToString(hash[:]), time.Now().UTC().Format(time.RFC3339Nano)).Scan(&userID)
		if err == nil {
			_, err = tx.ExecContext(r.Context(), `DELETE FROM "TelegramLink" WHERE userId=? OR telegramUserId=? OR chatId=?`, userID, telegramUserID, chatID)
		}
		if err == nil {
			_, err = tx.ExecContext(r.Context(), `INSERT INTO "TelegramLink" (id,userId,telegramUserId,chatId,username,firstName,lastName,linkedAt,lastSeenAt) VALUES (?,?,?,?,?,?,?,?,?)`, newID(), userID, telegramUserID, chatID, telegramNullableString(update.Message.From.Username), telegramNullableString(update.Message.From.FirstName), telegramNullableString(update.Message.From.LastName), time.Now().UTC().Format(time.RFC3339Nano), time.Now().UTC().Format(time.RFC3339Nano))
		}
		if err == nil {
			_, err = tx.ExecContext(r.Context(), `UPDATE "TelegramLinkToken" SET usedAt=? WHERE tokenHash=?`, time.Now().UTC().Format(time.RFC3339Nano), hex.EncodeToString(hash[:]))
		}
		if err == nil {
			err = tx.Commit()
		} else {
			_ = tx.Rollback()
		}
		if err != nil {
			s.telegramReply(r, settings["botToken"], chatID, "That link code is invalid or expired. Generate a new one in LePatch.")
		} else {
			s.telegramReply(r, settings["botToken"], chatID, "Your Telegram account is now linked to LePatch.")
		}
	case "start":
		s.telegramReply(r, settings["botToken"], chatID, "Welcome to LePatch. Link your account from Settings → Telegram using /link CODE.")
	case "help":
		s.telegramReply(r, settings["botToken"], chatID, "LePatch bot: /link CODE to connect your account; /help for this message.")
	default:
		s.telegramReply(r, settings["botToken"], chatID, "Use /help to see available commands.")
	}
	if update.UpdateID != 0 {
		s.logger.Info("Telegram webhook update processed", "update_id", update.UpdateID, "command", command)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) telegramReply(r *http.Request, botToken, chatID, message string) {
	if s.telegramSender == nil {
		return
	}
	if err := s.telegramSender(r.Context(), botToken, chatID, message); err != nil {
		s.logger.Warn("Telegram bot reply failed", "error", err.Error())
	}
}

func telegramNullableString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}
