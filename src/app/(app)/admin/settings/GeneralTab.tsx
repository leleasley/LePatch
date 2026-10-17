"use client";

import { Save, Globe, Clock } from "lucide-react";
import { useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/lib/toast";
import { Panel } from "@/components/ui/List";
import { Input, Select, Switch } from "@/components/ui/Input";

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

function SaveButton({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <button type="button" onClick={onSave} disabled={saving} className="btn btn--primary btn--sm">
      <Save className="h-3.5 w-3.5" aria-hidden="true" />
      {saving ? "Saving…" : "Save"}
    </button>
  );
}

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
    <div className="flex max-w-3xl flex-col gap-5">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-text-faint" aria-hidden="true" />
            Application
          </span>
        }
        description="Core application settings"
        actions={<SaveButton saving={saving} onSave={save} />}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Public app URL"
            value={appUrl}
            onChange={(e) => setAppUrl(e.target.value)}
            placeholder="https://lepatch.example.com"
          />

          <Select
            label="Default release check interval"
            value={intervalMode === "custom" ? "custom" : String(checkInterval)}
            hint="Saving this updates the global default and every watched app."
            onChange={(e) => {
              if (e.target.value === "custom") {
                setIntervalMode("custom");
                if (checkInterval < 1) setCheckInterval(5);
                return;
              }
              setIntervalMode("preset");
              setCheckInterval(Number(e.target.value));
            }}
          >
            {intervalPresets.map((preset) => (
              <option key={preset.value} value={preset.value}>{preset.label}</option>
            ))}
            <option value="custom">Custom time…</option>
          </Select>

          {intervalMode === "custom" && (
            <Input
              type="number"
              label="Custom interval (minutes)"
              min={1}
              max={10080}
              value={checkInterval}
              onChange={(e) => setCheckInterval(Math.min(10080, Math.max(1, parseInt(e.target.value, 10) || 5)))}
            />
          )}

          <Switch
            checked={includePrereleases}
            onChange={setIncludePrereleases}
            label="Include prereleases in global checks"
            description="Prerelease tags are counted as new releases for every app that does not override this."
          />
        </div>
      </Panel>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-text-faint" aria-hidden="true" />
            User experience
          </span>
        }
        description="Sessions, timezone and trusted devices"
        actions={<SaveButton saving={saving} onSave={save} />}
      >
        <div className="flex flex-col gap-4">
          <Select label="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </Select>

          <Select
            label="Session duration"
            value={String(sessionDuration)}
            hint="How long a user stays logged in before they must sign in again."
            onChange={(e) => setSessionDuration(Number(e.target.value))}
          >
            {sessionDurationPresets.map((preset) => (
              <option key={preset.value} value={preset.value}>{preset.label}</option>
            ))}
          </Select>

          <Select
            label="Remember device duration"
            value={String(trustedDeviceDays)}
            hint="How long a trusted device skips MFA after “Remember this device” is checked."
            onChange={(e) => setTrustedDeviceDays(Number(e.target.value))}
          >
            {trustedDevicePresets.map((preset) => (
              <option key={preset.value} value={preset.value}>{preset.label}</option>
            ))}
          </Select>
        </div>
      </Panel>
    </div>
  );
}
