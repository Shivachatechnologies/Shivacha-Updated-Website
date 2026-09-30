import Link from "next/link";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { dealRisks, leadPriorities, nextBestActions, salesForecast } from "@/lib/company/sales";
import { agentBySlug } from "@/lib/ai/catalog";
import { fmtMoney } from "@/lib/os/money";
import { DataTable, StatusBadge } from "@/components/admin/os";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { Card, CompanyTabs, COMPANY_CRUMB, Nature } from "@/components/admin/company/ui";

export const metadata = { title: "Sales autonomy" };
export const dynamic = "force-dynamic";

export default async function SalesAutonomyPage() {
  const user = await requireAccess("leads:view", "AI_WORKFORCE");
  const deals = can(user.role, "deals:view");
  const [prio, nba, risks, forecast] = await Promise.all([leadPriorities(20), deals ? nextBestActions(30) : Promise.resolve([]), deals ? dealRisks(20) : Promise.resolve([]), deals ? salesForecast() : Promise.resolve(null)]);
  return (
    <>
      <PageHeader title="Sales autonomy" description="What the AI sales team works from: lead priorities, next best actions, deal risk and the pipeline forecast — all computed from live CRM records. Outreach, proposals and follow-ups are prepared by AI employees and follow the approval policy for anything sent to a customer." crumbs={[COMPANY_CRUMB, { label: "Sales" }]} />
      <CompanyTabs active="sales" />
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Lead priorities">
          {prio.length ? <DataTable rows={prio} columns={[{ header: "Lead", cell: (l) => <Link className="font-medium hover:underline" href={l.href}>{l.name}<span className="block text-xs text-dim">{l.company ?? ""}</span></Link> }, { header: "Score", cell: (l) => l.score }, { header: "Why", cell: (l) => <span className="text-xs text-muted">{l.reasons.join(" · ") || "—"}</span> }]} /> : <EmptyState title="No open leads" />}
        </Card>
        {deals && (
          <Card title="Next best actions">
            {nba.length ? <ul className="space-y-2 text-sm">{nba.map((a, i) => <li key={i}><StatusBadge value={a.kind === "CLOSE_DATE" || a.kind === "REENGAGE" ? "HIGH" : "MEDIUM"} text={a.kind.toLowerCase().replace("_", " ")} /> <Link className="font-medium hover:underline" href={a.href}>{a.title}</Link><span className="block text-xs text-muted">{a.why} · owner: {agentBySlug(a.owner)?.name.replace(/^AI\s+/, "") ?? a.owner}</span></li>)}</ul> : <p className="text-sm text-dim">Nothing pending.</p>}
          </Card>
        )}
        {deals && (
          <Card title="Deal risk">
            {risks.length ? <DataTable rows={risks} columns={[{ header: "Deal", cell: (d) => <Link className="hover:underline" href={d.href}>{d.number} {d.name}</Link> }, { header: "Stage", cell: (d) => <StatusBadge value={d.stage} /> }, { header: "Value", cell: (d) => fmtMoney(String(d.value), d.currency) }, { header: "Risk", cell: (d) => <span className={d.risk >= 50 ? "font-semibold text-red-700" : "text-amber-700"}>{d.risk}</span> }, { header: "Signals", cell: (d) => <span className="text-xs text-muted">{d.signals.join(" · ")}</span> }]} /> : <p className="text-sm text-dim">No open deal shows a risk signal.</p>}
          </Card>
        )}
        {forecast && (
          <Card title="Pipeline forecast">
            {forecast.rows.length ? <DataTable rows={forecast.rows.map((r, i) => ({ id: String(i), ...r }))} columns={[{ header: "Close month", cell: (r) => r.month }, { header: "Deals", cell: (r) => r.deals }, { header: "Pipeline", cell: (r) => fmtMoney(String(r.pipeline), r.currency) }, { header: "Weighted", cell: (r) => <span className="flex items-center gap-1.5">{fmtMoney(String(r.weighted), r.currency)} <Nature value="ESTIMATED" /></span> }]} /> : <p className="text-sm text-dim">No open deals.</p>}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-dim">12-month win rate: {forecast.winRate == null ? "—" : `${forecast.winRate}% of ${forecast.closed} closed deals`} <Nature value={forecast.winRate == null ? "UNAVAILABLE" : "REAL"} /></p>
          </Card>
        )}
      </div>
    </>
  );
}
