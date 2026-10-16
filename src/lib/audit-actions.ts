/**
 * Single source of truth for audit action names and their human-readable labels.
 *
 * `src/lib/audit.ts` re-exports these so both server routes and UI components can
 * share one definition. Previously the `AuditAction` union and the `describeAction`
 * map were duplicated verbatim in both files and had already drifted apart, so
 * keep the definitions here only.
 */

type AuditAction =
  | "user.login"
  | "user.logout"
  | "user.created"
  | "user.updated"
  | "user.deleted"
  | "user.password_reset"
  | "app.created"
  | "app.updated"
  | "app.deleted"
  | "app.check_triggered"
  | "admin.logs_cleared"
  | "admin.audit_cleared"
  | "admin.queues_cleared"
  | "settings.updated"
  | "notification.created"
  | "notification.updated"
  | "notification.deleted"
  | "mfa.setup"
  | "mfa.disabled"
  | "admin.audit_view"
  | "catalogue.created"
  | "catalogue.updated"
  | "catalogue.deleted"
  | "catalogue.featured"
  | "catalogue.suggestion_created"
  | "catalogue.suggestion_approved"
  | "catalogue.suggestion_rejected"
  | "github.connected"
  | "github.disconnected"
  | "github.issue_created"
  | "github.issue_tracked"
  | "github.issue_untracked"
  | "github.issue_commented"
  | "github.issue_closed"
  | "github.issue_reopened"
  | "backup.created"
  | "backup.deleted"
  | "backup.downloaded";

export { type AuditAction };

export function describeAction(action: string): string {
  const descriptions: Record<string, string> = {
    "user.login": "User logged in",
    "user.logout": "User logged out",
    "user.created": "User created",
    "user.updated": "User updated",
    "user.deleted": "User deleted",
    "user.password_reset": "Password reset",
    "app.created": "Watched app added",
    "app.updated": "Watched app updated",
    "app.deleted": "Watched app removed",
    "app.check_triggered": "Release check triggered",
    "settings.updated": "Settings updated",
    "admin.logs_cleared": "Logs cleared",
    "admin.audit_cleared": "Audit logs cleared",
    "admin.queues_cleared": "Failed queue jobs cleared",
    "notification.created": "Notification channel created",
    "notification.updated": "Notification channel updated",
    "notification.deleted": "Notification channel removed",
    "mfa.setup": "MFA enabled",
    "mfa.disabled": "MFA disabled",
    "admin.audit_view": "Audit log viewed",
    "catalogue.created": "Catalogue entry created",
    "catalogue.updated": "Catalogue entry updated",
    "catalogue.deleted": "Catalogue entry removed",
    "catalogue.featured": "Catalogue feature status changed",
    "catalogue.suggestion_created": "App suggestion submitted",
    "catalogue.suggestion_approved": "App suggestion approved",
    "catalogue.suggestion_rejected": "App suggestion rejected",
    "github.connected": "GitHub account connected",
    "github.disconnected": "GitHub account disconnected",
    "github.issue_created": "GitHub issue created",
    "github.issue_tracked": "Issue tracking enabled",
    "github.issue_untracked": "Issue tracking disabled",
    "github.issue_commented": "Comment posted on issue",
    "github.issue_closed": "Issue closed",
    "github.issue_reopened": "Issue reopened",
    "backup.created": "Database backup created",
    "backup.deleted": "Backup deleted",
    "backup.downloaded": "Backup downloaded",
  };
  return descriptions[action] || action;
}