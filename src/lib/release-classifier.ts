export function classifyRelease(tagName: string, prerelease: boolean): string {
  if (prerelease) return "prerelease";
  const cleaned = tagName.replace(/^v/, "");
  const parts = cleaned.split(/[.-]/);
  if (parts.length >= 3) {
    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);
    const patch = parseInt(parts[2], 10);
    if (!isNaN(major) && !isNaN(minor) && !isNaN(patch)) {
      if (major > 0 && minor === 0 && patch === 0) return "major";
      if (minor > 0 && patch === 0) return "minor";
      return "patch";
    }
  }
  if (parts.length >= 2) {
    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);
    if (!isNaN(major) && !isNaN(minor)) {
      if (major > 0 && minor === 0) return "major";
      return "minor";
    }
  }
  return prerelease ? "prerelease" : "patch";
}

export function parseChangelog(body: string | null | undefined): { summary: string | null; sections: Array<{ heading: string; content: string }> } {
  if (!body) return { summary: null, sections: [] };

  const sections: Array<{ heading: string; content: string }> = [];
  let summary: string | null = null;

  const lines = body.split("\n");
  let currentHeading: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^###?\s+(.+)/);
    if (headingMatch) {
      if (currentHeading) {
        sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() });
      }
      currentHeading = headingMatch[1].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentHeading) {
    sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() });
  }

  if (sections.length === 0) {
    const stripped = body.replace(/^[#\s>]+/, "").trim();
    summary = stripped.length > 240 ? stripped.slice(0, 240) + "..." : stripped;
  } else {
    summary = sections[0].content.length > 240 ? sections[0].content.slice(0, 240) + "..." : sections[0].content;
    if (!summary) summary = sections[0].heading;
  }

  return { summary, sections };
}
