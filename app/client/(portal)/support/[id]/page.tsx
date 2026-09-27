import { notFound } from "next/navigation";
import { requirePortalUser } from "@/lib/portal/session";
import { portalTicket } from "@/lib/portal/data";
import { portalReplyTicketAction } from "@/lib/portal/actions";
import { PageHeader, Panel, fmtDate, inputCls, label } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { StatusBadge } from "@/components/admin/os";
import { PortalForm } from "@/components/portal-forms";

export const metadata = { title: "Ticket" };

export default async function PortalTicket({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePortalUser();
  const t = await portalTicket(u, (await params).id);
  if (!t) notFound();
  return (
    <>
      <PageHeader title={t.subject} description={`${t.number} · ${label(t.category)} · opened ${fmtDate(t.createdAt, true)}`} crumbs={[{ label: "Support", href: "/client/support" }, { label: t.number }]} actions={<div className="flex gap-2"><StatusBadge value={t.priority} /><StatusBadge value={t.status} /></div>} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Panel title="Conversation">
          <ol className="space-y-4">
            {t.description && <li className="rounded-md border border-line bg-ink-850 p-3"><p className="text-sm whitespace-pre-wrap">{t.description}</p><p className="mt-1 text-xs text-dim">Original request</p></li>}
            {t.messages.map((m) => (
              <li key={m.id} className={`rounded-md border p-3 ${m.portalUser ? "border-line" : "border-brand-blue/30 bg-brand-blue/5"}`}>
                <p className="text-sm whitespace-pre-wrap text-fg">{m.body}</p>
                <p className="mt-1 text-xs text-dim">{m.portalUser?.name ?? `${m.author?.name ?? "Shivacha"} · Shivacha`} · {fmtDate(m.createdAt, true)}</p>
              </li>
            ))}
          </ol>
          {t.status !== "CLOSED" && (
            <PortalForm action={portalReplyTicketAction.bind(null, t.id)} className="mt-5 space-y-2 border-t border-line pt-4" resetOnOk>
              <textarea name="body" required rows={4} maxLength={10000} placeholder="Write a reply…" aria-label="Reply" className={`${inputCls} h-auto py-2`} />
              <input name="files" type="file" multiple aria-label="Attachments" className={`${inputCls} h-auto py-1.5 text-xs`} />
              <SubmitButton>Send reply</SubmitButton>
            </PortalForm>
          )}
        </Panel>
        <Panel title="Attachments">
          {t.documents.length === 0 ? <p className="text-sm text-dim">None.</p> : <ul className="space-y-1.5 text-sm">{t.documents.map((d) => <li key={d.id}><a href={`/client/documents/${d.id}/download`} className="text-brand-blue hover:underline">{d.name}</a></li>)}</ul>}
        </Panel>
      </div>
    </>
  );
}
