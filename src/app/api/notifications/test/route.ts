import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { sendChannel } from "@/lib/notifications";

const schema = z.object({ channelId: z.string().min(1) });

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    await assertApiSession();
    const { channelId } = schema.parse(await request.json());
    const channel = await prisma.notificationChannel.findUnique({ where: { id: channelId } });
    if (!channel) throw new Error("Notification channel not found");
    await sendChannel(channel, "LePatch test notification");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
