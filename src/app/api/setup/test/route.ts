import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { setupRequestHandler } from "@/lib/api-helpers";
import { createRateLimiter } from "@/lib/rate-limit";
import { resolveClientIp } from "@/lib/request-ip";

const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });

const schema = z.object({
  type: z.enum(["github", "telegram", "discord"]),
  githubToken: z.string().max(200).optional(),
  botToken: z.string().max(200).optional(),
  chatId: z.string().max(100).optional(),
  webhookUrl: z.string().max(500).optional(),
});

/**
 * Discord webhook hosts. Without this allowlist the setup endpoint is an
 * unauthenticated SSRF primitive: during the first-run window anyone could make
 * the server POST to an arbitrary internal address.
 */
const DISCORD_WEBHOOK_HOSTS = new Set([
  "discord.com",
  "discordapp.com",
  "ptb.discord.com",
  "canary.discord.com",
]);

function assertDiscordWebhook(raw: string | undefined): string {
  if (!raw) throw new Error("Discord webhook URL is required");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Discord webhook URL is not a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("Discord webhook URL must use HTTPS");
  }
  if (!DISCORD_WEBHOOK_HOSTS.has(url.hostname)) {
    throw new Error("Discord webhook URL must be a discord.com webhook");
  }
  if (!url.pathname.startsWith("/api/webhooks/")) {
    throw new Error("Discord webhook URL is not a webhook endpoint");
  }
  return url.toString();
}

export const POST = setupRequestHandler(
  async ({ request }) => {
    const existing = await prisma.user.count();
    if (existing > 0) throw new Error("Setup already complete");

    const { allowed } = await limiter(`setup-test:${resolveClientIp(request)}`);
    if (!allowed) return NextResponse.json({ error: "Too many setup attempts" }, { status: 429 });

    const body = schema.parse(await request.json());

    if (body.type === "github") {
      if (!body.githubToken) throw new Error("GitHub token is required");
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `token ${body.githubToken}` },
      });
      if (!res.ok) throw new Error("GitHub token is invalid");
    }

    if (body.type === "telegram") {
      if (!body.botToken) throw new Error("Telegram bot token is required");
      const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(body.botToken)}/getMe`);
      if (!res.ok) throw new Error("Telegram bot token is invalid");
    }

    if (body.type === "discord") {
      const webhookUrl = assertDiscordWebhook(body.webhookUrl);
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "LePatch setup test" }),
      });
      if (!res.ok) throw new Error("Discord webhook URL is invalid");
    }

    return NextResponse.json({ ok: true });
  },
  true
);