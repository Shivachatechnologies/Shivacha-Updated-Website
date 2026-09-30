import Link from "next/link";
import { requireAccess } from "@/lib/os/guard";
import { agentBySlug } from "@/lib/ai/catalog";
import { departmentPerformance, workforcePerformance } from "@/lib/company/analytics";
import { orgChart } from "@/lib/company/organisation";
import { DEPARTMENTS, LEVEL_RANK, type Level } from "@/lib/company/org";
import { PageHeader } from "@/components/admin/ui";
import { DataTable, Kpi, KpiGrid, Tabs, str, type SP } from "@/components/admin/os";
import { Card, CompanyTabs, COMPANY_CRUMB } from "@/components/admin/company/ui";

export const metadata = { title: "AI workforce performance" };
export const dynamic = "force-dynamic";

const RANGES = [["7", "7 days"], ["30", "30 days"], ["90", "90 days"]] as const;
const dash = (v: number | null, suffix = "") => (v == null ? "—" : `${v}${suffix}`);

export default async function PerformancePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("ai:view", "AI_WORKFORCE");
  const sp = await searchParams;
  const days = Number(RANGES.find(([k]) => k === str(sp, "d", 3))?.[0] ?? 30);
  const [stats, org] = await Promise.all([workforcePerformance(days), orgChart()]);
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
