import { db } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { pdfMoney, pdfResponse, renderPdf } from "@/lib/os/pdf";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user.role, "proposals:view")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const q = await db.quote.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } }, client: true } });
  if (!q || q.deletedAt) return new Response("Not found", { status: 404 });
  const bytes = await renderPdf({
    kind: "Quote",
    number: `${q.number} v${q.version}`,
    title: q.title,
    meta: [["Date", (q.sentAt ?? q.updatedAt).toISOString().slice(0, 10)], ["Valid until", q.validUntil?.toISOString().slice(0, 10) ?? "—"], ["Payment terms", q.paymentTerms ?? "—"], ["Currency", q.currency]],
    billTo: q.client ? [q.client.name, q.client.billingEmail ?? "", q.client.address ?? ""].filter(Boolean) : undefined,
    sections: q.notes ? [{ heading: "Notes", paragraphs: [q.notes] }] : [],
    lines: q.items.map((i) => ({ name: i.name, description: i.description, quantity: i.quantity.toString(), unitPrice: pdfMoney(i.unitPrice.toString(), q.currency), discountPct: i.discountPct.toString(), taxPct: i.taxPct.toString(), amount: pdfMoney(i.amount.toString(), q.currency) })),
    totals: [["Subtotal", pdfMoney(q.subtotal.toString(), q.currency)], ["Discounts", `- ${pdfMoney(q.discountTotal.toString(), q.currency)}`], ["Tax", pdfMoney(q.taxTotal.toString(), q.currency)], ["Total", pdfMoney(q.total.toString(), q.currency)]],
    watermark: q.status === "DRAFT" ? "DRAFT" : q.status === "EXPIRED" ? "EXPIRED" : undefined,
  });
  return pdfResponse(bytes, `${q.number}-v${q.version}.pdf`);
}
