package worker

import (
	"context"
	"html"
	"strings"
	"testing"
	"time"

	"lepatch/internal/store"
)

func TestTelegramReleaseMessageNamesTheKindAndLinksTheNotes(t *testing.T) {
	job := notificationJob{
		appName:      "paseo",
		repoFullName: "getpaseo/paseo",
		tag:          "v0.12.0",
		releaseURL:   "https://github.com/getpaseo/paseo/releases/tag/v0.12.0",
		releaseType:  "minor",
		summary:      "A faster sync engine and a new settings screen.",
	}
	message, markup := telegramReleaseMessage(job)

	if !strings.Contains(message, "New release detected") {
		t.Fatalf("stable release should be titled clearly: %q", message)
	}
	if !strings.Contains(message, "🚀") {
		t.Fatalf("a stable release should carry the release icon: %q", message)
	}
	if !strings.Contains(message, "&lt;") && strings.Contains(message, "<script>") {
		t.Fatalf("message was not escaped: %q", message)
	}
	if !strings.Contains(message, "<code>v0.12.0</code>") || !strings.Contains(message, "getpaseo/paseo") {
		t.Fatalf("message should name the project and version: %q", message)
	}
	if !strings.Contains(message, "A faster sync engine") {
		t.Fatalf("message should include the summary: %q", message)
	}
	if !strings.Contains(message, "<blockquote>") {
		t.Fatalf("the summary should sit in a blockquote: %q", message)
	}

	keyboard, ok := markup["inline_keyboard"].([][]map[string]string)
	if !ok || len(keyboard) != 1 || keyboard[0][0]["text"] != "Open release notes" || keyboard[0][0]["url"] != job.releaseURL {
		t.Fatalf("unexpected release button: %#v", markup)
	}
}

func TestTelegramPrereleaseLooksDifferentFromAStableRelease(t *testing.T) {
	base := notificationJob{
		appName:      "zurg",
		repoFullName: "debridmediamanager/zurg",
		tag:          "2026.10.18-nightly",
		releaseURL:   "https://github.com/debridmediamanager/zurg/releases/tag/2026.10.18-nightly",
		summary:      "Nightly build.",
	}
	prerelease := base
	prerelease.prerelease = true

	// A tag without a pre-release marker stays stable even when the caller
	// does not mark it.
	stable := base
	stable.tag = "v1.2.3"
	stable.releaseURL = "https://github.com/debridmediamanager/zurg/releases/tag/v1.2.3"

	message, _ := telegramReleaseMessage(prerelease)
	if !strings.Contains(message, "Pre-release detected") {
		t.Fatalf("pre-release should say so in the title: %q", message)
	}
	if !strings.Contains(message, "🧪") {
		t.Fatalf("pre-release should carry the pre-release icon: %q", message)
	}
	if !strings.Contains(message, "not a final release") {
		t.Fatalf("pre-release should warn the reader: %q", message)
	}
	if !strings.Contains(message, "<i>pre-release</i>") {
		t.Fatalf("pre-release should be labelled in the meta line: %q", message)
	}

	stableMessage, _ := telegramReleaseMessage(stable)
	if stableMessage == message {
		t.Fatal("a pre-release and a stable release should not render identically")
	}
	if strings.Contains(stableMessage, "not a final release") {
		t.Fatalf("a stable release should not carry the pre-release warning: %q", stableMessage)
	}
}

func TestNotificationSummarySkipsGeneratedChangelogNoise(t *testing.T) {
	job := notificationJob{
		tag: "v2.0.0",
		body: strings.Join([]string{
			"## What's Changed",
			"* fix: something by @someone in https://github.com/o/r/pull/1",
			"**Full Changelog**: https://github.com/o/r/compare/v1...v2",
		}, "\n"),
	}
	if got := notificationSummary(job); got != "fix: something by @someone" {
		t.Fatalf("summary picked noise: %q", got)
	}

	job.summary = "A real summary that should win."
	if got := notificationSummary(job); got != "A real summary that should win." {
		t.Fatalf("stored summary was ignored: %q", got)
	}

	job.summary = ""
	job.body = "![banner](https://example.test/banner.png)\n\nA clean line of release notes."
	if got := notificationSummary(job); got != "A clean line of release notes." {
		t.Fatalf("summary kept an image: %q", got)
	}
}

func TestTelegramMessageStaysWithinTheLimit(t *testing.T) {
	job := notificationJob{
		appName:      strings.Repeat("a", 200),
		repoFullName: strings.Repeat("b", 200),
		tag:          strings.Repeat("c", 200),
		releaseURL:   "https://github.com/o/r/releases/tag/v1",
		summary:      strings.Repeat("界", 5000),
	}
	message, _ := telegramReleaseMessage(job)
	if length := len([]rune(html.UnescapeString(message))); length > telegramMessageLimit {
		t.Fatalf("visible message length = %d; want at most %d", length, telegramMessageLimit)
	}
}

func TestClassifyReleaseRecognisesPrereleaseTags(t *testing.T) {
	for _, tag := range []string{
		"v2.0.0-rc.1", "v2.0.0-beta2", "1.0.0-alpha.3",
		"2026.10.18-nightly", "v3.0.0-preview.1", "v1.0.0-canary.202610",
	} {
		if got := classifyRelease(tag); got != "prerelease" {
			t.Errorf("classifyRelease(%q) = %q, want prerelease", tag, got)
		}
	}
	for _, tag := range []string{"v1.2.3", "v2.0.0", "2026.10.18"} {
		if got := classifyRelease(tag); got == "prerelease" {
			t.Errorf("classifyRelease(%q) should not be a pre-release", tag)
		}
	}
}

func TestDiscordReleasePayloadIsAnEmbed(t *testing.T) {
	job := notificationJob{
		appName:      "paseo",
		repoFullName: "getpaseo/paseo",
		tag:          "v1.0.0-rc.1",
		releaseURL:   "https://github.com/getpaseo/paseo/releases/tag/v1.0.0-rc.1",
		prerelease:   true,
		summary:      "Release candidate.",
	}
	payload := discordReleasePayload(job)
	embeds, ok := payload["embeds"].([]map[string]any)
	if !ok || len(embeds) != 1 {
		t.Fatalf("expected one embed: %#v", payload)
	}
	embed := embeds[0]
	if embed["color"] != 0xf59e0b {
		t.Fatalf("pre-release embed should be amber, got %#v", embed["color"])
	}
	if !strings.Contains(embed["title"].(string), "Pre-release detected") {
		t.Fatalf("unexpected embed title: %#v", embed["title"])
	}
	if embed["description"] != "Release candidate." {
		t.Fatalf("unexpected embed description: %#v", embed["description"])
	}
	fields, _ := embed["fields"].([]map[string]any)
	if len(fields) != 3 || fields[1]["name"] != "Type" || fields[1]["value"] != "pre-release" {
		t.Fatalf("pre-release embed should carry a pre-release field: %#v", fields)
	}
	if payload["allowed_mentions"] == nil {
		t.Fatal("mentions should be suppressed")
	}

	job.prerelease = false
	job.releaseType = "major"
	job.tag = "v2.0.0"
	stable := discordReleasePayload(job)["embeds"].([]map[string]any)[0]
	if stable["color"] != 0x22c55e {
		t.Fatalf("stable embed should be green, got %#v", stable["color"])
	}
	stableFields, _ := stable["fields"].([]map[string]any)
	if len(stableFields) != 2 {
		t.Fatalf("a stable embed should not carry a type field: %#v", stableFields)
	}
}

func TestQueueReleaseNotificationHonorsUserPreference(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.DB().ExecContext(ctx, `
		INSERT INTO "User" (id,name,email,passwordHash) VALUES ('u','User','u@example.test','hash');
		INSERT INTO "WatchedApp" (id,name,slug,repoOwner,repoName,repoFullName,githubUrl,userId) VALUES ('a','Repo','repo','owner','repo','owner/repo','https://github.com/owner/repo','u');
		INSERT INTO "Release" (id,watchedAppId,githubReleaseId,tagName,htmlUrl,prerelease,draft) VALUES ('r','a','1','v1.0.0','https://github.com/owner/repo/releases/tag/v1.0.0',0,0);
		INSERT INTO "NotificationChannel" (id,type,name,enabled,configJson) VALUES ('c','discord','Discord',1,'{}');
		INSERT INTO "NotificationPreference" (id,userId,enabled) VALUES ('p','u',0);
	`)
	if err != nil {
		t.Fatal(err)
	}
	runner := &Runner{db: db.DB()}
	if err := runner.enqueueNotificationEvents(ctx, "r", "u"); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := db.DB().QueryRowContext(ctx, `SELECT count(*) FROM "NotificationEvent"`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("disabled preference queued %d events (error %v)", count, err)
	}
	if _, err := db.DB().ExecContext(ctx, `UPDATE "NotificationPreference" SET enabled=1 WHERE userId='u'`); err != nil {
		t.Fatal(err)
	}
	if err := runner.enqueueNotificationEvents(ctx, "r", "u"); err != nil {
		t.Fatal(err)
	}
	if err := db.DB().QueryRowContext(ctx, `SELECT count(*) FROM "NotificationEvent" WHERE status='pending'`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("enabled preference queued %d events (error %v)", count, err)
	}
}

func TestSyncEnabledIntegrationChannelsRestoresLegacyTelegramSetting(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.DB().ExecContext(ctx, `
		INSERT INTO "IntegrationSetting" (id,provider,key,value,encrypted) VALUES ('i','telegram','enabled','true',0);
		INSERT INTO "NotificationChannel" (id,type,name,enabled,configJson) VALUES ('c','telegram','Telegram',0,'{}');
	`)
	if err != nil {
		t.Fatal(err)
	}
	runner := &Runner{db: db.DB()}
	runner.syncEnabledIntegrationChannels(ctx)
	var enabled bool
	if err := db.DB().QueryRowContext(ctx, `SELECT enabled FROM "NotificationChannel" WHERE type='telegram'`).Scan(&enabled); err != nil || !enabled {
		t.Fatalf("legacy enabled Telegram integration did not enable its channel (enabled=%t, error=%v)", enabled, err)
	}
}

func TestNotificationPreferenceQuietHoursAndSeverity(t *testing.T) {
	if got := classifyRelease("v3.0.0"); got != "major" {
		t.Fatalf("major release classified as %q", got)
	}
	if got := classifyRelease("v0.8.0"); got != "minor" {
		t.Fatalf("minor release classified as %q", got)
	}
	if got := classifyRelease("not-semver"); got != "patch" {
		t.Fatalf("fallback release classified as %q", got)
	}
	if delay := quietHoursDelay(time.Date(2026, 1, 1, 23, 0, 0, 0, time.UTC), "22:00", "07:00", "UTC"); delay <= 0 || delay > 9*time.Hour {
		t.Fatalf("overnight quiet period delay = %v", delay)
	}
	if delay := quietHoursDelay(time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC), "22:00", "07:00", "UTC"); delay != 0 {
		t.Fatalf("outside quiet hours delay = %v", delay)
	}
}
