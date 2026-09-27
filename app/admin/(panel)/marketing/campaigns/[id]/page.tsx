import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { fmtMoney } from "@/lib/os/money";
import { siteConfig } from "@/data/siteConfig";
import { campaignPerformance } from "@/lib/marketing/attribution";
import { saveCampaignAction, saveCampaignMetricAction } from "@/lib/marketing/actions";
import { PageHeader, Panel, fmtDate, inputCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { DataTable, Kpi, KpiGrid, StatusBadge } from "@/components/admin/os";
import { CampaignForm } from "@/components/admin/marketing/campaign-form";

export const metadata = { title: "Campaign" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccess("marketing:view", "MARKETING_ANALYTICS");
  const c = await db.campaign.findUnique({ where: { id: (await params).id } });
  if (!c) notFound();
  const perf = await campaignPerformance(c);
  const manage = can(user.role, "marketing:manage");
  const url = c.landingPage && c.utmCampaign ? `${siteConfig.url}${c.landingPage}?${new URLSearchParams({ utm_campaign: c.utmCampaign, ...(c.utmSource && { utm_source: c.utmSource }), ...(c.utmMedium && { utm_medium: c.utmMedium }) })}` : null;
  return (
    <>
      <PageHeader title={c.name} description={c.utmCampaign ? `utm_campaign=${c.utmCampaign}` : "Add a utm_campaign value to attribute leads"} crumbs={[{ label: "Campaigns", href: "/admin/marketing/campaigns" }, { label: c.name }]} actions={<StatusBadge value={c.status} />} />
      <KpiGrid cols={6}>
        <Kpi label="Spend" value={perf.spend ? fmtMoney(perf.spend, c.currency) : "—"} hint={perf.spend ? `${perf.metrics.length} days entered` : "No spend data"} />
        <Kpi label="Leads" value={perf.leads} hint={`${perf.qualified} qualified`} />
        <Kpi label="CPL" value={perf.cpl != null ? fmtMoney(perf.cpl, c.currency) : "—"} hint="Spend ÷ leads" />
        <Kpi label="Won" value={perf.won} hint={perf.conversion != null ? `${perf.conversion.toFixed(1)}% conversion` : undefined} />
        <Kpi label="Won value" value={perf.revenue.length ? perf.revenue.map((r) => fmtMoney(r.amount, r.currency, { compact: true })).join(" · ") : "—"} tone="green" />
        <Kpi label="ROI" value={perf.roi != null ? `${perf.roi.toFixed(0)}%` : "—"} hint={perf.roi == null ? "Needs spend and won value in the same currency" : "(won value − spend) ÷ spend"} tone={perf.roi != null ? (perf.roi >= 0 ? "green" : "red") : undefined} />
      </KpiGrid>
      {url && <p className="mt-3 text-xs break-all text-muted">Tracking URL: <span className="font-mono">{url}</span></p>}
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          {manage && <Panel title="Edit campaign"><CampaignForm action={saveCampaignAction.bind(null, c.id)} c={c} submit="Save campaign" /></Panel>}
          <Panel title="Daily metrics" bodyClassName="p-0">
            {perf.metrics.length === 0 ? <p className="p-4 text-sm text-dim">No spend or traffic recorded. Enter figures from the ad platform report, or connect the platform API.</p> : (
              <DataTable rows={perf.metrics} columns={[
                { header: "Date", cell: (m) => <span>{fmtDate(m.date)}</span> },
                { header: "Spend", cell: (m) => <span className="tabular-nums">{fmtMoney(m.spend, c.currency)}</span> },
                { header: "Impressions", cell: (m) => <span className="tabular-nums">{m.impressions.toLocaleString()}</span> },
                { header: "Clicks", cell: (m) => <span className="tabular-nums">{m.clicks.toLocaleString()}</span> },
                { header: "Source", cell: (m) => <span className="text-muted">{m.source}</span> },
              ]} />
            )}
          </Panel>
        </div>
        {manage && (
          <Panel title="Enter daily figures">
            <ActionForm action={saveCampaignMetricAction.bind(null, c.id)} resetOnOk className="grid grid-cols-2 gap-2">
              <input name="date" type="date" required aria-label="Date" className={`${inputCls} col-span-2`} />
              <input name="spend" required placeholder={`Spend (${c.currency})`} aria-label="Spend" className={inputCls} />
              <input name="impressions" type="number" placeholder="Impressions" aria-label="Impressions" className={inputCls} />
              <input name="clicks" type="number" placeholder="Clicks" aria-label="Clicks" className={inputCls} />
              <SubmitButton variant="secondary">Save day</SubmitButton>
            </ActionForm>
            <p className="mt-2 text-xs text-dim">Copy the figures from the platform&apos;s report. Re-saving a date replaces it.</p>
          </Panel>
        )}
      </div>
    </>
  );
}
