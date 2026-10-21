package worker

import (
	"context"
	"html"
	"strings"
	"testing"
	"time"

	"lepatch/internal/store"
)

func TestTelegramReleaseMessageFillsTheNotesAndLinksLePatch(t *testing.T) {
	job := notificationJob{
		appID:        "app-1",
		releaseID:    "release-1",
		appName:      "paseo",
		repoFullName: "getpaseo/paseo",
		tag:          "v0.12.0",
		releaseURL:   "https://github.com/getpaseo/paseo/releases/tag/v0.12.0",
		body:         "## What's Changed\n\nA faster sync engine.\n\n* fix one thing\n* fix another",
	}
	message, markup := telegramReleaseMessage(job, "https://lepatch.example")

	if !strings.Contains(message, "New release detected") {
		t.Fatalf("stable release should be titled clearly: %q", message)
	}
	if !strings.Contains(message, "🚀") {
		t.Fatalf("a stable release should carry the release icon: %q", message)
	}
	if !strings.Contains(message, "<code>v0.12.0</code>") || !strings.Contains(message, "getpaseo/paseo") {
		t.Fatalf("message should name the project and version: %q", message)
	}
	// The notes are carried in the message, with headings and bullets tidied.
	if !strings.Contains(message, "A faster sync engine.") || !strings.Contains(message, "• fix one thing") {
		t.Fatalf("message should carry the release notes: %q", message)
	}
	if strings.Contains(message, "## What's Changed") || strings.Contains(message, "* fix one thing") {
		t.Fatalf("markdown was not tidied: %q", message)
	}

	keyboard, ok := markup["inline_keyboard"].([][]map[string]string)
	if !ok || len(keyboard) != 2 {
		t.Fatalf("expected a LePatch and a GitHub button: %#v", markup)
	}
	if keyboard[0][0]["text"] != "Open in LePatch" || keyboard[0][0]["url"] != "https://lepatch.example/apps/app-1/releases/release-1" {
		t.Fatalf("first button should open the release in LePatch: %#v", keyboard[0][0])
	}
	if keyboard[1][0]["text"] != "GitHub" || keyboard[1][0]["url"] != job.releaseURL {
		t.Fatalf("second button should open GitHub: %#v", keyboard[1][0])
	}
}

func TestTelegramTruncatesLongNotesAndPointsAtLePatch(t *testing.T) {
	job := notificationJob{
		appID:        "app-1",
		releaseID:    "release-1",
		appName:      "zurg",
		repoFullName: "debridmediamanager/zurg",
		tag:          "2026.10.21.0448-nightly",
		releaseURL:   "https://github.com/debridmediamanager/zurg/releases/tag/nightly",
		body:         strings.Repeat("A long line of release notes.\n", 400),
	}
	message, markup := telegramReleaseMessage(job, "https://lepatch.example")

	if length := len([]rune(html.UnescapeString(message))); length > telegramMessageLimit {
		t.Fatalf("visible message length = %d; want at most %d", length, telegramMessageLimit)
	}
	if !strings.HasSuffix(strings.TrimSpace(html.UnescapeString(message)), "…") {
		t.Fatalf("the truncated notes should end with an ellipsis")
	}
	keyboard, ok := markup["inline_keyboard"].([][]map[string]string)
	if !ok || len(keyboard) == 0 || keyboard[0][0]["text"] != "Read the rest in LePatch" {
		t.Fatalf("truncated notes should point at LePatch: %#v", markup)
	}
}

func TestTelegramUsesOnlyGitHubPrereleaseFlag(t *testing.T) {
	// A project that ships nightlies as ordinary releases must not be
	// labelled a pre-release, which is what made every nightly feed look like
	// pre-releases had been switched on.
	job := notificationJob{
		appName:      "zurg",
		repoFullName: "debridmediamanager/zurg",
		tag:          "2026.10.21.0448-nightly",
		releaseURL:   "https://github.com/debridmediamanager/zurg/releases/tag/nightly",
		releaseType:  "prerelease",
	}
	message, _ := telegramReleaseMessage(job, "https://lepatch.example")
	if !strings.Contains(message, "New release detected") {
		t.Fatalf("a nightly tag without GitHub's flag is a normal release: %q", message)
	}
	if strings.Contains(message, "not a final release") {
		t.Fatalf("a normal release should not carry the pre-release warning: %q", message)
	}

	job.prerelease = true
	flagged, _ := telegramReleaseMessage(job, "https://lepatch.example")
	if !strings.Contains(flagged, "Pre-release detected") {
		t.Fatalf("a GitHub marked pre-release should say so: %q", flagged)
	}
	if !strings.Contains(flagged, "🧪") || !strings.Contains(flagged, "not a final release") {
		t.Fatalf("pre-release should be visually distinct: %q", flagged)
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
	message, _ := telegramReleaseMessage(job, "https://lepatch.example")
	if length := len([]rune(html.UnescapeString(message))); length > telegramMessageLimit {
		t.Fatalf("visible message length = %d; want at most %d", length, telegramMessageLimit)
	}
}

func TestReleaseSummaryReadsTheParagraphNotJustTheTopLine(t *testing.T) {
	body := strings.Join([]string{
		"## What's Changed",
		"",
		"This release rewrites the indexer and fixes a crash on startup.",
		"It also adds a new webdav endpoint.",
		"",
		"## Full Changelog",
		"https://github.com/o/r/compare/v1...v2",
	}, "\n")

	summary, ok := releaseSummary(&body).(string)
	if !ok {
		t.Fatalf("expected a summary, got %#v", releaseSummary(&body))
	}
	if !strings.Contains(summary, "rewrites the indexer") || !strings.Contains(summary, "webdav endpoint") {
		t.Fatalf("summary should carry the paragraph, got %q", summary)
	}
	if strings.Contains(summary, "What's Changed") || strings.Contains(summary, "Full Changelog") {
		t.Fatalf("summary kept generated headings: %q", summary)
	}

	empty := "   \n\n"
	if releaseSummary(&empty) != nil {
		t.Fatalf("blank notes should not produce a summary: %#v", releaseSummary(&empty))
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
	payload := discordReleasePayload(job, "https://lepatch.example")
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
	stable := discordReleasePayload(job, "https://lepatch.example")["embeds"].([]map[string]any)[0]
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
