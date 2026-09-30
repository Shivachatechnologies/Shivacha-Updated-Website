import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { agentBySlug } from "@/lib/ai/catalog";
import { ensureOrganisationOnce, orgChart, type OrgNode } from "@/lib/company/organisation";
import { getCompanyProfile } from "@/lib/company/profile";
import { DEPARTMENTS, LEVEL_LABELS, LEVEL_RANK, REGIONS, type Level } from "@/lib/company/org";
import { PageHeader } from "@/components/admin/ui";
import { Kpi, KpiGrid, StatusBadge } from "@/components/admin/os";
import { CompanyTabs, COMPANY_CRUMB } from "@/components/admin/company/ui";

export const metadata = { title: "AI Organization" };
export const dynamic = "force-dynamic";

export default async function OrgPage() {
  await requireAccess("ai:view", "AI_WORKFORCE");
  await ensureOrganisationOnce();
  const [org, profile, open, depts] = await Promise.all([
    orgChart(),
    getCompanyProfile(),
    db.aITask.groupBy({ by: ["agentSlug"], where: { status: { in: ["QUEUED", "RUNNING", "WAITING", "AWAITING_APPROVAL", "PAUSED"] } }, _count: { _all: true } }),
    db.aIDepartment.findMany(),
  ]);
  const load = new Map(open.map((o) => [o.agentSlug, o._count._all]));
  const bySlug = new Map(org.map((n) => [n.slug, n]));
  const levels = (Object.keys(LEVEL_LABELS) as Level[]).map((l) => [l, org.filter((n) => n.level === l).length] as const);

  const Person = ({ n }: { n: OrgNode }) => {
    const spec = agentBySlug(n.slug);
    return (
      <li className="rounded-md border border-line bg-ink-900 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/admin/ai/employees/${n.slug}`} className="block truncate text-sm font-medium text-fg hover:underline">{n.jobTitle}</Link>
            <p className="truncate text-[11px] text-dim"><span className="font-mono">{n.code ?? "—"}</span> · {n.slug}{n.region ? ` · ${REGIONS.find((r) => r.key === n.region)?.name}` : ""}</p>
          </div>
          <StatusBadge value={n.level} text={LEVEL_LABELS[n.level as Level] ?? n.level} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <StatusBadge value={!n.enabled ? "DISABLED" : !n.available ? "PAUSED" : "ACTIVE"} text={!n.enabled ? "Disabled" : !n.available ? "Clocked out" : "Available"} />
          <StatusBadge value={n.mode} />
          <span className="text-dim">{load.get(n.slug) ?? 0} open task{load.get(n.slug) === 1 ? "" : "s"}</span>
          {n.core && <span className="rounded border border-line px-1 text-dim">original employee</span>}
        </div>
        <p className="mt-1.5 text-[11px] text-muted">Reports to: {n.manager ? (bySlug.get(n.manager)?.jobTitle ?? n.manager) : "the CEO (human)"}{n.reports.length ? ` · ${n.reports.length} direct report${n.reports.length === 1 ? "" : "s"}` : ""} · {spec?.tools.length ?? 0} tools</p>
        {spec?.limits?.length ? <p className="mt-1 text-[11px] text-amber-700">Cannot: {spec.limits.join("; ")}</p> : null}
      </li>
    );
  };

  return (
    <>
      <PageHeader title="AI Organization" description="The AI company: every AI employee, its level, department, region and manager. Delegation follows these reporting lines; permissions never exceed those of the person who started the work." crumbs={[COMPANY_CRUMB, { label: "Organization" }]} />
      <CompanyTabs active="org" />
      <div className="mt-4">
        <KpiGrid cols={6}>
          <Kpi label="AI employees" value={org.length} hint={`${org.filter((n) => n.core).length} original + ${org.filter((n) => !n.core).length} new`} />
          {levels.map(([l, c]) => <Kpi key={l} label={LEVEL_LABELS[l]} value={c} />)}
        </KpiGrid>
      </div>
      <p className="mt-3 text-sm text-muted">Human CEO → <Link href="/admin/ai/employees/ceo" className="font-medium text-fg hover:underline">{bySlug.get("ceo")?.jobTitle}</Link> → executives, regional directors and the strategy office. Template: {profile.template.toLowerCase().replace(/_/g, " ")} · {profile.departments.length} departments on.</p>
      <div className="mt-5 space-y-6">
        {DEPARTMENTS.map((d) => {
          const on = profile.departments.includes(d.key);
          const members = org.filter((n) => n.department === d.key).sort((a, b) => (LEVEL_RANK[a.level as Level] ?? 9) - (LEVEL_RANK[b.level as Level] ?? 9) || a.jobTitle.localeCompare(b.jobTitle));
          const row = depts.find((x) => x.key === d.key);
          return (
            <section key={d.key} id={d.key} className={on ? "" : "opacity-60"}>
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <h2 className="text-base font-semibold text-fg">{d.name}</h2>
                <span className="text-xs text-dim">{members.length} employees · head: {bySlug.get(d.head)?.jobTitle ?? d.head}{row?.monthlyCostLimit != null ? ` · monthly AI limit $${Number(row.monthlyCostLimit).toFixed(2)}` : ""}</span>
                {!on && <StatusBadge value="DISABLED" text="Switched off in company settings" />}
              </div>
              <p className="mb-2 text-xs text-muted">{d.description}</p>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{members.map((n) => <Person key={n.slug} n={n} />)}</ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
