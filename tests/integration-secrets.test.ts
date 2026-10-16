import { describe, expect, it } from "vitest";
import { shouldEncryptIntegrationSetting } from "@/lib/integration-secrets";

describe("integration secrets", () => {
  it("identifies github token as encryptable", () => {
    expect(shouldEncryptIntegrationSetting("github", "token")).toBe(true);
  });

  it("identifies discord webhook as encryptable", () => {
    expect(shouldEncryptIntegrationSetting("discord", "webhookUrl")).toBe(true);
  });

  it("identifies telegram secrets as encryptable", () => {
    expect(shouldEncryptIntegrationSetting("telegram", "botToken")).toBe(true);
    expect(shouldEncryptIntegrationSetting("telegram", "chatId")).toBe(true);
    expect(shouldEncryptIntegrationSetting("telegram", "webhookSecret")).toBe(true);
  });

  it("does not encrypt non-secret settings", () => {
    expect(shouldEncryptIntegrationSetting("telegram", "enabled")).toBe(false);
    expect(shouldEncryptIntegrationSetting("discord", "enabled")).toBe(false);
    expect(shouldEncryptIntegrationSetting("telegram", "botUsername")).toBe(false);
    expect(shouldEncryptIntegrationSetting("telegram", "botName")).toBe(false);
  });
});
