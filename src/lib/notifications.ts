import type { NotificationChannel, Release, WatchedApp } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptJson, encryptJson } from "@/lib/encryption";
import { getTelegramRecipientChatIds, sendTelegramBotMessage } from "@/lib/telegram-bot";
import { env } from "@/lib/env";
import { getIntegrationSettingValue } from "@/lib/integration-secrets";
import { logger } from "@/lib/logger";

type Config = Record<string, string>;

function preview(body?: string | null, length = 240) {
  return (body || "").replace(/\s+/g, " ").trim().slice(0, length);
}

function normalizeReleaseNotes(body?: string | null) {
  return (body || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s+/, "• ").trimEnd())
    .join("\n")
    .trim();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function parseChannelConfig(channel: Pick<NotificationChannel, "configJson">): Config {
  if (typeof channel.configJson === "string") {
    try {
      return decryptJson<Config>(channel.configJson);
    } catch (err) {
      logger.warn("Failed to decrypt notification channel config", { error: err });
      return {};
    }
  }

  if (channel.configJson && typeof channel.configJson === "object" && !Array.isArray(channel.configJson)) {
    return channel.configJson as Config;
  }

  return {};
}

async function getIntegrationConfig(provider: "discord" | "telegram"): Promise<Config> {
  const settings = await prisma.integrationSetting.findMany({ where: { provider } });
  const config: Config = {};

  for (const setting of settings) {
    if (!setting.value) continue;
    config[setting.key] = (await getIntegrationSettingValue(provider, setting.key)) || "";
  }

  return config;
}

async function integrationEnabled(provider: "discord" | "telegram"): Promise<boolean> {
  const value = await getIntegrationSettingValue(provider, "enabled");
  return value === "true";
}

async function resolveChannelConfig(channel: NotificationChannel): Promise<Config> {
  const channelConfig = parseChannelConfig(channel);
  const integrationConfig = await getIntegrationConfig(channel.type);
  return { ...channelConfig, ...integrationConfig };
}

export async function syncNotificationChannel(
  type: "discord" | "telegram",
  enabled: boolean,
  config: Config
) {
  return prisma.notificationChannel.upsert({
    where: { type_name: { type, name: type === "discord" ? "Discord" : "Telegram" } },
    update: {
      enabled,
      configJson: encryptJson(config),
    },
    create: {
      type,
      name: type === "discord" ? "Discord" : "Telegram",
      enabled,
      configJson: encryptJson(config),
    },
  });
}

export async function getEnabledNotificationChannels() {
  const channels = await prisma.notificationChannel.findMany();
  const byType = new Map(channels.map((channel) => [channel.type, channel]));
  const enabledChannels: NotificationChannel[] = [];

  for (const type of ["discord", "telegram"] as const) {
    const channel = byType.get(type);
    const enabled = Boolean(channel?.enabled) || (await integrationEnabled(type));
    if (!enabled) continue;

    if (channel) {
      enabledChannels.push(
        channel.enabled
          ? channel
          : await prisma.notificationChannel.update({
              where: { id: channel.id },
              data: { enabled: true },
            })
      );
    } else {
      enabledChannels.push(await syncNotificationChannel(type, true, {}));
    }
  }

  return enabledChannels;
}

export async function getIntegrationStatus(provider: "discord" | "telegram") {
  const settings = await prisma.integrationSetting.findMany({ where: { provider } });
  const result: Record<string, { configured: boolean }> = {};

  for (const setting of settings) {
    result[setting.key] = { configured: true };
  }

  const enabledValue = await getIntegrationSettingValue(provider, "enabled");
  return {
    settings: result,
    enabled: enabledValue === "true",
  };
}

export function notificationMessage(app: WatchedApp, release: Release, versionTags: string[]) {
  const published = release.publishedAt ? release.publishedAt.toISOString().slice(0, 10) : "Unknown";
  const versions = versionTags.length > 0 ? versionTags.join(" → ") : release.tagName;
  const pre = release.prerelease ? " [PRERELEASE]" : "";
  return [
    `New release detected${pre}`,
    "",
    `App: ${app.name}`,
    `Repo: ${app.repoFullName}`,
    `Versions: ${versions}`,
    `Published: ${published}`,
    "",
    `View in LePatch: ${env.appUrl}/apps/${app.id}`,
    preview(release.body) ? `\nNotes: ${preview(release.body)}` : ""
  ].join("\n");
}

export function formatDiscordEmbed(app: WatchedApp, release: Release, versionTags: string[]) {
  const published = release.publishedAt ? release.publishedAt.toISOString().slice(0, 10) : "Unknown";
  const versions = versionTags.length > 0 ? versionTags.join(" → ") : release.tagName;
  return {
    embeds: [{
      title: `New release: ${release.tagName}${release.prerelease ? " 🧪 (pre-release)" : ""}`,
      description: preview(release.body) ? preview(release.body).slice(0, 2048) : undefined,
      url: `${env.appUrl}/apps/${app.id}`,
      color: release.prerelease ? 0xffa726 : 0x00bcd4,
      timestamp: new Date().toISOString(),
      fields: [
        { name: "App", value: app.name, inline: true },
        { name: "Repo", value: app.repoFullName, inline: true },
        { name: "Versions", value: versions, inline: false },
        { name: "Published", value: published, inline: true },
        ...(release.prerelease ? [{ name: "Channel", value: "Pre-release", inline: true }] : []),
      ],
    }]
  };
}

// Cap notes so one release is always one Telegram message. Nightly
// changelogs can be tens of KB (full commit lists) which the sender would
// otherwise split into a flood of message parts.
const TELEGRAM_NOTES_MAX_LENGTH = 1500;

export function formatTelegramHtml(app: WatchedApp, release: Release, versionTags: string[]) {
  const published = release.publishedAt ? release.publishedAt.toISOString().slice(0, 10) : "Unknown";
  const fullNotes = normalizeReleaseNotes(release.body);
  const truncated = fullNotes.length > TELEGRAM_NOTES_MAX_LENGTH;
  const notes = truncated ? fullNotes.slice(0, TELEGRAM_NOTES_MAX_LENGTH).trimEnd() : fullNotes;
  const versions = versionTags.length > 0 ? versionTags.join(" → ") : release.tagName;
  const lines = [
    release.prerelease ? "<b>🧪 New pre-release detected</b>" : "<b>New release detected</b>",
    "",
    `<b>App:</b> ${escapeHtml(app.name)}`,
    `<b>Repo:</b> ${escapeHtml(app.repoFullName)}`,
    `<b>Versions:</b> ${escapeHtml(versions)}`,
    `<b>Published:</b> ${published}`,
    ...(release.prerelease ? [`<b>Channel:</b> Pre-release`] : []),
    "",
    `<a href="${escapeHtml(env.appUrl)}/apps/${escapeHtml(app.id)}">View in LePatch</a>`,
  ];
  if (notes) {
    lines.push("", `<b>Update Features:</b>`, escapeHtml(notes));
    if (truncated) {
      lines.push(
        "",
        `<i>Notes truncated (${fullNotes.length.toLocaleString()} chars) — <a href="${escapeHtml(release.htmlUrl)}">read the full release notes on GitHub</a></i>`
      );
    }
  }
  return lines.join("\n");
}

async function sendDiscord(config: Config, content: string | Record<string, any>) {
  if (!config.webhookUrl) throw new Error("Discord webhook URL is missing");
  const body = typeof content === "string" ? { content } : content;
  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Discord webhook failed with status ${response.status}`);
}

async function sendTelegram(config: Config, text: string, parseMode?: string) {
  if (!config.botToken) throw new Error("Telegram bot token is missing");
  const recipients = await getTelegramRecipientChatIds(config.chatId || null);
  if (recipients.length === 0) throw new Error("Telegram bot has no linked recipients or default chat ID");

  for (const chatId of recipients) {
    await sendTelegramBotMessage(config.botToken, chatId, text, parseMode === "HTML" ? "HTML" : undefined);
  }
}

export function isInQuietHours(prefs: { quietHoursStart?: string | null; quietHoursEnd?: string | null; timezone?: string }): boolean {
  if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;
  const now = new Date();
  const tz = prefs.timezone || "UTC";
  const timeStr = now.toLocaleString("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
  const [startH, startM] = prefs.quietHoursStart.split(":").map(Number);
  const [endH, endM] = prefs.quietHoursEnd.split(":").map(Number);
  const [nowH, nowM] = timeStr.split(":").map(Number);
  const nowMin = nowH * 60 + nowM;
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  if (startMin <= endMin) return nowMin >= startMin && nowMin < endMin;
  return nowMin >= startMin || nowMin < endMin;
}

export async function getEffectiveUsersForNotification(): Promise<Array<{ userId: string; channelType: string }>> {
  const users = await prisma.user.findMany({
    where: { role: { not: "restricted" } },
    select: { id: true, notificationPreference: true },
  });
  const results: Array<{ userId: string; channelType: string }> = [];
  for (const user of users) {
    const prefs = user.notificationPreference;
    if (prefs && !prefs.enabled) continue;
    if (prefs && isInQuietHours(prefs)) continue;
    results.push({ userId: user.id, channelType: "telegram" });
    results.push({ userId: user.id, channelType: "discord" });
  }
  return results;
}

export async function sendChannel(channel: NotificationChannel, content: string) {
  const config = await resolveChannelConfig(channel);
  if (channel.type === "discord") return sendDiscord(config, content);
  if (channel.type === "telegram") return sendTelegram(config, content);
  throw new Error("Unsupported notification channel");
}

async function getVersionTags(appId: string, currentTag: string, lastNotifiedTag: string | null): Promise<string[]> {
  if (!lastNotifiedTag) return [];
  const allReleases = await prisma.release.findMany({
    where: { watchedAppId: appId },
    orderBy: { publishedAt: "desc" },
    select: { tagName: true },
    take: 50,
  });
  const idx = allReleases.findIndex((r) => r.tagName === lastNotifiedTag);
  if (idx < 0) return [currentTag];
  const versions = allReleases.slice(0, idx).reverse().map((r) => r.tagName);
  if (versions.length === 0) return [currentTag];
  if (versions[versions.length - 1] !== currentTag) versions.push(currentTag);
  return versions;
}

export async function sendNotificationEvent(eventId: string) {
  const event = await prisma.notificationEvent.findUnique({
    where: { id: eventId },
    include: { channel: true, release: { include: { watchedApp: true } } }
  });
  if (!event) throw new Error("Notification event not found");

  const { channel, release } = event;
  const app = release.watchedApp;
  const versionTags = await getVersionTags(app.id, release.tagName, app.lastNotifiedTag);

  try {
    const config = await resolveChannelConfig(channel);
    if (channel.type === "discord") {
      await sendDiscord(config, formatDiscordEmbed(app, release, versionTags));
    } else if (channel.type === "telegram") {
      await sendTelegram(config, formatTelegramHtml(app, release, versionTags), "HTML");
    } else {
      await sendChannel(channel, notificationMessage(app, release, versionTags));
    }

    await prisma.notificationEvent.update({
      where: { id: event.id },
      data: { status: "sent", sentAt: new Date(), error: null }
    });
    await prisma.release.update({ where: { id: event.releaseId }, data: { notificationSent: true } });
    await prisma.watchedApp.update({
      where: { id: event.release.watchedAppId },
      data: {
        lastNotifiedReleaseId: event.release.githubReleaseId,
        lastNotifiedTag: event.release.tagName
      }
    });
  } catch (error) {
    await prisma.notificationEvent.update({
      where: { id: event.id },
      data: { status: "failed", error: error instanceof Error ? error.message : "Notification failed" }
    });
    throw error;
  }
}
