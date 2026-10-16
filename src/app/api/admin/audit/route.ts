import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { getAuditLogs, createAuditLog } from "@/lib/audit";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requestIp } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);
    const action = searchParams.get("action") || undefined;
    const userId = searchParams.get("userId") || undefined;

    const result = await getAuditLogs({ limit, offset, action, userId });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();

  try {
    const user = await requireAdmin();

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || undefined;
    const userId = searchParams.get("userId") || undefined;

    const where: Prisma.AuditLogWhereInput = {};
    if (action) where.action = { contains: action };
    if (userId) where.userId = userId;

    const result = await prisma.auditLog.deleteMany({ where });
    logger.info("Audit logs cleared", { action: action || "all", userId: userId || null, count: result.count });

    createAuditLog({
      userId: user.id,
      action: "admin.audit_cleared",
      target: action ? `action:${action}` : "all audit logs",
      metadata: { action: action || null, userId: userId || null, count: result.count },
      ipAddress: requestIp(request),
    }).catch(() => {});return NextResponse.json({ ok: true, deleted: result.count });
  } catch (error) {
    return handleApiError(error);
  }
}
