package store

import (
	"strings"
	"testing"
)

func TestSplitSQLScriptKeepsQuotedSemicolonsTogether(t *testing.T) {
	script := `
CREATE TABLE a (note TEXT DEFAULT 'one; two');
INSERT INTO a (note) VALUES ('it''s; fine');
CREATE TABLE "odd;name" (id TEXT);
`
	statements, err := splitSQLScript(script)
	if err != nil {
		t.Fatal(err)
	}
	if len(statements) != 3 {
		t.Fatalf("expected 3 statements, got %d: %#v", len(statements), statements)
	}
	if !strings.Contains(statements[0], "'one; two'") {
		t.Fatalf("the first statement lost its quoted semicolon: %s", statements[0])
	}
	if !strings.Contains(statements[1], "it''s; fine") {
		t.Fatalf("the escaped quote was not respected: %s", statements[1])
	}
	if !strings.Contains(statements[2], `"odd;name"`) {
		t.Fatalf("the quoted identifier was not respected: %s", statements[2])
	}
}

func TestSplitSQLScriptIgnoresComments(t *testing.T) {
	script := "-- a header; with a semicolon\nCREATE TABLE a (id TEXT); /* trailing; note */\nSELECT 1"
	statements, err := splitSQLScript(script)
	if err != nil {
		t.Fatal(err)
	}
	if len(statements) != 2 {
		t.Fatalf("expected 2 statements, got %d: %#v", len(statements), statements)
	}
	if !strings.HasPrefix(statements[0], "-- a header") {
		t.Fatalf("the leading comment should stay with the statement: %s", statements[0])
	}
}

func TestSplitSQLScriptSkipsEmptyStatements(t *testing.T) {
	statements, err := splitSQLScript(";; ;\n  ;")
	if err != nil {
		t.Fatal(err)
	}
	if len(statements) != 0 {
		t.Fatalf("expected no statements, got %#v", statements)
	}
}

func TestSplitSQLScriptRejectsUnterminatedLiteral(t *testing.T) {
	if _, err := splitSQLScript("INSERT INTO a VALUES ('unfinished);"); err == nil {
		t.Fatal("an unterminated string literal must be an error")
	}
}

func TestSplitSQLScriptRejectsTriggers(t *testing.T) {
	script := `CREATE TRIGGER sync AFTER INSERT ON "Release" BEGIN
		UPDATE "WatchedApp" SET updatedAt=CURRENT_TIMESTAMP;
	END`
	if _, err := splitSQLScript(script); err == nil {
		t.Fatal("trigger definitions must be rejected rather than split incorrectly")
	}
}

func TestEveryEmbeddedMigrationSplits(t *testing.T) {
	// A migration that cannot be split is a startup failure, so keep the
	// check close to the splitter.
	for _, name := range []string{"schema.sql", "migrations/0002_raised_issues.sql", "migrations/0003_notification_delivery.sql", "migrations/0004_search_feeds_and_filters.sql"} {
		script, err := schemaFiles.ReadFile(name)
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		statements, err := splitSQLScript(string(script))
		if err != nil {
			t.Fatalf("split %s: %v", name, err)
		}
		if len(statements) == 0 {
			t.Fatalf("%s produced no statements", name)
		}
	}
}
