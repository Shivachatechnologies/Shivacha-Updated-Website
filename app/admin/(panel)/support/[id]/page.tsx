import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { getFlags } from "@/lib/os/flags";
import { PRIORITIES, TICKET_CATEGORIES, TICKET_STATUSES, slaState } from "@/lib/support/core";
import { replyTicketAction, updateTicketAction } from "@/lib/support/actions";
import { PageHeader, Panel, fmtDate, inputCls, label } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { CheckField, KV, SelectField, StatusBadge, enumOptions, str, userOptions, type SP } from "@/components/admin/os";
import { ActivityPanel, DocumentsPanel } from "@/components/admin/os-panels";
import { AiActions } from "@/components/admin/ai/contextual";

export const metadata = { title: "Ticket" };

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireAccess("support:view", "SUPPORT");
  const { id } = await params;
  const sp = await searchParams;
  const t = await db.ticket.findUnique({ where: { id }, include: { client: { select: { id: true, name: true } }, project: { select: { id: true, name: true } }, portalUser: { select: { name: true, email: true } }, assignee: { select: { name: true } }, messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } }, portalUser: { select: { name: true } } } } } });
  if (!t) notFound();
  const flags = await getFlags();
  const manage = can(user.role, "support:manage");
  const [users, projects] = await Promise.all([db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }), t.clientId ? db.project.findMany({ where: { clientId: t.clientId, deletedAt: null }, select: { id: true, name: true } }) : Promise.resolve([])]);
  const sla = slaState(t);
  return (
    <>
      <PageHeader title={t.subject} description={`${t.number} · ${label(t.source)} · opened ${fmtDate(t.createdAt, true)}`} crumbs={[{ label: "Support", href: "/admin/support" }, { label: t.number }]} actions={<div className="flex flex-wrap gap-2"><StatusBadge value={t.priority} /><StatusBadge value={t.status} /><StatusBadge value={sla === "BREACHED" ? "CRITICAL" : sla === "AT_RISK" ? "HIGH" : "ACTIVE"} text={label(sla)} /></div>} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Conversation">
            <ol className="space-y-3">
              {t.description && <li className="rounded-md border border-line bg-ink-850 p-3"><p className="text-sm whitespace-pre-wrap">{t.description}</p><p className="mt-1 text-xs text-dim">{t.portalUser?.name ?? t.contactName ?? "Requester"} · original request</p></li>}
              {t.messages.map((m) => (
                <li key={m.id} className={`rounded-md border p-3 ${m.internal ? "border-amber-500/40 bg-amber-500/5" : m.portalUser ? "border-line" : "border-brand-blue/30 bg-brand-blue/5"}`}>
                  <p className="text-sm whitespace-pre-wrap text-fg">{m.body}</p>
                  <p className="mt-1 text-xs text-dim">{m.portalUser ? `${m.portalUser.name} (client)` : m.author?.name ?? "Staff"} · {fmtDate(m.createdAt, true)}{m.internal ? " · internal note" : ""}{m.aiDrafted ? " · AI-drafted" : ""}</p>
                </li>
              ))}
            </ol>
            {manage && t.status !== "CLOSED" && (
              <ActionForm action={replyTicketAction.bind(null, t.id)} resetOnOk className="mt-5 space-y-2 border-t border-line pt-4">
                <textarea name="body" required rows={5} maxLength={10000} defaultValue={str(sp, "draft", 10000)} placeholder="Reply to the client, or tick Internal note…" aria-label="Reply" className={`${inputCls} h-auto py-2`} />
                <input type="hidden" name="aiDrafted" value={str(sp, "draft", 1) ? "1" : "0"} />
                <div className="flex flex-wrap items-center gap-4">
                  <CheckField name="internal" label="Internal note (hidden from client)" />
                  {t.contactEmail && !t.portalUser && can(user.role, "communication:send") && <CheckField name="emailContact" label={`Email ${t.contactEmail}`} defaultChecked />}
                  <select name="status" defaultValue="" aria-label="Set status" className="h-8 rounded-md border border-line-strong bg-ink-900 px-2 text-[12.5px]"><option value="">Keep status</option>{["WAITING_FOR_CLIENT", "RESOLVED"].map((s) => <option key={s} value={s}>Set {label(s).toLowerCase()}</option>)}</select>
                  <SubmitButton>Send</SubmitButton>
                </div>
              </ActionForm>
            )}
          </Panel>
          <ActivityPanel where={{ ticketId: t.id }} />
        </div>
        <div className="min-w-0 space-y-5">
          <Panel title="Details">
            <KV cols={2} items={[["Client", t.client ? <Link key="c" href={`/admin/clients/${t.client.id}`} className="text-brand-blue hover:underline">{t.client.name}</Link> : null], ["Contact", t.portalUser ? `${t.portalUser.name} · ${t.portalUser.email}` : [t.contactName, t.contactEmail].filter(Boolean).join(" · ")], ["First response due", fmtDate(t.firstResponseDueAt, true)], ["First response", fmtDate(t.firstResponseAt, true)], ["Resolution due", fmtDate(t.resolutionDueAt, true)], ["Resolved", fmtDate(t.resolvedAt, true)], ["Project", t.project ? <Link key="p" href={`/admin/projects/${t.project.id}`} className="text-brand-blue hover:underline">{t.project.name}</Link> : null], ["Assignee", t.assignee?.name]]} />
            {manage && (
              <ActionForm action={updateTicketAction.bind(null, t.id)} className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
                <SelectField name="status" label="Status" defaultValue={t.status} options={enumOptions(TICKET_STATUSES)} />
                <SelectField name="priority" label="Priority" defaultValue={t.priority} options={enumOptions(PRIORITIES)} />
                <SelectField name="category" label="Category" defaultValue={t.category} options={enumOptions(TICKET_CATEGORIES)} />
                <SelectField name="assigneeId" label="Assignee" blank="Unassigned" defaultValue={t.assigneeId} options={userOptions(users)} />
                <SelectField name="projectId" label="Project" blank="—" defaultValue={t.projectId} options={projects.map((p) => [p.id, p.name] as const)} className="col-span-2" />
                <div className="col-span-2"><SubmitButton variant="secondary">Update ticket</SubmitButton></div>
              </ActionForm>
            )}
          </Panel>
          {flags.AI_WORKFORCE && can(user.role, "ai:execute") && <AiActions entity="Ticket" id={t.id} />}
          <DocumentsPanel target={{ kind: "ticket", id: t.id }} where={{ ticketId: t.id }} canManage={manage} clientVisible={false} />
        </div>
      </div>
    </>
  );
}
