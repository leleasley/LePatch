"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Filter, RefreshCw, Shield, User, Server, Settings, Bell, LogIn, LogOut, Key, Package, AlertTriangle, Trash2 } from "lucide-react";
import { describeAction } from "@/lib/audit-actions";
import { csrfFetch } from "@/lib/csrf-client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/lib/toast";
import { logger } from "@/lib/logger";

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

function actionIcon(action: string) {
  if (action.startsWith("user.login") || action.startsWith("user.logout")) return action.startsWith("user.login") ? LogIn : LogOut;
  if (action.startsWith("user.")) return User;
  if (action.startsWith("server.")) return Server;
  if (action.startsWith("settings.")) return Settings;
  if (action.startsWith("notification.")) return Bell;
  if (action.startsWith("app.")) return Package;
  if (action.startsWith("mfa.")) return Key;
  if (action === "admin.audit_view") return Shield;
  return AlertTriangle;
}

function actionColor(action: string): string {
  if (action.includes("login") || action.includes("logout")) return "text-status-success bg-status-success/10";
  if (action.includes("deleted") || action.includes("stop")) return "text-status-danger bg-status-danger/10";
  if (action.includes("created") || action.includes("setup")) return "text-accent bg-accent/10";
  if (action.startsWith("server.")) return "text-violet-400 bg-violet-500/10";
  return "text-text-muted bg-slate-500/10";
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
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-status-warning/10 p-3">
            <Shield className="h-6 w-6 text-status-warning" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-text">Audit Log</h1>
            <p className="mt-1 text-sm text-text-muted">
              Track administrative actions across the system
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Filter by action..."
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
            className="w-full rounded-lg border border-line/50 bg-panel/80 py-2 pl-10 pr-4 text-sm text-text placeholder-slate-500 outline-none focus:border-cyan-500/50"
          />
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 rounded-lg border border-line/50 bg-panel/80 px-4 py-2 text-sm text-text transition-colors hover:bg-white/5 hover:text-text"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
        <button
          onClick={() => setShowClearConfirm(true)}
          disabled={clearing || total === 0}
          className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-status-danger/10 px-4 py-2 text-sm text-status-danger transition-colors hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="h-4 w-4" />
          {clearing ? "Clearing..." : "Clear logs"}
        </button>
        <div className="text-sm text-text-muted">
          {total} event{total !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-text-muted">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
            Loading...
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <Shield className="mb-3 h-12 w-12 text-text-faint" />
            <p className="text-lg font-medium text-text-muted">No audit events yet</p>
            <p className="mt-1 text-sm">Administrative actions will appear here</p>
          </div>
        ) : (
          entries.map((entry) => {
            const Icon = actionIcon(entry.action);
            return (
              <div
                key={entry.id}
                className="flex items-start gap-4 rounded-xl border border-line/50 bg-panel/80 p-4 transition-colors hover:bg-white/[0.02]"
              >
                <div className={`rounded-lg p-2.5 ${actionColor(entry.action)}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-text">
                      {describeAction(entry.action)}
                    </span>
                    {entry.target && (
                      <span className="truncate text-sm text-text-muted">
                        {entry.target}{entry.targetId ? ` #${entry.targetId.slice(0, 8)}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(entry.createdAt)}
                    </span>
                    {entry.user ? (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {entry.user.name || entry.user.email}
                      </span>
                    ) : entry.userId ? (
                      <span className="flex items-center gap-1 text-text-faint">
                        <User className="h-3 w-3" />
                        deleted user
                      </span>
                    ) : null}
                    {entry.ipAddress && (
                      <span>{entry.ipAddress}</span>
                    )}
                  </div>
                  {entry.metadata && Object.keys(entry.metadata as Record<string, unknown>).length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-text-muted hover:text-text-muted">
                        Details
                      </summary>
                      <pre className="mt-1 rounded-lg bg-black/30 p-2 text-xs text-text-muted overflow-x-auto">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="rounded-lg border border-line/50 bg-panel/80 px-4 py-2 text-sm text-text transition-colors hover:bg-white/5 hover:text-text disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-4 text-sm text-text-muted">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-lg border border-line/50 bg-panel/80 px-4 py-2 text-sm text-text transition-colors hover:bg-white/5 hover:text-text disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear Audit Logs"
        message={
          filterAction
            ? `This will permanently delete all audit logs matching "${filterAction}". This action cannot be undone.`
            : "This will permanently delete all audit logs. This action cannot be undone."
        }
        confirmLabel="Clear Logs"
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
