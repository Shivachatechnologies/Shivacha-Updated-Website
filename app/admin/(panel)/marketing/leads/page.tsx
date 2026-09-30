import Link from "next/link";
import { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { hydrateVault } from "@/lib/integrations/vault";
import { enrichmentProvider, leadProviders } from "@/lib/growth/providers";
import { leadGenFunnel } from "@/lib/company/leadgen";
import { LEADGEN_MODES, parseLeadGen } from "@/lib/company/leadgen-rules";
import { REGIONS } from "@/lib/company/org";
import { saveLeadCampaignAction } from "@/lib/company/actions";
import { DataTable, Kpi, KpiGrid, StatusBadge } from "@/components/admin/os";
import { EmptyState, PageHeader, fmtDate } from "@/components/admin/ui";
import { GROWTH_CRUMB, GrowthTabs } from "@/components/admin/growth/tabs";
import { Card } from "@/components/admin/company/ui";
import { LeadCampaignForm } from "@/components/admin/company/lead-campaign-form";

export const metadata = { title: "Lead generation" };
export const dynamic = "force-dynamic";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default async function LeadGenPage() {
  const user = await requireAccess("growth:view", "GROWTH");
  await hydrateVault();
  const manage = can(user.role, "growth:manage");
  const [f, campaigns] = await Promise.all([leadGenFunnel(), db.campaign.findMany({ where: { leadGen: { not: Prisma.DbNull } }, orderBy: { createdAt: "desc" }, take: 50 })]);
  const counts = campaigns.length ? await db.prospect.groupBy({ by: ["campaignId", "status"], where: { campaignId: { in: campaigns.map((c) => c.id) } }, _count: { _all: true } }) : [];
  const count = (id: string, statuses?: string[]) => counts.filter((c) => c.campaignId === id && (!statuses || statuses.includes(c.status))).reduce((n, c) => n + c._count._all, 0);
  const providers = [leadProviders.apollo.status(), leadProviders.hunter.status(), enrichmentProvider.status()];
  const stages: [string, number, string?][] = [
    ["Discovered", f.discovered],
    ["With email", f.withEmail, pct(f.withEmail, f.discovered)],
    ["Verified", f.verified, pct(f.verified, f.withEmail)],
    ["Qualified", f.qualified, pct(f.qualified, f.discovered)],
    ["Contacted", f.contacted],
    ["Replied", f.replied, pct(f.replied, f.contacted)],
    ["CRM leads", f.converted],
    ["Meetings", f.meetings],
    ["Opportunities", f.opportunities],
    ["Won", f.won],
  ];
  return (
    <>
      <PageHeader title="Lead generation" description="Discover → enrich → verify → deduplicate → ICP score → intent → qualify → CRM → SDR → outreach → reply → meeting → opportunity, on the existing CRM. Only legitimate connected providers are used; unsubscribes, bounces and complaints are never contacted; every number below comes from records." crumbs={[GROWTH_CRUMB, { label: "Lead generation" }]} />
      <GrowthTabs active="leads" />
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {providers.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
            <span className={p.connected ? "size-1.5 rounded-full bg-emerald-500" : "size-1.5 rounded-full bg-zinc-400"} />
            {p.name}: <b className={p.connected ? "text-emerald-700" : "text-dim"}>{p.connected ? "CONNECTED" : "NOT CONNECTED"}</b>
          </span>
        ))}
        <Link href="/admin/integrations/connect" className="text-brand-blue hover:underline">Connect providers →</Link>
      </div>
      <div className="mt-4">
        <KpiGrid cols={5}>
          {stages.map(([l, v, h]) => <Kpi key={l} label={l} value={v} hint={h ? `${h} conversion` : undefined} />)}
        </KpiGrid>
        <p className="mt-2 text-xs text-dim">Duplicates avoided: {f.duplicatesAvoided} · invalid emails: {f.invalid}. Targets are goals — the pipeline never invents prospects to reach them.</p>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0 space-y-4">
          <Card title="Lead campaigns">
            {campaigns.length ? (
              <DataTable
                rows={campaigns}
                columns={[
                  { header: "Campaign", cell: (c) => <Link href={`/admin/marketing/leads/${c.id}`} className="font-medium hover:underline">{c.name}<span className="block text-xs text-dim">{c.market ?? ""}{c.regionKey ? ` · ${REGIONS.find((r) => r.key === c.regionKey)?.name}` : ""}</span></Link> },
                  { header: "Mode", cell: (c) => <StatusBadge value={parseLeadGen(c.leadGen).mode === "AUTONOMOUS" ? "AUTOMATED" : "MANUAL"} text={parseLeadGen(c.leadGen).mode.toLowerCase()} /> },
                  { header: "Daily target", cell: (c) => c.dailyLeadTarget ?? "—" },
                  { header: "Prospects", cell: (c) => count(c.id) },
                  { header: "Qualified", cell: (c) => count(c.id, ["RESEARCHED", "CONTACTED", "REPLIED", "CONVERTED"]) },
                  { header: "Last run", cell: (c) => { const r = parseLeadGen(c.leadGen).lastRun; return r ? <span className="text-xs">{fmtDate(new Date(r.at), true)}<span className="block text-dim">{r.steps.filter((s) => s.status === "NOT_CONNECTED").length ? "provider not connected" : `${r.discovered} new`}</span></span> : <span className="text-dim">never</span>; } },
                  { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
                ]}
              />
            ) : (
              <EmptyState title="No lead campaigns" description="Create one with the builder, or give the CEO Command Center a lead objective." />
            )}
          </Card>
          <Card title="Source performance">
            {f.sources.length ? (
              <DataTable rows={f.sources.map((s) => ({ id: s.source, ...s }))} columns={[{ header: "Source", cell: (s) => s.source }, { header: "Discovered", cell: (s) => s.discovered }, { header: "Qualified", cell: (s) => `${s.qualified} (${pct(s.qualified, s.discovered)})` }, { header: "Became leads", cell: (s) => s.converted }]} />
            ) : (
              <p className="text-sm text-dim">No campaign prospects yet.</p>
            )}
          </Card>
        </div>
        {manage && (
          <Card title="Campaign builder">
            <LeadCampaignForm action={saveLeadCampaignAction.bind(null, null)} modes={Object.entries(LEADGEN_MODES)} regions={REGIONS.map((r) => [r.key, r.name])} />
          </Card>
        )}
      </div>
    </>
  );
}
