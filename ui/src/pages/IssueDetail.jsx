import { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleCheck,
  CircleDot,
  MessageSquare,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { absolute, elapsed } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { EmptyState, LoadingLine, Pill } from '../components/ui.jsx';
import { MarkdownView } from '../components/Markdown.jsx';

export function IssueDetailPage({ owner, repo, number, onBack, onOpenRepo }) {
  const toast = useToast();
  const [issue, setIssue] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({ owner, repo, issueNumber: String(number) });
      const [detail, thread] = await Promise.all([
        api(`/api/github/issue-detail?${params}`),
        api(`/api/github/issue-comments?${params}&perPage=100`),
      ]);
      setIssue(detail);
      setComments(Array.isArray(thread) ? thread : []);
      setError('');
    } catch (issueError) {
      setError(issueError.message || 'Could not load this issue.');
      if (!quiet) toast.error(issueError.message || 'Could not load this issue.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, number]);

  if (loading && !issue) return <LoadingLine>Loading issue…</LoadingLine>;

  if (error && !issue) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Could not load this issue"
        description={error}
        action={
          <button className="btn" type="button" onClick={() => load()}>
            Try again
          </button>
        }
      />
    );
  }

  if (!issue) return null;

  const isOpen = issue.state === 'open';
  const repositoryUrl = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  return (
    <div className="issue-detail">
      <div className="issue-detail-bar">
        <button className="btn btn-ghost" type="button" onClick={onBack}>
          <ArrowDownRight size={15} /> Raised issues
        </button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {onOpenRepo ? (
            <button className="btn btn-sm" type="button" onClick={() => onOpenRepo(`${owner}/${repo}`)}>
              Open repository
            </button>
          ) : null}
          <button className="btn btn-sm" type="button" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw size={13} className={refreshing ? 'spin' : ''} /> Refresh
          </button>
          <a className="btn btn-sm" href={issue.html_url || `${repositoryUrl}/issues/${number}`} target="_blank" rel="noreferrer">
            GitHub <ArrowUpRight size={13} />
          </a>
        </div>
      </div>

      <article className="issue-detail-card">
        <header className="issue-detail-head">
          <div className="issue-repo">
            {owner}/{repo} <span>#{number}</span>
          </div>
          <h2>{issue.title}</h2>
          <div className="issue-meta">
            <Pill kind={isOpen ? 'success' : ''}>
              {isOpen ? <CircleDot size={11} /> : <CircleCheck size={11} />}
              {isOpen ? 'Open' : 'Closed'}
            </Pill>
            <span>Opened by {issue.user?.login || 'GitHub user'}</span>
            <span>·</span>
            <span>{issue.created_at ? elapsed(issue.created_at) : 'recently'}</span>
            <span>·</span>
            <span>
              <MessageSquare size={11} /> {issue.comments ?? comments.length} comments
            </span>
            {issue.state_reason ? <span>· {issue.state_reason.replace('_', ' ')}</span> : null}
          </div>
          {issue.labels?.length ? (
            <div className="issue-labels">
              {issue.labels.map(label => (
                <span
                  className="issue-label"
                  key={label.id || label.name}
                  style={label.color ? { '--label': `#${label.color}` } : undefined}
                >
                  {label.name}
                </span>
              ))}
            </div>
          ) : null}
        </header>

        <div className="issue-detail-body">
          <div className="issue-detail-author">
            {issue.user?.avatar_url ? (
              <img src={issue.user.avatar_url} alt="" width="34" height="34" loading="lazy" />
            ) : (
              <div className="commit-avatar">GH</div>
            )}
            <div>
              <b>{issue.user?.login || 'GitHub user'}</b>
              <span>{issue.created_at ? absolute(issue.created_at) : 'Date unavailable'}</span>
            </div>
          </div>
          {issue.body ? (
            <MarkdownView source={issue.body} baseURL={issue.html_url || repositoryUrl} />
          ) : (
            <p className="subtle">No description provided.</p>
          )}
        </div>
      </article>

      <section className="issue-detail-updates">
        <div className="section-head">
          <div>
            <h2>Updates</h2>
            <p>{comments.length ? `${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}` : 'No comments yet'}</p>
          </div>
        </div>

        {comments.length ? (
          <div className="comment-list">
            {comments.map(comment => (
              <article className="comment" key={comment.id}>
                {comment.user?.avatar_url ? (
                  <img src={comment.user.avatar_url} alt="" width="34" height="34" style={{ borderRadius: 8, objectFit: 'cover' }} loading="lazy" />
                ) : (
                  <div className="commit-avatar">GH</div>
                )}
                <div>
                  <b>
                    {comment.user?.login || 'Contributor'}
                    <span>{comment.created_at ? elapsed(comment.created_at) : ''}</span>
                  </b>
                  <MarkdownView source={comment.body || ''} baseURL={issue.html_url || repositoryUrl} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="subtle" style={{ fontSize: 'var(--text-sm)' }}>
            Nobody has commented on this issue yet.
          </p>
        )}
      </section>
    </div>
  );
}
