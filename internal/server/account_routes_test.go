package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestUpdateAccountStoresNameAndTheme(t *testing.T) {
	handler, adminToken, _, csrf, _ := adminTestServer(t)

	response := adminWrite(t, handler, http.MethodPatch, "/api/account", adminToken, csrf, map[string]any{"name": "  Renamed Admin  ", "theme": "light"})
	if response.Code != http.StatusOK {
		t.Fatalf("update account = %d: %s", response.Code, response.Body.String())
	}
	var result struct {
		User struct {
			Name  string `json:"name"`
			Theme string `json:"theme"`
			Role  string `json:"role"`
		} `json:"user"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.User.Name != "Renamed Admin" {
		t.Fatalf("display name was not stored: %s", response.Body.String())
	}
	if result.User.Theme != "light" {
		t.Fatalf("theme was not stored: %s", response.Body.String())
	}
	if result.User.Role != "administrator" {
		t.Fatalf("role must not be writable from the account route: %s", response.Body.String())
	}
}

func TestUpdateAccountRejectsUnknownThemeAndRoleChanges(t *testing.T) {
	handler, adminToken, _, csrf, _ := adminTestServer(t)

	unknown := adminWrite(t, handler, http.MethodPatch, "/api/account", adminToken, csrf, map[string]any{"theme": "neon"})
	if unknown.Code != http.StatusBadRequest {
		t.Fatalf("unknown theme = %d, want 400: %s", unknown.Code, unknown.Body.String())
	}
	empty := adminWrite(t, handler, http.MethodPatch, "/api/account", adminToken, csrf, map[string]any{"name": "   "})
	if empty.Code != http.StatusBadRequest {
		t.Fatalf("empty name = %d, want 400: %s", empty.Code, empty.Body.String())
	}
	role := adminWrite(t, handler, http.MethodPatch, "/api/account", adminToken, csrf, map[string]any{"role": "administrator"})
	if role.Code != http.StatusBadRequest {
		t.Fatalf("role change = %d, want 400: %s", role.Code, role.Body.String())
	}
}

func TestUpdateAccountRequiresSessionAndCSRF(t *testing.T) {
	handler, adminToken, _, _, _ := adminTestServer(t)

	anonymous := adminWrite(t, handler, http.MethodPatch, "/api/account", "", "token", map[string]any{"name": "Nobody"})
	if anonymous.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous account update = %d, want 401", anonymous.Code)
	}
	noCSRF := mismatchedCSRFWrite(t, handler, adminToken, map[string]any{"name": "Nobody"})
	if noCSRF.Code != http.StatusForbidden {
		t.Fatalf("account update without a valid CSRF token = %d, want 403", noCSRF.Code)
	}
}

// mismatchedCSRFWrite sends a CSRF header that does not match the CSRF
// cookie, which is how a cross-site request would look.
func mismatchedCSRFWrite(t *testing.T, handler http.Handler, token string, payload any) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPatch, "/api/account", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{Name: "lepatch_session", Value: token})
	request.AddCookie(&http.Cookie{Name: "lepatch_csrf", Value: "cookie-token"})
	request.Header.Set("X-CSRF-Token", "header-token")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
