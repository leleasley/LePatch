"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save, Settings, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ModalShell } from "@/components/ModalShell";
import { Select, Switch } from "@/components/ui/Input";
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
      window.dispatchEvent(new Event("lepatch:apps-changed"));
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
      <button type="button" onClick={() => setOpen(true)} className="btn btn--secondary btn--sm">
        <Settings className="h-4 w-4" aria-hidden="true" />
        Edit
      </button>
    );
  }

  return (
    <>
      <ModalShell open={open} onClose={() => setOpen(false)} title="Edit app settings" panelClassName="w-auto max-w-md p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">Edit app settings</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="icon-button -mr-1">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5">
          <Switch
            checked={notificationsEnabled}
            onChange={setNotificationsEnabled}
            label="Notifications"
            description="Send a Telegram message when a new release is detected."
          />

          <Switch
            checked={includePrereleases}
            onChange={setIncludePrereleases}
            label="Include pre-releases"
            description="Treat GitHub pre-releases as releasable versions."
          />

          <Select
            label="Check interval"
            value={checkInterval}
            onChange={(e) => setCheckInterval(Number(e.target.value))}
            hint={formatInterval(checkInterval)}
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>

          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="btn btn--danger w-full"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Remove app
            </button>
            <p className="mt-1.5 text-xs text-text-muted">Permanently delete this app and all its releases.</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col justify-end gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setIncludePrereleases(initialIncludePrereleases);
              setNotificationsEnabled(initialNotificationsEnabled);
              setCheckInterval(initialCheckInterval);
            }}
            className="btn btn--secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="btn btn--primary"
          >
            {saving ? <Loader2 className="h-4 w-4 spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {saving ? "Saving…" : "Save"}
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
          const response = await csrfFetch(`/api/apps/${appId}`, { method: "DELETE" });
          if (!response.ok) return;
          window.dispatchEvent(new Event("lepatch:apps-changed"));
          router.push("/apps");
          router.refresh();
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </>
  );
}
