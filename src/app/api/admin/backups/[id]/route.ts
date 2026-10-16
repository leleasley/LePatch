import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { deleteBackup, downloadBackup } from "@/lib/backup";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { requestIp } from "@/lib/auth";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!validateCsrf(request)) return rejectedCsrfResponse();
    const user = await requireAdmin();
    const { id } = await params;
    const backup = await prisma.backup.findUnique({ where: { id }, select: { filename: true } });
    await deleteBackup(id);
    createAuditLog({
      userId: user.id,
      action: "backup.deleted",
      target: backup?.filename || id,
      targetId: id,
      ipAddress: requestIp(request),
    }).catch(() => {});return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const { filepath, filename } = await downloadBackup(id);
    const buffer = await readFile(filepath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
