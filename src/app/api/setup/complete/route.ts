import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { syncNotificationChannel } from "@/lib/notifications";
import { upsertIntegrationSetting } from "@/lib/integration-secrets";
import { setupRequestHandler } from "@/lib/api-helpers";
import { createRateLimiter } from "@/lib/rate-limit";
import { resolveClientIp } from "@/lib/request-ip";

const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });

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
    const { allowed } = await limiter(`setup-complete:${resolveClientIp(request)}`);
    if (!allowed) {
      return NextResponse.json({ error: "Too many setup attempts" }, { status: 429 });
    }

    const body = schema.parse(await request.json());
    const passwordHash = await bcrypt.hash(body.password, 12);

    // Create first and treat a unique/serialization failure as "setup already
    // complete". Counting users before inserting left a window where two
    // concurrent requests could each create an administrator.
    try {
      await prisma.user.create({
        data: {
          name: "Admin",
          email: body.email.toLowerCase(),
          passwordHash,
          role: "administrator",
        },
      });
    } catch (error) {
      const alreadySetUp = (await prisma.user.count()) > 0;
      if (alreadySetUp) return NextResponse.json({ error: "Setup already complete" }, { status: 409 });
      throw error;
    }

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
