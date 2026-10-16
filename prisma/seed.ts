import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encryptJson, decryptJson } from "../src/lib/encryption";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/**
 * Channel configs used to be written as plaintext JSON, which meant the Discord
 * webhook URL and Telegram bot token sat in the database unencrypted. This
 * upgrades any legacy plaintext row in place and always writes encrypted values.
 */
async function upsertChannel(type: "discord" | "telegram", name: string, enabled: boolean, config: Record<string, string>) {
  const row = await prisma.notificationChannel.findUnique({
    where: { type_name: { type, name } },
    select: { id: true, configJson: true },
  });

  if (row) {
    if (typeof row.configJson === "string") {
      // Already encrypted.
      await prisma.notificationChannel.update({ where: { id: row.id }, data: { enabled } });
      return;
    }
    await prisma.notificationChannel.update({
      where: { id: row.id },
      data: { enabled, configJson: encryptJson(config) },
    });
    return;
  }

  await prisma.notificationChannel.create({
    data: { type, name, enabled, configJson: encryptJson(config) },
  });
}

async function main() {
  const email = process.env.DEFAULT_ADMIN_EMAIL;
  const password = process.env.DEFAULT_ADMIN_PASSWORD;

  const userCount = await prisma.user.count();
  if (userCount === 0) {
    if (!email || !password) {
      console.log("DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD must be set to seed the first admin user");
    } else {
      await prisma.user.create({
        data: {
          name: "Admin",
          email: email.toLowerCase(),
          passwordHash: await bcrypt.hash(password, 12),
          role: "administrator",
        },
      });
      console.log("Created the initial administrator account");
    }
  }

  // Never overwrite user rows — only ensure channel config is encrypted and
  // initialised from the environment on first run.
  const discordUrl = process.env.DISCORD_WEBHOOK_URL || "";
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN || "";
  const telegramChatId = process.env.TELEGRAM_CHAT_ID || "";

  await upsertChannel("discord", "Discord", Boolean(discordUrl), { webhookUrl: discordUrl });
  await upsertChannel(
    "telegram",
    "Telegram",
    Boolean(telegramToken && telegramChatId),
    { botToken: telegramToken, chatId: telegramChatId }
  );

  // Sanity check that the encryption key round-trips before we mark rows done.
  if (!process.env.ENCRYPTION_KEY) {
    console.warn("ENCRYPTION_KEY is not set — notification secrets cannot be encrypted at rest");
  } else {
    decryptJson(encryptJson({ probe: true }));
  }
}

main()
  .catch(() => {
    console.error("Seed failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });