import { useState } from 'react';
import { ArrowUpRight, Check, Compass, Folder, Heart, LoaderCircle, Plus, Search, TriangleAlert } from 'lucide-react';
import { EmptyState } from '../components/ui.jsx';

export function DiscoverPage({
  mode,
  onMode,
  query,
  onQuery,
  onSearch,
  results,
  apps,
  loading,
  error,
  onWatch,
  sponsorPanels,
  onExpandSponsor,
  onOpenSponsor,
  onOpenRepo,
  onBack,
}) {
  const [searching, setSearching] = useState(false);
  const watched = new Set(apps.map(app => app.repoFullName?.toLowerCase()));
  // The repository view must never render a maintainer payload; only a
  // repository has a full name.
  const repositories = mode === 'search' ? results.filter(item => item.full_name) : results;

  const submit = async event => {
    event.preventDefault();
    setSearching(true);
    try {
      await onSearch();
    } finally {
      setSearching(false);
    }
  };

  if (mode === 'sponsors') {
    return (
      <div className="card">
        <div className="card-head">
          <div>
            <h2>People you sponsor</h2>
            <p>Maintainers whose sponsored repositories your GitHub account can reach.</p>
          </div>
          <span className="pill">{results.length} maintainers</span>
        </div>

        {error ? (
          <div className="notice notice-error" style={{ margin: 16 }}>
            <TriangleAlert size={15} />
            <span>{error}</span>
          </div>
        ) : null}

        {results.length ? (
          <div className="result-grid" style={{ padding: 8 }}>
            {results.map(person => {
              const panel = sponsorPanels[person.login];
              return (
                <article className="result-row" key={person.id || person.login} style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
                  {person.avatar_url ? (
                    <img src={person.avatar_url} alt="" width="38" height="38" style={{ borderRadius: 10, objectFit: 'cover' }} loading="lazy" />
                  ) : (
                    <div className="repo-icon is-sm">{person.login?.slice(0, 2).toUpperCase()}</div>
                  )}
                  <div className="result-main">
                    <button type="button" onClick={() => onOpenSponsor(person.login)}>
                      {person.name || person.login} <ArrowUpRight size={12} />
                    </button>
                    <p className="clamp-2">{person.bio || `@${person.login}`}</p>
                    <div className="result-meta">
                      <span>
                        <Heart size={11} /> Active sponsorship
                      </span>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      style={{ justifySelf: 'start', paddingLeft: 0, color: 'var(--accent)' }}
                      onClick={() => onExpandSponsor(person)}
                      aria-expanded={Boolean(panel?.open)}
                    >
                      {panel?.open ? 'Hide repositories' : 'Browse their repositories'}
                    </button>
                  </div>
                  <a className="btn btn-sm" href={person.html_url} target="_blank" rel="noreferrer">
                    Profile <ArrowUpRight size={12} />
                  </a>

                  {panel?.open ? (
                    <div className="sponsor-panel">
                      {panel.loading ? (
                        <div className="loading-line">
                          <LoaderCircle size={15} className="spin" /> Checking sponsorship and loading repositories…
                        </div>
                      ) : panel.error ? (
                        <div className="notice notice-error" style={{ margin: '12px 0' }}>
                          <TriangleAlert size={15} />
                          <span>{panel.error}</span>
                        </div>
                      ) : panel.items.length ? (
                        panel.items.map(repo => (
                          <div className="sponsor-panel-row" key={repo.id}>
                            <div className="sponsor-copy">
                              <button className="btn btn-ghost" type="button" style={{ padding: 0, color: 'var(--fg)' }} onClick={() => onOpenRepo(repo.full_name)}>
                                {repo.full_name}
                              </button>
                              <span className="clamp-2">{repo.description || 'No description provided.'}</span>
                              <span className="result-meta">
                                <span>★ {Number(repo.stargazers_count || 0).toLocaleString()}</span>
                                {repo.language ? <span>{repo.language}</span> : null}
                                {repo.private ? <span>Private access</span> : null}
                              </span>
                            </div>
                            <button
                              className={`btn btn-sm${watched.has(repo.full_name?.toLowerCase()) ? '' : ' btn-primary'}`}
                              type="button"
                              disabled={watched.has(repo.full_name?.toLowerCase())}
                              onClick={() => onWatch(repo.full_name)}
                            >
                              {watched.has(repo.full_name?.toLowerCase()) ? (
                                <>
                                  <Check size={13} /> Watched
                                </>
                              ) : (
                                <>
                                  <Plus size={13} /> Watch
                                </>
                              )}
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="loading-line">No public repositories found for this maintainer.</div>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Heart}
            title={loading ? 'Loading your sponsorships…' : error ? 'Sponsorships are unavailable' : 'No active sponsorships found'}
            description={error ? 'Reconnect GitHub in your account settings with read:user access, then try again.' : 'Connect the GitHub account you use to sponsor maintainers.'}
          />
        )}
      </div>
    );
  }

  if (mode === 'owned') {
    return <OwnedRepositories repos={results} apps={apps} onOpenRepo={onOpenRepo} onWatch={onWatch} onBack={onBack} loading={loading} error={error} />;
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Repository search</h2>
          <p>Find a GitHub project to follow and start tracking its releases.</p>
        </div>
      </div>
      <div style={{ padding: '0 16px 16px' }}>
        <form className="search-bar" onSubmit={submit}>
          <Search size={17} />
          <input value={query} onChange={event => onQuery(event.target.value)} placeholder="Search GitHub repositories" aria-label="Repository search" />
          <button className="btn btn-primary" type="submit" disabled={loading || !query.trim()}>
            {loading ? <LoaderCircle size={14} className="spin" /> : <Search size={14} />} Search
          </button>
        </form>

        {error ? (
          <div className="notice notice-error" style={{ marginBottom: 14 }}>
            <TriangleAlert size={15} />
            <span>{error}</span>
          </div>
        ) : null}

        {repositories.length ? (
          <div className="result-grid">
            {repositories.map(repo => (
              <article className="result-row" key={repo.id}>
                <img src={repo.owner?.avatar_url || ''} alt="" width="38" height="38" style={{ borderRadius: 10, objectFit: 'cover' }} loading="lazy" />
                <div className="result-main">
                  <a href={repo.html_url} target="_blank" rel="noreferrer">
                    {repo.full_name} <ArrowUpRight size={12} />
                  </a>
                  <p className="clamp-2">{repo.description || 'No description provided.'}</p>
                  <div className="result-meta">
                    <span>★ {Number(repo.stargazers_count || 0).toLocaleString()}</span>
                    {repo.language ? <span>{repo.language}</span> : null}
                    {repo.license?.spdx_id ? <span>{repo.license.spdx_id}</span> : null}
                  </div>
                </div>
                <button
                  className={`btn btn-sm${watched.has(repo.full_name?.toLowerCase()) ? '' : ' btn-primary'}`}
                  type="button"
                  disabled={watched.has(repo.full_name?.toLowerCase())}
                  onClick={() => onWatch(repo.full_name)}
                >
                  {watched.has(repo.full_name?.toLowerCase()) ? (
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
            icon={Compass}
            title={loading ? 'Searching GitHub…' : 'Search repositories on GitHub'}
            description={loading ? 'Results will appear here.' : 'Try a project name, language or topic to find something to watch.'}
          />
        )}
      </div>
    </div>
  );
}

function OwnedRepositories({ repos, apps, onOpenRepo, onWatch, loading, error }) {
  const watched = new Set(apps.map(item => item.repoFullName?.toLowerCase()));
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Repositories you own</h2>
          <p>Connected to the GitHub account linked to your LePatch profile.</p>
        </div>
        <span className="pill">{repos.length} repositories</span>
      </div>
      <div style={{ padding: '0 16px 16px' }}>
        {error ? (
          <div className="notice notice-error" style={{ marginBottom: 14 }}>
            <TriangleAlert size={15} />
            <span>{error}</span>
          </div>
        ) : null}
        {repos.length ? (
          <div className="result-grid">
            {repos.map(repo => (
              <article className="result-row" key={repo.id}>
                <img src={repo.owner?.avatar_url || ''} alt="" width="38" height="38" style={{ borderRadius: 10, objectFit: 'cover' }} loading="lazy" />
                <div className="result-main">
                  <button type="button" onClick={() => onOpenRepo(repo.full_name)}>
                    {repo.full_name} <ArrowUpRight size={12} />
                  </button>
                  <p className="clamp-2">{repo.description || 'No description provided.'}</p>
                  <div className="result-meta">
                    <span>{repo.private ? 'Private' : 'Public'}</span>
                    {repo.language ? <span>{repo.language}</span> : null}
                    <span>★ {Number(repo.stargazers_count || 0).toLocaleString()}</span>
                  </div>
                </div>
                <button
                  className={`btn btn-sm${watched.has(repo.full_name?.toLowerCase()) ? '' : ' btn-primary'}`}
                  type="button"
                  disabled={watched.has(repo.full_name?.toLowerCase())}
                  onClick={() => onWatch(repo.full_name)}
                >
                  {watched.has(repo.full_name?.toLowerCase()) ? 'Watched' : 'Watch'}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Folder}
            title={loading ? 'Loading your repositories…' : 'No repositories available'}
            description="Connect GitHub with repository access to browse your files and releases."
          />
        )}
      </div>
    </div>
  );
}
