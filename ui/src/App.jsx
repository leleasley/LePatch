import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { api, ApiError } from './lib/api.js';
import { useTheme } from './lib/hooks.js';
import { clearSnapshots, readSnapshot, writeSnapshot } from './lib/storage.js';
import { passkeysSupported, publicKeyOptions, serializeCredential } from './lib/webauthn.js';
import { useToast } from './lib/toast.jsx';
import { Shell } from './components/Shell.jsx';
import { CommandPalette } from './components/CommandPalette.jsx';
import { AddRepositoryDialog } from './components/AddRepository.jsx';
import { EmptyState, LoadingLine, RepoIcon } from './components/ui.jsx';
import { MarkdownView } from './components/Markdown.jsx';
import { FeedPage } from './pages/Feed.jsx';
import { WatchedPage } from './pages/Watched.jsx';
import { RepositoryPage } from './pages/Repository.jsx';
import { IssuesPage } from './pages/Issues.jsx';
import { IssueDetailPage } from './pages/IssueDetail.jsx';
import { NotificationsPage } from './pages/Notifications.jsx';
import { DiscoverPage } from './pages/Discover.jsx';
import { SponsorDetailPage } from './pages/SponsorDetail.jsx';
import { AccountPage } from './pages/Account.jsx';
import { AdminPage } from './pages/Admin.jsx';
import { AboutPage } from './pages/About.jsx';
import { AuthPage } from './pages/Auth.jsx';
import { GitHubMark } from './components/GitHubMark.jsx';

const ROUTES = [
  { id: 'feed', path: '/' },
  { id: 'apps', path: '/apps' },
  { id: 'issues', path: '/issues' },
  { id: 'notifications', path: '/notifications' },
  { id: 'discover', path: '/discover' },
  { id: 'discover-sponsors', path: '/discover/sponsors' },
  { id: 'owned-repos', path: '/your-repositories' },
  { id: 'settings', path: '/settings' },
  { id: 'account', path: '/account' },
  { id: 'about', path: '/about' },
];

function routeFromPath(pathname) {
  if (/^\/apps\/[^/]+\/releases\//.test(pathname)) return { id: 'release-detail' };
  if (/^\/apps\/[^/]+/.test(pathname)) return { id: 'app-detail' };
  if (/^\/issues\/[^/]+\/[^/]+\/\d+/.test(pathname)) return { id: 'issue-detail' };
  if (/^\/your-repositories\/[^/]+\/[^/]+/.test(pathname)) return { id: 'owned-repo' };
  if (/^\/your-repositories/.test(pathname)) return { id: 'owned-repos' };
  if (/^\/sponsors\/[^/]+/.test(pathname)) return { id: 'sponsor-detail' };
  if (/^\/github\/[^/]+\/[^/]+/.test(pathname)) return { id: 'github-repo' };
  const match = ROUTES.find(route => route.path === pathname);
  return match ? { id: match.id } : { id: 'feed' };
}

const PAGE_META = {
  feed: { kicker: 'release monitor', title: 'Release feed', description: 'Everything new across the projects you follow, updated the moment GitHub publishes it.' },
  apps: { kicker: 'your repositories', title: 'Watched apps', description: 'Every repository LePatch checks for you, with its own release rules.' },
  'app-detail': { kicker: 'repository', title: 'Repository', description: 'Release history, documentation and activity for this repository.' },
  'release-detail': { kicker: 'release notes', title: 'Release', description: 'The full release notes published on GitHub.' },
  issues: { kicker: 'github activity', title: 'Raised issues', description: 'Issues you opened across GitHub, with new comments and state changes.' },
  'issue-detail': { kicker: 'github issue', title: 'Issue', description: 'The issue, its labels and the full comment thread.' },
  notifications: { kicker: 'delivery log', title: 'Notifications', description: 'Every release alert LePatch has pushed to your channels.' },
  discover: { kicker: 'discover github', title: 'Repository search', description: 'Find a new project to follow and start tracking its releases.' },
  'discover-sponsors': { kicker: 'discover github', title: 'Sponsored maintainers', description: 'Repositories you can reach through the sponsorship you support.' },
  'owned-repos': { kicker: 'your account', title: 'Your repositories', description: 'Repositories connected to the GitHub account linked to your profile.' },
  'owned-repo': { kicker: 'your account', title: 'Repository', description: 'Browse the files, releases and activity of a repository you own.' },
  'github-repo': { kicker: 'github', title: 'Repository', description: 'A preview of a repository on GitHub.' },
  'sponsor-detail': { kicker: 'sponsored maintainer', title: 'Maintainer', description: 'Repositories available through your active sponsorship.' },
  settings: { kicker: 'workspace', title: 'Admin console', description: 'Everything that shapes how this LePatch installation behaves.' },
  account: { kicker: 'your account', title: 'Your profile', description: 'Profile, sign in methods, notifications and active sessions.' },
  about: { kicker: 'about', title: 'About LePatch', description: 'Version, updates and the project behind this installation.' },
};

export function App() {
  const toast = useToast();
  const [theme, setTheme] = useTheme();
  // Captured before the theme hook writes its first value, so a first-time
  // visitor adopts their account theme while a returning visitor keeps the
  // choice they made on this device.
  const [localThemeExisted] = useState(() => {
    try {
      return localStorage.getItem('lepatch-theme') !== null;
    } catch {
      return false;
    }
  });

  const initialParams = new URLSearchParams(location.search);
  const [authScreen, setAuthScreen] = useState(() => {
    if (location.pathname === '/login') return initialParams.get('mfaToken') ? 'mfa' : 'login';
    if (location.pathname === '/setup/mfa') return 'setup';
    if (location.pathname === '/setup') return 'first-setup';
    return 'app';
  });
  const [mfaToken, setMfaToken] = useState(() => initialParams.get('mfaToken') || '');
  const [setupToken, setSetupToken] = useState(() => initialParams.get('token') || initialParams.get('setupToken') || '');
  const [setupInfo, setSetupInfo] = useState(null);
  const [backupCodes, setBackupCodes] = useState([]);
  const [authNotice, setAuthNotice] = useState(
    initialParams.get('toast') === 'mfa-recovery-unavailable'
      ? 'MFA recovery is unavailable for this GitHub account. Use the account linked to LePatch.'
      : initialParams.get('toast')
        ? 'GitHub sign in did not finish. Check the connection and try again.'
        : '',
  );

  const [page, setPage] = useState(() => routeFromPath(location.pathname).id);
  const [apps, setApps] = useState(() => readSnapshot('apps', []));
  const [feed, setFeed] = useState(() => readSnapshot('feed', []));
  const [stats, setStats] = useState(() => readSnapshot('stats', { total: 0, updates: 0, failed: 0, stale: 0 }));
  const [currentUser, setCurrentUser] = useState(null);
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');

  const [detailAppId, setDetailAppId] = useState(() => location.pathname.match(/^\/apps\/([^/]+)/)?.[1] || '');
  const [detailReleaseId, setDetailReleaseId] = useState(() => location.pathname.match(/^\/apps\/[^/]+\/releases\/([^/]+)/)?.[1] || '');
  const [detailApp, setDetailApp] = useState(null);
  const [detailReleases, setDetailReleases] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailVersion, setDetailVersion] = useState(0);

  const [raisedIssues, setRaisedIssues] = useState(() => readSnapshot('raised-issues-open', []));
  const [issueState, setIssueState] = useState('open');
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueNotice, setIssueNotice] = useState('');

  const [notificationEvents, setNotificationEvents] = useState(() => readSnapshot('notification-events', []));
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationNotice, setNotificationNotice] = useState('');

  const [discoveryMode, setDiscoveryMode] = useState('search');
  const [discoveryQuery, setDiscoveryQuery] = useState('');
  const [discoveryResults, setDiscoveryResults] = useState([]);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [discoveryError, setDiscoveryError] = useState('');
  const [sponsorPanels, setSponsorPanels] = useState({});
  const [ownedRepos, setOwnedRepos] = useState([]);
  const [ownedReposError, setOwnedReposError] = useState('');
  const [ownedRepo, setOwnedRepo] = useState(() => {
    const match = location.pathname.match(/^\/your-repositories\/([^/]+)\/([^/]+)/);
    return match ? `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}` : '';
  });
  const [previewRepo, setPreviewRepo] = useState(() => {
    const match = location.pathname.match(/^\/github\/([^/]+)\/([^/]+)/);
    return match ? `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}` : '';
  });
  const [sponsorLogin, setSponsorLogin] = useState(() => {
    const match = location.pathname.match(/^\/sponsors\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  });
  const [issueRef, setIssueRef] = useState(() => {
    const match = location.pathname.match(/^\/issues\/([^/]+)\/([^/]+)\/(\d+)/);
    return match ? { owner: decodeURIComponent(match[1]), repo: decodeURIComponent(match[2]), number: Number(match[3]) } : null;
  });

  const deleteAcks = useRef(new Map());
  const issueStateRef = useRef(issueState);
  issueStateRef.current = issueState;
  const appsRef = useRef(apps);
  appsRef.current = apps;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const detailAppIdRef = useRef(detailAppId);
  detailAppIdRef.current = detailAppId;
  const themeTouched = useRef(false);
  const wasConnected = useRef(undefined);

  // The appearance follows the account so it is the same on every device.
  const applyTheme = useCallback(
    next => {
      themeTouched.current = true;
      setTheme(next);
      if (authScreen === 'app') {
        api('/api/account', { method: 'PATCH', body: { theme: next } })
          .then(result => setCurrentUser(result.user))
          .catch(() => {
            // The local choice still applies when the account cannot be reached.
          });
      }
    },
    [authScreen, setTheme],
  );

  /* ---------------------------------------------------------------- data */

  const endSession = useCallback(() => {
    clearSnapshots();
    setApps([]);
    setFeed([]);
    setStats({ total: 0, updates: 0, failed: 0, stale: 0 });
    setRaisedIssues([]);
    setNotificationEvents([]);
    setConnected(false);
    setAuthScreen('login');
    history.replaceState({}, '', '/login');
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [dashboardResponse, appsResponse] = await Promise.all([
        api('/api/dashboard?perPage=80&includePrereleases=true'),
        api('/api/apps?perPage=200'),
      ]);
      setStats(dashboardResponse);
      setFeed(dashboardResponse.recent || []);
      setApps(appsResponse.apps || []);
      writeSnapshot('stats', dashboardResponse);
      writeSnapshot('feed', dashboardResponse.recent || []);
      writeSnapshot('apps', appsResponse.apps || []);
      setNotice('');
      const session = await api('/api/auth/session');
      setCurrentUser(session.user || null);
      if (!themeTouched.current && session.user?.theme) {
        const accountTheme = session.user.theme;
        if (localThemeExisted) {
          // This device already has a preference; keep it and push it to the
          // account so the choice survives a reload.
          if (accountTheme !== themeRef.current) {
            api('/api/account', { method: 'PATCH', body: { theme: themeRef.current } })
              .then(result => setCurrentUser(result.user))
              .catch(() => {
                // The local choice still applies when the account cannot be reached.
              });
          }
        } else if (accountTheme !== themeRef.current) {
          setTheme(accountTheme);
        }
      }
    } catch (issue) {
      if (issue instanceof ApiError && issue.status === 401) {
        endSession();
        return;
      }
      setNotice(connected ? 'Connection interrupted · showing the last saved data.' : 'LePatch is offline. Sign in when the connection returns to load your data.');
    } finally {
      setRefreshing(false);
    }
  }, [connected, endSession, setTheme]);

  const loadRaisedIssues = useCallback(async (state = issueStateRef.current) => {
    setIssueLoading(true);
    try {
      const result = await api(`/api/issues/raised?state=${state}&perPage=100`);
      setRaisedIssues(result.issues || []);
      writeSnapshot(`raised-issues-${state}`, result.issues || []);
      setIssueNotice('');
    } catch (issue) {
      if (issue instanceof ApiError && issue.status === 401) {
        endSession();
        return;
      }
      const snapshot = readSnapshot(`raised-issues-${state}`, null);
      if (snapshot) setRaisedIssues(snapshot);
      setIssueNotice('Issue updates are unavailable right now. Showing the last saved list.');
    } finally {
      setIssueLoading(false);
    }
  }, [endSession]);

  const loadNotifications = useCallback(async () => {
    setNotificationLoading(true);
    try {
      const result = await api('/api/notifications/history?perPage=60');
      setNotificationEvents(result.events || []);
      writeSnapshot('notification-events', result.events || []);
      setNotificationNotice('');
    } catch (issue) {
      if (issue instanceof ApiError && issue.status === 401) {
        endSession();
        return;
      }
      setNotificationEvents(readSnapshot('notification-events', []));
      setNotificationNotice('Notification history is offline. Showing the last saved events.');
    } finally {
      setNotificationLoading(false);
    }
  }, [endSession]);

  /* -------------------------------------------------------------- routing */

  const navigate = useCallback((target, options = {}) => {
    const paths = {
      feed: '/',
      apps: '/apps',
      issues: '/issues',
      notifications: '/notifications',
      discover: '/discover',
      'discover-sponsors': '/discover/sponsors',
      'owned-repos': '/your-repositories',
      settings: '/settings',
      account: '/account',
      about: '/about',
    };
    const next = options.path || paths[target] || location.pathname;
    if (location.pathname !== next) history.pushState({}, '', next);
    // Discovery keeps two different result shapes (repositories and
    // maintainers) in one list, so switching sections must clear it or the
    // last payload is rendered by the wrong view.
    if (target === 'discover') {
      setDiscoveryMode('search');
      setDiscoveryResults([]);
      setDiscoveryError('');
    } else if (target === 'discover-sponsors') {
      setDiscoveryMode('sponsored');
      setDiscoveryResults([]);
      setDiscoveryError('');
    }
    setPage(target);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const openApp = useCallback((id, releaseId = '') => {
    setDetailAppId(id);
    setDetailReleaseId(releaseId);
    setDetailApp(apps.find(app => app.id === id) || null);
    setPage(releaseId ? 'release-detail' : 'app-detail');
    const path = releaseId ? `/apps/${encodeURIComponent(id)}/releases/${encodeURIComponent(releaseId)}` : `/apps/${encodeURIComponent(id)}`;
    if (location.pathname !== path) history.pushState({}, '', path);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [apps]);

  const openOwnedRepo = useCallback(repoName => {
    const [owner, name] = repoName.split('/');
    setOwnedRepo(repoName);
    setPage('owned-repo');
    const path = `/your-repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    if (location.pathname !== path) history.pushState({}, '', path);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const openPreviewRepo = useCallback(repoName => {
    const [owner, name] = repoName.split('/');
    setPreviewRepo(repoName);
    setPage('github-repo');
    const path = `/github/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    if (location.pathname !== path) history.pushState({}, '', path);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const openSponsor = useCallback(login => {
    setSponsorLogin(login);
    setPage('sponsor-detail');
    const path = `/sponsors/${encodeURIComponent(login)}`;
    if (location.pathname !== path) history.pushState({}, '', path);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const openIssue = useCallback(issue => {
    const next = { owner: issue.owner, repo: issue.repo, number: Number(issue.issueNumber) };
    setIssueRef(next);
    setPage('issue-detail');
    const path = `/issues/${encodeURIComponent(next.owner)}/${encodeURIComponent(next.repo)}/${next.number}`;
    if (location.pathname !== path) history.pushState({}, '', path);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  /* -------------------------------------------------------------- effects */

  useEffect(() => {
    if (['app', 'login', 'first-setup'].includes(authScreen)) {
      api('/api/setup/status')
        .then(status => {
          if (!status.setupComplete) {
            setAuthScreen('first-setup');
            history.replaceState({}, '', '/setup');
          } else if (authScreen === 'app') {
            refresh();
          }
        })
        .catch(() => {
          if (authScreen === 'app') refresh();
        });
    }
    const timer = authScreen === 'app' ? window.setInterval(refresh, 90000) : null;
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [authScreen, refresh]);

  useEffect(() => {
    const onKeyDown = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(value => !value);
      }
    };
    const onPopState = () => {
      const params = new URLSearchParams(location.search);
      if (location.pathname === '/login') {
        setAuthScreen(params.get('mfaToken') ? 'mfa' : 'login');
        setMfaToken(params.get('mfaToken') || '');
      } else if (location.pathname === '/setup/mfa') {
        setAuthScreen('setup');
        setSetupToken(params.get('token') || params.get('setupToken') || '');
      } else if (location.pathname === '/setup') {
        setAuthScreen('first-setup');
      } else {
        const route = routeFromPath(location.pathname);
        setAuthScreen('app');
        setPage(route.id);
        if (route.id === 'discover' || route.id === 'discover-sponsors') {
          setDiscoveryMode(route.id === 'discover-sponsors' ? 'sponsored' : 'search');
          setDiscoveryResults([]);
          setDiscoveryError('');
        }
        const appMatch = location.pathname.match(/^\/apps\/([^/]+)(?:\/releases\/([^/]+))?/);
        if (appMatch) {
          setDetailAppId(appMatch[1]);
          setDetailReleaseId(appMatch[2] || '');
        }
        const ownMatch = location.pathname.match(/^\/your-repositories\/([^/]+)\/([^/]+)/);
        if (ownMatch) setOwnedRepo(`${decodeURIComponent(ownMatch[1])}/${decodeURIComponent(ownMatch[2])}`);
        const sponsorMatch = location.pathname.match(/^\/sponsors\/([^/]+)/);
        if (sponsorMatch) setSponsorLogin(decodeURIComponent(sponsorMatch[1]));
        const previewMatch = location.pathname.match(/^\/github\/([^/]+)\/([^/]+)/);
        if (previewMatch) setPreviewRepo(`${decodeURIComponent(previewMatch[1])}/${decodeURIComponent(previewMatch[2])}`);
        const issueMatch = location.pathname.match(/^\/issues\/([^/]+)\/([^/]+)\/(\d+)/);
        if (issueMatch) {
          setIssueRef({ owner: decodeURIComponent(issueMatch[1]), repo: decodeURIComponent(issueMatch[2]), number: Number(issueMatch[3]) });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  useEffect(() => {
    if (authScreen !== 'app') return;
    if (page === 'issues') {
      setRaisedIssues(readSnapshot(`raised-issues-${issueState}`, []));
      loadRaisedIssues(issueState);
    } else if (page === 'notifications') {
      loadNotifications();
    } else if (page === 'discover-sponsors' && !discoveryResults.length) {
      searchRepositories('sponsored');
    } else if (page === 'owned-repos') {
      api('/api/github/user-repos?visibility=all&affiliation=owner&sort=updated&direction=desc&perPage=100')
        .then(data => {
          setOwnedRepos(Array.isArray(data) ? data : []);
          setOwnedReposError('');
        })
        .catch(issue => setOwnedReposError(issue.message || 'Could not load your GitHub repositories.'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, issueState, authScreen]);

  useEffect(() => {
    if (!['app-detail', 'release-detail'].includes(page) || !detailAppId) return undefined;
    let cancelled = false;
    setDetailLoading(true);
    Promise.all([api(`/api/apps/${encodeURIComponent(detailAppId)}`), api(`/api/apps/${encodeURIComponent(detailAppId)}/releases?perPage=50`)])
      .then(([appData, releaseData]) => {
        if (cancelled) return;
        setDetailApp(appData.app);
        setDetailReleases(releaseData.releases || []);
      })
      .catch(issue => {
        if (cancelled) return;
        if (issue instanceof ApiError && issue.status === 401) {
          endSession();
          return;
        }
        setNotice(issue.message || 'Could not load this repository.');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, detailAppId, endSession]);

  useEffect(() => {
    if (authScreen !== 'setup' || !setupToken) return undefined;
    const controller = new AbortController();
    api('/api/account/mfa/setup', { method: 'POST', body: { setupToken }, signal: controller.signal })
      .then(data => {
        setSetupInfo(data);
        setAuthNotice('');
      })
      .catch(issue => {
        if (!controller.signal.aborted) setAuthNotice(issue.message || 'Could not start MFA setup. Sign in again.');
      });
    return () => controller.abort();
  }, [authScreen, setupToken]);

  useEffect(() => {
    if (authScreen !== 'app') return undefined;
    const source = new EventSource('/api/events');
    const reload = () => refresh();
    const parse = event => {
      try {
        return JSON.parse(event.data);
      } catch {
        return {};
      }
    };
    const appName = id => appsRef.current.find(app => app.id === id)?.name || 'A repository';

    ['watched-app.added', 'watched-app.updated', 'watched-app.removed', 'release.discovered', 'check.finished', 'state.refresh'].forEach(name => source.addEventListener(name, reload));
    source.addEventListener('raised-issue.updated', () => loadRaisedIssues(issueStateRef.current));
    source.addEventListener('raised-issue.comment', () => loadRaisedIssues(issueStateRef.current));
    source.addEventListener('notification.sent', () => loadNotifications());
    source.addEventListener('notification.failed', () => loadNotifications());

    // Live events also surface as toasts so a change is visible from any page.
    const reloadOpenDetail = data => {
      if (data?.appId && data.appId === detailAppIdRef.current) {
        setDetailVersion(value => value + 1);
      }
    };
    source.addEventListener('release.discovered', event => {
      const data = parse(event);
      reloadOpenDetail(data);
      toast.info({
        title: 'New release',
        message: `${appName(data.appId)} published ${data.latestTag || 'a new release'}.`,
      });
    });
    source.addEventListener('check.finished', event => {
      const data = parse(event);
      reloadOpenDetail(data);
      if (!data.failed) return;
      toast.error({
        title: 'Release check failed',
        message: `${appName(data.appId)} could not be checked. Open the repository to see why.`,
      });
    });
    source.addEventListener('raised-issue.comment', event => {
      const data = parse(event);
      const count = Number(data.newComments || 0);
      if (!count) return;
      toast.info({
        title: 'New issue comment',
        message: `${data.owner}/${data.repo} #${data.issueNumber} has ${count} new ${count === 1 ? 'comment' : 'comments'}.`,
      });
    });
    source.addEventListener('notification.failed', () => {
      toast.error({
        title: 'Notification not delivered',
        message: 'A release alert could not be sent. Retry it from the admin console.',
      });
    });

    source.addEventListener('watched-app.removed', event => {
      try {
        const id = JSON.parse(event.data).id;
        deleteAcks.current.get(id)?.();
        deleteAcks.current.delete(id);
      } catch {
        // Ignore malformed events.
      }
    });
    source.onopen = () => {
      if (wasConnected.current === false) {
        toast.success({ title: 'Live updates restored', message: 'LePatch is receiving release events again.' });
      }
      wasConnected.current = true;
      setConnected(true);
      refresh();
    };
    source.onerror = () => {
      wasConnected.current = false;
      setConnected(false);
    };
    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authScreen, refresh, loadRaisedIssues, loadNotifications]);

  // Re-run the repository load when the live counter changes.
  useEffect(() => {
    if (detailVersion === 0) return;
    if (!['app-detail', 'release-detail'].includes(page) || !detailAppId) return;
    let cancelled = false;
    Promise.all([api(`/api/apps/${encodeURIComponent(detailAppId)}`), api(`/api/apps/${encodeURIComponent(detailAppId)}/releases?perPage=50`)])
      .then(([appData, releaseData]) => {
        if (cancelled) return;
        setDetailApp(appData.app);
        setDetailReleases(releaseData.releases || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [detailVersion, page, detailAppId]);

  /* --------------------------------------------------------------- actions */

  const addRepository = useCallback(
    async repoFullName => {
      const name = String(repoFullName || '').trim();
      const parts = name.split('/');
      if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('Use the owner/repository format.');
      const result = await api('/api/apps', { method: 'POST', body: { repoFullName: name } });
      setApps(current => {
        const next = [result.app, ...current];
        writeSnapshot('apps', next);
        return next;
      });
      setStats(current => {
        const next = { ...current, total: (current.total || 0) + 1 };
        writeSnapshot('stats', next);
        return next;
      });
      setAdding(false);
      toast.success(`${name} is now on your watch list.`);
      return result.app;
    },
    [toast],
  );

  const removeApp = useCallback(
    async id => {
      const removed = apps.find(app => app.id === id);
      if (!removed) return;
      setApps(current => {
        const next = current.filter(app => app.id !== id);
        writeSnapshot('apps', next);
        return next;
      });
      setStats(current => {
        const next = { ...current, total: Math.max(0, (current.total || 0) - 1) };
        writeSnapshot('stats', next);
        return next;
      });
      const acknowledged = new Promise(resolve => deleteAcks.current.set(id, resolve));
      try {
        await api(`/api/apps/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await Promise.race([acknowledged, new Promise(resolve => setTimeout(resolve, 1400))]);
        toast.success(`${removed.repoFullName} removed from your watch list.`);
      } catch {
        if (deleteAcks.current.has(id)) {
          setApps(current => {
            if (current.some(app => app.id === id)) return current;
            const next = [...current, removed].sort((a, b) => a.name.localeCompare(b.name));
            writeSnapshot('apps', next);
            return next;
          });
          setStats(current => {
            const next = { ...current, total: (current.total || 0) + 1 };
            writeSnapshot('stats', next);
            return next;
          });
          toast.error('Could not remove this repository. It has been restored.');
        }
      } finally {
        deleteAcks.current.delete(id);
      }
    },
    [apps, toast],
  );

  const checkApp = useCallback(
    async id => {
      setChecking(id);
      try {
        await api(`/api/apps/${encodeURIComponent(id)}/check`, { method: 'POST' });
        toast.success('Release check queued. The feed updates when it finishes.');
      } catch {
        toast.error('Could not queue a release check. Try again in a moment.');
      } finally {
        setChecking(null);
      }
    },
    [toast],
  );

  const markSeen = useCallback(
    async appId => {
      if (!appId) return;
      try {
        const result = await api('/api/releases/seen', { method: 'POST', body: { watchedAppId: appId } });
        setApps(current => {
          const next = current.map(app => (app.id === appId ? { ...app, updateAvailable: false } : app));
          writeSnapshot('apps', next);
          return next;
        });
        const wasUpdated = appsRef.current.some(app => app.id === appId && app.updateAvailable);
        if (wasUpdated) {
          setStats(current => {
            const next = { ...current, updates: Math.max(0, (current.updates || 0) - 1) };
            writeSnapshot('stats', next);
            return next;
          });
        }
        if (result.app) {
          setDetailApp(current => (current && current.id === appId ? result.app : current));
        }
        toast.success('Marked as seen.');
      } catch (issue) {
        toast.error(issue.message || 'Could not mark the release as seen.');
      }
    },
    [toast],
  );

  const markAllSeen = useCallback(async () => {
    try {
      const result = await api('/api/releases/seen-all', { method: 'POST', body: {} });
      setApps(current => {
        const next = current.map(app => ({ ...app, updateAvailable: false }));
        writeSnapshot('apps', next);
        return next;
      });
      setStats(current => {
        const next = { ...current, updates: 0 };
        writeSnapshot('stats', next);
        return next;
      });
      toast.success(`${result.updated || 0} ${result.updated === 1 ? 'repository' : 'repositories'} marked as read.`);
    } catch (issue) {
      toast.error(issue.message || 'Could not mark everything as read.');
    }
  }, [toast]);

  const ignoreRelease = useCallback(
    async releaseId => {
      if (!releaseId) return;
      try {
        await api('/api/releases/ignore', { method: 'POST', body: { releaseId } });
        setFeed(current => {
          const next = current.filter(item => item.id !== releaseId);
          writeSnapshot('feed', next);
          return next;
        });
        toast.success('Release ignored.');
      } catch (issue) {
        toast.error(issue.message || 'Could not ignore the release.');
      }
    },
    [toast],
  );

  const searchRepositories = useCallback(
    async mode => {
      const active = mode || discoveryMode;
      const needle = discoveryQuery.trim();
      if (active === 'search' && !needle) return;
      setDiscoveryBusy(true);
      setDiscoveryError('');
      try {
        const params = new URLSearchParams({ perPage: '30' });
        if (needle) params.set('q', needle);
        const endpoint = active === 'sponsored' ? '/api/github/sponsored' : '/api/github/search';
        const result = await api(`${endpoint}?${params}`);
        setDiscoveryResults(result.items || []);
      } catch (issue) {
        setDiscoveryError(issue.message || 'GitHub search is unavailable.');
      } finally {
        setDiscoveryBusy(false);
      }
    },
    [discoveryMode, discoveryQuery],
  );

  const expandSponsor = useCallback(async maintainer => {
    const login = maintainer.login || maintainer;
    const current = sponsorPanels[login];
    if (current?.open) {
      setSponsorPanels(value => ({ ...value, [login]: { ...value[login], open: false } }));
      return;
    }
    if (current?.items) {
      setSponsorPanels(value => ({ ...value, [login]: { ...value[login], open: true } }));
      return;
    }
    setSponsorPanels(value => ({ ...value, [login]: { open: true, loading: true, items: [], error: '' } }));
    try {
      const result = await api(`/api/github/sponsored/${encodeURIComponent(login)}/repos`);
      setSponsorPanels(value => ({ ...value, [login]: { open: true, loading: false, items: result.items || [], error: '' } }));
    } catch (issue) {
      setSponsorPanels(value => ({ ...value, [login]: { open: true, loading: false, items: [], error: issue.message || 'Could not load this maintainer’s repositories.' } }));
    }
  }, [sponsorPanels]);

  const markIssueSeen = useCallback(
    async id => {
      const previous = raisedIssues;
      const next = previous.map(issue => (issue.id === id ? { ...issue, unreadCommentCount: 0 } : issue));
      setRaisedIssues(next);
      writeSnapshot(`raised-issues-${issueState}`, next);
      try {
        await api(`/api/issues/raised/${encodeURIComponent(id)}/seen`, { method: 'POST' });
      } catch {
        setRaisedIssues(previous);
        writeSnapshot(`raised-issues-${issueState}`, previous);
        toast.error('Could not mark this issue as read. Try again.');
      }
    },
    [raisedIssues, issueState, toast],
  );

  const signOut = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      setCurrentUser(null);
      clearSnapshots();
      setApps([]);
      setFeed([]);
      setRaisedIssues([]);
      setNotificationEvents([]);
      setConnected(false);
      setAuthScreen('login');
      history.replaceState({}, '', '/login');
    } catch {
      toast.error('Could not sign out. Check your connection and try again.');
    }
  }, [toast]);

  const submitLogin = useCallback(
    async (email, password) => {
      setAuthNotice('');
      try {
        const result = await api('/api/auth/login', { method: 'POST', body: { email, password } });
        if (result.mfaSetupRequired) {
          setSetupToken(result.mfaSetupToken);
          setAuthScreen('setup');
          history.pushState({}, '', `/setup/mfa?token=${encodeURIComponent(result.mfaSetupToken)}`);
          return;
        }
        if (result.mfaRequired) {
          setMfaToken(result.mfaToken);
          setAuthScreen('mfa');
          history.pushState({}, '', `/login?mfaToken=${encodeURIComponent(result.mfaToken)}`);
          return;
        }
        finishAuthentication();
      } catch (issue) {
        setAuthNotice(issue.message || 'Could not reach LePatch. Try again.');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const finishAuthentication = useCallback(() => {
    setAuthScreen('app');
    setAuthNotice('');
    setMfaToken('');
    setSetupToken('');
    setSetupInfo(null);
    setBackupCodes([]);
    history.replaceState({}, '', '/');
    refresh();
  }, [refresh]);

  const submitFirstSetup = useCallback(
    async (email, password, confirmPassword) => {
      setAuthNotice('');
      try {
        await api('/api/setup/complete', { method: 'POST', body: { email, password, confirmPassword, appUrl: location.origin } });
        await submitLogin(email, password);
      } catch (issue) {
        setAuthNotice(issue.message || 'Could not finish the initial setup.');
      }
    },
    [submitLogin],
  );

  const submitMFA = useCallback(
    async code => {
      setAuthNotice('');
      try {
        const payload = code.trim().length === 6 ? { mfaToken, code: code.trim() } : { mfaToken, backupCode: code.trim() };
        await api('/api/auth/mfa-verify', { method: 'POST', body: payload });
        finishAuthentication();
      } catch (issue) {
        setAuthNotice(issue.message || 'Could not verify that code.');
      }
    },
    [mfaToken, finishAuthentication],
  );

  const submitMFASetup = useCallback(
    async code => {
      setAuthNotice('');
      try {
        const result = await api('/api/account/mfa/verify', { method: 'POST', body: { setupToken, code: code.trim() } });
        setBackupCodes(result.backupCodes || []);
      } catch (issue) {
        setAuthNotice(issue.message || 'Could not verify the authenticator code.');
      }
    },
    [setupToken],
  );

  const submitPasskey = useCallback(async () => {
    setAuthNotice('');
    try {
      if (!passkeysSupported()) throw new Error('Passkeys are not supported by this browser.');
      const options = await api('/api/webauthn/auth/options');
      const credential = await navigator.credentials.get({ publicKey: publicKeyOptions(options.publicKey) });
      if (!credential) throw new Error('Passkey sign in was cancelled.');
      const result = await api(`/api/webauthn/auth/verify?flowId=${encodeURIComponent(options.flowId)}`, { method: 'POST', body: serializeCredential(credential) });
      if (result.mfaSetupRequired) {
        setSetupToken(result.mfaSetupToken);
        setAuthScreen('setup');
        history.pushState({}, '', `/setup/mfa?token=${encodeURIComponent(result.mfaSetupToken)}`);
        return;
      }
      if (result.mfaRequired) {
        setMfaToken(result.mfaToken);
        setAuthScreen('mfa');
        history.pushState({}, '', `/login?mfaToken=${encodeURIComponent(result.mfaToken)}`);
        return;
      }
      finishAuthentication();
    } catch (issue) {
      setAuthNotice(issue.message || 'Passkey sign in failed.');
    }
  }, [finishAuthentication]);

  const updateApp = useCallback(updated => {
    setApps(current => {
      const next = current.map(app => (app.id === updated.id ? updated : app));
      writeSnapshot('apps', next);
      return next;
    });
    setDetailApp(current => (current && current.id === updated.id ? updated : current));
  }, []);

  const unreadIssues = useMemo(() => raisedIssues.reduce((sum, issue) => sum + (issue.unreadCommentCount || 0), 0), [raisedIssues]);

  if (authScreen !== 'app') {
    return (
      <AuthPage
        screen={authScreen}
        notice={authNotice}
        setupInfo={setupInfo}
        backupCodes={backupCodes}
        onLogin={submitLogin}
        onPasskey={submitPasskey}
        onFirstSetup={submitFirstSetup}
        onMFA={submitMFA}
        onSetup={submitMFASetup}
        onComplete={finishAuthentication}
        onBack={() => {
          setAuthScreen('login');
          setAuthNotice('');
          history.replaceState({}, '', '/login');
        }}
      />
    );
  }

  const meta = PAGE_META[page] || PAGE_META.feed;
  const activeRelease = detailReleases.find(release => release.id === detailReleaseId);
  const title =
    page === 'owned-repo' ? ownedRepo : page === 'github-repo' ? previewRepo : page === 'sponsor-detail' ? `@${sponsorLogin}` : page === 'issue-detail' && issueRef ? `${issueRef.owner}/${issueRef.repo} #${issueRef.number}` : page === 'app-detail' ? detailApp?.name || detailApp?.repoFullName || 'Repository' : page === 'release-detail' ? activeRelease?.name || activeRelease?.tagName || 'Release' : meta.title;

  const body = (() => {
    if (page === 'feed') {
      return (
        <FeedPage
          feed={feed}
          apps={apps}
          stats={stats}
          onOpenApp={id => openApp(id)}
          onOpenRelease={(appId, releaseId) => openApp(appId, releaseId)}
          onCheck={checkApp}
          onRemove={removeApp}
          onMarkSeen={markSeen}
          onMarkAllSeen={markAllSeen}
          onIgnore={ignoreRelease}
          onWatch={() => setAdding(true)}
          checking={checking}
        />
      );
    }
    if (page === 'apps') {
      return <WatchedPage apps={apps} onOpen={id => openApp(id)} onCheck={checkApp} onRemove={removeApp} onUpdate={updateApp} checking={checking} onWatch={() => setAdding(true)} />;
    }
    if (page === 'app-detail' || page === 'release-detail') {
      if (page === 'release-detail' && activeRelease) {
        return (
          <div>
            <button className="btn btn-ghost" type="button" style={{ marginBottom: 16 }} onClick={() => openApp(detailAppId)}>
              ← Release history
            </button>
            <div className="repo-hero">
              <RepoIcon name={detailApp?.name || 'LP'} iconUrl={detailApp?.iconUrl} size="is-lg" />
              <div className="repo-hero-copy">
                <span className="kicker">{activeRelease.draft ? 'draft' : activeRelease.prerelease ? 'pre-release' : 'release'}</span>
                <h2>{activeRelease.name || activeRelease.tagName}</h2>
                <span className="release-meta">
                  <span>{activeRelease.tagName}</span>
                  <span>·</span>
                  <span>{activeRelease.publishedAt ? new Date(activeRelease.publishedAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'Publication date unavailable'}</span>
                </span>
              </div>
              <a className="btn btn-primary" href={activeRelease.htmlUrl} target="_blank" rel="noreferrer">
                <GitHubMark size={14} /> View on GitHub
              </a>
            </div>
            {activeRelease.changelogSummary ? (
              <div className="card card-pad" style={{ marginTop: 18 }}>
                <span className="kicker">summary</span>
                <p style={{ marginTop: 10, color: 'var(--fg-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.65 }}>{activeRelease.changelogSummary}</p>
              </div>
            ) : null}
            <div className="release-notes" style={{ marginTop: 18 }}>
              {activeRelease.body ? <MarkdownView source={activeRelease.body} baseURL={activeRelease.htmlUrl} /> : <p className="subtle">No release notes were published.</p>}
            </div>
          </div>
        );
      }
      return (
        <RepositoryPage
          app={detailApp}
          releases={detailReleases}
          loading={detailLoading}
          onBack={() => navigate('apps')}
          onOpenRelease={releaseId => openApp(detailAppId, releaseId)}
          onCheck={() => checkApp(detailAppId)}
          checking={checking === detailAppId}
          onWatch={addRepository}
        />
      );
    }
    if (page === 'issues') {
      return (
        <IssuesPage
          issues={raisedIssues}
          state={issueState}
          onState={setIssueState}
          onSeen={markIssueSeen}
          onOpen={openIssue}
          onRefresh={() => loadRaisedIssues()}
          loading={issueLoading}
          notice={issueNotice}
        />
      );
    }
    if (page === 'issue-detail' && issueRef) {
      const watched = apps.find(app => app.repoOwner?.toLowerCase() === issueRef.owner.toLowerCase() && app.repoName?.toLowerCase() === issueRef.repo.toLowerCase());
      return (
        <IssueDetailPage
          owner={issueRef.owner}
          repo={issueRef.repo}
          number={issueRef.number}
          onBack={() => navigate('issues')}
          onOpenRepo={watched ? () => openApp(watched.id) : null}
          onCommented={(owner, repo, number) => {
            const match = raisedIssues.find(
              issue =>
                issue.owner.toLowerCase() === owner.toLowerCase() &&
                issue.repo.toLowerCase() === repo.toLowerCase() &&
                Number(issue.issueNumber) === Number(number),
            );
            if (match?.unreadCommentCount > 0) markIssueSeen(match.id);
          }}
        />
      );
    }
    if (page === 'notifications') {
      return (
        <NotificationsPage
          events={notificationEvents}
          notice={notificationNotice}
          onRefresh={loadNotifications}
          loading={notificationLoading}
          onOpenRelease={(appId, releaseId) => {
            if (appId && releaseId) openApp(appId, releaseId);
          }}
        />
      );
    }
    if (page === 'sponsor-detail') {
      const maintainer = discoveryResults.find(person => person.login?.toLowerCase() === sponsorLogin.toLowerCase());
      return (
        <SponsorDetailPage
          login={sponsorLogin}
          maintainer={maintainer}
          panel={sponsorPanels[sponsorLogin]}
          onLoad={() => {
            if (!sponsorPanels[sponsorLogin]?.items) expandSponsor({ login: sponsorLogin });
          }}
          watched={new Set(apps.map(app => app.repoFullName?.toLowerCase()))}
          onWatch={addRepository}
          onOpenRepo={openPreviewRepo}
          onBack={() => navigate('discover-sponsors')}
        />
      );
    }
    if (page === 'discover' || page === 'discover-sponsors' || page === 'owned-repos') {
      const mode = page === 'discover-sponsors' ? 'sponsors' : page === 'owned-repos' ? 'owned' : 'search';
      return (
        <DiscoverPage
          mode={mode}
          onMode={setDiscoveryMode}
          query={discoveryQuery}
          onQuery={setDiscoveryQuery}
          onSearch={() => searchRepositories(mode === 'sponsored' ? 'sponsored' : 'search')}
          results={mode === 'owned' ? ownedRepos : discoveryResults}
          apps={apps}
          loading={discoveryBusy}
          error={discoveryError || ownedReposError}
          onWatch={addRepository}
          sponsorPanels={sponsorPanels}
          onExpandSponsor={expandSponsor}
          onOpenSponsor={openSponsor}
          onOpenRepo={openPreviewRepo}
          onBack={() => navigate('discover-sponsors')}
        />
      );
    }
    if (page === 'owned-repo' || page === 'github-repo') {
      const fullName = page === 'owned-repo' ? ownedRepo : previewRepo;
      return (
        <PreviewRepository
          fullName={fullName}
          readOnly={page === 'github-repo'}
          watched={apps.some(app => app.repoFullName?.toLowerCase() === fullName.toLowerCase())}
          onBack={() => navigate(page === 'owned-repo' ? 'owned-repos' : 'discover')}
          onWatch={addRepository}
        />
      );
    }
    if (page === 'settings') {
      return currentUser?.role === 'administrator' ? <AdminPage /> : <EmptyState icon={TriangleAlert} title="Administrator access required" description="Only workspace administrators can open the admin console." />;
    }
    if (page === 'account') {
      return <AccountPage user={currentUser} onUser={setCurrentUser} onSignOut={signOut} theme={theme} onTheme={applyTheme} />;
    }
    if (page === 'about') {
      return <AboutPage />;
    }
    return null;
  })();

  return (
    <>
      <Shell
        page={page}
        navigate={navigate}
        user={currentUser}
        apps={apps}
        unreadIssues={unreadIssues}
        connected={connected}
        theme={theme}
        onTheme={applyTheme}
        onOpenPalette={() => setPaletteOpen(true)}
        onSignOut={signOut}
      >
        <div className="page-head">
          <div className="page-title">
            <span className="kicker">{meta.kicker}</span>
            <h1>{title}</h1>
            <p>{meta.description}</p>
          </div>
          <div className="page-actions">
            {page === 'feed' ? (
              <>
                <button className="btn btn-sm" type="button" onClick={refresh} disabled={refreshing} title="Refresh feed">
                  <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> Refresh
                </button>
                <button className="btn btn-primary" type="button" onClick={() => setAdding(true)}>
                  Watch repository
                </button>
              </>
            ) : null}
            {page === 'apps' && apps.length ? (
              <button className="btn btn-primary" type="button" onClick={() => setAdding(true)}>
                Watch repository
              </button>
            ) : null}
            {page === 'discover' ? (
              <button className="btn btn-sm" type="button" onClick={() => searchRepositories('search')} disabled={discoveryBusy}>
                <RefreshCw size={14} className={discoveryBusy ? 'spin' : ''} /> Refresh
              </button>
            ) : null}
          </div>
        </div>

        {notice ? (
          <div className="notice" style={{ marginBottom: 18 }}>
            <TriangleAlert size={15} />
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice('')} aria-label="Dismiss">
              ×
            </button>
          </div>
        ) : null}

        <div className="page-body">{body}</div>

        <footer className="page-footer">
          <span>
            <GitHubMark size={13} /> GitHub release monitoring
          </span>
          <span>Events update automatically · offline state is kept locally</span>
        </footer>
      </Shell>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        apps={apps}
        theme={theme}
        onTheme={applyTheme}
        onNavigate={(target, id) => {
          if (target === 'app-detail' && id) {
            openApp(id);
            return;
          }
          navigate(target);
        }}
        onAction={action => {
          if (action === 'watch') setAdding(true);
          if (action === 'refresh') refresh();
          if (action === 'theme') applyTheme(theme === 'light' ? 'dark' : 'light');
          if (action === 'signout') signOut();
        }}
      />

      <AddRepositoryDialog open={adding} onClose={() => setAdding(false)} onAdd={addRepository} existing={apps} />

    </>
  );
}

function PreviewRepository({ fullName, readOnly, watched, onBack, onWatch }) {
  const [state, setState] = useState({ app: null, releases: [], loading: true, error: '' });

  useEffect(() => {
    let active = true;
    const [owner, repo] = fullName.split('/');
    setState({ app: null, releases: [], loading: true, error: '' });
    Promise.all([
      api(`/api/github/user-repo?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`),
      api(`/api/github/user-repo/releases?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&perPage=100`),
    ])
      .then(([metadata, raw]) => {
        if (!active) return;
        const releases = (Array.isArray(raw) ? raw : []).map(item => ({
          id: String(item.id),
          name: item.name,
          tagName: item.tag_name,
          publishedAt: item.published_at,
          draft: item.draft,
          prerelease: item.prerelease,
          body: item.body,
          htmlUrl: item.html_url,
        }));
        setState({
          app: {
            id: '',
            name: metadata.name || repo,
            repoName: repo,
            repoOwner: owner,
            repoFullName: metadata.full_name || `${owner}/${repo}`,
            githubUrl: metadata.html_url || `https://github.com/${owner}/${repo}`,
            defaultBranch: metadata.default_branch,
            description: metadata.description,
            iconUrl: metadata.owner?.avatar_url,
            latestSeenTag: releases[0]?.tagName || '',
            lastCheckedAt: null,
          },
          releases,
          loading: false,
          error: '',
        });
      })
      .catch(issue => {
        if (active) setState({ app: null, releases: [], loading: false, error: issue.message || 'Could not load this repository.' });
      });
    return () => {
      active = false;
    };
  }, [fullName]);

  if (state.loading) return <LoadingLine>Loading repository…</LoadingLine>;
  if (state.error || !state.app) {
    return <EmptyState icon={TriangleAlert} title="Could not load this repository" description={state.error || 'GitHub did not return this repository.'} action={<button className="btn" type="button" onClick={onBack}>Go back</button>} />;
  }

  return (
    <RepositoryPage
      app={state.app}
      releases={state.releases}
      loading={false}
      onBack={onBack}
      onWatch={onWatch}
      watched={watched}
      ownedMode={!readOnly}
      readOnly={readOnly}
    />
  );
}
