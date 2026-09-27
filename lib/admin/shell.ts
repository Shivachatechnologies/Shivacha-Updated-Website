import "server-only";
import { db } from "@/lib/db/client";
import { providerStatus } from "@/lib/ai/provider";

export interface ShellStatus {
  env: "Production" | "Preview" | "Development";
  db: { ok: boolean; ms: number | null };
  ai: { connected: boolean; enabled: boolean; running: number; pendingApprovals: number };
  activeUsers: number;
  unread: number;
}

/** Deployment environment from the host (Vercel sets VERCEL_ENV); never guessed from the URL. */
export const deploymentEnv = (): ShellStatus["env"] => {
  const v = process.env.VERCEL_ENV;
  if (v === "production") return "Production";
  if (v === "preview") return "Preview";
  return process.env.NODE_ENV === "production" ? "Production" : "Development";
};

/** Round-trip time of a trivial query in ms, or null when the database is unreachable. */
export async function dbPing() {
  const t0 = performance.now();
  return db.$queryRaw`SELECT 1`.then(() => Math.round(performance.now() - t0)).catch(() => null);
}

/** Live platform signals for the admin shell. Every probe fails soft so the shell always renders. */
export async function shellStatus(userId: string, opts: { ai: boolean }): Promise<ShellStatus> {
  const now = Date.now();
  const ping = await dbPing();
  const [unread, activeUsers, running, pendingApprovals] = await Promise.all([
    db.notification.count({ where: { userId, readAt: null } }).catch(() => 0),
    // Sessions refresh lastSeenAt at most hourly, so "active" means seen within the last two hours.
    db.session.findMany({ where: { expiresAt: { gt: new Date(now) }, lastSeenAt: { gte: new Date(now - 2 * 3600_000) } }, distinct: ["userId"], select: { userId: true } }).then((r) => r.length).catch(() => 0),
    opts.ai ? db.aIExecution.count({ where: { status: "RUNNING", startedAt: { gte: new Date(now - 30 * 60_000) } } }).catch(() => 0) : 0,
    opts.ai ? db.aIApproval.count({ where: { status: "PENDING" } }).catch(() => 0) : 0,
  ]);
  return {
    env: deploymentEnv(),
    db: { ok: ping != null, ms: ping },
    ai: { connected: providerStatus().connected, enabled: opts.ai, running, pendingApprovals },
    activeUsers,
    unread,
  };
}
