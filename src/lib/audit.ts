import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";
import { type AuditAction, describeAction } from "@/lib/audit-actions";


export async function createAuditLog(params: {
  userId?: string;
  action: AuditAction;
  target?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await prisma.auditLog.create({ data: params as Prisma.AuditLogCreateInput });
  } catch (error) {
    logger.error("Failed to create audit log", { error, action: params.action });
  }
}

export type AuditLogEntry = {
  id: string;
  userId: string | null;
  action: string;
  target: string | null;
  targetId: string | null;
  metadata: Prisma.JsonValue | null;
  ipAddress: string | null;
  createdAt: Date;
  user?: { name: string; email: string } | null;
};

export async function getAuditLogs(params: {
  limit?: number;
  offset?: number;
  action?: string;
  userId?: string;
}): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const { limit = 50, offset = 0, action, userId } = params;

  const where: Prisma.AuditLogWhereInput = {};
  if (action) where.action = { contains: action };
  if (userId) where.userId = userId;

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const entries = rows.map((row) => ({
    ...row,
    createdAt: row.createdAt,
  }));

  return { entries, total };
}

export { describeAction };
export type { AuditAction };
