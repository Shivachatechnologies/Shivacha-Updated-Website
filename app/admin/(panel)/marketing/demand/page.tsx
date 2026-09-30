import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { siteConfig } from "@/data/siteConfig";
import { buildUtmUrl, CHANNEL_UTM } from "@/lib/growth/attribution";
import { saveDemandPlanAction } from "@/lib/growth/actions";
import { DataTable, StatusBadge, TextArea, TextField, str, type SP } from "@/components/admin/os";
import { EmptyState, PageHeader, Panel, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { GROWTH_CRUMB, GrowthTabs } from "@/components/admin/growth/tabs";

export const metadata = { title: "Demand generation" };
export const dynamic = "force-dynamic";

export default async function DemandPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("growth:view", "GROWTH");
  const manage = can(user.role, "growth:manage");
  const sp = await searchParams;
  const campaigns = await db.campaign.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 });
  const selected = campaigns.find((c) => c.id === str(sp, "id", 40)) ?? null;
  const leadCounts = await db.lead.groupBy({ by: ["utmCampaign"], where: { archivedAt: null, utmCampaign: { in: campaigns.map((c) => c.utmCampaign).filter((x): x is string => !!x) } }, _count: { _all: true } });
  const qualified = await db.lead.groupBy({ by: ["utmCampaign"], where: { archivedAt: null, growthTier: { in: ["QUALIFIED", "SALES_READY"] }, utmCampaign: { in: campaigns.map((c) => c.utmCampaign).filter((x): x is string => !!x) } }, _count: { _all: true } });
  const cnt = (rows: typeof leadCounts, k: string | null) => (k ? (rows.find((r) => r.utmCampaign === k)?._count._all ?? 0) : 0);

  // UTM builder (GET form, computed on the server).
  const u = { path: str(sp, "path", 300), channel: str(sp, "channel", 30), campaign: str(sp, "campaign", 120), content: str(sp, "content", 120) };
  let built: string | null = null;
  let buildError: string | null = null;
  if (u.path && u.channel && u.campaign) {
    try {
      const base = CHANNEL_UTM[u.channel];
      if (!base) throw new Error("Pick a channel");
      if (!u.path.startsWith("/") && !u.path.startsWith(siteConfig.url)) throw new Error("Use a site path like /services/fintech");
      built = buildUtmUrl(u.path, { ...base, campaign: u.campaign, content: u.content || null }, siteConfig.url);
    } catch (e) {
      buildError = (e as Error).message;
    }
  }

  return (
    <>
      <PageHeader title="Demand generation" description="Each campaign's growth plan — objective, market, ICP, offer, channels, daily target, landing page and CTA — on top of the existing marketing campaigns. Budgets and spend stay on the campaign." crumbs={[GROWTH_CRUMB, { label: "Demand gen" }]} actions={can(user.role, "marketing:manage") ? <Link href="/admin/marketing/campaigns/new" className="btn-secondary h-9 px-3 text-[13px]">New campaign</Link> : undefined} />
      <GrowthTabs active="demand" />
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0 space-y-4">
          <Panel title="Campaigns" bodyClassName="p-0">
            {campaigns.length ? (
              <DataTable
                rows={campaigns}
                columns={[
                  { header: "Campaign", cell: (c) => <Link href={`/admin/marketing/demand?id=${c.id}`} className="font-medium text-fg hover:underline">{c.name}</Link> },
                  { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
                  { header: "Objective", cell: (c) => <span className="text-xs text-muted">{c.objective ?? "—"}</span> },
                  { header: "Market", cell: (c) => <span className="text-xs text-muted">{c.market ?? "—"}</span> },
                  { header: "Channels", cell: (c) => <span className="text-xs text-muted">{c.channels.length ? c.channels.join(", ") : c.channel}</span> },
                  { header: "Leads", cell: (c) => (c.utmCampaign ? cnt(leadCounts, c.utmCampaign) : "—") },
                  { header: "Qualified", cell: (c) => (c.utmCampaign ? cnt(qualified, c.utmCampaign) : "—") },
                  { header: "Target/day", cell: (c) => c.dailyLeadTarget ?? "—" },
                ]}
              />
            ) : (
              <div className="p-4"><EmptyState title="No campaigns yet" description="Create a campaign in Marketing → Campaigns, then add its demand plan here." /></div>
            )}
          </Panel>
          {selected && (
            <Panel title={`Demand plan — ${selected.name}`}>
              {!selected.utmCampaign && <p className="mb-3 text-xs text-amber-700">This campaign has no UTM campaign key, so leads cannot be attributed to it. Set one on the campaign.</p>}
              {manage ? (
                <ActionForm action={saveDemandPlanAction.bind(null, selected.id)} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField name="objective" label="Objective" defaultValue={selected.objective} placeholder="e.g. 40 qualified exchange leads in GCC this quarter" />
                    <TextField name="market" label="Market" defaultValue={selected.market} placeholder="e.g. UAE, Saudi Arabia" />
                    <TextArea name="icp" label="Ideal customer" defaultValue={selected.icp} rows={3} />
                    <TextArea name="offer" label="Offer (from services/products)" defaultValue={selected.offer} rows={3} />
                    <TextField name="landingPage" label="Landing page" defaultValue={selected.landingPage} placeholder="/lp/…" />
                    <TextField name="cta" label="Call to action" defaultValue={selected.cta} placeholder="Book a 30-minute consultation" />
                    <TextField name="dailyLeadTarget" type="number" label="Daily qualified-lead target" defaultValue={selected.dailyLeadTarget} hint="A target, not a guarantee." />
                  </div>
                  <fieldset>
                    <legend className="mb-1 text-[12.5px] font-medium text-fg">Channels</legend>
                    <div className="flex flex-wrap gap-3">
                      {Object.keys(CHANNEL_UTM).map((k) => (
                        <label key={k} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="channels" value={k} defaultChecked={selected.channels.includes(k)} className="size-4" /> {k.replace(/_/g, " ").toLowerCase()}</label>
                      ))}
                    </div>
                  </fieldset>
                  <SubmitButton>Save demand plan</SubmitButton>
                </ActionForm>
              ) : (
                <p className="text-sm text-muted">{selected.objective ?? "No plan yet."}</p>
              )}
            </Panel>
          )}
        </div>
        <div className="min-w-0">
          <Panel title="UTM link builder">
            <form className="space-y-3" method="get">
              {selected && <input type="hidden" name="id" value={selected.id} />}
              <div>
                <label className={labelCls} htmlFor="u-path">Site path</label>
                <input id="u-path" name="path" defaultValue={u.path || selected?.landingPage || ""} placeholder="/services/fintech-development" className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="u-channel">Channel</label>
                <select id="u-channel" name="channel" defaultValue={u.channel} className={inputCls}>
                  <option value="">Choose…</option>
                  {Object.entries(CHANNEL_UTM).map(([k, v]) => (
                    <option key={k} value={k}>{k.replace(/_/g, " ").toLowerCase()} ({v.source} / {v.medium})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="u-campaign">Campaign key</label>
                <input id="u-campaign" name="campaign" defaultValue={u.campaign || selected?.utmCampaign || ""} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="u-content">Content (optional)</label>
                <input id="u-content" name="content" defaultValue={u.content} placeholder="carousel-1" className={inputCls} />
              </div>
              <button type="submit" className="btn-secondary h-9 px-3 text-[13px]">Build link</button>
            </form>
            {built && <p className="mt-3 rounded-md border border-line bg-ink-850 p-2 font-mono text-xs break-all text-fg">{built}</p>}
            {buildError && <p className="mt-3 text-xs text-red-700">{buildError}</p>}
          </Panel>
        </div>
      </div>
    </>
  );
}
