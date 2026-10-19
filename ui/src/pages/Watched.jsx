import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Bell, Check, GitBranch, LoaderCircle, Plus, RefreshCw, Settings2, Trash2, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api.js';
import { checkIntervalLabel, elapsed } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { EmptyState, RepoIcon } from '../components/ui.jsx';
import { ConfirmDialog, Modal } from '../components/Modal.jsx';

const INTERVALS = [15, 30, 60, 180, 360, 720, 1440, 4320];

function RepoSettingsDialog({ app, open, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(app?.name || '');
  const [prereleases, setPrereleases] = useState(Boolean(app?.includePrereleases));
  const [notifications, setNotifications] = useState(app?.notificationsEnabled !== false);
  const [interval, setInterval] = useState(String(app?.checkIntervalMinutes || 360));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!app) return;
    setName(app.name || '');
    setPrereleases(Boolean(app.includePrereleases));
    setNotifications(app.notificationsEnabled !== false);
    setInterval(String(app.checkIntervalMinutes || 360));
  }, [app]);

  const save = async () => {
    setBusy(true);
    try {
      const result = await api(`/api/apps/${encodeURIComponent(app.id)}`, {
        method: 'PATCH',
        body: {
          name: name.trim(),
          includePrereleases: prereleases,
          notificationsEnabled: notifications,
          checkIntervalMinutes: Number(interval),
        },
      });
      toast.success('Repository settings saved.');
      onSaved(result.app);
      onClose();
    } catch (issue) {
      toast.error(issue.message || 'Could not save the repository settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Repository settings"
      description={app?.repoFullName}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={save} disabled={busy || !name.trim()}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Save changes
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 16, marginTop: 22 }}>
        <label className="field">
          <span>Display name</span>
          <input className="input" value={name} maxLength={80} onChange={event => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>Check interval</span>
          <select className="select" value={interval} onChange={event => setInterval(event.target.value)}>
            {INTERVALS.map(value => (
              <option key={value} value={value}>
                Every {checkIntervalLabel(value)}
              </option>
            ))}
          </select>
          <span className="field-hint">How often GitHub is checked for a new release.</span>
        </label>
        <label className="switch">
          <input type="checkbox" checked={prereleases} onChange={event => setPrereleases(event.target.checked)} />
          <span>Include pre-releases</span>
        </label>
        <label className="switch">
          <input type="checkbox" checked={notifications} onChange={event => setNotifications(event.target.checked)} />
          <span>Send notifications for this repository</span>
        </label>
      </div>
    </Modal>
  );
}

export function WatchedPage({ apps, onOpen, onCheck, onRemove, onUpdate, checking, onWatch }) {
  const toast = useToast();
  const [settingsApp, setSettingsApp] = useState(null);
  const [removeApp, setRemoveApp] = useState(null);
  const [removing, setRemoving] = useState(false);

  const confirmRemove = async () => {
    if (!removeApp) return;
    setRemoving(true);
    try {
      await onRemove(removeApp.id);
      setRemoveApp(null);
    } finally {
      setRemoving(false);
    }
  };

  if (!apps.length) {
    return (
      <EmptyState
        icon={GitBranch}
        title="No repositories watched yet"
        description="Add a GitHub project and LePatch will watch it for new releases, notes and pre-releases."
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
      <div className="repo-grid">
        {apps.map(app => (
          <article
            className={`card card-hover repo-card${app.updateAvailable ? ' has-update' : ''}`}
            key={app.id}
            role="link"
            tabIndex={0}
            onClick={() => onOpen(app.id)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen(app.id);
              }
            }}
          >
            <div className="repo-card-head">
              <RepoIcon name={app.name} iconUrl={app.iconUrl} size="is-md" />
              <div className="repo-card-title">
                <b>
                  {app.name}
                  {app.updateAvailable ? <i className="unread-dot" title="New release available" /> : null}
                </b>
                <a href={app.githubUrl} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>
                  {app.repoFullName} <ArrowUpRight size={11} />
                </a>
              </div>
              <div className="repo-card-actions" onClick={event => event.stopPropagation()}>
                <button className="row-action" type="button" title="Repository settings" aria-label={`Settings for ${app.repoFullName}`} onClick={() => setSettingsApp(app)}>
                  <Settings2 size={15} />
                </button>
                <button className="row-action" type="button" title="Check for releases now" aria-label={`Check ${app.repoFullName} now`} onClick={() => onCheck(app.id)} disabled={checking === app.id}>
                  <RefreshCw size={15} className={checking === app.id ? 'spin' : ''} />
                </button>
                <button className="row-action is-danger" type="button" title="Stop watching" aria-label={`Stop watching ${app.repoFullName}`} onClick={() => setRemoveApp(app)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <p className="repo-card-desc clamp-2">{app.description || 'No description provided for this repository.'}</p>

            <div className="repo-card-meta">
              <div>
                <span>Latest release</span>
                <b>{app.latestSeenTag || 'None yet'}</b>
              </div>
              <div>
                <span>Last checked</span>
                <b>{elapsed(app.lastCheckedAt)}</b>
              </div>
            </div>

            <div className="repo-card-foot">
              <div className="repo-card-tags">
                <span className={app.notificationsEnabled === false ? 'pill' : 'pill pill-accent'}>
                  <Bell size={11} /> {app.notificationsEnabled === false ? 'Muted' : 'Notifying'}
                </span>
                {app.includePrereleases ? <span className="pill">Pre-releases</span> : null}
                {app.updateAvailable ? <span className="pill pill-accent">Update available</span> : null}
                {app.checkStatus === 'failed' ? <span className="pill pill-danger">Check failed</span> : null}
              </div>
              <span className="repo-card-open">
                Open <ArrowRight size={14} />
              </span>
            </div>

            {app.checkStatus === 'failed' && app.checkError ? (
              <div className="notice notice-error">
                <TriangleAlert size={14} />
                <span>{app.checkError}</span>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <RepoSettingsDialog app={settingsApp} open={Boolean(settingsApp)} onClose={() => setSettingsApp(null)} onSaved={onUpdate} />

      <ConfirmDialog
        open={Boolean(removeApp)}
        title="Stop watching this repository?"
        description={`${removeApp?.repoFullName || ''} will be removed from your feed. Its release history stays on GitHub.`}
        confirmLabel="Stop watching"
        destructive
        busy={removing}
        onConfirm={confirmRemove}
        onClose={() => setRemoveApp(null)}
      />
    </>
  );
}
