import "server-only";
import { db } from "@/lib/db/client";
import { fmtMoney } from "@/lib/os/money";
import { dealMetrics } from "@/lib/sales/deals";
import { financeSummary } from "@/lib/finance/core";
import { can, type RoleName } from "@/lib/auth/permissions";
import { startOfLocalDay, periodStart } from "@/lib/ai/workforce/profiles";

/**
 * CEO briefing for TODAY / THIS WEEK / THIS MONTH, computed from live records every time it is opened.
 * Every figure carries its nature: REAL (from records), ESTIMATED (a formula over records, e.g. weighted pipeline),
 * MANUAL (entered by a person, e.g. campaign spend) or UNAVAILABLE (no data source) — nothing is invented.
 * Sections a role may not see (finance, deals) are omitted, not zeroed.
 */

export type Nature = "REAL" | "ESTIMATED" | "MANUAL" | "UNAVAILABLE";
export interface Metric {
  label: string;
  value: string;
  nature: Nature;
  href?: string;
  note?: string;
}
export interface BriefSection {
  key: string;
  title: string;
  metrics: Metric[];
}
export interface BriefItem {
  title: string;
  detail?: string;
  href?: string;
}
export interface Briefing {
  period: "today" | "week" | "month";
  from: Date;
  to: Date;
  sections: BriefSection[];
  completedObjectives: BriefItem[];
  delayedObjectives: BriefItem[];
  blockers: BriefItem[];
  risks: BriefItem[];
  opportunities: BriefItem[];
  approvals: BriefItem[];
  decisions: BriefItem[];
}

type Amount = { currency: string; amount: { toString(): string } };
const money = (list: Amount[]) => (list.length ? list.map((m) => fmtMoney(m.amount.toString(), m.currency)).join(" · ") : "0");
const n = (v: number) => v.toLocaleString("en-US");
const real = (label: string, value: string | number, href?: string, note?: string): Metric => ({ label, value: typeof value === "number" ? n(value) : value, nature: "REAL", href, note });

export function periodRange(period: Briefing["period"], now = new Date()) {
  const from = period === "today" ? startOfLocalDay(now) : period === "week" ? periodStart("WEEKLY", now) : periodStart("MONTHLY", now);
  return { from, to: now };
}

export async function buildBriefing(period: Briefing["period"], role: RoleName, now = new Date()): Promise<Briefing> {
  const { from, to } = periodRange(period, now);
  const range = { gte: from, lte: to };
  const fin = can(role, "finance:view");
  const deals = can(role, "deals:view");
  const [
    tasksDone, tasksFailed, running, waiting, approvalsPending, escalationsOpen, aiCost,
    newLeads, qualified, salesReady, prospects, prospectsQualified,
    posts, emails, spend, visitors,
    activeProjects, redProjects, overdueTasks, openTickets, breached, activeClients,
    objectivesDone, objectivesOpen, insights, approvals, decisions, salesReadyLeads,
  ] = await Promise.all([
    db.aITask.count({ where: { status: "DONE", completedAt: range } }),
    db.aITask.count({ where: { status: "FAILED", completedAt: range } }),
    db.aITask.count({ where: { status: "RUNNING" } }),
    db.aITask.count({ where: { status: { in: ["WAITING", "AWAITING_APPROVAL", "QUEUED"] } } }),
    db.aIApproval.count({ where: { status: "PENDING" } }),
    db.aIWorkMessage.count({ where: { kind: { in: ["ESCALATION", "BLOCKER"] }, status: "OPEN" } }),
    db.aIUsage.aggregate({ where: { createdAt: range }, _sum: { costUsd: true } }),
    db.lead.count({ where: { archivedAt: null, mergedIntoId: null, createdAt: range } }),
    db.lead.count({ where: { archivedAt: null, qualifiedAt: range, growthTier: { in: ["QUALIFIED", "SALES_READY"] } } }),
    db.lead.count({ where: { archivedAt: null, qualifiedAt: range, growthTier: "SALES_READY" } }),
    db.prospect.count({ where: { createdAt: range } }),
    db.prospect.count({ where: { createdAt: range, status: { in: ["RESEARCHED", "CONTACTED", "REPLIED", "CONVERTED"] } } }),
    db.socialPost.count({ where: { status: "PUBLISHED", publishedAt: range } }),
    db.growthEmailSend.count({ where: { status: "SENT", sentAt: range } }),
    db.campaignMetric.findMany({ where: { date: range }, select: { spend: true, source: true, campaign: { select: { currency: true } } } }),
    db.visitor.count({ where: { lastSeenAt: range } }),
    db.project.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    db.project.findMany({ where: { deletedAt: null, status: { in: ["ACTIVE", "PLANNED"] }, health: "RED" }, select: { id: true, name: true }, take: 10 }),
    db.task.count({ where: { status: { notIn: ["DONE"] }, dueDate: { lt: now } } }).catch(() => null),
    db.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] } } }),
    db.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] }, resolutionDueAt: { lt: now } } }),
    db.client.count({ where: { status: "ACTIVE" } }).catch(() => null),
    db.aIObjective.findMany({ where: { status: "COMPLETED", completedAt: range }, select: { id: true, title: true, targetMetric: true, targetValue: true } }),
    db.aIObjective.findMany({ where: { status: { in: ["PLANNING", "ACTIVE", "BLOCKED"] } }, select: { id: true, title: true, status: true, dueAt: true, blockedReason: true } }),
    db.aIRecommendation.findMany({ where: { status: "OPEN", severity: { in: ["HIGH", "CRITICAL"] } }, orderBy: { createdAt: "desc" }, take: 8, select: { title: true, body: true, href: true, permission: true } }),
    db.aIApproval.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 8, select: { id: true, action: true, agentSlug: true, risk: true } }),
    db.aIWorkMessage.findMany({ where: { kind: { in: ["ESCALATION", "BLOCKER"] }, status: "OPEN", OR: [{ toUserId: { not: null } }, { toSlug: "ceo" }] }, orderBy: { createdAt: "desc" }, take: 8, select: { subject: true, body: true, objectiveId: true, taskId: true } }),
    db.lead.findMany({ where: { archivedAt: null, growthTier: "SALES_READY", qualifiedAt: range }, orderBy: { qualifiedAt: "desc" }, take: 5, select: { id: true, name: true, company: true } }),
  ]);

  const sections: BriefSection[] = [
    { key: "workforce", title: "AI workforce", metrics: [real("Tasks completed", tasksDone, "/admin/ai/tasks?view=done"), real("Tasks failed", tasksFailed, "/admin/ai/tasks?view=failed"), real("Working now", running), real("Queued / waiting", waiting), real("Approvals required", approvalsPending, "/admin/ai/approvals"), real("Open escalations & blockers", escalationsOpen, "/admin/company"), real("AI cost (USD)", `$${Number(aiCost._sum.costUsd ?? 0).toFixed(2)}`, "/admin/ai/costs", "Metered per model call")] },
    { key: "leads", title: "Leads & lead generation", metrics: [real("New CRM leads", newLeads, "/admin/leads"), real("Qualified leads", qualified), real("Sales-ready leads", salesReady), real("Prospects discovered", prospects, "/admin/marketing/leads"), real("Prospects qualified", prospectsQualified)] },
    { key: "marketing", title: "Marketing", metrics: [real("Posts published (platform-confirmed)", posts, "/admin/marketing/social"), real("Sequence emails sent", emails, "/admin/marketing/email"), real("Website visitors", visitors, "/admin/visitors", "First-party visitor tracking"), spend.length ? { label: "Campaign spend", value: money(Object.entries(spend.reduce<Record<string, number>>((a, m) => ({ ...a, [m.campaign.currency]: (a[m.campaign.currency] ?? 0) + Number(m.spend) }), {})).map(([currency, amount]) => ({ currency, amount }))), nature: spend.every((s) => s.source === "MANUAL") ? "MANUAL" : "REAL", href: "/admin/marketing/campaigns", note: "Entered on campaigns; no ad platform is synced" } : { label: "Campaign spend", value: "—", nature: "UNAVAILABLE", note: "No spend entered and no ad platform connected" }, { label: "Ad platform results", value: "—", nature: "UNAVAILABLE", note: "Ads adapters are not implemented" }] },
    { key: "projects", title: "Projects & delivery", metrics: [real("Active projects", activeProjects, "/admin/projects"), real("Red-health projects", redProjects.length), overdueTasks == null ? { label: "Overdue project tasks", value: "—", nature: "UNAVAILABLE" } : real("Overdue project tasks", overdueTasks, "/admin/tasks")] },
    { key: "customers", title: "Customers", metrics: [activeClients == null ? { label: "Active clients", value: "—", nature: "UNAVAILABLE" } : real("Active clients", activeClients, "/admin/clients"), real("Open tickets", openTickets, "/admin/support"), real("Tickets past SLA", breached)] },
  ];
  if (deals) {
    const d = await dealMetrics({ from, to });
    sections.splice(2, 0, { key: "pipeline", title: "Revenue pipeline", metrics: [real("New deals", d.created, "/admin/deals"), real("Deals won", d.wonCount), real("Won value", money(d.won)), real("Open pipeline", money(d.pipeline)), { label: "Weighted pipeline", value: money(d.weighted), nature: "ESTIMATED", note: "Value × stage probability" }, d.winRate == null ? { label: "Win rate", value: "—", nature: "UNAVAILABLE", note: "No closed deals in the period" } : real("Win rate", `${d.winRate}%`)] });
  }
  if (fin) {
    const f = await financeSummary({ from, to });
    sections.splice(deals ? 3 : 2, 0, { key: "finance", title: "Finance", metrics: [real("Collected", money(f.collected), "/admin/finance/payments"), real("Outstanding", money(f.outstanding), "/admin/finance/invoices"), real("Overdue", money(f.overdue)), real("Overdue invoices", f.overdueCount)] });
  }

  const delayed = objectivesOpen.filter((o) => o.dueAt && o.dueAt < now);
  return {
    period,
    from,
    to,
    sections,
    completedObjectives: objectivesDone.map((o) => ({ title: o.title, detail: o.targetMetric ? `Target ${o.targetMetric} = ${o.targetValue} — see the CEO report for actuals` : undefined, href: `/admin/company/objectives/${o.id}` })),
    delayedObjectives: delayed.map((o) => ({ title: o.title, detail: `Due ${o.dueAt!.toISOString().slice(0, 10)}`, href: `/admin/company/objectives/${o.id}` })),
    blockers: objectivesOpen.filter((o) => o.status === "BLOCKED").map((o) => ({ title: o.title, detail: o.blockedReason ?? undefined, href: `/admin/company/objectives/${o.id}` })),
    risks: [...insights.filter((i) => can(role, i.permission as never)).map((i) => ({ title: i.title, detail: i.body ?? undefined, href: i.href ?? undefined })), ...redProjects.map((p) => ({ title: `Project at risk: ${p.name}`, href: `/admin/projects/${p.id}` }))].slice(0, 10),
    opportunities: salesReadyLeads.map((l) => ({ title: `Sales-ready lead: ${l.name}${l.company ? ` (${l.company})` : ""}`, href: `/admin/leads/${l.id}` })),
    approvals: approvals.map((a) => ({ title: a.action, detail: `${a.agentSlug} · ${a.risk.toLowerCase()} risk`, href: `/admin/ai/approvals/${a.id}` })),
    decisions: decisions.map((m) => ({ title: m.subject, detail: m.body.slice(0, 200), href: m.objectiveId ? `/admin/company/objectives/${m.objectiveId}` : m.taskId ? `/admin/ai/tasks/${m.taskId}` : undefined })),
  };
}
