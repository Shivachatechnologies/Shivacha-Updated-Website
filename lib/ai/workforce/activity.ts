import "server-only";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * The AI employee activity timeline. Every entry is written at the moment the underlying system event happens
 * (task assigned/started/finished, a tool returned, an approval was requested or decided, a report was produced),
 * so the timeline is a record of what actually happened, never a narrative.
 */
export async function logEmployeeActivity(e: { agentSlug: string; type: string; summary: string; taskId?: string | null; data?: Record<string, unknown>; actorId?: string | null }) {
  const now = new Date();
  await db.$transaction([
    db.aIActivity.create({ data: { agentSlug: e.agentSlug, type: e.type, summary: e.summary.slice(0, 500), taskId: e.taskId ?? null, actorId: e.actorId ?? null, data: e.data ? (JSON.parse(JSON.stringify(e.data)) as Prisma.InputJsonValue) : undefined, createdAt: now } }),
    db.aIAgent.updateMany({ where: { slug: e.agentSlug }, data: { lastActivityAt: now } }),
  ]).catch((err) => console.error("[workforce] activity not recorded", (err as Error).message));
}

/** Short human wording for a tool call outcome in the timeline. */
export function toolSummary(tool: string, ok: boolean, detail: { error?: string; action?: { status: string; summary: string }; records?: string[] }) {
  if (!ok) return `${tool} failed${detail.error ? `: ${detail.error}` : ""}`;
  if (detail.action?.status === "EXECUTED") return detail.action.summary;
  if (detail.action?.status === "PENDING_APPROVAL") return `Requested approval: ${detail.action.summary}`;
  if (detail.action?.status === "BLOCKED") return `Recommended (observe mode): ${detail.action.summary}`;
  const n = detail.records?.length ?? 0;
  return n ? `Used ${tool} (${n} record${n === 1 ? "" : "s"})` : `Used ${tool}`;
}
