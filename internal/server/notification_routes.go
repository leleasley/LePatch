package server

import (
	"lepatch/internal/auth"
	"net/http"
)

func (s *Server) notificationHistory(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	page := queryInt(r, "page", 1, 1, 1_000_000)
	perPage := queryInt(r, "perPage", 25, 1, 100)
	var total int
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT count(*) FROM "NotificationEvent" e JOIN "Release" r ON r.id=e.releaseId JOIN "WatchedApp" a ON a.id=r.watchedAppId WHERE a.userId=?`, principal.UserID).Scan(&total); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load notification history")
		return
	}
	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT e.id,e.status,e.error,e.sentAt,e.createdAt,c.type,r.tagName,r.htmlUrl,r.releaseType,a.name,a.repoFullName
		FROM "NotificationEvent" e JOIN "Release" r ON r.id=e.releaseId JOIN "WatchedApp" a ON a.id=r.watchedAppId JOIN "NotificationChannel" c ON c.id=e.channelId
		WHERE a.userId=? ORDER BY e.createdAt DESC LIMIT ? OFFSET ?`, principal.UserID, perPage, (page-1)*perPage)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load notification history")
		return
	}
	defer rows.Close()
	type item struct {
		ID           string  `json:"id"`
		Status       string  `json:"status"`
		Error        *string `json:"error"`
		SentAt       *string `json:"sentAt"`
		CreatedAt    string  `json:"createdAt"`
		ChannelType  string  `json:"channelType"`
		TagName      string  `json:"tagName"`
		HTMLURL      string  `json:"htmlUrl"`
		ReleaseType  *string `json:"releaseType"`
		AppName      string  `json:"appName"`
		RepoFullName string  `json:"repoFullName"`
	}
	items := make([]item, 0, perPage)
	for rows.Next() {
		var value item
		if err := rows.Scan(&value.ID, &value.Status, &value.Error, &value.SentAt, &value.CreatedAt, &value.ChannelType, &value.TagName, &value.HTMLURL, &value.ReleaseType, &value.AppName, &value.RepoFullName); err != nil {
			writeError(w, http.StatusInternalServerError, "Could not read notification history")
			return
		}
		items = append(items, value)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not read notification history")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": items, "total": total, "page": page, "perPage": perPage})
}

func (s *Server) notificationEventSummary(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.PrincipalFromContext(r.Context())
	var pending, failed int
	if err := s.store.DB().QueryRowContext(r.Context(), `SELECT COALESCE(sum(CASE WHEN e.status='pending' THEN 1 ELSE 0 END),0),COALESCE(sum(CASE WHEN e.status='failed' THEN 1 ELSE 0 END),0) FROM "NotificationEvent" e JOIN "Release" r ON r.id=e.releaseId JOIN "WatchedApp" a ON a.id=r.watchedAppId WHERE a.userId=?`, principal.UserID).Scan(&pending, &failed); err != nil {
		writeError(w, http.StatusInternalServerError, "Could not load notification status")
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"pending": pending, "failed": failed})
}
