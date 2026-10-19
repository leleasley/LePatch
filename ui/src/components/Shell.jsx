import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Bell,
  CircleDot,
  Compass,
  Folder,
  Info,
  LayoutList,
  LogOut,
  Menu,
  Moon,
  Palette,
  Radio,
  Search,
  Settings,
  Sun,
  User,
} from 'lucide-react';
import { THEMES } from '../lib/hooks.js';

const PRIMARY = [
  { id: 'feed', label: 'Release feed', icon: LayoutList, key: '1' },
  { id: 'apps', label: 'Watched apps', icon: Radio, key: '2' },
  { id: 'issues', label: 'Raised issues', icon: CircleDot, key: '3' },
  { id: 'notifications', label: 'Notifications', icon: Bell, key: '4' },
];

const DISCOVER = [
  { id: 'discover', label: 'Repository search', icon: Search },
  { id: 'discover-sponsors', label: 'Sponsored maintainers', icon: Compass },
  { id: 'owned-repos', label: 'Your repositories', icon: Folder },
];

const MOBILE_TABS = [
  { id: 'feed', label: 'Feed', icon: LayoutList },
  { id: 'apps', label: 'Apps', icon: Radio },
  { id: 'discover', label: 'Discover', icon: Compass },
  { id: 'notifications', label: 'Alerts', icon: Bell },
];

export function Shell({
  page,
  navigate,
  user,
  apps,
  unreadIssues,
  connected,
  theme,
  onTheme,
  onOpenPalette,
  onSignOut,
  onOpenMenu,
  children,
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const accountRef = useRef(null);

  useEffect(() => {
    if (!accountOpen && !themeOpen) return undefined;
    const onClick = event => {
      if (accountRef.current && !accountRef.current.contains(event.target)) {
        setAccountOpen(false);
        setThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [accountOpen, themeOpen]);

  const isAdmin = user?.role === 'administrator';

  const navItem = (item, active) => (
    <a
      key={item.id}
      href={item.href || '#'}
      className={`nav-item${active ? ' is-active' : ''}`}
      onClick={event => {
        event.preventDefault();
        navigate(item.id);
      }}
    >
      <item.icon size={16} />
      <span>{item.label}</span>
      {item.count ? <span className="count">{item.count}</span> : null}
    </a>
  );

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a
            className="brand"
            href="#"
            onClick={event => {
              event.preventDefault();
              navigate('feed');
            }}
          >
            <img src="/assets/Logo.png" alt="" />
            <span>LePatch</span>
            <span className="brand-badge">Beta</span>
          </a>

          <button className="topbar-search" type="button" onClick={onOpenPalette}>
            <Search size={15} />
            <span>Search commands and repositories</span>
            <kbd>⌘K</kbd>
          </button>

          <div className="topbar-actions">
            <button className="icon-button topbar-search-mobile" type="button" onClick={onOpenPalette} aria-label="Search">
              <Search size={16} />
            </button>
            <span className={`status-pill ${connected ? 'is-live' : 'is-waiting'}`} title={connected ? 'Live updates connected' : 'Reconnecting'}>
              <span className="dot" />
              {connected ? 'Live' : 'Offline'}
            </span>
            <div className="theme-picker" style={{ position: 'relative' }}>
              <button className="icon-button" type="button" onClick={() => { setThemeOpen(value => !value); setAccountOpen(false); }} aria-label="Change appearance" aria-expanded={themeOpen}>
                {theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              {themeOpen ? (
                <div className="palette" style={{ position: 'absolute', right: 0, top: 44, width: 210, maxHeight: 'none' }}>
                  <div className="palette-results">
                    <div className="palette-group">Appearance</div>
                    {THEMES.map(item => (
                      <button
                        type="button"
                        key={item.id}
                        className={`palette-item${theme === item.id ? ' is-active' : ''}`}
                        onClick={() => {
                          onTheme(item.id);
                          setThemeOpen(false);
                        }}
                      >
                        <i style={{ width: 14, height: 14, borderRadius: 4, background: item.swatch, border: '1px solid var(--border-strong)' }} />
                        <span>{item.label}</span>
                        {theme === item.id ? <small>Active</small> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <button className="icon-button topbar-search-mobile" type="button" onClick={onOpenMenu} aria-label="Open navigation">
              <Menu size={17} />
            </button>
            <div className="account-control" ref={accountRef} style={{ position: 'relative' }}>
              <button
                className="avatar-button"
                type="button"
                onClick={() => { setAccountOpen(value => !value); setThemeOpen(false); }}
                aria-label="Account menu"
                aria-expanded={accountOpen}
              >
                {(user?.name || user?.email || 'LP').slice(0, 2).toUpperCase()}
              </button>
              {accountOpen ? (
                <div className="palette" style={{ position: 'absolute', right: 0, top: 44, width: 230, maxHeight: 'none' }}>
                  <div className="palette-results">
                    <div className="palette-group">{user?.email || 'Signed in'}</div>
                    <button type="button" className="palette-item" onClick={() => { setAccountOpen(false); navigate('account'); }}>
                      <User size={15} />
                      <span>Your account</span>
                    </button>
                    {isAdmin ? (
                      <button type="button" className="palette-item" onClick={() => { setAccountOpen(false); navigate('settings'); }}>
                        <Settings size={15} />
                        <span>Admin console</span>
                      </button>
                    ) : null}
                    <button type="button" className="palette-item" onClick={() => { setAccountOpen(false); setThemeOpen(true); }}>
                      <Palette size={15} />
                      <span>Appearance</span>
                    </button>
                    <button type="button" className="palette-item" onClick={onSignOut}>
                      <LogOut size={15} />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <aside className="sidebar">
        <div className="nav-group">
          <div className="nav-label">Track</div>
          {PRIMARY.map(item =>
            navItem({ ...item, count: item.id === 'apps' ? apps.length : item.id === 'issues' ? unreadIssues : 0 }, page === item.id),
          )}
        </div>
        <div className="nav-group">
          <div className="nav-label">Discover</div>
          {DISCOVER.map(item =>
            navItem(item, item.id === 'discover' ? page === 'discover' && !page.includes('sponsor') : page === item.id),
          )}
        </div>
        {isAdmin ? (
          <div className="nav-group">
            <div className="nav-label">Workspace</div>
            {navItem({ id: 'settings', label: 'Admin console', icon: Settings }, page === 'settings')}
          </div>
        ) : null}
        <div className="sidebar-foot">
          <div className="nav-group">
            {navItem({ id: 'about', label: 'About LePatch', icon: Info }, page === 'about')}
          </div>
          <div className="sidebar-card">
            <div className="sidebar-card-head">
              <Activity size={14} />
              <span>Background checks</span>
            </div>
            <b>{connected ? 'Live updates on' : 'Reconnecting…'}</b>
            <span className="subtle" style={{ fontSize: 'var(--text-xs)' }}>
              Release checks run in the background every few minutes.
            </span>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="page">{children}</div>
      </main>

      <nav className="mobile-bar" aria-label="Primary">
        {MOBILE_TABS.map(item => (
          <button key={item.id} type="button" className={page === item.id ? 'is-active' : ''} onClick={() => navigate(item.id)}>
            <item.icon size={19} />
            <span>{item.label}</span>
          </button>
        ))}
        <button type="button" className={page === 'account' || page === 'settings' ? 'is-active' : ''} onClick={() => navigate(isAdmin ? 'settings' : 'account')}>
          <User size={19} />
          <span>Account</span>
        </button>
      </nav>
    </div>
  );
}
