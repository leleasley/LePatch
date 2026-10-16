import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { adminMutationHandler } from "@/lib/api-helpers";
import { shouldEncryptIntegrationSetting, upsertIntegrationSetting } from "@/lib/integration-secrets";

const postSchema = z.object({
  provider: z.string().min(1),
  key: z.string().min(1),
  value: z.string(),
  encrypted: z.boolean().optional().default(false),
});

const deleteSchema = z.object({
  provider: z.string().min(1),
  key: z.string().min(1),
});

export async function GET() {
  try {
    await requireAdmin();
    const settings = await prisma.integrationSetting.findMany();
    const providers: Record<string, { keys: string[]; configured: boolean }> = {};
    for (const s of settings) {
      if (!providers[s.provider]) providers[s.provider] = { keys: [], configured: false };
      providers[s.provider].keys.push(s.key);
      providers[s.provider].configured = true;
    }
    return NextResponse.json({ providers });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = adminMutationHandler(async ({ request }) => {
  const body = postSchema.parse(await request.json());
  const forceEncrypt = body.encrypted || shouldEncryptIntegrationSetting(body.provider, body.key);
  const setting = forceEncrypt
    ? await upsertIntegrationSetting(body.provider, body.key, body.value)
    : await prisma.integrationSetting.upsert({
        where: { provider_key: { provider: body.provider, key: body.key } },
        update: { value: body.value, encrypted: false },
        create: { provider: body.provider, key: body.key, value: body.value, encrypted: false },
      });
  return NextResponse.json({ setting });
});

export const DELETE = adminMutationHandler(async ({ request }) => {
  const body = deleteSchema.parse(await request.json());
  await prisma.integrationSetting.deleteMany({
    where: { provider: body.provider, key: body.key },
  });
  return NextResponse.json({ success: true });
});
