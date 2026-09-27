import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { siteConfig } from "@/data/siteConfig";
import { nextNumber } from "@/lib/os/numbers";
import { logActivity } from "@/lib/os/activity";
import { D, documentTotals, round2 } from "@/lib/os/money";
import { pdfMoney, type PdfDoc } from "@/lib/os/pdf";
import { findCatalogItem } from "./catalog";

/** Structured proposal body (stored in Proposal.content and in every version snapshot). */
export const proposalContentSchema = z.object({
  summary: z.string().max(5000).default(""),
  scope: z.string().max(20000).default(""),
  deliverables: z.string().max(10000).default(""),
  assumptions: z.string().max(10000).default(""),
  timeline: z.string().max(5000).default(""),
  /** One per line: "Milestone | Due | % or amount". */
  milestones: z.string().max(5000).default(""),
  paymentSchedule: z.string().max(5000).default(""),
  terms: z.string().max(20000).default(""),
  clientName: z.string().max(200).default(""),
  clientContact: z.string().max(200).default(""),
  clientEmail: z.string().max(160).default(""),
  clientAddress: z.string().max(1000).default(""),
});
export type ProposalContent = z.infer<typeof proposalContentSchema>;

export const parseContent = (v: unknown): ProposalContent => proposalContentSchema.parse(v && typeof v === "object" ? v : {});

export const DEFAULT_TERMS = [
  "Prices exclude taxes unless stated. Applicable taxes are added at invoicing.",
  "Work starts after written acceptance and receipt of the first milestone payment.",
  "Change requests outside the agreed scope are estimated separately and require written approval.",
  "Intellectual property in the deliverables transfers to the client on full payment, excluding Shivacha's pre-existing components, which are licensed for use in the delivered solution.",
  "Both parties keep each other's confidential information confidential.",
].join("\n");

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newShareToken = () => randomBytes(32).toString("base64url");

/**
 * Creates a DRAFT proposal from a deal using real deal data only: the deal's services/products become line items
 * (descriptions from the Shivacha catalogue). Prices: if the deal has a value, it is split evenly across the lines
 * and marked for review; otherwise lines start at 0 for a person to price. Nothing is invented.
 */
export async function createProposalFromDeal(dealId: string, actorId: string, opts: { aiGenerated?: boolean; content?: Partial<ProposalContent>; title?: string } = {}) {
  return db.$transaction(async (tx) => {
    const deal = await tx.deal.findUnique({ where: { id: dealId }, include: { client: { include: { contacts: { where: { isPrimary: true }, take: 1 } } }, lead: true } });
    if (!deal || deal.deletedAt) throw new Error("Deal not found.");
    const names = [...deal.services, ...deal.products];
    const catalogue = names.map((n) => ({ n, c: findCatalogItem(n) }));
    const count = Math.max(1, catalogue.length);
    const each = deal.value.greaterThan(0) ? round2(deal.value.dividedBy(count)) : new D(0);
    const lines = (catalogue.length ? catalogue : [{ n: deal.name, c: undefined }]).map((x, i) => ({
      kind: x.c?.kind ?? ("CUSTOM" as const),
      refSlug: x.c?.slug ?? null,
      name: x.c?.name ?? x.n,
      description: x.c ? `${x.c.description}${x.c.timeline ? ` Typical launch: ${x.c.timeline}.` : ""}` : null,
      quantity: "1",
      // Last line absorbs rounding so the proposal total equals the deal value exactly.
      unitPrice: (i === count - 1 && deal.value.greaterThan(0) ? deal.value.minus(each.times(count - 1)) : each).toFixed(2),
      discountPct: "0",
      taxPct: "0",
    }));
    const contact = deal.client?.contacts[0];
    const content: ProposalContent = parseContent({
      summary: `Proposal for ${deal.client?.name ?? deal.company ?? deal.lead?.company ?? deal.lead?.name ?? "the client"}: ${names.join(", ") || deal.name}.`,
      deliverables: catalogue.map((x) => `${x.c?.name ?? x.n}${x.c?.modules?.length ? ` — ${x.c.modules.slice(0, 6).join(", ")}` : ""}`).join("\n"),
      assumptions: ["Client provides timely access to stakeholders, content and third-party accounts.", "Third-party licence, infrastructure and API costs are billed at cost unless included above."].join("\n"),
      timeline: catalogue.map((x) => (x.c?.timeline ? `${x.c.name}: ${x.c.timeline}` : "")).filter(Boolean).join("\n"),
      paymentSchedule: "40% on acceptance\n30% on delivery of the main release\n30% on go-live",
      terms: DEFAULT_TERMS,
      clientName: deal.client?.name ?? deal.company ?? deal.lead?.company ?? "",
      clientContact: contact?.name ?? deal.lead?.name ?? "",
      clientEmail: contact?.email ?? deal.client?.billingEmail ?? deal.lead?.email ?? "",
      ...opts.content,
    });
    const totals = documentTotals(lines);
    const number = await nextNumber("proposal", tx);
    const p = await tx.proposal.create({
      data: {
        number,
        title: (opts.title ?? `${deal.name} — Proposal`).slice(0, 200),
        dealId: deal.id,
        clientId: deal.clientId,
        leadId: deal.leadId,
        currency: deal.currency,
        content,
        ...totals,
        validUntil: new Date(Date.now() + 30 * 86400_000),
        createdById: actorId,
        aiGenerated: !!opts.aiGenerated,
        items: { create: lines.map((l, i) => ({ ...l, amount: l.unitPrice, sortOrder: i })) },
      },
    });
    await logActivity({ type: "CREATED", summary: `Proposal ${number} drafted${opts.aiGenerated ? " by the AI Proposal Agent" : ""}${deal.value.greaterThan(0) ? " — prices split from the deal value; review before sending" : ""}`, actorId, proposalId: p.id, dealId: deal.id, aiAgent: opts.aiGenerated ? "proposal" : null }, tx);
    return p;
  });
}

type ProposalWithItems = Prisma.ProposalGetPayload<{ include: { items: true; client: true; deal: true } }>;

export function proposalPdf(p: ProposalWithItems): PdfDoc {
  const c = parseContent(p.content);
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const milestones = lines(c.milestones).map((m) => m.split("|").map((x) => x.trim()));
  return {
    kind: "Proposal",
    number: `${p.number} v${p.version}`,
    title: p.title,
    meta: [
      ["Date", (p.sentAt ?? p.updatedAt).toISOString().slice(0, 10)],
      ["Valid until", p.validUntil ? p.validUntil.toISOString().slice(0, 10) : "—"],
      ["Currency", p.currency],
      ["Prepared by", siteConfig.name],
    ],
    billTo: [c.clientName || p.client?.name || "", c.clientContact, c.clientEmail, c.clientAddress].filter(Boolean),
    sections: [
      { heading: "Summary", paragraphs: [c.summary] },
      ...(c.scope ? [{ heading: "Scope of work", paragraphs: [c.scope] }] : []),
      ...(c.deliverables ? [{ heading: "Deliverables", bullets: lines(c.deliverables) }] : []),
      ...(c.timeline ? [{ heading: "Timeline", bullets: lines(c.timeline) }] : []),
      ...(milestones.length ? [{ heading: "Milestones", table: { head: ["Milestone", "Due", "Payment"], rows: milestones.map((m) => [m[0] ?? "", m[1] ?? "", m[2] ?? ""]), widths: [0.5, 0.25, 0.25] } }] : []),
      ...(c.assumptions ? [{ heading: "Assumptions", bullets: lines(c.assumptions) }] : []),
      ...(c.paymentSchedule ? [{ heading: "Payment schedule", bullets: lines(c.paymentSchedule) }] : []),
    ].filter((s) => (s.paragraphs?.some((x) => x.trim()) ?? false) || (s.bullets?.length ?? 0) > 0 || !!("table" in s && s.table)),
    lines: p.items.sort((a, b) => a.sortOrder - b.sortOrder).map((i) => ({ name: i.name, description: i.description, quantity: i.quantity.toString(), unitPrice: pdfMoney(i.unitPrice.toString(), p.currency), discountPct: i.discountPct.toString(), taxPct: i.taxPct.toString(), amount: pdfMoney(i.amount.toString(), p.currency) })),
    totals: [
      ["Subtotal", pdfMoney(p.subtotal.toString(), p.currency)],
      ["Discounts", `- ${pdfMoney(p.discountTotal.toString(), p.currency)}`],
      ["Tax", pdfMoney(p.taxTotal.toString(), p.currency)],
      ["Total", pdfMoney(p.total.toString(), p.currency)],
    ],
    footerNote: [c.terms ? `Terms: ${c.terms.replace(/\n/g, " · ")}` : "", p.status === "ACCEPTED" && p.acceptedAt ? `Accepted by ${p.acceptedByName ?? "the client"} on ${p.acceptedAt.toISOString().slice(0, 10)}.` : ""].filter(Boolean).join("\n\n"),
    watermark: p.status === "DRAFT" || p.status === "INTERNAL_REVIEW" ? "DRAFT" : p.status === "EXPIRED" ? "EXPIRED" : undefined,
  };
}
