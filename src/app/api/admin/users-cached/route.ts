import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
const CACHE_TTL = 6 * 60 * 60; // 6 hours in seconds
const CACHE_KEY = "users-cached";

export async function GET() {
  try {
    await requireAdmin();

    const redis = getRedis();
    if (redis && (redis.status === "ready" || redis.status === "connecting" || redis.status === "connect")) {
      try {
        const cached = await redis.get(CACHE_KEY);
        if (cached) {
          return NextResponse.json({ users: JSON.parse(cached), cached: true });
        }
      } catch {
        // Redis error, fall through to DB
      }
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true },
    });

    // Cache in Redis if available
    if (redis && (redis.status === "ready" || redis.status === "connecting" || redis.status === "connect")) {
      try {
        await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(users));
      } catch {
        // Cache failure is non-critical
      }
    }

    return NextResponse.json({ users, cached: false });
  } catch (error) {
    logger.error("GET /api/admin/users-cached failed", error as Error);
    return handleApiError(error);
  }
}
