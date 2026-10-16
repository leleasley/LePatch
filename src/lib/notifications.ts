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

async function sendDiscord(config: Config, content: string | Record<string, unknown>) {
  if (!config.webhookUrl) throw new Error("Discord webhook URL is missing");
  const body = typeof content === "string" ? { content } : content;
  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (response.status === 429) {
    // Discord rate limits per webhook and tells us how long to wait. Surfacing
    // it lets BullMQ back off instead of dropping the alert.
    const retryAfter = Number(response.headers.get("retry-after") || "") || 5;
    throw new Error(`Discord rate limited (retry after ${retryAfter}s)`);
  }
  if (!response.ok) throw new Error(`Discord webhook failed with status ${response.status}`);
}

async function sendTelegram(config: Config, text: string, parseMode?: string, userId?: string) {
  if (!config.botToken) throw new Error("Telegram bot token is missing");
  const recipients = await getTelegramRecipientChatIds(config.chatId || null, userId);
  if (recipients.length === 0) {
    throw new Error(
      userId
        ? "Telegram is not linked for this account and no default chat ID is configured"
        : "Telegram bot has no linked recipients or default chat ID"
    );
  }

  // Send independently so one failing recipient does not block the others.
  const results = await Promise.allSettled(
    recipients.map((chatId) =>
      sendTelegramBotMessage(config.botToken, chatId, text, parseMode === "HTML" ? "HTML" : undefined)
    )
  );
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length === results.length) {
    throw failed[0].status === "rejected" ? failed[0].reason : new Error("Telegram delivery failed");
  }
  for (const failure of failed) {
    if (failure.status === "rejected") logger.warn("Telegram delivery failed for one recipient", failure.reason);
  }
}

export function isInQuietHours(
  prefs: { quietHoursStart?: string | null; quietHoursEnd?: string | null; timezone?: string },
  now: Date = new Date()
): boolean {
  if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;
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

type Preference = {
  enabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  severityFilters: unknown;
  digestInterval?: number | null;
  id?: string;
} | null;

/**
 * Milliseconds until the user's quiet hours end, or 0 when not in them.
 */
export function msUntilQuietHoursEnd(
  prefs: Pick<NonNullable<Preference>, "quietHoursStart" | "quietHoursEnd" | "timezone">,
  from = new Date()
): number {
  if (!isInQuietHours(prefs, from)) return 0;

  const tz = prefs.timezone || "UTC";
  const end = prefs.quietHoursEnd as string;
  const [endH, endM] = end.split(":").map(Number);

  const nowParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(from);

  const get = (type: string) => Number(nowParts.find((p) => p.type === type)?.value ?? 0);
  const nowMinutes = get("hour") * 60 + get("minute");
  const endMinutes = endH * 60 + endM;
  const dayMs = 24 * 60 * 60 * 1000;

  // Advance to the next occurrence of the end time in the user's timezone.
  const minutesAhead = (endMinutes - nowMinutes + 1440) % 1440;
  // Guard against a misconfigured window (start == end means "always quiet").
  if (minutesAhead === 0) return dayMs;
  return minutesAhead * 60 * 1000 - get("second") * 1000;
}

/**
 * Milliseconds until the end of the user's current digest window.
 *
 * Windows are aligned per user so a shared instance does not fire every digest
 * at the same instant.
 */
export function msUntilDigestWindow(prefs: { digestInterval?: number | null; timezone?: string; id?: string }, from = new Date()): number {
  const intervalMinutes = prefs.digestInterval;
  if (!intervalMinutes || intervalMinutes <= 0) return 0;

  const windowMs = intervalMinutes * 60_000;
  const spread = prefs.id ? hashOffsetMs(prefs.id, windowMs) : 0;
  const elapsed = (from.getTime() + spread) % windowMs;
  const remaining = windowMs - elapsed;
  // Never hold a notification for more than a full window plus the spread.
  return remaining > 0 && remaining <= windowMs ? remaining : 0;
}

function hashOffsetMs(value: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash % modulo;
}

/**
 * Decide whether this release should be delivered to the release owner now.
 * Returns a reason when it must be suppressed or delayed.
 */
export async function evaluateDelivery(
  userId: string,
  release: Pick<Release, "prerelease" | "releaseType">
): Promise<{ deliver: boolean; deferMs?: number; reason?: string; digest?: boolean }> {
  const pref: Preference = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!pref) return { deliver: true };
  if (!pref.enabled) return { deliver: false, reason: "notifications disabled" };

  const severity = release.releaseType ?? (release.prerelease ? "prerelease" : "patch");
  if (Array.isArray(pref.severityFilters) && pref.severityFilters.length > 0) {
    const allowed = pref.severityFilters.map(String);
    if (!allowed.includes(severity)) {
      return { deliver: false, reason: `severity ${severity} filtered out` };
    }
  }

  const quietMs = msUntilQuietHoursEnd(pref);
  if (quietMs > 0) return { deliver: false, deferMs: quietMs, reason: "inside quiet hours" };

  const digestMs = msUntilDigestWindow({ ...pref, id: userId });
  if (digestMs > 0) return { deliver: false, deferMs: digestMs, reason: "batching into digest", digest: true };

  return { deliver: true };
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

type DigestItem = {
  id: string;
  releaseId: string;
  tagName: string;
  prerelease: boolean;
  htmlUrl: string;
  detectedAt: Date;
  watchedApp: { name: string; repoFullName: string; id: string };
};

/**
 * Claim any other pending events for the same user + channel so they can go
 * out in a single digest message. Only the first release in the group keeps a
 * concrete row to work from; the rest are keyed by their release id.
 */
async function takeDigestBatch(
  userId: string,
  channelId: string,
  currentEventId: string
): Promise<DigestItem[]> {
  const others = await prisma.notificationEvent.findMany({
    where: {
      id: { not: currentEventId },
      channelId,
      status: "pending",
      release: { watchedApp: { userId } },
    },
    orderBy: { createdAt: "desc" },
    take: 19,
    include: {
      release: {
        select: {
          id: true,
          tagName: true,
          prerelease: true,
          htmlUrl: true,
          detectedAt: true,
          watchedApp: { select: { name: true, repoFullName: true, id: true } },
        },
      },
    },
  });

  if (others.length === 0) return [];

  return others.map((o) => ({
    id: o.id,
    releaseId: o.release.id,
    tagName: o.release.tagName,
    prerelease: o.release.prerelease,
    htmlUrl: o.release.htmlUrl,
    detectedAt: o.release.detectedAt,
    watchedApp: o.release.watchedApp,
  }));
}

function formatDigest(items: DigestItem[], appUrl: string): string {
  const lines = [
    `<b>${items.length} new release${items.length === 1 ? "" : "s"}</b>`,
    "",
  ];
  for (const item of items) {
    const appPath = `${appUrl}/apps/${item.watchedApp.id}/releases`;
    const tag = item.prerelease ? "pre-release" : "release";
    lines.push(`• <b>${escapeHtml(item.tagName)}</b> — ${escapeHtml(item.watchedApp.name)} (${tag})`);
    lines.push(`  <a href="${escapeHtml(appPath)}">Open release notes</a>`);
  }
  return lines.join("\n");
}

function formatDiscordDigest(items: DigestItem[], appUrl: string) {
  return {
    embeds: [
      {
        title: `${items.length} new releases`,
        url: appUrl,
        color: 0x0969da,
        timestamp: new Date().toISOString(),
        fields: items.slice(0, 10).map((item) => ({
          name: item.tagName,
          value: `${item.watchedApp.name}${item.prerelease ? " (pre-release)" : ""}`,
          inline: true,
        })),
      },
    ],
  };
}

async function sendDigest(
  config: Config,
  channel: NotificationChannel,
  items: DigestItem[],
  userId: string
) {
  if (channel.type === "discord") {
    return sendDiscord(config, formatDiscordDigest(items, env.appUrl));
  }
  if (channel.type === "telegram") {
    return sendTelegram(config, formatDigest(items, env.appUrl), "HTML", userId);
  }
  throw new Error("Unsupported notification channel");
}

export async function sendNotificationEvent(eventId: string, options: { finalAttempt?: boolean } = {}) {
  const event = await prisma.notificationEvent.findUnique({
    where: { id: eventId },
    include: { channel: true, release: { include: { watchedApp: true } } }
  });
  if (!event) throw new Error("Notification event not found");

  // Idempotency guard. BullMQ re-delivers jobs whose worker died after the
  // HTTP POST but before the status write; without this check the user gets
  // the same alert twice.
  if (event.status === "sent") {
    logger.info("Skipping already-sent notification event", { eventId });
    return;
  }

  const { channel, release } = event;
  const app = release.watchedApp;

  // Per-user preferences were previously stored and never read, so users
  // received alerts they had muted, outside their quiet hours, and for
  // severities they had filtered out.
  const decision = await evaluateDelivery(app.userId, release);
  if (!decision.deliver) {
    if (decision.deferMs) {
      const { getNotificationSendQueue } = await import("@/lib/queues");
      const fireAt = Date.now() + decision.deferMs;
      await getNotificationSendQueue().add(
        "send",
        { eventId: event.id },
        {
          jobId: `notify-${event.id}-${Math.floor(fireAt / 60_000)}`,
          delay: decision.deferMs,
          attempts: 5,
          backoff: { type: "exponential", delay: 5_000 },
          removeOnComplete: { count: 500 },
          removeOnFail: { count: 1_000 },
        }
      );
      logger.info("Notification deferred until quiet hours end", { eventId, delayMs: decision.deferMs });
    } else {
      logger.info("Notification suppressed", { eventId, reason: decision.reason });
      await prisma.notificationEvent.update({
        where: { id: event.id },
        data: { status: "sent", sentAt: new Date(), error: null },
      });
    }
    return;
  }

  const versionTags = await getVersionTags(app.id, release.tagName, app.lastNotifiedTag);

  try {
    const config = await resolveChannelConfig(channel);

    // A digest drains every event queued in the same window into one message
    // instead of sending one alert per release. Only when the user actually
    // configured a digest interval — otherwise every send stays instant.
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId: app.userId },
      select: { digestInterval: true },
    });
    const digestEnabled = Boolean(pref?.digestInterval);
    const digestBatch = digestEnabled ? await takeDigestBatch(app.userId, channel.id, event.id) : [];
    const digestBatchIds = digestBatch.map((item) => item.id);

    if (digestBatchIds.length > 0) {
      await sendDigest(config, channel, digestBatch, app.userId);
    } else if (channel.type === "discord") {
      await sendDiscord(config, formatDiscordEmbed(app, release, versionTags));
    } else if (channel.type === "telegram") {
      await sendTelegram(config, formatTelegramHtml(app, release, versionTags), "HTML", app.userId);
    } else {
      await sendChannel(channel, notificationMessage(app, release, versionTags));
    }

    // Mark the whole batch sent, not just the event that triggered the job.
    await prisma.notificationEvent.updateMany({
      where: { id: { in: [event.id, ...digestBatchIds] }, status: { not: "sent" } },
      data: { status: "sent", sentAt: new Date(), error: null },
    });
    await prisma.release.updateMany({
      where: { id: { in: [event.releaseId, ...digestBatch.map((b) => b.releaseId)] } },
      data: { notificationSent: true },
    });
    await prisma.watchedApp.update({
      where: { id: event.release.watchedAppId },
      data: {
        lastNotifiedReleaseId: event.release.githubReleaseId,
        lastNotifiedTag: event.release.tagName
      }
    });
  } catch (error) {
    // Only mark the event failed once BullMQ has exhausted its retries,
    // otherwise a transient Discord 429 would permanently lose the alert.
    if (options.finalAttempt) {
      await prisma.notificationEvent.update({
        where: { id: event.id },
        data: {
          status: "failed",
          error: error instanceof Error ? error.message : "Notification failed",
        },
      });
    } else {
      logger.warn("Notification send failed, will retry", { eventId, error });
    }
    throw error;
  }
}
