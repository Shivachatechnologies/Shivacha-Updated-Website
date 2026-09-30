import Link from "next/link";
import { requireAccess } from "@/lib/os/guard";
import { companyDay } from "@/lib/company/today";
import { agentBySlug } from "@/lib/ai/catalog";
import { DataTable, Kpi, KpiGrid, StatusBadge, str, type SP } from "@/components/admin/os";
import { PageHeader, fmtDate } from "@/components/admin/ui";
import { Card, CompanyTabs, COMPANY_CRUMB } from "@/components/admin/company/ui";

export const metadata = { title: "What the AI company did today" };
export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("ai:view", "AI_WORKFORCE");
  const sp = await searchParams;
  const raw = str(sp, "d", 10);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : new Date();
  const d = await companyDay(day);
  const label = d.from.toISOString().slice(0, 10);
  const prev = new Date(d.from.getTime() - 86400_000).toISOString().slice(0, 10);
  const next = new Date(d.from.getTime() + 86400_000).toISOString().slice(0, 10);
  const totalCost = d.aiCost.reduce((a, c) => a + c.costUsd, 0);
  return (
    <>
      <PageHeader title={`What the AI company did — ${label} (UTC)`} description="Every line is a record: AI employee activity, approval decisions, audit entries for external and governed actions, metered AI cost, provider API calls, and results a provider confirmed. Nothing is summarised by AI here." crumbs={[COMPANY_CRUMB, { label: "Today" }]} actions={<span className="flex gap-3 text-sm"><Link href={`/admin/company/today?d=${prev}`} className="text-brand-blue hover:underline">← {prev}</Link><Link href={`/admin/company/today?d=${next}`} className="text-brand-blue hover:underline">{next} →</Link></span>} />
      <CompanyTabs active="today" />
      <div className="mt-4">
        <KpiGrid cols={6}>
          <Kpi label="Tasks done" value={d.counts.tasksDone} tone="green" />
          <Kpi label="Tasks failed" value={d.counts.tasksFailed} tone={d.counts.tasksFailed ? "red" : undefined} />
          <Kpi label="Approvals decided" value={d.counts.approvalsDecided} hint={`${d.counts.approvalsPending} pending now`} href="/admin/ai/approvals" />
          <Kpi label="Escalations / blockers" value={`${d.counts.escalations} / ${d.counts.blockers}`} />
          <Kpi label="AI cost" value={`$${totalCost.toFixed(2)}`} hint="Metered per model call" href="/admin/ai/costs" />
          <Kpi label="Provider API calls" value={d.providerCalls.reduce((a, c) => a + c.calls, 0)} hint={`${d.providerCalls.reduce((a, c) => a + c.errors, 0)} errors`} />
        </KpiGrid>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card title="Confirmed by providers">
          <ul className="space-y-1 text-sm">
            <li>Posts published with a platform ID: <b>{d.confirmed.postsPublished}</b></li>
            <li>Sequence emails accepted by the mail server: <b>{d.confirmed.emailsSent}</b></li>
            <li>Prospects returned by lead providers: <b>{d.confirmed.prospectsDiscovered}</b></li>
            <li>Ad campaigns created at a provider (paused): <b>{d.confirmed.adCampaignsCreated}</b></li>
            <li>Ad campaigns launched: <b>{d.confirmed.adCampaignsLaunched}</b></li>
          </ul>
        </Card>
        <Card title="AI cost by employee">
          {d.aiCost.length ? <ul className="space-y-1 text-sm">{d.aiCost.slice(0, 12).map((c) => <li key={c.agentSlug} className="flex justify-between gap-2"><span className="truncate">{agentBySlug(c.agentSlug)?.name ?? c.agentSlug}</span><span className="tabular-nums">${c.costUsd.toFixed(4)} · {c.calls} calls</span></li>)}</ul> : <p className="text-sm text-dim">No model calls.</p>}
        </Card>
        <Card title="Provider API calls">
          {d.providerCalls.length ? <ul className="space-y-1 text-sm">{d.providerCalls.map((c) => <li key={c.provider} className="flex justify-between gap-2"><span>{c.provider}</span><span className="tabular-nums">{c.calls} calls · {c.errors} errors{c.coolUntil && c.coolUntil > d.from ? ` · rate-limited until ${c.coolUntil.toISOString().slice(11, 16)}` : ""}</span></li>)}</ul> : <p className="text-sm text-dim">No provider calls.</p>}
        </Card>
      </div>
      <div className="mt-5">
        <Card title={`Timeline (${d.events.length})`}>
          <DataTable
            rows={d.events.map((e, i) => ({ id: String(i), ...e }))}
            columns={[
              { header: "Time", cell: (e) => <span className="text-xs tabular-nums">{fmtDate(e.at, true)}</span> },
              { header: "Source", cell: (e) => <StatusBadge value={e.source === "AI" ? "IN_PROGRESS" : e.source === "APPROVAL" ? "PENDING" : "DONE"} text={e.source.toLowerCase()} /> },
              { header: "Who", cell: (e) => <span className="text-xs">{e.employee ?? e.actor ?? "—"}{e.department ? <span className="block text-dim">{e.department}</span> : null}</span> },
              { header: "Action", cell: (e) => <span className="font-mono text-xs">{e.action}{e.provider ? <span className="block text-dim">{e.provider}</span> : null}</span> },
              { header: "Result", cell: (e) => <span className="line-clamp-2 max-w-xl text-xs">{e.result}{e.externalId ? ` · external ID ${e.externalId}` : ""}</span> },
              { header: "Links", cell: (e) => <span className="text-xs">{e.objectiveId ? <Link href={`/admin/company/objectives/${e.objectiveId}`} className="text-brand-blue hover:underline">objective</Link> : null} {e.taskId ? <Link href={`/admin/ai/tasks/${e.taskId}`} className="text-brand-blue hover:underline">task</Link> : null}</span> },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
