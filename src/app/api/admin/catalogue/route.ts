import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModerator, requestIp } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { createAuditLog } from "@/lib/audit";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";

export async function GET(request: NextRequest) {
  try {
    await requireModerator();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const active = searchParams.get("active");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("perPage") || "50")));

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { repoFullName: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }
    if (category) where.category = category;
    if (active === "true") where.isActive = true;
    else if (active === "false") where.isActive = false;

    const [entries, total] = await Promise.all([
      prisma.catalogueEntry.findMany({
        where,
        orderBy: [{ featuredOrder: { sort: "asc", nulls: "last" } }, { name: "asc" }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      prisma.catalogueEntry.count({ where }),
    ]);

    return NextResponse.json({ entries, total, page, perPage });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const user = await requireModerator();
    const body = await request.json();
    const { name, repoFullName, description, category, packageNames, homepageUrl, logoUrl, featured } = body;

    if (!name || !repoFullName || !description || !category) {
      return NextResponse.json({ error: "name, repoFullName, description, and category are required" }, { status: 400 });
    }

    const existing = await prisma.catalogueEntry.findUnique({ where: { repoFullName } });
    if (existing) {
      return NextResponse.json({ error: "An entry with this repo already exists" }, { status: 409 });
    }

    const entry = await prisma.catalogueEntry.create({
      data: {
        name,
        repoFullName,
        description,
        category,
        packageNames: packageNames || [],
        homepageUrl: homepageUrl || null,
        logoUrl: logoUrl || null,
        featured: featured || false,
      },
    });

    createAuditLog({
      userId: user.id,
      action: "catalogue.created",
      target: entry.name,
      targetId: entry.id,
      ipAddress: requestIp(request),
    }).catch(() => {});return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
