import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { verifyPasskeyRegistration } from "@/lib/webauthn";
import { webauthnRpId, webauthnAllowedOrigins } from "@/lib/webauthn-origin";

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    await verifyPasskeyRegistration(user.id, body, webauthnRpId(request), webauthnAllowedOrigins);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
