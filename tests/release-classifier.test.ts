import { describe, expect, it } from "vitest";
import { classifyRelease, parseChangelog } from "@/lib/release-classifier";

describe("classifyRelease", () => {
  it("classifies plain semver tags", () => {
    expect(classifyRelease("v2.0.0", false)).toBe("major");
    expect(classifyRelease("v2.3.0", false)).toBe("minor");
    expect(classifyRelease("v2.3.4", false)).toBe("patch");
  });

  it("ignores case and word prefixes", () => {
    expect(classifyRelease("V2.0.0", false)).toBe("major");
    expect(classifyRelease("release-2.0.0", false)).toBe("major");
    expect(classifyRelease("Release_3_1_0", false)).toBe("minor");
  });

  it("handles two-part and single-number tags", () => {
    expect(classifyRelease("v2.0", false)).toBe("major");
    expect(classifyRelease("v2.10", false)).toBe("minor");
    expect(classifyRelease("v2", false)).toBe("major");
  });

  it("treats pre-release flags as prerelease regardless of magnitude", () => {
    expect(classifyRelease("v3.0.0-rc.1", true)).toBe("prerelease");
    expect(classifyRelease("v1.0.1-nightly", true)).toBe("prerelease");
  });

  it("classifies by the version core, ignoring the pre-release suffix", () => {
    // GitHub can mark a release as stable while the tag still carries -rc1.
    expect(classifyRelease("v1.2.3-rc1", false)).toBe("patch");
    expect(classifyRelease("v1.2.0-beta.2", false)).toBe("minor");
    expect(classifyRelease("v2.0.0-next", false)).toBe("major");
  });

  it("falls back to patch for non-numeric tags", () => {
    expect(classifyRelease("nightly", false)).toBe("patch");
    expect(classifyRelease("", false)).toBe("patch");
  });

  it("handles calver", () => {
    expect(classifyRelease("2024.10.1", false)).toBe("patch");
    expect(classifyRelease("2024.10.0", false)).toBe("minor");
    expect(classifyRelease("2025.1.0", false)).toBe("minor");
  });

  it("handles 0.x releases", () => {
    expect(classifyRelease("v0.2.1", false)).toBe("minor");
    expect(classifyRelease("v0.0.1", false)).toBe("patch");
  });
});

describe("parseChangelog", () => {
  it("returns nothing for an empty body", () => {
    expect(parseChangelog(null)).toEqual({ summary: null, sections: [] });
    expect(parseChangelog("   ")).toEqual({ summary: null, sections: [] });
  });

  it("keeps content that appears before the first heading", () => {
    const body = "This release fixes a security issue.\n\n## Changes\n- thing";
    const result = parseChangelog(body);
    expect(result.sections[0].heading).toBe("Overview");
    expect(result.sections[0].content).toBe("This release fixes a security issue.");
    expect(result.sections[1].heading).toBe("Changes");
  });

  it("keeps a plain body as a single overview section", () => {
    const result = parseChangelog("Just a paragraph");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].heading).toBe("Overview");
    expect(result.summary).toBe("Just a paragraph");
  });

  it("parses multiple heading levels", () => {
    const body = "# Added\n- a\n### Fixed\n- b";
    const result = parseChangelog(body);
    expect(result.sections.map((s) => s.heading)).toEqual(["Added", "Fixed"]);
  });

  it("skips headings with no body", () => {
    const body = "## Added\n- a\n## Empty\n## Fixed\n- b";
    const result = parseChangelog(body);
    expect(result.sections.map((s) => s.heading)).toEqual(["Added", "Fixed"]);
  });

  it("handles CRLF input", () => {
    const result = parseChangelog("## Added\r\n- a\r\n");
    expect(result.sections[0].content).toBe("- a");
  });

  it("truncates the summary on a word boundary", () => {
    const body = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
    const result = parseChangelog(body);
    expect(result.summary).not.toBeNull();
    expect(result.summary!.length).toBeLessThanOrEqual(243);
    expect(result.summary!.endsWith("...")).toBe(true);
  });
});