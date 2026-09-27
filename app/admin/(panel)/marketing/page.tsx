import { requireAccess } from "@/lib/os/guard";
import { resolveRange } from "@/lib/os/range";
import { analyticsConnections, funnelBy, type Dimension } from "@/lib/marketing/attribution";
import { PageHeader, Panel } from "@/components/admin/ui";
import { BarList } from "@/components/admin/charts";
import { RangePicker } from "@/components/admin/range";
import { Kpi, KpiGrid, StatusBadge, Tabs, str, type SP } from "@/components/admin/os";
import { FunnelTable } from "@/components/admin/marketing/funnel-table";

export const metadata = { title: "Marketing analytics" };
const DIMS: [Dimension, string][] = [["source", "Source"], ["medium", "Medium"], ["campaign", "Campaign"], ["landing", "Landing page"]];

export default async function MarketingPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("marketing:view", "MARKETING_ANALYTICS");
  const sp = await searchParams;
  const range = resolveRange(str(sp, "range", 10) || "90d", str(sp, "from", 10), str(sp, "to", 10));
  const dim = (DIMS.find(([d]) => d === str(sp, "by", 20))?.[0] ?? "source") as Dimension;
  const rows = await funnelBy(dim, range, 25);
  const totals = rows.reduce((a, r) => ({ leads: a.leads + r.leads, qualified: a.qualified + r.qualified, proposals: a.proposals + r.proposals, won: a.won + r.won }), { leads: 0, qualified: 0, proposals: 0, won: 0 });
  const conns = analyticsConnections();
  const extra = { by: dim };
  return (
    <>
      <PageHeader title="Marketing analytics" description="Lead attribution from website UTM data through qualification, proposals and won deals. No figures are estimated." crumbs={[{ label: "Marketing" }, { label: "Analytics" }]} />
      <RangePicker active={range.key} basePath="/admin/marketing" extra={extra} from={str(sp, "from", 10)} to={str(sp, "to", 10)} />
      <KpiGrid cols={4}>
        <Kpi label="Leads" value={totals.leads} hint={range.label} />
        <Kpi label="Qualified" value={totals.qualified} hint={totals.leads ? `${Math.round((totals.qualified / totals.leads) * 100)}% of leads` : undefined} />
        <Kpi label="Proposals sent" value={totals.proposals} />
        <Kpi label="Won" value={totals.won} hint={totals.leads ? `${Math.round((totals.won / totals.leads) * 1000) / 10}% conversion` : undefined} tone="green" />
      </KpiGrid>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <Tabs active={dim} items={DIMS.map(([d, l]) => ({ key: d, label: l, href: `/admin/marketing?${new URLSearchParams({ range: range.key, by: d, ...(sp.from && { from: str(sp, "from", 10) }), ...(sp.to && { to: str(sp, "to", 10) }) })}` }))} />
          <FunnelTable rows={rows} keyLabel={DIMS.find(([d]) => d === dim)![1]} link={dim === "landing" ? (k) => (k.startsWith("/") ? k : undefined) : undefined} />
        </div>
        <div className="space-y-4">
          <Panel title="Funnel">
            <BarList data={[{ label: "Leads", value: totals.leads }, { label: "Qualified", value: totals.qualified }, { label: "Proposal", value: totals.proposals }, { label: "Won", value: totals.won }]} empty="No leads in this period" />
          </Panel>
          <Panel title="Data sources">
            <ul className="space-y-2 text-sm">
              {conns.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-2">
                  <span>{c.name}</span>
                  <StatusBadge value={c.connected ? "CONNECTED" : "NOT_CONNECTED"} text={c.connected ? "Connected" : c.tracking ? "Tracking only" : "Not connected"} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-dim">Traffic, impressions and ad spend appear only when an ad/analytics API is connected or spend is entered on a campaign. “Tracking only” means the browser tag is installed but reporting data is not pulled.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}
