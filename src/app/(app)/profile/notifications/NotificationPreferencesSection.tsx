"use client";

import { useState, useEffect } from "react";
import { Bell, Clock, Layers, Save, Loader2 } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/lib/toast";

type Prefs = {
  enabled: boolean;
  digestInterval: number | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  severityFilters: string[] | null;
};

export function NotificationPreferencesSection() {
  const { addToast } = useToast();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/account/notification-preferences")
      .then((r) => r.json())
      .then((d) => setPrefs(d.preference))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!prefs) return;
    setSaving(true);
    try {
      const res = await csrfFetch("/api/account/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error("Failed to save");
      addToast("Preferences saved", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rounded-xl border border-line/50 bg-panel/80 p-5 text-sm text-text-muted">Loading preferences...</div>;
  if (!prefs) return null;

  return (
    <div className="rounded-xl border border-line/50 bg-panel/80 backdrop-blur-sm p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-accent/10 p-2"><Bell className="h-5 w-5 text-accent" /></div>
          <h2 className="text-lg font-semibold text-text">Notification Preferences</h2>
        </div>
        <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent disabled:opacity-50 transition-all">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Enable toggle */}
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={prefs.enabled} onChange={(e) => setPrefs({ ...prefs, enabled: e.target.checked })} className="sr-only peer" />
            <div className="w-10 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
          </label>
          <div>
            <span className="text-sm text-text font-medium">{prefs.enabled ? "Enabled" : "Disabled"}</span>
            <p className="text-xs text-text-muted">Receive release and update notifications</p>
          </div>
        </div>

        {/* Quiet hours */}
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-text-muted shrink-0" />
          <div className="flex-1 grid grid-cols-2 gap-2">
            <label className="text-xs text-text-muted">
              Quiet hours start
              <input type="time" value={prefs.quietHoursStart || ""} onChange={(e) => setPrefs({ ...prefs, quietHoursStart: e.target.value || null })} className="mt-1 w-full rounded-lg border border-line/50 bg-surface px-2 py-1.5 text-xs text-text" />
            </label>
            <label className="text-xs text-text-muted">
              Quiet hours end
              <input type="time" value={prefs.quietHoursEnd || ""} onChange={(e) => setPrefs({ ...prefs, quietHoursEnd: e.target.value || null })} className="mt-1 w-full rounded-lg border border-line/50 bg-surface px-2 py-1.5 text-xs text-text" />
            </label>
          </div>
        </div>

        {/* Digest interval */}
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-text-muted shrink-0" />
          <label className="flex-1 text-xs text-text-muted">
            Digest interval (minutes, empty = instant)
            <select value={prefs.digestInterval ?? ""} onChange={(e) => setPrefs({ ...prefs, digestInterval: e.target.value ? parseInt(e.target.value) : null })} className="mt-1 w-full rounded-lg border border-line/50 bg-surface px-2 py-1.5 text-xs text-text">
              <option value="">Instant</option>
              <option value="60">Every hour</option>
              <option value="360">Every 6 hours</option>
              <option value="1440">Daily</option>
            </select>
          </label>
        </div>

        {/* Timezone */}
        <label className="text-xs text-text-muted">
          Timezone
          <select value={prefs.timezone} onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })} className="mt-1 w-full rounded-lg border border-line/50 bg-surface px-2 py-1.5 text-xs text-text">
            {["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Europe/Paris", "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney"].map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
