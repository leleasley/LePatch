"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, BellOff, Loader2, Save, Settings, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ModalShell } from "@/components/ModalShell";
import { csrfFetch } from "@/lib/csrf-client";

const PRESETS = [
  { label: "5 minutes", value: 5 },
  { label: "10 minutes", value: 10 },
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
  { label: "3 hours", value: 180 },
  { label: "6 hours", value: 360 },
  { label: "12 hours", value: 720 },
  { label: "24 hours", value: 1440 },
  { label: "48 hours", value: 2880 },
  { label: "7 days", value: 10080 }
];

function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (minutes < 1440) {
    const hours = minutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hour${hours === 1 ? "" : "s"}`;
  }
  const days = minutes / 1440;
  return `${Number.isInteger(days) ? days : days.toFixed(1)} day${days === 1 ? "" : "s"}`;
}

export function EditAppModal({
  appId,
  initialIncludePrereleases,
  initialNotificationsEnabled,
  initialCheckInterval,
}: {
  appId: string;
  initialIncludePrereleases: boolean;
  initialNotificationsEnabled: boolean;
  initialCheckInterval: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [includePrereleases, setIncludePrereleases] = useState(initialIncludePrereleases);
  const [notificationsEnabled, setNotificationsEnabled] = useState(initialNotificationsEnabled);
  const [checkInterval, setCheckInterval] = useState(initialCheckInterval);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await csrfFetch(`/api/apps/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          includePrereleases,
          notificationsEnabled,
          checkIntervalMinutes: checkInterval,
        }),
      });
      if (!res.ok) throw new Error("Failed to update app");
      setOpen(false);
      router.refresh();
    } catch {
      setSaving(false);
    }
  }

  const dirty =
    includePrereleases !== initialIncludePrereleases ||
    notificationsEnabled !== initialNotificationsEnabled ||
    checkInterval !== initialCheckInterval;

  if (!open) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="focus-ring inline-flex items-center gap-2 rounded-md border border-line/50 px-3 py-2 text-sm text-slate-400 transition-all hover:border-cyan-500/30 hover:text-cyan-300"
        >
          <Settings className="h-4 w-4" />
          Edit
        </button>
      </>
    );
  }

  return (
    <>
      <ModalShell open={open} onClose={() => setOpen(false)} panelClassName="w-auto max-w-md overflow-hidden p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Edit App Settings</h2>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:text-white hover:bg-white/5 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5">
            <label className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-300 font-medium">
                {notificationsEnabled ? <Bell className="h-4 w-4 text-emerald-400" /> : <BellOff className="h-4 w-4 text-slate-500" />}
                Notifications
              </span>
              <button
                role="switch"
                aria-checked={notificationsEnabled}
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  notificationsEnabled ? "bg-emerald-500" : "bg-slate-600"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    notificationsEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between text-sm">
              <span className="text-slate-300 font-medium">Include pre-releases</span>
              <button
                role="switch"
                aria-checked={includePrereleases}
                onClick={() => setIncludePrereleases(!includePrereleases)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  includePrereleases ? "bg-cyan-500" : "bg-slate-600"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    includePrereleases ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            <div className="border-t border-line/50 pt-4">
              <label className="block text-sm">
                <span className="text-slate-300 font-medium">Check interval</span>
                <select
                  value={checkInterval}
                  onChange={(e) => setCheckInterval(Number(e.target.value))}
                  className="focus-ring mt-1.5 w-full rounded-lg border border-line/50 bg-surface px-4 py-2.5 text-white transition-all focus:border-cyan-500/50"
                >
                  {PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-1 text-xs text-slate-500">{formatInterval(checkInterval)}</p>
            </div>

            <div className="border-t border-line/50 pt-4">
              <button
                onClick={() => setDeleteConfirmOpen(true)}
                className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/40 px-4 py-2.5 text-sm font-medium text-red-200 transition-all hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Remove app
              </button>
              <p className="mt-1 text-xs text-slate-500">Permanently delete this app and all its releases</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3">
            <button
              onClick={() => {
                setOpen(false);
                setIncludePrereleases(initialIncludePrereleases);
                setNotificationsEnabled(initialNotificationsEnabled);
                setCheckInterval(initialCheckInterval);
              }}
              className="rounded-lg border border-line/50 px-4 py-2.5 text-sm font-medium text-slate-300 transition-all hover:bg-white/[0.06]"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition-all hover:bg-cyan-400 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
      </ModalShell>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Remove app"
        message="Are you sure you want to remove this app and all its releases?"
        confirmLabel="Remove"
        variant="danger"
        confirmText="REMOVE"
        onConfirm={async () => {
          await csrfFetch(`/api/apps/${appId}`, { method: "DELETE" });
          router.push("/apps");
          router.refresh();
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </>
  );
}
