import "server-only";
import { db } from "@/lib/db/client";
import { D } from "@/lib/os/money";
import { nextNumber } from "@/lib/os/numbers";
import { notify } from "@/lib/os/notify";
import { queueEvent } from "@/lib/automation/engine";
import { fromMinor, type PaymentProvider, type VerifiedPaymentEvent } from "@/lib/payments/types";
import { confirmPaymentTx } from "./core";

/**
 * Records a provider-verified payment. Idempotent on (provider, paymentRef): webhook retries never duplicate money.
 * Allocation only happens when the currency matches the invoice; otherwise finance is asked to review.
 */
export async function recordProviderPayment(provider: PaymentProvider, ev: VerifiedPaymentEvent) {
  const existing = await db.payment.findUnique({ where: { provider_providerRef: { provider: provider.key, providerRef: ev.paymentRef } } });
  if (existing) return { status: "duplicate" as const, paymentId: existing.id };
  const invoice = ev.invoiceId
    ? await db.invoice.findUnique({ where: { id: ev.invoiceId } })
    : ev.linkRef
      ? await db.invoice.findFirst({ where: { paymentLinkRef: ev.linkRef, paymentLinkProvider: provider.key } })
      : null;
  if (!invoice) {
    await db.securityEvent.create({ data: { type: "payment.unmatched", severity: "MEDIUM", detail: { provider: provider.key, paymentRef: ev.paymentRef, amountMinor: ev.amountMinor, currency: ev.currency } } });
    await notify({ type: "payment.received", title: `${provider.name} payment could not be matched to an invoice`, body: `${fromMinor(ev.amountMinor)} ${ev.currency} · ${ev.paymentRef}`, href: "/admin/finance/payments", permission: "payments:confirm" });
    return { status: "unmatched" as const };
  }
  const amount = new D(fromMinor(ev.amountMinor));
  const sameCurrency = invoice.currency === ev.currency;
  const result = await db.$transaction(async (tx) => {
    const number = await nextNumber("payment", tx);
    const payment = await tx.payment.create({
      data: {
        number,
        clientId: invoice.clientId,
        amount,
        currency: sameCurrency ? invoice.currency : (ev.currency as typeof invoice.currency),
        method: ev.method,
        provider: provider.key,
        providerRef: ev.paymentRef,
        status: "PENDING",
        reference: ev.linkRef,
        notes: sameCurrency ? `Verified ${provider.name} webhook` : `Currency ${ev.currency} differs from invoice ${invoice.currency} — needs manual allocation`,
        allocations: sameCurrency ? { create: { invoiceId: invoice.id, amount: D.min(amount, invoice.balanceDue.greaterThan(0) ? invoice.balanceDue : amount) } } : undefined,
      },
    });
    // The webhook signature has been verified: this is the provider's confirmation of real money.
    await confirmPaymentTx(payment.id, null, tx, `${provider.name} webhook`);
    await tx.auditLog.create({ data: { action: "payment.confirmed_webhook", entity: "Payment", entityId: payment.id, metadata: { provider: provider.key, paymentRef: ev.paymentRef, invoiceId: invoice.id } } });
    return payment;
  });
  queueEvent({ trigger: "PAYMENT_RECEIVED", entity: "Payment", entityId: result.id, payload: { payment: { id: result.id, number: result.number, amount: result.amount.toString(), currency: result.currency, provider: provider.key, clientId: invoice.clientId } } });
  await notify({ type: "payment.received", title: `Payment received: ${invoice.number}`, body: `${amount.toFixed(2)} ${ev.currency} via ${provider.name}`, href: `/admin/finance/payments/${result.id}`, permission: "finance:view" });
  return { status: "recorded" as const, paymentId: result.id };
}
