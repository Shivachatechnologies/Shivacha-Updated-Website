import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { getFlags } from "@/lib/os/flags";
import { byCurrency, fmtMoney, fmtMulti } from "@/lib/os/money";
import { archiveClientAction, replyPortalMessageAction, saveContactAction, updateClientAction } from "@/lib/clients/actions";
import { PageHeader, Panel, fmtDate, inputCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { KV, Kpi, KpiGrid, StatusBadge, Tabs, str, type SP } from "@/components/admin/os";
import { ActivityPanel, DocumentsPanel, RelatedList } from "@/components/admin/os-panels";
import { ClientForm } from "@/components/admin/clients/client-form";
import { AiActions } from "@/components/admin/ai/contextual";
import { CommunicationPanel } from "@/components/admin/comms/panel";

export const metadata = { title: "Client" };

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireAccess("clients:view");
  const { id } = await params;
  const tab = str(await searchParams, "tab", 20) || "overview";
  const c = await db.client.findUnique({ where: { id }, include: { accountOwner: { select: { name: true } }, contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] }, lead: { select: { id: true, ref: true } }, _count: { select: { portalUsers: true } } } });
  if (!c || c.deletedAt) notFound();
  const flags = await getFlags();
  const manage = can(user.role, "clients:manage");
  const seeFinance = flags.FINANCE && can(user.role, "finance:view");
  const now = new Date();
  const [deals, proposals, quotes, contracts, projects, invoices, payments, tickets] = await Promise.all([
    can(user.role, "deals:view") ? db.deal.findMany({ where: { clientId: id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, name: true, stage: true, value: true, currency: true } }) : [],
    can(user.role, "proposals:view") ? db.proposal.findMany({ where: { clientId: id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, title: true, status: true, total: true, currency: true } }) : [],
    can(user.role, "proposals:view") ? db.quote.findMany({ where: { clientId: id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, title: true, status: true, total: true, currency: true } }) : [],
    can(user.role, "contracts:view") ? db.contract.findMany({ where: { clientId: id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, title: true, status: true, value: true, currency: true, renewalDate: true } }) : [],
    can(user.role, "projects:view") ? db.project.findMany({ where: { clientId: id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, name: true, status: true, progress: true } }) : [],
    seeFinance ? db.invoice.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, number: true, status: true, total: true, balanceDue: true, currency: true, dueDate: true } }) : [],
    seeFinance ? db.payment.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, number: true, status: true, amount: true, refundedAmount: true, currency: true, confirmedAt: true } }) : [],
    can(user.role, "support:view") ? db.ticket.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, subject: true, status: true, priority: true } }) : [],
  ]);
  const confirmed = payments.filter((p) => p.status === "CONFIRMED" || p.status === "PARTIALLY_REFUNDED");
  const ltv = byCurrency(confirmed, (p) => p.currency, (p) => p.amount.minus(p.refundedAmount));
  const open = invoices.filter((i) => i.status === "ISSUED" || i.status === "PARTIALLY_PAID");
  const outstanding = byCurrency(open, (i) => i.currency, (i) => i.balanceDue);
  const overdue = open.filter((i) => i.dueDate && i.dueDate < now);
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "commercial", label: "Deals & proposals", count: deals.length + proposals.length + quotes.length + contracts.length },
    { key: "delivery", label: "Projects & support", count: projects.length + tickets.length },
    ...(seeFinance ? [{ key: "finance", label: "Invoices & payments", count: invoices.length }] : []),
    { key: "messages", label: "Portal messages" },
    { key: "documents", label: "Documents" },
    { key: "timeline", label: "Timeline" },
  ].map((t) => ({ ...t, href: `/admin/clients/${id}${t.key === "overview" ? "" : `?tab=${t.key}`}` }));

  return (
    <>
      <PageHeader
        title={c.name}
        description={`${c.number}${c.industry ? ` · ${c.industry}` : ""}${c.country ? ` · ${c.country}` : ""} · owner ${c.accountOwner?.name ?? "—"}`}
        crumbs={[{ label: "Clients", href: "/admin/clients" }, { label: c.number }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={c.status} />
            {can(user.role, "deals:manage") && <Link href={`/admin/deals/new?clientId=${c.id}`} className="btn-secondary h-9 px-3 text-[13px]">New deal</Link>}
            {can(user.role, "projects:manage") && <Link href={`/admin/projects/new?clientId=${c.id}`} className="btn-secondary h-9 px-3 text-[13px]">New project</Link>}
            {can(user.role, "finance:manage") && <Link href={`/admin/finance/invoices/new?clientId=${c.id}`} className="btn-secondary h-9 px-3 text-[13px]">New invoice</Link>}
          </div>
        }
      />
      <div className="mb-5">
        <KpiGrid cols={5}>
          <Kpi label="Lifetime value" value={seeFinance ? fmtMulti(ltv, true) : "—"} hint="Confirmed payments, net of refunds" tone="green" />
          <Kpi label="Outstanding" value={seeFinance ? fmtMulti(outstanding, true) : "—"} hint={`${open.length} open invoices`} />
          <Kpi label="Overdue invoices" value={seeFinance ? overdue.length : "—"} tone={overdue.length ? "red" : undefined} />
          <Kpi label="Active projects" value={projects.filter((p) => p.status === "ACTIVE" || p.status === "PLANNED").length} />
          <Kpi label="Open tickets" value={tickets.filter((t) => !["RESOLVED", "CLOSED"].includes(t.status)).length} />
        </KpiGrid>
      </div>
      <Tabs items={tabs} active={tab} />

      {tab === "overview" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-5">
            <Panel title="Account">
              <KV cols={3} items={[["Legal name", c.legalName], ["Website", c.website ? <a key="w" className="text-brand-blue hover:underline" href={c.website} target="_blank" rel="noopener noreferrer nofollow">{c.website}</a> : null], ["Billing email", c.billingEmail], ["Phone", c.phone], ["Tax ID", c.taxId], ["Currency", c.currency], ["City", c.city], ["Client since", fmtDate(c.createdAt)], ["Source lead", c.lead ? <Link key="l" className="text-brand-blue hover:underline" href={`/admin/leads/${c.lead.id}`}>{c.lead.ref}</Link> : null], ["Address", c.address], ["Tags", c.tags.join(", ")], ["Portal users", c._count.portalUsers]]} />
              {c.notes && <p className="mt-4 border-t border-line pt-3 text-sm whitespace-pre-wrap text-muted">{c.notes}</p>}
            </Panel>
            {manage && <Panel title="Edit client"><ClientForm action={updateClientAction.bind(null, c.id)} c={c} submit="Save client" /></Panel>}
          </div>
          <div className="min-w-0 space-y-5">
            {flags.AI_WORKFORCE && can(user.role, "ai:execute") && <AiActions entity="Client" id={c.id} />}
            {flags.COMMUNICATION && can(user.role, "communication:view") && <CommunicationPanel target={{ clientId: c.id }} role={user.role} email={c.contacts[0]?.email ?? c.billingEmail} phone={c.contacts[0]?.phone ?? c.phone} />}
            <Panel title={`Contacts (${c.contacts.length})`}>
              <ul className="divide-y divide-line">
                {c.contacts.map((ct) => (
                  <li key={ct.id} className="py-2.5 text-sm">
                    <p className="font-medium text-fg">{ct.name} {ct.isPrimary && <StatusBadge value="ACTIVE" text="Primary" />}</p>
                    <p className="text-xs text-muted">{[ct.title, ct.email, ct.phone].filter(Boolean).join(" · ")}</p>
                    {manage && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-brand-blue">Edit</summary>
                        <ActionForm action={saveContactAction.bind(null, c.id, ct.id)} className="mt-2 grid gap-2">
                          <input name="name" defaultValue={ct.name} required aria-label="Name" className={inputCls} />
                          <input name="title" defaultValue={ct.title ?? ""} placeholder="Title" aria-label="Title" className={inputCls} />
                          <input name="email" defaultValue={ct.email ?? ""} placeholder="Email" aria-label="Email" className={inputCls} />
                          <input name="phone" defaultValue={ct.phone ?? ""} placeholder="Phone" aria-label="Phone" className={inputCls} />
                          <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="isPrimary" defaultChecked={ct.isPrimary} /> Primary contact</label>
                          <SubmitButton variant="secondary">Save contact</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
              {manage && (
                <ActionForm action={saveContactAction.bind(null, c.id, null)} resetOnOk className="mt-3 grid gap-2 border-t border-line pt-3">
                  <input name="name" required placeholder="Name" aria-label="New contact name" className={inputCls} />
                  <div className="grid grid-cols-2 gap-2">
                    <input name="email" placeholder="Email" aria-label="New contact email" className={inputCls} />
                    <input name="phone" placeholder="Phone" aria-label="New contact phone" className={inputCls} />
                  </div>
                  <input name="title" placeholder="Title" aria-label="New contact title" className={inputCls} />
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="isPrimary" /> Primary contact</label>
                  <SubmitButton variant="secondary">Add contact</SubmitButton>
                </ActionForm>
              )}
            </Panel>
            {manage && (
              <Panel title="Archive">
                <ActionForm action={archiveClientAction.bind(null, c.id)}>
                  <p className="mb-2 text-xs text-dim">Hides the client and disables portal access. Nothing is deleted.</p>
                  <SubmitButton variant="secondary">Archive client</SubmitButton>
                </ActionForm>
              </Panel>
            )}
          </div>
        </div>
      )}

      {tab === "commercial" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <RelatedList title="Deals" empty="No deals." items={deals.map((d) => ({ id: d.id, href: `/admin/deals/${d.id}`, label: `${d.number} · ${d.name}`, right: fmtMoney(d.value, d.currency, { compact: true }), status: d.stage }))} />
          <RelatedList title="Proposals" empty="No proposals." items={proposals.map((d) => ({ id: d.id, href: `/admin/proposals/${d.id}`, label: `${d.number} · ${d.title}`, right: fmtMoney(d.total, d.currency, { compact: true }), status: d.status }))} />
          <RelatedList title="Quotes" empty="No quotes." items={quotes.map((d) => ({ id: d.id, href: `/admin/quotes/${d.id}`, label: `${d.number} · ${d.title}`, right: fmtMoney(d.total, d.currency, { compact: true }), status: d.status }))} />
          <RelatedList title="Contracts" empty="No contracts." items={contracts.map((d) => ({ id: d.id, href: `/admin/contracts/${d.id}`, label: `${d.number} · ${d.title}`, right: d.renewalDate ? `renews ${fmtDate(d.renewalDate)}` : fmtMoney(d.value, d.currency, { compact: true }), status: d.status }))} />
        </div>
      )}
      {tab === "delivery" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <RelatedList title="Projects" empty="No projects." items={projects.map((d) => ({ id: d.id, href: `/admin/projects/${d.id}`, label: `${d.number} · ${d.name}`, right: `${d.progress}%`, status: d.status }))} />
          <RelatedList title="Tickets" empty="No tickets." items={tickets.map((d) => ({ id: d.id, href: `/admin/support/${d.id}`, label: `${d.number} · ${d.subject}`, right: d.priority.toLowerCase(), status: d.status }))} />
        </div>
      )}
      {tab === "finance" && seeFinance && (
        <div className="grid gap-5 lg:grid-cols-2">
          <RelatedList title="Invoices" empty="No invoices." items={invoices.map((d) => ({ id: d.id, href: `/admin/finance/invoices/${d.id}`, label: d.number, right: `${fmtMoney(d.total, d.currency, { compact: true })}${d.balanceDue.greaterThan(0) && d.status !== "DRAFT" && d.status !== "VOID" ? ` · due ${fmtMoney(d.balanceDue, d.currency, { compact: true })}` : ""}`, status: (d.status === "ISSUED" || d.status === "PARTIALLY_PAID") && d.dueDate && d.dueDate < now ? "OVERDUE" : d.status }))} />
          <RelatedList title="Payments" empty="No payments." items={payments.map((d) => ({ id: d.id, href: `/admin/finance/payments/${d.id}`, label: d.number, right: fmtMoney(d.amount, d.currency, { compact: true }), status: d.status }))} />
        </div>
      )}
      {tab === "messages" && <PortalMessages clientId={c.id} canReply={manage} />}
      {tab === "documents" && <DocumentsPanel target={{ kind: "client", id: c.id }} where={{ clientId: c.id }} canManage={manage} />}
      {tab === "timeline" && <ActivityPanel where={{ clientId: c.id }} note={manage ? { kind: "client", id: c.id } : undefined} take={150} />}
    </>
  );
}

async function PortalMessages({ clientId, canReply }: { clientId: string; canReply: boolean }) {
  const rows = await db.communication.findMany({ where: { clientId, provider: "portal" }, orderBy: { occurredAt: "desc" }, take: 100, include: { user: { select: { name: true } } } });
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Panel title="Thread">
        {rows.length === 0 ? <p className="text-sm text-dim">No portal messages yet.</p> : (
          <ol className="space-y-3">
            {rows.map((m) => (
              <li key={m.id} className={`rounded-md border p-3 ${m.direction === "INBOUND" ? "border-line" : "border-brand-blue/30 bg-brand-blue/5"}`}>
                <p className="text-sm whitespace-pre-wrap text-fg">{m.body}</p>
                <p className="mt-1 text-xs text-dim">{m.direction === "INBOUND" ? `${String((m.meta as Record<string, unknown> | null)?.portalUserName ?? m.fromAddress ?? "Client")} (client)` : m.user?.name ?? "Staff"} · {fmtDate(m.occurredAt, true)}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
      {canReply && (
        <Panel title="Reply">
          <ActionForm action={replyPortalMessageAction.bind(null, clientId)} resetOnOk className="space-y-2">
            <textarea name="body" required rows={5} maxLength={10000} aria-label="Reply" className={`${inputCls} h-auto py-2`} />
            <SubmitButton>Post to portal</SubmitButton>
          </ActionForm>
        </Panel>
      )}
    </div>
  );
}
