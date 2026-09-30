import "server-only";
import { db } from "@/lib/db/client";
import { AGENTS, agentBySlug, type AgentSpec } from "@/lib/ai/catalog";
import { ensureAgents } from "@/lib/ai/agents";
import { OPEN_TASK_STATUSES, periodStart, profileFor, startOfLocalDay, type EmployeeStatus } from "./profiles";

/** Creates agent rows, then fills any blank employee profile fields and starter goals. Never overwrites edits. */
export async function ensureEmployees() {
  await ensureAgents();
  const rows = await db.aIAgent.findMany({ select: { slug: true, jobTitle: true, department: true, reportsToSlug: true, responsibilities: true } });
  const goalCounts = new Map((await db.aIGoal.groupBy({ by: ["agentSlug"], _count: { _all: true } })).map((g) => [g.agentSlug, g._count._all]));
  for (const r of rows) {
    const p = profileFor(r.slug);
    if (!r.jobTitle || !r.department || (!r.reportsToSlug && p.reportsTo) || !r.responsibilities.length)
      await db.aIAgent.update({ where: { slug: r.slug }, data: { jobTitle: r.jobTitle ?? p.jobTitle, department: r.department ?? p.department, reportsToSlug: r.reportsToSlug ?? p.reportsTo, responsibilities: r.responsibilities.length ? undefined : p.responsibilities } });
    if (!goalCounts.get(r.slug) && p.goals.length) await db.aIGoal.createMany({ data: p.goals.map((g) => ({ agentSlug: r.slug, ...g })) });
  }
}

export const displayName = (row: { personaName?: string | null; name: string }) => row.personaName?.trim() || row.name.replace(/^AI\s+/, "");

export interface GoalProgress {
  id: string;
  label: string;
  metric: string;
  period: string;
  target: number;
  actual: number;
  pct: number;
}

/** Measured goal progress for the current period. Every number comes from AITask / AIActivity rows. */
export async function goalProgress(slugs: string[], now = new Date()): Promise<Map<string, GoalProgress[]>> {
  const goals = await db.aIGoal.findMany({ where: { agentSlug: { in: slugs }, active: true }, orderBy: { createdAt: "asc" } });
  const out = new Map<string, GoalProgress[]>(slugs.map((s) => [s, []]));
  if (!goals.length) return out;
  const earliest = new Date(Math.min(...goals.map((g) => periodStart(g.period, now).getTime())));
  const [doneTasks, actions] = await Promise.all([
    db.aITask.findMany({ where: { agentSlug: { in: slugs }, status: "DONE", completedAt: { gte: earliest } }, select: { agentSlug: true, completedAt: true } }),
    db.aIActivity.findMany({ where: { agentSlug: { in: slugs }, type: "action.executed", createdAt: { gte: earliest } }, select: { agentSlug: true, createdAt: true, data: true } }),
  ]);
  for (const g of goals) {
    const since = periodStart(g.period, now);
    const actual = g.metric === "tasks_completed"
      ? doneTasks.filter((t) => t.agentSlug === g.agentSlug && t.completedAt! >= since).length
      : g.metric.startsWith("actions:")
        ? actions.filter((a) => a.agentSlug === g.agentSlug && a.createdAt >= since && (a.data as { tool?: string } | null)?.tool === g.metric.slice(8)).length
        : 0;
    out.get(g.agentSlug)?.push({ id: g.id, label: g.label, metric: g.metric, period: g.period, target: g.target, actual, pct: g.target ? Math.min(100, Math.round((actual / g.target) * 100)) : 0 });
  }
  return out;
}

export interface EmployeeCard {
  slug: string;
  name: string;
  roleName: string;
  jobTitle: string;
  department: string;
  status: EmployeeStatus;
  mode: string;
  manager: string | null;
  currentTask: { id: string; title: string; progress: number; currentStep: string | null } | null;
  tasksToday: number;
  completedToday: number;
  completedTotal: number;
  pending: number;
  pendingApprovals: number;
  kpi: GoalProgress | null;
  goals: GoalProgress[];
  lastActivity: Date | null;
  workingStatus: string;
}

/** Live directory: status, workload and KPIs for AI employees (the 12 core employees unless a list is given). */
export async function employeeDirectory(now = new Date(), specs: AgentSpec[] = AGENTS): Promise<EmployeeCard[]> {
  await ensureEmployees();
  const today = startOfLocalDay(now);
  const slugs = specs.map((a) => a.slug);
  const [rows, open, running, todayTasks, doneToday, doneAll, approvals, lastFinished, goals] = await Promise.all([
    db.aIAgent.findMany({ include: { managerUser: { select: { name: true } } } }),
    db.aITask.groupBy({ by: ["agentSlug", "status"], where: { status: { in: [...OPEN_TASK_STATUSES] } }, _count: { _all: true } }),
    db.aITask.findMany({ where: { status: "RUNNING" }, orderBy: { startedAt: "desc" }, select: { id: true, agentSlug: true, title: true, progress: true, currentStep: true } }),
    db.aITask.groupBy({ by: ["agentSlug"], where: { OR: [{ createdAt: { gte: today } }, { startedAt: { gte: today } }, { completedAt: { gte: today } }] }, _count: { _all: true } }),
    db.aITask.groupBy({ by: ["agentSlug"], where: { status: "DONE", completedAt: { gte: today } }, _count: { _all: true } }),
    db.aITask.groupBy({ by: ["agentSlug"], where: { status: "DONE" }, _count: { _all: true } }),
    db.aIApproval.groupBy({ by: ["agentSlug"], where: { status: "PENDING" }, _count: { _all: true } }),
    db.aITask.findMany({ where: { status: { in: ["DONE", "FAILED"] }, completedAt: { gte: new Date(now.getTime() - 86400_000) } }, orderBy: { completedAt: "desc" }, distinct: ["agentSlug"], select: { agentSlug: true, status: true, error: true } }),
    goalProgress(slugs, now),
  ]);
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const nextQueued = await db.aITask.findMany({ where: { status: { in: ["QUEUED", "PAUSED", "AWAITING_APPROVAL"] } }, orderBy: [{ runAfter: "asc" }], distinct: ["agentSlug"], select: { id: true, agentSlug: true, title: true, progress: true, currentStep: true, status: true } });
  const count = (list: { agentSlug: string; _count: { _all: number } }[], slug: string) => list.filter((r) => r.agentSlug === slug).reduce((n, r) => n + r._count._all, 0);

  return specs.map((spec) => {
    const row = bySlug.get(spec.slug);
    const p = profileFor(spec.slug);
    const cur = running.find((t) => t.agentSlug === spec.slug) ?? null;
    const next = nextQueued.find((t) => t.agentSlug === spec.slug) ?? null;
    const pending = count(open, spec.slug);
    const pendingApprovals = count(approvals, spec.slug);
    const last = lastFinished.find((t) => t.agentSlug === spec.slug);
    const reportsTo = row?.reportsToSlug ?? p.reportsTo;
    const managerEmployee = reportsTo ? bySlug.get(reportsTo) ?? (agentBySlug(reportsTo) ? { name: agentBySlug(reportsTo)!.name, personaName: null } : null) : null;
    const manager = [row?.managerUser?.name, managerEmployee ? displayName(managerEmployee) : null].filter(Boolean).join(" / ") || null;
    const status: EmployeeStatus = !row || !row.enabled || !row.available ? "OFFLINE" : cur ? "WORKING" : pendingApprovals ? "AWAITING_APPROVAL" : last?.status === "FAILED" ? "ERROR" : pending ? "WAITING" : "ONLINE";
    const g = goals.get(spec.slug) ?? [];
    const workingStatus =
      status === "OFFLINE" ? (!row?.enabled ? "Disabled by an administrator" : "Clocked out — not taking new work")
      : status === "WORKING" ? `${cur!.currentStep ?? "Working"} · ${cur!.progress}%`
      : status === "AWAITING_APPROVAL" ? `${pendingApprovals} action${pendingApprovals === 1 ? "" : "s"} waiting for your approval`
      : status === "ERROR" ? `Last task failed${last?.error ? `: ${last.error.slice(0, 90)}` : ""}`
      : status === "WAITING" ? `${pending} task${pending === 1 ? "" : "s"} in the queue`
      : "Available for work";
    return {
      slug: spec.slug,
      name: row ? displayName(row) : spec.name.replace(/^AI\s+/, ""),
      roleName: spec.name,
      jobTitle: row?.jobTitle ?? p.jobTitle,
      department: row?.department ?? p.department,
      status,
      mode: row?.mode ?? "ASSIST",
      manager,
      currentTask: cur ? { id: cur.id, title: cur.title, progress: cur.progress, currentStep: cur.currentStep } : next ? { id: next.id, title: next.title, progress: next.progress, currentStep: next.status === "AWAITING_APPROVAL" ? "Waiting for approval" : next.status === "PAUSED" ? "Paused" : "Queued" } : null,
      tasksToday: count(todayTasks, spec.slug),
      completedToday: count(doneToday, spec.slug),
      completedTotal: count(doneAll, spec.slug),
      pending,
      pendingApprovals,
      kpi: g[0] ?? null,
      goals: g,
      lastActivity: row?.lastActivityAt ?? null,
      workingStatus,
    };
  });
}
