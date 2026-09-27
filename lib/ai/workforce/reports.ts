import "server-only";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { notify } from "@/lib/os/notify";
import { fmtMulti } from "@/lib/os/money";
import { AGENTS } from "@/lib/ai/catalog";
import { SYSTEM_USER } from "@/lib/ai/runner";
import { getTool } from "@/lib/ai/tools";
import { logEmployeeActivity } from "./activity";
import { employeeDirectory, goalProgress } from "./employees";
import { localParts, OPEN_TASK_STATUSES, permissionLabel, SCHEDULES, startOfLocalDay, type ScheduleTrigger } from "./profiles";

/**
 * Reports are assembled from live records only (tasks, activity, approvals, automations, business summary). They are
 * deterministic, so they are produced even when no AI provider is connected, and they never contain estimates.
 */

const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

export interface MorningPlan {
  tasks: { id: string; title: string; priority: string; status: string; deadline: string | null }[];
  recurring: { name: string; schedule: string }[];
  goals: { label: string; target: number; period: string }[];
  pendingApprovals: number;
}

export interface EndOfDay {
  completed: { id: string; title: string }[];
  actions: { tool: string; label: string; count: number }[];
  pending: { id: string; title: string; status: string }[];
  blocked: { id: string; title: string; error: string | null }[];
  requiresCeo: { id: string; action: string; risk: string }[];
}

/** Creates or refreshes the report for that day; true only when it did not exist yet (so the timeline logs it once). */
async function upsertReport(agentSlug: string, kind: string, day: string, title: string, data: unknown) {
  const where = { agentSlug_kind_day: { agentSlug, kind, day } };
  const existed = await db.aIReport.findUnique({ where, select: { id: true } });
  await db.aIReport.upsert({ where, update: { title, data: json(data), createdAt: new Date() }, create: { agentSlug, kind, day, title, data: json(data) } });
  return !existed;
}

async function recurringFor(agentSlug: string) {
  const rules = await db.automation.findMany({ where: { enabled: true, trigger: { in: Object.keys(SCHEDULES) as ScheduleTrigger[] } }, select: { name: true, trigger: true, actions: true } });
  return rules.filter((r) => Array.isArray(r.actions) && (r.actions as { type?: string; agent?: string }[]).some((a) => a.type === "AI_AGENT" && a.agent === agentSlug)).map((r) => ({ name: r.name, schedule: SCHEDULES[r.trigger as ScheduleTrigger] }));
}

/** Morning plan for each AI employee: open tasks, today's recurring responsibilities and today's goals. */
export async function generateMorningPlans(now = new Date()): Promise<number> {
  const day = localParts(now).day;
  const goals = await goalProgress(AGENTS.map((a) => a.slug), now);
  let n = 0;
  for (const spec of AGENTS) {
    const [tasks, recurring, pendingApprovals] = await Promise.all([
      db.aITask.findMany({ where: { agentSlug: spec.slug, status: { in: [...OPEN_TASK_STATUSES] } }, orderBy: [{ deadline: "asc" }, { createdAt: "asc" }], take: 20, select: { id: true, title: true, priority: true, status: true, deadline: true } }),
      recurringFor(spec.slug),
      db.aIApproval.count({ where: { agentSlug: spec.slug, status: "PENDING" } }),
    ]);
    const plan: MorningPlan = { tasks: tasks.map((t) => ({ ...t, deadline: t.deadline?.toISOString() ?? null })), recurring, goals: (goals.get(spec.slug) ?? []).map((g) => ({ label: g.label, target: g.target, period: g.period })), pendingApprovals };
    if (!plan.tasks.length && !plan.recurring.length && !plan.pendingApprovals) continue;
    if (await upsertReport(spec.slug, "MORNING_PLAN", day, `Morning plan · ${day}`, plan))
      await logEmployeeActivity({ agentSlug: spec.slug, type: "report.morning_plan", summary: `Morning plan: ${plan.tasks.length} open task${plan.tasks.length === 1 ? "" : "s"}, ${plan.recurring.length} recurring responsibilit${plan.recurring.length === 1 ? "y" : "ies"}` });
    n++;
  }
  return n;
}

/** End-of-day report for each AI employee that worked or has something waiting. `forDay` is a local yyyy-mm-dd. */
export async function generateEndOfDayReports(now = new Date(), forDay?: string): Promise<number> {
  const day = forDay ?? localParts(now).day;
  const start = startOfLocalDay(new Date(`${day}T12:00:00Z`));
  const end = new Date(start.getTime() + 86400_000);
  let n = 0;
  for (const spec of AGENTS) {
    const [completed, actions, pending, blocked, approvals] = await Promise.all([
      db.aITask.findMany({ where: { agentSlug: spec.slug, status: "DONE", completedAt: { gte: start, lt: end } }, select: { id: true, title: true }, take: 50 }),
      db.aIActivity.findMany({ where: { agentSlug: spec.slug, type: "action.executed", createdAt: { gte: start, lt: end } }, select: { data: true } }),
      db.aITask.findMany({ where: { agentSlug: spec.slug, status: { in: [...OPEN_TASK_STATUSES] } }, select: { id: true, title: true, status: true }, take: 50 }),
      db.aITask.findMany({ where: { agentSlug: spec.slug, status: "FAILED", completedAt: { gte: start, lt: end } }, select: { id: true, title: true, error: true }, take: 20 }),
      db.aIApproval.findMany({ where: { agentSlug: spec.slug, status: "PENDING" }, select: { id: true, action: true, risk: true }, take: 20 }),
    ]);
    const counts = new Map<string, number>();
    for (const a of actions) {
      const tool = (a.data as { tool?: string } | null)?.tool;
      if (tool) counts.set(tool, (counts.get(tool) ?? 0) + 1);
    }
    const r: EndOfDay = { completed, actions: [...counts].map(([tool, count]) => ({ tool, label: permissionLabel(tool), count })).sort((a, b) => b.count - a.count), pending, blocked, requiresCeo: approvals.map((x) => ({ id: x.id, action: x.action, risk: x.risk })) };
    if (!r.completed.length && !r.actions.length && !r.pending.length && !r.blocked.length && !r.requiresCeo.length) continue;
    if (await upsertReport(spec.slug, "END_OF_DAY", day, `End-of-day report · ${day}`, r))
      await logEmployeeActivity({ agentSlug: spec.slug, type: "report.end_of_day", summary: `End-of-day report: ${r.completed.length} completed, ${r.pending.length} pending, ${r.blocked.length} blocked, ${r.requiresCeo.length} need approval` });
    n++;
  }
  return n;
}

type Amounts = { currency: string; amount: { toString(): string } }[];
const money = (a: Amounts | undefined) => (a && a.length ? fmtMulti(a.map((x) => ({ currency: x.currency, amount: x.amount.toString() }))) : "—");

export interface CeoBriefing {
  workforce: { total: number; working: number; waiting: number; approval: number; offline: number; error: number };
  sales: { openPipeline: string; weightedPipeline: string; openDeals: number; newLeads7d: number; newLeadsToday: number };
  projects: { active: number; atRisk: number; atRiskList: string[] };
  finance: { outstanding: string; overdue: string; overdueInvoices: number };
  support: { open: number; urgent: number; pastDue: number };
  ai: { completedToday: number; pending: number; failedToday: number };
  attention: { title: string; href: string }[];
}

/** The daily CEO briefing: workforce, sales, projects, finance, support and AI work, plus what needs the CEO. */
export async function generateCeoBriefing(now = new Date(), opts: { notify?: boolean } = {}): Promise<CeoBriefing> {
  const day = localParts(now).day;
  const today = startOfLocalDay(now);
  const [dir, summary, newLeadsToday, doneToday, openTasks, failedToday, approvals, failedTasks] = await Promise.all([
    employeeDirectory(now),
    getTool("getBusinessSummary")!.run({ user: SYSTEM_USER, agentSlug: "ceo", executionId: null }, {}),
    db.lead.count({ where: { createdAt: { gte: today }, archivedAt: null } }),
    db.aITask.count({ where: { status: "DONE", completedAt: { gte: today } } }),
    db.aITask.count({ where: { status: { in: [...OPEN_TASK_STATUSES] } } }),
    db.aITask.count({ where: { status: "FAILED", completedAt: { gte: today } } }),
    db.aIApproval.findMany({ where: { status: "PENDING" }, orderBy: [{ risk: "desc" }, { createdAt: "asc" }], take: 3, select: { id: true, action: true, agentSlug: true } }),
    db.aITask.findMany({ where: { status: "FAILED", completedAt: { gte: new Date(now.getTime() - 86400_000) } }, take: 2, select: { id: true, title: true } }),
  ]);
  const s = summary.data as {
    leads: { last7Days: number };
    sales: { openDeals: number; openPipeline: Amounts; weightedPipeline: Amounts };
    finance: { outstanding: Amounts; overdue: Amounts; overdueInvoiceCount: number };
    projects: { active: number; redHealth: { number: string; name: string }[] };
    support: { open: number; urgent: number; pastResolutionDue: number };
  };
  const c = (st: string) => dir.filter((e) => e.status === st).length;
  const attention: CeoBriefing["attention"] = [
    ...approvals.map((a) => ({ title: `Approve or reject: ${a.action}`, href: `/admin/ai/approvals/${a.id}` })),
    ...(s.finance.overdueInvoiceCount ? [{ title: `${s.finance.overdueInvoiceCount} overdue invoice${s.finance.overdueInvoiceCount === 1 ? "" : "s"} (${money(s.finance.overdue)})`, href: "/admin/finance/invoices?status=OVERDUE" }] : []),
    ...s.projects.redHealth.slice(0, 2).map((p) => ({ title: `Project ${p.number} is at risk: ${p.name}`, href: "/admin/projects" })),
    ...failedTasks.map((t) => ({ title: `AI task failed: ${t.title}`, href: `/admin/ai/tasks/${t.id}` })),
    ...(s.support.pastResolutionDue ? [{ title: `${s.support.pastResolutionDue} support ticket${s.support.pastResolutionDue === 1 ? "" : "s"} past resolution due`, href: "/admin/support" }] : []),
  ].slice(0, 5);
  const b: CeoBriefing = {
    workforce: { total: dir.length, working: c("WORKING"), waiting: c("WAITING"), approval: c("AWAITING_APPROVAL"), offline: c("OFFLINE"), error: c("ERROR") },
    sales: { openPipeline: money(s.sales.openPipeline), weightedPipeline: money(s.sales.weightedPipeline), openDeals: s.sales.openDeals, newLeads7d: s.leads.last7Days, newLeadsToday },
    projects: { active: s.projects.active, atRisk: s.projects.redHealth.length, atRiskList: s.projects.redHealth.slice(0, 5).map((p) => `${p.number} ${p.name}`) },
    finance: { outstanding: money(s.finance.outstanding), overdue: money(s.finance.overdue), overdueInvoices: s.finance.overdueInvoiceCount },
    support: { open: s.support.open, urgent: s.support.urgent, pastDue: s.support.pastResolutionDue },
    ai: { completedToday: doneToday, pending: openTasks, failedToday },
    attention,
  };
  await upsertReport("workforce", "CEO_BRIEFING", day, `CEO briefing · ${day}`, b);
  if (opts.notify) await notify({ type: "ai.briefing", title: `Good morning — your CEO briefing for ${day} is ready`, href: "/admin/ai/command-center", permission: "executive:view" });
  return b;
}
