import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { telegramBotCommands } from "@/lib/telegram-commands";
import { getIntegrationSettingValue } from "@/lib/integration-secrets";
import { logger } from "@/lib/logger";
import type {
  WatchedApp,
  Release,
} from "@prisma/client";

type TelegramSettingKey =
  | "botToken"
  | "chatId"
  | "webhookSecret"
  | "enabled"
  | "botUsername"
  | "botName"
  | "botId";

type TelegramUser = {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramChat = {
  id: number;
  type: string;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  from?: TelegramUser;
  chat?: TelegramChat;
};

type TelegramCallbackQuery = {
  id: string;
  from?: TelegramUser;
  message?: TelegramMessage & { message_id: number; chat?: TelegramChat };
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type TelegramBotConfig = {
  botToken: string | null;
  chatId: string | null;
  webhookSecret: string | null;
  enabled: boolean;
  botUsername: string | null;
  botName: string | null;
  botId: string | null;
};

export type TelegramLinkStatus = {
  linked: boolean;
  chatId: string | null;
  username: string | null;
  linkedAt: string | null;
  lastSeenAt: string | null;
};

type InlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

type InlineKeyboardMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
};

const TELEGRAM_MAX_MESSAGE_LENGTH = 4000;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function splitTelegramMessage(text: string, maxLength = TELEGRAM_MAX_MESSAGE_LENGTH) {
  if (text.length <= maxLength) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt < maxLength * 0.6) splitAt = remaining.lastIndexOf(" ", maxLength);
    if (splitAt <= 0) splitAt = maxLength;
    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) parts.push(remaining);
  return parts;
}

export function escapeHtml(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function getTelegramSetting(key: TelegramSettingKey) {
  return getIntegrationSettingValue("telegram", key);
}

export async function getTelegramBotConfig(): Promise<TelegramBotConfig> {
  const [botToken, chatId, webhookSecret, enabled, botUsername, botName, botId] = await Promise.all([
    getTelegramSetting("botToken"),
    getTelegramSetting("chatId"),
    getTelegramSetting("webhookSecret"),
    getTelegramSetting("enabled"),
    getTelegramSetting("botUsername"),
    getTelegramSetting("botName"),
    getTelegramSetting("botId"),
  ]);

  return {
    botToken,
    chatId,
    webhookSecret,
    enabled: enabled === "true",
    botUsername,
    botName,
    botId,
  };
}

export async function fetchTelegramBotMe(token: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || "Telegram bot lookup failed");
  return data.result as { id: number; username?: string; first_name?: string };
}

export async function setTelegramBotCommands(token: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: telegramBotCommands.map(({ command, description, adminOnly }) => ({
        command,
        description: adminOnly ? `${description} (admin)` : description,
      })),
    }),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || "Failed to register Telegram bot commands");
}

export async function sendTelegramBotMessage(
  token: string,
  chatId: string,
  text: string,
  parseMode?: "HTML",
  silent?: boolean
) {
  for (const part of splitTelegramMessage(text)) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: part,
      disable_web_page_preview: false,
    };
    if (parseMode) body.parse_mode = parseMode;
    if (silent) body.disable_notification = true;

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || (data && data.ok === false)) {
      throw new Error(data?.description || `Telegram send failed with status ${response.status}`);
    }
  }
}

export async function sendTelegramBotMessageWithKeyboard(
  token: string,
  chatId: string,
  text: string,
  replyMarkup?: InlineKeyboardMarkup | undefined,
  parseMode?: "HTML"
): Promise<{ message_id: number } | void> {
  let lastResult: { message_id: number } | undefined;
  for (const part of splitTelegramMessage(text)) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: part,
      disable_web_page_preview: false,
    };
    if (replyMarkup) body.reply_markup = replyMarkup;
    if (parseMode) body.parse_mode = parseMode;

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || (data && data.ok === false)) {
      throw new Error(data?.description || `Telegram send failed with status ${response.status}`);
    }
    if (data?.result?.message_id) {
      lastResult = { message_id: data.result.message_id };
    }
  }
  return lastResult;
}

export async function answerCallbackQuery(
  token: string,
  callbackQueryId: string,
  text?: string
) {
  const body: Record<string, unknown> = {
    callback_query_id: callbackQueryId,
  };
  if (text) body.text = text;

  const response = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || (data && data.ok === false)) {
    throw new Error(data?.description || `Telegram answerCallbackQuery failed with status ${response.status}`);
  }
}

export async function editTelegramMessage(
  token: string,
  chatId: string,
  messageId: number,
  text: string,
  parseMode?: "HTML"
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: false,
  };
  if (parseMode) body.parse_mode = parseMode;

  const response = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || (data && data.ok === false)) {
    throw new Error(data?.description || `Telegram editMessage failed with status ${response.status}`);
  }
}

export async function editMessageReplyMarkup(
  token: string,
  chatId: string,
  messageId: number
) {
  const response = await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || (data && data.ok === false)) {
    throw new Error(data?.description || `Telegram editMessageReplyMarkup failed with status ${response.status}`);
  }
}

/**
 * Resolve who should receive a Telegram message.
 *
 * Passing `userId` sends only to that user's linked chat — a shared bot must
 * never broadcast one user's private watched apps to everybody else. The
 * configured default chat is used only when that user has not linked Telegram
 * (or, with no `userId`, as the legacy broadcast fallback when nobody has
 * linked at all).
 */
export async function getTelegramRecipientChatIds(defaultChatId?: string | null, userId?: string) {
  if (userId) {
    const link = await prisma.telegramLink.findUnique({ where: { userId }, select: { chatId: true } });
    if (link?.chatId) return [link.chatId];
    return defaultChatId ? [defaultChatId] : [];
  }

  const linked = await prisma.telegramLink.findMany({ select: { chatId: true } });
  const chatIds = linked.map((l) => l.chatId).filter(Boolean);

  if (chatIds.length > 0) return Array.from(new Set(chatIds));
  return defaultChatId ? [defaultChatId] : [];
}

export async function sendTelegramMessageToUser(
  userId: string,
  message: string,
  parseMode?: "HTML"
): Promise<boolean> {
  try {
    const config = await getTelegramBotConfig();
    if (!config.botToken) return false;

    const link = await prisma.telegramLink.findUnique({
      where: { userId },
      select: { chatId: true },
    });
    if (!link) return false;

    await sendTelegramBotMessage(config.botToken, link.chatId, message, parseMode);
    return true;
  } catch (err) {
    logger.warn("Failed to send Telegram message to user", { userId, error: err });
    return false;
  }
}

export async function issueTelegramLinkToken(userId: string) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const token = Array.from(crypto.randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join("");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.$transaction([
    prisma.telegramLinkToken.deleteMany({ where: { userId, usedAt: null } }),
    prisma.telegramLinkToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt,
      },
    }),
  ]);

  return { token, expiresAt };
}

export async function getTelegramLinkStatus(userId: string): Promise<TelegramLinkStatus> {
  const link = await prisma.telegramLink.findUnique({
    where: { userId },
    select: { chatId: true, username: true, linkedAt: true, lastSeenAt: true },
  });

  return {
    linked: Boolean(link),
    chatId: link?.chatId || null,
    username: link?.username || null,
    linkedAt: link?.linkedAt?.toISOString() || null,
    lastSeenAt: link?.lastSeenAt?.toISOString() || null,
  };
}

export async function unlinkTelegramForUser(userId: string) {
  await prisma.telegramLink.deleteMany({ where: { userId } });
}

export async function unlinkTelegramByTelegramUserId(telegramUserId: string) {
  await prisma.telegramLink.deleteMany({ where: { telegramUserId } });
}

export async function getTelegramLinkByTelegramUserId(telegramUserId: string) {
  return prisma.telegramLink.findUnique({
    where: { telegramUserId },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });
}

export async function linkTelegramAccount(
  token: string,
  identity: { telegramUserId: string; chatId: string; username?: string; firstName?: string; lastName?: string }
) {
  const tokenHash = hashToken(token.trim());
  const record = await prisma.telegramLinkToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new Error("Invalid or expired link code. Sign in to LePatch and generate a new one.");
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.telegramLink.deleteMany({
      where: {
        OR: [
          { userId: record.userId },
          { telegramUserId: identity.telegramUserId },
        ],
      },
    });

    const link = await tx.telegramLink.create({
      data: {
        userId: record.userId,
        telegramUserId: identity.telegramUserId,
        chatId: identity.chatId,
        username: identity.username || null,
        firstName: identity.firstName || null,
        lastName: identity.lastName || null,
        lastSeenAt: new Date(),
      },
    });

    await tx.telegramLinkToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    await tx.telegramLinkToken.deleteMany({
      where: { userId: record.userId, usedAt: null, id: { not: record.id } },
    });

    return { link, user: record.user };
  });

  return result;
}

export async function touchTelegramLink(telegramUserId: string) {
  await prisma.telegramLink.updateMany({
    where: { telegramUserId },
    data: { lastSeenAt: new Date() },
  });
}

export function extractTelegramCommand(text?: string | null) {
  const trimmed = text?.trim();
  if (!trimmed || !trimmed.startsWith("/")) return null;

  const [rawCommand, ...rest] = trimmed.split(/\s+/);
  const command = rawCommand.split("@")[0].slice(1).toLowerCase();
  return {
    command,
    args: rest,
  };
}

// ---------------------------------------------------------------------------
// Rich formatting functions
// ---------------------------------------------------------------------------

export function formatAppList(
  apps: (WatchedApp & { latestRelease?: Release | null })[]
): string {
  if (apps.length === 0) {
    return "📭 <b>No watched apps</b>\n\nAdd some apps to track in the LePatch dashboard.";
  }

  const lines: string[] = [`🏠 <b>Your Watched Apps</b> (${apps.length})\n`];

  for (const app of apps) {
    let badge: string;
    let versionLine: string;

    if (app.checkStatus === "failed") {
      badge = "⚠️";
      versionLine = `check failed — ${escapeHtml(app.checkError || "unknown error")}`;
    } else if (app.updateAvailable) {
      badge = "⬆️";
      const current = app.lastNotifiedTag || app.latestSeenTag || "?";
      const latest = app.latestSeenTag || "?";
      versionLine = `<code>${escapeHtml(current)}</code> → <code>${escapeHtml(latest)}</code> available!`;
    } else {
      badge = "✅";
      versionLine = `<code>${escapeHtml(app.latestSeenTag || app.lastNotifiedTag || "unknown")}</code> · up to date`;
    }

    lines.push(`${badge} <b>${escapeHtml(app.name)}</b>`);
    lines.push(`   ${versionLine}`);
    if (app.repoFullName) {
      lines.push(`   repo: <code>${escapeHtml(app.repoFullName)}</code>`);
    }
    lines.push("");
  }

  lines.push("💡 /check &lt;name&gt; to refresh");
  return lines.join("\n");
}
