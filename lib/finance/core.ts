import "server-only";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { D, ZERO, round2 } from "@/lib/os/money";
import { logActivity } from "@/lib/os/activity";

type Tx = Prisma.TransactionClient;

/** Payments that count as money actually received. */
export const COUNTED_PAYMENT = ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"] as const;

/**
 * Recomputes an invoice from its confirmed allocations and issued credit notes.
 * Refunds reduce what a payment contributed, pro rata across the invoices it paid.
 * Never marks anything paid from unconfirmed data.
 */
export async function recalcInvoice(invoiceId: string, tx: Tx) {
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { allocations: { include: { payment: { select: { status: true, amount: true, refundedAmount: true } } } }, creditNotes: { where: { status: { in: ["ISSUED", "APPLIED"] } }, select: { amount: true } } } });
  if (!inv) return null;
  let paid = ZERO;
  for (const a of inv.allocations) {
    if (!(COUNTED_PAYMENT as readonly string[]).includes(a.payment.status)) continue;
    const share = a.payment.amount.greaterThan(0) ? new D(1).minus(a.payment.refundedAmount.dividedBy(a.payment.amount)) : new D(0);
    paid = paid.plus(a.amount.times(share));
  }
  paid = round2(paid);
  const credited = round2(inv.creditNotes.reduce((s, c) => s.plus(c.amount), ZERO));
  const balance = D.max(ZERO, round2(inv.total.minus(paid).minus(credited)));
  let status = inv.status;
  if (inv.status !== "DRAFT" && inv.status !== "VOID") status = balance.lessThanOrEqualTo(0) && inv.total.greaterThan(0) ? "PAID" : paid.plus(credited).greaterThan(0) ? "PARTIALLY_PAID" : "ISSUED";
  const updated = await tx.invoice.update({ where: { id: invoiceId }, data: { amountPaid: paid, amountCredited: credited, balanceDue: inv.status === "DRAFT" ? inv.total : balance, status, paidAt: status === "PAID" ? (inv.paidAt ?? new Date()) : null } });
  if (updated.dealId) await syncDealPayment(updated.dealId, tx);
  return updated;
}

/** Deal payment status from its invoices. */
async function syncDealPayment(dealId: string, tx: Tx) {
  const invs = await tx.invoice.findMany({ where: { dealId, status: { notIn: ["DRAFT", "VOID"] } }, select: { status: true } });
  const state = !invs.length ? "NOT_INVOICED" : invs.every((i) => i.status === "PAID") ? "PAID" : invs.some((i) => i.status === "PAID" || i.status === "PARTIALLY_PAID") ? "PARTIALLY_PAID" : "INVOICED";
  await tx.deal.update({ where: { id: dealId }, data: { paymentStatus: state } });
}

/**
 * Confirms a payment (manual receipt verified by finance, or a provider webhook with a verified signature),
 * then recomputes every invoice it pays — in the caller's transaction.
 */
export async function confirmPaymentTx(paymentId: string, confirmedById: string | null, tx: Tx, source: string) {
  const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { allocations: true } });
  if (!p) throw new Error("Payment not found.");
  if (p.status === "CONFIRMED" || p.status === "PARTIALLY_REFUNDED" || p.status === "REFUNDED") return { payment: p, already: true };
  if (p.status !== "PENDING") throw new Error(`A ${p.status.toLowerCase()} payment cannot be confirmed.`);
  const allocated = p.allocations.reduce((s, a) => s.plus(a.amount), ZERO);
  if (allocated.greaterThan(p.amount)) throw new Error("Allocations exceed the payment amount.");
  const payment = await tx.payment.update({ where: { id: paymentId }, data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById, receivedAt: p.receivedAt ?? new Date() } });
  for (const a of p.allocations) {
    const inv = await recalcInvoice(a.invoiceId, tx);
    await logActivity({ type: "PAYMENT", summary: `Payment ${p.number} confirmed (${source}) — ${a.amount.toFixed(2)} ${p.currency} applied`, actorId: confirmedById, invoiceId: a.invoiceId, clientId: p.clientId, dealId: inv?.dealId }, tx);
  }
  return { payment, already: false };
}

/** Finance KPIs from real records, per currency. */
export async function financeSummary(range: { from?: Date; to?: Date }) {
  const from = range.from ?? new Date("2000-01-01T00:00:00Z");
  const to = range.to ?? new Date("2999-01-01T00:00:00Z");
  const now = new Date();
  const [collected, outstanding, overdue, draft, refunds, expenses, pendingPayments] = await Promise.all([
    db.$queryRaw<{ currency: string; amount: Prisma.Decimal; n: bigint }[]>`
      SELECT currency::text, sum(amount - "refundedAmount") AS amount, count(*) AS n FROM "Payment"
      WHERE status::text IN ('CONFIRMED','PARTIALLY_REFUNDED','REFUNDED') AND "confirmedAt" BETWEEN ${from} AND ${to} GROUP BY currency`,
    db.$queryRaw<{ currency: string; amount: Prisma.Decimal; n: bigint }[]>`
      SELECT currency::text, sum("balanceDue") AS amount, count(*) AS n FROM "Invoice" WHERE status::text IN ('ISSUED','PARTIALLY_PAID') GROUP BY currency`,
    db.$queryRaw<{ currency: string; amount: Prisma.Decimal; n: bigint }[]>`
      SELECT currency::text, sum("balanceDue") AS amount, count(*) AS n FROM "Invoice" WHERE status::text IN ('ISSUED','PARTIALLY_PAID') AND "dueDate" < ${now} GROUP BY currency`,
    db.invoice.count({ where: { status: "DRAFT" } }),
    db.$queryRaw<{ currency: string; amount: Prisma.Decimal }[]>`
      SELECT p.currency::text, sum(r.amount) AS amount FROM "Refund" r JOIN "Payment" p ON p.id = r."paymentId"
      WHERE r.status = 'COMPLETED' AND r."completedAt" BETWEEN ${from} AND ${to} GROUP BY p.currency`,
    db.$queryRaw<{ currency: string; amount: Prisma.Decimal }[]>`
      SELECT currency::text, sum(amount) AS amount FROM "Expense" WHERE "deletedAt" IS NULL AND date BETWEEN ${from} AND ${to} GROUP BY currency`,
    db.payment.count({ where: { status: "PENDING" } }),
  ]);
  const map = (r: { currency: string; amount: Prisma.Decimal | null }[]) => r.filter((x) => x.amount != null).map((x) => ({ currency: x.currency, amount: round2(x.amount!) })).sort((a, b) => b.amount.comparedTo(a.amount));
  return {
    collected: map(collected),
    collectedCount: collected.reduce((n, r) => n + Number(r.n), 0),
    outstanding: map(outstanding),
    outstandingCount: outstanding.reduce((n, r) => n + Number(r.n), 0),
    overdue: map(overdue),
    overdueCount: overdue.reduce((n, r) => n + Number(r.n), 0),
    drafts: draft,
    refunds: map(refunds),
    expenses: map(expenses),
    pendingPayments,
  };
}

/** Monthly collected revenue (confirmed payments, net of refunds) for the last `months` months, per currency. */
export async function monthlyRevenue(months = 12) {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCMonth(since.getUTCMonth() - (months - 1));
  const rows = await db.$queryRaw<{ month: Date; currency: string; amount: Prisma.Decimal }[]>`
    SELECT date_trunc('month', "confirmedAt") AS month, currency::text, sum(amount - "refundedAmount") AS amount FROM "Payment"
    WHERE status::text IN ('CONFIRMED','PARTIALLY_REFUNDED','REFUNDED') AND "confirmedAt" >= ${since} GROUP BY 1, 2 ORDER BY 1`;
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(since);
    d.setUTCMonth(since.getUTCMonth() + i);
    return d.toISOString().slice(0, 7);
  });
  return { buckets, rows: rows.map((r) => ({ month: new Date(r.month).toISOString().slice(0, 7), currency: r.currency, amount: Number(r.amount) })) };
}
