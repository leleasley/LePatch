import { useState } from 'react';
import { Check, Copy, GitBranch, KeyRound, LoaderCircle, TriangleAlert } from 'lucide-react';
import { OtpInput } from '../components/OtpInput.jsx';

export function AuthPage({ screen, notice, setupInfo, backupCodes, onLogin, onPasskey, onFirstSetup, onMFA, onSetup, onComplete, onBack }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const codeReady = recoveryMode ? code.trim().length >= 6 : code.length === 6;

  const submit = async event => {
    event.preventDefault();
    setWorking(true);
    try {
      if (screen === 'first-setup') await onFirstSetup(email, password, confirmPassword);
      else if (screen === 'login') await onLogin(email, password);
      else if (screen === 'mfa') await onMFA(code);
      else await onSetup(code);
    } finally {
      setWorking(false);
    }
  };

  const copyCodes = async () => {
    await navigator.clipboard?.writeText(backupCodes.join('\n'));
    setCopied(true);
  };

  return (
    <div className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <img src="/assets/Logo.png" alt="" />
          <span>LePatch</span>
        </div>

        {screen === 'first-setup' ? (
          <>
            <span className="kicker">first run</span>
            <h1>Set up your workspace</h1>
            <p>Create the initial administrator. You will set up two factor sign in next.</p>
            {notice ? (
              <div className="notice notice-error">
                <TriangleAlert size={15} />
                <span>{notice}</span>
              </div>
            ) : null}
            <form onSubmit={submit} className="auth-form">
              <label className="field">
                <span>Administrator email</span>
                <input className="input" required autoComplete="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
              </label>
              <label className="field">
                <span>Password</span>
                <input className="input" required minLength={10} autoComplete="new-password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 10 characters" />
              </label>
              <label className="field">
                <span>Confirm password</span>
                <input className="input" required minLength={10} autoComplete="new-password" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Enter it again" />
              </label>
              <button className="btn btn-primary" type="submit" disabled={working}>
                {working ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Create administrator
              </button>
            </form>
          </>
        ) : null}

        {screen === 'login' ? (
          <>
            <span className="kicker">release monitor</span>
            <h1>Welcome back</h1>
            <p>Sign in to your LePatch workspace.</p>
            {notice ? (
              <div className="notice notice-error">
                <TriangleAlert size={15} />
                <span>{notice}</span>
              </div>
            ) : null}
            <form onSubmit={submit} className="auth-form">
              <label className="field">
                <span>Email address</span>
                <input className="input" required autoComplete="username" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
              </label>
              <label className="field">
                <span>Password</span>
                <input className="input" required autoComplete="current-password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Your password" />
              </label>
              <button className="btn btn-primary" type="submit" disabled={working}>
                {working ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Sign in
              </button>
            </form>
            <button className="btn" type="button" style={{ marginTop: 12, width: '100%' }} onClick={onPasskey}>
              <KeyRound size={15} /> Sign in with a passkey
            </button>
            <div className="auth-divider">
              <span>or continue with</span>
            </div>
            <a className="btn" style={{ width: '100%' }} href="/api/auth/github?mode=login">
              <GitBranch size={15} /> GitHub
            </a>
            <a className="link-row" style={{ justifyContent: 'center', fontSize: 'var(--text-xs)' }} href="/api/auth/github?mode=mfa-recovery">
              Lost your authenticator? Recover with your linked GitHub account
            </a>
          </>
        ) : null}

        {screen === 'mfa' ? (
          <>
            <span className="kicker">account security</span>
            <h1>Verify it is you</h1>
            <p>
              {recoveryMode
                ? 'Enter one of the recovery codes you saved when you set up two factor sign in.'
                : 'Enter the six digit code from your authenticator app.'}
            </p>
            {notice ? (
              <div className="notice notice-error">
                <TriangleAlert size={15} />
                <span>{notice}</span>
              </div>
            ) : null}
            <form onSubmit={submit} className="auth-form">
              {recoveryMode ? (
                <label className="field">
                  <span>Recovery code</span>
                  <input
                    className="input"
                    required
                    autoFocus
                    autoComplete="off"
                    value={code}
                    onChange={event => setCode(event.target.value)}
                    placeholder="Your saved recovery code"
                  />
                </label>
              ) : (
                <div className="field">
                  <span>Authentication code</span>
                  <OtpInput value={code} onChange={setCode} autoFocus label="Authentication code" />
                </div>
              )}
              <button className="btn btn-primary" type="submit" disabled={working || !codeReady}>
                {working ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Verify and sign in
              </button>
            </form>
            <button
              className="btn btn-ghost"
              type="button"
              style={{ marginTop: 10 }}
              onClick={() => {
                setRecoveryMode(value => !value);
                setCode('');
              }}
            >
              {recoveryMode ? 'Use an authenticator code' : 'Use a recovery code instead'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={onBack}>
              Back to sign in
            </button>
          </>
        ) : null}

        {screen === 'setup' && backupCodes.length === 0 ? (
          <>
            <span className="kicker">first sign in</span>
            <h1>Set up two factor sign in</h1>
            <p>LePatch requires an authenticator app to protect your account.</p>
            {notice ? (
              <div className="notice notice-error">
                <TriangleAlert size={15} />
                <span>{notice}</span>
              </div>
            ) : null}
            {!setupInfo ? (
              <div className="loading-line">
                <LoaderCircle size={16} className="spin" /> Preparing your setup key…
              </div>
            ) : (
              <>
                <div className="setup-key">
                  <span>Setup key</span>
                  <code>{setupInfo.secret}</code>
                  <small>Add this key in your authenticator app. It stays on this device.</small>
                </div>
                <form onSubmit={submit} className="auth-form">
                  <div className="field">
                    <span>Six digit code</span>
                    <OtpInput value={code} onChange={setCode} autoFocus label="Authenticator code" />
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={working || code.length !== 6}>
                    {working ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Verify and enable MFA
                  </button>
                </form>
              </>
            )}
          </>
        ) : null}

        {screen === 'setup' && backupCodes.length > 0 ? (
          <>
            <span className="kicker">save these codes</span>
            <h1>Keep recovery codes safe</h1>
            <p>Each code works once if you lose access to your authenticator.</p>
            <div className="backup-code-list">
              {backupCodes.map(item => (
                <code key={item}>{item}</code>
              ))}
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <button className="btn" type="button" onClick={copyCodes}>
                <Copy size={15} /> {copied ? 'Copied' : 'Copy recovery codes'}
              </button>
              <button className="btn btn-primary" type="button" onClick={onComplete}>
                Continue to LePatch
              </button>
            </div>
          </>
        ) : null}

        <div className="auth-foot">Secure sign in · GitHub connected account and MFA protected</div>
      </section>
    </div>
  );
}
