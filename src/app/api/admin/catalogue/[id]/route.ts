import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModerator, requestIp } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { createAuditLog } from "@/lib/audit";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const user = await requireModerator();
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.catalogueEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const entry = await prisma.catalogueEntry.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.repoFullName !== undefined && { repoFullName: body.repoFullName }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.packageNames !== undefined && { packageNames: body.packageNames }),
        ...(body.homepageUrl !== undefined && { homepageUrl: body.homepageUrl }),
        ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl }),
        ...(body.featured !== undefined && { featured: body.featured }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    createAuditLog({
      userId: user.id,
      action: "catalogue.updated",
      target: entry.name,
      targetId: entry.id,
      ipAddress: requestIp(request),
    }).catch(() => {});return NextResponse.json({ entry });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const user = await requireModerator();
    const { id } = await params;

    const existing = await prisma.catalogueEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.catalogueEntry.update({
      where: { id },
      data: { isActive: false },
    });

    createAuditLog({
      userId: user.id,
      action: "catalogue.deleted",
      target: existing.name,
      targetId: id,
      ipAddress: requestIp(request),
    }).catch(() => {});return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
