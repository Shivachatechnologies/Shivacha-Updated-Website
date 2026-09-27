"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { MAP_LAT0, MAP_STEP, WORLD_ROWS } from "./world-grid";

export interface MapMarket {
  key: string;
  name: string;
  code: string;
  at: [number, number];
  tz: string;
  leads: number;
  clients: number;
  openDeals: number;
  href?: string;
}

const U = 6; // SVG units per grid cell
const COLS = WORLD_ROWS[0]!.length;
const W = COLS * U;
const H = WORLD_ROWS.length * U;
const px = (lon: number) => ((lon + 180) / MAP_STEP) * U;
const py = (lat: number) => ((MAP_LAT0 - lat) / MAP_STEP) * U + U / 2;

/** One path per land class (neutral land, each market) so the whole map is a handful of DOM nodes. */
function buildPaths() {
  const d: Record<string, string[]> = {};
  WORLD_ROWS.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]!;
      if (ch === ".") continue;
      (d[ch] ??= []).push(`M${c * U + 1.6} ${r * U + 1.6}h2.8v2.8h-2.8z`);
    }
  });
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.join("")]));
}

const paths = buildPaths();

const localTime = (tz: string) => {
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date());
  } catch {
    return "";
  }
};

/**
 * Dot-matrix world map of Shivacha's operating markets. Numbers are real record counts matched from the country
 * on leads, clients and deals; with no regional data the markets are shown as strategic regions only.
 */
export function WorldOpsMap({ markets, hasData, unmapped }: { markets: MapMarket[]; hasData: boolean; unmapped: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...markets.map((m) => m.leads + m.clients + m.openDeals));
  const hm = markets.find((m) => m.key === hover);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="relative min-w-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="World map of Shivacha operating markets">
          <path d={paths["#"]} fill="#1d3150" />
          {markets.map((m) => paths[m.code] && <path key={m.key} d={paths[m.code]} fill={hover === m.key ? "#5cc8ff" : "#2f6fb5"} className="transition-[fill] duration-200" />)}
          {markets.map((m) => {
            const x = px(m.at[1]);
            const y = py(m.at[0]);
            const weight = m.leads + m.clients + m.openDeals;
            const r = hasData ? 3.5 + (weight / max) * 6 : 4;
            const on = hover === m.key;
            return (
              <g key={m.key} onMouseEnter={() => setHover(m.key)} onMouseLeave={() => setHover(null)} className="cursor-pointer">
                <circle cx={x} cy={y} r={r} fill="#5cc8ff" className="os-ping" style={{ animationDelay: `${(m.at[1] + 180) * 8}ms` }} />
                <circle cx={x} cy={y} r={r + 7} fill="transparent" />
                <circle cx={x} cy={y} r={r} fill={on ? "#ffffff" : "#5cc8ff"} stroke="#07111f" strokeWidth="1.5" />
                <text x={x + r + 4} y={y + 3.5} fontSize="10.5" fill={on ? "#ffffff" : "#9fb4cf"} fontFamily="var(--font-mono)" className="pointer-events-none select-none">
                  {m.name}
                </text>
              </g>
            );
          })}
        </svg>
        {hm && (
          <div className="pointer-events-none absolute z-10 w-52 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-lg border border-white/10 bg-[#0b1626]/95 px-3 py-2.5 text-[12px] shadow-xl" style={{ left: `${(px(hm.at[1]) / W) * 100}%`, top: `${(py(hm.at[0]) / H) * 100}%` }}>
            <p className="flex items-center justify-between font-semibold text-white">
              {hm.name}
              <span className="font-mono text-[11px] font-normal text-[#9fb4cf]">{localTime(hm.tz)}</span>
            </p>
            {hasData ? (
              <dl className="mt-1.5 grid grid-cols-3 gap-1 text-center">
                {[["Leads", hm.leads], ["Clients", hm.clients], ["Open deals", hm.openDeals]].map(([k, v]) => (
                  <div key={k as string} className="rounded bg-white/[0.05] px-1 py-1">
                    <dd className="font-mono text-[13px] font-semibold text-white tabular-nums">{v}</dd>
                    <dt className="text-[10px] text-[#8b97ab]">{k}</dt>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-1 text-[#9fb4cf]">Strategic operating region</p>
            )}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="mb-2 grid grid-cols-[minmax(0,1fr)_repeat(3,44px)] gap-1 px-2 font-mono text-[9.5px] tracking-[0.1em] text-[#6f7b90] uppercase">
          <span>Market</span>
          <span className="text-right">Leads</span>
          <span className="text-right">Clients</span>
          <span className="text-right">Deals</span>
        </div>
        <ul className="space-y-px">
          {markets.map((m) => {
            const row = (
              <>
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn("size-1.5 shrink-0 rounded-full", m.leads + m.clients + m.openDeals ? "bg-[#5cc8ff]" : "bg-[#35507a]")} />
                  <span className="truncate text-[12.5px] text-[#dfe6f1]">{m.name}</span>
                  <span suppressHydrationWarning className="hidden font-mono text-[10px] text-[#6f7b90] sm:inline">{localTime(m.tz)}</span>
                </span>
                {[m.leads, m.clients, m.openDeals].map((v, i) => (
                  <span key={i} className={cn("text-right font-mono text-[12px] tabular-nums", v ? "text-white" : "text-[#4c5b72]")}>{hasData ? v : "–"}</span>
                ))}
              </>
            );
            const cls = cn("grid grid-cols-[minmax(0,1fr)_repeat(3,44px)] items-center gap-1 rounded-md px-2 py-1.5 transition-colors", hover === m.key ? "bg-white/[0.07]" : "hover:bg-white/[0.04]");
            return (
              <li key={m.key} onMouseEnter={() => setHover(m.key)} onMouseLeave={() => setHover(null)}>
                {m.href ? <Link href={m.href} className={cls}>{row}</Link> : <div className={cls}>{row}</div>}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 px-2 text-[11px] leading-relaxed text-[#6f7b90]">
          {hasData ? <>Counts are matched from the country on each lead, client and open deal.{unmapped > 0 && <> {unmapped.toLocaleString()} records are outside these markets or have an unrecognised country.</>}</> : "No regional records yet. Markets are shown as strategic operating regions; counts appear as leads, clients and deals are recorded with a country."}
        </p>
      </div>
    </div>
  );
}
