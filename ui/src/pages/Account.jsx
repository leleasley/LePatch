import { useEffect, useState } from 'react';
import { Check, KeyRound, LoaderCircle, Monitor, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { absolute, elapsed } from '../lib/format.js';
import { THEMES } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { passkeysSupported, publicKeyOptions, serializeCredential } from '../lib/webauthn.js';
import { EmptyState, Field, Pill, Switch } from '../components/ui.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';

export function AccountPage({ user, onUser, onSignOut, theme, onTheme }) {
  const toast = useToast();
  const [preferences, setPreferences] = useState({ enabled: true, digestInterval: null, quietHoursStart: null, quietHoursEnd: null, timezone: 'UTC', severityFilters: [], issueComments: true });
  const [sessions, setSessions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [passkeys, setPasskeys] = useState([]);
  const [github, setGithub] = useState({ connected: false });
  const [telegram, setTelegram] = useState({ enabled: false, linked: false, botUsername: '' });
  const [telegramToken, setTelegramToken] = useState(null);
  const [name, setName] = useState(user?.name || '');
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '' });
  const [mfaProof, setMfaProof] = useState({ code: '', password: '' });
  const [busy, setBusy] = useState('');
  const [confirmDisableMfa, setConfirmDisableMfa] = useState(false);

  const load = async () => {
    setBusy('load');
    try {
      const [pref, sessionData, deviceData, passkeyData, githubData, accountData, telegramData] = await Promise.all([
        api('/api/account/notification-preferences'),
        api('/api/sessions'),
        api('/api/account/trusted-devices'),
        api('/api/account/webauthn'),
        api('/api/account/github'),
        api('/api/account'),
        api('/api/account/telegram'),
      ]);
      onUser(accountData.user);
      setName(accountData.user?.name || '');
      setPreferences(current => ({ ...current, ...pref }));
      setSessions(sessionData.sessions || []);
      setDevices(deviceData.devices || []);
      setPasskeys(passkeyData.credentials || []);
      setGithub(githubData);
      setTelegram(telegramData);
    } catch (issue) {
      toast.error(issue.message || 'Could not load your account details.');
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveProfile = async () => {
    setBusy('profile');
    try {
      const result = await api('/api/account', { method: 'PATCH', body: { name: name.trim(), theme } });
      onUser(result.user);
      toast.success('Profile updated.');
    } catch (issue) {
      toast.error(issue.message || 'Could not update your profile.');
    } finally {
      setBusy('');
    }
  };

  const savePreferences = async () => {
    setBusy('preferences');
    try {
      await api('/api/account/notification-preferences', { method: 'PUT', body: preferences });
      toast.success('Notification preferences saved.');
    } catch (issue) {
      toast.error(issue.message || 'Could not save your notification preferences.');
    } finally {
      setBusy('');
    }
  };

  const changePassword = async event => {
    event.preventDefault();
    setBusy('password');
    try {
      await api('/api/account/password', { method: 'POST', body: password });
      setPassword({ currentPassword: '', newPassword: '' });
      toast.success('Password updated.');
    } catch (issue) {
      toast.error(issue.message || 'Could not update your password.');
    } finally {
      setBusy('');
    }
  };

  const disableMfa = async () => {
    setBusy('mfa');
    try {
      await api('/api/account/mfa/disable', { method: 'POST', body: mfaProof });
      setMfaProof({ code: '', password: '' });
      setConfirmDisableMfa(false);
      await load();
      toast.success('Multi-factor authentication disabled.');
    } catch (issue) {
      toast.error(issue.message || 'Could not disable multi-factor authentication.');
    } finally {
      setBusy('');
    }
  };

  const registerPasskey = async () => {
    setBusy('passkey');
    try {
      if (!passkeysSupported()) throw new Error('Passkeys are not supported by this browser.');
      const options = await api('/api/webauthn/register/options', { method: 'POST' });
      const credential = await navigator.credentials.create({ publicKey: publicKeyOptions(options.publicKey, true) });
      if (!credential) throw new Error('Passkey registration was cancelled.');
      await api(`/api/webauthn/register/verify?flowId=${encodeURIComponent(options.flowId)}`, { method: 'POST', body: serializeCredential(credential) });
      await load();
      toast.success('Passkey registered.');
    } catch (issue) {
      toast.error(issue.message || 'Could not register the passkey.');
    } finally {
      setBusy('');
    }
  };

  const unlinkGithub = async () => {
    setBusy('github');
    try {
      await api('/api/account/github', { method: 'DELETE' });
      setGithub({ connected: false });
      toast.success('GitHub account disconnected.');
    } catch (issue) {
      toast.error(issue.message || 'Could not disconnect GitHub.');
    } finally {
      setBusy('');
    }
  };

  const createTelegramToken = async () => {
    setBusy('telegram');
    try {
      setTelegramToken(await api('/api/account/telegram', { method: 'POST', body: {} }));
      toast.success('One-time Telegram link code created.');
    } catch (issue) {
      toast.error(issue.message || 'Could not create a Telegram link code.');
    } finally {
      setBusy('');
    }
  };

  const unlinkTelegram = async () => {
    setBusy('telegram');
    try {
      await api('/api/account/telegram', { method: 'DELETE' });
      setTelegramToken(null);
      await load();
      toast.success('Telegram account disconnected.');
    } catch (issue) {
      toast.error(issue.message || 'Could not disconnect Telegram.');
    } finally {
      setBusy('');
    }
  };

  const revokeOthers = async () => {
    setBusy('sessions');
    try {
      await api('/api/sessions', { method: 'DELETE' });
      await load();
      toast.success('Other sessions signed out.');
    } catch (issue) {
      toast.error(issue.message || 'Could not sign out other sessions.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="admin-panel">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Profile</h2>
            <p>Your display name and appearance. These follow your account across devices.</p>
          </div>
          <Pill kind={user?.role === 'administrator' ? 'accent' : ''}>{user?.role || 'member'}</Pill>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 18 }}>
          <div className="profile-strip">
            <div className="repo-icon is-lg">{(user?.name || user?.email || 'LP').slice(0, 2).toUpperCase()}</div>
            <div>
              <b>{user?.name || 'LePatch user'}</b>
              <span>{user?.email}</span>
            </div>
          </div>
          <div className="account-grid" style={{ gap: 14 }}>
            <Field label="Display name" hint="Shown across the workspace">
              <input className="input" value={name} maxLength={80} onChange={event => setName(event.target.value)} />
            </Field>
            <div className="field">
              <span>Appearance</span>
              <div className="segmented" style={{ flexWrap: 'wrap' }}>
                {THEMES.map(item => (
                  <button key={item.id} type="button" className={theme === item.id ? 'is-active' : ''} onClick={() => onTheme(item.id)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" type="button" onClick={saveProfile} disabled={busy === 'profile' || !name.trim()}>
              {busy === 'profile' ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Save profile
            </button>
            <button className="btn" type="button" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </section>

      <div className="account-grid">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Notification preferences</h2>
              <p>Control when LePatch contacts you.</p>
            </div>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 16 }}>
            <Switch id="pref-enabled" label="Receive notifications" checked={preferences.enabled} onChange={value => setPreferences({ ...preferences, enabled: value })} />
            <Switch id="pref-comments" label="Notify me about comments on my raised issues" checked={preferences.issueComments} onChange={value => setPreferences({ ...preferences, issueComments: value })} />
            <Field label="Time zone" hint="Used for quiet hours and digests">
              <input className="input" value={preferences.timezone || 'UTC'} onChange={event => setPreferences({ ...preferences, timezone: event.target.value })} placeholder="UTC" />
            </Field>
            <button className="btn btn-primary" type="button" onClick={savePreferences} disabled={busy === 'preferences'}>
              {busy === 'preferences' ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Save preferences
            </button>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Security</h2>
              <p>Password, multi-factor authentication and linked accounts.</p>
            </div>
            <ShieldCheck size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 18 }}>
            <form className="form-panel" onSubmit={changePassword}>
              <Field label="Current password">
                <input className="input" type="password" autoComplete="current-password" required value={password.currentPassword} onChange={event => setPassword({ ...password, currentPassword: event.target.value })} />
              </Field>
              <Field label="New password" hint="At least 10 characters">
                <input className="input" type="password" autoComplete="new-password" minLength={10} required value={password.newPassword} onChange={event => setPassword({ ...password, newPassword: event.target.value })} />
              </Field>
              <div>
                <button className="btn btn-primary" disabled={busy === 'password' || password.newPassword.length < 10}>
                  Update password
                </button>
              </div>
            </form>

            <div className="section-head" style={{ marginBottom: 0 }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-sm)' }}>Multi-factor authentication</h2>
                <p>{user?.mfaEnabled ? 'Your account is protected with an authenticator app.' : 'MFA enrollment is required at first sign-in.'}</p>
              </div>
              <Pill kind={user?.mfaEnabled ? 'success' : 'danger'}>{user?.mfaEnabled ? 'Enabled' : 'Not enabled'}</Pill>
            </div>

            {user?.mfaEnabled ? (
              <div className="form-panel">
                <Field label="Authenticator or recovery code">
                  <input className="input" autoComplete="one-time-code" value={mfaProof.code} onChange={event => setMfaProof({ ...mfaProof, code: event.target.value })} placeholder="6 digit code" />
                </Field>
                <Field label="Or confirm with your password">
                  <input className="input" type="password" autoComplete="current-password" value={mfaProof.password} onChange={event => setMfaProof({ ...mfaProof, password: event.target.value })} />
                </Field>
                <div>
                  <button className="btn btn-danger" type="button" onClick={() => setConfirmDisableMfa(true)} disabled={!mfaProof.code && !mfaProof.password}>
                    Disable MFA
                  </button>
                </div>
              </div>
            ) : null}

            <div className="section-head" style={{ marginBottom: 0 }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-sm)' }}>GitHub connection</h2>
                <p>Used to list repositories and track the issues you opened. Private and sponsored repositories need this connection.</p>
              </div>
              <Pill kind={github.connected ? 'success' : ''}>{github.connected ? `Connected as ${github.username}` : 'Not connected'}</Pill>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="btn btn-sm" href="/api/auth/github?mode=link">
                {github.connected ? 'Reconnect GitHub' : 'Connect GitHub'}
              </a>
              {github.connected ? (
                <button className="btn btn-danger btn-sm" type="button" onClick={unlinkGithub} disabled={busy === 'github'}>
                  Disconnect
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Telegram bot access</h2>
            <p>Link your Telegram account to receive personal issue and release notifications.</p>
          </div>
          <Pill kind={telegram.linked ? 'success' : ''}>{telegram.linked ? 'Linked' : 'Not linked'}</Pill>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 14 }}>
          {telegram.enabled ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="subtle" style={{ fontSize: 'var(--text-xs)' }}>
                  {telegram.botName || (telegram.botUsername ? `@${telegram.botUsername}` : 'LePatch bot')}
                </span>
                <button className="btn btn-primary btn-sm" type="button" onClick={createTelegramToken} disabled={busy === 'telegram'}>
                  Generate link code
                </button>
                {telegram.linked ? (
                  <button className="btn btn-danger btn-sm" type="button" onClick={unlinkTelegram} disabled={busy === 'telegram'}>
                    Disconnect
                  </button>
                ) : null}
              </div>
              {telegramToken ? (
                <div className="form-panel">
                  <span className="field">
                    In Telegram, send this to @{telegramToken.botUsername}:
                  </span>
                  <code style={{ fontSize: 'var(--text-md)', color: 'var(--accent)', overflowWrap: 'anywhere' }}>/link {telegramToken.token}</code>
                  <span className="field-hint">This one-time code expires {new Date(telegramToken.expiresAt).toLocaleTimeString()}.</span>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState icon={Monitor} title="Telegram is not configured" description="An administrator needs to add the bot credentials before you can link your account." />
          )}
        </div>
      </section>

      <div className="account-grid">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Active sessions</h2>
              <p>Everywhere your account is currently signed in.</p>
            </div>
            <button className="btn btn-sm" type="button" onClick={revokeOthers} disabled={busy === 'sessions'}>
              Sign out other sessions
            </button>
          </div>
          <div className="list">
            {sessions.map(item => (
              <div className="list-row" key={item.id}>
                <Monitor size={16} style={{ color: 'var(--fg-subtle)' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ fontSize: 'var(--text-sm)' }}>{item.deviceName || item.userAgent || 'Browser session'}</b>
                  <div className="release-meta">
                    <span>Last active {elapsed(item.lastUsedAt)}</span>
                    <span>·</span>
                    <span>Expires {absolute(item.expiresAt)}</span>
                  </div>
                </div>
                {item.current ? <Pill kind="accent">This device</Pill> : null}
              </div>
            ))}
            {!sessions.length ? <EmptyState icon={Monitor} title="No sessions found" description="Sessions appear here once you sign in." /> : null}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Passkeys and trusted devices</h2>
              <p>Remove credentials you no longer use.</p>
            </div>
            <button className="btn btn-primary btn-sm" type="button" onClick={registerPasskey} disabled={busy === 'passkey'}>
              {busy === 'passkey' ? <LoaderCircle size={14} className="spin" /> : <KeyRound size={14} />} Add passkey
            </button>
          </div>
          <div className="list">
            {passkeys.map(item => (
              <div className="list-row" key={item.id}>
                <KeyRound size={16} style={{ color: 'var(--fg-subtle)' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ fontSize: 'var(--text-sm)' }}>{item.deviceName || 'Passkey'}</b>
                  <div className="release-meta">
                    <span>Added {absolute(item.createdAt)}</span>
                  </div>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  type="button"
                  onClick={async () => {
                    try {
                      await api('/api/account/webauthn', { method: 'DELETE', body: { id: item.id } });
                      await load();
                      toast.success('Passkey removed.');
                    } catch (issue) {
                      toast.error(issue.message || 'Could not remove the passkey.');
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            {devices.map(item => (
              <div className="list-row" key={item.id}>
                <Monitor size={16} style={{ color: 'var(--fg-subtle)' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ fontSize: 'var(--text-sm)' }}>{item.name || 'Trusted device'}</b>
                  <div className="release-meta">
                    <span>Expires {absolute(item.expiresAt)}</span>
                  </div>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  type="button"
                  onClick={async () => {
                    try {
                      await api('/api/account/trusted-devices', { method: 'DELETE', body: { id: item.id } });
                      await load();
                      toast.success('Trusted device removed.');
                    } catch (issue) {
                      toast.error(issue.message || 'Could not remove the trusted device.');
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            {!devices.length && !passkeys.length ? (
              <EmptyState icon={KeyRound} title="No passkeys registered" description="Add a passkey to sign in without your password." />
            ) : null}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirmDisableMfa}
        title="Disable multi-factor authentication?"
        description="Your account will be protected by a password only until you enrol again."
        confirmLabel="Disable MFA"
        destructive
        busy={busy === 'mfa'}
        onConfirm={disableMfa}
        onClose={() => setConfirmDisableMfa(false)}
      />
    </div>
  );
}
