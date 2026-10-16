import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/http";
import { requireSession, getActiveTrustedDevices, revokeTrustedDevice, revokeAllTrustedDevices } from "@/lib/auth";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    const devices = await getActiveTrustedDevices(session.userId);
    return NextResponse.json({ devices });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);

    if (searchParams.get("all") === "true") {
      await revokeAllTrustedDevices(session.userId);
      return NextResponse.json({ success: true });
    }

    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing device id" }, { status: 400 });
    }

    await revokeTrustedDevice(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
