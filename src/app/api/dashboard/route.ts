import { NextResponse } from "next/server";
import { assertApiSession, assertCanManageApps } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { loadDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await assertApiSession();
    await assertCanManageApps(session.userId);
    const data = await loadDashboardData(session.userId);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=60" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
