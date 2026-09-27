import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { documentTotals, lineAmounts, D } from "@/lib/os/money";

type Tx = Prisma.TransactionClient | typeof db;

const dec = (max: number, places = 2) =>
  z.preprocess((v) => (v == null || v === "" ? "0" : String(v).replace(/[,\s]/g, "")), z.string().regex(new RegExp(`^\\d{1,${max}}(\\.\\d{1,${places}})?$`), "Invalid number"));

export const lineSchema = z.object({
  kind: z.enum(["SERVICE", "PRODUCT", "CUSTOM"]).default("CUSTOM"),
  refSlug: z.string().max(120).optional().nullable(),
  name: z.string().trim().min(1, "Each line needs a name").max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  quantity: dec(8),
  unitPrice: dec(12),
  discountPct: dec(3).refine((v) => Number(v) <= 100, "Discount must be 0–100%"),
  taxPct: dec(3).refine((v) => Number(v) <= 100, "Tax must be 0–100%"),
});
export type LineInputRow = z.infer<typeof lineSchema>;

/** Parses the JSON sent by the line-item editor. */
export function parseLines(raw: unknown): LineInputRow[] {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw || "[]");
    } catch {
      throw new z.ZodError([{ code: "custom", path: ["items"], message: "Line items could not be read", input: raw }]);
    }
  }
  const r = z.array(lineSchema).max(100, "Up to 100 lines").safeParse(data);
  if (!r.success) throw new z.ZodError(r.error.issues.map((i) => ({ ...i, path: ["items"] })));
  return r.data;
}

export type LineOwner = { proposalId: string } | { quoteId: string } | { invoiceId: string };

/** Replaces the lines of a DRAFT document and returns recomputed totals (Decimal, half-up). */
export async function replaceLines(owner: LineOwner, lines: LineInputRow[], extraDiscount: string | null, tx: Tx) {
  await tx.lineItem.deleteMany({ where: owner });
  if (lines.length)
    await tx.lineItem.createMany({
      data: lines.map((l, i) => ({ ...owner, kind: l.kind, refSlug: l.refSlug ?? null, name: l.name, description: l.description ?? null, quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, taxPct: l.taxPct, amount: lineAmounts(l).net, sortOrder: i })),
    });
  return documentTotals(lines, extraDiscount ?? 0);
}

/** Extra (document-level) discount = stored discountTotal − the sum of line discounts. */
export function extraDiscountOf(lines: { quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; discountPct: Prisma.Decimal }[], discountTotal: Prisma.Decimal) {
  const lineDisc = lines.reduce((s, l) => s.plus(lineAmounts(l).discount), new D(0));
  const extra = discountTotal.minus(lineDisc);
  return extra.greaterThan(0) ? extra : new D(0);
}

/** Immutable snapshot (the version history of proposals, quotes and contracts). */
export async function snapshot(entity: "PROPOSAL" | "QUOTE" | "CONTRACT", entityId: string, version: number, data: unknown, createdById: string | null, note: string | null, tx: Tx) {
  return tx.documentVersion.upsert({
    where: { entity_entityId_version: { entity, entityId, version } },
    create: { entity, entityId, version, snapshot: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue, createdById, note },
    update: { snapshot: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue, note },
  });
}

export const linesForEditor = (rows: { kind: string; refSlug: string | null; name: string; description: string | null; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; discountPct: Prisma.Decimal; taxPct: Prisma.Decimal }[]) =>
  rows.map((r) => ({ kind: r.kind, refSlug: r.refSlug ?? "", name: r.name, description: r.description ?? "", quantity: r.quantity.toString(), unitPrice: r.unitPrice.toString(), discountPct: r.discountPct.toString(), taxPct: r.taxPct.toString() }));
