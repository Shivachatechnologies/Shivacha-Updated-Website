import Link from "next/link";
import { requireAccess } from "@/lib/os/guard";
import { agentBySlug } from "@/lib/ai/catalog";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { departmentPerformance, regionalPerformance, stuckTasks, workforcePerformance, workforceTrend } from "@/lib/company/analytics";
import { parseMeasurement } from "@/lib/company/measure";
import { orgChart } from "@/lib/company/organisation";
import { DEPARTMENTS, LEVEL_RANK, type Level } from "@/lib/company/org";
import { PageHeader } from "@/components/admin/ui";
import { DataTable, Kpi, KpiGrid, Tabs, str, type SP } from "@/components/admin/os";
import { Card, CompanyTabs, COMPANY_CRUMB, Meter, Nature } from "@/components/admin/company/ui";

export const metadata = { title: "AI workforce performance" };
export const dynamic = "force-dynamic";

const RANGES = [["7", "7 days"], ["30", "30 days"], ["90", "90 days"]] as const;
const dash = (v: number | null, suffix = "") => (v == null ? "—" : `${v}${suffix}`);

export default async function PerformancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const sp = await searchParams;
  const days = Number(RANGES.find(([k]) => k === str(sp, "d", 3))?.[0] ?? 30);
  const [stats, org, trend, stuck, objectives, regions] = await Promise.all([
    workforcePerformance(days),
    orgChart(),
    workforceTrend(14),
    stuckTasks(25),
    db.aIObjective.findMany({ where: { status: { in: ["ACTIVE", "BLOCKED", "PLANNING"] }, targetMetric: { not: null } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, title: true, status: true, metrics: true, nextAction: true } }),
    regionalPerformance(days, { deals: can(user.role, "deals:view") }),
  ]);
  const peak = Math.max(1, ...trend.map((t) => t.done + t.failed));
  const depts = await departmentPerformance(stats);
  const node = new Map(org.map((n) => [n.slug, n]));
  const rows = stats.map((s) => ({ id: s.slug, ...s, level: node.get(s.slug)?.level ?? "SPECIALIST", title: node.get(s.slug)?.jobTitle ?? s.slug })).sort((a, b) => (LEVEL_RANK[a.level as Level] ?? 9) - (LEVEL_RANK[b.level as Level] ?? 9) || b.done - a.done);
  const total = stats.reduce((a, s) => ({ done: a.done + s.done, failed: a.failed + s.failed, esc: a.esc + s.escalations, cost: a.cost + s.costUsd }), { done: 0, failed: 0, esc: 0, cost: 0 });
  const execs = rows.filter((r) => r.level === "EXECUTIVE" || r.level === "CHIEF_OF_STAFF");
  return (
    <>
      <PageHeader title="Workforce performance" description="Computed from AI task records, AI-to-AI escalations and metered AI usage. Employees without finished work show “—”, never an invented score." crumbs={[COMPANY_CRUMB, { label: "Performance" }]} />
      <CompanyTabs active="performance" />
      <div className="mt-4"><Tabs active={String(days)} items={RANGES.map(([k, l]) => ({ key: k, label: l, href: `/admin/company/performance?d=${k}` }))} /></div>
      <div className="mt-4">
        <KpiGrid cols={4}>
          <Kpi label="Tasks completed" value={total.done} tone="green" />
          <Kpi label="Tasks failed" value={total.failed} tone={total.failed ? "red" : undefined} />
          <Kpi label="Escalations" value={total.esc} />
          <Kpi label="AI cost" value={`$${total.cost.toFixed(2)}`} />
        </KpiGrid>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Departments">
          <DataTable
            rows={depts.map((d) => ({ id: d.key, ...d }))}
            columns={[
              { header: "Department", cell: (d) => <Link href={`/admin/company/org#${d.key}`} className="hover:underline">{DEPARTMENTS.find((x) => x.key === d.key)?.name ?? d.key}</Link> },
              { header: "Team", cell: (d) => d.employees },
              { header: "Done", cell: (d) => d.done },
              { header: "Failed", cell: (d) => d.failed },
              { header: "Open", cell: (d) => d.open },
              { header: "Blocked/waiting", cell: (d) => d.waiting },
              { header: "Overdue", cell: (d) => d.overdue },
              { header: "Cost", cell: (d) => `$${d.costUsd.toFixed(2)}` },
            ]}
          />
        </Card>
        <Card title="Executives">
          <DataTable
            rows={execs}
            columns={[
              { header: "Executive", cell: (r) => <Link href={`/admin/ai/employees/${r.slug}`} className="hover:underline">{r.title}</Link> },
              { header: "Done", cell: (r) => r.done },
              { header: "Escalations", cell: (r) => r.escalations },
              { header: "Team open work", cell: (r) => depts.find((d) => d.key === r.department)?.open ?? 0 },
              { header: "Cost", cell: (r) => `$${r.costUsd.toFixed(2)}` },
            ]}
          />
        </Card>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Last 14 days: finished tasks">
          <div className="flex h-28 items-end gap-1" role="img" aria-label="Tasks finished per day over the last 14 days">
            {trend.map((t) => (
              <div key={t.day} className="flex h-full flex-1 flex-col justify-end gap-px" title={`${t.day}: ${t.done} done, ${t.failed} failed, $${t.costUsd.toFixed(2)} AI cost`}>
                {t.failed > 0 && <div className="rounded-t-sm bg-red-500" style={{ height: `${(t.failed / peak) * 100}%` }} />}
                <div className={t.failed ? "bg-emerald-500" : "rounded-t-sm bg-emerald-500"} style={{ height: `${(t.done / peak) * 100}%`, minHeight: t.done ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-dim"><span>{trend[0]?.day}</span><span>{trend.at(-1)?.day}</span></div>
          <p className="mt-2 text-xs text-dim"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-500" />done <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-sm bg-red-500" />failed · {trend.reduce((a, t) => a + t.done, 0)} done, {trend.reduce((a, t) => a + t.failed, 0)} failed, ${trend.reduce((a, t) => a + t.costUsd, 0).toFixed(2)} metered cost</p>
        </Card>
        <Card title={`Stuck or blocked work (${stuck.length})`}>
          {stuck.length ? (
            <DataTable
              rows={stuck}
              columns={[
                { header: "Task", cell: (t) => <Link href={`/admin/ai/tasks/${t.id}`} className="hover:underline">{t.title}</Link> },
                { header: "Owner", cell: (t) => agentBySlug(t.agentSlug)?.name.replace(/^AI\s+/, "") ?? t.agentSlug },
                { header: "Why", cell: (t) => <span className="text-xs">{t.reason}{t.overdue ? " · overdue" : ""}</span> },
                { header: "Idle", cell: (t) => `${t.hours}h` },
              ]}
            />
          ) : <p className="text-sm text-dim">Nothing is stuck.</p>}
        </Card>
        <Card title="Objective KPIs (measured from records)">
          {objectives.length ? (
            <ul className="space-y-3 text-sm">
              {objectives.map((o) => {
                const m = parseMeasurement(o.metrics);
                const pct = m?.actual != null && m.target ? Math.round((m.actual / m.target) * 100) : null;
                return (
                  <li key={o.id}>
                    <div className="flex items-center justify-between gap-2"><Link href={`/admin/company/objectives/${o.id}`} className="truncate font-medium hover:underline">{o.title}</Link><span className="shrink-0 text-xs">{m?.actual != null ? `${m.actual} / ${m.target ?? "—"}` : <Nature value="UNAVAILABLE" />}</span></div>
                    {pct != null && <div className="mt-1"><Meter pct={pct} tone={pct >= 100 ? "green" : pct >= 50 ? "blue" : "amber"} /></div>}
                    {o.nextAction && <p className="mt-1 text-xs text-dim">Next: {o.nextAction}</p>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-dim">No open objective has a measurable target.</p>}
        </Card>
        <Card title={`Regions (${days} days)`}>
          <DataTable
            rows={[...regions.rows, regions.unassigned].map((r) => ({ id: r.key, ...r }))}
            columns={[
              { header: "Region", cell: (r) => r.name },
              { header: "Leads", cell: (r) => r.leads },
              { header: "Qualified", cell: (r) => r.qualified },
              { header: "Prospects", cell: (r) => r.prospects },
              ...(can(user.role, "deals:view") ? [{ header: "Won deals", cell: (r: (typeof regions.rows)[number]) => r.wonDeals }] : []),
            ]}
          />
        </Card>
      </div>
      <div className="mt-5">
        <Card title="Every AI employee">
          <DataTable
            rows={rows}
            columns={[
              { header: "Employee", cell: (r) => <Link href={`/admin/ai/employees/${r.slug}`} className="hover:underline">{r.title}<span className="block text-[11px] text-dim">{agentBySlug(r.slug)?.name}</span></Link> },
              { header: "Done", cell: (r) => r.done },
              { header: "Failed", cell: (r) => r.failed },
              { header: "Success", cell: (r) => dash(r.successRate, "%") },
              { header: "Avg time", cell: (r) => dash(r.avgMinutes, " min") },
              { header: "Workload", cell: (r) => r.open },
              { header: "Escalations", cell: (r) => r.escalations },
              { header: "Cost", cell: (r) => `$${r.costUsd.toFixed(2)}` },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
