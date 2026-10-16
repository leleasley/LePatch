import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModerator, requestIp } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const user = await requireModerator();
    const { id } = await params;
    const body = await request.json();

    const entry = await prisma.catalogueEntry.findUnique({ where: { id } });
    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let featuredOrder = entry.featuredOrder;
    if (body.featured && !featuredOrder) {
      const maxOrder = await prisma.catalogueEntry.aggregate({
        where: { featured: true },
        _max: { featuredOrder: true },
      });
      featuredOrder = (maxOrder._max.featuredOrder || 0) + 1;
    }

    const updated = await prisma.catalogueEntry.update({
      where: { id },
      data: {
        featured: body.featured ?? !entry.featured,
        featuredOrder: body.featured ? featuredOrder : null,
      },
    });

    createAuditLog({
      userId: user.id,
      action: "catalogue.featured",
      target: updated.name,
      targetId: updated.id,
      metadata: { featured: updated.featured },
      ipAddress: requestIp(request),
    }).catch(() => {});return NextResponse.json({ entry: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
