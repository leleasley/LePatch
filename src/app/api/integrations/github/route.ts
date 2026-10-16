import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { adminMutationHandler } from "@/lib/api-helpers";
import { getIntegrationSettingValue, upsertIntegrationSetting } from "@/lib/integration-secrets";

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save-token"),
    token: z.string().min(1),
  }),
  z.object({
    action: z.literal("save-oauth"),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("remove-token"),
  }),
  z.object({
    action: z.literal("remove-oauth"),
  }),
]);

export async function GET() {
  try {
    await requireAdmin();

    const [tokenSetting, oauthClientIdSetting, oauthSecretSetting, oauthEnabledSetting] = await Promise.all([
      prisma.integrationSetting.findUnique({
        where: { provider_key: { provider: "github", key: "token" } },
      }),
      prisma.integrationSetting.findUnique({
        where: { provider_key: { provider: "github", key: "oauthClientId" } },
      }),
      prisma.integrationSetting.findUnique({
        where: { provider_key: { provider: "github", key: "oauthClientSecret" } },
      }),
      prisma.integrationSetting.findUnique({
        where: { provider_key: { provider: "github", key: "oauthEnabled" } },
      }),
    ]);

    const tokenConfigured = !!tokenSetting && !!tokenSetting.value;
    let rateLimit = null;
    if (tokenConfigured) {
      const token = await getIntegrationSettingValue("github", "token");
      const response = await fetch("https://api.github.com/rate_limit", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "LePatch",
        },
      });
      if (response.ok) {
        const data = await response.json();
        rateLimit = data.resources?.core || null;
      } else {
        rateLimit = { error: "Failed to query GitHub API", status: response.status };
      }
    }

    const oauthConfigured = !!oauthClientIdSetting?.value && !!oauthSecretSetting?.value;
    const oauthEnabled = oauthEnabledSetting?.value === "true";

    return NextResponse.json({
      configured: tokenConfigured,
      rateLimit,
      oauth: {
        configured: oauthConfigured,
        enabled: oauthEnabled,
        clientId: oauthClientIdSetting?.value || null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = adminMutationHandler(async ({ request }) => {
  const body = postSchema.parse(await request.json());

  if (body.action === "save-token") {
    await upsertIntegrationSetting("github", "token", body.token);
    return NextResponse.json({ success: true });
  }

  if (body.action === "save-oauth") {
    if (!/^[A-Za-z0-9_]{10,}$/.test(body.clientId)) {
      return NextResponse.json({ error: "Invalid GitHub Client ID format. Must be at least 10 alphanumeric characters." }, { status: 422 });
    }
    if (!/^[A-Za-z0-9]{20,}$/.test(body.clientSecret)) {
      return NextResponse.json(
        { error: "Invalid GitHub Client Secret format. Must be at least 20 alphanumeric characters." },
        { status: 422 }
      );
    }
    await Promise.all([
      upsertIntegrationSetting("github", "oauthClientId", body.clientId),
      upsertIntegrationSetting("github", "oauthClientSecret", body.clientSecret),
      upsertIntegrationSetting("github", "oauthEnabled", body.enabled ? "true" : "false"),
    ]);
    return NextResponse.json({ success: true });
  }

  if (body.action === "remove-token") {
    await prisma.integrationSetting.deleteMany({
      where: { provider: "github", key: "token" },
    });
    return NextResponse.json({ success: true });
  }

  if (body.action === "remove-oauth") {
    await prisma.integrationSetting.deleteMany({
      where: { provider: "github", key: { in: ["oauthClientId", "oauthClientSecret", "oauthEnabled"] } },
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
});
