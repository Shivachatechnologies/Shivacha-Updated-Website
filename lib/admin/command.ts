import "server-only";
import { db } from "@/lib/db/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { AGENTS } from "@/lib/ai/catalog";
import { OPEN_DEAL_STAGES } from "@/lib/crm/constants";
import { startOfUtcDay } from "@/lib/ai/cost";
import { marketOf, MARKETS, type MarketKey } from "@/lib/admin/markets";

/**
 * Read models for the Shivacha OS command center. Everything here is derived from live records:
 * no sample data, no invented targets and no currency conversion (amounts are always per currency).
 */

export interface Period {
  from: Date;
  to: Date;
}

/** The period of equal length immediately before `p` (for "vs previous period" comparisons). */
export const previousPeriod = (p: Period): Period => ({ from: new Date(p.from.getTime() - (p.to.getTime() - p.from.getTime())), to: p.from });

/** Percentage change, or null when there is nothing to compare against. */
export const pctChange = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

/** First day (UTC) of the month `back` months before the current one. */
export function monthStart(back: number, now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
}

/** YYYY-MM keys for the last `n` months, oldest first. */
export const monthKeys = (n: number, now = new Date()) => Array.from({ length: n }, (_, i) => monthStart(n - 1 - i, now).toISOString().slice(0, 7));

type MonthRow = { m: Date; n: bigint; v: Prisma.Decimal | null };

/**
 * Monthly count (and optional sum) for one table over the last `n` months. `table`, `col` and `sumCol` are
 * compile-time constants from this module, never user input.
 */
async function monthly(table: string, col: string, where: Prisma.Sql, n = 12, sumCol?: string) {
  const since = monthStart(n - 1);
  const sumExpr = sumCol ? Prisma.raw(`coalesce(sum(${sumCol}), 0)`) : Prisma.raw("0");
  const rows = await db.$queryRaw<MonthRow[]>`
    SELECT date_trunc('month', ${Prisma.raw(`"${col}"`)}) AS m, count(*)::bigint AS n, ${sumExpr} AS v
    FROM ${Prisma.raw(`"${table}"`)} WHERE ${Prisma.raw(`"${col}"`)} >= ${since} AND ${where} GROUP BY 1`;
  const keys = monthKeys(n);
  const byKey = new Map(rows.map((r) => [new Date(r.m).toISOString().slice(0, 7), r]));
  return keys.map((k) => ({ month: k, count: Number(byKey.get(k)?.n ?? 0), sum: Number(byKey.get(k)?.v ?? 0) }));
}

async function sumBy(sql: Prisma.Sql) {
  const rows = await db.$queryRaw<{ currency: string; amount: Prisma.Decimal | null; n: bigint }[]>(sql);
  return rows.filter((r) => r.amount != null).map((r) => ({ currency: r.currency, amount: Number(r.amount), n: Number(r.n) })).sort((a, b) => b.amount - a.amount);
}

export type Money = { currency: string; amount: number };

/** Confirmed revenue (net of refunds) per currency collected in a period — same rule as the finance module. */
export const revenueBetween = (p: Period) =>
  sumBy(Prisma.sql`SELECT currency::text, sum(amount - "refundedAmount") AS amount, count(*) AS n FROM "Payment"
    WHERE status::text IN ('CONFIRMED','PARTIALLY_REFUNDED','REFUNDED') AND "confirmedAt" >= ${p.from} AND "confirmedAt" < ${p.to} GROUP BY currency`);

/** Value of deals created in a period per currency (new pipeline added). */
export const newPipelineBetween = (p: Period) =>
  sumBy(Prisma.sql`SELECT currency::text, sum(value) AS amount, count(*) AS n FROM "Deal" WHERE "deletedAt" IS NULL AND "createdAt" >= ${p.from} AND "createdAt" < ${p.to} GROUP BY currency`);

/** Monthly revenue per currency for the last `n` months (confirmed payments, net of refunds). */
export async function revenueByMonth(n = 24) {
  const since = monthStart(n - 1);
  const rows = await db.$queryRaw<{ m: Date; currency: string; amount: Prisma.Decimal }[]>`
    SELECT date_trunc('month', "confirmedAt") AS m, currency::text, sum(amount - "refundedAmount") AS amount FROM "Payment"
    WHERE status::text IN ('CONFIRMED','PARTIALLY_REFUNDED','REFUNDED') AND "confirmedAt" >= ${since} GROUP BY 1, 2`;
  return { keys: monthKeys(n), rows: rows.map((r) => ({ month: new Date(r.m).toISOString().slice(0, 7), currency: r.currency, amount: Number(r.amount) })) };
}

/** Weighted open pipeline (value × probability) by expected close month for the next `n` months, per currency. */
export async function pipelineForecast(n = 3) {
  const from = monthStart(0);
  const to = monthStart(-n);
  const open = OPEN_DEAL_STAGES as readonly string[];
  const rows = await db.$queryRaw<{ m: Date; currency: string; weighted: Prisma.Decimal; total: Prisma.Decimal; n: bigint }[]>`
    SELECT date_trunc('month', "expectedCloseDate") AS m, currency::text, sum(value * probability / 100.0) AS weighted, sum(value) AS total, count(*)::bigint AS n
    FROM "Deal" WHERE "deletedAt" IS NULL AND stage::text = ANY(${open}) AND "expectedCloseDate" >= ${from} AND "expectedCloseDate" < ${to} GROUP BY 1, 2`;
  return rows.map((r) => ({ month: new Date(r.m).toISOString().slice(0, 7), currency: r.currency, weighted: Number(r.weighted), total: Number(r.total), deals: Number(r.n) }));
}

/* ───────── monthly trend series (sparklines) ───────── */

export const leadsByMonth = () => monthly("Lead", "createdAt", Prisma.sql`"archivedAt" IS NULL`);
export const wonLeadsByMonth = () => monthly("Lead", "createdAt", Prisma.sql`"archivedAt" IS NULL AND status = 'WON'`);
export const dealsByMonth = (currency: string) => monthly("Deal", "createdAt", Prisma.sql`"deletedAt" IS NULL AND currency::text = ${currency}`, 12, "value");
export const dealCountByMonth = () => monthly("Deal", "createdAt", Prisma.sql`"deletedAt" IS NULL`);
export const projectsByMonth = () => monthly("Project", "createdAt", Prisma.sql`"deletedAt" IS NULL`);
export const invoicesByMonth = () => monthly("Invoice", "issueDate", Prisma.sql`status::text <> 'VOID' AND status::text <> 'DRAFT'`);
export const aiRunsByMonth = () => monthly("AIExecution", "startedAt", Prisma.sql`TRUE`);

/* ───────── pipeline funnel ───────── */

/** Leads → Qualified → Proposal → Negotiation → Won, as "reached at least this stage" from the lead's current status. */
export const FUNNEL = [
  { key: "LEADS", label: "Leads", statuses: null, href: "/admin/leads" },
  { key: "QUALIFIED", label: "Qualified", statuses: ["QUALIFIED", "MEETING", "PROPOSAL_SENT", "NEGOTIATION", "WON"], href: "/admin/leads?status=QUALIFIED" },
  { key: "PROPOSAL", label: "Proposal", statuses: ["PROPOSAL_SENT", "NEGOTIATION", "WON"], href: "/admin/leads?status=PROPOSAL_SENT" },
  { key: "NEGOTIATION", label: "Negotiation", statuses: ["NEGOTIATION", "WON"], href: "/admin/leads?status=NEGOTIATION" },
  { key: "WON", label: "Won", statuses: ["WON"], href: "/admin/leads?status=WON" },
] as const;

export async function leadFunnel(p: Period | null) {
  const created = p ? { createdAt: { gte: p.from, lt: p.to } } : {};
  const rows = await db.lead.groupBy({ by: ["status"], where: { archivedAt: null, ...created }, _count: { _all: true }, _sum: { estimatedValue: true } });
  return FUNNEL.map((s) => {
    const hit = rows.filter((r) => !s.statuses || (s.statuses as readonly string[]).includes(r.status));
    const count = hit.reduce((n, r) => n + r._count._all, 0);
    const value = hit.reduce((n, r) => n + Number(r._sum.estimatedValue ?? 0), 0);
    return { key: s.key, label: s.label, href: s.href, count, value };
  });
}

/** Open deals by stage (count and value per currency) for the deal-stage breakdown under the funnel. */
export async function dealStages() {
  const rows = await db.deal.groupBy({ by: ["stage", "currency"], where: { deletedAt: null, stage: { in: [...OPEN_DEAL_STAGES] } }, _count: { _all: true }, _sum: { value: true } });
  return OPEN_DEAL_STAGES.map((stage) => {
    const hit = rows.filter((r) => r.stage === stage);
    return { stage, count: hit.reduce((n, r) => n + r._count._all, 0), values: hit.map((r) => ({ currency: r.currency as string, amount: Number(r._sum.value ?? 0) })).sort((a, b) => b.amount - a.amount) };
  });
}

/* ───────── global markets ───────── */

export interface MarketStat {
  key: MarketKey;
  leads: number;
  clients: number;
  openDeals: number;
}

/** Leads, clients and open deals per Shivacha market, from the free-text country on each record. */
export async function marketStats(opts: { leads: boolean; clients: boolean; deals: boolean }) {
  const [leads, clients, deals] = await Promise.all([
    opts.leads ? db.lead.groupBy({ by: ["country"], where: { archivedAt: null, country: { not: null } }, _count: { _all: true } }) : [],
    opts.clients ? db.client.groupBy({ by: ["country"], where: { deletedAt: null, country: { not: null } }, _count: { _all: true } }) : [],
    opts.deals ? db.deal.groupBy({ by: ["country"], where: { deletedAt: null, country: { not: null }, stage: { in: [...OPEN_DEAL_STAGES] } }, _count: { _all: true } }) : [],
  ]);
  const stats = new Map<MarketKey, MarketStat>(MARKETS.map((m) => [m.key, { key: m.key, leads: 0, clients: 0, openDeals: 0 }]));
  let unmapped = 0;
  const add = (rows: { country: string | null; _count: { _all: number } }[], field: "leads" | "clients" | "openDeals") => {
    for (const r of rows) {
      const k = marketOf(r.country);
      if (k) stats.get(k)![field] += r._count._all;
      else unmapped += r._count._all;
    }
  };
  add(leads, "leads");
  add(clients, "clients");
  add(deals, "openDeals");
  const list = [...stats.values()];
  return { markets: list, unmapped, hasData: list.some((m) => m.leads || m.clients || m.openDeals) };
}

/* ───────── AI workforce ───────── */

export type AgentStatus = "ONLINE" | "IDLE" | "WAITING" | "APPROVAL" | "DISABLED";

export interface AgentCard {
  slug: string;
  name: string;
  status: AgentStatus;
  mode: string;
  tasksToday: number;
  completedToday: number;
  lastActivity: Date | null;
  costToday: number;
  cost30d: number;
  successRate: number | null;
  pendingApprovals: number;
  queued: number;
}

/** Live status of every catalogue agent: derived only from executions, queued tasks and approvals. */
export async function agentWorkforce(now = new Date()): Promise<AgentCard[]> {
  const today = startOfUtcDay(now);
  const since30 = new Date(now.getTime() - 30 * 86400_000);
  const recent = new Date(now.getTime() - 15 * 60_000);
  const [rows, today_, month, last, running, approvals, queued] = await Promise.all([
    db.aIAgent.findMany({ select: { slug: true, name: true, enabled: true, mode: true } }),
    db.aIExecution.groupBy({ by: ["agentSlug", "status"], where: { startedAt: { gte: today } }, _count: { _all: true }, _sum: { costUsd: true } }),
    db.aIExecution.groupBy({ by: ["agentSlug", "status"], where: { startedAt: { gte: since30 } }, _count: { _all: true }, _sum: { costUsd: true } }),
    db.aIExecution.groupBy({ by: ["agentSlug"], _max: { startedAt: true } }),
    db.aIExecution.groupBy({ by: ["agentSlug"], where: { status: "RUNNING", startedAt: { gte: new Date(now.getTime() - 30 * 60_000) } }, _count: { _all: true } }),
    db.aIApproval.groupBy({ by: ["agentSlug"], where: { status: "PENDING" }, _count: { _all: true } }),
    db.aITask.groupBy({ by: ["agentSlug"], where: { status: { in: ["QUEUED", "RUNNING"] } }, _count: { _all: true } }),
  ]);
  const cfg = new Map(rows.map((r) => [r.slug, r]));
  return AGENTS.map((spec) => {
    const t = today_.filter((r) => r.agentSlug === spec.slug);
    const m = month.filter((r) => r.agentSlug === spec.slug);
    const ok = m.filter((r) => r.status === "SUCCEEDED").reduce((n, r) => n + r._count._all, 0);
    const bad = m.filter((r) => r.status === "FAILED").reduce((n, r) => n + r._count._all, 0);
    const lastAt = last.find((r) => r.agentSlug === spec.slug)?._max.startedAt ?? null;
    const pending = approvals.find((r) => r.agentSlug === spec.slug)?._count._all ?? 0;
    const q = queued.find((r) => r.agentSlug === spec.slug)?._count._all ?? 0;
    const isRunning = (running.find((r) => r.agentSlug === spec.slug)?._count._all ?? 0) > 0;
    const row = cfg.get(spec.slug);
    const status: AgentStatus = row && !row.enabled ? "DISABLED" : pending ? "APPROVAL" : isRunning || (lastAt && lastAt >= recent) ? "ONLINE" : q ? "WAITING" : "IDLE";
    return {
      slug: spec.slug,
      name: (row?.name ?? spec.name).replace(/^AI\s+/, ""),
      status,
      mode: row?.mode ?? "ASSIST",
      tasksToday: t.reduce((n, r) => n + r._count._all, 0),
      completedToday: t.filter((r) => r.status === "SUCCEEDED").reduce((n, r) => n + r._count._all, 0),
      lastActivity: lastAt,
      costToday: t.reduce((n, r) => n + Number(r._sum.costUsd ?? 0), 0),
      cost30d: m.reduce((n, r) => n + Number(r._sum.costUsd ?? 0), 0),
      successRate: ok + bad ? Math.round((ok / (ok + bad)) * 1000) / 10 : null,
      pendingApprovals: pending,
      queued: q,
    };
  });
}

export interface AIOperation {
  id: string;
  agentSlug: string;
  request: string;
  tools: { tool: string; ok: boolean }[];
  status: string;
  result: string | null;
  startedAt: Date;
  durationMs: number | null;
  costUsd: number;
}

/** The latest agent runs as Agent → Task → Tool → Result chains (the execution audit log, summarised). */
export async function aiOperations(take = 6): Promise<AIOperation[]> {
  const rows = await db.aIExecution.findMany({ orderBy: { startedAt: "desc" }, take, select: { id: true, agentSlug: true, request: true, toolsUsed: true, status: true, result: true, error: true, startedAt: true, durationMs: true, costUsd: true } });
  return rows.map((r) => {
    const tools = Array.isArray(r.toolsUsed) ? (r.toolsUsed as { tool?: unknown; ok?: unknown }[]).filter((t) => t && typeof t.tool === "string").map((t) => ({ tool: String(t.tool), ok: t.ok !== false })) : [];
    const text = (r.result as { text?: unknown } | null)?.text;
    const result = r.error ?? (typeof text === "string" ? text.replace(/[#*_`>\-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) : null);
    return { id: r.id, agentSlug: r.agentSlug, request: r.request.slice(0, 200), tools, status: r.status, result, startedAt: r.startedAt, durationMs: r.durationMs, costUsd: Number(r.costUsd) };
  });
}
