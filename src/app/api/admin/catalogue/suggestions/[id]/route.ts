import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModerator } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { createAuditLog } from "@/lib/audit";
import { requestIp } from "@/lib/auth";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const user = await requireModerator();
    const { id } = await params;
    const body = await request.json();
    const { action, notes } = body;

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
    }

    const suggestion = await prisma.catalogueSuggestion.findUnique({ where: { id } });
    if (!suggestion) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (suggestion.status !== "pending") {
      return NextResponse.json({ error: "Suggestion has already been reviewed" }, { status: 409 });
    }

    if (action === "approve") {
      const existing = await prisma.catalogueEntry.findUnique({
        where: { repoFullName: suggestion.repoFullName },
      });
      if (existing) {
        await prisma.catalogueSuggestion.update({
          where: { id },
          data: { status: "rejected", notes: "Already in catalogue", reviewedBy: user.id, reviewedAt: new Date() },
        });
        return NextResponse.json({ error: "This app is already in the catalogue" }, { status: 409 });
      }

      const entry = await prisma.catalogueEntry.create({
        data: {
          name: suggestion.name,
          repoFullName: suggestion.repoFullName,
          description: suggestion.description,
          category: suggestion.category,
          packageNames: suggestion.packageNames,
        },
      });

      await prisma.catalogueSuggestion.update({
        where: { id },
        data: { status: "approved", notes, reviewedBy: user.id, reviewedAt: new Date() },
      });

      createAuditLog({
        userId: user.id,
        action: "catalogue.created",
        target: entry.name,
        targetId: entry.id,
        ipAddress: requestIp(request),
      }).catch(() => {});createAuditLog({
        userId: user.id,
        action: "catalogue.suggestion_approved",
        target: suggestion.name,
        targetId: suggestion.id,
        ipAddress: requestIp(request),
      }).catch(() => {});return NextResponse.json({ suggestion: { ...suggestion, status: "approved" }, entry });
    }

    const updated = await prisma.catalogueSuggestion.update({
      where: { id },
      data: { status: "rejected", notes, reviewedBy: user.id, reviewedAt: new Date() },
    });

    createAuditLog({
      userId: user.id,
      action: "catalogue.suggestion_rejected",
      target: updated.name,
      targetId: updated.id,
      ipAddress: requestIp(request),
      metadata: { notes: notes || null },
    }).catch(() => {});return NextResponse.json({ suggestion: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
