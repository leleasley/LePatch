import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Error messages that are safe to return verbatim to the client.
 *
 * Anything else — Prisma invocation errors, `ENCRYPTION_KEY ... not set`,
 * "Invalid encrypted value format", upstream GitHub messages — is logged
 * server-side and replaced with a generic 500 so internal details cannot leak
 * through the ~90 routes that funnel errors through this helper.
 */
const PUBLIC_ERROR_MESSAGES = new Set([
  "Unauthorized",
  "Forbidden",
  "Setup already complete",
  "GitHub token is required",
  "GitHub token is invalid",
  "Telegram bot token is required",
  "Telegram bot token is invalid",
  "Discord webhook URL is required",
  "Discord webhook URL is not a valid URL",
  "Discord webhook URL must use HTTPS",
  "Discord webhook URL must be a discord.com webhook",
  "Discord webhook URL is not a webhook endpoint",
  "Discord webhook URL is invalid",
  "Incorrect password",
  "User not found",
  "Notification channel not found",
  "Invalid or expired setup token",
  "Invalid or expired token",
  "MFA is already enabled",
  "MFA is not enabled",
  "Passkey not recognized",
  "Admin password is required",
  "Telegram bot is not configured",
  "No GitHub account is linked",
]);

function isPublicMessage(message: string): boolean {
  if (PUBLIC_ERROR_MESSAGES.has(message)) return true;
  // "App not found" / "User not found" style messages are authored by us and
  // contain no infrastructure detail.
  return /^[A-Z][a-zA-Z ]{0,40}not found\.?$/.test(message);
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return jsonError("Invalid request payload", 422);
  }

  if (error instanceof Error) {
    if (error.message === "Unauthorized") return jsonError("Unauthorized", 401);
    if (error.message === "Forbidden") return jsonError("Forbidden", 403);
    if (error.message.includes("Unique constraint")) return jsonError("That record already exists", 409);

    if (isPublicMessage(error.message)) return jsonError(error.message, 404);

    logger.error("API request failed", {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 3).join(" "),
    });
    return jsonError("Request failed", 400);
  }

  return jsonError("Unexpected server error", 500);
}