import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getIntegrationSettingValue } from "@/lib/integration-secrets";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const clientId = await getIntegrationSettingValue("github", "oauthClientId");
    const enabled = await getIntegrationSettingValue("github", "oauthEnabled");

    if (!clientId || enabled !== "true") {
      return NextResponse.json({ error: "GitHub OAuth is not configured" }, { status: 400 });
    }

    const mode = request.nextUrl.searchParams.get("mode") || "link";
    const stateToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000;

    let sessionUserId: string | null = null;
    if (mode === "link") {
      const session = await getSession();
      if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      sessionUserId = session.userId;
    }

    const stateData = JSON.stringify({
      token: stateToken,
      mode,
      userId: sessionUserId,
      expiresAt,
    });
    const encodedState = Buffer.from(stateData).toString("base64url");

    const redirectUri = `${env.appUrl}/api/auth/github/callback`;

    // read:user is needed for the Sponsored repos list (GraphQL sponsorshipsAsSponsor)
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent("repo read:user")}&state=${encodeURIComponent(encodedState)}&redirect_uri=${encodeURIComponent(redirectUri)}`;

    const response = NextResponse.redirect(githubAuthUrl);
    response.cookies.set("gh_oauth_state", stateToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Failed to initiate GitHub OAuth" }, { status: 500 });
  }
}
