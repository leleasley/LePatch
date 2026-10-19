package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Principal struct {
	UserID    string `json:"userId"`
	Role      string `json:"role"`
	SessionID string `json:"-"`
}

type SessionAuth struct {
	DB         *sql.DB
	SigningKey []byte
	AppURL     string
	TrustProxy bool
	Now        func() time.Time
}

type tokenClaims struct {
	Subject string `json:"sub"`
	Session string `json:"jti"`
	Expires int64  `json:"exp"`
	Issued  int64  `json:"iat"`
}

type principalKey struct{}

func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	principal, ok := ctx.Value(principalKey{}).(Principal)
	return principal, ok
}

func (a *SessionAuth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		principal, err := a.Session(r)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), principalKey{}, principal)))
	})
}

func (a *SessionAuth) Session(r *http.Request) (Principal, error) {
	if a.DB == nil || len(a.SigningKey) == 0 {
		return Principal{}, errors.New("session auth is not configured")
	}
	token := cookieValue(r, "__Host-lepatch_session")
	if token == "" {
		token = cookieValue(r, "lepatch_session")
	}
	claims, err := verifyJWT(token, a.SigningKey)
	if err != nil {
		return Principal{}, err
	}
	now := time.Now()
	if a.Now != nil {
		now = a.Now()
	}
	if claims.Expires <= now.Unix() {
		return Principal{}, errors.New("session token expired")
	}

	var createdAtText, role string
	var userID string
	var lastUsedAt, expiresAt sql.NullString
	err = a.DB.QueryRowContext(r.Context(), `
		SELECT s.createdAt, u.role, u.id, s.lastUsedAt, s.expiresAt
		FROM "Session" s JOIN "User" u ON u.id = s.userId
		WHERE s.id = ? AND s.userId = ?`, claims.Session, claims.Subject).Scan(&createdAtText, &role, &userID, &lastUsedAt, &expiresAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Principal{}, errors.New("session not found")
		}
		return Principal{}, fmt.Errorf("load session: %w", err)
	}
	createdAt, err := parseDatabaseTime(createdAtText)
	if err != nil {
		return Principal{}, fmt.Errorf("parse session creation time: %w", err)
	}
	duration := a.sessionDuration(r.Context())
	if createdAt.Add(duration).Before(now) {
		_, _ = a.DB.ExecContext(r.Context(), `DELETE FROM "Session" WHERE id = ?`, claims.Session)
		return Principal{}, errors.New("session expired")
	}
	absoluteExpiry := createdAt.Add(duration)
	lastUsed, lastUsedErr := parseDatabaseTime(lastUsedAt.String)
	storedExpiry, expiryErr := parseDatabaseTime(expiresAt.String)
	if !lastUsedAt.Valid || lastUsedErr != nil || now.Sub(lastUsed) > 5*time.Minute || expiryErr != nil || storedExpiry.Sub(absoluteExpiry) > time.Second || absoluteExpiry.Sub(storedExpiry) > time.Second {
		_, _ = a.DB.ExecContext(r.Context(), `UPDATE "Session" SET lastUsedAt = ?, expiresAt = ? WHERE id = ?`, now.UTC().Format(time.RFC3339Nano), absoluteExpiry.UTC().Format(time.RFC3339Nano), claims.Session)
	}
	return Principal{UserID: userID, Role: role, SessionID: claims.Session}, nil
}

func (a *SessionAuth) sessionDuration(ctx context.Context) time.Duration {
	var raw string
	if err := a.DB.QueryRowContext(ctx, `SELECT value FROM "SystemSetting" WHERE key = 'sessionDurationHours'`).Scan(&raw); err != nil {
		return 24 * time.Hour
	}
	hours, err := strconv.Atoi(raw)
	if err != nil {
		return 24 * time.Hour
	}
	if hours < 1 {
		hours = 1
	} else if hours > 168 {
		hours = 168
	}
	return time.Duration(hours) * time.Hour
}

func (a *SessionAuth) CreateSession(ctx context.Context, userID, userAgent, ipAddress string) (string, int, error) {
	now := time.Now()
	if a.Now != nil {
		now = a.Now()
	}
	duration := a.sessionDuration(ctx)
	idBytes := make([]byte, 16)
	if _, err := rand.Read(idBytes); err != nil {
		return "", 0, fmt.Errorf("generate session id: %w", err)
	}
	secretBytes := make([]byte, 32)
	if _, err := rand.Read(secretBytes); err != nil {
		return "", 0, fmt.Errorf("generate session secret: %w", err)
	}
	sessionID := hex.EncodeToString(idBytes)
	tokenHash := hex.EncodeToString(secretBytes)
	expiresAt := now.Add(duration).UTC().Format(time.RFC3339Nano)
	if _, err := a.DB.ExecContext(ctx, `INSERT INTO "Session" (id, userId, tokenHash, expiresAt, lastUsedAt, userAgent, ipAddress, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		sessionID, userID, tokenHash, expiresAt, now.UTC().Format(time.RFC3339Nano), nullableString(userAgent), nullableString(ipAddress), now.UTC().Format(time.RFC3339Nano)); err != nil {
		return "", 0, fmt.Errorf("create session record: %w", err)
	}
	claims := tokenClaims{Subject: userID, Session: sessionID, Issued: now.Unix(), Expires: now.Add(duration).Unix()}
	token, err := signJWT(claims, a.SigningKey)
	if err != nil {
		_, _ = a.DB.ExecContext(ctx, `DELETE FROM "Session" WHERE id = ?`, sessionID)
		return "", 0, err
	}
	return token, int(duration.Seconds()), nil
}

func (a *SessionAuth) SetSessionCookies(w http.ResponseWriter, token string, maxAge int) {
	secureURL := strings.HasPrefix(strings.ToLower(a.AppURL), "https://")
	setCookie(w, "__Host-lepatch_session", token, maxAge, true, true, http.SameSiteLaxMode)
	if !secureURL {
		setCookie(w, "lepatch_session", token, maxAge, false, true, http.SameSiteLaxMode)
	} else {
		setCookie(w, "lepatch_session", "", 0, false, true, http.SameSiteLaxMode)
	}
	csrfBytes := make([]byte, 32)
	if _, err := rand.Read(csrfBytes); err == nil {
		csrf := hex.EncodeToString(csrfBytes)
		setCookie(w, "__Host-lepatch_csrf", csrf, 7*24*60*60, true, false, http.SameSiteStrictMode)
		setCookie(w, "lepatch_csrf", csrf, 7*24*60*60, false, false, http.SameSiteStrictMode)
	}
}

func (a *SessionAuth) ClearSessionCookies(w http.ResponseWriter) {
	setCookie(w, "__Host-lepatch_session", "", 0, true, true, http.SameSiteLaxMode)
	setCookie(w, "lepatch_session", "", 0, false, true, http.SameSiteLaxMode)
	setCookie(w, "__Host-lepatch_csrf", "", 0, true, false, http.SameSiteStrictMode)
	setCookie(w, "lepatch_csrf", "", 0, false, false, http.SameSiteStrictMode)
}

func (a *SessionAuth) ValidateCSRF(r *http.Request) bool {
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	}
	header := r.Header.Get("X-CSRF-Token")
	if header == "" {
		return false
	}
	preferred, alternate := "lepatch_csrf", "__Host-lepatch_csrf"
	if a.TrustProxy || strings.HasPrefix(strings.ToLower(a.AppURL), "https://") {
		preferred, alternate = alternate, preferred
	}
	cookie := cookieValue(r, preferred)
	if cookie == "" {
		cookie = cookieValue(r, alternate)
	}
	return cookie != "" && hmac.Equal([]byte(header), []byte(cookie))
}

func verifyJWT(token string, key []byte) (tokenClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return tokenClaims{}, errors.New("invalid session token")
	}
	var header struct {
		Algorithm string `json:"alg"`
	}
	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || json.Unmarshal(headerBytes, &header) != nil || header.Algorithm != "HS256" {
		return tokenClaims{}, errors.New("invalid session token header")
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return tokenClaims{}, errors.New("invalid session token signature")
	}
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(parts[0] + "." + parts[1]))
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return tokenClaims{}, errors.New("invalid session token signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return tokenClaims{}, errors.New("invalid session token payload")
	}
	var claims tokenClaims
	if err := json.Unmarshal(payload, &claims); err != nil || claims.Subject == "" || claims.Session == "" || claims.Expires == 0 {
		return tokenClaims{}, errors.New("invalid session token claims")
	}
	return claims, nil
}

func signJWT(claims tokenClaims, key []byte) (string, error) {
	header, err := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
	if err != nil {
		return "", fmt.Errorf("encode session header: %w", err)
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("encode session claims: %w", err)
	}
	unsigned := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(unsigned))
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func parseDatabaseTime(value string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02 15:04:05.999999999-07:00", "2006-01-02 15:04:05.999999999", "2006-01-02 15:04:05"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed.UTC(), nil
		}
	}
	return time.Time{}, fmt.Errorf("unrecognized timestamp format")
}

func RequireRole(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(roles))
	for _, role := range roles {
		allowed[role] = struct{}{}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			principal, ok := PrincipalFromContext(r.Context())
			if !ok {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
				return
			}
			if _, ok := allowed[principal.Role]; !ok {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden"})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func cookieValue(r *http.Request, name string) string {
	cookie, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func setCookie(w http.ResponseWriter, name, value string, maxAge int, secure, httpOnly bool, sameSite http.SameSite) {
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: value, Path: "/", MaxAge: maxAge,
		Secure: secure, HttpOnly: httpOnly, SameSite: sameSite,
	})
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
