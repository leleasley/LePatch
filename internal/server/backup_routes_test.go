package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"

	"golang.org/x/crypto/bcrypt"
	"lepatch/internal/config"
	"lepatch/internal/events"
	"lepatch/internal/store"
)

func TestAdminCreatesAndDownloadsSQLiteBackup(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	hash, err := bcrypt.GenerateFromPassword([]byte("correct horse battery staple"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.DB().ExecContext(ctx, `INSERT INTO "User" (id,name,email,passwordHash,passwordEnabled,role,totpSecret,totpEnabled) VALUES ('admin','Admin','admin@example.test',?,1,'administrator','JBSWY3DPEHPK3PXP',1)`, string(hash))
	if err != nil {
		t.Fatal(err)
	}
	appURL, _ := url.Parse("http://localhost:3000")
	dataDir := t.TempDir()
	handler := New(config.Config{AppURL: appURL, SessionKey: []byte("unit-test-session-signing-key-long-enough"), DataDir: dataDir}, db, events.NewHub(8), nil, slog.New(slog.NewTextHandler(io.Discard, nil))).Handler()
	login := requestJSON(t, handler, "/api/auth/login", map[string]any{"email": "admin@example.test", "password": "correct horse battery staple"}, nil)
	var challenge struct {
		Token string `json:"mfaToken"`
	}
	if err := json.Unmarshal(login.Body.Bytes(), &challenge); err != nil {
		t.Fatal(err)
	}
	verified := requestJSON(t, handler, "/api/auth/mfa-verify", map[string]any{"mfaToken": challenge.Token, "code": currentTOTP(t, "JBSWY3DPEHPK3PXP")}, nil)
	session, csrf := cookieValueFromResponse(verified, "lepatch_session"), cookieValueFromResponse(verified, "lepatch_csrf")
	if verified.Code != http.StatusOK || session == "" || csrf == "" {
		t.Fatalf("MFA login failed: %d %s", verified.Code, verified.Body.String())
	}
	request := httptest.NewRequest(http.MethodPost, "/api/admin/backups", nil)
	request.AddCookie(&http.Cookie{Name: "lepatch_session", Value: session})
	request.AddCookie(&http.Cookie{Name: "lepatch_csrf", Value: csrf})
	request.Header.Set("X-CSRF-Token", csrf)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("backup create = %d %s", response.Code, response.Body.String())
	}
	var payload struct {
		Backup backupSummary `json:"backup"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Backup.ID == "" || payload.Backup.Status != "completed" {
		t.Fatalf("backup response = %#v", payload.Backup)
	}
	path := filepath.Join(dataDir, "backups", payload.Backup.Filename)
	if info, err := os.Stat(path); err != nil || info.Size() == 0 {
		t.Fatalf("backup file missing or empty: info=%v err=%v", info, err)
	}
	download := httptest.NewRequest(http.MethodGet, "/api/admin/backups/"+payload.Backup.ID, nil)
	download.AddCookie(&http.Cookie{Name: "lepatch_session", Value: session})
	downloadResponse := httptest.NewRecorder()
	handler.ServeHTTP(downloadResponse, download)
	if downloadResponse.Code != http.StatusOK || downloadResponse.Body.Len() == 0 {
		t.Fatalf("backup download = %d, %d bytes", downloadResponse.Code, downloadResponse.Body.Len())
	}
}
