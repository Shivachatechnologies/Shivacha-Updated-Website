import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { resolveRange } from "@/lib/os/range";
import { fmtMulti } from "@/lib/os/money";
import { getCatalog } from "@/lib/sales/catalog";
import { getGrowthSettings } from "@/lib/growth/settings";
import { getIcp } from "@/lib/growth/engine";
import { attributionBy, growthSnapshot } from "@/lib/growth/snapshot";
import { ATTRIBUTION_MODELS, type AttributionModel } from "@/lib/growth/attribution";
import { TIER_LABELS } from "@/lib/growth/qualify";
import { qualifyNowAction, saveIcpAction } from "@/lib/growth/actions";
import { DataTable, Kpi, KpiGrid, StatusBadge, Tabs, TextArea, TextField, str, type SP } from "@/components/admin/os";
import { EmptyState, PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { BarList } from "@/components/admin/charts";
import { RangePicker } from "@/components/admin/range";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { GROWTH_CRUMB, GrowthTabs } from "@/components/admin/growth/tabs";

export const metadata = { title: "Growth dashboard" };
export const dynamic = "force-dynamic";

const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US"));
const m = (v: { currency: string; amount: number }[]) => (v.length ? fmtMulti(v.map((x) => ({ currency: x.currency, amount: String(x.amount) }))) : "—");
const unit = (v: { currency: string; value: number } | null) => (v ? fmtMulti([{ currency: v.currency, amount: String(v.value) }]) : "—");

export default async function GrowthDashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("growth:view", "GROWTH");
  const sp = await searchParams;
  const range = resolveRange(str(sp, "range", 10) || "30d", str(sp, "from", 10), str(sp, "to", 10));
  const model = ((Object.keys(ATTRIBUTION_MODELS) as AttributionModel[]).find((k) => k === str(sp, "model", 20)) ?? "first") as AttributionModel;
  const from = range.from ?? new Date("2000-01-01T00:00:00Z");
  const to = range.to ?? new Date();
  const s = await getGrowthSettings();
  const [g, credit, icp, salesReady] = await Promise.all([
    growthSnapshot({ from, to }, s.dailyQualifiedLeadTarget),
    attributionBy(model, { from, to }),
    getIcp(),
    can(user.role, "leads:view") ? db.lead.findMany({ where: { archivedAt: null, mergedIntoId: null, growthTier: { in: ["SALES_READY", "QUALIFIED"] }, qualifiedAt: { gte: from, lte: to } }, orderBy: [{ growthScore: "desc" }, { qualifiedAt: "desc" }], take: 15, select: { id: true, name: true, company: true, country: true, growthTier: true, growthScore: true, qualifiedAt: true, status: true, qualifications: { orderBy: { createdAt: "desc" }, take: 1, select: { reason: true } } } }) : Promise.resolve([]),
  ]);
  const manage = can(user.role, "growth:manage");
  const pct = g.target > 0 ? Math.round((g.qualifiedToday / g.target) * 100) : null;
  return (
    <>
      <PageHeader title="Growth dashboard" description="The growth funnel from real records: website visitors and social followers through qualified leads, meetings, deals and revenue. Nothing is estimated — missing data shows as —." crumbs={[GROWTH_CRUMB, { label: "Dashboard" }]} />
      <GrowthTabs active="growth" />
      <div className="mt-4">
        <RangePicker active={range.key} basePath="/admin/marketing/growth" extra={{ model }} from={str(sp, "from", 10)} to={str(sp, "to", 10)} />
      </div>
      <KpiGrid cols={6}>
        <Kpi label="Visitors" value={n(g.visitors)} hint={range.label} />
        <Kpi label="Followers" value={n(g.followers.total)} hint={g.followers.change != null ? `${g.followers.change >= 0 ? "+" : ""}${g.followers.change} in range` : "Connect or enter social data"} href="/admin/marketing/social" />
        <Kpi label="Leads" value={n(g.leads)} />
        <Kpi label="Qualified" value={n(g.qualified)} hint={g.leads ? `${Math.round((g.qualified / g.leads) * 100)}% of leads` : undefined} />
        <Kpi label="Sales-ready" value={n(g.salesReady)} tone={g.salesReady ? "green" : undefined} />
        <Kpi label="Meetings" value={n(g.meetings)} />
        <Kpi label="Opportunities" value={n(g.opportunities)} />
        <Kpi label="Proposals" value={n(g.proposals)} />
        <Kpi label="Deals won" value={n(g.deals)} tone={g.deals ? "green" : undefined} />
        <Kpi label="Revenue" value={m(g.revenue)} />
        <Kpi label="Ad spend" value={m(g.spend)} hint="From campaign metrics" />
        <Kpi label="ROAS" value={g.roas == null ? "—" : `${g.roas}×`} hint={g.roas == null ? "Needs spend and revenue in one currency" : undefined} />
      </KpiGrid>
      <div className="mt-2.5">
        <KpiGrid cols={4}>
          <Kpi label="Cost per lead" value={unit(g.cpl)} />
          <Kpi label="Cost per qualified lead" value={unit(g.costPerQualified)} />
          <Kpi label="Cost per meeting" value={unit(g.costPerMeeting)} />
          <Kpi label="Qualified today vs target" value={`${g.qualifiedToday} / ${g.target}`} hint={pct != null ? `${pct}% of a configurable target — not a guarantee` : undefined} tone={pct != null && pct >= 100 ? "green" : undefined} />
        </KpiGrid>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 space-y-4">
          <Panel title="Qualification tiers (leads created in range)">
            <BarList data={g.leads === 0 ? [] : [{ label: TIER_LABELS.SALES_READY, value: g.salesReady }, { label: TIER_LABELS.QUALIFIED, value: g.qualified - g.salesReady }, { label: TIER_LABELS.NURTURE, value: g.nurture }, { label: TIER_LABELS.LOW_FIT, value: g.lowFit }, { label: "Not scored yet", value: Math.max(0, g.leads - g.qualified - g.nurture - g.lowFit) }]} empty="No leads in this period" />
            {manage && (
              <ActionForm action={qualifyNowAction.bind(null, null)} className="mt-3">
                <SubmitButton variant="secondary">Score unscored leads now</SubmitButton>
              </ActionForm>
            )}
          </Panel>
          <Panel title="Qualified-lead attribution">
            <Tabs active={model} items={(Object.keys(ATTRIBUTION_MODELS) as AttributionModel[]).map((k) => ({ key: k, label: ATTRIBUTION_MODELS[k], href: `/admin/marketing/growth?${new URLSearchParams({ range: range.key, model: k })}` }))} />
            <div className="mt-3">
              <BarList data={credit.map((c) => ({ label: c.channel.replace(/_/g, " ").toLowerCase(), value: c.credit }))} empty="No qualified leads in this period" />
            </div>
            <p className="mt-2 text-xs text-dim">Credit is split only across recorded touches; leads without touches are credited to their captured UTM source.</p>
          </Panel>
          <Panel title="Qualified & sales-ready leads" bodyClassName="p-0">
            {salesReady.length ? (
              <DataTable
                rows={salesReady}
                columns={[
                  { header: "Lead", cell: (l) => <Link className="font-medium text-fg hover:underline" href={`/admin/leads/${l.id}`}>{l.name}</Link> },
                  { header: "Company", cell: (l) => l.company ?? "—" },
                  { header: "Tier", cell: (l) => <StatusBadge value={l.growthTier} text={`${TIER_LABELS[l.growthTier as keyof typeof TIER_LABELS]} · ${l.growthScore}`} /> },
                  { header: "Why", cell: (l) => <span className="line-clamp-2 text-xs text-muted">{l.qualifications[0]?.reason ?? "—"}</span> },
                  { header: "Qualified", cell: (l) => fmtDate(l.qualifiedAt) },
                ]}
              />
            ) : (
              <div className="p-4"><EmptyState title="No qualified leads in this period" description="Leads are scored automatically by the daily loop, or use “Score unscored leads now”." /></div>
            )}
          </Panel>
        </div>
        <div className="min-w-0 space-y-4">
          <Panel title="Followers by platform">
            <ul className="space-y-1.5 text-sm">
              {g.followers.platforms.map((p) => (
                <li key={p.platform} className="flex justify-between gap-2"><span>{p.platform}</span><span className="tabular-nums text-muted">{p.followers == null ? "no data" : `${n(p.followers)}${p.change != null ? ` (${p.change >= 0 ? "+" : ""}${p.change})` : ""}`}</span></li>
              ))}
            </ul>
          </Panel>
          <Panel title="Ideal customer profile">
            {manage ? (
              <ActionForm action={saveIcpAction} className="space-y-3">
                <TextArea name="countries" label="Target countries (ISO code or name, one per line)" rows={3} defaultValue={(icp.countries ?? []).join("\n")} />
                <fieldset>
                  <legend className="mb-1 text-[12.5px] font-medium text-fg">Target services & products</legend>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-line p-2">
                    {getCatalog().map((c) => (
                      <label key={c.slug} className="flex items-center gap-2 text-sm"><input type="checkbox" name="services" value={c.name} defaultChecked={icp.services?.includes(c.name)} className="size-4" /> {c.name}</label>
                    ))}
                  </div>
                </fieldset>
                <TextField name="minBudget" type="number" label="Minimum budget (USD)" defaultValue={icp.minBudget ?? null} />
                <SubmitButton>Save ICP</SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-sm text-muted">Countries: {icp.countries?.join(", ") || "any"} · Services: {icp.services?.join(", ") || "any"}</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
