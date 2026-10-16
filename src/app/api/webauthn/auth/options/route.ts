import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/http";
import { generateCsrfToken, setCsrfCookie } from "@/lib/csrf";
import { generatePasskeyAuthOptions } from "@/lib/webauthn";
import { checkPasskeyOptionsRateLimit } from "@/lib/api-rate-limit";

function rpId(req: NextRequest): string {
  return (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(":")[0];
}

export async function GET(request: NextRequest) {
  try {
    const limited = await checkPasskeyOptionsRateLimit(request, "webauthn-auth-options");
    if (limited) return limited;
    const options = await generatePasskeyAuthOptions(rpId(request));
    const response = NextResponse.json(options);
    setCsrfCookie(response, generateCsrfToken());
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
