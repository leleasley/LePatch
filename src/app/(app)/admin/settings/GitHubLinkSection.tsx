"use client";

import { Link2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";

type LinkStatus = {
  linked: boolean;
  githubUsername: string | null;
  linkedAt: string | null;
  lastUsedAt: string | null;
};

export function GitHubLinkSection() {
  const [enabled, setEnabled] = useState(false);
  const [link, setLink] = useState<LinkStatus>({
    linked: false,
    githubUsername: null,
    linkedAt: null,
    lastUsedAt: null,
  });
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/account/github");
    if (response.ok) {
      const data = await response.json();
      setEnabled(Boolean(data.enabled));
      setLink(data.link);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  async function connect() {
    setWorking(true);
    setMessage("");
    window.location.href = "/api/auth/github?mode=link";
  }

  async function unlink() {
    setWorking(true);
    setMessage("");
    const response = await csrfFetch("/api/account/github", { method: "DELETE" });
    setWorking(false);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || "Failed to disconnect GitHub");
      return;
    }
    setMessage("GitHub disconnected");
    load();
  }

  function formatDate(value: string | null) {
    return value ? new Date(value).toLocaleString() : "N/A";
  }

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/assets/github.svg" alt="" className="h-5 w-5" />
          <h2 className="text-lg font-medium">GitHub Account</h2>
        </div>
        {!link.linked && (
          <button
            onClick={connect}
            disabled={working || !enabled}
            className="focus-ring inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" />
            Connect GitHub
          </button>
        )}
      </div>

      {!enabled ? (
        <p className="text-sm text-text-muted">An administrator must configure GitHub OAuth first.</p>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-text-muted">
            Connect your GitHub account to sign in with GitHub and create issues directly from LePatch.
          </p>

          <div className="rounded-md border border-line bg-surface p-3">
            <div className="text-text">Current connection</div>
            {link.linked ? (
              <div className="mt-2 space-y-1 text-text-muted">
                <div className="flex items-center gap-2">
                  <img src="/assets/github.svg" alt="" className="h-4 w-4" />
                  <span className="font-medium text-text">{link.githubUsername}</span>
                </div>
                <div>Connected: {formatDate(link.linkedAt)}</div>
                <div>Last used: {formatDate(link.lastUsedAt)}</div>
              </div>
            ) : (
              <p className="mt-2 text-text-muted">No GitHub account connected yet.</p>
            )}
          </div>

          {link.linked && (
            <button
              onClick={unlink}
              disabled={working}
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-red-500/40 px-3 py-1.5 text-sm text-status-danger hover:bg-status-danger/10 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Disconnect GitHub
            </button>
          )}
        </div>
      )}

      {message && (
        <p className={`mt-4 rounded-md border p-3 text-sm ${
          message.includes("Failed") || message.includes("failed")
            ? "border-red-500/40 bg-status-danger/10 text-red-200"
            : "border-emerald-500/40 bg-status-success/10 text-emerald-200"
        }`}>
          {message}
        </p>
      )}
    </section>
  );
}
