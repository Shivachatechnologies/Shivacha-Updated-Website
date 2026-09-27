import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Prisma client for Neon PostgreSQL. Server-only: DATABASE_URL never reaches the browser.
 * One instance per server process (reused across hot reloads in development).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const hasDatabase = () => !!process.env.DATABASE_URL;

function create() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
  return new PrismaClient({ adapter, log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
}

export const db: PrismaClient = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
