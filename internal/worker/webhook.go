package worker

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// webhookReleasePayload is the JSON body a generic webhook receives. It is
// deliberately flat and stable: the fields people wire into Home Assistant,
// n8n or a script should not change shape between releases.
func webhookReleasePayload(job notificationJob, appURL string) map[string]any {
	return map[string]any{
		"event":       "release",
		"repository":  job.repoFullName,
		"application": job.appName,
		"tag":         job.tag,
		"url":         job.releaseURL,
		"inAppUrl":    inAppReleaseURL(appURL, job),
		"summary":     notificationSummary(job),
		"prerelease":  job.prerelease,
		"security":    job.security,
		"detectedAt":  job.createdAt,
	}
}

// ntfyPayload is the plain-text body for an ntfy publish. The topic lives in
// the URL, so ntfy accepts a POST there with these headers.
func ntfyPayload(job notificationJob, appURL string) (body string, headers map[string]string) {
	title, _, prerelease := releaseKind(job)
	if job.security {
		title = "Security release detected"
	}
	priority := "default"
	tags := []string{"rocket"}
	if prerelease {
		tags = []string{"test_tube"}
	}
	if job.security {
		priority = "high"
		tags = []string{"shield"}
	}

	link := inAppReleaseURL(appURL, job)
	if link == "" {
		link = job.releaseURL
	}

	message := notificationSummary(job)
	if message == "" {
		message = job.tag
	}
	message = fmt.Sprintf("%s\n%s · %s", message, job.appName, job.tag)
	if validReleaseURL(link) {
		message += "\n" + link
	}

	headers = map[string]string{
		"Title":      fmt.Sprintf("%s: %s %s", title, job.appName, job.tag),
		"Priority":   priority,
		"Tags":       strings.Join(tags, ","),
		"User-Agent": "LePatch",
	}
	if validReleaseURL(link) {
		headers["Click"] = link
	}
	return message, headers
}

// ValidIntegrationURL reports whether an operator supplied address is usable
// as an outbound webhook or ntfy endpoint.
func ValidIntegrationURL(raw string) bool {
	return validIntegrationURL(raw)
}

func validIntegrationURL(raw string) bool {
	if raw == "" || len(raw) > 2048 {
		return false
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if parsed.User != nil || parsed.Host == "" {
		return false
	}
	return parsed.Scheme == "https" || parsed.Scheme == "http"
}

// sendWebhook delivers a release to a generic endpoint or an ntfy topic.
func (w *Runner) sendWebhook(ctx context.Context, job notificationJob, config map[string]string) error {
	endpoint := strings.TrimSpace(config["url"])
	if !validIntegrationURL(endpoint) {
		return &deliveryError{status: http.StatusBadRequest, message: "Webhook URL is missing or invalid"}
	}
	if strings.EqualFold(strings.TrimSpace(config["mode"]), "ntfy") {
		body, headers := ntfyPayload(job, w.appURL)
		if token := strings.TrimSpace(config["token"]); token != "" {
			headers["Authorization"] = "Bearer " + token
		}
		_, err := postBody(ctx, endpoint, "text/plain; charset=utf-8", []byte(body), headers)
		return err
	}

	body, err := json.Marshal(webhookReleasePayload(job, w.appURL))
	if err != nil {
		return err
	}
	headers := map[string]string{"User-Agent": "LePatch"}
	if secret := strings.TrimSpace(config["secret"]); secret != "" {
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write(body)
		headers["X-LePatch-Signature"] = "sha256=" + hex.EncodeToString(mac.Sum(nil))
	}
	_, err = postBody(ctx, endpoint, "application/json", body, headers)
	return err
}

// PreviewWebhookPayload renders the sample body shown by the administrator
// "Send test" action.
func PreviewWebhookPayload(appURL string) map[string]any {
	return webhookReleasePayload(notificationJob{
		appID:        "preview-app",
		releaseID:    "preview-release",
		appName:      "LePatch",
		repoFullName: "leleasley/LePatch",
		tag:          "v0.2.0",
		releaseURL:   "https://github.com/leleasley/LePatch/releases/tag/v0.2.0",
		summary:      "This is a preview of a release webhook. Nothing was actually published.",
		createdAt:    "1970-01-01T00:00:00Z",
	}, appURL)
}
