import { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleDot,
  FileCode2,
  FileClock,
  GitBranch,
  GitPullRequest,
  LoaderCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  TriangleAlert,
  Workflow,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { elapsed } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { EmptyState, LoadingLine, RepoIcon } from '../components/ui.jsx';
import { MarkdownView } from '../components/Markdown.jsx';
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'releases', label: 'Releases' },
  { id: 'files', label: 'Files' },
  { id: 'commits', label: 'Commits' },
  { id: 'pulls', label: 'Pull requests' },
  { id: 'issues', label: 'Issues' },
  { id: 'branches', label: 'Branches' },
  { id: 'actions', label: 'Actions' },
];

export function RepositoryPage({ app, releases, loading, onBack, onOpenRelease, onCheck, checking, onWatch, ownedMode, readOnly }) {
  const toast = useToast();
  const [section, setSection] = useState('overview');
  const [readme, setReadme] = useState(null);
  const [readmeBusy, setReadmeBusy] = useState(false);
  const [commits, setCommits] = useState([]);
  const [files, setFiles] = useState([]);
  const [filePath, setFilePath] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [pulls, setPulls] = useState([]);
  const [branches, setBranches] = useState([]);
  const [actions, setActions] = useState([]);
  const [issues, setIssues] = useState([]);
  const [issueState, setIssueState] = useState('open');
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [issueComments, setIssueComments] = useState([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueForm, setIssueForm] = useState({ title: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const requestJSON = (path, options = {}) =>
    api(path, {
      ...options,
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
    });

  const loadFiles = async path => {
    if (!app) return;
    setBusy(true);
    setError('');
    setSelectedFile(null);
    try {
      const params = new URLSearchParams({ owner: app.repoOwner, repo: app.repoName });
      if (path) params.set('path', path);
      if (app.defaultBranch) params.set('ref', app.defaultBranch);
      const result = await requestJSON(`/api/github/contents?${params}`);
      setFiles(Array.isArray(result) ? result : []);
      setFilePath(path);
    } catch (issue) {
      setError(issue.message || 'Could not load repository files.');
    } finally {
      setBusy(false);
    }
  };

  const openFile = async file => {
    if (file.type === 'dir') {
      loadFiles(file.path);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({ owner: app.repoOwner, repo: app.repoName, path: file.path });
      if (app.defaultBranch) params.set('ref', app.defaultBranch);
      setSelectedFile(await requestJSON(`/api/github/file-content?${params}`));
    } catch (issue) {
      setError(issue.message || 'Could not load this file.');
    } finally {
      setBusy(false);
    }
  };

  const loadIssues = async () => {
    if (!app) return;
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({ owner: app.repoOwner, repo: app.repoName, perPage: '50', state: issueState, sort: 'updated', direction: 'desc' });
      const result = await requestJSON(`/api/github/issues?${params}`);
      setIssues((result || []).filter(issue => !issue.pull_request));
    } catch (issue) {
      setError(issue.message || 'Could not load repository issues.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!app) return undefined;
    let cancelled = false;
    const run = async () => {
      if (section === 'overview' && readme === null) {
        setReadmeBusy(true);
        try {
          const params = new URLSearchParams({ owner: app.repoOwner, repo: app.repoName });
          if (app.defaultBranch) params.set('ref', app.defaultBranch);
          const result = await requestJSON(`/api/github/readme?${params}`);
          if (!cancelled) setReadme(result);
        } catch {
          if (!cancelled) setReadme(null);
        } finally {
          if (!cancelled) setReadmeBusy(false);
        }
      } else if (section === 'commits' && !commits.length) {
        setBusy(true);
        try {
          const result = await requestJSON(`/api/github/commits?owner=${encodeURIComponent(app.repoOwner)}&repo=${encodeURIComponent(app.repoName)}&perPage=50`);
          if (!cancelled) setCommits(Array.isArray(result) ? result : []);
        } catch (issue) {
          if (!cancelled) setError(issue.message || 'Could not load recent commits.');
        } finally {
          if (!cancelled) setBusy(false);
        }
      } else if (section === 'files' && !files.length) {
        loadFiles('');
      } else if (section === 'pulls' && !pulls.length) {
        setBusy(true);
        try {
          const result = await requestJSON(`/api/github/pulls?owner=${encodeURIComponent(app.repoOwner)}&repo=${encodeURIComponent(app.repoName)}&state=all&perPage=50&sort=updated&direction=desc`);
          if (!cancelled) setPulls(Array.isArray(result) ? result : []);
        } catch (issue) {
          if (!cancelled) setError(issue.message || 'Could not load pull requests.');
        } finally {
          if (!cancelled) setBusy(false);
        }
      } else if (section === 'branches' && !branches.length) {
        setBusy(true);
        try {
          const result = await requestJSON(`/api/github/branches?owner=${encodeURIComponent(app.repoOwner)}&repo=${encodeURIComponent(app.repoName)}&perPage=100`);
          if (!cancelled) setBranches(Array.isArray(result) ? result : []);
        } catch (issue) {
          if (!cancelled) setError(issue.message || 'Could not load branches.');
        } finally {
          if (!cancelled) setBusy(false);
        }
      } else if (section === 'actions' && !actions.length) {
        setBusy(true);
        try {
          const result = await requestJSON(`/api/github/actions?owner=${encodeURIComponent(app.repoOwner)}&repo=${encodeURIComponent(app.repoName)}&perPage=50`);
          if (!cancelled) setActions(result.workflow_runs || []);
        } catch (issue) {
          if (!cancelled) setError(issue.message || 'Could not load workflow runs.');
        } finally {
          if (!cancelled) setBusy(false);
        }
      } else if (section === 'issues') {
        loadIssues();
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, section, issueState]);

  useEffect(() => {
    if (!app || !selectedIssue) return undefined;
    let active = true;
    const params = new URLSearchParams({ owner: app.repoOwner, repo: app.repoName, issueNumber: String(selectedIssue.number), perPage: '100' });
    const refresh = async () => {
      try {
        const comments = await requestJSON(`/api/github/issue-comments?${params}`);
        if (active) setIssueComments(Array.isArray(comments) ? comments : []);
      } catch (issue) {
        if (active) setError(issue.message || 'Could not load issue updates.');
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, selectedIssue?.number]);

  const submitIssue = async event => {
    event.preventDefault();
    if (!app || !issueForm.title.trim()) return;
    setBusy(true);
    try {
      const created = await requestJSON('/api/github/create-issue', {
        method: 'POST',
        body: JSON.stringify({ owner: app.repoOwner, repo: app.repoName, title: issueForm.title, body: issueForm.body }),
      });
      setIssueForm({ title: '', body: '' });
      setShowIssueForm(false);
      setSelectedIssue(created);
      await loadIssues();
      toast.success('Issue created.');
    } catch (issue) {
      toast.error(issue.message || 'Could not create the issue.');
    } finally {
      setBusy(false);
    }
  };

  const submitComment = async event => {
    event.preventDefault();
    if (!app || !selectedIssue || !commentDraft.trim()) return;
    setBusy(true);
    try {
      await requestJSON('/api/github/comment-issue', {
        method: 'POST',
        body: JSON.stringify({ owner: app.repoOwner, repo: app.repoName, issueNumber: selectedIssue.number, body: commentDraft }),
      });
      setCommentDraft('');
      const params = new URLSearchParams({ owner: app.repoOwner, repo: app.repoName, issueNumber: String(selectedIssue.number), perPage: '100' });
      setIssueComments(await requestJSON(`/api/github/issue-comments?${params}`));
      toast.success('Comment posted.');
    } catch (issue) {
      toast.error(issue.message || 'Could not post the comment.');
    } finally {
      setBusy(false);
    }
  };

  const changeIssueState = async () => {
    if (!app || !selectedIssue) return;
    const state = selectedIssue.state === 'open' ? 'closed' : 'open';
    setBusy(true);
    try {
      const updated = await requestJSON('/api/github/close-issue', {
        method: 'POST',
        body: JSON.stringify({ owner: app.repoOwner, repo: app.repoName, issueNumber: selectedIssue.number, state }),
      });
      setSelectedIssue(updated);
      await loadIssues();
    } catch (issue) {
      toast.error(issue.message || 'Could not update the issue.');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !app) return <LoadingLine>Loading repository…</LoadingLine>;
  if (!app) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Repository unavailable"
        description="It may have been removed, or your account may have lost access to it."
        action={
          <button className="btn" type="button" onClick={onBack}>
            Go back
          </button>
        }
      />
    );
  }

  return (
    <div>
      <button className="btn btn-ghost" type="button" onClick={onBack} style={{ marginBottom: 16 }}>
        <ArrowDownRight size={15} /> {ownedMode ? 'Your repositories' : readOnly ? 'Sponsored repositories' : 'Watched apps'}
      </button>

      <div className="repo-hero">
        <RepoIcon name={app.name} iconUrl={app.iconUrl} size="is-lg" />
        <div className="repo-hero-copy">
          <span className="kicker">{ownedMode ? 'your repository' : readOnly ? 'github repository' : 'watched repository'}</span>
          <h2>{app.name}</h2>
          <a href={app.githubUrl} target="_blank" rel="noreferrer">
            {app.repoFullName} <ArrowUpRight size={12} />
          </a>
        </div>
        {!ownedMode && !readOnly ? (
          <button className="btn btn-primary" type="button" onClick={onCheck} disabled={checking}>
            {checking ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />} Check now
          </button>
        ) : onWatch ? (
          <button className="btn btn-primary" type="button" onClick={() => onWatch(app.repoFullName)}>
            <Plus size={15} /> Watch repository
          </button>
        ) : null}
      </div>

      {app.description ? <p className="repo-description">{app.description}</p> : null}

      <div className="repo-metrics">
        <div className="stat">
          <span className="stat-label">Latest release</span>
          <span className="stat-value">{app.latestSeenTag || 'None yet'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Last checked</span>
          <span className="stat-value">{elapsed(app.lastCheckedAt)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Releases tracked</span>
          <span className="stat-value">{releases.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Default branch</span>
          <span className="stat-value" style={{ fontSize: 'var(--text-md)' }}>
            {app.defaultBranch || 'unknown'}
          </span>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Repository sections">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={section === tab.id}
            className={section === tab.id ? 'is-active' : ''}
            onClick={() => {
              setSection(tab.id);
              setSelectedIssue(null);
              setError('');
            }}
          >
            {tab.label}
            {tab.id === 'releases' && releases.length ? <span className="tab-count">{releases.length}</span> : null}
          </button>
        ))}
      </div>

      {error ? (
        <div className="notice notice-error" style={{ marginBottom: 16 }}>
          <TriangleAlert size={15} />
          <span>{error}</span>
        </div>
      ) : null}

      {section === 'overview' ? (
        <section>
          <div className="section-head">
            <div>
              <h2>README</h2>
              <p>Project documentation straight from GitHub</p>
            </div>
            <a className="btn btn-sm" href={`${app.githubUrl}#readme`} target="_blank" rel="noreferrer">
              Open on GitHub <ArrowUpRight size={13} />
            </a>
          </div>
          {readmeBusy ? (
            <LoadingLine>Loading README…</LoadingLine>
          ) : readme ? (
            <MarkdownView source={readme.content || ''} baseURL={readme.downloadUrl || readme.htmlUrl || app.githubUrl} />
          ) : (
            <EmptyState icon={FileClock} title="No README found" description="This repository does not publish a README file." />
          )}
        </section>
      ) : null}

      {section === 'releases' ? (
        <section>
          <div className="section-head">
            <div>
              <h2>Release history</h2>
              <p>Every release detected for this repository</p>
            </div>
          </div>
          <div className="card">
            {releases.length ? (
              releases.map(release => (
                <button className="release-row-item" key={release.id} type="button" onClick={() => onOpenRelease?.(release.id)}>
                  <FileClock size={16} style={{ color: 'var(--accent)' }} />
                  <div>
                    <b>{release.name || release.tagName}</b>
                    <small>
                      {release.publishedAt ? new Date(release.publishedAt).toLocaleDateString() : 'Date unavailable'}
                      {release.draft ? ' · Draft' : release.prerelease ? ' · Pre-release' : ''}
                    </small>
                  </div>
                  <code>{release.tagName}</code>
                </button>
              ))
            ) : (
              <EmptyState icon={FileClock} title="No releases found" description="Release history appears here after the next successful check." />
            )}
          </div>
        </section>
      ) : null}

      {section === 'files' ? (
        <section>
          <div className="section-head">
            <div>
              <h2>{selectedFile ? selectedFile.path : 'Repository files'}</h2>
              <p>{selectedFile ? `Default branch · ${selectedFile.sha?.slice(0, 8) || 'file'}` : 'Browse the source tree'}</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {selectedFile ? (
                <button className="btn btn-sm" type="button" onClick={() => setSelectedFile(null)}>
                  Back to files
                </button>
              ) : filePath ? (
                <button className="btn btn-sm" type="button" onClick={() => loadFiles(filePath.split('/').slice(0, -1).join('/'))}>
                  Up one level
                </button>
              ) : null}
            </div>
          </div>
          <div className="card">
            {busy ? (
              <LoadingLine>Loading repository content…</LoadingLine>
            ) : selectedFile ? (
              <div className="file-content">{selectedFile.content || 'This file is empty.'}</div>
            ) : files.length ? (
              <div className="file-list">
                {files.map(file => (
                  <button className="file-row" key={file.path} type="button" onClick={() => openFile(file)}>
                    {file.type === 'dir' ? <GitBranch size={16} className="file-icon" /> : <FileCode2 size={16} className="file-icon" />}
                    <span style={{ flex: 1, minWidth: 0 }}>{file.name}</span>
                    <span>{file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : ''}</span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon={FileCode2} title="No files to show" description="The file tree could not be loaded for this branch." />
            )}
          </div>
        </section>
      ) : null}

      {section === 'commits' ? (
        <section>
          <div className="section-head">
            <div>
              <h2>Recent commits</h2>
              <p>Latest changes pushed to the default branch</p>
            </div>
          </div>
          <div className="card">
            {busy ? (
              <LoadingLine>Loading commits…</LoadingLine>
            ) : commits.length ? (
              <div className="commit-list">
                {commits.map(commit => (
                  <article className="commit-row" key={commit.sha}>
                    {commit.author?.avatar_url ? (
                      <img src={commit.author.avatar_url} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <div className="commit-avatar">GH</div>
                    )}
                    <div className="commit-copy">
                      <a href={commit.html_url} target="_blank" rel="noreferrer">
                        {(commit.commit?.message || 'Commit').split('\n')[0]} <ArrowUpRight size={12} />
                      </a>
                      <span>
                        {commit.author?.login || commit.commit?.author?.name || 'Unknown contributor'} ·{' '}
                        {commit.commit?.author?.date ? elapsed(commit.commit.author.date) : 'recently'}
                      </span>
                    </div>
                    <code>{(commit.sha || '').slice(0, 7)}</code>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon={GitBranch} title="No commits found" description="Commit history appears here when GitHub is available." />
            )}
          </div>
        </section>
      ) : null}

      {section === 'pulls' ? (
        <section>
          <div className="section-head">
            <div>
              <h2>Pull requests</h2>
              <p>Open and recently closed changes</p>
            </div>
            <a className="btn btn-sm" href={`${app.githubUrl}/pulls`} target="_blank" rel="noreferrer">
              Open on GitHub <ArrowUpRight size={13} />
            </a>
          </div>
          <div className="card">
            {busy ? (
              <LoadingLine>Loading pull requests…</LoadingLine>
            ) : pulls.length ? (
              <div className="aux-list">
                {pulls.map(pull => (
                  <a className="aux-row" key={pull.id} href={pull.html_url} target="_blank" rel="noreferrer">
                    <GitPullRequest size={17} />
                    <span>
                      <b>{pull.title}</b>
                      <small>
                        #{pull.number} · {pull.user?.login || 'Contributor'} · {elapsed(pull.updated_at)}
                      </small>
                    </span>
                    <i className={`aux-state${pull.state === 'open' ? ' is-open' : ''}`}>{pull.merged_at ? 'Merged' : pull.state}</i>
                    <ArrowUpRight size={14} />
                  </a>
                ))}
              </div>
            ) : (
              <EmptyState icon={GitPullRequest} title="No pull requests found" description="Pull request activity will appear here." />
            )}
          </div>
        </section>
      ) : null}

      {section === 'issues' ? (
        <section>
          <div className="section-head">
            <div>
              <h2>{selectedIssue ? `Issue #${selectedIssue.number}` : 'Repository issues'}</h2>
              <p>{selectedIssue ? 'Discussion and updates' : 'Browse and raise GitHub issues'}</p>
            </div>
            {selectedIssue ? (
              <button className="btn btn-sm" type="button" onClick={() => setSelectedIssue(null)}>
                Back to issues
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" type="button" onClick={() => setShowIssueForm(value => !value)}>
                <Plus size={14} /> New issue
              </button>
            )}
          </div>

          {showIssueForm && !selectedIssue ? (
            <form className="form-panel" style={{ marginBottom: 16 }} onSubmit={submitIssue}>
              <label className="field">
                <span>Title</span>
                <input className="input" required maxLength={256} value={issueForm.title} onChange={event => setIssueForm({ ...issueForm, title: event.target.value })} placeholder="A clear summary" />
              </label>
              <label className="field">
                <span>Description</span>
                <textarea className="textarea" rows={6} value={issueForm.body} onChange={event => setIssueForm({ ...issueForm, body: event.target.value })} placeholder="What happened, and what did you expect?" />
              </label>
              <div>
                <button type="button" className="btn" onClick={() => setShowIssueForm(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" disabled={busy || !issueForm.title.trim()}>
                  Create issue
                </button>
              </div>
            </form>
          ) : null}

          {selectedIssue ? (
            <div className="card card-pad" style={{ display: 'grid', gap: 18 }}>
              <div className="release-meta">
                <span className={selectedIssue.state === 'open' ? 'pill pill-success' : 'pill'}>{selectedIssue.state === 'open' ? 'Open' : 'Closed'}</span>
                <span>Opened by {selectedIssue.user?.login || 'GitHub user'}</span>
                <span>{selectedIssue.created_at ? new Date(selectedIssue.created_at).toLocaleString() : ''}</span>
                <a href={selectedIssue.html_url} target="_blank" rel="noreferrer">
                  View on GitHub <ArrowUpRight size={12} />
                </a>
              </div>
              <MarkdownView source={selectedIssue.body || 'No description provided.'} baseURL={selectedIssue.html_url || app.githubUrl} />
              <div className="section-head" style={{ marginBottom: 0 }}>
                <div>
                  <h2>Updates</h2>
                  <p>{issueComments.length} comments</p>
                </div>
                <button className="btn btn-sm" type="button" disabled={busy} onClick={changeIssueState}>
                  {selectedIssue.state === 'open' ? 'Close issue' : 'Reopen issue'}
                </button>
              </div>
              <div className="comment-list">
                {issueComments.map(comment => (
                  <article className="comment" key={comment.id}>
                    {comment.user?.avatar_url ? <img src={comment.user.avatar_url} alt="" width="34" height="34" style={{ borderRadius: 8, objectFit: 'cover' }} loading="lazy" /> : <div className="commit-avatar">GH</div>}
                    <div>
                      <b>
                        {comment.user?.login || 'Contributor'}
                        <span>{comment.created_at ? elapsed(comment.created_at) : ''}</span>
                      </b>
                      <MarkdownView source={comment.body || ''} baseURL={selectedIssue.html_url || app.githubUrl} />
                    </div>
                  </article>
                ))}
              </div>
              <form className="form-panel" onSubmit={submitComment}>
                <label className="field" htmlFor="repo-comment">
                  <span>Add a comment</span>
                  <textarea id="repo-comment" className="textarea" rows={4} value={commentDraft} onChange={event => setCommentDraft(event.target.value)} placeholder="Share an update" />
                </label>
                <div>
                  <button className="btn btn-primary" disabled={busy || !commentDraft.trim()}>
                    {busy ? <LoaderCircle size={14} className="spin" /> : <MessageSquare size={14} />} Post comment
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="card">
              <div className="section-head" style={{ marginBottom: 0, padding: '12px 16px 0' }}>
                <div className="segmented">
                  {['open', 'closed'].map(state => (
                    <button key={state} type="button" className={issueState === state ? 'is-active' : ''} onClick={() => setIssueState(state)}>
                      {state === 'open' ? 'Open' : 'Closed'}
                    </button>
                  ))}
                </div>
              </div>
              {busy ? (
                <LoadingLine>Loading issues…</LoadingLine>
              ) : issues.length ? (
                <div className="issue-list">
                  {issues.map(issue => (
                    <article className="issue-row" key={issue.id}>
                      <CircleDot size={16} style={{ color: issue.state === 'open' ? 'var(--success)' : 'var(--fg-faint)', marginTop: 4 }} />
                      <div className="issue-main">
                        <span className="issue-repo">
                          #{issue.number}
                        </span>
                        <button className="issue-title" type="button" onClick={() => setSelectedIssue(issue)}>
                          {issue.title}
                        </button>
                        <div className="issue-meta">
                          <span>
                            <MessageSquare size={11} /> {issue.comment_count || 0} comments
                          </span>
                          <span>Opened {elapsed(issue.created_at)}</span>
                          <span>by {issue.user?.login || 'unknown'}</span>
                        </div>
                      </div>
                      <span className="issue-side">
                        <span className={issue.state === 'open' ? 'pill pill-success' : 'pill'}>{issue.state}</span>
                        <small>{elapsed(issue.updated_at)}</small>
                      </span>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState icon={CircleDot} title="No issues in this view" description="Issues opened against this repository will appear here." />
              )}
            </div>
          )}
        </section>
      ) : null}

      {section === 'branches' ? (
        <section>
          <div className="section-head">
            <div>
              <h2>Branches</h2>
              <p>Branches in this repository</p>
            </div>
          </div>
          <div className="card">
            {busy ? (
              <LoadingLine>Loading branches…</LoadingLine>
            ) : branches.length ? (
              <div className="aux-list">
                {branches.map(branch => (
                  <div className="aux-row" key={branch.name}>
                    <GitBranch size={17} />
                    <span>
                      <b>{branch.name}</b>
                      <small>{branch.commit?.sha?.slice(0, 12) || 'Latest commit unavailable'}</small>
                    </span>
                    {branch.name === app.defaultBranch ? <i className="aux-state is-open">Default</i> : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={GitBranch} title="No branches found" description="Branch information is currently unavailable." />
            )}
          </div>
        </section>
      ) : null}

      {section === 'actions' ? (
        <section>
          <div className="section-head">
            <div>
              <h2>Workflow runs</h2>
              <p>Recent GitHub Actions activity</p>
            </div>
            <a className="btn btn-sm" href={`${app.githubUrl}/actions`} target="_blank" rel="noreferrer">
              Open on GitHub <ArrowUpRight size={13} />
            </a>
          </div>
          <div className="card">
            {busy ? (
              <LoadingLine>Loading workflow runs…</LoadingLine>
            ) : actions.length ? (
              <div className="aux-list">
                {actions.map(run => (
                  <a className="aux-row" key={run.id} href={run.html_url} target="_blank" rel="noreferrer">
                    <Workflow size={17} />
                    <span>
                      <b>{run.display_title || run.name || 'Workflow run'}</b>
                      <small>
                        {run.head_branch || 'Default branch'} · {run.event || 'event'} · {elapsed(run.updated_at)}
                      </small>
                    </span>
                    <i className={`aux-state${run.conclusion === 'success' ? ' is-open' : ''}`}>{run.status === 'completed' ? run.conclusion : run.status}</i>
                    <ArrowUpRight size={14} />
                  </a>
                ))}
              </div>
            ) : (
              <EmptyState icon={Workflow} title="No workflow runs found" description="This repository has no recent Actions runs." />
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
