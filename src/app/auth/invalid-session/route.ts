import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = new URL("/session-reset?reason=invalid-session", url);

  const response = NextResponse.redirect(destination);
  clearSessionCookie(response);
  return response;
}
