import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { syncNotificationChannel } from "@/lib/notifications";
import { upsertIntegrationSetting } from "@/lib/integration-secrets";
import { setupRequestHandler } from "@/lib/api-helpers";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  confirmPassword: z.string(),
  appUrl: z.string().min(1),
  githubToken: z.string().optional(),
  telegram: z.object({
    botToken: z.string().optional(),
    chatId: z.string().optional(),
    webhookSecret: z.string().optional(),
  }).optional(),
  discord: z.object({
    webhookUrl: z.string().optional(),
  }).optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const POST = setupRequestHandler(
  async ({ request }) => {
    const existing = await prisma.user.count();
  if (existing > 0) throw new Error("Setup already complete");

  const body = schema.parse(await request.json());
  const passwordHash = await bcrypt.hash(body.password, 12);

  await prisma.user.create({
    data: {
      name: "Admin",
      email: body.email,
      passwordHash,
      role: "administrator",
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: "appUrl" },
    create: { key: "appUrl", value: body.appUrl },
    update: { value: body.appUrl },
  });

  if (body.githubToken) {
    await upsertIntegrationSetting("github", "token", body.githubToken);
  }

  if (body.telegram) {
    if (body.telegram.botToken) {
      await upsertIntegrationSetting("telegram", "botToken", body.telegram.botToken);
    }
    if (body.telegram.chatId) {
      await upsertIntegrationSetting("telegram", "chatId", body.telegram.chatId);
    }
    if (body.telegram.webhookSecret) {
      await upsertIntegrationSetting("telegram", "webhookSecret", body.telegram.webhookSecret);
    }
    const enabled = Boolean(body.telegram.botToken && body.telegram.chatId);
    await upsertIntegrationSetting("telegram", "enabled", String(enabled));
    await syncNotificationChannel("telegram", enabled, {
      botToken: body.telegram.botToken || "",
      chatId: body.telegram.chatId || "",
    });
  }

  if (body.discord?.webhookUrl) {
    await upsertIntegrationSetting("discord", "webhookUrl", body.discord.webhookUrl);
    await upsertIntegrationSetting("discord", "enabled", "true");
    await syncNotificationChannel("discord", true, {
      webhookUrl: body.discord.webhookUrl,
    });
  }

  return NextResponse.json({ ok: true });
},
true);
