import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BellRing,
  Check,
  EyeOff,
  FileClock,
  LayoutGrid,
  LayoutList,
  Plus,
  Radio,
  RefreshCw,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { elapsed, releaseKind } from '../lib/format.js';
import { EmptyState, RepoIcon, Stat } from '../components/ui.jsx';

const FILTERS = [
  { id: 'all', label: 'All releases' },
  { id: 'new', label: 'New only' },
  { id: 'prerelease', label: 'Pre-releases' },
];

export function FeedPage({
  feed,
  apps,
  stats,
  onOpenApp,
  onOpenRelease,
  onCheck,
  onRemove,
  onMarkSeen,
  onIgnore,
  onWatch,
  onRefresh,
  refreshing,
  checking,
}) {
  const [filter, setFilter] = useState('all');
  const [layout, setLayout] = useState('list');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return feed.filter(item => {
      if (filter === 'prerelease' && !item.prerelease) return false;
      if (filter === 'all' && item.prerelease) return false;
      if (filter === 'new' && (!item.watchedApp?.updateAvailable || item.prerelease)) return false;
      if (!needle) return true;
      const haystack = `${item.watchedApp?.name || ''} ${item.repoFullName || ''} ${item.tagName || ''} ${item.name || ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [feed, filter, query]);

  const watched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return apps;
    return apps.filter(app => `${app.name} ${app.repoFullName}`.toLowerCase().includes(needle));
  }, [apps, query]);

  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <Stat label="Watching" value={stats.total ?? apps.length} hint="repositories" icon={Radio} />
        <Stat label="New releases" value={stats.updates ?? 0} hint="awaiting review" icon={BellRing} />
        <Stat label="Failed checks" value={stats.failed ?? 0} hint="need attention" icon={TriangleAlert} />
        <Stat label="Stale" value={stats.stale ?? 0} hint="over 24 hours" icon={FileClock} />
      </div>

      <div className="feed-layout">
        <section>
          <div className="section-head">
            <h2>
              Latest releases <span>{visible.length}</span>
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div className="segmented">
                {FILTERS.map(item => (
                  <button key={item.id} type="button" className={filter === item.id ? 'is-active' : ''} onClick={() => setFilter(item.id)}>
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="segmented">
                <button type="button" className={layout === 'list' ? 'is-active' : ''} onClick={() => setLayout('list')} aria-label="List layout">
                  <LayoutList size={14} />
                </button>
                <button type="button" className={layout === 'grid' ? 'is-active' : ''} onClick={() => setLayout('grid')} aria-label="Grid layout">
                  <LayoutGrid size={14} />
                </button>
              </div>
            </div>
          </div>

          {visible.length ? (
            <div className={layout === 'grid' ? 'release-grid' : 'release-list'}>
              {visible.map(item => {
                const name = item.watchedApp?.name || item.appName || item.repoFullName;
                const repo = item.repoFullName || item.watchedApp?.repoFullName;
                return (
                  <article className="release-card" key={item.id}>
                    <RepoIcon name={name} iconUrl={item.watchedApp?.iconUrl} />
                    <div className="release-main">
                      <div className="release-top">
                        <button className="release-project" type="button" onClick={() => onOpenApp(item.watchedApp?.id)}>
                          {name} <span>{repo}</span>
                        </button>
                        <a className="pill pill-accent" href={item.htmlUrl} target="_blank" rel="noreferrer">
                          {item.tagName} <ArrowUpRight size={11} />
                        </a>
                      </div>
                      <h3>
                        <button type="button" onClick={() => onOpenRelease(item.watchedApp?.id, item.id)} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', textAlign: 'left' }}>
                          {item.name || `${name} ${item.tagName}`}
                        </button>
                      </h3>
                      <p className="clamp-2">{item.changelogSummary || 'A new release is available for this project.'}</p>
                      <div className="release-meta">
                        <span>{releaseKind(item)}</span>
                        <span>·</span>
                        <span>Detected {elapsed(item.detectedAt)}</span>
                        {item.publishedAt ? (
                          <>
                            <span>·</span>
                            <span>Published {elapsed(item.publishedAt)}</span>
                          </>
                        ) : null}
                      </div>
                      <div className="release-meta" style={{ marginTop: 2 }}>
                        <button className="row-action" type="button" onClick={() => onMarkSeen(item.watchedApp?.id)} title="Mark as seen">
                          <Check size={13} />
                        </button>
                        <button className="row-action is-danger" type="button" onClick={() => onIgnore(item.id)} title="Ignore this release">
                          <EyeOff size={13} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={FileClock}
              title={feed.length ? 'Nothing matches those filters' : 'No releases yet'}
              description={feed.length ? 'Try a different filter or clear the search box.' : 'When a watched project publishes a release, it will land here automatically.'}
            />
          )}
        </section>

        <aside className="feed-aside">
          <div className="card">
            <div className="card-head">
              <div>
                <h2>Watching</h2>
                <p>{apps.length} repositories on your list</p>
              </div>
              <button className="btn btn-primary btn-sm" type="button" onClick={onWatch}>
                <Plus size={14} /> Add
              </button>
            </div>
            <label className="input-icon" style={{ display: 'flex', padding: '0 16px 12px' }}>
              <Search size={15} />
              <input className="input" style={{ paddingLeft: 36 }} value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a repository" aria-label="Find a watched repository" />
            </label>
            <div className="watch-list">
              {watched.map(app => (
                <div className="watch-row" key={app.id} onClick={() => onOpenApp(app.id)} onKeyDown={event => { if (event.key === 'Enter') onOpenApp(app.id); }} role="link" tabIndex={0}>
                  <RepoIcon name={app.name} iconUrl={app.iconUrl} size="is-sm" />
                  <span className="watch-copy">
                    <b>
                      {app.name}
                      {app.updateAvailable ? <i className="unread-dot" title="New release available" /> : null}
                    </b>
                    <span>{app.repoFullName}</span>
                  </span>
                  <span className="watch-side">
                    <span>{app.latestSeenTag || '—'}</span>
                    <span className="row-actions">
                      <button
                        className="row-action"
                        type="button"
                        title="Check for releases now"
                        onClick={event => {
                          event.stopPropagation();
                          onCheck(app.id);
                        }}
                      >
                        <RefreshCw size={13} className={checking === app.id ? 'spin' : ''} />
                      </button>
                      <button
                        className="row-action is-danger"
                        type="button"
                        title="Stop watching"
                        onClick={event => {
                          event.stopPropagation();
                          onRemove(app.id);
                        }}
                      >
                        ×
                      </button>
                    </span>
                  </span>
                </div>
              ))}
              {!watched.length ? (
                <div className="card-body subtle" style={{ fontSize: 'var(--text-xs)' }}>
                  {apps.length ? 'No repositories match that search.' : 'Nothing on your watch list yet. Add a repository to start tracking releases.'}
                </div>
              ) : null}
            </div>
          </div>

          <div className="card card-pad">
            <div className="sidebar-card-head" style={{ marginBottom: 10 }}>
              <Radio size={14} />
              <span>Background checks</span>
            </div>
            <p className="subtle" style={{ fontSize: 'var(--text-xs)', lineHeight: 1.6 }}>
              LePatch polls GitHub in the background so your feed stays current without a page reload.
            </p>
            <button className="btn btn-sm" type="button" style={{ marginTop: 12 }} onClick={onRefresh} disabled={refreshing}>
              <RefreshCw size={13} className={refreshing ? 'spin' : ''} /> Refresh now
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
