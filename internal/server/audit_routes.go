package server

import (
	"net/http"
	"strings"
)

func (s *Server) listAudit(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.adminOnly(w, r)
	if !ok {
		return
	}
	page, perPage := queryInt(r, "page", 1, 1, 1_000_000), queryInt(r, "perPage", 50, 1, 200)
	action := strings.TrimSpace(r.URL.Query().Get("action"))
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	where := []string{"1=1"}
	args := []any{}
	if action != "" {
		where = append(where, "action=?")
		args = append(args, action)
	}
	if query != "" {
		where = append(where, "(action LIKE ? OR target LIKE ? OR targetId LIKE ?)")
		pattern := "%" + strings.ReplaceAll(strings.ReplaceAll(query, "%", "\\%"), "_", "\\_") + "%"
		args = append(args, pattern, pattern, pattern)
	}
	predicate := strings.Join(where, " AND ")
	var total int
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT count(*) FROM "AuditLog" WHERE `+predicate, args...).Scan(&total); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load audit history")
		return
	}
	queryArgs := append(append([]any{}, args...), perPage, (page-1)*perPage)
	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT id,userId,action,target,targetId,metadata,ipAddress,createdAt FROM "AuditLog" WHERE `+predicate+` ORDER BY createdAt DESC LIMIT ? OFFSET ?`, queryArgs...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load audit history")
		return
	}
	defer rows.Close()
	type auditRow struct {
		ID        string  `json:"id"`
		UserID    *string `json:"userId"`
		Action    string  `json:"action"`
		Target    *string `json:"target"`
		TargetID  *string `json:"targetId"`
		Metadata  *string `json:"metadata"`
		IPAddress *string `json:"ipAddress"`
		CreatedAt string  `json:"createdAt"`
	}
	items := []auditRow{}
	for rows.Next() {
		var item auditRow
		if err := rows.Scan(&item.ID, &item.UserID, &item.Action, &item.Target, &item.TargetID, &item.Metadata, &item.IPAddress, &item.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read audit history")
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not read audit history")
		return
	}
	s.writeAudit(r.Context(), actor.UserID, "admin.audit_view", "audit-log", map[string]any{"page": page, "action": action}, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]any{"logs": items, "total": total, "page": page, "perPage": perPage})
}

func (s *Server) clearAudit(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.adminOnly(w, r)
	if !ok {
		return
	}
	if _, err := s.store.DB().ExecContext(r.Context(), `DELETE FROM "AuditLog"`); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not clear audit history")
		return
	}
	s.writeAudit(r.Context(), actor.UserID, "admin.audit_cleared", "audit-log", nil, s.clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
