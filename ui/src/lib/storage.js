// Offline snapshot cache. The last known good payload for each endpoint is
// kept in local storage so the interface still renders something useful when
// the connection drops.

const PREFIX = 'lepatch:';

export function readSnapshot(key, fallback) {
  try {
    const value = localStorage.getItem(PREFIX + key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function writeSnapshot(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage can be disabled or full; the interface still works without it.
  }
}

export function clearSnapshots() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures.
  }
}
