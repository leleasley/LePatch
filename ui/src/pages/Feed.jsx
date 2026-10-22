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
import { elapsed } from '../lib/format.js';
import { EmptyState, RepoIcon, Stat } from '../components/ui.jsx';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'prerelease', label: 'Pre-releases' },
];

function startOfDay(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(value) {
  const date = new Date(value);
  const days = Math.round((startOfDay(Date.now()) - startOfDay(value)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// A release is "new" when it is the newest release of a repository that is
// waiting on an update and its tag has not been acknowledged yet. The feed is
// ordered by detection time, which is not the same as release order, so this
// compares publication dates per repository.
function newReleaseIds(feed) {
  const newest = new Map();
  for (const item of feed) {
    const watched = item.watchedApp;
    if (!watched?.id || !watched.updateAvailable) continue;
    const stamp = new Date(item.publishedAt || item.detectedAt || 0).getTime();
    const current = newest.get(watched.id);
    if (!current || stamp > current.stamp) newest.set(watched.id, { item, stamp });
  }
  const ids = new Set();
  for (const { item } of newest.values()) {
    if (!item.watchedApp.latestSeenTag || item.tagName !== item.watchedApp.latestSeenTag) ids.add(item.id);
  }
  return ids;
}

function groupByDay(items) {
  const groups = [];
  for (const item of items) {
    const key = dayKey(item.detectedAt);
    const current = groups[groups.length - 1];
    if (current && current.key === key) {
      current.items.push(item);
    } else {
      groups.push({ key, label: dayLabel(item.detectedAt), items: [item] });
    }
  }
  return groups;
}

function ReleaseCard({ item, isNew, onOpenApp, onOpenRelease, onMarkSeen, onIgnore }) {
  const name = item.watchedApp?.name || item.appName || item.repoFullName;
  const repo = item.repoFullName || item.watchedApp?.repoFullName;
  return (
    <article className={`release-card${isNew ? ' is-new' : ''}`}>
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
          <button
            type="button"
            onClick={() => onOpenRelease(item.watchedApp?.id, item.id)}
            style={{ background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', textAlign: 'left' }}
          >
            {item.name || `${name} ${item.tagName}`}
          </button>
        </h3>
        <p className="clamp-2">{item.changelogSummary || 'A new release is available for this project.'}</p>
        <div className="release-meta">
          {isNew ? <span className="new-badge">New</span> : null}
          {item.prerelease ? <span className="pill">Pre-release</span> : null}
          <span>Detected {elapsed(item.detectedAt)}</span>
        </div>
        <div className="release-actions">
          <button type="button" onClick={() => onMarkSeen(item.watchedApp?.id)}>
            <Check size={13} /> Mark read
          </button>
          <button type="button" className="is-danger" onClick={() => onIgnore(item.id)}>
            <EyeOff size={13} /> Ignore
          </button>
        </div>
      </div>
    </article>
  );
}

export function FeedPage({
  feed,
  apps,
  stats,
  onOpenApp,
  onOpenRelease,
  onCheck,
  onRemove,
  onMarkSeen,
  onMarkAllSeen,
  onIgnore,
  onWatch,
  checking,
}) {
  const [filter, setFilter] = useState('all');
  const [layout, setLayout] = useState('list');
  const [releaseQuery, setReleaseQuery] = useState('');
  const [repoQuery, setRepoQuery] = useState('');
  const [markingAll, setMarkingAll] = useState(false);

  const newIds = useMemo(() => newReleaseIds(feed), [feed]);

  const visible = useMemo(() => {
    const needle = releaseQuery.trim().toLowerCase();
    return feed.filter(item => {
      if (filter === 'prerelease' && !item.prerelease) return false;
      if (filter === 'new' && !newIds.has(item.id)) return false;
      if (!needle) return true;
      const haystack = `${item.watchedApp?.name || ''} ${item.repoFullName || ''} ${item.tagName || ''} ${item.name || ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [feed, filter, releaseQuery, newIds]);

  const groups = useMemo(() => groupByDay(visible), [visible]);

  const watched = useMemo(() => {
    const needle = repoQuery.trim().toLowerCase();
    if (!needle) return apps;
    return apps.filter(app => `${app.name} ${app.repoFullName}`.toLowerCase().includes(needle));
  }, [apps, repoQuery]);

  const newReleases = useMemo(() => feed.filter(item => newIds.has(item.id)), [feed, newIds]);
  const newRepositories = useMemo(() => new Set(newReleases.map(item => item.watchedApp?.id)).size, [newReleases]);

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await onMarkAllSeen();
    } finally {
      setMarkingAll(false);
    }
  };

  if (!apps.length) {
    return (
      <EmptyState
        icon={Radio}
        title="Your feed is empty"
        description="Watch a GitHub repository and LePatch will collect its releases here, check for new ones in the background and notify you when something ships."
        action={
          <button className="btn btn-primary" type="button" onClick={onWatch}>
            <Plus size={15} /> Watch your first repository
          </button>
        }
      />
    );
  }

  return (
    <>
      {newReleases.length ? (
        <div className="feed-banner">
          <span className="feed-banner-icon">
            <BellRing size={18} />
          </span>
          <div className="feed-banner-copy">
            <b>
              {newReleases.length} new {newReleases.length === 1 ? 'release' : 'releases'}
            </b>
            <span>
              across {newRepositories} {newRepositories === 1 ? 'repository' : 'repositories'} since you last checked
            </span>
          </div>
          <button className="btn btn-primary btn-sm" type="button" onClick={markAll} disabled={markingAll}>
            {markingAll ? <RefreshCw size={13} className="spin" /> : <Check size={13} />} Mark all as read
          </button>
        </div>
      ) : null}

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <Stat label="Watching" value={stats.total ?? apps.length} hint="repositories" icon={Radio} />
        <Stat label="New releases" value={newReleases.length} hint="waiting for you" icon={BellRing} />
        <Stat label="Failed checks" value={stats.failed ?? 0} hint="need attention" icon={TriangleAlert} />
        <Stat label="Stale" value={stats.stale ?? 0} hint="over 24 hours" icon={FileClock} />
      </div>

      <div className="feed-layout">
        <section>
          <div className="section-head">
            <h2>
              Latest releases <span>{visible.length}</span>
            </h2>
            <div className="feed-tools">
              <label className="feed-search">
                <Search size={14} />
                <input
                  value={releaseQuery}
                  onChange={event => setReleaseQuery(event.target.value)}
                  placeholder="Search releases"
                  aria-label="Search releases"
                />
              </label>
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

          {groups.length ? (
            groups.map(group => (
              <div className="feed-day" key={group.key}>
                <div className="feed-day-head">
                  <span>{group.label}</span>
                  <i />
                  <small>{group.items.length}</small>
                </div>
                <div className={layout === 'grid' ? 'release-grid' : 'release-list'}>
                  {group.items.map(item => (
                    <ReleaseCard
                      key={item.id}
                      item={item}
                      isNew={newIds.has(item.id)}
                      onOpenApp={onOpenApp}
                      onOpenRelease={onOpenRelease}
                      onMarkSeen={onMarkSeen}
                      onIgnore={onIgnore}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={FileClock}
              title={feed.length ? 'Nothing matches those filters' : 'No releases yet'}
              description={
                feed.length
                  ? 'Try a different filter or clear the search box.'
                  : 'LePatch is watching your repositories. Releases appear here as soon as they are published.'
              }
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
              <input
                className="input"
                style={{ paddingLeft: 36 }}
                value={repoQuery}
                onChange={event => setRepoQuery(event.target.value)}
                placeholder="Find a repository"
                aria-label="Find a watched repository"
              />
            </label>
            <div className="watch-list">
              {watched.map(app => (
                <div
                  className="watch-row"
                  key={app.id}
                  onClick={() => onOpenApp(app.id)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') onOpenApp(app.id);
                  }}
                  role="link"
                  tabIndex={0}
                >
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
                  No repositories match that search.
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
