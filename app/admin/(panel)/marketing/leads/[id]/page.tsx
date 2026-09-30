import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { hydrateVault } from "@/lib/integrations/vault";
import { campaignScorecard } from "@/lib/company/analytics";
import { LEADGEN_MODES, parseLeadGen } from "@/lib/company/leadgen-rules";
import { REGIONS } from "@/lib/company/org";
import { enrollQualifiedAction, runLeadPipelineAction, saveLeadCampaignAction } from "@/lib/company/actions";
import { fmtMoney } from "@/lib/os/money";
import { DataTable, Kpi, KpiGrid, SelectField, StatusBadge, Tabs, TextField, str, type SP } from "@/components/admin/os";
import { EmptyState, PageHeader, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { GROWTH_CRUMB, GrowthTabs } from "@/components/admin/growth/tabs";
import { Card, Nature } from "@/components/admin/company/ui";
import { LeadCampaignForm } from "@/components/admin/company/lead-campaign-form";

export const metadata = { title: "Lead campaign" };
export const dynamic = "force-dynamic";

const STATUSES = ["ALL", "NEW", "RESEARCHED", "CONTACTED", "REPLIED", "CONVERTED", "DISQUALIFIED"] as const;
const STEP_LABEL: Record<string, string> = { discover: "Discover", enrich: "Enrich (find email)", dedupe: "Deduplicate", suppress: "Suppression list", verify: "Verify email", intent: "Website intent", score: "ICP score", qualify: "Qualify", crm: "CRM", sdr: "SDR outreach" };

export default async function LeadCampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireAccess("growth:view", "GROWTH");
  await hydrateVault();
  const { id } = await params;
  const sp = await searchParams;
  const c = await db.campaign.findUnique({ where: { id } });
  if (!c || !c.leadGen) notFound();
  const cfg = parseLeadGen(c.leadGen);
  const manage = can(user.role, "growth:manage");
  const status = STATUSES.find((s) => s === str(sp, "s", 20)) ?? "ALL";
  const [score, prospects, objective] = await Promise.all([
    campaignScorecard(id),
    db.prospect.findMany({ where: { campaignId: id, ...(status === "ALL" ? {} : { status }) }, orderBy: [{ fitScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], take: 100 }),
    db.aIObjective.findFirst({ where: { campaignId: id }, select: { id: true, title: true } }),
  ]);
  const sequences = manage ? await db.emailSequence.findMany({ where: { purpose: "OUTBOUND" }, select: { id: true, name: true, active: true }, orderBy: { createdAt: "desc" } }) : [];
  const ready = await db.prospect.count({ where: { campaignId: id, status: "RESEARCHED", verification: "VALID" } });
  const f = score?.funnel;
  const run = cfg.lastRun;
  return (
    <>
      <PageHeader
        title={c.name}
        description={[c.market, c.regionKey ? REGIONS.find((r) => r.key === c.regionKey)?.name : null, `${LEADGEN_MODES[cfg.mode].split(" — ")[0]} mode`, `daily target ${c.dailyLeadTarget ?? "—"}`].filter(Boolean).join(" · ")}
        crumbs={[GROWTH_CRUMB, { label: "Lead generation", href: "/admin/marketing/leads" }, { label: c.name }]}
        actions={manage ? <ActionForm action={runLeadPipelineAction.bind(null, id)}><SubmitButton>Run pipeline now</SubmitButton></ActionForm> : undefined}
      />
      <GrowthTabs active="leads" />
      {objective && <p className="mt-3 text-sm">Part of objective <Link href={`/admin/company/objectives/${objective.id}`} className="text-brand-blue hover:underline">{objective.title}</Link></p>}
      {!cfg.titles.length && !cfg.domains.length && <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">The ICP has no job titles or company domains yet, so discovery cannot run. Add them below (the Market Intelligence research for this campaign suggests them).</p>}
      <div className="mt-4">
        <KpiGrid cols={6}>
          <Kpi label="Prospects" value={f?.discovered ?? 0} hint={`${f?.withEmail ?? 0} with email`} />
          <Kpi label="Verified" value={f?.verified ?? 0} hint={`${f?.invalid ?? 0} invalid`} />
          <Kpi label="Qualified" value={f?.qualified ?? 0} />
          <Kpi label="Replied" value={f?.replied ?? 0} />
          <Kpi label="CRM leads" value={score?.leads ?? 0} hint={`${score?.qualifiedLeads ?? 0} qualified`} />
          <Kpi label="Opportunities" value={score?.opportunities ?? 0} hint={score && Object.keys(score.revenue).length ? `Won ${Object.entries(score.revenue).map(([cur, v]) => fmtMoney(String(v), cur)).join(" · ")}` : "no revenue yet"} />
        </KpiGrid>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-dim">Spend: {score?.spend ? <>{Object.entries(score.spend).map(([cur, v]) => fmtMoney(String(v), cur)).join(" · ")} <Nature value="MANUAL" /></> : <>— <Nature value="UNAVAILABLE" /></>} · Replies from sequences: {score?.replies ?? "—"} · Meetings: {score?.meetings ?? 0} · Customers: {score?.customers ?? 0}</p>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0 space-y-4">
          <Card title={run ? `Last run — ${fmtDate(new Date(run.at), true)}` : "Pipeline"}>
            {run ? (
              <ol className="space-y-1.5 text-sm">
                {run.steps.map((s) => (
                  <li key={s.key} className="flex flex-wrap items-baseline gap-2">
                    <StatusBadge value={s.status} />
                    <span className="font-medium">{STEP_LABEL[s.key] ?? s.key}</span>
                    <span className="tabular-nums text-muted">{s.count}</span>
                    {s.note && <span className="w-full pl-1 text-xs text-dim">{s.note}</span>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-dim">Not run yet. {cfg.mode === "AUTONOMOUS" ? "The daily growth loop runs it when Autonomous Growth and the lead channel are on." : "Use “Run pipeline now”."}</p>
            )}
          </Card>
          <Card title="Prospects">
            <Tabs active={status} items={STATUSES.map((s) => ({ key: s, label: s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase(), href: `/admin/marketing/leads/${id}${s === "ALL" ? "" : `?s=${s}`}` }))} />
            <div className="mt-3">
              {prospects.length ? (
                <DataTable
                  rows={prospects}
                  columns={[
                    { header: "Contact", cell: (p) => <span className="font-medium">{p.contactName ?? "—"}<span className="block text-xs text-dim">{p.title ?? ""}</span></span> },
                    { header: "Company", cell: (p) => <span>{p.company}<span className="block text-xs text-dim">{[p.domain, p.country, p.industry].filter(Boolean).join(" · ")}</span></span> },
                    { header: "Email", cell: (p) => <span className="text-xs">{p.email ?? "—"}{p.verification && <span className="ml-1"><StatusBadge value={p.verification} /></span>}</span> },
                    { header: "ICP fit", cell: (p) => { const fit = (p.provenance as { fit?: string[] } | null)?.fit; return <span title={fit?.join("\n")} className="tabular-nums">{p.fitScore ?? "—"}</span>; } },
                    { header: "Intent", cell: (p) => p.intentScore ?? <span className="text-dim">—</span> },
                    { header: "Source", cell: (p) => p.source },
                    { header: "Status", cell: (p) => <StatusBadge value={p.status} /> },
                  ]}
                />
              ) : (
                <EmptyState title="No prospects" description="Run the pipeline with a connected provider." />
              )}
            </div>
            <p className="mt-2 text-xs text-dim">Prospect actions (mark replied, convert to lead, disqualify) are on the <Link href="/admin/marketing/prospects" className="text-brand-blue hover:underline">Prospects</Link> page; outreach is enrolled on <Link href="/admin/marketing/email" className="text-brand-blue hover:underline">Email sequences</Link> by a person.</p>
          </Card>
        </div>
        {manage && (
          <div className="space-y-4">
          <Card title={`Outreach (${ready} qualified & verified)`}>
            {sequences.length ? (
              <ActionForm action={enrollQualifiedAction.bind(null, id)} className="space-y-2">
                <SelectField name="sequenceId" label="Outbound sequence" options={sequences.map((s) => [s.id, `${s.name}${s.active ? "" : " (inactive)"}`] as const)} />
                <TextField name="max" type="number" label="At most" defaultValue={50} />
                <SubmitButton variant="secondary">Enrol qualified prospects</SubmitButton>
                <p className="text-xs text-dim">Sending follows the email kill switches, the outbound switch and the daily email budget; unsubscribes, bounces, complaints and replies stop it.</p>
              </ActionForm>
            ) : (
              <p className="text-sm text-dim">No OUTBOUND sequence exists. Create one on <Link href="/admin/marketing/email" className="text-brand-blue hover:underline">Email sequences</Link>.</p>
            )}
          </Card>
          <Card title="Campaign setup">
            <LeadCampaignForm action={saveLeadCampaignAction.bind(null, id)} modes={Object.entries(LEADGEN_MODES)} regions={REGIONS.map((r) => [r.key, r.name])} v={{ name: c.name, market: c.market, icp: c.icp, offer: c.offer, dailyLeadTarget: c.dailyLeadTarget, regionKey: c.regionKey, cfg }} />
          </Card>
          </div>
        )}
      </div>
    </>
  );
}
