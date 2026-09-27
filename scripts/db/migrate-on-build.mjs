/**
 * Applies pending Prisma migrations during deployment builds, only when DATABASE_URL is configured.
 * Uses `prisma migrate deploy` (applies committed migrations; never resets or drops data).
 *
 * Vercel preview deployments do NOT migrate by default: a preview often shares the production DATABASE_URL, and a
 * branch that has not been reviewed must never change the production schema. Set MIGRATE_ON_PREVIEW=1 on a preview
 * environment that has its own database (e.g. a Neon branch) to opt in.
 */
import { execSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.log("[db] DATABASE_URL not set — skipping migrations (public site builds without a database).");
  process.exit(0);
}
if (process.env.SKIP_DB_MIGRATE === "1") {
  console.log("[db] SKIP_DB_MIGRATE=1 — skipping migrations.");
  process.exit(0);
}
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production" && process.env.MIGRATE_ON_PREVIEW !== "1") {
  console.log(`[db] VERCEL_ENV=${process.env.VERCEL_ENV} — skipping migrations (only production deployments migrate; set MIGRATE_ON_PREVIEW=1 for a preview with its own database).`);
  process.exit(0);
}
try {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} catch {
  console.error(
    "\n[db] prisma migrate deploy failed — the build is stopped so the site never runs against a mismatched schema.\n" +
      "     Nothing was reset or dropped. If the error is P3005 (database not empty), see README → Admin panel → Existing databases.\n" +
      "     Run `npm run db:verify` with the same DATABASE_URL to inspect the database.",
  );
  process.exit(1);
}
