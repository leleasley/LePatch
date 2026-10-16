import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, getCurrentSessionId, invalidateSession, clearSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { userMutationHandler } from "@/lib/api-helpers";
import { isValidTheme } from "@/lib/theme";

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().email().optional(),
  passwordEnabled: z.boolean().optional(),
  theme: z.string().optional(),
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ user });
  } catch (error) {
    return handleApiError(error);
  }
}

export const PATCH = userMutationHandler(async ({ session, request }) => {
  const body = schema.parse(await request.json());
  const currentUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true },
  });
  if (!currentUser) throw new Error("Unauthorized");

  if (body.email && body.email !== currentUser.email) {
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing && existing.id !== session.userId) {
      throw new Error("Email is already in use");
    }
  }

  if (body.theme && !isValidTheme(body.theme)) {
    throw new Error("Invalid theme");
  }

  const user = await prisma.user.update({
    where: { id: session.userId },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.email ? { email: body.email.toLowerCase() } : {}),
      ...(body.passwordEnabled !== undefined ? { passwordEnabled: body.passwordEnabled } : {}),
      ...(body.theme ? { theme: body.theme } : {}),
    },
    select: { id: true, name: true, email: true, role: true, theme: true, createdAt: true, updatedAt: true },
  });

  const response = NextResponse.json({ user });

  if (body.email) {
    const sessionId = await getCurrentSessionId();
    if (sessionId) {
      await invalidateSession(sessionId).catch(() => {});
    }
    clearSessionCookie(response);
  }

  return response;
});
