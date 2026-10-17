import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettingValue } from "@/lib/integration-secrets";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { createOAuthState, GITHUB_OAUTH_STATE_COOKIE, LEGACY_GITHUB_OAUTH_STATE_COOKIE } from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const clientId = await getIntegrationSettingValue("github", "oauthClientId");
    const enabled = await getIntegrationSettingValue("github", "oauthEnabled");

    if (!clientId || enabled !== "true") {
      return NextResponse.json({ error: "GitHub OAuth is not configured" }, { status: 400 });
    }

    const requestedMode = request.nextUrl.searchParams.get("mode") || "link";
    const mode = requestedMode === "login" ? "login" : "link";

    if (mode === "link") {
      const session = await getSession();
      if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const { state, nonce } = createOAuthState(mode);
    const redirectUri = `${env.appUrl}/api/auth/github/callback`;

    // repo: read access for private repos, read:user for the sponsorships query.
    const scope = mode === "link" ? "repo read:user" : "read:user";
    const githubAuthUrl =
      `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;

    const response = NextResponse.redirect(githubAuthUrl);
    response.cookies.set(GITHUB_OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    response.cookies.delete(LEGACY_GITHUB_OAUTH_STATE_COOKIE);

    return response;
  } catch {
    return NextResponse.json({ error: "Failed to initiate GitHub OAuth" }, { status: 500 });
  }
}