import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { DataTable, Kpi, KpiGrid, pick, type SP } from "@/components/admin/os";
import { PageHeader, Panel } from "@/components/admin/ui";
import { BarList } from "@/components/admin/charts";
import { RangeLinks } from "@/components/admin/visitors/range";

export const metadata = { title: "Attribution" };

const key = (s: string | null, m: string | null) => `${s ?? "direct"} / ${m ?? "none"}`;

export default async function AttributionPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("visitors:view");
  const days = Number(pick(await searchParams, "days", ["7", "30", "90"] as const) ?? 30);
  const since = new Date(Date.now() - days * 86_400_000);
  const sw = { startedAt: { gte: since }, visitor: { isBot: false } };
  const [channels, campaigns, landing, leads, sessions, visitors] = await Promise.all([
    db.visitorSession.groupBy({ by: ["source", "medium"], where: sw, _count: true, orderBy: { _count: { source: "desc" } }, take: 20 }),
    db.visitorSession.groupBy({ by: ["utmCampaign"], where: { ...sw, utmCampaign: { not: null } }, _count: true, orderBy: { _count: { utmCampaign: "desc" } }, take: 20 }),
    db.visitorSession.groupBy({ by: ["landingPage"], where: sw, _count: true, orderBy: { _count: { landingPage: "desc" } }, take: 20 }),
    db.visitor.findMany({ where: { leadId: { not: null }, identifiedAt: { gte: since } }, select: { id: true, firstSource: true, firstMedium: true, lastSource: true, lastMedium: true, firstPage: true, sessionsCount: true } }),
    db.visitorSession.count({ where: sw }),
    db.visitor.count({ where: { isBot: false, lastSeenAt: { gte: since } } }),
  ]);
  const tally = (f: (l: (typeof leads)[number]) => string) => [...leads.reduce((m, l) => m.set(f(l), (m.get(f(l)) ?? 0) + 1), new Map<string, number>())].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const first = tally((l) => key(l.firstSource, l.firstMedium));
  const last = tally((l) => key(l.lastSource, l.lastMedium));
  const sessionsByChannel = new Map(channels.map((c) => [key(c.source, c.medium), c._count]));
  const conv = [...new Set([...sessionsByChannel.keys(), ...first.map((f) => f.label)])].map((k, i) => ({ id: String(i), channel: k, sessions: sessionsByChannel.get(k) ?? 0, firstTouch: first.find((f) => f.label === k)?.value ?? 0, lastTouch: last.find((f) => f.label === k)?.value ?? 0 })).sort((a, b) => b.sessions - a.sessions);
  return (
    <>
      <PageHeader title="Attribution" description="Which channels bring visitors and which ones turn into CRM leads, from first-party consented visits. First touch is the channel of the visitor's first visit; last touch is the visit before they became a lead." crumbs={[{ label: "Website Intelligence" }, { label: "Attribution" }]} actions={<RangeLinks base="/admin/marketing/attribution" days={days} />} />
      <KpiGrid cols={4}>
        <Kpi label="Visitors" value={visitors} />
        <Kpi label="Sessions" value={sessions} />
        <Kpi label="Leads from tracked visitors" value={leads.length} tone={leads.length ? "green" : undefined} />
        <Kpi label="Visitor → lead rate" value={visitors ? `${((leads.length / visitors) * 100).toFixed(1)}%` : "—"} />
      </KpiGrid>
      <Panel title="Channels" className="mt-4">
        {conv.length ? <DataTable rows={conv} columns={[{ header: "Source / medium", cell: (r) => r.channel }, { header: "Sessions", cell: (r) => r.sessions }, { header: "Leads (first touch)", cell: (r) => r.firstTouch }, { header: "Leads (last touch)", cell: (r) => r.lastTouch }]} /> : <p className="text-sm text-muted">No sessions in this period.</p>}
      </Panel>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Campaigns (utm_campaign)">
          <BarList data={campaigns.map((c) => ({ label: c.utmCampaign!, value: c._count }))} empty="No tagged campaigns in this period." />
        </Panel>
        <Panel title="Landing pages">
          <BarList data={landing.map((c) => ({ label: c.landingPage ?? "—", value: c._count }))} empty="No sessions in this period." />
        </Panel>
      </div>
    </>
  );
}
