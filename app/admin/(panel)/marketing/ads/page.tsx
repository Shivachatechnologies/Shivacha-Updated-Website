import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { adsReady } from "@/lib/ads/providers";
import { getAdsPolicy } from "@/lib/ads/engine";
import { changeAdBudgetAction, createAdCampaignAction, launchAdAction, pauseAdAction, pauseAllAdsAction, saveAdsPolicyAction, syncAdsAction } from "@/lib/ads/actions";
import { fmtMoney } from "@/lib/os/money";
import { CheckField, DataTable, Kpi, KpiGrid, SelectField, StatusBadge, TextArea, TextField } from "@/components/admin/os";
import { EmptyState, PageHeader, fmtDate } from "@/components/admin/ui";
import { freshness } from "@/lib/company/data-rules";
import { ActionForm } from "@/components/admin/forms";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";
import { GROWTH_CRUMB, GrowthTabs } from "@/components/admin/growth/tabs";
import { Card, Nature } from "@/components/admin/company/ui";

export const metadata = { title: "Advertising" };
export const dynamic = "force-dynamic";

export default async function AdsPage() {
  const user = await requireAccess("growth:view", "GROWTH");
  const control = can(user.role, "growth:control");
  const manage = can(user.role, "growth:manage") && can(user.role, "marketing:manage");
  const renderedAt = new Date().getTime();
  const since = new Date(renderedAt - 13 * 86400_000);
  const [providers, policy, rows, logs, campaigns] = await Promise.all([
    adsReady(),
    getAdsPolicy(),
    db.adCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    db.adSpendLog.findMany({ where: { date: { gte: since } }, orderBy: { date: "desc" }, include: { adCampaign: { select: { name: true, currency: true } } }, take: 200 }),
    db.campaign.findMany({ where: { status: { in: ["PLANNED", "ACTIVE"] } }, select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const active = rows.filter((r) => r.status === "ACTIVE");
  const byCur = (list: { currency: string; v: number }[]) => Object.entries(list.reduce<Record<string, number>>((a, x) => ({ ...a, [x.currency]: (a[x.currency] ?? 0) + x.v }), {})).map(([c, v]) => fmtMoney(v.toFixed(2), c)).join(" · ") || "0";
  return (
    <>
      <PageHeader title="Advertising" description="Meta Ads, Google Ads and LinkedIn Ads through their official APIs. Campaigns are created PAUSED; launching and budget increases need a person with growth control (or an approved AI request, or the CEO's autonomous policy within its limit) and must fit the daily and monthly limits. Spend shown here is reported by the platforms." crumbs={[GROWTH_CRUMB, { label: "Advertising" }]} actions={manage ? <ActionForm action={syncAdsAction}><SubmitButton variant="secondary">Sync spend now</SubmitButton></ActionForm> : undefined} />
      <GrowthTabs active="ads" />
      {policy.emergencyStop && <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">EMERGENCY STOP is on — nothing can be launched and active campaigns were paused.</p>}
      {policy.dailySpendLimit == null && <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">BLOCKED: no daily spend limit is set, so no campaign can be launched. Set limits below (growth control).</p>}
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {providers.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1"><span className={p.connected ? "size-1.5 rounded-full bg-emerald-500" : "size-1.5 rounded-full bg-zinc-400"} />{p.name}: <b className={p.connected ? "text-emerald-700" : "text-dim"}>{p.connected ? "CONNECTED" : "NOT CONNECTED"}</b></span>
        ))}
        <Link href="/admin/integrations/connect" className="text-brand-blue hover:underline">Connect ad accounts →</Link>
      </div>
      <div className="mt-4">
        <KpiGrid cols={4}>
          <Kpi label="Active campaigns" value={active.length} />
          <Kpi label="Active daily budgets" value={byCur(active.map((a) => ({ currency: a.currency, v: Number(a.dailyBudget) })))} hint={policy.dailySpendLimit != null ? `limit ${policy.dailySpendLimit}/day` : "no limit set"} />
          <Kpi label="Spend (14 days)" value={<span className="flex items-center gap-1.5">{byCur(logs.map((l) => ({ currency: l.adCampaign.currency, v: Number(l.spend) })))} <Nature value={logs.length ? "REAL" : "UNAVAILABLE"} /></span>} hint="Reported by the platforms" />
          <Kpi label="Conversions (14 days)" value={logs.reduce((a, l) => a + l.conversions, 0)} />
        </KpiGrid>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0 space-y-4">
          <Card title="Ad campaigns" action={manage && active.length ? <ActionForm action={pauseAllAdsAction}><ConfirmButton message="Pause every active campaign at the providers now?">Pause all</ConfirmButton></ActionForm> : undefined}>
            {rows.length ? (
              <DataTable
                rows={rows}
                columns={[
                  { header: "Campaign", cell: (r) => <span className="font-medium">{r.name}<span className="block text-xs text-dim">{r.provider} · {r.externalId ?? "—"}</span>{r.error && <span className="block max-w-72 text-[11px] text-amber-700">{r.error}</span>}</span> },
                  { header: "Status", cell: (r) => <StatusBadge value={r.status} /> },
                  { header: "Daily", cell: (r) => fmtMoney(r.dailyBudget.toString(), r.currency) },
                  { header: "Spend", cell: (r) => <span>{fmtMoney(r.spend.toString(), r.currency)} <Nature value={freshness(r.lastSyncedAt, 24, providers.find((p) => p.key === r.provider)?.connected ?? false, renderedAt)} /><span className="block text-[11px] text-dim">{r.lastSyncedAt ? `synced ${fmtDate(r.lastSyncedAt, true)}` : "not synced"}</span></span> },
                  { header: "Results", cell: (r) => <span className="text-xs">{r.impressions.toLocaleString("en-US")} impr · {r.clicks} clicks · {r.conversions} conv</span> },
                  {
                    header: "",
                    cell: (r) => (
                      <div className="flex flex-wrap items-end gap-1.5">
                        {control && r.status === "PAUSED" && <ActionForm action={launchAdAction.bind(null, r.id)}><ConfirmButton danger={false} message={`Launch "${r.name}" at ${fmtMoney(r.dailyBudget.toString(), r.currency)} per day? Spend limits are checked first.`}>Launch</ConfirmButton></ActionForm>}
                        {manage && r.status === "ACTIVE" && <ActionForm action={pauseAdAction.bind(null, r.id)}><SubmitButton variant="secondary">Pause</SubmitButton></ActionForm>}
                        {control && (r.status === "PAUSED" || r.status === "ACTIVE") && (
                          <ActionForm action={changeAdBudgetAction.bind(null, r.id)} className="flex items-end gap-1">
                            <TextField name="dailyBudget" label="Daily" defaultValue={r.dailyBudget.toString()} />
                            <SubmitButton variant="secondary">Set</SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            ) : (
              <EmptyState title="No ad campaigns" description="Create one below (it is created paused), or an AI employee proposes one for approval." />
            )}
          </Card>
          <Card title="Daily results (platform-reported)">
            {logs.length ? (
              <DataTable rows={logs} columns={[{ header: "Date", cell: (l) => l.date.toISOString().slice(0, 10) }, { header: "Campaign", cell: (l) => l.adCampaign.name }, { header: "Spend", cell: (l) => fmtMoney(l.spend.toString(), l.adCampaign.currency) }, { header: "Impressions", cell: (l) => l.impressions.toLocaleString("en-US") }, { header: "Clicks", cell: (l) => l.clicks }, { header: "Conversions", cell: (l) => l.conversions }]} />
            ) : (
              <p className="text-sm text-dim">No platform data yet (UNAVAILABLE until a connected account reports spend).</p>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Spend policy">
            {control ? (
              <ActionForm action={saveAdsPolicyAction} className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <TextField name="dailySpendLimit" label="Daily spend limit" defaultValue={policy.dailySpendLimit ?? ""} placeholder="required to launch" />
                  <TextField name="monthlyAccountBudget" label="Monthly account budget" defaultValue={policy.monthlyAccountBudget ?? ""} />
                  <TextField name="maxCampaignDaily" label="Max per campaign / day" defaultValue={policy.maxCampaignDaily ?? ""} />
                  <TextField name="autoApproveUpTo" label="Autonomous up to / day" defaultValue={policy.autoApproveUpTo || ""} />
                </div>
                <CheckField name="autonomous" label="Autonomous advertising policy" defaultChecked={policy.autonomous} hint="OFF by default. When ON, an AI launch request whose daily budget is at or below the autonomous amount runs without a person — still inside every limit. Everything above it needs approval." />
                <CheckField name="emergencyStop" label="Emergency stop" defaultChecked={policy.emergencyStop} hint="Pauses every active campaign at the providers and blocks launches." />
                <SubmitButton>Save policy</SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-sm text-muted">Daily limit {policy.dailySpendLimit ?? "not set"} · monthly {policy.monthlyAccountBudget ?? "not set"} · autonomous {policy.autonomous ? `on (≤ ${policy.autoApproveUpTo})` : "off"}.</p>
            )}
          </Card>
          {manage && (
            <Card title="New ad campaign (created paused)">
              <ActionForm action={createAdCampaignAction} className="space-y-2.5">
                <SelectField name="provider" label="Platform" options={providers.map((p) => [p.key, `${p.name}${p.connected ? "" : " (not connected)"}`] as const)} />
                <TextField name="name" label="Name" />
                <div className="grid grid-cols-2 gap-2">
                  <TextField name="dailyBudget" label="Daily budget" />
                  <TextField name="currency" label="Currency" defaultValue="USD" />
                </div>
                <TextField name="countries" label="Countries (ISO codes)" placeholder="US, IN, AE" />
                <TextField name="headline" label="Headline (Meta ad)" />
                <TextArea name="body" label="Primary text (Meta ad)" rows={2} />
                <TextField name="link" label="Landing page URL" placeholder="https://…" />
                <SelectField name="campaignId" label="Growth campaign" blank="None" options={campaigns.map((c) => [c.id, c.name] as const)} />
                <SubmitButton>Create paused</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
