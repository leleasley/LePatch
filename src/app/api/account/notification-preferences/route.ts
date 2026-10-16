import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";

export const dynamic = "force-dynamic";

const prefSchema = z.object({
  enabled: z.boolean().optional(),
  digestInterval: z.number().int().min(0).nullable().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  timezone: z.string().optional(),
  severityFilters: z.array(z.string()).nullable().optional(),
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    const prefs = await prisma.notificationPreference.findUnique({ where: { userId: user.id } });
    return NextResponse.json({ preference: prefs || { enabled: true, digestInterval: null, quietHoursStart: null, quietHoursEnd: null, timezone: "UTC", severityFilters: null } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const user = await getCurrentUser();
    const body = prefSchema.parse(await request.json());

    const updateData: Record<string, unknown> = {};
    if (body.enabled !== undefined) updateData.enabled = body.enabled;
    if (body.digestInterval !== undefined) updateData.digestInterval = body.digestInterval;
    if (body.quietHoursStart !== undefined) updateData.quietHoursStart = body.quietHoursStart;
    if (body.quietHoursEnd !== undefined) updateData.quietHoursEnd = body.quietHoursEnd;
    if (body.timezone) updateData.timezone = body.timezone;
    if (body.severityFilters !== undefined) updateData.severityFilters = body.severityFilters === null ? Prisma.JsonNull : body.severityFilters;

    const preference = await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      update: updateData,
      create: {
        user: { connect: { id: user.id } },
        enabled: body.enabled ?? true,
        digestInterval: body.digestInterval ?? null,
        quietHoursStart: body.quietHoursStart ?? null,
        quietHoursEnd: body.quietHoursEnd ?? null,
        timezone: body.timezone ?? "UTC",
        severityFilters: body.severityFilters !== undefined
          ? (body.severityFilters === null ? Prisma.JsonNull : body.severityFilters)
          : undefined,
      },
    });

    return NextResponse.json({ preference });
  } catch (error) {
    return handleApiError(error);
  }
}
