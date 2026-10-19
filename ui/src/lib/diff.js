// A small line based diff used to summarise a file change before it is
// committed. It only counts lines, so a single row of the longest common
// subsequence table is enough.

const MAX_LINES = 1500;

export function diffStats(before, after) {
  const a = String(before ?? '').split('\n');
  const b = String(after ?? '').split('\n');

  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return {
      added: Math.max(0, b.length - a.length),
      removed: Math.max(0, a.length - b.length),
      approximate: true,
    };
  }

  let previous = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Uint32Array(b.length + 1);
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    previous = current;
  }

  const common = previous[b.length];
  return { added: b.length - common, removed: a.length - common, approximate: false };
}

export function hasChanges(before, after) {
  return String(before ?? '') !== String(after ?? '');
}
