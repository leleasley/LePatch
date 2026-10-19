package server

import (
	"context"
	"io"
	"log/slog"
	"net/url"
	"strings"
	"testing"

	"lepatch/internal/config"
	"lepatch/internal/events"
	"lepatch/internal/secrets"
	"lepatch/internal/store"
)

func TestIntegrationUpdateEncryptsAndMasksWebhook(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	appURL, _ := url.Parse("http://localhost:3000")
	s := New(config.Config{AppURL: appURL, SessionKey: []byte("unit-test-session-signing-key-long-enough"), EncryptionKey: "test-encryption-key-long-enough"}, db, events.NewHub(8), nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	webhook := "https://discord.com/api/webhooks/123/secret-token"
	if err := s.saveIntegrationValues(ctx, "discord", map[string]string{"enabled": "true", "webhookUrl": webhook}); err != nil {
		t.Fatal(err)
	}
	var raw string
	var encrypted bool
	if err := db.DB().QueryRowContext(ctx, `SELECT value,encrypted FROM "IntegrationSetting" WHERE provider='discord' AND key='webhookUrl'`).Scan(&raw, &encrypted); err != nil {
		t.Fatal(err)
	}
	if !encrypted || strings.Contains(raw, webhook) {
		t.Fatal("webhook was not encrypted at rest")
	}
	plain, err := secrets.DecryptIntegrationValue(s.config.EncryptionKey, raw)
	if err != nil || plain != webhook {
		t.Fatalf("decrypted webhook = %q, err=%v", plain, err)
	}
	status, err := s.readIntegrationStatus(ctx, "discord")
	if err != nil {
		t.Fatal(err)
	}
	if !status.Enabled || !status.Configured {
		t.Fatalf("integration status = %#v", status)
	}
}
