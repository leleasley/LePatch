package server

import (
	"net/http"
	"net/mail"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func (s *Server) setupStatus(w http.ResponseWriter, r *http.Request) {
	var count int
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT count(*) FROM "User"`).Scan(&count); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not read first run status")
		return
	}
	if count == 0 {
		s.setCSRFCookie(w)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"setupComplete": count > 0})
}

func (s *Server) completeSetup(w http.ResponseWriter, r *http.Request) {
	if !s.auth.ValidateCSRF(r) {
		writeError(w, http.StatusForbidden, "Invalid CSRF token")
		return
	}
	if !allowAttempt(loginAttempts, &loginAttemptsMu, "setup:"+s.clientIP(r), 10, time.Minute) {
		writeError(w, http.StatusTooManyRequests, "Too many setup attempts. Try again later.")
		return
	}
	var input struct {
		Email           string `json:"email"`
		Password        string `json:"password"`
		ConfirmPassword string `json:"confirmPassword"`
		AppURL          string `json:"appUrl"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	parsed, err := mail.ParseAddress(input.Email)
	if err != nil || parsed.Address != input.Email {
		writeError(w, http.StatusBadRequest, "Enter a valid email address")
		return
	}
	if len(input.Password) < 10 || len(input.Password) > 1024 || input.Password != input.ConfirmPassword {
		writeError(w, http.StatusBadRequest, "Passwords must match and contain at least 10 characters")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), 12)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not secure the administrator password")
		return
	}
	result, err := s.store.DB().ExecContext(r.Context(), `INSERT INTO "User" (id,name,email,passwordHash,passwordEnabled,role,theme,totpEnabled,totpBackupCodes,createdAt,updatedAt)
		SELECT ?,?,?,?,?, 'administrator','dark',0,'[]',?,? WHERE NOT EXISTS (SELECT 1 FROM "User")`, newID(), "Admin", input.Email, string(hash), true, time.Now().UTC().Format(time.RFC3339Nano), time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		writeError(w, http.StatusConflict, "Setup is already complete or the email is already used")
		return
	}
	created, _ := result.RowsAffected()
	if created == 0 {
		writeError(w, http.StatusConflict, "Setup is already complete")
		return
	}
	appURL := strings.TrimSpace(input.AppURL)
	if appURL == "" {
		appURL = s.config.AppURL.String()
	}
	if _, err := s.store.DB().ExecContext(r.Context(), `INSERT INTO "SystemSetting" (id,key,value,encrypted,createdAt,updatedAt) VALUES (?,'appUrl',?,0,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt`, newID(), appURL, time.Now().UTC().Format(time.RFC3339Nano), time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		s.logger.Warn("save initial app URL", "error", err.Error())
	}
	writeJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}
