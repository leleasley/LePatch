import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, GitCommit, ExternalLink, Copy, Check } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import type { CommitWithStatus } from "@/lib/commit-snapshot";

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  if (Number.isNaN(diff)) return "";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return new Date(iso).toLocaleDateString();
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function CommitRow({ commit, expanded: defaultExpanded }: { commit: CommitWithStatus; expanded?: boolean }) {
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));
  const [copied, setCopied] = useState(false);
  const hasMultipleChecks = commit.status.checks.length > 1;
  const canExpand = hasMultipleChecks || commit.message.includes("\n");
  const displayName = commit.author.login || commit.author.name;
  const initials = getInitials(commit.author.name);

  function copySha() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(commit.sha).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <div className="commit-row group">
      <div className="relative shrink-0">
        {commit.author.avatarUrl ? (
          <img
            src={commit.author.avatarUrl}
            alt={displayName}
            width={32}
            height={32}
            className="commit-avatar"
            style={{ background: "transparent" }}
            loading="lazy"
          />
        ) : (
          <span className="commit-avatar" title={displayName}>
            {initials}
          </span>
        )}
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-panel ring-2 ring-panel"
          title={commit.status.state}
        >
          <StatusBadge status={commit.status.state} variant="dot" />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Link
            href={commit.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-[var(--theme-text)] hover:text-[var(--theme-accent)] transition-colors truncate max-w-full"
          >
            {commit.messageHeadline}
          </Link>
          {commit.status.total > 0 && (
            <span className="text-[0.7rem] text-[var(--theme-text-faint)]">
              {commit.status.total} check{commit.status.total === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem] text-[var(--theme-text-muted)]">
          <span className="truncate max-w-[12rem] sm:max-w-[16rem]">
            {commit.author.login ? (
              <Link
                href={commit.author.htmlUrl || commit.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="app-link"
              >
                {commit.author.login}
              </Link>
            ) : (
              <span>{commit.author.name}</span>
            )}
          </span>
          <span className="text-[var(--theme-text-faint)]">·</span>
          <span className="app-mono text-[0.72rem] inline-flex items-center gap-1">
            <button
              type="button"
              onClick={copySha}
              className="inline-flex items-center gap-1 text-[var(--theme-text-faint)] hover:text-[var(--theme-text)] transition-colors"
              title="Copy full SHA"
            >
              {copied ? <Check className="h-3 w-3" /> : <GitCommit className="h-3 w-3" />}
              {commit.shortSha}
            </button>
          </span>
          {commit.author.date && (
            <>
              <span className="text-[var(--theme-text-faint)]">·</span>
              <span className="text-[var(--theme-text-faint)]" title={new Date(commit.author.date).toLocaleString()}>
                {formatRelativeTime(commit.author.date)}
              </span>
            </>
          )}
        </div>

        {(canExpand || hasMultipleChecks) && (
          <>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-1.5 inline-flex items-center gap-1 text-[0.72rem] text-[var(--theme-text-faint)] hover:text-[var(--theme-text-muted)] transition-colors"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {hasMultipleChecks
                ? expanded
                  ? "Hide checks"
                  : `Show ${commit.status.checks.length} checks`
                : expanded
                  ? "Hide message"
                  : "Show message"}
            </button>

            {expanded && (
              <div className="mt-2 rounded-lg border border-[var(--theme-line)] bg-[color-mix(in_srgb,var(--theme-surface-elevated)_50%,transparent)] p-3 space-y-2 text-[0.78rem]">
                {hasMultipleChecks && (
                  <div className="flex flex-wrap gap-1.5">
                    {commit.status.checks.map((check) =>
                      check.url ? (
                        <Link
                          key={check.name}
                          href={check.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`status-pill status-pill--${check.state} hover:opacity-80 transition-opacity cursor-pointer`}
                          style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem" }}
                          title={check.name}
                        >
                          {check.name}
                        </Link>
                      ) : (
                        <span
                          key={check.name}
                          className={`status-pill status-pill--${check.state}`}
                          style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem" }}
                          title={check.name}
                        >
                          {check.name}
                        </span>
                      )
                    )}
                  </div>
                )}
                {commit.message.includes("\n") && (
                  <pre className="whitespace-pre-wrap break-words font-sans text-[0.78rem] leading-relaxed text-[var(--theme-text-muted)] m-0">
                    {commit.message}
                  </pre>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Link
                    href={commit.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[0.72rem] text-[var(--theme-text-faint)] hover:text-[var(--theme-text)] transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View on GitHub
                  </Link>
                  <span className="text-[var(--theme-text-faint)]">·</span>
                  <button
                    type="button"
                    onClick={copySha}
                    className="inline-flex items-center gap-1 text-[0.72rem] text-[var(--theme-text-faint)] hover:text-[var(--theme-text)] transition-colors"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    Copy SHA
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
