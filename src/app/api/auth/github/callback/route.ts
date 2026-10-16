import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIntegrationSettingValue } from "@/lib/integration-secrets";
import { createSessionForUser, requestIp, requestUserAgent } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { encrypt } from "@/lib/encryption";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { invalidateGithubLinkCache } from "@/lib/github-link-cache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL("/login?toast=github-oauth-failed", env.appUrl));
  }

  const stateCookie = request.cookies.get("gh_oauth_state")?.value;
  if (!stateCookie) {
    return NextResponse.redirect(new URL("/login?toast=github-oauth-failed", env.appUrl));
  }

  let stateData: { token: string; mode: string; userId: string | null; expiresAt: number };
  try {
    stateData = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(new URL("/login?toast=github-oauth-failed", env.appUrl));
  }

  if (stateData.token !== stateCookie) {
    return NextResponse.redirect(new URL("/login?toast=github-oauth-failed", env.appUrl));
  }
  if (!stateData.expiresAt || stateData.expiresAt < Date.now()) {
    return NextResponse.redirect(new URL("/login?toast=github-oauth-failed", env.appUrl));
  }

  const clientId = await getIntegrationSettingValue("github", "oauthClientId");
  const clientSecret = await getIntegrationSettingValue("github", "oauthClientSecret");

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?toast=github-oauth-failed", env.appUrl));
  }

  let accessToken: string;
  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "LePatch",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });
    const tokenData = await tokenResponse.json();
    if (tokenData.error) {
      logger.error("GitHub OAuth token exchange failed", { error: tokenData.error });
      return NextResponse.redirect(new URL("/login?toast=github-oauth-failed", env.appUrl));
    }
    accessToken = tokenData.access_token;
  } catch (err) {
    logger.error("GitHub OAuth token exchange error", err);
    return NextResponse.redirect(new URL("/login?toast=github-oauth-failed", env.appUrl));
  }

  let githubUser: { id: number; login: string; email: string | null };
  try {
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "LePatch",
      },
    });
    if (!userResponse.ok) throw new Error("Failed to fetch GitHub user");
    githubUser = await userResponse.json();
  } catch (err) {
    logger.error("Failed to fetch GitHub user info", err);
    return NextResponse.redirect(new URL("/login?toast=github-oauth-failed", env.appUrl));
  }

  const encryptedToken = encrypt(accessToken);

  if (stateData.mode === "login") {
    const existingLink = await prisma.gitHubLink.findUnique({
      where: { githubUserId: githubUser.id },
      include: { user: { select: { id: true } } },
    });

    if (!existingLink) {
      const cleanupUrl = new URL("/login", env.appUrl);
      cleanupUrl.searchParams.set("toast", "github-not-linked");
      const response = NextResponse.redirect(cleanupUrl);
      response.cookies.set("gh_oauth_state", "", { maxAge: 0, path: "/" });
      return response;
    }

    await prisma.gitHubLink.update({
      where: { id: existingLink.id },
      data: { lastUsedAt: new Date() },
    });

    const res = NextResponse.redirect(new URL("/dashboard?toast=logged-in", env.appUrl));

    await createSessionForUser(
      existingLink.user.id,
      res,
      requestUserAgent(request),
      requestIp(request)
    );

    createAuditLog({
      userId: existingLink.user.id,
      action: "user.login",
      target: "github",
      metadata: { githubUsername: githubUser.login },
      ipAddress: requestIp(request),
    }).catch(() => {});res.cookies.set("gh_oauth_state", "", { maxAge: 0, path: "/" });
    return res;
  }

  if (stateData.mode === "link" && stateData.userId) {
    const existingLink = await prisma.gitHubLink.findUnique({
      where: { githubUserId: githubUser.id },
    });

    if (existingLink && existingLink.userId !== stateData.userId) {
      const cleanupUrl = new URL("/profile/security", env.appUrl);
      cleanupUrl.searchParams.set("toast", "github-already-linked");
      const response = NextResponse.redirect(cleanupUrl);
      response.cookies.set("gh_oauth_state", "", { maxAge: 0, path: "/" });
      return response;
    }

    await prisma.gitHubLink.upsert({
      where: { userId: stateData.userId },
      update: {
        githubUserId: githubUser.id,
        githubUsername: githubUser.login,
        accessToken: encryptedToken,
        linkedAt: new Date(),
      },
      create: {
        userId: stateData.userId,
        githubUserId: githubUser.id,
        githubUsername: githubUser.login,
        accessToken: encryptedToken,
      },
    });

    createAuditLog({
      userId: stateData.userId,
      action: "github.connected",
      target: githubUser.login,
      metadata: { githubUserId: githubUser.id },
    }).catch(() => {});invalidateGithubLinkCache(stateData.userId);

    const cleanupUrl = new URL("/profile/security", env.appUrl);
    cleanupUrl.searchParams.set("toast", "github-connected");
    const response = NextResponse.redirect(cleanupUrl);
    response.cookies.set("gh_oauth_state", "", { maxAge: 0, path: "/" });
    return response;
  }

  const cleanupUrl = new URL("/login", env.appUrl);
  cleanupUrl.searchParams.set("toast", "github-oauth-failed");
  const response = NextResponse.redirect(cleanupUrl);
  response.cookies.set("gh_oauth_state", "", { maxAge: 0, path: "/" });
  return response;
}
