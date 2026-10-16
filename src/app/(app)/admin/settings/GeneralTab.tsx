"use client";

import { Save, Globe, Clock } from "lucide-react";
import { useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/lib/toast";

const intervalPresets = [
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
  { label: "7 days", value: 10080 },
];

const sessionDurationPresets = [
  { label: "1 hour", value: 1 },
  { label: "6 hours", value: 6 },
  { label: "12 hours", value: 12 },
  { label: "24 hours (default)", value: 24 },
  { label: "3 days", value: 72 },
  { label: "7 days", value: 168 },
];

const trustedDevicePresets = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days (default)", value: 30 },
  { label: "60 days", value: 60 },
  { label: "90 days", value: 90 },
];

const timezones = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Anchorage", "America/Halifax",
  "America/Sao_Paulo", "America/Argentina/Buenos_Aires",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Moscow",
  "Europe/Istanbul", "Asia/Dubai", "Asia/Kolkata", "Asia/Shanghai",
  "Asia/Tokyo", "Asia/Seoul", "Asia/Singapore", "Australia/Sydney",
  "Australia/Perth", "Pacific/Auckland", "Pacific/Honolulu",
];

export function GeneralTab({ initialSettings }: { initialSettings: Record<string, string> }) {
  const { addToast } = useToast();
  const [appUrl, setAppUrl] = useState(initialSettings.appUrl || "");
  const [checkInterval, setCheckInterval] = useState(parseInt(initialSettings.defaultCheckIntervalMinutes || "360", 10));
  const [intervalMode, setIntervalMode] = useState(intervalPresets.some((preset) => preset.value === parseInt(initialSettings.defaultCheckIntervalMinutes || "360", 10)) ? "preset" : "custom");
  const [includePrereleases, setIncludePrereleases] = useState(initialSettings.includePrereleases === "true");
  const [timezone, setTimezone] = useState(initialSettings.timezone || "UTC");
  const [sessionDuration, setSessionDuration] = useState(parseInt(initialSettings.sessionDurationHours || "24", 10));
  const [trustedDeviceDays, setTrustedDeviceDays] = useState(parseInt(initialSettings.trustedDeviceDays || "30", 10));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const response = await csrfFetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appUrl, defaultCheckIntervalMinutes: checkInterval, includePrereleases, timezone, sessionDurationHours: sessionDuration, trustedDeviceDays }),
    });
    setSaving(false);
    if (!response.ok) {
      const data = await response.json();
      addToast(data.error || "Save failed", "error");
    } else {
      addToast("Settings saved", "success");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line/50 bg-panel/80 backdrop-blur-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-cyan-500/10 p-2">
            <Globe className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Application</h3>
            <p className="text-xs text-slate-400">Core application settings</p>
          </div>
        </div>
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="text-slate-300">Public App URL</span>
            <input
              value={appUrl}
              onChange={(e) => setAppUrl(e.target.value)}
              placeholder="https://lepatch.example.com"
              className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-300">Default release check interval (minutes)</span>
            <select
              value={intervalMode === "custom" ? "custom" : String(checkInterval)}
              onChange={(e) => {
                if (e.target.value === "custom") {
                  setIntervalMode("custom");
                  if (checkInterval < 1) setCheckInterval(5);
                  return;
                }
                setIntervalMode("preset");
                setCheckInterval(Number(e.target.value));
              }}
              className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-white"
            >
              {intervalPresets.map((preset) => (
                <option key={preset.value} value={preset.value}>{preset.label}</option>
              ))}
              <option value="custom">Custom time...</option>
            </select>
            {intervalMode === "custom" && (
              <input
                type="number"
                min={1}
                max={10080}
                value={checkInterval}
                onChange={(e) => setCheckInterval(Math.min(10080, Math.max(1, parseInt(e.target.value, 10) || 5)))}
                className="focus-ring mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-white"
              />
            )}
            <p className="mt-1 text-xs text-slate-500">Saving this updates the global default and all watched apps.</p>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includePrereleases}
              onChange={(e) => setIncludePrereleases(e.target.checked)}
              className="rounded border-line"
            />
            <span className="text-slate-300">Include prereleases in global checks</span>
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-line/50 bg-panel/80 backdrop-blur-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-cyan-500/10 p-2">
            <Clock className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">User Experience</h3>
            <p className="text-xs text-slate-400">Session, timezone, and device preferences</p>
          </div>
        </div>
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="text-slate-300">Timezone</span>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-white"
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-300">Session duration</span>
            <select
              value={String(sessionDuration)}
              onChange={(e) => setSessionDuration(Number(e.target.value))}
              className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-white"
            >
              {sessionDurationPresets.map((preset) => (
                <option key={preset.value} value={preset.value}>{preset.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">How long a user stays logged in before they must sign in again.</p>
          </label>
          <label className="block text-sm">
            <span className="text-slate-300">Remember device duration</span>
            <select
              value={String(trustedDeviceDays)}
              onChange={(e) => setTrustedDeviceDays(Number(e.target.value))}
              className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-white"
            >
              {trustedDevicePresets.map((preset) => (
                <option key={preset.value} value={preset.value}>{preset.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">How long a trusted device skips MFA after &quot;Remember this device&quot; is checked.</p>
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-cyan-400 transition-colors disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
