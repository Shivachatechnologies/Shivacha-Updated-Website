import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { pdfMoney, type PdfDoc } from "@/lib/os/pdf";
import { siteConfig } from "@/data/siteConfig";

type Inv = Prisma.InvoiceGetPayload<{ include: { items: true; client: true } }>;

export function invoicePdf(i: Inv, paymentsNote?: string): PdfDoc {
  const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "—");
  const m = (v: Prisma.Decimal) => pdfMoney(v.toString(), i.currency);
  return {
    kind: "Invoice",
    number: i.number,
    title: `Invoice ${i.number}`,
    meta: [["Issue date", d(i.issueDate)], ["Due date", d(i.dueDate)], ["Currency", i.currency], ["Status", i.status.replace(/_/g, " ").toLowerCase()]],
    billTo: [i.client.legalName ?? i.client.name, i.client.address ?? "", i.client.taxId ? `Tax ID: ${i.client.taxId}` : "", i.client.billingEmail ?? ""].filter(Boolean),
    sections: [...(i.notes ? [{ heading: "Notes", paragraphs: [i.notes] }] : []), ...(i.terms ? [{ heading: "Payment terms", paragraphs: [i.terms] }] : [])],
    lines: [...i.items].sort((a, b) => a.sortOrder - b.sortOrder).map((l) => ({ name: l.name, description: l.description, quantity: l.quantity.toString(), unitPrice: m(l.unitPrice), discountPct: l.discountPct.toString(), taxPct: l.taxPct.toString(), amount: m(l.amount) })),
    totals: [
      ["Subtotal", m(i.subtotal)],
      ["Discounts", `- ${m(i.discountTotal)}`],
      ["Tax", m(i.taxTotal)],
      ["Total", m(i.total)],
      ["Paid (confirmed)", m(i.amountPaid)],
      ...(i.amountCredited.greaterThan(0) ? ([["Credited", m(i.amountCredited)]] as [string, string][]) : []),
      ["Balance due", m(i.balanceDue)],
    ],
    footerNote: [paymentsNote, i.paymentLinkUrl ? `Pay online: ${i.paymentLinkUrl}` : "", `${siteConfig.legalName} · ${siteConfig.contact.email}`].filter(Boolean).join("\n"),
    watermark: i.status === "DRAFT" ? "DRAFT" : i.status === "VOID" ? "VOID" : i.status === "PAID" ? "PAID" : undefined,
  };
}
