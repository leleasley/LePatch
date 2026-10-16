"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Database, Activity, Server, Tag, Settings } from "lucide-react";

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

  const colorMap: Record<string, string> = {
    ok: "text-status-success",
    error: "text-status-danger",
    degraded: "text-status-warning",
    not_configured: "text-text-muted",
  };

  const healthItems = health
    ? [
        { label: "Overall Status", value: health.status, icon: Activity, color: colorMap[health.status] || "text-text-muted" },
        { label: "Database", value: health.database, icon: Database, color: colorMap[health.database] || "text-text-muted" },
        { label: "Redis", value: health.redis, icon: Server, color: colorMap[health.redis] || "text-text-muted" },
        { label: "Worker", value: health.worker, icon: Activity, color: colorMap[health.worker] || "text-text-muted" },
        { label: "App Version", value: health.version, icon: Tag, color: "text-text-muted" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line/50 bg-panel/80 backdrop-blur-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-accent/10 p-2">
              <Activity className="h-4 w-4 text-accent" />
            </div>
            <div>
              <h3 className="font-semibold text-text">System Health</h3>
              <p className="text-xs text-text-muted">Service status and diagnostics</p>
            </div>
          </div>
          <button
            onClick={loadHealth}
            className="focus-ring inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-sm text-text hover:text-text transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>
        {loading && !health ? (
          <p className="text-sm text-text-muted">Checking health...</p>
        ) : health ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {healthItems.map((item) => (
              <div key={item.label} className="rounded-xl border border-line/50 bg-panel/80 backdrop-blur-sm p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-muted">
                  <item.icon className="h-3.5 w-3.5 text-accent" />
                  {item.label}
                </div>
                <div className={`mt-2 text-lg font-bold tracking-tight ${item.color}`}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-status-danger">Failed to load health status</p>
        )}
      </section>

      <section className="rounded-xl border border-line/50 bg-panel/80 backdrop-blur-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-accent/10 p-2">
            <Settings className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-text">System Settings</h3>
            <p className="text-xs text-text-muted">Current configuration values</p>
          </div>
        </div>
        <div className="space-y-2">
          {systemKeys.map((key) => (
            <div key={key} className="grid grid-cols-2 gap-2 rounded-md border border-line bg-surface p-3 text-sm">
              <span className="text-text font-medium">{key}</span>
              <span className="text-text-muted truncate text-right">
                {initialSettings[key] || <span className="italic text-text-faint">not set</span>}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
