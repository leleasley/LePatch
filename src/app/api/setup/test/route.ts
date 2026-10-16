import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { setupRequestHandler } from "@/lib/api-helpers";

const schema = z.object({
  type: z.enum(["github", "telegram", "discord"]),
  githubToken: z.string().optional(),
  botToken: z.string().optional(),
  chatId: z.string().optional(),
  webhookUrl: z.string().optional(),
});

export const POST = setupRequestHandler(
  async ({ request }) => {
    const existing = await prisma.user.count();
  if (existing > 0) throw new Error("Setup already complete");

  const body = schema.parse(await request.json());

  if (body.type === "github") {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `token ${body.githubToken}` },
    });
    if (!res.ok) throw new Error("GitHub token is invalid");
  }

  if (body.type === "telegram") {
    const res = await fetch(`https://api.telegram.org/bot${body.botToken}/getMe`);
    if (!res.ok) throw new Error("Telegram bot token is invalid");
  }

  if (body.type === "discord") {
    const res = await fetch(body.webhookUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "LePatch setup test" }),
    });
    if (!res.ok) throw new Error("Discord webhook URL is invalid");
  }

  return NextResponse.json({ ok: true });
},
true);
