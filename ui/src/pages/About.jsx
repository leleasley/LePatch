import { useEffect, useState } from 'react';
import { ArrowUpRight, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api.js';
import { dateOnly } from '../lib/format.js';
import { GitHubMark } from '../components/GitHubMark.jsx';

export function AboutPage() {
  const [about, setAbout] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const checkForUpdates = async () => {
    setChecking(true);
    setError('');
    try {
      setAbout(await api('/api/about'));
    } catch (issue) {
      setError(issue.message || 'Could not check for updates.');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkForUpdates();
  }, []);

  const release = about?.release;
  const parse = value => (value || '').replace(/^v/, '').split(/[.+-]/).slice(0, 3).map(part => Number(part) || 0);
  const latestIsNewer =
    release && about?.version && about.version !== 'dev'
      ? (() => {
          const current = parse(about.version);
          const latest = parse(release.tag_name);
          for (let index = 0; index < 3; index += 1) {
            if (latest[index] !== current[index]) return latest[index] > current[index];
          }
          return false;
        })()
      : false;

  return (
    <div className="admin-panel">
      {error ? (
        <div className="notice notice-error">
          <TriangleAlert size={15} />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="about-hero">
        <span className="kicker">self-hosted release monitor</span>
        <h2>LePatch</h2>
        <p>
          LePatch watches the GitHub repositories you care about, collects their releases, and pushes the news to Discord or Telegram. It runs entirely on your own hardware with a single SQLite file.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span className="pill pill-accent">Open source</span>
          <span className="pill">Self-hosted</span>
          <span className="pill">SQLite</span>
        </div>
      </section>

      <div className="account-grid">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Installed version</h2>
              <p>The version reported by the running server.</p>
            </div>
            <span className="pill">{about?.version ? `v${about.version.replace(/^v/, '')}` : 'Checking…'}</span>
          </div>
          <div className="card-body">
            <button className="btn" type="button" onClick={checkForUpdates} disabled={checking}>
              {checking ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />} Check for updates
            </button>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Latest release</h2>
              <p>The most recent published LePatch release on GitHub.</p>
            </div>
          </div>
          <div className="card-body">
            {release ? (
              <>
                <b style={{ fontSize: 'var(--text-md)' }}>{release.name || release.tag_name}</b>
                <p className="subtle" style={{ fontSize: 'var(--text-xs)', marginTop: 6, lineHeight: 1.6 }}>
                  {latestIsNewer
                    ? 'An update is ready to install.'
                    : about?.version === 'dev'
                      ? 'This is a development build. Compare it with the latest published release.'
                      : 'You are up to date.'}
                  {release.published_at ? ` Published ${dateOnly(release.published_at)}.` : ''}
                </p>
                <a className="btn btn-primary btn-sm" style={{ marginTop: 14 }} href={release.html_url} target="_blank" rel="noreferrer">
                  View release <ArrowUpRight size={13} />
                </a>
              </>
            ) : (
              <p className="subtle" style={{ fontSize: 'var(--text-xs)' }}>
                {about ? 'No GitHub release has been published yet.' : 'Checking GitHub releases…'}
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Project</h2>
            <p>Source code, changes and contribution guidelines.</p>
          </div>
          <GitHubMark size={18} className="about-github-mark" />
        </div>
        <div className="card-body">
          <a className="link-row" href="https://github.com/leleasley/LePatch" target="_blank" rel="noreferrer">
            GitHub repository <ArrowUpRight size={13} />
          </a>
          <a className="link-row" href="https://github.com/leleasley/LePatch/blob/main/CHANGELOG.md" target="_blank" rel="noreferrer">
            Changelog <ArrowUpRight size={13} />
          </a>
          <a className="link-row" href="https://github.com/leleasley/LePatch/blob/main/CONTRIBUTING.md" target="_blank" rel="noreferrer">
            Contributing <ArrowUpRight size={13} />
          </a>
          <p className="release-meta" style={{ marginTop: 14 }}>
            For a Docker install, pull the new image and restart with <code>docker compose pull lepatch &amp;&amp; docker compose up -d lepatch</code>. LePatch never replaces its own files or database.
          </p>
        </div>
      </section>
    </div>
  );
}
