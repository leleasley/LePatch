import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return jsonError("Invalid request payload", 422);
  }

  if (error instanceof Error) {
    if (error.message === "Unauthorized") return jsonError("Unauthorized", 401);
    if (error.message === "Forbidden") return jsonError("Forbidden", 403);
    if (error.message.includes("Unique constraint")) return jsonError("That record already exists", 409);
    const lowerMsg = error.message.toLowerCase();
    if (lowerMsg.includes("not found") || lowerMsg.includes("not exist")) return jsonError(error.message, 404);
    logger.error("API request failed", { name: error.name, message: error.message, stack: error.stack?.split("\n").slice(0, 3).join(" ") });
    return jsonError(error.message || "Request failed", 400);
  }

  return jsonError("Unexpected server error", 500);
}
