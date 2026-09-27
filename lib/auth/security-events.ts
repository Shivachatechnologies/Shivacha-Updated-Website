import "server-only";
import { db } from "@/lib/db/client";
import { requestMeta } from "./session";

/** Records a security event (never throws). */
export async function securityEvent(type: string, e: { userId?: string | null; severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; detail?: Record<string, unknown> } = {}) {
  try {
    const { ip, userAgent } = await requestMeta().catch(() => ({ ip: null, userAgent: null }));
    await db.securityEvent.create({ data: { type, severity: e.severity ?? "LOW", userId: e.userId ?? null, ip, userAgent, detail: e.detail as object | undefined } });
  } catch (err) {
    console.error("[security] event not recorded", type, (err as Error).message);
  }
}
