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
    ok: "text-emerald-300",
    error: "text-red-300",
    degraded: "text-amber-300",
    not_configured: "text-slate-500",
  };

  const healthItems = health
    ? [
        { label: "Overall Status", value: health.status, icon: Activity, color: colorMap[health.status] || "text-slate-400" },
        { label: "Database", value: health.database, icon: Database, color: colorMap[health.database] || "text-slate-400" },
        { label: "Redis", value: health.redis, icon: Server, color: colorMap[health.redis] || "text-slate-400" },
        { label: "Worker", value: health.worker, icon: Activity, color: colorMap[health.worker] || "text-slate-400" },
        { label: "App Version", value: health.version, icon: Tag, color: "text-slate-400" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line/50 bg-panel/80 backdrop-blur-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-cyan-500/10 p-2">
              <Activity className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">System Health</h3>
              <p className="text-xs text-slate-400">Service status and diagnostics</p>
            </div>
          </div>
          <button
            onClick={loadHealth}
            className="focus-ring inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-sm text-slate-300 hover:text-white transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>
        {loading && !health ? (
          <p className="text-sm text-slate-400">Checking health...</p>
        ) : health ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {healthItems.map((item) => (
              <div key={item.label} className="rounded-xl border border-line/50 bg-panel/80 backdrop-blur-sm p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                  <item.icon className="h-3.5 w-3.5 text-cyan-400" />
                  {item.label}
                </div>
                <div className={`mt-2 text-lg font-bold tracking-tight ${item.color}`}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-red-300">Failed to load health status</p>
        )}
      </section>

      <section className="rounded-xl border border-line/50 bg-panel/80 backdrop-blur-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-cyan-500/10 p-2">
            <Settings className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">System Settings</h3>
            <p className="text-xs text-slate-400">Current configuration values</p>
          </div>
        </div>
        <div className="space-y-2">
          {systemKeys.map((key) => (
            <div key={key} className="grid grid-cols-2 gap-2 rounded-md border border-line bg-surface p-3 text-sm">
              <span className="text-slate-300 font-medium">{key}</span>
              <span className="text-slate-400 truncate text-right">
                {initialSettings[key] || <span className="italic text-slate-600">not set</span>}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
