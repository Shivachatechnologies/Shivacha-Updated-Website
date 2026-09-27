import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { getFlags } from "@/lib/os/flags";
import { CURRENCIES, fmtMoney } from "@/lib/os/money";
import { toDateInput } from "@/lib/os/action";
import { getCatalog } from "@/lib/sales/catalog";
import { extraDiscountOf, linesForEditor } from "@/lib/sales/lines";
import { providerFor } from "@/lib/payments";
import { mailMode } from "@/lib/email/mailer";
import { createPaymentLinkAction, emailInvoiceAction, issueInvoiceAction, saveInvoiceAction, voidInvoiceAction } from "@/lib/finance/actions";
import { PageHeader, Panel, fmtDate, inputCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { KV, NotConnected, SelectField, StatusBadge, TextArea, TextField } from "@/components/admin/os";
import { ActivityPanel } from "@/components/admin/os-panels";
import { LineEditor } from "@/components/admin/sales/line-editor";
import { AiActions } from "@/components/admin/ai/contextual";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccess("finance:view", "FINANCE");
  const { id } = await params;
  const i = await db.invoice.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } }, client: { select: { id: true, name: true, billingEmail: true } }, project: { select: { id: true, number: true } }, deal: { select: { id: true, number: true } }, contract: { select: { id: true, number: true } }, allocations: { include: { payment: { select: { id: true, number: true, status: true, method: true, confirmedAt: true } } } }, creditNotes: { select: { id: true, number: true, amount: true, status: true } } } });
  if (!i) notFound();
  const flags = await getFlags();
  const manage = can(user.role, "finance:manage");
  const editable = manage && i.status === "DRAFT";
  const open = i.status === "ISSUED" || i.status === "PARTIALLY_PAID";
  const overdue = open && i.dueDate && i.dueDate < new Date();
  const provider = providerFor(i.currency);
  const catalog = getCatalog().map(({ kind, slug, name, description }) => ({ kind, slug, name, description }));
  return (
    <>
      <PageHeader
        title={`Invoice ${i.number}`}
        description={`${i.client.name}${i.issueDate ? ` · issued ${fmtDate(i.issueDate)}` : ""}${i.dueDate ? ` · due ${fmtDate(i.dueDate)}` : ""}`}
        crumbs={[{ label: "Invoices", href: "/admin/finance/invoices" }, { label: i.number }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={overdue ? "OVERDUE" : i.status} />
            <a href={`/admin/finance/invoices/${i.id}/pdf`} target="_blank" rel="noopener" className="btn-secondary h-9 px-3 text-[13px]"><FileDown className="size-4" aria-hidden /> PDF</a>
          </div>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          {editable ? (
            <ActionForm action={saveInvoiceAction.bind(null, i.id)} className="space-y-5">
              <Panel title="Details">
                <div className="grid gap-4 sm:grid-cols-3">
                  <SelectField name="currency" label="Currency" defaultValue={i.currency} options={CURRENCIES.map((c) => [c, c] as const)} />
                  <TextField name="dueDate" label="Due date" type="date" defaultValue={toDateInput(i.dueDate)} />
                  <input type="hidden" name="projectId" value={i.projectId ?? ""} />
                  <TextArea name="terms" label="Payment terms" defaultValue={i.terms} rows={2} className="sm:col-span-3" />
                  <TextArea name="notes" label="Notes" defaultValue={i.notes} rows={2} className="sm:col-span-3" />
                </div>
              </Panel>
              <Panel title="Line items"><LineEditor initial={linesForEditor(i.items)} catalog={catalog} currency={i.currency} extraDiscount={extraDiscountOf(i.items, i.discountTotal).toFixed(2)} /></Panel>
              <div className="sticky bottom-0 z-10 flex gap-3 border-t border-line bg-ink-950/95 py-3"><SubmitButton>Save draft</SubmitButton></div>
            </ActionForm>
          ) : (
            <Panel title="Line items">
              <LineEditor readOnly initial={linesForEditor(i.items)} catalog={[]} currency={i.currency} extraDiscount={extraDiscountOf(i.items, i.discountTotal).toFixed(2)} />
              {(i.terms || i.notes) && <div className="mt-4 border-t border-line pt-3 text-sm text-muted"><p className="whitespace-pre-wrap">{i.terms}</p><p className="mt-2 whitespace-pre-wrap">{i.notes}</p></div>}
            </Panel>
          )}
          <Panel title="Payments & credits">
            {i.allocations.length === 0 && i.creditNotes.length === 0 ? <p className="text-sm text-dim">No payments or credits yet.</p> : (
              <ul className="divide-y divide-line text-sm">
                {i.allocations.map((a) => <li key={a.id} className="flex items-center justify-between gap-2 py-2"><Link href={`/admin/finance/payments/${a.payment.id}`} className="font-medium text-fg hover:text-brand-blue">{a.payment.number}</Link><span className="flex items-center gap-2"><span className="tabular-nums">{fmtMoney(a.amount, i.currency)}</span><StatusBadge value={a.payment.status} /></span></li>)}
                {i.creditNotes.map((c) => <li key={c.id} className="flex items-center justify-between gap-2 py-2"><span>{c.number} (credit note)</span><span className="flex items-center gap-2"><span className="tabular-nums">{fmtMoney(c.amount, i.currency)}</span><StatusBadge value={c.status} /></span></li>)}
              </ul>
            )}
            <p className="mt-2 text-xs text-dim">Pending payments are shown but do not reduce the balance until confirmed.</p>
          </Panel>
          <ActivityPanel where={{ invoiceId: i.id }} note={manage ? { kind: "invoice", id: i.id } : undefined} />
        </div>
        <div className="min-w-0 space-y-5">
          <Panel title="Balance">
            <KV cols={2} items={[["Total", fmtMoney(i.total, i.currency)], ["Paid (confirmed)", fmtMoney(i.amountPaid, i.currency)], ["Credited", fmtMoney(i.amountCredited, i.currency)], ["Balance due", <span key="b" className={overdue ? "font-semibold text-red-700" : "font-semibold"}>{i.status === "DRAFT" ? "—" : fmtMoney(i.balanceDue, i.currency)}</span>], ["Client", <Link key="c" href={`/admin/clients/${i.client.id}`} className="text-brand-blue hover:underline">{i.client.name}</Link>], ["Links", [i.project && `Project ${i.project.number}`, i.deal && `Deal ${i.deal.number}`, i.contract && `Contract ${i.contract.number}`].filter(Boolean).join(" · ")]]} />
            {manage && (
              <div className="mt-4 space-y-3 border-t border-line pt-4">
                {i.status === "DRAFT" && <ActionForm action={issueInvoiceAction.bind(null, i.id)}><SubmitButton>Issue invoice</SubmitButton><p className="mt-1 text-xs text-dim">Save your changes first. Issued invoices are locked.</p></ActionForm>}
                {open && <Link href={`/admin/finance/payments/new?clientId=${i.clientId}&invoiceId=${i.id}`} className="btn-primary h-9 px-3.5 text-[13px]">Record payment</Link>}
                {open && (provider ? (
                  <ActionForm action={createPaymentLinkAction.bind(null, i.id)}><SubmitButton variant="secondary">{i.paymentLinkUrl ? `New ${provider.name} link` : `Create ${provider.name} payment link`}</SubmitButton></ActionForm>
                ) : <NotConnected name="Online payment link" env={["STRIPE_SECRET_KEY", "RAZORPAY_KEY_ID"]} />)}
                {i.paymentLinkUrl && <p className="text-xs break-all text-muted">Pay link: <a href={i.paymentLinkUrl} target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline">{i.paymentLinkUrl}</a></p>}
                {(open || i.status === "PAID") && (mailMode() === "none" ? <p className="text-xs text-dim">Email is not configured — download the PDF to send it.</p> : (
                  <ActionForm action={emailInvoiceAction.bind(null, i.id)} className="flex gap-2">
                    <input name="to" type="email" required defaultValue={i.client.billingEmail ?? ""} placeholder="billing@client.com" aria-label="Send to" className={inputCls} />
                    <SubmitButton variant="secondary">Email</SubmitButton>
                  </ActionForm>
                ))}
                {open && can(user.role, "finance:manage") && <Link href={`/admin/finance/credit-notes?clientId=${i.clientId}&invoiceId=${i.id}`} className="block text-xs text-brand-blue hover:underline">Issue a credit note</Link>}
                {i.status !== "VOID" && i.status !== "PAID" && (
                  <details className="text-sm"><summary className="cursor-pointer text-xs text-muted">Void invoice</summary>
                    <ActionForm action={voidInvoiceAction.bind(null, i.id)} className="mt-2 space-y-2">
                      <input name="reason" required maxLength={300} placeholder="Reason" aria-label="Void reason" className={inputCls} />
                      <SubmitButton variant="danger">Void</SubmitButton>
                    </ActionForm>
                  </details>
                )}
              </div>
            )}
          </Panel>
          {flags.AI_WORKFORCE && can(user.role, "ai:execute") && open && <AiActions entity="Invoice" id={i.id} />}
        </div>
      </div>
    </>
  );
}
