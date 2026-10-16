import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidateAllUserSessions, revokeAllTrustedDevices, clearSessionCookie, clearTrustedDeviceCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userMutationHandler } from "@/lib/api-helpers";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10, "Password must be at least 10 characters")
});

export const POST = userMutationHandler(async ({ session, request }) => {
  const body = schema.parse(await request.json());
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new Error("Unauthorized");
  const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
  if (!valid) throw new Error("Current password is incorrect");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(body.newPassword, 12) }
  });

  await invalidateAllUserSessions(user.id);
  await revokeAllTrustedDevices(user.id);
  const response = NextResponse.json({ ok: true, sessionReset: true });
  clearSessionCookie(response);
  clearTrustedDeviceCookie(response);
  return response;
});
