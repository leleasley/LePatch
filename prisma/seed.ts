import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { catalogueApps } from "../data/catalogue";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Seed catalogue entries first (no env vars needed — safe upsert)
  const catalogueCount = await prisma.catalogueEntry.count();
  if (catalogueCount === 0) {
    for (const app of catalogueApps) {
      await prisma.catalogueEntry.upsert({
        where: { repoFullName: app.repoFullName },
        update: {},
        create: {
          name: app.name,
          repoFullName: app.repoFullName,
          description: app.description,
          category: app.category,
          packageNames: app.packageNames,
        },
      });
    }
    console.log(`Seeded ${catalogueApps.length} catalogue entries`);
  }

  const email = process.env.DEFAULT_ADMIN_EMAIL;
  const password = process.env.DEFAULT_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD must be set to seed the first admin user");
    return;
  }

  const userCount = await prisma.user.count();
  if (userCount > 0) {
    return; // Users already exist — never overwrite them
  }

  await prisma.user.create({
    data: {
      name: "Admin",
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: "administrator"
    }
  });

  await prisma.notificationChannel.upsert({
    where: { type_name: { type: "discord", name: "Discord" } },
    update: {
      enabled: Boolean(process.env.DISCORD_WEBHOOK_URL),
      configJson: { webhookUrl: process.env.DISCORD_WEBHOOK_URL || "" }
    },
    create: {
      type: "discord",
      name: "Discord",
      enabled: Boolean(process.env.DISCORD_WEBHOOK_URL),
      configJson: { webhookUrl: process.env.DISCORD_WEBHOOK_URL || "" }
    }
  });

  await prisma.notificationChannel.upsert({
    where: { type_name: { type: "telegram", name: "Telegram" } },
    update: {
      enabled: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      configJson: {
        botToken: process.env.TELEGRAM_BOT_TOKEN || "",
        chatId: process.env.TELEGRAM_CHAT_ID || ""
      }
    },
    create: {
      type: "telegram",
      name: "Telegram",
      enabled: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      configJson: {
        botToken: process.env.TELEGRAM_BOT_TOKEN || "",
        chatId: process.env.TELEGRAM_CHAT_ID || ""
      }
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async () => {
    console.error("Seed failed");
    await prisma.$disconnect();
    process.exit(1);
  });
