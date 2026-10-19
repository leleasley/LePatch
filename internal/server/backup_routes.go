package server

import (
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

type backupSummary struct {
	ID          string  `json:"id"`
	Status      string  `json:"status"`
	Type        string  `json:"type"`
	Filename    string  `json:"filename"`
	SizeBytes   *int64  `json:"sizeBytes"`
	CreatedAt   string  `json:"createdAt"`
	CompletedAt *string `json:"completedAt"`
	Error       *string `json:"error"`
}

type backupScheduleSettings struct {
	Enabled bool `json:"enabled"`
	Time string `json:"time"`
	Frequency string `json:"frequency"`
	DayOfWeek string `json:"dayOfWeek"`
	DayOfMonth int `json:"dayOfMonth"`
}

func (s *Server) backupSchedule(w http.ResponseWriter,r *http.Request) {
	if _,ok:=s.adminOnly(w,r);!ok{return}
	settings:=backupScheduleSettings{Time:"03:00",Frequency:"daily",DayOfWeek:"0",DayOfMonth:1}
	for key,target:=range map[string]*string{"backupScheduleTime":&settings.Time,"backupScheduleFrequency":&settings.Frequency,"backupScheduleDayOfWeek":&settings.DayOfWeek} {var value string;if err:=s.store.DB().QueryRowContext(r.Context(),`SELECT value FROM "SystemSetting" WHERE key=?`,key).Scan(&value);err==nil{*target=value}else if err!=sql.ErrNoRows{writeError(w,http.StatusInternalServerError,"Could not read backup schedule");return}}
	var enabled string;if err:=s.store.DB().QueryRowContext(r.Context(),`SELECT value FROM "SystemSetting" WHERE key='backupEnabled'`).Scan(&enabled);err==nil{settings.Enabled=enabled=="true"}else if err!=sql.ErrNoRows{writeError(w,http.StatusInternalServerError,"Could not read backup schedule");return}
	var dom string;if err:=s.store.DB().QueryRowContext(r.Context(),`SELECT value FROM "SystemSetting" WHERE key='backupScheduleDayOfMonth'`).Scan(&dom);err==nil{if parsed,e:=strconv.Atoi(dom);e==nil{settings.DayOfMonth=parsed}}else if err!=sql.ErrNoRows{writeError(w,http.StatusInternalServerError,"Could not read backup schedule");return}
	writeJSON(w,http.StatusOK,settings)
}

func (s *Server) updateBackupSchedule(w http.ResponseWriter,r *http.Request) {
	actor,ok:=s.adminOnly(w,r);if !ok{return}
	var input backupScheduleSettings
	if !decodeJSON(w,r,&input){return}
	if !regexp.MustCompile(`^(?:[01]\d|2[0-3]):[0-5]\d$`).MatchString(input.Time){writeError(w,http.StatusBadRequest,"Backup time must be HH:MM");return}
	if input.Frequency!="daily"&&input.Frequency!="weekly"&&input.Frequency!="monthly"{writeError(w,http.StatusBadRequest,"Choose daily, weekly, or monthly backups");return}
	dow,e1:=strconv.Atoi(input.DayOfWeek);if e1!=nil||dow<0||dow>6{writeError(w,http.StatusBadRequest,"Backup weekday must be between 0 (Sunday) and 6 (Saturday)");return}
	if input.DayOfMonth<1||input.DayOfMonth>31{writeError(w,http.StatusBadRequest,"Backup day of month must be from 1 to 31");return}
	now:=time.Now().UTC().Format(time.RFC3339Nano)
	values:=map[string]string{"backupEnabled":strconv.FormatBool(input.Enabled),"backupScheduleTime":input.Time,"backupScheduleFrequency":input.Frequency,"backupScheduleDayOfWeek":input.DayOfWeek,"backupScheduleDayOfMonth":strconv.Itoa(input.DayOfMonth)}
	tx,err:=s.store.DB().BeginTx(r.Context(),nil);if err!=nil{writeError(w,http.StatusInternalServerError,"Could not save backup schedule");return};defer tx.Rollback()
	for key,value:=range values{if _,err:=tx.ExecContext(r.Context(),`INSERT INTO "SystemSetting" (id,key,value,encrypted,createdAt,updatedAt) VALUES (?,?,?,0,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt`,newID(),key,value,now,now);err!=nil{writeError(w,http.StatusInternalServerError,"Could not save backup schedule");return}}
	if _,err:=tx.ExecContext(r.Context(),`DELETE FROM "SystemSetting" WHERE key='backupLastScheduledRun'`);err!=nil{writeError(w,http.StatusInternalServerError,"Could not reset backup scheduler");return}
	if err:=tx.Commit();err!=nil{writeError(w,http.StatusInternalServerError,"Could not save backup schedule");return}
	s.writeAudit(r.Context(),actor.UserID,"settings.updated","backup-schedule",input,s.clientIP(r))
	writeJSON(w,http.StatusOK,map[string]bool{"ok":true})
}

func (s *Server) listBackups(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.adminOnly(w, r); !ok {
		return
	}
	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT id,status,type,filename,sizeBytes,createdAt,completedAt,error FROM "Backup" ORDER BY createdAt DESC LIMIT 200`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load backups")
		return
	}
	defer rows.Close()
	items := []backupSummary{}
	for rows.Next() {
		var item backupSummary
		if err := rows.Scan(&item.ID, &item.Status, &item.Type, &item.Filename, &item.SizeBytes, &item.CreatedAt, &item.CompletedAt, &item.Error); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read backups")
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not read backups")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"backups": items})
}

func (s *Server) createBackup(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.adminOnly(w, r)
	if !ok {
		return
	}
	backupDir := filepath.Join(s.config.DataDir, "backups")
	if err := os.MkdirAll(backupDir, 0o700); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not prepare backup storage")
		return
	}
	now := time.Now().UTC()
	stamp := now.Format("20060102T150405.000000000Z")
	filename := "lepatch-" + stamp + ".sqlite"
	path := filepath.Join(backupDir, filename)
	id := newID()
	created := now.Format(time.RFC3339Nano)
	if _, err := s.store.DB().ExecContext(r.Context(), `INSERT INTO "Backup" (id,status,type,filename,filepath,createdAt) VALUES (?,'pending','manual',?,?,?)`, id, filename, path, created); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create backup record")
		return
	}
	if _, err := s.store.DB().ExecContext(r.Context(), `VACUUM INTO ?`, path); err != nil {
		_, _ = s.store.DB().ExecContext(r.Context(), `UPDATE "Backup" SET status='failed',error=?,completedAt=? WHERE id=?`, safeBackupError(err), time.Now().UTC().Format(time.RFC3339Nano), id)
		writeError(w, http.StatusInternalServerError, "SQLite backup failed")
		return
	}
	info, err := os.Stat(path)
	if err != nil {
		_, _ = s.store.DB().ExecContext(r.Context(), `UPDATE "Backup" SET status='failed',error='Backup file could not be verified',completedAt=? WHERE id=?`, time.Now().UTC().Format(time.RFC3339Nano), id)
		writeError(w, http.StatusInternalServerError, "Backup file could not be verified")
		return
	}
	completed := time.Now().UTC().Format(time.RFC3339Nano)
	size := info.Size()
	if _, err := s.store.DB().ExecContext(r.Context(), `UPDATE "Backup" SET status='completed',sizeBytes=?,completedAt=? WHERE id=?`, size, completed, id); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not finish backup record")
		return
	}
	s.writeAudit(r.Context(), actor.UserID, "backup.created", filename, map[string]int64{"sizeBytes": size}, s.clientIP(r))
	writeJSON(w, http.StatusCreated, map[string]any{"backup": backupSummary{ID: id, Status: "completed", Type: "manual", Filename: filename, SizeBytes: &size, CreatedAt: created, CompletedAt: &completed}})
}

func (s *Server) downloadBackup(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.adminOnly(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	var path, filename string
	err := s.store.DB().QueryRowContext(r.Context(), `SELECT filepath,filename FROM "Backup" WHERE id=? AND status='completed'`, id).Scan(&path, &filename)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "Backup not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load backup")
		return
	}
	path, ok = resolveBackupPath(filepath.Join(s.config.DataDir, "backups"), path, filename)
	if !ok {
		writeError(w, http.StatusNotFound, "This legacy backup is stored outside the current backup directory")
		return
	}
	file, err := os.Open(path)
	if err != nil {
		writeError(w, http.StatusNotFound, "Backup file is unavailable")
		return
	}
	defer file.Close()
	s.writeAudit(r.Context(), actor.UserID, "backup.downloaded", filename, nil, s.clientIP(r))
	w.Header().Set("Content-Type", "application/vnd.sqlite3")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filepath.Base(filename)+`"`)
	http.ServeContent(w, r, filename, time.Time{}, file)
}

func (s *Server) deleteBackup(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.adminOnly(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	var path, filename string
	err := s.store.DB().QueryRowContext(r.Context(), `SELECT filepath,filename FROM "Backup" WHERE id=?`, id).Scan(&path, &filename)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "Backup not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load backup")
		return
	}
	path, ok = resolveBackupPath(filepath.Join(s.config.DataDir, "backups"), path, filename)
	if !ok {
		writeError(w, http.StatusConflict, "This legacy backup is outside the current backup directory and cannot be removed here")
		return
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		writeError(w, http.StatusInternalServerError, "Could not remove backup file")
		return
	}
	if _, err := s.store.DB().ExecContext(r.Context(), `DELETE FROM "Backup" WHERE id=?`, id); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not remove backup record")
		return
	}
	s.writeAudit(r.Context(), actor.UserID, "backup.deleted", filename, nil, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func withinDirectory(directory, path string) bool {
	root, err := filepath.Abs(directory)
	if err != nil {
		return false
	}
	candidate, err := filepath.Abs(path)
	if err != nil {
		return false
	}
	relative, err := filepath.Rel(root, candidate)
	return err == nil && relative != "." && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func resolveBackupPath(directory, storedPath, filename string) (string, bool) {
	if withinDirectory(directory, storedPath) {
		return storedPath, true
	}
	if filepath.Base(filename) != filename || filename == "." || filename == string(filepath.Separator) {
		return "", false
	}
	candidate := filepath.Join(directory, filename)
	if !withinDirectory(directory, candidate) {
		return "", false
	}
	if _, err := os.Stat(candidate); err != nil {
		return "", false
	}
	return candidate, true
}
func safeBackupError(err error) string {
	if err == nil {
		return ""
	}
	return fmt.Sprintf("SQLite snapshot failed: %s", err.Error())
}
