"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { Database, Download, Trash2, Loader2, HardDrive, Calendar, Clock, CheckCircle, XCircle, AlertCircle, Edit3, Circle, CircleDot } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/lib/toast";
import { ModalShell } from "@/components/ModalShell";
import { BackupScheduleForm } from "@/components/BackupScheduleForm";

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

function StatusBadge({ status }: { status: Backup["status"] }) {
  const styles: Record<string, string> = {
    pending: "bg-slate-500/10 text-text-muted border-slate-500/30",
    running: "bg-accent/10 text-accent border-accent/40",
    completed: "bg-status-success/10 text-status-success border-emerald-500/30",
    failed: "bg-status-danger/10 text-status-danger border-red-500/30",
  };
  const icons: Record<string, React.ReactNode> = {
    pending: <Clock className="h-3 w-3" />,
    running: <Loader2 className="h-3 w-3 animate-spin" />,
    completed: <CheckCircle className="h-3 w-3" />,
    failed: <XCircle className="h-3 w-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status] || ""}`}>
      {icons[status]}
      {status}
    </span>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line/50 bg-panel/80 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 truncate text-sm font-semibold text-text">{value}</div>
    </div>
  );
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

  return (
    <>
      <div className="mb-8 overflow-hidden rounded-xl border border-line/50 bg-gradient-to-br from-surface via-panel to-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-accent/10 p-3">
              <Database className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-text">Backups</h1>
              <p className="mt-1 text-sm text-text-muted">Database backups — max 5 kept, oldest auto-removed.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditSchedule(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-line/50 bg-panel/80 px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-white/[0.04] hover:text-text"
            >
              <Edit3 className="h-4 w-4" />
              Edit schedule
            </button>
            <button
              onClick={createBackup}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              {creating ? "Creating..." : "Create Backup"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/40 bg-status-danger/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard icon={<Database className="h-4 w-4" />} label="Total" value={stats?.total ?? "—"} />
        <StatCard icon={<CheckCircle className="h-4 w-4 text-status-success" />} label="Completed" value={stats?.completed ?? "—"} />
        <StatCard icon={<XCircle className="h-4 w-4 text-status-danger" />} label="Failed" value={stats?.failed ?? "—"} />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Last Backup" value={stats?.lastBackupAt ? formatDate(stats.lastBackupAt) : "Never"} />
        <StatCard
          icon={<Calendar className={`h-4 w-4 ${showNextBackup ? "text-accent" : "text-text-muted"}`} />}
          label="Next Backup"
          value={showNextBackup ? formatRemaining(msUntilNext) : schedule?.enabled ? "Calculating..." : "Disabled"}
        />
      </div>

      <div className="mb-6 rounded-xl border border-line/50 bg-panel/80 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-text-muted">Backup Slots</span>
          <span className="text-xs text-text-muted">{stats?.completed ?? 0} / 5 used</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {Array.from({ length: 5 }, (_, i) => (
            i < (stats?.completed ?? 0) ? (
              <CircleDot key={i} className="h-4 w-4 text-status-success" />
            ) : (
              <Circle key={i} className="h-4 w-4 text-text-faint" />
            )
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-line/50 bg-panel/60">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <HardDrive className="mb-2 h-8 w-8" />
            <p className="text-sm">No backups yet</p>
            <p className="mt-1 text-xs">Click &quot;Create Backup&quot; to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-line/50">
            {backups.map((backup) => (
              <div key={backup.id} className="flex items-center justify-between px-4 py-3 sm:px-6">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text">{backup.filename}</span>
                    <StatusBadge status={backup.status} />
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(backup.createdAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <HardDrive className="h-3 w-3" />
                      {formatSize(backup.sizeBytes)}
                    </span>
                    <span>{backup.type}</span>
                  </div>
                  {backup.error && (
                    <p className="mt-1 text-xs text-status-danger">{backup.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  {backup.status === "completed" && (
                    <a
                      href={`/api/admin/backups/${backup.id}`}
                      download
                      className="rounded-lg p-2 text-text-muted transition-colors hover:bg-white/[0.04] hover:text-text"
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    onClick={() => setDeleteTarget({ id: backup.id, filename: backup.filename })}
                    className="rounded-lg p-2 text-text-muted transition-colors hover:bg-status-danger/10 hover:text-status-danger"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ModalShell open={deleteTarget !== null} onClose={() => !deleting && setDeleteTarget(null)}>
        <div className="p-6 w-full max-w-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-full bg-red-500/20 p-2">
              <Trash2 className="h-5 w-5 text-status-danger" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text">Delete Backup</h3>
              <p className="text-sm text-text-muted mt-0.5">This action cannot be undone.</p>
            </div>
          </div>
          <p className="text-sm text-text mb-6">
            Are you sure you want to delete <span className="font-medium text-text">{deleteTarget?.filename}</span>?
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="rounded-lg border border-line/50 bg-panel/80 px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-white/[0.04] hover:text-text disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-red-400 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={showEditSchedule} onClose={() => setShowEditSchedule(false)}>
        <div className="p-6 w-full max-w-lg">
          <h2 className="mb-4 text-lg font-medium text-text">Edit Backup Schedule</h2>
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