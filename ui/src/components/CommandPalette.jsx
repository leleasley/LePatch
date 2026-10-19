import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CircleDot,
  Compass,
  Folder,
  Info,
  LayoutList,
  LogOut,
  Moon,
  Palette,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import { THEMES } from '../lib/hooks.js';

const PAGES = [
  { id: 'feed', label: 'Release feed', hint: 'Latest releases', icon: LayoutList },
  { id: 'apps', label: 'Watched apps', hint: 'Your repositories', icon: Radio },
  { id: 'issues', label: 'Raised issues', hint: 'Issues you opened', icon: CircleDot },
  { id: 'notifications', label: 'Notifications', hint: 'Delivery history', icon: Bell },
  { id: 'discover', label: 'Repository search', hint: 'Find new projects', icon: Compass },
  { id: 'owned-repos', label: 'Your repositories', hint: 'Connected account', icon: Folder },
  { id: 'account', label: 'Your account', hint: 'Profile and security', icon: CircleDot },
  { id: 'settings', label: 'Admin console', hint: 'Workspace settings', icon: Settings },
  { id: 'about', label: 'About LePatch', hint: 'Version and updates', icon: Info },
];

export function CommandPalette({ open, onClose, onNavigate, onAction, apps = [], theme, onTheme }) {
  const [term, setTerm] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef(null);

  const groups = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const match = value => !needle || value.toLowerCase().includes(needle);

    const pages = PAGES.filter(item => match(item.label) || match(item.hint));
    const repos = apps
      .filter(app => match(app.name) || match(app.repoFullName))
      .slice(0, 8)
      .map(app => ({
        id: `app:${app.id}`,
        label: app.name,
        hint: app.repoFullName,
        icon: Radio,
        run: () => onNavigate('app-detail', app.id),
      }));
    const actions = [
      { id: 'action:watch', label: 'Watch a repository', hint: 'Add to your feed', icon: Plus, run: () => onAction('watch') },
      { id: 'action:refresh', label: 'Refresh data', hint: 'Reload now', icon: RefreshCw, run: () => onAction('refresh') },
      {
        id: 'action:theme',
        label: 'Switch appearance',
        hint: THEMES.find(item => item.id === theme)?.label || 'Change theme',
        icon: theme === 'light' ? Sun : Moon,
        run: () => onAction('theme'),
      },
      { id: 'action:signout', label: 'Sign out', hint: 'End this session', icon: LogOut, run: () => onAction('signout') },
    ].filter(item => match(item.label) || match(item.hint));

    return [
      { label: 'Go to', items: pages.map(item => ({ ...item, run: () => onNavigate(item.id) })) },
      { label: 'Repositories', items: repos },
      { label: 'Actions', items: actions },
    ].filter(group => group.items.length);
  }, [term, apps, onNavigate, onAction, theme]);

  const flat = useMemo(() => groups.flatMap(group => group.items), [groups]);

  useEffect(() => {
    if (open) {
      setTerm('');
      setCursor(0);
    }
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [term]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setCursor(current => (current + 1) % Math.max(1, flat.length));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCursor(current => (current - 1 + flat.length) % Math.max(1, flat.length));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const item = flat[cursor];
        if (item) {
          item.run();
          onClose();
        }
      } else if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, flat, cursor, onClose]);

  useEffect(() => {
    const active = listRef.current?.querySelector('.palette-item.is-active');
    active?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  let index = -1;

  return (
    <div className="palette-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input">
          <Search size={18} />
          <input
            autoFocus
            value={term}
            placeholder="Jump to a page, repository or action…"
            onChange={event => setTerm(event.target.value)}
            aria-label="Search commands"
          />
          <Palette size={16} />
        </div>
        <div className="palette-results" ref={listRef}>
          {groups.map(group => (
            <div key={group.label}>
              <div className="palette-group">{group.label}</div>
              {group.items.map(item => {
                index += 1;
                const Icon = item.icon;
                const position = index;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`palette-item${position === cursor ? ' is-active' : ''}`}
                    onMouseEnter={() => setCursor(position)}
                    onClick={() => {
                      item.run();
                      onClose();
                    }}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                    <small>{item.hint}</small>
                  </button>
                );
              })}
            </div>
          ))}
          {!groups.length ? <div className="palette-group">No matches</div> : null}
        </div>
        <div className="palette-foot">
          <span>↑↓ to move</span>
          <span>↵ to open</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );
}
