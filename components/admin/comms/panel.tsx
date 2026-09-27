import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can, type RoleName } from "@/lib/auth/permissions";
import { channelConnected } from "@/lib/communication/providers";
import { logCallAction, logCommunicationAction, scheduleMeetingAction, sendEmailAction, sendWhatsAppAction, type CommTarget } from "@/lib/communication/actions";
import { Panel, fmtDate, inputCls, label } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { StatusBadge } from "@/components/admin/os";

const Hidden = ({ t }: { t: CommTarget }) => (
  <>
    {Object.entries(t).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v as string} />)}
  </>
);

/** Unified communication timeline + compose for a lead or client. */
export async function CommunicationPanel({ target, role, email, phone }: { target: CommTarget; role: RoleName; email?: string | null; phone?: string | null }) {
  const where: Prisma.CommunicationWhereInput = target.leadId ? { leadId: target.leadId } : { clientId: target.clientId };
  const callWhere: Prisma.CallWhereInput = target.leadId ? { leadId: target.leadId } : { clientId: target.clientId };
  const [comms, calls] = await Promise.all([
    db.communication.findMany({ where, orderBy: { occurredAt: "desc" }, take: 30, include: { user: { select: { name: true } } } }),
    can(role, "calls:view") ? db.call.findMany({ where: callWhere, orderBy: { startedAt: "desc" }, take: 15, include: { user: { select: { name: true } } } }) : Promise.resolve([]),
  ]);
  const items = [
    ...comms.map((c) => ({ id: c.id, at: c.occurredAt, kind: c.channel, dir: c.direction, status: c.status, title: c.subject ?? label(c.channel), body: c.body, who: c.user?.name ?? (c.direction === "INBOUND" ? "Customer" : "System") })),
    ...calls.map((c) => ({ id: c.id, at: c.startedAt, kind: "CALL", dir: c.direction, status: c.status, title: `${label(c.direction)} call${c.durationSec ? ` · ${Math.round(c.durationSec / 60)} min` : ""}${c.outcome ? ` · ${label(c.outcome)}` : ""}`, body: c.notes, who: c.user?.name ?? c.callerName ?? "—" })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const send = can(role, "communication:send");
  return (
    <Panel title="Communication">
      <details className="mb-3">
        <summary className="cursor-pointer text-[13px] font-medium text-brand-blue">Compose / log…</summary>
        <div className="mt-3 space-y-4">
          {send && (
            channelConnected("email") ? (
              <ActionForm action={sendEmailAction} resetOnOk className="space-y-2">
                <Hidden t={target} />
                <input name="to" type="email" required defaultValue={email ?? ""} placeholder="To" aria-label="Email to" className={inputCls} />
                <input name="subject" required maxLength={200} placeholder="Subject" aria-label="Email subject" className={inputCls} />
                <textarea name="body" required rows={4} maxLength={20000} placeholder="Message" aria-label="Email body" className={`${inputCls} h-auto py-2`} />
                <SubmitButton variant="secondary">Send email</SubmitButton>
              </ActionForm>
            ) : <p className="text-xs text-dim">Email: not connected (SMTP / Gmail OAuth).</p>
          )}
          {send && channelConnected("whatsapp") && (
            <ActionForm action={sendWhatsAppAction} resetOnOk className="space-y-2 border-t border-line pt-3">
              <Hidden t={target} />
              <input name="to" defaultValue={phone ?? ""} placeholder="+91…" aria-label="WhatsApp number" className={inputCls} />
              <textarea name="body" required rows={3} maxLength={4000} placeholder="WhatsApp message" aria-label="WhatsApp message" className={`${inputCls} h-auto py-2`} />
              <SubmitButton variant="secondary">Send WhatsApp</SubmitButton>
            </ActionForm>
          )}
          <ActionForm action={logCommunicationAction} resetOnOk className="grid grid-cols-2 gap-2 border-t border-line pt-3">
            <Hidden t={target} />
            <select name="channel" aria-label="Channel" className={inputCls}>{["NOTE", "EMAIL", "WHATSAPP", "MEETING", "SMS"].map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
            <select name="direction" aria-label="Direction" className={inputCls}><option value="OUTBOUND">Outbound</option><option value="INBOUND">Inbound</option><option value="INTERNAL">Internal</option></select>
            <input name="subject" maxLength={200} placeholder="Subject" aria-label="Log subject" className={`${inputCls} col-span-2`} />
            <textarea name="body" required rows={2} maxLength={20000} placeholder="What was discussed?" aria-label="Log details" className={`${inputCls} col-span-2 h-auto py-2`} />
            <SubmitButton variant="secondary">Log conversation</SubmitButton>
          </ActionForm>
          <ActionForm action={scheduleMeetingAction} resetOnOk className="grid grid-cols-2 gap-2 border-t border-line pt-3">
            <Hidden t={target} />
            <input name="subject" required maxLength={200} placeholder="Meeting title" aria-label="Meeting title" className={`${inputCls} col-span-2`} />
            <input name="scheduledAt" type="datetime-local" required aria-label="Meeting time (UTC)" className={inputCls} />
            <input name="durationMin" type="number" defaultValue={30} aria-label="Duration minutes" className={inputCls} />
            <input name="meetingUrl" placeholder="https://meet… (optional)" aria-label="Meeting link" className={`${inputCls} col-span-2`} />
            <SubmitButton variant="secondary">Schedule meeting</SubmitButton>
          </ActionForm>
          {can(role, "calls:view") && (
            <ActionForm action={logCallAction} resetOnOk className="grid grid-cols-2 gap-2 border-t border-line pt-3">
              <Hidden t={target} />
              <select name="direction" aria-label="Call direction" className={inputCls}><option value="OUTBOUND">Outbound call</option><option value="INBOUND">Inbound call</option></select>
              <select name="status" aria-label="Call status" className={inputCls}>{["COMPLETED", "NO_ANSWER", "BUSY", "VOICEMAIL", "MISSED"].map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
              <input name="durationMin" type="number" step="0.5" placeholder="Minutes" aria-label="Call minutes" className={inputCls} />
              <select name="outcome" aria-label="Outcome" className={inputCls}>{["CONNECTED", "INTERESTED", "NOT_INTERESTED", "CALLBACK_REQUESTED", "WRONG_NUMBER", "NO_OUTCOME"].map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
              <input type="hidden" name="toNumber" value={phone ?? ""} />
              <textarea name="notes" rows={2} maxLength={10000} placeholder="Call notes" aria-label="Call notes" className={`${inputCls} col-span-2 h-auto py-2`} />
              <SubmitButton variant="secondary">Log call</SubmitButton>
            </ActionForm>
          )}
        </div>
      </details>
      {items.length === 0 ? <p className="text-sm text-dim">No communication yet.</p> : (
        <ol className="space-y-2.5">
          {items.map((i) => (
            <li key={i.id} className="border-l-2 border-line-strong pl-3 text-sm">
              <p className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-[10.5px] text-dim uppercase">{i.kind}</span><span className="font-medium text-fg">{i.title}</span><StatusBadge value={i.status} /></p>
              {i.body && <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-muted">{i.body}</p>}
              <p className="text-xs text-dim">{label(i.dir)} · {i.who} · {fmtDate(i.at, true)}</p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
