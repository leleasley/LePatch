package store

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql migrations/*.sql
var schemaFiles embed.FS

type Store struct {
	db *sql.DB
}

func Open(ctx context.Context, path string) (*Store, error) {
	if path == "" {
		return nil, fmt.Errorf("database path is required")
	}
	if path != ":memory:" {
		absolute, err := filepath.Abs(path)
		if err != nil {
			return nil, fmt.Errorf("resolve database path: %w", err)
		}
		if err := os.MkdirAll(filepath.Dir(absolute), 0o700); err != nil {
			return nil, fmt.Errorf("create database directory: %w", err)
		}
		path = absolute
	}

	dsn := path
	if path != ":memory:" {
		u := url.URL{Scheme: "file", Path: path}
		query := url.Values{}
		query.Add("_pragma", "foreign_keys(1)")
		query.Add("_pragma", "busy_timeout(5000)")
		query.Add("_pragma", "journal_mode(WAL)")
		query.Add("_pragma", "synchronous(NORMAL)")
		u.RawQuery = query.Encode()
		dsn = u.String()
	} else {
		dsn = "file:lepatch-memory?mode=memory&cache=shared&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)"
	}

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open SQLite database: %w", err)
	}
	db.SetMaxOpenConns(8)
	db.SetMaxIdleConns(8)
	db.SetConnMaxLifetime(0)

	store := &Store{db: db}
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("connect to SQLite database: %w", err)
	}
	if err := store.Migrate(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) DB() *sql.DB { return s.db }

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) Migrate(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS "SchemaMigration" (
		version INTEGER PRIMARY KEY,
		appliedAt TEXT NOT NULL
	)`); err != nil {
		return fmt.Errorf("create migration ledger: %w", err)
	}
	if err := s.applyMigration(ctx, 1, "schema.sql"); err != nil {
		return err
	}
	if err := s.applyMigration(ctx, 2, "migrations/0002_raised_issues.sql"); err != nil {
		return err
	}
	if err := s.applyMigration(ctx, 3, "migrations/0003_notification_delivery.sql"); err != nil {
		return err
	}
	return nil
}

func (s *Store) applyMigration(ctx context.Context, version int, resource string) error {
	var applied bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM "SchemaMigration" WHERE version = ?)`, version).Scan(&applied); err != nil {
		return fmt.Errorf("read migration ledger version %d: %w", version, err)
	}
	if applied {
		return nil
	}
	script, err := schemaFiles.ReadFile(resource)
	if err != nil {
		return fmt.Errorf("read embedded migration %s: %w", resource, err)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin migration %d: %w", version, err)
	}
	defer func() { _ = tx.Rollback() }()
	for _, statement := range strings.Split(string(script), ";") {
		statement = strings.TrimSpace(statement)
		if statement == "" {
			continue
		}
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("apply migration %d: %w", version, err)
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO "SchemaMigration"(version, appliedAt) VALUES (?, ?)`, version, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		return fmt.Errorf("record migration %d: %w", version, err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit migration %d: %w", version, err)
	}
	return nil
}
