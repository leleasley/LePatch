import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BellRing,
  Check,
  ChevronDown,
  EyeOff,
  FileClock,
  LayoutGrid,
  LayoutList,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import { elapsed } from '../lib/format.js';
import { filterReleases, groupByDay, newReleaseIds } from '../lib/feed.js';
import { EmptyState, RepoIcon, Stat } from '../components/ui.jsx';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'security', label: 'Security' },
  { id: 'prerelease', label: 'Pre-releases' },
];

function ReleaseCard({ item, isNew, active, onOpenApp, onOpenRelease, onMarkSeen, onIgnore }) {
  const name = item.watchedApp?.name || item.appName || item.repoFullName;
  const repo = item.repoFullName || item.watchedApp?.repoFullName;
  return (
    <article
      className={`release-card${isNew ? ' is-new' : ''}${item.securityRelevant ? ' is-security' : ''}${active ? ' is-active' : ''}`}
      data-release-id={item.id}
    >
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
          {item.securityRelevant ? (
            <span className="security-badge">
              <ShieldAlert size={11} /> Security
            </span>
          ) : null}
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
  onSearchReleases,
  onLoadMore,
  onWatch,
  checking,
  hasMore,
  loadingMore,
}) {
  const [filter, setFilter] = useState('all');
  const [layout, setLayout] = useState('list');
  const [releaseQuery, setReleaseQuery] = useState('');
  const [repoQuery, setRepoQuery] = useState('');
  const [markingAll, setMarkingAll] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const searchRef = useRef(null);
  const searchCallback = useRef(onSearchReleases);
  searchCallback.current = onSearchReleases;
  const firstRun = useRef(true);

  const newIds = useMemo(() => newReleaseIds(feed), [feed]);
  const visible = useMemo(() => filterReleases(feed, { filter, query: '', newIds }), [feed, filter, newIds]);
  const groups = useMemo(() => groupByDay(visible), [visible]);

  const watched = useMemo(() => {
    const needle = repoQuery.trim().toLowerCase();
    if (!needle) return apps;
    return apps.filter(app => `${app.name} ${app.repoFullName}`.toLowerCase().includes(needle));
  }, [apps, repoQuery]);

  const newReleases = useMemo(() => feed.filter(item => newIds.has(item.id)), [feed, newIds]);
  // The server reports the unread summary separately from the current page so
  // searching for an old release does not change the count in the banner.
  const unreadReleases = stats.unread?.releases ?? newReleases.length;
  const unreadRepositories = stats.unread?.repositories ?? new Set(newReleases.map(item => item.watchedApp?.id)).size;

  // Search runs on the server so it also covers releases older than the
  // current page. Debounce so typing does not queue a request per key.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return undefined;
    }
    const timer = window.setTimeout(() => searchCallback.current?.(releaseQuery.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [releaseQuery]);

  // Keep the keyboard cursor valid when the list changes underneath it.
  useEffect(() => {
    if (activeId && !visible.some(item => item.id === activeId)) setActiveId(null);
  }, [visible, activeId]);

  useEffect(() => {
    const onKeyDown = event => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || target.isContentEditable) {
          return;
        }
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (!visible.length) return;
      const index = visible.findIndex(item => item.id === activeId);
      const move = step => {
        const next = index === -1 ? (step > 0 ? 0 : visible.length - 1) : Math.min(Math.max(index + step, 0), visible.length - 1);
        setActiveId(visible[next].id);
        window.requestAnimationFrame(() => {
          document.querySelector(`[data-release-id="${visible[next].id}"]`)?.scrollIntoView({ block: 'nearest' });
        });
      };
      const current = index === -1 ? null : visible[index];

      switch (event.key) {
        case 'j':
        case 'ArrowDown':
          event.preventDefault();
          move(1);
          break;
        case 'k':
        case 'ArrowUp':
          event.preventDefault();
          move(-1);
          break;
        case 'o':
        case 'Enter':
          if (current) {
            event.preventDefault();
            onOpenRelease(current.watchedApp?.id, current.id);
          }
          break;
        case 'm':
          if (current) {
            event.preventDefault();
            onMarkSeen(current.watchedApp?.id);
          }
          break;
        case 'x':
          if (current) {
            event.preventDefault();
            onIgnore(current.id);
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, activeId, onOpenRelease, onMarkSeen, onIgnore]);

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
      {unreadReleases ? (
        <div className="feed-banner">
          <span className="feed-banner-icon">
            <BellRing size={18} />
          </span>
          <div className="feed-banner-copy">
            <b>
              {unreadReleases} new {unreadReleases === 1 ? 'release' : 'releases'}
            </b>
            <span>
              across {unreadRepositories} {unreadRepositories === 1 ? 'repository' : 'repositories'} since you last checked
            </span>
          </div>
          <button className="btn btn-primary btn-sm" type="button" onClick={markAll} disabled={markingAll}>
            {markingAll ? <RefreshCw size={13} className="spin" /> : <Check size={13} />} Mark all as read
          </button>
        </div>
      ) : null}

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <Stat label="Watching" value={stats.total ?? apps.length} hint="repositories" icon={Radio} />
        <Stat label="New releases" value={unreadReleases} hint="waiting for you" icon={BellRing} />
        <Stat label="Failed checks" value={stats.failed ?? 0} hint="need attention" icon={TriangleAlert} />
        <Stat label="Stale" value={stats.stale ?? 0} hint="over 24 hours" icon={FileClock} />
      </div>

      <div className="feed-layout">
        <section>
          <div className="section-head">
            <h2>
              Latest releases <span>{visible.length}</span>
              <span className="feed-keyhint">
                <kbd>j</kbd>
                <kbd>k</kbd> move · <kbd>o</kbd> open · <kbd>m</kbd> read
              </span>
            </h2>
            <div className="feed-tools">
              <label className="feed-search">
                <Search size={14} />
                <input
                  ref={searchRef}
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
            <>
              {groups.map(group => (
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
                        active={activeId === item.id}
                        onOpenApp={onOpenApp}
                        onOpenRelease={onOpenRelease}
                        onMarkSeen={onMarkSeen}
                        onIgnore={onIgnore}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {hasMore ? (
                <div className="feed-more">
                  <button className="btn" type="button" onClick={onLoadMore} disabled={loadingMore}>
                    {loadingMore ? <RefreshCw size={14} className="spin" /> : <ChevronDown size={14} />}
                    {loadingMore ? 'Loading…' : 'Load older releases'}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon={FileClock}
              title={releaseQuery ? 'No releases match that search' : feed.length ? 'Nothing matches those filters' : 'No releases yet'}
              description={
                releaseQuery
                  ? 'Try a shorter term, or clear the search to see the whole feed.'
                  : feed.length
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
                <div className="watch-row" key={app.id}>
                  <button className="watch-main" type="button" onClick={() => onOpenApp(app.id)}>
                    <RepoIcon name={app.name} iconUrl={app.iconUrl} size="is-sm" />
                    <span className="watch-copy">
                      <b>
                        {app.name}
                        {app.updateAvailable ? <i className="unread-dot" title="New release available" /> : null}
                      </b>
                      <span>{app.repoFullName}</span>
                    </span>
                  </button>
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
