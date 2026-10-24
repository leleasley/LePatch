import { describe, expect, it } from 'vitest';
import { dayLabel, filterReleases, groupByDay, newReleaseIds } from './feed.js';

const release = (id, detectedAt, extra = {}) => ({
  id,
  tagName: `v1.0.${id}`,
  detectedAt,
  prerelease: false,
  watchedApp: { id: 'app-1', updateAvailable: false, latestSeenTag: 'v1.0.0' },
  ...extra,
});

describe('dayLabel', () => {
  const now = new Date('2026-10-24T12:00:00Z').getTime();

  it('names today and yesterday', () => {
    expect(dayLabel('2026-10-24T09:00:00Z', now)).toBe('Today');
    expect(dayLabel('2026-10-23T09:00:00Z', now)).toBe('Yesterday');
  });

  it('names the weekday within a week', () => {
    expect(dayLabel('2026-10-20T09:00:00Z', now)).toBe('Tuesday');
  });

  it('falls back to a date for older releases', () => {
    expect(dayLabel('2026-10-01T09:00:00Z', now)).toMatch(/1|Oct/);
  });
});

describe('groupByDay', () => {
  it('keeps feed order and groups consecutive days', () => {
    const now = new Date('2026-10-24T12:00:00Z').getTime();
    const groups = groupByDay(
      [release('1', '2026-10-24T10:00:00Z'), release('2', '2026-10-24T08:00:00Z'), release('3', '2026-10-23T10:00:00Z')],
      now,
    );
    expect(groups.map(group => group.label)).toEqual(['Today', 'Yesterday']);
    expect(groups[0].items.map(item => item.id)).toEqual(['1', '2']);
    expect(groups[1].items.map(item => item.id)).toEqual(['3']);
  });

  it('returns no groups for an empty feed', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('newReleaseIds', () => {
  it('flags the newest release of a repository with an update', () => {
    const feed = [
      release('2', '2026-10-24T10:00:00Z', { publishedAt: '2026-10-24T09:00:00Z', watchedApp: { id: 'app-1', updateAvailable: true, latestSeenTag: 'v1.0.1' } }),
      release('1', '2026-10-20T10:00:00Z', { publishedAt: '2026-10-20T09:00:00Z', watchedApp: { id: 'app-1', updateAvailable: true, latestSeenTag: 'v1.0.1' } }),
    ];
    expect([...newReleaseIds(feed)]).toEqual(['2']);
  });

  it('uses publication date, not feed order, to find the newest release', () => {
    const feed = [
      release('old', '2026-10-24T10:00:00Z', { publishedAt: '2026-10-01T09:00:00Z', watchedApp: { id: 'app-1', updateAvailable: true, latestSeenTag: 'v1.0.0' } }),
      release('new', '2026-10-24T09:00:00Z', { publishedAt: '2026-10-23T09:00:00Z', watchedApp: { id: 'app-1', updateAvailable: true, latestSeenTag: 'v1.0.0' } }),
    ];
    expect([...newReleaseIds(feed)]).toEqual(['new']);
  });

  it('ignores repositories without an update or without a newer tag', () => {
    const feed = [
      release('1', '2026-10-24T10:00:00Z', { watchedApp: { id: 'app-1', updateAvailable: false, latestSeenTag: 'v1.0.1' } }),
      release('2', '2026-10-24T10:00:00Z', { tagName: 'v1.0.1', watchedApp: { id: 'app-2', updateAvailable: true, latestSeenTag: 'v1.0.1' } }),
    ];
    expect(newReleaseIds(feed).size).toBe(0);
  });

  it('treats a repository that was never seen as new', () => {
    const feed = [release('1', '2026-10-24T10:00:00Z', { watchedApp: { id: 'app-1', updateAvailable: true, latestSeenTag: null } })];
    expect([...newReleaseIds(feed)]).toEqual(['1']);
  });
});

describe('filterReleases', () => {
  const items = [
    { ...release('1', '2026-10-24T10:00:00Z'), tagName: 'v1.0.1', securityRelevant: true, prerelease: false },
    { ...release('2', '2026-10-24T10:00:00Z'), tagName: 'v1.1.0-beta', prerelease: true },
  ];

  it('shows everything by default', () => {
    expect(filterReleases(items)).toHaveLength(2);
  });

  it('filters pre-releases, security releases and new releases', () => {
    expect(filterReleases(items, { filter: 'prerelease' })).toHaveLength(1);
    expect(filterReleases(items, { filter: 'security' })).toHaveLength(1);
    expect(filterReleases(items, { filter: 'new', newIds: new Set(['2']) }).map(item => item.id)).toEqual(['2']);
  });

  it('searches tags and names', () => {
    expect(filterReleases(items, { query: 'beta' })).toHaveLength(1);
    expect(filterReleases(items, { query: 'nothing' })).toHaveLength(0);
  });
});
