import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { audit } from "@/lib/audit";
import { deleteVisitorAction, linkVisitorLeadAction } from "@/lib/visitors/actions";
import type { IntentSignal } from "@/lib/visitors/intent";
import { fmtMinutes } from "@/lib/workforce/time";
import { DataTable, KV, Tabs, TextField, pick, type SP } from "@/components/admin/os";
import { PageHeader, Panel, fmtDate, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";
import { NoData } from "@/components/admin/workforce/ui";
import { CompanyCell, IntentBadge, place } from "@/components/admin/visitors/ui";

export const metadata = { title: "Visitor" };

export default async function VisitorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireAccess("visitors:view");
  const { id } = await params;
  const tab = pick(await searchParams, "tab", ["overview", "journey", "alerts", "crm"] as const) ?? "overview";
  const v = await db.visitor.findUnique({ where: { id }, include: { company: true, lead: { select: { id: true, ref: true, name: true, email: true, company: true, status: true } } } });
  if (!v) notFound();
  await audit({ userId: user.id, action: "visitor.viewed", entity: "Visitor", entityId: id });
  const manage = can(user.role, "visitors:manage");
  const signals = (Array.isArray(v.intentSignals) ? v.intentSignals : []) as unknown as IntentSignal[];
  const title = v.lead?.name ?? v.company?.name ?? `Visitor ${v.anonId.slice(0, 6)}`;
  const base = `/admin/visitors/${id}`;
  return (
    <>
      <PageHeader title={title} description={`${place(v)} · first seen ${fmtDate(v.firstSeenAt, true)} · last seen ${fmtDate(v.lastSeenAt, true)}`} crumbs={[{ label: "Visitors", href: "/admin/visitors" }, { label: title }]} actions={<IntentBadge label={v.intentLabel} score={v.intentScore} />} />
      <Tabs active={tab} items={[{ key: "overview", label: "Overview", href: base }, { key: "journey", label: "Journey", href: `${base}?tab=journey` }, { key: "alerts", label: "Alerts", href: `${base}?tab=alerts` }, { key: "crm", label: "CRM", href: `${base}?tab=crm` }]} />
      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Why this intent score">
            {signals.length ? (
              <ul className="space-y-2 text-sm">
                {signals.map((s) => (
                  <li key={s.signal} className="flex justify-between gap-3">
                    <span>{s.signal}<span className="block text-xs text-dim">{s.detail}</span></span>
                    <span className="font-mono">+{s.points}</span>
                  </li>
                ))}
                <li className="flex justify-between border-t border-line pt-2 font-medium"><span>Score (max 100)</span><span className="font-mono">{v.intentScore}</span></li>
              </ul>
            ) : (
              <p className="text-sm text-muted">No intent signals yet.</p>
            )}
          </Panel>
          <Panel title="Visitor">
            <KV
              cols={2}
              items={[
                ["Company", <CompanyCell key="c" company={v.company} />],
                ["Industry", v.company?.industry],
                ["Location (approximate)", place(v)],
                ["Region", v.region],
                ["Visits", v.sessionsCount],
                ["Page views", v.pageViews],
                ["Time on site", fmtMinutes(Math.round(v.totalSeconds / 60))],
                ["Device", [v.device, v.browser, v.os].filter(Boolean).join(" · ")],
                ["First source", v.firstSource ? `${v.firstSource} / ${v.firstMedium}${v.firstCampaign ? ` (${v.firstCampaign})` : ""}` : null],
                ["Latest source", v.lastSource ? `${v.lastSource} / ${v.lastMedium}${v.lastCampaign ? ` (${v.lastCampaign})` : ""}` : null],
                ["First page", v.firstPage],
                ["Language / time zone", [v.language, v.timezone].filter(Boolean).join(" · ")],
              ]}
            />
            {v.company && <p className="mt-3 text-xs text-dim">Company match from {v.company.provider}. It describes the network the visit came from, not the person.</p>}
          </Panel>
        </div>
      )}
      {tab === "journey" && <Journey visitorId={id} />}
      {tab === "alerts" && <Alerts visitorId={id} />}
      {tab === "crm" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="CRM lead">
            {v.lead ? (
              <KV cols={1} items={[["Lead", <Link key="l" href={`/admin/leads/${v.lead.id}`} className="text-brand-blue">{v.lead.name} ({v.lead.ref})</Link>], ["Email", v.lead.email], ["Company", v.lead.company], ["Status", label(v.lead.status)], ["Linked", fmtDate(v.identifiedAt, true)]]} />
            ) : (
              <p className="text-sm text-muted">Anonymous. This visitor is linked automatically if they submit a form on the website.</p>
            )}
            {manage && !v.lead && (
              <ActionForm action={linkVisitorLeadAction.bind(null, id)} className="mt-3 flex items-end gap-2">
                <TextField name="lead" label="Link to an existing lead (reference)" placeholder="SHV-20260927-AB12" required />
                <SubmitButton variant="secondary">Link</SubmitButton>
              </ActionForm>
            )}
          </Panel>
          {manage && (
            <Panel title="Data">
              <p className="mb-3 text-sm text-muted">Delete all sessions and events for this visitor, for example on a data-deletion request. The CRM lead is not affected.</p>
              <ActionForm action={deleteVisitorAction.bind(null, id)}>
                <ConfirmButton message="Delete all website activity for this visitor? This cannot be undone." confirmLabel="Delete data" className="text-sm text-red-700">Delete visitor data</ConfirmButton>
              </ActionForm>
            </Panel>
          )}
        </div>
      )}
    </>
  );
}

async function Journey({ visitorId }: { visitorId: string }) {
  const sessions = await db.visitorSession.findMany({ where: { visitorId }, orderBy: { startedAt: "desc" }, take: 20, include: { eventRows: { orderBy: { at: "asc" }, take: 200, select: { id: true, type: true, path: true, label: true, title: true, at: true } } } });
  if (!sessions.length) return <NoData>No sessions recorded.</NoData>;
  return (
    <div className="space-y-4">
      {sessions.map((s) => (
        <Panel key={s.id} title={`${fmtDate(s.startedAt, true)} · ${s.source ?? "direct"} / ${s.medium ?? "none"}${s.utmCampaign ? ` · ${s.utmCampaign}` : ""}`}>
          <p className="mb-2 text-xs text-dim">Landing {s.landingPage ?? "—"} · {s.pageViews} page(s) · {[s.device, s.browser, s.os].filter(Boolean).join(" · ")}{s.referrer ? ` · from ${s.referrer}` : ""}</p>
          <DataTable rows={s.eventRows} columns={[{ header: "Time", cell: (e) => fmtDate(e.at, true) }, { header: "Event", cell: (e) => label(e.type) }, { header: "Page", cell: (e) => <span className="text-muted">{e.path ?? "—"}</span> }, { header: "Detail", cell: (e) => <span className="text-muted">{e.label ?? e.title ?? "—"}</span> }]} />
        </Panel>
      ))}
    </div>
  );
}

async function Alerts({ visitorId }: { visitorId: string }) {
  const alerts = await db.visitorAlert.findMany({ where: { visitorId }, orderBy: { createdAt: "desc" }, take: 50, include: { rule: { select: { name: true } } } });
  return alerts.length ? <DataTable rows={alerts} columns={[{ header: "When", cell: (a) => fmtDate(a.createdAt, true) }, { header: "Rule", cell: (a) => a.rule.name }, { header: "Summary", cell: (a) => <span className="text-muted">{a.summary}</span> }]} /> : <NoData>No alerts for this visitor.</NoData>;
}
