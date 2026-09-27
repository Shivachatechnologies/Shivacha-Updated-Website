import Link from "next/link";
import { Activity, BrainCircuit, CircleDollarSign, FileWarning, FolderKanban, Handshake, Inbox, Percent, ShieldCheck, TrendingUp } from "lucide-react";
import { db } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getFlags } from "@/lib/os/flags";
import { resolveRange } from "@/lib/os/range";
import { fmtMoney } from "@/lib/os/money";
import { financeSummary } from "@/lib/finance/core";
import { dealMetrics } from "@/lib/sales/deals";
import { SETTING_DEFAULTS, type TargetSettings } from "@/lib/admin/settings";
import { MARKETS } from "@/lib/admin/markets";
import { dbPing } from "@/lib/admin/shell";
import {
  agentWorkforce, aiOperations, aiRunsByMonth, dealCountByMonth, dealStages, dealsByMonth, invoicesByMonth, leadFunnel, leadsByMonth, marketStats, monthKeys,
  newPipelineBetween, pctChange, pipelineForecast, previousPeriod, projectsByMonth, revenueBetween, revenueByMonth, wonLeadsByMonth, type Period,
} from "@/lib/admin/command";
import { Badge, EmptyState, LEAD_STATUS_TONE, Panel, Stat, TableWrap, fmtDate, label, td, th } from "@/components/admin/ui";
import { BarList, ColumnChart } from "@/components/admin/charts";
import { RangePicker } from "@/components/admin/range";
import { str, type SP } from "@/components/admin/os";
import { KpiTile, type KpiTileProps } from "@/components/admin/command/kpi";
import { RevenueChart, type RevenueSeries } from "@/components/admin/command/revenue-chart";
import { DealStageBar, PipelineFunnel } from "@/components/admin/command/funnel";
import { WorldOpsMap } from "@/components/admin/command/world-map";
import { AgentGrid, AIOperationsFlow } from "@/components/admin/command/workforce";
import { OpsPanel } from "@/components/admin/command/section";
import { Greeting } from "@/components/admin/command/greeting";
import { cn } from "@/lib/cn";

export const metadata = { title: "Dashboard" };

const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "MEETING", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST", "ON_HOLD"] as const;

async function breakdown(field: "country" | "service" | "product" | "source") {
  const rows = await db.lead.groupBy({ by: [field], where: { archivedAt: null, [field]: { not: null } }, _count: { _all: true }, orderBy: { _count: { [field]: "desc" } }, take: 8 });
  return rows.map((r) => ({ label: String(r[field] ?? "—"), value: r._count._all }));
}

/** Resolves only when `on`; otherwise returns the fallback without touching the database. */
const when = <T,>(on: boolean, run: () => Promise<T>, fallback: T): Promise<T> => (on ? run() : Promise.resolve(fallback));

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Shivacha OS command center. Every figure is read from live records for the selected range and compared with the
 * previous period of equal length; each module appears only for roles (and feature flags) that may see it.
 */
export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("dashboard:view");
  const sp = await searchParams;
  const flags = await getFlags();
  const see = {
    leads: can(user.role, "leads:view"),
    finance: flags.FINANCE && can(user.role, "finance:view"),
    deals: flags.SALES_PIPELINE && can(user.role, "deals:view"),
    projects: flags.PROJECTS && can(user.role, "projects:view"),
    ai: flags.AI_WORKFORCE && can(user.role, "ai:view"),
    clients: can(user.role, "clients:view"),
    support: flags.SUPPORT && can(user.role, "support:view"),
    insights: flags.AI_WORKFORCE && can(user.role, "ai:view"),
  };
  const range = resolveRange(str(sp, "range", 10) || "30d", str(sp, "from", 10), str(sp, "to", 10));
  const now = new Date();
  const period: Period | null = range.from ? { from: range.from, to: range.to ?? now } : null;
  const prev = period ? previousPeriod(period) : null;
  const vs = period ? `vs previous ${Math.max(1, Math.round((period.to.getTime() - period.from.getTime()) / 86400_000))} days` : "All time";
  const inPeriod = period ? { gte: period.from, lt: period.to } : undefined;
  const inPrev = prev ? { gte: prev.from, lt: prev.to } : undefined;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const empty = { collected: [], collectedCount: 0, outstanding: [], outstandingCount: 0, overdue: [], overdueCount: 0, drafts: 0, refunds: [], expenses: [], pendingPayments: 0 };

  const [
    fin, revPrev, revMonthly, forecast, targetRow,
    deals, newPipe, newPipePrev, dealsMonthly, stages,
    leadsNow, leadsPrev, wonNow, wonPrev, leadsMonthly, wonMonthly, qualifiedNow, funnel,
    projActive, projAtRisk, projNew, projPrev, projMonthly,
    invIssued, invPrev, invMonthly,
    aiNow, aiPrev, aiOk, aiBad, aiMonthly, agents, ops,
    markets, risks, breached, dbMs,
  ] = await Promise.all([
    when(see.finance, () => financeSummary(range), empty),
    when(see.finance && !!prev, () => revenueBetween(prev!), []),
    when(see.finance, () => revenueByMonth(24), { keys: [], rows: [] }),
    when(see.finance && see.deals, () => pipelineForecast(3), []),
    when(see.finance, () => db.setting.findUnique({ where: { key: "targets" } }), null),
    when(see.deals, () => dealMetrics(range), null),
    when(see.deals && !!period, () => newPipelineBetween(period!), []),
    when(see.deals && !!prev, () => newPipelineBetween(prev!), []),
    when(see.deals, () => dealCountByMonth(), []),
    when(see.deals, () => dealStages(), []),
    when(see.leads, () => db.lead.count({ where: { archivedAt: null, createdAt: inPeriod } }), 0),
    when(see.leads && !!prev, () => db.lead.count({ where: { archivedAt: null, createdAt: inPrev } }), 0),
    when(see.leads, () => db.lead.count({ where: { archivedAt: null, createdAt: inPeriod, status: "WON" } }), 0),
    when(see.leads && !!prev, () => db.lead.count({ where: { archivedAt: null, createdAt: inPrev, status: "WON" } }), 0),
    when(see.leads, () => leadsByMonth(), []),
    when(see.leads, () => wonLeadsByMonth(), []),
    when(see.leads, () => db.lead.count({ where: { archivedAt: null, createdAt: inPeriod, OR: [{ status: { in: ["QUALIFIED", "MEETING", "PROPOSAL_SENT", "NEGOTIATION", "WON"] } }, { lifecycleStage: { in: ["SQL", "OPPORTUNITY", "CUSTOMER"] } }] } }), 0),
    when(see.leads, () => leadFunnel(period), []),
    when(see.projects, () => db.project.count({ where: { deletedAt: null, status: "ACTIVE" } }), 0),
    when(see.projects, () => db.project.count({ where: { deletedAt: null, status: { in: ["ACTIVE", "PLANNED"] }, OR: [{ health: "RED" }, { targetDate: { lt: now } }] } }), 0),
    when(see.projects && !!period, () => db.project.count({ where: { deletedAt: null, createdAt: inPeriod } }), 0),
    when(see.projects && !!prev, () => db.project.count({ where: { deletedAt: null, createdAt: inPrev } }), 0),
    when(see.projects, () => projectsByMonth(), []),
    when(see.finance && !!period, () => db.invoice.count({ where: { status: { notIn: ["DRAFT", "VOID"] }, issueDate: inPeriod } }), 0),
    when(see.finance && !!prev, () => db.invoice.count({ where: { status: { notIn: ["DRAFT", "VOID"] }, issueDate: inPrev } }), 0),
    when(see.finance, () => invoicesByMonth(), []),
    when(see.ai, () => db.aIExecution.count({ where: { startedAt: inPeriod } }), 0),
    when(see.ai && !!prev, () => db.aIExecution.count({ where: { startedAt: inPrev } }), 0),
    when(see.ai, () => db.aIExecution.count({ where: { startedAt: inPeriod, status: "SUCCEEDED" } }), 0),
    when(see.ai, () => db.aIExecution.count({ where: { startedAt: inPeriod, status: "FAILED" } }), 0),
    when(see.ai, () => aiRunsByMonth(), []),
    when(see.ai, () => agentWorkforce(now), []),
    when(see.ai, () => aiOperations(6), []),
    marketStats({ leads: see.leads, clients: see.clients, deals: see.deals }),
    when(see.insights, () => db.aIRecommendation.count({ where: { status: "OPEN", severity: { in: ["CRITICAL", "HIGH"] } } }), 0),
    when(see.support, () => db.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] }, resolutionDueAt: { lt: now } } }), 0),
    dbPing(),
  ]);

  /* ───────── revenue series (per currency, never converted) ───────── */
  const target: TargetSettings = { ...SETTING_DEFAULTS.targets, ...((targetRow?.value as object) ?? {}) };
  const keys12 = monthKeys(12);
  const future = [1, 2, 3].map((i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)).toISOString().slice(0, 7));
  const currencies = [...new Set([...revMonthly.rows.map((r) => r.currency), ...forecast.map((f) => f.currency)])];
  const volume = (c: string) => revMonthly.rows.filter((r) => r.currency === c).reduce((n, r) => n + r.amount, 0);
  currencies.sort((a, b) => volume(b) - volume(a));
  const revSeries: RevenueSeries[] = currencies.map((c) => {
    const amt = (m: string) => revMonthly.rows.filter((r) => r.currency === c && r.month === m).reduce((n, r) => n + r.amount, 0);
    const yearAgo = (m: string) => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`;
    const hasHistory = revMonthly.rows.some((r) => r.currency === c && r.month < keys12[0]!);
    const fc = (m: string) => forecast.filter((f) => f.currency === c && f.month === m);
    const thisMonth = keys12[keys12.length - 1]!;
    return {
      currency: c,
      target: target.monthlyRevenue != null && target.currency === c ? target.monthlyRevenue : null,
      points: [
        ...keys12.map((m) => ({
          month: m,
          actual: amt(m),
          previous: hasHistory ? amt(yearAgo(m)) : null,
          forecast: m === thisMonth && fc(m).length ? fc(m).reduce((n, f) => n + f.weighted, 0) : null,
          forecastDeals: m === thisMonth ? fc(m).reduce((n, f) => n + f.deals, 0) : 0,
        })),
        ...future.map((m) => ({ month: m, actual: null, previous: hasHistory ? amt(yearAgo(m)) : null, forecast: fc(m).length ? fc(m).reduce((n, f) => n + f.weighted, 0) : null, forecastDeals: fc(m).reduce((n, f) => n + f.deals, 0) })),
      ],
    };
  });
  const mainCur = fin.collected[0]?.currency ?? revPrev[0]?.currency ?? currencies[0] ?? deals?.pipeline[0]?.currency ?? "USD";
  const amountIn = (list: { currency: string; amount: unknown }[], c: string) => Number(list.find((x) => x.currency === c)?.amount ?? 0);
  const others = (list: { currency: string; amount: unknown }[], c: string) => list.filter((x) => x.currency !== c).map((x) => fmtMoney(String(x.amount), x.currency, { compact: true })).join(" · ");
  const revSpark = keys12.map((m) => revMonthly.rows.filter((r) => r.currency === mainCur && r.month === m).reduce((n, r) => n + r.amount, 0));
  const pipeCur = deals?.pipeline[0]?.currency ?? mainCur;
  const pipeMonthly = see.deals ? await dealsByMonth(pipeCur) : [];

  /* ───────── KPI strip ───────── */
  const rate = (w: number, n: number) => (n ? Math.round((w / n) * 1000) / 10 : null);
  const convNow = rate(wonNow, leadsNow);
  const convPrev = rate(wonPrev, leadsPrev);
  const aiRate = rate(aiOk, aiOk + aiBad);
  const q = period ? `from=${ymd(period.from)}&to=${ymd(period.to)}` : "";
  const kpis: (KpiTileProps & { show: boolean })[] = [
    {
      show: see.finance, label: "Revenue", icon: <CircleDollarSign className="size-3.5" />, href: `/admin/finance?range=${range.key}${range.key === "custom" ? `&${q}` : ""}`,
      value: fmtMoney(amountIn(fin.collected, mainCur), mainCur, { compact: true }),
      delta: prev ? pctChange(amountIn(fin.collected, mainCur), amountIn(revPrev, mainCur)) : null, deltaLabel: vs,
      spark: revSpark, context: others(fin.collected, mainCur) ? `Also ${others(fin.collected, mainCur)}` : `${fin.collectedCount} confirmed payment${fin.collectedCount === 1 ? "" : "s"}`,
    },
    {
      show: see.deals, label: "Pipeline", icon: <TrendingUp className="size-3.5" />, href: "/admin/crm/pipeline",
      value: fmtMoney(amountIn(deals?.pipeline ?? [], pipeCur), pipeCur, { compact: true }),
      delta: prev ? pctChange(amountIn(newPipe, pipeCur), amountIn(newPipePrev, pipeCur)) : null, deltaLabel: period ? `new pipeline ${vs}` : vs,
      spark: pipeMonthly.map((m) => m.sum), sparkTone: "violet", context: `Weighted ${fmtMoney(amountIn(deals?.weighted ?? [], pipeCur), pipeCur, { compact: true })}`,
    },
    {
      show: see.leads, label: "New leads", icon: <Inbox className="size-3.5" />, href: `/admin/leads${q ? `?${q}` : ""}`,
      value: leadsNow.toLocaleString(), delta: prev ? pctChange(leadsNow, leadsPrev) : null, deltaLabel: vs,
      spark: leadsMonthly.map((m) => m.count), context: `${qualifiedNow} qualified${leadsNow ? ` (${Math.round((qualifiedNow / leadsNow) * 100)}%)` : ""}`,
    },
    {
      show: see.deals, label: "Active deals", icon: <Handshake className="size-3.5" />, href: "/admin/deals",
      value: (deals?.openCount ?? 0).toLocaleString(), delta: prev ? pctChange(deals?.created ?? 0, newPipePrev.reduce((n, r) => n + r.n, 0)) : null, deltaLabel: period ? `new deals ${vs}` : vs,
      spark: dealsMonthly.map((m) => m.count), sparkTone: "violet", context: deals?.winRate != null ? `${deals.winRate}% win rate · ${deals.wonCount} won` : `${deals?.wonCount ?? 0} won in period`,
    },
    {
      show: see.projects, label: "Projects", icon: <FolderKanban className="size-3.5" />, href: "/admin/projects",
      value: projActive.toLocaleString(), delta: prev ? pctChange(projNew, projPrev) : null, deltaLabel: period ? `new projects ${vs}` : vs, polarity: "neutral",
      spark: projMonthly.map((m) => m.count), context: projAtRisk ? `${projAtRisk} at risk or overdue` : "None at risk", contextTone: projAtRisk ? "warn" : "good",
    },
    {
      show: see.finance, label: "Outstanding", icon: <FileWarning className="size-3.5" />, href: "/admin/finance/invoices?status=OVERDUE",
      value: fmtMoney(amountIn(fin.outstanding, mainCur), mainCur, { compact: true }), delta: prev ? pctChange(invIssued, invPrev) : null, deltaLabel: period ? `invoices issued ${vs}` : vs, polarity: "neutral",
      spark: invMonthly.map((m) => m.count), sparkTone: "amber",
      context: fin.overdueCount ? `${fin.overdueCount} overdue · ${fmtMoney(amountIn(fin.overdue, mainCur), mainCur, { compact: true })}` : `${fin.outstandingCount} open invoice${fin.outstandingCount === 1 ? "" : "s"}, none overdue`, contextTone: fin.overdueCount ? "bad" : "good",
    },
    {
      show: see.leads, label: "Conversion", icon: <Percent className="size-3.5" />, href: "/admin/leads?status=WON",
      value: convNow != null ? `${convNow}%` : "—", delta: convNow != null && convPrev != null ? Math.round((convNow - convPrev) * 10) / 10 : null, deltaSuffix: " pts", deltaLabel: vs,
      spark: leadsMonthly.map((m, i) => (m.count ? Math.round(((wonMonthly[i]?.count ?? 0) / m.count) * 1000) / 10 : 0)), sparkTone: "green", context: `${wonNow} of ${leadsNow} leads won`,
    },
    {
      show: see.ai, label: "AI tasks", icon: <BrainCircuit className="size-3.5" />, href: "/admin/ai/logs",
      value: aiNow.toLocaleString(), delta: prev ? pctChange(aiNow, aiPrev) : null, deltaLabel: vs, polarity: "neutral",
      spark: aiMonthly.map((m) => m.count), sparkTone: "violet", context: aiRate != null ? `${aiRate}% success · ${aiBad} failed` : "No completed runs in period", contextTone: aiBad ? "warn" : "neutral",
    },
  ];
  const visible = kpis.filter((k) => k.show);

  /* ───────── header status ───────── */
  const attention = fin.overdueCount + projAtRisk + risks + breached;
  const activeAgents = agents.filter((a) => a.tasksToday > 0 || a.status === "ONLINE").length;
  const approvals = agents.reduce((n, a) => n + a.pendingApprovals, 0);

  /* ───────── existing CRM & content detail ───────── */
  const seeLeads = see.leads;
  const [statusRows, total, thisMonth, pubServices, pubProducts, pubPosts, weekly, byCountry, byService, byProduct, bySource, recent, activity, overdue] = await Promise.all([
    seeLeads ? db.lead.groupBy({ by: ["status"], where: { archivedAt: null }, _count: { _all: true } }) : Promise.resolve([]),
    seeLeads ? db.lead.count({ where: { archivedAt: null } }) : Promise.resolve(0),
    seeLeads ? db.lead.count({ where: { archivedAt: null, createdAt: { gte: monthStart } } }) : Promise.resolve(0),
    db.service.count({ where: { status: "PUBLISHED" } }),
    db.product.count({ where: { status: "PUBLISHED" } }),
    db.blogPost.count({ where: { status: "PUBLISHED" } }),
    seeLeads
      ? db.$queryRaw<{ week: Date; n: bigint }[]>`SELECT date_trunc('week', "createdAt") AS week, count(*)::bigint AS n FROM "Lead" WHERE "archivedAt" IS NULL AND "createdAt" >= now() - interval '12 weeks' GROUP BY 1 ORDER BY 1`
      : Promise.resolve([]),
    seeLeads ? breakdown("country") : Promise.resolve([]),
    seeLeads ? breakdown("service") : Promise.resolve([]),
    seeLeads ? breakdown("product") : Promise.resolve([]),
    seeLeads ? breakdown("source") : Promise.resolve([]),
    seeLeads ? db.lead.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, name: true, company: true, country: true, service: true, product: true, budget: true, status: true, createdAt: true } }) : Promise.resolve([]),
    can(user.role, "audit:view") ? db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { name: true } } } }) : Promise.resolve([]),
    can(user.role, "followups:manage") ? db.followUp.findMany({ where: { status: "PENDING", dueAt: { lt: now } }, orderBy: { dueAt: "asc" }, take: 6, include: { lead: { select: { id: true, name: true } } } }) : Promise.resolve([]),
  ]);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, statusRows.find((r) => r.status === s)?._count._all ?? 0])) as Record<(typeof STATUSES)[number], number>;
  const conversion = total ? Math.round((counts.WON / total) * 1000) / 10 : 0;
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) - 7 * 11);
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(start.getTime() + i * 7 * 86400000);
    const hit = weekly.find((w) => new Date(w.week).toISOString().slice(0, 10) === d.toISOString().slice(0, 10));
    return { label: d.toISOString().slice(5, 10), value: hit ? Number(hit.n) : 0 };
  });

  const mapMarkets = MARKETS.map((m) => {
    const s = markets.markets.find((x) => x.key === m.key)!;
    const single = { usa: "United States", canada: "Canada", uk: "United Kingdom", uae: "United Arab Emirates", saudi: "Saudi Arabia", india: "India", singapore: "Singapore", australia: "Australia" }[m.key as string];
    return { ...m, leads: s.leads, clients: s.clients, openDeals: s.openDeals, href: see.leads && single && s.leads ? `/admin/leads?country=${encodeURIComponent(single)}` : undefined };
  });
  const agentNames = Object.fromEntries(agents.map((a) => [a.slug, a.name]));

  return (
    <div className="space-y-5">
      {/* ── command header ── */}
      <section data-theme="dark" className="os-surface os-grid-bg relative overflow-hidden rounded-xl border border-white/[0.07] px-5 py-5 shadow-[0_30px_70px_-40px_rgb(3_7_15/0.9)] sm:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="mb-2 font-mono text-[10px] tracking-[0.2em] text-[#6f86a6] uppercase">Executive command center</p>
            <Greeting firstName={user.name.split(" ")[0] ?? user.name} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:w-[620px]">
            <HeaderStat
              label="Business status"
              tone={attention ? "warn" : "good"}
              value={attention ? `${attention} item${attention === 1 ? "" : "s"} need attention` : "No open alerts"}
              detail={[fin.overdueCount && `${fin.overdueCount} overdue invoice${fin.overdueCount === 1 ? "" : "s"}`, projAtRisk && `${projAtRisk} project${projAtRisk === 1 ? "" : "s"} at risk`, risks && `${risks} high-severity insight${risks === 1 ? "" : "s"}`, breached && `${breached} ticket${breached === 1 ? "" : "s"} past SLA`].filter(Boolean).join(" · ") || "Invoices, projects, insights and SLAs are clear"}
              href={see.insights ? "/admin/ai/insights" : can(user.role, "executive:view") ? "/admin/executive" : undefined}
            />
            {see.ai ? (
              <HeaderStat label="AI workforce" tone={approvals ? "warn" : "ai"} value={`${activeAgents} of ${agents.length} agents active today`} detail={approvals ? `${approvals} action${approvals === 1 ? "" : "s"} awaiting approval` : "No approvals pending"} href={approvals ? "/admin/ai/approvals" : "/admin/ai"} />
            ) : (
              <HeaderStat label="AI workforce" tone="neutral" value={flags.AI_WORKFORCE ? "Not in your role" : "Module off"} detail="AI Workforce access is managed by an administrator" />
            )}
            <HeaderStat label="System health" tone={dbMs != null ? "good" : "bad"} value={dbMs != null ? "All systems operational" : "Database unreachable"} detail={dbMs != null ? `Database ${dbMs} ms · ${range.label}` : "Check System Health"} href={can(user.role, "system:view") ? "/admin/system" : undefined} />
          </div>
        </div>
      </section>

      <div className="-mb-2 flex flex-wrap items-center justify-between gap-2">
        <RangePicker active={range.key} basePath="/admin/dashboard" from={str(sp, "from", 10)} to={str(sp, "to", 10)} />
      </div>

      {/* ── KPI strip ── */}
      {visible.length > 0 && (
        <div className={cn("grid grid-cols-2 gap-2.5 md:grid-cols-4", visible.length > 4 && "min-[1820px]:grid-cols-8")}>
          {visible.map((k) => <KpiTile key={k.label} {...k} />)}
        </div>
      )}

      {/* ── revenue & pipeline ── */}
      {(see.finance || see.leads) && (
        <div className={cn("grid gap-4", see.finance && see.leads && "xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]")}>
          {see.finance && (
            <OpsPanel eyebrow="Revenue" title="Collected revenue, prior year, target and forecast" actions={<Link href="/admin/finance" className="text-xs font-medium text-brand-blue hover:underline">Finance</Link>}>
              {revSeries.length ? <RevenueChart series={revSeries} /> : <EmptyState title="No confirmed payments yet" description="The chart fills in as payments are confirmed in Finance." />}
              {target.monthlyRevenue == null && can(user.role, "settings:manage") && <p className="mt-2 text-[11.5px] text-dim">No revenue target set. <Link href="/admin/settings" className="text-brand-blue hover:underline">Set a monthly target</Link> to show target vs actual.</p>}
            </OpsPanel>
          )}
          {see.leads && (
            <OpsPanel eyebrow="Pipeline" title={`Conversion funnel · ${range.label}`} actions={<Link href={see.deals ? "/admin/crm/pipeline" : "/admin/leads"} className="text-xs font-medium text-brand-blue hover:underline">Open pipeline</Link>}>
              <PipelineFunnel stages={funnel} query={q} />
              {see.deals && (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="mb-2 font-mono text-[10px] tracking-[0.14em] text-dim uppercase">Open deals by stage</p>
                  <DealStageBar rows={stages} />
                </div>
              )}
            </OpsPanel>
          )}
        </div>
      )}

      {/* ── global operations ── */}
      <OpsPanel dark eyebrow="Global operations" title="Shivacha operating markets" actions={<span className="font-mono text-[10.5px] text-[#6f86a6]">{MARKETS.length} markets · live record counts</span>}>
        <WorldOpsMap markets={mapMarkets} hasData={markets.hasData} unmapped={markets.unmapped} />
      </OpsPanel>

      {/* ── AI workforce ── */}
      {see.ai && (
        <OpsPanel
          dark
          eyebrow="AI workforce"
          title="Agent command center"
          className="border-violet-400/15"
          actions={
            <>
              {approvals > 0 && <Link href="/admin/ai/approvals" className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-200"><ShieldCheck className="size-3.5" />{approvals} to approve</Link>}
              <Link href="/admin/ai" className="inline-flex items-center gap-1.5 rounded-md border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-100 hover:bg-violet-500/20"><Activity className="size-3.5" />Open command center</Link>
            </>
          }
        >
          <AgentGrid agents={agents} now={now} />
          <div className="mt-5 border-t border-white/[0.06] pt-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-mono text-[10px] tracking-[0.16em] text-[#6f86a6] uppercase">AI operations · Agent → Task → Tool → Result</p>
              <Link href="/admin/ai/logs" className="text-xs text-violet-200 hover:underline">All logs</Link>
            </div>
            <AIOperationsFlow ops={ops} names={agentNames} now={now} />
          </div>
        </OpsPanel>
      )}

      {/* ── CRM & content detail (unchanged data, restyled) ── */}
      {overdue.length > 0 && (
        <Panel title={`Overdue follow-ups (${overdue.length})`} className="border-amber-500/40" action={<Link href="/admin/follow-ups?view=overdue" className="text-xs font-medium text-brand-blue hover:underline">View all</Link>}>
          <ul className="divide-y divide-line text-sm">
            {overdue.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/admin/leads/${f.lead.id}`} className="truncate font-medium text-fg hover:underline">{f.lead.name}</Link>
                <span className="shrink-0 text-xs text-amber-700">Due {fmtDate(f.dueAt, true)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {seeLeads && (
        <>
          <div className="flex items-center gap-3 pt-2">
            <p className="font-mono text-[10px] tracking-[0.16em] text-dim uppercase">CRM detail · all time</p>
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-6">
            <Stat label="Total leads" value={total.toLocaleString()} href="/admin/leads" />
            <Stat label="New" value={counts.NEW} href="/admin/leads?status=NEW" />
            <Stat label="Leads this month" value={thisMonth} />
            <Stat label="Conversion rate" value={`${conversion}%`} hint="Won ÷ all leads" />
            <Stat label="Won" value={counts.WON} href="/admin/leads?status=WON" />
            <Stat label="Lost" value={counts.LOST} href="/admin/leads?status=LOST" />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Panel title="Leads per week (last 12 weeks)">
              <ColumnChart data={weeks} label="Leads per week" />
            </Panel>
            <Panel title="Leads by status">
              <BarList data={STATUSES.map((s) => ({ label: label(s), value: counts[s] })).filter((d) => d.value)} empty="No leads yet" />
            </Panel>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Panel title="By country"><BarList data={byCountry} /></Panel>
            <Panel title="By service"><BarList data={byService} /></Panel>
            <Panel title="By product"><BarList data={byProduct} /></Panel>
            <Panel title="By source"><BarList data={bySource} /></Panel>
          </div>
          <div>
            <h2 className="mb-3 text-sm font-semibold text-fg">Recent leads</h2>
            {recent.length ? (
              <TableWrap>
                <thead>
                  <tr>
                    {["Name", "Company", "Country", "Service", "Product", "Budget", "Status", "Date"].map((h) => (
                      <th key={h} className={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((l) => (
                    <tr key={l.id} className="hover:bg-ink-850">
                      <td className={td}><Link href={`/admin/leads/${l.id}`} className="font-medium hover:underline">{l.name}</Link></td>
                      <td className={td}>{l.company ?? "—"}</td>
                      <td className={td}>{l.country ?? "—"}</td>
                      <td className={td}>{l.service ?? "—"}</td>
                      <td className={td}>{l.product ?? "—"}</td>
                      <td className={td}>{l.budget ?? "—"}</td>
                      <td className={td}><Badge tone={LEAD_STATUS_TONE[l.status]}>{label(l.status)}</Badge></td>
                      <td className={`${td} whitespace-nowrap text-muted`}>{fmtDate(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            ) : (
              <Panel><EmptyState title="No leads yet" description="Leads from the website's inquiry forms appear here automatically." /></Panel>
            )}
          </div>
        </>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Published services" value={pubServices} href={can(user.role, "services:manage") ? "/admin/services?status=PUBLISHED" : undefined} />
        <Stat label="Published products" value={pubProducts} href={can(user.role, "products:manage") ? "/admin/products?status=PUBLISHED" : undefined} />
        <Stat label="Published posts" value={pubPosts} href={can(user.role, "blog:manage") ? "/admin/blog?status=PUBLISHED" : undefined} />
      </div>

      {activity.length > 0 && (
        <Panel title="Recent admin activity" action={<Link href="/admin/audit-logs" className="text-xs font-medium text-brand-blue hover:underline">Audit log</Link>}>
          <ul className="divide-y divide-line text-sm">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                <span><span className="font-medium text-fg">{a.user?.name ?? "System"}</span> <span className="text-muted">{a.action.replace(/[._]/g, " ")}</span>{a.entity && <span className="text-dim"> · {a.entity}</span>}</span>
                <span className="text-xs text-dim">{fmtDate(a.createdAt, true)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function HeaderStat({ label: l, value, detail, tone, href }: { label: string; value: string; detail: string; tone: "good" | "warn" | "bad" | "ai" | "neutral"; href?: string }) {
  const dot = { good: "bg-emerald-400", warn: "bg-amber-400", bad: "bg-red-500", ai: "bg-violet-400", neutral: "bg-[#56657d]" }[tone];
  const body = (
    <>
      <p className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.16em] text-[#6f86a6] uppercase">
        <span className={cn("size-1.5 rounded-full", dot, tone !== "neutral" && "os-pulse")} aria-hidden />
        {l}
      </p>
      <p className="mt-1.5 truncate text-[13.5px] font-semibold text-white">{value}</p>
      <p className="mt-0.5 truncate text-[11.5px] text-[#8b97ab]" title={detail}>{detail}</p>
    </>
  );
  const cls = "block min-w-0 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5";
  return href ? <Link href={href} className={cn(cls, "transition-colors hover:border-white/15 hover:bg-white/[0.05]")}>{body}</Link> : <div className={cls}>{body}</div>;
}
