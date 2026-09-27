"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/cn";

export interface RevenuePoint {
  month: string;
  actual: number | null;
  previous: number | null;
  forecast: number | null;
  forecastDeals: number;
}

export interface RevenueSeries {
  currency: string;
  points: RevenuePoint[];
  /** Monthly target in this currency, when one is configured. */
  target: number | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mLabel = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`;
const money = (v: number, cur: string, compact = true) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 0 }).format(v);
  } catch {
    return `${cur} ${Math.round(v).toLocaleString()}`;
  }
};
const lastDay = (k: string) => new Date(Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0)).toISOString().slice(0, 10);

const C = { actual: "#0b73d9", previous: "#94a3b8", forecast: "#6d4fe0", target: "#c27a07" };

/**
 * Monthly collected revenue vs the same month a year earlier, the configured target and the weighted pipeline
 * forecast. One axis, one currency at a time (amounts are never converted). Clicking a month opens Finance for it.
 */
export function RevenueChart({ series }: { series: RevenueSeries[] }) {
  const router = useRouter();
  const [cur, setCur] = useState(series[0]?.currency ?? "USD");
  const [show, setShow] = useState({ previous: true, forecast: true, target: true });
  const s = series.find((x) => x.currency === cur) ?? series[0];
  if (!s) return null;
  const hasPrev = s.points.some((p) => p.previous);
  const hasForecast = s.points.some((p) => p.forecast);
  const total = s.points.reduce((n, p) => n + (p.actual ?? 0), 0);
  const prevTotal = s.points.reduce((n, p) => n + (p.actual != null ? (p.previous ?? 0) : 0), 0);
  const toggles = [
    { k: "previous" as const, label: "Previous year", on: hasPrev, swatch: <span className="h-0.5 w-3.5 border-t-2 border-dashed" style={{ borderColor: C.previous }} /> },
    { k: "forecast" as const, label: "Forecast (weighted pipeline)", on: hasForecast, swatch: <span className="size-2.5 rounded-[2px] opacity-60" style={{ background: C.forecast }} /> },
    { k: "target" as const, label: s.target != null ? "Target" : "No target set", on: s.target != null, swatch: <span className="h-0.5 w-3.5" style={{ background: C.target }} /> },
  ];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[22px] font-semibold tracking-[-0.02em] text-fg tabular-nums">{money(total, s.currency, false)}</span>
          <span className="text-xs text-dim">collected, 12 months{prevTotal > 0 && <> · prior year {money(prevTotal, s.currency)}</>}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1.5 text-[11.5px] text-muted"><span className="size-2.5 rounded-[2px]" style={{ background: C.actual }} />Actual</span>
          {toggles.map((t) => (
            <button key={t.k} type="button" disabled={!t.on} aria-pressed={t.on && show[t.k]} onClick={() => setShow((x) => ({ ...x, [t.k]: !x[t.k] }))} className={cn("flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11.5px] transition-colors", !t.on ? "cursor-default border-dashed border-line text-dim" : show[t.k] ? "border-line-strong text-fg" : "border-line text-dim line-through")}>
              {t.swatch}
              {t.label}
            </button>
          ))}
          {series.length > 1 && (
            <select value={cur} onChange={(e) => setCur(e.target.value)} aria-label="Currency" className="h-7 rounded-md border border-line-strong bg-ink-900 px-1.5 text-[12px] text-fg">
              {series.map((x) => <option key={x.currency} value={x.currency}>{x.currency}</option>)}
            </select>
          )}
        </div>
      </div>
      <div className="h-[280px] w-full" role="img" aria-label={`Monthly revenue in ${s.currency}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={s.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%" onClick={(e) => {
            const k = (e as { activeLabel?: string } | null)?.activeLabel;
            const p = k && s.points.find((x) => x.month === k);
            if (p && p.actual != null) router.push(`/admin/finance?range=custom&from=${k}-01&to=${lastDay(k)}`);
          }}>
            <CartesianGrid vertical={false} stroke="currentColor" className="text-line" strokeOpacity={1} />
            <XAxis dataKey="month" tickFormatter={mLabel} tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: "#6b7689" }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tickFormatter={(v: number) => money(v, s.currency)} tickLine={false} axisLine={false} width={58} tick={{ fontSize: 10.5, fill: "#6b7689" }} />
            <Tooltip cursor={{ fill: "rgb(1 104 179 / 0.06)" }} content={<Tip currency={s.currency} target={s.target} />} />
            <Bar dataKey="actual" fill={C.actual} radius={[3, 3, 0, 0]} maxBarSize={28} className="cursor-pointer" isAnimationActive={false} />
            {show.forecast && hasForecast && <Bar dataKey="forecast" fill={C.forecast} fillOpacity={0.45} stroke={C.forecast} strokeDasharray="3 2" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />}
            {show.previous && hasPrev && <Line dataKey="previous" stroke={C.previous} strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />}
            {show.target && s.target != null && <ReferenceLine y={s.target} stroke={C.target} strokeWidth={1.5} label={{ value: `Target ${money(s.target, s.currency)}`, position: "insideTopRight", fontSize: 10.5, fill: C.target }} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-dim">
        <summary className="cursor-pointer select-none hover:text-fg">Table view</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left">
            <thead><tr className="text-dim">{["Month", "Actual", "Previous year", "Forecast", "Target"].map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
            <tbody className="text-fg tabular-nums">
              {s.points.map((p) => (
                <tr key={p.month} className="border-t border-line">
                  <td className="py-1 pr-3">{mLabel(p.month)}</td>
                  <td className="py-1 pr-3">{p.actual != null ? money(p.actual, s.currency, false) : "—"}</td>
                  <td className="py-1 pr-3">{p.previous != null ? money(p.previous, s.currency, false) : "—"}</td>
                  <td className="py-1 pr-3">{p.forecast != null ? `${money(p.forecast, s.currency, false)} (${p.forecastDeals} deals)` : "—"}</td>
                  <td className="py-1 pr-3">{s.target != null ? money(s.target, s.currency, false) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Tip({ active, payload, label, currency, target }: { active?: boolean; payload?: { payload: RevenuePoint }[]; label?: string; currency: string; target: number | null }) {
  if (!active || !payload?.length || !label) return null;
  const p = payload[0]!.payload;
  const row = (name: string, color: string, v: string) => (
    <div className="flex items-center gap-2">
      <span className="size-2 rounded-[2px]" style={{ background: color }} />
      <span className="text-muted">{name}</span>
      <span className="ml-auto pl-4 font-medium text-fg tabular-nums">{v}</span>
    </div>
  );
  const vsPrev = p.actual != null && p.previous ? Math.round(((p.actual - p.previous) / p.previous) * 1000) / 10 : null;
  const vsTarget = p.actual != null && target ? Math.round((p.actual / target) * 1000) / 10 : null;
  return (
    <div className="min-w-[200px] rounded-lg border border-line bg-ink-900 px-3 py-2.5 text-[12px] shadow-[0_12px_32px_-12px_rgb(11_20_36/0.35)]">
      <p className="mb-1.5 font-semibold text-fg">{mLabel(label)}</p>
      <div className="space-y-1">
        {p.actual != null && row("Collected", C.actual, money(p.actual, currency, false))}
        {p.previous != null && row("Same month last year", C.previous, money(p.previous, currency, false))}
        {p.forecast != null && row(`Forecast · ${p.forecastDeals} deal${p.forecastDeals === 1 ? "" : "s"}`, C.forecast, money(p.forecast, currency, false))}
        {target != null && row("Target", C.target, money(target, currency, false))}
      </div>
      {(vsPrev != null || vsTarget != null) && (
        <p className="mt-1.5 border-t border-line pt-1.5 text-dim">
          {vsPrev != null && <>{vsPrev >= 0 ? "+" : ""}{vsPrev}% YoY</>}
          {vsPrev != null && vsTarget != null && " · "}
          {vsTarget != null && <>{vsTarget}% of target</>}
        </p>
      )}
      {p.actual != null && <p className="mt-1 text-[11px] text-brand-blue">Click to open this month in Finance</p>}
    </div>
  );
}
