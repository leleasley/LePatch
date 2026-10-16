import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getReleaseCheckQueue } from "@/lib/queues";
import { telegramBotCommands } from "@/lib/telegram-commands";
import {
  answerCallbackQuery,
  escapeHtml,
  extractTelegramCommand,
  formatAppList,
  getTelegramBotConfig,
  getTelegramLinkByTelegramUserId,
  linkTelegramAccount,
  sendTelegramBotMessage,
  TelegramUpdate,
  touchTelegramLink,
  unlinkTelegramByTelegramUserId,
} from "@/lib/telegram-bot";
import { checkWebhookRateLimit } from "@/lib/api-rate-limit";
import { webhookRequestHandler } from "@/lib/api-helpers";

function formatTelegramCommandHelp(admin: boolean): string {
  const visibleCommands = telegramBotCommands.filter((command) => admin || !command.adminOnly);
  return visibleCommands
    .map((command) => {
      const suffix = command.adminOnly ? " (admin)" : "";
      return `   /${command.command} — ${command.description}${suffix}`;
    })
    .join("\n");
}

function formatLinkedAt(date: Date | string | null): string {
  if (!date) return "unknown";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString();
}

export const POST = webhookRequestHandler(async ({ request }) => {
    const limited = await checkWebhookRateLimit(request, "telegram-webhook");
    if (limited) return limited;
    const secretToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (!secretToken) {
      return NextResponse.json({ error: "Missing secret token" }, { status: 401 });
    }

    const config = await getTelegramBotConfig();
    if (!config.webhookSecret || !config.botToken) {
      return NextResponse.json({ error: "Webhook not configured" }, { status: 401 });
    }

    if (secretToken !== config.webhookSecret) {
      return NextResponse.json({ error: "Invalid secret token" }, { status: 401 });
    }

    const update = (await request.json()) as TelegramUpdate;
    logger.info("Telegram webhook received", { update });

    // Handle callback queries (inline keyboard button presses)
    if (update.callback_query) {
      if (update.callback_query.id) {
        await answerCallbackQuery(config.botToken, update.callback_query.id, "Done").catch(() => {});
      }
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    if (!message?.text || !message.from || !message.chat) {
      return NextResponse.json({ ok: true });
    }

    if (message.chat.type !== "private") {
      await sendTelegramBotMessage(
        config.botToken,
        String(message.chat.id),
        "🔒 Please use this bot in a private chat to interact with LePatch."
      );
      return NextResponse.json({ ok: true });
    }

    const parsed = extractTelegramCommand(message.text);
    if (!parsed) {
      await sendTelegramBotMessage(
        config.botToken,
        String(message.chat.id),
        "🤔 I don't understand that. Use /help to see what I can do!"
      );
      return NextResponse.json({ ok: true });
    }

    const telegramUserId = String(message.from.id);
    const chatId = String(message.chat.id);
    const existingLink = await getTelegramLinkByTelegramUserId(telegramUserId);
    if (existingLink) {
      await touchTelegramLink(telegramUserId);
    }

    // -----------------------------------------------------------------------
    // Unlinked commands
    // -----------------------------------------------------------------------

    if (parsed.command === "start") {
      if (existingLink) {
        const appCount = await prisma.watchedApp.count({ where: { userId: existingLink.user.id } });
        await sendTelegramBotMessage(
          config.botToken,
          chatId,
          `👋 Welcome back, <b>${escapeHtml(existingLink.user.name || existingLink.user.email)}</b>!\n\n` +
          `<b>LePatch Bot</b> keeps you updated on new software releases.\n\n` +
          `<b>What I can do:</b>\n` +
          `   📦 Track watched apps for new releases\n` +
          `   🧪 Notify you about pre-releases\n` +
          `   🔔 Send release alerts instantly\n\n` +
          `<b>Quick stats:</b>\n` +
          `   Apps tracked: <b>${appCount}</b>\n\n` +
          `<b>Commands:</b>\n` +
          `   /apps — Watched apps\n` +
          `   /updates — Available updates\n` +
          `   /help — All commands\n\n` +
          `💡 Type /help to see the full list.`,
          "HTML"
        );
      } else {
        await sendTelegramBotMessage(
          config.botToken,
          chatId,
          `👋 <b>Welcome to LePatch Bot!</b>\n\n` +
          `I keep you updated on new software releases for the repos you care about.\n\n` +
          `<b>To get started:</b>\n` +
          `1. Sign in to LePatch web dashboard\n` +
          `2. Go to <b>Profile → Telegram Bot Access</b>\n` +
          `3. Generate a link code\n` +
          `4. Send <code>/link YOURCODE</code> here\n\n` +
          `💡 Use /help for more info.`,
          "HTML"
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (parsed.command === "link") {
      if (existingLink) {
        await sendTelegramBotMessage(
          config.botToken,
          chatId,
          `✅ You're already linked as <b>${escapeHtml(existingLink.user.email)}</b>.\n\nUse /unlink to remove the link first if you want to switch accounts.`,
          "HTML"
        );
        return NextResponse.json({ ok: true });
      }

      const code = parsed.args[0];
      if (!code) {
        await sendTelegramBotMessage(
          config.botToken,
          chatId,
          `🔗 <b>Link your LePatch account</b>\n\n` +
          `Usage: <code>/link YOURCODE</code>\n\n` +
          `Get a code from LePatch → Profile → Telegram Bot Access.`,
          "HTML"
        );
        return NextResponse.json({ ok: true });
      }

      try {
        const linked = await linkTelegramAccount(code, {
          telegramUserId,
          chatId,
          username: message.from.username,
          firstName: message.from.first_name,
          lastName: message.from.last_name,
        });

        await sendTelegramBotMessage(
          config.botToken,
          chatId,
          `🎉 <b>Successfully linked!</b>\n\n` +
          `Account: <b>${escapeHtml(linked.user.email)}</b>\n\n` +
          `You now have access to all LePatch features. Try these:\n` +
          `   /status — Account overview\n` +
          `   /apps — Watched apps\n` +
          `   /updates — Available updates\n` +
          `   /help — All commands`,
          "HTML"
        );
      } catch (error) {
        await sendTelegramBotMessage(
          config.botToken,
          chatId,
          `❌ ${escapeHtml(error instanceof Error ? error.message : "Unable to link this Telegram account right now.")}`,
          "HTML"
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (parsed.command === "help") {
      if (!existingLink) {
        await sendTelegramBotMessage(
          config.botToken,
          chatId,
          `📋 <b>LePatch Bot — Help</b>\n\n` +
          `<b>Linking your account:</b>\n` +
          `1. Sign in to LePatch web dashboard\n` +
          `2. Go to <b>Profile → Telegram Bot Access</b>\n` +
          `3. Generate a link code\n` +
          `4. Send <code>/link YOURCODE</code> here\n\n` +
          `<b>Available commands:</b>\n` +
          `   /start — Welcome message\n` +
          `   /link CODE — Link your account\n` +
          `   /help — This message\n\n` +
          `<b>More commands unlock after linking.</b>`,
          "HTML"
        );
      } else {
        const isAdmin = existingLink.user.role === "administrator";
        let helpText =
          `📋 <b>LePatch Bot — Help</b>\n\n` +
          `<b>Commands:</b>\n` +
          `${formatTelegramCommandHelp(isAdmin)}\n`;

        if (isAdmin) {
          helpText += `\n🔑 <i>You have admin privileges.</i>`;
        } else {
          helpText += `\n🔒 <i>Some commands require admin access.</i>`;
        }

        await sendTelegramBotMessage(config.botToken, chatId, helpText, "HTML");
      }
      return NextResponse.json({ ok: true });
    }

    // -----------------------------------------------------------------------
    // Require linked account for all remaining commands
    // -----------------------------------------------------------------------

    if (!existingLink) {
      await sendTelegramBotMessage(
        config.botToken,
        chatId,
        `🔒 You need to link your account first.\n\n` +
        `Sign in to LePatch → Profile → Telegram Bot Access → generate code.\n` +
        `Then send <code>/link YOURCODE</code> here.`,
        "HTML"
      );
      return NextResponse.json({ ok: true });
    }

    // -----------------------------------------------------------------------
    // Linked user commands
    // -----------------------------------------------------------------------

    if (parsed.command === "status") {
      const appCount = await prisma.watchedApp.count({ where: { userId: existingLink.user.id } });
      const updateCount = await prisma.watchedApp.count({ where: { userId: existingLink.user.id, updateAvailable: true } });

      const lines = [
        `📊 <b>Account Status</b>\n`,
        `<b>User:</b> ${escapeHtml(existingLink.user.name || existingLink.user.email)}`,
        `<b>Email:</b> <code>${escapeHtml(existingLink.user.email)}</code>`,
        `<b>Role:</b> ${existingLink.user.role}`,
        `<b>Linked:</b> ${formatLinkedAt(existingLink.linkedAt)}`,
        ``,
        `<b>System Overview</b>\n`,
        `📦 <b>Apps:</b> ${appCount} watched`,
      ];

      if (updateCount > 0) {
        lines.push(`   ⬆️ ${updateCount} with updates available`);
      } else {
        lines.push(`   ✅ All up to date`);
      }

      lines.push("");
      lines.push("💡 /apps · /updates · /check");

      await sendTelegramBotMessage(config.botToken, chatId, lines.join("\n"), "HTML");
      return NextResponse.json({ ok: true });
    }

    if (parsed.command === "apps") {
      const apps = await prisma.watchedApp.findMany({
        where: { userId: existingLink.user.id },
        orderBy: { name: "asc" },
        take: 30,
      });

      await sendTelegramBotMessage(config.botToken, chatId, formatAppList(apps), "HTML");
      return NextResponse.json({ ok: true });
    }

    if (parsed.command === "updates") {
      const apps = await prisma.watchedApp.findMany({
        where: { userId: existingLink.user.id, updateAvailable: true },
        orderBy: { updatedAt: "desc" },
        take: 30,
      });

      if (apps.length === 0) {
        await sendTelegramBotMessage(
          config.botToken,
          chatId,
          `✅ <b>All up to date!</b>\n\nNo watched apps have updates available right now.`,
          "HTML"
        );
        return NextResponse.json({ ok: true });
      }

      await sendTelegramBotMessage(config.botToken, chatId, formatAppList(apps), "HTML");
      return NextResponse.json({ ok: true });
    }

    if (parsed.command === "check" || parsed.command === "checkall") {
      if (existingLink.user.role !== "administrator") {
        await sendTelegramBotMessage(
          config.botToken,
          chatId,
          `🔒 Only admin users can queue manual release checks.`,
          "HTML"
        );
        return NextResponse.json({ ok: true });
      }
    }

    if (parsed.command === "check") {
      const query = parsed.args.join(" ").trim().toLowerCase();
      if (!query) {
        await sendTelegramBotMessage(
          config.botToken,
          chatId,
          `🔍 <b>Check App</b>\n\nUsage: <code>/check APP_SLUG</code>\n\nUse /apps to list available apps.`,
          "HTML"
        );
        return NextResponse.json({ ok: true });
      }

      const apps = await prisma.watchedApp.findMany({
        where: {
          userId: existingLink.user.id,
          OR: [
            { slug: query },
            { name: { contains: query, mode: "insensitive" } },
            { repoFullName: { contains: query, mode: "insensitive" } },
          ],
        },
        orderBy: { name: "asc" },
        take: 5,
        select: { id: true, name: true, slug: true, repoFullName: true },
      });

      if (apps.length === 0) {
        await sendTelegramBotMessage(
          config.botToken,
          chatId,
          `❌ No watched app matched "<code>${escapeHtml(query)}</code>".\n\nUse /apps to list available apps.`,
          "HTML"
        );
        return NextResponse.json({ ok: true });
      }

      if (apps.length > 1 && apps[0].slug !== query) {
        await sendTelegramBotMessage(
          config.botToken,
          chatId,
          `❓ Multiple apps matched "<code>${escapeHtml(query)}</code>". Try one of these:\n\n` +
          apps.map((a) => `• <code>${escapeHtml(a.slug)}</code> — ${escapeHtml(a.name)}`).join("\n"),
          "HTML"
        );
        return NextResponse.json({ ok: true });
      }

      const app = apps[0];
      await getReleaseCheckQueue().add("telegram-manual-check", { watchedAppId: app.id, manual: true });
      await sendTelegramBotMessage(
        config.botToken,
        chatId,
        `🔄 Queued release check for <b>${escapeHtml(app.name)}</b> (<code>${escapeHtml(app.slug)}</code>).\n\nI'll notify you when the check completes.`,
        "HTML"
      );
      return NextResponse.json({ ok: true });
    }

    if (parsed.command === "checkall") {
      const apps = await prisma.watchedApp.findMany({
        where: { userId: existingLink.user.id },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });

      if (apps.length === 0) {
        await sendTelegramBotMessage(
          config.botToken,
          chatId,
          `📭 No watched apps configured yet.`,
          "HTML"
        );
        return NextResponse.json({ ok: true });
      }

      await Promise.all(
        apps.map((app) =>
          getReleaseCheckQueue().add("telegram-manual-check", { watchedAppId: app.id, manual: true })
        )
      );

      await sendTelegramBotMessage(
        config.botToken,
        chatId,
        `🔄 Queued release checks for <b>${apps.length}</b> watched apps:\n\n` +
        apps.map((a) => `• ${escapeHtml(a.name)}`).join("\n") +
        `\n\nI'll notify you when checks complete.`,
        "HTML"
      );
      return NextResponse.json({ ok: true });
    }

    if (parsed.command === "unlink") {
      await unlinkTelegramByTelegramUserId(telegramUserId);
      await sendTelegramBotMessage(
        config.botToken,
        chatId,
        `👋 Telegram Bot access has been removed for this account.\n\nYou can relink anytime with /link CODE.`
      );
      return NextResponse.json({ ok: true });
    }

    // Unknown command
    await sendTelegramBotMessage(
      config.botToken,
      chatId,
      `🤔 Unknown command. Use /help to see available commands.`
    );
    return NextResponse.json({ ok: true });
});
