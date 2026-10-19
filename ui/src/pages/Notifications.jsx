import { ArrowUpRight, Bell, Check, Clock3, RefreshCw, TriangleAlert } from 'lucide-react';
import { elapsed } from '../lib/format.js';
import { EmptyState, Pill } from '../components/ui.jsx';

export function NotificationsPage({ events, notice, onRefresh, loading, onOpenRelease }) {
  const failures = events.filter(event => event.status === 'failed').length;

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Delivery log</h2>
          <p>Every release alert LePatch has sent to your channels.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {failures ? <Pill kind="danger">{failures} failed</Pill> : null}
          <button className="btn btn-sm" type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {notice ? (
        <div className="notice" style={{ margin: 16 }}>
          <TriangleAlert size={15} />
          <span>{notice}</span>
        </div>
      ) : null}

      {events.length ? (
        <div>
          {events.map(event => (
            <article className="log-row" key={event.id}>
              <div className="repo-icon is-sm" style={{ color: 'var(--accent)' }}>
                <Bell size={14} />
              </div>
              <div className="log-main">
                <span className="issue-repo">{event.repoFullName}</span>
                <button
                  className="log-link"
                  type="button"
                  onClick={() => onOpenRelease(event.appId, event.releaseId)}
                  disabled={!event.appId || !event.releaseId}
                >
                  {event.appName} {event.tagName}
                  <ArrowUpRight size={12} />
                </button>
                <span className="release-meta">
                  <span>{event.releaseType || 'Release'} update</span>
                </span>
              </div>
              <Pill kind={event.channelType === 'telegram' ? 'info' : 'violet'}>
                {event.channelType === 'telegram' ? 'Telegram' : 'Discord'}
              </Pill>
              <div style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
                <Pill kind={event.status === 'sent' ? 'success' : event.status === 'failed' ? 'danger' : ''}>
                  {event.status === 'sent' ? <Check size={11} /> : event.status === 'failed' ? <TriangleAlert size={11} /> : <Clock3 size={11} />}
                  {event.status}
                </Pill>
                <span className="log-when">{elapsed(event.sentAt || event.createdAt)}</span>
                {event.error ? (
                  <small className="log-when" style={{ color: 'var(--danger)' }} title={event.error}>
                    {event.error.slice(0, 48)}
                  </small>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Bell}
          title="No notification history yet"
          description="Release alerts appear here after you configure Discord or Telegram and a watched repository publishes a release."
        />
      )}
    </div>
  );
}
