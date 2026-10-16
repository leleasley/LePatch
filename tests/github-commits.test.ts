import { describe, expect, it } from "vitest";
import { summarizeCheckRuns, summarizeCombinedStatus } from "@/lib/github";

describe("summarizeCheckRuns", () => {
  it("returns neutral when there are no runs", () => {
    expect(summarizeCheckRuns([])).toEqual({
      state: "neutral",
      total: 0,
      failed: 0,
      pending: 0,
      checks: [],
    });
  });

  it("marks all-success when every run succeeded", () => {
    const summary = summarizeCheckRuns([
      {
        id: 1,
        name: "build",
        status: "completed",
        conclusion: "success",
        html_url: "https://x",
        details_url: null,
        started_at: "",
        completed_at: "",
      },
      {
        id: 2,
        name: "test",
        status: "completed",
        conclusion: "success",
        html_url: "https://x",
        details_url: null,
        started_at: "",
        completed_at: "",
      },
    ]);
    expect(summary.state).toBe("success");
    expect(summary.failed).toBe(0);
    expect(summary.pending).toBe(0);
    expect(summary.checks).toHaveLength(2);
  });

  it("marks failure when any conclusion is failure/timed_out/cancelled/action_required", () => {
    const summary = summarizeCheckRuns([
      {
        id: 1,
        name: "build",
        status: "completed",
        conclusion: "success",
        html_url: "https://x",
        details_url: null,
        started_at: "",
        completed_at: "",
      },
      {
        id: 2,
        name: "deploy",
        status: "completed",
        conclusion: "timed_out",
        html_url: "https://x",
        details_url: null,
        started_at: "",
        completed_at: "",
      },
    ]);
    expect(summary.state).toBe("failure");
    expect(summary.failed).toBe(1);
  });

  it("marks in_progress if any run is queued/in_progress/waiting/requested", () => {
    const summary = summarizeCheckRuns([
      {
        id: 1,
        name: "build",
        status: "completed",
        conclusion: "success",
        html_url: "https://x",
        details_url: null,
        started_at: "",
        completed_at: "",
      },
      {
        id: 2,
        name: "deploy",
        status: "in_progress",
        conclusion: null,
        html_url: "https://x",
        details_url: null,
        started_at: "",
        completed_at: null,
      },
    ]);
    expect(summary.state).toBe("in_progress");
    expect(summary.pending).toBe(1);
  });
});

describe("summarizeCombinedStatus", () => {
  it("returns neutral for empty statuses", () => {
    const summary = summarizeCombinedStatus({ state: "pending", statuses: [], total_count: 0 });
    expect(summary.state).toBe("neutral");
  });

  it("rolls up success/failure counts", () => {
    const summary = summarizeCombinedStatus({
      state: "failure",
      total_count: 3,
      statuses: [
        { context: "ci/build", state: "success", description: null, target_url: null, updated_at: "", avatar_url: null },
        { context: "ci/test", state: "failure", description: null, target_url: "https://x", updated_at: "", avatar_url: null },
        { context: "ci/lint", state: "pending", description: null, target_url: null, updated_at: "", avatar_url: null },
      ],
    });
    expect(summary.state).toBe("failure");
    expect(summary.failed).toBe(1);
    expect(summary.pending).toBe(1);
    expect(summary.total).toBe(3);
  });

  it("promotes pending to in_progress when no failures", () => {
    const summary = summarizeCombinedStatus({
      state: "pending",
      total_count: 2,
      statuses: [
        { context: "ci/build", state: "success", description: null, target_url: null, updated_at: "", avatar_url: null },
        { context: "ci/test", state: "pending", description: null, target_url: null, updated_at: "", avatar_url: null },
      ],
    });
    expect(summary.state).toBe("in_progress");
    expect(summary.pending).toBe(1);
  });
});
