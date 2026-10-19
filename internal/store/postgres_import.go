package store

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

var importOrder = []string{
	"User",
	"SystemSetting",
	"IntegrationSetting",
	"NotificationChannel",
	"Session",
	"TrustedDevice",
	"PasskeyCredential",
	"WatchedApp",
	"NotificationPreference",
	"TelegramLink",
	"TelegramLinkToken",
	"GitHubLink",
	"TrackedIssue",
	"IssueNotificationSetting",
	"Release",
	"NotificationEvent",
	"AuditLog",
	"Backup",
}

// ImportPostgres copies the application tables into a newly created SQLite
// file. The source transaction is explicitly read-only; the target must not
// already exist so a failed or repeated import cannot overwrite user data.
func ImportPostgres(ctx context.Context, sourceURL, targetPath string) (map[string]int64, error) {
	if strings.TrimSpace(sourceURL) == "" {
		return nil, fmt.Errorf("PostgreSQL source URL is required")
	}
	if strings.TrimSpace(targetPath) == "" || targetPath == ":memory:" {
		return nil, fmt.Errorf("a new SQLite target file path is required")
	}
	absolute, err := filepath.Abs(targetPath)
	if err != nil {
		return nil, fmt.Errorf("resolve SQLite target path: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(absolute), 0o700); err != nil {
		return nil, fmt.Errorf("create SQLite target directory: %w", err)
	}
	file, err := os.OpenFile(absolute, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("create new SQLite target (it must not already exist): %w", err)
	}
	if err := file.Close(); err != nil {
		return nil, fmt.Errorf("initialize SQLite target file: %w", err)
	}
	completed := false
	defer func() {
		if !completed {
			_ = os.Remove(absolute)
			_ = os.Remove(absolute + "-wal")
			_ = os.Remove(absolute + "-shm")
		}
	}()

	pg, err := sql.Open("pgx", sourceURL)
	if err != nil {
		return nil, fmt.Errorf("open read-only PostgreSQL source: %w", err)
	}
	defer pg.Close()
	pg.SetMaxOpenConns(1)
	pg.SetConnMaxLifetime(0)

	readTx, err := pg.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return nil, fmt.Errorf("begin read-only PostgreSQL snapshot: %w", err)
	}
	defer func() { _ = readTx.Rollback() }()

	dst, err := Open(ctx, absolute)
	if err != nil {
		return nil, err
	}
	defer dst.Close()
	writeTx, err := dst.DB().BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin SQLite import: %w", err)
	}
	defer func() { _ = writeTx.Rollback() }()
	if _, err := writeTx.ExecContext(ctx, `PRAGMA defer_foreign_keys = ON`); err != nil {
		return nil, fmt.Errorf("defer SQLite foreign keys during import: %w", err)
	}

	counts := make(map[string]int64, len(importOrder))
	for _, table := range importOrder {
		count, err := copyPostgresTable(ctx, readTx, writeTx, table)
		if err != nil {
			return nil, fmt.Errorf("import table %s: %w", table, err)
		}
		var sourceCount, targetCount int64
		if err := readTx.QueryRowContext(ctx, `SELECT count(*) FROM "`+table+`"`).Scan(&sourceCount); err != nil {
			return nil, fmt.Errorf("verify PostgreSQL row count for %s: %w", table, err)
		}
		if err := writeTx.QueryRowContext(ctx, `SELECT count(*) FROM "`+table+`"`).Scan(&targetCount); err != nil {
			return nil, fmt.Errorf("verify SQLite row count for %s: %w", table, err)
		}
		if count != sourceCount || count != targetCount {
			return nil, fmt.Errorf("row count mismatch for %s (copied %d, source %d, target %d)", table, count, sourceCount, targetCount)
		}
		counts[table] = count
	}
	if err := writeTx.Commit(); err != nil {
		return nil, fmt.Errorf("commit SQLite import: %w", err)
	}

	rows, err := dst.DB().QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return nil, fmt.Errorf("check imported relationships: %w", err)
	}
	defer rows.Close()
	if rows.Next() {
		var table, parent string
		var rowID, foreignKeyID any
		if err := rows.Scan(&table, &rowID, &parent, &foreignKeyID); err != nil {
			return nil, fmt.Errorf("read foreign key validation result: %w", err)
		}
		return nil, fmt.Errorf("foreign key validation failed for imported table %s", table)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("finish foreign key validation: %w", err)
	}
	rows.Close()
	var integrity string
	if err := dst.DB().QueryRowContext(ctx, `PRAGMA integrity_check`).Scan(&integrity); err != nil {
		return nil, fmt.Errorf("check imported database integrity: %w", err)
	}
	if integrity != "ok" {
		return nil, fmt.Errorf("SQLite integrity check failed: %s", integrity)
	}
	completed = true
	return counts, nil
}

func copyPostgresTable(ctx context.Context, source *sql.Tx, target *sql.Tx, table string) (int64, error) {
	query := `SELECT * FROM "` + strings.ReplaceAll(table, `"`, `""`) + `"`
	rows, err := source.QueryContext(ctx, query)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return 0, err
	}
	types, err := rows.ColumnTypes()
	if err != nil {
		return 0, err
	}
	quotedColumns := make([]string, len(columns))
	placeholders := make([]string, len(columns))
	for i, column := range columns {
		quotedColumns[i] = `"` + strings.ReplaceAll(column, `"`, `""`) + `"`
		placeholders[i] = "?"
	}
	insert := `INSERT INTO "` + table + `" (` + strings.Join(quotedColumns, ",") + `) VALUES (` + strings.Join(placeholders, ",") + `)`
	statement, err := target.PrepareContext(ctx, insert)
	if err != nil {
		return 0, err
	}
	defer statement.Close()

	values := make([]any, len(columns))
	destinations := make([]any, len(columns))
	var count int64
	for rows.Next() {
		for i := range values {
			destinations[i] = &values[i]
		}
		if err := rows.Scan(destinations...); err != nil {
			return count, err
		}
		converted := make([]any, len(columns))
		for i, value := range values {
			converted[i], err = sqliteValue(value, types[i].DatabaseTypeName())
			if err != nil {
				return count, fmt.Errorf("convert column %s: %w", columns[i], err)
			}
		}
		if _, err := statement.ExecContext(ctx, converted...); err != nil {
			return count, err
		}
		count++
	}
	if err := rows.Err(); err != nil {
		return count, err
	}
	return count, nil
}

func sqliteValue(value any, postgresType string) (any, error) {
	if value == nil {
		return nil, nil
	}
	typeName := strings.ToUpper(postgresType)
	switch typed := value.(type) {
	case bool:
		if typed {
			return int64(1), nil
		}
		return int64(0), nil
	case time.Time:
		return typed.UTC().Format(time.RFC3339Nano), nil
	case []byte:
		if strings.Contains(typeName, "JSON") || strings.HasSuffix(typeName, "[]") {
			return string(typed), nil
		}
		return append([]byte(nil), typed...), nil
	case int16:
		return int64(typed), nil
	case int32:
		return int64(typed), nil
	case int64, int, float64, float32, string:
		return typed, nil
	case driver.Valuer:
		converted, err := typed.Value()
		if err != nil {
			return nil, err
		}
		return sqliteValue(converted, postgresType)
	}

	reflected := reflect.ValueOf(value)
	if reflected.IsValid() && (reflected.Kind() == reflect.Slice || reflected.Kind() == reflect.Array) {
		if reflected.Type().Elem().Kind() == reflect.Uint8 {
			blob := make([]byte, reflected.Len())
			reflect.Copy(reflect.ValueOf(blob), reflected)
			if strings.Contains(typeName, "JSON") {
				return string(blob), nil
			}
			return blob, nil
		}
		encoded, err := json.Marshal(value)
		if err != nil {
			return nil, fmt.Errorf("encode PostgreSQL array as JSON: %w", err)
		}
		return string(encoded), nil
	}
	return nil, fmt.Errorf("unsupported PostgreSQL value type %T (%s)", value, postgresType)
}
