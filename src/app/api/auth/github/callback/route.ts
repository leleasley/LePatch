import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIntegrationSettingValue } from "@/lib/integration-secrets";
import { createMfaSetupToken, createMfaToken, getSession } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { encrypt } from "@/lib/encryption";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { invalidateGithubLinkCache } from "@/lib/github-link-cache";
import {
  GITHUB_OAUTH_STATE_COOKIE,
  LEGACY_GITHUB_OAUTH_STATE_COOKIE,
  verifyOAuthState,
} from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

function clearStateCookies(response: NextResponse) {
  response.cookies.delete(GITHUB_OAUTH_STATE_COOKIE);
  response.cookies.delete(LEGACY_GITHUB_OAUTH_STATE_COOKIE);
  return response;
}

function failureRedirect(toast: string, path = "/login") {
  const url = new URL(path, env.appUrl);
  url.searchParams.set("toast", toast);
  return clearStateCookies(NextResponse.redirect(url));
}

/** Redirect that carries no toast — used for the MFA hand-off, which is a different page. */
function stepRedirect(path: string) {
  return clearStateCookies(NextResponse.redirect(new URL(path, env.appUrl)));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const rawState = request.nextUrl.searchParams.get("state");

  if (!code || !rawState) {
    return failureRedirect("github-oauth-failed");
  }

  const stateData = verifyOAuthState(rawState);
  if (!stateData) {
    return failureRedirect("github-oauth-failed");
  }

  const stateCookie =
    request.cookies.get(GITHUB_OAUTH_STATE_COOKIE)?.value ||
    request.cookies.get(LEGACY_GITHUB_OAUTH_STATE_COOKIE)?.value;
  if (!stateCookie || stateCookie !== stateData.nonce) {
    return failureRedirect("github-oauth-failed");
  }

  const clientId = await getIntegrationSettingValue("github", "oauthClientId");
  const clientSecret = await getIntegrationSettingValue("github", "oauthClientSecret");

  if (!clientId || !clientSecret) {
    return failureRedirect("github-oauth-failed");
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
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenData = await tokenResponse.json();
    if (tokenData.error) {
      logger.error("GitHub OAuth token exchange failed", { error: String(tokenData.error) });
      return failureRedirect("github-oauth-failed");
    }
    accessToken = tokenData.access_token;
  } catch (err) {
    logger.error("GitHub OAuth token exchange error", err);
    return failureRedirect("github-oauth-failed");
  }

  let githubUser: { id: number; login: string };
  try {
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "LePatch",
      },
    });
    if (!userResponse.ok) throw new Error(`GitHub user lookup failed with ${userResponse.status}`);
    githubUser = await userResponse.json();
  } catch (err) {
    logger.error("Failed to fetch GitHub user info", err);
    return failureRedirect("github-oauth-failed");
  }

  if (stateData.mode === "login") {
    const existingLink = await prisma.gitHubLink.findUnique({
      where: { githubUserId: githubUser.id },
      select: { id: true, userId: true },
    });

    if (!existingLink) {
      return failureRedirect("github-not-linked");
    }

    await prisma.gitHubLink.update({
      where: { id: existingLink.id },
      data: { lastUsedAt: new Date() },
    });

    // GitHub is only the first factor here. A password-equivalent login must
    // still clear MFA (or enrol it) exactly like the password flow does.
    const user = await prisma.user.findUnique({
      where: { id: existingLink.userId },
      select: { totpEnabled: true },
    });

    if (!user?.totpEnabled) {
      const setupToken = await createMfaSetupToken(existingLink.userId);
      return stepRedirect(`/setup/mfa?token=${setupToken}`);
    }

    const mfaToken = await createMfaToken(existingLink.userId);
    return stepRedirect(`/mfa?token=${mfaToken}`);
  }

  // Link mode: the acting user always comes from the live session.
  const session = await getSession();
  if (!session) {
    return failureRedirect("github-oauth-failed");
  }
  const userId = session.userId;

  const existingLink = await prisma.gitHubLink.findUnique({
    where: { githubUserId: githubUser.id },
  });

  if (existingLink && existingLink.userId !== userId) {
    return failureRedirect("github-already-linked", "/profile/security");
  }

  await prisma.gitHubLink.upsert({
    where: { userId },
    update: {
      githubUserId: githubUser.id,
      githubUsername: githubUser.login,
      accessToken: encrypt(accessToken),
      linkedAt: new Date(),
    },
    create: {
      userId,
      githubUserId: githubUser.id,
      githubUsername: githubUser.login,
      accessToken: encrypt(accessToken),
    },
  });

  createAuditLog({
    userId,
    action: "github.connected",
    target: githubUser.login,
    metadata: { githubUserId: githubUser.id },
  }).catch(() => {});
  invalidateGithubLinkCache(userId);

  return failureRedirect("github-connected", "/profile/security");
}
