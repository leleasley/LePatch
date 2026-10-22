import { ArrowRight, ArrowUpRight, Check, CircleDot, MessageSquare, RefreshCw } from 'lucide-react';
import { elapsed } from '../lib/format.js';
import { EmptyState, Pill } from '../components/ui.jsx';
import { GitHubMark } from '../components/GitHubMark.jsx';

const STATES = [
  { id: 'open', label: 'Open' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
];

export function IssuesPage({ issues, state, onState, onSeen, onOpen, onRefresh, loading, notice }) {
  const unread = issues.reduce((total, issue) => total + (issue.unreadCommentCount || 0), 0);
  const open = issues.filter(issue => issue.state === 'open').length;

  return (
    <div className="card">
      <div className="card-head">
        <div className="segmented">
          {STATES.map(item => (
            <button key={item.id} type="button" className={state === item.id ? 'is-active' : ''} onClick={() => onState(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="release-meta">
            <span>{open} open</span>
            <span>·</span>
            <span>{unread} new comments</span>
          </span>
          <button className="btn btn-sm" type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {notice ? (
        <div className="notice" style={{ margin: 16 }}>
          <MessageSquare size={15} />
          <span>{notice}</span>
        </div>
      ) : null}

      {issues.length ? (
        <div className="issue-list">
          {issues.map(issue => (
            <article className="issue-row" key={issue.id}>
              <div className="repo-icon is-sm">
                <img src={`https://github.com/${encodeURIComponent(issue.owner)}.png?size=64`} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} />
              </div>
              <div className="issue-main">
                <span className="issue-repo">
                  {issue.owner}/{issue.repo} · #{issue.issueNumber}
                </span>
                <button className="issue-title" type="button" onClick={() => onOpen(issue)}>
                  {issue.title} <ArrowRight size={13} />
                </button>
                {issue.body ? <p className="clamp-2">{issue.body.replace(/\s+/g, ' ').slice(0, 200)}</p> : null}
                <div className="issue-meta">
                  <span>
                    <MessageSquare size={11} /> {issue.commentCount} comments
                  </span>
                  {issue.unreadCommentCount > 0 ? <Pill kind="accent">{issue.unreadCommentCount} new</Pill> : null}
                  <span>Opened {elapsed(issue.createdAt)}</span>
                  <a className="issue-meta-link" href={issue.htmlUrl} target="_blank" rel="noreferrer" title="Open on GitHub">
                    <GitHubMark size={11} /> GitHub <ArrowUpRight size={10} />
                  </a>
                </div>
              </div>
              <div className="issue-side">
                <Pill kind={issue.state === 'open' ? 'success' : ''}>{issue.state === 'open' ? 'Open' : 'Closed'}</Pill>
                <small>{elapsed(issue.updatedAt)}</small>
                {issue.unreadCommentCount > 0 ? (
                  <button className="btn btn-sm" type="button" onClick={() => onSeen(issue.id)}>
                    <Check size={13} /> Mark read
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CircleDot}
          title={notice?.includes('Connect') ? 'Connect GitHub to find your issues' : 'No issues in this view'}
          description={
            notice?.includes('Connect')
              ? 'Link the GitHub account you use to open issues and LePatch will track new comments for you.'
              : 'Issues you have opened will appear here once the connected GitHub account syncs.'
          }
        />
      )}

      <div className="card-body" style={{ borderTop: '1px solid var(--border-soft)' }}>
        <span className="release-meta">Updates are checked every 10 minutes. New comments stay marked until you read them.</span>
      </div>
    </div>
  );
}
