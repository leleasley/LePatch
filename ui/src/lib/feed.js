// Pure helpers behind the release feed. They live here rather than in the page
// component so they can be unit tested without a browser.

export function startOfDay(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function dayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// dayLabel names the recent days and falls back to a short date, so a feed
// that spans weeks stays readable.
export function dayLabel(value, now = Date.now()) {
  const date = new Date(value);
  const days = Math.round((startOfDay(now) - startOfDay(value)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// groupByDay preserves the order it is given, which is newest first.
export function groupByDay(items, now = Date.now()) {
  const groups = [];
  for (const item of items) {
    const key = dayKey(item.detectedAt);
    const current = groups[groups.length - 1];
    if (current && current.key === key) {
      current.items.push(item);
    } else {
      groups.push({ key, label: dayLabel(item.detectedAt, now), items: [item] });
    }
  }
  return groups;
}

function publishedStamp(item) {
  const value = item.publishedAt || item.detectedAt;
  const stamp = new Date(value).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

// A release is "new" when it is the newest release of a repository that is
// waiting on an update and its tag has not been acknowledged yet. The feed is
// ordered by detection time, which is not the same as release order, so this
// compares publication dates per repository.
export function newReleaseIds(feed) {
  const newest = new Map();
  for (const item of feed) {
    const watched = item.watchedApp;
    if (!watched?.id || !watched.updateAvailable) continue;
    const stamp = publishedStamp(item);
    const current = newest.get(watched.id);
    if (!current || stamp > current.stamp) newest.set(watched.id, { item, stamp });
  }
  const ids = new Set();
  for (const { item } of newest.values()) {
    if (!item.watchedApp.latestSeenTag || item.tagName !== item.watchedApp.latestSeenTag) {
      ids.add(item.id);
    }
  }
  return ids;
}

// The feed filter is applied on the client so switching tabs does not refetch.
export function filterReleases(items, { filter = 'all', query = '', newIds = new Set() } = {}) {
  const needle = query.trim().toLowerCase();
  return items.filter(item => {
    if (filter === 'prerelease' && !item.prerelease) return false;
    if (filter === 'security' && !item.securityRelevant) return false;
    if (filter === 'new' && !newIds.has(item.id)) return false;
    if (!needle) return true;
    const haystack = `${item.watchedApp?.name || ''} ${item.repoFullName || ''} ${item.tagName || ''} ${item.name || ''}`.toLowerCase();
    return haystack.includes(needle);
  });
}
