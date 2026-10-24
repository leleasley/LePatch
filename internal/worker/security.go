package worker

import (
	"context"
	"regexp"
	"strings"
	"time"
)

// Security-relevant releases are worth interrupting quiet hours for, so they
// are detected once when the release is stored rather than on every read.
var (
	cvePattern  = regexp.MustCompile(`(?i)\bCVE-\d{4}-\d{4,}\b`)
	ghsaPattern = regexp.MustCompile(`(?i)\bGHSA(-[0-9a-z]{4}){3,}\b`)
	// Keep this list to signals that genuinely mean "act now". Words such as
	// "patch" or "fix" appear in almost every release and would badge them all.
	securityTerms = regexp.MustCompile(`(?i)\b(security|vulnerabilit(?:y|ies)|exploit(?:ed|able|s)?|remote code execution|rce|privilege escalation|xss|cross[- ]site scripting|csrf|cross[- ]site request forgery|sql injection|authentication bypass|authorization bypass|denial of service|malicious package|supply chain attack)\b`)
)

// IsSecurityRelease reports whether release notes describe a security fix.
// A CVE or GHSA identifier is always treated as one.
func IsSecurityRelease(name, summary, body string) bool {
	text := name + "\n" + summary + "\n" + body
	return cvePattern.MatchString(text) || ghsaPattern.MatchString(text) || securityTerms.MatchString(text)
}

// backfillSecurityFlags fills the flag for releases stored before it existed.
// It runs once and is recorded so a restart does not rescan the table.
func (w *Runner) backfillSecurityFlags(ctx context.Context) {
	const settingKey = "securityBackfillV1"
	var value string
	err := w.db.QueryRowContext(ctx, `SELECT value FROM "SystemSetting" WHERE key=?`, settingKey).Scan(&value)
	if err == nil {
		return
	}

	rows, err := w.db.QueryContext(ctx, `SELECT id, COALESCE(name,''), COALESCE(changelogSummary,''), COALESCE(body,'') FROM "Release" WHERE securityRelevant=0 AND (COALESCE(body,'')<>'' OR COALESCE(name,'')<>'')`)
	if err != nil {
		w.logger.Warn("security flag backfill skipped", "error", err.Error())
		return
	}
	type releaseRow struct {
		id, name, summary, body string
	}
	pending := make([]releaseRow, 0, 256)
	for rows.Next() {
		var row releaseRow
		if err := rows.Scan(&row.id, &row.name, &row.summary, &row.body); err != nil {
			_ = rows.Close()
			w.logger.Warn("security flag backfill skipped", "error", err.Error())
			return
		}
		pending = append(pending, row)
	}
	_ = rows.Close()

	flagged := 0
	for _, row := range pending {
		if !IsSecurityRelease(row.name, row.summary, row.body) {
			continue
		}
		if _, err := w.db.ExecContext(ctx, `UPDATE "Release" SET securityRelevant=1 WHERE id=?`, row.id); err != nil {
			w.logger.Warn("could not flag security release", "release_id", row.id, "error", err.Error())
			return
		}
		flagged++
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := w.db.ExecContext(ctx, `INSERT OR REPLACE INTO "SystemSetting" (id,key,value,encrypted,createdAt,updatedAt) VALUES (?,?,?,0,?,?)`, newID(), settingKey, "true", now, now); err != nil {
		w.logger.Warn("could not record security backfill", "error", err.Error())
		return
	}
	if flagged > 0 {
		w.logger.Info("flagged existing security releases", "count", flagged, "scanned", len(pending))
	}
}

// tagFilters is the parsed form of WatchedApp.excludeTags.
type tagFilters struct {
	patterns []*regexp.Regexp
}

func parseTagFilters(raw string) tagFilters {
	fields := strings.FieldsFunc(raw, func(r rune) bool {
		return r == '\n' || r == ',' || r == ';'
	})
	filters := tagFilters{}
	for _, field := range fields {
		pattern := strings.TrimSpace(field)
		if pattern == "" {
			continue
		}
		expression, err := globToRegexp(pattern)
		if err != nil {
			continue
		}
		filters.patterns = append(filters.patterns, expression)
	}
	return filters
}

// Matches reports whether a tag matches one of the exclusion patterns.
func (f tagFilters) Matches(tag string) bool {
	for _, pattern := range f.patterns {
		if pattern.MatchString(tag) {
			return true
		}
	}
	return false
}

// globToRegexp compiles a simple glob (* and ?) into a case-insensitive,
// fully anchored expression. Everything else is quoted, so a user cannot
// accidentally write a runaway regular expression.
func globToRegexp(pattern string) (*regexp.Regexp, error) {
	var builder strings.Builder
	builder.WriteString(`(?i)^`)
	for _, character := range pattern {
		switch character {
		case '*':
			builder.WriteString(`.*`)
		case '?':
			builder.WriteString(`.`)
		default:
			builder.WriteString(regexp.QuoteMeta(string(character)))
		}
	}
	builder.WriteString(`$`)
	return regexp.Compile(builder.String())
}
