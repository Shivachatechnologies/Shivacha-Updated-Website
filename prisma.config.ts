import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma configuration. DATABASE_URL (Neon PostgreSQL) is read from the environment — never committed.
 * Migrations: `npm run db:migrate:dev` locally, `npm run db:migrate:deploy` in CI / Vercel builds.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder" },
});
