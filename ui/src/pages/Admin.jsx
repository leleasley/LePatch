import { useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Boxes,
  Check,
  ClipboardList,
  Database,
  Download,
  HardDrive,
  History,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  TriangleAlert,
  Users,
  Webhook,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { absolute, bytes, compact, duration, elapsed } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { EmptyState, Field, LoadingLine, Pill, Stat } from '../components/ui.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';

const TABS = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'workspace', label: 'Workspace', icon: Settings2 },
  { id: 'integrations', label: 'Integrations', icon: Webhook },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'queues', label: 'Delivery queues', icon: Boxes },
  { id: 'backups', label: 'Backups', icon: Database },
  { id: 'audit', label: 'Audit log', icon: ClipboardList },
];

function OverviewPanel({ overview, loading, onRefresh }) {
  if (loading && !overview) {
    return (
      <div className="stat-grid">
        {[0, 1, 2, 3].map(item => (
          <div className="stat" key={item}>
            <span className="skeleton" style={{ height: 12, width: '60%' }} />
            <span className="skeleton" style={{ height: 24, width: '40%' }} />
          </div>
        ))}
      </div>
    );
  }
  if (!overview) return null;

  const activity = overview.releases?.activity || [];
  const peak = Math.max(1, ...activity.map(item => item.count || 0));

  return (
    <>
      <div className="stat-grid">
        <Stat label="Users" value={compact(overview.users?.total)} hint={`${overview.users?.administrator || 0} administrators`} icon={Users} />
        <Stat label="Watched repos" value={compact(overview.repositories?.watched)} hint="across the workspace" icon={Boxes} />
        <Stat label="Releases tracked" value={compact(overview.releases?.total)} hint={`${overview.releases?.lastWeek || 0} this week`} icon={History} />
        <Stat label="Alerts sent" value={compact(overview.notifications?.sent)} hint={`${overview.notifications?.failed || 0} failed`} icon={Bell} />
      </div>

      <div className="account-grid" style={{ marginTop: 16 }}>
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Release activity</h2>
              <p>Releases detected over the last 14 days.</p>
            </div>
          </div>
          <div className="card-body">
            <div className="chart">
              {activity.map(item => (
                <div className="chart-col" key={item.date} title={`${item.date}: ${item.count} releases`}>
                  <span className="chart-bar" style={{ height: `${Math.max(3, (item.count / peak) * 100)}%` }} />
                  <small>{item.date.slice(5)}</small>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Service health</h2>
              <p>Runtime state of the LePatch background workers.</p>
            </div>
          </div>
          <div className="card-body">
            <dl className="kv">
              <div className="kv-row">
                <dt>Version</dt>
                <dd>v{overview.version?.replace(/^v/, '')}</dd>
              </div>
              <div className="kv-row">
                <dt>Uptime</dt>
                <dd>{duration(overview.uptime)}</dd>
              </div>
              <div className="kv-row">
                <dt>Release poller</dt>
                <dd>{overview.queue?.running ? 'running' : 'stopped'}</dd>
              </div>
              <div className="kv-row">
                <dt>Check queue</dt>
                <dd>
                  {overview.queue?.queueDepth || 0} / {overview.queue?.queueCapacity || 0} queued
                </dd>
              </div>
              <div className="kv-row">
                <dt>Pending checks</dt>
                <dd>{overview.queue?.pendingChecks || 0}</dd>
              </div>
              <div className="kv-row">
                <dt>Last schedule</dt>
                <dd>{overview.queue?.lastSchedule ? elapsed(overview.queue.lastSchedule) : 'never'}</dd>
              </div>
              <div className="kv-row">
                <dt>Database size</dt>
                <dd>{bytes(overview.storage?.databaseBytes)}</dd>
              </div>
              <div className="kv-row">
                <dt>Backups on disk</dt>
                <dd>{bytes(overview.storage?.backupsBytes)}</dd>
              </div>
              <div className="kv-row">
                <dt>Active sessions</dt>
                <dd>{overview.users?.activeSession || 0}</dd>
              </div>
              {overview.queue?.lastError ? (
                <div className="kv-row">
                  <dt>Last error</dt>
                  <dd style={{ color: 'var(--danger)' }}>{overview.queue.lastError.slice(0, 60)}</dd>
                </div>
              ) : null}
            </dl>
            <button className="btn btn-sm" type="button" onClick={onRefresh} style={{ marginTop: 14 }}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </section>
      </div>

      <div className="account-grid" style={{ marginTop: 16 }}>
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Integrations</h2>
              <p>Where release alerts are delivered.</p>
            </div>
          </div>
          <div className="card-body">
            <dl className="kv">
              <div className="kv-row">
                <dt>Discord</dt>
                <dd>
                  <Pill kind={overview.integrations?.discord?.enabled ? 'success' : ''}>
                    {overview.integrations?.discord?.enabled ? 'Enabled' : 'Disabled'}
                  </Pill>
                </dd>
              </div>
              <div className="kv-row">
                <dt>Discord webhook</dt>
                <dd>{overview.integrations?.discord?.configured ? 'Configured' : 'Missing'}</dd>
              </div>
              <div className="kv-row">
                <dt>Telegram</dt>
                <dd>
                  <Pill kind={overview.integrations?.telegram?.enabled ? 'success' : ''}>
                    {overview.integrations?.telegram?.enabled ? 'Enabled' : 'Disabled'}
                  </Pill>
                </dd>
              </div>
              <div className="kv-row">
                <dt>Telegram bot</dt>
                <dd>{overview.integrations?.telegram?.botUsername ? `@${overview.integrations.telegram.botUsername}` : 'Not set'}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Backups</h2>
              <p>Snapshots of the SQLite database.</p>
            </div>
          </div>
          <div className="card-body">
            <dl className="kv">
              <div className="kv-row">
                <dt>Total snapshots</dt>
                <dd>{overview.backups?.total || 0}</dd>
              </div>
              <div className="kv-row">
                <dt>Completed</dt>
                <dd>{overview.backups?.completed || 0}</dd>
              </div>
              <div className="kv-row">
                <dt>Failed</dt>
                <dd>{overview.backups?.failed || 0}</dd>
              </div>
              <div className="kv-row">
                <dt>Latest snapshot</dt>
                <dd>{overview.backups?.latest ? absolute(overview.backups.latest.createdAt) : 'none'}</dd>
              </div>
              <div className="kv-row">
                <dt>Latest size</dt>
                <dd>{bytes(overview.backups?.latestSizeBytes || 0)}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>
    </>
  );
}

function WorkspacePanel({ settings, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  if (!form) return null;

  const save = async () => {
    setBusy(true);
    try {
      const result = await api('/api/admin/settings', { method: 'PUT', body: form });
      onSaved(result.settings);
      toast.success('Workspace settings saved.');
    } catch (issue) {
      toast.error(issue.message || 'Could not save the workspace settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Workspace settings</h2>
          <p>Defaults that apply to every user in this LePatch installation.</p>
        </div>
      </div>
      <div className="card-body" style={{ display: 'grid', gap: 18 }}>
        <div className="account-grid" style={{ gap: 14 }}>
          <Field label="Default check interval" hint="minutes between release checks">
            <input
              className="input"
              type="number"
              min="5"
              max="43200"
              value={form.defaultCheckIntervalMinutes}
              onChange={event => setForm({ ...form, defaultCheckIntervalMinutes: Number(event.target.value) })}
            />
          </Field>
          <Field label="Maximum watched repositories" hint="0 means no limit">
            <input
              className="input"
              type="number"
              min="0"
              max="10000"
              value={form.maxWatchedApps}
              onChange={event => setForm({ ...form, maxWatchedApps: Number(event.target.value) })}
            />
          </Field>
          <Field label="Release feed size" hint="entries shown in the feed">
            <input
              className="input"
              type="number"
              min="5"
              max="200"
              value={form.releaseFeedSize}
              onChange={event => setForm({ ...form, releaseFeedSize: Number(event.target.value) })}
            />
          </Field>
          <div className="field">
            <span>Pre-releases</span>
            <label className="switch" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={form.allowPrereleaseByDefault} onChange={event => setForm({ ...form, allowPrereleaseByDefault: event.target.checked })} />
              <span>Watch pre-releases by default</span>
            </label>
          </div>
        </div>

        <Field label="Maintenance notice" hint="shown to every signed-in user, leave empty for none">
          <textarea
            className="textarea"
            rows={3}
            maxLength={280}
            value={form.maintenanceNotice}
            onChange={event => setForm({ ...form, maintenanceNotice: event.target.value })}
            placeholder="Scheduled maintenance tonight at 22:00 UTC."
          />
        </Field>

        <div>
          <button className="btn btn-primary" type="button" onClick={save} disabled={busy}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Save workspace settings
          </button>
        </div>
      </div>
    </section>
  );
}

function IntegrationsPanel() {
  const toast = useToast();
  const [integrations, setIntegrations] = useState({ discord: {}, telegram: {} });
  const [forms, setForms] = useState({ discord: { webhookUrl: '', enabled: false }, telegram: { botToken: '', chatId: '', webhookSecret: '', botUsername: '', botName: '', enabled: false } });
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api('/api/integrations');
      setIntegrations(data);
      setForms(current => ({
        discord: { ...current.discord, enabled: Boolean(data.discord?.enabled) },
        telegram: {
          ...current.telegram,
          enabled: Boolean(data.telegram?.enabled),
          botUsername: data.telegram?.botUsername || current.telegram.botUsername,
          botName: data.telegram?.botName || current.telegram.botName,
        },
      }));
    } catch (issue) {
      toast.error(issue.message || 'Could not load the integration settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async provider => {
    setBusy(provider);
    try {
      const form = forms[provider];
      const payload = { enabled: form.enabled };
      if (provider === 'discord' && form.webhookUrl.trim()) payload.webhookUrl = form.webhookUrl.trim();
      if (provider === 'telegram' && form.botToken.trim()) payload.botToken = form.botToken.trim();
      if (provider === 'telegram' && form.chatId.trim()) payload.chatId = form.chatId.trim();
      if (provider === 'telegram' && form.webhookSecret.trim()) payload.webhookSecret = form.webhookSecret.trim();
      if (provider === 'telegram' && form.botUsername.trim()) payload.botUsername = form.botUsername.trim();
      if (provider === 'telegram' && form.botName.trim()) payload.botName = form.botName.trim();
      await api(`/api/integrations/${provider}`, { method: 'PUT', body: payload });
      setForms(current => ({ ...current, [provider]: { ...current[provider], webhookUrl: '', botToken: '', chatId: '', webhookSecret: '' } }));
      toast.success(`${provider === 'discord' ? 'Discord' : 'Telegram'} settings saved securely.`);
      await load();
    } catch (issue) {
      toast.error(issue.message || 'Could not save the integration settings.');
    } finally {
      setBusy('');
    }
  };

  const test = async provider => {
    setBusy(`${provider}-test`);
    try {
      await api('/api/notifications/test', { method: 'POST', body: { provider } });
      toast.success(`Test message sent through ${provider === 'discord' ? 'Discord' : 'Telegram'}.`);
    } catch (issue) {
      toast.error(issue.message || 'The test message failed.');
    } finally {
      setBusy('');
    }
  };

  const remove = async provider => {
    setBusy(`${provider}-clear`);
    try {
      await api(`/api/integrations/${provider}`, { method: 'DELETE' });
      toast.success(`${provider === 'discord' ? 'Discord' : 'Telegram'} credentials removed.`);
      await load();
    } catch (issue) {
      toast.error(issue.message || 'Could not remove the integration.');
    } finally {
      setBusy('');
    }
  };

  const registerWebhook = async () => {
    setBusy('telegram-webhook');
    try {
      await api('/api/integrations/telegram/webhook', { method: 'POST' });
      toast.success('Telegram webhook registered. Bot messages can now link accounts.');
    } catch (issue) {
      toast.error(issue.message || 'Could not register the Telegram webhook.');
    } finally {
      setBusy('');
    }
  };

  const field = (provider, key) => event => setForms(current => ({ ...current, [provider]: { ...current[provider], [key]: event.target.value } }));

  return (
    <div className="admin-panel">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Discord notifications</h2>
            <p>Send release updates to a Discord webhook.</p>
          </div>
          <Pill kind={integrations.discord?.enabled ? 'success' : ''}>{integrations.discord?.enabled ? 'Enabled' : 'Disabled'}</Pill>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 16 }}>
          {loading ? (
            <span className="loading-line">Loading saved settings…</span>
          ) : (
            <>
              <Field label="Webhook URL" hint={integrations.discord?.configured ? 'Configured securely · enter a replacement to rotate' : 'https://discord.com/api/webhooks/…'}>
                <input className="input" type="password" autoComplete="new-password" value={forms.discord.webhookUrl} onChange={field('discord', 'webhookUrl')} placeholder={integrations.discord?.configured ? 'Configured securely' : 'https://discord.com/api/webhooks/…'} />
              </Field>
              <label className="switch">
                <input type="checkbox" checked={forms.discord.enabled} onChange={event => setForms(current => ({ ...current, discord: { ...current.discord, enabled: event.target.checked } }))} />
                <span>Enable delivery</span>
              </label>
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                <button className="btn" type="button" onClick={() => test('discord')} disabled={busy !== '' || !integrations.discord?.configured}>
                  Send test
                </button>
                <button className="btn btn-primary" type="button" onClick={() => save('discord')} disabled={busy !== ''}>
                  {busy === 'discord' ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Save settings
                </button>
                {integrations.discord?.configured ? (
                  <button className="btn btn-danger" type="button" onClick={() => remove('discord')} disabled={busy !== ''}>
                    Remove
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Telegram notifications</h2>
            <p>Send notifications through a Telegram bot. The webhook receives bot messages for account linking.</p>
          </div>
          <Pill kind={integrations.telegram?.enabled ? 'success' : ''}>{integrations.telegram?.enabled ? 'Enabled' : 'Disabled'}</Pill>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 16 }}>
          {loading ? (
            <span className="loading-line">Loading saved settings…</span>
          ) : (
            <>
              <div className="account-grid" style={{ gap: 14 }}>
                <Field label="Bot token" hint={integrations.telegram?.configured ? 'Configured securely' : 'From @BotFather'}>
                  <input className="input" type="password" autoComplete="new-password" value={forms.telegram.botToken} onChange={field('telegram', 'botToken')} placeholder={integrations.telegram?.configured ? 'Configured securely' : 'Bot token from @BotFather'} />
                </Field>
                <Field label="Bot username">
                  <input className="input" value={forms.telegram.botUsername} onChange={field('telegram', 'botUsername')} placeholder="YourBotName (without @)" />
                </Field>
                <Field label="Bot display name">
                  <input className="input" value={forms.telegram.botName} onChange={field('telegram', 'botName')} placeholder="LePatch" />
                </Field>
                <Field label="Webhook secret" hint="validates incoming Telegram updates">
                  <input className="input" type="password" autoComplete="new-password" value={forms.telegram.webhookSecret} onChange={field('telegram', 'webhookSecret')} placeholder="Secret" />
                </Field>
                <Field label="Default chat ID" hint={integrations.telegram?.defaultRecipientConfigured ? 'A default recipient is configured' : 'Optional fallback recipient'}>
                  <input className="input" value={forms.telegram.chatId} onChange={field('telegram', 'chatId')} placeholder="Optional fallback recipient" />
                </Field>
              </div>
              <label className="switch">
                <input type="checkbox" checked={forms.telegram.enabled} onChange={event => setForms(current => ({ ...current, telegram: { ...current.telegram, enabled: event.target.checked } }))} />
                <span>Enable delivery</span>
              </label>
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                <button className="btn" type="button" onClick={() => test('telegram')} disabled={busy !== '' || !integrations.telegram?.configured}>
                  Send test
                </button>
                <button className="btn" type="button" onClick={registerWebhook} disabled={busy !== ''}>
                  Register webhook
                </button>
                <button className="btn btn-primary" type="button" onClick={() => save('telegram')} disabled={busy !== ''}>
                  {busy === 'telegram' ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Save settings
                </button>
                {integrations.telegram?.configured ? (
                  <button className="btn btn-danger" type="button" onClick={() => remove('telegram')} disabled={busy !== ''}>
                    Remove
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </section>

      <p className="release-meta">
        <TriangleAlert size={13} /> Integration credentials are encrypted before they are stored.
      </p>
    </div>
  );
}

function UsersPanel() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'user' });
  const [busy, setBusy] = useState('');
  const [removeUser, setRemoveUser] = useState(null);

  const load = async () => {
    try {
      const data = await api('/api/users?perPage=100');
      setUsers(data.users || []);
    } catch (issue) {
      toast.error(issue.message || 'Could not load the users.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async event => {
    event.preventDefault();
    setBusy('create');
    try {
      await api('/api/users', { method: 'POST', body: newUser });
      setNewUser({ name: '', email: '', password: '', role: 'user' });
      toast.success('User created. They will enrol an authenticator at first sign-in.');
      await load();
    } catch (issue) {
      toast.error(issue.message || 'Could not create the user.');
    } finally {
      setBusy('');
    }
  };

  const changeRole = async (user, role) => {
    try {
      await api(`/api/users/${user.id}`, { method: 'PATCH', body: { role } });
      toast.success(`Updated ${user.email}.`);
      await load();
    } catch (issue) {
      toast.error(issue.message || 'Could not update the role.');
    }
  };

  const resetPassword = async user => {
    const password = window.prompt(`New temporary password for ${user.email} (at least 10 characters)`);
    if (!password) return;
    try {
      await api(`/api/users/${user.id}/password`, { method: 'POST', body: { password } });
      toast.success(`Password reset for ${user.email}.`);
    } catch (issue) {
      toast.error(issue.message || 'Could not reset the password.');
    }
  };

  const confirmRemove = async () => {
    if (!removeUser) return;
    setBusy('remove');
    try {
      await api(`/api/users/${removeUser.id}`, { method: 'DELETE' });
      toast.success(`${removeUser.email} deleted.`);
      setRemoveUser(null);
      await load();
    } catch (issue) {
      toast.error(issue.message || 'Could not delete the user.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Users and roles</h2>
          <p>Manage workspace access. Every new user enrols an authenticator at first sign-in.</p>
        </div>
        <Pill>{users.length} users</Pill>
      </div>

      <div className="card-body">
        <form className="user-create-form" onSubmit={create}>
          <input className="input" required placeholder="Name" value={newUser.name} onChange={event => setNewUser(current => ({ ...current, name: event.target.value }))} />
          <input className="input" required type="email" placeholder="Email" value={newUser.email} onChange={event => setNewUser(current => ({ ...current, email: event.target.value }))} />
          <input className="input" required type="password" minLength={10} placeholder="Temporary password" value={newUser.password} onChange={event => setNewUser(current => ({ ...current, password: event.target.value }))} />
          <select className="select" value={newUser.role} onChange={event => setNewUser(current => ({ ...current, role: event.target.value }))}>
            <option value="user">User</option>
            <option value="moderator">Moderator</option>
            <option value="restricted">Restricted</option>
            <option value="administrator">Administrator</option>
          </select>
          <button className="btn btn-primary" type="submit" disabled={busy === 'create' || !newUser.name || !newUser.email || newUser.password.length < 10}>
            <Plus size={15} /> Add
          </button>
        </form>

        <div className="user-table-wrap">
          <table className="data-table user-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Security</th>
                <th>Repos</th>
                <th>Sessions</th>
                <th>Role</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>
                    <span className="user-cell">
                      <b>{user.name}</b>
                      <span>{user.email}</span>
                    </span>
                  </td>
                  <td>
                    <Pill kind={user.mfaEnabled ? 'success' : 'danger'}>{user.mfaEnabled ? 'MFA on' : 'MFA required'}</Pill>
                  </td>
                  <td>{user.watchedApps ?? 0}</td>
                  <td>{user.activeSessions ?? 0}</td>
                  <td>
                    <select className="select" style={{ minWidth: 130 }} value={user.role} onChange={event => changeRole(user, event.target.value)} aria-label={`Role for ${user.email}`}>
                      <option value="user">User</option>
                      <option value="moderator">Moderator</option>
                      <option value="restricted">Restricted</option>
                      <option value="administrator">Administrator</option>
                    </select>
                  </td>
                  <td>
                    <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                      <button className="row-action" type="button" title="Reset password" onClick={() => resetPassword(user)}>
                        <KeyRound size={14} />
                      </button>
                      <button className="row-action is-danger" type="button" title="Delete user" onClick={() => setRemoveUser(user)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="user-cards">
          {users.map(user => (
            <article className="user-card" key={user.id}>
              <div className="user-card-head">
                <div className="user-cell">
                  <b>{user.name}</b>
                  <span>{user.email}</span>
                </div>
                <Pill kind={user.mfaEnabled ? 'success' : 'danger'}>{user.mfaEnabled ? 'MFA on' : 'MFA required'}</Pill>
              </div>
              <div className="user-card-stats">
                <span>
                  <b>{user.watchedApps ?? 0}</b> repos
                </span>
                <span>
                  <b>{user.activeSessions ?? 0}</b> sessions
                </span>
              </div>
              <div className="user-card-foot">
                <select className="select" value={user.role} onChange={event => changeRole(user, event.target.value)} aria-label={`Role for ${user.email}`}>
                  <option value="user">User</option>
                  <option value="moderator">Moderator</option>
                  <option value="restricted">Restricted</option>
                  <option value="administrator">Administrator</option>
                </select>
                <button className="row-action" type="button" title="Reset password" onClick={() => resetPassword(user)}>
                  <KeyRound size={14} />
                </button>
                <button className="row-action is-danger" type="button" title="Delete user" onClick={() => setRemoveUser(user)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>

        {!users.length ? <EmptyState icon={Users} title="No users found" description="Create the first account to get started." /> : null}
      </div>

      <ConfirmDialog
        open={Boolean(removeUser)}
        title="Delete this user?"
        description={`${removeUser?.email || ''} and their account data will be removed permanently.`}
        confirmLabel="Delete user"
        destructive
        busy={busy === 'remove'}
        onConfirm={confirmRemove}
        onClose={() => setRemoveUser(null)}
      />
    </section>
  );
}

function QueuesPanel() {
  const toast = useToast();
  const [queues, setQueues] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setQueues(await api('/api/admin/queues'));
    } catch (issue) {
      toast.error(issue.message || 'Could not load the delivery queues.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = async () => {
    setBusy(true);
    try {
      const result = await api('/api/admin/queues/retry', { method: 'POST', body: {} });
      toast.success(`${result.requeued} failed deliveries returned to the queue.`);
      await load();
    } catch (issue) {
      toast.error(issue.message || 'Could not requeue the failed deliveries.');
    } finally {
      setBusy(false);
    }
  };

  if (!queues) return <LoadingLine>Loading queue health…</LoadingLine>;

  return (
    <div className="admin-panel">
      <div className="stat-grid">
        <Stat label="Pending" value={compact(queues.pending)} hint="waiting to send" icon={Boxes} />
        <Stat label="Sent" value={compact(queues.sent)} hint="delivered" icon={Check} />
        <Stat label="Failed" value={compact(queues.failed)} hint="need a retry" icon={TriangleAlert} />
        <Stat label="Check queue" value={`${queues.worker?.queueDepth || 0}`} hint={`of ${queues.worker?.queueCapacity || 0} slots`} icon={Activity} />
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Failed deliveries</h2>
            <p>Alerts that could not be delivered. Retrying puts them back on the queue.</p>
          </div>
          <button className="btn btn-primary btn-sm" type="button" onClick={retry} disabled={busy || !queues.failed}>
            {busy ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />} Retry failed
          </button>
        </div>
        <div className="list">
          {queues.failures?.length ? (
            queues.failures.map(failure => (
              <div className="list-row" key={failure.id}>
                <TriangleAlert size={16} style={{ color: 'var(--danger)' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ fontSize: 'var(--text-sm)' }}>
                    {failure.repoFullName} {failure.tagName}
                  </b>
                  <div className="release-meta">
                    <span>{elapsed(failure.createdAt)}</span>
                    {failure.error ? <span style={{ color: 'var(--danger)' }}>{failure.error.slice(0, 80)}</span> : null}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState icon={Check} title="No failed deliveries" description="Every alert so far has been delivered successfully." />
          )}
        </div>
      </section>
    </div>
  );
}

function BackupsPanel() {
  const toast = useToast();
  const [backups, setBackups] = useState([]);
  const [schedule, setSchedule] = useState({ enabled: false, time: '03:00', frequency: 'daily', dayOfWeek: '0', dayOfMonth: 1 });
  const [busy, setBusy] = useState('');
  const [removeBackup, setRemoveBackup] = useState(null);

  const load = async () => {
    try {
      const [backupData, scheduleData] = await Promise.all([api('/api/admin/backups'), api('/api/admin/backup-schedule')]);
      setBackups(backupData.backups || []);
      setSchedule(scheduleData);
    } catch (issue) {
      toast.error(issue.message || 'Could not load the backup settings.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    setBusy('create');
    try {
      await api('/api/admin/backups', { method: 'POST' });
      toast.success('Database backup completed.');
      await load();
    } catch (issue) {
      toast.error(issue.message || 'Could not create the backup.');
    } finally {
      setBusy('');
    }
  };

  const saveSchedule = async () => {
    setBusy('schedule');
    try {
      await api('/api/admin/backup-schedule', { method: 'PUT', body: { ...schedule, dayOfMonth: Number(schedule.dayOfMonth) } });
      toast.success('Backup schedule saved.');
    } catch (issue) {
      toast.error(issue.message || 'Could not save the backup schedule.');
    } finally {
      setBusy('');
    }
  };

  const confirmRemove = async () => {
    if (!removeBackup) return;
    try {
      await api(`/api/admin/backups/${removeBackup.id}`, { method: 'DELETE' });
      toast.success('Backup deleted.');
      setRemoveBackup(null);
      await load();
    } catch (issue) {
      toast.error(issue.message || 'Could not delete the backup.');
    }
  };

  return (
    <div className="admin-panel">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Scheduled backups</h2>
            <p>Runs in the Europe/London timezone and keeps the five latest snapshots.</p>
          </div>
          <label className="switch">
            <input type="checkbox" checked={schedule.enabled} onChange={event => setSchedule({ ...schedule, enabled: event.target.checked })} />
            <span>Enabled</span>
          </label>
        </div>
        <div className="card-body">
          <div className="account-grid" style={{ gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <Field label="Time">
              <input className="input" type="time" value={schedule.time} onChange={event => setSchedule({ ...schedule, time: event.target.value })} />
            </Field>
            <Field label="Frequency">
              <select className="select" value={schedule.frequency} onChange={event => setSchedule({ ...schedule, frequency: event.target.value })}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
            {schedule.frequency === 'weekly' ? (
              <Field label="Day">
                <select className="select" value={schedule.dayOfWeek} onChange={event => setSchedule({ ...schedule, dayOfWeek: event.target.value })}>
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {schedule.frequency === 'monthly' ? (
              <Field label="Day of month">
                <input className="input" type="number" min="1" max="31" value={schedule.dayOfMonth} onChange={event => setSchedule({ ...schedule, dayOfMonth: event.target.value })} />
              </Field>
            ) : null}
          </div>
          <button className="btn btn-primary" type="button" style={{ marginTop: 14 }} onClick={saveSchedule} disabled={busy === 'schedule'}>
            {busy === 'schedule' ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Save schedule
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Database backups</h2>
            <p>Create and download a consistent SQLite snapshot.</p>
          </div>
          <button className="btn btn-primary btn-sm" type="button" onClick={create} disabled={busy === 'create'}>
            {busy === 'create' ? <LoaderCircle size={14} className="spin" /> : <Plus size={14} />} Create backup
          </button>
        </div>
        <div className="list">
          {backups.length ? (
            backups.map(backup => (
              <div className="list-row" key={backup.id}>
                <HardDrive size={16} style={{ color: 'var(--fg-subtle)' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ fontSize: 'var(--text-sm)' }}>{backup.filename}</b>
                  <div className="release-meta">
                    <span>{backup.status}</span>
                    <span>·</span>
                    <span>{backup.sizeBytes ? bytes(backup.sizeBytes) : '—'}</span>
                    <span>·</span>
                    <span>{absolute(backup.createdAt)}</span>
                  </div>
                </div>
                {backup.status === 'completed' ? (
                  <a className="btn btn-sm" href={`/api/admin/backups/${backup.id}`}>
                    <Download size={13} /> Download
                  </a>
                ) : null}
                <button className="row-action is-danger" type="button" title="Delete backup" onClick={() => setRemoveBackup(backup)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          ) : (
            <EmptyState icon={Database} title="No database backups yet" description="Create a snapshot to protect your workspace data." />
          )}
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(removeBackup)}
        title="Delete this backup?"
        description={`${removeBackup?.filename || ''} will be removed from disk permanently.`}
        confirmLabel="Delete backup"
        destructive
        onConfirm={confirmRemove}
        onClose={() => setRemoveBackup(null)}
      />
    </div>
  );
}

function AuditPanel() {
  const toast = useToast();
  const [entries, setEntries] = useState([]);
  const [action, setAction] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const load = async () => {
    try {
      const params = new URLSearchParams({ perPage: '60' });
      if (action) params.set('action', action);
      const data = await api(`/api/admin/audit?${params}`);
      setEntries(data.logs || []);
    } catch (issue) {
      toast.error(issue.message || 'Could not load the audit history.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  const clear = async () => {
    try {
      await api('/api/admin/audit', { method: 'DELETE' });
      toast.success('Audit history cleared.');
      setConfirmClear(false);
      await load();
    } catch (issue) {
      toast.error(issue.message || 'Could not clear the audit history.');
    }
  };

  const actions = [...new Set(entries.map(entry => entry.action))].sort();

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Audit history</h2>
          <p>Recent account and workspace changes.</p>
        </div>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
          <select className="select" style={{ minWidth: 190 }} value={action} onChange={event => setAction(event.target.value)} aria-label="Filter by action">
            <option value="">All actions</option>
            {actions.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button className="btn btn-danger btn-sm" type="button" onClick={() => setConfirmClear(true)}>
            Clear history
          </button>
        </div>
      </div>
      <div className="list">
        {entries.length ? (
          entries.map(entry => (
            <div className="list-row" key={entry.id}>
              <ClipboardList size={16} style={{ color: 'var(--fg-subtle)' }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <b style={{ fontSize: 'var(--text-sm)' }}>{entry.action}</b>
                <div className="release-meta">
                  <span>{entry.target || entry.targetId || '—'}</span>
                </div>
              </div>
              <span className="log-when">{absolute(entry.createdAt)}</span>
            </div>
          ))
        ) : (
          <EmptyState icon={ClipboardList} title="No audit events recorded" description="Workspace changes are logged here as they happen." />
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear the audit history?"
        description="Every recorded event is deleted. This cannot be undone."
        confirmLabel="Clear history"
        destructive
        onConfirm={clear}
        onClose={() => setConfirmClear(false)}
      />
    </section>
  );
}

export function AdminPage() {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api('/api/admin/overview');
      setOverview(data);
    } catch {
      setOverview(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="admin-layout">
      <nav className="admin-nav" aria-label="Admin sections">
        {TABS.map(item => (
          <button key={item.id} type="button" className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}>
            <item.icon size={16} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="admin-panel">
        {tab === 'overview' ? <OverviewPanel overview={overview} loading={loading} onRefresh={load} /> : null}
        {tab === 'workspace' ? <WorkspacePanel settings={overview?.settings} onSaved={settings => setOverview(current => ({ ...current, settings }))} /> : null}
        {tab === 'integrations' ? <IntegrationsPanel /> : null}
        {tab === 'users' ? <UsersPanel /> : null}
        {tab === 'queues' ? <QueuesPanel /> : null}
        {tab === 'backups' ? <BackupsPanel /> : null}
        {tab === 'audit' ? <AuditPanel /> : null}
      </div>
    </div>
  );
}
