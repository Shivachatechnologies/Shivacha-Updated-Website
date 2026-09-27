/**
 * Connection string for the Prisma CLI (migrations). Migrations need a DIRECT (session) connection:
 * `prisma migrate deploy` takes a session-level Postgres advisory lock (pg_advisory_lock), which does not work
 * through a transaction-mode pooler such as Neon's PgBouncer endpoint — the lock and its unlock can land on
 * different server connections, leaving the lock held and every later migration failing with P1002.
 *
 * Order: an explicit direct URL from the environment, else the same Neon database via its direct host (the
 * pooled host minus "-pooler"), else DATABASE_URL unchanged. The runtime app keeps using DATABASE_URL (pooled).
 * Never logs the URL.
 */
export const DIRECT_URL_VARS = ["DIRECT_DATABASE_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "DIRECT_URL"];

export function migrationUrl(env = process.env) {
  for (const k of DIRECT_URL_VARS) if (env[k]) return { url: env[k], source: k };
  const pooled = env.DATABASE_URL;
  if (!pooled) return { url: undefined, source: "none" };
  try {
    const u = new URL(pooled);
    // Neon pooled endpoints look like ep-xxx-pooler.<region>.aws.neon.tech; the direct endpoint drops "-pooler".
    if (/\.neon\.tech$/i.test(u.hostname) && /-pooler\./i.test(u.hostname)) {
      u.hostname = u.hostname.replace(/-pooler\./i, ".");
      return { url: u.toString(), source: "DATABASE_URL (Neon direct host)" };
    }
  } catch {
    // Not a parseable URL: fall through and let Prisma report it.
  }
  return { url: pooled, source: "DATABASE_URL" };
}
