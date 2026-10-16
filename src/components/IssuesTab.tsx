"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, ExternalLink, MessageSquare, CircleDot, CheckCircle2, Filter, Plus, Bell, BellOff, BellDot, GitPullRequest, ArrowUpDown } from "lucide-react";
import { CreateIssueModal } from "@/components/CreateIssueModal";
import { LabelBadge } from "@/components/LabelBadge";
import { csrfFetch } from "@/lib/csrf-client";
import { timeAgo } from "@/lib/time-ago";

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

export function IssuesTab({ owner, repo, appId }: { owner: string; repo: string; appId?: string }) {
  const router = useRouter();
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

  async function setNotificationLevel(e: React.MouseEvent, issueNumber: number, level: string) {
    e.stopPropagation();
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_50%,transparent)] p-0.5">
            {(["open", "closed", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setState(s)}
                data-active={state === s}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.78rem] font-medium transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                style={state === s ? { background: "var(--color-accent)", color: "var(--color-accent-foreground)" } : undefined}
              >
                {s === "open" && <CircleDot className="h-3 w-3" />}
                {s === "closed" && <CheckCircle2 className="h-3 w-3" />}
                {s === "all" && <Filter className="h-3 w-3" />}
                {s.charAt(0).toUpperCase() + s.slice(1)}
                {s === state && totalCount > 0 && (
                  <span className="ml-0.5 text-[0.65rem] opacity-80">{totalCount}</span>
                )}
              </button>
            ))}
          </div>
          {githubLinked && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn--primary btn--sm"
            >
              <Plus className="h-3.5 w-3.5" />
              New Issue
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-faint)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter issues…"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_50%,transparent)] py-1.5 pl-9 pr-3 text-[0.82rem] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)] transition-all sm:w-64"
          />
        </div>
        <div className="relative">
          <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-faint)]" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "created" | "comments")}
            className="appearance-none rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_50%,transparent)] py-1.5 pl-9 pr-8 text-[0.82rem] text-[var(--color-text)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)] transition-all"
          >
            <option value="created">Newest</option>
            <option value="comments">Most commented</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--theme-status-failure-border)] bg-[var(--theme-status-failure-bg)] p-3 text-sm text-[var(--color-status-danger)]">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="app-shell-card p-4">
              <div className="flex items-start gap-3">
                <div className="skeleton h-5 w-5 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-3/4" />
                  <div className="skeleton h-3 w-full" />
                  <div className="flex gap-2">
                    <div className="skeleton h-5 w-12" />
                    <div className="skeleton h-5 w-16" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && filteredIssues.length === 0 && (
        <div className="empty-state">
          <span className="empty-state-icon">
            <CircleDot className="h-5 w-5" />
          </span>
          <p className="empty-state-title">
            {debouncedSearch ? "No issues match your filter" : `No ${state} issues`}
          </p>
          <p className="empty-state-copy">
            {debouncedSearch ? "Try a different search term" : "There are no issues in this repository."}
          </p>
        </div>
      )}

      {!loading && filteredIssues.length > 0 && (
        <ul className="space-y-2">
          {filteredIssues.map((issue) => (
            <li key={issue.id}>
              <button
                type="button"
                onClick={() => (appId ? router.push(`/apps/${appId}/issues/${issue.number}`) : undefined)}
                className={`app-shell-card group block w-full p-4 text-left transition-all hover:border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)] ${!appId ? "cursor-default" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {issue.pull_request ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-accent-border)] bg-[var(--color-accent-muted)]">
                        <GitPullRequest className="h-3 w-3 text-[var(--color-accent)]" />
                      </span>
                    ) : issue.state === "open" ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--theme-status-success-border)] bg-[var(--theme-status-success-bg)]">
                        <CircleDot className="h-3 w-3 text-[var(--color-status-success)]" />
                      </span>
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-accent-border)] bg-[var(--color-accent-muted)]">
                        <CheckCircle2 className="h-3 w-3 text-[var(--color-accent)]" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <h3 className="text-sm font-semibold text-[var(--color-text)] group-hover:text-[var(--color-accent)] transition-colors line-clamp-1">
                        {issue.title}
                      </h3>
                      <span className="shrink-0 text-[0.7rem] text-[var(--color-text-faint)] app-mono">#{issue.number}</span>
                      {issue.pull_request && (
                        <span className="shrink-0 rounded-full border border-[var(--color-accent-border)] bg-[var(--color-accent-muted)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-accent)]">PR</span>
                      )}
                    </div>
                    {issue.body && (
                      <p className="mt-1 text-[0.78rem] text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
                        {stripMarkdown(issue.body)}
                      </p>
                    )}
                    {issue.labels.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {issue.labels.slice(0, 5).map((label) => (
                          <LabelBadge key={label.name} name={label.name} color={label.color} />
                        ))}
                        {issue.labels.length > 5 && (
                          <span className="text-[0.7rem] text-[var(--color-text-faint)]">
                            +{issue.labels.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.72rem] text-[var(--color-text-faint)]">
                      {issue.user && (
                        <span className="inline-flex items-center gap-1.5">
                          <img
                            src={issue.user.avatar_url}
                            alt=""
                            className="h-4 w-4 rounded-full"
                            loading="lazy"
                          />
                          <span>{issue.user.login}</span>
                        </span>
                      )}
                      {issue.assignees && issue.assignees.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-[var(--color-text-faint)]">→</span>
                          {issue.assignees.slice(0, 3).map((a) => (
                            <img
                              key={a.login}
                              src={a.avatar_url}
                              alt={a.login}
                              title={a.login}
                              className="h-4 w-4 rounded-full -ml-1 first:ml-0"
                              loading="lazy"
                            />
                          ))}
                          {issue.assignees.length > 3 && (
                            <span>+{issue.assignees.length - 3}</span>
                          )}
                        </span>
                      )}
                      <span>{timeAgo(issue.created_at)}</span>
                      {issue.comments > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {issue.comments}
                        </span>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 shrink-0 text-[var(--color-text-faint)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  {githubLinked && (
                    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setActiveBell(activeBell === issue.number ? null : issue.number)}
                        className="text-[var(--color-text-faint)] hover:text-[var(--color-accent)] transition-colors"
                      >
                        {notificationSettings[`${owner}/${repo}/${issue.number}`] === "ignore" ||
                        !notificationSettings[`${owner}/${repo}/${issue.number}`] ? (
                          <BellOff className="h-4 w-4" />
                        ) : notificationSettings[`${owner}/${repo}/${issue.number}`] === "all_activity" ? (
                          <BellDot className="h-4 w-4 text-[var(--color-accent)]" />
                        ) : (
                          <Bell className="h-4 w-4 text-[var(--color-accent)]" />
                        )}
                      </button>
                      {activeBell === issue.number && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setActiveBell(null)} />
                          <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_95%,transparent)] shadow-xl">
                            <div className="p-1">
                              {(["participating", "all_activity", "ignore"] as const).map((level) => {
                                const current = notificationSettings[`${owner}/${repo}/${issue.number}`] || "ignore";
                                return (
                                  <button
                                    key={level}
                                    onClick={(e) => setNotificationLevel(e, issue.number, level)}
                                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[0.78rem] font-medium transition-colors ${
                                      current === level
                                        ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                                        : "text-[var(--color-text-muted)] hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] hover:text-[var(--color-text)]"
                                    }`}
                                  >
                                    {level === "participating" && <Bell className="h-3.5 w-3.5" />}
                                    {level === "all_activity" && <BellDot className="h-3.5 w-3.5" />}
                                    {level === "ignore" && <BellOff className="h-3.5 w-3.5" />}
                                    {level === "participating" && "Participating"}
                                    {level === "all_activity" && "All activity"}
                                    {level === "ignore" && "Ignore"}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <CreateIssueModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => fetchIssues(state, 1, false)}
        owner={owner}
        repo={repo}
      />

      {!loading && hasMore && !debouncedSearch && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => fetchIssues(state, page + 1, true)}
            disabled={loadingMore}
            className="btn btn--ghost"
          >
            {loadingMore ? (
              <>
                <Loader2 className="h-4 w-4 spin" />
                Loading...
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
