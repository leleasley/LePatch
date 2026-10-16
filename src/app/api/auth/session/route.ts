import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ authenticated: true, user });
  } catch {
    return NextResponse.json({ authenticated: false, user: null });
  }
}
