package worker

import (
	"context"
	"html"
	"strings"
	"testing"
	"time"

	"lepatch/internal/store"
)

func TestTelegramReleaseMessageUsesLimitAndLinksToFullNotes(t *testing.T) {
	job := notificationJob{appName: "paseo", repoFullName: "getpaseo/paseo", tag: "v0.12.0", releaseURL: "https://github.com/getpaseo/paseo/releases/tag/v0.12.0", body: strings.Repeat("界", 5000)}
	message, markup := telegramReleaseMessage(job)
	if markup == nil {
		t.Fatal("truncated Telegram release should have a View the rest button")
	}
	keyboard := markup["inline_keyboard"].([][]map[string]string)
	if len(keyboard) != 1 || len(keyboard[0]) != 1 || keyboard[0][0]["text"] != "View the rest" || keyboard[0][0]["url"] != job.releaseURL {
		t.Fatalf("unexpected Telegram continuation button: %#v", markup)
	}
	parts := strings.SplitN(message, "</a>\n", 2)
	if len(parts) != 2 {
		t.Fatalf("release message has no notes body: %s", message[:min(len(message), 200)])
	}
	headerVisible := job.appName + " released " + job.tag + "\n" + job.repoFullName
	visibleLength := len([]rune(headerVisible)) + 1 + len([]rune(html.UnescapeString(parts[1])))
	if visibleLength != telegramMessageLimit {
		t.Fatalf("visible message length = %d; want Telegram maximum %d", visibleLength, telegramMessageLimit)
	}

	short := job
	short.body = "Short release notes"
	shortMessage, shortMarkup := telegramReleaseMessage(short)
	if shortMarkup != nil || !strings.HasSuffix(shortMessage, html.EscapeString(short.body)) {
		t.Fatalf("short notes should remain complete and need no button: markup=%#v message=%q", shortMarkup, shortMessage)
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
