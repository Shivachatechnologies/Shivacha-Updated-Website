import "server-only";
import { db } from "@/lib/db/client";
import { getProvider } from "@/lib/ai/provider";
import { notify } from "@/lib/os/notify";

export const OBJECTIVE_STATUSES = ["PLANNING", "ACTIVE", "BLOCKED", "COMPLETED", "CANCELLED"] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

const SETTLED = new Set(["DONE", "FAILED", "CANCELLED"]);

export interface ObjectiveProgress {
  total: number;
  byStatus: Record<string, number>;
  done: number;
  failed: number;
  open: number;
  pct: number;
}

export function progressFrom(tasks: { status: string }[]): ObjectiveProgress {
  const byStatus: Record<string, number> = {};
  for (const t of tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  const done = byStatus.DONE ?? 0;
  const failed = (byStatus.FAILED ?? 0) + (byStatus.CANCELLED ?? 0);
  const total = tasks.length;
  return { total, byStatus, done, failed, open: total - done - failed, pct: total ? Math.round(((done + failed) / total) * 100) : 0 };
}

/**
 * Derives an objective's status from its real tasks (never set by hand except cancel):
 * root task DONE → COMPLETED; root FAILED → BLOCKED; no AI provider while work is queued → BLOCKED; otherwise ACTIVE.
 */
export async function refreshObjective(id: string): Promise<ObjectiveStatus | null> {
  const o = await db.aIObjective.findUnique({ where: { id } });
  if (!o) return null;
  if (o.status === "CANCELLED" || o.status === "COMPLETED") return o.status as ObjectiveStatus;
  const tasks = await db.aITask.findMany({ where: { objectiveId: id }, select: { id: true, status: true, result: true, error: true } });
  const root = o.rootTaskId ? tasks.find((t) => t.id === o.rootTaskId) : null;
  let status: ObjectiveStatus = "ACTIVE";
  let blockedReason: string | null = null;
  let result: string | null = o.result;
  if (root?.status === "DONE") {
    status = "COMPLETED";
    result = root.result?.slice(0, 50_000) ?? result;
  } else if (root && (root.status === "FAILED" || root.status === "CANCELLED")) {
    status = "BLOCKED";
    blockedReason = `The Chief of Staff task ${root.status === "FAILED" ? `failed: ${root.error ?? "unknown error"}` : "was cancelled"}.`;
  } else if (!getProvider() && tasks.some((t) => t.status === "QUEUED")) {
    status = "BLOCKED";
    blockedReason = `AI provider NOT CONNECTED (ANTHROPIC_API_KEY). ${tasks.filter((t) => t.status === "QUEUED").length} task(s) are queued and start automatically once it is connected.`;
  } else if (tasks.length && tasks.every((t) => SETTLED.has(t.status)) && !root) {
    status = tasks.some((t) => t.status === "DONE") ? "COMPLETED" : "BLOCKED";
    if (status === "BLOCKED") blockedReason = "Every task failed or was cancelled.";
  }
  if (status !== o.status || blockedReason !== o.blockedReason || result !== o.result) {
    await db.aIObjective.update({ where: { id }, data: { status, blockedReason, result, completedAt: status === "COMPLETED" ? (o.completedAt ?? new Date()) : null } });
    if (status === "COMPLETED" && o.createdById) await notify({ type: "ai.objective", title: `Objective completed: ${o.title}`.slice(0, 200), href: `/admin/company/objectives/${id}`, userIds: [o.createdById] });
    if (status === "BLOCKED" && o.status !== "BLOCKED" && o.createdById) await notify({ type: "ai.objective", title: `Objective blocked: ${o.title}`.slice(0, 200), body: blockedReason?.slice(0, 300), href: `/admin/company/objectives/${id}`, userIds: [o.createdById] });
  }
  return status;
}
