import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { requirePortalUser } from "@/lib/portal/session";
import { portalInvoice } from "@/lib/portal/data";
import { fmtMoney } from "@/lib/os/money";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { KV, StatusBadge } from "@/components/admin/os";

export const metadata = { title: "Invoice" };

export default async function PortalInvoice({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePortalUser();
  const i = await portalInvoice(u, (await params).id);
  if (!i) notFound();
  const payable = (i.status === "ISSUED" || i.status === "PARTIALLY_PAID") && i.balanceDue.greaterThan(0);
  return (
    <>
      <PageHeader title={`Invoice ${i.number}`} crumbs={[{ label: "Invoices", href: "/client/invoices" }, { label: i.number }]} actions={<div className="flex items-center gap-2"><StatusBadge value={i.status} /><a href={`/client/invoices/${i.id}/pdf`} target="_blank" rel="noopener" className="btn-secondary h-9 px-3 text-[13px]"><FileDown className="size-4" aria-hidden /> PDF</a></div>} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Items">
          <ul className="divide-y divide-line text-sm">
            {i.items.map((l) => <li key={l.id} className="flex justify-between gap-3 py-2"><span>{l.name}<span className="block text-xs text-muted">{l.quantity.toString()} × {fmtMoney(l.unitPrice, i.currency)}</span></span><span className="shrink-0 tabular-nums">{fmtMoney(l.amount, i.currency)}</span></li>)}
          </ul>
          <dl className="mt-3 ml-auto max-w-xs space-y-1 border-t border-line pt-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{fmtMoney(i.subtotal, i.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd className="tabular-nums">{fmtMoney(i.taxTotal, i.currency)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Total</dt><dd className="tabular-nums">{fmtMoney(i.total, i.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd className="tabular-nums">{fmtMoney(i.amountPaid, i.currency)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd className="tabular-nums">{fmtMoney(i.balanceDue, i.currency)}</dd></div>
          </dl>
        </Panel>
        <div className="space-y-5">
          <Panel title="Details"><KV cols={1} items={[["Issued", fmtDate(i.issueDate)], ["Due", fmtDate(i.dueDate)], ["Terms", i.terms]]} /></Panel>
          {payable && (
            <Panel title="Pay">
              {i.paymentLinkUrl ? <a href={i.paymentLinkUrl} target="_blank" rel="noopener noreferrer" className="btn-primary h-10 w-full px-3.5 text-[13px]">Pay {fmtMoney(i.balanceDue, i.currency)} online</a> : <p className="text-sm text-muted">Pay by bank transfer using the details on the invoice PDF, quoting {i.number}. Payments appear here once confirmed.</p>}
            </Panel>
          )}
          {i.allocations.length > 0 && <Panel title="Payments received"><ul className="space-y-1 text-sm">{i.allocations.map((a) => <li key={a.id} className="flex justify-between"><span>{a.payment.number} · {fmtDate(a.payment.confirmedAt)}</span><span className="tabular-nums">{fmtMoney(a.amount, i.currency)}</span></li>)}</ul></Panel>}
        </div>
      </div>
    </>
  );
}
