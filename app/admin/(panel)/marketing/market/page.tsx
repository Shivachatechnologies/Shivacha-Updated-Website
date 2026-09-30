import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { providerStatus, webSearchEnabled } from "@/lib/ai/provider";
import { hydrateVault } from "@/lib/integrations/vault";
import { syncResearch } from "@/lib/company/research";
import { paramsSummary, type ResearchParams } from "@/lib/company/research-rules";
import { requestResearchAction } from "@/lib/company/actions";
import { DataTable, NotConnected, StatusBadge, TextField } from "@/components/admin/os";
import { EmptyState, PageHeader, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { GROWTH_CRUMB, GrowthTabs } from "@/components/admin/growth/tabs";

export const metadata = { title: "Market intelligence" };
export const dynamic = "force-dynamic";

const FIELDS: [keyof ResearchParams, string, string][] = [
  ["market", "Market", "e.g. B2B payments infrastructure"],
  ["country", "Country", "e.g. United Arab Emirates"],
  ["region", "Region", "e.g. MENA"],
  ["industry", "Industry", "e.g. Fintech"],
  ["companySize", "Company size", "e.g. 50–500 employees"],
  ["revenue", "Company revenue", "e.g. $10M–$100M"],
  ["buyerRole", "Buyer role", "e.g. CTO, Head of Payments"],
  ["technology", "Technology", "e.g. stablecoins, core banking"],
  ["product", "Our product", "e.g. custody platform"],
  ["service", "Our service", "e.g. blockchain development"],
  ["competitors", "Known competitors", "comma separated"],
];

export default async function MarketPage() {
  const user = await requireAccess("growth:view", "GROWTH");
  await hydrateVault();
  const manage = can(user.role, "growth:manage") && can(user.role, "ai:execute");
  const open = await db.marketResearch.findMany({ where: { status: { in: ["QUEUED", "RUNNING", "BLOCKED"] } }, select: { id: true } });
  for (const r of open) await syncResearch(r.id);
  const rows = await db.marketResearch.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  const ai = providerStatus().connected;
  const web = webSearchEnabled();
  return (
    <>
      <PageHeader title="Market intelligence" description="Research by the AI Market Intelligence department: opportunity, ICP, personas, pain points, triggers, objections, competitors, positioning, offers, pricing observations, channels and campaign ideas. Every statistic carries its source; AI reasoning is labelled as inference. Results feed Marketing, Growth, Lead Generation, Sales and the Knowledge Base." crumbs={[GROWTH_CRUMB, { label: "Market intelligence" }]} />
      <GrowthTabs active="market" />
      <div className="mt-4 space-y-3">
        {!ai && <NotConnected name="AI provider" env={["ANTHROPIC_API_KEY"]}>Research requests are recorded and queued, but no research runs until the AI provider is connected. Nothing is generated or simulated meanwhile.</NotConnected>}
        {ai && !web && <NotConnected name="Web research" env={["AI_WEB_SEARCH"]}>Without web research the department uses internal data only (CRM, deals, visitors, knowledge base) and states that external market data was unavailable.</NotConnected>}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0">
          {rows.length ? (
            <DataTable
              rows={rows}
              columns={[
                { header: "Research", cell: (r) => <Link href={`/admin/marketing/market/${r.id}`} className="font-medium hover:underline">{r.title}<span className="block text-xs text-dim">{paramsSummary(r.params as ResearchParams)}</span></Link> },
                { header: "Findings", cell: (r) => (Array.isArray(r.findings) ? r.findings.length : 0) },
                { header: "Status", cell: (r) => <span><StatusBadge value={r.status} />{r.blockedReason && <span className="block max-w-64 text-[11px] text-red-700">{r.blockedReason}</span>}</span> },
                { header: "Requested", cell: (r) => <span className="text-xs">{fmtDate(r.createdAt, true)}</span> },
              ]}
            />
          ) : (
            <EmptyState title="No research yet" description="Request market research with the form." />
          )}
        </div>
        {manage && (
          <section className="rounded-lg border border-line bg-ink-900 p-4">
            <h2 className="text-sm font-semibold">Run market research</h2>
            <ActionForm action={requestResearchAction} className="mt-3 space-y-2.5">
              <TextField name="title" label="Title (optional)" />
              {FIELDS.map(([k, l, ph]) => <TextField key={k} name={k} label={l} placeholder={ph} />)}
              <SubmitButton>Run market research</SubmitButton>
              <p className="text-xs text-dim">Creates a real task for the AI Market Intelligence Director. Uses AI budget and, when enabled, paid web searches.</p>
            </ActionForm>
          </section>
        )}
      </div>
    </>
  );
}
