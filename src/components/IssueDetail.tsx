"use client";

import { useState, useEffect } from "react";
import { X, Loader2, ExternalLink, CircleDot, CheckCircle2, MessageSquare, XCircle, RotateCcw } from "lucide-react";
import { MarkdownContent } from "@/components/MarkdownContent";
import { ModalShell } from "@/components/ModalShell";
import { csrfFetch } from "@/lib/csrf-client";

type IssueComment = {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string; html_url: string } | null;
};

type IssueData = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  created_at: string;
  user: { login: string; avatar_url: string; html_url: string } | null;
  labels: Array<{ name: string; color: string }>;
  comments: number;
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

function LabelBadge({ label }: { label: { name: string; color: string } }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `#${label.color}20`, color: `#${label.color}`, border: `1px solid #${label.color}40` }}
    >
      {label.name}
    </span>
  );
}

export function IssueDetail({
  owner,
  repo,
  issue,
  open,
  onClose,
  githubLinked = false,
  onRefresh,
}: {
  owner: string;
  repo: string;
  issue: IssueData;
  open: boolean;
  onClose: () => void;
  githubLinked?: boolean;
  onRefresh?: () => void;
}) {
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [closingIssue, setClosingIssue] = useState(false);
  const [githubUsername, setGithubUsername] = useState("");

  function doFetchComments() {
    fetch(`/api/github/issue-comments?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&issueNumber=${issue.number}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load comments");
        return res.json();
      })
      .then((data) => setComments(data.comments || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  function fetchComments() {
    setLoading(true);
    setError("");
    doFetchComments();
  }

  useEffect(() => {
    if (!open || issue.comments === 0) return;
    doFetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, issue.comments, issue.number, owner, repo]);

  useEffect(() => {
    if (!open || !githubLinked) return;
    const id = setTimeout(() => {
      fetch("/api/account/github")
        .then((res) => res.json())
        .then((data) => {
          const username = data.link?.githubUsername || "";
          setGithubUsername(username);
        })
        .catch(() => {});
    }, 0);
    return () => clearTimeout(id);
  }, [open, githubLinked]);

  async function submitComment() {
    if (!commentBody.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await csrfFetch("/api/github/comment-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          issueNumber: issue.number,
          body: commentBody.trim(),
        }),
      });
      if (res.ok) {
        setCommentBody("");
        fetchComments();
        onRefresh?.();
      }
    } catch {
      // silently fail
    } finally {
      setSubmittingComment(false);
    }
  }

  async function toggleClose() {
    setClosingIssue(true);
    const action = issue.state === "open" ? "close" : "reopen";
    try {
      const res = await csrfFetch("/api/github/close-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, issueNumber: issue.number, action }),
      });
      if (res.ok) {
        onRefresh?.();
        onClose();
      }
    } catch {
      // silently fail
    } finally {
      setClosingIssue(false);
    }
  }

  if (!open) return null;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      variant="fullscreen"
      panelClassName="flex h-full w-full flex-col overflow-hidden rounded-xl border border-line/50 bg-[#0d1117] shadow-2xl lg:mx-auto lg:my-auto lg:h-[calc(100dvh-3rem)] lg:max-w-4xl"
    >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[#21262d] bg-[#161b22] px-4 py-3 sm:px-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#21262d]">
            {issue.state === "open" ? (
              <CircleDot className="h-4 w-4 text-emerald-400" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-purple-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-white truncate">{issue.title}</span>
              <span className="shrink-0 text-xs text-slate-500">#{issue.number}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
              <span className={`inline-flex items-center gap-1 ${issue.state === "open" ? "text-emerald-400" : "text-purple-400"}`}>
                {issue.state === "open" ? <CircleDot className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                {issue.state}
              </span>
              {issue.user && (
                <span className="inline-flex items-center gap-1">
                  <img src={issue.user.avatar_url} alt="" className="h-3.5 w-3.5 rounded-full" loading="lazy" />
                  {issue.user.login}
                </span>
              )}
              <span>opened {formatDate(issue.created_at)}</span>
              {issue.comments > 0 && (
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {issue.comments} comment{issue.comments !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={issue.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#30363d] bg-[#21262d] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-[#484f58] hover:bg-[#30363d] hover:text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            {githubLinked && (
              <button
                onClick={toggleClose}
                disabled={closingIssue}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  issue.state === "open"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                } disabled:opacity-50`}
              >
                {closingIssue ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : issue.state === "open" ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">{issue.state === "open" ? "Close" : "Reopen"}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-[#21262d] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {/* Labels */}
          {issue.labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-[#21262d] bg-[#0d1117] px-4 py-2.5 sm:px-5">
              {issue.labels.map((label) => (
                <LabelBadge key={label.name} label={label} />
              ))}
            </div>
          )}

          {/* Issue body */}
          <div className="border-b border-[#21262d] p-4 sm:p-5">
            {issue.body ? (
              <MarkdownContent
                body={issue.body}
                emptyMessage="No description provided."
                linkBaseUrl={`https://github.com/${owner}/${repo}/blob/HEAD`}
                imageBaseUrl={`https://raw.githubusercontent.com/${owner}/${repo}/HEAD`}
              />
            ) : (
              <p className="text-sm text-slate-500 italic">No description provided.</p>
            )}
          </div>

          {/* Comments */}
          <div className="p-4 sm:p-5">
            {issue.comments > 0 && (
              <>
                <h3 className="mb-4 text-sm font-semibold text-white">
                  {issue.comments} comment{issue.comments !== 1 ? "s" : ""}
                </h3>

                {loading && (
                  <div className="flex items-center justify-center gap-2 py-8">
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                    <span className="text-sm text-slate-400">Loading comments...</span>
                  </div>
                )}

                {error && (
                  <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
                )}

                {!loading && !error && comments.length > 0 && (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="rounded-lg border border-[#21262d] bg-[#161b22]">
                        <div className="flex items-center gap-2 border-b border-[#21262d] px-4 py-2.5">
                          {comment.user && (
                            <>
                              <img src={comment.user.avatar_url} alt="" className="h-5 w-5 rounded-full" loading="lazy" />
                              <span className="text-xs font-medium text-white">{comment.user.login}</span>
                            </>
                          )}
                          <span className="text-xs text-slate-500">{formatDate(comment.created_at)}</span>
                          {comment.updated_at !== comment.created_at && (
                            <span className="text-xs text-slate-600">(edited)</span>
                          )}
                        </div>
                        <div className="p-4">
                          <MarkdownContent
                            body={comment.body}
                            emptyMessage=""
                            linkBaseUrl={`https://github.com/${owner}/${repo}/blob/HEAD`}
                            imageBaseUrl={`https://raw.githubusercontent.com/${owner}/${repo}/HEAD`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Comment form */}
            {githubLinked ? (
              <div className="mt-4 border-t border-[#21262d] pt-4">
                {githubUsername && (
                  <p className="mb-2 text-xs text-slate-500">
                    Commenting as <span className="font-medium text-slate-400">@{githubUsername}</span>
                  </p>
                )}
                <textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Leave a comment..."
                  rows={3}
                  className="w-full rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-white placeholder-slate-500 resize-none focus:border-cyan-500/50 focus:outline-none"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={submitComment}
                    disabled={!commentBody.trim() || submittingComment}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-medium text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {submittingComment ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MessageSquare className="h-3.5 w-3.5" />
                    )}
                    Comment
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 border-t border-[#21262d] pt-4 text-center">
                <p className="text-xs text-slate-500">Connect GitHub to comment or close issues</p>
              </div>
            )}
          </div>
        </div>
    </ModalShell>
  );
}
