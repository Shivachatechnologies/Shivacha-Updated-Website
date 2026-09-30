import "server-only";
import { db } from "@/lib/db/client";

/**
 * Client delivery intelligence from existing projects, tasks, milestones, issues, tickets and invoices.
 * Health is computed from named signals; nothing is invented and no record is changed here.
 */

const DAY = 86400_000;
const days = (from: Date, to = new Date()) => Math.floor((to.getTime() - from.getTime()) / DAY);

export interface ProjectHealthRow {
  id: string;
  number: string;
  name: string;
  client: string;
  recorded: string;
  computed: "GREEN" | "AMBER" | "RED";
  progress: number;
  overdueTasks: number;
  blockedTasks: number;
  missedMilestones: number;
  openIssues: number;
  daysToTarget: number | null;
  signals: string[];
  href: string;
}

export async function projectHealth(): Promise<ProjectHealthRow[]> {
  const now = new Date();
  const projects = await db.project.findMany({ where: { deletedAt: null, status: { in: ["ACTIVE", "PLANNED", "ON_HOLD"] } }, select: { id: true, number: true, name: true, health: true, progress: true, targetDate: true, client: { select: { name: true } } }, take: 200 });
  if (!projects.length) return [];
  const ids = projects.map((p) => p.id);
  const [overdue, blocked, missed, issues] = await Promise.all([
    db.task.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, status: { not: "DONE" }, dueDate: { lt: now } }, _count: { _all: true } }),
    db.task.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, status: "BLOCKED" }, _count: { _all: true } }),
    db.milestone.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, OR: [{ status: "MISSED" }, { status: { in: ["PENDING", "IN_PROGRESS"] }, dueDate: { lt: now } }] }, _count: { _all: true } }),
    db.projectIssue.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, status: { in: ["OPEN", "IN_PROGRESS"] } }, _count: { _all: true } }),
  ]);
  const c = (list: { projectId: string | null; _count: { _all: number } }[], id: string) => list.find((x) => x.projectId === id)?._count._all ?? 0;
  return projects
    .map((p) => {
      const o = c(overdue, p.id), b = c(blocked, p.id), m = c(missed, p.id), i = c(issues, p.id);
      const dt = p.targetDate ? Math.ceil((p.targetDate.getTime() - now.getTime()) / DAY) : null;
      const signals: string[] = [];
      if (o) signals.push(`${o} overdue task(s)`);
      if (b) signals.push(`${b} blocked task(s)`);
      if (m) signals.push(`${m} missed/overdue milestone(s)`);
      if (i) signals.push(`${i} open issue(s)`);
      if (dt != null && dt < 0) signals.push(`target date passed ${-dt}d ago`);
      else if (dt != null && dt <= 14 && p.progress < 80) signals.push(`${dt}d to target at ${p.progress}%`);
      const red = m > 0 || (dt != null && dt < 0) || b >= 3 || o >= 5;
      const amber = !red && (o > 0 || b > 0 || i >= 3 || (dt != null && dt <= 14 && p.progress < 80));
      return { id: p.id, number: p.number, name: p.name, client: p.client.name, recorded: p.health, computed: (red ? "RED" : amber ? "AMBER" : "GREEN") as ProjectHealthRow["computed"], progress: p.progress, overdueTasks: o, blockedTasks: b, missedMilestones: m, openIssues: i, daysToTarget: dt, signals, href: `/admin/projects/${p.id}` };
    })
    .sort((a, b) => ["RED", "AMBER", "GREEN"].indexOf(a.computed) - ["RED", "AMBER", "GREEN"].indexOf(b.computed));
}

export interface ClientHealthRow {
  id: string;
  number: string;
  name: string;
  score: number;
  label: "HEALTHY" | "WATCH" | "AT_RISK";
  openTickets: number;
  breachedTickets: number;
  overdueInvoices: number;
  overdueAmount: Record<string, number>;
  redProjects: number;
  signals: string[];
  href: string;
}

export async function clientHealth(): Promise<ClientHealthRow[]> {
  const now = new Date();
  const clients = await db.client.findMany({ where: { status: { in: ["ACTIVE", "ONBOARDING"] } }, select: { id: true, number: true, name: true }, take: 300 });
  if (!clients.length) return [];
  const ids = clients.map((c) => c.id);
  const [tickets, breached, invoices, red] = await Promise.all([
    db.ticket.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] } }, _count: { _all: true } }),
    db.ticket.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] }, resolutionDueAt: { lt: now } }, _count: { _all: true } }),
    db.invoice.findMany({ where: { clientId: { in: ids }, status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: now } }, select: { clientId: true, balanceDue: true, currency: true } }),
    db.project.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, deletedAt: null, status: "ACTIVE", health: "RED" }, _count: { _all: true } }),
  ]);
  const c = (list: { clientId: string | null; _count: { _all: number } }[], id: string) => list.find((x) => x.clientId === id)?._count._all ?? 0;
  return clients
    .map((cl) => {
      const t = c(tickets, cl.id), b = c(breached, cl.id), r = c(red, cl.id);
      const inv = invoices.filter((i) => i.clientId === cl.id);
      const amt: Record<string, number> = {};
      for (const i of inv) amt[i.currency] = Math.round(((amt[i.currency] ?? 0) + Number(i.balanceDue)) * 100) / 100;
      const signals: string[] = [];
      let score = 100;
      if (b) (score -= 25 * Math.min(2, b), signals.push(`${b} ticket(s) past SLA`));
      if (t >= 5) (score -= 10, signals.push(`${t} open tickets`));
      if (inv.length) (score -= 15 * Math.min(2, inv.length), signals.push(`${inv.length} overdue invoice(s)`));
      if (r) (score -= 20 * Math.min(2, r), signals.push(`${r} red project(s)`));
      score = Math.max(0, score);
      return { id: cl.id, number: cl.number, name: cl.name, score, label: (score < 50 ? "AT_RISK" : score < 80 ? "WATCH" : "HEALTHY") as ClientHealthRow["label"], openTickets: t, breachedTickets: b, overdueInvoices: inv.length, overdueAmount: amt, redProjects: r, signals, href: `/admin/clients/${cl.id}` };
    })
    .sort((a, b) => a.score - b.score);
}

export interface CollectionRow {
  id: string;
  number: string;
  client: string;
  balance: number;
  currency: string;
  daysOverdue: number;
  href: string;
}

export async function collectionsQueue(limit = 50): Promise<CollectionRow[]> {
  const now = new Date();
  const rows = await db.invoice.findMany({ where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: now }, balanceDue: { gt: 0 } }, orderBy: { dueDate: "asc" }, take: limit, select: { id: true, number: true, balanceDue: true, currency: true, dueDate: true, client: { select: { name: true } } } });
  return rows.map((r) => ({ id: r.id, number: r.number, client: r.client.name, balance: Number(r.balanceDue), currency: r.currency, daysOverdue: days(r.dueDate!, now), href: `/admin/finance/invoices/${r.id}` }));
}
