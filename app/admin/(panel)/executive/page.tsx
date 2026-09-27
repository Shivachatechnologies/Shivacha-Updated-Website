import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { fmtMoney, fmtMulti } from "@/lib/os/money";
import { resolveRange } from "@/lib/os/range";
import { financeSummary, monthlyRevenue } from "@/lib/finance/core";
import { dealMetrics } from "@/lib/sales/deals";
import { funnelBy } from "@/lib/marketing/attribution";
import { latestBriefing } from "@/lib/ai/briefing";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { BarList, ColumnChart } from "@/components/admin/charts";
import { RangePicker } from "@/components/admin/range";
import { Kpi, KpiGrid, LinkCell, DataTable, StatusBadge, str, type SP } from "@/components/admin/os";
import { Markdown } from "@/components/admin/ai/markdown";

export const metadata = { title: "Executive dashboard" };

/** CEO view: every number comes from live records for the selected range; currencies are never mixed. */
export default async function ExecutiveDashboard({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("executive:view");
  const sp = await searchParams;
  const range = resolveRange(str(sp, "range", 10) || "30d", str(sp, "from", 10), str(sp, "to", 10));
  const from = range.from ?? new Date("2000-01-01T00:00:00Z");
  const to = range.to ?? new Date("2999-01-01T00:00:00Z");
  const now = new Date();
  const [fin, deals, monthly, leads, qualified, funnel, topDeals, projects, redProjects, tickets, breached, risks, briefing, aiCost, approvals] = await Promise.all([
    financeSummary(range),
    dealMetrics(range),
    monthlyRevenue(12),
    db.lead.count({ where: { archivedAt: null, createdAt: { gte: from, lte: to } } }),
    db.lead.count({ where: { archivedAt: null, createdAt: { gte: from, lte: to }, OR: [{ status: { in: ["QUALIFIED", "MEETING", "PROPOSAL_SENT", "NEGOTIATION", "WON"] } }, { lifecycleStage: { in: ["SQL", "OPPORTUNITY", "CUSTOMER"] } }] } }),
    funnelBy("source", range, 8),
    db.deal.findMany({ where: { deletedAt: null, stage: { notIn: ["WON", "LOST"] } }, orderBy: { value: "desc" }, take: 8, select: { id: true, number: true, name: true, stage: true, value: true, currency: true, probability: true, expectedCloseDate: true, owner: { select: { name: true } } } }),
    db.project.groupBy({ by: ["status"], where: { deletedAt: null }, _count: true }),
    db.project.count({ where: { deletedAt: null, status: { in: ["ACTIVE", "PLANNED"] }, OR: [{ health: "RED" }, { targetDate: { lt: now } }] } }),
    db.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] } } }),
    db.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] }, resolutionDueAt: { lt: now } } }),
    db.aIRecommendation.findMany({ where: { status: "OPEN", severity: { in: ["CRITICAL", "HIGH"] } }, orderBy: [{ severity: "desc" }, { updatedAt: "desc" }], take: 8 }),
    latestBriefing(),
    db.aIUsage.aggregate({ where: { createdAt: { gte: from, lte: to } }, _sum: { costUsd: true } }),
    db.aIApproval.count({ where: { status: "PENDING" } }),
  ]);
  const mainCur = fin.collected[0]?.currency ?? deals.pipeline[0]?.currency ?? "USD";
  const series = monthly.buckets.map((m) => ({ label: m.slice(2), value: monthly.rows.filter((r) => r.month === m && r.currency === mainCur).reduce((s, r) => s + r.amount, 0) }));
  const active = projects.find((p) => p.status === "ACTIVE")?._count ?? 0;
  const bText = (briefing?.result as { text?: string } | null)?.text;
  return (
    <>
      <PageHeader title="Executive dashboard" description="Company performance from live records. Revenue counts confirmed payments only; amounts are shown per currency and never converted." crumbs={[{ label: "Executive" }]} actions={<Link href="/admin/reports" className="btn-secondary h-9 px-3 text-[13px]">Reports</Link>} />
      <RangePicker active={range.key} basePath="/admin/executive" from={str(sp, "from", 10)} to={str(sp, "to", 10)} />
      <KpiGrid cols={6}>
        <Kpi label="Revenue collected" value={fmtMulti(fin.collected, true)} hint={range.label} tone="green" href="/admin/finance" />
        <Kpi label="Won deals" value={fmtMulti(deals.won, true)} hint={`${deals.wonCount} won${deals.winRate != null ? ` · ${deals.winRate}% win rate` : ""}`} href="/admin/deals?stage=WON" />
        <Kpi label="Open pipeline" value={fmtMulti(deals.pipeline, true)} hint={`${deals.openCount} deals · weighted ${fmtMulti(deals.weighted, true)}`} href="/admin/crm/pipeline" />
        <Kpi label="New leads" value={leads} hint={`${qualified} qualified${leads ? ` (${Math.round((qualified / leads) * 100)}%)` : ""}`} href="/admin/leads" />
        <Kpi label="Outstanding" value={fmtMulti(fin.outstanding, true)} hint={`${fin.overdueCount} overdue · ${fmtMulti(fin.overdue, true)}`} tone={fin.overdueCount ? "red" : undefined} href="/admin/finance/invoices?status=OVERDUE" />
        <Kpi label="Avg sales cycle" value={deals.salesCycleDays != null ? `${deals.salesCycleDays} d` : "—"} hint={`Avg deal ${fmtMulti(deals.avgDeal, true)}`} />
        <Kpi label="Active projects" value={active} hint={`${redProjects} at risk`} tone={redProjects ? "amber" : undefined} href="/admin/projects" />
        <Kpi label="Open tickets" value={tickets} hint={`${breached} past SLA`} tone={breached ? "red" : undefined} href="/admin/support" />
        <Kpi label="Payments to confirm" value={fin.pendingPayments} tone={fin.pendingPayments ? "amber" : undefined} href="/admin/finance/payments?status=PENDING" />
        <Kpi label="Expenses" value={fmtMulti(fin.expenses, true)} hint={range.label} href="/admin/finance/expenses" />
        <Kpi label="AI approvals" value={approvals} tone={approvals ? "amber" : undefined} href="/admin/ai/approvals" />
        <Kpi label="AI spend" value={`$${Number(aiCost._sum.costUsd ?? 0).toFixed(2)}`} hint={range.label} href="/admin/ai/costs" />
      </KpiGrid>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title={`Collected per month (${mainCur}, 12 months)`}><ColumnChart data={series} label={`Monthly revenue ${mainCur}`} format={(n) => fmtMoney(n, mainCur, { compact: true })} empty="No confirmed payments yet" /></Panel>
        <Panel title="Top risks" action={<Link href="/admin/ai/insights" className="text-xs text-brand-blue hover:underline">All insights</Link>}>
          {risks.length === 0 ? <p className="text-sm text-muted">No high-severity risks open.</p> : <ul className="space-y-2 text-sm">{risks.map((r) => <li key={r.id}><StatusBadge value={r.severity} /> {r.href ? <Link href={r.href} className="hover:underline">{r.title}</Link> : r.title}</li>)}</ul>}
        </Panel>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Largest open deals">
          {topDeals.length === 0 ? <p className="text-sm text-muted">No open deals.</p> : <DataTable rows={topDeals} columns={[{ header: "Deal", cell: (d) => <LinkCell href={`/admin/deals/${d.id}`} sub={d.owner?.name ?? "Unassigned"}>{d.number} · {d.name}</LinkCell> }, { header: "Stage", cell: (d) => <StatusBadge value={d.stage} /> }, { header: "Value", cell: (d) => <span className="tabular-nums">{fmtMoney(d.value, d.currency)}</span> }, { header: "Close", cell: (d) => <span className="text-muted">{fmtDate(d.expectedCloseDate)}</span> }]} />}
        </Panel>
        <Panel title={`Leads by source (${range.label})`}><BarList data={funnel.map((f) => ({ label: `${f.key} · ${f.won} won`, value: f.leads }))} empty="No leads in this period" /></Panel>
      </div>
      <Panel title="Daily CEO briefing" className="mt-4" action={<Link href="/admin/ai#briefing" className="text-xs text-brand-blue hover:underline">Command center</Link>}>
        {bText ? <><Markdown text={bText} /><p className="mt-2 text-[11.5px] text-dim">Generated {fmtDate(briefing!.startedAt, true)}</p></> : <p className="text-sm text-muted">No briefing yet — it is generated daily by the scheduler.</p>}
      </Panel>
    </>
  );
}
