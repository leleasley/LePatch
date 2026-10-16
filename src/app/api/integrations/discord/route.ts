import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { adminMutationHandler } from "@/lib/api-helpers";
import { getIntegrationStatus, syncNotificationChannel } from "@/lib/notifications";
import { getIntegrationSettingValue, upsertIntegrationSetting } from "@/lib/integration-secrets";

const postSchema = z.object({
  action: z.enum(["update", "sendTest"]).optional().default("update"),
  webhookUrl: z.string().optional(),
  enabled: z.boolean().optional(),
});

async function getDiscordWebhookUrl(): Promise<string | null> {
  return getIntegrationSettingValue("discord", "webhookUrl");
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await getIntegrationStatus("discord"));
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = adminMutationHandler(async ({ request }) => {
    const body = postSchema.parse(await request.json());

    if (body.action === "sendTest") {
      const webhookUrl = await getDiscordWebhookUrl();
      if (!webhookUrl) throw new Error("Webhook URL not configured");
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Test message from LePatch" }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to send test message");
      }
      return NextResponse.json({ success: true });
    }

    const upserts: Promise<any>[] = [];
    let nextWebhookUrl = body.webhookUrl;
    let nextEnabled = body.enabled;

    if (nextWebhookUrl === undefined) nextWebhookUrl = await getDiscordWebhookUrl() ?? undefined;
    if (nextEnabled === undefined) {
      const enabledValue = await getIntegrationSettingValue("discord", "enabled");
      nextEnabled = enabledValue === "true";
    }

    if (body.webhookUrl !== undefined) {
      upserts.push(upsertIntegrationSetting("discord", "webhookUrl", body.webhookUrl));
    }
    if (body.enabled !== undefined) {
      upserts.push(
        prisma.integrationSetting.upsert({
          where: { provider_key: { provider: "discord", key: "enabled" } },
          update: { value: String(body.enabled), encrypted: false },
          create: { provider: "discord", key: "enabled", value: String(body.enabled), encrypted: false },
        })
      );
    }
    await Promise.all(upserts);
    await syncNotificationChannel("discord", Boolean(nextEnabled), {
      webhookUrl: nextWebhookUrl || "",
    });
    return NextResponse.json({ success: true });
});

export const DELETE = adminMutationHandler(async () => {
  await prisma.integrationSetting.deleteMany({
    where: { provider: "discord" },
  });
  await syncNotificationChannel("discord", false, { webhookUrl: "" });
  return NextResponse.json({ success: true });
});
