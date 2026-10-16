import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { generatePasskeyRegistrationOptions } from "@/lib/webauthn";
import { checkPasskeyOptionsRateLimit } from "@/lib/api-rate-limit";
import { webauthnRpId } from "@/lib/webauthn-origin";

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return rejectedCsrfResponse();

  try {
    const limited = await checkPasskeyOptionsRateLimit(request, "webauthn-register-options");
    if (limited) return limited;
    const user = await getCurrentUser();
    const options = await generatePasskeyRegistrationOptions(user.id, webauthnRpId(request));
    return NextResponse.json(options);
  } catch (error) {
    return handleApiError(error);
  }
}
