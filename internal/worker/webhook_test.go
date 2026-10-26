package worker

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWebhookPayloadIsFlatAndStable(t *testing.T) {
	job := notificationJob{
		appID:        "app-1",
		releaseID:    "rel-1",
		appName:      "Sonarr",
		repoFullName: "Sonarr/Sonarr",
		tag:          "v4.0.14",
		releaseURL:   "https://github.com/Sonarr/Sonarr/releases/tag/v4.0.14",
		summary:      "Fixes the indexer health check.",
		security:     true,
		createdAt:    "2026-10-22T10:00:00Z",
	}
	payload := webhookReleasePayload(job, "https://lepatch.example")

	expected := map[string]any{
		"event":       "release",
		"repository":  "Sonarr/Sonarr",
		"application": "Sonarr",
		"tag":         "v4.0.14",
		"url":         "https://github.com/Sonarr/Sonarr/releases/tag/v4.0.14",
		"inAppUrl":    "https://lepatch.example/apps/app-1/releases/rel-1",
		"summary":     "Fixes the indexer health check.",
		"prerelease":  false,
		"security":    true,
		"detectedAt":  "2026-10-22T10:00:00Z",
	}
	for key, want := range expected {
		if got := payload[key]; got != want {
			t.Errorf("payload[%q] = %#v, want %#v", key, got, want)
		}
	}
}

func TestNtfyPayloadUsesHeadersForPriorityAndTags(t *testing.T) {
	job := notificationJob{
		appID:        "app-1",
		releaseID:    "rel-1",
		appName:      "Sonarr",
		repoFullName: "Sonarr/Sonarr",
		tag:          "v4.0.14",
		releaseURL:   "https://github.com/Sonarr/Sonarr/releases/tag/v4.0.14",
		summary:      "Fixes the indexer health check.",
		security:     true,
	}

	body, headers := ntfyPayload(job, "https://lepatch.example")
	if !strings.Contains(body, "Sonarr") || !strings.Contains(body, "https://lepatch.example/apps/") {
		t.Fatalf("the ntfy message should carry the app and the in-app link: %q", body)
	}
	if headers["Priority"] != "high" {
		t.Fatalf("a security release should use high priority: %q", headers["Priority"])
	}
	if headers["Tags"] != "shield" {
		t.Fatalf("a security release should use the shield tag: %q", headers["Tags"])
	}
	if !strings.Contains(headers["Title"], "Security") {
		t.Fatalf("the title should say it is a security release: %q", headers["Title"])
	}
}

func TestValidIntegrationURL(t *testing.T) {
	valid := []string{"https://hooks.example/path", "http://192.168.1.10:8080/hook", "https://ntfy.sh/mytopic"}
	for _, value := range valid {
		if !validIntegrationURL(value) {
			t.Errorf("%q should be accepted", value)
		}
	}
	invalid := []string{"", "ftp://example.com", "https://user:pass@example.com", "not a url", "https://"}
	for _, value := range invalid {
		if validIntegrationURL(value) {
			t.Errorf("%q should be rejected", value)
		}
	}
}

func TestSendWebhookSignsTheBody(t *testing.T) {
	var (
		received    []byte
		signature   string
		contentType string
	)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received, _ = io.ReadAll(r.Body)
		signature = r.Header.Get("X-LePatch-Signature")
		contentType = r.Header.Get("Content-Type")
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	t.Setenv("NO_PROXY", "127.0.0.1")
	runner := &Runner{}
	job := notificationJob{appName: "Sonarr", repoFullName: "Sonarr/Sonarr", tag: "v4.0.14", releaseURL: "https://github.com/Sonarr/Sonarr/releases/tag/v4.0.14"}

	if err := runner.sendWebhook(t.Context(), job, map[string]string{"url": server.URL, "secret": "top-secret"}); err != nil {
		t.Fatal(err)
	}
	if contentType != "application/json" {
		t.Fatalf("unexpected content type: %q", contentType)
	}
	mac := hmac.New(sha256.New, []byte("top-secret"))
	mac.Write(received)
	want := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	if signature != want {
		t.Fatalf("signature = %q, want %q", signature, want)
	}
	var decoded map[string]any
	if err := json.Unmarshal(received, &decoded); err != nil {
		t.Fatalf("the signed body must be JSON: %v", err)
	}
	if decoded["tag"] != "v4.0.14" {
		t.Fatalf("unexpected payload: %s", received)
	}
}

func TestSendWebhookPostsNtfyWithBearerToken(t *testing.T) {
	var (
		authorization string
		body          bytes.Buffer
	)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorization = r.Header.Get("Authorization")
		_, _ = io.Copy(&body, r.Body)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	runner := &Runner{appURL: "https://lepatch.example"}
	job := notificationJob{appName: "Sonarr", repoFullName: "Sonarr/Sonarr", tag: "v4.0.14"}

	if err := runner.sendWebhook(t.Context(), job, map[string]string{"url": server.URL, "mode": "ntfy", "token": "tk_123"}); err != nil {
		t.Fatal(err)
	}
	if authorization != "Bearer tk_123" {
		t.Fatalf("authorization = %q", authorization)
	}
	if !strings.Contains(body.String(), "Sonarr") {
		t.Fatalf("unexpected ntfy body: %q", body.String())
	}
}

func TestParseTimeAcceptsTheStoredFormat(t *testing.T) {
	if _, err := parseTime("2026-10-22T10:00:00.123456789Z"); err != nil {
		t.Fatal(err)
	}
}

func TestCheckTelegramResponseAcceptsALongEcho(t *testing.T) {
	// Telegram echoes the whole message back, so a full-length release produces
	// a response well over 4 KB.
	echo := strings.Repeat("a", 6000)
	body, err := json.Marshal(map[string]any{"ok": true, "result": map[string]any{"text": echo}})
	if err != nil {
		t.Fatal(err)
	}
	if len(body) <= 4096 {
		t.Fatalf("the test payload should exceed the old limit, got %d bytes", len(body))
	}
	if err := checkTelegramResponse(body); err != nil {
		t.Fatalf("a successful long response must not be treated as a rejection: %v", err)
	}
}

func TestCheckTelegramResponseReportsTheReason(t *testing.T) {
	body := []byte(`{"ok":false,"error_code":400,"description":"Bad Request: message is too long"}`)
	err := checkTelegramResponse(body)
	if err == nil || !strings.Contains(err.Error(), "message is too long") {
		t.Fatalf("the Telegram description should be surfaced, got %v", err)
	}
	var failure *deliveryError
	if !errors.As(err, &failure) || !failure.permanent() {
		t.Fatal("a rejected message is permanent and should not be retried")
	}
}

func TestPostBodyReadsResponsesLargerThanFourKilobytes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"padding":"` + strings.Repeat("x", 8000) + `"}`))
	}))
	defer server.Close()

	body, err := postBody(t.Context(), server.URL, "application/json", []byte(`{}`), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(body) <= 4096 {
		t.Fatalf("the response was truncated at %d bytes", len(body))
	}
}
