import { describe, expect, it } from "vitest";
import { describeAction } from "@/lib/audit";

describe("describeAction", () => {
  it("returns user-friendly description for known actions", () => {
    expect(describeAction("user.login")).toBe("User logged in");
    expect(describeAction("user.created")).toBe("User created");
    expect(describeAction("user.deleted")).toBe("User deleted");
    expect(describeAction("app.created")).toBe("Watched app added");
    expect(describeAction("app.check_triggered")).toBe("Release check triggered");
    expect(describeAction("settings.updated")).toBe("Settings updated");
    expect(describeAction("mfa.setup")).toBe("MFA enabled");
    expect(describeAction("mfa.disabled")).toBe("MFA disabled");
    expect(describeAction("github.connected")).toBe("GitHub account connected");
  });

  it("returns the raw action string for unknown actions", () => {
    expect(describeAction("unknown.action")).toBe("unknown.action");
    expect(describeAction("")).toBe("");
  });
});
