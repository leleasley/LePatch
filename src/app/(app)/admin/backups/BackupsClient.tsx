"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import {
  Database,
  Download,
  Trash2,
  Loader2,
  HardDrive,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Edit3,
  Circle,
  CircleDot,
  AlertCircle,
  Search,
  X,
} from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/lib/toast";
import { ModalShell } from "@/components/ModalShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BackupScheduleForm } from "@/components/BackupScheduleForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, SkeletonRows } from "@/components/ui/Card";
import { List, ListRow, MetricStrip, Panel, RowAvatar, StatusDot, Toolbar, type StatusTone } from "@/components/ui/List";
import { Input } from "@/components/ui/Input";

type Backup = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  type: "manual" | "scheduled";
  filename: string;
  sizeBytes: number | null;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
};

type Stats = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  lastBackupAt: string | null;
};

type Schedule = {
  enabled: boolean;
  scheduleTime: string;
  frequency: string;
  dayOfWeek: string | null;
  dayOfMonth: string | null;
};

type DeleteTarget = { id: string; filename: string } | null;

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatRemaining(ms: number): string {
  if (ms < 0) return "—";
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return "Less than a minute";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days > 0) return `${days}d ${remainingHours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function statusTone(status: Backup["status"]): StatusTone {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "running") return "accent";
  return "neutral";
}

function statusIcon(status: Backup["status"]) {
  if (status === "pending") return <Clock className="h-4 w-4" aria-hidden="true" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
  if (status === "completed") return <CheckCircle className="h-4 w-4" aria-hidden="true" />;
  return <XCircle className="h-4 w-4" aria-hidden="true" />;
}

export function BackupsClient() {
  const { addToast } = useToast();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [nextBackupAt, setNextBackupAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);
  const [showEditSchedule, setShowEditSchedule] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Backup["status"]>("all");
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  async function doFetch() {
    try {
      const res = await fetch("/api/admin/backups");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to load backups (${res.status})`);
      }
      const data = await res.json();
      startTransition(() => setBackups(data.backups));
      startTransition(() => setStats(data.stats));
      startTransition(() => setSchedule(data.schedule));
      startTransition(() => setNextBackupAt(data.nextBackupAt));
    } catch (err) {
      startTransition(() => setError(err instanceof Error ? err.message : "Failed to load backups"));
    } finally {
      startTransition(() => setLoading(false));
    }
  }

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    setError("");
    await doFetch();
  }, []);

  useEffect(() => { doFetch(); }, []);

  async function createBackup() {
    setCreating(true);
    try {
      const res = await csrfFetch("/api/admin/backups", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Backup creation failed");
      }
      addToast("Backup created successfully", "success");
      await fetchBackups();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Backup creation failed", "error");
    } finally {
      setCreating(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await csrfFetch(`/api/admin/backups/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete backup");
      addToast(`Backup "${deleteTarget.filename}" deleted`, "success");
      setDeleteTarget(null);
      await fetchBackups();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to delete backup", "error");
    } finally {
      setDeleting(false);
    }
  }

  const msUntilNext = nextBackupAt ? new Date(nextBackupAt).getTime() - nowTick : null;

  const showNextBackup = schedule?.enabled && msUntilNext !== null && msUntilNext > 0;

  const statusCounts: Record<"all" | Backup["status"], number> = {
    all: backups.length,
    completed: backups.filter((b) => b.status === "completed").length,
    running: backups.filter((b) => b.status === "running").length,
    pending: backups.filter((b) => b.status === "pending").length,
    failed: backups.filter((b) => b.status === "failed").length,
  };

  const visible = backups.filter((b) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return b.filename.toLowerCase().includes(q);
  });

  return (
    <>
      <PageHeader
        title="Backups"
        description="Database backups — a maximum of 5 are kept, the oldest is removed automatically."
        actions={
          <>
            <button type="button" onClick={() => setShowEditSchedule(true)} className="btn btn--ghost btn--sm">
              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
              Edit schedule
            </button>
            <button type="button" onClick={createBackup} disabled={creating} className="btn btn--primary btn--sm">
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Database className="h-3.5 w-3.5" aria-hidden="true" />}
              {creating ? "Creating…" : "Create backup"}
            </button>
          </>
        }
      />

      {error && (
        <p role="alert" className="mb-5 flex items-center gap-2 rounded-lg border border-status-danger/40 bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="mb-5">
        <MetricStrip
          items={[
            { label: "Total", value: stats?.total ?? "—" },
            { label: "Completed", value: stats?.completed ?? "—", tone: "success" },
            { label: "Failed", value: stats?.failed ?? "—", tone: (stats?.failed ?? 0) > 0 ? "danger" : undefined },
            { label: "Last backup", value: stats?.lastBackupAt ? formatDate(stats.lastBackupAt) : "Never" },
            {
              label: "Next backup",
              // Countdown depends on the current time, so the server render and
              // hydration can disagree at a minute boundary. Opt out of the
              // check for this value rather than breaking hydration.
              value: (
                <span suppressHydrationWarning>
                  {showNextBackup
                    ? msUntilNext !== null
                      ? formatRemaining(msUntilNext)
                      : "—"
                    : schedule?.enabled
                      ? "Calculating…"
                      : "Disabled"}
                </span>
              ),
            },
          ]}
        />
      </div>

      <div className="mb-5 rounded-lg border border-border bg-panel px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-muted">Backup slots</span>
          <span className="text-xs text-text-faint">{stats?.completed ?? 0} of 5 used</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5" role="img" aria-label={`${stats?.completed ?? 0} of 5 backup slots used`}>
          {Array.from({ length: 5 }, (_, i) => (
            i < (stats?.completed ?? 0) ? (
              <CircleDot key={i} className="h-4 w-4 text-status-success" aria-hidden="true" />
            ) : (
              <Circle key={i} className="h-4 w-4 text-text-faint" aria-hidden="true" />
            )
          ))}
        </div>
      </div>

      {backups.length > 0 && (
        <Toolbar className="mb-5 justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1 sm:max-w-xs">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by filename"
                aria-label="Filter backups by filename"
                className="pl-8 pr-8"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear filter"
                  className="icon-button absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="chip-row" role="group" aria-label="Filter backups by status">
              {(
                [
                  ["all", "All"],
                  ["completed", "Completed"],
                  ["running", "Running"],
                  ["pending", "Pending"],
                  ["failed", "Failed"],
                ] as Array<["all" | Backup["status"], string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className="chip"
                  data-active={statusFilter === key}
                  aria-pressed={statusFilter === key}
                  onClick={() => setStatusFilter(key)}
                  disabled={statusCounts[key] === 0 && key !== "all"}
                >
                  {label}
                  <span className="mono text-2xs opacity-70">{statusCounts[key]}</span>
                </button>
              ))}
            </div>
          </div>
        </Toolbar>
      )}

      {loading && backups.length === 0 ? (
        <div className="rounded-lg border border-border bg-panel">
          <SkeletonRows rows={4} columns={3} />
        </div>
      ) : backups.length === 0 ? (
        <EmptyState
          icon={<HardDrive className="h-4 w-4" />}
          title="No backups yet"
          description="Create a backup now, or enable the schedule to run one automatically."
          action={
            <button type="button" onClick={createBackup} disabled={creating} className="btn btn--primary btn--sm">
              <Database className="h-3.5 w-3.5" aria-hidden="true" />
              Create backup
            </button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nothing matches this view"
          description="Try a different search term or status filter."
          action={
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => { setQuery(""); setStatusFilter("all"); }}
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <Panel flush>
          <List>
            {visible.map((backup) => (
              <ListRow
                key={backup.id}
                leading={<RowAvatar tone={statusTone(backup.status)}>{statusIcon(backup.status)}</RowAvatar>}
                title={
                  <>
                    <span className="truncate text-sm font-medium text-text">{backup.filename}</span>
                    <StatusDot tone={statusTone(backup.status)}>{backup.status}</StatusDot>
                  </>
                }
                meta={
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" aria-hidden="true" />
                      {formatDate(backup.createdAt)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <HardDrive className="h-3 w-3" aria-hidden="true" />
                      {formatSize(backup.sizeBytes)}
                    </span>
                    <span>{backup.type}</span>
                    {backup.error && <span className="text-status-danger">{backup.error}</span>}
                  </>
                }
                trailing={
                  <>
                    {backup.status === "completed" && (
                      <a
                        href={`/api/admin/backups/${backup.id}`}
                        download
                        className="icon-button"
                        aria-label={`Download ${backup.filename}`}
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ id: backup.id, filename: backup.filename })}
                      className="icon-button text-text-faint hover:text-status-danger"
                      aria-label={`Delete ${backup.filename}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </>
                }
              />
            ))}
          </List>
        </Panel>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete backup"
        message={deleteTarget ? `Delete "${deleteTarget.filename}"? This action cannot be undone.` : ""}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />

      <ModalShell open={showEditSchedule} onClose={() => setShowEditSchedule(false)} title="Edit backup schedule">
        <div className="w-full max-w-lg p-6">
          <h2 className="mb-4 text-base font-semibold text-text">Edit backup schedule</h2>
          {schedule && (
            <BackupScheduleForm
              schedule={{
                enabled: schedule.enabled,
                scheduleTime: schedule.scheduleTime,
                frequency: schedule.frequency,
                dayOfWeek: schedule.dayOfWeek || "0",
                dayOfMonth: schedule.dayOfMonth || "1",
              }}
              onSaved={() => {
                setShowEditSchedule(false);
                fetchBackups();
              }}
            />
          )}
        </div>
      </ModalShell>
    </>
  );
}
