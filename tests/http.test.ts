import { describe, expect, it } from "vitest";
import { jsonError, handleApiError } from "@/lib/http";
import { ZodError } from "zod";

describe("jsonError", () => {
  it("returns default 400 status", async () => {
    const res = jsonError("Bad request");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Bad request");
  });

  it("returns custom status code", async () => {
    const res = jsonError("Not found", 404);
    expect(res.status).toBe(404);
  });
});

describe("handleApiError", () => {
  it("handles Unauthorized error", async () => {
    const res = handleApiError(new Error("Unauthorized"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("handles Forbidden error", async () => {
    const res = handleApiError(new Error("Forbidden"));
    expect(res.status).toBe(403);
  });

  it("handles ZodError", async () => {
    const res = handleApiError(new ZodError([]));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Invalid request payload");
  });

  it("handles unique constraint errors", async () => {
    const res = handleApiError(new Error("Unique constraint violation"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("That record already exists");
  });

  it("handles generic errors with 400", async () => {
    const res = handleApiError(new Error("Something went wrong"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Something went wrong");
  });

  it("handles unknown errors with 500", async () => {
    const res = handleApiError("unknown string error");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Unexpected server error");
  });

  it("handles null error", async () => {
    const res = handleApiError(null);
    expect(res.status).toBe(500);
  });
});
