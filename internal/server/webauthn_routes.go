package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"lepatch/internal/auth"
)

type ceremonyPurpose string

const (
	ceremonyRegistration   ceremonyPurpose = "registration"
	ceremonyAuthentication ceremonyPurpose = "authentication"
)

type webauthnCeremony struct {
	UserID  string               `json:"userId"`
	Purpose ceremonyPurpose      `json:"purpose"`
	Session webauthn.SessionData `json:"session"`
	Expires time.Time            `json:"expires"`
}

type passkeyUser struct {
	id, name, email string
	credentials     []webauthn.Credential
}

func (u *passkeyUser) WebAuthnID() []byte   { return []byte(u.id) }
func (u *passkeyUser) WebAuthnName() string { return u.email }
func (u *passkeyUser) WebAuthnDisplayName() string {
	if strings.TrimSpace(u.name) != "" {
		return u.name
	}
	return u.email
}
func (u *passkeyUser) WebAuthnCredentials() []webauthn.Credential { return u.credentials }

func (s *Server) webAuthn() (*webauthn.WebAuthn, error) {
	appURL := s.config.AppURL
	if appURL == nil || appURL.Hostname() == "" {
		return nil, errors.New("WebAuthn requires an absolute app URL")
	}
	origins := []string{strings.TrimRight(appURL.String(), "/")}
	for _, raw := range strings.Split(os.Getenv("WEB_AUTHN_EXTRA_ORIGINS"), ",") {
		origin := strings.TrimSpace(raw)
		if origin == "" {
			continue
		}
		parsed, err := url.Parse(origin)
		if err != nil || parsed.Host == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
			return nil, errors.New("WEB_AUTHN_EXTRA_ORIGINS contains an invalid origin")
		}
		origins = append(origins, strings.TrimRight(origin, "/"))
	}
	return webauthn.New(&webauthn.Config{RPID: appURL.Hostname(), RPDisplayName: "LePatch", RPOrigins: origins})
}

func (s *Server) loadPasskeyUser(ctx context.Context, userID string) (*passkeyUser, error) {
	user := &passkeyUser{id: userID}
	if err := s.store.DB().QueryRowContext(ctx, `SELECT name,email FROM "User" WHERE id=?`, userID).Scan(&user.name, &user.email); err != nil {
		return nil, err
	}
	rows, err := s.store.DB().QueryContext(ctx, `SELECT credentialId,publicKey,counter,transports FROM "PasskeyCredential" WHERE userId=?`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var key, serializedTransports []byte
		var counter uint32
		if err := rows.Scan(&id, &key, &counter, &serializedTransports); err != nil {
			return nil, err
		}
		credentialID, err := base64.RawURLEncoding.DecodeString(id)
		if err != nil {
			credentialID, err = base64.StdEncoding.DecodeString(id)
		}
		if err != nil {
			return nil, fmt.Errorf("invalid stored passkey id")
		}
		var transports []protocol.AuthenticatorTransport
		if err := json.Unmarshal(serializedTransports, &transports); err != nil {
			transports = nil
		}
		user.credentials = append(user.credentials, webauthn.Credential{ID: credentialID, PublicKey: key, Transport: transports, Authenticator: webauthn.Authenticator{SignCount: counter}})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return user, nil
}

func (s *Server) saveWebAuthnCeremony(id string, state webauthnCeremony) {
	s.ceremonyMu.Lock()
	defer s.ceremonyMu.Unlock()
	now := time.Now()
	for key, value := range s.ceremonies {
		if value.Expires.Before(now) {
			delete(s.ceremonies, key)
		}
	}
	s.ceremonies[id] = state
}

func (s *Server) takeWebAuthnCeremony(id string, purpose ceremonyPurpose, userID string) (webauthnCeremony, bool) {
	s.ceremonyMu.Lock()
	defer s.ceremonyMu.Unlock()
	state, ok := s.ceremonies[id]
	delete(s.ceremonies, id)
	if !ok || state.Expires.Before(time.Now()) || state.Purpose != purpose || (userID != "" && state.UserID != userID) {
		return webauthnCeremony{}, false
	}
	return state, true
}

func (s *Server) passkeyRegistrationOptions(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	user, err := s.loadPasskeyUser(r.Context(), principal.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load account passkeys")
		return
	}
	wa, err := s.webAuthn()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Passkeys are not configured for this origin")
		return
	}
	exclusions := make([]protocol.CredentialDescriptor, 0, len(user.credentials))
	for _, credential := range user.credentials {
		exclusions = append(exclusions, protocol.CredentialDescriptor{Type: protocol.PublicKeyCredentialType, CredentialID: credential.ID, Transport: credential.Transport})
	}
	options, session, err := wa.BeginRegistration(user,
		webauthn.WithExclusions(exclusions),
		webauthn.WithAuthenticatorSelection(protocol.AuthenticatorSelection{ResidentKey: protocol.ResidentKeyRequirementPreferred, UserVerification: protocol.VerificationPreferred}),
	)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Could not start passkey registration")
		return
	}
	id := newID()
	s.saveWebAuthnCeremony(id, webauthnCeremony{UserID: principal.UserID, Purpose: ceremonyRegistration, Session: *session, Expires: time.Now().Add(5 * time.Minute)})
	writeJSON(w, http.StatusOK, map[string]any{"flowId": id, "publicKey": options.Response})
}

func (s *Server) passkeyRegistrationVerify(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	flowID := r.URL.Query().Get("flowId")
	state, ok := s.takeWebAuthnCeremony(flowID, ceremonyRegistration, principal.UserID)
	if !ok {
		writeError(w, http.StatusBadRequest, "Passkey registration expired; start again")
		return
	}
	wa, err := s.webAuthn()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Passkeys are not configured for this origin")
		return
	}
	user, err := s.loadPasskeyUser(r.Context(), principal.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load account")
		return
	}
	credential, err := wa.FinishRegistration(user, state.Session, r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Passkey registration could not be verified")
		return
	}
	transports, _ := json.Marshal(credential.Transport)
	_, err = s.store.DB().ExecContext(r.Context(), `INSERT INTO "PasskeyCredential" (id,userId,credentialId,publicKey,counter,transports,deviceName,createdAt) VALUES (?,?,?,?,?,?,?,?)`, newID(), principal.UserID, base64.RawURLEncoding.EncodeToString(credential.ID), credential.PublicKey, credential.Authenticator.SignCount, string(transports), "Passkey", time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		writeError(w, http.StatusConflict, "This passkey is already registered")
		return
	}
	s.writeAudit(r.Context(), principal.UserID, "user.updated", "passkey", nil, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) passkeyAuthOptions(w http.ResponseWriter, r *http.Request) {
	wa, err := s.webAuthn()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Passkeys are not configured for this origin")
		return
	}
	options, session, err := wa.BeginDiscoverableLogin()
	if err != nil {
		writeError(w, http.StatusBadRequest, "Could not start passkey sign in")
		return
	}
	id := newID()
	s.saveWebAuthnCeremony(id, webauthnCeremony{Purpose: ceremonyAuthentication, Session: *session, Expires: time.Now().Add(5 * time.Minute)})
	s.setCSRFCookie(w)
	writeJSON(w, http.StatusOK, map[string]any{"flowId": id, "publicKey": options.Response})
}

func (s *Server) passkeyAuthVerify(w http.ResponseWriter, r *http.Request) {
	if !s.auth.ValidateCSRF(r) {
		writeError(w, http.StatusForbidden, "Invalid CSRF token")
		return
	}
	flowID := r.URL.Query().Get("flowId")
	state, ok := s.takeWebAuthnCeremony(flowID, ceremonyAuthentication, "")
	if !ok {
		writeError(w, http.StatusBadRequest, "Passkey sign in expired; start again")
		return
	}
	wa, err := s.webAuthn()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Passkeys are not configured for this origin")
		return
	}
	lookup := func(rawID, userHandle []byte) (webauthn.User, error) {
		if len(userHandle) == 0 || len(userHandle) > 64 {
			return nil, errors.New("invalid user handle")
		}
		userID := string(userHandle)
		var credentialOwner string
		credentialID := base64.RawURLEncoding.EncodeToString(rawID)
		if err := s.store.DB().QueryRowContext(r.Context(), `SELECT userId FROM "PasskeyCredential" WHERE credentialId=?`, credentialID).Scan(&credentialOwner); err != nil || credentialOwner != userID {
			return nil, errors.New("passkey does not match user handle")
		}
		return s.loadPasskeyUser(r.Context(), userID)
	}
	user, credential, err := wa.FinishPasskeyLogin(lookup, state.Session, r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Passkey sign in could not be verified")
		return
	}
	userID := string(user.WebAuthnID())
	credentialID := base64.RawURLEncoding.EncodeToString(credential.ID)
	if _, err := s.store.DB().ExecContext(r.Context(), `UPDATE "PasskeyCredential" SET counter=?,lastUsedAt=? WHERE credentialId=? AND userId=?`, credential.Authenticator.SignCount, time.Now().UTC().Format(time.RFC3339Nano), credentialID, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not update passkey use")
		return
	}
	var mfaEnabled bool
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT totpEnabled FROM "User" WHERE id=?`, userID).Scan(&mfaEnabled); err != nil {
		writeError(w, http.StatusUnauthorized, "Account not found")
		return
	}
	purpose := "mfa"
	if !mfaEnabled {
		purpose = "mfa_setup"
	}
	token, err := auth.CreatePreAuthToken(userID, purpose, s.auth.SigningKey, time.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not continue sign in")
		return
	}
	s.setCSRFCookie(w)
	if !mfaEnabled {
		writeJSON(w, http.StatusOK, map[string]any{"mfaSetupRequired": true, "mfaSetupToken": token})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"mfaRequired": true, "mfaToken": token})
}
