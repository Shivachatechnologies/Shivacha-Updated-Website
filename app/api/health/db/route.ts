import { databaseEnvDiagnostics, db, hasDatabase } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Temporary deployment diagnostic: does this server process see DATABASE_URL, and can it reach the database?
 * Returns booleans, the Vercel environment name and commit only — never a value, password or connection string.
 */
export async function GET() {
  const env = databaseEnvDiagnostics();
  let reachable: boolean | null = null;
  if (hasDatabase()) reachable = await db.$queryRaw`SELECT 1`.then(() => true, () => false);
  return Response.json({ ...env, databaseReachable: reachable }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
