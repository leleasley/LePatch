export type ReleaseSeverity = "major" | "minor" | "patch" | "prerelease";

/**
 * Classify a release tag into a severity bucket.
 *
 * Tags in the wild are messy: `v2.0.0`, `V2.0.0`, `release-2.0.0`, `2.0`,
 * `v2`, `2024.10.1`, `1.2.3-rc.1`. The previous implementation split on the
 * first separator, so `release-2.0.0` produced NaN and silently fell through to
 * "patch", and `v2` was also "patch". We now find the first numeric run that
 * parses as a version.
 */
export function classifyRelease(tagName: string, prerelease: boolean): ReleaseSeverity {
  if (prerelease) return "prerelease";

  const [major, minor, patch] = versionParts(tagName);
  if (major === null) return "patch";

  // `v2` / `2024` carry no minor component: the jump itself is the bump.
  if (minor === null) return "major";

  if (major > 0) {
    if (minor === 0) return "major";
    // `v2.3` has no patch component, so the minor bump is the latest change.
    if (patch === null || patch === 0) return "minor";
    return "patch";
  }

  // 0.x releases: 0.2.0 is a feature release, 0.0.1 is the smallest bump.
  return minor === 0 ? "patch" : "minor";
}

/** The first three integers in a tag, ignoring words and `v` prefixes. */
function versionParts(tagName: string): [number | null, number | null, number | null] {
  const numbers = tagName.match(/\d+/g);
  if (!numbers) return [null, null, null];
  return [
    Number.parseInt(numbers[0], 10),
    numbers.length > 1 ? Number.parseInt(numbers[1], 10) : null,
    numbers.length > 2 ? Number.parseInt(numbers[2], 10) : null,
  ];
}

export type ChangelogSection = { heading: string; content: string };

/**
 * Split a release body into headed sections.
 *
 * Anything before the first heading used to be discarded, so a changelog that
 * opened with a paragraph (a very common shape) lost its most important line.
 * That preamble is now kept as a section too.
 */
export function parseChangelog(body: string | null | undefined): {
  summary: string | null;
  sections: ChangelogSection[];
} {
  if (!body || !body.trim()) return { summary: null, sections: [] };

  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const sections: ChangelogSection[] = [];

  let currentHeading: string | null = null;
  let currentContent: string[] = [];

  const flush = () => {
    const content = currentContent.join("\n").trim();
    if (!currentHeading && !content) return;
    // Headings with no body carry no information; skip them rather than
    // persisting an empty section.
    if (currentHeading && !content) return;
    sections.push({ heading: currentHeading ?? "Overview", content });
  };

  for (const line of lines) {
    // ATX headings only (## Added), which is what GitHub renders as sections.
    const headingMatch = line.match(/^#{1,3}\s+(.+?)\s*$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1];
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  flush();

  if (sections.length === 0) return { summary: null, sections: [] };

  // Prefer the first section that actually has prose for the one-line summary.
  const summarySource = sections.find((s) => s.content.length > 0)?.content ?? "";
  const summary = truncate(summarySource, 240);

  return { summary, sections };
}

function truncate(value: string, max: number): string | null {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  if (collapsed.length <= max) return collapsed;
  const cut = collapsed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}