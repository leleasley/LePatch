package server

import (
	"crypto/rand"
	"encoding/base32"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"time"

	"lepatch/internal/auth"
)

func (s *Server) startMFASetup(w http.ResponseWriter, r *http.Request) {
	if !s.auth.ValidateCSRF(r) {
		writeError(w, http.StatusForbidden, "Invalid CSRF token")
		return
	}
	var input struct {
		SetupToken string `json:"setupToken"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	claims, valid := auth.VerifyPreAuthToken(input.SetupToken, s.auth.SigningKey, time.Now())
	if !valid || claims.Purpose != "mfa_setup" {
		writeError(w, http.StatusUnauthorized, "Invalid or expired setup token")
		return
	}
	var email string
	var enabled bool
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT email,totpEnabled FROM "User" WHERE id=?`, claims.UserID).Scan(&email, &enabled); err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if enabled {
		writeError(w, http.StatusBadRequest, "MFA is already enabled")
		return
	}
	var secretBytes [20]byte
	if _, err := rand.Read(secretBytes[:]); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create MFA secret")
		return
	}
	secret := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(secretBytes[:])
	if _, err := s.store.DB().ExecContext(r.Context(), `UPDATE "User" SET totpSecret=?,totpEnabled=0,updatedAt=? WHERE id=?`, secret, time.Now().UTC().Format(time.RFC3339Nano), claims.UserID); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not save MFA setup")
		return
	}
	issuer := s.config.AppURL.Hostname()
	if issuer == "" {
		issuer = "LePatch"
	}
	label := url.PathEscape(issuer + ":" + email)
	query := url.Values{"secret": {secret}, "issuer": {issuer}, "algorithm": {"SHA1"}, "digits": {"6"}, "period": {"30"}}
	writeJSON(w, http.StatusOK, map[string]string{"secret": secret, "issuer": issuer, "otpauthUrl": "otpauth://totp/" + label + "?" + query.Encode()})
}

func (s *Server) finishMFASetup(w http.ResponseWriter, r *http.Request) {
	if !s.auth.ValidateCSRF(r) {
		writeError(w, http.StatusForbidden, "Invalid CSRF token")
		return
	}
	var input struct {
		SetupToken string `json:"setupToken"`
		Code       string `json:"code"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	claims, valid := auth.VerifyPreAuthToken(input.SetupToken, s.auth.SigningKey, time.Now())
	if !valid || claims.Purpose != "mfa_setup" {
		writeError(w, http.StatusUnauthorized, "Invalid or expired setup token")
		return
	}
	var secret string
	var enabled bool
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT totpSecret,totpEnabled FROM "User" WHERE id=?`, claims.UserID).Scan(&secret, &enabled); err != nil {
		writeError(w, http.StatusBadRequest, "Start MFA setup again")
		return
	}
	if enabled {
		writeError(w, http.StatusBadRequest, "MFA is already enabled")
		return
	}
	if !auth.VerifyTOTP(secret, input.Code, time.Now()) {
		writeError(w, http.StatusBadRequest, "Invalid verification code")
		return
	}
	codes := make([]string, 10)
	hashes := make([]string, 10)
	for i := range codes {
		code, err := randomRecoveryCode(8)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Could not create recovery codes")
			return
		}
		codes[i] = code
		hashes[i] = auth.HashRecoveryCode(code)
	}
	encoded, err := json.Marshal(hashes)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not save recovery codes")
		return
	}
	if _, err := s.store.DB().ExecContext(r.Context(), `UPDATE "User" SET totpEnabled=1,totpBackupCodes=?,updatedAt=? WHERE id=?`, string(encoded), time.Now().UTC().Format(time.RFC3339Nano), claims.UserID); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not enable MFA")
		return
	}
	s.writeAudit(r.Context(), claims.UserID, "mfa.setup", "totp", nil, s.clientIP(r))
	token, age, err := s.auth.CreateSession(r.Context(), claims.UserID, r.UserAgent(), s.clientIP(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "MFA enabled but could not create session")
		return
	}
	s.auth.SetSessionCookies(w, token, age)
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "backupCodes": codes})
}

func randomRecoveryCode(length int) (string, error) {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	var result strings.Builder
	for i := 0; i < length; i++ {
		index, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			return "", fmt.Errorf("generate recovery code")
		}
		result.WriteByte(alphabet[index.Int64()])
	}
	return result.String(), nil
}
