import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/http";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await requireSession();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        totpEnabled: true,
        totpBackupCodes: true,
      },
    });

    if (!user) throw new Error("Unauthorized");

    return NextResponse.json({
      enabled: user.totpEnabled,
      backupCodesRemaining: user.totpBackupCodes.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
