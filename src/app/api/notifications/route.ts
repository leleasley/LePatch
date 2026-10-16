import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { encryptJson, decryptJson } from "@/lib/encryption";

const schema = z.object({
  channels: z.array(
    z.object({
      type: z.enum(["discord", "telegram"]),
      enabled: z.boolean(),
      configJson: z.record(z.string(), z.string())
    })
  )
});

export async function GET() {
  try {
    await assertApiSession();
    const channels = await prisma.notificationChannel.findMany({ orderBy: { type: "asc" } });
    const decrypted = channels.map((channel) => {
      if (typeof channel.configJson === "string") {
        try {
          return { ...channel, configJson: decryptJson<Record<string, string>>(channel.configJson) };
        } catch {
          return channel;
        }
      }
      return channel;
    });
    return NextResponse.json({ channels: decrypted });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const session = await assertApiSession();
    const body = schema.parse(await request.json());
    const channels = await Promise.all(
      body.channels.map((channel) =>
        prisma.notificationChannel.upsert({
          where: { type_name: { type: channel.type, name: channel.type === "discord" ? "Discord" : "Telegram" } },
          update: { enabled: channel.enabled, configJson: encryptJson(channel.configJson) },
          create: {
            type: channel.type,
            name: channel.type === "discord" ? "Discord" : "Telegram",
            enabled: channel.enabled,
            configJson: encryptJson(channel.configJson)
          }
        })
      )
    );
    for (const channel of channels) {
      const action = channel.createdAt === channel.updatedAt ? "notification.created" : "notification.updated";
      createAuditLog({ userId: session.userId, action, target: channel.type, targetId: channel.id }).catch(() => {});}
    return NextResponse.json({ channels });
  } catch (error) {
    return handleApiError(error);
  }
}
