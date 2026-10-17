"use client";

import { useState, useEffect } from "react";
import { Loader2, Save } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/lib/toast";
import { Panel } from "@/components/ui/List";
import { Input, Select, Switch } from "@/components/ui/Input";

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

  if (loading) {
    return (
      <Panel title="Notification preferences">
        <p className="text-sm text-text-muted">Loading preferences…</p>
      </Panel>
    );
  }

  if (!prefs) return null;

  return (
    <Panel
      title="Notification preferences"
      description="Choose when and how LePatch notifies you about releases."
      actions={
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn btn--primary btn--sm"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Save
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        <Switch
          checked={prefs.enabled}
          onChange={(next) => setPrefs({ ...prefs, enabled: next })}
          label="Notifications enabled"
          description="Receive release and update notifications."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Quiet hours start"
            type="time"
            value={prefs.quietHoursStart || ""}
            onChange={(e) => setPrefs({ ...prefs, quietHoursStart: e.target.value || null })}
          />
          <Input
            label="Quiet hours end"
            type="time"
            value={prefs.quietHoursEnd || ""}
            onChange={(e) => setPrefs({ ...prefs, quietHoursEnd: e.target.value || null })}
          />

          <Select
            label="Digest interval"
            hint="Empty means instant delivery."
            value={prefs.digestInterval ?? ""}
            onChange={(e) =>
              setPrefs({ ...prefs, digestInterval: e.target.value ? parseInt(e.target.value) : null })
            }
          >
            <option value="">Instant</option>
            <option value="60">Every hour</option>
            <option value="360">Every 6 hours</option>
            <option value="1440">Daily</option>
          </Select>

          <Select
            label="Timezone"
            value={prefs.timezone}
            onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
          >
            {[
              "UTC",
              "America/New_York",
              "America/Chicago",
              "America/Denver",
              "America/Los_Angeles",
              "Europe/London",
              "Europe/Berlin",
              "Europe/Paris",
              "Asia/Tokyo",
              "Asia/Shanghai",
              "Australia/Sydney",
            ].map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Panel>
  );
}
