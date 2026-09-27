import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Money helpers. All arithmetic uses Decimal (decimal.js via Prisma) and rounds half-up to 2 places.
 * Floating-point numbers are never used for stored monetary values.
 */
export const D = Prisma.Decimal;
export type Dec = Prisma.Decimal;
/** Anything Decimal accepts: number, numeric string or Decimal. */
export type DecValue = string | number | Prisma.Decimal;
export const ZERO = new D(0);

export const CURRENCIES = ["USD", "EUR", "GBP", "AED", "SAR", "INR", "SGD", "AUD", "CAD"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  AED: "UAE Dirham",
  SAR: "Saudi Riyal",
  INR: "Indian Rupee",
  SGD: "Singapore Dollar",
  AUD: "Australian Dollar",
  CAD: "Canadian Dollar",
};

export const round2 = (v: DecValue) => new D(v).toDecimalPlaces(2, D.ROUND_HALF_UP);

/** Parses user input ("12,500.50") into a non-negative Decimal, or null when blank. Throws on invalid input. */
export function parseMoney(v: unknown, { allowNegative = false, max = 1e12 } = {}): Prisma.Decimal | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/[,\s]/g, "");
  if (!s) return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error("INVALID_AMOUNT");
  const d = new D(s);
  if ((!allowNegative && d.isNegative()) || d.abs().greaterThan(max)) throw new Error("INVALID_AMOUNT");
  return d;
}

export interface LineInput {
  quantity: DecValue;
  unitPrice: DecValue;
  discountPct?: DecValue;
  taxPct?: DecValue;
}

/** Line amount before tax: qty × unit × (1 − discount%). */
export function lineAmounts(l: LineInput) {
  const gross = new D(l.quantity).times(l.unitPrice);
  const discount = round2(gross.times(new D(l.discountPct ?? 0)).dividedBy(100));
  const net = round2(gross).minus(discount);
  const tax = round2(net.times(new D(l.taxPct ?? 0)).dividedBy(100));
  return { gross: round2(gross), discount, net, tax };
}

/**
 * Document totals. `extraDiscount` is a document-level discount applied after line discounts (pre-tax, pro-rated
 * across lines for tax purposes).
 */
export function documentTotals(lines: LineInput[], extraDiscount: DecValue = 0) {
  let subtotal = ZERO;
  let lineDiscounts = ZERO;
  let netSum = ZERO;
  let taxBase: { net: Prisma.Decimal; taxPct: Prisma.Decimal }[] = [];
  for (const l of lines) {
    const a = lineAmounts(l);
    subtotal = subtotal.plus(a.gross);
    lineDiscounts = lineDiscounts.plus(a.discount);
    netSum = netSum.plus(a.net);
    taxBase.push({ net: a.net, taxPct: new D(l.taxPct ?? 0) });
  }
  const extra = D.min(round2(extraDiscount), netSum);
  if (extra.greaterThan(0) && netSum.greaterThan(0)) taxBase = taxBase.map((t) => ({ ...t, net: t.net.minus(t.net.dividedBy(netSum).times(extra)) }));
  const taxTotal = round2(taxBase.reduce((s, t) => s.plus(t.net.times(t.taxPct).dividedBy(100)), ZERO));
  const discountTotal = round2(lineDiscounts.plus(extra));
  const total = round2(subtotal.minus(discountTotal).plus(taxTotal));
  return { subtotal: round2(subtotal), discountTotal, taxTotal, total };
}

/** Formats a Decimal/number for display. Display only — never parse this back. */
export function fmtMoney(v: DecValue | null | undefined, currency: string = "USD", opts: { compact?: boolean } = {}) {
  if (v == null) return "—";
  const n = Number(new D(v).toFixed(2));
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: opts.compact ? 1 : 2, minimumFractionDigits: opts.compact ? 0 : 2, notation: opts.compact ? "compact" : "standard" }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString()}`;
  }
}

/** Sums Decimal-like values. */
export const sum = (vals: (DecValue | null | undefined)[]) => vals.reduce<Prisma.Decimal>((s, v) => (v == null ? s : s.plus(v)), ZERO);

/** Groups amounts by currency — revenue is never silently summed across currencies. */
export function byCurrency<T>(rows: T[], cur: (r: T) => string, amt: (r: T) => DecValue | null) {
  const m = new Map<string, Prisma.Decimal>();
  for (const r of rows) {
    const a = amt(r);
    if (a == null) continue;
    m.set(cur(r), (m.get(cur(r)) ?? ZERO).plus(a));
  }
  return [...m.entries()].map(([currency, amount]) => ({ currency, amount: round2(amount) })).sort((a, b) => b.amount.comparedTo(a.amount));
}

/** Renders a per-currency list ("$1,200.00 · €300.00"). */
export const fmtMulti = (list: { currency: string; amount: DecValue }[], compact = false) => (list.length ? list.map((x) => fmtMoney(x.amount, x.currency, { compact })).join(" · ") : fmtMoney(0, "USD", { compact }));
