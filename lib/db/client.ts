import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Prisma client for Neon PostgreSQL. Server-only: DATABASE_URL never reaches the browser.
 * One instance per server process (reused across hot reloads in development).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const hasDatabase = () => !!process.env.DATABASE_URL;

/** Other names hosting integrations use for a Postgres URL. Reported by NAME only — never read into a connection. */
const OTHER_DB_VARS = ["POSTGRES_PRISMA_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "DATABASE_URL_UNPOOLED", "NEON_DATABASE_URL"] as const;

/**
 * Safe runtime diagnostics for "database not configured": booleans, the deployment environment name and the commit.
 * Never includes a value, password or connection string.
 */
export function databaseEnvDiagnostics() {
  return {
    databaseUrlPresent: hasDatabase(),
    databaseUrlDefinedButEmpty: "DATABASE_URL" in process.env && !process.env.DATABASE_URL,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    otherDatabaseVarsPresent: OTHER_DB_VARS.filter((k) => !!process.env[k]),
  };
}

function create() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
  return new PrismaClient({ adapter, log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
}

export const db: PrismaClient = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
