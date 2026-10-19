package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"lepatch/internal/auth"
	"lepatch/internal/config"
	"lepatch/internal/events"
	"lepatch/internal/secrets"
	"lepatch/internal/store"
)

func TestTelegramAccountLinkTokenAndWebhookValidation(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.DB().ExecContext(ctx, `INSERT INTO "User" (id,name,email,passwordHash) VALUES ('u1','Test User','test@example.test','unused')`); err != nil {
		t.Fatal(err)
	}
	key := "test-encryption-key-for-telegram-link"
	botToken, _ := secrets.EncryptIntegrationValue(key, "12345:bot-token")
	webhookSecret, _ := secrets.EncryptIntegrationValue(key, "long-webhook-secret")
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for k, v := range map[string]struct {
		value     string
		encrypted bool
	}{"enabled": {"true", false}, "botToken": {"12345:bot-token", true}, "webhookSecret": {"long-webhook-secret", true}, "botUsername": {"LePatchBot", false}} {
		if v.encrypted {
			if k == "botToken" {
				v.value = botToken
			} else {
				v.value = webhookSecret
			}
		}
		if _, err := db.DB().ExecContext(ctx, `INSERT INTO "IntegrationSetting" (id,provider,key,value,encrypted,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)`, newID(), "telegram", k, v.value, v.encrypted, now, now); err != nil {
			t.Fatal(err)
		}
	}
	appURL, _ := url.Parse("http://localhost:3000")
	keySession := []byte("unit-test-session-signing-key-long-enough")
	sessions := &auth.SessionAuth{DB: db.DB(), SigningKey: keySession, AppURL: appURL.String()}
	session, _, err := sessions.CreateSession(ctx, "u1", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	csrf := "csrf-test"
	cookies := []*http.Cookie{{Name: "lepatch_csrf", Value: csrf}, {Name: "lepatch_session", Value: session}}
	app := New(config.Config{AppURL: appURL, SessionKey: keySession, EncryptionKey: key, Port: "3000"}, db, events.NewHub(16), nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	app.telegramSender = func(context.Context, string, string, string) error { return nil }
	handler := app.Handler()
	created := requestJSON(t, handler, "/api/account/telegram", map[string]any{}, cookies)
	if created.Code != http.StatusCreated {
		t.Fatalf("link token = %d %s", created.Code, created.Body.String())
	}
	var payload struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &payload); err != nil || payload.Token == "" {
		t.Fatalf("link token payload = %s, err=%v", created.Body.String(), err)
	}
	webhookBody := map[string]any{"update_id": 10, "message": map[string]any{"text": "/link " + payload.Token, "chat": map[string]any{"id": 99, "type": "private"}, "from": map[string]any{"id": 99, "username": "tester", "first_name": "Test"}}}
	body, _ := json.Marshal(webhookBody)
	bad := httptest.NewRequest(http.MethodPost, "/api/webhook/telegram", bytes.NewReader(body))
	bad.Header.Set("X-Telegram-Bot-Api-Secret-Token", "wrong")
	badResponse := httptest.NewRecorder()
	handler.ServeHTTP(badResponse, bad)
	if badResponse.Code != http.StatusUnauthorized {
		t.Fatalf("bad webhook secret = %d", badResponse.Code)
	}
	good := httptest.NewRequest(http.MethodPost, "/api/webhook/telegram", bytes.NewReader(body))
	good.Header.Set("X-Telegram-Bot-Api-Secret-Token", "long-webhook-secret")
	goodResponse := httptest.NewRecorder()
	handler.ServeHTTP(goodResponse, good)
	if goodResponse.Code != http.StatusOK {
		t.Fatalf("webhook link = %d %s", goodResponse.Code, goodResponse.Body.String())
	}
	var linked int
	if err := db.DB().QueryRowContext(ctx, `SELECT COUNT(*) FROM "TelegramLink" WHERE userId='u1' AND telegramUserId='99' AND chatId='99'`).Scan(&linked); err != nil || linked != 1 {
		t.Fatalf("Telegram link count = %d, err=%v", linked, err)
	}
	if _, err := db.DB().ExecContext(ctx, `DELETE FROM "TelegramLink"`); err != nil {
		t.Fatal(err)
	}
	replay := httptest.NewRequest(http.MethodPost, "/api/webhook/telegram", bytes.NewReader(body))
	replay.Header.Set("X-Telegram-Bot-Api-Secret-Token", "long-webhook-secret")
	replayResponse := httptest.NewRecorder()
	handler.ServeHTTP(replayResponse, replay)
	if replayResponse.Code != http.StatusOK {
		t.Fatalf("webhook replay = %d", replayResponse.Code)
	}
	if err := db.DB().QueryRowContext(ctx, `SELECT COUNT(*) FROM "TelegramLink"`).Scan(&linked); err != nil || linked != 0 {
		t.Fatalf("used link token was reusable: count=%d err=%v", linked, err)
	}
}
