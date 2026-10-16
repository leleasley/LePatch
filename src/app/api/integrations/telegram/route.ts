import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { adminMutationHandler } from "@/lib/api-helpers";
import { getIntegrationStatus, syncNotificationChannel } from "@/lib/notifications";
import { fetchTelegramBotMe, getTelegramRecipientChatIds, sendTelegramBotMessage, setTelegramBotCommands } from "@/lib/telegram-bot";
import { getIntegrationSettingValue, upsertIntegrationSetting } from "@/lib/integration-secrets";

const postSchema = z.object({
  action: z.enum(["update", "setWebhook", "clearWebhook", "sendTest"]).optional().default("update"),
  botToken: z.string().optional(),
  chatId: z.string().optional(),
  webhookSecret: z.string().optional(),
  enabled: z.boolean().optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    const [status, chatId] = await Promise.all([
      getIntegrationStatus("telegram"),
      getTelegramChatId(),
    ]);
    return NextResponse.json({
      ...status,
      chatId: chatId || "",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

async function getTelegramToken(): Promise<string | null> {
  return getIntegrationSettingValue("telegram", "botToken");
}

async function getTelegramChatId(): Promise<string | null> {
  return getIntegrationSettingValue("telegram", "chatId");
}

async function getAppUrl(): Promise<string> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: "appUrl" },
  });
  return setting?.value || process.env.APP_URL || "http://localhost:3000";
}

export const POST = adminMutationHandler(async ({ request }) => {
    const body = postSchema.parse(await request.json());

    if (body.action === "setWebhook") {
      const token = await getTelegramToken();
      if (!token) throw new Error("Bot token not configured");
      const existingSecret = await getIntegrationSettingValue("telegram", "webhookSecret");
      const secret = existingSecret || crypto.randomUUID();
      if (!existingSecret) {
        await upsertIntegrationSetting("telegram", "webhookSecret", secret);
      }
      const appUrl = await getAppUrl();
      const webhookUrl = `${appUrl.replace(/\/+$/, "")}/api/webhook/telegram`;
      const response = await fetch(
        `https://api.telegram.org/bot${token}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: webhookUrl,
            secret_token: secret,
          }),
        }
      );
      const data = await response.json();
      if (!data.ok) throw new Error(data.description || "Failed to set webhook");
      await setTelegramBotCommands(token);
      return NextResponse.json({ success: true, description: data.description });
    }

    if (body.action === "clearWebhook") {
      const token = await getTelegramToken();
      if (!token) throw new Error("Bot token not configured");
      const response = await fetch(
        `https://api.telegram.org/bot${token}/deleteWebhook`,
        { method: "POST" }
      );
      const data = await response.json();
      if (!data.ok) throw new Error(data.description || "Failed to clear webhook");
      return NextResponse.json({ success: true, description: data.description });
    }

    if (body.action === "sendTest") {
      const token = await getTelegramToken();
      if (!token) throw new Error("Bot token not configured");
      const recipients = await getTelegramRecipientChatIds(await getTelegramChatId());
      if (recipients.length === 0) throw new Error("No Telegram Bot recipients are available yet");
      for (const chatId of recipients) {
        await sendTelegramBotMessage(token, chatId, "Test message from LePatch");
      }
      return NextResponse.json({ success: true });
    }

    const upserts: Promise<any>[] = [];
    let nextToken = body.botToken;
    let nextChatId = body.chatId;
    let nextEnabled = body.enabled;

    if (nextToken === undefined) nextToken = await getTelegramToken() ?? undefined;
    if (nextChatId === undefined) nextChatId = await getTelegramChatId() ?? undefined;
    if (nextEnabled === undefined) {
      const enabledValue = await getIntegrationSettingValue("telegram", "enabled");
      nextEnabled = enabledValue === "true";
    }

    if (body.botToken !== undefined) {
      upserts.push(upsertIntegrationSetting("telegram", "botToken", body.botToken));
      const bot = await fetchTelegramBotMe(body.botToken);
      upserts.push(
        prisma.integrationSetting.upsert({
          where: { provider_key: { provider: "telegram", key: "botUsername" } },
          update: { value: bot.username || "", encrypted: false },
          create: { provider: "telegram", key: "botUsername", value: bot.username || "", encrypted: false },
        }),
        prisma.integrationSetting.upsert({
          where: { provider_key: { provider: "telegram", key: "botName" } },
          update: { value: bot.first_name || "", encrypted: false },
          create: { provider: "telegram", key: "botName", value: bot.first_name || "", encrypted: false },
        }),
        prisma.integrationSetting.upsert({
          where: { provider_key: { provider: "telegram", key: "botId" } },
          update: { value: String(bot.id), encrypted: false },
          create: { provider: "telegram", key: "botId", value: String(bot.id), encrypted: false },
        })
      );
    }
    if (body.chatId !== undefined) {
      upserts.push(upsertIntegrationSetting("telegram", "chatId", body.chatId));
    }
    if (body.webhookSecret !== undefined) {
      upserts.push(upsertIntegrationSetting("telegram", "webhookSecret", body.webhookSecret));
    }
    if (body.enabled !== undefined) {
      upserts.push(
        prisma.integrationSetting.upsert({
          where: { provider_key: { provider: "telegram", key: "enabled" } },
          update: { value: String(body.enabled), encrypted: false },
          create: { provider: "telegram", key: "enabled", value: String(body.enabled), encrypted: false },
        })
      );
    }
    await Promise.all(upserts);
    await syncNotificationChannel("telegram", Boolean(nextEnabled), {
      botToken: nextToken || "",
      chatId: nextChatId || "",
    });
    return NextResponse.json({ success: true });
});

export const DELETE = adminMutationHandler(async () => {
  await prisma.integrationSetting.deleteMany({
    where: { provider: "telegram" },
  });
  await syncNotificationChannel("telegram", false, { botToken: "", chatId: "" });
  return NextResponse.json({ success: true });
});
