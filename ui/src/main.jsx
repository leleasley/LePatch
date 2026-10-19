import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownRight, ArrowUpRight, Bell, Check, ChevronDown, CircleCheck, CircleDot, CircleHelp, Clock3, Compass, FileClock, FileCode2, Filter, Folder, GitBranch, GitPullRequest, Heart, Info, KeyRound, LayoutList, LoaderCircle, Menu, MessageSquare, MoreHorizontal, Palette, Plus, Radio, RefreshCw, Search, Trash2, TriangleAlert, Workflow, X } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import './style.css';
import './readme.css';
import './add-repo.css';
import './pwa.js';

function elapsed(value) {
  if (!value) return 'Never checked';
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  return `${Math.floor(minutes / 1440)} days ago`;
}
function shortName(name = '') { return name.split(/[- /]/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
function csrfToken() {
  const cookies = document.cookie.split('; ');
  const preferred = location.protocol === 'https:' ? '__Host-lepatch_csrf=' : 'lepatch_csrf=';
  const alternate = location.protocol === 'https:' ? 'lepatch_csrf=' : '__Host-lepatch_csrf=';
  const item = cookies.find(value => value.startsWith(preferred)) || cookies.find(value => value.startsWith(alternate));
  return item ? decodeURIComponent(item.split('=').slice(1).join('=')) : '';
}
function readSnapshot(key, fallback) {
  try { const value = localStorage.getItem(`lepatch:${key}`); return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}
function writeSnapshot(key, value) {
  try { localStorage.setItem(`lepatch:${key}`, JSON.stringify(value)); } catch { /* storage may be disabled or full */ }
}
function clearSnapshots() {
  try { for (const key of Object.keys(localStorage)) if (key.startsWith('lepatch:')) localStorage.removeItem(key); } catch { /* storage may be disabled */ }
}
function decodeBase64Url(value) { const normalized = value.replace(/-/g, '+').replace(/_/g, '/'); const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)); return Uint8Array.from(binary, char => char.charCodeAt(0)); }
function encodeBase64Url(value) { return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function publicKeyOptions(options, creation = false) {
  const key = { ...options, challenge: decodeBase64Url(options.challenge) };
  if (creation) { key.user = { ...options.user, id: decodeBase64Url(options.user.id) }; key.excludeCredentials = (options.excludeCredentials || []).map(item => ({ ...item, id: decodeBase64Url(item.id) })); }
  else key.allowCredentials = (options.allowCredentials || []).map(item => ({ ...item, id: decodeBase64Url(item.id) }));
  return key;
}
function serializeCredential(credential) {
  const response = { clientDataJSON: encodeBase64Url(credential.response.clientDataJSON) };
  if ('attestationObject' in credential.response) response.attestationObject = encodeBase64Url(credential.response.attestationObject);
  if ('authenticatorData' in credential.response) response.authenticatorData = encodeBase64Url(credential.response.authenticatorData);
  if ('signature' in credential.response) response.signature = encodeBase64Url(credential.response.signature);
  if ('userHandle' in credential.response) response.userHandle = credential.response.userHandle ? encodeBase64Url(credential.response.userHandle) : null;
  return { id: credential.id, rawId: encodeBase64Url(credential.rawId), type: credential.type, authenticatorAttachment: credential.authenticatorAttachment, response, clientExtensionResults: credential.getClientExtensionResults(), transports: credential.response.getTransports?.() || [] };
}

function App() {
  const initialParams = new URLSearchParams(location.search);
  const [authScreen, setAuthScreen] = useState(() => location.pathname === '/login' ? (initialParams.get('mfaToken') ? 'mfa' : 'login') : location.pathname === '/setup/mfa' ? 'setup' : location.pathname === '/setup' ? 'first-setup' : 'app');
  const [mfaToken, setMfaToken] = useState(() => initialParams.get('mfaToken') || '');
  const [setupToken, setSetupToken] = useState(() => initialParams.get('token') || initialParams.get('setupToken') || '');
  const [setupInfo, setSetupInfo] = useState(null);
  const [backupCodes, setBackupCodes] = useState([]);
  const [authNotice, setAuthNotice] = useState(initialParams.get('toast') === 'mfa-recovery-unavailable' ? 'MFA recovery is unavailable for this GitHub account. Use the account linked to LePatch.' : initialParams.get('toast') ? 'GitHub sign-in did not finish. Check the connection and try again.' : '');
  const [apps, setApps] = useState(() => readSnapshot('apps', []));
  const [feed, setFeed] = useState(() => readSnapshot('feed', []));
  const [stats, setStats] = useState(() => readSnapshot('stats', { total: 0, updates: 0, failed: 0, stale: 0 }));
  const [filter, setFilter] = useState('Recent');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(false);
  const [repo, setRepo] = useState('');
  const [repoChoice, setRepoChoice] = useState('');
  const [repoResults, setRepoResults] = useState([]);
  const [repoSearchBusy, setRepoSearchBusy] = useState(false);
  const [repoSearchError, setRepoSearchError] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [sponsoredRepoPanels, setSponsoredRepoPanels] = useState({});
  const [connected, setConnected] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('lepatch-theme') || 'midnight');
  const [themeMenu, setThemeMenu] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [checking, setChecking] = useState(null);
  const [page, setPage] = useState(() => { const path = location.pathname; return path.match(/^\/apps\/[^/]+\/releases\//) ? 'release-detail' : path.match(/^\/apps\/[^/]+/) ? 'app-detail' : path.startsWith('/your-repositories/') ? 'owned-repo' : path === '/your-repositories' ? 'owned-repos' : path.startsWith('/sponsors/') ? 'sponsor-detail' : path.startsWith('/github/') ? 'github-repo' : path === '/issues' ? 'issues' : path === '/notifications' ? 'notifications' : path === '/discover' ? 'discover' : path === '/apps' ? 'apps' : path === '/settings' ? 'settings' : path === '/account' ? 'account' : path === '/about' ? 'about' : 'feed'; });
  const [detailAppId, setDetailAppId] = useState(() => location.pathname.match(/^\/apps\/([^/]+)/)?.[1] || '');
  const [ownedRepo, setOwnedRepo] = useState(() => location.pathname.match(/^\/your-repositories\/([^/]+)\/([^/]+)/)?.slice(1).map(decodeURIComponent).join('/') || '');
  const [ownedRepos, setOwnedRepos] = useState([]);
  const [ownedReposError, setOwnedReposError] = useState('');
  const [sponsorLogin, setSponsorLogin] = useState('');
  const [previewRepo, setPreviewRepo] = useState(() => location.pathname.match(/^\/github\/([^/]+)\/([^/]+)/)?.slice(1).map(decodeURIComponent).join('/') || '');
  const [detailApp, setDetailApp] = useState(null);
  const [detailReleases, setDetailReleases] = useState([]);
  const [detailReleaseId, setDetailReleaseId] = useState(() => location.pathname.match(/^\/apps\/[^/]+\/releases\/([^/]+)/)?.[1] || '');
  const [detailLoading, setDetailLoading] = useState(false);
  const [discoveryMode, setDiscoveryMode] = useState('search');
  const [discoveryQuery, setDiscoveryQuery] = useState('');
  const [discoveryResults, setDiscoveryResults] = useState([]);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [discoveryError, setDiscoveryError] = useState('');
  const [notificationEvents, setNotificationEvents] = useState(() => readSnapshot('notification-events', []));
  const [notificationNotice, setNotificationNotice] = useState('');
  const [raisedIssues, setRaisedIssues] = useState(() => readSnapshot('raised-issues-open', []));
  const [issueState, setIssueState] = useState('open');
  const issueStateRef = useRef(issueState);
  issueStateRef.current = issueState;
  const [issueNotice, setIssueNotice] = useState('');
  const searchRef = useRef(null);
  const deleteAcks = useRef(new Map());

  const filteredApps = useMemo(() => apps.filter(app => `${app.name} ${app.repoFullName}`.toLowerCase().includes(query.toLowerCase())), [apps, query]);
  const refresh = async () => {
    setBusy(true);
    try {
      const options = { signal: AbortSignal.timeout(10000), cache: 'no-store' };
      const [dashboardResponse, appsResponse] = await Promise.all([fetch('/api/dashboard', options), fetch('/api/apps?perPage=50', options)]);
      if (dashboardResponse.status === 401 || appsResponse.status === 401) {
        clearSnapshots();
        setApps([]); setFeed([]); setStats({ total: 0, updates: 0, failed: 0, stale: 0 });
        setAuthScreen('login');
        history.replaceState({}, '', '/login');
        return;
      }
      if (!dashboardResponse.ok || !appsResponse.ok) throw new Error('Refresh failed');
      const dashboard = await dashboardResponse.json();
      const appData = await appsResponse.json();
      setStats(dashboard);
      setFeed(dashboard.recent || []);
      setApps(appData.apps || []);
      writeSnapshot('stats', dashboard);
      writeSnapshot('feed', dashboard.recent || []);
      writeSnapshot('apps', appData.apps || []);
      setNotice('');
      const sessionResponse = await fetch('/api/auth/session', options);
      if (sessionResponse.ok) {
        const session = await sessionResponse.json();
        setCurrentUser(session.user || null);
      }
    } catch {
      setNotice(connected ? 'Connection interrupted · showing the last saved data.' : 'LePatch is offline. Sign in when the connection returns to load your data.');
    } finally {
      setBusy(false);
    }
  };

  const loadRaisedIssues = async (state = issueState) => {
    try {
      const response = await fetch(`/api/issues/raised?state=${state}&perPage=100`, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (response.status === 401) { setIssueNotice('Connect and sign in with GitHub to see issues you have opened.'); return; }
      if (!response.ok) throw new Error('Issue request failed');
      const result = await response.json();
      setRaisedIssues(result.issues || []);
      writeSnapshot(`raised-issues-${state}`, result.issues || []);
      setIssueNotice('');
    } catch {
      const snapshot = readSnapshot(`raised-issues-${state}`, null);
      if (snapshot) setRaisedIssues(snapshot);
      setIssueNotice('Issue updates are unavailable right now. Showing the last saved list.');
    }
  };

  const loadNotifications = async () => {
    try {
      const response = await fetch('/api/notifications/history?perPage=50', { signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (!response.ok) throw new Error('Notification history is unavailable');
      const result = await response.json(); setNotificationEvents(result.events || []); writeSnapshot('notification-events', result.events || []); setNotificationNotice('');
    } catch { setNotificationEvents(readSnapshot('notification-events', [])); setNotificationNotice('Notification history is offline. Showing the last saved events.'); }
  };

  const navigate = target => {
    const next = target === 'issues' ? '/issues' : target === 'notifications' ? '/notifications' : target === 'discover' ? '/discover' : target === 'apps' ? '/apps' : target === 'owned-repos' ? '/your-repositories' : target === 'settings' ? '/settings' : target === 'account' ? '/account' : target === 'about' ? '/about' : target === 'feed' ? '/' : location.pathname;
    if (location.pathname !== next) history.pushState({}, '', next);
    setPage(target);
    setMobileNav(false);
  };
  const openApp = id => { setDetailAppId(id); setDetailApp(apps.find(app => app.id === id) || null); setDetailReleaseId(''); setNotice(''); setPage('app-detail'); history.pushState({}, '', `/apps/${encodeURIComponent(id)}`); window.scrollTo(0, 0); };
  const openRelease = id => { setDetailReleaseId(id); setPage('release-detail'); history.pushState({}, '', `/apps/${encodeURIComponent(detailAppId)}/releases/${encodeURIComponent(id)}`); window.scrollTo(0, 0); };
  const openOwnedRepo = repoName => { const [owner, name] = repoName.split('/'); setOwnedRepo(repoName); setPage('owned-repo'); history.pushState({}, '', `/your-repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`); window.scrollTo(0,0); };
  const openSponsor = login => { setSponsorLogin(login); setPage('sponsor-detail'); history.pushState({}, '', `/sponsors/${encodeURIComponent(login)}`); window.scrollTo(0,0); };
  const openGitHubRepo = fullName => { setPreviewRepo(fullName); setPage('github-repo'); history.pushState({}, '', `/github/${fullName.split('/').map(encodeURIComponent).join('/')}`); window.scrollTo(0,0); };

  const searchRepositories = async event => {
    event?.preventDefault();
    const q = discoveryQuery.trim();
    if (discoveryMode === 'search' && !q) return;
    setDiscoveryBusy(true); setDiscoveryError('');
    try {
      const params = new URLSearchParams({ perPage: '30' });
      if (q) params.set('q', q);
      const endpoint = discoveryMode === 'sponsored' ? '/api/github/sponsored' : '/api/github/search';
      const response = await fetch(`${endpoint}?${params}`, { signal: AbortSignal.timeout(12000), cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'GitHub search is unavailable.');
      setDiscoveryResults(result.items || []);
    } catch (error) { setDiscoveryError(error.message || 'Could not search GitHub.'); }
    finally { setDiscoveryBusy(false); }
  };

  useEffect(() => {
    if (['app', 'login', 'first-setup'].includes(authScreen)) {
      fetch('/api/setup/status', { signal: AbortSignal.timeout(8000), cache: 'no-store' }).then(async response => {
        if (!response.ok) throw new Error('Setup status unavailable');
        const status = await response.json();
        if (!status.setupComplete) { setAuthScreen('first-setup'); history.replaceState({}, '', '/setup'); return; }
        if (authScreen === 'app') refresh();
      }).catch(() => { if (authScreen === 'app') refresh(); });
    }
    const timer = authScreen === 'app' ? setInterval(refresh, 90000) : null;
    const hotkey = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', hotkey);
    const onPopState = () => {
      const params = new URLSearchParams(location.search);
      if (location.pathname === '/login') { setAuthScreen(params.get('mfaToken') ? 'mfa' : 'login'); setMfaToken(params.get('mfaToken') || ''); }
      else if (location.pathname === '/setup/mfa') { setAuthScreen('setup'); setSetupToken(params.get('token') || params.get('setupToken') || ''); }
      else if (location.pathname === '/setup') setAuthScreen('first-setup');
      else { const appMatch = location.pathname.match(/^\/apps\/([^/]+)(?:\/releases\/([^/]+))?/); const ownMatch=location.pathname.match(/^\/your-repositories\/([^/]+)\/([^/]+)/); const sponsorMatch=location.pathname.match(/^\/sponsors\/([^/]+)/); const ghRepoMatch=location.pathname.match(/^\/github\/([^/]+)\/([^/]+)/); setAuthScreen('app'); setDetailAppId(appMatch?.[1] || ''); setDetailReleaseId(appMatch?.[2] || ''); if(ownMatch)setOwnedRepo(ownMatch.slice(1).map(decodeURIComponent).join('/')); if(sponsorMatch)setSponsorLogin(decodeURIComponent(sponsorMatch[1])); if(ghRepoMatch)setPreviewRepo(ghRepoMatch.slice(1).map(decodeURIComponent).join('/')); setPage(appMatch ? appMatch[2] ? 'release-detail' : 'app-detail' : ownMatch?'owned-repo':sponsorMatch?'sponsor-detail':ghRepoMatch?'github-repo':location.pathname === '/your-repositories' ? 'owned-repos' : location.pathname === '/issues' ? 'issues' : location.pathname === '/notifications' ? 'notifications' : location.pathname === '/discover' ? 'discover' : location.pathname === '/apps' ? 'apps' : location.pathname === '/settings' ? 'settings' : location.pathname === '/account' ? 'account' : location.pathname === '/about' ? 'about' : 'feed'); }
    };
    window.addEventListener('popstate', onPopState);
    return () => { if (timer) clearInterval(timer); window.removeEventListener('keydown', hotkey); window.removeEventListener('popstate', onPopState); };
  }, [authScreen]);

  useEffect(() => { if (authScreen !== 'app') return; if (page === 'issues') { setRaisedIssues(readSnapshot(`raised-issues-${issueState}`, [])); loadRaisedIssues(issueState); } else if (page === 'notifications') loadNotifications(); else if (page === 'discover' && discoveryMode === 'sponsored' && !discoveryResults.length) searchRepositories(); }, [page, issueState, authScreen, discoveryMode]);
  useEffect(() => { if(page!=='owned-repos') return; let cancelled=false; setOwnedReposError(''); fetch('/api/github/user-repos?visibility=all&affiliation=owner&sort=updated&direction=desc&perPage=100',{cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not load your GitHub repositories.');if(!cancelled)setOwnedRepos(data);}).catch(e=>{if(!cancelled)setOwnedReposError(e.message||'Could not load your repositories.');}); return()=>{cancelled=true;}; },[page]);

  useEffect(() => {
    if (!['app-detail', 'release-detail'].includes(page) || !detailAppId) return;
    let cancelled = false;
    setDetailLoading(true);
    Promise.all([fetch(`/api/apps/${encodeURIComponent(detailAppId)}`, { cache: 'no-store' }), fetch(`/api/apps/${encodeURIComponent(detailAppId)}/releases?perPage=50`, { cache: 'no-store' })])
      .then(async ([appResponse, releasesResponse]) => {
        const appData = await appResponse.json();
        if (!appResponse.ok) throw new Error(appData.error || 'Could not load this repository.');
        const releasesData = releasesResponse.ok ? await releasesResponse.json() : { releases: [] };
        if (!cancelled) { setDetailApp(appData.app); setDetailReleases(releasesData.releases || []); if (!releasesResponse.ok) setNotice('Release history is temporarily unavailable.'); }
      }).catch(error => { if (!cancelled) setNotice(error.message || 'Could not load this repository.'); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [page, detailAppId]);

  useEffect(() => {
    if (!adding) return;
    const term = repo.trim();
    if (term.length < 2) { setRepoResults([]); setRepoSearchBusy(false); setRepoSearchError(''); return; }
    setRepoSearchBusy(true); setRepoSearchError('');
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/github/search?perPage=8&q=${encodeURIComponent(term)}`, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'GitHub search is unavailable.');
        setRepoResults(result.items || []);
      } catch (error) { setRepoSearchError(error.message || 'Could not search GitHub.'); setRepoResults([]); }
      finally { setRepoSearchBusy(false); }
    }, 320);
    return () => window.clearTimeout(timer);
  }, [adding, repo]);

  useEffect(() => { localStorage.setItem('lepatch-theme', theme); }, [theme]);

  useEffect(() => {
    if (authScreen !== 'setup' || !setupToken) return;
    const controller = new AbortController();
    fetch('/api/account/mfa/setup', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() }, body: JSON.stringify({ setupToken }) })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not start MFA setup'); setSetupInfo(data); setAuthNotice(''); })
      .catch(error => { if (!controller.signal.aborted) setAuthNotice(error.message || 'Could not start MFA setup. Sign in again.'); });
    return () => controller.abort();
  }, [authScreen, setupToken]);

  useEffect(() => {
    if (authScreen !== 'app') return undefined;
    const source = new EventSource('/api/events');
    const reload = () => refresh();
    ['watched-app.added', 'watched-app.updated', 'watched-app.removed', 'release.discovered', 'check.finished', 'state.refresh'].forEach(name => source.addEventListener(name, reload));
    source.addEventListener('raised-issue.updated', () => loadRaisedIssues(issueStateRef.current));
    source.addEventListener('raised-issue.comment', () => loadRaisedIssues(issueStateRef.current));
    source.addEventListener('notification.sent', () => loadNotifications());
    source.addEventListener('notification.failed', () => loadNotifications());
    source.addEventListener('watched-app.removed', event => {
      try { const id = JSON.parse(event.data).id; deleteAcks.current.get(id)?.(); deleteAcks.current.delete(id); } catch { /* ignore malformed event */ }
    });
    source.onopen = () => { setConnected(true); refresh(); if (location.pathname === '/issues') loadRaisedIssues(issueStateRef.current); };
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, [authScreen]);

  const removeApp = async id => {
    const removedApp = apps.find(app => app.id === id);
    if (!removedApp) return;
    setApps(current => { const next = current.filter(app => app.id !== id); writeSnapshot('apps', next); return next; });
    setStats(current => { const next = { ...current, total: Math.max(0, current.total - 1) }; writeSnapshot('stats', next); return next; });
    const eventSeen = new Promise(resolve => deleteAcks.current.set(id, resolve));
    try {
      const response = await fetch(`/api/apps/${id}`, { method: 'DELETE', credentials: 'same-origin', signal: AbortSignal.timeout(10000), headers: { 'X-CSRF-Token': csrfToken() } });
      if (!response.ok) throw new Error('Remove failed');
      // The normal path is acknowledged by watched-app.removed. The HTTP
      // response remains the bounded fallback while EventSource reconnects.
      await Promise.race([eventSeen, new Promise(resolve => setTimeout(resolve, 1400))]);
    } catch {
      if (deleteAcks.current.has(id)) {
        setApps(current => { if (current.some(app => app.id === id)) return current; const next = [...current, removedApp].sort((a, b) => a.name.localeCompare(b.name)); writeSnapshot('apps', next); return next; });
        setStats(current => { const next = { ...current, total: current.total + 1 }; writeSnapshot('stats', next); return next; });
        setNotice('Could not remove this repository. It has been restored.');
      }
    } finally {
      deleteAcks.current.delete(id);
    }
  };

  const addRepository = async fullName => {
    const name = String(fullName || '').trim();
    const parts = name.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    setAddBusy(true); setRepoSearchError('');
    try {
      const response = await fetch('/api/apps', { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() }, body: JSON.stringify({ repoFullName: name }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not add this repository.');
      const result = payload;
      setApps(current => { const next = [result.app, ...current]; writeSnapshot('apps', next); return next; });
      setStats(current => { const next = { ...current, total: current.total + 1 }; writeSnapshot('stats', next); return next; });
      setAdding(false);
      setRepo(''); setRepoChoice(''); setRepoResults([]); setRepoSearchError('');
      return true;
    } catch (error) { const message = error.message || 'Could not add this repository.'; setRepoSearchError(message); setNotice(message); return false; }
    finally { setAddBusy(false); }
  };
  const addApp = async event => { event.preventDefault(); await addRepository(repoChoice || repo); };
  const openAddRepository = () => { setRepo(''); setRepoChoice(''); setRepoResults([]); setRepoSearchError(''); setAdding(true); };
  const expandSponsoredRepos = async maintainer => {
    const current = sponsoredRepoPanels[maintainer.login];
    if (current?.open) { setSponsoredRepoPanels(value => ({ ...value, [maintainer.login]: { ...value[maintainer.login], open: false } })); return; }
    if (current?.items) { setSponsoredRepoPanels(value => ({ ...value, [maintainer.login]: { ...value[maintainer.login], open: true } })); return; }
    setSponsoredRepoPanels(value => ({ ...value, [maintainer.login]: { open: true, loading: true, items: [], error: '' } }));
    try {
      const response = await fetch(`/api/github/sponsored/${encodeURIComponent(maintainer.login)}/repos`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not verify sponsorship or load repositories.');
      setSponsoredRepoPanels(value => ({ ...value, [maintainer.login]: { open: true, loading: false, items: result.items || [], error: '' } }));
    } catch (error) { setSponsoredRepoPanels(value => ({ ...value, [maintainer.login]: { open: true, loading: false, items: [], error: error.message || 'Could not load this maintainer’s repositories.' } })); }
  };

  const checkApp = async id => {
    setChecking(id);
    try {
      const response = await fetch(`/api/apps/${id}/check`, { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'X-CSRF-Token': csrfToken() } });
      if (!response.ok) throw new Error('Check failed');
      setNotice('Release check queued. The feed will update when it finishes.');
    } catch { setNotice('Could not queue a release check. Try again in a moment.'); }
    finally { setChecking(null); }
  };

  const markIssueSeen = async id => {
    const previous = raisedIssues;
    const next = previous.map(issue => issue.id === id ? { ...issue, unreadCommentCount: 0 } : issue);
    setRaisedIssues(next);
    writeSnapshot(`raised-issues-${issueState}`, next);
    try {
      const response = await fetch(`/api/issues/raised/${id}/seen`, { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'X-CSRF-Token': csrfToken() } });
      if (!response.ok) throw new Error('Could not update issue state');
    } catch { setRaisedIssues(previous); writeSnapshot(`raised-issues-${issueState}`, previous); setIssueNotice('Could not mark this issue as read. Try again.'); }
  };

  const finishAuthentication = () => {
    setAuthScreen('app'); setAuthNotice(''); setMfaToken(''); setSetupToken(''); setSetupInfo(null); setBackupCodes([]);
    history.replaceState({}, '', '/');
    refresh();
  };
  const signOut = async () => {
    setAccountMenu(false);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', signal: AbortSignal.timeout(8000), headers: { 'X-CSRF-Token': csrfToken() } });
      if (!response.ok) throw new Error('Sign out failed');
      setCurrentUser(null);
      clearSnapshots(); setApps([]); setFeed([]); setRaisedIssues([]); setNotificationEvents([]);
      setConnected(false);
      setAuthScreen('login');
      history.replaceState({}, '', '/login');
    } catch {
      setNotice('Could not sign out. Check your connection and try again.');
    }
  };
  const submitLogin = async (email, password) => {
    setAuthNotice('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sign in failed');
      if (result.mfaSetupRequired) { setSetupToken(result.mfaSetupToken); setAuthScreen('setup'); history.pushState({}, '', `/setup/mfa?token=${encodeURIComponent(result.mfaSetupToken)}`); return; }
      if (result.mfaRequired) { setMfaToken(result.mfaToken); setAuthScreen('mfa'); history.pushState({}, '', `/login?mfaToken=${encodeURIComponent(result.mfaToken)}`); return; }
      finishAuthentication();
    } catch (error) { setAuthNotice(error.message || 'Could not reach LePatch. Try again.'); }
  };
  const submitFirstSetup = async (email, password, confirmPassword) => {
    setAuthNotice('');
    try {
      const response = await fetch('/api/setup/complete', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() }, body: JSON.stringify({ email, password, confirmPassword, appUrl: location.origin }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not finish setup');
      await submitLogin(email, password);
    } catch (error) { setAuthNotice(error.message || 'Could not finish initial setup.'); }
  };
  const submitMFA = async code => {
    setAuthNotice('');
    try {
      const payload = code.trim().length === 6 ? { mfaToken, code: code.trim() } : { mfaToken, backupCode: code.trim() };
      const response = await fetch('/api/auth/mfa-verify', { method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Verification failed');
      finishAuthentication();
    } catch (error) { setAuthNotice(error.message || 'Could not verify that code.'); }
  };
  const submitMFASetup = async code => {
    setAuthNotice('');
    try {
      const response = await fetch('/api/account/mfa/verify', { method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() }, body: JSON.stringify({ setupToken, code: code.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not verify authenticator');
      setBackupCodes(result.backupCodes || []);
    } catch (error) { setAuthNotice(error.message || 'Could not verify authenticator code.'); }
  };
  const submitPasskey = async () => {
    setAuthNotice('');
    try {
      if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('Passkeys are not supported by this browser.');
      const optionsResponse = await fetch('/api/webauthn/auth/options', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error || 'Could not start passkey sign in.');
      const credential = await navigator.credentials.get({ publicKey: publicKeyOptions(options.publicKey) });
      if (!credential) throw new Error('Passkey sign in was cancelled.');
      const response = await fetch(`/api/webauthn/auth/verify?flowId=${encodeURIComponent(options.flowId)}`, { method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() }, body: JSON.stringify(serializeCredential(credential)) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Passkey sign in failed.');
      if (result.mfaSetupRequired) { setSetupToken(result.mfaSetupToken); setAuthScreen('setup'); history.pushState({}, '', `/setup/mfa?token=${encodeURIComponent(result.mfaSetupToken)}`); return; }
      if (result.mfaRequired) { setMfaToken(result.mfaToken); setAuthScreen('mfa'); history.pushState({}, '', `/login?mfaToken=${encodeURIComponent(result.mfaToken)}`); return; }
      finishAuthentication();
    } catch (error) { setAuthNotice(error.message || 'Passkey sign in failed.'); }
  };

  if (authScreen !== 'app') return <AuthView screen={authScreen} notice={authNotice} setupInfo={setupInfo} backupCodes={backupCodes} onLogin={submitLogin} onPasskey={submitPasskey} onFirstSetup={submitFirstSetup} onMFA={submitMFA} onSetup={submitMFASetup} onComplete={finishAuthentication} onBack={() => { setAuthScreen('login'); setAuthNotice(''); history.replaceState({}, '', '/login'); }} />;

  const themes = [{ id: 'midnight', label: 'Midnight', swatch: '#101719' }, { id: 'paper', label: 'Paper', swatch: '#f3f6f5' }, { id: 'oled', label: 'OLED', swatch: '#030607' }, { id: 'moss', label: 'Moss', swatch: '#141a15' }];
  const activeRelease = detailReleases.find(release => release.id === detailReleaseId);
  const pageTitle = page === 'owned-repo' ? ownedRepo : page === 'github-repo' ? previewRepo : page === 'owned-repos' ? 'Your repositories' : page === 'sponsor-detail' ? `@${sponsorLogin}` : page === 'app-detail' || page === 'release-detail' ? (page === 'release-detail' ? (activeRelease?.name || activeRelease?.tagName || 'Release details') : (detailApp?.name || detailApp?.repoFullName || 'Repository')) : page === 'issues' ? 'Raised issues' : page === 'notifications' ? 'Notifications' : page === 'apps' ? 'Watched apps' : page === 'discover' ? (discoveryMode === 'sponsored' ? 'Sponsored maintainers' : 'Repository search') : page === 'settings' ? 'Settings' : page === 'account' ? 'Your account' : page === 'about' ? 'About LePatch' : 'Release feed';
  const pageDescription = page === 'app-detail' ? (detailApp?.description || 'Release history and monitoring settings for this repository.') : page === 'release-detail' ? 'Release notes from a repository you follow.' : page === 'issues' ? 'Issues you opened across GitHub, with new comments and state changes.' : page === 'notifications' ? 'Recent release alerts sent to your notification channels.' : page === 'apps' ? 'Repositories LePatch checks for new releases.' : page === 'sponsor-detail' ? 'Browse repositories you can access through your GitHub sponsorship.' : page === 'github-repo' || page === 'owned-repo' ? 'Repository overview, releases, files, activity, and issues.' : page === 'owned-repos' ? 'Repositories connected to your GitHub account.' : page === 'discover' ? 'Find GitHub projects to follow.' : page === 'settings' ? 'Manage notification integrations and your workspace appearance.' : page === 'account' ? 'Profile, sign-in methods, and active sessions.' : page === 'about' ? 'App version, project details, and available updates.' : 'What changed across the projects you follow.';
  return <div className={`app-frame theme-${theme}`}>
    {mobileNav && <button className="drawer-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><img src="/assets/Logo.png" alt=""/><span>LePatch</span><button className="workspace-switch" aria-label="Workspace"><ChevronDown size={14}/></button></div>
      <div className="sidebar-label">TRACK</div>
      <nav className="primary-nav">
        <a className={page === 'feed' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('feed')}><LayoutList size={16}/><span>Release feed</span><kbd>⌘1</kbd></a>
        <a className={page === 'apps' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('apps')}><Radio size={16}/><span>Watched apps</span><small>{apps.length}</small></a>
        <a className={page === 'issues' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('issues')}><CircleDot size={16}/><span>Raised issues</span>{raisedIssues.some(issue => issue.unreadCommentCount > 0) && <small>{raisedIssues.reduce((sum, issue) => sum + issue.unreadCommentCount, 0)}</small>}</a>
        <a className={page === 'notifications' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('notifications')}><Bell size={16}/><span>Notifications</span></a>
      </nav>
      <div className="sidebar-label explore-label">DISCOVER</div>
      <nav><a className={page === 'discover' && discoveryMode === 'search' ? 'nav-item active' : 'nav-item'} onClick={() => { setDiscoveryMode('search'); setDiscoveryResults([]); navigate('discover'); }}><Search size={16}/><span>Repository search</span></a><a className={page === 'discover' && discoveryMode === 'sponsored' ? 'nav-item active' : 'nav-item'} onClick={() => { setDiscoveryMode('sponsored'); setDiscoveryQuery(''); setDiscoveryResults([]); navigate('discover'); }}><Compass size={16}/><span>Sponsored maintainers</span></a><a className={page.startsWith('owned-') ? 'nav-item active' : 'nav-item'} onClick={() => navigate('owned-repos')}><Folder size={16}/><span>Your repositories</span></a></nav>
      <div className="sidebar-label">ACCOUNT</div><nav><a className={page === 'account' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('account')}><CircleHelp size={16}/><span>Your account</span></a></nav>
      {currentUser?.role === 'administrator' && <><div className="sidebar-label">WORKSPACE</div><nav><a className={page === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('settings')}><Palette size={16}/><span>Settings</span></a></nav></>}
      <div className="sidebar-bottom">
        <nav><a className={page === 'about' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('about')}><Info size={16}/><span>About LePatch</span></a></nav>
        <div className="scheduler"><div className="scheduler-mark"><Activity size={14}/></div><div><b>Live updates</b><span>{connected ? 'Connected' : 'Reconnecting'}</span></div><i className={connected ? 'status-led' : 'status-led amber'}/></div>
        <div className="account-row"><div className="account-mark">{shortName(currentUser?.name || currentUser?.email || 'LP')}</div><div className="account-copy"><b>{currentUser?.name || currentUser?.email || 'LePatch account'}</b><span>{currentUser?.role || 'Signed in'}</span></div><div className="account-control"><button className="account-menu" aria-label="Account menu" aria-expanded={accountMenu} onClick={() => setAccountMenu(value => !value)}><MoreHorizontal size={16}/></button>{accountMenu && <div className="account-popover"><div className="account-popover-user">{currentUser?.email || 'Account'}</div><button onClick={() => { setAccountMenu(false); navigate('account'); }}>Your account <CircleHelp size={14}/></button><button onClick={() => { setAccountMenu(false); setThemeMenu(true); }}>Appearance <Palette size={14}/></button><button onClick={signOut}>Sign out <ArrowUpRight size={14}/></button></div>}</div></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation"><Menu size={19}/></button><div className="breadcrumbs"><span>LePatch</span><b>/</b><strong>{pageTitle}</strong></div><div className="top-actions"><span className="connection"><i className={connected ? 'status-led' : 'status-led amber'}/>{connected ? 'Live' : 'Reconnecting'}</span><button className="icon-button" aria-label="Help"><CircleHelp size={16}/></button><div className="theme-picker"><button className="theme-toggle" onClick={() => setThemeMenu(!themeMenu)} aria-label="Choose theme" aria-expanded={themeMenu}><Palette size={15}/></button>{themeMenu && <div className="theme-menu">{themes.map(item => <button className={theme === item.id ? 'theme-option current' : 'theme-option'} key={item.id} onClick={() => { setTheme(item.id); setThemeMenu(false); }}><i style={{ '--swatch': item.swatch }}/><span>{item.label}</span>{theme === item.id && <span className="theme-check">✓</span>}</button>)}</div>}</div></div></header>

      <div className="page-wrap">
        <div className="page-heading"><div><div className="kicker"><span className="kicker-mark"/> {page === 'feed' ? 'RELEASE MONITOR' : page === 'issues' ? 'GITHUB ACTIVITY' : page === 'notifications' ? 'DELIVERY LOG' : page === 'discover' ? 'DISCOVER GITHUB' : page === 'settings' ? 'WORKSPACE' : 'REPOSITORIES'}</div><div className="title-line"><h1>{pageTitle}</h1></div><p>{pageDescription}</p></div><div className="heading-actions">{page === 'feed' ? <><div className="sync-copy"><span>WATCHING</span><b>{stats.total ?? apps.length} repositories</b></div><button className="button button-quiet" onClick={refresh} title="Refresh feed"><RefreshCw size={14} className={busy ? 'spin' : ''}/></button><button className="button button-primary" onClick={openAddRepository}><Plus size={15}/> Watch repository</button></> : page === 'issues' ? <><div className="sync-copy"><span>ISSUE UPDATES</span><b>Checks every 10 minutes</b></div><button className="button button-quiet" onClick={() => loadRaisedIssues()} title="Refresh issues"><RefreshCw size={14}/></button></> : page === 'discover' ? <button className="button button-quiet" onClick={searchRepositories} title="Refresh search"><RefreshCw size={14} className={discoveryBusy ? 'spin' : ''}/></button> : page === 'apps' ? <button className="button button-primary" onClick={openAddRepository}><Plus size={15}/> Watch repository</button> : page === 'notifications' ? <><div className="sync-copy"><span>DELIVERY STATUS</span><b>Queued events retry automatically</b></div><button className="button button-quiet" onClick={loadNotifications} title="Refresh notifications"><RefreshCw size={14}/></button></> : null}</div></div>

        {notice && <div className="notice"><TriangleAlert size={14}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14}/></button></div>}

        {page === 'about' ? <AboutView/> : page === 'account' ? <AccountView user={currentUser} onUser={setCurrentUser} onSignOut={signOut}/> : page === 'app-detail' || page === 'release-detail' ? <RepositoryDetailView app={detailApp} releases={detailReleases} selectedRelease={activeRelease} releaseMode={page === 'release-detail'} loading={detailLoading} onBack={() => navigate('apps')} onOpenRelease={openRelease} onCheck={() => detailApp && checkApp(detailApp.id)} checking={checking === detailAppId}/> : page === 'feed' ? <div className="workspace-grid">
          <section className="feed-section">
            <div className="section-head"><div className="section-title"><h2>Latest releases</h2><span>{feed.length}</span></div><div className="feed-tools"><button className="filter-select" onClick={() => setFilter(filter === 'Recent' ? 'All releases' : 'Recent')}><Filter size={13}/>{filter}<ChevronDown size={13}/></button><button className="view-button selected" title="List view"><LayoutList size={14}/></button><button className="view-button" title="Activity view"><Activity size={14}/></button></div></div>
            <div className="feed-date"><span>RECENT ACTIVITY</span><i/></div>
            <div className="release-list">{feed.length ? feed.slice(0, 10).map((item, index) => <ReleaseRow key={item.id} item={item} index={index}/>) : <div className="empty-feed"><FileClock size={20}/><b>No releases yet</b><span>When a watched project publishes a release, it will appear here.</span></div>}</div>
            <button className="history-link">Open release history <ArrowUpRight size={13}/></button>
          </section>

          <aside className="watch-section">
            <div className="watch-head"><div><div className="section-title"><h2>Watching</h2><span>{apps.length}</span></div><p>Repositories on your list</p></div><button className="add-square" onClick={openAddRepository} aria-label="Watch repository"><Plus size={16}/></button></div>
            <label className="search-field"><Search size={14}/><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a repository"/><kbd>⌘ K</kbd></label>
            <div className="watch-columns"><span>REPOSITORY</span><span>LAST RELEASE</span></div>
            <div className="watch-list">{filteredApps.map(app => <div className="watch-row clickable-row" key={app.id} onClick={() => openApp(app.id)} onKeyDown={event => { if (event.key === 'Enter') openApp(app.id); }} role="link" tabIndex={0}>
              <RepoIcon name={app.name} iconUrl={app.iconUrl} extraClass=""/>
              <div className="watch-info"><div className="watch-name"><b>{app.name}</b>{app.updateAvailable && <i className="unseen-dot" title="New release"/>}</div><span>{app.repoFullName}</span></div>
              <div className="watch-version"><b>{app.latestSeenTag || '—'}</b><span>{elapsed(app.lastCheckedAt)}</span></div>
              <div className="watch-actions"><button onClick={() => checkApp(app.id)} title="Check for releases" aria-label="Check releases">{checking === app.id ? <LoaderCircle size={14} className="spin"/> : <RefreshCw size={13}/>}</button><button onClick={() => removeApp(app.id)} title="Remove from watch list" aria-label="Remove repository"><Trash2 size={13}/></button></div>
            </div>)}{!filteredApps.length && <div className="no-results">No repositories match that search.</div>}</div>
            <button className="watch-all" onClick={() => navigate('apps')}>Manage watched apps <ArrowUpRight size={13}/></button>
            <div className="polling-note"><span className={connected ? 'status-led' : 'status-led amber'}/><span>Release checks run in the background</span></div>
          </aside>
        </div> : page === 'issues' ? <RaisedIssuesView issues={raisedIssues} state={issueState} setState={setIssueState} notice={issueNotice} clearNotice={() => setIssueNotice('')} onSeen={markIssueSeen}/> : page === 'notifications' ? <NotificationView events={notificationEvents} notice={notificationNotice}/> : page === 'apps' ? <WatchedAppsView apps={apps} onCheck={checkApp} onRemove={removeApp} checking={checking} onAdd={openAddRepository} onOpen={openApp}/> : page === 'discover' ? <DiscoveryView mode={discoveryMode} query={discoveryQuery} setQuery={setDiscoveryQuery} onSearch={searchRepositories} results={discoveryResults} apps={apps} loading={discoveryBusy} error={discoveryError} onWatch={addRepository} sponsoredRepoPanels={sponsoredRepoPanels} onExpandSponsored={expandSponsoredRepos} onOpenSponsor={openSponsor} onOpenRepo={openGitHubRepo}/> : page === 'owned-repos' ? <OwnedRepositoriesView repos={ownedRepos} error={ownedReposError} onOpen={openOwnedRepo} onWatch={addRepository} apps={apps}/> : page === 'owned-repo' ? <GitHubRepositoryWorkspace key={`owned:${ownedRepo}`} fullName={ownedRepo} ownedMode onBack={() => navigate('owned-repos')} onWatch={addRepository}/> : page === 'github-repo' ? <GitHubRepositoryWorkspace key={`preview:${previewRepo}`} fullName={previewRepo} readOnly onBack={() => history.back()} onWatch={addRepository}/> : page === 'sponsor-detail' ? <SponsoredMaintainerPage login={sponsorLogin} panel={sponsoredRepoPanels[sponsorLogin]} onLoad={() => expandSponsoredRepos({login:sponsorLogin})} onWatch={addRepository} apps={apps} onOpenRepo={openGitHubRepo} onBack={() => navigate('discover')}/> : <SettingsView onTheme={setTheme} theme={theme}/ >}
        <footer className="page-footer"><span><GitBranch size={12}/> GitHub release monitoring</span><span>Events update automatically <span className="footer-separator">·</span> Offline state is kept locally</span></footer>
      </div>
    </main>

    {adding && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setAdding(false); }}><form className="modal add-repository-modal" onSubmit={addApp}><div className="modal-top"><div className="modal-icon"><GitBranch size={17}/></div><button className="modal-close" type="button" onClick={() => setAdding(false)} aria-label="Close"><X size={17}/></button></div><h2>Watch a repository</h2><p>Search GitHub, choose the right repository, then add it to your release feed.</p><label htmlFor="add-repo-search">SEARCH GITHUB <span>OWNER / REPOSITORY</span></label><div className="repo-search-input"><Search size={17}/><input id="add-repo-search" autoComplete="off" placeholder="Try radarr/radarr" value={repo} onChange={event => { setRepo(event.target.value); setRepoChoice(''); }}/>{repoSearchBusy && <LoaderCircle size={16} className="spin"/>}</div>{repoSearchError && <div className="repo-search-error"><TriangleAlert size={14}/>{repoSearchError}</div>}<div className="repo-search-results" aria-live="polite">{repoResults.map(item => <button className={repoChoice === item.full_name ? 'repo-search-result selected' : 'repo-search-result'} type="button" key={item.id} onClick={() => { setRepoChoice(item.full_name); setRepo(item.full_name); }}><img src={item.owner?.avatar_url || ''} alt="" loading="lazy"/><span className="repo-search-main"><b>{item.full_name}</b><small>{item.description || 'No description provided.'}</small><span className="repo-search-meta"><span>★ {Number(item.stargazers_count || 0).toLocaleString()}</span>{item.language && <span>{item.language}</span>}</span></span>{repoChoice === item.full_name ? <Check size={17}/> : <ArrowUpRight size={15}/>}</button>)}{repo.trim().length >= 2 && !repoSearchBusy && !repoResults.length && !repoSearchError && <div className="repo-search-empty">No repositories found. You can still add an exact <code>owner/repository</code> name.</div>}</div><div className="modal-actions"><button className="button button-quiet" type="button" disabled={addBusy} onClick={() => setAdding(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={addBusy || !(repoChoice || repo).includes('/')}>{addBusy ? <LoaderCircle size={15} className="spin"/> : <Plus size={15}/>}Watch repository</button></div></form></div>}
  </div>;
}

function AuthView({ screen, notice, setupInfo, backupCodes, onLogin, onPasskey, onFirstSetup, onMFA, onSetup, onComplete, onBack }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const submit = async event => {
    event.preventDefault(); setWorking(true);
    try {
      if (screen === 'first-setup') await onFirstSetup(email, password, confirmPassword);
      else if (screen === 'login') await onLogin(email, password);
      else if (screen === 'mfa') await onMFA(code);
      else await onSetup(code);
    } finally { setWorking(false); }
  };
  const copyCodes = async () => { await navigator.clipboard?.writeText(backupCodes.join('\n')); setCopied(true); };
  return <div className="auth-screen">
    <section className="auth-card">
      <div className="auth-brand"><img src="/assets/Logo.png" alt=""/><span>LePatch</span></div>
      {screen === 'first-setup' && <><div className="auth-kicker">FIRST RUN</div><h1>Set up your workspace</h1><p>Create the initial administrator. You’ll set up two factor sign in next.</p>{notice && <div className="auth-notice"><TriangleAlert size={14}/>{notice}</div>}<form onSubmit={submit} className="auth-form"><label>Administrator email<input required autoComplete="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com"/></label><label>Password<input required minLength={10} autoComplete="new-password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 10 characters"/></label><label>Confirm password<input required minLength={10} autoComplete="new-password" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Enter it again"/></label><button className="button button-primary auth-submit" disabled={working}>{working ? <LoaderCircle size={15} className="spin"/> : null}Create administrator</button></form></>}
      {screen === 'login' && <>
        <div className="auth-kicker">RELEASE MONITOR</div><h1>Welcome back</h1><p>Sign in to your LePatch workspace.</p>
        {notice && <div className="auth-notice"><TriangleAlert size={14}/>{notice}</div>}
        <form onSubmit={submit} className="auth-form"><label>Email address<input required autoComplete="username" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com"/></label><label>Password<input required autoComplete="current-password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Your password"/></label><button className="button button-primary auth-submit" disabled={working}>{working ? <LoaderCircle size={15} className="spin"/> : null}Sign in</button></form>
        <button className="button button-quiet auth-submit" onClick={onPasskey}><KeyRound size={14}/>Sign in with a passkey</button><div className="auth-divider"><span>or continue with</span></div><a className="oauth-button" href="/api/auth/github?mode=login"><GitBranch size={15}/> GitHub</a><a className="auth-recovery-link" href="/api/auth/github?mode=mfa-recovery">Lost your authenticator? Recover with linked GitHub</a>
      </>}
      {screen === 'mfa' && <><div className="auth-kicker">ACCOUNT SECURITY</div><h1>Verify it’s you</h1><p>Enter the six digit code from your authenticator, or a recovery code.</p>{notice && <div className="auth-notice"><TriangleAlert size={14}/>{notice}</div>}<form onSubmit={submit} className="auth-form"><label>Authentication code<input required autoFocus autoComplete="one-time-code" inputMode="numeric" value={code} onChange={event => setCode(event.target.value)} placeholder="000000"/></label><button className="button button-primary auth-submit" disabled={working}>{working ? <LoaderCircle size={15} className="spin"/> : null}Verify and sign in</button></form><button className="auth-back" onClick={onBack}>Back to sign in</button></>}
      {screen === 'setup' && backupCodes.length === 0 && <><div className="auth-kicker">FIRST SIGN IN</div><h1>Set up two factor sign in</h1><p>LePatch requires an authenticator app to protect your account.</p>{notice && <div className="auth-notice"><TriangleAlert size={14}/>{notice}</div>}{!setupInfo ? <div className="auth-loading"><LoaderCircle size={16} className="spin"/> Preparing your setup key…</div> : <><div className="setup-key"><span>SETUP KEY</span><code>{setupInfo.secret}</code><small>Add this key in your authenticator app. It stays on this device.</small></div><form onSubmit={submit} className="auth-form"><label>Six digit code<input required autoComplete="one-time-code" inputMode="numeric" value={code} onChange={event => setCode(event.target.value)} placeholder="000000"/></label><button className="button button-primary auth-submit" disabled={working}>{working ? <LoaderCircle size={15} className="spin"/> : null}Verify and enable MFA</button></form></>}</>}
      {screen === 'setup' && backupCodes.length > 0 && <><div className="auth-kicker">SAVE THESE CODES</div><h1>Keep recovery codes safe</h1><p>Each code works once if you lose access to your authenticator.</p><div className="backup-code-list">{backupCodes.map(item => <code key={item}>{item}</code>)}</div><button className="button button-quiet auth-submit" onClick={copyCodes}><Check size={14}/>{copied ? 'Copied' : 'Copy recovery codes'}</button><button className="button button-primary auth-submit" onClick={onComplete}>Continue to LePatch <ArrowUpRight size={14}/></button></>}
      <div className="auth-foot"><span>Secure sign in</span><i/> GitHub connected account and MFA protected</div>
    </section>
  </div>;
}

function ReleaseRow({ item, index }) {
  const appName = item.appName || item.watchedApp?.name || item.repoFullName;
  const repoName = item.repoFullName || item.watchedApp?.repoFullName;
  return <article className="release-row"><div className="timeline"><div className="timeline-node">{index === 0 ? <ArrowDownRight size={13}/> : <GitBranch size={12}/>}</div></div><RepoIcon name={appName} iconUrl={item.watchedApp?.iconUrl} extraClass="feed-monogram"/><div className="release-content"><div className="release-top"><div className="project-label"><b>{appName}</b><span>{repoName}</span></div><a className="release-version" href={item.htmlUrl} target="_blank" rel="noreferrer">{item.tagName}<ArrowUpRight size={12}/></a></div><h3>{item.name || `${appName} ${item.tagName}`}</h3><p>{item.changelogSummary || 'A new release is available.'}</p><div className="release-foot"><span><Clock3 size={11}/>{elapsed(item.detectedAt)}</span><i/><span>Release published</span></div></div></article>;
}

function WatchedAppsView({ apps, onCheck, onRemove, checking, onAdd, onOpen }) {
  return <section className="apps-page">
    <div className="apps-page-head"><div><h2>All repositories</h2><span>{apps.length} watched</span></div><button className="button button-primary" onClick={onAdd}><Plus size={14}/> Add repository</button></div>
    <div className="apps-page-list">{apps.length ? apps.map(app => <article className="apps-page-row clickable-row" key={app.id} onClick={() => onOpen(app.id)} onKeyDown={event => { if (event.key === 'Enter') onOpen(app.id); }} role="link" tabIndex={0}>
      <RepoIcon name={app.name} iconUrl={app.iconUrl}/><div className="apps-page-name"><b>{app.name}</b><a href={app.githubUrl} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>{app.repoFullName}<ArrowUpRight size={11}/></a>{app.description && <p>{app.description}</p>}</div>
      <div className="apps-page-meta"><span>Latest release</span><b>{app.latestSeenTag || 'No release detected'}</b></div><div className="apps-page-meta"><span>Last checked</span><b>{elapsed(app.lastCheckedAt)}</b></div>
      <div className="apps-page-actions"><button onClick={event => { event.stopPropagation(); onCheck(app.id); }} disabled={checking === app.id} title="Check releases" aria-label={`Check ${app.repoFullName}`}>{checking === app.id ? <LoaderCircle size={14} className="spin"/> : <RefreshCw size={14}/>}</button><button onClick={event => { event.stopPropagation(); onRemove(app.id); }} title="Remove repository" aria-label={`Remove ${app.repoFullName}`}><Trash2 size={14}/></button></div>
    </article>) : <div className="apps-empty"><GitBranch size={19}/><b>No repositories watched yet</b><span>Add a GitHub repository and LePatch will watch for new releases.</span><button className="button button-primary" onClick={onAdd}><Plus size={14}/> Watch first repository</button></div>}</div>
  </section>;
}

function RepositoryDetailView({ app, releases, selectedRelease, releaseMode, loading, onBack, onReleaseBack, onOpenRelease, onCheck, checking, ownedMode = false, readOnly = false, onWatch }) {
  const [section, setSection] = useState('overview');
  const [readme, setReadme] = useState(null);
  const [readmeBusy, setReadmeBusy] = useState(false);
  const [commits, setCommits] = useState([]);
  const [commitsBusy, setCommitsBusy] = useState(false);
  const [files, setFiles] = useState([]);
  const [filePath, setFilePath] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filesBusy, setFilesBusy] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [pulls, setPulls] = useState([]);
  const [pullsBusy, setPullsBusy] = useState(false);
  const [branches, setBranches] = useState([]);
  const [branchesBusy, setBranchesBusy] = useState(false);
  const [actions, setActions] = useState([]);
  const [actionsBusy, setActionsBusy] = useState(false);
  const [issues, setIssues] = useState([]);
  const [issuesBusy, setIssuesBusy] = useState(false);
  const [issueState, setIssueState] = useState('open');
  const [trackedIssues, setTrackedIssues] = useState(() => new Set());
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [issueComments, setIssueComments] = useState([]);
  const [issueForm, setIssueForm] = useState({ title: '', body: '' });
  const [commentDraft, setCommentDraft] = useState('');
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [readmeError, setReadmeError] = useState('');
  const [commitError, setCommitError] = useState('');
  const [issueError, setIssueError] = useState('');
  const [editingFile, setEditingFile] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [savingFile, setSavingFile] = useState(false);
  const [commitNotice, setCommitNotice] = useState('');

  const requestJSON = async (path, options = {}) => {
    const response = await fetch(path, { cache: 'no-store', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrfToken() } : {}), ...(options.headers || {}) } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'GitHub request failed.');
    return data;
  };
  const loadRepositoryIssues = async () => {
    if (!app) return;
    setIssuesBusy(true); setIssueError('');
    try {
      const params = new URLSearchParams({ owner: app.repoOwner, repo: app.repoName, perPage: '50', state: issueState, sort: 'updated', direction: 'desc' });
      const [result, trackedResult] = await Promise.all([requestJSON(`/api/github/issues?${params}`), requestJSON('/api/github/tracked-issues')]);
      setIssues((result || []).filter(issue => !issue.pull_request));
      setTrackedIssues(new Set((trackedResult.issues || []).filter(issue => issue.owner.toLowerCase() === app.repoOwner.toLowerCase() && issue.repo.toLowerCase() === app.repoName.toLowerCase()).map(issue => issue.issueNumber)));
    } catch (error) { setIssueError(error.message || 'Could not load repository issues.'); }
    finally { setIssuesBusy(false); }
  };
  useEffect(() => {
    if (!app) return;
    if (section === 'overview' && readme === null) {
      const params = new URLSearchParams({ owner: app.repoOwner, repo: app.repoName });
      if (app.defaultBranch) params.set('ref', app.defaultBranch);
      setReadmeBusy(true); setReadmeError('');
      requestJSON(`/api/github/readme?${params}`).then(setReadme).catch(error => setReadmeError(error.message || 'README is unavailable.')).finally(() => setReadmeBusy(false));
    } else if (section === 'commits' && !commits.length && !commitsBusy) {
      setCommitsBusy(true); setCommitError('');
      requestJSON(`/api/github/commits?owner=${encodeURIComponent(app.repoOwner)}&repo=${encodeURIComponent(app.repoName)}&perPage=50`).then(result => setCommits(Array.isArray(result) ? result : [])).catch(error => setCommitError(error.message || 'Could not load recent commits.')).finally(() => setCommitsBusy(false));
    } else if (section === 'files' && !files.length && !filesBusy) {
      loadFiles('');
    } else if (section === 'pulls' && !pulls.length && !pullsBusy) {
      setPullsBusy(true); requestJSON(`/api/github/pulls?owner=${encodeURIComponent(app.repoOwner)}&repo=${encodeURIComponent(app.repoName)}&state=all&perPage=50&sort=updated&direction=desc`).then(result => setPulls(Array.isArray(result) ? result : [])).catch(error => setFilesError(error.message || 'Could not load pull requests.')).finally(() => setPullsBusy(false));
    } else if (section === 'branches' && !branches.length && !branchesBusy) {
      setBranchesBusy(true); requestJSON(`/api/github/branches?owner=${encodeURIComponent(app.repoOwner)}&repo=${encodeURIComponent(app.repoName)}&perPage=100`).then(result => setBranches(Array.isArray(result) ? result : [])).catch(error => setFilesError(error.message || 'Could not load branches.')).finally(() => setBranchesBusy(false));
    } else if (section === 'actions' && !actions.length && !actionsBusy) {
      setActionsBusy(true); requestJSON(`/api/github/actions?owner=${encodeURIComponent(app.repoOwner)}&repo=${encodeURIComponent(app.repoName)}&perPage=50`).then(result => setActions(result.workflow_runs || [])).catch(error => setFilesError(error.message || 'Could not load workflow runs.')).finally(() => setActionsBusy(false));
    } else if (section === 'issues') loadRepositoryIssues();
  }, [app?.id, section, issueState]);
  const loadFiles = async path => {
    if (!app) return;
    setFilesBusy(true); setFilesError(''); setSelectedFile(null);
    try {
      const params = new URLSearchParams({ owner: app.repoOwner, repo: app.repoName });
      if (path) params.set('path', path);
      if (app.defaultBranch) params.set('ref', app.defaultBranch);
      const result = await requestJSON(`/api/github/contents?${params}`);
      setFiles(Array.isArray(result) ? result : []); setFilePath(path);
    } catch (error) { setFilesError(error.message || 'Could not load repository files.'); }
    finally { setFilesBusy(false); }
  };
  const openFile = async file => {
    if (file.type === 'dir') { loadFiles(file.path); return; }
    setFilesBusy(true); setFilesError('');
    try {
      const params = new URLSearchParams({ owner: app.repoOwner, repo: app.repoName, path: file.path });
      if (app.defaultBranch) params.set('ref', app.defaultBranch);
      const data = await requestJSON(`/api/github/file-content?${params}`); setSelectedFile(data);
    } catch (error) { setFilesError(error.message || 'Could not load this file.'); }
    finally { setFilesBusy(false); }
  };
  useEffect(() => {
    if (!app || !selectedIssue) return;
    let active = true;
    const params = new URLSearchParams({ owner: app.repoOwner, repo: app.repoName, issueNumber: String(selectedIssue.number), perPage: '100' });
    const refreshComments = () => requestJSON(`/api/github/issue-comments?${params}`).then(data => { if (active) setIssueComments(Array.isArray(data) ? data : []); }).catch(error => { if (active) setDetailError(error.message || 'Could not load issue updates.'); });
    setDetailBusy(true); setDetailError('');
    refreshComments().finally(() => { if (active) setDetailBusy(false); });
    const timer = window.setInterval(refreshComments, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [app?.id, selectedIssue?.number]);
  const submitIssue = async event => {
    event.preventDefault(); if (!app || !issueForm.title.trim()) return;
    setDetailBusy(true); setIssueError('');
    try { const created = await requestJSON('/api/github/create-issue', { method: 'POST', body: JSON.stringify({ owner: app.repoOwner, repo: app.repoName, title: issueForm.title, body: issueForm.body }) }); setIssueForm({ title: '', body: '' }); setShowIssueForm(false); setSelectedIssue(created); await loadRepositoryIssues(); }
    catch (error) { setIssueError(error.message || 'Could not create issue.'); }
    finally { setDetailBusy(false); }
  };
  const toggleTrack = async issue => {
    const tracked = trackedIssues.has(issue.number); setDetailBusy(true); setIssueError('');
    try { await requestJSON('/api/github/track-issue', { method: tracked ? 'DELETE' : 'POST', body: JSON.stringify({ owner: app.repoOwner, repo: app.repoName, issueNumber: issue.number, issueTitle: issue.title }) }); setTrackedIssues(previous => { const next = new Set(previous); tracked ? next.delete(issue.number) : next.add(issue.number); return next; }); }
    catch (error) { setIssueError(error.message || 'Could not update issue tracking.'); }
    finally { setDetailBusy(false); }
  };
  const submitComment = async event => {
    event.preventDefault(); if (!app || !selectedIssue || !commentDraft.trim()) return;
    setDetailBusy(true); setDetailError('');
    try { await requestJSON('/api/github/comment-issue', { method: 'POST', body: JSON.stringify({ owner: app.repoOwner, repo: app.repoName, issueNumber: selectedIssue.number, body: commentDraft }) }); setCommentDraft(''); const params = new URLSearchParams({ owner: app.repoOwner, repo: app.repoName, issueNumber: String(selectedIssue.number), perPage: '100' }); const comments = await requestJSON(`/api/github/issue-comments?${params}`); setIssueComments(Array.isArray(comments) ? comments : []); }
    catch (error) { setDetailError(error.message || 'Could not post comment.'); }
    finally { setDetailBusy(false); }
  };
  const changeIssueState = async () => {
    if (!app || !selectedIssue) return;
    const state = selectedIssue.state === 'open' ? 'closed' : 'open'; setDetailBusy(true); setDetailError('');
    try { const updated = await requestJSON('/api/github/close-issue', { method: 'POST', body: JSON.stringify({ owner: app.repoOwner, repo: app.repoName, issueNumber: selectedIssue.number, state }) }); setSelectedIssue(updated); await loadRepositoryIssues(); }
    catch (error) { setDetailError(error.message || 'Could not update this issue.'); }
    finally { setDetailBusy(false); }
  };
  if (loading && !app) return <section className="repo-detail"><div className="repo-detail-skeleton"/><div className="repo-detail-skeleton short"/><div className="repo-detail-skeleton"/></section>;
  if (!app) return <section className="repo-detail"><button className="button button-quiet" onClick={onBack}>Back to watched apps</button><div className="apps-empty"><TriangleAlert size={20}/><b>Repository unavailable</b><span>It may have been removed or you may have lost access.</span></div></section>;
  return <section className="repo-detail">
    <button className="detail-back" onClick={releaseMode ? (onReleaseBack || (() => history.back())) : onBack}><ArrowDownRight size={15}/>{releaseMode ? 'Release history' : ownedMode ? 'Your repositories' : readOnly ? 'Sponsored repositories' : 'Watched apps'}</button>
    {releaseMode && selectedRelease ? <>
      <div className="detail-release-heading"><div className="release-pill">{selectedRelease.draft ? 'Draft' : selectedRelease.prerelease ? 'Pre-release' : 'Release'}</div><h2>{selectedRelease.name || selectedRelease.tagName}</h2><code>{selectedRelease.tagName}</code><span>{selectedRelease.publishedAt ? new Date(selectedRelease.publishedAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'Publication date unavailable'}</span></div>
      {selectedRelease.changelogSummary && <div className="release-summary"><b>Release summary</b><p>{selectedRelease.changelogSummary}</p></div>}
      {selectedRelease.body ? <MarkdownView source={selectedRelease.body} baseURL={selectedRelease.htmlUrl || app?.githubUrl} className="release-markdown"/> : <div className="release-markdown"><p>No release notes were published.</p></div>}
      <a className="button button-primary detail-github-link" href={selectedRelease.htmlUrl} target="_blank" rel="noreferrer">View on GitHub <ArrowUpRight size={14}/></a>
    </> : <>
      <div className="repo-hero"><RepoIcon name={app.name} iconUrl={app.iconUrl}/><div className="repo-hero-copy"><div className="kicker">{ownedMode ? 'YOUR REPOSITORY' : readOnly ? 'GITHUB REPOSITORY' : 'WATCHED REPOSITORY'}</div><h2>{app.name}</h2><a href={app.githubUrl} target="_blank" rel="noreferrer">{app.repoFullName}<ArrowUpRight size={13}/></a></div>{!ownedMode && !readOnly ? <button className="button button-primary repo-check" onClick={onCheck} disabled={checking}>{checking ? <LoaderCircle size={15} className="spin"/> : <RefreshCw size={15}/>} Check now</button> : onWatch ? <button className="button button-primary repo-check" onClick={() => onWatch(app.repoFullName)}><Plus size={15}/> Watch repository</button> : null}</div>
      {app.description && <p className="repo-description">{app.description}</p>}
      <div className="repo-stats"><div><span>LATEST RELEASE</span><b>{app.latestSeenTag || 'No release yet'}</b></div><div><span>LAST CHECKED</span><b>{elapsed(app.lastCheckedAt)}</b></div><div><span>RELEASES TRACKED</span><b>{releases.length}</b></div></div>
      <div className="repository-tabs" role="tablist" aria-label="Repository sections">{[['overview','Overview'],['releases','Releases'],['files','Files'],['commits','Commits'],['pulls','Pull requests'],['issues','Issues'],['branches','Branches'],['actions','Actions']].map(([id,label]) => <button key={id} role="tab" aria-selected={section===id} className={section===id?'active':''} onClick={() => { setSection(id); setSelectedIssue(null); setFilesError(''); }}>{label}{id === 'releases' ? ` · ${releases.length}` : ''}</button>)}</div>
      {section === 'overview' && <div className="repository-overview">
        <div className="detail-section-head readme-section-head"><div><h3>README</h3><span>Project documentation from GitHub</span></div><a href={`${app.githubUrl}#readme`} target="_blank" rel="noreferrer">Open on GitHub <ArrowUpRight size={13}/></a></div>
        {readmeBusy ? <div className="detail-empty"><LoaderCircle className="spin" size={18}/><span>Loading README…</span></div> : readmeError ? <div className="detail-empty"><TriangleAlert size={18}/><b>README unavailable</b><span>{readmeError}</span></div> : readme ? <MarkdownView source={readme.content || ''} baseURL={readme.downloadUrl || readme.htmlUrl || app.githubUrl}/> : <div className="detail-empty"><FileClock size={20}/><b>No README found</b><span>This repository does not publish a README.</span></div>}
      </div>}
      {section === 'releases' && <section className="repository-data-section"><div className="detail-section-head"><div><h3>Release history</h3><span>Releases detected for this repository</span></div><span>{releases.length} releases</span></div>{releases.length ? <div className="detail-release-list">{releases.map(release => <button className="detail-release-row" key={release.id} onClick={() => onOpenRelease?.(release.id)}><span className="release-dot"/><span className="detail-release-copy"><b>{release.name || release.tagName}</b><small>{release.publishedAt ? new Date(release.publishedAt).toLocaleDateString() : 'Date unavailable'}{release.draft ? ' · Draft' : release.prerelease ? ' · Pre-release' : ''}</small></span><code>{release.tagName}</code><ArrowUpRight size={15}/></button>)}</div> : <div className="detail-empty"><FileClock size={20}/><b>No releases found</b><span>LePatch will show release history here after its next check.</span></div>}</section>}
      {section === 'files' && <section className="repository-data-section"><div className="detail-section-head"><div><h3>{selectedFile ? selectedFile.path : 'Repository files'}</h3><span>{selectedFile ? `Default branch · ${selectedFile.sha?.slice(0, 8) || 'file'}` : 'Browse the source tree'}</span></div><div className="file-toolbar">{selectedFile && ownedMode && !readOnly && !editingFile && <button className="button button-primary" onClick={() => { setEditedContent(selectedFile.content || ''); setEditingFile(true); }}>Edit file</button>}{selectedFile ? <button className="button button-quiet" onClick={() => {setSelectedFile(null);setEditingFile(false);}}>Back to files</button> : filePath ? <button className="button button-quiet" onClick={() => loadFiles(filePath.split('/').slice(0,-1).join('/'))}>Up one level</button> : null}</div></div>{filesError && <div className="notice"><TriangleAlert size={14}/>{filesError}</div>}{commitNotice && <div className="settings-message"><Check size={14}/>{commitNotice}</div>}{filesBusy ? <div className="detail-empty"><LoaderCircle className="spin" size={18}/><span>Loading repository content…</span></div> : selectedFile ? editingFile ? <form className="file-edit-form" onSubmit={async event => {event.preventDefault();setSavingFile(true);setFilesError('');try{await requestJSON('/api/github/commit-file',{method:'POST',body:JSON.stringify({owner:app.repoOwner,repo:app.repoName,path:selectedFile.path,content:editedContent,message:commitMessage,sha:selectedFile.sha,branch:app.defaultBranch})});setCommitNotice(`Committed ${selectedFile.path} to ${app.defaultBranch || 'the default branch'}.`);setCommitMessage('');setEditingFile(false);const params=new URLSearchParams({owner:app.repoOwner,repo:app.repoName,path:selectedFile.path});if(app.defaultBranch)params.set('ref',app.defaultBranch);setSelectedFile(await requestJSON(`/api/github/file-content?${params}`));}catch(error){setFilesError(error.message || 'Could not commit this file.');}finally{setSavingFile(false);}}}><label>File contents<textarea value={editedContent} onChange={event=>setEditedContent(event.target.value)} rows="20" spellCheck="false"/></label><label>Commit message<input required maxLength={200} value={commitMessage} onChange={event=>setCommitMessage(event.target.value)} placeholder="Describe this change"/></label><div><button type="button" className="button button-quiet" onClick={()=>setEditingFile(false)}>Cancel</button><button className="button button-primary" disabled={savingFile||!commitMessage.trim()}>{savingFile?<LoaderCircle size={14} className="spin"/>:null}Commit to {app.defaultBranch || 'default branch'}</button></div></form> : (/\.md$/i.test(selectedFile.name || selectedFile.path) ? <MarkdownView source={selectedFile.content || ''} baseURL={selectedFile.downloadUrl || app.githubUrl}/> : <pre className="repository-file-content"><code>{selectedFile.content || 'This file is empty or binary.'}</code></pre>) : <div className="repository-file-list">{files.map(file => <button className="repository-file-row" key={file.path} onClick={() => openFile(file)}><span className="repository-file-icon">{file.type === 'dir' ? <Folder size={16}/> : <FileCode2 size={16}/>}</span><b>{file.name}</b><span>{file.type === 'dir' ? 'Folder' : file.size ? `${Number(file.size).toLocaleString()} bytes` : 'File'}</span><ArrowUpRight size={14}/></button>)}</div>}</section>}
      {section === 'pulls' && <section className="repository-data-section"><div className="detail-section-head"><div><h3>Pull requests</h3><span>Open and recently closed changes</span></div><a className="repo-tab-external" href={`${app.githubUrl}/pulls`} target="_blank" rel="noreferrer">Open on GitHub <ArrowUpRight size={13}/></a></div>{filesError && <div className="notice"><TriangleAlert size={14}/>{filesError}</div>}{pullsBusy ? <div className="detail-empty"><LoaderCircle className="spin" size={18}/><span>Loading pull requests…</span></div> : pulls.length ? <div className="repository-aux-list">{pulls.map(pull => <a className="repository-aux-row" key={pull.id} href={pull.html_url} target="_blank" rel="noreferrer"><GitPullRequest size={17}/><span><b>{pull.title}</b><small>#{pull.number} · {pull.user?.login || 'Contributor'} · {elapsed(pull.updated_at)}</small></span><i className={pull.state === 'open' ? 'aux-state open' : 'aux-state'}>{pull.merged_at ? 'Merged' : pull.state}</i><ArrowUpRight size={14}/></a>)}</div> : <div className="detail-empty"><GitPullRequest size={18}/><b>No pull requests found</b><span>Pull request activity will appear here.</span></div>}</section>}
      {section === 'branches' && <section className="repository-data-section"><div className="detail-section-head"><div><h3>Branches</h3><span>Branches in this repository</span></div></div>{filesError && <div className="notice"><TriangleAlert size={14}/>{filesError}</div>}{branchesBusy ? <div className="detail-empty"><LoaderCircle className="spin" size={18}/><span>Loading branches…</span></div> : branches.length ? <div className="repository-aux-list">{branches.map(branch => <div className="repository-aux-row branch-row" key={branch.name}><GitBranch size={17}/><span><b>{branch.name}</b><small>{branch.commit?.sha?.slice(0,12) || 'Latest commit unavailable'}</small></span>{branch.name === app.defaultBranch && <i className="aux-state open">Default</i>}</div>)}</div> : <div className="detail-empty"><GitBranch size={18}/><b>No branches found</b><span>Branch information is currently unavailable.</span></div>}</section>}
      {section === 'actions' && <section className="repository-data-section"><div className="detail-section-head"><div><h3>Workflow runs</h3><span>Recent GitHub Actions activity</span></div><a className="repo-tab-external" href={`${app.githubUrl}/actions`} target="_blank" rel="noreferrer">Open on GitHub <ArrowUpRight size={13}/></a></div>{filesError && <div className="notice"><TriangleAlert size={14}/>{filesError}</div>}{actionsBusy ? <div className="detail-empty"><LoaderCircle className="spin" size={18}/><span>Loading workflow runs…</span></div> : actions.length ? <div className="repository-aux-list">{actions.map(run => <a className="repository-aux-row" key={run.id} href={run.html_url} target="_blank" rel="noreferrer"><Workflow size={17}/><span><b>{run.display_title || run.name || 'Workflow run'}</b><small>{run.head_branch || 'Default branch'} · {run.event || 'event'} · {elapsed(run.updated_at)}</small></span><i className={`aux-state ${run.conclusion === 'success' ? 'open' : ''}`}>{run.status === 'completed' ? run.conclusion : run.status}</i><ArrowUpRight size={14}/></a>)}</div> : <div className="detail-empty"><Workflow size={18}/><b>No workflow runs found</b><span>This repository has no recent Actions runs.</span></div>}</section>}
      {section === 'commits' && <section className="repository-data-section"><div className="detail-section-head"><div><h3>Recent commits</h3><span>Latest changes pushed to the default branch</span></div></div>{commitError && <div className="notice"><TriangleAlert size={14}/>{commitError}</div>}{commitsBusy ? <div className="detail-empty"><LoaderCircle className="spin" size={18}/><span>Loading commits…</span></div> : commits.length ? <div className="commit-list">{commits.map(commit => <article className="commit-row" key={commit.sha}>{commit.author?.avatar_url ? <img src={commit.author.avatar_url} alt="" loading="lazy" onError={event=>{event.currentTarget.style.display='none';}}/> : <div className="commit-avatar-fallback">{shortName(commit.commit?.author?.name || 'Git')}</div>}<div className="commit-copy"><a href={commit.html_url} target="_blank" rel="noreferrer">{(commit.commit?.message || 'Commit').split('\n')[0]} <ArrowUpRight size={12}/></a><span><b>{commit.author?.login || commit.commit?.author?.name || 'Unknown contributor'}</b> committed {commit.commit?.author?.date ? elapsed(commit.commit.author.date) : 'recently'}</span></div><code>{(commit.sha || '').slice(0,7)}</code></article>)}</div> : <div className="detail-empty"><GitBranch size={18}/><b>No commits found</b><span>Commit history will appear here when GitHub is available.</span></div>}</section>}
      {section === 'issues' && <section className="repository-data-section"><div className="detail-section-head"><div><h3>{selectedIssue ? `Issue #${selectedIssue.number}` : 'Repository issues'}</h3><span>{selectedIssue ? 'Discussion and updates' : 'Browse, track, and raise GitHub issues'}</span></div>{selectedIssue ? <button className="button button-quiet" onClick={() => setSelectedIssue(null)}>Back to issues</button> : <button className="button button-primary" onClick={() => setShowIssueForm(value=>!value)}><Plus size={14}/> New issue</button>}</div>
        {issueError && <div className="notice"><TriangleAlert size={14}/>{issueError}</div>}
        {showIssueForm && !selectedIssue && <form className="repo-issue-form" onSubmit={submitIssue}><label>Title<input required maxLength={256} value={issueForm.title} onChange={event=>setIssueForm({...issueForm,title:event.target.value})} placeholder="A clear summary"/></label><label>Description<textarea rows="6" value={issueForm.body} onChange={event=>setIssueForm({...issueForm,body:event.target.value})} placeholder="What happened, and what did you expect?"/></label><div><button type="button" className="button button-quiet" onClick={()=>setShowIssueForm(false)}>Cancel</button><button className="button button-primary" disabled={detailBusy||!issueForm.title.trim()}>{detailBusy?<LoaderCircle size={14} className="spin"/>:<Plus size={14}/>}Create issue</button></div></form>}
        {selectedIssue ? <div className="repository-issue-detail"><div className="repository-issue-meta"><span className={selectedIssue.state==='open'?'issue-state is-open':'issue-state is-closed'}>{selectedIssue.state==='open'?'Open':'Closed'}</span><span>Opened by {selectedIssue.user?.login || 'GitHub user'}</span><span>{selectedIssue.created_at ? new Date(selectedIssue.created_at).toLocaleString() : ''}</span><a href={selectedIssue.html_url} target="_blank" rel="noreferrer">View on GitHub <ArrowUpRight size={12}/></a></div><article className="repository-issue-body">{selectedIssue.body ? <MarkdownView source={selectedIssue.body} baseURL={selectedIssue.html_url || app.githubUrl}/> : <p>No description provided.</p>}</article><div className="detail-section-head"><div><h3>Updates</h3><span>{issueComments.length} comments · refreshes every minute</span></div><button className="button button-quiet" disabled={detailBusy} onClick={changeIssueState}>{detailBusy?<LoaderCircle size={13} className="spin"/>:null}{selectedIssue.state==='open'?'Close issue':'Reopen issue'}</button></div>{detailError && <div className="notice"><TriangleAlert size={14}/>{detailError}</div>}{detailBusy && !issueComments.length ? <div className="detail-empty"><LoaderCircle className="spin" size={18}/><span>Loading issue updates…</span></div> : <div className="issue-comment-list">{issueComments.map(comment=><article className="issue-comment" key={comment.id}>{comment.user?.avatar_url ? <img src={comment.user.avatar_url} alt="" loading="lazy"/> : <div className="commit-avatar-fallback">{shortName(comment.user?.login || 'Git')}</div>}<div><b>{comment.user?.login || 'Contributor'} <span>{comment.created_at ? elapsed(comment.created_at) : ''}</span></b><MarkdownView source={comment.body || ''} baseURL={selectedIssue.html_url || app.githubUrl}/></div></article>)}</div>}<form className="repo-comment-form" onSubmit={submitComment}><label htmlFor="repo-comment">Add a comment</label><textarea id="repo-comment" rows="4" value={commentDraft} onChange={event=>setCommentDraft(event.target.value)} placeholder="Share an update…"/><div><button className="button button-primary" disabled={detailBusy||!commentDraft.trim()}>{detailBusy?<LoaderCircle size={14} className="spin"/>:<MessageSquare size={14}/>}Comment</button></div></form></div> : <><div className="issue-filter-row">{[['open','Open'],['closed','Closed'],['all','All']].map(([id,label])=><button key={id} className={issueState===id?'active':''} onClick={()=>setIssueState(id)}>{label}</button>)}</div>{issuesBusy ? <div className="detail-empty"><LoaderCircle className="spin" size={18}/><span>Loading issues…</span></div> : issues.length ? <div className="repository-issue-list">{issues.map(issue=><article className="repository-issue-row" key={issue.id}>{issue.user?.avatar_url ? <img src={issue.user.avatar_url} alt="" loading="lazy"/> : <div className="commit-avatar-fallback">{shortName(issue.user?.login || 'Git')}</div>}<button className="repository-issue-title" onClick={()=>setSelectedIssue(issue)}><b>{issue.title}</b><span>#{issue.number} opened by {issue.user?.login || 'unknown'} · {elapsed(issue.updated_at)}</span></button><button className={trackedIssues.has(issue.number)?'track-issue tracked':'track-issue'} onClick={()=>toggleTrack(issue)} disabled={detailBusy}>{trackedIssues.has(issue.number)?'Tracking':'Track'}</button></article>)}</div> : <div className="detail-empty"><CircleDot size={18}/><b>No issues found</b><span>There are no {issueState==='all'?'':issueState+' '}issues in this repository.</span></div>}</>}
      </section>}
    </>}
  </section>;
}

function markdownURL(value, baseURL, image = false) {
  try {
    const parsed = new URL(value, baseURL || location.href);
    if (image ? parsed.protocol === 'https:' : ['https:', 'http:', 'mailto:'].includes(parsed.protocol)) return parsed.href;
  } catch { /* invalid README links are rendered as text */ }
  return '';
}

function MarkdownInline({ text, baseURL }) {
  const token = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*(.+?)\*\*|\*(.+?)\*/g;
  const result = [];
  let last = 0;
  let match;
  while ((match = token.exec(text)) !== null) {
    if (match.index > last) result.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      const src = markdownURL(match[2].split(/\s+"/)[0].replace(/"$/, ''), baseURL, true);
      result.push(src ? <img className="readme-image" key={match.index} src={src} alt={match[1]} loading="lazy"/> : match[1]);
    } else if (match[3] !== undefined) {
      const href = markdownURL(match[4].split(/\s+"/)[0].replace(/"$/, ''), baseURL);
      result.push(href ? <a key={match.index} href={href} target={href.startsWith('mailto:') ? undefined : '_blank'} rel="noreferrer">{match[3]}</a> : match[3]);
    } else if (match[5] !== undefined) result.push(<code key={match.index}>{match[5]}</code>);
    else if (match[6] !== undefined) result.push(<strong key={match.index}>{match[6]}</strong>);
    else result.push(<em key={match.index}>{match[7]}</em>);
    last = token.lastIndex;
  }
  if (last < text.length) result.push(text.slice(last));
  return result;
}

const readmeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'picture', 'source', 'img', 'details', 'summary', 'kbd'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] || []), 'className', 'align'],
    a: [...(defaultSchema.attributes?.a || []), 'href', 'target', 'rel'],
    img: [...(defaultSchema.attributes?.img || []), 'src', 'alt', 'title', 'width', 'height'],
    source: [...(defaultSchema.attributes?.source || []), 'srcSet', 'srcset', 'media', 'type'],
    p: [...(defaultSchema.attributes?.p || []), 'align'],
  },
};
function MarkdownView({ source, baseURL, className = '' }) {
  const resolve = value => markdownURL(value, baseURL, false);
  const resolveImage = value => markdownURL(value, baseURL, true);
  const isBadge = value => /(?:shields\.io|badge\.svg|\/backers\/badge|\/sponsors\/badge|\/megasponsors\/badge|build\/status)/i.test(String(value || ''));
  return <div className={`readme-markdown ${className}`}><Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, readmeSchema]]} components={{
    a: ({ href, children, ...props }) => <a href={resolve(href)} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>,
    img: ({ src, alt, ...props }) => <img className={isBadge(src) ? 'readme-image readme-badge' : 'readme-image'} src={resolveImage(src)} alt={alt || ''} loading="lazy" {...props}/>,
    source: ({ srcSet, srcset, ...props }) => <source srcSet={resolveImage(srcSet || srcset)} {...props}/>,
    picture: ({ ...props }) => <picture className="readme-picture" {...props}/>,
    table: ({ ...props }) => <div className="readme-table-wrap"><table {...props}/></div>,
    details: ({ ...props }) => <details className="readme-details" {...props}/>,
  }}>{String(source || '')}</Markdown></div>;
}

function OwnedRepositoriesView({repos,error,onOpen,onWatch,apps}) {
  const watched=new Set(apps.map(item=>item.repoFullName?.toLowerCase()));
  return <section className="discover-page"><div className="discover-result-head"><h2>Repositories you own</h2><span>{Array.isArray(repos)?repos.length:0}</span></div>{error&&<div className="notice"><TriangleAlert size={14}/>{error}</div>}{Array.isArray(repos)&&repos.length?<div className="discover-results">{repos.map(repo=><article className="discover-result" key={repo.id}><img src={repo.owner?.avatar_url||''} alt=""/><div className="discover-result-main"><button className="sponsor-name-link" onClick={()=>onOpen(repo.full_name)}>{repo.full_name}<ArrowUpRight size={12}/></button><p>{repo.description||'No description provided.'}</p><div className="discover-meta"><span>{repo.private?'Private':'Public'}</span>{repo.language&&<span>{repo.language}</span>}<span>★ {Number(repo.stargazers_count||0).toLocaleString()}</span></div></div><button className="button button-quiet" onClick={()=>onWatch(repo.full_name)} disabled={watched.has(repo.full_name?.toLowerCase())}>{watched.has(repo.full_name?.toLowerCase())?'Watching':'Watch'}</button></article>)}</div>:<div className="discover-empty"><Folder size={18}/><b>{error?'Could not load repositories':'No repositories available'}</b><span>Connect GitHub with repository access to browse your files.</span></div>}</section>;
}

function GitHubRepositoryWorkspace({fullName,ownedMode=false,readOnly=false,onBack,onWatch}) {
  const [owner,repo]=fullName.split('/'); const [app,setApp]=useState(null); const [releases,setReleases]=useState([]); const [selectedRelease,setSelectedRelease]=useState(null); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  useEffect(()=>{let active=true;setLoading(true);setError('');Promise.all([fetch(`/api/github/user-repo?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,{cache:'no-store'}),fetch(`/api/github/user-repo/releases?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&perPage=100`,{cache:'no-store'})]).then(async ([metaResponse,releasesResponse])=>{const metadata=await metaResponse.json();if(!metaResponse.ok)throw new Error(metadata.error||'Could not load repository.');const raw=releasesResponse.ok?await releasesResponse.json():[];const mapped=(Array.isArray(raw)?raw:[]).map(item=>({id:String(item.id),name:item.name,tagName:item.tag_name,publishedAt:item.published_at,draft:item.draft,prerelease:item.prerelease,body:item.body,htmlUrl:item.html_url}));if(active){setApp({id:'',name:metadata.name||repo,repoName:repo,repoOwner:owner,repoFullName:metadata.full_name||`${owner}/${repo}`,githubUrl:metadata.html_url||`https://github.com/${owner}/${repo}`,defaultBranch:metadata.default_branch,description:metadata.description,iconUrl:metadata.owner?.avatar_url,stars:metadata.stargazers_count,private:metadata.private,latestSeenTag:mapped[0]?.tagName||'',lastCheckedAt:null});setReleases(mapped);}}).catch(issue=>{if(active)setError(issue.message||'Could not load repository.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[fullName]);
  if(error&&!loading)return <section className="repo-detail"><button className="button button-quiet" onClick={onBack}>Back</button><div className="apps-empty"><TriangleAlert size={20}/><b>Could not load this repository</b><span>{error}</span></div></section>;
  const openRelease=id=>setSelectedRelease(releases.find(item=>item.id===String(id))||null);
  return <RepositoryDetailView app={app} releases={releases} selectedRelease={selectedRelease} releaseMode={Boolean(selectedRelease)} loading={loading} onBack={onBack} onReleaseBack={()=>setSelectedRelease(null)} onOpenRelease={openRelease} ownedMode={ownedMode} readOnly={readOnly} onWatch={onWatch}/>;
}

function SponsoredMaintainerPage({login,panel,onLoad,onWatch,apps,onOpenRepo,onBack}) {
  useEffect(()=>{if(!panel?.items&&!panel?.loading)onLoad();},[login]); const watched=new Set(apps.map(item=>item.repoFullName?.toLowerCase()));
  return <section className="discover-page"><div className="sponsor-profile-actions"><span>Repositories available through your active sponsorship</span><div><a className="button button-quiet" href={`https://github.com/${encodeURIComponent(login)}`} target="_blank" rel="noreferrer">GitHub profile <ArrowUpRight size={13}/></a><button className="button button-quiet" onClick={onBack}>Back to maintainers</button></div></div>{panel?.loading?<div className="detail-empty"><LoaderCircle className="spin"/>Checking sponsorship and loading repositories…</div>:panel?.error?<div className="notice"><TriangleAlert size={14}/>{panel.error}</div>:<><div className="discover-result-head"><h2>Repositories</h2><span>{panel?.items?.length||0}</span></div><p className="sponsor-private-hint">Private repositories appear here only after the owner grants your GitHub account access and GitHub confirms it.</p><div className="discover-results">{(panel?.items||[]).map(repo=><article className="discover-result sponsored-page-repo" key={repo.id}><img src={repo.owner?.avatar_url || `https://github.com/${encodeURIComponent(login)}.png`} alt="" loading="lazy"/><div className="discover-result-main"><button className="sponsor-name-link" onClick={()=>onOpenRepo(repo.full_name)}>{repo.full_name}<ArrowUpRight size={12}/></button><p>{repo.description||'No description provided.'}</p><div className="discover-meta"><span>{repo.private?'Private':'Public'}</span>{repo.language&&<span>{repo.language}</span>}</div></div><button className="button button-primary" disabled={watched.has(repo.full_name?.toLowerCase())} onClick={()=>onWatch(repo.full_name)}>{watched.has(repo.full_name?.toLowerCase())?'Watching':'Watch'}</button></article>)}</div>{!panel?.items?.length&&<div className="detail-empty"><Heart size={18}/><b>No repositories are visible to this account</b><span>GitHub may not have granted private repository access to your linked account.</span></div>}</>}</section>;
}

function DiscoveryView({ mode, query, setQuery, onSearch, results, apps, loading, error, onWatch, sponsoredRepoPanels, onExpandSponsored, onOpenSponsor, onOpenRepo }) {
  const watched = new Set(apps.map(app => app.repoFullName?.toLowerCase()));
  if (mode === 'sponsored') return <section className="discover-page">
    <div className="discover-result-head"><h2>People you sponsor</h2><span>{results.length} maintainers</span></div>
    {error && <div className="notice"><TriangleAlert size={14}/><span>{error}</span></div>}
    {results.length ? <div className="discover-results">{results.map(person => <article className="discover-result" key={person.id || person.login}>
      {person.avatar_url ? <img src={person.avatar_url} alt="" loading="lazy"/> : <div className="sponsor-avatar-fallback">{shortName(person.name || person.login)}</div>}
      <div className="discover-result-main"><button className="sponsor-name-link" onClick={() => onOpenSponsor(person.login)}>{person.name || person.login}<ArrowUpRight size={12}/></button><p>@{person.login}{person.bio ? ` · ${person.bio}` : ''}</p><div className="discover-meta"><span><Heart size={12}/> Active sponsorship</span></div><button className="sponsor-repos-toggle" type="button" onClick={() => onOpenSponsor(person.login)} aria-expanded={Boolean(sponsoredRepoPanels[person.login]?.open)}>{sponsoredRepoPanels[person.login]?.open ? 'Hide repositories' : 'Browse their repositories'}<ChevronDown size={14}/></button></div>
      <a className="button button-quiet" href={person.html_url} target="_blank" rel="noreferrer">View profile <ArrowUpRight size={12}/></a>
      {sponsoredRepoPanels[person.login]?.open && <div className="sponsored-repo-panel">{sponsoredRepoPanels[person.login].loading ? <div className="sponsored-repo-state"><LoaderCircle size={16} className="spin"/>Checking active sponsorship and loading public repositories…</div> : sponsoredRepoPanels[person.login].error ? <div className="sponsored-repo-state error"><TriangleAlert size={15}/>{sponsoredRepoPanels[person.login].error}</div> : sponsoredRepoPanels[person.login].items.length ? sponsoredRepoPanels[person.login].items.map(repo => <div className="sponsored-repo-row" key={repo.id}><button className="sponsored-repo-copy sponsored-repo-open" onClick={() => onOpenRepo(repo.full_name)}><b>{repo.full_name}</b><span>{repo.description || 'No description provided.'}</span><small>★ {Number(repo.stargazers_count || 0).toLocaleString()}{repo.language ? ` · ${repo.language}` : ''}{repo.private ? ' · Private access' : ''}</small></button><button className={watched.has(repo.full_name?.toLowerCase()) ? 'button button-quiet is-watched' : 'button button-primary'} disabled={watched.has(repo.full_name?.toLowerCase())} onClick={() => onWatch(repo.full_name)}>{watched.has(repo.full_name?.toLowerCase()) ? <><Check size={14}/> Watching</> : <><Plus size={14}/> Watch</>}</button></div>) : <div className="sponsored-repo-state">No public repositories found for this maintainer.</div>}</div>}
    </article>)}</div> : <div className="discover-empty">{loading ? <LoaderCircle size={18} className="spin"/> : <Heart size={18}/>}<b>{loading ? 'Loading your sponsorships…' : error ? 'Sponsorships are unavailable' : 'No active sponsorships found'}</b><span>{loading ? 'Checking your connected GitHub account.' : error ? 'Reconnect GitHub in Account settings with read:user access, then try again.' : 'Connect the GitHub account you use to sponsor maintainers.'}</span></div>}
  </section>;
  return <section className="discover-page">
    <form className="discover-search" onSubmit={onSearch}><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search GitHub repositories" aria-label="Repository search"/><button className="button button-primary" disabled={loading || !query.trim()}>{loading ? <LoaderCircle size={14} className="spin"/> : <Search size={14}/>}Search</button></form>
    {error && <div className="notice"><TriangleAlert size={14}/><span>{error}</span></div>}
    <div className="discover-result-head"><h2>{mode === 'sponsored' ? 'Sponsored maintainers' : 'Repository results'}</h2><span>{results.length} results</span></div>
    {results.length ? <div className="discover-results">{results.map(repo => <article className="discover-result" key={repo.id}><img src={repo.owner?.avatar_url || ''} alt="" loading="lazy"/><div className="discover-result-main"><a href={repo.html_url} target="_blank" rel="noreferrer">{repo.full_name}<ArrowUpRight size={12}/></a><p>{repo.description || 'No description provided.'}</p><div className="discover-meta"><span><span className="star-mark">★</span> {Number(repo.stargazers_count || 0).toLocaleString()}</span>{repo.language && <span>{repo.language}</span>}{repo.license?.spdx_id && <span>{repo.license.spdx_id}</span>}</div></div><button className={watched.has(repo.full_name?.toLowerCase()) ? 'button button-quiet is-watched' : 'button button-quiet'} disabled={watched.has(repo.full_name?.toLowerCase())} onClick={() => onWatch(repo.full_name)}>{watched.has(repo.full_name?.toLowerCase()) ? <><Check size={13}/> Watching</> : <><Plus size={13}/> Watch</>}</button></article>)}</div> : <div className="discover-empty">{loading ? <LoaderCircle size={18} className="spin"/> : <Compass size={18}/>}<b>{loading ? 'Searching GitHub…' : mode === 'search' && !query ? 'Search repositories on GitHub' : 'No repositories found'}</b><span>{loading ? 'Results will appear here.' : 'Try a different project name, language, or topic.'}</span></div>}
  </section>;
}

function AccountView({ user, onUser, onSignOut }) {
  const [preferences, setPreferences] = useState({ enabled: true, digestInterval: null, quietHoursStart: null, quietHoursEnd: null, timezone: 'UTC', severityFilters: [], issueComments: true });
  const [sessions, setSessions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [passkeys, setPasskeys] = useState([]);
  const [github, setGithub] = useState({ connected: false });
  const [telegram, setTelegram] = useState({ enabled: false, linked: false, botUsername: '' });
  const [telegramToken, setTelegramToken] = useState(null);
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '' });
  const [mfaProof, setMfaProof] = useState({ code: '', password: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const call = async (path, options = {}) => {
    const response = await fetch(path, { signal: AbortSignal.timeout(12000), ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrfToken() } : {}), ...(options.headers || {}) } });
    const data = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
  };
  const load = async () => {
    setBusy(true); setError('');
    try {
      const [pref, sessionData, deviceData, passkeyData, githubData, accountData, telegramData] = await Promise.all([
        call('/api/account/notification-preferences'), call('/api/sessions'), call('/api/account/trusted-devices'), call('/api/account/webauthn'), call('/api/account/github'), call('/api/account'), call('/api/account/telegram')
      ]);
      onUser(accountData.user);
      setPreferences({ ...preferences, ...pref }); setSessions(sessionData.sessions || []); setDevices(deviceData.devices || []); setPasskeys(passkeyData.credentials || []); setGithub(githubData); setTelegram(telegramData);
    } catch (issue) { setError(issue.message || 'Could not load account details.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);
  const run = async (operation, success) => { setError(''); setNotice(''); try { await operation(); setNotice(success); } catch (issue) { setError(issue.message || 'Could not complete that action.'); } };
  const savePreferences = () => run(async () => { await call('/api/account/notification-preferences', { method: 'PUT', body: JSON.stringify(preferences) }); }, 'Notification preferences saved.');
  const changePassword = event => { event.preventDefault(); run(async () => { await call('/api/account/password', { method: 'POST', body: JSON.stringify(password) }); setPassword({ currentPassword: '', newPassword: '' }); }, 'Password updated.'); };
  const revokeOthers = () => run(async () => { await call('/api/sessions', { method: 'DELETE' }); await load(); }, 'Other sessions signed out.');
  const revokeDevice = id => run(async () => { await call('/api/account/trusted-devices', { method: 'DELETE', body: JSON.stringify({ id }) }); await load(); }, 'Trusted device removed.');
  const removePasskey = id => run(async () => { await call('/api/account/webauthn', { method: 'DELETE', body: JSON.stringify({ id }) }); await load(); }, 'Passkey removed.');
  const unlinkGithub = () => run(async () => { await call('/api/account/github', { method: 'DELETE' }); setGithub({ connected: false }); }, 'GitHub account disconnected.');
  const disableMFA = event => { event.preventDefault(); run(async () => { await call('/api/account/mfa/disable', { method: 'POST', body: JSON.stringify(mfaProof) }); setMfaProof({ code: '', password: '' }); await load(); }, 'Multi-factor authentication disabled.'); };
  const registerPasskey = () => run(async () => {
    if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('Passkeys are not supported by this browser.');
    const options = await call('/api/webauthn/register/options', { method: 'POST' });
    const credential = await navigator.credentials.create({ publicKey: publicKeyOptions(options.publicKey, true) });
    if (!credential) throw new Error('Passkey registration was cancelled.');
    await call(`/api/webauthn/register/verify?flowId=${encodeURIComponent(options.flowId)}`, { method: 'POST', body: JSON.stringify(serializeCredential(credential)) });
    await load();
  }, 'Passkey registered.');
  const createTelegramToken = () => run(async () => { const result = await call('/api/account/telegram', { method: 'POST', body: '{}' }); setTelegramToken(result); }, 'One-time Telegram link code created.');
  const unlinkTelegram = () => run(async () => { await call('/api/account/telegram', { method: 'DELETE' }); setTelegramToken(null); await load(); }, 'Telegram account disconnected.');
  return <section className="settings-page account-page">
    {notice && <div className="settings-message"><Check size={13}/>{notice}</div>}{error && <div className="notice"><TriangleAlert size={14}/><span>{error}</span></div>}
    <div className="settings-block"><div className="settings-block-head"><div><h2>Profile</h2><p>Your workspace identity and access level.</p></div></div><div className="account-profile"><div className="account-mark">{shortName(user?.name || user?.email || 'LP')}</div><div><b>{user?.name || 'LePatch user'}</b><span>{user?.email} · {user?.role}</span></div></div><div className="settings-controls"><span className="integration-state">Password sign-in {user?.passwordEnabled ? 'enabled' : 'disabled'} · MFA {user?.mfaEnabled ? 'enabled' : 'not enabled'}</span><button className="button button-quiet" onClick={onSignOut}>Sign out</button></div></div>
    <div className="settings-block"><div className="settings-block-head"><div><h2>Notification preferences</h2><p>Control delivery timing and issue comment updates.</p></div></div><label className="settings-toggle"><input type="checkbox" checked={preferences.enabled} onChange={event => setPreferences({ ...preferences, enabled: event.target.checked })}/> Receive notifications</label><label className="settings-toggle account-toggle"><input type="checkbox" checked={preferences.issueComments} onChange={event => setPreferences({ ...preferences, issueComments: event.target.checked })}/> Notify me about comments on my raised issues</label><label className="settings-field">Time zone<input value={preferences.timezone || 'UTC'} onChange={event => setPreferences({ ...preferences, timezone: event.target.value })} placeholder="UTC"/></label><div className="settings-controls"><span className="integration-state">Quiet hours and digests can be configured by an administrator.</span><button className="button button-primary" onClick={savePreferences}>Save preferences</button></div></div>
    <div className="settings-block"><div className="settings-block-head"><div><h2>Change password</h2><p>Use at least 10 characters.</p></div></div><form className="account-password-form" onSubmit={changePassword}><label className="settings-field">Current password<input type="password" autoComplete="current-password" required value={password.currentPassword} onChange={event => setPassword({ ...password, currentPassword: event.target.value })}/></label><label className="settings-field">New password<input type="password" autoComplete="new-password" minLength={10} required value={password.newPassword} onChange={event => setPassword({ ...password, newPassword: event.target.value })}/></label><button className="button button-primary" disabled={password.newPassword.length < 10}>Update password</button></form></div>
    <div className="settings-block"><div className="settings-block-head"><div><h2>Multi-factor authentication</h2><p>{user?.mfaEnabled ? 'Your account is protected with an authenticator.' : 'MFA enrollment is required during first sign-in.'}</p></div><span className={user?.mfaEnabled ? 'integration-state enabled' : 'integration-state'}><i/>{user?.mfaEnabled ? 'Enabled' : 'Not enabled'}</span></div>{user?.mfaEnabled && <form className="account-password-form" onSubmit={disableMFA}><label className="settings-field">Authenticator or recovery code<input autoComplete="one-time-code" value={mfaProof.code} onChange={event => setMfaProof({ ...mfaProof, code: event.target.value })} placeholder="6 digit code"/></label><label className="settings-field">Or confirm with password<input type="password" autoComplete="current-password" value={mfaProof.password} onChange={event => setMfaProof({ ...mfaProof, password: event.target.value })}/></label><button className="button button-quiet" disabled={!mfaProof.code && !mfaProof.password}>Disable MFA</button></form>}</div>
    <div className="settings-block"><div className="settings-block-head"><div><h2>GitHub connection</h2><p>Used to list repositories and track issues you opened.</p></div><span className={github.connected ? 'integration-state enabled' : 'integration-state'}><i/>{github.connected ? `Connected as ${github.username}` : 'Not connected'}</span></div>{github.connected && <button className="text-danger" onClick={unlinkGithub}>Disconnect GitHub</button>}</div>
    <div className="settings-block"><div className="settings-block-head"><div><h2>Telegram bot access</h2><p>Link your Telegram account to receive personal issue and release notifications.</p></div><span className={telegram.linked ? 'integration-state enabled' : 'integration-state'}><i/>{telegram.linked ? `Linked${telegram.link?.username ? ` as @${telegram.link.username}` : ''}` : 'Not linked'}</span></div>{telegram.enabled ? <><div className="settings-controls"><span className="integration-state">{telegram.botName || (telegram.botUsername ? `@${telegram.botUsername}` : 'LePatch bot')}</span><div><button className="button button-primary" onClick={createTelegramToken}>Generate link code</button>{telegram.linked && <button className="text-danger" onClick={unlinkTelegram}>Disconnect</button>}</div></div>{telegramToken && <div className="telegram-link-code"><b>In Telegram, send this to @{telegramToken.botUsername}:</b><code>/link {telegramToken.token}</code><span>This one-time code expires {new Date(telegramToken.expiresAt).toLocaleTimeString()}.</span></div>}</> : <div className="backup-empty">Telegram linking is not configured by an administrator.</div>}</div>
    <div className="settings-block"><div className="settings-block-head"><div><h2>Active sessions</h2><p>Sessions currently associated with your account.</p></div><button className="button button-quiet" onClick={revokeOthers}>Sign out other sessions</button></div><div className="backup-list">{sessions.map(item => <div className="backup-row" key={item.id}><div><b>{item.deviceName || item.userAgent || 'Browser session'} {item.current ? '· This device' : ''}</b><span>Last active {elapsed(item.lastUsedAt)} · expires {new Date(item.expiresAt).toLocaleDateString()}</span></div></div>)}{!sessions.length && <div className="backup-empty">{busy ? 'Loading sessions…' : 'No sessions found.'}</div>}</div></div>
    <div className="settings-block"><div className="settings-block-head"><div><h2>Trusted devices and passkeys</h2><p>Register a passkey or remove credentials and devices you no longer use.</p></div><button className="button button-primary" onClick={registerPasskey}><KeyRound size={13}/>Add passkey</button></div><div className="backup-list">{devices.map(item => <div className="backup-row" key={item.id}><div><b>{item.name || 'Trusted device'}</b><span>Expires {new Date(item.expiresAt).toLocaleDateString()}</span></div><button className="text-danger" onClick={() => revokeDevice(item.id)}>Remove</button></div>)}{passkeys.map(item => <div className="backup-row" key={item.id}><div><b>{item.deviceName || 'Passkey'}</b><span>Added {new Date(item.createdAt).toLocaleDateString()}</span></div><button className="text-danger" onClick={() => removePasskey(item.id)}>Remove</button></div>)}{!devices.length && !passkeys.length && <div className="backup-empty">No trusted devices or passkeys are registered.</div>}</div></div>
  </section>;
}

function AboutView() {
  const [about, setAbout] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const checkForUpdates = async () => {
    setChecking(true); setError('');
    try {
      const response = await fetch('/api/about', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not check for updates.');
      setAbout(result);
    } catch (issue) { setError(issue.message || 'Could not check for updates.'); }
    finally { setChecking(false); }
  };
  useEffect(() => { checkForUpdates(); }, []);
  const release = about?.release;
  const version = value => (value || '').replace(/^v/, '').split(/[.+-]/).slice(0, 3).map(part => Number(part) || 0);
  const latestIsNewer = release && about?.version && about.version !== 'dev' && (() => { const current = version(about.version); const latest = version(release.tag_name); for (let i = 0; i < 3; i++) { if (latest[i] !== current[i]) return latest[i] > current[i]; } return false; })();
  return <section className="settings-page about-page">
    {error && <div className="notice"><TriangleAlert size={14}/><span>{error}</span></div>}
    <div className="settings-block"><div className="settings-block-head"><div><h2>LePatch</h2><p>Self-hosted GitHub release monitoring, repository activity, and notifications.</p></div><span className="integration-state enabled"><i/>Open source</span></div><div className="about-version-row"><div><span>INSTALLED VERSION</span><b>{about?.version ? `v${about.version.replace(/^v/, '')}` : 'Checking…'}</b></div><button className="button button-quiet" onClick={checkForUpdates} disabled={checking}>{checking ? <LoaderCircle size={13} className="spin"/> : <RefreshCw size={13}/>}Check for updates</button></div></div>
    <div className="settings-block"><div className="settings-block-head"><div><h2>Release updater</h2><p>Check GitHub for the latest published LePatch version.</p></div></div>{release ? <div className="about-release"><div><b>{release.name || release.tag_name}</b><span>{latestIsNewer ? 'An update is ready to install.' : about?.version === 'dev' ? 'This is a development build. Compare it with the latest published release.' : 'You are up to date.'}{release.published_at ? ` Published ${new Date(release.published_at).toLocaleDateString()}.` : ''}</span></div><a className="button button-primary" href={release.html_url} target="_blank" rel="noreferrer">View release <ArrowUpRight size={13}/></a></div> : <div className="backup-empty">{about ? about.releaseCheckAvailable ? 'No GitHub release has been published yet.' : 'Could not reach GitHub to check for updates. Try again when the connection is available.' : 'Checking GitHub releases…'}</div>}{release && <p className="settings-encryption">To update a Docker install, pull the new image and restart the service with <code>docker compose pull lepatch && docker compose up -d lepatch</code>. LePatch never replaces its own files or database.</p>}</div>
    <div className="settings-block"><div className="settings-block-head"><div><h2>Project</h2><p>Source code, changes, and contribution guidelines.</p></div></div><div className="about-links"><a href="https://github.com/leleasley/LePatch" target="_blank" rel="noreferrer">GitHub repository <ArrowUpRight size={13}/></a><a href="https://github.com/leleasley/LePatch/blob/main/CHANGELOG.md" target="_blank" rel="noreferrer">Changelog <ArrowUpRight size={13}/></a><a href="https://github.com/leleasley/LePatch/blob/main/CONTRIBUTING.md" target="_blank" rel="noreferrer">Contributing <ArrowUpRight size={13}/></a></div></div>
  </section>;
}

function SettingsView({ theme, onTheme }) {
  const [integrations, setIntegrations] = useState({ discord: { enabled: false, configured: false }, telegram: { enabled: false, configured: false } });
  const [forms, setForms] = useState({ discord: { webhookUrl: '', enabled: false }, telegram: { botToken: '', chatId: '', webhookSecret: '', botUsername: '', botName: '', enabled: false } });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [backups, setBackups] = useState([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [audit, setAudit] = useState([]);
  const [users, setUsers] = useState([]);
  const [backupSchedule, setBackupSchedule] = useState({ enabled: false, time: '03:00', frequency: 'daily', dayOfWeek: '0', dayOfMonth: 1 });
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'user' });
  const themes = [{ id: 'midnight', label: 'Midnight' }, { id: 'paper', label: 'Paper' }, { id: 'oled', label: 'OLED' }, { id: 'moss', label: 'Moss' }];
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations', { signal: AbortSignal.timeout(10000), cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load integration settings.');
      setIntegrations(data);
      setForms(current => ({ discord: { ...current.discord, enabled: Boolean(data.discord?.enabled) }, telegram: { ...current.telegram, enabled: Boolean(data.telegram?.enabled), botUsername: data.telegram?.botUsername || current.telegram.botUsername, botName: data.telegram?.botName || current.telegram.botName } }));
      setError('');
    } catch (issue) { setError(issue.message || 'Could not load integration settings.'); }
    finally { setLoading(false); }
  };
  const loadBackups = async () => {
    try { const response = await fetch('/api/admin/backups', { signal: AbortSignal.timeout(10000), cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load backups.'); setBackups(data.backups || []); }
    catch (issue) { setError(issue.message || 'Could not load backups.'); }
  };
  const loadAudit = async () => {
    try { const response = await fetch('/api/admin/audit?perPage=30', { signal: AbortSignal.timeout(10000), cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load audit history.'); setAudit(data.logs || []); }
    catch (issue) { setError(issue.message || 'Could not load audit history.'); }
  };
  const loadUsers = async () => {
    try { const response = await fetch('/api/users?perPage=100', { signal: AbortSignal.timeout(10000), cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load users.'); setUsers(data.users || []); }
    catch (issue) { setError(issue.message || 'Could not load users.'); }
  };
  const loadBackupSchedule = async () => { try { const response=await fetch('/api/admin/backup-schedule',{signal:AbortSignal.timeout(10000),cache:'no-store'}); const data=await response.json(); if(!response.ok) throw new Error(data.error||'Could not load backup schedule.'); setBackupSchedule(data); } catch(issue) { setError(issue.message||'Could not load backup schedule.'); } };
  useEffect(() => { load(); loadBackups(); loadAudit(); loadUsers(); loadBackupSchedule(); }, []);
  const save = async provider => {
    setBusy(provider); setError(''); setMessage('');
    try {
      const form = forms[provider];
      const payload = { enabled: form.enabled };
      if (provider === 'discord' && form.webhookUrl.trim()) payload.webhookUrl = form.webhookUrl.trim();
      if (provider === 'telegram' && form.botToken.trim()) payload.botToken = form.botToken.trim();
      if (provider === 'telegram' && form.chatId.trim()) payload.chatId = form.chatId.trim();
      if (provider === 'telegram' && form.webhookSecret.trim()) payload.webhookSecret = form.webhookSecret.trim();
      if (provider === 'telegram' && form.botUsername.trim()) payload.botUsername = form.botUsername.trim();
      if (provider === 'telegram' && form.botName.trim()) payload.botName = form.botName.trim();
      const response = await fetch(`/api/integrations/${provider}`, { method: 'PUT', signal: AbortSignal.timeout(12000), headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save integration settings.');
      setForms(current => ({ ...current, [provider]: { ...current[provider], webhookUrl: '', botToken: '', chatId: '', webhookSecret: '' } }));
      setMessage(`${provider === 'discord' ? 'Discord' : 'Telegram'} settings saved securely.`);
      await load();
    } catch (issue) { setError(issue.message || 'Could not save integration settings.'); }
    finally { setBusy(''); }
  };
  const test = async provider => {
    setBusy(`${provider}-test`); setError(''); setMessage('');
    try {
      const response = await fetch('/api/notifications/test', { method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() }, body: JSON.stringify({ provider }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Test message failed.');
      setMessage(`Test message sent through ${provider === 'discord' ? 'Discord' : 'Telegram'}.`);
    } catch (issue) { setError(issue.message || 'Test message failed.'); }
    finally { setBusy(''); }
  };
  const registerTelegramWebhook = async () => {
    setBusy('telegram-webhook'); setError(''); setMessage('');
    try {
      const response = await fetch('/api/integrations/telegram/webhook', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'X-CSRF-Token': csrfToken() } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not register the Telegram webhook.');
      setMessage('Telegram webhook registered. Bot messages can now link accounts.');
    } catch (issue) { setError(issue.message || 'Could not register the Telegram webhook.'); }
    finally { setBusy(''); }
  };
  const clear = async provider => {
    if (!window.confirm(`Remove the ${provider === 'discord' ? 'Discord' : 'Telegram'} integration credentials?`)) return;
    setBusy(`${provider}-clear`); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/integrations/${provider}`, { method: 'DELETE', signal: AbortSignal.timeout(10000), headers: { 'X-CSRF-Token': csrfToken() } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not remove integration.');
      setMessage(`${provider === 'discord' ? 'Discord' : 'Telegram'} credentials removed.`); await load();
    } catch (issue) { setError(issue.message || 'Could not remove integration.'); }
    finally { setBusy(''); }
  };
  const createBackup = async () => {
    setBackupBusy(true); setError(''); setMessage('');
    try { const response = await fetch('/api/admin/backups', { method: 'POST', signal: AbortSignal.timeout(60000), headers: { 'X-CSRF-Token': csrfToken() } }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Backup failed.'); setMessage('Database backup completed.'); await loadBackups(); }
    catch (issue) { setError(issue.message || 'Could not create database backup.'); }
    finally { setBackupBusy(false); }
  };
  const saveBackupSchedule = async () => { setBusy('backup-schedule'); setError(''); setMessage(''); try { const response=await fetch('/api/admin/backup-schedule',{method:'PUT',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken()},body:JSON.stringify({...backupSchedule,dayOfMonth:Number(backupSchedule.dayOfMonth)})}); const result=await response.json(); if(!response.ok) throw new Error(result.error||'Could not save schedule.'); setMessage('Backup schedule saved.'); } catch(issue) { setError(issue.message||'Could not save schedule.'); } finally { setBusy(''); } };
  const deleteBackup = async backup => {
    if (!window.confirm(`Delete backup ${backup.filename}?`)) return;
    try { const response = await fetch(`/api/admin/backups/${backup.id}`, { method: 'DELETE', signal: AbortSignal.timeout(10000), headers: { 'X-CSRF-Token': csrfToken() } }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not delete backup.'); setMessage('Backup deleted.'); await loadBackups(); }
    catch (issue) { setError(issue.message || 'Could not delete backup.'); }
  };
  const clearAudit = async () => {
    if (!window.confirm('Clear the audit history? This cannot be undone.')) return;
    try { const response = await fetch('/api/admin/audit', { method: 'DELETE', signal: AbortSignal.timeout(10000), headers: { 'X-CSRF-Token': csrfToken() } }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not clear audit history.'); setMessage('Audit history cleared.'); await loadAudit(); }
    catch (issue) { setError(issue.message || 'Could not clear audit history.'); }
  };
  const createUser = async event => {
    event.preventDefault(); setError(''); setMessage('');
    try { const response = await fetch('/api/users', { method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() }, body: JSON.stringify(newUser) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not create user.'); setNewUser({ name: '', email: '', password: '', role: 'user' }); setMessage('User created.'); await loadUsers(); }
    catch (issue) { setError(issue.message || 'Could not create user.'); }
  };
  const changeUserRole = async (user, role) => {
    try { const response = await fetch(`/api/users/${user.id}`, { method: 'PATCH', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() }, body: JSON.stringify({ role }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not update role.'); setMessage(`Updated ${user.email}.`); await loadUsers(); }
    catch (issue) { setError(issue.message || 'Could not update role.'); await loadUsers(); }
  };
  const removeUser = async user => {
    if (!window.confirm(`Delete ${user.email} and their associated account data?`)) return;
    try { const response = await fetch(`/api/users/${user.id}`, { method: 'DELETE', signal: AbortSignal.timeout(10000), headers: { 'X-CSRF-Token': csrfToken() } }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not delete user.'); setMessage('User deleted.'); await loadUsers(); }
    catch (issue) { setError(issue.message || 'Could not delete user.'); }
  };
  const field = (provider, key) => event => setForms(current => ({ ...current, [provider]: { ...current[provider], [key]: event.target.value } }));
  return <section className="settings-page">
    {message && <div className="settings-message"><Check size={13}/>{message}</div>}{error && <div className="notice"><TriangleAlert size={14}/><span>{error}</span></div>}
    <div className="settings-block"><div className="settings-block-head"><div><h2>Appearance</h2><p>Choose the theme used on this device.</p></div></div><div className="theme-cards">{themes.map(item => <button className={theme===item.id?'theme-card selected':'theme-card'} key={item.id} onClick={() => onTheme(item.id)}><i className={`theme-preview theme-preview-${item.id}`}/><span>{item.label}</span>{theme===item.id&&<Check size={13}/>}</button>)}</div></div>
    <div className="settings-block"><div className="settings-block-head"><div><h2>Discord notifications</h2><p>Send release updates to a Discord webhook.</p></div><span className={integrations.discord.enabled?'integration-state enabled':'integration-state'}><i/>{integrations.discord.enabled?'Enabled':'Disabled'}</span></div>{loading?<div className="settings-loading"><LoaderCircle size={14} className="spin"/> Loading saved settings</div>:<><label className="settings-field">Webhook URL<input type="password" autoComplete="new-password" value={forms.discord.webhookUrl} onChange={field('discord','webhookUrl')} placeholder={integrations.discord.configured?'Configured securely · enter a replacement to rotate':'https://discord.com/api/webhooks/…'}/></label><div className="settings-controls"><label className="settings-toggle"><input type="checkbox" checked={forms.discord.enabled} onChange={event=>setForms(current=>({...current,discord:{...current.discord,enabled:event.target.checked}}))}/> Enable delivery</label><div><button className="button button-quiet" onClick={()=>test('discord')} disabled={busy!==''||!integrations.discord.configured}>{busy==='discord-test'?<LoaderCircle size={13} className="spin"/>:'Send test'}</button><button className="button button-primary" onClick={()=>save('discord')} disabled={busy!==''}>{busy==='discord'?<LoaderCircle size={13} className="spin"/>:'Save settings'}</button>{integrations.discord.configured&&<button className="text-danger" onClick={()=>clear('discord')} disabled={busy!==''}>Remove</button>}</div></div></>}</div>
    <div className="settings-block"><div className="settings-block-head"><div><h2>Telegram notifications</h2><p>Send notifications through a Telegram bot. Webhooks receive bot messages for account linking.</p></div><span className={integrations.telegram.enabled?'integration-state enabled':'integration-state'}><i/>{integrations.telegram.enabled?'Enabled':'Disabled'}</span></div>{loading?<div className="settings-loading"><LoaderCircle size={14} className="spin"/> Loading saved settings</div>:<><label className="settings-field">Bot token<input type="password" autoComplete="new-password" value={forms.telegram.botToken} onChange={field('telegram','botToken')} placeholder={integrations.telegram.configured?'Configured securely · enter a replacement to rotate':'Bot token from @BotFather'}/></label><label className="settings-field">Bot username<input value={forms.telegram.botUsername} onChange={field('telegram','botUsername')} placeholder="YourBotName (without @)"/></label><label className="settings-field">Webhook secret<input type="password" autoComplete="new-password" value={forms.telegram.webhookSecret} onChange={field('telegram','webhookSecret')} placeholder="Secret for validating incoming Telegram updates"/></label><label className="settings-field">Default chat ID<input value={forms.telegram.chatId} onChange={field('telegram','chatId')} placeholder={integrations.telegram.defaultRecipientConfigured?'Default recipient configured':'Optional fallback recipient'}/></label><div className="settings-controls"><label className="settings-toggle"><input type="checkbox" checked={forms.telegram.enabled} onChange={event=>setForms(current=>({...current,telegram:{...current.telegram,enabled:event.target.checked}}))}/> Enable delivery</label><div><button className="button button-quiet" onClick={()=>test('telegram')} disabled={busy!==''||!integrations.telegram.configured}>{busy==='telegram-test'?<LoaderCircle size={13} className="spin"/>:'Send test'}</button><button className="button button-primary" onClick={()=>save('telegram')} disabled={busy!==''}>{busy==='telegram'?<LoaderCircle size={13} className="spin"/>:'Save settings'}</button>{integrations.telegram.configured&&<button className="text-danger" onClick={()=>clear('telegram')} disabled={busy!==''}>Remove</button>}</div></div><div className="settings-encryption">Telegram sends outbound notifications with the bot API. A bot webhook is only needed for incoming commands such as <code>/link</code>. Set <code>APP_URL</code> to a public HTTPS address, save the bot token and webhook secret, then register the webhook here. <code>{location.origin}/api/webhook/telegram</code><div><button className="button button-quiet" onClick={registerTelegramWebhook} disabled={busy!==''||!integrations.telegram.configured}>{busy==='telegram-webhook'?<LoaderCircle size={13} className="spin"/>:'Register bot webhook'}</button></div></div></>}</div>
    <div className="settings-block"><div className="settings-block-head"><div><h2>Scheduled backups</h2><p>Runs in the Europe/London timezone and keeps the five latest snapshots.</p></div><label className="settings-toggle"><input type="checkbox" checked={backupSchedule.enabled} onChange={event=>setBackupSchedule({...backupSchedule,enabled:event.target.checked})}/> Enabled</label></div><div className="backup-schedule-controls"><label className="settings-field">Time<input type="time" value={backupSchedule.time} onChange={event=>setBackupSchedule({...backupSchedule,time:event.target.value})}/></label><label className="settings-field">Frequency<select value={backupSchedule.frequency} onChange={event=>setBackupSchedule({...backupSchedule,frequency:event.target.value})}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>{backupSchedule.frequency==='weekly'&&<label className="settings-field">Day<select value={backupSchedule.dayOfWeek} onChange={event=>setBackupSchedule({...backupSchedule,dayOfWeek:event.target.value})}>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day,index)=><option key={day} value={index}>{day}</option>)}</select></label>}{backupSchedule.frequency==='monthly'&&<label className="settings-field">Day of month<input type="number" min="1" max="31" value={backupSchedule.dayOfMonth} onChange={event=>setBackupSchedule({...backupSchedule,dayOfMonth:event.target.value})}/></label>}<button className="button button-primary" onClick={saveBackupSchedule} disabled={busy==='backup-schedule'}>{busy==='backup-schedule'?<LoaderCircle size={13} className="spin"/>:'Save schedule'}</button></div></div>
    <div className="settings-block"><div className="settings-block-head"><div><h2>Database backups</h2><p>Create and download a consistent SQLite snapshot.</p></div><button className="button button-primary" onClick={createBackup} disabled={backupBusy}>{backupBusy?<LoaderCircle size={13} className="spin"/>:<Plus size={13}/>}Create backup</button></div><div className="backup-list">{backups.length?backups.map(backup=><div className="backup-row" key={backup.id}><div><b>{backup.filename}</b><span>{backup.status} · {backup.sizeBytes?`${(backup.sizeBytes/1024/1024).toFixed(1)} MB`:'—'}</span></div><div>{backup.status==='completed'&&<a className="button button-quiet" href={`/api/admin/backups/${backup.id}`}>Download</a>}<button className="text-danger" onClick={()=>deleteBackup(backup)} disabled={backupBusy}>Delete</button></div></div>):<div className="backup-empty">No database backups yet.</div>}</div></div>
    <div className="settings-block"><div className="settings-block-head"><div><h2>Audit history</h2><p>Recent account and workspace changes.</p></div><button className="text-danger" onClick={clearAudit}>Clear history</button></div><div className="audit-list">{audit.length?audit.map(item=><div className="audit-row" key={item.id}><span className="audit-time">{elapsed(item.createdAt)}</span><b>{item.action}</b><span className="audit-target">{item.target || item.targetId || '—'}</span></div>):<div className="backup-empty">No audit events recorded.</div>}</div></div>
    <div className="settings-block"><div className="settings-block-head"><div><h2>Users and roles</h2><p>Manage workspace access. Each new user must set up MFA at first sign-in.</p></div><span className="integration-state">{users.length} users</span></div><form className="user-create-form" onSubmit={createUser}><input required placeholder="Name" value={newUser.name} onChange={event=>setNewUser(current=>({...current,name:event.target.value}))}/><input required type="email" placeholder="Email" value={newUser.email} onChange={event=>setNewUser(current=>({...current,email:event.target.value}))}/><input required type="password" minLength={10} placeholder="Temporary password" value={newUser.password} onChange={event=>setNewUser(current=>({...current,password:event.target.value}))}/><select value={newUser.role} onChange={event=>setNewUser(current=>({...current,role:event.target.value}))}><option value="user">User</option><option value="moderator">Moderator</option><option value="restricted">Restricted</option><option value="administrator">Administrator</option></select><button className="button button-primary" disabled={!newUser.name||!newUser.email||newUser.password.length<10}><Plus size={13}/>Add</button></form><div className="user-list">{users.map(user=><div className="user-row" key={user.id}><div><b>{user.name}</b><span>{user.email}</span></div><span className={user.mfaEnabled?'user-mfa enabled':'user-mfa'}>{user.mfaEnabled?'MFA on':'MFA required'}</span><select aria-label={`Role for ${user.email}`} value={user.role} onChange={event=>changeUserRole(user,event.target.value)}><option value="user">User</option><option value="moderator">Moderator</option><option value="restricted">Restricted</option><option value="administrator">Administrator</option></select><button className="text-danger" onClick={()=>removeUser(user)} title="Delete user">Delete</button></div>)}</div></div>
    <p className="settings-encryption"><CircleHelp size={13}/> Integration credentials are encrypted before they are stored.</p>
  </section>;
}

function RaisedIssuesView({ issues, state, setState, notice, clearNotice, onSeen }) {
  const unread = issues.reduce((total, issue) => total + issue.unreadCommentCount, 0);
  return <section className="issues-section">
    {notice && <div className="notice"><TriangleAlert size={14}/><span>{notice}</span><button onClick={clearNotice} aria-label="Dismiss"><X size={14}/></button></div>}
    <div className="issues-toolbar"><div className="issue-tabs">{[['open','Open'],['closed','Closed'],['all','All']].map(([id,label]) => <button key={id} className={state===id?'issue-tab active':'issue-tab'} onClick={() => setState(id)}>{label}</button>)}</div><div className="issue-summary"><span><i className="open-state"/>{issues.filter(issue => issue.state === 'open').length} open</span><span><MessageSquare size={12}/>{unread} new comments</span></div></div>
    <div className="issue-list-head"><span>ISSUE</span><span>STATUS</span><span>LAST ACTIVITY</span></div>
    <div className="issue-list">{issues.length ? issues.map(issue => <article className="raised-issue" key={issue.id}>
      <div className="issue-owner"><img src={`https://github.com/${encodeURIComponent(issue.owner)}.png?size=64`} alt="" loading="lazy" onError={event => { event.currentTarget.style.display='none'; }}/></div>
      <div className="issue-main"><div className="issue-repo">{issue.owner}/{issue.repo} <span>#{issue.issueNumber}</span></div><a className="issue-title" href={issue.htmlUrl} target="_blank" rel="noreferrer">{issue.title}<ArrowUpRight size={12}/></a>{issue.body && <p>{issue.body.replace(/\s+/g,' ').slice(0,180)}{issue.body.length>180?'…':''}</p>}<div className="issue-meta"><span><MessageSquare size={11}/>{issue.commentCount} comments</span>{issue.unreadCommentCount>0&&<span className="new-comment-count">{issue.unreadCommentCount} new</span>}<span>Opened {elapsed(issue.createdAt)}</span></div></div>
      <span className={issue.state==='open'?'issue-state is-open':'issue-state is-closed'}>{issue.state==='open'?<CircleDot size={12}/>:<CircleCheck size={12}/>} {issue.state==='open'?'Open':'Closed'}</span>
      <div className="issue-updated"><span>{elapsed(issue.updatedAt)}</span>{issue.unreadCommentCount>0&&<button onClick={() => onSeen(issue.id)} title="Mark updates as read"><Check size={13}/> Mark read</button>}</div>
    </article>) : <div className="issues-empty"><div className="empty-symbol"><CircleDot size={19}/></div><b>{notice.includes('Connect')?'Connect GitHub to find your issues':'No issues in this view'}</b><span>{notice.includes('Connect')?'Link the GitHub account you use to open issues. LePatch will check for comments and state changes.':'Issues you have opened will appear here when the connected GitHub account syncs.'}</span></div>}</div>
    <div className="issues-footnote"><Activity size={12}/><span>Updates are checked every 10 minutes. New comments stay marked until you read them.</span></div>
  </section>;
}

function NotificationView({ events, notice }) {
  return <section className="notification-section">
    {notice && <div className="notice"><TriangleAlert size={14}/><span>{notice}</span></div>}
    <div className="notification-list-head"><span>RELEASE</span><span>CHANNEL</span><span>STATUS</span><span>WHEN</span></div>
    {events.length ? events.map(event => <article className="notification-row" key={event.id}>
      <div className="notification-mark"><Bell size={14}/></div>
      <div className="notification-release"><div className="issue-repo">{event.repoFullName}</div><a href={event.htmlUrl} target="_blank" rel="noreferrer">{event.appName} {event.tagName}<ArrowUpRight size={12}/></a><span>{event.releaseType || 'Release'} update</span></div>
      <span className={`notification-channel channel-${event.channelType}`}>{event.channelType === 'telegram' ? 'Telegram' : 'Discord'}</span>
      <span className={`delivery-state state-${event.status}`}>{event.status === 'sent' ? <Check size={12}/> : event.status === 'failed' ? <TriangleAlert size={12}/> : <Clock3 size={12}/>} {event.status}</span>
      <div className="notification-when"><span>{elapsed(event.sentAt || event.createdAt)}</span>{event.error && <small title={event.error}>Delivery failed</small>}</div>
    </article>) : <div className="notification-empty"><div className="empty-symbol"><Bell size={18}/></div><b>No notification history yet</b><span>Release alerts will appear after you configure Discord or Telegram and a watched repository publishes a release.</span></div>}
  </section>;
}

function RepoIcon({ name, iconUrl, extraClass = '' }) {
  const [failed, setFailed] = useState(false);
  const tone = shortName(name).charCodeAt(0) % 5;
  return <div className={`repo-monogram tone-${tone} ${extraClass}`} aria-label={`${name} repository icon`}>
    {iconUrl && !failed ? <img src={iconUrl} alt="" loading="lazy" onError={() => setFailed(true)}/> : shortName(name)}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
