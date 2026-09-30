import Link from "next/link";
import { requireAccess } from "@/lib/os/guard";
import { buildBriefing, type BriefItem, type Briefing } from "@/lib/company/briefing";
import { PageHeader, fmtDate } from "@/components/admin/ui";
import { Tabs, str, type SP } from "@/components/admin/os";
import { Card, CompanyTabs, COMPANY_CRUMB, Nature } from "@/components/admin/company/ui";

export const metadata = { title: "CEO Briefing" };
export const dynamic = "force-dynamic";

const PERIODS = [["today", "Today"], ["week", "This week"], ["month", "This month"]] as const;

function List({ items, empty }: { items: BriefItem[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-dim">{empty}</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((i, k) => (
        <li key={k}>
          {i.href ? <Link href={i.href} className="font-medium text-fg hover:underline">{i.title}</Link> : <span className="font-medium text-fg">{i.title}</span>}
          {i.detail && <span className="block text-xs text-muted">{i.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

export default async function BriefingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("executive:view", "AI_WORKFORCE");
  const sp = await searchParams;
  const period = (PERIODS.find(([k]) => k === str(sp, "p", 10))?.[0] ?? "today") as Briefing["period"];
  const b = await buildBriefing(period, user.role);
  return (
    <>
      <PageHeader title="CEO Briefing" description={`Built from live records at ${fmtDate(b.to, true)}. REAL = from records · ESTIMATED = formula over records · MANUAL = entered by a person · UNAVAILABLE = no data source. Nothing is invented.`} crumbs={[COMPANY_CRUMB, { label: "CEO Briefing" }]} />
      <CompanyTabs active="briefing" />
      <div className="mt-4"><Tabs active={period} items={PERIODS.map(([k, l]) => ({ key: k, label: l, href: `/admin/company/briefing?p=${k}` }))} /></div>
      <p className="mt-2 text-xs text-dim">Period: {fmtDate(b.from, true)} → {fmtDate(b.to, true)}</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Decisions & escalations for you"><List items={b.decisions} empty="No decisions waiting." /></Card>
        <Card title="Approvals required" href="/admin/ai/approvals"><List items={b.approvals} empty="No approvals pending." /></Card>
        <Card title="Blockers"><List items={b.blockers} empty="No blocked objectives." /></Card>
        <Card title="Completed objectives"><List items={b.completedObjectives} empty="None in this period." /></Card>
        <Card title="Delayed objectives"><List items={b.delayedObjectives} empty="None past due." /></Card>
        <Card title="Opportunities"><List items={b.opportunities} empty="No new sales-ready leads in this period." /></Card>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {b.sections.map((s) => (
          <Card key={s.key} title={s.title}>
            <ul className="divide-y divide-line">
              {s.metrics.map((m) => (
                <li key={m.label} className="flex items-start justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0 text-muted">{m.href ? <Link href={m.href} className="hover:underline">{m.label}</Link> : m.label}{m.note && <span className="block text-[11px] text-dim">{m.note}</span>}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-right font-semibold text-fg tabular-nums">{m.value} <Nature value={m.nature} /></span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
        <Card title="Risks"><List items={b.risks} empty="No high-severity risks open." /></Card>
      </div>
    </>
  );
}
