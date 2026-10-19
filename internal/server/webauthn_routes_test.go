package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"lepatch/internal/auth"
	"lepatch/internal/config"
	"lepatch/internal/events"
	"lepatch/internal/store"
)

func TestPasskeyRegistrationAndAuthenticationOptions(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "User" (id,name,email,passwordHash,passwordEnabled) VALUES ('u1','Test User','test@example.test','not-used',1)`); err != nil {
		t.Fatal(err)
	}
	appURL, _ := url.Parse("http://localhost:3000")
	key := []byte("unit-test-session-signing-key-long-enough")
	sessions := &auth.SessionAuth{DB: db.DB(), SigningKey: key, AppURL: appURL.String()}
	token, _, err := sessions.CreateSession(ctx, "u1", "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	csrf := "test-csrf-token"
	cookies := []*http.Cookie{{Name: "lepatch_session", Value: token}, {Name: "lepatch_csrf", Value: csrf}}
	handler := New(config.Config{AppURL: appURL, SessionKey: key, Port: "3000"}, db, events.NewHub(16), nil, slog.New(slog.NewTextHandler(io.Discard, nil))).Handler()

	request := httptest.NewRequest(http.MethodPost, "/api/webauthn/register/options", nil)
	request.Header.Set("X-CSRF-Token", csrf)
	for _, cookie := range cookies {
		request.AddCookie(cookie)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("registration options = %d %s", response.Code, response.Body.String())
	}
	var registration struct {
		FlowID    string         `json:"flowId"`
		PublicKey map[string]any `json:"publicKey"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &registration); err != nil {
		t.Fatal(err)
	}
	if registration.FlowID == "" || registration.PublicKey["challenge"] == "" {
		t.Fatalf("registration options missing ceremony: %s", response.Body.String())
	}

	request = httptest.NewRequest(http.MethodGet, "/api/webauthn/auth/options", nil)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("authentication options = %d %s", response.Code, response.Body.String())
	}
	var authentication struct {
		FlowID    string         `json:"flowId"`
		PublicKey map[string]any `json:"publicKey"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &authentication); err != nil {
		t.Fatal(err)
	}
	if authentication.FlowID == "" || authentication.PublicKey["challenge"] == "" {
		t.Fatalf("authentication options missing ceremony: %s", response.Body.String())
	}
}
