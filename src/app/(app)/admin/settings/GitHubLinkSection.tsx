"use client";

import { Link2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { Panel } from "@/components/ui/List";

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

  const failed = message.includes("Failed") || message.includes("failed");

  return (
    <Panel
      title="GitHub"
      description="Connect your GitHub account to sign in with GitHub and create issues from LePatch."
      actions={
        !link.linked ? (
          <button
            type="button"
            onClick={connect}
            disabled={working || !enabled}
            className="btn btn--primary btn--sm"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            Connect GitHub
          </button>
        ) : undefined
      }
      flush
    >
      {!enabled ? (
        <p className="p-4 text-sm text-text-muted">
          An administrator must configure GitHub OAuth first.
        </p>
      ) : (
        <div className="flex flex-col gap-4 p-4 text-sm">
          <p className="text-text-muted">
            Connect your GitHub account to sign in with GitHub and create issues directly from
            LePatch.
          </p>

          <div className="rounded-md border border-border bg-surface p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-faint">
              Current connection
            </p>
            {link.linked ? (
              <div className="mt-2 space-y-1 text-text-muted">
                <div className="flex items-center gap-2">
                  <img src="/assets/github.svg" alt="" className="h-4 w-4" aria-hidden="true" />
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
            <div>
              <button
                type="button"
                onClick={unlink}
                disabled={working}
                className="btn btn--danger btn--sm"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Disconnect GitHub
              </button>
            </div>
          )}
        </div>
      )}

      {message && (
        <p
          role={failed ? "alert" : "status"}
          aria-live="polite"
          className={`border-t border-border px-4 py-2.5 text-xs ${
            failed ? "text-status-danger" : "text-status-success"
          }`}
        >
          {message}
        </p>
      )}
    </Panel>
  );
}
