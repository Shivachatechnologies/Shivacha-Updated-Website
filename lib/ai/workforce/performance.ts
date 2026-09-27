import "server-only";
import { db } from "@/lib/db/client";
import { AGENTS } from "@/lib/ai/catalog";
import { goalProgress, type GoalProgress } from "./employees";
import { permissionLabel } from "./profiles";

export interface EmployeePerformance {
  slug: string;
  completed: number;
  failed: number;
  cancelled: number;
  successRate: number | null;
  avgCompletionMs: number | null;
  approvalsRequested: number;
  approvalsApproved: number;
  approvalsRejected: number;
  escalations: number;
  costUsd: number;
  outcomes: { tool: string; label: string; count: number }[];
  goals: GoalProgress[];
}

/**
 * Performance over a window, computed only from recorded work: AITask outcomes and timings, AIApproval decisions,
 * AIUsage cost and executed actions from the activity log. Nothing is estimated or back-filled.
 */
export async function employeePerformance(days = 30, slugs = AGENTS.map((a) => a.slug), now = new Date()): Promise<EmployeePerformance[]> {
  const since = new Date(now.getTime() - days * 86400_000);
  const [tasks, approvals, usage, actions, goals] = await Promise.all([
    db.aITask.findMany({ where: { agentSlug: { in: slugs }, completedAt: { gte: since }, status: { in: ["DONE", "FAILED", "CANCELLED"] } }, select: { agentSlug: true, status: true, startedAt: true, completedAt: true } }),
    db.aIApproval.groupBy({ by: ["agentSlug", "status"], where: { agentSlug: { in: slugs }, createdAt: { gte: since } }, _count: { _all: true } }),
    db.aIUsage.groupBy({ by: ["agentSlug"], where: { agentSlug: { in: slugs }, createdAt: { gte: since } }, _sum: { costUsd: true } }),
    db.aIActivity.findMany({ where: { agentSlug: { in: slugs }, type: "action.executed", createdAt: { gte: since } }, select: { agentSlug: true, data: true } }),
    goalProgress(slugs, now),
  ]);
  // Escalations: tasks that needed a person — sent to approval or failed and handed back.
  const escalated = await db.aIActivity.groupBy({ by: ["agentSlug"], where: { agentSlug: { in: slugs }, type: { in: ["task.awaiting_approval", "task.failed"] }, createdAt: { gte: since } }, _count: { _all: true } });

  return slugs.map((slug) => {
    const mine = tasks.filter((t) => t.agentSlug === slug);
    const completed = mine.filter((t) => t.status === "DONE");
    const failed = mine.filter((t) => t.status === "FAILED").length;
    const timed = completed.filter((t) => t.startedAt && t.completedAt);
    const ap = (s: string[]) => approvals.filter((a) => a.agentSlug === slug && s.includes(a.status)).reduce((n, a) => n + a._count._all, 0);
    const counts = new Map<string, number>();
    for (const a of actions.filter((x) => x.agentSlug === slug)) {
      const tool = (a.data as { tool?: string } | null)?.tool;
      if (tool) counts.set(tool, (counts.get(tool) ?? 0) + 1);
    }
    return {
      slug,
      completed: completed.length,
      failed,
      cancelled: mine.filter((t) => t.status === "CANCELLED").length,
      successRate: completed.length + failed ? Math.round((completed.length / (completed.length + failed)) * 1000) / 10 : null,
      avgCompletionMs: timed.length ? Math.round(timed.reduce((n, t) => n + (t.completedAt!.getTime() - t.startedAt!.getTime()), 0) / timed.length) : null,
      approvalsRequested: ap(["PENDING", "APPROVED", "REJECTED", "EXECUTED", "FAILED", "EXPIRED"]),
      approvalsApproved: ap(["APPROVED", "EXECUTED"]),
      approvalsRejected: ap(["REJECTED"]),
      escalations: escalated.find((e) => e.agentSlug === slug)?._count._all ?? 0,
      costUsd: Number(usage.find((u) => u.agentSlug === slug)?._sum.costUsd ?? 0),
      outcomes: [...counts].map(([tool, count]) => ({ tool, label: permissionLabel(tool), count })).sort((a, b) => b.count - a.count),
      goals: goals.get(slug) ?? [],
    };
  });
}
