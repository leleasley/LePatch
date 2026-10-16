import { describe, expect, it } from "vitest";
import { formatTelegramHtml, notificationMessage, formatDiscordEmbed } from "@/lib/notifications";
import { extractTelegramCommand } from "@/lib/telegram-bot";

function makeApp(overrides = {}) {
  return {
    id: "app-1",
    name: "Immich",
    repoFullName: "immich-app/immich",
    ...overrides,
  } as never;
}

function makeRelease(overrides = {}) {
  return {
    tagName: "v1.135.0",
    body: "Release notes",
    publishedAt: new Date("2026-06-12T00:00:00Z"),
    ...overrides,
  } as never;
}

describe("notificationMessage", () => {
  it("includes release and version tags details", () => {
    const message = notificationMessage(makeApp(), makeRelease(), ["v1.133.0", "v1.134.0", "v1.135.0"]);
    expect(message).toContain("App: Immich");
    expect(message).toContain("Versions: v1.133.0 → v1.134.0 → v1.135.0");
    expect(message).toContain("Repo: immich-app/immich");
    expect(message).toContain("View in LePatch");
  });

  it("handles missing version tags gracefully", () => {
    const message = notificationMessage(makeApp(), makeRelease({ tagName: "v1.0.0" }), []);
    expect(message).toContain("Versions: v1.0.0");
  });

  it("handles null publishedAt date", () => {
    const message = notificationMessage(makeApp(), makeRelease({ publishedAt: null }), []);
    expect(message).toContain("Published: Unknown");
  });

  it("includes release notes preview when present", () => {
    const message = notificationMessage(makeApp(), makeRelease({ body: "Fixed a critical bug" }), []);
    expect(message).toContain("Notes: Fixed a critical bug");
  });

  it("omits notes section when body is null", () => {
    const message = notificationMessage(makeApp(), makeRelease({ body: null }), []);
    expect(message).not.toContain("Notes:");
  });
});

describe("formatTelegramHtml", () => {
  it("formats Telegram Bot alerts with version tags and update features", () => {
    const message = formatTelegramHtml(
      makeApp(),
      makeRelease({ body: "- Added shared albums\n- Improved search" }),
      ["v1.133.0", "v1.134.0", "v1.135.0"]
    );
    expect(message).toContain("<b>Versions:</b> v1.133.0 → v1.134.0 → v1.135.0");
    expect(message).toContain("<b>Update Features:</b>");
    expect(message).toContain("• Added shared albums");
    expect(message).toContain("• Improved search");
    expect(message).toContain("View in LePatch");
  });

  it("escapes HTML in app name and repo", () => {
    const message = formatTelegramHtml(
      makeApp({ name: "Foo & Bar", repoFullName: "test/repo<tag>" }),
      makeRelease(),
      []
    );
    expect(message).toContain("Foo &amp; Bar");
    expect(message).toContain("test/repo&lt;tag&gt;");
    expect(message).not.toContain("<tag>");
  });

  it("handles null release body", () => {
    const message = formatTelegramHtml(makeApp(), makeRelease({ body: null }), []);
    expect(message).not.toContain("Update Features:");
  });

  it("uses single tag when no versionTags provided", () => {
    const message = formatTelegramHtml(makeApp(), makeRelease({ tagName: "v2.0.0" }), []);
    expect(message).toContain("v2.0.0");
  });

  it("includes published date", () => {
    const message = formatTelegramHtml(makeApp(), makeRelease(), []);
    expect(message).toContain("2026-06-12");
  });
});

describe("formatDiscordEmbed", () => {
  it("produces a valid Discord embed structure", () => {
    const embed = formatDiscordEmbed(makeApp(), makeRelease({ tagName: "v2.0.0" }), ["v1.0.0", "v2.0.0"]);
    expect(embed.embeds).toHaveLength(1);
    expect(embed.embeds[0].title).toContain("v2.0.0");
    expect(embed.embeds[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Versions", value: "v1.0.0 → v2.0.0" }),
        expect.objectContaining({ name: "App", value: "Immich" }),
      ])
    );
  });

  it("uses tagName when no versionTags provided", () => {
    const embed = formatDiscordEmbed(makeApp(), makeRelease({ tagName: "v3.0.0" }), []);
    expect(embed.embeds[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Versions", value: "v3.0.0" }),
      ])
    );
  });
});

describe("extractTelegramCommand", () => {
  it("parses /start with code", () => {
    expect(extractTelegramCommand("/start LP-ABCD-1234")).toEqual({
      command: "start",
      args: ["LP-ABCD-1234"],
    });
  });

  it("parses /status with bot username", () => {
    expect(extractTelegramCommand("/status@LePatchBot")).toEqual({
      command: "status",
      args: [],
    });
  });

  it("parses /link with single argument", () => {
    expect(extractTelegramCommand("/link ABC123")).toEqual({
      command: "link",
      args: ["ABC123"],
    });
  });

  it("parses /unlink", () => {
    expect(extractTelegramCommand("/unlink")).toEqual({
      command: "unlink",
      args: [],
    });
  });

  it("handles null input", () => {
    expect(extractTelegramCommand(null)).toBeNull();
  });

  it("handles undefined input", () => {
    expect(extractTelegramCommand(undefined)).toBeNull();
  });

  it("handles empty string", () => {
    expect(extractTelegramCommand("")).toBeNull();
  });

  it("handles non-command text", () => {
    expect(extractTelegramCommand("hello world")).toBeNull();
  });
});
