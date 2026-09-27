import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { fmtMoney } from "@/lib/os/money";
import { completeRefundAction, confirmPaymentAction, failPaymentAction, requestRefundAction } from "@/lib/finance/actions";
import { PageHeader, Panel, fmtDate, inputCls, label } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { KV, StatusBadge } from "@/components/admin/os";

export const metadata = { title: "Payment" };

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccess("finance:view", "FINANCE");
  const { id } = await params;
  const p = await db.payment.findUnique({ where: { id }, include: { client: { select: { id: true, name: true } }, confirmedBy: { select: { name: true } }, allocations: { include: { invoice: { select: { id: true, number: true, status: true, balanceDue: true } } } }, refunds: { orderBy: { createdAt: "desc" } } } });
  if (!p) notFound();
  const creator = p.createdById ? await db.user.findUnique({ where: { id: p.createdById }, select: { name: true } }) : null;
  const refundable = p.amount.minus(p.refundedAmount).minus(p.refunds.filter((r) => r.status === "REQUESTED" || r.status === "PROCESSING").reduce((s, r) => s.plus(r.amount), p.amount.minus(p.amount)));
  return (
    <>
      <PageHeader title={`Payment ${p.number}`} description={`${p.client.name} · ${fmtMoney(p.amount, p.currency)}`} crumbs={[{ label: "Payments", href: "/admin/finance/payments" }, { label: p.number }]} actions={<StatusBadge value={p.status} />} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Details">
            <KV cols={3} items={[["Amount", fmtMoney(p.amount, p.currency)], ["Refunded", fmtMoney(p.refundedAmount, p.currency)], ["Method", label(p.method)], ["Source", label(p.provider)], ["Provider ref", p.providerRef], ["Reference", p.reference], ["Received", fmtDate(p.receivedAt)], ["Recorded by", creator?.name ?? (p.provider !== "MANUAL" ? "Provider webhook" : "—")], ["Confirmed", p.confirmedAt ? `${fmtDate(p.confirmedAt, true)} · ${p.confirmedBy?.name ?? "verified webhook"}` : "Not yet"], ["Client", <Link key="c" href={`/admin/clients/${p.client.id}`} className="text-brand-blue hover:underline">{p.client.name}</Link>]]} />
            {p.notes && <p className="mt-4 border-t border-line pt-3 text-sm whitespace-pre-wrap text-muted">{p.notes}</p>}
          </Panel>
          <Panel title="Applied to">
            {p.allocations.length === 0 ? <p className="text-sm text-dim">Not allocated to any invoice.</p> : <ul className="divide-y divide-line text-sm">{p.allocations.map((a) => <li key={a.id} className="flex items-center justify-between gap-2 py-2"><Link href={`/admin/finance/invoices/${a.invoice.id}`} className="font-medium text-fg hover:text-brand-blue">{a.invoice.number}</Link><span className="flex items-center gap-2"><span className="tabular-nums">{fmtMoney(a.amount, p.currency)}</span><StatusBadge value={a.invoice.status} /></span></li>)}</ul>}
          </Panel>
          <Panel title="Refunds">
            {p.refunds.length === 0 ? <p className="text-sm text-dim">No refunds.</p> : (
              <ul className="divide-y divide-line text-sm">
                {p.refunds.map((r) => (
                  <li key={r.id} className="py-2">
                    <div className="flex items-center justify-between gap-2"><span>{fmtMoney(r.amount, p.currency)} · {r.reason}</span><StatusBadge value={r.status} /></div>
                    <p className="text-xs text-dim">{fmtDate(r.createdAt, true)}{r.providerRef ? ` · ref ${r.providerRef}` : ""}</p>
                    {r.status === "REQUESTED" && can(user.role, "refunds:issue") && (
                      <ActionForm action={completeRefundAction.bind(null, r.id)} className="mt-2 flex gap-2">
                        <input name="reference" required maxLength={200} placeholder="Bank reference of the refund" aria-label="Refund reference" className={inputCls} />
                        <SubmitButton variant="secondary">Mark completed</SubmitButton>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className="min-w-0 space-y-5">
          {p.status === "PENDING" && p.provider === "MANUAL" && can(user.role, "payments:confirm") && (
            <Panel title="Confirm receipt" className="border-emerald-500/30">
              <ActionForm action={confirmPaymentAction.bind(null, p.id)} className="space-y-2">
                <p className="text-xs text-muted">Only confirm after the money is visible in the bank account or processor.{p.createdById === user.id ? " You recorded this payment — confirming it yourself is audited." : ""}</p>
                <input name="evidence" required maxLength={300} placeholder="Evidence (e.g. bank statement line, date)" aria-label="Evidence" className={inputCls} />
                <SubmitButton>Confirm payment</SubmitButton>
              </ActionForm>
              <ActionForm action={failPaymentAction.bind(null, p.id)} className="mt-4 space-y-2 border-t border-line pt-3">
                <input name="reason" required maxLength={300} placeholder="Why did it fail?" aria-label="Failure reason" className={inputCls} />
                <SubmitButton variant="secondary">Mark failed</SubmitButton>
              </ActionForm>
            </Panel>
          )}
          {["CONFIRMED", "PARTIALLY_REFUNDED"].includes(p.status) && can(user.role, "refunds:issue") && refundable.greaterThan(0) && (
            <Panel title="Refund">
              <ActionForm action={requestRefundAction.bind(null, p.id)} className="space-y-2">
                <input name="amount" required defaultValue={refundable.toFixed(2)} aria-label="Refund amount" className={inputCls} />
                <input name="reason" required maxLength={300} placeholder="Reason" aria-label="Refund reason" className={inputCls} />
                <SubmitButton variant="secondary">{p.provider === "MANUAL" ? "Request refund" : `Refund via ${label(p.provider)}`}</SubmitButton>
                <p className="text-xs text-dim">Up to {fmtMoney(refundable, p.currency)}. {p.provider === "MANUAL" ? "Manual refunds count once marked completed with a reference." : "Issued through the provider immediately."}</p>
              </ActionForm>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
