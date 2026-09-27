"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { inputCls } from "@/components/admin/ui";

export interface EditorLine {
  kind: string;
  refSlug: string;
  name: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  taxPct: string;
}
export interface CatalogOption {
  kind: "SERVICE" | "PRODUCT";
  slug: string;
  name: string;
  description: string;
}

const blank = (): EditorLine => ({ kind: "CUSTOM", refSlug: "", name: "", description: "", quantity: "1", unitPrice: "", discountPct: "0", taxPct: "0" });
const n = (s: string) => {
  const v = Number(String(s).replace(/[,\s]/g, ""));
  return Number.isFinite(v) ? v : 0;
};
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Line items with a live preview of totals. The preview is for convenience only — the server recomputes every
 * amount with Decimal arithmetic before anything is stored.
 */
export function LineEditor({ initial, catalog, currency, extraDiscount = "", readOnly }: { initial: EditorLine[]; catalog: CatalogOption[]; currency: string; extraDiscount?: string; readOnly?: boolean }) {
  const [lines, setLines] = useState<EditorLine[]>(initial.length ? initial : [blank()]);
  const [discount, setDiscount] = useState(extraDiscount);
  const [pick, setPick] = useState("");
  const fmt = (v: number) => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v);
    } catch {
      return v.toFixed(2);
    }
  };
  const totals = useMemo(() => {
    const rows = lines.map((l) => {
      const gross = r2(n(l.quantity) * n(l.unitPrice));
      const d = r2((gross * n(l.discountPct)) / 100);
      return { gross, d, net: gross - d, taxPct: n(l.taxPct) };
    });
    const sub = rows.reduce((s, x) => s + x.gross, 0);
    const disc = rows.reduce((s, x) => s + x.d, 0);
    const netSum = rows.reduce((s, x) => s + x.net, 0);
    const extra = Math.min(n(discount), netSum);
    const tax = rows.reduce((s, x) => s + ((x.net - (netSum ? (x.net / netSum) * extra : 0)) * x.taxPct) / 100, 0);
    return { sub: r2(sub), disc: r2(disc + extra), tax: r2(tax), total: r2(sub - disc - extra + tax) };
  }, [lines, discount]);

  const set = (i: number, patch: Partial<EditorLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) => setLines((ls) => {
    const j = i + d;
    if (j < 0 || j >= ls.length) return ls;
    const c = [...ls];
    [c[i], c[j]] = [c[j], c[i]];
    return c;
  });
  const add = (slug?: string) => {
    const c = catalog.find((x) => x.slug === slug);
    setLines((ls) => [...ls.filter((l) => l.name || l.unitPrice), c ? { ...blank(), kind: c.kind, refSlug: c.slug, name: c.name, description: c.description } : blank()]);
    setPick("");
  };
  const cell = `${inputCls} h-8 px-2 text-[13px]`;

  return (
    <div>
      <input type="hidden" name="items" value={JSON.stringify(lines.filter((l) => l.name.trim()))} />
      <input type="hidden" name="extraDiscount" value={discount} />
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-ink-850 text-left text-[11px] tracking-wide text-dim uppercase">
            <tr>
              <th className="px-2 py-2">Item</th>
              <th className="w-20 px-2 py-2">Qty</th>
              <th className="w-32 px-2 py-2">Unit price</th>
              <th className="w-20 px-2 py-2">Disc %</th>
              <th className="w-20 px-2 py-2">Tax %</th>
              <th className="w-32 px-2 py-2 text-right">Amount</th>
              {!readOnly && <th className="w-24 px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const gross = n(l.quantity) * n(l.unitPrice);
              return (
                <tr key={i} className="border-t border-line align-top">
                  <td className="px-2 py-1.5">
                    <input aria-label={`Line ${i + 1} name`} className={cell} value={l.name} readOnly={readOnly} maxLength={200} placeholder="Item name" onChange={(e) => set(i, { name: e.target.value })} />
                    <textarea aria-label={`Line ${i + 1} description`} className={`${cell} mt-1 h-auto py-1 text-xs`} rows={1} value={l.description} readOnly={readOnly} maxLength={2000} placeholder="Description (optional)" onChange={(e) => set(i, { description: e.target.value })} />
                    {l.kind !== "CUSTOM" && <span className="mt-0.5 block font-mono text-[10px] text-dim uppercase">{l.kind.toLowerCase()} · {l.refSlug}</span>}
                  </td>
                  <td className="px-2 py-1.5"><input aria-label={`Line ${i + 1} quantity`} inputMode="decimal" className={cell} value={l.quantity} readOnly={readOnly} onChange={(e) => set(i, { quantity: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input aria-label={`Line ${i + 1} unit price`} inputMode="decimal" className={cell} value={l.unitPrice} readOnly={readOnly} placeholder="0.00" onChange={(e) => set(i, { unitPrice: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input aria-label={`Line ${i + 1} discount`} inputMode="decimal" className={cell} value={l.discountPct} readOnly={readOnly} onChange={(e) => set(i, { discountPct: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input aria-label={`Line ${i + 1} tax`} inputMode="decimal" className={cell} value={l.taxPct} readOnly={readOnly} onChange={(e) => set(i, { taxPct: e.target.value })} /></td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmt(r2(gross - (gross * n(l.discountPct)) / 100))}</td>
                  {!readOnly && (
                    <td className="px-2 py-1.5">
                      <div className="flex gap-0.5">
                        <button type="button" onClick={() => move(i, -1)} aria-label={`Move line ${i + 1} up`} className="rounded p-1 text-dim hover:text-fg"><ArrowUp className="size-3.5" /></button>
                        <button type="button" onClick={() => move(i, 1)} aria-label={`Move line ${i + 1} down`} className="rounded p-1 text-dim hover:text-fg"><ArrowDown className="size-3.5" /></button>
                        <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`} className="rounded p-1 text-dim hover:text-red-700"><Trash2 className="size-3.5" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => add()} className="btn-secondary h-8 px-2.5 text-xs"><Plus className="size-3.5" /> Custom line</button>
            <select aria-label="Add from catalogue" value={pick} onChange={(e) => add(e.target.value)} className="h-8 max-w-[260px] rounded-md border border-line-strong bg-ink-900 px-2 text-xs">
              <option value="">Add service or product…</option>
              <optgroup label="Services">{catalog.filter((c) => c.kind === "SERVICE").map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</optgroup>
              <optgroup label="Products">{catalog.filter((c) => c.kind === "PRODUCT").map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</optgroup>
            </select>
          </div>
        ) : <span />}
        <dl className="w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{fmt(totals.sub)}</dd></div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted">Extra discount</dt>
            <dd>{readOnly ? <span className="tabular-nums">{fmt(n(discount))}</span> : <input aria-label="Extra discount amount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" className={`${cell} w-28 text-right`} />}</dd>
          </div>
          <div className="flex justify-between"><dt className="text-muted">Discounts</dt><dd className="tabular-nums">−{fmt(totals.disc)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd className="tabular-nums">{fmt(totals.tax)}</dd></div>
          <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total ({currency})</dt><dd className="tabular-nums">{fmt(totals.total)}</dd></div>
          <p className="text-[11px] text-dim">Preview — the server recalculates on save.</p>
        </dl>
      </div>
    </div>
  );
}
