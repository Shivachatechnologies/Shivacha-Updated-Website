import { fmtMulti } from "@/lib/os/money";
import type { dealMetrics } from "@/lib/sales/deals";
import { Kpi, KpiGrid } from "@/components/admin/os";

export function DealMetrics({ m }: { m: Awaited<ReturnType<typeof dealMetrics>> }) {
  return (
    <KpiGrid cols={6}>
      <Kpi label="Pipeline value" value={fmtMulti(m.pipeline, true)} hint={`${m.openCount} open deals`} />
      <Kpi label="Weighted pipeline" value={fmtMulti(m.weighted, true)} hint="Value × probability" />
      <Kpi label="Won revenue" value={fmtMulti(m.won, true)} hint={`${m.wonCount} won`} tone="green" />
      <Kpi label="Lost value" value={fmtMulti(m.lost, true)} hint={`${m.lostCount} lost`} />
      <Kpi label="Avg deal size" value={m.avgDeal.length ? fmtMulti(m.avgDeal, true) : "—"} hint="Won deals" />
      <Kpi label="Win rate" value={m.winRate == null ? "—" : `${m.winRate}%`} hint={m.salesCycleDays == null ? "No closed deals yet" : `Avg cycle ${m.salesCycleDays} days`} />
    </KpiGrid>
  );
}
