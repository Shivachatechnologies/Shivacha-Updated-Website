"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { sendMail } from "@/lib/email/mailer";
import { siteConfig } from "@/data/siteConfig";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, formObject, moneyStr, okThen, optDate, optId, optText, reqText, currency, UserError, type ActionState } from "@/lib/os/action";
import { nextNumber } from "@/lib/os/numbers";
import { logActivity } from "@/lib/os/activity";
import { notify } from "@/lib/os/notify";
import { D, ZERO, fmtMoney } from "@/lib/os/money";
import { renderPdf } from "@/lib/os/pdf";
import { queueEvent } from "@/lib/automation/engine";
import { parseLines, replaceLines } from "@/lib/sales/lines";
import { getProvider, providerFor } from "@/lib/payments";
import { toMinor } from "@/lib/payments/types";
import { confirmPaymentTx, recalcInvoice } from "./core";
import { invoicePdf } from "./invoice-pdf";

const F = "FINANCE" as const;
const inv = (id: string) => `/admin/finance/invoices/${id}`;
const pay = (id: string) => `/admin/finance/payments/${id}`;

/* ───────── invoices ───────── */

export async function createInvoiceAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("finance:manage", F);
    const d = z.object({ clientId: z.string().min(1, "Choose a client").max(40), projectId: optId, dealId: optId, contractId: optId, quoteId: optId, currency, dueDate: optDate }).parse(formObject(form));
    const client = await db.client.findFirst({ where: { id: d.clientId, deletedAt: null } });
    if (!client) throw new UserError("Client not found.");
    const quote = d.quoteId ? await db.quote.findFirst({ where: { id: d.quoteId, status: "ACCEPTED" }, include: { items: true } }) : null;
    if (d.quoteId && !quote) throw new UserError("Only accepted quotes can be invoiced.");
    const i = await db.$transaction(async (tx) => {
      const number = await nextNumber("invoice", tx);
      const created = await tx.invoice.create({
        data: {
          number,
          clientId: d.clientId,
          projectId: d.projectId,
          dealId: d.dealId ?? quote?.dealId ?? null,
          contractId: d.contractId,
          currency: quote?.currency ?? d.currency,
          dueDate: d.dueDate,
          terms: quote?.paymentTerms ?? "Payment due within 15 days of the invoice date.",
          notes: quote ? `Based on quote ${quote.number}.` : null,
          createdById: user.id,
          subtotal: quote?.subtotal ?? 0,
          discountTotal: quote?.discountTotal ?? 0,
          taxTotal: quote?.taxTotal ?? 0,
          total: quote?.total ?? 0,
          balanceDue: quote?.total ?? 0,
          items: quote ? { create: quote.items.map(({ kind, refSlug, name, description, quantity, unitPrice, discountPct, taxPct, amount, sortOrder }) => ({ kind, refSlug, name, description, quantity, unitPrice, discountPct, taxPct, amount, sortOrder })) } : undefined,
        },
      });
      await logActivity({ type: "CREATED", summary: `Invoice ${number} drafted${quote ? ` from quote ${quote.number}` : ""}`, actorId: user.id, invoiceId: created.id, clientId: d.clientId, dealId: created.dealId, projectId: d.projectId }, tx);
      return created;
    });
    await audit({ userId: user.id, action: "invoice.created", entity: "Invoice", entityId: i.id });
    return { ok: `Invoice ${i.number} drafted.`, redirect: inv(i.id) };
  } catch (e) {
    return fail(e, "finance");
  }
}

export async function saveInvoiceAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("finance:manage", F);
    const i = await db.invoice.findUnique({ where: { id } });
    if (!i) return { error: "Invoice not found." };
    if (i.status !== "DRAFT") return { error: "Issued invoices cannot be edited. Void it or issue a credit note." };
    const o = formObject(form);
    const d = z.object({ currency, dueDate: optDate, notes: optText(5000), terms: optText(5000), projectId: optId }).parse(o);
    const lines = parseLines(o.items);
    const extra = z.preprocess((v) => (v == null || v === "" ? null : String(v).replace(/[,\s]/g, "")), z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Invalid discount").nullable()).parse(o.extraDiscount);
    await db.$transaction(async (tx) => {
      const totals = await replaceLines({ invoiceId: id }, lines, extra, tx);
      await tx.invoice.update({ where: { id }, data: { ...d, ...totals, balanceDue: totals.total } });
      await logActivity({ type: "UPDATED", actorId: user.id, invoiceId: id }, tx);
    });
    revalidatePath(inv(id));
    return { ok: "Invoice saved." };
  } catch (e) {
    return fail(e, "finance");
  }
}

export async function issueInvoiceAction(id: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("finance:manage", F);
    const i = await db.invoice.findUnique({ where: { id }, include: { items: true } });
    if (!i) return { error: "Invoice not found." };
    if (i.status !== "DRAFT") return { error: "Only drafts can be issued." };
    if (!i.items.length || i.total.lessThanOrEqualTo(0)) return { error: "Add priced line items before issuing." };
    const issueDate = new Date();
    await db.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { status: "ISSUED", issueDate, dueDate: i.dueDate ?? new Date(issueDate.getTime() + 15 * 86400_000), balanceDue: i.total } });
      await recalcInvoice(id, tx);
      await logActivity({ type: "STATUS_CHANGED", summary: `Issued — ${fmtMoney(i.total, i.currency)}`, actorId: user.id, invoiceId: id, clientId: i.clientId, dealId: i.dealId }, tx);
    });
    await audit({ userId: user.id, action: "invoice.issued", entity: "Invoice", entityId: id, metadata: { total: i.total.toString(), currency: i.currency } });
    return okThen(inv(id), "Invoice issued.");
  } catch (e) {
    return fail(e, "finance");
  }
}

export async function voidInvoiceAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("finance:manage", F);
    const reason = reqText(300).parse(form.get("reason"));
    const i = await db.invoice.findUnique({ where: { id }, include: { allocations: { include: { payment: { select: { status: true } } } } } });
    if (!i || i.status === "VOID") return { error: "Invoice not found or already void." };
    if (i.allocations.some((a) => a.payment.status !== "FAILED")) return { error: "This invoice has payments. Refund or reallocate them before voiding." };
    await db.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { status: "VOID", voidedAt: new Date(), balanceDue: 0 } });
      await logActivity({ type: "STATUS_CHANGED", summary: `Voided — ${reason}`, actorId: user.id, invoiceId: id, clientId: i.clientId }, tx);
    });
    await audit({ userId: user.id, action: "invoice.voided", entity: "Invoice", entityId: id, metadata: { reason } });
    return okThen(inv(id), "Invoice voided.");
  } catch (e) {
    return fail(e, "finance");
  }
}

export async function emailInvoiceAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("finance:manage", F);
    if (!can(user.role, "communication:send") && !can(user.role, "finance:manage")) throw new UserError("You cannot send email.");
    const to = z.string().trim().email("Enter a valid email").parse(form.get("to"));
    const i = await db.invoice.findUnique({ where: { id }, include: { items: true, client: true } });
    if (!i || i.status === "DRAFT" || i.status === "VOID") return { error: "Issue the invoice before sending it." };
    const pdf = await renderPdf(invoicePdf(i));
    const r = await sendMail({
      to,
      subject: `Invoice ${i.number} from ${siteConfig.name}`,
      text: `Hello,\n\nPlease find invoice ${i.number} for ${fmtMoney(i.total, i.currency)} attached, due ${i.dueDate?.toISOString().slice(0, 10)}.${i.paymentLinkUrl ? `\n\nPay online: ${i.paymentLinkUrl}` : ""}\n\n${siteConfig.name}`,
      html: `<p>Hello,</p><p>Please find invoice <strong>${i.number}</strong> for ${fmtMoney(i.total, i.currency)} attached, due ${i.dueDate?.toISOString().slice(0, 10)}.</p>${i.paymentLinkUrl ? `<p><a href="${i.paymentLinkUrl}">Pay online</a></p>` : ""}<p>${siteConfig.name}</p>`,
      attachments: [{ filename: `${i.number}.pdf`, content: Buffer.from(pdf).toString("base64"), encoding: "base64", contentType: "application/pdf" }],
    });
    await db.communication.create({ data: { channel: "EMAIL", direction: "OUTBOUND", status: r.sent ? "SENT" : "FAILED", subject: `Invoice ${i.number}`, toAddress: to, provider: "smtp", clientId: i.clientId, userId: user.id, error: r.error?.slice(0, 300), body: `Invoice ${i.number} (${fmtMoney(i.total, i.currency)}) sent with PDF.` } });
    if (!r.sent) return { error: "Email is not configured or could not be sent. Download the PDF instead." };
    await db.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { sentAt: new Date() } });
      await logActivity({ type: "SENT", summary: `Emailed to ${to}`, actorId: user.id, invoiceId: id, clientId: i.clientId }, tx);
    });
    await audit({ userId: user.id, action: "invoice.emailed", entity: "Invoice", entityId: id, metadata: { to } });
    return { ok: `Invoice emailed to ${to}.` };
  } catch (e) {
    return fail(e, "finance");
  }
}

export async function createPaymentLinkAction(id: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("finance:manage", F);
    const i = await db.invoice.findUnique({ where: { id }, include: { client: true } });
    if (!i || !(i.status === "ISSUED" || i.status === "PARTIALLY_PAID")) return { error: "Only issued, unpaid invoices can get a payment link." };
    const provider = providerFor(i.currency);
    if (!provider) return { error: "No payment provider is connected. Configure Stripe or Razorpay in the server environment." };
    const link = await provider.createPaymentLink({ invoiceId: i.id, invoiceNumber: i.number, amountMinor: toMinor(i.balanceDue.toFixed(2)), currency: i.currency, customerEmail: i.client.billingEmail, description: `Invoice ${i.number}` });
    await db.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { paymentLinkUrl: link.url, paymentLinkRef: link.ref, paymentLinkProvider: provider.key } });
      await logActivity({ type: "UPDATED", summary: `${provider.name} payment link created for ${fmtMoney(i.balanceDue, i.currency)}`, actorId: user.id, invoiceId: id }, tx);
    });
    await audit({ userId: user.id, action: "invoice.payment_link", entity: "Invoice", entityId: id, metadata: { provider: provider.key } });
    return okThen(inv(id), `${provider.name} payment link created.`);
  } catch (e) {
    if (e instanceof Error && /^(Stripe|Razorpay):/.test(e.message)) return { error: e.message };
    return fail(e, "finance");
  }
}

/* ───────── payments ───────── */

const paymentSchema = z.object({
  clientId: z.string().min(1, "Choose a client").max(40),
  amount: moneyStr(true),
  currency,
  method: z.enum(["BANK_TRANSFER", "CARD", "UPI", "CRYPTO", "CHEQUE", "CASH", "OTHER"]),
  reference: optText(200),
  receivedAt: optDate,
  notes: optText(2000),
});

/**
 * Records a manual payment as PENDING. It does not count towards any invoice until someone with payments:confirm
 * verifies the funds (bank statement, etc.) and confirms it.
 */
export async function recordPaymentAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("finance:manage", F);
    const o = formObject(form);
    const d = paymentSchema.parse(o);
    const amount = new D(d.amount!);
    if (amount.lessThanOrEqualTo(0)) throw new UserError("The amount must be greater than zero.");
    const ids = ([] as string[]).concat((o.invoiceIds as string | string[] | undefined) ?? []).filter(Boolean).slice(0, 20);
    const invoices = ids.length ? await db.invoice.findMany({ where: { id: { in: ids }, clientId: d.clientId, status: { in: ["ISSUED", "PARTIALLY_PAID"] } }, orderBy: { dueDate: "asc" } }) : [];
    if (invoices.some((i) => i.currency !== d.currency)) throw new UserError("Payments can only be allocated to invoices in the same currency.");
    // Allocate oldest-due first, never more than each balance.
    let left = amount;
    const allocations = invoices.map((i) => {
      const a = D.min(left, i.balanceDue);
      left = left.minus(a);
      return { invoiceId: i.id, amount: a };
    }).filter((a) => a.amount.greaterThan(0));
    const p = await db.$transaction(async (tx) => {
      const number = await nextNumber("payment", tx);
      const created = await tx.payment.create({ data: { number, clientId: d.clientId, amount, currency: d.currency, method: d.method, provider: "MANUAL", reference: d.reference, receivedAt: d.receivedAt, notes: d.notes, status: "PENDING", createdById: user.id, allocations: { create: allocations } } });
      for (const a of allocations) await logActivity({ type: "PAYMENT", summary: `Payment ${number} recorded (pending confirmation) — ${a.amount.toFixed(2)} ${d.currency}`, actorId: user.id, invoiceId: a.invoiceId, clientId: d.clientId }, tx);
      return created;
    });
    await audit({ userId: user.id, action: "payment.recorded", entity: "Payment", entityId: p.id, metadata: { amount: amount.toString(), currency: d.currency, allocations: allocations.length } });
    await notify({ type: "payment.received", title: `Payment ${p.number} awaits confirmation`, body: `${fmtMoney(amount, d.currency)} · ${d.method}`, href: pay(p.id), permission: "payments:confirm", exceptUserId: user.id });
    return { ok: `Payment ${p.number} recorded as pending. It counts once confirmed.${left.greaterThan(0) ? ` ${fmtMoney(left, d.currency)} is unallocated.` : ""}`, redirect: pay(p.id) };
  } catch (e) {
    return fail(e, "finance");
  }
}

export async function confirmPaymentAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("payments:confirm", F);
    const evidence = reqText(300).parse(form.get("evidence"));
    const p = await db.payment.findUnique({ where: { id } });
    if (!p) return { error: "Payment not found." };
    if (p.provider !== "MANUAL") return { error: "Provider payments are confirmed by their verified webhook." };
    await db.$transaction(async (tx) => {
      await confirmPaymentTx(id, user.id, tx, "manual verification");
      await tx.payment.update({ where: { id }, data: { notes: [p.notes, `Confirmed by ${user.name}: ${evidence}`].filter(Boolean).join("\n") } });
    });
    await audit({ userId: user.id, action: "payment.confirmed", entity: "Payment", entityId: id, metadata: { evidence, selfConfirmed: p.createdById === user.id } });
    queueEvent({ trigger: "PAYMENT_RECEIVED", entity: "Payment", entityId: id, actorId: user.id, payload: { payment: { id, number: p.number, amount: p.amount.toString(), currency: p.currency, provider: "MANUAL", clientId: p.clientId } } });
    await notify({ type: "payment.received", title: `Payment confirmed: ${p.number}`, body: fmtMoney(p.amount, p.currency), href: pay(id), permission: "finance:view", exceptUserId: user.id });
    return okThen(pay(id), "Payment confirmed and applied to its invoices.");
  } catch (e) {
    if (e instanceof Error && /cannot be confirmed|exceed/.test(e.message)) return { error: e.message };
    return fail(e, "finance");
  }
}

export async function failPaymentAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("payments:confirm", F);
    const reason = reqText(300).parse(form.get("reason"));
    const p = await db.payment.findUnique({ where: { id } });
    if (!p || p.status !== "PENDING") return { error: "Only pending payments can be marked failed." };
    await db.payment.update({ where: { id }, data: { status: "FAILED", notes: [p.notes, `Marked failed by ${user.name}: ${reason}`].filter(Boolean).join("\n") } });
    await audit({ userId: user.id, action: "payment.failed", entity: "Payment", entityId: id, metadata: { reason } });
    return okThen(pay(id), "Payment marked as failed.");
  } catch (e) {
    return fail(e, "finance");
  }
}

/* ───────── refunds ───────── */

/** Requests a refund. Provider payments are refunded through the provider; manual refunds need a confirmation step. */
export async function requestRefundAction(paymentId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("refunds:issue", F);
    const d = z.object({ amount: moneyStr(true), reason: reqText(300) }).parse(formObject(form));
    const p = await db.payment.findUnique({ where: { id: paymentId }, include: { refunds: { where: { status: { in: ["REQUESTED", "PROCESSING"] } } } } });
    if (!p || !["CONFIRMED", "PARTIALLY_REFUNDED"].includes(p.status)) return { error: "Only confirmed payments can be refunded." };
    const pending = p.refunds.reduce((s, r) => s.plus(r.amount), ZERO);
    const amount = new D(d.amount!);
    if (amount.lessThanOrEqualTo(0) || amount.greaterThan(p.amount.minus(p.refundedAmount).minus(pending))) return { error: "The refund exceeds the refundable amount." };
    const provider = p.provider === "MANUAL" ? null : getProvider(p.provider);
    if (provider && p.providerRef) {
      if (!provider.isConfigured()) return { error: `${provider.name} is not connected, so this refund cannot be issued.` };
      const r = await provider.refund(p.providerRef, toMinor(amount.toFixed(2)));
      await db.$transaction(async (tx) => {
        await tx.refund.create({ data: { paymentId, amount, reason: d.reason, status: "COMPLETED", providerRef: r.ref, createdById: user.id, completedAt: new Date() } });
        await applyRefund(paymentId, amount, tx);
      });
      await audit({ userId: user.id, action: "refund.issued", entity: "Payment", entityId: paymentId, metadata: { amount: amount.toString(), provider: provider.key, ref: r.ref } });
      return okThen(pay(paymentId), `${provider.name} refund issued.`);
    }
    await db.refund.create({ data: { paymentId, amount, reason: d.reason, status: "REQUESTED", createdById: user.id } });
    await audit({ userId: user.id, action: "refund.requested", entity: "Payment", entityId: paymentId, metadata: { amount: amount.toString() } });
    return okThen(pay(paymentId), "Refund requested. Mark it completed once the money has actually been returned.");
  } catch (e) {
    if (e instanceof Error && /^(Stripe|Razorpay):/.test(e.message)) return { error: e.message };
    return fail(e, "finance");
  }
}

async function applyRefund(paymentId: string, amount: InstanceType<typeof D>, tx: Parameters<typeof recalcInvoice>[1]) {
  const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { allocations: true } });
  const refunded = p.refundedAmount.plus(amount);
  await tx.payment.update({ where: { id: paymentId }, data: { refundedAmount: refunded, status: refunded.greaterThanOrEqualTo(p.amount) ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
  for (const a of p.allocations) await recalcInvoice(a.invoiceId, tx);
}

export async function completeRefundAction(refundId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("refunds:issue", F);
    const ref = reqText(200).parse(form.get("reference"));
    const r = await db.refund.findUnique({ where: { id: refundId } });
    if (!r || r.status !== "REQUESTED") return { error: "Refund not found or already processed." };
    await db.$transaction(async (tx) => {
      await tx.refund.update({ where: { id: refundId }, data: { status: "COMPLETED", providerRef: ref, completedAt: new Date() } });
      await applyRefund(r.paymentId, r.amount, tx);
    });
    await audit({ userId: user.id, action: "refund.completed", entity: "Payment", entityId: r.paymentId, metadata: { refundId, reference: ref } });
    return okThen(pay(r.paymentId), "Refund marked completed.");
  } catch (e) {
    return fail(e, "finance");
  }
}

/* ───────── credit notes ───────── */

export async function createCreditNoteAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("finance:manage", F);
    const d = z.object({ clientId: z.string().min(1, "Choose a client").max(40), invoiceId: optId, amount: moneyStr(true), currency, reason: reqText(500), issue: z.preprocess((v) => v === "on", z.boolean()) }).parse(formObject(form));
    const amount = new D(d.amount!);
    const invoice = d.invoiceId ? await db.invoice.findFirst({ where: { id: d.invoiceId, clientId: d.clientId } }) : null;
    if (d.invoiceId && !invoice) throw new UserError("Invoice not found for this client.");
    if (invoice && invoice.currency !== d.currency) throw new UserError("The credit note must use the invoice currency.");
    if (invoice && d.issue && amount.greaterThan(invoice.balanceDue)) throw new UserError("The credit exceeds the invoice balance.");
    const cn = await db.$transaction(async (tx) => {
      const number = await nextNumber("creditNote", tx);
      const c = await tx.creditNote.create({ data: { number, clientId: d.clientId, invoiceId: invoice?.id, amount, currency: d.currency, reason: d.reason, status: d.issue ? (invoice ? "APPLIED" : "ISSUED") : "DRAFT", issuedAt: d.issue ? new Date() : null, createdById: user.id } });
      if (invoice && d.issue) {
        await recalcInvoice(invoice.id, tx);
        await logActivity({ type: "CREDIT", summary: `Credit note ${number} applied — ${fmtMoney(amount, d.currency)}`, actorId: user.id, invoiceId: invoice.id, clientId: d.clientId }, tx);
      }
      return c;
    });
    await audit({ userId: user.id, action: "credit_note.created", entity: "CreditNote", entityId: cn.id, metadata: { amount: amount.toString(), issued: d.issue } });
    revalidatePath("/admin/finance/credit-notes");
    return { ok: `Credit note ${cn.number} ${d.issue ? "issued" : "saved as draft"}.` };
  } catch (e) {
    return fail(e, "finance");
  }
}

/* ───────── expenses ───────── */

export async function saveExpenseAction(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("finance:manage", F);
    const d = z.object({ date: optDate.refine((v) => !!v, "Pick a date"), category: reqText(80), vendor: optText(200), description: optText(1000), amount: moneyStr(true), currency, projectId: optId, clientId: optId }).parse(formObject(form));
    const data = { ...d, date: d.date!, amount: d.amount! };
    if (id) await db.expense.update({ where: { id }, data });
    else await db.expense.create({ data: { ...data, createdById: user.id } });
    await audit({ userId: user.id, action: id ? "expense.updated" : "expense.created", entity: "Expense", entityId: id ?? undefined, metadata: { amount: d.amount, currency: d.currency, category: d.category } });
    revalidatePath("/admin/finance/expenses");
    return { ok: id ? "Expense updated." : "Expense recorded." };
  } catch (e) {
    return fail(e, "finance");
  }
}

export async function archiveExpenseAction(id: string) {
  const user = await authorizeAccess("finance:manage", F);
  await db.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ userId: user.id, action: "expense.archived", entity: "Expense", entityId: id });
  revalidatePath("/admin/finance/expenses");
}
