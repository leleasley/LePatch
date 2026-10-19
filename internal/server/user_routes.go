package server

import (
	"database/sql"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
	"lepatch/internal/auth"
)

func (s *Server) adminOnly(w http.ResponseWriter, r *http.Request) (auth.Principal, bool) {
	p, ok := auth.PrincipalFromContext(r.Context())
	if !ok || p.Role != "administrator" {
		writeError(w, http.StatusForbidden, "Administrator access required")
		return auth.Principal{}, false
	}
	return p, true
}

func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.adminOnly(w, r); !ok {
		return
	}
	page, perPage := queryInt(r, "page", 1, 1, 1_000_000), queryInt(r, "perPage", 50, 1, 200)
	var total int
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT count(*) FROM "User"`).Scan(&total); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load users")
		return
	}
	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT u.id,u.name,u.email,u.role,u.theme,u.passwordEnabled,u.totpEnabled,u.createdAt,u.updatedAt,
		(SELECT count(*) FROM "WatchedApp" a WHERE a.userId = u.id) AS watchedApps,
		(SELECT count(*) FROM "Session" ss WHERE ss.userId = u.id AND ss.expiresAt > datetime('now')) AS activeSessions
		FROM "User" u ORDER BY u.createdAt DESC LIMIT ? OFFSET ?`, perPage, (page-1)*perPage)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load users")
		return
	}
	defer rows.Close()
	type user struct {
		ID              string `json:"id"`
		Name            string `json:"name"`
		Email           string `json:"email"`
		Role            string `json:"role"`
		Theme           string `json:"theme"`
		PasswordEnabled bool   `json:"passwordEnabled"`
		MFAEnabled      bool   `json:"mfaEnabled"`
		CreatedAt       string `json:"createdAt"`
		UpdatedAt       string `json:"updatedAt"`
		WatchedApps     int    `json:"watchedApps"`
		ActiveSessions  int    `json:"activeSessions"`
	}
	users := make([]user, 0, perPage)
	for rows.Next() {
		var u user
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.Theme, &u.PasswordEnabled, &u.MFAEnabled, &u.CreatedAt, &u.UpdatedAt, &u.WatchedApps, &u.ActiveSessions); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read users")
			return
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not read users")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users, "total": total, "page": page, "perPage": perPage})
}

func (s *Server) createUser(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.adminOnly(w, r)
	if !ok {
		return
	}
	var input struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Name, input.Email, input.Role = strings.TrimSpace(input.Name), strings.ToLower(strings.TrimSpace(input.Email)), strings.TrimSpace(input.Role)
	if input.Name == "" || len(input.Name) > 120 || !validEmail(input.Email) || len(input.Password) < 10 || len(input.Password) > 1024 {
		writeError(w, http.StatusBadRequest, "Name, valid email, and a password of at least 10 characters are required")
		return
	}
	if !validRole(input.Role) {
		writeError(w, http.StatusBadRequest, "Invalid user role")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), 12)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not secure password")
		return
	}
	now, id := time.Now().UTC().Format(time.RFC3339Nano), newID()
	_, err = s.store.DB().ExecContext(r.Context(), `INSERT INTO "User" (id,name,email,passwordHash,passwordEnabled,role,theme,createdAt,updatedAt) VALUES (?,?,?,?,1,?,'midnight',?,?)`, id, input.Name, input.Email, string(hash), input.Role, now, now)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeError(w, http.StatusConflict, "A user with that email already exists")
		} else {
			writeError(w, http.StatusInternalServerError, "Could not create user")
		}
		return
	}
	s.writeAudit(r.Context(), actor.UserID, "user.created", input.Email, map[string]string{"userId": id, "role": input.Role}, s.clientIP(r))
	writeJSON(w, http.StatusCreated, map[string]any{"user": map[string]string{"id": id, "name": input.Name, "email": input.Email, "role": input.Role}})
}

func (s *Server) updateUser(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.adminOnly(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	var input struct {
		Name  *string `json:"name"`
		Email *string `json:"email"`
		Role  *string `json:"role"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	var name, email, role string
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT name,email,role FROM "User" WHERE id=?`, id).Scan(&name, &email, &role); err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "User not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load user")
		return
	}
	originalRole := role
	if input.Name != nil {
		name = strings.TrimSpace(*input.Name)
		if name == "" || len(name) > 120 {
			writeError(w, http.StatusBadRequest, "Name must contain 1 to 120 characters")
			return
		}
	}
	if input.Email != nil {
		email = strings.ToLower(strings.TrimSpace(*input.Email))
		if !validEmail(email) {
			writeError(w, http.StatusBadRequest, "Enter a valid email address")
			return
		}
	}
	if input.Role != nil {
		role = strings.TrimSpace(*input.Role)
		if !validRole(role) {
			writeError(w, http.StatusBadRequest, "Invalid user role")
			return
		}
	}
	if id == actor.UserID && role != "administrator" {
		writeError(w, http.StatusBadRequest, "You cannot remove your own administrator role")
		return
	}
	if originalRole == "administrator" && role != "administrator" {
		var admins int
		if err := s.store.DB().QueryRowContext(r.Context(), `SELECT count(*) FROM "User" WHERE role='administrator'`).Scan(&admins); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not validate administrator count")
			return
		}
		if admins <= 1 {
			writeError(w, http.StatusBadRequest, "At least one administrator must remain")
			return
		}
	}
	_, err := s.store.DB().ExecContext(r.Context(), `UPDATE "User" SET name=?,email=?,role=?,updatedAt=? WHERE id=?`, name, email, role, time.Now().UTC().Format(time.RFC3339Nano), id)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeError(w, http.StatusConflict, "A user with that email already exists")
		} else {
			writeError(w, http.StatusInternalServerError, "Could not update user")
		}
		return
	}
	s.writeAudit(r.Context(), actor.UserID, "user.updated", email, map[string]string{"userId": id, "role": role}, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) resetUserPassword(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.adminOnly(w, r)
	if !ok {
		return
	}
	var input struct {
		Password      string `json:"password"`
		AdminPassword string `json:"adminPassword"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if len(input.Password) < 10 || len(input.Password) > 1024 {
		writeError(w, http.StatusBadRequest, "Password must contain at least 10 characters")
		return
	}
	id := chi.URLParam(r, "id")
	var adminHash string
	var passwordEnabled bool
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT passwordHash,passwordEnabled FROM "User" WHERE id=?`, actor.UserID).Scan(&adminHash, &passwordEnabled); err != nil || !passwordEnabled || bcrypt.CompareHashAndPassword([]byte(adminHash), []byte(input.AdminPassword)) != nil {
		writeError(w, http.StatusForbidden, "Administrator password is incorrect")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), 12)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not secure password")
		return
	}
	tx, err := s.store.DB().BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not reset password")
		return
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(r.Context(), `UPDATE "User" SET passwordHash=?,passwordEnabled=1,updatedAt=? WHERE id=?`, string(hash), time.Now().UTC().Format(time.RFC3339Nano), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not reset password")
		return
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `DELETE FROM "Session" WHERE userId=?`, id); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not revoke user sessions")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `DELETE FROM "TrustedDevice" WHERE userId=?`, id); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not revoke trusted devices")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not reset password")
		return
	}
	s.writeAudit(r.Context(), actor.UserID, "user.password_reset", id, nil, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) deleteUser(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.adminOnly(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if id == actor.UserID {
		writeError(w, http.StatusBadRequest, "You cannot delete your own account")
		return
	}
	var role string
	err := s.store.DB().QueryRowContext(r.Context(), `SELECT role FROM "User" WHERE id=?`, id).Scan(&role)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load user")
		return
	}
	if role == "administrator" {
		var admins int
		if err := s.store.DB().QueryRowContext(r.Context(), `SELECT count(*) FROM "User" WHERE role='administrator'`).Scan(&admins); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not validate administrator count")
			return
		}
		if admins <= 1 {
			writeError(w, http.StatusBadRequest, "At least one administrator must remain")
			return
		}
	}
	if _, err := s.store.DB().ExecContext(r.Context(), `DELETE FROM "User" WHERE id=?`, id); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not delete user")
		return
	}
	s.writeAudit(r.Context(), actor.UserID, "user.deleted", id, nil, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func validEmail(value string) bool {
	parsed, err := mail.ParseAddress(value)
	return err == nil && parsed.Address == value
}
func validRole(value string) bool {
	return value == "administrator" || value == "moderator" || value == "user" || value == "restricted"
}
