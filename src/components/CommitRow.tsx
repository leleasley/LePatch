import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, GitCommit, ExternalLink, Copy, Check } from "lucide-react";
import { StatusDot, type StatusTone } from "@/components/ui/List";
import { cn } from "@/lib/cn";
import type { CommitWithStatus } from "@/lib/commit-snapshot";

const STATUS_TONE: Record<string, StatusTone> = {
  success: "success",
  failure: "danger",
  in_progress: "warning",
  pending: "warning",
  neutral: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  success: "Passing",
  failure: "Failing",
  in_progress: "Running",
  pending: "Pending",
  neutral: "No CI",
};

const STATUS_DOT_BG: Record<StatusTone, string> = {
  success: "bg-status-success",
  danger: "bg-status-danger",
  warning: "bg-status-warning",
  neutral: "bg-text-faint",
  accent: "bg-accent",
};

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
  const tone = STATUS_TONE[commit.status.state] ?? "neutral";
  const statusLabel = STATUS_LABEL[commit.status.state] ?? "No CI";

  function copySha() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(commit.sha).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <li className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface">
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
          aria-hidden="true"
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel",
            STATUS_DOT_BG[tone]
          )}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Link
            href={commit.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="max-w-full truncate text-sm font-medium text-text transition-colors hover:text-accent"
          >
            {commit.messageHeadline}
          </Link>
          {commit.status.total > 0 && (
            <span className="text-xs text-text-faint">
              {commit.status.total} check{commit.status.total === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          <span className="max-w-[12rem] truncate sm:max-w-[16rem]">
            {commit.author.login ? (
              <a
                href={commit.author.htmlUrl || commit.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                {commit.author.login}
              </a>
            ) : (
              <span>{commit.author.name}</span>
            )}
          </span>
          <span aria-hidden="true" className="text-text-faint">·</span>
          <button
            type="button"
            onClick={copySha}
            className="mono inline-flex items-center gap-1 text-text-faint transition-colors hover:text-text"
            title="Copy full SHA"
            aria-label={`Copy commit SHA ${commit.shortSha}`}
          >
            {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <GitCommit className="h-3 w-3" aria-hidden="true" />}
            {commit.shortSha}
          </button>
          {commit.author.date && (
            <>
              <span aria-hidden="true" className="text-text-faint">·</span>
              <time
                dateTime={commit.author.date}
                className="text-text-faint"
                title={new Date(commit.author.date).toLocaleString()}
              >
                {formatRelativeTime(commit.author.date)}
              </time>
            </>
          )}
        </div>

        {canExpand && (
          <>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-text-faint transition-colors hover:text-text-muted"
            >
              {expanded ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronRight className="h-3 w-3" aria-hidden="true" />}
              {hasMultipleChecks
                ? expanded
                  ? "Hide checks"
                  : `Show ${commit.status.checks.length} checks`
                : expanded
                  ? "Hide message"
                  : "Show message"}
            </button>

            {expanded && (
              <div className="mt-2 space-y-2 rounded-md border border-border bg-surface p-3 text-xs">
                {hasMultipleChecks && (
                  <div className="flex flex-wrap gap-1.5">
                    {commit.status.checks.map((check) =>
                      check.url ? (
                        <a
                          key={check.name}
                          href={check.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn("status-pill", `status-pill--${check.state}`, "transition-opacity hover:opacity-80")}
                          title={check.name}
                        >
                          {check.name}
                        </a>
                      ) : (
                        <span
                          key={check.name}
                          className={cn("status-pill", `status-pill--${check.state}`)}
                          title={check.name}
                        >
                          {check.name}
                        </span>
                      )
                    )}
                  </div>
                )}
                {commit.message.includes("\n") && (
                  <pre className="m-0 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-text-muted">
                    {commit.message}
                  </pre>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Link
                    href={commit.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-text-faint transition-colors hover:text-text"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    View on GitHub
                  </Link>
                  <span aria-hidden="true" className="text-text-faint">·</span>
                  <button
                    type="button"
                    onClick={copySha}
                    className="inline-flex items-center gap-1 text-xs text-text-faint transition-colors hover:text-text"
                  >
                    {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                    Copy SHA
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 pt-0.5">
        <StatusDot tone={tone} pulse={commit.status.state === "in_progress"}>{statusLabel}</StatusDot>
      </div>
    </li>
  );
}
