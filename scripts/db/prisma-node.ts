/** Prisma client for CLI scripts (outside Next.js). Reads DATABASE_URL from the environment / .env. */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../lib/generated/prisma/client";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env (never commit it) or export it in your shell.");
  process.exit(1);
}
export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
