package server

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
	"lepatch/internal/auth"
	"lepatch/internal/secrets"
)

type attemptWindow struct {
	count int
	reset time.Time
}

var (
	loginAttemptsMu       sync.Mutex
	loginAttempts         = map[string]attemptWindow{}
	mfaAttemptsMu         sync.Mutex
	mfaAttempts           = map[string]attemptWindow{}
	mfaRecoveryAttemptsMu sync.Mutex
	mfaRecoveryAttempts   = map[string]attemptWindow{}
)

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	if input.Email == "" || input.Password == "" || len(input.Password) > 1024 {
		writeError(w, http.StatusBadRequest, "Email and password are required")
		return
	}
	if !allowAttempt(loginAttempts, &loginAttemptsMu, s.clientIP(r), 8, 15*time.Minute) {
		writeError(w, http.StatusTooManyRequests, "Too many login attempts. Try again later.")
		return
	}
	var userID, passwordHash string
	var passwordEnabled, totpEnabled bool
	err := s.store.DB().QueryRowContext(r.Context(), `SELECT id,passwordHash,passwordEnabled,totpEnabled FROM "User" WHERE email=? COLLATE NOCASE`, input.Email).Scan(&userID, &passwordHash, &passwordEnabled, &totpEnabled)
	if err != nil || !passwordEnabled || bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(input.Password)) != nil {
		writeError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}
	clearAttempt(loginAttempts, &loginAttemptsMu, s.clientIP(r))
	purpose := "mfa"
	if !totpEnabled {
		purpose = "mfa_setup"
	}
	token, err := auth.CreatePreAuthToken(userID, purpose, s.auth.SigningKey, time.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not begin secure sign in")
		return
	}
	s.setCSRFCookie(w)
	if purpose == "mfa_setup" {
		writeJSON(w, http.StatusOK, map[string]any{"mfaSetupRequired": true, "mfaSetupToken": token})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"mfaRequired": true, "mfaToken": token})
}

func (s *Server) verifyMFA(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Token          string `json:"mfaToken"`
		Code           string `json:"code"`
		BackupCode     string `json:"backupCode"`
		RememberDevice bool   `json:"rememberDevice"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	claims, valid := auth.VerifyPreAuthToken(input.Token, s.auth.SigningKey, time.Now())
	if !valid || claims.Purpose != "mfa" {
		writeError(w, http.StatusUnauthorized, "Invalid or expired MFA token")
		return
	}
	if !allowAttempt(mfaAttempts, &mfaAttemptsMu, claims.UserID, 8, 15*time.Minute) {
		writeError(w, http.StatusTooManyRequests, "Too many attempts. Try again later.")
		return
	}
	var enabled bool
	var secret, backupCodes sql.NullString
	err := s.store.DB().QueryRowContext(r.Context(), `SELECT totpEnabled,totpSecret,totpBackupCodes FROM "User" WHERE id=?`, claims.UserID).Scan(&enabled, &secret, &backupCodes)
	if err != nil || !enabled || !secret.Valid {
		writeError(w, http.StatusBadRequest, "MFA is not enabled")
		return
	}
	verified := auth.VerifyTOTP(secret.String, input.Code, time.Now())
	updatedCodes := backupCodes.String
	if !verified && input.BackupCode != "" {
		updatedCodes, verified = auth.ConsumeRecoveryCode(input.BackupCode, backupCodes.String)
	}
	if !verified {
		writeError(w, http.StatusBadRequest, "Invalid verification code")
		return
	}
	if updatedCodes != backupCodes.String {
		if _, err := s.store.DB().ExecContext(r.Context(), `UPDATE "User" SET totpBackupCodes=?,updatedAt=? WHERE id=?`, updatedCodes, time.Now().UTC().Format(time.RFC3339Nano), claims.UserID); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not update recovery codes")
			return
		}
	}
	clearAttempt(mfaAttempts, &mfaAttemptsMu, claims.UserID)
	token, age, err := s.auth.CreateSession(r.Context(), claims.UserID, r.UserAgent(), s.clientIP(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create session")
		return
	}
	s.auth.SetSessionCookies(w, token, age)
	s.writeAudit(r.Context(), claims.UserID, "user.login", "", nil, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"success": true, "ok": true})
}

type githubOAuthState struct {
	Mode      string `json:"mode"`
	Nonce     string `json:"nonce"`
	ExpiresAt int64  `json:"expiresAt"`
}

func (s *Server) githubOAuthStart(w http.ResponseWriter, r *http.Request) {
	clientID, err := s.integrationValue(r.Context(), "oauthClientId")
	enabled, _ := s.integrationValue(r.Context(), "oauthEnabled")
	if err != nil || clientID == "" || enabled != "true" {
		writeError(w, http.StatusBadRequest, "GitHub OAuth is not configured")
		return
	}
	mode := r.URL.Query().Get("mode")
	if mode == "mfa-recovery" {
		if !allowAttempt(mfaRecoveryAttempts, &mfaRecoveryAttemptsMu, s.clientIP(r), 5, 15*time.Minute) {
			writeError(w, http.StatusTooManyRequests, "Too many recovery attempts. Try again later.")
			return
		}
	} else if mode != "login" {
		mode = "link"
		if _, err := s.auth.Session(r); err != nil {
			writeError(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
	}
	state, nonce, err := s.createOAuthState(mode)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not start GitHub OAuth")
		return
	}
	secure := strings.HasPrefix(strings.ToLower(s.config.AppURL.String()), "https://")
	name := "gh_oauth_state"
	if secure {
		name = "__Host-gh_oauth_state"
	}
	http.SetCookie(w, &http.Cookie{Name: name, Value: nonce, Path: "/", MaxAge: 600, Secure: secure, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	// The repository scope is needed to read private repositories, including
	// the private repositories a sponsor can see. The recovery flow only
	// needs to identify the account, so it stays on the narrow scope.
	scope := "repo read:user"
	if mode == "mfa-recovery" {
		scope = "read:user"
	}
	redirectURI := strings.TrimRight(s.config.AppURL.String(), "/") + "/api/auth/github/callback"
	query := url.Values{"client_id": {clientID}, "redirect_uri": {redirectURI}, "scope": {scope}, "state": {state}}
	http.Redirect(w, r, "https://github.com/login/oauth/authorize?"+query.Encode(), http.StatusFound)
}

func (s *Server) githubOAuthCallback(w http.ResponseWriter, r *http.Request) {
	mode := "login"
	data, valid := s.verifyOAuthState(r.URL.Query().Get("state"))
	if !valid || r.URL.Query().Get("code") == "" {
		s.oauthFailure(w, r, "github-oauth-failed", mode)
		return
	}
	mode = data.Mode
	name := "gh_oauth_state"
	if strings.HasPrefix(strings.ToLower(s.config.AppURL.String()), "https://") {
		name = "__Host-gh_oauth_state"
	}
	cookie, err := r.Cookie(name)
	if err != nil || !hmac.Equal([]byte(cookie.Value), []byte(data.Nonce)) {
		s.oauthFailure(w, r, "github-oauth-failed", mode)
		return
	}
	clientID, _ := s.integrationValue(r.Context(), "oauthClientId")
	clientSecret, err := s.integrationValue(r.Context(), "oauthClientSecret")
	if clientID == "" || err != nil || clientSecret == "" {
		s.oauthFailure(w, r, "github-oauth-failed", mode)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	tokenReq, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://github.com/login/oauth/access_token", strings.NewReader(url.Values{"client_id": {clientID}, "client_secret": {clientSecret}, "code": {r.URL.Query().Get("code")}}.Encode()))
	tokenReq.Header.Set("Accept", "application/json")
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokenReq.Header.Set("User-Agent", "LePatch")
	tokenRes, err := http.DefaultClient.Do(tokenReq)
	if err != nil {
		s.logger.Warn("GitHub OAuth token exchange failed", "error", err.Error())
		s.oauthFailure(w, r, "github-oauth-failed", mode)
		return
	}
	defer tokenRes.Body.Close()
	var tokenData struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, tokenRes.Body, 1<<20)).Decode(&tokenData) != nil || tokenData.AccessToken == "" || tokenData.Error != "" {
		s.oauthFailure(w, r, "github-oauth-failed", mode)
		return
	}
	apiReq, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
	apiReq.Header.Set("Authorization", "Bearer "+tokenData.AccessToken)
	apiReq.Header.Set("Accept", "application/vnd.github+json")
	apiReq.Header.Set("User-Agent", "LePatch")
	apiRes, err := http.DefaultClient.Do(apiReq)
	if err != nil {
		s.oauthFailure(w, r, "github-oauth-failed", mode)
		return
	}
	defer apiRes.Body.Close()
	var ghUser struct {
		ID    int64  `json:"id"`
		Login string `json:"login"`
	}
	if apiRes.StatusCode != http.StatusOK || json.NewDecoder(http.MaxBytesReader(w, apiRes.Body, 1<<20)).Decode(&ghUser) != nil || ghUser.ID <= 0 || ghUser.Login == "" {
		s.oauthFailure(w, r, "github-oauth-failed", mode)
		return
	}
	if mode == "link" {
		s.finishGitHubLink(w, r, ghUser.ID, ghUser.Login, tokenData.AccessToken)
		return
	}
	if mode == "mfa-recovery" {
		s.finishGitHubMFARecovery(w, r, ghUser.ID)
		return
	}
	s.finishGitHubLogin(w, r, ghUser.ID)
}

// finishGitHubMFARecovery lets an owner who has lost their authenticator prove
// account ownership with the GitHub identity already linked to their account.
// The recovery is explicit, rate limited at OAuth start, audited, and always
// sends the owner directly into a fresh MFA enrollment.
func (s *Server) finishGitHubMFARecovery(w http.ResponseWriter, r *http.Request, githubID int64) {
	var userID string
	err := s.store.DB().QueryRowContext(r.Context(), `SELECT u.id FROM "GitHubLink" g JOIN "User" u ON u.id=g.userId WHERE g.githubUserId=?`, githubID).Scan(&userID)
	if err != nil {
		s.oauthFailure(w, r, "mfa-recovery-unavailable", "mfa-recovery")
		return
	}
	setupToken, err := auth.CreatePreAuthToken(userID, "mfa_setup", s.auth.SigningKey, time.Now())
	if err != nil {
		s.oauthFailure(w, r, "github-oauth-failed", "mfa-recovery")
		return
	}
	result, err := s.store.DB().ExecContext(r.Context(), `UPDATE "User" SET totpSecret=NULL,totpEnabled=0,totpBackupCodes='[]',updatedAt=? WHERE id=?`, time.Now().UTC().Format(time.RFC3339Nano), userID)
	if err != nil {
		s.logger.Error("MFA recovery update failed", "error", err.Error())
		s.oauthFailure(w, r, "github-oauth-failed", "mfa-recovery")
		return
	}
	changed, _ := result.RowsAffected()
	if changed != 1 {
		s.oauthFailure(w, r, "mfa-recovery-unavailable", "mfa-recovery")
		return
	}
	s.writeAudit(r.Context(), userID, "mfa.recovered", "totp", map[string]any{"method": "linked_github_oauth"}, s.clientIP(r))
	s.setCSRFCookie(w)
	s.clearOAuthState(w)
	http.Redirect(w, r, "/setup/mfa?token="+url.QueryEscape(setupToken), http.StatusFound)
}

func (s *Server) finishGitHubLogin(w http.ResponseWriter, r *http.Request, githubID int64) {
	var userID string
	var enabled bool
	err := s.store.DB().QueryRowContext(r.Context(), `SELECT u.id,u.totpEnabled FROM "GitHubLink" g JOIN "User" u ON u.id=g.userId WHERE g.githubUserId=?`, githubID).Scan(&userID, &enabled)
	if err != nil {
		s.oauthFailure(w, r, "github-not-linked", "login")
		return
	}
	_, _ = s.store.DB().ExecContext(r.Context(), `UPDATE "GitHubLink" SET lastUsedAt=? WHERE userId=?`, time.Now().UTC().Format(time.RFC3339Nano), userID)
	purpose := "mfa"
	if !enabled {
		purpose = "mfa_setup"
	}
	token, err := auth.CreatePreAuthToken(userID, purpose, s.auth.SigningKey, time.Now())
	if err != nil {
		s.oauthFailure(w, r, "github-oauth-failed", "login")
		return
	}
	s.setCSRFCookie(w)
	query := url.Values{"token": {token}}
	if purpose == "mfa" {
		query.Set("mfaToken", token)
		s.clearOAuthState(w)
		http.Redirect(w, r, "/login?"+query.Encode(), http.StatusFound)
	} else {
		s.clearOAuthState(w)
		http.Redirect(w, r, "/setup/mfa?"+query.Encode(), http.StatusFound)
	}
}

func (s *Server) finishGitHubLink(w http.ResponseWriter, r *http.Request, githubID int64, login, accessToken string) {
	principal, err := s.auth.Session(r)
	if err != nil {
		s.oauthFailure(w, r, "github-oauth-failed", "link")
		return
	}
	var linkedUser string
	err = s.store.DB().QueryRowContext(r.Context(), `SELECT userId FROM "GitHubLink" WHERE githubUserId=?`, githubID).Scan(&linkedUser)
	if err == nil && linkedUser != principal.UserID {
		s.oauthFailure(w, r, "github-already-linked", "link")
		return
	}
	encrypted, err := secrets.EncryptIntegrationValue(s.config.EncryptionKey, accessToken)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "GitHub credential encryption is unavailable")
		return
	}
	if err == sql.ErrNoRows {
		_, err = s.store.DB().ExecContext(r.Context(), `INSERT INTO "GitHubLink" (id,userId,githubUserId,githubUsername,accessToken,linkedAt) VALUES (?,?,?,?,?,?)`, newID(), principal.UserID, githubID, login, encrypted, time.Now().UTC().Format(time.RFC3339Nano))
	} else if err == nil {
		_, err = s.store.DB().ExecContext(r.Context(), `UPDATE "GitHubLink" SET githubUsername=?,accessToken=?,linkedAt=?,lastUsedAt=NULL WHERE userId=?`, login, encrypted, time.Now().UTC().Format(time.RFC3339Nano), principal.UserID)
	}
	if err != nil {
		s.oauthFailure(w, r, "github-oauth-failed", "link")
		return
	}
	s.writeAudit(r.Context(), principal.UserID, "github.connected", login, map[string]any{"githubUserId": githubID}, s.clientIP(r))
	s.oauthFailure(w, r, "github-connected", "link")
}

func (s *Server) createOAuthState(mode string) (string, string, error) {
	var nonceBytes [32]byte
	if _, err := rand.Read(nonceBytes[:]); err != nil {
		return "", "", err
	}
	payload, err := json.Marshal(githubOAuthState{Mode: mode, Nonce: fmt.Sprintf("%x", nonceBytes[:]), ExpiresAt: time.Now().Add(10 * time.Minute).UnixMilli()})
	if err != nil {
		return "", "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, s.auth.SigningKey)
	_, _ = mac.Write([]byte(encoded))
	state := encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return state, fmt.Sprintf("%x", nonceBytes[:]), nil
}

func (s *Server) verifyOAuthState(state string) (githubOAuthState, bool) {
	parts := strings.Split(state, ".")
	if len(parts) != 2 {
		return githubOAuthState{}, false
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return githubOAuthState{}, false
	}
	mac := hmac.New(sha256.New, s.auth.SigningKey)
	_, _ = mac.Write([]byte(parts[0]))
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return githubOAuthState{}, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return githubOAuthState{}, false
	}
	var payload githubOAuthState
	if json.Unmarshal(raw, &payload) != nil || (payload.Mode != "link" && payload.Mode != "login" && payload.Mode != "mfa-recovery") || payload.Nonce == "" || payload.ExpiresAt < time.Now().UnixMilli() {
		return githubOAuthState{}, false
	}
	return payload, true
}

func (s *Server) integrationValue(ctx context.Context, key string) (string, error) {
	var value string
	var encrypted bool
	err := s.store.DB().QueryRowContext(ctx, `SELECT value,encrypted FROM "IntegrationSetting" WHERE provider='github' AND key=?`, key).Scan(&value, &encrypted)
	if err != nil {
		return "", err
	}
	if encrypted {
		return secrets.DecryptIntegrationValue(s.config.EncryptionKey, value)
	}
	return value, nil
}

func (s *Server) oauthFailure(w http.ResponseWriter, r *http.Request, toast, mode string) {
	path := "/login"
	if mode == "link" {
		path = "/profile/security"
	}
	s.clearOAuthState(w)
	query := url.Values{"toast": {toast}}
	http.Redirect(w, r, path+"?"+query.Encode(), http.StatusFound)
}

func (s *Server) clearOAuthState(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: "__Host-gh_oauth_state", Value: "", Path: "/", MaxAge: -1, Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	http.SetCookie(w, &http.Cookie{Name: "gh_oauth_state", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
}

func (s *Server) setCSRFCookie(w http.ResponseWriter) {
	var bytes [32]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return
	}
	token := fmt.Sprintf("%x", bytes[:])
	secure := strings.HasPrefix(strings.ToLower(s.config.AppURL.String()), "https://")
	if secure {
		http.SetCookie(w, &http.Cookie{Name: "__Host-lepatch_csrf", Value: token, Path: "/", MaxAge: 7 * 24 * 3600, Secure: true, HttpOnly: false, SameSite: http.SameSiteStrictMode})
	}
	http.SetCookie(w, &http.Cookie{Name: "lepatch_csrf", Value: token, Path: "/", MaxAge: 7 * 24 * 3600, Secure: false, HttpOnly: false, SameSite: http.SameSiteStrictMode})
}

func (s *Server) writeAudit(ctx context.Context, userID, action, target string, metadata any, ip string) {
	var data any
	if metadata != nil {
		if encoded, err := json.Marshal(metadata); err == nil {
			data = string(encoded)
		}
	}
	var ipValue any
	if ip != "" {
		ipValue = ip
	}
	_, err := s.store.DB().ExecContext(ctx, `INSERT INTO "AuditLog" (id,userId,action,target,metadata,ipAddress,createdAt) VALUES (?,?,?,?,?,?,?)`, newID(), userID, action, target, data, ipValue, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		s.logger.Warn("write audit log", "action", action, "error", err.Error())
	}
}

func allowAttempt(store map[string]attemptWindow, mu *sync.Mutex, key string, max int, duration time.Duration) bool {
	now := time.Now()
	mu.Lock()
	defer mu.Unlock()
	for staleKey, stale := range store {
		if !stale.reset.After(now) {
			delete(store, staleKey)
		}
	}
	window := store[key]
	if !window.reset.After(now) {
		window = attemptWindow{reset: now.Add(duration)}
	}
	if window.count >= max {
		store[key] = window
		return false
	}
	window.count++
	store[key] = window
	return true
}

func clearAttempt(store map[string]attemptWindow, mu *sync.Mutex, key string) {
	mu.Lock()
	delete(store, key)
	mu.Unlock()
}

func (s *Server) clientIP(r *http.Request) string {
	if s.config.TrustProxy {
		if forwarded := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-For"), ",")[0]); forwarded != "" {
			return forwarded
		}
		if forwarded := strings.TrimSpace(r.Header.Get("X-Real-IP")); forwarded != "" {
			return forwarded
		}
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}
