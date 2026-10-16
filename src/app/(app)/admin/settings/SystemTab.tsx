"use client";

import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { List, ListRow, MetricStrip, Panel, StatusDot, type StatusTone } from "@/components/ui/List";

function toneFor(value: unknown): StatusTone {
  if (value === "ok") return "success";
  if (value === "error") return "danger";
  if (value === "degraded") return "warning";
  return "neutral";
}

function labelFor(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "—";
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function SystemTab({ initialSettings }: { initialSettings: Record<string, string> }) {
  const [health, setHealth] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadHealth() {
    setLoading(true);
    const response = await fetch("/api/health");
    if (response.ok) {
      setHealth(await response.json());
    }
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadHealth(); }, []);

  const systemKeys = ["appUrl", "defaultCheckIntervalMinutes", "includePrereleases", "timezone"];

  const healthItems = health
    ? [
        { label: "Overall status", value: labelFor(health.status), tone: toneFor(health.status) },
        { label: "Database", value: labelFor(health.database), tone: toneFor(health.database) },
        { label: "Redis", value: labelFor(health.redis), tone: toneFor(health.redis) },
        { label: "Worker", value: labelFor(health.worker), tone: toneFor(health.worker) },
        { label: "App version", value: labelFor(health.version), tone: "neutral" as StatusTone },
      ]
    : [];

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Panel
        title="System health"
        description="Live service status and diagnostics."
        actions={
          <button type="button" onClick={loadHealth} className="btn btn--ghost btn--sm">
            <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden="true" />
            Refresh
          </button>
        }
      >
        <div aria-live="polite">
          {loading && !health ? (
            <p className="text-sm text-text-muted">Checking health…</p>
          ) : health ? (
            <MetricStrip items={healthItems} />
          ) : (
            <p role="alert" className="text-sm text-status-danger">
              Could not load system health. Try refreshing.
            </p>
          )}
        </div>
      </Panel>

      <Panel title="System settings" description="Current configuration values." flush>
        <List>
          {systemKeys.map((key) => (
            <ListRow
              key={key}
              title={<span className="mono text-xs text-text-muted">{key}</span>}
              subtitle={initialSettings[key] ? <span className="mono text-text">{initialSettings[key]}</span> : undefined}
              trailing={!initialSettings[key] ? <StatusDot tone="neutral">not set</StatusDot> : undefined}
            />
          ))}
        </List>
      </Panel>
    </div>
  );
}
