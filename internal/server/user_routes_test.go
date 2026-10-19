package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"testing"

	"golang.org/x/crypto/bcrypt"
	"lepatch/internal/config"
	"lepatch/internal/events"
	"lepatch/internal/store"
)

func TestAdminCanCreateUserAndUserCannot(t *testing.T) {
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
	handler := New(config.Config{AppURL: appURL, SessionKey: []byte("unit-test-session-signing-key-long-enough"), Port: "3000"}, db, events.NewHub(16), nil, slog.New(slog.NewTextHandler(io.Discard, nil))).Handler()
	login := requestJSON(t, handler, "/api/auth/login", map[string]any{"email": "admin@example.test", "password": "correct horse battery staple"}, nil)
	var challenge struct {
		Token    string `json:"mfaToken"`
		Required bool   `json:"mfaRequired"`
	}
	if err := json.Unmarshal(login.Body.Bytes(), &challenge); err != nil || login.Code != http.StatusOK || !challenge.Required {
		t.Fatalf("login MFA challenge = %d %s", login.Code, login.Body.String())
	}
	verify := requestJSON(t, handler, "/api/auth/mfa-verify", map[string]any{"mfaToken": challenge.Token, "code": currentTOTP(t, "JBSWY3DPEHPK3PXP")}, nil)
	if verify.Code != http.StatusOK {
		t.Fatalf("MFA verification = %d %s", verify.Code, verify.Body.String())
	}
	session := cookieValueFromResponse(verify, "lepatch_session")
	csrf := cookieValueFromResponse(verify, "lepatch_csrf")
	if session == "" || csrf == "" {
		t.Fatal("successful login did not issue session and CSRF cookies")
	}
	cookies := []*http.Cookie{{Name: "lepatch_csrf", Value: csrf}, {Name: "lepatch_session", Value: session}}
	created := requestJSON(t, handler, "/api/users", map[string]any{"name": "New User", "email": "new@example.test", "password": "a sufficiently long password", "role": "user"}, cookies)
	if created.Code != http.StatusCreated {
		t.Fatalf("admin create user = %d %s", created.Code, created.Body.String())
	}
	userID := ""
	if err := db.DB().QueryRowContext(ctx, `SELECT id FROM "User" WHERE email='new@example.test'`).Scan(&userID); err != nil || userID == "" {
		t.Fatalf("created user missing: id=%q err=%v", userID, err)
	}
	if _, err := db.DB().ExecContext(ctx, `UPDATE "User" SET role='user' WHERE id='admin'`); err != nil {
		t.Fatal(err)
	}
	forbidden := requestJSON(t, handler, "/api/users", map[string]any{"name": "Other", "email": "other@example.test", "password": "a sufficiently long password", "role": "user"}, cookies)
	if forbidden.Code != http.StatusForbidden {
		t.Fatalf("non-admin user create status = %d; want 403", forbidden.Code)
	}
}
