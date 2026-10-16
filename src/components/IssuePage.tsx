"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft, CheckCircle2, ExternalLink,
  Send, Loader2, Bold, Italic, Code, Link as LinkIcon,
  List, Quote, X, Bell, BellOff, BellDot, Strikethrough,
  Heading, ListOrdered, CheckSquare, Table, AtSign, Terminal
} from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { MarkdownContent } from "@/components/MarkdownContent";
import { LabelBadge } from "@/components/LabelBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { List as ListContainer, Panel, StatusDot } from "@/components/ui/List";
import { ErrorState, Skeleton } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

type IssueData = {
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
  assignees: Array<{ login: string; avatar_url: string }>;
  milestone: { title: string; number: number } | null;
  pull_request: unknown | null;
};

type Comment = {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string; html_url: string } | null;
};

type CloseReason = {
  label: string;
  value: string;
};

const CLOSE_REASONS: CloseReason[] = [
  { label: "Not relevant", value: "not_relevant" },
  { label: "Fixed in latest version", value: "fixed" },
  { label: "Duplicate", value: "duplicate" },
  { label: "Won't fix", value: "wont_fix" },
  { label: "Other (custom)", value: "custom" },
];

const REASON_LABELS: Record<string, string> = {
  not_relevant: "Not relevant",
  fixed: "Fixed in latest version",
  duplicate: "Duplicate",
  wont_fix: "Won't fix",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return formatDate(dateStr);
}

function MarkdownToolbar({ onInsert }: { onInsert: (before: string, after?: string) => void }) {
  const btnClass = "rounded p-1 text-text-muted transition-colors hover:bg-surface hover:text-text";
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
      <button type="button" onClick={() => onInsert("**", "**")} className={btnClass} title="Bold" aria-label="Bold">
        <Bold className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => onInsert("*", "*")} className={btnClass} title="Italic" aria-label="Italic">
        <Italic className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => onInsert("~~", "~~")} className={btnClass} title="Strikethrough" aria-label="Strikethrough">
        <Strikethrough className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="mx-1 h-5 w-px bg-border" />
      <button type="button" onClick={() => onInsert("# ")} className={btnClass} title="Heading" aria-label="Heading">
        <Heading className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => onInsert("`", "`")} className={btnClass} title="Inline code" aria-label="Inline code">
        <Code className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => onInsert("\n```\n", "\n```\n")} className={btnClass} title="Code block" aria-label="Code block">
        <Terminal className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="mx-1 h-5 w-px bg-border" />
      <button type="button" onClick={() => onInsert("[", "](url)")} className={btnClass} title="Link" aria-label="Link">
        <LinkIcon className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => onInsert("\n- ")} className={btnClass} title="Unordered list" aria-label="Unordered list">
        <List className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => onInsert("\n1. ")} className={btnClass} title="Ordered list" aria-label="Ordered list">
        <ListOrdered className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => onInsert("\n- [ ] ")} className={btnClass} title="Task list" aria-label="Task list">
        <CheckSquare className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="mx-1 h-5 w-px bg-border" />
      <button type="button" onClick={() => onInsert("\n> ")} className={btnClass} title="Quote" aria-label="Quote">
        <Quote className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => onInsert(
        "\n| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell     | Cell     | Cell     |\n"
      )} className={btnClass} title="Table" aria-label="Table">
        <Table className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => onInsert("@")} className={btnClass} title="Mention someone" aria-label="Mention someone">
        <AtSign className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function MetaSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-2xs font-semibold uppercase tracking-wide text-text-faint">{title}</dt>
      <dd className="mt-1.5 text-sm text-text-muted">{children}</dd>
    </div>
  );
}

function AuthorLine({
  user,
  action,
  timestamp,
}: {
  user: { login: string; avatar_url: string; html_url: string } | null;
  action: string;
  timestamp: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {user && (
        <>
          <img src={user.avatar_url} alt="" className="h-6 w-6 rounded-full" loading="lazy" />
          <a
            href={user.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-text transition-colors hover:text-accent"
          >
            {user.login}
          </a>
        </>
      )}
      <span className="text-xs text-text-muted">{action}</span>
      <span className="ml-auto text-xs text-text-faint">{formatDate(timestamp)}</span>
    </div>
  );
}

export function IssuePage({
  owner,
  repo,
  issueNumber,
}: {
  owner: string;
  repo: string;
  issueNumber: number;
}) {
  const router = useRouter();
  const [issue, setIssue] = useState<IssueData | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [githubLinked, setGithubLinked] = useState(false);
  const [githubUsername, setGithubUsername] = useState("");

  const [commentBody, setCommentBody] = useState("");
  const [commentTab, setCommentTab] = useState<"write" | "preview">("write");
  const [submittingComment, setSubmittingComment] = useState(false);

  const [closing, setClosing] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [closeCustomReason, setCloseCustomReason] = useState("");
  const [showCloseReason, setShowCloseReason] = useState(false);

  const [isTracked, setIsTracked] = useState(false);

  const fetchIssue = useCallback(async () => {
    startTransition(() => { setLoading(true); setError(""); });
    try {
      const res = await fetch(
        `/api/github/issue-detail?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&issueNumber=${issueNumber}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load issue");
      }
      const data = await res.json();
      startTransition(() => { setIssue(data.issue); setComments(data.comments || []); });
    } catch (err) {
      startTransition(() => setError(err instanceof Error ? err.message : "Failed to load issue"));
    } finally {
      startTransition(() => setLoading(false));
    }
  }, [owner, repo, issueNumber]);

  useEffect(() => { fetchIssue(); }, [fetchIssue]);

  useEffect(() => {
    fetch("/api/account/github")
      .then((r) => r.json())
      .then((data) => {
        setGithubLinked(data.link?.linked || false);
        setGithubUsername(data.link?.githubUsername || "");
      })
      .catch(() => {});
    fetch(`/api/github/notification-setting?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`)
      .then((r) => r.json())
      .then((data) => {
        const settings = data.settings || {};
        setIsTracked(settings[`${owner}/${repo}/${issueNumber}`] && settings[`${owner}/${repo}/${issueNumber}`] !== "ignore");
      })
      .catch(() => {});
  }, [owner, repo, issueNumber]);

  async function submitComment() {
    if (!commentBody.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await csrfFetch("/api/github/comment-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, issueNumber, body: commentBody.trim() }),
      });
      if (res.ok) { setCommentBody(""); setCommentTab("write"); fetchIssue(); }
    } finally { setSubmittingComment(false); }
  }

  async function closeIssue() {
    setClosing(true);
    try {
      const reasonValue = closeReason === "custom" ? closeCustomReason : REASON_LABELS[closeReason] || closeReason;
      if (reasonValue && issue?.state === "open") {
        await csrfFetch("/api/github/comment-issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner, repo, issueNumber, body: `**Closing reason:** ${reasonValue}` }),
        });
      }
      const res = await csrfFetch("/api/github/close-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, issueNumber, action: "close" }),
      });
      if (res.ok) { fetchIssue(); setShowCloseReason(false); setCloseReason(""); setCloseCustomReason(""); }
    } finally { setClosing(false); }
  }

  async function reopenIssue() {
    setClosing(true);
    try {
      const res = await csrfFetch("/api/github/close-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, issueNumber, action: "reopen" }),
      });
      if (res.ok) fetchIssue();
    } finally { setClosing(false); }
  }

  async function toggleTracking(level: string) {
    if (level === "ignore") {
      await csrfFetch("/api/github/notification-setting", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, issueNumber }),
      });
      setIsTracked(false);
    } else {
      await csrfFetch("/api/github/notification-setting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, issueNumber, level }),
      });
      setIsTracked(true);
    }
  }

  function handleCommentInsert(before: string, after?: string) {
    const textarea = document.getElementById("comment-textarea") as HTMLTextAreaElement;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = commentBody.substring(start, end);
    const newText = commentBody.substring(0, start) + before + selected + (after || "") + commentBody.substring(end);
    setCommentBody(newText);
    setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + before.length, start + before.length + selected.length); }, 0);
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading issue">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-3/4" />
        <Panel>
          <Skeleton className="h-40 w-full" />
        </Panel>
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div className="flex flex-col gap-4">
        <button type="button" onClick={() => router.back()} className="btn btn--subtle btn--sm self-start">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
        </button>
        <ErrorState title="Could not load issue" description={error || "Issue not found"} />
      </div>
    );
  }

  const isOpen = issue.state === "open";
  const currentLevel = isTracked ? "participating" : "ignore";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[
          { label: "Watched repositories", href: "/apps" },
          { label: `${owner}/${repo}`, href: `/apps/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` },
          { label: `#${issue.number}` },
        ]}
        title={issue.title}
        meta={
          <>
            <StatusDot tone={isOpen ? "success" : "neutral"}>{isOpen ? "Open" : "Closed"}</StatusDot>
            <span className="mono">#{issue.number}</span>
            <span>{issue.comments} comment{issue.comments !== 1 ? "s" : ""}</span>
            {issue.user && <span>opened by {issue.user.login} {timeAgo(issue.created_at)}</span>}
          </>
        }
        actions={
          <a
            href={issue.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--secondary btn--sm"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            GitHub
          </a>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Opening comment */}
          <Panel flush>
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <AuthorLine
                user={issue.user}
                action={`opened this issue ${timeAgo(issue.created_at)}`}
                timestamp={issue.created_at}
              />
            </div>
            <div className="px-4 py-4">
              {issue.body ? (
                <MarkdownContent body={issue.body} emptyMessage="No description provided."
                  linkBaseUrl={`https://github.com/${owner}/${repo}/blob/HEAD`}
                  imageBaseUrl={`https://raw.githubusercontent.com/${owner}/${repo}/HEAD`} />
              ) : (
                <p className="text-sm italic text-text-muted">No description provided.</p>
              )}
            </div>
          </Panel>

          {/* Comments */}
          <Panel
            flush
            title={comments.length > 0 ? `${comments.length} comment${comments.length === 1 ? "" : "s"}` : "Comments"}
          >
            {comments.length === 0 ? (
              <p className="px-4 py-4 text-sm text-text-muted">No comments yet.</p>
            ) : (
              <ListContainer>
                {comments.map((comment) => (
                  <li key={comment.id} className="px-4 py-4">
                    <AuthorLine
                      user={comment.user}
                      action={`commented ${timeAgo(comment.created_at)}${comment.updated_at !== comment.created_at ? " (edited)" : ""}`}
                      timestamp={comment.created_at}
                    />
                    <div className="mt-3">
                      <MarkdownContent body={comment.body} emptyMessage=""
                        linkBaseUrl={`https://github.com/${owner}/${repo}/blob/HEAD`}
                        imageBaseUrl={`https://raw.githubusercontent.com/${owner}/${repo}/HEAD`} />
                    </div>
                  </li>
                ))}
              </ListContainer>
            )}
          </Panel>

          {/* Comment form */}
          {githubLinked ? (
            <Panel title="Add a comment" flush>
              <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                <img src={`https://github.com/${githubUsername}.png`} alt="" className="h-5 w-5 rounded-full" loading="lazy" />
                <span className="text-xs text-text-muted">
                  Commenting as <span className="font-medium text-text">@{githubUsername}</span>
                </span>
              </div>
              <div className="flex gap-1 border-b border-border px-2">
                {(["write", "preview"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    aria-pressed={commentTab === tab}
                    onClick={() => setCommentTab(tab)}
                    className={cn(
                      "px-3 py-2 text-sm font-medium transition-colors",
                      commentTab === tab ? "border-b-2 border-accent text-text" : "text-text-muted hover:text-text"
                    )}
                  >
                    {tab === "write" ? "Write" : "Preview"}
                  </button>
                ))}
              </div>
              {commentTab === "write" && <MarkdownToolbar onInsert={handleCommentInsert} />}
              <div className="px-4 py-3">
                {commentTab === "write" ? (
                  <textarea
                    id="comment-textarea"
                    aria-label="Comment"
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Write a comment…"
                    rows={6}
                    className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                  />
                ) : (
                  <div className="min-h-[150px] rounded-md border border-border bg-surface px-3 py-2">
                    {commentBody.trim() ? <MarkdownContent body={commentBody} emptyMessage="Nothing to preview" /> : <p className="text-sm italic text-text-muted">Nothing to preview</p>}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <span className="text-xs text-text-faint">Markdown supported</span>
                <button
                  type="button"
                  onClick={submitComment}
                  disabled={submittingComment || !commentBody.trim()}
                  className="btn btn--primary"
                >
                  {submittingComment ? <Loader2 className="h-4 w-4 spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                  Comment
                </button>
              </div>
            </Panel>
          ) : (
            <Panel flush>
              <p className="px-4 py-5 text-center text-sm text-text-muted">
                <a href="/profile/security" className="text-accent hover:underline">Connect GitHub</a> to comment on issues.
              </p>
            </Panel>
          )}

          {/* Close / Reopen — only for the issue author */}
          {githubLinked && issue.user?.login === githubUsername && (
            <Panel title="Status">
              {isOpen ? (
                !showCloseReason ? (
                  <button type="button" className="btn btn--secondary" onClick={() => setShowCloseReason(true)}>
                    <X className="h-4 w-4" aria-hidden="true" /> Close issue
                  </button>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium text-text">Close with reason</p>
                    <div className="flex flex-wrap gap-2">
                      {CLOSE_REASONS.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          className="chip"
                          data-active={closeReason === r.value}
                          aria-pressed={closeReason === r.value}
                          onClick={() => setCloseReason(r.value)}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                    {closeReason === "custom" && (
                      <Input
                        label="Custom reason"
                        value={closeCustomReason}
                        onChange={(e) => setCloseCustomReason(e.target.value)}
                        placeholder="Enter reason"
                      />
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={closeIssue}
                        disabled={closing || (closeReason === "custom" && !closeCustomReason.trim())}
                        className="btn btn--danger"
                      >
                        {closing ? <Loader2 className="h-4 w-4 spin" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
                        Close issue
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowCloseReason(false); setCloseReason(""); setCloseCustomReason(""); }}
                        className="btn btn--ghost"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <button type="button" onClick={reopenIssue} disabled={closing} className="btn btn--secondary">
                  {closing ? <Loader2 className="h-4 w-4 spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                  Reopen issue
                </button>
              )}
            </Panel>
          )}
        </div>

        {/* Sidebar — a single tree that stacks under the content on mobile. */}
        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <Panel title="Details" flush>
            <dl className="divide-y divide-divider">
              <MetaSection title="Assignees">
                {issue.assignees.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {issue.assignees.map((a) => (
                      <div key={a.login} className="flex items-center gap-2">
                        <img src={a.avatar_url} alt="" className="h-5 w-5 rounded-full" loading="lazy" />
                        <span className="text-text">{a.login}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  "None yet"
                )}
              </MetaSection>
              <MetaSection title="Labels">
                {issue.labels.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {issue.labels.map((label) => <LabelBadge key={label.name} name={label.name} color={label.color} />)}
                  </div>
                ) : (
                  "None yet"
                )}
              </MetaSection>
              <MetaSection title="Type">{issue.pull_request ? "Pull request" : "Issue"}</MetaSection>
              <MetaSection title="Milestone">{issue.milestone ? issue.milestone.title : "None"}</MetaSection>
              <MetaSection title="Linked pull requests">None</MetaSection>
              <MetaSection title="Project">None</MetaSection>
              <MetaSection title="Parent issue">None</MetaSection>
              {githubLinked && (
                <MetaSection title="Notifications">
                  <div className="flex flex-col gap-0.5">
                    {(["participating", "all_activity", "ignore"] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => toggleTracking(level)}
                        aria-pressed={currentLevel === level}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                          currentLevel === level ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-surface hover:text-text"
                        )}
                      >
                        {level === "participating" && <Bell className="h-3.5 w-3.5" aria-hidden="true" />}
                        {level === "all_activity" && <BellDot className="h-3.5 w-3.5" aria-hidden="true" />}
                        {level === "ignore" && <BellOff className="h-3.5 w-3.5" aria-hidden="true" />}
                        {level === "participating" && "Participating"}
                        {level === "all_activity" && "All activity"}
                        {level === "ignore" && "Ignore"}
                      </button>
                    ))}
                  </div>
                </MetaSection>
              )}
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
