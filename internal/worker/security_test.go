package worker

import (
	"context"
	"testing"

	"lepatch/internal/store"
)

func TestIsSecurityRelease(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		summary string
		want    bool
	}{
		{"v2.1.0", "Fixed CVE-2026-1234 in the upload endpoint.", "", true},
		{"v2.1.0", "Addresses GHSA-abcd-1234-wxyz.", "", true},
		{"v2.1.0", "This release fixes a remote code execution issue.", "", true},
		{"Security update", "Rotates the session signing key.", "", true},
		{"v2.1.0", "Improves performance of the indexer.", "Speed ups.", false},
		{"v2.1.0", "Adds a patch field to the API response.", "", false},
		{"v2.1.0", "", "Fixes a cross-site scripting flaw.", true},
		{"v2.1.0", "Updates three dependencies.", "", false},
	}
	for _, test := range cases {
		if got := IsSecurityRelease(test.name, test.summary, test.body); got != test.want {
			t.Errorf("IsSecurityRelease(%q, %q, %q) = %v, want %v", test.name, test.summary, test.body, got, test.want)
		}
	}
}

func TestTagFiltersMatchGlobs(t *testing.T) {
	filters := parseTagFilters("*-nightly\nv3.* , release-candidate-?")

	excluded := []string{"2026.10.22-nightly", "v3.4.5", "release-candidate-a", "V3.0"}
	for _, tag := range excluded {
		if !filters.Matches(tag) {
			t.Errorf("%q should be excluded", tag)
		}
	}
	kept := []string{"v4.0.0", "nightly-2026", "v1.2.3"}
	for _, tag := range kept {
		if filters.Matches(tag) {
			t.Errorf("%q should be kept", tag)
		}
	}
}

func TestTagFiltersIgnoreBlankAndInvalidPatterns(t *testing.T) {
	filters := parseTagFilters("  ,, \n\n ")
	if len(filters.patterns) != 0 {
		t.Fatalf("blank filters should produce no patterns: %#v", filters.patterns)
	}
}

func TestGlobToRegexpEscapesRegularExpressions(t *testing.T) {
	expression, err := globToRegexp("v(1)+.*")
	if err != nil {
		t.Fatal(err)
	}
	if !expression.MatchString("v(1)+.2") {
		t.Fatal("a literal pattern should match itself")
	}
	if expression.MatchString("v1.2") {
		t.Fatal("the pattern must be anchored and quoted")
	}
}

func TestLoadAppRowScansEveryColumn(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "User" (id,name,email,passwordHash) VALUES ('u','User','u@example.test','hash')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().ExecContext(ctx, `INSERT INTO "WatchedApp" (id,name,slug,repoOwner,repoName,repoFullName,githubUrl,userId,excludeTags,includePrereleases,checkIntervalMinutes) VALUES ('a','Repo','repo','owner','repo','owner/repo','https://github.com/owner/repo','u','*-nightly',1,45)`); err != nil {
		t.Fatal(err)
	}

	runner := &Runner{db: db.DB()}
	app, err := runner.loadAppRow(ctx, "a")
	if err != nil {
		t.Fatalf("loadAppRow must scan every selected column: %v", err)
	}
	if app.excludeTags != "*-nightly" || !app.prereleases || app.interval != 45 {
		t.Fatalf("unexpected row: %+v", app)
	}
}
