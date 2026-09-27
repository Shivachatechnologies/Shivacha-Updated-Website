import "server-only";
import { db } from "@/lib/db/client";
import { requestMeta } from "@/lib/auth/session";

const SECRET_KEY = /pass(word)?|token|secret|hash|cookie|authorization|api[_-]?key/i;

/** Removes anything that looks like a credential before it is written to the audit log. */
function sanitize(v: unknown, depth = 0): unknown {
  if (depth > 4 || v == null) return v;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => sanitize(x, depth + 1));
  if (typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !SECRET_KEY.test(k)).map(([k, x]) => [k, sanitize(x, depth + 1)]));
  if (typeof v === "string") return v.slice(0, 500);
  return v;
}

export async function audit(entry: { userId?: string | null; action: string; entity?: string; entityId?: string; metadata?: Record<string, unknown> }) {
  try {
    const { ip, userAgent } = await requestMeta().catch(() => ({ ip: null, userAgent: null }));
    await db.auditLog.create({
      data: { userId: entry.userId ?? null, action: entry.action, entity: entry.entity, entityId: entry.entityId, ip, userAgent, metadata: entry.metadata ? (sanitize(entry.metadata) as object) : undefined },
    });
  } catch (e) {
    console.error("[audit] failed to record", entry.action, (e as Error).message);
  }
}
