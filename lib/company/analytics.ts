import "server-only";
import { db } from "@/lib/db/client";
import { ALL_AGENTS } from "@/lib/ai/catalog";
import { placementOf, regionOf, REGIONS } from "./org";
import { leadGenFunnel, type Funnel } from "./leadgen";

/**
 * AI company analytics. Every number is computed from existing rows (leads, deals, prospects, AI tasks, AI usage).
 * Where data does not exist the value is null and the UI says UNAVAILABLE — nothing is estimated.
 */

const DAY = 86400_000;
type Money = Record<string, number>;
const addMoney = (m: Money, cur: string, v: number) => {
  m[cur] = Math.round(((m[cur] ?? 0) + v) * 100) / 100;
};

export interface RegionRow {
  key: string;
  name: string;
  leads: number;
  qualified: number;
  prospects: number;
  openDeals: number;
  wonDeals: number;
  wonValue: Money;
  campaigns: number;
}

/** Performance by region. Records are placed by their country; those without a country are listed separately. */
export async function regionalPerformance(days = 30, opts: { deals?: boolean } = { deals: true }): Promise<{ rows: RegionRow[]; unassigned: RegionRow; since: Date }> {
  const since = new Date(Date.now() - days * DAY);
  const [leads, qualified, prospects, deals, won, campaigns] = await Promise.all([
    db.lead.groupBy({ by: ["country"], where: { archivedAt: null, mergedIntoId: null, createdAt: { gte: since } }, _count: { _all: true } }),
    db.lead.groupBy({ by: ["country"], where: { archivedAt: null, mergedIntoId: null, createdAt: { gte: since }, growthTier: { in: ["QUALIFIED", "SALES_READY"] } }, _count: { _all: true } }),
    db.prospect.groupBy({ by: ["country"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    opts.deals ? db.deal.groupBy({ by: ["country"], where: { deletedAt: null, stage: { notIn: ["WON", "LOST"] } }, _count: { _all: true } }) : Promise.resolve([]),
    opts.deals ? db.deal.findMany({ where: { deletedAt: null, stage: "WON", wonAt: { gte: since } }, select: { country: true, value: true, currency: true } }) : Promise.resolve([]),
    db.campaign.groupBy({ by: ["regionKey"], where: { status: { in: ["PLANNED", "ACTIVE"] } }, _count: { _all: true } }),
  ]);
  const blank = (key: string, name: string): RegionRow => ({ key, name, leads: 0, qualified: 0, prospects: 0, openDeals: 0, wonDeals: 0, wonValue: {}, campaigns: 0 });
  const rows = new Map(REGIONS.map((r) => [r.key, blank(r.key, r.name)]));
  const unassigned = blank("none", "No country / other");
  const row = (country: string | null) => rows.get(regionOf(country) ?? "") ?? unassigned;
  for (const g of leads) row(g.country).leads += g._count._all;
  for (const g of qualified) row(g.country).qualified += g._count._all;
  for (const g of prospects) row(g.country).prospects += g._count._all;
  for (const g of deals) row(g.country).openDeals += g._count._all;
  for (const d of won) {
    const r = row(d.country);
    r.wonDeals++;
    addMoney(r.wonValue, d.currency, Number(d.value));
  }
  for (const c of campaigns) if (c.regionKey && rows.has(c.regionKey)) rows.get(c.regionKey)!.campaigns += c._count._all;
  return { rows: [...rows.values()], unassigned, since };
}

export interface EmployeeStats {
  slug: string;
  department: string;
  done: number;
  failed: number;
  open: number;
  waiting: number;
  escalations: number;
  avgMinutes: number | null;
  costUsd: number;
  successRate: number | null;
}

/** Per-employee workforce performance over `days` (tasks, speed, escalations, AI cost). */
export async function workforcePerformance(days = 30): Promise<EmployeeStats[]> {
  const since = new Date(Date.now() - days * DAY);
  const [finished, open, esc, cost, agents] = await Promise.all([
    db.aITask.findMany({ where: { status: { in: ["DONE", "FAILED"] }, completedAt: { gte: since } }, select: { agentSlug: true, status: true, startedAt: true, completedAt: true } }),
    db.aITask.groupBy({ by: ["agentSlug", "status"], where: { status: { in: ["QUEUED", "RUNNING", "PAUSED", "AWAITING_APPROVAL", "WAITING"] } }, _count: { _all: true } }),
    db.aIWorkMessage.groupBy({ by: ["fromSlug"], where: { kind: { in: ["ESCALATION", "BLOCKER"] }, createdAt: { gte: since } }, _count: { _all: true } }),
    db.aIUsage.groupBy({ by: ["agentSlug"], where: { createdAt: { gte: since } }, _sum: { costUsd: true } }),
    db.aIAgent.findMany({ select: { slug: true, departmentKey: true } }),
  ]);
  const dept = new Map(agents.map((a) => [a.slug, a.departmentKey]));
  return ALL_AGENTS.map((a) => {
    const mine = finished.filter((t) => t.agentSlug === a.slug);
    const done = mine.filter((t) => t.status === "DONE");
    const durations = done.filter((t) => t.startedAt && t.completedAt).map((t) => t.completedAt!.getTime() - t.startedAt!.getTime());
    const failed = mine.length - done.length;
    const openRows = open.filter((o) => o.agentSlug === a.slug);
    return {
      slug: a.slug,
      department: dept.get(a.slug) ?? placementOf(a.slug)?.department ?? "operations",
      done: done.length,
      failed,
      open: openRows.reduce((n, o) => n + o._count._all, 0),
      waiting: openRows.filter((o) => o.status === "WAITING" || o.status === "AWAITING_APPROVAL").reduce((n, o) => n + o._count._all, 0),
      escalations: esc.find((e) => e.fromSlug === a.slug)?._count._all ?? 0,
      avgMinutes: durations.length ? Math.round(durations.reduce((x, y) => x + y, 0) / durations.length / 60_000) : null,
      costUsd: Number(cost.find((c) => c.agentSlug === a.slug)?._sum.costUsd ?? 0),
      successRate: mine.length ? Math.round((done.length / mine.length) * 100) : null,
    };
  });
}

export interface DepartmentStats {
  key: string;
  employees: number;
  done: number;
  failed: number;
  open: number;
  waiting: number;
  escalations: number;
  costUsd: number;
  overdue: number;
}

export async function departmentPerformance(stats: EmployeeStats[]): Promise<DepartmentStats[]> {
  const overdue = await db.aITask.findMany({ where: { status: { in: ["QUEUED", "RUNNING", "PAUSED", "AWAITING_APPROVAL", "WAITING"] }, deadline: { lt: new Date() } }, select: { agentSlug: true } });
  const map = new Map<string, DepartmentStats>();
  for (const s of stats) {
    const d = map.get(s.department) ?? { key: s.department, employees: 0, done: 0, failed: 0, open: 0, waiting: 0, escalations: 0, costUsd: 0, overdue: 0 };
    d.employees++;
    d.done += s.done;
    d.failed += s.failed;
    d.open += s.open;
    d.waiting += s.waiting;
    d.escalations += s.escalations;
    d.costUsd += s.costUsd;
    d.overdue += overdue.filter((o) => o.agentSlug === s.slug).length;
    map.set(s.department, d);
  }
  return [...map.values()];
}

export interface Scorecard {
  leads: number;
  qualifiedLeads: number;
  replies: number | null;
  meetings: number;
  opportunities: number;
  customers: number;
  revenue: Money;
  spend: Money | null;
  impressions: number | null;
  clicks: number | null;
  funnel: Funnel | null;
}

/** Unified campaign metrics from CRM, sequences, deals, clients and entered spend. Unavailable data is null. */
export async function campaignScorecard(campaignId: string): Promise<Scorecard | null> {
  const c = await db.campaign.findUnique({ where: { id: campaignId }, select: { name: true, utmCampaign: true, currency: true, leadGen: true, sequences: { select: { id: true } } } });
  if (!c) return null;
  const leadWhere = { archivedAt: null, mergedIntoId: null, OR: [...(c.utmCampaign ? [{ utmCampaign: c.utmCampaign }] : []), { campaign: c.name }] };
  const leads = await db.lead.findMany({ where: leadWhere, select: { id: true, growthTier: true, status: true } });
  const ids = leads.map((l) => l.id);
  const [replies, deals, customers, metrics] = await Promise.all([
    c.sequences.length ? db.sequenceEnrollment.count({ where: { sequenceId: { in: c.sequences.map((s) => s.id) }, stopReason: { startsWith: "REPLY_" } } }) : Promise.resolve(null),
    ids.length ? db.deal.findMany({ where: { leadId: { in: ids }, deletedAt: null }, select: { stage: true, value: true, currency: true } }) : Promise.resolve([]),
    ids.length ? db.client.count({ where: { leadId: { in: ids } } }) : Promise.resolve(0),
    db.campaignMetric.findMany({ where: { campaignId }, select: { spend: true, impressions: true, clicks: true } }),
  ]);
  const revenue: Money = {};
  for (const d of deals) if (d.stage === "WON") addMoney(revenue, d.currency, Number(d.value));
  const spend: Money | null = metrics.length ? { [c.currency]: Math.round(metrics.reduce((a, m) => a + Number(m.spend), 0) * 100) / 100 } : null;
  return {
    leads: leads.length,
    qualifiedLeads: leads.filter((l) => l.growthTier === "QUALIFIED" || l.growthTier === "SALES_READY").length,
    replies,
    meetings: leads.filter((l) => ["MEETING", "PROPOSAL_SENT", "NEGOTIATION", "WON"].includes(l.status)).length,
    opportunities: deals.length,
    customers,
    revenue,
    spend,
    impressions: metrics.length ? metrics.reduce((a, m) => a + m.impressions, 0) : null,
    clicks: metrics.length ? metrics.reduce((a, m) => a + m.clicks, 0) : null,
    funnel: c.leadGen ? await leadGenFunnel(campaignId) : null,
  };
}
