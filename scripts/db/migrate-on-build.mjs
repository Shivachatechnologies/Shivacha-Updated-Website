/**
 * Applies pending Prisma migrations during deployment builds, only when DATABASE_URL is configured.
 * Uses `prisma migrate deploy` (applies committed migrations; never resets or drops data).
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
