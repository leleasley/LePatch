package worker

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func (w *Runner) maybeRunScheduledBackup(ctx context.Context) {
	if w.dataDir == "" {
		return
	}
	w.backupMu.Lock()
	defer w.backupMu.Unlock()
	var enabled, rawTime, frequency, dayOfWeek, dayOfMonth, lastRun sql.NullString
	for key, output := range map[string]*sql.NullString{
		"backupEnabled": &enabled, "backupScheduleTime": &rawTime, "backupScheduleFrequency": &frequency,
		"backupScheduleDayOfWeek": &dayOfWeek, "backupScheduleDayOfMonth": &dayOfMonth, "backupLastScheduledRun": &lastRun,
	} {
		if err := w.db.QueryRowContext(ctx, `SELECT value FROM "SystemSetting" WHERE key=?`, key).Scan(&output.String); err == nil {
			output.Valid = true
		} else if err != sql.ErrNoRows {
			w.logger.Error("read backup schedule setting", "key", key, "error", err.Error())
			return
		}
	}
	if !enabled.Valid || enabled.String != "true" {
		return
	}
	location, err := time.LoadLocation("Europe/London")
	if err != nil {
		w.logger.Error("load backup schedule timezone", "error", err.Error())
		return
	}
	clock := "03:00"
	if rawTime.Valid {
		clock = rawTime.String
	}
	parts := strings.Split(clock, ":")
	if len(parts) != 2 {
		w.logger.Warn("invalid scheduled backup time", "value", clock)
		return
	}
	hour, e1 := strconv.Atoi(parts[0])
	minute, e2 := strconv.Atoi(parts[1])
	if e1 != nil || e2 != nil || hour < 0 || hour > 23 || minute < 0 || minute > 59 {
		w.logger.Warn("invalid scheduled backup time", "value", clock)
		return
	}
	now := time.Now().In(location)
	freq := "daily"
	if frequency.Valid && frequency.String != "" {
		freq = frequency.String
	}
	if now.Hour() < hour || (now.Hour() == hour && now.Minute() < minute) || !backupDayMatches(now, freq, dayOfWeek.String, dayOfMonth.String) {
		return
	}
	dateKey := now.Format("2006-01-02")
	if lastRun.Valid && lastRun.String == dateKey {
		return
	}
	if err := w.createScheduledBackup(ctx); err != nil {
		w.logger.Error("scheduled database backup failed", "error", err.Error())
		return
	}
	nowUTC := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = w.db.ExecContext(ctx, `INSERT INTO "SystemSetting" (id,key,value,encrypted,createdAt,updatedAt) VALUES (?,?,?,0,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt`, newID(), "backupLastScheduledRun", dateKey, nowUTC, nowUTC)
	if err != nil {
		w.logger.Error("record scheduled backup run", "error", err.Error())
	}
}

func backupDayMatches(now time.Time, frequency, dayOfWeek, dayOfMonth string) bool {
	if dayOfWeek == "daily" {
		return true
	}
	switch frequency {
	case "daily":
		return true
	case "weekly":
		weekday, err := strconv.Atoi(dayOfWeek)
		if err != nil {
			weekday = 0
		}
		if weekday < 0 || weekday > 6 {
			return false
		}
		return int(now.Weekday()) == weekday
	case "monthly":
		day, err := strconv.Atoi(dayOfMonth)
		if err != nil {
			day = 1
		}
		if day < 1 || day > 31 {
			return false
		}
		return now.Day() == day
	default:
		return false
	}
}

func (w *Runner) createScheduledBackup(ctx context.Context) error {
	directory := filepath.Join(w.dataDir, "backups")
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return err
	}
	now := time.Now().UTC()
	filename := "lepatch-" + now.Format("20060102T150405.000000000Z") + ".sqlite"
	path := filepath.Join(directory, filename)
	id := newID()
	created := now.Format(time.RFC3339Nano)
	if _, err := w.db.ExecContext(ctx, `INSERT INTO "Backup" (id,status,type,filename,filepath,createdAt) VALUES (?,'pending','scheduled',?,?,?)`, id, filename, path, created); err != nil {
		return err
	}
	if _, err := w.db.ExecContext(ctx, `VACUUM INTO ?`, path); err != nil {
		_, _ = w.db.ExecContext(ctx, `UPDATE "Backup" SET status='failed',error=?,completedAt=? WHERE id=?`, truncateText(err.Error(), 500), time.Now().UTC().Format(time.RFC3339Nano), id)
		return err
	}
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	completed := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := w.db.ExecContext(ctx, `UPDATE "Backup" SET status='completed',sizeBytes=?,completedAt=? WHERE id=?`, info.Size(), completed, id); err != nil {
		return err
	}
	if err := w.pruneScheduledBackups(ctx, directory); err != nil {
		return err
	}
	w.logger.Info("scheduled database backup completed", "filename", filename, "size_bytes", info.Size())
	return nil
}

func (w *Runner) pruneScheduledBackups(ctx context.Context, directory string) error {
	rows, err := w.db.QueryContext(ctx, `SELECT id,filename,filepath FROM "Backup" WHERE status='completed' ORDER BY createdAt DESC LIMIT -1 OFFSET 5`)
	if err != nil {
		return err
	}
	type stale struct{ id, filename, path string }
	items := make([]stale, 0)
	for rows.Next() {
		var item stale
		if err := rows.Scan(&item.id, &item.filename, &item.path); err != nil {
			rows.Close()
			return err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for _, item := range items {
		if filepath.Base(item.path) == item.filename && filepath.Dir(item.path) == directory {
			if err := os.Remove(item.path); err != nil && !os.IsNotExist(err) {
				return fmt.Errorf("remove retained backup %s: %w", item.filename, err)
			}
		}
		if _, err := w.db.ExecContext(ctx, `DELETE FROM "Backup" WHERE id=?`, item.id); err != nil {
			return err
		}
	}
	return nil
}
