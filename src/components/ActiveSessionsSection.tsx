"use client";

import { useEffect, useState } from "react";
import { Laptop2, LogOut, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type Session = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleString();
}

function truncateUserAgent(ua: string | null, max = 60) {
  if (!ua) return "Unknown device";
  return ua.length > max ? ua.slice(0, max) + "..." : ua;
}

function sessionIcon(name: string | null, ua: string | null) {
  const value = `${name || ""} ${ua || ""}`.toLowerCase();
  if (value.includes("iphone") || value.includes("android") || value.includes("mobile")) {
    return Smartphone;
  }
  return Laptop2;
}

export function ActiveSessionsSection({ currentSessionId }: { currentSessionId?: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);

  async function doFetch() {
    try {
      const response = await fetch("/api/sessions");
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadSessions() {
    setLoading(true);
    await doFetch();
  }

  useEffect(() => {
    doFetch();
  }, []);

  async function logoutAll() {
    setMessage("");
    const response = await csrfFetch("/api/sessions", { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json();
      setMessage(data.error || "Failed to logout all sessions");
      return;
    }
    setMessage("All other sessions logged out");
    loadSessions();
  }

  return (
    <section className="rounded-xl border border-line/50 bg-panel/80 p-4 backdrop-blur-sm">
      <ConfirmDialog
        open={confirmLogoutAll}
        title="Logout all other sessions"
        message="All other active sessions will be terminated immediately."
        confirmLabel="Logout All"
        variant="danger"
        confirmText="LOGOUT"
        onConfirm={() => {
          logoutAll();
          setConfirmLogoutAll(false);
        }}
        onCancel={() => setConfirmLogoutAll(false)}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-medium text-white">Active Sessions</h2>
          <p className="mt-1 text-sm text-slate-400">
            Sessions now expire from when they were created, not from recent activity.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadSessions}
            className="focus-ring inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-sm text-slate-300 transition-colors hover:text-white"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
          <button
            onClick={() => setConfirmLogoutAll(true)}
            className="focus-ring inline-flex items-center gap-1 rounded-md border border-red-500/40 px-3 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-500/10"
          >
            <LogOut className="h-3 w-3" />
            Logout all
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-slate-500">No active sessions</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const Icon = sessionIcon(session.deviceName, session.userAgent);
            const isCurrent = currentSessionId === session.id;

            return (
              <div
                key={session.id}
                className="rounded-xl border border-line/60 bg-surface/80 p-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-200">
                          {session.deviceName || truncateUserAgent(session.userAgent)}
                        </div>
                        {session.userAgent && session.deviceName ? (
                          <div className="mt-0.5 truncate text-xs text-slate-500" title={session.userAgent}>
                            {truncateUserAgent(session.userAgent, 90)}
                          </div>
                        ) : null}
                      </div>
                      {isCurrent ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                          <ShieldCheck className="h-3 w-3" />
                          Current
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                      <div className="rounded-lg border border-line/50 bg-black/20 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">Last used</div>
                        <div className="mt-1 text-slate-300">{formatDate(session.lastUsedAt)}</div>
                      </div>
                      <div className="rounded-lg border border-line/50 bg-black/20 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">Created</div>
                        <div className="mt-1 text-slate-300">{formatDate(session.createdAt)}</div>
                      </div>
                      <div className="rounded-lg border border-line/50 bg-black/20 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">Expires</div>
                        <div className="mt-1 text-slate-300">{formatDate(session.expiresAt)}</div>
                      </div>
                    </div>

                    {session.ipAddress ? (
                      <div className="mt-2 text-xs text-slate-500">IP: {session.ipAddress}</div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {message ? (
        <p
          className={`mt-3 rounded-md border p-3 text-sm ${
            message.includes("failed") || message.includes("Failed")
              ? "border-red-500/40 bg-red-500/10 text-red-200"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
