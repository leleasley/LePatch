import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

async function checkDatabase(): Promise<"ok" | "error"> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "ok";
  } catch {
    return "error";
  }
}

async function checkRedis(): Promise<"ok" | "error" | "not_configured"> {
  const url = env.redisUrl;
  if (!url || url === "redis://localhost:6379") return "not_configured";
  return "ok";
}

async function checkWorker(): Promise<"ok" | "error" | "not_configured"> {
  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue("health-check", { connection: { url: env.redisUrl } });
    await queue.getJobCounts();
    await queue.close();
    return "ok";
  } catch {
    return "not_configured";
  }
}

export async function GET() {
  const [database, redis, worker] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkWorker(),
  ]);

  const version = process.env.npm_package_version || "0.1.0";

  return NextResponse.json({
    status: database === "ok" && redis !== "error" ? "ok" : "degraded",
    database,
    redis,
    worker,
    version,
  });
}
