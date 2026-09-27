import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { CURRENCIES, fmtMoney } from "@/lib/os/money";
import { toDateInput } from "@/lib/os/action";
import { getCatalog } from "@/lib/sales/catalog";
import { extraDiscountOf, linesForEditor } from "@/lib/sales/lines";
import { archiveQuoteAction, reviseQuoteAction, saveQuoteAction, setQuoteStatusAction } from "@/lib/sales/quote-actions";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { KV, SelectField, StatusBadge, TextArea, TextField } from "@/components/admin/os";
import { ActivityPanel } from "@/components/admin/os-panels";
import { LineEditor } from "@/components/admin/sales/line-editor";

export const metadata = { title: "Quote" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccess("proposals:view", "PROPOSALS");
  const { id } = await params;
  const q = await db.quote.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } }, client: { select: { id: true, name: true } }, deal: { select: { id: true, number: true } } } });
  if (!q || q.deletedAt) notFound();
  const versions = await db.documentVersion.findMany({ where: { entity: "QUOTE", entityId: q.id }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], take: 20 });
  const manage = can(user.role, "proposals:manage");
  const editable = manage && q.status === "DRAFT";
  const catalog = getCatalog().map(({ kind, slug, name, description }) => ({ kind, slug, name, description }));
  return (
    <>
      <PageHeader
        title={q.title}
        description={`${q.number} · version ${q.version}${q.client ? ` · ${q.client.name}` : ""}`}
        crumbs={[{ label: "Quotes", href: "/admin/quotes" }, { label: q.number }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={q.status} />
            <a href={`/admin/quotes/${q.id}/pdf`} target="_blank" rel="noopener" className="btn-secondary h-9 px-3 text-[13px]"><FileDown className="size-4" aria-hidden /> PDF</a>
            {manage && <form action={archiveQuoteAction.bind(null, q.id)}><ConfirmButton message="Archive this quote? Versions are kept.">Archive</ConfirmButton></form>}
          </div>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {editable ? (
            <ActionForm action={saveQuoteAction.bind(null, q.id)} className="space-y-5">
              <Panel title="Details">
                <div className="grid gap-4 sm:grid-cols-3">
                  <TextField name="title" label="Title" required defaultValue={q.title} className="sm:col-span-3" />
                  <SelectField name="currency" label="Currency" defaultValue={q.currency} options={CURRENCIES.map((x) => [x, x] as const)} />
                  <TextField name="validUntil" label="Valid until" type="date" defaultValue={toDateInput(q.validUntil)} />
                  <TextField name="paymentTerms" label="Payment terms" defaultValue={q.paymentTerms} maxLength={200} />
                  <TextArea name="notes" label="Notes" defaultValue={q.notes} rows={3} className="sm:col-span-3" />
                </div>
              </Panel>
              <Panel title="Items">
                <LineEditor initial={linesForEditor(q.items)} catalog={catalog} currency={q.currency} extraDiscount={extraDiscountOf(q.items, q.discountTotal).toFixed(2)} />
              </Panel>
              <div className="sticky bottom-0 z-10 flex gap-3 border-t border-line bg-ink-950/95 py-3"><SubmitButton>Save quote</SubmitButton></div>
            </ActionForm>
          ) : (
            <Panel title="Items">
              <KV cols={3} items={[["Valid until", fmtDate(q.validUntil)], ["Payment terms", q.paymentTerms], ["Notes", q.notes]]} />
              <div className="mt-4"><LineEditor readOnly initial={linesForEditor(q.items)} catalog={[]} currency={q.currency} extraDiscount={extraDiscountOf(q.items, q.discountTotal).toFixed(2)} /></div>
            </Panel>
          )}
          <ActivityPanel where={{ quoteId: q.id }} note={manage ? { kind: "quote", id: q.id } : undefined} />
        </div>
        <div className="min-w-0 space-y-5">
          <Panel title="Status">
            <KV cols={2} items={[["Total", fmtMoney(q.total, q.currency)], ["Status", <StatusBadge key="s" value={q.status} />], ["Sent", fmtDate(q.sentAt)], ["Decided", fmtDate(q.decidedAt)], ["Deal", q.deal ? <Link key="d" className="text-brand-blue hover:underline" href={`/admin/deals/${q.deal.id}`}>{q.deal.number}</Link> : null], ["Client", q.client ? <Link key="c" className="text-brand-blue hover:underline" href={`/admin/clients/${q.client.id}`}>{q.client.name}</Link> : null]]} />
            {manage && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                {q.status === "DRAFT" && <ActionForm action={setQuoteStatusAction.bind(null, q.id, "SENT")}><SubmitButton>Mark as sent</SubmitButton></ActionForm>}
                {q.status === "SENT" && (["ACCEPTED", "REJECTED", "EXPIRED"] as const).map((s) => <ActionForm key={s} action={setQuoteStatusAction.bind(null, q.id, s)}><SubmitButton variant="secondary">Mark {s.toLowerCase()}</SubmitButton></ActionForm>)}
                {["SENT", "REJECTED", "EXPIRED"].includes(q.status) && <ActionForm action={reviseQuoteAction.bind(null, q.id)}><SubmitButton variant="secondary">New version</SubmitButton></ActionForm>}
                {q.status === "ACCEPTED" && q.clientId && can(user.role, "finance:manage") && <Link href={`/admin/finance/invoices/new?quoteId=${q.id}`} className="btn-primary h-9 px-3.5 text-[13px]">Create invoice</Link>}
              </div>
            )}
          </Panel>
          <Panel title="Versions">
            {versions.length === 0 ? <p className="text-sm text-dim">Saved when the quote is sent or decided.</p> : (
              <ul className="space-y-1.5 text-sm">{versions.map((v) => <li key={v.id} className="flex justify-between gap-2"><span>v{v.version} · <span className="text-muted">{v.note}</span></span><span className="text-xs text-dim">{fmtDate(v.createdAt)}</span></li>)}</ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
