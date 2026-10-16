"use client";

import { useState } from "react";
import { Save, Database } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { Select, Switch } from "@/components/ui/Input";

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
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-md border border-border bg-surface p-3">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-text-faint" aria-hidden="true" />
        <p className="text-xs text-text-muted">
          Automated PostgreSQL backups stored as compressed SQL dumps. A maximum of 5 are kept — the oldest is
          removed automatically.
        </p>
      </div>

      <Switch
        checked={enabled}
        onChange={setEnabled}
        label="Enable automated backups"
        description="Run a database dump on the schedule below."
      />

      <Select label="Frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
        {frequencyOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </Select>

      {frequency === "weekly" && (
        <Select label="Day of week" value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
          {dayOfWeekOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      )}

      {frequency === "monthly" && (
        <Select label="Day of month" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)}>
          {dayOfMonthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      )}

      <Select
        label="Time (BST/GMT)"
        value={scheduleTime}
        hint="Backups run at the selected UK time (BST in summer, GMT in winter)."
        onChange={(e) => setScheduleTime(e.target.value)}
      >
        {timePresets.map((preset) => (
          <option key={preset.value} value={preset.value}>{preset.label}</option>
        ))}
      </Select>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="btn btn--primary btn--sm">
          <Save className="h-3.5 w-3.5" aria-hidden="true" />
          {saving ? "Saving…" : "Save"}
        </button>
        {message && (
          <span
            aria-live="polite"
            role={message === "Settings saved" ? undefined : "alert"}
            className={message === "Settings saved" ? "text-sm text-status-success" : "text-sm text-status-danger"}
          >
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
