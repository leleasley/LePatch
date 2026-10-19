import { useState } from 'react';
import { FileClock, LoaderCircle, TriangleAlert } from 'lucide-react';
import { initials, toneFor } from '../lib/format.js';

export function RepoIcon({ name, iconUrl, size = '' }) {
  const [failed, setFailed] = useState(false);
  const tone = toneFor(name);
  return (
    <div className={`repo-icon tone-${tone} ${size}`} aria-hidden="true">
      {iconUrl && !failed ? <img src={iconUrl} alt="" loading="lazy" onError={() => setFailed(true)} /> : initials(name)}
    </div>
  );
}

export function EmptyState({ icon: Icon = FileClock, title, description, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={22} />
      </div>
      <b>{title}</b>
      {description ? <span>{description}</span> : null}
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon }) {
  return (
    <div className="stat">
      <span className="stat-label">
        {Icon ? <Icon size={12} /> : null}
        {label}
      </span>
      <span className="stat-value">{value}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

export function Field({ label, hint, children, id }) {
  return (
    <label className="field" htmlFor={id}>
      <span>
        {label}
        {hint ? <span className="field-hint"> · {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Switch({ label, checked, onChange, id }) {
  return (
    <label className="switch" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Spinner({ size = 16 }) {
  return <LoaderCircle size={size} className="spin" />;
}

export function LoadingLine({ children = 'Loading…' }) {
  return (
    <div className="loading-line">
      <Spinner />
      <span>{children}</span>
    </div>
  );
}

export function Notice({ kind = 'info', children, onDismiss }) {
  const Icon = kind === 'error' ? TriangleAlert : kind === 'success' ? FileClock : TriangleAlert;
  return (
    <div className={`notice${kind === 'error' ? ' notice-error' : kind === 'success' ? ' notice-success' : kind === 'accent' ? ' notice-accent' : ''}`}>
      <Icon size={15} />
      <span>{children}</span>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%', style }) {
  return <div className="skeleton" style={{ height, width, ...style }} />;
}

export function Pill({ kind = '', children }) {
  return <span className={`pill${kind ? ` pill-${kind}` : ''}`}>{children}</span>;
}
