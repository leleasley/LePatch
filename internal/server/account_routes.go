package server

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"lepatch/internal/auth"
)

func (s *Server) accountInfo(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	var user struct {
		ID              string `json:"id"`
		Name            string `json:"name"`
		Email           string `json:"email"`
		Role            string `json:"role"`
		Theme           string `json:"theme"`
		PasswordEnabled bool   `json:"passwordEnabled"`
		MFAEnabled      bool   `json:"mfaEnabled"`
	}
	err := s.store.DB().QueryRowContext(r.Context(), `SELECT id,name,email,role,theme,passwordEnabled,totpEnabled FROM "User" WHERE id=?`, p.UserID).Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.Theme, &user.PasswordEnabled, &user.MFAEnabled)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

// accountThemes lists the appearance identifiers the interface understands.
// The value is stored on the user record so the choice follows the account
// across devices and browsers.
var accountThemes = map[string]bool{
	"dark":     true,
	"light":    true,
	"midnight": true,
	"oled":     true,
}

// updateAccount stores the profile fields a user is allowed to change for
// themselves. Roles, passwords and MFA state are never writable here.
func (s *Server) updateAccount(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	var input struct {
		Name  *string `json:"name"`
		Theme *string `json:"theme"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	sets := []string{}
	args := []any{}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			writeError(w, http.StatusBadRequest, "Name must not be empty")
			return
		}
		if len(name) > 80 {
			writeError(w, http.StatusBadRequest, "Name must be 80 characters or fewer")
			return
		}
		sets = append(sets, `"name" = ?`)
		args = append(args, name)
	}
	if input.Theme != nil {
		theme := strings.ToLower(strings.TrimSpace(*input.Theme))
		if !accountThemes[theme] {
			writeError(w, http.StatusBadRequest, "Unknown appearance")
			return
		}
		sets = append(sets, `"theme" = ?`)
		args = append(args, theme)
	}
	if len(sets) == 0 {
		writeError(w, http.StatusBadRequest, "No account changes were provided")
		return
	}
	sets = append(sets, `"updatedAt" = ?`)
	args = append(args, time.Now().UTC().Format(time.RFC3339Nano), p.UserID)
	if _, err := s.store.DB().ExecContext(r.Context(), `UPDATE "User" SET `+strings.Join(sets, ", ")+` WHERE id = ?`, args...); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not update account")
		return
	}
	var user struct {
		ID              string `json:"id"`
		Name            string `json:"name"`
		Email           string `json:"email"`
		Role            string `json:"role"`
		Theme           string `json:"theme"`
		PasswordEnabled bool   `json:"passwordEnabled"`
		MFAEnabled      bool   `json:"mfaEnabled"`
	}
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT id,name,email,role,theme,passwordEnabled,totpEnabled FROM "User" WHERE id=?`, p.UserID).Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.Theme, &user.PasswordEnabled, &user.MFAEnabled); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load account")
		return
	}
	s.writeAudit(r.Context(), p.UserID, "user.updated", "profile", nil, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	var input struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if len(input.NewPassword) < 10 || len(input.NewPassword) > 1024 {
		writeError(w, http.StatusBadRequest, "Password must contain at least 10 characters")
		return
	}
	var hash string
	var enabled bool
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT passwordHash,passwordEnabled FROM "User" WHERE id=?`, p.UserID).Scan(&hash, &enabled); err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if !enabled || bcrypt.CompareHashAndPassword([]byte(hash), []byte(input.CurrentPassword)) != nil {
		writeError(w, http.StatusBadRequest, "Current password is incorrect")
		return
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(input.NewPassword), 12)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not secure the new password")
		return
	}
	if _, err := s.store.DB().ExecContext(r.Context(), `UPDATE "User" SET passwordHash=?,updatedAt=? WHERE id=?`, string(newHash), time.Now().UTC().Format(time.RFC3339Nano), p.UserID); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not update password")
		return
	}
	s.writeAudit(r.Context(), p.UserID, "user.updated", "password", nil, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) mfaInfo(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	var enabled bool
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT totpEnabled FROM "User" WHERE id=?`, p.UserID).Scan(&enabled); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load MFA status")
		return
	}
	var codes []string
	if enabled {
		var serialized string
		if err := s.store.DB().QueryRowContext(r.Context(), `SELECT totpBackupCodes FROM "User" WHERE id=?`, p.UserID).Scan(&serialized); err == nil {
			_ = json.Unmarshal([]byte(serialized), &codes)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"enabled": enabled, "recoveryCodesRemaining": len(codes)})
}

func (s *Server) disableMFA(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	var input struct {
		Code     string `json:"code"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	var secret, hash, codes string
	var enabled, passwordEnabled bool
	err := s.store.DB().QueryRowContext(r.Context(), `SELECT totpSecret,totpEnabled,passwordHash,passwordEnabled,totpBackupCodes FROM "User" WHERE id=?`, p.UserID).Scan(&secret, &enabled, &hash, &passwordEnabled, &codes)
	if err != nil || !enabled {
		writeError(w, http.StatusBadRequest, "MFA is not enabled")
		return
	}
	verified := auth.VerifyTOTP(secret, input.Code, time.Now())
	if !verified && input.Code != "" {
		remaining, ok := auth.ConsumeRecoveryCode(input.Code, codes)
		if ok {
			verified = true
			codes = remaining
		}
	}
	if !verified && passwordEnabled && input.Password != "" && bcrypt.CompareHashAndPassword([]byte(hash), []byte(input.Password)) == nil {
		verified = true
	}
	if !verified {
		writeError(w, http.StatusBadRequest, "Enter a valid authenticator or recovery code")
		return
	}
	if _, err := s.store.DB().ExecContext(r.Context(), `UPDATE "User" SET totpSecret=NULL,totpEnabled=0,totpBackupCodes='[]',updatedAt=? WHERE id=?`, time.Now().UTC().Format(time.RFC3339Nano), p.UserID); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not disable MFA")
		return
	}
	s.writeAudit(r.Context(), p.UserID, "mfa.disabled", "totp", nil, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) githubAccountInfo(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	var login string
	err := s.store.DB().QueryRowContext(r.Context(), `SELECT githubUsername FROM "GitHubLink" WHERE userId=?`, p.UserID).Scan(&login)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusOK, map[string]any{"connected": false})
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load GitHub link")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"connected": true, "username": login})
}

func (s *Server) unlinkGitHub(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	result, err := s.store.DB().ExecContext(r.Context(), `DELETE FROM "GitHubLink" WHERE userId=?`, p.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not disconnect GitHub")
		return
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		writeError(w, http.StatusNotFound, "GitHub account is not connected")
		return
	}
	s.writeAudit(r.Context(), p.UserID, "github.disconnected", "GitHub", nil, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type notificationPreference struct {
	Enabled         bool            `json:"enabled"`
	DigestInterval  *int            `json:"digestInterval"`
	QuietHoursStart *string         `json:"quietHoursStart"`
	QuietHoursEnd   *string         `json:"quietHoursEnd"`
	Timezone        string          `json:"timezone"`
	SeverityFilters json.RawMessage `json:"severityFilters"`
	IssueComments   bool            `json:"issueComments"`
}

func (s *Server) notificationPreferences(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	var value notificationPreference
	var digest sql.NullInt64
	var start, end, severity sql.NullString
	err := s.store.DB().QueryRowContext(r.Context(), `SELECT enabled,digestInterval,quietHoursStart,quietHoursEnd,timezone,severityFilters,issueComments FROM "NotificationPreference" WHERE userId=?`, p.UserID).Scan(&value.Enabled, &digest, &start, &end, &value.Timezone, &severity, &value.IssueComments)
	if err == sql.ErrNoRows {
		value.Enabled = true
		value.Timezone = "UTC"
		value.IssueComments = true
		value.SeverityFilters = json.RawMessage(`[]`)
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load notification preferences")
		return
	} else {
		if digest.Valid {
			v := int(digest.Int64)
			value.DigestInterval = &v
		}
		if start.Valid {
			value.QuietHoursStart = &start.String
		}
		if end.Valid {
			value.QuietHoursEnd = &end.String
		}
		if severity.Valid && json.Valid([]byte(severity.String)) {
			value.SeverityFilters = json.RawMessage(severity.String)
		} else {
			value.SeverityFilters = json.RawMessage(`[]`)
		}
	}
	writeJSON(w, http.StatusOK, value)
}

func (s *Server) updateNotificationPreferences(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	var input notificationPreference
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Timezone == "" {
		input.Timezone = "UTC"
	}
	if _, err := time.LoadLocation(input.Timezone); err != nil {
		writeError(w, http.StatusBadRequest, "Unknown time zone")
		return
	}
	if input.DigestInterval != nil && (*input.DigestInterval < 0 || *input.DigestInterval > 10080) {
		writeError(w, http.StatusBadRequest, "Digest interval is out of range")
		return
	}
	if len(input.SeverityFilters) == 0 || !json.Valid(input.SeverityFilters) {
		input.SeverityFilters = json.RawMessage(`[]`)
	}
	var digest any
	if input.DigestInterval != nil {
		digest = *input.DigestInterval
	}
	var start, end any
	if input.QuietHoursStart != nil {
		start = *input.QuietHoursStart
	}
	if input.QuietHoursEnd != nil {
		end = *input.QuietHoursEnd
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err := s.store.DB().ExecContext(r.Context(), `INSERT INTO "NotificationPreference" (id,userId,enabled,digestInterval,quietHoursStart,quietHoursEnd,timezone,severityFilters,issueComments,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(userId) DO UPDATE SET enabled=excluded.enabled,digestInterval=excluded.digestInterval,quietHoursStart=excluded.quietHoursStart,quietHoursEnd=excluded.quietHoursEnd,timezone=excluded.timezone,severityFilters=excluded.severityFilters,issueComments=excluded.issueComments,updatedAt=excluded.updatedAt`, newID(), p.UserID, input.Enabled, digest, start, end, input.Timezone, string(input.SeverityFilters), input.IssueComments, now, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not save notification preferences")
		return
	}
	s.writeAudit(r.Context(), p.UserID, "settings.updated", "notification-preferences", nil, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) trustedDevices(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT id,name,expiresAt,createdAt FROM "TrustedDevice" WHERE userId=? AND expiresAt>? ORDER BY createdAt DESC`, p.UserID, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load trusted devices")
		return
	}
	defer rows.Close()
	type item struct {
		ID        string  `json:"id"`
		Name      *string `json:"name"`
		ExpiresAt string  `json:"expiresAt"`
		CreatedAt string  `json:"createdAt"`
	}
	items := make([]item, 0)
	for rows.Next() {
		var v item
		if err := rows.Scan(&v.ID, &v.Name, &v.ExpiresAt, &v.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read trusted devices")
			return
		}
		items = append(items, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"devices": items})
}
func (s *Server) revokeTrustedDevice(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	var input struct {
		ID string `json:"id"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	result, err := s.store.DB().ExecContext(r.Context(), `DELETE FROM "TrustedDevice" WHERE id=? AND userId=?`, input.ID, p.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not revoke trusted device")
		return
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		writeError(w, http.StatusNotFound, "Trusted device not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) passkeys(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT id,deviceName,transports,createdAt,lastUsedAt FROM "PasskeyCredential" WHERE userId=? ORDER BY createdAt DESC`, p.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load passkeys")
		return
	}
	defer rows.Close()
	type item struct {
		ID         string  `json:"id"`
		DeviceName *string `json:"deviceName"`
		Transports string  `json:"transports"`
		CreatedAt  string  `json:"createdAt"`
		LastUsedAt *string `json:"lastUsedAt"`
	}
	items := make([]item, 0)
	for rows.Next() {
		var v item
		if err := rows.Scan(&v.ID, &v.DeviceName, &v.Transports, &v.CreatedAt, &v.LastUsedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read passkeys")
			return
		}
		items = append(items, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"credentials": items})
}
func (s *Server) deletePasskey(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	var input struct {
		ID string `json:"id"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	result, err := s.store.DB().ExecContext(r.Context(), `DELETE FROM "PasskeyCredential" WHERE id=? AND userId=?`, input.ID, p.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not remove passkey")
		return
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		writeError(w, http.StatusNotFound, "Passkey not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) sessions(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT id,userAgent,ipAddress,deviceName,createdAt,lastUsedAt,expiresAt FROM "Session" WHERE userId=? ORDER BY lastUsedAt DESC LIMIT 100`, p.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load sessions")
		return
	}
	defer rows.Close()
	type item struct {
		ID         string  `json:"id"`
		UserAgent  *string `json:"userAgent"`
		IPAddress  *string `json:"ipAddress"`
		DeviceName *string `json:"deviceName"`
		CreatedAt  string  `json:"createdAt"`
		LastUsedAt *string `json:"lastUsedAt"`
		ExpiresAt  string  `json:"expiresAt"`
		Current    bool    `json:"current"`
	}
	items := make([]item, 0)
	for rows.Next() {
		var v item
		if err := rows.Scan(&v.ID, &v.UserAgent, &v.IPAddress, &v.DeviceName, &v.CreatedAt, &v.LastUsedAt, &v.ExpiresAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read sessions")
			return
		}
		v.Current = v.ID == p.SessionID
		items = append(items, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": items})
}
func (s *Server) revokeOtherSessions(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFromContext(r.Context())
	result, err := s.store.DB().ExecContext(r.Context(), `DELETE FROM "Session" WHERE userId=? AND id<>?`, p.UserID, p.SessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not revoke sessions")
		return
	}
	count, _ := result.RowsAffected()
	writeJSON(w, http.StatusOK, map[string]int64{"revoked": count})
}
