package server

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
	"lepatch/internal/config"
	"lepatch/internal/events"
	"lepatch/internal/store"
)

func TestPasswordMFAEnrollmentCreatesSession(t *testing.T) {
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
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "User" (id,name,email,passwordHash,passwordEnabled,totpEnabled) VALUES ('u1','Test User','test@example.test',?,1,0)`, string(hash)); err != nil {
		t.Fatal(err)
	}
	appURL, _ := url.Parse("http://localhost:3000")
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	handler := New(config.Config{AppURL: appURL, SessionKey: []byte("unit-test-session-signing-key-long-enough"), Port: "3000"}, db, events.NewHub(16), nil, logger).Handler()

	loginResponse := requestJSON(t, handler, "/api/auth/login", map[string]any{"email": "test@example.test", "password": "correct horse battery staple"}, nil)
	if loginResponse.Code != http.StatusOK {
		t.Fatalf("login status = %d: %s", loginResponse.Code, loginResponse.Body.String())
	}
	var loginResult struct {
		SetupRequired bool   `json:"mfaSetupRequired"`
		SetupToken    string `json:"mfaSetupToken"`
	}
	if err := json.Unmarshal(loginResponse.Body.Bytes(), &loginResult); err != nil {
		t.Fatal(err)
	}
	if !loginResult.SetupRequired || loginResult.SetupToken == "" {
		t.Fatalf("first login should require MFA setup, got %#v", loginResult)
	}
	csrf := cookieValueFromResponse(loginResponse, "lepatch_csrf")
	setupResponse := requestJSON(t, handler, "/api/account/mfa/setup", map[string]any{"setupToken": loginResult.SetupToken}, csrfRequestCookies(csrf))
	if setupResponse.Code != http.StatusOK {
		t.Fatalf("start MFA status = %d: %s", setupResponse.Code, setupResponse.Body.String())
	}
	var setupResult struct {
		Secret string `json:"secret"`
	}
	if err := json.Unmarshal(setupResponse.Body.Bytes(), &setupResult); err != nil || setupResult.Secret == "" {
		t.Fatalf("MFA setup response = %s, err=%v", setupResponse.Body.String(), err)
	}
	setupResponse = requestJSON(t, handler, "/api/account/mfa/verify", map[string]any{"setupToken": loginResult.SetupToken, "code": currentTOTP(t, setupResult.Secret)}, csrfRequestCookies(csrf))
	if setupResponse.Code != http.StatusOK {
		t.Fatalf("finish MFA status = %d: %s", setupResponse.Code, setupResponse.Body.String())
	}
	if cookieValueFromResponse(setupResponse, "lepatch_session") == "" {
		t.Fatal("successful MFA enrollment did not create a session cookie")
	}

	dashboard := httptest.NewRequest(http.MethodGet, "/api/dashboard", nil)
	dashboard.AddCookie(&http.Cookie{Name: "lepatch_session", Value: cookieValueFromResponse(setupResponse, "lepatch_session")})
	dashboardResponse := httptest.NewRecorder()
	handler.ServeHTTP(dashboardResponse, dashboard)
	if dashboardResponse.Code != http.StatusOK {
		t.Fatalf("session should authenticate dashboard, got %d: %s", dashboardResponse.Code, dashboardResponse.Body.String())
	}
	session := httptest.NewRequest(http.MethodGet, "/api/auth/session", nil)
	session.AddCookie(&http.Cookie{Name: "lepatch_session", Value: cookieValueFromResponse(setupResponse, "lepatch_session")})
	sessionResponse := httptest.NewRecorder()
	handler.ServeHTTP(sessionResponse, session)
	var sessionResult struct {
		User struct {
			MFAEnabled bool `json:"mfaEnabled"`
		} `json:"user"`
	}
	if sessionResponse.Code != http.StatusOK || json.Unmarshal(sessionResponse.Body.Bytes(), &sessionResult) != nil || !sessionResult.User.MFAEnabled {
		t.Fatalf("session should report the completed MFA enrollment, got %d: %s", sessionResponse.Code, sessionResponse.Body.String())
	}
}

func requestJSON(t *testing.T, handler http.Handler, path string, payload any, cookies []*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	for _, cookie := range cookies {
		request.AddCookie(cookie)
	}
	if len(cookies) > 0 && cookies[0].Name != "" {
		request.Header.Set("X-CSRF-Token", cookies[0].Value)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func csrfRequestCookies(token string) []*http.Cookie {
	return []*http.Cookie{{Name: "lepatch_csrf", Value: token}}
}

func cookieValueFromResponse(response *httptest.ResponseRecorder, name string) string {
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name == name {
			return cookie.Value
		}
	}
	return ""
}

func currentTOTP(t *testing.T, secret string) string {
	t.Helper()
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		t.Fatal(err)
	}
	var message [8]byte
	binary.BigEndian.PutUint64(message[:], uint64(time.Now().Unix()/30))
	mac := hmac.New(sha1.New, key)
	_, _ = mac.Write(message[:])
	digest := mac.Sum(nil)
	offset := digest[len(digest)-1] & 0x0f
	value := binary.BigEndian.Uint32(digest[offset:offset+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", value%1_000_000)
}
