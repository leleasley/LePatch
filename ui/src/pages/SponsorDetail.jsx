import { useEffect } from 'react';
import { ArrowUpRight, Check, Heart, LoaderCircle, Plus, TriangleAlert } from 'lucide-react';
import { EmptyState } from '../components/ui.jsx';
import { GitHubMark } from '../components/GitHubMark.jsx';

// The maintainer page reached from the sponsored list. It used to render the
// list again, so opening a maintainer appeared to do nothing.
export function SponsorDetailPage({ login, maintainer, panel, onLoad, watched, onWatch, onOpenRepo, onBack }) {
  useEffect(() => {
    onLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [login]);

  const name = maintainer?.name || login;
  const isWatched = fullName => watched.has(String(fullName || '').toLowerCase());

  return (
    <div className="sponsor-page">
      <button className="btn btn-ghost" type="button" onClick={onBack} style={{ marginBottom: 14 }}>
        ← Sponsored maintainers
      </button>

      <div className="sponsor-hero">
        {maintainer?.avatar_url ? (
          <img src={maintainer.avatar_url} alt="" width="56" height="56" loading="lazy" />
        ) : (
          <div className="repo-icon is-lg">{name.slice(0, 2).toUpperCase()}</div>
        )}
        <div className="sponsor-hero-copy">
          <span className="kicker">sponsored maintainer</span>
          <h2>{name}</h2>
          <a href={maintainer?.html_url || `https://github.com/${encodeURIComponent(login)}`} target="_blank" rel="noreferrer">
            @{login} <ArrowUpRight size={12} />
          </a>
          {maintainer?.bio ? <p>{maintainer.bio}</p> : null}
        </div>
        <a className="btn btn-sm" href={`https://github.com/${encodeURIComponent(login)}`} target="_blank" rel="noreferrer">
          <GitHubMark size={13} /> Profile
        </a>
      </div>

      <div className="section-head" style={{ marginTop: 22 }}>
        <div>
          <h2>Repositories</h2>
          <p>Available through your active sponsorship</p>
        </div>
        {panel?.items?.length ? <span className="pill">{panel.items.length}</span> : null}
      </div>

      {panel?.loading ? (
        <div className="loading-line">
          <LoaderCircle size={16} className="spin" /> Checking your sponsorship and loading repositories…
        </div>
      ) : panel?.error ? (
        <div className="notice notice-error">
          <TriangleAlert size={15} />
          <span>{panel.error}</span>
        </div>
      ) : panel?.items?.length ? (
        <div className="result-grid">
          {panel.items.map(repo => (
            <article className="result-row" key={repo.id}>
              <img src={repo.owner?.avatar_url || ''} alt="" width="38" height="38" style={{ borderRadius: 10, objectFit: 'cover' }} loading="lazy" />
              <div className="result-main">
                <button type="button" onClick={() => onOpenRepo(repo.full_name)}>
                  {repo.full_name} <ArrowUpRight size={12} />
                </button>
                <p className="clamp-2">{repo.description || 'No description provided.'}</p>
                <div className="result-meta">
                  <span>★ {Number(repo.stargazers_count || 0).toLocaleString()}</span>
                  {repo.language ? <span>{repo.language}</span> : null}
                  {repo.private ? <span>Private access</span> : null}
                </div>
              </div>
              <button
                className={`btn btn-sm${isWatched(repo.full_name) ? '' : ' btn-primary'}`}
                type="button"
                disabled={isWatched(repo.full_name)}
                onClick={() => onWatch(repo.full_name)}
              >
                {isWatched(repo.full_name) ? (
                  <>
                    <Check size={13} /> Watched
                  </>
                ) : (
                  <>
                    <Plus size={13} /> Watch
                  </>
                )}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Heart}
          title="No repositories are visible to this account"
          description="GitHub may not have granted this account access to the maintainer's private repositories."
        />
      )}
    </div>
  );
}
