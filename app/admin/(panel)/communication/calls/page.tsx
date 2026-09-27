import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { channels } from "@/lib/communication/providers";
import { ivrSettings } from "@/lib/communication/ivr";
import { daysFromNow } from "@/lib/os/range";
import { saveIvrSettingsAction, updateCallAction } from "@/lib/communication/actions";
import { Panel, fmtDate, inputCls, label, labelCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { CheckField, Kpi, KpiGrid, LinkCell, ListView, NotConnected, StatusBadge, Tabs, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";

export const metadata = { title: "Calls & IVR" };
const STATUSES = ["COMPLETED", "MISSED", "NO_ANSWER", "BUSY", "VOICEMAIL", "FAILED", "IN_PROGRESS", "RINGING"] as const;

export default async function CallsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("calls:view", "IVR");
  const sp = await searchParams;
  const view = str(sp, "view", 10) === "ivr" ? "ivr" : "log";
  const values = { status: pick(sp, "status", STATUSES), ivr: pick(sp, "ivr", ["SALES", "HR", "GENERAL", "EXISTING_CLIENT"] as const), direction: pick(sp, "direction", ["INBOUND", "OUTBOUND"] as const), page: str(sp, "page") };
  const tabs = <Tabs active={view} items={[{ key: "log", label: "Call log", href: "/admin/communication/calls" }, { key: "ivr", label: "IVR setup", href: "/admin/communication/calls?view=ivr" }]} />;
  const tel = channels().filter((c) => c.key === "twilio" || c.key === "exotel");
  const connected = tel.some((c) => c.connected);
  if (view === "ivr") {
    const s = await ivrSettings();
    const manage = can(user.role, "settings:manage");
    return (
      <ListView title="Calls & IVR" crumbs={[{ label: "Communication", href: "/admin/communication" }, { label: "Calls" }]} tabs={tabs} values={{}} rows={[]} total={0} page={1} basePath="/admin/communication/calls" columns={[]} empty={{ title: "Webhook URLs", description: "Twilio: /api/webhooks/twilio/voice (voice), /api/webhooks/twilio/status (status). Exotel: /api/webhooks/exotel?token=… (Passthru + status)." }}
        above={
          <div className="mb-5 space-y-4">
            {!connected && <NotConnected name="Telephony (Twilio / Exotel)" env={tel.flatMap((t) => t.env.slice(0, 2))}>No calls are placed or simulated. Calls can still be logged manually from lead and client pages.</NotConnected>}
            <Panel title="IVR menu">
              <ActionForm action={saveIvrSettingsAction} className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2"><label htmlFor="greeting" className={labelCls}>Greeting (spoken)</label><textarea id="greeting" name="greeting" rows={3} defaultValue={s.greeting} disabled={!manage} className={`${inputCls} h-auto py-2`} /></div>
                {(["SALES", "HR", "GENERAL", "EXISTING_CLIENT"] as const).map((k, i) => <div key={k}><label htmlFor={k} className={labelCls}>{i + 1}. {label(k)} — forward to</label><input id={k} name={k} defaultValue={s[k]} placeholder="+9181…" disabled={!manage} className={inputCls} /></div>)}
                <div className="sm:col-span-2"><CheckField name="recording" label="Record answered calls" defaultChecked={s.recording} hint="Callers hear a recording notice first. Check local consent laws (one- vs two-party consent) before enabling. Recordings of calls without the notice are discarded." /></div>
                {manage && <div><SubmitButton>Save IVR</SubmitButton></div>}
                <p className="text-xs text-dim sm:col-span-2">Unrouted options go to voicemail. Missed sales calls create a high-priority call-back task automatically.</p>
              </ActionForm>
            </Panel>
          </div>
        }
      />
    );
  }
  const where: Prisma.CallWhereInput = { ...(values.status && { status: values.status }), ...(values.ivr && { ivrOption: values.ivr }), ...(values.direction && { direction: values.direction }) };
  const page = pageOf(sp);
  const since = daysFromNow(-30);
  const [total, rows, month, missed, avg] = await Promise.all([
    db.call.count({ where }),
    db.call.findMany({ where, orderBy: { startedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { lead: { select: { id: true, name: true } }, client: { select: { id: true, name: true } }, user: { select: { name: true } } } }),
    db.call.count({ where: { startedAt: { gte: since } } }),
    db.call.count({ where: { startedAt: { gte: since }, status: { in: ["MISSED", "NO_ANSWER", "BUSY"] }, direction: "INBOUND" } }),
    db.call.aggregate({ where: { startedAt: { gte: since }, status: "COMPLETED" }, _avg: { durationSec: true } }),
  ]);
  return (
    <ListView
      title="Calls & IVR"
      description="Inbound calls routed by the IVR (1 Sales · 2 HR · 3 General · 4 Existing client), outbound calls and manually logged calls."
      crumbs={[{ label: "Communication", href: "/admin/communication" }, { label: "Calls" }]}
      tabs={tabs}
      above={
        <div className="mb-5 space-y-4">
          {!connected && <NotConnected name="Telephony (Twilio / Exotel)" env={tel.flatMap((t) => t.env.slice(0, 2))} />}
          <KpiGrid cols={3}><Kpi label="Calls (30 days)" value={month} /><Kpi label="Missed inbound (30 days)" value={missed} tone={missed ? "amber" : undefined} /><Kpi label="Avg answered duration" value={avg._avg.durationSec ? `${Math.round(avg._avg.durationSec / 60)} min` : "—"} /></KpiGrid>
        </div>
      }
      values={values}
      filters={[{ type: "select", name: "status", label: "Any status", options: STATUSES.map((s) => [s, label(s)] as const) }, { type: "select", name: "ivr", label: "Any IVR option", options: ["SALES", "HR", "GENERAL", "EXISTING_CLIENT"].map((s) => [s, label(s)] as const) }, { type: "select", name: "direction", label: "Any direction", options: [["INBOUND", "Inbound"], ["OUTBOUND", "Outbound"]] }]}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/communication/calls"
      empty={{ title: "No calls yet", description: connected ? "Calls appear as soon as the provider webhooks are configured." : "Log calls from lead and client pages, or connect Twilio/Exotel." }}
      columns={[
        { header: "When", cell: (c) => <span className="whitespace-nowrap text-muted">{fmtDate(c.startedAt, true)}</span> },
        { header: "Caller", cell: (c) => (c.lead ? <LinkCell href={`/admin/leads/${c.lead.id}`} sub={c.fromNumber}>{c.lead.name}</LinkCell> : c.client ? <LinkCell href={`/admin/clients/${c.client.id}`} sub={c.fromNumber}>{c.client.name}</LinkCell> : <span className="text-muted">{c.callerName ?? (c.direction === "INBOUND" ? c.fromNumber : c.toNumber) ?? "Unknown"}</span>) },
        { header: "IVR", cell: (c) => <span className="text-muted">{c.ivrOption ? label(c.ivrOption) : "—"}</span> },
        { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
        { header: "Duration", cell: (c) => <span className="tabular-nums text-muted">{c.durationSec ? `${Math.floor(c.durationSec / 60)}:${String(c.durationSec % 60).padStart(2, "0")}` : "—"}</span> },
        { header: "Outcome", cell: (c) => (
          <details><summary className="cursor-pointer text-xs">{c.outcome ? label(c.outcome) : <span className="text-brand-blue">Set outcome</span>}</summary>
            <ActionForm action={updateCallAction.bind(null, c.id)} className="mt-1 flex w-64 flex-col gap-1.5">
              <select name="outcome" defaultValue={c.outcome ?? "CONNECTED"} aria-label="Outcome" className={inputCls}>{["CONNECTED", "INTERESTED", "NOT_INTERESTED", "CALLBACK_REQUESTED", "WRONG_NUMBER", "SUPPORT_RESOLVED", "ESCALATED", "NO_OUTCOME"].map((o) => <option key={o} value={o}>{label(o)}</option>)}</select>
              <textarea name="notes" rows={2} defaultValue={c.notes ?? ""} aria-label="Notes" className={`${inputCls} h-auto py-1.5`} />
              <SubmitButton variant="secondary" className="h-8">Save</SubmitButton>
            </ActionForm>
          </details>
        ) },
        { header: "Recording", cell: (c) => (c.recordingUrl ? <Link href={c.recordingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-blue hover:underline">Listen</Link> : <span className="text-dim">—</span>) },
        { header: "Employee", cell: (c) => <span className="text-muted">{c.user?.name ?? "—"}</span> },
      ]}
    />
  );
}
