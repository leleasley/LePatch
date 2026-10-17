"use client";

import { useEffect, useState } from "react";
import { Laptop2, LogOut, RefreshCw, Smartphone } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { List, ListRow, Panel, RowAvatar } from "@/components/ui/List";
import { Badge } from "@/components/ui/Card";

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

  const failed = message.includes("failed") || message.includes("Failed");

  return (
    <>
      <Panel
        title="Active sessions"
        description="Sessions expire from when they were created, not from recent activity."
        actions={
          <>
            <button
              type="button"
              onClick={loadSessions}
              className="btn btn--ghost btn--sm"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setConfirmLogoutAll(true)}
              className="btn btn--danger btn--sm"
            >
              <LogOut className="h-3 w-3" aria-hidden="true" />
              Logout all
            </button>
          </>
        }
        flush
      >
        {loading ? (
          <p className="px-4 py-3 text-sm text-text-muted">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="px-4 py-3 text-sm text-text-muted">No active sessions.</p>
        ) : (
          <List>
            {sessions.map((session) => {
              const Icon = sessionIcon(session.deviceName, session.userAgent);
              const isCurrent = currentSessionId === session.id;

              return (
                <ListRow
                  key={session.id}
                  leading={
                    <RowAvatar tone={isCurrent ? "success" : "neutral"}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </RowAvatar>
                  }
                  title={
                    <>
                      <span className="truncate text-sm font-medium text-text">
                        {session.deviceName || truncateUserAgent(session.userAgent)}
                      </span>
                      {isCurrent && <Badge tone="success">Current</Badge>}
                    </>
                  }
                  subtitle={
                    session.userAgent && session.deviceName
                      ? truncateUserAgent(session.userAgent, 90)
                      : undefined
                  }
                  meta={
                    <>
                      <span>Last used {formatDate(session.lastUsedAt)}</span>
                      <span>Created {formatDate(session.createdAt)}</span>
                      <span>Expires {formatDate(session.expiresAt)}</span>
                      {session.ipAddress && <span className="mono">IP {session.ipAddress}</span>}
                    </>
                  }
                />
              );
            })}
          </List>
        )}

        {message ? (
          <p
            role={failed ? "alert" : "status"}
            aria-live="polite"
            className={`border-t border-border px-4 py-2.5 text-xs ${
              failed ? "text-status-danger" : "text-status-success"
            }`}
          >
            {message}
          </p>
        ) : null}
      </Panel>

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
    </>
  );
}
