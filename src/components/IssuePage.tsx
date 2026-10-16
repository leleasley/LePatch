"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, CircleDot, CheckCircle2, ExternalLink,
  Send, Loader2, Info, Bold, Italic, Code, Link as LinkIcon,
  List, Quote, X, Bell, BellOff, BellDot, Strikethrough,
  Heading, ListOrdered, CheckSquare, Table, AtSign, Terminal
} from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { MarkdownContent } from "@/components/MarkdownContent";
import { ModalShell } from "@/components/ModalShell";

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

function LabelBadge({ label }: { label: { name: string; color: string } }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `#${label.color}20`, color: `#${label.color}`, border: `1px solid #${label.color}40` }}
    >
      {label.name}
    </span>
  );
}

function MarkdownToolbar({ onInsert }: { onInsert: (before: string, after?: string) => void }) {
  return (
    <div className="flex items-center gap-0.5 border-b border-line px-3 py-1.5 flex-wrap">
      <button type="button" onClick={() => onInsert("**", "**")} className="rounded p-1 text-text-muted hover:bg-surface hover:text-text" title="Bold (Ctrl+B)">
        <Bold className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onInsert("*", "*")} className="rounded p-1 text-text-muted hover:bg-surface hover:text-text" title="Italic (Ctrl+I)">
        <Italic className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onInsert("~~", "~~")} className="rounded p-1 text-text-muted hover:bg-surface hover:text-text" title="Strikethrough">
        <Strikethrough className="h-4 w-4" />
      </button>
      <div className="mx-1 h-5 w-px bg-line/50" />
      <button type="button" onClick={() => onInsert("# ")} className="rounded p-1 text-text-muted hover:bg-surface hover:text-text" title="Heading">
        <Heading className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onInsert("`", "`")} className="rounded p-1 text-text-muted hover:bg-surface hover:text-text" title="Inline code">
        <Code className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onInsert("\n```\n", "\n```\n")} className="rounded p-1 text-text-muted hover:bg-surface hover:text-text" title="Code block">
        <Terminal className="h-4 w-4" />
      </button>
      <div className="mx-1 h-5 w-px bg-line/50" />
      <button type="button" onClick={() => onInsert("[", "](url)")} className="rounded p-1 text-text-muted hover:bg-surface hover:text-text" title="Link">
        <LinkIcon className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onInsert("\n- ")} className="rounded p-1 text-text-muted hover:bg-surface hover:text-text" title="Unordered list">
        <List className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onInsert("\n1. ")} className="rounded p-1 text-text-muted hover:bg-surface hover:text-text" title="Ordered list">
        <ListOrdered className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onInsert("\n- [ ] ")} className="rounded p-1 text-text-muted hover:bg-surface hover:text-text" title="Task list">
        <CheckSquare className="h-4 w-4" />
      </button>
      <div className="mx-1 h-5 w-px bg-line/50" />
      <button type="button" onClick={() => onInsert("\n> ")} className="rounded p-1 text-text-muted hover:bg-surface hover:text-text" title="Quote">
        <Quote className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onInsert(
        "\n| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell     | Cell     | Cell     |\n"
      )} className="rounded p-1 text-text-muted hover:bg-surface hover:text-text" title="Table">
        <Table className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onInsert("@")} className="rounded p-1 text-text-muted hover:bg-surface hover:text-text" title="Mention someone">
        <AtSign className="h-4 w-4" />
      </button>
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

  const [showSidebarInfo, setShowSidebarInfo] = useState(false);
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
      <div className="min-h-screen bg-transparent pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-64 rounded bg-surface" />
            <div className="h-12 w-3/4 rounded bg-surface" />
            <div className="h-40 rounded bg-surface" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div className="min-h-screen bg-transparent pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <button onClick={() => router.back()} className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="rounded-lg border border-red-500/40 bg-status-danger/10 px-4 py-3 text-sm text-red-200">
            {error || "Issue not found"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* Breadcrumb header — full width */}
      <div className="sticky top-0 z-40 border-b border-line bg-transparent/95 backdrop-blur supports-[backdrop-filter]:bg-transparent/80">
        <div className="flex items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <button onClick={() => router.back()} className="shrink-0 rounded-md p-1 text-text-muted hover:bg-surface hover:text-text">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 text-sm">
            <span className="text-text-muted">{owner}/{repo}</span>
            <span className="mx-1.5 text-text-faint">/</span>
            <span className="text-text-muted">Issues</span>
            <span className="mx-1.5 text-text-faint">/</span>
            <span className="font-semibold text-text">#{issue.number}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a href={issue.html_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-line hover:bg-surface hover:text-text">
              <ExternalLink className="h-3.5 w-3.5" /> GitHub
            </a>
          </div>
        </div>
      </div>

      {/* Title bar — full width */}
      <div className="border-b border-line">
        <div className="px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {issue.state === "open" ? <CircleDot className="h-6 w-6 text-status-success" /> : <CheckCircle2 className="h-6 w-6 text-purple-400" />}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold text-text leading-tight">{issue.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-muted">
                <span>#{issue.number}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  issue.state === "open" ? "bg-status-success/10 text-status-success border border-emerald-500/30" : "bg-purple-500/10 text-purple-400 border border-purple-500/30"
                }`}>
                  {issue.state === "open" ? <CircleDot className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                  {issue.state === "open" ? "Open" : "Closed"}
                </span>
                <span>{issue.comments} comment{issue.comments !== 1 ? "s" : ""}</span>
                {issue.labels.length > 0 && (
                  <div className="hidden flex-wrap gap-1.5 sm:flex">
                    {issue.labels.map((label) => <LabelBadge key={label.name} label={label} />)}
                  </div>
                )}
              </div>
              {issue.labels.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 sm:hidden">
                  {issue.labels.map((label) => <LabelBadge key={label.name} label={label} />)}
                </div>
              )}
            </div>
            <button onClick={() => setShowSidebarInfo(true)} className="shrink-0 rounded-md p-1.5 text-text-muted hover:bg-surface hover:text-text sm:hidden">
              <Info className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main layout — full width */}
      <div className="flex">
        {/* Content — full width, no max-width */}
        <div className="min-w-0 flex-1">
          {/* Opening comment — full width, no card */}
          <div className="border-b border-line">
            <div className="flex items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
              {issue.user && (
                <>
                  <img src={issue.user.avatar_url} alt="" className="h-6 w-6 rounded-full" />
                  <a href={issue.user.html_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-text hover:text-accent">
                    {issue.user.login}
                  </a>
                </>
              )}
              <span className="text-xs text-text-muted">opened this issue {timeAgo(issue.created_at)}</span>
              {issue.user && <span className="ml-auto text-xs text-text-faint">{formatDate(issue.created_at)}</span>}
            </div>
            <div className="px-4 pb-5 sm:px-6 lg:px-8">
              {issue.body ? (
                <MarkdownContent body={issue.body} emptyMessage="No description provided."
                  linkBaseUrl={`https://github.com/${owner}/${repo}/blob/HEAD`}
                  imageBaseUrl={`https://raw.githubusercontent.com/${owner}/${repo}/HEAD`} />
              ) : (
                <p className="text-sm text-text-muted italic">No description provided.</p>
              )}
            </div>
          </div>

          {/* Comments — full width, separated by borders */}
          {comments.map((comment) => (
            <div key={comment.id} className="border-b border-line">
              <div className="flex items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
                {comment.user && (
                  <>
                    <img src={comment.user.avatar_url} alt="" className="h-6 w-6 rounded-full" />
                    <a href={comment.user.html_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-text hover:text-accent">
                      {comment.user.login}
                    </a>
                  </>
                )}
                <span className="text-xs text-text-muted">commented {timeAgo(comment.created_at)}</span>
                {comment.updated_at !== comment.created_at && <span className="text-xs text-text-faint">(edited)</span>}
                <span className="ml-auto text-xs text-text-faint">{formatDate(comment.created_at)}</span>
              </div>
              <div className="px-4 pb-5 sm:px-6 lg:px-8">
                <MarkdownContent body={comment.body} emptyMessage=""
                  linkBaseUrl={`https://github.com/${owner}/${repo}/blob/HEAD`}
                  imageBaseUrl={`https://raw.githubusercontent.com/${owner}/${repo}/HEAD`} />
              </div>
            </div>
          ))}

          {/* Comment form — full width */}
          {githubLinked ? (
            <div className="border-b border-line">
              <div className="flex items-center gap-2 px-4 py-2 sm:px-6 lg:px-8">
                <img src={`https://github.com/${githubUsername}.png`} alt="" className="h-5 w-5 rounded-full" />
                <span className="text-xs text-text-muted">
                  Commenting as <span className="font-medium text-text">@{githubUsername}</span>
                </span>
              </div>
              <div className="flex border-b border-line">
                <button onClick={() => setCommentTab("write")}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${commentTab === "write" ? "border-b-2 border-accent text-text" : "text-text-muted hover:text-text"}`}>
                  Write
                </button>
                <button onClick={() => setCommentTab("preview")}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${commentTab === "preview" ? "border-b-2 border-accent text-text" : "text-text-muted hover:text-text"}`}>
                  Preview
                </button>
              </div>
              {commentTab === "write" && <MarkdownToolbar onInsert={handleCommentInsert} />}
              <div className="px-4 py-3 sm:px-6 lg:px-8">
                {commentTab === "write" ? (
                  <textarea id="comment-textarea" value={commentBody} onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Write a comment..." rows={6}
                    className="w-full rounded-md border border-line bg-transparent px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-cyan-500/50 focus:outline-none resize-y" />
                ) : (
                  <div className="min-h-[150px] rounded-md border border-line bg-transparent px-3 py-2">
                    {commentBody.trim() ? <MarkdownContent body={commentBody} emptyMessage="Nothing to preview" /> : <p className="text-sm text-text-muted italic">Nothing to preview</p>}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-line px-4 py-3 sm:px-6 lg:px-8">
                <span className="text-xs text-text-faint">Markdown supported</span>
                <button onClick={submitComment} disabled={submittingComment || !commentBody.trim()}
                  className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-text hover:bg-green-500 disabled:opacity-50">
                  {submittingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Comment
                </button>
              </div>
            </div>
          ) : (
            <div className="border-b border-line px-4 py-5 text-center text-sm text-text-muted sm:px-6 lg:px-8">
              <a href="/profile/security" className="text-accent hover:underline">Connect GitHub</a> to comment on issues.
            </div>
          )}

          {/* Close / Reopen — full width, only for issue author */}
          {githubLinked && issue.user?.login === githubUsername && (
            <div className="px-4 py-5 sm:px-6 lg:px-8">
              {issue.state === "open" ? (
                !showCloseReason ? (
                  <button onClick={() => setShowCloseReason(true)}
                    className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-status-warning/10 px-4 py-2 text-sm font-medium text-status-warning hover:bg-amber-500/20">
                    <X className="h-4 w-4" /> Close issue
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-text">Close with reason</p>
                    <div className="flex flex-wrap gap-2">
                      {CLOSE_REASONS.map((r) => (
                        <button key={r.value} onClick={() => setCloseReason(r.value)}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                            closeReason === r.value ? "bg-amber-500/20 text-status-warning border border-amber-500/40" : "border border-line text-text-muted hover:border-line hover:text-text"
                          }`}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                    {closeReason === "custom" && (
                      <input type="text" value={closeCustomReason} onChange={(e) => setCloseCustomReason(e.target.value)}
                        placeholder="Enter reason..."
                        className="w-full rounded-md border border-line bg-transparent px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-cyan-500/50 focus:outline-none" />
                    )}
                    <div className="flex items-center gap-2">
                      <button onClick={closeIssue} disabled={closing || (closeReason === "custom" && !closeCustomReason.trim())}
                        className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-text hover:bg-red-500 disabled:opacity-50">
                        {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Close issue
                      </button>
                      <button onClick={() => { setShowCloseReason(false); setCloseReason(""); setCloseCustomReason(""); }}
                        className="rounded-md px-4 py-2 text-sm text-text-muted hover:text-text">
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <button onClick={reopenIssue} disabled={closing}
                  className="inline-flex items-center gap-2 rounded-md border border-emerald-500/40 bg-status-success/10 px-4 py-2 text-sm font-medium text-status-success hover:bg-emerald-500/20 disabled:opacity-50">
                  {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Reopen issue
                </button>
              )}
            </div>
          )}
        </div>

        {/* Desktop sidebar — sticky */}
        <div className="hidden w-72 shrink-0 border-l border-line lg:block">
          <div className="sticky top-[52px] space-y-0">
            <div className="border-b border-line px-4 py-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Assignees</h3>
              {issue.assignees.length > 0 ? (
                <div className="space-y-2">
                  {issue.assignees.map((a) => (
                    <div key={a.login} className="flex items-center gap-2">
                      <img src={a.avatar_url} alt="" className="h-5 w-5 rounded-full" />
                      <span className="text-sm text-text">{a.login}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted">None yet</p>
              )}
            </div>
            <div className="border-b border-line px-4 py-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Labels</h3>
              {issue.labels.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {issue.labels.map((label) => <LabelBadge key={label.name} label={label} />)}
                </div>
              ) : (
                <p className="text-sm text-text-muted">None yet</p>
              )}
            </div>
            <div className="border-b border-line px-4 py-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Type</h3>
              <p className="text-sm text-text-muted">{issue.pull_request ? "Pull Request" : "Issue"}</p>
            </div>
            <div className="border-b border-line px-4 py-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Milestone</h3>
              {issue.milestone ? (
                <p className="text-sm text-text">{issue.milestone.title}</p>
              ) : (
                <p className="text-sm text-text-muted">None</p>
              )}
            </div>
            <div className="border-b border-line px-4 py-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Linked Pull Requests</h3>
              <p className="text-sm text-text-muted">None</p>
            </div>
            <div className="border-b border-line px-4 py-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Project</h3>
              <p className="text-sm text-text-muted">None</p>
            </div>
            <div className="border-b border-line px-4 py-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Parent Issue</h3>
              <p className="text-sm text-text-muted">None</p>
            </div>
            {githubLinked && (
              <div className="border-b border-line px-4 py-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Notifications</h3>
                <div className="space-y-1">
                  {(["participating", "all_activity", "ignore"] as const).map((level) => {
                    const current = isTracked ? "participating" : "ignore";
                    return (
                      <button key={level} onClick={() => toggleTracking(level)}
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          current === level
                            ? "bg-accent/10 text-accent"
                            : "text-text-muted hover:bg-surface hover:text-text"
                        }`}>
                        {level === "participating" && <Bell className="h-3.5 w-3.5" />}
                        {level === "all_activity" && <BellDot className="h-3.5 w-3.5" />}
                        {level === "ignore" && <BellOff className="h-3.5 w-3.5" />}
                        {level === "participating" && "Participating"}
                        {level === "all_activity" && "All Activity"}
                        {level === "ignore" && "Ignore"}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile sidebar overlay — centered modal */}
      {showSidebarInfo && (
        <ModalShell
          open={showSidebarInfo}
          onClose={() => setShowSidebarInfo(false)}
          panelClassName="w-auto max-w-sm p-4 sm:hidden"
          overlayClassName="sm:hidden"
        >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Issue Details</h3>
              <button onClick={() => setShowSidebarInfo(false)} className="rounded p-1 text-text-muted hover:text-text">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">Assignees</h4>
                {issue.assignees.length > 0 ? (
                  <div className="space-y-1.5">
                    {issue.assignees.map((a) => (
                      <div key={a.login} className="flex items-center gap-2">
                        <img src={a.avatar_url} alt="" className="h-5 w-5 rounded-full" />
                        <span className="text-sm text-text">{a.login}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">None yet</p>
                )}
              </div>
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">Labels</h4>
                {issue.labels.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {issue.labels.map((label) => <LabelBadge key={label.name} label={label} />)}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">None yet</p>
                )}
              </div>
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">Type</h4>
                <p className="text-sm text-text-muted">{issue.pull_request ? "Pull Request" : "Issue"}</p>
              </div>
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">Milestone</h4>
                {issue.milestone ? (
                  <p className="text-sm text-text">{issue.milestone.title}</p>
                ) : (
                  <p className="text-sm text-text-muted">None</p>
                )}
              </div>
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">Linked Pull Requests</h4>
                <p className="text-sm text-text-muted">None</p>
              </div>
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">Project</h4>
                <p className="text-sm text-text-muted">None</p>
              </div>
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">Parent Issue</h4>
                <p className="text-sm text-text-muted">None</p>
              </div>
            </div>
        </ModalShell>
      )}
    </div>
  );
}
