import "server-only";
import { db } from "@/lib/db/client";
import type { RoleName } from "@/lib/auth/permissions";
import { getProvider } from "./provider";
import { runAgent, SYSTEM_USER, type EntityRef } from "./runner";

const ENTITIES = ["Lead", "Deal", "Project", "Invoice", "Ticket", "Client"] as const;

/**
 * Runs queued AI tasks (from automations or people). A task runs with its requester's permissions; tasks created by
 * automations run as the system identity, which can read but must send every change to the Human Approval Center.
 */
export async function processTasks(limit = 5): Promise<number> {
  const due = await db.aITask.findMany({ where: { status: "QUEUED", runAfter: { lte: new Date() } }, orderBy: { createdAt: "asc" }, take: limit });
  let n = 0;
  for (const t of due) {
    const claimed = await db.aITask.updateMany({ where: { id: t.id, status: "QUEUED" }, data: { status: "RUNNING" } });
    if (!claimed.count) continue;
    n++;
    if (!getProvider()) {
      await db.aITask.update({ where: { id: t.id }, data: { status: "FAILED", error: "AI provider not connected (ANTHROPIC_API_KEY is not set)." } });
      continue;
    }
    try {
      const requester = t.requestedById ? await db.user.findFirst({ where: { id: t.requestedById, active: true }, select: { id: true, email: true, name: true, role: true } }) : null;
      const user = requester ? { ...requester, role: requester.role as RoleName } : SYSTEM_USER;
      const context: EntityRef | null = t.entity && t.entityId && (ENTITIES as readonly string[]).includes(t.entity) ? { entity: t.entity as EntityRef["entity"], id: t.entityId } : null;
      const r = await runAgent({ agentSlug: t.agentSlug, request: t.request || t.title, user, trigger: "TASK", context });
      await db.aITask.update({ where: { id: t.id }, data: { status: r.status === "FAILED" || r.status === "BLOCKED" ? "FAILED" : "DONE", executionId: r.executionId, error: r.error?.slice(0, 500) ?? null } });
    } catch (e) {
      await db.aITask.update({ where: { id: t.id }, data: { status: "FAILED", error: (e as Error).message.slice(0, 500) } });
    }
  }
  return n;
}
