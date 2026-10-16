"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import Link from "next/link";
import { Search, Loader2, MessageSquare, CircleDot, CheckCircle2, Filter, Plus, Bell, BellOff, BellDot, GitPullRequest } from "lucide-react";
import { CreateIssueModal } from "@/components/CreateIssueModal";
import { LabelBadge } from "@/components/LabelBadge";
import { Badge, EmptyState, SkeletonRows } from "@/components/ui/Card";
import { List, Panel, StatusDot } from "@/components/ui/List";
import { Input, Select } from "@/components/ui/Input";
import { csrfFetch } from "@/lib/csrf-client";
import { RelativeTime } from "@/components/RelativeTime";
import { cn } from "@/lib/cn";

type Issue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  user: { login: string; avatar_url: string; html_url: string } | null;
  labels: Array<{ name: string; color: string }>;
  comments: number;
  pull_request?: { url: string };
  assignees?: Array<{ login: string; avatar_url: string }>;
  milestone?: { title: string } | null;
};

type NotificationLevel = "participating" | "all_activity" | "ignore";

const NOTIFICATION_LEVELS: Array<{ key: NotificationLevel; label: string; icon: typeof Bell }> = [
  { key: "participating", label: "Participating", icon: Bell },
  { key: "all_activity", label: "All activity", icon: BellDot },
  { key: "ignore", label: "Ignore", icon: BellOff },
];

function stripMarkdown(body: string | null): string {
  if (!body) return "";
  return body
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`[^`]*`/g, "[code]")
    .replace(/^#{1,6}\s/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "[image]")
    .replace(/^\s*[-*+]\s/gm, "")
    .replace(/^\s*\d+\.\s/gm, "")
    .trim()
    .slice(0, 200);
}

function IssueRow({
  issue,
  href,
  githubLinked,
  level,
  menuOpen,
  onToggleMenu,
  onSelectLevel,
}: {
  issue: Issue;
  href?: string;
  githubLinked: boolean;
  level: NotificationLevel;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onSelectLevel: (level: NotificationLevel) => void;
}) {
  const stateIcon = issue.pull_request ? (
    <GitPullRequest className="h-4 w-4 text-accent" aria-hidden="true" />
  ) : issue.state === "open" ? (
    <CircleDot className="h-4 w-4 text-status-success" aria-hidden="true" />
  ) : (
    <CheckCircle2 className="h-4 w-4 text-text-faint" aria-hidden="true" />
  );

  const BellIcon = level === "all_activity" ? BellDot : level === "participating" ? Bell : BellOff;
  const bellMuted = level === "ignore";

  const body = (
    <>
      <span className="mt-0.5 shrink-0">{stateIcon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="mono shrink-0 text-xs text-text-faint">#{issue.number}</span>
          <span className="truncate text-sm font-medium text-text">{issue.title}</span>
          {issue.pull_request && <Badge tone="accent">PR</Badge>}
        </div>
        {issue.body && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-muted">{stripMarkdown(issue.body)}</p>
        )}
        {issue.labels.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {issue.labels.slice(0, 5).map((label) => (
              <LabelBadge key={label.name} name={label.name} color={label.color} />
            ))}
            {issue.labels.length > 5 && (
              <span className="text-2xs text-text-faint">+{issue.labels.length - 5} more</span>
            )}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-faint">
          <StatusDot tone={issue.state === "open" ? "success" : "neutral"}>
            {issue.state === "open" ? "Open" : "Closed"}
          </StatusDot>
          {issue.user && (
            <span className="inline-flex items-center gap-1.5">
              <img src={issue.user.avatar_url} alt="" className="h-4 w-4 rounded-full" loading="lazy" />
              <span>{issue.user.login}</span>
            </span>
          )}
          <span>updated <RelativeTime value={issue.updated_at} /></span>
          {issue.comments > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" aria-hidden="true" />
              {issue.comments}
            </span>
          )}
        </div>
      </div>
    </>
  );

  return (
    <li className={cn("flex items-start gap-3 px-4 py-3 transition-colors", href && "hover:bg-surface")}>
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 items-start gap-3">
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-3">{body}</div>
      )}

      {githubLinked && (
        <div className="relative shrink-0">
          <button
            type="button"
            className="icon-button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Notification settings for issue #${issue.number}`}
            onClick={onToggleMenu}
          >
            <BellIcon className={cn("h-4 w-4", !bellMuted && "text-accent")} aria-hidden="true" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" aria-hidden="true" onClick={onToggleMenu} />
              <div
                role="menu"
                aria-label={`Notification level for issue #${issue.number}`}
                className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-md"
              >
                {NOTIFICATION_LEVELS.map((option) => {
                  const Icon = option.icon;
                  const current = level === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      role="menuitem"
                      onClick={() => onSelectLevel(option.key)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium transition-colors",
                        current ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-surface hover:text-text"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function IssuesTab({ owner, repo, appId }: { owner: string; repo: string; appId?: string }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<"open" | "closed" | "all">("open");
  const [sortBy, setSortBy] = useState<"created" | "comments">("created");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [githubLinked, setGithubLinked] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<Record<string, string>>({});
  const [activeBell, setActiveBell] = useState<number | null>(null);

  const fetchIssues = useCallback(
    async (s: string, p: number, append: boolean) => {
      startTransition(() => {
        if (append) setLoadingMore(true);
        else setLoading(true);
        setError("");
      });

      try {
        const res = await fetch(
          `/api/github/issues?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&state=${s}&page=${p}`
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load issues");
        }
        const data = await res.json();
        startTransition(() => { setIssues((prev) => (append ? [...prev, ...data.issues] : data.issues)); setTotalCount(data.totalCount); setPage(p); });
      } catch (err) {
        startTransition(() => setError(err instanceof Error ? err.message : "Failed to load issues"));
      } finally {
        startTransition(() => { setLoading(false); setLoadingMore(false); });
      }
    },
    [owner, repo]
  );

  useEffect(() => {
    fetchIssues(state, 1, false);
  }, [state, fetchIssues]);

  useEffect(() => {
    fetch("/api/account/github")
      .then((res) => res.json())
      .then((data) => {
        const linked = data.link?.linked || false;
        setGithubLinked(linked);
        if (linked) {
          fetch(`/api/github/notification-setting?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`)
            .then((r) => r.json())
            .then((d) => setNotificationSettings(d.settings || {}))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [owner, repo]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Escape closes the open notification menu.
  useEffect(() => {
    if (activeBell === null) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setActiveBell(null);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [activeBell]);

  const filteredIssues = (debouncedSearch
    ? issues.filter(
        (issue) =>
          issue.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          issue.labels.some((l) => l.name.toLowerCase().includes(debouncedSearch.toLowerCase()))
      )
    : issues
  ).sort((a, b) => {
    if (sortBy === "comments") return b.comments - a.comments;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const hasMore = issues.length < totalCount;

  async function setNotificationLevel(issueNumber: number, level: NotificationLevel) {
    const key = `${owner}/${repo}/${issueNumber}`;
    const issue = issues.find((i) => i.number === issueNumber);
    const res = await csrfFetch("/api/github/notification-setting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, repo, issueNumber, level, issueTitle: issue?.title || `Issue #${issueNumber}` }),
    });
    if (res.ok) {
      setNotificationSettings((prev) => ({ ...prev, [key]: level }));
    }
    setActiveBell(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="chip-row" role="group" aria-label="Filter issues by state">
            {(["open", "closed", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                data-active={state === s}
                aria-pressed={state === s}
                onClick={() => setState(s)}
              >
                {s === "open" && <CircleDot className="h-3 w-3" aria-hidden="true" />}
                {s === "closed" && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                {s === "all" && <Filter className="h-3 w-3" aria-hidden="true" />}
                {s.charAt(0).toUpperCase() + s.slice(1)}
                {s === state && totalCount > 0 && <span className="mono text-2xs opacity-70">{totalCount}</span>}
              </button>
            ))}
          </div>
          {githubLinked && (
            <button type="button" onClick={() => setShowCreateModal(true)} className="btn btn--primary btn--sm">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              New issue
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1 lg:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter issues"
              aria-label="Filter issues by title or label"
              className="pl-8"
            />
          </div>
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "created" | "comments")}
            aria-label="Sort issues"
            className="w-44"
          >
            <option value="created">Newest</option>
            <option value="comments">Most commented</option>
          </Select>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </div>
      )}

      {loading && (
        <Panel flush>
          <SkeletonRows rows={5} columns={3} />
        </Panel>
      )}

      {!loading && !error && filteredIssues.length === 0 && (
        <EmptyState
          icon={<CircleDot className="h-4 w-4" />}
          title={debouncedSearch ? "No issues match your filter" : `No ${state} issues`}
          description={
            debouncedSearch
              ? "Try a different search term."
              : "There are no issues in this repository for this state."
          }
        />
      )}

      {!loading && filteredIssues.length > 0 && (
        <Panel flush>
          <List>
            {filteredIssues.map((issue) => {
              const level = (notificationSettings[`${owner}/${repo}/${issue.number}`] as NotificationLevel | undefined) || "ignore";
              return (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  href={appId ? `/apps/${appId}/issues/${issue.number}` : undefined}
                  githubLinked={githubLinked}
                  level={level}
                  menuOpen={activeBell === issue.number}
                  onToggleMenu={() => setActiveBell(activeBell === issue.number ? null : issue.number)}
                  onSelectLevel={(next) => setNotificationLevel(issue.number, next)}
                />
              );
            })}
          </List>
        </Panel>
      )}

      <CreateIssueModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => fetchIssues(state, 1, false)}
        owner={owner}
        repo={repo}
      />

      {!loading && hasMore && !debouncedSearch && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => fetchIssues(state, page + 1, true)}
            disabled={loadingMore}
            className="btn btn--ghost"
          >
            {loadingMore ? (
              <>
                <Loader2 className="h-4 w-4 spin" aria-hidden="true" />
                Loading…
              </>
            ) : (
              `Load more · ${issues.length} of ${totalCount.toLocaleString()}`
            )}
          </button>
        </div>
      )}
    </div>
  );
}
