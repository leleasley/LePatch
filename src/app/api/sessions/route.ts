import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveSessions, getCurrentSessionId, getCurrentUser, revokeAllTrustedDevices } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { userMutationHandler } from "@/lib/api-helpers";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const sessions = await getActiveSessions(user.id);
    return NextResponse.json({ sessions });
  } catch (error) {
    return handleApiError(error);
  }
}

export const DELETE = userMutationHandler(async ({ session }) => {
  const currentSessionId = await getCurrentSessionId();
  await prisma.session.deleteMany({
    where: {
      userId: session.userId,
      ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
    },
  });
  await revokeAllTrustedDevices(session.userId);
  return NextResponse.json({ success: true });
});
