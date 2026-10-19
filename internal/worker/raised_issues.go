package worker

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	gh "lepatch/internal/github"
	"lepatch/internal/secrets"
)

type linkedGitHubAccount struct{ userID, username, encryptedToken string }
type issueSearchResult struct {
	Items []raisedIssue `json:"items"`
}
type raisedIssue struct {
	ID          int64   `json:"id"`
	Number      int     `json:"number"`
	Title       string  `json:"title"`
	Body        *string `json:"body"`
	State       string  `json:"state"`
	StateReason *string `json:"state_reason"`
	URL         string  `json:"html_url"`
	User        struct {
		Login string `json:"login"`
	} `json:"user"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
	ClosedAt  *string `json:"closed_at"`
	Comments  int     `json:"comments"`
}

func (w *Runner) syncRaisedIssues(ctx context.Context) {
	now := time.Now()
	rows, err := w.db.QueryContext(ctx, `SELECT userId,githubUsername,accessToken FROM "GitHubLink"`)
	if err != nil {
		w.logger.Error("load GitHub links for raised issues", "error", err.Error())
		return
	}
	accounts := make([]linkedGitHubAccount, 0)
	for rows.Next() {
		var account linkedGitHubAccount
		if err := rows.Scan(&account.userID, &account.username, &account.encryptedToken); err != nil {
			w.logger.Warn("read GitHub link for raised issues", "error", err.Error())
			continue
		}
		accounts = append(accounts, account)
	}
	_ = rows.Close()
	if err := rows.Err(); err != nil {
		w.logger.Error("iterate GitHub links for raised issues", "error", err.Error())
		return
	}
	for _, account := range accounts {
		w.issueMu.Lock()
		last := w.lastIssueSync[account.userID]
		due := last.IsZero() || now.Sub(last) >= 10*time.Minute
		if due {
			w.lastIssueSync[account.userID] = now
		}
		w.issueMu.Unlock()
		if !due {
			continue
		}
		if err := w.syncUserRaisedIssues(ctx, account); err != nil {
			w.logger.Warn("raised issue sync failed", "user_id", account.userID, "error", err.Error())
		}
	}
}

func (w *Runner) syncUserRaisedIssues(ctx context.Context, account linkedGitHubAccount) error {
	token, err := secrets.DecryptIntegrationValue(w.encryptionKey, account.encryptedToken)
	if err != nil {
		return fmt.Errorf("could not read linked GitHub credentials")
	}
	client := gh.NewClient(w.db, token, account.userID)
	query := url.Values{}
	query.Set("q", "is:issue author:"+account.username)
	query.Set("sort", "updated")
	query.Set("order", "desc")
	query.Set("per_page", "100")
	result, err := client.Get(ctx, "search/issues?"+query.Encode())
	if err != nil {
		return err
	}
	var search issueSearchResult
	if err = json.Unmarshal(result.Body, &search); err != nil {
		return fmt.Errorf("GitHub returned an invalid issue search result")
	}
	for _, issue := range search.Items {
		if issue.ID == 0 || issue.Number < 1 || issue.User.Login == "" || issue.CreatedAt == "" || issue.UpdatedAt == "" {
			continue
		}
		if err := w.upsertRaisedIssue(ctx, account.userID, issue); err != nil {
			return err
		}
	}
	if len(search.Items) > 0 && !result.Stale {
		_, _ = w.hub.Publish(account.userID, "raised-issue.updated", map[string]any{"count": len(search.Items)})
	}
	return nil
}

func (w *Runner) upsertRaisedIssue(ctx context.Context, userID string, issue raisedIssue) error {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	issueID := strconv.FormatInt(issue.ID, 10)
	var oldComments, unread int
	err := w.db.QueryRowContext(ctx, `SELECT commentCount,unreadCommentCount FROM "RaisedIssue" WHERE userId=? AND githubIssueId=?`, userID, issueID).Scan(&oldComments, &unread)
	if err != nil && err != sql.ErrNoRows {
		return fmt.Errorf("read raised issue state: %w", err)
	}
	newIssue := err == sql.ErrNoRows
	newUnread := unread
	if newIssue {
		newUnread = 0
	} else if issue.Comments > oldComments {
		newUnread += issue.Comments - oldComments
	}
	var closed any
	if issue.ClosedAt != nil {
		closed = *issue.ClosedAt
	}
	_, err = w.db.ExecContext(ctx, `INSERT INTO "RaisedIssue" (id,userId,githubIssueId,owner,repo,issueNumber,title,body,state,stateReason,htmlUrl,authorLogin,createdAtGitHub,updatedAtGitHub,closedAtGitHub,commentCount,lastCommentCount,unreadCommentCount,lastCheckedAt,createdAt,updatedAt)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(userId,githubIssueId) DO UPDATE SET owner=excluded.owner,repo=excluded.repo,issueNumber=excluded.issueNumber,title=excluded.title,body=excluded.body,state=excluded.state,stateReason=excluded.stateReason,htmlUrl=excluded.htmlUrl,authorLogin=excluded.authorLogin,createdAtGitHub=excluded.createdAtGitHub,updatedAtGitHub=excluded.updatedAtGitHub,closedAtGitHub=excluded.closedAtGitHub,lastCommentCount=RaisedIssue.commentCount,commentCount=excluded.commentCount,unreadCommentCount=?,lastCheckedAt=excluded.lastCheckedAt,updatedAt=excluded.updatedAt`,
		newID(), userID, strconv.FormatInt(issue.ID, 10), issueRepoOwner(issue.URL), issueRepoName(issue.URL), issue.Number, issue.Title, issue.Body, issue.State, issue.StateReason, issue.URL, issue.User.Login, issue.CreatedAt, issue.UpdatedAt, closed, issue.Comments, issue.Comments, newUnread, now, now, now, newUnread)
	if err != nil {
		return fmt.Errorf("save raised issue: %w", err)
	}
	if !newIssue && issue.Comments > oldComments {
		_, _ = w.hub.Publish(userID, "raised-issue.comment", map[string]any{"id": issueID, "owner": issueRepoOwner(issue.URL), "repo": issueRepoName(issue.URL), "issueNumber": issue.Number, "newComments": issue.Comments - oldComments})
	}
	return nil
}

func issueRepoOwner(issueURL string) string {
	parsed, err := url.Parse(issueURL)
	if err != nil {
		return ""
	}
	parts := splitPath(parsed.Path)
	if len(parts) < 4 {
		return ""
	}
	return parts[0]
}
func issueRepoName(issueURL string) string {
	parsed, err := url.Parse(issueURL)
	if err != nil {
		return ""
	}
	parts := splitPath(parsed.Path)
	if len(parts) < 4 {
		return ""
	}
	return parts[1]
}
func splitPath(path string) []string {
	result := make([]string, 0, 4)
	for _, part := range strings.Split(path, "/") {
		if part != "" {
			result = append(result, part)
		}
	}
	return result
}
