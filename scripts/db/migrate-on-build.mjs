/**
 * Applies pending Prisma migrations during deployment builds, only when DATABASE_URL is configured.
 * Uses `prisma migrate deploy` (applies committed migrations; never resets or drops data).
 *
 * Vercel preview deployments do NOT migrate by default: a preview often shares the production DATABASE_URL, and a
 * branch that has not been reviewed must never change the production schema. Set MIGRATE_ON_PREVIEW=1 on a preview
 * environment that has its own database (e.g. a Neon branch) to opt in.
 *
 * Migrations run over a direct (non-pooled) connection — see migration-url.mjs. Prisma's advisory lock serialises
 * concurrent deployments; if another deployment holds it (P1002), this waits and retries a bounded number of times
 * instead of failing immediately. It never disables the lock and never changes the schema outside the migrations.
 */
import { spawnSync } from "node:child_process";
import { migrationUrl } from "./migration-url.mjs";

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

const { source } = migrationUrl();
console.log(`[db] Migration connection: ${source}${source === "DATABASE_URL" ? " (if this is a pooled URL, set DATABASE_URL_UNPOOLED to the direct connection string)" : ""}`);

const ATTEMPTS = Number(process.env.MIGRATE_LOCK_RETRIES ?? 5);
const WAIT_MS = [15_000, 30_000, 45_000, 60_000, 60_000];

for (let attempt = 1; ; attempt++) {
  const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { encoding: "utf8", env: process.env });
  process.stdout.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
  if (r.status === 0) process.exit(0);
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const lockBusy = /P1002|advisory lock/i.test(out);
  if (lockBusy && attempt < ATTEMPTS) {
    const wait = WAIT_MS[Math.min(attempt - 1, WAIT_MS.length - 1)];
    console.log(`[db] Migration lock is held by another session (attempt ${attempt}/${ATTEMPTS}). Waiting ${wait / 1000}s — another deployment may be migrating.`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
    continue;
  }
  console.error(
    "\n[db] prisma migrate deploy failed — the build is stopped so the site never runs against a mismatched schema.\n" +
      "     Nothing was reset or dropped.\n" +
      (lockBusy
        ? "     The Prisma migration lock (pg_advisory_lock 72707369) is still held by another database session.\n" +
          "     Find it with the read-only query in README → Admin panel → Migration lock (P1002).\n"
        : "     If the error is P3005 (database not empty), see README → Admin panel → Existing databases.\n") +
      "     Run `npm run db:verify` with the same DATABASE_URL to inspect the database.",
  );
  process.exit(1);
}
