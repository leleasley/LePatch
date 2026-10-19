import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, GitBranch, LoaderCircle, Search, TriangleAlert, X } from 'lucide-react';
import { api } from '../lib/api.js';

export function AddRepositoryDialog({ open, onClose, onAdd, existing = [] }) {
  const [term, setTerm] = useState('');
  const [choice, setChoice] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setTerm('');
      setChoice('');
      setResults([]);
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const value = term.trim();
    if (value.length < 2) {
      setResults([]);
      setSearching(false);
      setError('');
      return undefined;
    }
    setSearching(true);
    setError('');
    const timer = window.setTimeout(async () => {
      try {
        const data = await api(`/api/github/search?perPage=8&q=${encodeURIComponent(value)}`);
        setResults(data.items || []);
      } catch (issue) {
        setError(issue.message || 'Could not search GitHub.');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 320);
    return () => window.clearTimeout(timer);
  }, [open, term]);

  const watched = new Set(existing.map(item => item.repoFullName?.toLowerCase()));

  const submit = async event => {
    event.preventDefault();
    const name = (choice || term).trim();
    if (!name) return;
    setBusy(true);
    setError('');
    try {
      await onAdd(name);
    } catch (issue) {
      setError(issue.message || 'Could not add this repository.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="modal" style={{ width: 'min(100%, 560px)' }} onSubmit={submit}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div className="modal-icon">
            <GitBranch size={18} />
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <h2 style={{ marginTop: 18 }}>Watch a repository</h2>
        <p>Search GitHub, pick the right project, and LePatch will track its releases for you.</p>

        <label className="field" htmlFor="add-repo-search">
          <span>Search GitHub</span>
          <span className="input-icon">
            <Search size={16} />
            <input
              id="add-repo-search"
              autoComplete="off"
              placeholder="owner/repository"
              value={term}
              onChange={event => {
                setTerm(event.target.value);
                setChoice('');
              }}
            />
          </span>
        </label>

        {error ? (
          <div className="notice notice-error" style={{ marginTop: 12 }}>
            <TriangleAlert size={15} />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="result-grid" style={{ marginTop: 12, maxHeight: 320, overflowY: 'auto' }} aria-live="polite">
          {results.map(item => {
            const isWatched = watched.has(item.full_name?.toLowerCase());
            return (
              <button
                className="result-row"
                type="button"
                key={item.id}
                onClick={() => {
                  setChoice(item.full_name);
                  setTerm(item.full_name);
                }}
                style={choice === item.full_name ? { borderColor: 'var(--accent-line)', background: 'var(--accent-soft)' } : undefined}
              >
                <img src={item.owner?.avatar_url || ''} alt="" width="38" height="38" style={{ borderRadius: 10, objectFit: 'cover' }} />
                <span className="result-main">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {item.full_name}
                    {choice === item.full_name ? <Check size={14} /> : <ArrowUpRight size={13} />}
                  </span>
                  <span className="result-meta">
                    <span>★ {Number(item.stargazers_count || 0).toLocaleString()}</span>
                    {item.language ? <span>{item.language}</span> : null}
                    {isWatched ? <span>Already watched</span> : null}
                  </span>
                </span>
              </button>
            );
          })}
          {term.trim().length >= 2 && !searching && !results.length && !error ? (
            <div className="notice">
              <TriangleAlert size={15} />
              <span>No repositories found. You can still add an exact owner/repository name.</span>
            </div>
          ) : null}
        </div>

        <div className="modal-actions">
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy || !(choice || term).trim()}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <GitBranch size={15} />}
            Watch repository
          </button>
        </div>
      </form>
    </div>
  );
}
