import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { getTelegramBotConfig, getTelegramLinkStatus, issueTelegramLinkToken, unlinkTelegramForUser } from "@/lib/telegram-bot";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const [config, link] = await Promise.all([
      getTelegramBotConfig(),
      getTelegramLinkStatus(user.id),
    ]);

    return NextResponse.json({
      enabled: config.enabled && Boolean(config.botToken),
      botUsername: config.botUsername,
      botName: config.botName,
      link,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    await request.text().catch(() => "");
    const user = await getCurrentUser();
    const config = await getTelegramBotConfig();
    if (!config.enabled || !config.botToken) {
      throw new Error("Telegram Bot is not configured by an administrator yet");
    }

    const token = await issueTelegramLinkToken(user.id);
    return NextResponse.json({
      token: token.token,
      expiresAt: token.expiresAt.toISOString(),
      botUsername: config.botUsername,
      botName: config.botName,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    await request.text().catch(() => "");
    const user = await getCurrentUser();
    await unlinkTelegramForUser(user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
