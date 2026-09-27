import "dotenv/config";
import { defineConfig } from "prisma/config";
import { migrationUrl } from "./scripts/db/migration-url.mjs";

/**
 * Prisma configuration. DATABASE_URL (Neon PostgreSQL) is read from the environment — never committed.
 * The CLI (migrations) uses a direct, non-pooled connection to the same database (see scripts/db/migration-url.mjs);
 * the app runtime keeps using the pooled DATABASE_URL in lib/db/client.ts.
 * Migrations: `npm run db:migrate:dev` locally, `npm run db:migrate:deploy` in CI / Vercel builds.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: migrationUrl().url ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder" },
});
