package worker

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"lepatch/internal/store"
)

func deliveryTestRunner(t *testing.T) (*Runner, *store.Store) {
	t.Helper()
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "User" (id,name,email,passwordHash) VALUES ('u','User','u@example.test','hash')`); err != nil {
		t.Fatal(err)
	}
	return &Runner{db: db.DB(), logger: slog.New(slog.NewTextHandler(io.Discard, nil))}, db
}

func TestDeliveryDecisionSecurityReleaseBypassesFilters(t *testing.T) {
	runner, db := deliveryTestRunner(t)
	ctx := context.Background()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	// A digest interval and a severity filter would both suppress a patch
	// release. A security release must still arrive.
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "NotificationPreference" (id,userId,enabled,digestInterval,timezone,severityFilters) VALUES ('p','u',1,60,'UTC','["major"]')`); err != nil {
		t.Fatal(err)
	}

	ordinary := notificationJob{userID: "u", tag: "v1.0.1", createdAt: now}
	if _, reason, deliver := runner.deliveryDecision(ctx, ordinary); deliver {
		t.Fatalf("an ordinary release should have been filtered, reason was %q", reason)
	}

	security := ordinary
	security.security = true
	if _, reason, deliver := runner.deliveryDecision(ctx, security); !deliver {
		t.Fatalf("a security release must bypass severity, digest and quiet hours, reason was %q", reason)
	}
}

func TestDeliveryDecisionRespectsPause(t *testing.T) {
	runner, db := deliveryTestRunner(t)
	ctx := context.Background()
	pausedUntil := time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano)
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "NotificationPreference" (id,userId,enabled,pausedUntil) VALUES ('p','u',1,?)`, pausedUntil); err != nil {
		t.Fatal(err)
	}

	job := notificationJob{userID: "u", tag: "v2.0.0", security: true}
	// A pause wins even over the security override, because it is an explicit
	// "do not contact me" choice.
	until, reason, deliver := runner.deliveryDecision(ctx, job)
	if deliver || until != 0 {
		t.Fatalf("a paused account should suppress and not defer: deliver=%v until=%v reason=%q", deliver, until, reason)
	}
	if reason != "notifications paused" {
		t.Fatalf("unexpected reason: %q", reason)
	}

	if _, err := db.DB().ExecContext(ctx, `UPDATE "NotificationPreference" SET pausedUntil=NULL WHERE userId='u'`); err != nil {
		t.Fatal(err)
	}
	if _, _, deliver := runner.deliveryDecision(ctx, job); !deliver {
		t.Fatal("the release should be delivered once the pause has been cleared")
	}
}

func TestLoadPendingNotificationJobsReadsEveryColumn(t *testing.T) {
	runner, db := deliveryTestRunner(t)
	ctx := context.Background()
	statements := []string{
		`INSERT INTO "WatchedApp" (id,name,slug,repoOwner,repoName,repoFullName,githubUrl,userId) VALUES ('a','Repo','repo','owner','repo','owner/repo','https://github.com/owner/repo','u')`,
		`INSERT INTO "Release" (id,watchedAppId,githubReleaseId,tagName,name,htmlUrl,prerelease,draft,securityRelevant,changelogSummary) VALUES ('r','a','1','v1.0.0','Repo v1.0.0','https://github.com/owner/repo/releases/tag/v1.0.0',0,0,1,'Fixes a CVE.')`,
		`INSERT INTO "NotificationChannel" (id,type,name,enabled,configJson) VALUES ('c','telegram','Telegram',1,'{}')`,
		`INSERT INTO "NotificationEvent" (id,releaseId,channelId,status,createdAt,attemptCount) VALUES ('e','r','c','pending',?,0)`,
	}
	for _, statement := range statements {
		var err error
		if strings.Contains(statement, "VALUES ('e'") {
			_, err = db.DB().ExecContext(ctx, statement, time.Now().UTC().Format(time.RFC3339Nano))
		} else {
			_, err = db.DB().ExecContext(ctx, statement)
		}
		if err != nil {
			t.Fatal(err)
		}
	}

	jobs, err := runner.loadPendingNotificationJobs(ctx)
	if err != nil {
		t.Fatalf("loadPendingNotificationJobs must scan every selected column: %v", err)
	}
	if len(jobs) != 1 {
		t.Fatalf("expected one job, got %d", len(jobs))
	}
	if !jobs[0].security || jobs[0].tag != "v1.0.0" || jobs[0].summary != "Fixes a CVE." {
		t.Fatalf("unexpected job: %+v", jobs[0])
	}
}
