"use client";

import { useState } from "react";
import { Save, Database } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";

const timePresets = [
  { label: "00:00 BST/GMT", value: "00:00" },
  { label: "01:00 BST/GMT", value: "01:00" },
  { label: "02:00 BST/GMT", value: "02:00" },
  { label: "03:00 BST/GMT", value: "03:00" },
  { label: "04:00 BST/GMT", value: "04:00" },
  { label: "05:00 BST/GMT", value: "05:00" },
  { label: "06:00 BST/GMT", value: "06:00" },
];

const frequencyOptions = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
];

const dayOfWeekOptions = [
  { label: "Every day", value: "daily" },
  { label: "Monday", value: "1" },
  { label: "Tuesday", value: "2" },
  { label: "Wednesday", value: "3" },
  { label: "Thursday", value: "4" },
  { label: "Friday", value: "5" },
  { label: "Saturday", value: "6" },
  { label: "Sunday", value: "0" },
];

const dayOfMonthOptions = Array.from({ length: 28 }, (_, i) => ({
  label: `${i + 1}`,
  value: `${i + 1}`,
}));

type Schedule = {
  enabled: boolean;
  scheduleTime: string;
  frequency: string;
  dayOfWeek: string;
  dayOfMonth: string;
};

export function BackupScheduleForm({
  schedule,
  onSaved,
}: {
  schedule: Schedule;
  onSaved?: () => void;
}) {
  const [enabled, setEnabled] = useState(schedule.enabled);
  const [scheduleTime, setScheduleTime] = useState(schedule.scheduleTime);
  const [frequency, setFrequency] = useState(schedule.frequency);
  const [dayOfWeek, setDayOfWeek] = useState(schedule.dayOfWeek);
  const [dayOfMonth, setDayOfMonth] = useState(schedule.dayOfMonth);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");
    const res = await csrfFetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        backupEnabled: enabled ? "true" : "false",
        backupScheduleTime: scheduleTime,
        backupScheduleFrequency: frequency,
        backupScheduleDayOfWeek: frequency === "weekly" ? dayOfWeek : undefined,
        backupScheduleDayOfMonth: frequency === "monthly" ? dayOfMonth : undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Save failed");
    } else {
      setMessage("Settings saved");
      onSaved?.();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-line/50 bg-surface/50 p-3">
        <Database className="h-5 w-5 text-accent" />
        <div className="text-xs text-text-muted">
          Automated PostgreSQL database backups. Stored as compressed SQL dumps. Max 5 kept — oldest removed automatically.
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded border-line"
        />
        <span className="text-text">Enable automated backups</span>
      </label>

      <label className="block text-sm">
        <span className="text-text">Frequency</span>
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
          className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-text"
        >
          {frequencyOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {frequency === "weekly" && (
        <label className="block text-sm">
          <span className="text-text">Day of week</span>
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(e.target.value)}
            className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-text"
          >
            {dayOfWeekOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      )}

      {frequency === "monthly" && (
        <label className="block text-sm">
          <span className="text-text">Day of month</span>
          <select
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-text"
          >
            {dayOfMonthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      )}

      <label className="block text-sm">
        <span className="text-text">Time (BST/GMT)</span>
        <select
          value={scheduleTime}
          onChange={(e) => setScheduleTime(e.target.value)}
          className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-text"
        >
          {timePresets.map((preset) => (
            <option key={preset.value} value={preset.value}>{preset.label}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-text-muted">Backup runs at the selected UK time (BST in summer, GMT in winter).</p>
      </label>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save"}
        </button>
        {message && (
          <span className={`text-sm ${message === "Settings saved" ? "text-status-success" : "text-status-danger"}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}