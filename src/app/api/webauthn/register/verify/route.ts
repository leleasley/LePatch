import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { verifyPasskeyRegistration } from "@/lib/webauthn";

function rpId(req: NextRequest): string {
  return (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(":")[0];
}

function origin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  return `${proto}://${host}`;
}

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    await verifyPasskeyRegistration(user.id, body, rpId(request), origin(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
