import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertApiSession, assertCanManageApps } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { createAuditLog } from "@/lib/audit";
import { requestIp } from "@/lib/auth";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";

const VALID_CATEGORIES = ["media", "identity", "monitoring", "infrastructure", "documents"];

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();

  try {
    const session = await assertApiSession();
    await assertCanManageApps(session.userId);
    const body = await request.json();
    const { name, repoFullName, description, category, packageNames } = body;

    if (!name || !repoFullName || !description || !category) {
      return NextResponse.json({ error: "name, repoFullName, description, and category are required" }, { status: 400 });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    if (!repoFullName.includes("/")) {
      return NextResponse.json({ error: "repoFullName must be in owner/repo format" }, { status: 400 });
    }

    const normalized = repoFullName.toLowerCase().trim();
    const existing = await prisma.catalogueEntry.findUnique({ where: { repoFullName } });
    if (existing) {
      return NextResponse.json({ error: "This app is already in the catalogue" }, { status: 409 });
    }

    // Fuzzy duplicate check: normalize name, search for similar names
    const nameParts = name.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(Boolean);
    const fuzzyDuplicates = nameParts.length > 0
      ? await prisma.catalogueEntry.findMany({
          where: {
            OR: nameParts.map((part: string) => ({
              name: { contains: part, mode: "insensitive" as const },
            })),
          },
          select: { name: true, repoFullName: true },
          take: 5,
        })
      : [];

    const duplicateSuggestion = await prisma.catalogueSuggestion.findFirst({
      where: {
        OR: [
          { repoFullName: normalized },
          { name: { equals: name, mode: "insensitive" } },
        ],
        status: "pending",
      },
    });
    if (duplicateSuggestion) {
      return NextResponse.json({ error: "A pending suggestion for this app already exists" }, { status: 409 });
    }

    const suggestion = await prisma.catalogueSuggestion.create({
      data: {
        name,
        repoFullName,
        description,
        category,
        packageNames: packageNames || [],
        submittedBy: session.userId,
      },
    });

    createAuditLog({
      userId: session.userId,
      action: "catalogue.suggestion_created",
      target: suggestion.name,
      targetId: suggestion.id,
      ipAddress: requestIp(request),
    }).catch(() => {});return NextResponse.json({ suggestion, similarEntries: fuzzyDuplicates.length > 0 ? fuzzyDuplicates : undefined }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
