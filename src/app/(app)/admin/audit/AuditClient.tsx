"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  RefreshCw,
  Shield,
  User,
  Settings,
  Bell,
  LogIn,
  LogOut,
  Key,
  Package,
  AlertTriangle,
  Trash2,
  Search,
} from "lucide-react";
import { describeAction } from "@/lib/audit-actions";
import { csrfFetch } from "@/lib/csrf-client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import { EmptyState, SkeletonRows } from "@/components/ui/Card";
import { List, Panel, RowAvatar, type StatusTone } from "@/components/ui/List";
import { Input } from "@/components/ui/Input";

type AuditEntry = {
  id: string;
  userId: string | null;
  action: string;
  target: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user?: { name: string; email: string } | null;
};

const actionCategories = [
  { label: "All", value: "" },
  { label: "Apps", value: "app." },
  { label: "Users", value: "user." },
  { label: "Catalogue", value: "catalogue." },
  { label: "GitHub", value: "github." },
  { label: "Backups", value: "backup." },
  { label: "Admin", value: "admin." },
];

function actionIcon(action: string) {
  if (action.startsWith("user.login") || action.startsWith("user.logout")) return action.startsWith("user.login") ? LogIn : LogOut;
  if (action.startsWith("user.")) return User;
  if (action.startsWith("settings.")) return Settings;
  if (action.startsWith("notification.")) return Bell;
  if (action.startsWith("app.")) return Package;
  if (action.startsWith("mfa.")) return Key;
  if (action === "admin.audit_view") return Shield;
  return AlertTriangle;
}

function actionTone(action: string): StatusTone {
  if (action.includes("login") || action.includes("logout")) return "success";
  if (action.includes("deleted") || action.includes("stop")) return "danger";
  if (action.includes("created") || action.includes("setup")) return "accent";
  return "neutral";
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AuditClient() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filterAction, setFilterAction] = useState("");
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const perPage = 50;
  const { addToast } = useToast();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(perPage), offset: String(page * perPage) });
      if (filterAction) params.set("action", filterAction);
      const res = await fetch(`/api/admin/audit?${params}`);
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      const data = await res.json();
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err) {
      logger.error("Failed to fetch audit logs", err);
    } finally {
      setLoading(false);
    }
  }, [page, filterAction]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const clearLogs = useCallback(async () => {
    setClearing(true);
    try {
      const params = new URLSearchParams();
      if (filterAction) params.set("action", filterAction);
      const res = await csrfFetch(`/api/admin/audit?${params}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear audit logs");
      addToast("Audit logs cleared", "success");
      setPage(0);
      await fetchLogs();
    } catch (err) {
      logger.error("Failed to clear audit logs", err);      addToast("Failed to clear audit logs", "error");
    } finally {
      setClearing(false);
    }
  }, [filterAction, fetchLogs, addToast]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="relative max-w-sm">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint"
          />
          <Input
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(0); setExpandedId(null); }}
            placeholder="Filter by action…"
            aria-label="Filter audit log by action"
            className="pl-8"
          />
        </div>
        <div className="chip-row" role="group" aria-label="Filter audit log by category">
          {actionCategories.map((category) => (
            <button
              key={category.label}
              type="button"
              className="chip"
              data-active={filterAction === category.value}
              aria-pressed={filterAction === category.value}
              onClick={() => { setFilterAction(category.value); setPage(0); setExpandedId(null); }}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      <Panel
        title="Audit log"
        description={`${total} event${total === 1 ? "" : "s"} recorded${filterAction ? ` matching “${filterAction}”` : ""}.`}
        actions={
          <>
            <button type="button" onClick={fetchLogs} className="btn btn--ghost btn--sm">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              disabled={clearing || total === 0}
              className="btn btn--danger btn--sm"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {clearing ? "Clearing…" : "Clear logs"}
            </button>
          </>
        }
        flush={!loading && entries.length > 0}
      >
        {loading ? (
          <SkeletonRows rows={5} columns={3} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<Shield className="h-4 w-4" />}
            title="No audit events"
            description={filterAction ? "No events match this filter." : "Administrative actions will appear here."}
          />
        ) : (
          <List>
            {entries.map((entry) => {
              const Icon = actionIcon(entry.action);
              const expanded = expandedId === entry.id;
              const hasMetadata = Boolean(entry.metadata && Object.keys(entry.metadata as Record<string, unknown>).length > 0);
              return (
                <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                  <RowAvatar tone={actionTone(entry.action)}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </RowAvatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-text">{describeAction(entry.action)}</span>
                      {entry.target && (
                        <span className="truncate text-sm text-text-muted">
                          {entry.target}{entry.targetId ? ` #${entry.targetId.slice(0, 8)}` : ""}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-faint">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {formatTime(entry.createdAt)}
                      </span>
                      {entry.user ? (
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" aria-hidden="true" />
                          {entry.user.name || entry.user.email}
                        </span>
                      ) : entry.userId ? (
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" aria-hidden="true" />
                          deleted user
                        </span>
                      ) : null}
                      {entry.ipAddress && <span className="mono">{entry.ipAddress}</span>}
                    </div>
                    {hasMetadata && (
                      <>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => setExpandedId(expanded ? null : entry.id)}
                          className="mt-2 text-xs text-text-muted transition-colors hover:text-text"
                        >
                          {expanded ? "Hide details" : "Show details"}
                        </button>
                        {expanded && (
                          <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-surface p-2 text-xs text-text-muted">
                            {JSON.stringify(entry.metadata, null, 2)}
                          </pre>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </List>
        )}
      </Panel>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="btn btn--ghost btn--sm"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="btn btn--ghost btn--sm"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear audit logs"
        message={
          filterAction
            ? `This permanently deletes every audit log matching “${filterAction}”. This action cannot be undone.`
            : "This permanently deletes every audit log. This action cannot be undone."
        }
        confirmLabel="Clear logs"
        cancelLabel="Cancel"
        variant="danger"
        confirmText="CLEAR LOGS"
        onConfirm={() => {
          setShowClearConfirm(false);
          clearLogs();
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
