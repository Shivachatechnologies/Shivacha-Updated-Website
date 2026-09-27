import { requirePortalUser } from "@/lib/portal/session";
import { portalMessages } from "@/lib/portal/data";
import { portalSendMessageAction } from "@/lib/portal/actions";
import { PageHeader, Panel, fmtDate, inputCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { PortalForm } from "@/components/portal-forms";

export const metadata = { title: "Messages" };

export default async function PortalMessages() {
  const u = await requirePortalUser();
  const rows = await portalMessages(u);
  return (
    <>
      <PageHeader title="Messages" description="A direct line to your Shivacha account team." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Conversation">
          {rows.length === 0 ? <p className="text-sm text-dim">No messages yet.</p> : (
            <ol className="space-y-3">
              {rows.map((m) => {
                const mine = m.direction === "INBOUND";
                const who = mine ? String((m.meta as Record<string, unknown> | null)?.portalUserName ?? "You") : `${m.user?.name ?? "Shivacha"} · Shivacha`;
                return <li key={m.id} className={`rounded-md border p-3 ${mine ? "border-line" : "border-brand-blue/30 bg-brand-blue/5"}`}><p className="text-sm whitespace-pre-wrap text-fg">{m.body}</p><p className="mt-1 text-xs text-dim">{who} · {fmtDate(m.occurredAt, true)}</p></li>;
              })}
            </ol>
          )}
        </Panel>
        <Panel title="New message">
          <PortalForm action={portalSendMessageAction} className="space-y-2" resetOnOk>
            <input name="subject" maxLength={200} placeholder="Subject (optional)" aria-label="Subject" className={inputCls} />
            <textarea name="body" required rows={5} maxLength={10000} placeholder="Your message" aria-label="Message" className={`${inputCls} h-auto py-2`} />
            <SubmitButton>Send</SubmitButton>
          </PortalForm>
        </Panel>
      </div>
    </>
  );
}
