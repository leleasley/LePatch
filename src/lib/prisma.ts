import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: 15,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  }) as PrismaClient;

globalForPrisma.prisma = prisma;
