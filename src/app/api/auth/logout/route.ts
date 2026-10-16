import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { clearSessionCookie, clearTrustedDeviceCookie, invalidateSession, getCurrentSessionId } from "@/lib/auth";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  const sessionId = await getCurrentSessionId();
  if (sessionId) {
    await invalidateSession(sessionId);
    const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { userId: true } });
    if (session) {
      createAuditLog({ userId: session.userId, action: "user.logout" }).catch(() => {});}
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  clearTrustedDeviceCookie(response);
  return response;
}
